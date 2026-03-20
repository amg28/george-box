import {
  DEFAULT_QUESTIONS,
  MAX_PLAYERS,
  QUESTION_DURATION_MS,
  TICK_INTERVAL_MS,
  TIMER_PADDING_MS
} from "./questions";
import { createId, createRoomCode } from "./ids";
import { calculatePoints, isCorrectAnswer } from "./scoring";
import type {
  GameSession,
  JoinPlayerInput,
  LeaderboardEntry,
  PlayerSnapshot,
  PlayerState,
  QuestionDefinition,
  QuestionFinishedEvent,
  QuestionSnapshot,
  ReconnectPlayerInput,
  SessionSnapshot,
  SubmitAnswerInput
} from "./types";

export function now(): number {
  return Date.now();
}

export function createSession(
  hostName: string,
  questions: QuestionDefinition[] = DEFAULT_QUESTIONS
): GameSession {
  return {
    sessionId: createId("sess"),
    roomCode: createRoomCode(),
    hostId: createId("host"),
    hostName: hostName || "Host",
    state: "lobby",
    questionIndex: -1,
    questionStartedAt: null,
    questionEndsAt: null,
    currentQuestion: null,
    questions,
    players: new Map(),
    playerOrder: [],
    scores: new Map(),
    activeSocketIds: new Map(),
    timer: null,
    tickTimer: null,
    endedAt: null,
    createdAt: now()
  };
}

function createPlayer(displayName: string, playerId?: string): PlayerState {
  return {
    id: playerId ?? createId("player"),
    displayName: displayName || "Player",
    connected: true,
    score: 0,
    submittedQuestionIds: new Set(),
    lastAnswers: new Map(),
    lastSeenAt: now()
  };
}

export function snapshotQuestion(question: QuestionDefinition | null): QuestionSnapshot | null {
  if (!question) {
    return null;
  }

  return {
    id: question.id,
    questionId: question.id,
    type: question.type,
    inputType: question.type,
    prompt: question.prompt,
    text: question.prompt,
    options: question.options ?? null
  };
}

function snapshotPlayer(player: PlayerState): PlayerSnapshot {
  return {
    id: player.id,
    displayName: player.displayName,
    connected: player.connected,
    score: player.score,
    lastSeenAt: player.lastSeenAt
  };
}

export function buildLeaderboard(session: GameSession): LeaderboardEntry[] {
  return [...session.players.values()]
    .map((player) => ({
      id: player.id,
      displayName: player.displayName,
      score: session.scores.get(player.id) ?? player.score
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.displayName.localeCompare(right.displayName);
    });
}

export function serializeSession(session: GameSession): SessionSnapshot {
  const remainingMs = session.questionEndsAt ? Math.max(0, session.questionEndsAt - now()) : null;

  return {
    sessionId: session.sessionId,
    roomCode: session.roomCode,
    hostId: session.hostId,
    hostName: session.hostName,
    state: session.state,
    phase: session.state,
    questionIndex: session.questionIndex,
    questionStartedAt: session.questionStartedAt,
    questionEndsAt: session.questionEndsAt,
    currentQuestion: snapshotQuestion(session.currentQuestion),
    timer: {
      questionId: session.currentQuestion?.id ?? null,
      startedAt: session.questionStartedAt,
      endsAt: session.questionEndsAt,
      remainingMs
    },
    players: [...session.players.values()].map(snapshotPlayer),
    leaderboard: buildLeaderboard(session),
    endedAt: session.endedAt,
    questionCount: session.questions.length,
    maxPlayers: MAX_PLAYERS,
    serverTime: now()
  };
}

function canJoin(session: GameSession): boolean {
  return session.state === "lobby" || session.state === "running";
}

export function clearTimers(session: GameSession): void {
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }

  if (session.tickTimer) {
    clearInterval(session.tickTimer);
    session.tickTimer = null;
  }
}

function scheduleQuestionTimers(session: GameSession): void {
  if (!session.questionEndsAt) {
    return;
  }

  clearTimers(session);

  const tick = (): void => {
    if (session.state !== "running" || !session.questionEndsAt) {
      return;
    }

    const remainingMs = Math.max(0, session.questionEndsAt - now());
    session.onTick?.(session, remainingMs);

    if (remainingMs <= 0) {
      finishQuestion(session, "timeout");
    }
  };

  const timeoutDelay = Math.max(0, session.questionEndsAt - now());
  session.tickTimer = setInterval(tick, TICK_INTERVAL_MS);
  session.timer = setTimeout(() => finishQuestion(session, "timeout"), timeoutDelay + TIMER_PADDING_MS);
  tick();
}

