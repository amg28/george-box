const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const {
  MAX_PLAYERS,
  QUESTIONS,
  QUESTION_DURATION_MS,
  createSession,
  serializeSession,
  joinPlayer,
  reconnectPlayer,
  submitAnswer,
  startQuestion,
  finishQuestion,
  buildLeaderboard,
  clearTimers
} = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const sessionsById = new Map();
const sessionsByCode = new Map();
const hostsBySocket = new Map();
const playersBySocket = new Map();

function roomChannel(sessionId) {
  return `session:${sessionId}`;
}

function getRoom(sessionIdOrCode) {
  if (!sessionIdOrCode) return null;
  if (sessionsById.has(sessionIdOrCode)) {
    return sessionsById.get(sessionIdOrCode);
  }
  return sessionsByCode.get(String(sessionIdOrCode).toUpperCase()) || null;
}

function registerSession(session) {
  session.onTick = emitTimer;
  session.onQuestionFinished = handleQuestionFinished;
  sessionsById.set(session.sessionId, session);
  sessionsByCode.set(session.roomCode, session);
}

function emitState(session) {
  const snapshot = serializeSession(session);
  io.to(roomChannel(session.sessionId)).emit('session:update', snapshot);
  io.to(roomChannel(session.sessionId)).emit('lobby:update', {
    sessionId: session.sessionId,
    roomCode: session.roomCode,
    players: snapshot.players,
    maxPlayers: MAX_PLAYERS,
    hostName: session.hostName
  });
  return snapshot;
}

function emitQuestion(session, question) {
  const payload = {
    question,
    id: question.id,
    questionId: question.id,
    index: session.questionIndex + 1,
    questionIndex: session.questionIndex + 1,
    type: question.type,
    inputType: question.type,
    prompt: question.prompt,
    text: question.prompt,
    options: question.options || [],
    durationMs: QUESTION_DURATION_MS,
    startedAt: session.questionStartedAt,
    endsAt: session.questionEndsAt
  };

  io.to(roomChannel(session.sessionId)).emit('question:start', payload);
  io.to(roomChannel(session.sessionId)).emit('question:started', payload);
}

function emitTimer(session, remainingMs) {
  io.to(roomChannel(session.sessionId)).emit('timer:tick', {
    questionId: session.currentQuestion?.id,
    remainingMs,
    startedAt: session.questionStartedAt,
    endsAt: session.questionEndsAt
  });
}

function emitLeaderboard(session) {
  const leaderboard = buildLeaderboard(session);
  io.to(roomChannel(session.sessionId)).emit('leaderboard:update', {
    leaderboard,
    players: serializeSession(session).players
  });
}

function emitGameEnd(session, reason = 'finished') {
  const leaderboard = buildLeaderboard(session);
  io.to(roomChannel(session.sessionId)).emit('game:end', {
    sessionId: session.sessionId,
    roomCode: session.roomCode,
    reason,
    leaderboard,
    finalLeaderboard: leaderboard,
    endedAt: session.endedAt || Date.now()
  });
}

function handleQuestionFinished(session, result) {
  io.to(roomChannel(session.sessionId)).emit('question:locked', {
    questionId: result.questionId,
    reason: result.reason
  });
  emitLeaderboard(session);
  emitState(session);

  if (result.finished) {
    emitGameEnd(session, result.reason === 'timeout' ? 'timeout' : 'completed');
  }
}

function bindSocket(session, socket, role, actorId) {
  socket.join(roomChannel(session.sessionId));
  socket.data.sessionId = session.sessionId;
  socket.data.role = role;
  socket.data.actorId = actorId;
}

function requireHost(session, payload) {
  const claimedHostId = payload?.hostId || session.hostId;
  return claimedHostId === session.hostId;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, sessions: sessionsById.size });
});

app.post('/api/rooms', (req, res) => {
  const hostName = String(req.body?.hostName || 'Host').trim() || 'Host';
  const session = createSession(hostName);
  registerSession(session);
  const snapshot = emitState(session);

  res.status(201).json({
    ok: true,
    sessionId: session.sessionId,
    roomCode: session.roomCode,
    hostId: session.hostId,
    hostName: session.hostName,
    joinUrl: `/player.html?room=${session.roomCode}`,
    snapshot
  });
});

