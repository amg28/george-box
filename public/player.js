(function () {
  "use strict";

  const els = {
    connectionPill: document.getElementById("connectionPill"),
    roomBadge: document.getElementById("roomBadge"),
    joinHint: document.getElementById("joinHint"),
    playerHint: document.getElementById("playerHint"),
    joinPanel: document.getElementById("joinPanel"),
    statusPanel: document.getElementById("statusPanel"),
    joinForm: document.getElementById("joinForm"),
    roomCode: document.getElementById("roomCode"),
    displayName: document.getElementById("displayName"),
    reconnectButton: document.getElementById("reconnectButton"),
    joinMessage: document.getElementById("joinMessage"),
    gamePhase: document.getElementById("gamePhase"),
    timerValue: document.getElementById("timerValue"),
    scoreValue: document.getElementById("scoreValue"),
    questionPrompt: document.getElementById("questionPrompt"),
    questionHint: document.getElementById("questionHint"),
    optionsContainer: document.getElementById("optionsContainer"),
    textAnswerContainer: document.getElementById("textAnswerContainer"),
    textAnswer: document.getElementById("textAnswer"),
    submitAnswerButton: document.getElementById("submitAnswerButton"),
    clearAnswerButton: document.getElementById("clearAnswerButton"),
    answerState: document.getElementById("answerState"),
    questionTypePill: document.getElementById("questionTypePill"),
    leaderboardPanel: document.getElementById("leaderboardPanel"),
    leaderboard: document.getElementById("leaderboard"),
    summaryPanel: document.getElementById("summaryPanel"),
    summaryText: document.getElementById("summaryText"),
    summaryHint: document.getElementById("summaryHint"),
    finalLeaderboard: document.getElementById("finalLeaderboard"),
  };

  const storage = {
    roomCode: "quiz.roomCode",
    displayName: "quiz.displayName",
    playerId: "quiz.playerId",
    sessionId: "quiz.sessionId",
  };

  const state = {
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
    joined: false,
  };

  init();

  function init() {
    const queryRoom = normalizeRoom(new URLSearchParams(window.location.search).get("room") || "");
    const storedRoom = normalizeRoom(localStorage.getItem(storage.roomCode) || "");

    if (queryRoom && storedRoom && queryRoom !== storedRoom) {
      localStorage.removeItem(storage.playerId);
      localStorage.removeItem(storage.sessionId);
    }

    state.roomCode = queryRoom || storedRoom;
    state.displayName = localStorage.getItem(storage.displayName) || "";
    state.playerId = localStorage.getItem(storage.playerId) || "";
    state.sessionId = localStorage.getItem(storage.sessionId) || "";

    if (state.roomCode) els.roomCode.value = state.roomCode;
    if (state.displayName) els.displayName.value = state.displayName;

    bindUI();
    connectSocket();
    startTick();
    render();
  }

  function bindUI() {
    els.joinForm.addEventListener("submit", (event) => {
      event.preventDefault();
      joinRoom();
    });

    els.reconnectButton.addEventListener("click", () => reconnect());
    els.submitAnswerButton.addEventListener("click", () => submitAnswer());

    els.clearAnswerButton.addEventListener("click", () => {
      els.textAnswer.value = "";
      state.selectedOptionId = "";
      renderQuestion();
    });

    els.optionsContainer.addEventListener("click", (event) => {
      const optionButton = event.target.closest("[data-option-id]");
      if (!optionButton || !canSubmit()) return;
      state.selectedOptionId = optionButton.getAttribute("data-option-id");
      renderQuestion();
      setAnswerState("Option selected.", "live");
    });
  }

  function connectSocket() {
    if (typeof io !== "function") {
      setMessage("Socket.IO client missing.", "error");
      return;
    }

    state.socket = io({ transports: ["websocket", "polling"], autoConnect: true });

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

    state.socket.on("session:update", onSessionUpdate);
    state.socket.on("lobby:update", onLobbyUpdate);
    state.socket.on("question:start", onQuestionStart);
    state.socket.on("question:started", onQuestionStart);
    state.socket.on("question:locked", () => {
      state.phase = "scoring";
      setAnswerState("Question locked.", "warn");
      render();
    });

    state.socket.on("timer:tick", (payload) => {
      if (typeof payload?.remainingMs === "number") {
        state.timerMs = payload.remainingMs;
        renderTimer();
      }
    });

    state.socket.on("answer:accepted", (payload) => {
      if (!payload || payload.playerId !== state.playerId) return;
      state.submittedQuestionId = payload.questionId || state.submittedQuestionId;
      if (typeof payload.totalScore === "number") state.score = payload.totalScore;
      setAnswerState("Answer received.", "live");
      render();
    });

    state.socket.on("leaderboard:update", (payload) => {
      const list = payload?.leaderboard || payload?.players || [];
      state.leaderboard = Array.isArray(list) ? list : [];
      hydrateScoreFromLeaderboard();
      renderLeaderboard();
      renderStatus();
    });

    state.socket.on("game:end", (payload) => {
      state.gameEnded = true;
      state.phase = "finished";
      state.leaderboard = payload?.leaderboard || payload?.finalLeaderboard || state.leaderboard;
      showSummary(payload?.reason || "Game finished");
      render();
    });

    state.socket.on("error", (payload) => {
      setMessage(payload?.message || payload?.code || "Unexpected error.", "error");
    });
  }

  function maybeAutoReconnect() {
    if (!state.roomCode || !state.playerId) return;
    reconnect();
  }

  function joinRoom() {
    if (!state.socket || !state.socket.connected) {
      setMessage("Connecting to server. Try again in a moment.", "warn");
      return;
    }

    const roomCode = normalizeRoom(els.roomCode.value);
    const displayName = normalizeName(els.displayName.value);

    if (!roomCode) return setMessage("Enter a room code.", "error");
    if (!displayName) return setMessage("Enter a display name.", "error");

    state.roomCode = roomCode;
    state.displayName = displayName;

    emitWithAck("player:join", {
      roomCode,
      displayName,
      playerId: state.playerId || undefined,
    })
      .then((response) => {
        state.playerId = response.playerId;
        state.sessionId = response.sessionId || state.sessionId;
        state.joined = true;
        if (response.snapshot) onSessionUpdate(response.snapshot);
        persistIdentity();
        setMessage("Joined room. Ready.", "live");
      })
      .catch((error) => {
        state.joined = false;
        setMessage(error.message || "Join failed.", "error");
        render();
      });
  }

  function reconnect() {
    if (!state.socket || !state.socket.connected) return;

    const roomCode = normalizeRoom(els.roomCode.value || state.roomCode);
    if (!roomCode || !state.playerId) return;

    emitWithAck("player:reconnect", {
      roomCode,
      sessionId: state.sessionId || undefined,
      playerId: state.playerId,
    })
      .then((response) => {
        state.sessionId = response.sessionId || state.sessionId;
        state.joined = true;
        if (response.snapshot) onSessionUpdate(response.snapshot);
      })
      .catch(() => {
        state.joined = false;
        render();
      });
  }

  function submitAnswer() {
    if (!canSubmit()) {
      setMessage("Answer is locked or already submitted.", "warn");
      return;
    }

    const answer = state.question?.type === "text"
      ? String(els.textAnswer.value || "").trim()
      : state.selectedOptionId;

    if (!answer) {
      setMessage("Provide an answer first.", "error");
      return;
    }

    emitWithAck("player:submitAnswer", {
      roomCode: state.roomCode,
      sessionId: state.sessionId || undefined,
      playerId: state.playerId,
      questionId: state.question.id,
      answer,
      clientSubmitId: `submit_${Date.now()}`,
    })
      .then((response) => {
        state.submittedQuestionId = state.question.id;
        if (typeof response.totalScore === "number") state.score = response.totalScore;
        setAnswerState("Answer sent.", "live");
        render();
      })
      .catch((error) => setMessage(error.message || "Submit failed.", "error"));
  }

  function canSubmit() {
    if (!state.question) return false;
    if (state.gameEnded) return false;
    if (state.phase !== "running") return false;
    if (state.submittedQuestionId === state.question.id) return false;
    if (state.timerMs !== null && state.timerMs <= 0) return false;
    return true;
  }

  function onSessionUpdate(snapshot) {
    if (!snapshot) return;

    if (snapshot.roomCode) state.roomCode = normalizeRoom(snapshot.roomCode);
    if (snapshot.sessionId) state.sessionId = snapshot.sessionId;
    if (snapshot.state || snapshot.phase) state.phase = snapshot.state || snapshot.phase;

    state.players = Array.isArray(snapshot.players) ? snapshot.players : state.players;
    state.leaderboard = Array.isArray(snapshot.leaderboard) ? snapshot.leaderboard : state.leaderboard;

    if (state.playerId && Array.isArray(snapshot.players)) {
      state.joined = snapshot.players.some((p) => p.id === state.playerId);
    }

    if (snapshot.currentQuestion) {
      state.question = normalizeQuestion(snapshot.currentQuestion);
    } else {
      state.question = null;
      state.submittedQuestionId = "";
      state.selectedOptionId = "";
      els.textAnswer.value = "";
    }

    if (snapshot.timer && typeof snapshot.timer.remainingMs === "number") {
      state.timerMs = snapshot.timer.remainingMs;
    } else if (snapshot.questionEndsAt) {
      state.timerMs = Math.max(0, snapshot.questionEndsAt - Date.now());
    }

    hydrateScoreFromLeaderboard();
    persistIdentity();
    render();
  }

  function onLobbyUpdate(payload) {
    if (!payload) return;
    state.players = Array.isArray(payload.players) ? payload.players : state.players;

    if (Array.isArray(payload.players)) {
      state.leaderboard = payload.players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        score: p.score || 0,
        connected: p.connected,
      }));
      if (state.playerId) {
        state.joined = payload.players.some((p) => p.id === state.playerId);
      }
    }

    if (!["running", "scoring", "finished"].includes(state.phase)) {
      state.phase = "lobby";
    }

    render();
  }

  function onQuestionStart(payload) {
    const source = payload?.question || payload;
    if (!source) return;

    state.phase = "running";
    state.question = normalizeQuestion(source);
    state.submittedQuestionId = "";
    state.selectedOptionId = "";
    els.textAnswer.value = "";

    state.timerMs = typeof payload?.durationMs === "number"
      ? payload.durationMs
      : typeof source?.durationMs === "number"
        ? source.durationMs
        : state.timerMs;

    setAnswerState("", "warn");
    render();
  }

  function normalizeQuestion(source) {
    return {
      id: source.id || source.questionId || "",
      type: source.type || source.inputType || "mcq",
      prompt: source.prompt || source.text || "Question",
      options: Array.isArray(source.options) ? source.options : [],
    };
  }

  function hydrateScoreFromLeaderboard() {
    const me = (state.leaderboard || []).find((entry) => entry.id === state.playerId || entry.playerId === state.playerId);
    if (me) {
      state.score = Number(me.score ?? me.totalScore ?? state.score ?? 0);
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
    els.joinPanel.classList.toggle("hidden", state.joined);
    els.statusPanel.classList.toggle("hidden", !state.joined);
    els.leaderboardPanel.classList.toggle("hidden", true);
  }

  function renderStatus() {
    const labels = {
      idle: "Waiting",
      lobby: "Lobby",
      running: "Answer now",
      scoring: "Scoring",
      finished: "Finished",
    };

    els.gamePhase.textContent = labels[state.phase] || "Live";
    els.scoreValue.textContent = String(state.score || 0);
    els.roomBadge.textContent = state.roomCode ? `Room: ${state.roomCode}` : "Room: not set";
    els.joinHint.textContent = state.roomCode
      ? `Connected room ${state.roomCode}.`
      : "Use ?room=ABC123 or enter room code below.";
    els.playerHint.textContent = state.playerId ? `Player id: ${state.playerId}` : "";
  }

  function renderQuestion() {
    if (!state.question || state.gameEnded) {
      els.questionPrompt.textContent = state.gameEnded ? "The game is finished." : "Waiting for the next question.";
      els.questionHint.textContent = state.gameEnded ? "See final standings below." : "Host has not started yet.";
      els.optionsContainer.classList.add("hidden");
      els.textAnswerContainer.classList.add("hidden");
      els.questionTypePill.classList.add("hidden");
      els.clearAnswerButton.classList.add("hidden");
      els.submitAnswerButton.disabled = true;
      return;
    }

    els.questionPrompt.textContent = state.question.prompt;
    els.questionHint.textContent = canSubmit() ? "Submit before timer ends." : "Submission locked.";
    els.questionTypePill.textContent = state.question.type === "text" ? "text" : "multiple choice";
    els.questionTypePill.classList.remove("hidden");

    const submitted = state.submittedQuestionId === state.question.id;
    els.submitAnswerButton.disabled = !canSubmit();
    els.submitAnswerButton.textContent = submitted ? "Submitted" : "Submit answer";

    if (state.question.type === "text") {
      els.optionsContainer.classList.add("hidden");
      els.textAnswerContainer.classList.remove("hidden");
      els.clearAnswerButton.classList.remove("hidden");
      els.textAnswer.disabled = !canSubmit();
    } else {
      els.textAnswerContainer.classList.add("hidden");
      els.clearAnswerButton.classList.add("hidden");
      els.optionsContainer.classList.remove("hidden");
      renderOptions();
    }
  }

  function renderOptions() {
    const options = state.question?.options || [];
    if (!options.length) {
      els.optionsContainer.innerHTML = '<p class="small">No options yet.</p>';
      return;
    }

    els.optionsContainer.innerHTML = options
      .map((option, index) => {
        const optionId = option.id || option.optionId || String(index);
        const selected = state.selectedOptionId === optionId ? " selected" : "";
        const locked = canSubmit() ? "" : " locked";
        const label = escapeHtml(option.label || option.text || `Option ${index + 1}`);
        return `<button type="button" class="option${selected}${locked}" data-option-id="${optionId}">${label}</button>`;
      })
      .join("");
  }

  function renderTimer() {
    if (typeof state.timerMs !== "number") {
      els.timerValue.textContent = "--:--";
      return;
    }

    const seconds = Math.max(0, Math.floor(state.timerMs / 1000));
    const minutesPart = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secondsPart = String(seconds % 60).padStart(2, "0");
    els.timerValue.textContent = `${minutesPart}:${secondsPart}`;
  }

  function renderLeaderboard() {
    if (!state.leaderboard.length) {
      els.leaderboard.innerHTML = '<p class="small">No leaderboard data yet.</p>';
      return;
    }

    els.leaderboard.innerHTML = state.leaderboard
      .map((player, index) => {
        const score = Number(player.score ?? player.totalScore ?? 0);
        const name = escapeHtml(player.displayName || `Player ${index + 1}`);
        const status = player.connected === false ? "offline" : "live";
        return `
          <div class="leader-row">
            <div><strong>${name}</strong><span>${status}</span></div>
            <div>${score}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderSummary() {
    if (!state.gameEnded) {
      els.summaryPanel.classList.add("hidden");
      return;
    }

    els.summaryPanel.classList.remove("hidden");
    els.finalLeaderboard.innerHTML = els.leaderboard.innerHTML;
  }

  function showSummary(title) {
    els.summaryText.textContent = title || "Game finished";
    els.summaryHint.textContent = "Thanks for playing.";
  }

  function setConnection(text, kind) {
    els.connectionPill.className = `pill ${kind || ""}`;
    els.connectionPill.innerHTML = `<span class="badge-dot"></span>${escapeHtml(text)}`;
  }

  function setMessage(text, kind) {
    els.joinMessage.textContent = text || "";
    els.joinMessage.className = `hint ${kind || ""}`;
  }

  function setAnswerState(text, kind) {
    if (!text) {
      els.answerState.classList.add("hidden");
      els.answerState.textContent = "";
      return;
    }
    els.answerState.className = `pill ${kind || "warn"}`;
    els.answerState.textContent = text;
    els.answerState.classList.remove("hidden");
  }

  function emitWithAck(eventName, payload) {
    return new Promise((resolve, reject) => {
      if (!state.socket || !state.socket.connected) {
        reject(new Error("Socket not connected."));
        return;
      }

      state.socket.timeout(8000).emit(eventName, payload, (err, response) => {
        if (err) {
          reject(new Error("Request timed out."));
          return;
        }
        if (response && response.ok === false) {
          reject(new Error(response.message || response.error || "Request rejected."));
          return;
        }
        resolve(response || {});
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
        state.timerMs = Math.max(0, state.timerMs - 1000);
        renderTimer();
      }
    }, 1000);
  }

  function normalizeRoom(value) {
    return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
  }

  function normalizeName(value) {
    return String(value || "").trim().slice(0, 24);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
