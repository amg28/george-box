import { describe, expect, it, vi } from "vitest";
import {
  buildLeaderboard,
  calculatePoints,
  clearTimers,
  createSession,
  finishQuestion,
  isCorrectAnswer,
  joinPlayer,
  normalizeText,
  reconnectPlayer,
  serializeSession,
  snapshotQuestion,
  startQuestion,
  submitAnswer
} from "../src/server/game";
import type { QuestionDefinition } from "../src/server/game";

describe("game engine", () => {
  it("creates a lobby session with expected defaults", () => {
    const session = createSession("Host");
    expect(session.state).toBe("lobby");
    expect(session.questionIndex).toBe(-1);
    expect(session.players.size).toBe(0);

    const snapshot = serializeSession(session);
    expect(snapshot.phase).toBe("lobby");
    expect(snapshot.questionCount).toBeGreaterThan(0);
  });

  it("uses fallback host name when empty string is provided", () => {
    const session = createSession("");
    expect(session.hostName).toBe("Host");
  });

  it("returns null snapshot for missing question", () => {
    expect(snapshotQuestion(null)).toBeNull();
  });

  it("allows player join and rejects duplicate display names", () => {
    const session = createSession("Host");

    const firstJoin = joinPlayer(session, {
      displayName: "Alex",
      socketId: "socket-1"
    });
    expect(firstJoin.ok).toBe(true);

    const duplicateJoin = joinPlayer(session, {
      displayName: "alex",
      socketId: "socket-2"
    });
    expect(duplicateJoin).toEqual({ ok: false, error: "name_taken" });
  });

  it("enforces max 10 players", () => {
    const session = createSession("Host");

    for (let index = 0; index < 10; index += 1) {
      const result = joinPlayer(session, {
        displayName: `P${index}`,
        socketId: `socket-${index}`
      });
      expect(result.ok).toBe(true);
    }

    const overflowJoin = joinPlayer(session, {
      displayName: "Overflow",
      socketId: "socket-overflow"
    });

    expect(overflowJoin).toEqual({ ok: false, error: "room_full" });
  });

  it("rejects join when room is closed", () => {
    const session = createSession("Host");
    session.state = "finished";

    const result = joinPlayer(session, {
      displayName: "Late",
      socketId: "socket-late"
    });

    expect(result).toEqual({ ok: false, error: "room_closed" });
  });

  it("reconnects existing player by playerId through join", () => {
    const session = createSession("Host");

    const firstJoin = joinPlayer(session, {
      displayName: "Alex",
      socketId: "socket-1"
    });
    if (!firstJoin.ok) {
      throw new Error("Expected successful join");
    }

    firstJoin.player.connected = false;

    const reconnectJoin = joinPlayer(session, {
      playerId: firstJoin.player.id,
      displayName: "Alex Updated",
      socketId: "socket-2"
    });

    expect(reconnectJoin.ok).toBe(true);
    if (!reconnectJoin.ok) {
      throw new Error("Expected reconnect join");
    }
    expect(reconnectJoin.reconnected).toBe(true);
    expect(reconnectJoin.player.displayName).toBe("Alex Updated");
    expect(session.activeSocketIds.get(firstJoin.player.id)).toBe("socket-2");
  });

  it("handles reconnectPlayer success and not-found", () => {
    const session = createSession("Host");

    const missing = reconnectPlayer(session, {
      playerId: "missing",
      socketId: "socket-x"
    });
    expect(missing).toEqual({ ok: false, error: "player_not_found" });

    const joined = joinPlayer(session, {
      displayName: "Sam",
      socketId: "socket-1"
    });
    if (!joined.ok) {
      throw new Error("Expected successful join");
    }

    joined.player.connected = false;
    const reconnect = reconnectPlayer(session, {
      playerId: joined.player.id,
      socketId: "socket-2"
    });

    expect(reconnect.ok).toBe(true);
    if (!reconnect.ok) {
      throw new Error("Expected reconnect success");
    }
    expect(reconnect.player.connected).toBe(true);
    expect(session.activeSocketIds.get(joined.player.id)).toBe("socket-2");
  });

  it("scores correct mcq answers after a question finishes", () => {
    const session = createSession("Host");

    const joinResult = joinPlayer(session, {
      displayName: "Alex",
      socketId: "socket-1"
    });

    if (!joinResult.ok) {
      throw new Error("Expected successful join");
    }

    const playerId = joinResult.player.id;
    const startResult = startQuestion(session);
    if (!startResult.ok || startResult.finished) {
      throw new Error("Expected first question to start");
    }

    const submitResult = submitAnswer(session, {
      playerId,
      questionId: startResult.question.id,
      answer: "b"
    });

    expect(submitResult.ok).toBe(true);

    const finishResult = finishQuestion(session, "host");
    expect(finishResult.ok).toBe(true);
    if (!finishResult.ok) {
      throw new Error("Expected question to finish");
    }

    const leaderboardTop = finishResult.result.leaderboard[0];
    expect(leaderboardTop).toBeDefined();
    if (!leaderboardTop) {
      throw new Error("Expected a leaderboard entry");
    }
    expect(leaderboardTop.id).toBe(playerId);
    expect(leaderboardTop.score).toBeGreaterThanOrEqual(100);

    clearTimers(session);
  });

  it("rejects duplicate submission per player and question", () => {
    const session = createSession("Host");

    const joinResult = joinPlayer(session, {
      displayName: "Sam",
      socketId: "socket-1"
    });

    if (!joinResult.ok) {
      throw new Error("Expected successful join");
    }

    const startResult = startQuestion(session);
    if (!startResult.ok || startResult.finished) {
      throw new Error("Expected first question to start");
    }

    const first = submitAnswer(session, {
      playerId: joinResult.player.id,
      questionId: startResult.question.id,
      answer: "b"
    });
    expect(first.ok).toBe(true);

    const second = submitAnswer(session, {
      playerId: joinResult.player.id,
      questionId: startResult.question.id,
      answer: "a"
    });

    expect(second).toEqual({ ok: false, error: "duplicate" });

    clearTimers(session);
  });

  it("guards submitAnswer when not running, stale, timed out and unknown player", () => {
    const session = createSession("Host");

    const notRunning = submitAnswer(session, {
      playerId: "missing",
      questionId: "q1",
      answer: "a"
    });
    expect(notRunning).toEqual({ ok: false, error: "not_running" });

    const joined = joinPlayer(session, {
      displayName: "Kai",
      socketId: "socket-1"
    });
    if (!joined.ok) {
      throw new Error("Expected successful join");
    }

    const started = startQuestion(session);
    if (!started.ok || started.finished) {
      throw new Error("Expected first question to start");
    }

    const stale = submitAnswer(session, {
      playerId: joined.player.id,
      questionId: "stale-id",
      answer: "a"
    });
    expect(stale).toEqual({ ok: false, error: "stale_question" });

    const unknownPlayer = submitAnswer(session, {
      playerId: "missing",
      questionId: started.question.id,
      answer: "a"
    });
    expect(unknownPlayer).toEqual({ ok: false, error: "player_not_found" });

    session.questionEndsAt = Date.now() - 1;
    const timedOut = submitAnswer(session, {
      playerId: joined.player.id,
      questionId: started.question.id,
      answer: "a"
    });
    expect(timedOut).toEqual({ ok: false, error: "time_up" });

    clearTimers(session);
  });

  it("returns invalid state when starting question outside lobby", () => {
    const session = createSession("Host");
    session.state = "running";

    const result = startQuestion(session);
    expect(result).toEqual({ ok: false, error: "invalid_state" });
  });

  it("finishes immediately when no questions are available", () => {
    const session = createSession("Host", []);

    const result = startQuestion(session);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.finished) {
      throw new Error("Expected finished=true when no questions");
    }
    expect(session.state).toBe("finished");
    expect(session.endedAt).not.toBeNull();
  });

  it("handles sparse question arrays by finishing safely", () => {
    const sparse = [undefined as unknown as QuestionDefinition];
    const session = createSession("Host", sparse);

    const result = startQuestion(session);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.finished) {
      throw new Error("Expected finished=true for sparse question");
    }
    expect(session.state).toBe("finished");
  });

  it("returns not_running when finishing without active question", () => {
    const session = createSession("Host");
    const result = finishQuestion(session, "host");
    expect(result).toEqual({ ok: false, error: "not_running" });
  });

  it("skips scoring when submission metadata is incomplete", () => {
    const session = createSession("Host");
    const joined = joinPlayer(session, {
      displayName: "Lia",
      socketId: "socket-1"
    });
    if (!joined.ok) {
      throw new Error("Expected successful join");
    }

    const started = startQuestion(session);
    if (!started.ok || started.finished) {
      throw new Error("Expected first question to start");
    }

    joined.player.submittedQuestionIds.add(started.question.id);

    const result = finishQuestion(session, "host");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected question finish success");
    }

    expect(result.result.scoredPlayers).toHaveLength(0);
    expect(session.scores.get(joined.player.id)).toBe(0);

    clearTimers(session);
  });

  it("marks session finished on final question and invokes callback", () => {
    const oneQuestion: QuestionDefinition[] = [
      {
        id: "only",
        type: "mcq",
        prompt: "One?",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" }
        ],
        answer: "a"
      }
    ];

    const session = createSession("Host", oneQuestion);
    const finishedSpy = vi.fn();
    session.onQuestionFinished = finishedSpy;

    const joined = joinPlayer(session, {
      displayName: "Neo",
      socketId: "socket-1"
    });
    if (!joined.ok) {
      throw new Error("Expected successful join");
    }

    const started = startQuestion(session);
    if (!started.ok || started.finished) {
      throw new Error("Expected question start");
    }

    const submit = submitAnswer(session, {
      playerId: joined.player.id,
      questionId: started.question.id,
      answer: "a"
    });
    expect(submit.ok).toBe(true);

    const finish = finishQuestion(session, "timeout");
    expect(finish.ok).toBe(true);
    if (!finish.ok) {
      throw new Error("Expected final finish success");
    }

    expect(finish.result.finished).toBe(true);
    expect(session.state).toBe("finished");
    expect(session.endedAt).not.toBeNull();
    expect(finishedSpy).toHaveBeenCalledTimes(1);

    clearTimers(session);
  });

  it("serializes active timer details when question is running", () => {
    const session = createSession("Host");

    const joined = joinPlayer(session, {
      displayName: "Ivy",
      socketId: "socket-1"
    });
    if (!joined.ok) {
      throw new Error("Expected successful join");
    }

    const started = startQuestion(session);
    if (!started.ok || started.finished) {
      throw new Error("Expected question start");
    }

    const snapshot = serializeSession(session);
    expect(snapshot.timer.questionId).toBe(started.question.id);
    expect(snapshot.timer.remainingMs).not.toBeNull();

    clearTimers(session);
  });

  it("builds leaderboard ordered by score and name", () => {
    const session = createSession("Host");

    const alpha = joinPlayer(session, {
      displayName: "Alpha",
      socketId: "socket-a"
    });
    const beta = joinPlayer(session, {
      displayName: "Beta",
      socketId: "socket-b"
    });
    if (!alpha.ok || !beta.ok) {
      throw new Error("Expected successful joins");
    }

    session.scores.set(alpha.player.id, 50);
    session.scores.set(beta.player.id, 50);

    const leaderboard = buildLeaderboard(session);
    expect(leaderboard[0]?.displayName).toBe("Alpha");
    expect(leaderboard[1]?.displayName).toBe("Beta");
  });
});

describe("scoring", () => {
  it("normalizes text answers", () => {
    expect(normalizeText("  SoCkEt  ")).toBe("socket");
  });

  it("checks correctness for text and mcq questions", () => {
    const textQuestion: QuestionDefinition = {
      id: "text",
      type: "text",
      prompt: "type socket",
      answer: "socket"
    };

    const mcqQuestion: QuestionDefinition = {
      id: "mcq",
      type: "mcq",
      prompt: "pick b",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" }
      ],
      answer: "b"
    };

    expect(isCorrectAnswer(textQuestion, " SOCKET ")).toBe(true);
    expect(isCorrectAnswer(mcqQuestion, "b")).toBe(true);
    expect(isCorrectAnswer(mcqQuestion, "a")).toBe(false);
  });

  it("calculates points with speed bonus and zero on incorrect answers", () => {
    expect(calculatePoints(false, 1000, 500)).toBe(0);
    expect(calculatePoints(true, 10_000, 9_000)).toBe(101);
    expect(calculatePoints(true, 1_000, 2_000)).toBe(100);
  });
});