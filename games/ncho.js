(function () {
  // Board indices: 0-5 = player1 pits, 6 = player1 store,
  // 7-12 = player2 pits, 13 = player2 store.
  const P1_PITS = [0, 1, 2, 3, 4, 5];
  const P2_PITS = [7, 8, 9, 10, 11, 12];
  const P1_STORE = 6;
  const P2_STORE = 13;

  const setupScreen = document.getElementById("setup-screen");
  const gameScreen = document.getElementById("game-screen");
  const endScreen = document.getElementById("end-screen");

  const p1NameInput = document.getElementById("p1-name");
  const p2NameInput = document.getElementById("p2-name");
  const seedsSelect = document.getElementById("seeds");
  const startBtn = document.getElementById("start-btn");

  const scoreP1 = document.getElementById("score-p1");
  const scoreP2 = document.getElementById("score-p2");
  const turnLabel = document.getElementById("turn-label");
  const feedback = document.getElementById("feedback");
  const rowP1 = document.getElementById("row-p1");
  const rowP2 = document.getElementById("row-p2");
  const storeP1 = document.getElementById("store-p1");
  const storeP2 = document.getElementById("store-p2");

  const winnerLine = document.getElementById("winner-line");
  const finalP1 = document.getElementById("final-p1");
  const finalP2 = document.getElementById("final-p2");
  const playAgainBtn = document.getElementById("play-again");

  let state = null;

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    if (active && !p1NameInput.value) p1NameInput.value = active.name;
  });

  function opposite(i) {
    return 12 - i;
  }

  function startGame() {
    const seeds = parseInt(seedsSelect.value, 10);
    const p1 = p1NameInput.value.trim() || "Player 1";
    const p2 = p2NameInput.value.trim() || "Player 2";

    const pits = new Array(14).fill(0);
    P1_PITS.forEach((i) => (pits[i] = seeds));
    P2_PITS.forEach((i) => (pits[i] = seeds));

    state = { pits, current: 1, p1, p2, gameOver: false };

    scoreP1.querySelector(".name").textContent = p1;
    scoreP2.querySelector(".name").textContent = p2;

    setupScreen.style.display = "none";
    gameScreen.style.display = "block";
    endScreen.style.display = "none";
    feedback.textContent = "";
    feedback.className = "feedback";

    buildPits();
    render();
  }

  function buildPits() {
    rowP1.innerHTML = "";
    rowP2.innerHTML = "";
    P1_PITS.forEach((i) => {
      const el = document.createElement("div");
      el.className = "ncho-pit";
      el.dataset.pit = i;
      el.addEventListener("click", () => onPitClick(i));
      rowP1.appendChild(el);
    });
    P2_PITS.forEach((i) => {
      const el = document.createElement("div");
      el.className = "ncho-pit";
      el.dataset.pit = i;
      el.addEventListener("click", () => onPitClick(i));
      rowP2.appendChild(el);
    });
  }

  function render() {
    for (let i = 0; i < 14; i++) {
      if (i === P1_STORE || i === P2_STORE) continue;
      const el = document.querySelector(`.ncho-pit[data-pit="${i}"]`);
      if (!el) continue;
      el.textContent = state.pits[i];
      const ownedByP1 = P1_PITS.includes(i);
      const isCurrentOwner = (ownedByP1 && state.current === 1) || (!ownedByP1 && state.current === 2);
      el.classList.toggle("empty", state.pits[i] === 0);
      el.classList.toggle("disabled", state.pits[i] === 0 || !isCurrentOwner || state.gameOver);
    }
    storeP1.textContent = state.pits[P1_STORE];
    storeP2.textContent = state.pits[P2_STORE];
    scoreP1.querySelector(".val").textContent = state.pits[P1_STORE];
    scoreP2.querySelector(".val").textContent = state.pits[P2_STORE];
    scoreP1.classList.toggle("active", state.current === 1);
    scoreP2.classList.toggle("active", state.current === 2);
    const name = state.current === 1 ? state.p1 : state.p2;
    turnLabel.innerHTML = state.gameOver ? "" : `<strong>${name}</strong>'s turn — pick one of your pits`;
  }

  function onPitClick(i) {
    if (state.gameOver) return;
    const ownedByP1 = P1_PITS.includes(i);
    const isOwner = (ownedByP1 && state.current === 1) || (!ownedByP1 && state.current === 2);
    if (!isOwner || state.pits[i] === 0) return;
    sow(i);
  }

  function sow(startPit) {
    const player = state.current;
    const ownStore = player === 1 ? P1_STORE : P2_STORE;
    const opponentStore = player === 1 ? P2_STORE : P1_STORE;
    const ownPits = player === 1 ? P1_PITS : P2_PITS;

    let seeds = state.pits[startPit];
    state.pits[startPit] = 0;
    let idx = startPit;

    while (seeds > 0) {
      idx = (idx + 1) % 14;
      if (idx === opponentStore) continue; // skip opponent's store
      state.pits[idx] += 1;
      seeds -= 1;
    }

    let message = "";
    if (idx === ownStore) {
      message = "Landed in your store — go again!";
      BabeNotify.playSound("success");
      // current player unchanged
    } else if (ownPits.includes(idx) && state.pits[idx] === 1) {
      const opp = opposite(idx);
      const captured = state.pits[opp] + state.pits[idx];
      if (state.pits[opp] > 0) {
        state.pits[ownStore] += captured;
        state.pits[idx] = 0;
        state.pits[opp] = 0;
        message = `Capture! +${captured} seeds to your store.`;
        BabeNotify.playSound("success");
      }
      switchTurn();
    } else {
      switchTurn();
    }

    feedback.textContent = message;
    feedback.className = message ? "feedback ok" : "feedback";

    render();
    checkGameEnd();
  }

  function switchTurn() {
    state.current = state.current === 1 ? 2 : 1;
    const name = state.current === 1 ? state.p1 : state.p2;
    BabeNotify.notify(`${name}'s turn!`, "Pick a pit to sow.", { sound: "turn", basePath: "../" });
  }

  function checkGameEnd() {
    const p1Empty = P1_PITS.every((i) => state.pits[i] === 0);
    const p2Empty = P2_PITS.every((i) => state.pits[i] === 0);
    if (!p1Empty && !p2Empty) return;

    if (!p1Empty) P1_PITS.forEach((i) => { state.pits[P1_STORE] += state.pits[i]; state.pits[i] = 0; });
    if (!p2Empty) P2_PITS.forEach((i) => { state.pits[P2_STORE] += state.pits[i]; state.pits[i] = 0; });

    state.gameOver = true;
    render();
    endGame();
  }

  function endGame() {
    gameScreen.style.display = "none";
    endScreen.style.display = "block";

    finalP1.querySelector(".name").textContent = state.p1;
    finalP1.querySelector(".val").textContent = state.pits[P1_STORE];
    finalP2.querySelector(".name").textContent = state.p2;
    finalP2.querySelector(".val").textContent = state.pits[P2_STORE];

    let line;
    if (state.pits[P1_STORE] === state.pits[P2_STORE]) line = "It's a tie!";
    else if (state.pits[P1_STORE] > state.pits[P2_STORE]) line = `${state.p1} wins! \u{1F3C6}`;
    else line = `${state.p2} wins! \u{1F3C6}`;
    winnerLine.textContent = line;
    BabeNotify.notify("Game over!", line, { sound: "win", basePath: "../" });

    pushHighScore("ncho", {
      players: `${state.p1} vs ${state.p2}`,
      score: Math.max(state.pits[P1_STORE], state.pits[P2_STORE]),
    });
  }

  startBtn.addEventListener("click", startGame);
  playAgainBtn.addEventListener("click", () => {
    setupScreen.style.display = "block";
    gameScreen.style.display = "none";
    endScreen.style.display = "none";
  });
})();
