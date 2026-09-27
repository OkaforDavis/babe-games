(function () {
  const NS = "http://www.w3.org/2000/svg";
  const MAX_PIT_SEEDS_DRAWN = 19;
  const HOUSES = NchoRules.constants;

  // Sowing is paced so you can count along with it, the way you would at a
  // real board. Short turns get the full unhurried beat; a long relay speeds
  // the hand up so the turn still finishes in reasonable time.
  const COUNTING_PACE_MS = 460;   // an unhurried "one... two... three"
  const FASTEST_PACE_MS = 200;    // even a long relay stays countable
  const MAX_TURN_MS = 11000;
  // These two must match what the capture and pickup branches below
  // actually spend, or the budget under-reserves and long turns overrun.
  const CAPTURE_BEAT_MS = 1000;   // flash, fly to the house, settle
  const PICKUP_BEAT_MS = 560;

  const stage = document.getElementById("board-stage");
  const turnBanner = document.getElementById("turn-banner");
  const boardNote = document.getElementById("board-note");
  const feedback = document.getElementById("feedback");
  const winnerLine = document.getElementById("winner-line");
  const rematchBtn = document.getElementById("rematch-btn");
  const flipBtn = document.getElementById("flip-board");
  const p1Name = document.getElementById("p1-name");
  const p2Name = document.getElementById("p2-name");
  const p2Field = document.getElementById("p2-field");
  const seedsSelect = document.getElementById("seeds");
  const variantSelect = document.getElementById("variant");
  const sideSelect = document.getElementById("my-side");

  let layout = null;
  let svg = null;
  const pitNodes = {};       // pit index -> { seeds, label, pos, isHouse }
  let renderedRev = -1;
  let layoutKey = "";
  let animToken = 0;
  let animating = false;
  let manualFlip = false;
  let pendingOver = null;    // end screen waits for the last seeds to land

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    if (active && !p1Name.value) p1Name.value = active.name;
  });

  // ---------- deterministic placement so seeds never jump around ----------

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

  function houseSpots(count, rx, ry, salt) {
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
    const houses = {};
    const mine = flip ? [7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5];
    // ordered so the pit facing yours sits directly opposite it
    const theirs = flip ? [5, 4, 3, 2, 1, 0] : [12, 11, 10, 9, 8, 7];
    const myHouse = flip ? 13 : 6;
    const theirHouse = flip ? 6 : 13;

    if (!portrait) {
      const R = 48;
      for (let i = 0; i < 6; i++) {
        const cx = 180 + i * 106;
        pits[mine[i]] = { cx, cy: 248, r: R, bx: cx, by: 248 + R + 22 };
        pits[theirs[i]] = { cx, cy: 112, r: R, bx: cx, by: 112 - R - 12 };
      }
      houses[theirHouse] = { cx: 88, cy: 180, rx: 46, ry: 118, bx: 88, by: 180 + 118 + 24 };
      houses[myHouse] = { cx: 812, cy: 180, rx: 46, ry: 118, bx: 812, by: 180 + 118 + 24 };
      return { viewBox: "0 0 900 360", w: 900, h: 360, pits, houses, mine, theirs, myHouse, theirHouse, portrait };
    }

    // 6 pits of radius 46 spaced 96 apart clears both the stores and each
    // other inside an 840-tall board.
    const R = 46;
    for (let i = 0; i < 6; i++) {
      const cy = 176 + i * 96;
      pits[mine[i]] = { cx: 112, cy, r: R, bx: 112 - R - 18, by: cy + 6 };
      pits[theirs[i]] = { cx: 248, cy, r: R, bx: 248 + R + 18, by: cy + 6 };
    }
    houses[theirHouse] = { cx: 180, cy: 78, rx: 122, ry: 42, bx: 180, by: 78 + 42 + 22 };
    houses[myHouse] = { cx: 180, cy: 762, rx: 122, ry: 42, bx: 180, by: 762 - 42 - 14 };
    return { viewBox: "0 0 360 840", w: 360, h: 840, pits, houses, mine, theirs, myHouse, theirHouse, portrait };
  }

  function centerOf(idx) {
    const pit = layout.pits[idx];
    if (pit) return { x: pit.cx, y: pit.cy };
    const house = layout.houses[idx];
    return house ? { x: house.cx, y: house.cy } : { x: 0, y: 0 };
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

  // ---------- building ----------

  function buildBoard(counts, state, view) {
    svg = svgEl("svg", { viewBox: layout.viewBox, xmlns: NS });
    svg.innerHTML = defsMarkup();
    Object.keys(pitNodes).forEach((k) => delete pitNodes[k]);

    svg.appendChild(svgEl("rect", { x: 6, y: 6, width: layout.w - 12, height: layout.h - 12, rx: 38, fill: "url(#wood)" }));
    svg.appendChild(svgEl("rect", {
      x: 20, y: 20, width: layout.w - 40, height: layout.h - 40, rx: 30,
      fill: "url(#woodInner)", stroke: "rgba(0,0,0,0.35)", "stroke-width": 2,
    }));

    const playable = new Set(playablePits(state, view));

    [layout.myHouse, layout.theirHouse].forEach((idx) => {
      const pos = layout.houses[idx];
      const g = svgEl("g", {});
      g.appendChild(svgEl("ellipse", {
        cx: pos.cx, cy: pos.cy, rx: pos.rx, ry: pos.ry,
        fill: "url(#pitFill)", stroke: "rgba(0,0,0,0.5)", "stroke-width": 2, filter: "url(#pitShadow)",
      }));
      const seeds = svgEl("g", { class: "seeds" });
      g.appendChild(seeds);
      const label = makeLabel(pos.bx, pos.by, 23);
      g.appendChild(label);
      svg.appendChild(g);
      pitNodes[idx] = { seeds, label, pos, isHouse: true };
    });

    Object.keys(layout.pits).forEach((key) => {
      const idx = Number(key);
      const pos = layout.pits[idx];
      const g = svgEl("g", { class: "pit" });
      g.dataset.pit = idx;

      g.appendChild(svgEl("circle", {
        cx: pos.cx, cy: pos.cy, r: pos.r,
        fill: "url(#pitFill)", stroke: "rgba(0,0,0,0.45)", "stroke-width": 2, filter: "url(#pitShadow)",
      }));
      g.appendChild(svgEl("circle", {
        cx: pos.cx, cy: pos.cy, r: pos.r - 3,
        fill: "none",
        stroke: playable.has(idx) ? "#ffd23f" : "rgba(255,255,255,0.08)",
        "stroke-width": playable.has(idx) ? 3 : 1.5,
        class: "pit-ring" + (playable.has(idx) ? " playable" : ""),
      }));

      const seeds = svgEl("g", { class: "seeds" });
      g.appendChild(seeds);
      const label = makeLabel(pos.bx, pos.by, 17);
      g.appendChild(label);

      const hit = svgEl("circle", {
        cx: pos.cx, cy: pos.cy, r: pos.r,
        fill: "transparent",
        class: "pit-hit" + (playable.has(idx) ? " playable" : ""),
      });
      if (playable.has(idx)) hit.addEventListener("click", () => onPitClick(idx));
      g.appendChild(hit);

      svg.appendChild(g);
      pitNodes[idx] = { seeds, label, pos, isHouse: false };
    });

    stage.innerHTML = "";
    stage.appendChild(svg);

    Object.keys(pitNodes).forEach((k) => paintPit(Number(k), counts[Number(k)]));
  }

  function makeLabel(x, y, size) {
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
    text.textContent = "0";
    return text;
  }

  function paintPit(idx, count, pop) {
    const node = pitNodes[idx];
    if (!node) return;
    if (pop) {
      node.label.classList.remove("count-pop");
      void node.label.getBoundingClientRect();
      node.label.classList.add("count-pop");
    }
    node.seeds.innerHTML = "";
    const spots = node.isHouse
      ? houseSpots(count, node.pos.rx, node.pos.ry, idx * 31)
      : seedSpots(Math.min(count, MAX_PIT_SEEDS_DRAWN), node.pos.r, idx * 17);
    spots.forEach((s) => {
      node.seeds.appendChild(seedNode(node.pos.cx + s.x, node.pos.cy + s.y, idx * (node.isHouse ? 31 : 17), s.i));
    });
    node.label.textContent = count;
  }

  // ---------- the sowing animation ----------

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function tween(ms, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      function step(now) {
        const t = Math.min(1, (now - start) / ms);
        onFrame(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  function flySeed(fromIdx, toIdx, ms) {
    if (!svg) return Promise.resolve();
    const from = centerOf(fromIdx);
    const to = centerOf(toIdx);
    const seed = seedNode(from.x, from.y, 7, 3);
    seed.setAttribute("r", 9);
    seed.style.filter = "drop-shadow(0 0 6px rgba(255,210,63,0.85))";
    svg.appendChild(seed);

    return tween(ms, (t) => {
      // a little arc so it looks tossed rather than dragged
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = from.x + (to.x - from.x) * ease;
      const y = from.y + (to.y - from.y) * ease - Math.sin(Math.PI * t) * 18;
      seed.setAttribute("cx", x.toFixed(2));
      seed.setAttribute("cy", y.toFixed(2));
      if (t >= 1) seed.remove();
    });
  }

  function flashPit(idx) {
    const node = pitNodes[idx];
    if (!node) return;
    node.seeds.classList.remove("capture-flash");
    void node.seeds.getBoundingClientRect();
    node.seeds.classList.add("capture-flash");
    setTimeout(() => node.seeds.classList.remove("capture-flash"), 800);
  }

  // Replays the turn exactly as the rules recorded it: scoop a pit up, drop
  // the seeds one by one, lift out any four, and on a relay scoop up again
  // and keep going.
  async function playMove(move) {
    const token = ++animToken;
    const counts = move.before.slice();
    const steps = move.steps || [];
    const drops = steps.filter((s) => s.t === "drop").length;

    // Everyday turns run at the full unhurried pace. Only a monster relay
    // gets hurried along, and then everything scales together — scaling just
    // the seeds left the fixed capture and scoop beats to overrun on their
    // own.
    const captureCount = steps.filter((s) => s.t === "capture").length;
    const pickupCount = steps.filter((s) => s.t === "pickup").length;
    const projected = drops * COUNTING_PACE_MS + captureCount * CAPTURE_BEAT_MS + pickupCount * PICKUP_BEAT_MS;
    const scale = Math.max(0.4, Math.min(1, MAX_TURN_MS / Math.max(1, projected)));

    const pace = Math.max(FASTEST_PACE_MS, COUNTING_PACE_MS * scale);
    const flightMs = pace * 0.62;        // the seed travels...
    const settleMs = pace - flightMs;    // ...then rests a beat before the next
    const captureMs = CAPTURE_BEAT_MS * scale;
    const pickupMs = PICKUP_BEAT_MS * scale;
    // At a countable pace every seed gets its own tick; a hurried relay
    // thins them out so it doesn't turn into a buzz.
    const soundEvery = pace >= 220 ? 1 : Math.max(1, Math.ceil(drops / 16));

    let cursor = move.from;
    let hand = 0;
    let dropIndex = 0;

    for (let i = 0; i < steps.length; i++) {
      if (token !== animToken) return false;
      const step = steps[i];

      if (step.t === "pickup") {
        counts[step.pit] = 0;
        hand = step.count;
        paintPit(step.pit, 0, true);
        cursor = step.pit;
        placeHandAt(cursor, hand);
        // a clear beat on the scoop, so a relay reads as "picked it up again"
        await wait(i === 0 ? pickupMs : pickupMs * 1.15);
      } else if (step.t === "drop") {
        // the hand carries the seed across, then lets it fall in
        await Promise.all([
          flySeed(cursor, step.pit, flightMs),
          moveHandTo(step.pit, flightMs),
        ]);
        if (token !== animToken) return false;
        counts[step.pit] += 1;
        hand = Math.max(0, hand - 1);
        paintPit(step.pit, counts[step.pit], true);
        cursor = step.pit;
        setHandCount(hand);
        if (dropIndex % soundEvery === 0) BabeNotify.playSound("tick");
        dropIndex += 1;
        await wait(settleMs);
      } else if (step.t === "capture") {
        hideHand();
        flashPit(step.pit);
        await wait(captureMs * 0.32);
        if (token !== animToken) return false;
        const house = step.by === 0 ? HOUSES.P1_HOUSE : HOUSES.P2_HOUSE;
        counts[step.pit] = Math.max(0, counts[step.pit] - step.seeds);
        counts[house] += step.seeds;
        paintPit(step.pit, counts[step.pit]);
        await flySeed(step.pit, house, captureMs * 0.42);
        if (token !== animToken) return false;
        paintPit(house, counts[house], true);
        BabeNotify.playSound("success");
        await wait(captureMs * 0.26);
      }
    }

    hideHand();
    return token === animToken;
  }

  // The hand that carries the seeds round the board, with a count of what's
  // still in it so you can tick them down as they drop.
  let handPos = { x: 0, y: 0 };

  function handOffset(x) {
    // Beside the pit in portrait, where the rows sit close together;
    // above it in landscape.
    return layout && layout.portrait
      ? { x: x < 180 ? -76 : 76, y: -8 }
      : { x: 0, y: -78 };
  }

  function ensureHand() {
    if (!svg) return null;
    let group = svg.querySelector(".hand-marker");
    if (group) return group;

    group = svgEl("g", { class: "hand-marker" });
    const palm = svgEl("text", {
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": 40,
      class: "hand-palm",
    });
    palm.textContent = "\u{1F932}"; // cupped palms, holding the seeds
    const badge = svgEl("circle", {
      cx: 24, cy: -21, r: 15,
      fill: "#1a1025", stroke: "#ffd23f", "stroke-width": 2.5, opacity: 0.96,
    });
    const count = svgEl("text", {
      x: 24, y: -21,
      "text-anchor": "middle", "dominant-baseline": "central",
      "font-size": 15, "font-weight": "800", fill: "#ffd23f",
    });
    group.appendChild(palm);
    group.appendChild(badge);
    group.appendChild(count);
    svg.appendChild(group);
    return group;
  }

  function placeHandAt(atPit, remaining) {
    const group = ensureHand();
    if (!group) return;
    if (remaining <= 0) return hideHand();
    const pos = centerOf(atPit);
    const offset = handOffset(pos.x);
    handPos = { x: pos.x + offset.x, y: pos.y + offset.y };
    group.style.display = "";
    group.setAttribute("transform", `translate(${handPos.x.toFixed(1)} ${handPos.y.toFixed(1)})`);
    setHandCount(remaining);
  }

  function setHandCount(remaining) {
    const group = svg && svg.querySelector(".hand-marker");
    if (!group) return;
    if (remaining <= 0) return hideHand();
    group.querySelectorAll("text")[1].textContent = remaining;
  }

  // Carries the hand across to the next pit while the seed is in flight.
  function moveHandTo(atPit, ms) {
    const group = ensureHand();
    if (!group || group.style.display === "none") return Promise.resolve();
    const pos = centerOf(atPit);
    const offset = handOffset(pos.x);
    const to = { x: pos.x + offset.x, y: pos.y + offset.y };
    const from = { ...handPos };
    return tween(ms, (t) => {
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      handPos = {
        x: from.x + (to.x - from.x) * ease,
        y: from.y + (to.y - from.y) * ease,
      };
      group.setAttribute("transform", `translate(${handPos.x.toFixed(1)} ${handPos.y.toFixed(1)})`);
    });
  }

  function hideHand() {
    if (!svg) return;
    const group = svg.querySelector(".hand-marker");
    if (group) group.style.display = "none";
  }

  // ---------- rendering ----------

  function render(state, view) {
    renderSeats(state, view);
    renderBanner(state, view);

    const portrait = window.innerWidth < 620;
    const flip = (view.isOnline && view.mySlot === 1) !== manualFlip;
    const key = `${portrait}|${flip}`;
    const layoutChanged = key !== layoutKey;

    if (layoutChanged) {
      layout = computeLayout(portrait, flip);
      layoutKey = key;
    }

    const isNewMove = state.rev !== renderedRev;

    if (isNewMove && state.lastMove && !layoutChanged) {
      // Replay the move: show the board as it was, then run the seeds round.
      renderedRev = state.rev;
      animating = true; // nothing is clickable while the seeds are moving
      buildBoard(state.lastMove.before, state, view);
      playMove(state.lastMove).then((finished) => {
        if (!finished) return;
        animating = false;
        buildBoard(state.pits, state, view);
        if (pendingOver) {
          const show = pendingOver;
          pendingOver = null;
          show();
        }
      });
    } else if (isNewMove || layoutChanged) {
      renderedRev = state.rev;
      animToken++; // abandon any animation that was mid-flight
      animating = false;
      buildBoard(state.pits, state, view);
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
      boardNote.textContent = "";
      return;
    }
    const mine = !view.isOnline || state.turn === view.mySlot;
    turnBanner.textContent = view.isOnline
      ? mine ? "Your turn — pick a pit" : `Waiting for ${state.names[state.turn]}…`
      : `${state.names[state.turn]}'s turn — pick a pit`;
    turnBanner.className = "turn-banner" + (mine ? " mine" : "");

    const left = NchoRules.seedsOnBoard(state.pits);
    boardNote.textContent = state.variant === "four"
      ? `${left} seeds still in play · a pit that lands on 4 gets collected`
      : `${left} seeds still in play`;
  }

  function playablePits(state, view) {
    if (state.over || animating) return [];
    if (view.isOnline && state.turn !== view.mySlot) return [];
    return NchoRules.legalMoves(state, state.turn);
  }

  function onPitClick(pit) {
    if (animating) return;
    const state = game.state;
    if (!state) return;
    game.dispatch({ type: "sow", pit }, game.view.isOnline ? undefined : state.turn);
  }

  // ---------- game wiring ----------

  const game = BabeGame.create({
    rules: NchoRules,
    render,
    onMatchStart(view) {
      renderedRev = -1;
      layoutKey = "";
      animToken++;
      animating = false;
      pendingOver = null;
      manualFlip = sideSelect.value === "top";
      BabeGameUI.showScreen("play-screen");
      BabeGameUI.setBar(
        view.isOnline ? `Playing <strong>${escapeHtml(view.peerName || "your partner")}</strong>` : "",
        "ok"
      );
    },
    onOver(state, view) {
      const showResult = () => {
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
      };

      // Let the winning move finish landing before we swap screens.
      if (animating) pendingOver = showResult;
      else showResult();
    },
    onConnected() {
      p2Field.style.display = "none";
      ui.handleConnected();
    },
    onPeerReady() { ui.handlePeerReady(); },
    onPeerLost(view) {
      ui.handlePeerLost();
      // The host keeps the board so the game survives a dropped connection;
      // the other side needs the setup screen to rejoin from.
      if (!view.isHost) {
        BabeGameUI.showScreen("setup-screen");
        p2Field.style.display = "block";
      }
    },
  });

  function config() {
    return {
      seedsPerPit: parseInt(seedsSelect.value, 10),
      variant: variantSelect.value,
    };
  }

  const ui = BabeGameUI.bind({
    game,
    getConfig: config,
    getLocalNames: () => [
      p1Name.value.trim() || "Player 1",
      p2Name.value.trim() || "Player 2",
    ],
  });

  // Abandons a sowing in progress and snaps the board to where it really
  // is. Used both for tap-to-skip and when the app goes to the background,
  // where animation frames stop firing entirely and would otherwise leave
  // the board stuck mid-turn and unclickable.
  function finishAnimationNow() {
    if (!animating) return;
    animToken += 1;
    animating = false;
    hideHand();
    const state = game.state;
    if (state) buildBoard(state.pits, state, game.view);
    if (pendingOver) {
      const show = pendingOver;
      pendingOver = null;
      show();
    }
  }

  // Tap the board to jump to the end of a long relay instead of waiting.
  stage.addEventListener("click", finishAnimationNow);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finishAnimationNow();
  });

  flipBtn.addEventListener("click", () => {
    manualFlip = !manualFlip;
    layoutKey = "";
    if (game.state) game.render();
  });

  rematchBtn.addEventListener("click", () => {
    renderedRev = -1;
    layoutKey = "";
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

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (game.state) {
        layoutKey = "";
        game.render();
      }
    }, 200);
  });
})();
