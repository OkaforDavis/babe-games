(function () {
  const roundLabel = document.getElementById("round-label");
  const turnBanner = document.getElementById("turn-banner");
  const timerDisplay = document.getElementById("timer-display");
  const scrambleDisplay = document.getElementById("scramble-display");
  const guessField = document.getElementById("guess-field");
  const guessInput = document.getElementById("guess-input");
  const feedback = document.getElementById("feedback");
  const submitBtn = document.getElementById("submit-guess");
  const nextBtn = document.getElementById("next-round");
  const winnerLine = document.getElementById("winner-line");
  const resultSubtitle = document.getElementById("result-subtitle");
  const rematchBtn = document.getElementById("rematch-btn");

  const p1Name = document.getElementById("p1-name");
  const p2Name = document.getElementById("p2-name");
  const p2Field = document.getElementById("p2-field");
  const categorySelect = document.getElementById("category");
  const roundsSelect = document.getElementById("rounds");
  const timeSelect = document.getElementById("time");

  let lastRoundKey = "";

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    if (active && !p1Name.value) p1Name.value = active.name;
  });

  function buildDeck(category) {
    const pool = category === "mixed"
      ? Object.entries(WORD_BANKS).flatMap(([cat, words]) => words.map((w) => ({ word: w, category: cat })))
      : WORD_BANKS[category].map((w) => ({ word: w, category }));
    return shuffleArray(pool);
  }

  function render(state, view) {
    [0, 1].forEach((slot) => {
      const seat = document.getElementById(`seat-${slot}`);
      seat.querySelector(".seat-name").textContent = state.names[slot];
      seat.querySelector(".seat-score").textContent = state.scores[slot];
      seat.classList.toggle("you", view.isOnline && slot === view.mySlot);
    });

    const guesser = ScrambleRules.guesserOf(state);
    const amGuesser = view.isOnline ? guesser === view.mySlot : true;
    document.getElementById("seat-0").classList.toggle("active", guesser === 0 && state.phase === "playing");
    document.getElementById("seat-1").classList.toggle("active", guesser === 1 && state.phase === "playing");

    roundLabel.textContent = `Round ${state.roundIndex + 1} of ${state.totalRounds} · ${CATEGORY_LABELS[state.category] || state.category}`;
    scrambleDisplay.textContent = (state.scrambled || "").toUpperCase();

    timerDisplay.textContent = formatSeconds(state.secondsLeft);
    setTimerClass(timerDisplay, state.secondsLeft, state.timePerRound);
    timerDisplay.style.display = state.phase === "playing" ? "block" : "none";

    if (state.phase === "playing") {
      turnBanner.textContent = view.isOnline
        ? amGuesser ? "Your turn — unscramble it!" : `${state.names[guesser]} is unscrambling…`
        : `${state.names[guesser]}, unscramble it!`;
      turnBanner.className = "turn-banner" + (amGuesser ? " mine" : "");
      guessField.style.display = amGuesser ? "block" : "none";
      submitBtn.style.display = amGuesser ? "inline-block" : "none";
      nextBtn.style.display = "none";
      guessInput.disabled = false;
      submitBtn.disabled = false;
      if (state.secondsLeft === 5 && amGuesser) BabeNotify.playSound("tick");
    } else if (state.phase === "result") {
      turnBanner.textContent = "";
      guessField.style.display = "none";
      submitBtn.style.display = "none";
      nextBtn.style.display = "inline-block";
    }

    const roundKey = `${state.roundIndex}:${state.phase}`;
    if (roundKey !== lastRoundKey) {
      lastRoundKey = roundKey;
      if (state.phase === "playing") {
        guessInput.value = "";
        if (amGuesser) {
          guessInput.focus();
          if (view.isOnline) {
            BabeNotify.notify("Your turn!", "Unscramble the word before time runs out.", { sound: "turn", basePath: "../" });
          } else {
            BabeNotify.playSound("turn");
          }
        }
      } else if (state.phase === "result" && state.reveal) {
        BabeNotify.playSound(state.reveal.solved ? "success" : "fail");
      }
    }

    if (state.phase === "result" && state.reveal) {
      scrambleDisplay.textContent = String(state.reveal.word).toUpperCase();
      feedback.textContent = state.message;
      feedback.className = "feedback " + (state.reveal.solved ? "ok" : "bad");
    } else {
      feedback.textContent = state.message || "";
      feedback.className = "feedback" + (state.message ? " bad" : "");
    }
  }

  function submitGuess() {
    const text = guessInput.value.trim();
    if (!text) return;
    const state = game.state;
    if (!state) return;
    game.dispatch({ type: "guess", text }, game.view.isOnline ? undefined : ScrambleRules.guesserOf(state));
  }

  const game = BabeGame.create({
    rules: ScrambleRules,
    render,
    onMatchStart(view) {
      lastRoundKey = "";
      BabeGameUI.showScreen("play-screen");
      BabeGameUI.setBar(
        view.isOnline ? `Playing <strong>${escapeHtml(view.peerName || "your partner")}</strong>` : "",
        "ok"
      );
    },
    onOver(state, view) {
      [0, 1].forEach((slot) => {
        const seat = document.getElementById(`final-${slot}`);
        seat.querySelector(".seat-name").textContent = state.names[slot];
        seat.querySelector(".seat-score").textContent = state.scores[slot];
        seat.classList.toggle("you", view.isOnline && slot === view.mySlot);
      });
      const result = BabeCelebrate.describe({
        isOnline: view.isOnline,
        mySlot: view.mySlot,
        winner: state.winner,
        names: state.names,
        scores: state.scores,
        unit: "points",
      });
      BabeCelebrate.show({ ...result, titleEl: winnerLine, subtitleEl: resultSubtitle });
      BabeNotify.notify("Game over!", result.title, { sound: "win", basePath: "../" });
      pushHighScore("scramble", { players: state.names.join(" vs "), score: Math.max(...state.scores) });
      rematchBtn.style.display = view.isOnline && !view.isHost ? "none" : "inline-block";
      BabeGameUI.showScreen("end-screen");
      if (view.isOnline) {
        BabeGameUI.setBar(
          view.isHost ? "Tap Play Again to start another match." : "Waiting for the host to start another match…",
          "ok"
        );
      }
    },
    onConnected() {
      p2Field.style.display = "none";
      ui.handleConnected();
    },
    onPeerReady() { ui.handlePeerReady(); },
    onPeerLost(view) {
      ui.handlePeerLost();
      if (!view.isHost) {
        BabeGameUI.showScreen("setup-screen");
        p2Field.style.display = "block";
      }
    },
  });

  function config() {
    return {
      words: buildDeck(categorySelect.value),
      roundsPerPlayer: parseInt(roundsSelect.value, 10),
      timePerRound: parseInt(timeSelect.value, 10),
    };
  }

  const ui = BabeGameUI.bind({
    game,
    getConfig: config,
    getLocalNames: () => [p1Name.value.trim() || "Player 1", p2Name.value.trim() || "Player 2"],
    onStarted() { lastRoundKey = ""; },
  });

  submitBtn.addEventListener("click", submitGuess);
  guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
  nextBtn.addEventListener("click", () => {
    game.dispatch({ type: "next" }, game.view.isOnline ? undefined : 0);
  });

  rematchBtn.addEventListener("click", () => {
    lastRoundKey = "";
    if (game.mode === "online") game.hostStart(config());
    else game.startLocal({ ...config(), names: [p1Name.value.trim() || "Player 1", p2Name.value.trim() || "Player 2"] });
    BabeGameUI.showScreen("play-screen");
  });
})();
