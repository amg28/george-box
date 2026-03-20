"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/client/shared/format.ts
  function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function formatTimer(remainingMs) {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1e3));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
  function normalizeRoomCode(value) {
    return value.trim().replace(/\s+/g, "").toUpperCase();
  }
  function normalizeDisplayName(value) {
    return value.trim().slice(0, 24);
  }
  var init_format = __esm({
    "src/client/shared/format.ts"() {
      "use strict";
    }
  });

  // src/client/player/main.ts
  var require_main = __commonJS({
    "src/client/player/main.ts"() {
      init_format();
      var storage = {
        roomCode: "quiz.roomCode",
        displayName: "quiz.displayName",
        playerId: "quiz.playerId",
        sessionId: "quiz.sessionId"
      };
      function byId(id) {
        const element = document.getElementById(id);
        if (!element) {
          throw new Error(`Missing required element: #${id}`);
        }
        return element;
      }
      var elements = {
        connectionPill: byId("connectionPill"),
        roomBadge: byId("roomBadge"),
        joinHint: byId("joinHint"),
        playerHint: byId("playerHint"),
        joinPanel: byId("joinPanel"),
        statusPanel: byId("statusPanel"),
        joinForm: byId("joinForm"),
        roomCode: byId("roomCode"),
        displayName: byId("displayName"),
        reconnectButton: byId("reconnectButton"),
        joinMessage: byId("joinMessage"),
        gamePhase: byId("gamePhase"),
        timerValue: byId("timerValue"),
        scoreValue: byId("scoreValue"),
        questionPrompt: byId("questionPrompt"),
        questionHint: byId("questionHint"),
        optionsContainer: byId("optionsContainer"),
        textAnswerContainer: byId("textAnswerContainer"),
        textAnswer: byId("textAnswer"),
        submitAnswerButton: byId("submitAnswerButton"),
        clearAnswerButton: byId("clearAnswerButton"),
        answerState: byId("answerState"),
        questionTypePill: byId("questionTypePill"),
        leaderboardPanel: byId("leaderboardPanel"),
        leaderboard: byId("leaderboard"),
        summaryPanel: byId("summaryPanel"),
        summaryText: byId("summaryText"),
        summaryHint: byId("summaryHint"),
        finalLeaderboard: byId("finalLeaderboard")
      };
      var state = {
        socket: null,
        connected: false,
        roomCode: "",
        displayName: "",
        playerId: "",
        sessionId: "",
        phase: "idle",
        question: null,
        timerMs: null,
        players: [],
        leaderboard: [],
        score: 0,
        submittedQuestionId: "",
        selectedOptionId: "",
        gameEnded: false,
        joined: false
      };
      function init() {
        const queryRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");
        const storedRoom = normalizeRoomCode(localStorage.getItem(storage.roomCode) || "");
        if (queryRoom && storedRoom && queryRoom !== storedRoom) {
          localStorage.removeItem(storage.playerId);
          localStorage.removeItem(storage.sessionId);
        }
        state.roomCode = queryRoom || storedRoom;
        state.displayName = localStorage.getItem(storage.displayName) || "";
        state.playerId = localStorage.getItem(storage.playerId) || "";
        state.sessionId = localStorage.getItem(storage.sessionId) || "";
        elements.roomCode.value = state.roomCode;
        elements.displayName.value = state.displayName;
        bindUI();
        connectSocket();
        startTick();
        render();
      }
      function bindUI() {
        elements.joinForm.addEventListener("submit", (event) => {
          event.preventDefault();
          joinRoom();
        });
        elements.reconnectButton.addEventListener("click", () => reconnect());
        elements.submitAnswerButton.addEventListener("click", () => submitAnswer());
        elements.clearAnswerButton.addEventListener("click", () => {
          elements.textAnswer.value = "";
          state.selectedOptionId = "";
          renderQuestion();
        });
        elements.optionsContainer.addEventListener("click", (event) => {
          const target = event.target;
          const optionButton = target.closest("[data-option-id]");
          if (!optionButton || !canSubmit()) {
            return;
          }
          state.selectedOptionId = optionButton.getAttribute("data-option-id") || "";
          setAnswerState("Option selected.", "live");
          renderQuestion();
        });
      }
      function connectSocket() {
        if (!window.io) {
          setMessage("Socket.IO client missing.", "error");
          return;
        }
        state.socket = window.io({ transports: ["websocket", "polling"], autoConnect: true });
        state.socket.on("connect", () => {
          state.connected = true;
          setConnection("Connected", "live");
          maybeAutoReconnect();
          render();
        });
        state.socket.on("disconnect", () => {
          state.connected = false;
          setConnection("Reconnecting...", "warn");
          render();
        });
        state.socket.on("session:update", (payload) => onSessionUpdate(payload));
        state.socket.on("lobby:update", (payload) => onLobbyUpdate(payload));
        state.socket.on("question:start", (payload) => onQuestionStart(payload));
        state.socket.on("question:started", (payload) => onQuestionStart(payload));
        state.socket.on("question:locked", () => {
          state.phase = "scoring";
          setAnswerState("Question locked.", "warn");
          render();
        });
        state.socket.on("timer:tick", (payload) => {
          if (typeof payload.remainingMs === "number") {
            state.timerMs = payload.remainingMs;
            renderTimer();
          }
        });
        state.socket.on("answer:accepted", (payload) => {
          if (!payload.playerId || payload.playerId !== state.playerId) {
            return;
          }
          state.submittedQuestionId = payload.questionId || state.submittedQuestionId;
          if (typeof payload.totalScore === "number") {
            state.score = payload.totalScore;
          }
          setAnswerState("Answer received.", "live");
          render();
        });
        state.socket.on("leaderboard:update", (payload) => {
          const list = payload.leaderboard || payload.players || [];
          state.leaderboard = list.map((entry) => ({
            id: entry.id,
            displayName: entry.displayName,
            score: entry.score
          }));
          hydrateScoreFromLeaderboard();
          renderLeaderboard();
          renderStatus();
        });
        state.socket.on("game:end", (payload) => {
          state.gameEnded = true;
          state.phase = "finished";
          state.leaderboard = payload.leaderboard || payload.finalLeaderboard || state.leaderboard;
          showSummary(payload.reason || "Game finished");
          render();
        });
        state.socket.on("error", (payload) => {
          setMessage(payload.message || payload.code || "Unexpected error.", "error");
        });
      }
      function maybeAutoReconnect() {
        if (!state.roomCode || !state.playerId) {
          return;
        }
        reconnect();
      }
      function joinRoom() {
        if (!state.socket || !state.socket.connected) {
          setMessage("Connecting to server. Try again in a moment.", "warn");
          return;
        }
        const roomCode = normalizeRoomCode(elements.roomCode.value);
        const displayName = normalizeDisplayName(elements.displayName.value);
        if (!roomCode) {
          setMessage("Enter a room code.", "error");
          return;
        }
        if (!displayName) {
          setMessage("Enter a display name.", "error");
          return;
        }
        state.roomCode = roomCode;
        state.displayName = displayName;
        emitWithAck("player:join", {
          roomCode,
          displayName,
          playerId: state.playerId || void 0
        }).then((response) => {
          state.playerId = response.playerId || state.playerId;
          state.sessionId = response.sessionId || state.sessionId;
          state.joined = true;
          if (response.snapshot) {
            onSessionUpdate(response.snapshot);
          }
          persistIdentity();
          setMessage("Joined room. Ready.", "live");
        }).catch((error) => {
          state.joined = false;
          setMessage(error.message || "Join failed.", "error");
          render();
        });
      }
      function reconnect() {
        if (!state.socket || !state.socket.connected) {
          return;
        }
        const roomCode = normalizeRoomCode(elements.roomCode.value || state.roomCode);
        if (!roomCode || !state.playerId) {
          return;
        }
        emitWithAck("player:reconnect", {
          roomCode,
          sessionId: state.sessionId || void 0,
          playerId: state.playerId
        }).then((response) => {
          state.sessionId = response.sessionId || state.sessionId;
          state.joined = true;
          if (response.snapshot) {
            onSessionUpdate(response.snapshot);
          }
        }).catch(() => {
          state.joined = false;
          render();
        });
      }
      function submitAnswer() {
        if (!canSubmit()) {
          setMessage("Answer is locked or already submitted.", "warn");
          return;
        }
        const answer = state.question?.type === "text" ? elements.textAnswer.value.trim() : state.selectedOptionId;
        if (!answer) {
          setMessage("Provide an answer first.", "error");
          return;
        }
        emitWithAck("player:submitAnswer", {
          roomCode: state.roomCode,
          sessionId: state.sessionId || void 0,
          playerId: state.playerId,
          questionId: state.question?.id,
          answer,
          clientSubmitId: `submit_${Date.now()}`
        }).then((response) => {
          if (state.question) {
            state.submittedQuestionId = state.question.id;
          }
          if (typeof response.totalScore === "number") {
            state.score = response.totalScore;
          }
          setAnswerState("Answer sent.", "live");
          render();
        }).catch((error) => setMessage(error.message || "Submit failed.", "error"));
      }
      function canSubmit() {
        if (!state.question || state.gameEnded) {
          return false;
        }
        if (state.phase !== "running") {
          return false;
        }
        if (state.submittedQuestionId === state.question.id) {
          return false;
        }
        if (typeof state.timerMs === "number" && state.timerMs <= 0) {
          return false;
        }
        return true;
      }
      function onSessionUpdate(snapshot) {
        state.roomCode = normalizeRoomCode(snapshot.roomCode || state.roomCode);
        state.sessionId = snapshot.sessionId || state.sessionId;
        state.phase = snapshot.phase || snapshot.state;
        state.players = snapshot.players;
        state.leaderboard = snapshot.leaderboard;
        if (state.playerId) {
          state.joined = snapshot.players.some((player) => player.id === state.playerId);
        }
        if (snapshot.currentQuestion) {
          state.question = snapshot.currentQuestion;
        } else {
          state.question = null;
          state.submittedQuestionId = "";
          state.selectedOptionId = "";
          elements.textAnswer.value = "";
        }
        if (typeof snapshot.timer.remainingMs === "number") {
          state.timerMs = snapshot.timer.remainingMs;
        } else if (snapshot.questionEndsAt) {
          state.timerMs = Math.max(0, snapshot.questionEndsAt - Date.now());
        }
        hydrateScoreFromLeaderboard();
        persistIdentity();
        render();
      }
      function onLobbyUpdate(payload) {
        if (!payload.players) {
          return;
        }
        state.players = payload.players;
        state.leaderboard = payload.players.map((player) => ({
          id: player.id,
          displayName: player.displayName,
          score: player.score
        }));
        if (state.playerId) {
          state.joined = payload.players.some((player) => player.id === state.playerId);
        }
        if (!["running", "scoring", "finished"].includes(state.phase)) {
          state.phase = "lobby";
        }
        render();
      }
      function onQuestionStart(payload) {
        const source = payload.question || payload;
        if (!source?.id) {
          return;
        }
        state.phase = "running";
        state.question = {
          id: source.id,
          questionId: source.questionId || source.id,
          type: source.type,
          inputType: source.inputType || source.type,
          prompt: source.prompt,
          text: source.text || source.prompt,
          options: source.options ?? null
        };
        state.submittedQuestionId = "";
        state.selectedOptionId = "";
        elements.textAnswer.value = "";
        state.timerMs = typeof payload.durationMs === "number" ? payload.durationMs : state.timerMs;
        setAnswerState("", "warn");
        render();
      }
      function hydrateScoreFromLeaderboard() {
        const me = state.leaderboard.find((entry) => entry.id === state.playerId);
        if (me) {
          state.score = me.score;
        }
      }
      function render() {
        applyFocusLayout();
        renderStatus();
        renderQuestion();
        renderTimer();
        renderLeaderboard();
        renderSummary();
      }
      function applyFocusLayout() {
        elements.joinPanel.classList.toggle("hidden", state.joined);
        elements.statusPanel.classList.toggle("hidden", !state.joined);
        elements.leaderboardPanel.classList.add("hidden");
      }
      function renderStatus() {
        const labels = {
          idle: "Waiting",
          lobby: "Lobby",
          running: "Answer now",
          scoring: "Scoring",
          finished: "Finished"
        };
        elements.gamePhase.textContent = labels[state.phase] || "Live";
        elements.scoreValue.textContent = String(state.score || 0);
        elements.roomBadge.textContent = state.roomCode ? `Room: ${state.roomCode}` : "Room: not set";
        elements.joinHint.textContent = state.roomCode ? `Connected room ${state.roomCode}.` : "Use ?room=ABC123 or enter room code below.";
        elements.playerHint.textContent = state.playerId ? `Player id: ${state.playerId}` : "";
      }
      function renderQuestion() {
        if (!state.question || state.gameEnded) {
          elements.questionPrompt.textContent = state.gameEnded ? "The game is finished." : "Waiting for the next question.";
          elements.questionHint.textContent = state.gameEnded ? "See final standings below." : "Host has not started yet.";
          elements.optionsContainer.classList.add("hidden");
          elements.textAnswerContainer.classList.add("hidden");
          elements.questionTypePill.classList.add("hidden");
          elements.clearAnswerButton.classList.add("hidden");
          elements.submitAnswerButton.disabled = true;
          return;
        }
        elements.questionPrompt.textContent = state.question.prompt;
        elements.questionHint.textContent = canSubmit() ? "Submit before timer ends." : "Submission locked.";
        elements.questionTypePill.textContent = state.question.type === "text" ? "text" : "multiple choice";
        elements.questionTypePill.classList.remove("hidden");
        const submitted = state.submittedQuestionId === state.question.id;
        elements.submitAnswerButton.disabled = !canSubmit();
        elements.submitAnswerButton.textContent = submitted ? "Submitted" : "Submit answer";
        if (state.question.type === "text") {
          elements.optionsContainer.classList.add("hidden");
          elements.textAnswerContainer.classList.remove("hidden");
          elements.clearAnswerButton.classList.remove("hidden");
          elements.textAnswer.disabled = !canSubmit();
        } else {
          elements.textAnswerContainer.classList.add("hidden");
          elements.clearAnswerButton.classList.add("hidden");
          elements.optionsContainer.classList.remove("hidden");
          renderOptions();
        }
      }
      function renderOptions() {
        const options = state.question?.options ?? [];
        if (!options.length) {
          elements.optionsContainer.innerHTML = '<p class="small">No options yet.</p>';
          return;
        }
        elements.optionsContainer.innerHTML = options.map((option, index) => {
          const optionId = option.id || String(index);
          const selectedClass = state.selectedOptionId === optionId ? " selected" : "";
          const lockedClass = canSubmit() ? "" : " locked";
          return `<button type="button" class="option${selectedClass}${lockedClass}" data-option-id="${optionId}">${escapeHtml(option.label)}</button>`;
        }).join("");
      }
      function renderTimer() {
        if (typeof state.timerMs !== "number") {
          elements.timerValue.textContent = "--:--";
          return;
        }
        elements.timerValue.textContent = formatTimer(state.timerMs);
      }
      function renderLeaderboard() {
        if (!state.leaderboard.length) {
          elements.leaderboard.innerHTML = '<p class="small">No leaderboard data yet.</p>';
          return;
        }
        elements.leaderboard.innerHTML = state.leaderboard.map((player) => {
          const name = escapeHtml(player.displayName);
          return `
        <div class="leader-row">
          <div><strong>${name}</strong></div>
          <div>${player.score}</div>
        </div>
      `;
        }).join("");
      }
      function renderSummary() {
        if (!state.gameEnded) {
          elements.summaryPanel.classList.add("hidden");
          return;
        }
        elements.summaryPanel.classList.remove("hidden");
        elements.finalLeaderboard.innerHTML = elements.leaderboard.innerHTML;
      }
      function showSummary(title) {
        elements.summaryText.textContent = title || "Game finished";
        elements.summaryHint.textContent = "Thanks for playing.";
      }
      function setConnection(text, kind) {
        elements.connectionPill.className = `pill ${kind}`;
        elements.connectionPill.innerHTML = `<span class="badge-dot"></span>${escapeHtml(text)}`;
      }
      function setMessage(text, kind) {
        elements.joinMessage.textContent = text;
        elements.joinMessage.className = `hint ${kind}`;
      }
      function setAnswerState(text, kind) {
        if (!text) {
          elements.answerState.classList.add("hidden");
          elements.answerState.textContent = "";
          return;
        }
        elements.answerState.className = `pill ${kind}`;
        elements.answerState.textContent = text;
        elements.answerState.classList.remove("hidden");
      }
      function emitWithAck(eventName, payload) {
        return new Promise((resolve, reject) => {
          if (!state.socket || !state.socket.connected) {
            reject(new Error("Socket not connected."));
            return;
          }
          state.socket.timeout(8e3).emit(eventName, payload, (error, response) => {
            if (error) {
              reject(new Error("Request timed out."));
              return;
            }
            const typedResponse = response;
            if (typedResponse && typedResponse.ok === false) {
              reject(new Error(typedResponse.message || typedResponse.error || "Request rejected."));
              return;
            }
            resolve(typedResponse);
          });
        });
      }
      function persistIdentity() {
        localStorage.setItem(storage.roomCode, state.roomCode || "");
        localStorage.setItem(storage.displayName, state.displayName || "");
        localStorage.setItem(storage.playerId, state.playerId || "");
        localStorage.setItem(storage.sessionId, state.sessionId || "");
      }
      function startTick() {
        setInterval(() => {
          if (typeof state.timerMs === "number" && state.timerMs > 0) {
            state.timerMs = Math.max(0, state.timerMs - 1e3);
            renderTimer();
          }
        }, 1e3);
      }
      init();
    }
  });
  require_main();
})();
//# sourceMappingURL=player.js.map
