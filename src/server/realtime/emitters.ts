import type { Server } from "socket.io";
import { buildLeaderboard, serializeSession } from "../game";
import type { GameSession, QuestionSnapshot, QuestionFinishedEvent } from "../game";

function roomChannel(sessionId: string): string {
  return `session:${sessionId}`;
}

export function createEmitters(io: Server) {
  const emitState = (session: GameSession) => {
    const snapshot = serializeSession(session);
    io.to(roomChannel(session.sessionId)).emit("session:update", snapshot);
    io.to(roomChannel(session.sessionId)).emit("lobby:update", {
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      players: snapshot.players,
      maxPlayers: snapshot.maxPlayers,
      hostName: session.hostName
    });
    return snapshot;
  };

  const emitQuestion = (session: GameSession, question: QuestionSnapshot) => {
    const payload = {
      question,
      id: question.id,
      questionId: question.questionId,
      index: session.questionIndex + 1,
      questionIndex: session.questionIndex + 1,
      type: question.type,
      inputType: question.inputType,
      prompt: question.prompt,
      text: question.text,
      options: question.options ?? [],
      durationMs: 15_000,
      startedAt: session.questionStartedAt,
      endsAt: session.questionEndsAt
    };

    io.to(roomChannel(session.sessionId)).emit("question:start", payload);
    io.to(roomChannel(session.sessionId)).emit("question:started", payload);
  };

  const emitTimer = (session: GameSession, remainingMs: number) => {
    io.to(roomChannel(session.sessionId)).emit("timer:tick", {
      questionId: session.currentQuestion?.id,
      remainingMs,
      startedAt: session.questionStartedAt,
      endsAt: session.questionEndsAt
    });
  };

  const emitLeaderboard = (session: GameSession) => {
    const leaderboard = buildLeaderboard(session);
    io.to(roomChannel(session.sessionId)).emit("leaderboard:update", {
      leaderboard,
      players: serializeSession(session).players
    });
  };

  const emitGameEnd = (session: GameSession, reason: string) => {
    const leaderboard = buildLeaderboard(session);
    io.to(roomChannel(session.sessionId)).emit("game:end", {
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      reason,
      leaderboard,
      finalLeaderboard: leaderboard,
      endedAt: session.endedAt ?? Date.now()
    });
  };

  const onQuestionFinished = (session: GameSession, result: QuestionFinishedEvent) => {
    io.to(roomChannel(session.sessionId)).emit("question:locked", {
      questionId: result.questionId,
      reason: result.reason
    });

    emitLeaderboard(session);
    emitState(session);

    if (result.finished) {
      emitGameEnd(session, result.reason === "timeout" ? "timeout" : "completed");
    }
  };

  return {
    roomChannel,
    emitState,
    emitQuestion,
    emitTimer,
    emitLeaderboard,
    emitGameEnd,
    onQuestionFinished
  };
}

export type RealtimeEmitters = ReturnType<typeof createEmitters>;
