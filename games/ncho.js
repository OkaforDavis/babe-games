(function () {
  const NS = "http://www.w3.org/2000/svg";
  const MAX_PIT_SEEDS_DRAWN = 19;

  const stage = document.getElementById("board-stage");
  const turnBanner = document.getElementById("turn-banner");
  const feedback = document.getElementById("feedback");
  const winnerLine = document.getElementById("winner-line");
  const rematchBtn = document.getElementById("rematch-btn");
  const p1Name = document.getElementById("p1-name");
  const p2Name = document.getElementById("p2-name");
  const p2Field = document.getElementById("p2-field");
  const seedsSelect = document.getElementById("seeds");

  let lastAnimatedRev = -1;
  let lastLayoutKey = "";

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    if (active && !p1Name.value) p1Name.value = active.name;
  });

  // ---------- deterministic little helpers so seeds don't jump around ----------

  function hash01(a, b) {
    let x = Math.imul((a | 0) + 1, 374761393) + Math.imul((b | 0) + 1, 668265263);
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  function seedSpots(count, R, salt) {
    const rings = [
      { n: 1, r: 0 },
      { n: 6, r: R * 0.44 },
      { n: 12, r: R * 0.74 },
    ];
    const spots = [];
    let placed = 0;
    for (const ring of rings) {
      for (let k = 0; k < ring.n && placed < count; k++, placed++) {
        const angle = (k / ring.n) * Math.PI * 2 + hash01(salt, ring.n) * 0.9;
        const jx = (hash01(salt, placed * 2 + 1) - 0.5) * R * 0.18;
        const jy = (hash01(salt, placed * 2 + 2) - 0.5) * R * 0.18;
        spots.push({ x: Math.cos(angle) * ring.r + jx, y: Math.sin(angle) * ring.r + jy, i: placed });
      }
    }
    return spots;
  }

  function storeSpots(count, rx, ry, salt) {
    const step = 20;
    const cols = Math.max(2, Math.floor((rx * 2 - 20) / step));
    const maxRows = Math.max(2, Math.floor((ry * 2 - 20) / step));
    const cap = Math.min(count, cols * maxRows);
    const rows = Math.ceil(cap / cols) || 1;
    const spots = [];
    for (let i = 0; i < cap; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const inRow = Math.min(cols, cap - row * cols);
      spots.push({
        x: (col - (inRow - 1) / 2) * step + (hash01(salt, i) - 0.5) * 5,
        y: (row - (rows - 1) / 2) * step + (hash01(salt, i + 77) - 0.5) * 5,
        i,
      });
    }
    return spots;
  }

  // ---------- board layout ----------

  function computeLayout(portrait, flip) {
    const pits = {};
    const stores = {};
    const mine = flip ? [7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5];
    // aligned so the pit facing yours sits directly opposite it
    const theirs = flip ? [5, 4, 3, 2, 1, 0] : [12, 11, 10, 9, 8, 7];
    const myStore = flip ? 13 : 6;
    const theirStore = flip ? 6 : 13;

    if (!portrait) {
      const R = 48;
      for (let i = 0; i < 6; i++) {
        const cx = 180 + i * 106;
        pits[mine[i]] = { cx, cy: 248, r: R, bx: cx, by: 248 + R + 22 };
        pits[theirs[i]] = { cx, cy: 112, r: R, bx: cx, by: 112 - R - 12 };
      }
      stores[theirStore] = { cx: 88, cy: 180, rx: 46, ry: 118, bx: 88, by: 180 + 118 + 24 };
      stores[myStore] = { cx: 812, cy: 180, rx: 46, ry: 118, bx: 812, by: 180 + 118 + 24 };
      return { viewBox: "0 0 900 360", pits, stores, mine, theirs, myStore, theirStore, portrait };
    }

    const R = 52;
    for (let i = 0; i < 6; i++) {
      const cy = 190 + i * 96;
      pits[mine[i]] = { cx: 112, cy, r: R, bx: 112 - R - 18, by: cy + 6 };
      pits[theirs[i]] = { cx: 248, cy, r: R, bx: 248 + R + 18, by: cy + 6 };
    }
    stores[theirStore] = { cx: 180, cy: 78, rx: 122, ry: 44, bx: 180, by: 78 + 44 + 24 };
    stores[myStore] = { cx: 180, cy: 762, rx: 122, ry: 44, bx: 180, by: 762 - 44 - 14 };
    return { viewBox: "0 0 360 840", pits, stores, mine, theirs, myStore, theirStore, portrait };
  }

  function defsMarkup() {
    return `
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8a5529"/>
          <stop offset="0.45" stop-color="#63391a"/>
          <stop offset="1" stop-color="#412510"/>
        </linearGradient>
        <linearGradient id="woodInner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7d4b24"/>
          <stop offset="1" stop-color="#573014"/>
        </linearGradient>
        <radialGradient id="pitFill" cx="0.5" cy="0.38" r="0.78">
          <stop offset="0" stop-color="#120a04"/>
          <stop offset="0.7" stop-color="#241407"/>
          <stop offset="1" stop-color="#3d2310"/>
        </radialGradient>
        <radialGradient id="seed0" cx="0.34" cy="0.3" r="0.85">
          <stop offset="0" stop-color="#fdf3dc"/>
          <stop offset="0.55" stop-color="#e8c68d"/>
          <stop offset="1" stop-color="#b3833f"/>
        </radialGradient>
        <radialGradient id="seed1" cx="0.34" cy="0.3" r="0.85">
          <stop offset="0" stop-color="#f6e7d2"/>
          <stop offset="0.55" stop-color="#d8b483"/>
          <stop offset="1" stop-color="#9c6f36"/>
        </radialGradient>
        <radialGradient id="seed2" cx="0.34" cy="0.3" r="0.85">
          <stop offset="0" stop-color="#fff8e6"/>
          <stop offset="0.55" stop-color="#eed4a4"/>
          <stop offset="1" stop-color="#c2924c"/>
        </radialGradient>
        <filter id="pitShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.55"/>
        </filter>
      </defs>
    `;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  }

  function seedNode(x, y, salt, idx) {
    const tint = Math.floor(hash01(salt, idx + 13) * 3) % 3;
    return svgEl("circle", {
      cx: x.toFixed(2),
      cy: y.toFixed(2),
      r: 8.2,
      fill: `url(#seed${tint})`,
      stroke: "rgba(52,28,8,0.5)",
      "stroke-width": 0.9,
    });
  }

  // ---------- rendering ----------

  function render(state, view) {
    renderSeats(state, view);
    renderBanner(state, view);

    const flip = view.isOnline && view.mySlot === 1;
    const portrait = window.innerWidth < 620;
    const layoutKey = `${portrait}|${flip}`;
    if (state.rev !== lastAnimatedRev || layoutKey !== lastLayoutKey) {
      buildBoard(state, view, portrait, flip);
      if (state.lastMove && state.rev !== lastAnimatedRev) animateMove(state.lastMove);
      lastAnimatedRev = state.rev;
      lastLayoutKey = layoutKey;
    }

    feedback.textContent = state.message || "";
    feedback.className = "feedback" + (state.message ? " ok" : "");
  }

  function renderSeats(state, view) {
    const scores = NchoRules.scores(state);
    [0, 1].forEach((slot) => {
      const seat = document.getElementById(`seat-${slot}`);
      seat.querySelector(".seat-name").textContent = state.names[slot];
      seat.querySelector(".seat-score").textContent = scores[slot];
      seat.classList.toggle("active", !state.over && state.turn === slot);
      seat.classList.toggle("you", view.isOnline && slot === view.mySlot);
    });
  }

  function renderBanner(state, view) {
    if (state.over) {
      turnBanner.textContent = "";
      return;
    }
    const mine = !view.isOnline || state.turn === view.mySlot;
    turnBanner.textContent = view.isOnline
      ? mine ? "Your turn — pick a pit" : `Waiting for ${state.names[state.turn]}…`
      : `${state.names[state.turn]}'s turn — pick a pit`;
    turnBanner.className = "turn-banner" + (mine ? " mine" : "");
  }

  function buildBoard(state, view, portrait, flip) {
    const layout = computeLayout(portrait, flip);
    const svg = svgEl("svg", { viewBox: layout.viewBox, xmlns: NS });
    svg.innerHTML = defsMarkup();

    const [vbW, vbH] = layout.viewBox.split(" ").slice(2).map(Number);
    svg.appendChild(svgEl("rect", { x: 6, y: 6, width: vbW - 12, height: vbH - 12, rx: 38, fill: "url(#wood)" }));
    svg.appendChild(svgEl("rect", {
      x: 20, y: 20, width: vbW - 40, height: vbH - 40, rx: 30,
      fill: "url(#woodInner)", stroke: "rgba(0,0,0,0.35)", "stroke-width": 2,
    }));

    const playable = new Set(playablePits(state, view));

    // stores
    [layout.myStore, layout.theirStore].forEach((idx) => {
      const pos = layout.stores[idx];
      const g = svgEl("g", {});
      g.appendChild(svgEl("ellipse", {
        cx: pos.cx, cy: pos.cy, rx: pos.rx, ry: pos.ry,
        fill: "url(#pitFill)", stroke: "rgba(0,0,0,0.5)", "stroke-width": 2, filter: "url(#pitShadow)",
      }));
      const seeds = svgEl("g", { class: "seeds" });
      storeSpots(state.pits[idx], pos.rx, pos.ry, idx * 31).forEach((s) => {
        seeds.appendChild(seedNode(pos.cx + s.x, pos.cy + s.y, idx * 31, s.i));
      });
      g.appendChild(seeds);
      g.appendChild(label(pos.bx, pos.by, state.pits[idx], 20));
      g.dataset.store = idx;
      svg.appendChild(g);
    });

    // pits
    Object.keys(layout.pits).forEach((key) => {
      const idx = Number(key);
      const pos = layout.pits[idx];
      const g = svgEl("g", { class: "pit" });
      g.dataset.pit = idx;

      g.appendChild(svgEl("circle", {
        cx: pos.cx, cy: pos.cy, r: pos.r,
        fill: "url(#pitFill)", stroke: "rgba(0,0,0,0.45)", "stroke-width": 2, filter: "url(#pitShadow)",
      }));

      const ring = svgEl("circle", {
        cx: pos.cx, cy: pos.cy, r: pos.r - 3,
        fill: "none",
        stroke: playable.has(idx) ? "#ffd23f" : "rgba(255,255,255,0.08)",
        "stroke-width": playable.has(idx) ? 3 : 1.5,
        class: "pit-ring" + (playable.has(idx) ? " playable" : ""),
      });
      g.appendChild(ring);

      const seeds = svgEl("g", { class: "seeds" });
      const count = Math.min(state.pits[idx], MAX_PIT_SEEDS_DRAWN);
      seedSpots(count, pos.r, idx * 17).forEach((s) => {
        seeds.appendChild(seedNode(pos.cx + s.x, pos.cy + s.y, idx * 17, s.i));
      });
      g.appendChild(seeds);
      g.appendChild(label(pos.bx, pos.by, state.pits[idx], 15));

      const hit = svgEl("circle", {
        cx: pos.cx, cy: pos.cy, r: pos.r,
        fill: "transparent",
        class: "pit-hit" + (playable.has(idx) ? " playable" : ""),
      });
      if (playable.has(idx)) {
        hit.addEventListener("click", () => onPitClick(idx));
      }
      g.appendChild(hit);
      svg.appendChild(g);
    });

    stage.innerHTML = "";
    stage.appendChild(svg);
  }

  function label(x, y, value, size) {
    const g = svgEl("g", {});
    const text = svgEl("text", {
      x, y,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": size,
      "font-weight": "800",
      fill: "#fdf1d6",
      stroke: "rgba(0,0,0,0.55)",
      "stroke-width": 3,
      "paint-order": "stroke",
    });
    text.textContent = value;
    g.appendChild(text);
    return g;
  }

  function playablePits(state, view) {
    if (state.over) return [];
    const actingSlot = state.turn;
    if (view.isOnline && actingSlot !== view.mySlot) return [];
    return NchoRules.legalMoves(state, actingSlot);
  }

  function onPitClick(pit) {
    const state = game.state;
    if (!state) return;
    game.dispatch({ type: "sow", pit }, game.view.isOnline ? undefined : state.turn);
  }

  function animateMove(move) {
    const steps = move.path || [];
    steps.slice(0, 24).forEach((idx, k) => {
      setTimeout(() => {
        flash(idx, "sow-flash");
        if (k < 8) BabeNotify.playSound("tick");
      }, k * 70);
    });
    if (move.captured) {
      setTimeout(() => {
        flash(move.captured.pit, "capture-flash");
        flash(move.captured.opposite, "capture-flash");
        BabeNotify.playSound("success");
      }, steps.length * 70 + 120);
    }
  }

  function flash(idx, className) {
    const node = stage.querySelector(`[data-pit="${idx}"] .seeds`) || stage.querySelector(`[data-store="${idx}"] .seeds`);
    if (!node) return;
    node.classList.remove(className);
    void node.getBoundingClientRect();
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), 800);
  }

  // ---------- game wiring ----------

  const game = BabeGame.create({
    rules: NchoRules,
    render,
    onMatchStart(view) {
      lastAnimatedRev = -1;
      lastLayoutKey = "";
      BabeGameUI.showScreen("play-screen");
      BabeGameUI.setBar(
        view.isOnline ? `Playing <strong>${escapeHtml(view.peerName || "your partner")}</strong>` : "",
        "ok"
      );
    },
    onOver(state, view) {
      const scores = NchoRules.scores(state);
      [0, 1].forEach((slot) => {
        const seat = document.getElementById(`final-${slot}`);
        seat.querySelector(".seat-name").textContent = state.names[slot];
        seat.querySelector(".seat-score").textContent = scores[slot];
        seat.classList.toggle("you", view.isOnline && slot === view.mySlot);
      });
      winnerLine.textContent = state.winner === -1
        ? "It's a tie!"
        : view.isOnline
        ? state.winner === view.mySlot ? "You win! \u{1F3C6}" : `${state.names[state.winner]} wins!`
        : `${state.names[state.winner]} wins! \u{1F3C6}`;

      BabeNotify.notify("Game over!", winnerLine.textContent, { sound: "win", basePath: "../" });
      pushHighScore("ncho", { players: state.names.join(" vs "), score: Math.max(...scores) });

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
    onPeerReady() {
      ui.handlePeerReady();
    },
    onPeerLost() {
      ui.handlePeerLost();
      BabeGameUI.showScreen("setup-screen");
      p2Field.style.display = "block";
    },
  });

  const ui = BabeGameUI.bind({
    game,
    getConfig: () => ({ seedsPerPit: parseInt(seedsSelect.value, 10) }),
    getLocalNames: () => [
      p1Name.value.trim() || "Player 1",
      p2Name.value.trim() || "Player 2",
    ],
    onStarted() {
      lastAnimatedRev = -1;
      lastLayoutKey = "";
    },
  });

  rematchBtn.addEventListener("click", () => {
    lastAnimatedRev = -1;
    lastLayoutKey = "";
    const config = { seedsPerPit: parseInt(seedsSelect.value, 10) };
    if (game.mode === "online") {
      game.hostStart(config);
    } else {
      game.startLocal({
        ...config,
        names: [p1Name.value.trim() || "Player 1", p2Name.value.trim() || "Player 2"],
      });
    }
    BabeGameUI.showScreen("play-screen");
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (game.state) {
        lastLayoutKey = "";
        game.render();
      }
    }, 200);
  });
})();