export function joinPlayer(
  session: GameSession,
  input: JoinPlayerInput
):
  | { ok: true; player: PlayerState; reconnected: boolean }
  | { ok: false; error: "room_closed" | "room_full" | "name_taken" } {
  const normalizedName = String(input.displayName || "Player").trim() || "Player";

  if (input.playerId) {
    const existingPlayer = session.players.get(input.playerId);
    if (existingPlayer) {
      existingPlayer.displayName = normalizedName;
      existingPlayer.connected = true;
      existingPlayer.lastSeenAt = now();
      session.activeSocketIds.set(existingPlayer.id, input.socketId);
      return { ok: true, player: existingPlayer, reconnected: true };
    }
  }

  if (!canJoin(session)) {
    return { ok: false, error: "room_closed" };
  }

  if (session.players.size >= MAX_PLAYERS) {
    return { ok: false, error: "room_full" };
  }

  const hasNameCollision = [...session.players.values()].some(
    (player) => player.displayName.toLowerCase() === normalizedName.toLowerCase()
  );
  if (hasNameCollision) {
    return { ok: false, error: "name_taken" };
  }

  const player = createPlayer(normalizedName, input.playerId);
  session.players.set(player.id, player);
  session.playerOrder.push(player.id);
  session.scores.set(player.id, 0);
  session.activeSocketIds.set(player.id, input.socketId);

  return { ok: true, player, reconnected: false };
}

export function reconnectPlayer(
  session: GameSession,
  input: ReconnectPlayerInput
): { ok: true; player: PlayerState } | { ok: false; error: "player_not_found" } {
  const player = session.players.get(input.playerId);
  if (!player) {
    return { ok: false, error: "player_not_found" };
  }

  player.connected = true;
  player.lastSeenAt = now();
  session.activeSocketIds.set(player.id, input.socketId);

  return { ok: true, player };
}

export function startQuestion(
  session: GameSession
): { ok: true; question: QuestionSnapshot; finished: false } | { ok: true; finished: true } | { ok: false; error: "invalid_state" } {
  if (session.state !== "lobby") {
    return { ok: false, error: "invalid_state" };
  }

  if (session.questionIndex + 1 >= session.questions.length) {
    session.state = "finished";
    session.endedAt = now();
    session.currentQuestion = null;
    session.questionStartedAt = null;
    session.questionEndsAt = null;
    clearTimers(session);
    return { ok: true, finished: true };
  }

  session.questionIndex += 1;
  session.state = "running";
  session.currentQuestion = session.questions[session.questionIndex] ?? null;
  session.questionStartedAt = now();
  session.questionEndsAt = session.questionStartedAt + QUESTION_DURATION_MS;

  if (!session.currentQuestion) {
    session.state = "finished";
    session.endedAt = now();
    return { ok: true, finished: true };
  }

  for (const player of session.players.values()) {
    player.submittedQuestionIds.delete(session.currentQuestion.id);
  }

  scheduleQuestionTimers(session);
  return { ok: true, question: snapshotQuestion(session.currentQuestion) as QuestionSnapshot, finished: false };
}

export function submitAnswer(
  session: GameSession,
  input: SubmitAnswerInput
): { ok: true; receivedAt: number } | { ok: false; error: "not_running" | "stale_question" | "time_up" | "player_not_found" | "duplicate" } {
  if (session.state !== "running" || !session.currentQuestion || !session.questionEndsAt) {
    return { ok: false, error: "not_running" };
  }

  if (input.questionId !== session.currentQuestion.id) {
    return { ok: false, error: "stale_question" };
  }

  if (now() > session.questionEndsAt) {
    return { ok: false, error: "time_up" };
  }

  const player = session.players.get(input.playerId);
  if (!player) {
    return { ok: false, error: "player_not_found" };
  }

  if (player.submittedQuestionIds.has(input.questionId)) {
    return { ok: false, error: "duplicate" };
  }

  player.submittedQuestionIds.add(input.questionId);
  player.lastAnswers.set(input.questionId, {
    value: input.answer,
    submittedAt: now()
  });

  return { ok: true, receivedAt: now() };
}

export function finishQuestion(
  session: GameSession,
  reason: "host" | "timeout" = "host"
): { ok: true; result: QuestionFinishedEvent } | { ok: false; error: "not_running" } {
  if (session.state !== "running" || !session.currentQuestion || !session.questionEndsAt) {
    return { ok: false, error: "not_running" };
  }

  clearTimers(session);
  session.state = "scoring";

  const currentQuestion = session.currentQuestion;
  const scoredPlayers: QuestionFinishedEvent["scoredPlayers"] = [];

  for (const player of session.players.values()) {
    if (!player.submittedQuestionIds.has(currentQuestion.id)) {
      continue;
    }

    const submission = player.lastAnswers.get(currentQuestion.id);
    if (!submission) {
      continue;
    }

    const correct = isCorrectAnswer(currentQuestion, submission.value);
    const points = calculatePoints(correct, session.questionEndsAt, submission.submittedAt);

    player.score = (session.scores.get(player.id) ?? 0) + points;
    session.scores.set(player.id, player.score);

    scoredPlayers.push({
      playerId: player.id,
      displayName: player.displayName,
      correct,
      points,
      answer: submission.value
    });
  }

  const leaderboard = buildLeaderboard(session);
  session.currentQuestion = null;
  session.questionStartedAt = null;
  session.questionEndsAt = null;

  if (session.questionIndex + 1 >= session.questions.length) {
    session.state = "finished";
    session.endedAt = now();
  } else {
    session.state = "lobby";
  }

  const result: QuestionFinishedEvent = {
    ok: true,
    reason,
    questionId: currentQuestion.id,
    leaderboard,
    scoredPlayers,
    finished: session.state === "finished"
  };

  session.onQuestionFinished?.(session, result);
  return { ok: true, result };
}
