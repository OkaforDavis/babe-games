(function () {
  const setupScreen = document.getElementById("setup-screen");
  const gameScreen = document.getElementById("game-screen");
  const endScreen = document.getElementById("end-screen");

  const p1NameInput = document.getElementById("p1-name");
  const p2NameInput = document.getElementById("p2-name");
  const gridSizeSelect = document.getElementById("grid-size");
  const turnTimeSelect = document.getElementById("turn-time");
  const startBtn = document.getElementById("start-btn");

  const scoreP1 = document.getElementById("score-p1");
  const scoreP2 = document.getElementById("score-p2");
  const turnLabel = document.getElementById("turn-label");
  const timerDisplay = document.getElementById("timer-display");
  const boardSvg = document.getElementById("board-svg");
  const feedback = document.getElementById("feedback");

  const winnerLine = document.getElementById("winner-line");
  const finalP1 = document.getElementById("final-p1");
  const finalP2 = document.getElementById("final-p2");
  const playAgainBtn = document.getElementById("play-again");

  const SPACING = 64;
  const PAD = 24;
  const PLAYER_COLOR = { 1: "var(--accent)", 2: "var(--accent-4)" };
  const NS = "http://www.w3.org/2000/svg";

  let state = null;

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    if (active && !p1NameInput.value) p1NameInput.value = active.name;
  });

  function startGame() {
    const n = parseInt(gridSizeSelect.value, 10);
    const turnTime = parseInt(turnTimeSelect.value, 10);
    const p1 = p1NameInput.value.trim() || "Player 1";
    const p2 = p2NameInput.value.trim() || "Player 2";

    state = {
      n,
      turnTime,
      p1, p2,
      current: 1,
      scores: { 1: 0, 2: 0 },
      hEdges: Array.from({ length: n + 1 }, () => Array(n).fill(false)),
      vEdges: Array.from({ length: n }, () => Array(n + 1).fill(false)),
      boxOwner: Array.from({ length: n }, () => Array(n).fill(null)),
      boxesClaimed: 0,
      timer: null,
    };

    scoreP1.querySelector(".name").textContent = p1;
    scoreP2.querySelector(".name").textContent = p2;
    updateScoreboard();

    setupScreen.style.display = "none";
    gameScreen.style.display = "block";
    endScreen.style.display = "none";
    feedback.textContent = "";
    feedback.className = "feedback";

    buildBoard();
    updateTurnUI();
    armTurnTimer();
  }

  function updateScoreboard() {
    scoreP1.querySelector(".val").textContent = state.scores[1];
    scoreP2.querySelector(".val").textContent = state.scores[2];
  }

  function updateTurnUI() {
    const name = state.current === 1 ? state.p1 : state.p2;
    turnLabel.innerHTML = `<strong style="color:${PLAYER_COLOR[state.current]}">${name}</strong>'s turn`;
    scoreP1.classList.toggle("active", state.current === 1);
    scoreP2.classList.toggle("active", state.current === 2);
  }

  function armTurnTimer() {
    if (state.timer) state.timer.stop();
    if (!state.turnTime) {
      timerDisplay.style.display = "none";
      return;
    }
    timerDisplay.style.display = "block";
    const name = state.current === 1 ? state.p1 : state.p2;
    BabeNotify.notify(`${name}'s turn!`, "Draw a line before time runs out.", { sound: "turn", basePath: "../" });
    state.timer = new CountdownTimer(
      state.turnTime,
      (secondsLeft) => {
        timerDisplay.textContent = formatSeconds(secondsLeft);
        setTimerClass(timerDisplay, secondsLeft, state.turnTime);
        if (secondsLeft === 5) BabeNotify.playSound("tick");
      },
      () => {
        feedback.textContent = `${name} ran out of time — turn passes.`;
        feedback.className = "feedback bad";
        BabeNotify.playSound("fail");
        switchTurn();
      }
    );
    state.timer.start();
  }

  function switchTurn() {
    state.current = state.current === 1 ? 2 : 1;
    updateTurnUI();
    armTurnTimer();
  }

  function buildBoard() {
    const n = state.n;
    const width = n * SPACING + PAD * 2;
    const height = n * SPACING + PAD * 2;
    boardSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    boardSvg.setAttribute("width", width);
    boardSvg.setAttribute("height", height);
    boardSvg.innerHTML = "";

    function pt(row, col) {
      return [PAD + col * SPACING, PAD + row * SPACING];
    }

    // horizontal edges
    for (let r = 0; r <= n; r++) {
      for (let c = 0; c < n; c++) {
        const [x1, y1] = pt(r, c);
        const [x2] = pt(r, c + 1);
        addEdgeLine(x1, y1, x2, y1, () => claimHEdge(r, c));
      }
    }
    // vertical edges
    for (let r = 0; r < n; r++) {
      for (let c = 0; c <= n; c++) {
        const [x1, y1] = pt(r, c);
        const [, y2] = pt(r + 1, c);
        addEdgeLine(x1, y1, x1, y2, () => claimVEdge(r, c));
      }
    }
    // box fills (drawn first would be under lines, but we append after so
    // insert them before edges by rebuilding order: boxes first, then edges,
    // then dots on top)
    const boxLayer = document.createElementNS(NS, "g");
    boxLayer.id = "box-layer";
    boardSvg.insertBefore(boxLayer, boardSvg.firstChild);

    // dots
    for (let r = 0; r <= n; r++) {
      for (let c = 0; c <= n; c++) {
        const [x, y] = pt(r, c);
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", y);
        dot.setAttribute("r", 4);
        dot.setAttribute("fill", "#f5f0ff");
        boardSvg.appendChild(dot);
      }
    }

    redrawBoxes();
  }

  function addEdgeLine(x1, y1, x2, y2, onClaim) {
    const hit = document.createElementNS(NS, "line");
    hit.setAttribute("x1", x1);
    hit.setAttribute("y1", y1);
    hit.setAttribute("x2", x2);
    hit.setAttribute("y2", y2);
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", 16);
    hit.style.cursor = "pointer";
    hit.dataset.claimed = "false";

    const visible = document.createElementNS(NS, "line");
    visible.setAttribute("x1", x1);
    visible.setAttribute("y1", y1);
    visible.setAttribute("x2", x2);
    visible.setAttribute("y2", y2);
    visible.setAttribute("stroke", "#3a2650");
    visible.setAttribute("stroke-width", 4);
    visible.setAttribute("stroke-linecap", "round");

    hit.addEventListener("click", () => {
      if (hit.dataset.claimed === "true") return;
      const completed = onClaim();
      hit.dataset.claimed = "true";
      visible.setAttribute("stroke", PLAYER_COLOR[state.current]);
      redrawBoxes();
      if (checkGameEnd()) return;
      if (!completed) switchTurn();
      else armTurnTimer();
    });

    boardSvg.appendChild(visible);
    boardSvg.appendChild(hit);
  }

  function claimHEdge(r, c) {
    state.hEdges[r][c] = true;
    let completedAny = false;
    if (r > 0 && tryClaimBox(r - 1, c)) completedAny = true;
    if (r < state.n && tryClaimBox(r, c)) completedAny = true;
    return completedAny;
  }

  function claimVEdge(r, c) {
    state.vEdges[r][c] = true;
    let completedAny = false;
    if (c > 0 && tryClaimBox(r, c - 1)) completedAny = true;
    if (c < state.n && tryClaimBox(r, c)) completedAny = true;
    return completedAny;
  }

  function boxComplete(r, c) {
    return state.hEdges[r][c] && state.hEdges[r + 1][c] && state.vEdges[r][c] && state.vEdges[r][c + 1];
  }

  function tryClaimBox(r, c) {
    if (state.boxOwner[r][c] !== null) return false;
    if (!boxComplete(r, c)) return false;
    state.boxOwner[r][c] = state.current;
    state.scores[state.current] += 1;
    state.boxesClaimed += 1;
    updateScoreboard();
    BabeNotify.playSound("success");
    return true;
  }

  function redrawBoxes() {
    const layer = document.getElementById("box-layer");
    layer.innerHTML = "";
    for (let r = 0; r < state.n; r++) {
      for (let c = 0; c < state.n; c++) {
        const owner = state.boxOwner[r][c];
        if (!owner) continue;
        const x = PAD + c * SPACING;
        const y = PAD + r * SPACING;
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", x + 3);
        rect.setAttribute("y", y + 3);
        rect.setAttribute("width", SPACING - 6);
        rect.setAttribute("height", SPACING - 6);
        rect.setAttribute("fill", PLAYER_COLOR[owner]);
        rect.setAttribute("opacity", "0.35");
        rect.setAttribute("rx", 6);
        layer.appendChild(rect);
      }
    }
  }

  function checkGameEnd() {
    if (state.boxesClaimed < state.n * state.n) return false;
    if (state.timer) state.timer.stop();
    endGame();
    return true;
  }

  function endGame() {
    gameScreen.style.display = "none";
    endScreen.style.display = "block";

    finalP1.querySelector(".name").textContent = state.p1;
    finalP1.querySelector(".val").textContent = state.scores[1];
    finalP2.querySelector(".name").textContent = state.p2;
    finalP2.querySelector(".val").textContent = state.scores[2];

    let line;
    if (state.scores[1] === state.scores[2]) line = "It's a tie!";
    else if (state.scores[1] > state.scores[2]) line = `${state.p1} wins! \u{1F3C6}`;
    else line = `${state.p2} wins! \u{1F3C6}`;
    winnerLine.textContent = line;
    BabeNotify.notify("Game over!", line, { sound: "win", basePath: "../" });

    pushHighScore("dots-and-boxes", {
      players: `${state.p1} vs ${state.p2}`,
      score: Math.max(state.scores[1], state.scores[2]),
    });
  }

  startBtn.addEventListener("click", startGame);
  playAgainBtn.addEventListener("click", () => {
    setupScreen.style.display = "block";
    gameScreen.style.display = "none";
    endScreen.style.display = "none";
  });
})();
