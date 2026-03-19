const crypto = require('crypto');

const MAX_PLAYERS = 10;
const QUESTION_DURATION_MS = 15000;
const TICK_INTERVAL_MS = 1000;
const GAME_PADDING_MS = 500;

const QUESTIONS = [
  {
    id: 'q1',
    type: 'mcq',
    prompt: 'Which planet is known as the Red Planet?',
    options: [
      { id: 'a', label: 'Earth' },
      { id: 'b', label: 'Mars' },
      { id: 'c', label: 'Jupiter' },
      { id: 'd', label: 'Venus' }
    ],
    answer: 'b'
  },
  {
    id: 'q2',
    type: 'text',
    prompt: 'Type the word "socket" lowercase.',
    answer: 'socket'
  },
  {
    id: 'q3',
    type: 'mcq',
    prompt: 'What is 2 + 2?',
    options: [
      { id: 'a', label: '3' },
      { id: 'b', label: '4' },
      { id: 'c', label: '5' },
      { id: 'd', label: '22' }
    ],
    answer: 'b'
  }
];

function now() {
  return Date.now();
}

function generateCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function createSession(hostName) {
  const sessionId = generateId('sess');
  const roomCode = generateCode();
  const hostId = generateId('host');

  return {
    sessionId,
    roomCode,
    hostId,
    hostName: hostName || 'Host',
    state: 'lobby',
    questionIndex: -1,
    questionStartedAt: null,
    questionEndsAt: null,
    currentQuestion: null,
    players: new Map(),
    playerOrder: [],
    scores: new Map(),
    activeSocketIds: new Map(),
    timer: null,
    tickTimer: null,
    lastBroadcastAt: 0,
    endedAt: null,
    createdAt: now()
  };
}

function createPlayer(session, displayName, playerId) {
  const id = playerId || generateId('player');
  return {
    id,
    displayName: displayName || 'Player',
    connected: true,
    score: session.scores.get(id) || 0,
    submitted: new Set(),
    lastSeenAt: now()
  };
}

function getCurrentQuestion(session) {
  if (session.questionIndex < 0 || session.questionIndex >= QUESTIONS.length) {
    return null;
  }
  return QUESTIONS[session.questionIndex];
}

function snapshotQuestion(question) {
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
    options: question.options || null
  };
}

function serializePlayer(player) {
  return {
    id: player.id,
    displayName: player.displayName,
    connected: player.connected,
    score: player.score,
    lastSeenAt: player.lastSeenAt
  };
}

function serializeSession(session) {
  const remainingMs = session.questionEndsAt
    ? Math.max(0, session.questionEndsAt - now())
    : null;

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
      questionId: session.currentQuestion?.id || null,
      startedAt: session.questionStartedAt,
      endsAt: session.questionEndsAt,
      remainingMs
    },
    players: Array.from(session.players.values()).map(serializePlayer),
    leaderboard: buildLeaderboard(session),
    endedAt: session.endedAt,
    questionCount: QUESTIONS.length,
    maxPlayers: MAX_PLAYERS,
    serverTime: now()
  };
}

