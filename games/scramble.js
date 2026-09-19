(function () {
  const setupScreen = document.getElementById("setup-screen");
  const gameScreen = document.getElementById("game-screen");
  const endScreen = document.getElementById("end-screen");

  const p1NameInput = document.getElementById("p1-name");
  const p2NameInput = document.getElementById("p2-name");
  const categorySelect = document.getElementById("category");
  const roundsSelect = document.getElementById("rounds");
  const timeSelect = document.getElementById("time");
  const startBtn = document.getElementById("start-btn");
  const playOnlineBtn = document.getElementById("play-online-btn");
  const onlineModeNote = document.getElementById("online-mode-note");

  const onlineBadge = document.getElementById("online-badge");
  const scoreP1 = document.getElementById("score-p1");
  const scoreP2 = document.getElementById("score-p2");
  const roundLabel = document.getElementById("round-label");
  const turnLabel = document.getElementById("turn-label");
  const timerDisplay = document.getElementById("timer-display");
  const scrambleDisplay = document.getElementById("scramble-display");
  const guessInput = document.getElementById("guess-input");
  const feedback = document.getElementById("feedback");
  const submitBtn = document.getElementById("submit-guess");
  const nextBtn = document.getElementById("next-round");

  const winnerLine = document.getElementById("winner-line");
  const finalP1 = document.getElementById("final-p1");
  const finalP2 = document.getElementById("final-p2");
  const playAgainBtn = document.getElementById("play-again");

  let state = null;

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    if (active && !p1NameInput.value) p1NameInput.value = active.name;
  });

  // ---- word pool helpers ----

  function allWords(category) {
    if (category !== "mixed") return WORD_BANKS[category].map((w) => ({ word: w, category }));
    return Object.entries(WORD_BANKS).flatMap(([cat, words]) =>
      words.map((w) => ({ word: w, category: cat }))
    );
  }

  function buildRounds(category, roundsPerPlayer) {
    const pool = shuffleArray(allWords(category));
    const totalRounds = roundsPerPlayer * 2;
    const rounds = [];
    for (let i = 0; i < totalRounds; i++) {
      rounds.push(pool[i % pool.length]);
    }
    return rounds;
  }

  // ---- local (same-device) game ----

  function startGame() {
    const p1 = p1NameInput.value.trim() || "Player 1";
    const p2 = p2NameInput.value.trim() || "Player 2";
    const category = categorySelect.value;
    const roundsPerPlayer = parseInt(roundsSelect.value, 10);
    const timePerRound = parseInt(timeSelect.value, 10);

    state = {
      online: false,
      p1, p2,
      timePerRound,
      rounds: buildRounds(category, roundsPerPlayer),
      roundIndex: 0,
      scores: { p1: 0, p2: 0 },
      timer: null,
    };

    scoreP1.querySelector(".name").textContent = p1;
    scoreP2.querySelector(".name").textContent = p2;
    onlineBadge.style.display = "none";

    setupScreen.style.display = "none";
    gameScreen.style.display = "block";
    endScreen.style.display = "none";

    playRound();
  }

  function currentSetterGuesser() {
    // even round index: p1 sets, p2 guesses. odd: swapped.
    const p1Sets = state.roundIndex % 2 === 0;
    return {
      setterKey: p1Sets ? "p1" : "p2",
      guesserKey: p1Sets ? "p2" : "p1",
      setterName: p1Sets ? state.p1 : state.p2,
      guesserName: p1Sets ? state.p2 : state.p1,
    };
  }

  function updateScoreboard() {
    scoreP1.querySelector(".val").textContent = state.scores.p1;
    scoreP2.querySelector(".val").textContent = state.scores.p2;
  }

  function updateActiveBox() {
    const { setterKey } = currentSetterGuesser();
    scoreP1.classList.toggle("active", setterKey !== "p1");
    scoreP2.classList.toggle("active", setterKey !== "p2");
  }

  function playRound() {
    if (state.roundIndex >= state.rounds.length) {
      return endGame();
    }
    const { word, category } = state.rounds[state.roundIndex];
    const { guesserName, setterName } = currentSetterGuesser();

    state.currentWord = word;
    state.scrambled = scrambleWord(word);

    roundLabel.textContent = `Round ${state.roundIndex + 1} of ${state.rounds.length} · ${CATEGORY_LABELS[category]}`;
    turnLabel.innerHTML = `<strong>${guesserName}</strong>, unscramble it! (${setterName} sit tight)`;
    scrambleDisplay.textContent = state.scrambled.toUpperCase();
    guessInput.value = "";
    guessInput.disabled = false;
    submitBtn.disabled = false;
    feedback.textContent = "";
    feedback.className = "feedback";
    nextBtn.style.display = "none";
    submitBtn.style.display = "inline-block";

    updateActiveBox();
    BabeNotify.notify(`${guesserName}'s turn!`, "Unscramble the word before time runs out.", { sound: "turn", basePath: "../" });

    state.timer = new CountdownTimer(
      state.timePerRound,
      (secondsLeft) => {
        timerDisplay.textContent = formatSeconds(secondsLeft);
        setTimerClass(timerDisplay, secondsLeft, state.timePerRound);
        if (secondsLeft === 5) BabeNotify.playSound("tick");
      },
      () => onTimeUp()
    );
    state.timer.start();
    guessInput.focus();
  }

  function onTimeUp() {
    guessInput.disabled = true;
    submitBtn.disabled = true;
    feedback.textContent = `Time's up! The word was "${state.currentWord.toUpperCase()}".`;
    feedback.className = "feedback bad";
    submitBtn.style.display = "none";
    nextBtn.style.display = "inline-block";
    BabeNotify.playSound("fail");
  }

  function submitGuess() {
    if (state.online) return submitGuessOnline();
    if (!state.timer) return;
    const guess = guessInput.value.trim().toLowerCase();
    if (!guess) return;
    if (guess === state.currentWord.toLowerCase()) {
      state.timer.stop();
      const secondsLeft = state.timer.secondsLeft;
      const points = 10 + secondsLeft * 2;
      const { guesserKey } = currentSetterGuesser();
      state.scores[guesserKey] += points;
      updateScoreboard();
      feedback.textContent = `Correct! +${points} points`;
      feedback.className = "feedback ok";
      guessInput.disabled = true;
      submitBtn.style.display = "none";
      nextBtn.style.display = "inline-block";
      BabeNotify.playSound("success");
    } else {
      feedback.textContent = "Not quite, try again!";
      feedback.className = "feedback bad";
    }
  }

  function endGame() {
    gameScreen.style.display = "none";
    endScreen.style.display = "block";

    finalP1.querySelector(".name").textContent = state.p1;
    finalP1.querySelector(".val").textContent = state.scores.p1;
    finalP2.querySelector(".name").textContent = state.p2;
    finalP2.querySelector(".val").textContent = state.scores.p2;

    let line;
    if (state.scores.p1 === state.scores.p2) line = "It's a tie!";
    else if (state.scores.p1 > state.scores.p2) line = `${state.p1} wins! \u{1F3C6}`;
    else line = `${state.p2} wins! \u{1F3C6}`;
    winnerLine.textContent = line;
    BabeNotify.notify("Game over!", line, { sound: "win", basePath: "../" });

    pushHighScore("scramble", {
      players: `${state.p1} vs ${state.p2}`,
      score: Math.max(state.scores.p1, state.scores.p2),
    });

    if (state.online) BabeOnline.disconnect();
  }

  startBtn.addEventListener("click", startGame);
  submitBtn.addEventListener("click", submitGuess);
  guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
  nextBtn.addEventListener("click", () => {
    if (state.online) return nextRoundOnline();
    state.roundIndex += 1;
    playRound();
  });
  playAgainBtn.addEventListener("click", () => {
    setupScreen.style.display = "block";
    gameScreen.style.display = "none";
    endScreen.style.display = "none";
  });

  // ---- online (two devices, via BabeOnline / PeerJS) ----
  // p1 is always the room host, p2 is always the joiner. Setter/guesser still
  // alternate by round the same as local play.

  function myName() {
    const active = BabeProfiles.getActive();
    return (active && active.name) || (BabeOnline.isHost ? p1NameInput.value.trim() : "") || "Player";
  }

  playOnlineBtn.addEventListener("click", () => {
    BabeOnlineUI.openLobby({
      onConnected: () => {
        BabeOnlineUI.close();
        beginOnlineSession();
      },
      onDisconnected: () => {
        if (state && state.online) {
          feedback.textContent = "Your partner disconnected.";
          feedback.className = "feedback bad";
        }
      },
    });
  });

  function beginOnlineSession() {
    const role = BabeOnline.isHost ? "host" : "guest";
    state = {
      online: true,
      role,
      myKey: role === "host" ? "p1" : "p2",
      peerKey: role === "host" ? "p2" : "p1",
      scores: { p1: 0, p2: 0 },
      timer: null,
      peerReady: false,
    };

    BabeOnline.onData(handleOnlineMessage);
    BabeOnline.send({ type: "hello", name: myName() });

    setupScreen.style.display = "none";
    gameScreen.style.display = "block";
    endScreen.style.display = "none";
    onlineBadge.style.display = "block";
    onlineBadge.textContent = role === "host"
      ? "\u{1F310} Online · room " + BabeOnline.roomCode + " · waiting to start"
      : "\u{1F310} Online · connected, waiting for host to start";

    roundLabel.textContent = "";
    turnLabel.textContent = role === "host"
      ? "Set up the game below, then tap Start."
      : "Sit tight — your partner is setting up the game.";
    scrambleDisplay.textContent = "";
    timerDisplay.textContent = "00:00";
    guessInput.disabled = true;
    submitBtn.style.display = "none";
    nextBtn.style.display = "none";

    if (role === "host") {
      const startOnlineBtn = document.createElement("button");
      startOnlineBtn.className = "btn";
      startOnlineBtn.id = "start-online-round-btn";
      startOnlineBtn.textContent = "Start Game";
      startOnlineBtn.addEventListener("click", () => {
        startOnlineBtn.remove();
        hostStartGame();
      });
      turnLabel.after(startOnlineBtn);
    }
  }

  function handleOnlineMessage(msg) {
    if (!state || !state.online) return;
    switch (msg.type) {
      case "hello": {
        state.peerName = msg.name;
        state.peerReady = true;
        const p1Name = state.role === "host" ? myName() : state.peerName;
        const p2Name = state.role === "host" ? state.peerName : myName();
        scoreP1.querySelector(".name").textContent = p1Name;
        scoreP2.querySelector(".name").textContent = p2Name;
        state.p1 = p1Name;
        state.p2 = p2Name;
        break;
      }
      case "round":
        applyIncomingRound(msg);
        break;
      case "tick":
        timerDisplay.textContent = formatSeconds(msg.secondsLeft);
        setTimerClass(timerDisplay, msg.secondsLeft, state.timePerRound);
        break;
      case "guess":
        if (state.role === "host") hostValidateGuess(msg.text);
        break;
      case "result":
        applyResult(msg);
        break;
      case "timeup":
        applyTimeUp(msg.correctWord);
        break;
      case "gameover":
        applyGameOver(msg);
        break;
    }
  }

  function hostStartGame() {
    const category = categorySelect.value;
    const roundsPerPlayer = parseInt(roundsSelect.value, 10);
    const timePerRound = parseInt(timeSelect.value, 10);

    state.rounds = buildRounds(category, roundsPerPlayer);
    state.roundIndex = 0;
    state.timePerRound = timePerRound;
    state.categoryChoice = category;

    hostPlayRound();
  }

  function hostPlayRound() {
    if (state.roundIndex >= state.rounds.length) {
      const line = state.scores.p1 === state.scores.p2
        ? "It's a tie!"
        : state.scores.p1 > state.scores.p2
        ? `${state.p1} wins! \u{1F3C6}`
        : `${state.p2} wins! \u{1F3C6}`;
      BabeOnline.send({ type: "gameover", scores: state.scores, line });
      applyGameOver({ scores: state.scores, line });
      return;
    }
    const { word, category } = state.rounds[state.roundIndex];
    state.currentWord = word;
    state.scrambled = scrambleWord(word);

    const payload = {
      type: "round",
      roundIndex: state.roundIndex,
      totalRounds: state.rounds.length,
      category,
      scrambled: state.scrambled,
      timePerRound: state.timePerRound,
    };
    BabeOnline.send(payload);
    applyIncomingRound(payload);
  }

  function applyIncomingRound(msg) {
    state.roundIndex = msg.roundIndex;
    state.timePerRound = msg.timePerRound;

    const p1Sets = msg.roundIndex % 2 === 0;
    const setterKey = p1Sets ? "p1" : "p2";
    const guesserKey = p1Sets ? "p2" : "p1";
    const guesserName = guesserKey === "p1" ? state.p1 : state.p2;
    const amGuesser = guesserKey === state.myKey;

    roundLabel.textContent = `Round ${msg.roundIndex + 1} of ${msg.totalRounds} · ${CATEGORY_LABELS[msg.category]}`;
    turnLabel.innerHTML = amGuesser
      ? `<strong>Your turn!</strong> Unscramble it before time runs out.`
      : `<strong>${guesserName}</strong> is unscrambling — sit tight!`;
    scrambleDisplay.textContent = msg.scrambled.toUpperCase();
    guessInput.value = "";
    guessInput.disabled = !amGuesser;
    submitBtn.disabled = false;
    submitBtn.style.display = amGuesser ? "inline-block" : "none";
    feedback.textContent = amGuesser ? "" : "Waiting for your partner…";
    feedback.className = "feedback";
    nextBtn.style.display = "none";

    scoreP1.classList.toggle("active", setterKey !== "p1");
    scoreP2.classList.toggle("active", setterKey !== "p2");

    BabeNotify.notify(
      amGuesser ? "Your turn!" : `${guesserName}'s turn`,
      "Unscramble the word before time runs out.",
      { sound: "turn", basePath: "../" }
    );

    if (amGuesser) guessInput.focus();

    if (state.role === "host") {
      state.timer = new CountdownTimer(
        state.timePerRound,
        (secondsLeft) => {
          timerDisplay.textContent = formatSeconds(secondsLeft);
          setTimerClass(timerDisplay, secondsLeft, state.timePerRound);
          if (secondsLeft === 5) BabeNotify.playSound("tick");
          BabeOnline.send({ type: "tick", secondsLeft });
        },
        () => hostTimeUp()
      );
      state.timer.start();
    }
  }

  function submitGuessOnline() {
    const guess = guessInput.value.trim();
    if (!guess) return;
    guessInput.disabled = true;
    submitBtn.style.display = "none";
    if (state.role === "host") {
      hostValidateGuess(guess);
    } else {
      BabeOnline.send({ type: "guess", text: guess });
      feedback.textContent = "Sent! Waiting for result…";
      feedback.className = "feedback";
    }
  }

  function hostValidateGuess(text) {
    if (!state.timer) return;
    const correct = text.trim().toLowerCase() === state.currentWord.toLowerCase();
    if (!correct) {
      // let them keep trying locally; for a remote guesser we only get one
      // shot per message, so just report back "not correct" without ending
      // the round, so they can try again before the clock runs out.
      BabeOnline.send({ type: "result", correct: false });
      if (isRemoteGuesserTurn()) {
        // re-enable remote input by telling them it was wrong (handled in applyResult)
      } else {
        feedback.textContent = "Not quite, try again!";
        feedback.className = "feedback bad";
        guessInput.disabled = false;
        submitBtn.style.display = "inline-block";
      }
      return;
    }
    state.timer.stop();
    const secondsLeft = state.timer.secondsLeft;
    const points = 10 + secondsLeft * 2;
    const p1Sets = state.roundIndex % 2 === 0;
    const guesserKey = p1Sets ? "p2" : "p1";
    state.scores[guesserKey] += points;

    const result = { type: "result", correct: true, points, correctWord: state.currentWord, scores: state.scores };
    BabeOnline.send(result);
    applyResult(result);
  }

  function isRemoteGuesserTurn() {
    const p1Sets = state.roundIndex % 2 === 0;
    const guesserKey = p1Sets ? "p2" : "p1";
    return guesserKey === state.peerKey;
  }

  function applyResult(msg) {
    if (msg.correct) {
      state.scores = msg.scores;
      updateScoreboard();
      const amGuesser = !isRemoteGuesserTurn();
      feedback.textContent = amGuesser ? `Correct! +${msg.points} points` : `Correct! Your partner scored ${msg.points} points.`;
      feedback.className = "feedback ok";
      guessInput.disabled = true;
      submitBtn.style.display = "none";
      BabeNotify.playSound("success");
      if (state.role === "host") nextBtn.style.display = "inline-block";
      else nextBtn.style.display = "none";
    } else {
      const amGuesser = !isRemoteGuesserTurn();
      if (amGuesser) {
        feedback.textContent = "Not quite, try again!";
        feedback.className = "feedback bad";
        guessInput.disabled = false;
        submitBtn.style.display = "inline-block";
        guessInput.focus();
      }
    }
  }

  function hostTimeUp() {
    BabeOnline.send({ type: "timeup", correctWord: state.currentWord });
    applyTimeUp(state.currentWord);
  }

  function applyTimeUp(correctWord) {
    guessInput.disabled = true;
    submitBtn.style.display = "none";
    feedback.textContent = `Time's up! The word was "${correctWord.toUpperCase()}".`;
    feedback.className = "feedback bad";
    BabeNotify.playSound("fail");
    nextBtn.style.display = state.role === "host" ? "inline-block" : "none";
  }

  function nextRoundOnline() {
    state.roundIndex += 1;
    hostPlayRound();
  }

  function applyGameOver(msg) {
    gameScreen.style.display = "none";
    endScreen.style.display = "block";

    finalP1.querySelector(".name").textContent = state.p1;
    finalP1.querySelector(".val").textContent = msg.scores.p1;
    finalP2.querySelector(".name").textContent = state.p2;
    finalP2.querySelector(".val").textContent = msg.scores.p2;

    winnerLine.textContent = msg.line;
    BabeNotify.notify("Game over!", msg.line, { sound: "win", basePath: "../" });

    pushHighScore("scramble", {
      players: `${state.p1} vs ${state.p2} (online)`,
      score: Math.max(msg.scores.p1, msg.scores.p2),
    });

    BabeOnline.disconnect();
  }
})();
