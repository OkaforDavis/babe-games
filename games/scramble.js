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

  function startGame() {
    const p1 = p1NameInput.value.trim() || "Player 1";
    const p2 = p2NameInput.value.trim() || "Player 2";
    const category = categorySelect.value;
    const roundsPerPlayer = parseInt(roundsSelect.value, 10);
    const timePerRound = parseInt(timeSelect.value, 10);

    state = {
      p1, p2,
      timePerRound,
      rounds: buildRounds(category, roundsPerPlayer),
      roundIndex: 0,
      scores: { p1: 0, p2: 0 },
      timer: null,
    };

    scoreP1.querySelector(".name").textContent = p1;
    scoreP2.querySelector(".name").textContent = p2;

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

  function updateActiveBox() {
    const { setterKey } = currentSetterGuesser();
    scoreP1.classList.toggle("active", setterKey !== "p1");
    scoreP2.classList.toggle("active", setterKey !== "p2");
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
  }

  startBtn.addEventListener("click", startGame);
  submitBtn.addEventListener("click", submitGuess);
  guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
  nextBtn.addEventListener("click", () => {
    state.roundIndex += 1;
    playRound();
  });
  playAgainBtn.addEventListener("click", () => {
    setupScreen.style.display = "block";
    gameScreen.style.display = "none";
    endScreen.style.display = "none";
  });
})();
