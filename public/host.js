(function () {
  const $ = (id) => document.getElementById(id);

  const els = {
    status: $("connectionStatus"),
    createRoomForm: $("createRoomForm"),
    hostNameInput: $("hostNameInput"),
    roomArea: $("roomArea"),
    roomCode: $("roomCode"),
    roomCodeCompact: $("roomCodeCompact"),
    joinUrl: $("joinUrl"),
    qrImage: $("qrImage"),
    copyRoomCodeButton: $("copyRoomCodeButton"),
    copyJoinUrlButton: $("copyJoinUrlButton"),
    playerList: $("playerList"),
    playerCount: $("playerCount"),
    gamePhase: $("gamePhase"),
    questionIndex: $("questionIndex"),
    questionType: $("questionType"),
    questionPrompt: $("questionPrompt"),
    questionOptions: $("questionOptions"),
    questionAnswerPreview: $("questionAnswerPreview"),
    timerFill: $("timerFill"),
    timerValue: $("timerValue"),
    startGameButton: $("startGameButton"),
    nextQuestionButton: $("nextQuestionButton"),
    leaderboardList: $("leaderboardList"),
  };

  const STORAGE_KEYS = {
    hostName: "quiz-host-name",
    sessionId: "quiz-host-session-id",
    hostId: "quiz-host-id",
    roomCode: "quiz-host-room-code",
    joinUrl: "quiz-host-join-url",
  };

  const state = {
    socket: null,
    connected: false,
    sessionId: localStorage.getItem(STORAGE_KEYS.sessionId) || "",
    hostId: localStorage.getItem(STORAGE_KEYS.hostId) || "",
    roomCode: localStorage.getItem(STORAGE_KEYS.roomCode) || "",
    joinUrl: localStorage.getItem(STORAGE_KEYS.joinUrl) || "",
    players: [],
    leaderboard: [],
    currentQuestion: null,
    questionIndex: -1,
    phase: "lobby",
    timer: {
      questionId: "",
      startedAt: 0,
      endsAt: 0,
      remainingMs: 0,
    },
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(total / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function capitalize(value) {
    return String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function setStatus(text, tone = "") {
    els.status.textContent = text;
    els.status.dataset.tone = tone;
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
      els.roomArea.hidden = !visible;
    } else {
      els.roomArea.hidden = true;
    }

    els.roomCodeCompact.textContent = state.roomCode ? `Room ${state.roomCode}` : "Room --";
  }

  function syncControls() {
    const hasSession = Boolean(state.sessionId);
    const canStart = hasSession && state.phase === "lobby" && state.questionIndex < 0;
    const canAdvance = hasSession && state.questionIndex >= 0 && state.phase !== "finished";
    els.startGameButton.disabled = !canStart;
    els.nextQuestionButton.disabled = !canAdvance;
    els.copyRoomCodeButton.disabled = !state.roomCode;
    els.copyJoinUrlButton.disabled = !state.joinUrl;
  }

  function updateRoomDetails() {
    els.roomCode.textContent = state.roomCode || "--";
    els.joinUrl.textContent = state.joinUrl || "--";
    els.qrImage.src = state.joinUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(state.joinUrl)}`
      : "";
    els.qrImage.style.visibility = state.joinUrl ? "visible" : "hidden";

    updateFocusLayout();
    syncControls();
  }

  function renderPlayers() {
    const count = state.players.length;
    els.playerCount.textContent = `${count} / 10`;

    if (!count) {
      els.playerList.innerHTML = '<li class="empty-state">No players in lobby yet.</li>';
      return;
    }

    els.playerList.innerHTML = state.players
      .map((player, index) => {
        const status = player.connected ? "Connected" : "Offline";
        return `
          <li class="player-row">
            <div class="player-avatar">${index + 1}</div>
            <div class="player-meta">
              <strong>${escapeHtml(player.displayName || "Player")}</strong>
              <span>${escapeHtml(status)}</span>
            </div>
          </li>
        `;
      })
      .join("");
  }

  function renderQuestion() {
    const question = state.currentQuestion;

    if (!question) {
      els.gamePhase.textContent = capitalize(state.phase || "lobby");
      els.questionIndex.textContent = state.questionIndex >= 0 ? `Question ${state.questionIndex + 1}` : "Question 0";
      els.questionType.textContent = "No question loaded";
      els.questionPrompt.textContent = state.questionIndex >= 0 ? "Waiting for next question..." : "Create a room to begin.";
      els.questionOptions.innerHTML = "";
      els.questionAnswerPreview.hidden = true;
      updateFocusLayout();
      return;
    }

    els.gamePhase.textContent = capitalize(state.phase || "running");
    els.questionIndex.textContent = `Question ${state.questionIndex + 1}`;
    els.questionType.textContent = question.type === "text" ? "Text answer" : "Multiple choice";
    els.questionPrompt.textContent = question.prompt;
    els.questionOptions.innerHTML = "";
    els.questionAnswerPreview.hidden = true;

    if (question.type === "text") {
      els.questionAnswerPreview.hidden = false;
      els.questionAnswerPreview.textContent = "Players type answer on their devices.";
    } else {
      els.questionOptions.innerHTML = (question.options || [])
        .map(
          (option, optionIndex) => `
          <div class="option-card">
            <span class="option-index">${String.fromCharCode(65 + optionIndex)}</span>
            <span class="option-label">${escapeHtml(option.label || option.text || option)}</span>
          </div>
        `
        )
        .join("");
    }

    updateFocusLayout();
  }

  function renderLeaderboard() {
    if (!state.leaderboard.length) {
      els.leaderboardList.innerHTML = '<li class="empty-state">No scores yet.</li>';
      return;
    }

    els.leaderboardList.innerHTML = state.leaderboard
      .map(
        (entry, index) => `
        <li class="leaderboard-row">
          <span class="rank">#${index + 1}</span>
          <span class="name">${escapeHtml(entry.displayName || "Player")}</span>
          <strong class="score">${Number(entry.score ?? entry.totalScore ?? 0)}</strong>
        </li>
      `
      )
      .join("");
  }

  function renderTimer() {
    const total = Math.max(1, state.timer.endsAt - state.timer.startedAt);
    const remaining = Math.max(0, state.timer.remainingMs || 0);
    const elapsed = Math.max(0, total - remaining);
    const percent = Math.min(100, Math.max(0, (elapsed / total) * 100));
    els.timerValue.textContent = formatTime(remaining);
    els.timerFill.style.width = `${percent}%`;
  }

  function updateFromSnapshot(snapshot) {
    if (!snapshot) return;

    if (snapshot.sessionId) state.sessionId = snapshot.sessionId;
    if (snapshot.hostId) state.hostId = snapshot.hostId;
    if (snapshot.roomCode) state.roomCode = snapshot.roomCode;
    state.joinUrl = snapshot.joinUrl || `${window.location.origin}/player.html?room=${state.roomCode}`;

    if (typeof snapshot.questionIndex === "number") state.questionIndex = snapshot.questionIndex;
    state.phase = snapshot.phase || snapshot.state || state.phase;
    state.players = Array.isArray(snapshot.players) ? snapshot.players : state.players;
    state.leaderboard = Array.isArray(snapshot.leaderboard) ? snapshot.leaderboard : state.leaderboard;
    state.currentQuestion = snapshot.currentQuestion || null;

    if (snapshot.timer) {
      state.timer.questionId = snapshot.timer.questionId || state.timer.questionId;
      state.timer.startedAt = snapshot.timer.startedAt || state.timer.startedAt;
      state.timer.endsAt = snapshot.timer.endsAt || state.timer.endsAt;
      state.timer.remainingMs = typeof snapshot.timer.remainingMs === "number"
        ? snapshot.timer.remainingMs
        : state.timer.remainingMs;
    } else {
      state.timer.startedAt = snapshot.questionStartedAt || state.timer.startedAt;
      state.timer.endsAt = snapshot.questionEndsAt || state.timer.endsAt;
      state.timer.remainingMs = state.timer.endsAt ? Math.max(0, state.timer.endsAt - Date.now()) : 0;
    }

    localStorage.setItem(STORAGE_KEYS.sessionId, state.sessionId || "");
    localStorage.setItem(STORAGE_KEYS.hostId, state.hostId || "");
    localStorage.setItem(STORAGE_KEYS.roomCode, state.roomCode || "");
    localStorage.setItem(STORAGE_KEYS.joinUrl, state.joinUrl || "");

    updateRoomDetails();
    renderPlayers();
    renderQuestion();
    renderLeaderboard();
    renderTimer();
    syncControls();
  }

  function updateFromQuestionStart(payload) {
    const question = payload?.question || payload;
    if (!question) return;

    state.currentQuestion = {
      id: question.id || question.questionId || "",
      type: question.type || question.inputType || "mcq",
      prompt: question.prompt || question.text || "",
      options: Array.isArray(question.options) ? question.options : [],
    };

    if (typeof payload?.questionIndex === "number") {
      state.questionIndex = Math.max(0, payload.questionIndex - 1);
    }

    state.phase = "running";
    state.timer.questionId = state.currentQuestion.id;
    state.timer.startedAt = payload?.startedAt || Date.now();
    state.timer.endsAt = payload?.endsAt || state.timer.startedAt + (payload?.durationMs || 15000);
    state.timer.remainingMs = Math.max(0, state.timer.endsAt - Date.now());

    renderQuestion();
    renderTimer();
    syncControls();
  }

  function updateTimer(payload) {
    if (!payload) return;
    if (payload.questionId) state.timer.questionId = payload.questionId;
    if (typeof payload.startedAt === "number") state.timer.startedAt = payload.startedAt;
    if (typeof payload.endsAt === "number") state.timer.endsAt = payload.endsAt;
    if (typeof payload.remainingMs === "number") state.timer.remainingMs = payload.remainingMs;
    renderTimer();
  }

  function setLeaderboard(list) {
    state.leaderboard = Array.isArray(list) ? list : [];
    renderLeaderboard();
  }

  function emit(eventName, payload, onAck) {
    if (!state.socket) return;
    state.socket.emit(eventName, payload, onAck);
  }

  function bindSocket() {
    if (typeof window.io !== "function") {
      setStatus("Socket.IO unavailable", "error");
      return;
    }

    state.socket = window.io({ transports: ["websocket", "polling"], autoConnect: true });

    state.socket.on("connect", () => {
      state.connected = true;
      updateConnectionState();

      if (state.sessionId && state.hostId) {
        emit("host:reconnect", { sessionId: state.sessionId, hostId: state.hostId }, (response) => {
          if (response?.snapshot) updateFromSnapshot(response.snapshot);
        });
      }
    });

    state.socket.on("disconnect", () => {
      state.connected = false;
      updateConnectionState();
    });

    state.socket.on("connect_error", (error) => {
      setStatus(error?.message ? `Connection error: ${error.message}` : "Connection error", "error");
    });

    state.socket.on("session:update", updateFromSnapshot);
    state.socket.on("lobby:update", (payload) => {
      if (payload?.players) {
        state.players = payload.players;
        renderPlayers();
      }
    });
    state.socket.on("question:start", updateFromQuestionStart);
    state.socket.on("question:started", updateFromQuestionStart);
    state.socket.on("question:locked", () => {
      state.phase = "scoring";
      renderQuestion();
      syncControls();
    });
    state.socket.on("timer:tick", updateTimer);
    state.socket.on("leaderboard:update", (payload) => {
      if (payload?.leaderboard) setLeaderboard(payload.leaderboard);
    });
    state.socket.on("game:end", (payload) => {
      state.phase = "finished";
      if (payload?.leaderboard) setLeaderboard(payload.leaderboard);
      renderQuestion();
      syncControls();
    });
    state.socket.on("error", (payload) => {
      const message = payload?.message || payload?.code || "Unknown error";
      setStatus(message, "error");
    });
  }

  function createRoom(hostName) {
    emit("host:createRoom", { hostName: hostName || "Host" }, (response) => {
      if (!response || response.error) {
        setStatus(response?.message || response?.error || "Failed to create room", "error");
        return;
      }

      updateFromSnapshot(response.snapshot || response);
      state.hostId = response.hostId || state.hostId;
      state.joinUrl = response.joinUrl || `${window.location.origin}/player.html?room=${state.roomCode}`;
      localStorage.setItem(STORAGE_KEYS.hostId, state.hostId || "");
      updateRoomDetails();
      setStatus(`Room ${state.roomCode} ready`, "live");
    });
  }

  function startGame() {
    if (!state.sessionId) return;
    emit("host:startGame", { sessionId: state.sessionId, hostId: state.hostId }, (response) => {
      if (response?.error) {
        setStatus(response.message || response.error, "error");
        return;
      }
      if (response?.snapshot) updateFromSnapshot(response.snapshot);
    });
  }

  function nextQuestion() {
    if (!state.sessionId) return;
    emit("host:nextQuestion", { sessionId: state.sessionId, hostId: state.hostId }, (response) => {
      if (response?.error) {
        setStatus(response.message || response.error, "error");
        return;
      }
      if (response?.snapshot) updateFromSnapshot(response.snapshot);
    });
  }

  function copyValue(value, button, label) {
    if (!value) return;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        button.disabled = true;
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = label;
          button.disabled = false;
        }, 1200);
      })
      .catch(() => {
        window.prompt("Copy to clipboard:", value);
      });
  }

  function setupEvents() {
    els.createRoomForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const hostName = els.hostNameInput.value.trim() || "Host";
      localStorage.setItem(STORAGE_KEYS.hostName, hostName);
      createRoom(hostName);
    });

    els.copyRoomCodeButton.addEventListener("click", () => {
      copyValue(state.roomCode, els.copyRoomCodeButton, "Copy code");
    });

    els.copyJoinUrlButton.addEventListener("click", () => {
      copyValue(state.joinUrl, els.copyJoinUrlButton, "Copy join link");
    });

    els.startGameButton.addEventListener("click", startGame);
    els.nextQuestionButton.addEventListener("click", nextQuestion);
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
      els.hostNameInput.value = savedHostName;
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
})();
