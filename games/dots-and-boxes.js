(function () {
  const NS = "http://www.w3.org/2000/svg";
  const SPACING = 78;
  const PAD = 30;
  const COLORS = ["#ff7a3d", "#4db5ff"];

  const stage = document.getElementById("board-stage");
  const turnBanner = document.getElementById("turn-banner");
  const timerDisplay = document.getElementById("timer-display");
  const feedback = document.getElementById("feedback");
  const winnerLine = document.getElementById("winner-line");
  const rematchBtn = document.getElementById("rematch-btn");
  const p1Name = document.getElementById("p1-name");
  const p2Name = document.getElementById("p2-name");
  const p2Field = document.getElementById("p2-field");
  const gridSizeSelect = document.getElementById("grid-size");
  const turnTimeSelect = document.getElementById("turn-time");

  let lastBoardRev = -1;

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    if (active && !p1Name.value) p1Name.value = active.name;
  });

  function svgEl(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  }

  function render(state, view) {
    [0, 1].forEach((slot) => {
      const seat = document.getElementById(`seat-${slot}`);
      seat.querySelector(".seat-name").textContent = state.names[slot];
      seat.querySelector(".seat-score").textContent = state.scores[slot];
      seat.querySelector(".seat-name").style.color = COLORS[slot];
      seat.classList.toggle("active", !state.over && state.turn === slot);
      seat.classList.toggle("you", view.isOnline && slot === view.mySlot);
    });

    const mine = !view.isOnline || state.turn === view.mySlot;
    turnBanner.textContent = state.over
      ? ""
      : view.isOnline
      ? mine ? "Your turn — draw a line" : `Waiting for ${state.names[state.turn]}…`
      : `${state.names[state.turn]}'s turn`;
    turnBanner.className = "turn-banner" + (mine ? " mine" : "");

    if (state.turnTime > 0 && !state.over) {
      timerDisplay.style.display = "block";
      timerDisplay.textContent = formatSeconds(state.secondsLeft);
      setTimerClass(timerDisplay, state.secondsLeft, state.turnTime);
      if (state.secondsLeft === 5 && mine) BabeNotify.playSound("tick");
    } else {
      timerDisplay.style.display = "none";
    }

    if (state.rev !== lastBoardRev) {
      buildBoard(state, view);
      lastBoardRev = state.rev;
      if (state.lastMove && state.lastMove.gained && state.lastMove.gained.length) {
        BabeNotify.playSound("success");
      }
    }

    feedback.textContent = state.message || "";
    feedback.className = "feedback" + (state.message ? " ok" : "");
  }

  function buildBoard(state, view) {
    const n = state.n;
    const size = n * SPACING + PAD * 2;
    const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, xmlns: NS });
    const canAct = !state.over && (!view.isOnline || state.turn === view.mySlot);

    const pt = (row, col) => [PAD + col * SPACING, PAD + row * SPACING];

    // claimed boxes
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const owner = state.owner[r][c];
        if (owner === -1) continue;
        const [x, y] = pt(r, c);
        svg.appendChild(svgEl("rect", {
          x: x + 4, y: y + 4, width: SPACING - 8, height: SPACING - 8, rx: 8,
          fill: COLORS[owner], opacity: 0.28,
        }));
        const initial = svgEl("text", {
          x: x + SPACING / 2, y: y + SPACING / 2,
          "text-anchor": "middle", "dominant-baseline": "central",
          "font-size": 22, "font-weight": 800, fill: COLORS[owner], opacity: 0.9,
        });
        initial.textContent = (state.names[owner] || "?").trim().charAt(0).toUpperCase();
        svg.appendChild(initial);
      }
    }

    const addEdge = (o, r, c, x1, y1, x2, y2) => {
      const owner = o === "h" ? state.h[r][c] : state.v[r][c];
      const taken = owner !== -1;
      svg.appendChild(svgEl("line", {
        x1, y1, x2, y2,
        stroke: taken ? COLORS[owner] : "#3a2650",
        "stroke-width": taken ? 6 : 4,
        "stroke-linecap": "round",
      }));
      if (taken || !canAct) return;
      const hit = svgEl("line", {
        x1, y1, x2, y2,
        stroke: "transparent", "stroke-width": 22, class: "edge-hit",
      });
      hit.addEventListener("click", () => {
        game.dispatch({ type: "claim", o, r, c }, view.isOnline ? undefined : state.turn);
      });
      svg.appendChild(hit);
    };

    for (let r = 0; r <= n; r++) {
      for (let c = 0; c < n; c++) {
        const [x1, y1] = pt(r, c);
        const [x2] = pt(r, c + 1);
        addEdge("h", r, c, x1, y1, x2, y1);
      }
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c <= n; c++) {
        const [x1, y1] = pt(r, c);
        const [, y2] = pt(r + 1, c);
        addEdge("v", r, c, x1, y1, x1, y2);
      }
    }

    for (let r = 0; r <= n; r++) {
      for (let c = 0; c <= n; c++) {
        const [x, y] = pt(r, c);
        svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 5, fill: "#f5f0ff" }));
      }
    }

    stage.innerHTML = "";
    stage.appendChild(svg);
  }

  const game = BabeGame.create({
    rules: DotsRules,
    render,
    onMatchStart(view) {
      lastBoardRev = -1;
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
      winnerLine.textContent = state.winner === -1
        ? "It's a tie!"
        : view.isOnline
        ? state.winner === view.mySlot ? "You win! \u{1F3C6}" : `${state.names[state.winner]} wins!`
        : `${state.names[state.winner]} wins! \u{1F3C6}`;
      BabeNotify.notify("Game over!", winnerLine.textContent, { sound: "win", basePath: "../" });
      pushHighScore("dots-and-boxes", { players: state.names.join(" vs "), score: Math.max(...state.scores) });
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
    onPeerLost() {
      ui.handlePeerLost();
      BabeGameUI.showScreen("setup-screen");
      p2Field.style.display = "block";
    },
  });

  function config() {
    return {
      n: parseInt(gridSizeSelect.value, 10),
      turnTime: parseInt(turnTimeSelect.value, 10),
    };
  }

  const ui = BabeGameUI.bind({
    game,
    getConfig: config,
    getLocalNames: () => [p1Name.value.trim() || "Player 1", p2Name.value.trim() || "Player 2"],
    onStarted() { lastBoardRev = -1; },
  });

  rematchBtn.addEventListener("click", () => {
    lastBoardRev = -1;
    if (game.mode === "online") {
      game.hostStart(config());
    } else {
      game.startLocal({
        ...config(),
        names: [p1Name.value.trim() || "Player 1", p2Name.value.trim() || "Player 2"],
      });
    }
    BabeGameUI.showScreen("play-screen");
  });
})();
