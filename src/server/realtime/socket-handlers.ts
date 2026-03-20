import type { Server, Socket } from "socket.io";
import {
  QUESTION_DURATION_MS,
  finishQuestion,
  joinPlayer,
  reconnectPlayer,
  serializeSession,
  snapshotQuestion,
  startQuestion,
  submitAnswer,
  isCorrectAnswer
} from "../game";
import type { GameSession, JoinPlayerInput, QuestionSnapshot } from "../game";
import type { SessionStore } from "../session-store";
import type { RealtimeEmitters } from "./emitters";

interface HostCreateRoomPayload {
  hostName?: string;
}

interface HostActionPayload {
  sessionId?: string;
  roomCode?: string;
  hostId?: string;
}

interface PlayerJoinPayload {
  sessionId?: string;
  roomCode?: string;
  displayName?: string;
  playerId?: string;
}

interface PlayerReconnectPayload {
  sessionId?: string;
  roomCode?: string;
  playerId?: string;
}

interface PlayerSubmitPayload {
  sessionId?: string;
  roomCode?: string;
  playerId?: string;
  questionId?: string;
  answer?: string;
  answerId?: string;
  text?: string;
}

type Ack = (payload: Record<string, unknown>) => void;

export function registerSocketHandlers(io: Server, store: SessionStore, emitters: RealtimeEmitters): void {
  const hostsBySocket = new Map<string, string>();
  const playersBySocket = new Map<string, { sessionId: string; playerId: string }>();

  const getRoom = (payload?: { sessionId?: string; roomCode?: string }): GameSession | null => {
    return store.getByIdOrCode(payload?.sessionId || payload?.roomCode);
  };

  const bindSocket = (session: GameSession, socket: Socket, role: "host" | "player", actorId: string): void => {
    socket.join(emitters.roomChannel(session.sessionId));
    socket.data.sessionId = session.sessionId;
    socket.data.role = role;
    socket.data.actorId = actorId;
  };

  const isHostAuthorized = (session: GameSession, payload?: HostActionPayload): boolean => {
    return (payload?.hostId || session.hostId) === session.hostId;
  };

  const safeAck = (ack: Ack | undefined, payload: Record<string, unknown>): void => {
    ack?.(payload);
  };

  io.on("connection", (socket) => {
    socket.emit("server:hello", {
      socketId: socket.id,
      maxPlayers: 10,
      questionCount: 3
    });

    socket.on("host:createRoom", (payload: HostCreateRoomPayload = {}, ack?: Ack) => {
      const hostName = String(payload.hostName || "Host").trim() || "Host";
      const session = store.create(hostName);
      session.onTick = emitters.emitTimer;
      session.onQuestionFinished = emitters.onQuestionFinished;

      hostsBySocket.set(socket.id, session.sessionId);
      bindSocket(session, socket, "host", session.hostId);

      const snapshot = emitters.emitState(session);
      safeAck(ack, {
        ok: true,
        sessionId: session.sessionId,
        roomCode: session.roomCode,
        hostId: session.hostId,
        joinUrl: `/player.html?room=${session.roomCode}`,
        snapshot
      });
    });

    socket.on("host:reconnect", (payload: HostActionPayload = {}, ack?: Ack) => {
      const session = getRoom(payload);
      if (!session) {
        safeAck(ack, { ok: false, error: "room_not_found" });
        return;
      }
      if (!isHostAuthorized(session, payload)) {
        safeAck(ack, { ok: false, error: "not_host" });
        return;
      }

      hostsBySocket.set(socket.id, session.sessionId);
      bindSocket(session, socket, "host", session.hostId);

      const snapshot = serializeSession(session);
      socket.emit("session:update", snapshot);
      safeAck(ack, {
        ok: true,
        hostId: session.hostId,
        sessionId: session.sessionId,
        roomCode: session.roomCode,
        snapshot
      });
    });

    socket.on("player:join", (payload: PlayerJoinPayload = {}, ack?: Ack) => {
      const session = getRoom(payload);
      if (!session) {
        safeAck(ack, { ok: false, error: "room_not_found" });
        return;
      }

      const joinPayload: JoinPlayerInput = { socketId: socket.id };
      if (typeof payload.displayName === "string") {
        joinPayload.displayName = payload.displayName;
      }
      if (typeof payload.playerId === "string") {
        joinPayload.playerId = payload.playerId;
      }

      const joinResult = joinPlayer(session, joinPayload);

      if (!joinResult.ok) {
        safeAck(ack, { ok: false, error: joinResult.error });
        return;
      }

      playersBySocket.set(socket.id, { sessionId: session.sessionId, playerId: joinResult.player.id });
      bindSocket(session, socket, "player", joinResult.player.id);

      const snapshot = emitters.emitState(session);
      safeAck(ack, {
        ok: true,
        playerId: joinResult.player.id,
        sessionId: session.sessionId,
        roomCode: session.roomCode,
        reconnected: joinResult.reconnected,
        snapshot
      });
    });

    socket.on("player:reconnect", (payload: PlayerReconnectPayload = {}, ack?: Ack) => {
      const session = getRoom(payload);
      if (!session) {
        safeAck(ack, { ok: false, error: "room_not_found" });
        return;
      }

      const playerId = payload.playerId;
      if (!playerId) {
        safeAck(ack, { ok: false, error: "player_not_found" });
        return;
      }

      const reconnectResult = reconnectPlayer(session, { playerId, socketId: socket.id });
      if (!reconnectResult.ok) {
        safeAck(ack, { ok: false, error: reconnectResult.error });
        return;
      }

      playersBySocket.set(socket.id, { sessionId: session.sessionId, playerId: reconnectResult.player.id });
      bindSocket(session, socket, "player", reconnectResult.player.id);

      const snapshot = serializeSession(session);
      socket.emit("session:update", snapshot);
      safeAck(ack, {
        ok: true,
        playerId: reconnectResult.player.id,
        sessionId: session.sessionId,
        roomCode: session.roomCode,
        snapshot
      });
    });

    socket.on("host:startGame", (payload: HostActionPayload = {}, ack?: Ack) => {
      const session = getRoom(payload);
      if (!session) {
        safeAck(ack, { ok: false, error: "room_not_found" });
        return;
      }
      if (!isHostAuthorized(session, payload)) {
        safeAck(ack, { ok: false, error: "not_host" });
        return;
      }
      if (session.state === "finished") {
        safeAck(ack, { ok: false, error: "game_finished" });
        return;
      }
      if (session.state === "running") {
        safeAck(ack, { ok: false, error: "already_running" });
        return;
      }

      const startResult = startQuestion(session);
      if (!startResult.ok) {
        safeAck(ack, { ok: false, error: startResult.error });
        return;
      }

      if (startResult.finished) {
        emitters.emitState(session);
        emitters.emitGameEnd(session, "completed");
        safeAck(ack, { ok: true, finished: true, snapshot: serializeSession(session) });
        return;
      }

      emitters.emitQuestion(session, startResult.question);
      const snapshot = emitters.emitState(session);
      safeAck(ack, { ok: true, snapshot });
    });

    socket.on("host:nextQuestion", (payload: HostActionPayload = {}, ack?: Ack) => {
      const session = getRoom(payload);
      if (!session) {
        safeAck(ack, { ok: false, error: "room_not_found" });
        return;
      }
      if (!isHostAuthorized(session, payload)) {
        safeAck(ack, { ok: false, error: "not_host" });
        return;
      }

      if (session.currentQuestion) {
        const finishResult = finishQuestion(session, "host");
        if (!finishResult.ok) {
          safeAck(ack, { ok: false, error: finishResult.error });
          return;
        }

        if (finishResult.result.finished) {
          safeAck(ack, { ok: true, finished: true, snapshot: serializeSession(session) });
          return;
        }
      } else if (session.questionIndex < 0) {
        safeAck(ack, { ok: false, error: "not_started" });
        return;
      }

      const startResult = startQuestion(session);
      if (!startResult.ok) {
        safeAck(ack, { ok: false, error: startResult.error });
        return;
      }

      if (startResult.finished) {
        safeAck(ack, { ok: true, finished: true, snapshot: serializeSession(session) });
        return;
      }

      emitters.emitQuestion(session, startResult.question);
      const snapshot = emitters.emitState(session);
      safeAck(ack, { ok: true, snapshot });
    });

    socket.on("player:submitAnswer", (payload: PlayerSubmitPayload = {}, ack?: Ack) => {
      const session = getRoom(payload);
      if (!session) {
        safeAck(ack, { ok: false, error: "room_not_found" });
        return;
      }

      const playerId = payload.playerId;
      const questionId = payload.questionId || session.currentQuestion?.id;
      const answerValue = payload.answer ?? payload.answerId ?? payload.text;

      if (!playerId || !questionId || typeof answerValue !== "string") {
        safeAck(ack, { ok: false, error: "invalid_payload" });
        return;
      }

      const submitResult = submitAnswer(session, {
        playerId,
        questionId,
        answer: answerValue
      });

      if (!submitResult.ok) {
        safeAck(ack, { ok: false, error: submitResult.error });
        return;
      }

      const currentQuestion = session.currentQuestion;
      const player = session.players.get(playerId);
      const correct = currentQuestion ? isCorrectAnswer(currentQuestion, answerValue) : false;

      io.to(emitters.roomChannel(session.sessionId)).emit("answer:accepted", {
        playerId,
        questionId,
        answer: answerValue,
        correct,
        playerName: player?.displayName,
        totalScore: session.scores.get(playerId) ?? 0
      });

      safeAck(ack, { ok: true, correct, totalScore: session.scores.get(playerId) ?? 0 });
    });

    socket.on("disconnect", () => {
      const playerLink = playersBySocket.get(socket.id);
      if (playerLink) {
        const session = store.getByIdOrCode(playerLink.sessionId);
        const player = session?.players.get(playerLink.playerId);
        if (player && session) {
          player.connected = false;
          player.lastSeenAt = Date.now();
          emitters.emitState(session);
        }
        playersBySocket.delete(socket.id);
      }

      const hostSessionId = hostsBySocket.get(socket.id);
      if (hostSessionId) {
        const session = store.getByIdOrCode(hostSessionId);
        if (session) {
          emitters.emitState(session);
        }
        hostsBySocket.delete(socket.id);
      }
    });
  });
}


