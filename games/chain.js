(function () {
  const statusLabel = document.getElementById("status-label");
  const turnBanner = document.getElementById("turn-banner");
  const timerDisplay = document.getElementById("timer-display");
  const requirementLabel = document.getElementById("requirement-label");
  const wordInput = document.getElementById("word-input");
  const feedback = document.getElementById("feedback");
  const submitBtn = document.getElementById("submit-word");
  const chainLog = document.getElementById("chain-log");
  const winnerLine = document.getElementById("winner-line");
  const resultSubtitle = document.getElementById("result-subtitle");
  const chainLength = document.getElementById("chain-length");
  const rematchBtn = document.getElementById("rematch-btn");

  const p1Name = document.getElementById("p1-name");
  const playersList = document.getElementById("players-list");
  const addPlayerBtn = document.getElementById("add-player");
  const localPlayersField = document.getElementById("local-players-field");
  const categorySelect = document.getElementById("category");
  const turnTimeSelect = document.getElementById("turn-time");

  let renderedLogLength = -1;
  let lastTurnKey = "";

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    if (active && !p1Name.value) p1Name.value = active.name;
  });

  function renderExtraPlayers(count) {
    const existing = [...playersList.querySelectorAll("[data-player-input]")].map((i) => i.value);
    playersList.dataset.count = count;
    playersList.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const row = document.createElement("div");
      row.className = "field";
      row.innerHTML = `<input type="text" placeholder="Player ${i + 2}" data-player-input value="${escapeHtml(existing[i] || "")}" />`;
      playersList.appendChild(row);
    }
  }
  renderExtraPlayers(1);

  addPlayerBtn.addEventListener("click", () => {
    const count = parseInt(playersList.dataset.count, 10) + 1;
    if (count > 5) return;
    renderExtraPlayers(count);
  });

  function localNames() {
    const extras = [...playersList.querySelectorAll("[data-player-input]")]
      .map((el, i) => el.value.trim() || `Player ${i + 2}`);
    return [p1Name.value.trim() || "Player 1", ...extras];
  }

  function render(state, view) {
    const myTurn = !view.isOnline || state.turn === view.mySlot;

    statusLabel.textContent = state.category === "mixed"
      ? "Category: anything goes"
      : `Category: ${CATEGORY_LABELS[state.category] || state.category}`;

    const alive = state.names.filter((_, i) => state.alive[i]).length;
    turnBanner.textContent = state.over
      ? ""
      : view.isOnline
      ? myTurn ? "Your turn!" : `${state.names[state.turn]} is thinking…`
      : `${state.names[state.turn]}'s turn` + (state.names.length > 2 ? ` · ${alive} still in` : "");
    turnBanner.className = "turn-banner" + (myTurn ? " mine" : "");

    timerDisplay.textContent = formatSeconds(state.secondsLeft);
    setTimerClass(timerDisplay, state.secondsLeft, state.turnTime);
    if (state.secondsLeft === 5 && myTurn && !state.over) BabeNotify.playSound("tick");

    if (state.lastWord) {
      const letter = state.lastWord[state.lastWord.length - 1].toUpperCase();
      requirementLabel.innerHTML = `Must start with <strong style="color:var(--accent-2)">${letter}</strong>`;
    } else {
      requirementLabel.textContent = "First word — name anything!";
    }

    const canType = myTurn && !state.over;
    wordInput.disabled = !canType;
    submitBtn.disabled = !canType;
    wordInput.placeholder = canType ? "Type your word..." : "Wait for your turn…";

    const turnKey = `${state.rev}:${state.turn}`;
    if (turnKey !== lastTurnKey) {
      lastTurnKey = turnKey;
      if (canType) {
        wordInput.value = "";
        wordInput.focus();
        if (view.isOnline) {
          BabeNotify.notify("Your turn!", requirementLabel.textContent, { sound: "turn", basePath: "../" });
        } else {
          BabeNotify.playSound("turn");
        }
      }
    }

    if (state.rejected && myTurn) {
      feedback.textContent = state.rejected.reason;
      feedback.className = "feedback bad";
    } else if (state.message) {
      feedback.textContent = state.message;
      feedback.className = "feedback bad";
    } else {
      feedback.textContent = "";
      feedback.className = "feedback";
    }

    if (state.log.length !== renderedLogLength) {
      renderedLogLength = state.log.length;
      chainLog.innerHTML = "";
      state.log.forEach((entry) => {
        const li = document.createElement("li");
        const mark = entry.kind === "out" ? "❌ " : "";
        li.innerHTML = `<span class="who">${escapeHtml(entry.who)}:</span>${mark}${escapeHtml(entry.text)}`;
        chainLog.appendChild(li);
      });
      chainLog.scrollTop = chainLog.scrollHeight;
      const last = state.log[state.log.length - 1];
      if (last && last.kind === "out") BabeNotify.playSound("fail");
    }
  }

  function submitWord() {
    const text = wordInput.value.trim();
    if (!text) return;
    const state = game.state;
    if (!state) return;
    game.dispatch({ type: "word", text }, game.view.isOnline ? undefined : state.turn);
    wordInput.value = "";
  }

  const game = BabeGame.create({
    rules: ChainRules,
    render,
    onMatchStart(view) {
      renderedLogLength = -1;
      lastTurnKey = "";
      chainLog.innerHTML = "";
      BabeGameUI.showScreen("play-screen");
      BabeGameUI.setBar(
        view.isOnline ? `Playing <strong>${escapeHtml(view.peerName || "your partner")}</strong>` : "",
        "ok"
      );
    },
    onOver(state, view) {
      const words = state.log.filter((l) => l.kind === "word").length;
      const result = state.winner < 0
        ? { outcome: "tie", title: "Nobody left standing!", subtitle: "" }
        : BabeCelebrate.describe({
            isOnline: view.isOnline,
            mySlot: view.mySlot,
            winner: state.winner,
            names: state.names,
          });
      BabeCelebrate.show({
        ...result,
        subtitle: `The chain survived ${words} word${words === 1 ? "" : "s"}. ${result.subtitle || ""}`.trim(),
        titleEl: winnerLine,
        subtitleEl: resultSubtitle,
      });
      chainLength.textContent = "";
      BabeNotify.notify("Game over!", result.title, { sound: "win", basePath: "../" });
      pushHighScore("chain", { players: state.names.join(", "), score: words });
      rematchBtn.style.display = view.isOnline && !view.isHost ? "none" : "inline-block";
      BabeGameUI.showScreen("end-screen");
      if (view.isOnline) {
        BabeGameUI.setBar(
          view.isHost ? "Tap Play Again to start another round." : "Waiting for the host to start another round…",
          "ok"
        );
      }
    },
    onConnected() {
      localPlayersField.style.display = "none";
      ui.handleConnected();
    },
    onPeerReady() { ui.handlePeerReady(); },
    onPeerLost(view) {
      ui.handlePeerLost();
      if (!view.isHost) {
        BabeGameUI.showScreen("setup-screen");
        localPlayersField.style.display = "block";
      }
    },
  });

  function config() {
    return {
      category: categorySelect.value,
      turnTime: parseInt(turnTimeSelect.value, 10),
    };
  }

  const ui = BabeGameUI.bind({
    game,
    getConfig: config,
    getLocalNames: localNames,
    onStarted() {
      renderedLogLength = -1;
      lastTurnKey = "";
      chainLog.innerHTML = "";
    },
  });

  submitBtn.addEventListener("click", submitWord);
  wordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitWord();
  });

  rematchBtn.addEventListener("click", () => {
    renderedLogLength = -1;
    lastTurnKey = "";
    chainLog.innerHTML = "";
    if (game.mode === "online") game.hostStart(config());
    else game.startLocal({ ...config(), names: localNames() });
    BabeGameUI.showScreen("play-screen");
  });
})();