app.get('/api/rooms/:roomCode', (req, res) => {
  const session = getRoom(req.params.roomCode);
  if (!session) {
    return res.status(404).json({ ok: false, error: 'room_not_found' });
  }

  return res.json({ ok: true, snapshot: serializeSession(session) });
});

io.on('connection', (socket) => {
  socket.emit('server:hello', {
    socketId: socket.id,
    maxPlayers: MAX_PLAYERS,
    questionCount: QUESTIONS.length
  });

  socket.on('host:createRoom', (payload = {}, ack) => {
    const hostName = String(payload.hostName || 'Host').trim() || 'Host';
    const session = createSession(hostName);
    registerSession(session);

    hostsBySocket.set(socket.id, session.sessionId);
    bindSocket(session, socket, 'host', session.hostId);

    const snapshot = emitState(session);
    ack?.({
      ok: true,
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      hostId: session.hostId,
      joinUrl: `/player.html?room=${session.roomCode}`,
      snapshot
    });
  });

  socket.on('host:join', (payload = {}, ack) => {
    const session = getRoom(payload.roomCode || payload.sessionId);
    if (!session) {
      return ack?.({ ok: false, error: 'room_not_found' });
    }
    if (!requireHost(session, payload)) {
      return ack?.({ ok: false, error: 'not_host' });
    }

    hostsBySocket.set(socket.id, session.sessionId);
    bindSocket(session, socket, 'host', session.hostId);
    const snapshot = serializeSession(session);
    return ack?.({ ok: true, hostId: session.hostId, sessionId: session.sessionId, roomCode: session.roomCode, snapshot });
  });

  socket.on('host:reconnect', (payload = {}, ack) => {
    const session = getRoom(payload.roomCode || payload.sessionId);
    if (!session) {
      return ack?.({ ok: false, error: 'room_not_found' });
    }
    if (!requireHost(session, payload)) {
      return ack?.({ ok: false, error: 'not_host' });
    }

    hostsBySocket.set(socket.id, session.sessionId);
    bindSocket(session, socket, 'host', session.hostId);
    const snapshot = serializeSession(session);
    socket.emit('session:update', snapshot);
    return ack?.({ ok: true, hostId: session.hostId, sessionId: session.sessionId, roomCode: session.roomCode, snapshot });
  });

  socket.on('player:join', (payload = {}, ack) => {
    const session = getRoom(payload.roomCode || payload.sessionId);
    if (!session) {
      return ack?.({ ok: false, error: 'room_not_found' });
    }

    const result = joinPlayer(session, {
      displayName: payload.displayName,
      playerId: payload.playerId,
      socketId: socket.id
    });

    if (!result.ok) {
      return ack?.({ ok: false, error: result.error });
    }

    playersBySocket.set(socket.id, { sessionId: session.sessionId, playerId: result.player.id });
    bindSocket(session, socket, 'player', result.player.id);

    const snapshot = emitState(session);
    ack?.({
      ok: true,
      playerId: result.player.id,
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      snapshot,
      reconnected: result.reconnected
    });
  });

  socket.on('player:reconnect', (payload = {}, ack) => {
    const session = getRoom(payload.roomCode || payload.sessionId);
    if (!session) {
      return ack?.({ ok: false, error: 'room_not_found' });
    }

    const result = reconnectPlayer(session, { playerId: payload.playerId, socketId: socket.id });
    if (!result.ok) {
      return ack?.({ ok: false, error: result.error });
    }

    playersBySocket.set(socket.id, { sessionId: session.sessionId, playerId: result.player.id });
    bindSocket(session, socket, 'player', result.player.id);

    const snapshot = serializeSession(session);
    socket.emit('session:update', snapshot);
    ack?.({
      ok: true,
      playerId: result.player.id,
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      snapshot
    });
  });

  socket.on('host:startGame', (payload = {}, ack) => {
    const session = getRoom(payload.roomCode || payload.sessionId);
    if (!session) {
      return ack?.({ ok: false, error: 'room_not_found' });
    }
    if (!requireHost(session, payload)) {
      return ack?.({ ok: false, error: 'not_host' });
    }
    if (session.state === 'finished') {
      return ack?.({ ok: false, error: 'game_finished' });
    }
    if (session.state === 'running') {
      return ack?.({ ok: false, error: 'already_running' });
    }

    const result = startQuestion(session);
    if (!result.ok) {
      return ack?.({ ok: false, error: result.error });
    }

    if (result.finished) {
      emitState(session);
      emitGameEnd(session, 'completed');
      return ack?.({ ok: true, finished: true, snapshot: serializeSession(session) });
    }

    emitQuestion(session, result.question);
    const snapshot = emitState(session);
    return ack?.({ ok: true, snapshot });
  });

  socket.on('host:nextQuestion', (payload = {}, ack) => {
    const session = getRoom(payload.roomCode || payload.sessionId);
    if (!session) {
      return ack?.({ ok: false, error: 'room_not_found' });
    }
    if (!requireHost(session, payload)) {
      return ack?.({ ok: false, error: 'not_host' });
    }

    if (session.currentQuestion) {
      const scored = finishQuestion(session, 'host');
      if (!scored.ok) {
        return ack?.({ ok: false, error: scored.error });
      }
      if (scored.finished) {
        return ack?.({ ok: true, finished: true, snapshot: serializeSession(session) });
      }
    } else if (session.questionIndex < 0) {
      return ack?.({ ok: false, error: 'not_started' });
    }

    const result = startQuestion(session);
    if (!result.ok) {
      return ack?.({ ok: false, error: result.error });
    }
    if (result.finished) {
      return ack?.({ ok: true, finished: true, snapshot: serializeSession(session) });
    }

    emitQuestion(session, result.question);
    const snapshot = emitState(session);
    return ack?.({ ok: true, snapshot });
  });

  socket.on('player:submitAnswer', (payload = {}, ack) => {
    const session = getRoom(payload.roomCode || payload.sessionId);
    if (!session) {
      return ack?.({ ok: false, error: 'room_not_found' });
    }

    const playerId = payload.playerId;
    const answerValue = payload.answer ?? payload.answerId ?? payload.text;
    const questionId = payload.questionId || session.currentQuestion?.id;

    const result = submitAnswer(session, {
      playerId,
      answer: answerValue,
      questionId
    });

    if (!result.ok) {
      return ack?.({ ok: false, error: result.error });
    }

    const player = session.players.get(playerId);
    const currentQuestion = session.currentQuestion;
    const correct = currentQuestion
      ? currentQuestion.type === 'text'
        ? String(answerValue || '').trim().toLowerCase() === String(currentQuestion.answer).trim().toLowerCase()
        : String(answerValue || '') === String(currentQuestion.answer)
      : false;

    io.to(roomChannel(session.sessionId)).emit('answer:accepted', {
      playerId,
      questionId,
      answer: answerValue,
      correct,
      playerName: player?.displayName,
      totalScore: session.scores.get(playerId) || 0
    });

    ack?.({ ok: true, correct, totalScore: session.scores.get(playerId) || 0 });
  });

  socket.on('disconnect', () => {
    const playerLink = playersBySocket.get(socket.id);
    if (playerLink) {
      const session = sessionsById.get(playerLink.sessionId);
      const player = session?.players.get(playerLink.playerId);
      if (player) {
        player.connected = false;
        player.lastSeenAt = Date.now();
        emitState(session);
      }
      playersBySocket.delete(socket.id);
    }

    const hostSessionId = hostsBySocket.get(socket.id);
    if (hostSessionId) {
      const session = sessionsById.get(hostSessionId);
      if (session) {
        emitState(session);
      }
      hostsBySocket.delete(socket.id);
    }
  });
});

app.post('/api/debug/reset', (_req, res) => {
  for (const session of sessionsById.values()) {
    clearTimers(session);
  }
  sessionsById.clear();
  sessionsByCode.clear();
  hostsBySocket.clear();
  playersBySocket.clear();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz MVP server running on http://localhost:${PORT}`);
});
