(function () {
  const CATS = CategoriesRules.CATEGORIES;
  const ALPHABET = CategoriesRules.ALPHABET;

  const seatRow = document.getElementById("seat-row");
  const finalRow = document.getElementById("final-row");
  const feedback = document.getElementById("feedback");

  const phaseLetter = document.getElementById("phase-letter");
  const letterGrid = document.getElementById("letter-grid");
  const letterWait = document.getElementById("letter-wait");
  const letterBanner = document.getElementById("letter-banner");
  const spinBtn = document.getElementById("spin-letter");

  const phaseFilling = document.getElementById("phase-filling");
  const fillBanner = document.getElementById("fill-banner");
  const timerDisplay = document.getElementById("timer-display");
  const fillFields = document.getElementById("fill-fields");
  const lockInBtn = document.getElementById("lock-in");
  const fillWait = document.getElementById("fill-wait");

  const phaseReview = document.getElementById("phase-review");
  const reviewTable = document.getElementById("review-table");
  const scoreBtn = document.getElementById("score-round");

  const phaseSummary = document.getElementById("phase-summary");
  const roundBreakdown = document.getElementById("round-breakdown");
  const nextRoundBtn = document.getElementById("next-round");
  const endGameBtn = document.getElementById("end-game");
  const summaryWait = document.getElementById("summary-wait");

  const winnerLine = document.getElementById("winner-line");
  const rematchBtn = document.getElementById("rematch-btn");

  const p1Name = document.getElementById("p1-name");
  const playersList = document.getElementById("players-list");
  const addPlayerBtn = document.getElementById("add-player");
  const localPlayersField = document.getElementById("local-players-field");
  const fillTimeSelect = document.getElementById("fill-time");

  let fieldsBuiltFor = "";
  let submittedFor = "";
  let lastReviewRev = -1;

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

  function showPhase(state) {
    phaseLetter.style.display = state.phase === "letter" ? "block" : "none";
    phaseFilling.style.display = state.phase === "filling" ? "block" : "none";
    phaseReview.style.display = state.phase === "review" ? "block" : "none";
    phaseSummary.style.display = state.phase === "summary" ? "block" : "none";
  }

  function render(state, view) {
    renderSeats(state, view, seatRow, state.totals);
    showPhase(state);

    if (state.phase === "letter") renderLetterPhase(state, view);
    if (state.phase === "filling") renderFillPhase(state, view);
    if (state.phase === "review") renderReviewPhase(state, view);
    if (state.phase === "summary") renderSummaryPhase(state, view);

    feedback.textContent = state.message || "";
    feedback.className = "feedback" + (state.message ? " ok" : "");
  }

  function renderSeats(state, view, container, values) {
    container.innerHTML = "";
    state.names.forEach((name, slot) => {
      const div = document.createElement("div");
      div.className = "seat" + (view.isOnline && slot === view.mySlot ? " you" : "");
      div.innerHTML = `
        <div class="seat-name">${escapeHtml(name)}</div>
        <div class="seat-score">${values[slot]}</div>
        <div class="seat-sub">points</div>
      `;
      container.appendChild(div);
    });
  }

  // ---- letter ----

  function canPickLetter(view) {
    return !view.isOnline || view.isHost;
  }

  function renderLetterPhase(state, view) {
    const allowed = canPickLetter(view);
    letterGrid.style.display = allowed ? "grid" : "none";
    spinBtn.style.display = allowed ? "inline-block" : "none";
    letterWait.style.display = allowed ? "none" : "block";
    letterBanner.textContent = allowed
      ? `Round ${state.round} — pick a letter`
      : `Round ${state.round}`;
    if (!allowed) return;

    letterGrid.innerHTML = "";
    ALPHABET.forEach((letter) => {
      const btn = document.createElement("button");
      btn.className = "letter-btn";
      btn.textContent = letter;
      if (state.usedLetters.includes(letter)) {
        btn.disabled = true;
        btn.style.opacity = 0.3;
      } else {
        btn.addEventListener("click", () => game.dispatch({ type: "pickLetter", letter }, view.mySlot));
      }
      letterGrid.appendChild(btn);
    });
  }

  spinBtn.addEventListener("click", () => {
    const state = game.state;
    if (!state) return;
    const available = ALPHABET.filter((l) => !state.usedLetters.includes(l));
    if (!available.length) return;
    game.dispatch({ type: "pickLetter", letter: pickRandom(available) }, game.view.mySlot);
  });

  // ---- filling ----

  function mySlotFor(state, view) {
    if (view.isOnline) return view.mySlot;
    const active = CategoriesRules.activeFillers(state);
    return active.length ? active[0] : 0;
  }

  function renderFillPhase(state, view) {
    const slot = mySlotFor(state, view);
    const active = CategoriesRules.activeFillers(state);
    const iAmFilling = active.includes(slot);

    timerDisplay.textContent = formatSeconds(state.secondsLeft);
    setTimerClass(timerDisplay, state.secondsLeft, state.fillTime);

    const key = `${state.round}:${state.letter}:${slot}`;
    if (key !== fieldsBuiltFor) {
      fieldsBuiltFor = key;
      buildFields(state);
      if (iAmFilling) {
        BabeNotify.notify(
          view.isOnline ? "Go!" : `${state.names[slot]}'s turn`,
          `Fill in every category starting with "${state.letter}".`,
          { sound: "turn", basePath: "../" }
        );
      }
    }

    fillBanner.textContent = iAmFilling
      ? `Letter "${state.letter}" — go!`
      : `Letter "${state.letter}"`;
    fillBanner.className = "turn-banner" + (iAmFilling ? " mine" : "");

    fillFields.style.display = iAmFilling ? "block" : "none";
    lockInBtn.style.display = iAmFilling ? "inline-block" : "none";
    fillWait.style.display = iAmFilling ? "none" : "block";
    if (!iAmFilling) {
      const waitingOn = active.map((i) => state.names[i]).join(", ");
      fillWait.textContent = state.submitted[slot]
        ? `Locked in! Waiting for ${waitingOn || "the others"}…`
        : `Waiting for ${waitingOn || "the others"}…`;
    }

    if (state.secondsLeft === 5 && iAmFilling) BabeNotify.playSound("tick");

    // Clock hit zero — push whatever is typed before the host's backstop.
    if (state.secondsLeft === 0 && iAmFilling && submittedFor !== key) {
      submittedFor = key;
      submitAnswers(slot);
    }
  }

  function buildFields(state) {
    fillFields.innerHTML = "";
    CATS.forEach((cat) => {
      const row = document.createElement("div");
      row.className = "cat-row";
      row.innerHTML = `
        <label>${cat}</label>
        <input type="text" data-cat="${cat}" autocomplete="off" placeholder="${state.letter}..." />
      `;
      fillFields.appendChild(row);
    });
    const first = fillFields.querySelector("input");
    if (first) first.focus();
  }

  function collectAnswers() {
    const answers = {};
    fillFields.querySelectorAll("[data-cat]").forEach((input) => {
      answers[input.dataset.cat] = input.value;
    });
    return answers;
  }

  function submitAnswers(slot) {
    game.dispatch({ type: "submit", answers: collectAnswers() }, slot);
  }

  lockInBtn.addEventListener("click", () => {
    const state = game.state;
    if (!state) return;
    const slot = mySlotFor(state, game.view);
    submittedFor = `${state.round}:${state.letter}:${slot}`;
    submitAnswers(slot);
  });

  // ---- review ----

  function renderReviewPhase(state, view) {
    if (state.rev === lastReviewRev) return;
    lastReviewRev = state.rev;

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";

    const head = document.createElement("tr");
    head.innerHTML = `<th style="text-align:left;padding:8px;font-size:0.8rem;color:var(--text-dim);">Category</th>` +
      state.names.map((n) => `<th style="text-align:left;padding:8px;font-size:0.8rem;">${escapeHtml(n)}</th>`).join("");
    table.appendChild(head);

    CATS.forEach((cat) => {
      const tr = document.createElement("tr");
      const label = document.createElement("td");
      label.style.padding = "6px 8px";
      label.style.color = "var(--text-dim)";
      label.style.fontSize = "0.85rem";
      label.textContent = cat;
      tr.appendChild(label);

      state.names.forEach((_, slot) => {
        const td = document.createElement("td");
        td.style.padding = "4px";
        const value = (state.answers[slot] && state.answers[slot][cat]) || "";
        const valid = state.marks[cat][slot];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "letter-btn" + (valid ? " chosen" : "");
        btn.style.width = "100%";
        btn.style.textAlign = "left";
        btn.style.padding = "8px 10px";
        btn.style.fontWeight = "600";
        btn.textContent = `${value || "(blank)"} ${valid ? "✓" : "✗"}`;
        btn.addEventListener("click", () => game.dispatch({ type: "toggleMark", cat, slot }, view.mySlot));
        td.appendChild(btn);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    reviewTable.innerHTML = "";
    reviewTable.appendChild(table);
  }

  scoreBtn.addEventListener("click", () => game.dispatch({ type: "scoreRound" }, game.view.mySlot));

  // ---- summary ----

  function renderSummaryPhase(state, view) {
    const canDrive = !view.isOnline || view.isHost;
    nextRoundBtn.style.display = canDrive ? "inline-block" : "none";
    endGameBtn.style.display = canDrive ? "inline-block" : "none";
    summaryWait.style.display = canDrive ? "none" : "block";

    roundBreakdown.innerHTML = "";
    const list = document.createElement("div");
    list.className = "seat-row";
    state.names.forEach((name, slot) => {
      const div = document.createElement("div");
      div.className = "seat" + (view.isOnline && slot === view.mySlot ? " you" : "");
      div.innerHTML = `
        <div class="seat-name">${escapeHtml(name)}</div>
        <div class="seat-score">+${state.roundScores[slot]}</div>
        <div class="seat-sub">${state.totals[slot]} total</div>
      `;
      list.appendChild(div);
    });
    roundBreakdown.appendChild(list);
  }

  nextRoundBtn.addEventListener("click", () => {
    lastReviewRev = -1;
    fieldsBuiltFor = "";
    submittedFor = "";
    game.dispatch({ type: "nextRound" }, game.view.mySlot);
  });
  endGameBtn.addEventListener("click", () => game.dispatch({ type: "endGame" }, game.view.mySlot));

  // ---- game wiring ----

  const game = BabeGame.create({
    rules: CategoriesRules,
    render,
    onMatchStart(view) {
      fieldsBuiltFor = "";
      submittedFor = "";
      lastReviewRev = -1;
      BabeGameUI.showScreen("play-screen");
      BabeGameUI.setBar(
        view.isOnline ? `Playing <strong>${escapeHtml(view.peerName || "your partner")}</strong>` : "",
        "ok"
      );
    },
    onOver(state, view) {
      renderSeats(state, view, finalRow, state.totals);
      const best = Math.max(...state.totals);
      const leaders = state.names.filter((_, i) => state.totals[i] === best);
      winnerLine.textContent = leaders.length > 1
        ? `It's a tie between ${leaders.join(" & ")}!`
        : view.isOnline
        ? state.winner === view.mySlot ? "You win! \u{1F3C6}" : `${leaders[0]} wins!`
        : `${leaders[0]} wins! \u{1F3C6}`;
      BabeNotify.notify("Game over!", winnerLine.textContent, { sound: "win", basePath: "../" });
      pushHighScore("categories", { players: state.names.join(", "), score: best });
      rematchBtn.style.display = view.isOnline && !view.isHost ? "none" : "inline-block";
      BabeGameUI.showScreen("end-screen");
      if (view.isOnline) {
        BabeGameUI.setBar(
          view.isHost ? "Tap Play Again to start another game." : "Waiting for the host to start another game…",
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
    return { fillTime: parseInt(fillTimeSelect.value, 10) };
  }

  const ui = BabeGameUI.bind({
    game,
    getConfig: config,
    getLocalNames: localNames,
    onStarted() {
      fieldsBuiltFor = "";
      submittedFor = "";
      lastReviewRev = -1;
    },
  });

  rematchBtn.addEventListener("click", () => {
    fieldsBuiltFor = "";
    submittedFor = "";
    lastReviewRev = -1;
    if (game.mode === "online") game.hostStart(config());
    else game.startLocal({ ...config(), names: localNames() });
    BabeGameUI.showScreen("play-screen");
  });
})();