function buildLeaderboard(session) {
  return Array.from(session.players.values())
    .map((player) => ({
      id: player.id,
      displayName: player.displayName,
      score: session.scores.get(player.id) || player.score || 0
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.displayName.localeCompare(b.displayName);
    });
}

function canJoin(session) {
  return session.state === 'lobby' || session.state === 'running';
}

function isHost(session, hostId) {
  return session.hostId === hostId;
}

function startQuestion(session) {
  if (session.state !== 'lobby') {
    return { ok: false, error: 'invalid_state' };
  }

  if (session.questionIndex + 1 >= QUESTIONS.length) {
    session.state = 'finished';
    session.endedAt = now();
    session.currentQuestion = null;
    session.questionStartedAt = null;
    session.questionEndsAt = null;
    clearTimers(session);
    return { ok: true, finished: true };
  }

  session.questionIndex += 1;
  session.state = 'running';
  session.currentQuestion = QUESTIONS[session.questionIndex];
  session.questionStartedAt = now();
  session.questionEndsAt = session.questionStartedAt + QUESTION_DURATION_MS;

  for (const player of session.players.values()) {
    player.submitted.delete(session.currentQuestion.id);
  }

  scheduleTimers(session);
  return { ok: true, question: snapshotQuestion(session.currentQuestion) };
}

function clearTimers(session) {
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  if (session.tickTimer) {
    clearInterval(session.tickTimer);
    session.tickTimer = null;
  }
}

function scheduleTimers(session) {
  clearTimers(session);

  const finishAt = session.questionEndsAt;
  const tick = () => {
    if (session.state !== 'running' || !session.questionEndsAt) {
      return;
    }
    const remainingMs = Math.max(0, session.questionEndsAt - now());
    session.onTick?.(session, remainingMs);
    if (remainingMs <= 0) {
      finishQuestion(session, 'timeout');
    }
  };

  session.tickTimer = setInterval(tick, TICK_INTERVAL_MS);
  const delay = Math.max(0, finishAt - now());
  session.timer = setTimeout(() => finishQuestion(session, 'timeout'), delay + GAME_PADDING_MS);
  tick();
}

function finishQuestion(session, reason = 'host') {
  if (session.state !== 'running' || !session.currentQuestion) {
    return { ok: false, error: 'not_running' };
  }

  clearTimers(session);
  session.state = 'scoring';

  const question = session.currentQuestion;
  const scoredPlayers = [];

  for (const player of session.players.values()) {
    if (!player.submitted.has(question.id)) continue;
    const answer = player.lastAnswerByQuestion?.get(question.id);
    if (!answer) continue;

    const correct = evaluateAnswer(question, answer.value);
    const responseTime = Math.max(0, (session.questionEndsAt || now()) - (answer.submittedAt || now()));
    const bonus = Math.max(0, Math.ceil(responseTime / 1000));
    const points = correct ? 100 + bonus : 0;
    player.score = (session.scores.get(player.id) || 0) + points;
    session.scores.set(player.id, player.score);
    scoredPlayers.push({
      playerId: player.id,
      displayName: player.displayName,
      correct,
      points,
      answer: answer.value
    });
  }

  const leaderboard = buildLeaderboard(session);
  session.currentQuestion = null;
  session.questionStartedAt = null;
  session.questionEndsAt = null;
  session.state = session.questionIndex + 1 >= QUESTIONS.length ? 'finished' : 'lobby';
  if (session.state === 'finished') {
    session.endedAt = now();
  }

  session.onQuestionFinished?.(session, {
    ok: true,
    reason,
    questionId: question.id,
    leaderboard,
    scoredPlayers,
    finished: session.state === 'finished'
  });

  return {
    ok: true,
    reason,
    questionId: question.id,
    leaderboard,
    scoredPlayers,
    finished: session.state === 'finished'
  };
}

function evaluateAnswer(question, value) {
  if (!question) {
    return false;
  }
  if (question.type === 'text') {
    return normalizeText(value) === normalizeText(question.answer);
  }
  return String(value ?? '') === String(question.answer);
}

function joinPlayer(session, { displayName, playerId, socketId }) {
  const existingById = playerId ? session.players.get(playerId) : null;
  if (existingById) {
    existingById.displayName = displayName || existingById.displayName;
    existingById.connected = true;
    existingById.lastSeenAt = now();
    session.activeSocketIds.set(existingById.id, socketId);
    return { ok: true, player: existingById, reconnected: true };
  }

  if (!canJoin(session)) {
    return { ok: false, error: 'room_closed' };
  }

  if (session.players.size >= MAX_PLAYERS) {
    return { ok: false, error: 'room_full' };
  }

  const collision = Array.from(session.players.values()).some(
    (player) => player.displayName.toLowerCase() === String(displayName || '').trim().toLowerCase()
  );
  if (collision) {
    return { ok: false, error: 'name_taken' };
  }

  const player = createPlayer(session, displayName);
  player.lastAnswerByQuestion = new Map();
  session.players.set(player.id, player);
  session.playerOrder.push(player.id);
  session.scores.set(player.id, 0);
  session.activeSocketIds.set(player.id, socketId);
  return { ok: true, player, reconnected: false };
}

function reconnectPlayer(session, { playerId, socketId }) {
  const player = session.players.get(playerId);
  if (!player) {
    return { ok: false, error: 'player_not_found' };
  }
  player.connected = true;
  player.lastSeenAt = now();
  session.activeSocketIds.set(player.id, socketId);
  return { ok: true, player };
}

function submitAnswer(session, { playerId, answer, questionId }) {
  if (session.state !== 'running' || !session.currentQuestion) {
    return { ok: false, error: 'not_running' };
  }

  if (questionId !== session.currentQuestion.id) {
    return { ok: false, error: 'stale_question' };
  }

  if (now() > session.questionEndsAt) {
    return { ok: false, error: 'time_up' };
  }

  const player = session.players.get(playerId);
  if (!player) {
    return { ok: false, error: 'player_not_found' };
  }

  if (!player.lastAnswerByQuestion) {
    player.lastAnswerByQuestion = new Map();
  }

  if (player.submitted.has(questionId)) {
    return { ok: false, error: 'duplicate' };
  }

  player.submitted.add(questionId);
  player.lastAnswerByQuestion.set(questionId, {
    value: answer,
    submittedAt: now()
  });

  return {
    ok: true,
    playerId,
    questionId,
    receivedAt: now()
  };
}

module.exports = {
  MAX_PLAYERS,
  QUESTIONS,
  QUESTION_DURATION_MS,
  createSession,
  generateId,
  generateCode,
  getCurrentQuestion,
  serializeSession,
  buildLeaderboard,
  joinPlayer,
  reconnectPlayer,
  submitAnswer,
  startQuestion,
  finishQuestion,
  clearTimers,
  snapshotQuestion,
  evaluateAnswer
};






