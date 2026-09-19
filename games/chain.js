(function () {
  const setupScreen = document.getElementById("setup-screen");
  const gameScreen = document.getElementById("game-screen");
  const endScreen = document.getElementById("end-screen");

  const playersList = document.getElementById("players-list");
  const addPlayerBtn = document.getElementById("add-player");
  const categorySelect = document.getElementById("category");
  const timeSelect = document.getElementById("time");
  const startBtn = document.getElementById("start-btn");

  const statusLabel = document.getElementById("status-label");
  const turnLabel = document.getElementById("turn-label");
  const timerDisplay = document.getElementById("timer-display");
  const requirementLabel = document.getElementById("requirement-label");
  const wordInput = document.getElementById("word-input");
  const feedback = document.getElementById("feedback");
  const submitBtn = document.getElementById("submit-word");
  const chainLog = document.getElementById("chain-log");

  const winnerLine = document.getElementById("winner-line");
  const chainLength = document.getElementById("chain-length");
  const playAgainBtn = document.getElementById("play-again");

  let state = null;

  function renderPlayersListPreserving(count) {
    const existing = [...playersList.querySelectorAll("[data-player-input]")].map((i) => i.value);
    playersList.dataset.count = count;
    playersList.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const row = document.createElement("div");
      row.className = "field";
      row.innerHTML = `<input type="text" placeholder="Player ${i + 1}" data-player-input value="${existing[i] || ""}" />`;
      playersList.appendChild(row);
    }
  }
  renderPlayersListPreserving(2);

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    const first = playersList.querySelector("[data-player-input]");
    if (active && first && !first.value) first.value = active.name;
  });

  addPlayerBtn.addEventListener("click", () => {
    const count = parseInt(playersList.dataset.count, 10) + 1;
    if (count > 6) return;
    renderPlayersListPreserving(count);
  });

  function startGame() {
    const names = [...playersList.querySelectorAll("[data-player-input]")]
      .map((el, i) => el.value.trim() || `Player ${i + 1}`);
    state = {
      players: names,
      active: names.map(() => true),
      category: categorySelect.value,
      timePerTurn: parseInt(timeSelect.value, 10),
      turnIndex: 0,
      usedWords: new Set(),
      lastWord: null,
      log: [],
      timer: null,
    };
    setupScreen.style.display = "none";
    gameScreen.style.display = "block";
    endScreen.style.display = "none";
    chainLog.innerHTML = "";
    startTurn();
  }

  function nextActiveIndex(from) {
    const n = state.players.length;
    for (let step = 0; step < n; step++) {
      const idx = (from + step) % n;
      if (state.active[idx]) return idx;
    }
    return -1;
  }

  function activeCount() {
    return state.active.filter(Boolean).length;
  }

  function startTurn() {
    if (activeCount() <= 1) return endGame();

    const idx = nextActiveIndex(state.turnIndex);
    state.turnIndex = idx;

    const playerName = state.players[idx];
    statusLabel.textContent = state.category === "mixed"
      ? "Category: anything goes"
      : `Category: ${CATEGORY_LABELS[state.category]}`;
    turnLabel.textContent = `${playerName}'s turn`;

    if (state.lastWord) {
      const lastLetter = state.lastWord[state.lastWord.length - 1].toUpperCase();
      requirementLabel.innerHTML = `Must start with <strong>${lastLetter}</strong>`;
    } else {
      requirementLabel.textContent = "You're first — name anything!";
    }

    wordInput.value = "";
    wordInput.disabled = false;
    submitBtn.disabled = false;
    feedback.textContent = "";
    feedback.className = "feedback";
    BabeNotify.notify(`${playerName}'s turn!`, requirementLabel.textContent, { sound: "turn", basePath: "../" });

    state.timer = new CountdownTimer(
      state.timePerTurn,
      (secondsLeft) => {
        timerDisplay.textContent = formatSeconds(secondsLeft);
        setTimerClass(timerDisplay, secondsLeft, state.timePerTurn);
        if (secondsLeft === 5) BabeNotify.playSound("tick");
      },
      () => eliminate(idx, "ran out of time")
    );
    state.timer.start();
    wordInput.focus();
  }

  function addLogEntry(who, text) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="who">${who}:</span>${text}`;
    chainLog.appendChild(li);
    chainLog.scrollTop = chainLog.scrollHeight;
  }

  function eliminate(idx, reason) {
    if (state.timer) state.timer.stop();
    state.active[idx] = false;
    addLogEntry(state.players[idx], `❌ eliminated — ${reason}`);
    BabeNotify.playSound("fail");
    state.turnIndex = idx + 1;
    startTurn();
  }

  function submitWord() {
    if (!state.timer) return;
    const raw = wordInput.value.trim();
    if (!raw) return;
    const word = raw.toLowerCase();
    const idx = state.turnIndex;

    if (state.usedWords.has(word)) {
      feedback.textContent = "Already used! Try another word.";
      feedback.className = "feedback bad";
      return;
    }
    if (state.lastWord) {
      const requiredLetter = state.lastWord[state.lastWord.length - 1];
      if (word[0] !== requiredLetter) {
        feedback.textContent = `Must start with "${requiredLetter.toUpperCase()}"`;
        feedback.className = "feedback bad";
        return;
      }
    }

    state.timer.stop();
    state.usedWords.add(word);
    state.lastWord = word;
    state.log.push({ who: state.players[idx], word });
    addLogEntry(state.players[idx], raw);

    state.turnIndex = idx + 1;
    startTurn();
  }

  function endGame() {
    gameScreen.style.display = "none";
    endScreen.style.display = "block";
    const winnerIdx = state.active.findIndex(Boolean);
    winnerLine.textContent = winnerIdx >= 0
      ? `${state.players[winnerIdx]} wins! \u{1F3C6}`
      : "Game over!";
    chainLength.textContent = `Chain survived ${state.log.length} word${state.log.length === 1 ? "" : "s"}.`;
    BabeNotify.notify("Game over!", winnerLine.textContent, { sound: "win", basePath: "../" });

    pushHighScore("chain", {
      players: state.players.join(", "),
      score: state.log.length,
    });
  }

  submitBtn.addEventListener("click", submitWord);
  wordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitWord();
  });
  startBtn.addEventListener("click", startGame);
  playAgainBtn.addEventListener("click", () => {
    endScreen.style.display = "none";
    setupScreen.style.display = "block";
  });
})();
