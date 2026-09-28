(function () {
  const seatRow = document.getElementById("seat-row");
  const finalRow = document.getElementById("final-row");
  const board = document.getElementById("puzzle-board");
  const peekImage = document.getElementById("peek-image");
  const feedback = document.getElementById("feedback");
  const quitBtn = document.getElementById("quit-btn");
  const winnerLine = document.getElementById("winner-line");
  const resultSubtitle = document.getElementById("result-subtitle");
  const rematchBtn = document.getElementById("rematch-btn");

  const p1Name = document.getElementById("p1-name");
  const imageChoiceRow = document.getElementById("image-choice-row");
  const uploadInput = document.getElementById("upload-input");
  const uploadField = document.getElementById("upload-field");
  const uploadNote = document.getElementById("upload-note");
  const gridSizeSelect = document.getElementById("grid-size");

  const VARIANTS = ["sunset", "ocean", "bloom", "market"];

  let chosenVariant = "sunset";
  let customImage = null;
  let myOrder = [];      // tile index sitting in each slot, on THIS device
  let selectedSlot = null;
  let moves = 0;
  let imageUrl = null;
  let builtKey = "";
  let tickHandle = null;
  let lastReportedCorrect = -1;

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    if (active && !p1Name.value) p1Name.value = active.name;
  });

  // ---- deterministic artwork: same seed + variant = same picture on both
  // devices, so an online race is genuinely fair ----

  function drawImage(variant, seed) {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const rng = PuzzleRules.makeRng(seed);

    if (variant === "ocean") {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#35e0a1");
      g.addColorStop(1, "#123a5c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 6;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        const offset = rng() * 40;
        for (let x = 0; x <= w; x += 20) {
          const y = 70 + i * 58 + Math.sin((x + offset) / 38) * 14;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (variant === "bloom") {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#ff4d97");
      g.addColorStop(1, "#2a1046");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.08 + rng() * 0.16})`;
        ctx.beginPath();
        ctx.arc(rng() * w, rng() * h, 24 + rng() * 70, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (variant === "market") {
      ctx.fillStyle = "#2a1740";
      ctx.fillRect(0, 0, w, h);
      const palette = ["#ff7a3d", "#ffd23f", "#35e0a1", "#ff4d97", "#4db5ff"];
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
          ctx.globalAlpha = 0.55 + rng() * 0.45;
          const pad = rng() * 8;
          ctx.fillRect(col * 60 + pad, row * 60 + pad, 60 - pad * 2, 60 - pad * 2);
        }
      }
      ctx.globalAlpha = 1;
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#ff7a3d");
      g.addColorStop(0.55, "#d94a6a");
      g.addColorStop(1, "#3d1a4a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.38, 74, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(20,8,26,0.55)";
      for (let i = 0; i < 6; i++) {
        const base = i * 96 - 30 + rng() * 20;
        ctx.beginPath();
        ctx.moveTo(base - 40, h);
        ctx.lineTo(base + 30, h * 0.6 + rng() * 40);
        ctx.lineTo(base + 110, h);
        ctx.closePath();
        ctx.fill();
      }
    }
    return canvas.toDataURL("image/png");
  }

  function renderImageChoices() {
    imageChoiceRow.innerHTML = "";
    VARIANTS.forEach((variant, idx) => {
      const el = document.createElement("div");
      el.className = "image-choice" + (idx === 0 ? " chosen" : "");
      el.style.backgroundImage = `url(${drawImage(variant, 1234)})`;
      el.title = variant;
      el.addEventListener("click", () => {
        chosenVariant = variant;
        customImage = null;
        uploadInput.value = "";
        [...imageChoiceRow.children].forEach((c) => c.classList.remove("chosen"));
        el.classList.add("chosen");
      });
      imageChoiceRow.appendChild(el);
    });
  }
  renderImageChoices();

  uploadInput.addEventListener("change", () => {
    const file = uploadInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      customImage = reader.result;
      [...imageChoiceRow.children].forEach((c) => c.classList.remove("chosen"));
    };
    reader.readAsDataURL(file);
  });

  // ---- board ----

  function buildBoard(state) {
    const n = state.n;
    myOrder = state.order.slice();
    selectedSlot = null;
    moves = 0;
    lastReportedCorrect = -1;
    imageUrl = state.customImage || drawImage(state.variant, state.seed);
    peekImage.src = imageUrl;
    board.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    paintBoard(n);
  }

  function paintBoard(n) {
    board.innerHTML = "";
    myOrder.forEach((tile, slot) => {
      const row = Math.floor(tile / n);
      const col = tile % n;
      const denom = n - 1 || 1;
      const el = document.createElement("div");
      el.className = "puzzle-tile" + (tile === slot ? " locked" : "") + (slot === selectedSlot ? " selected" : "");
      el.style.backgroundImage = `url(${imageUrl})`;
      el.style.backgroundSize = `${n * 100}% ${n * 100}%`;
      el.style.backgroundPosition = `${(col / denom) * 100}% ${(row / denom) * 100}%`;
      el.addEventListener("click", () => onTileClick(slot, n));
      board.appendChild(el);
    });
  }

  function onTileClick(slot, n) {
    const state = game.state;
    if (!state || state.over) return;
    if (state.finished[game.view.isOnline ? game.view.mySlot : 0] != null) return;

    if (selectedSlot === null) {
      selectedSlot = slot;
      paintBoard(n);
      return;
    }
    if (selectedSlot === slot) {
      selectedSlot = null;
      paintBoard(n);
      return;
    }

    [myOrder[selectedSlot], myOrder[slot]] = [myOrder[slot], myOrder[selectedSlot]];
    selectedSlot = null;
    moves += 1;
    paintBoard(n);
    BabeNotify.playSound("tick");
    reportProgress();
  }

  function correctCount() {
    return myOrder.reduce((total, tile, slot) => total + (tile === slot ? 1 : 0), 0);
  }

  function reportProgress() {
    const state = game.state;
    if (!state) return;
    const slot = game.view.isOnline ? game.view.mySlot : 0;
    const correct = correctCount();

    if (correct === myOrder.length) {
      const ms = Date.now() - state.startedAt;
      game.dispatch({ type: "solved", ms, moves }, slot);
      return;
    }
    if (correct !== lastReportedCorrect) {
      lastReportedCorrect = correct;
      game.dispatch({ type: "progress", correct, moves }, slot);
    }
  }

  // ---- render ----

  function render(state, view) {
    if (builtKey !== `${state.seed}:${state.n}:${state.startedAt}`) {
      builtKey = `${state.seed}:${state.n}:${state.startedAt}`;
      buildBoard(state);
      startTicker();
    }

    seatRow.innerHTML = "";
    state.names.forEach((name, slot) => {
      const total = state.n * state.n;
      const done = state.progress[slot];
      const div = document.createElement("div");
      div.className = "seat" + (view.isOnline && slot === view.mySlot ? " you" : "");
      div.innerHTML = `
        <div class="seat-name">${escapeHtml(name)}</div>
        <div class="seat-score" data-elapsed="${slot}">${state.finished[slot] != null ? formatSeconds(Math.round(state.finished[slot] / 1000)) : "—"}</div>
        <div class="seat-sub">${done}/${total} in place</div>
        <div class="progress-track"><div class="progress-fill" style="width:${(done / total) * 100}%"></div></div>
      `;
      seatRow.appendChild(div);
    });

    feedback.textContent = state.message || "";
    feedback.className = "feedback" + (state.message ? " ok" : "");
  }

  function startTicker() {
    stopTicker();
    tickHandle = setInterval(() => {
      const state = game.state;
      if (!state || state.over) return stopTicker();
      const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
      state.names.forEach((_, slot) => {
        if (state.finished[slot] != null) return;
        const node = seatRow.querySelector(`[data-elapsed="${slot}"]`);
        if (node) node.textContent = formatSeconds(elapsed);
      });
    }, 1000);
  }

  function stopTicker() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  // ---- wiring ----

  const game = BabeGame.create({
    rules: PuzzleRules,
    render,
    onMatchStart(view) {
      builtKey = "";
      BabeGameUI.showScreen("play-screen");
      BabeGameUI.setBar(
        view.isOnline ? `Racing <strong>${escapeHtml(view.peerName || "your partner")}</strong>` : "",
        "ok"
      );
    },
    onOver(state, view) {
      stopTicker();
      finalRow.innerHTML = "";
      state.names.forEach((name, slot) => {
        const div = document.createElement("div");
        div.className = "seat" + (view.isOnline && slot === view.mySlot ? " you" : "");
        div.innerHTML = `
          <div class="seat-name">${escapeHtml(name)}</div>
          <div class="seat-score">${state.finished[slot] != null ? formatSeconds(Math.round(state.finished[slot] / 1000)) : "—"}</div>
          <div class="seat-sub">${state.moves[slot]} swaps</div>
        `;
        finalRow.appendChild(div);
      });

      const solo = state.names.length === 1;
      const mySlotIdx = view.isOnline ? view.mySlot : 0;
      const myMs = state.finished[mySlotIdx];

      let result;
      if (solo) {
        result = {
          outcome: "win",
          title: "Solved!",
          subtitle: myMs != null ? `${formatSeconds(Math.round(myMs / 1000))} and ${state.moves[mySlotIdx]} swaps.` : "",
        };
      } else if (state.winner === mySlotIdx) {
        result = { outcome: "win", title: "You got there first!", subtitle: "Nicely done." };
      } else {
        const theirs = state.finished[state.winner];
        const mine = state.progress[mySlotIdx];
        result = {
          outcome: "close",
          title: `${state.names[state.winner]} got there first`,
          subtitle: theirs != null
            ? `They finished in ${formatSeconds(Math.round(theirs / 1000))}, and you had ${mine} of ${state.n * state.n} in place. Go again?`
            : "Go again?",
        };
      }
      BabeCelebrate.show({ ...result, titleEl: winnerLine, subtitleEl: resultSubtitle });

      BabeNotify.notify("Puzzle finished!", result.title, { sound: "win", basePath: "../" });

      const ms = myMs;
      if (ms != null) {
        const seconds = Math.round(ms / 1000);
        pushHighScore("puzzle", {
          players: state.names[mySlotIdx],
          score: Math.max(0, 10000 - seconds * 10 - state.moves[mySlotIdx] * 5),
        });
      }

      rematchBtn.style.display = view.isOnline && !view.isHost ? "none" : "inline-block";
      BabeGameUI.showScreen("end-screen");
      if (view.isOnline) {
        BabeGameUI.setBar(
          view.isHost ? "Tap Play Again for another race." : "Waiting for the host to start another race…",
          "ok"
        );
      }
    },
    onConnected() {
      uploadField.style.display = "none";
      uploadNote.style.display = "block";
      customImage = null;
      ui.handleConnected();
    },
    onPeerReady() { ui.handlePeerReady(); },
    onPeerLost(view) {
      stopTicker();
      ui.handlePeerLost();
      if (view.isHost) return;
      BabeGameUI.showScreen("setup-screen");
      uploadField.style.display = "block";
      uploadNote.style.display = "none";
    },
  });

  function config() {
    const online = game.mode === "online";
    return {
      n: parseInt(gridSizeSelect.value, 10),
      seed: Math.floor(Math.random() * 1e9),
      variant: chosenVariant,
      customImage: online ? null : customImage,
      solo: !online,
      startedAt: Date.now(),
    };
  }

  const ui = BabeGameUI.bind({
    game,
    getConfig: config,
    getLocalNames: () => [p1Name.value.trim() || "Player 1"],
    onStarted() { builtKey = ""; },
  });

  quitBtn.addEventListener("click", () => {
    stopTicker();
    game.leave();
    builtKey = "";
    BabeGameUI.setBar("");
    BabeGameUI.showScreen("setup-screen");
    uploadField.style.display = "block";
    uploadNote.style.display = "none";
  });

  rematchBtn.addEventListener("click", () => {
    builtKey = "";
    if (game.mode === "online") game.hostStart(config());
    else game.startLocal({ ...config(), names: [p1Name.value.trim() || "Player 1"] });
    BabeGameUI.showScreen("play-screen");
  });
})();
