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
  function capitalizeWords(value) {
    return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
  }
  var init_format = __esm({
    "src/client/shared/format.ts"() {
      "use strict";
    }
  });

  // src/client/host/main.ts
  var require_main = __commonJS({
    "src/client/host/main.ts"() {
      init_format();
      var STORAGE_KEYS = {
        hostName: "quiz-host-name",
        sessionId: "quiz-host-session-id",
        hostId: "quiz-host-id",
        roomCode: "quiz-host-room-code",
        joinUrl: "quiz-host-join-url"
      };
      function byId(id) {
        const element = document.getElementById(id);
        if (!element) {
          throw new Error(`Missing required element: #${id}`);
        }
        return element;
      }
      var elements = {
        status: byId("connectionStatus"),
        createRoomForm: byId("createRoomForm"),
        hostNameInput: byId("hostNameInput"),
        roomArea: byId("roomArea"),
        roomCode: byId("roomCode"),
        roomCodeCompact: byId("roomCodeCompact"),
        joinUrl: byId("joinUrl"),
        qrImage: byId("qrImage"),
        copyRoomCodeButton: byId("copyRoomCodeButton"),
        copyJoinUrlButton: byId("copyJoinUrlButton"),
        playerList: byId("playerList"),
        playerCount: byId("playerCount"),
        gamePhase: byId("gamePhase"),
        questionIndex: byId("questionIndex"),
        questionType: byId("questionType"),
        questionPrompt: byId("questionPrompt"),
        questionOptions: byId("questionOptions"),
        questionAnswerPreview: byId("questionAnswerPreview"),
        timerFill: byId("timerFill"),
        timerValue: byId("timerValue"),
        startGameButton: byId("startGameButton"),
        nextQuestionButton: byId("nextQuestionButton"),
        leaderboardList: byId("leaderboardList")
      };
      var state = {
        socket: null,
        connected: false,
        sessionId: localStorage.getItem(STORAGE_KEYS.sessionId) ?? "",
        hostId: localStorage.getItem(STORAGE_KEYS.hostId) ?? "",
        roomCode: localStorage.getItem(STORAGE_KEYS.roomCode) ?? "",
        joinUrl: localStorage.getItem(STORAGE_KEYS.joinUrl) ?? "",
        players: [],
        leaderboard: [],
        currentQuestion: null,
        questionIndex: -1,
        phase: "lobby",
        timer: {
          questionId: "",
          startedAt: 0,
          endsAt: 0,
          remainingMs: 0
        }
      };
      function setStatus(text, tone = "idle") {
        elements.status.textContent = text;
        elements.status.dataset.tone = tone;
      }
      function updateConnectionState() {
        setStatus(state.connected ? "Connected" : "Disconnected", state.connected ? "live" : "idle");
      }
      function updateFocusLayout() {
        const started = state.questionIndex >= 0 || ["running", "scoring", "finished"].includes(state.phase);
        const questionLive = state.phase === "running";
        document.body.classList.toggle("in-game", started);
        document.body.classList.toggle("question-live", questionLive);
        if (!started) {
          const visible = Boolean(state.roomCode && state.joinUrl);
          elements.roomArea.hidden = !visible;
        } else {
          elements.roomArea.hidden = true;
        }
        elements.roomCodeCompact.textContent = state.roomCode ? `Room ${state.roomCode}` : "Room --";
      }
      function syncControls() {
        const hasSession = Boolean(state.sessionId);
        const canStart = hasSession && state.phase === "lobby" && state.questionIndex < 0;
        const canAdvance = hasSession && state.questionIndex >= 0 && state.phase !== "finished";
        elements.startGameButton.disabled = !canStart;
        elements.nextQuestionButton.disabled = !canAdvance;
        elements.copyRoomCodeButton.disabled = !state.roomCode;
        elements.copyJoinUrlButton.disabled = !state.joinUrl;
      }
      function updateRoomDetails() {
        elements.roomCode.textContent = state.roomCode || "--";
        elements.joinUrl.textContent = state.joinUrl || "--";
        elements.qrImage.src = state.joinUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(state.joinUrl)}` : "";
        elements.qrImage.style.visibility = state.joinUrl ? "visible" : "hidden";
        updateFocusLayout();
        syncControls();
      }
      function renderPlayers() {
        const count = state.players.length;
        elements.playerCount.textContent = `${count} / 10`;
        if (!count) {
          elements.playerList.innerHTML = '<li class="empty-state">No players in lobby yet.</li>';
          return;
        }
        elements.playerList.innerHTML = state.players.map((player, index) => {
          const connection = player.connected ? "Connected" : "Offline";
          return `
        <li class="player-row">
          <div class="player-avatar">${index + 1}</div>
          <div class="player-meta">
            <strong>${escapeHtml(player.displayName)}</strong>
            <span>${escapeHtml(connection)}</span>
          </div>
        </li>
      `;
        }).join("");
      }
      function renderQuestion() {
        const question = state.currentQuestion;
        if (!question) {
          elements.gamePhase.textContent = capitalizeWords(state.phase || "lobby");
          elements.questionIndex.textContent = state.questionIndex >= 0 ? `Question ${state.questionIndex + 1}` : "Question 0";
          elements.questionType.textContent = "No question loaded";
          elements.questionPrompt.textContent = state.questionIndex >= 0 ? "Waiting for next question..." : "Create a room to begin.";
          elements.questionOptions.innerHTML = "";
          elements.questionAnswerPreview.hidden = true;
          updateFocusLayout();
          return;
        }
        elements.gamePhase.textContent = capitalizeWords(state.phase || "running");
        elements.questionIndex.textContent = `Question ${state.questionIndex + 1}`;
        elements.questionType.textContent = question.type === "text" ? "Text answer" : "Multiple choice";
        elements.questionPrompt.textContent = question.prompt;
        if (question.type === "text") {
          elements.questionOptions.innerHTML = "";
          elements.questionAnswerPreview.hidden = false;
          elements.questionAnswerPreview.textContent = "Players type answer on their devices.";
        } else {
          const options = question.options ?? [];
          elements.questionOptions.innerHTML = options.map((option, optionIndex) => `
        <div class="option-card">
          <span class="option-index">${String.fromCharCode(65 + optionIndex)}</span>
          <span class="option-label">${escapeHtml(option.label)}</span>
        </div>
      `).join("");
          elements.questionAnswerPreview.hidden = true;
        }
        updateFocusLayout();
      }
      function renderLeaderboard() {
        if (!state.leaderboard.length) {
          elements.leaderboardList.innerHTML = '<li class="empty-state">No scores yet.</li>';
          return;
        }
        elements.leaderboardList.innerHTML = state.leaderboard.map(
          (entry, index) => `
        <li class="leaderboard-row">
          <span class="rank">#${index + 1}</span>
          <span class="name">${escapeHtml(entry.displayName)}</span>
          <strong class="score">${entry.score}</strong>
        </li>
      `
        ).join("");
      }
      function renderTimer() {
        const total = Math.max(1, state.timer.endsAt - state.timer.startedAt);
        const remaining = Math.max(0, state.timer.remainingMs || 0);
        const elapsed = Math.max(0, total - remaining);
        const percentage = Math.min(100, Math.max(0, elapsed / total * 100));
        elements.timerValue.textContent = formatTimer(remaining);
        elements.timerFill.style.width = `${percentage}%`;
      }
      function persistHostState() {
        localStorage.setItem(STORAGE_KEYS.sessionId, state.sessionId || "");
        localStorage.setItem(STORAGE_KEYS.hostId, state.hostId || "");
        localStorage.setItem(STORAGE_KEYS.roomCode, state.roomCode || "");
        localStorage.setItem(STORAGE_KEYS.joinUrl, state.joinUrl || "");
      }
      function updateFromSnapshot(snapshot) {
        state.sessionId = snapshot.sessionId || state.sessionId;
        state.hostId = snapshot.hostId || state.hostId;
        state.roomCode = snapshot.roomCode || state.roomCode;
        state.joinUrl = state.joinUrl || `${window.location.origin}/player.html?room=${state.roomCode}`;
        state.questionIndex = snapshot.questionIndex;
        state.phase = snapshot.phase || snapshot.state;
        state.players = snapshot.players;
        state.leaderboard = snapshot.leaderboard;
        state.currentQuestion = snapshot.currentQuestion;
        state.timer.questionId = snapshot.timer.questionId || state.timer.questionId;
        state.timer.startedAt = snapshot.timer.startedAt ?? state.timer.startedAt;
        state.timer.endsAt = snapshot.timer.endsAt ?? state.timer.endsAt;
        state.timer.remainingMs = snapshot.timer.remainingMs ?? state.timer.remainingMs;
        persistHostState();
        updateRoomDetails();
        renderPlayers();
        renderQuestion();
        renderLeaderboard();
        renderTimer();
        syncControls();
      }
      function updateFromQuestionStart(payload) {
        const question = payload.question ?? payload;
        if (!question) {
          return;
        }
        state.currentQuestion = {
          id: question.id,
          questionId: question.questionId,
          type: question.type,
          inputType: question.inputType,
          prompt: question.prompt,
          text: question.text,
          options: question.options
        };
        if (typeof payload.questionIndex === "number") {
          state.questionIndex = Math.max(0, payload.questionIndex - 1);
        }
        state.phase = "running";
        state.timer.questionId = state.currentQuestion.id;
        state.timer.startedAt = payload.startedAt ?? Date.now();
        state.timer.endsAt = payload.endsAt ?? state.timer.startedAt + (payload.durationMs ?? 15e3);
        state.timer.remainingMs = Math.max(0, state.timer.endsAt - Date.now());
        renderQuestion();
        renderTimer();
        syncControls();
      }
      function updateTimer(payload) {
        if (payload.questionId) {
          state.timer.questionId = payload.questionId;
        }
        if (typeof payload.startedAt === "number") {
          state.timer.startedAt = payload.startedAt;
        }
        if (typeof payload.endsAt === "number") {
          state.timer.endsAt = payload.endsAt;
        }
        if (typeof payload.remainingMs === "number") {
          state.timer.remainingMs = payload.remainingMs;
        }
        renderTimer();
      }
      function emit(eventName, payload, onAck) {
        state.socket?.emit(eventName, payload, (response) => {
          onAck?.(response);
        });
      }
      function bindSocket() {
        if (!window.io) {
          setStatus("Socket.IO unavailable", "error");
          return;
        }
        state.socket = window.io({ transports: ["websocket", "polling"], autoConnect: true });
        state.socket.on("connect", () => {
          state.connected = true;
          updateConnectionState();
          if (state.sessionId && state.hostId) {
            emit("host:reconnect", { sessionId: state.sessionId, hostId: state.hostId }, (response) => {
              if (response?.snapshot) {
                updateFromSnapshot(response.snapshot);
              }
            });
          }
        });
        state.socket.on("disconnect", () => {
          state.connected = false;
          updateConnectionState();
        });
        state.socket.on("connect_error", (error) => {
          setStatus(error.message ? `Connection error: ${error.message}` : "Connection error", "error");
        });
        state.socket.on("session:update", (snapshot) => updateFromSnapshot(snapshot));
        state.socket.on("lobby:update", (payload) => {
          if (payload.players) {
            state.players = payload.players;
            renderPlayers();
          }
        });
        state.socket.on("question:start", (payload) => updateFromQuestionStart(payload));
        state.socket.on("question:started", (payload) => updateFromQuestionStart(payload));
        state.socket.on("question:locked", () => {
          state.phase = "scoring";
          renderQuestion();
          syncControls();
        });
        state.socket.on("timer:tick", (payload) => updateTimer(payload));
        state.socket.on("leaderboard:update", (payload) => {
          if (payload.leaderboard) {
            state.leaderboard = payload.leaderboard;
            renderLeaderboard();
          }
        });
        state.socket.on("game:end", (payload) => {
          state.phase = "finished";
          if (payload.leaderboard) {
            state.leaderboard = payload.leaderboard;
          }
          renderQuestion();
          renderLeaderboard();
          syncControls();
        });
        state.socket.on("error", (payload) => {
          setStatus(payload.message || payload.code || "Unknown error", "error");
        });
      }
      function createRoom(hostName) {
        emit("host:createRoom", { hostName }, (response) => {
          if (!response || response.error) {
            setStatus(response?.message || response?.error || "Failed to create room", "error");
            return;
          }
          if (response.snapshot) {
            updateFromSnapshot(response.snapshot);
          }
          state.hostId = String(response.hostId || state.hostId);
          state.joinUrl = String(response.joinUrl || `${window.location.origin}/player.html?room=${state.roomCode}`);
          persistHostState();
          updateRoomDetails();
          setStatus(`Room ${state.roomCode} ready`, "live");
        });
      }
      function startGame() {
        if (!state.sessionId) {
          return;
        }
        emit("host:startGame", { sessionId: state.sessionId, hostId: state.hostId }, (response) => {
          if (response?.error) {
            setStatus(response.message || response.error, "error");
            return;
          }
          if (response?.snapshot) {
            updateFromSnapshot(response.snapshot);
          }
        });
      }
      function nextQuestion() {
        if (!state.sessionId) {
          return;
        }
        emit("host:nextQuestion", { sessionId: state.sessionId, hostId: state.hostId }, (response) => {
          if (response?.error) {
            setStatus(response.message || response.error, "error");
            return;
          }
          if (response?.snapshot) {
            updateFromSnapshot(response.snapshot);
          }
        });
      }
      async function copyValue(value, button, fallbackLabel) {
        if (!value) {
          return;
        }
        try {
          await navigator.clipboard.writeText(value);
          button.disabled = true;
          button.textContent = "Copied";
          setTimeout(() => {
            button.textContent = fallbackLabel;
            button.disabled = false;
          }, 1200);
        } catch {
          window.prompt("Copy to clipboard:", value);
        }
      }
      function setupEvents() {
        elements.createRoomForm.addEventListener("submit", (event) => {
          event.preventDefault();
          const hostName = elements.hostNameInput.value.trim() || "Host";
          localStorage.setItem(STORAGE_KEYS.hostName, hostName);
          createRoom(hostName);
        });
        elements.copyRoomCodeButton.addEventListener("click", () => {
          copyValue(state.roomCode, elements.copyRoomCodeButton, "Copy code");
        });
        elements.copyJoinUrlButton.addEventListener("click", () => {
          copyValue(state.joinUrl, elements.copyJoinUrlButton, "Copy join link");
        });
        elements.startGameButton.addEventListener("click", startGame);
        elements.nextQuestionButton.addEventListener("click", nextQuestion);
      }
      function tick() {
        if (state.timer.endsAt) {
          state.timer.remainingMs = Math.max(0, state.timer.endsAt - Date.now());
          renderTimer();
        }
        window.requestAnimationFrame(tick);
      }
      function hydrate() {
        const savedHostName = localStorage.getItem(STORAGE_KEYS.hostName);
        if (savedHostName) {
          elements.hostNameInput.value = savedHostName;
        }
        if (state.sessionId || state.roomCode) {
          state.joinUrl = state.joinUrl || `${window.location.origin}/player.html?room=${state.roomCode}`;
          updateRoomDetails();
        }
      }
      hydrate();
      setupEvents();
      bindSocket();
      updateConnectionState();
      renderPlayers();
      renderQuestion();
      renderLeaderboard();
      renderTimer();
      window.requestAnimationFrame(tick);
    }
  });
  require_main();
})();
//# sourceMappingURL=host.js.map
