(function () {
  const CATEGORIES = ["Name", "Place", "Animal", "Thing", "Food"];
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const setupScreen = document.getElementById("setup-screen");
  const letterScreen = document.getElementById("letter-screen");
  const turnScreen = document.getElementById("turn-screen");
  const scoringScreen = document.getElementById("scoring-screen");
  const summaryScreen = document.getElementById("summary-screen");
  const endScreen = document.getElementById("end-screen");

  const playersList = document.getElementById("players-list");
  const addPlayerBtn = document.getElementById("add-player");
  const timeSelect = document.getElementById("time");
  const startBtn = document.getElementById("start-btn");

  const spinLetterBtn = document.getElementById("spin-letter");
  const letterGrid = document.getElementById("letter-grid");

  const turnRoundLabel = document.getElementById("turn-round-label");
  const turnPlayerLabel = document.getElementById("turn-player-label");
  const timerDisplay = document.getElementById("timer-display");
  const turnFields = document.getElementById("turn-fields");
  const lockInBtn = document.getElementById("lock-in");

  const scoringTable = document.getElementById("scoring-table");
  const finishRoundBtn = document.getElementById("finish-round");

  const summaryScores = document.getElementById("summary-scores");
  const newRoundBtn = document.getElementById("new-round");
  const endGameBtn = document.getElementById("end-game");

  const winnerLine = document.getElementById("winner-line");
  const finalScores = document.getElementById("final-scores");
  const playAgainBtn = document.getElementById("play-again");

  let state = null;

  function renderPlayersList() {
    playersList.innerHTML = "";
    const count = playersList.dataset.count ? parseInt(playersList.dataset.count, 10) : 2;
    for (let i = 0; i < count; i++) {
      const row = document.createElement("div");
      row.className = "field";
      row.innerHTML = `<input type="text" placeholder="Player ${i + 1}" data-player-input />`;
      playersList.appendChild(row);
    }
    playersList.dataset.count = count;
  }
  renderPlayersList();

  document.addEventListener("DOMContentLoaded", () => {
    const active = BabeProfiles.getActive();
    const first = playersList.querySelector("[data-player-input]");
    if (active && first && !first.value) first.value = active.name;
  });

  addPlayerBtn.addEventListener("click", () => {
    const count = parseInt(playersList.dataset.count, 10) + 1;
    if (count > 6) return;
    playersList.dataset.count = count;
    renderPlayersListPreserving();
  });

  function renderPlayersListPreserving() {
    const existing = [...playersList.querySelectorAll("[data-player-input]")].map((i) => i.value);
    const count = parseInt(playersList.dataset.count, 10);
    playersList.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const row = document.createElement("div");
      row.className = "field";
      row.innerHTML = `<input type="text" placeholder="Player ${i + 1}" data-player-input value="${existing[i] || ""}" />`;
      playersList.appendChild(row);
    }
  }

  function startGame() {
    const names = [...playersList.querySelectorAll("[data-player-input]")]
      .map((el, i) => el.value.trim() || `Player ${i + 1}`);
    state = {
      players: names,
      totals: names.map(() => 0),
      timePerTurn: parseInt(timeSelect.value, 10),
      usedLetters: [],
      currentLetter: null,
      turnIndex: 0,
      answers: names.map(() => ({})),
      timer: null,
      roundNumber: 1,
    };
    goToLetterScreen();
  }

  function goToLetterScreen() {
    setupScreen.style.display = "none";
    letterScreen.style.display = "block";
    turnScreen.style.display = "none";
    scoringScreen.style.display = "none";
    summaryScreen.style.display = "none";
    endScreen.style.display = "none";
    renderLetterGrid();
  }

  function renderLetterGrid() {
    letterGrid.innerHTML = "";
    ALPHABET.forEach((letter) => {
      const btn = document.createElement("button");
      btn.className = "letter-btn";
      btn.textContent = letter;
      if (state.usedLetters.includes(letter)) {
        btn.disabled = true;
        btn.style.opacity = 0.3;
      }
      btn.addEventListener("click", () => chooseLetter(letter));
      letterGrid.appendChild(btn);
    });
  }

  spinLetterBtn.addEventListener("click", () => {
    const available = ALPHABET.filter((l) => !state.usedLetters.includes(l));
    if (available.length === 0) return;
    chooseLetter(pickRandom(available));
  });

  function chooseLetter(letter) {
    state.currentLetter = letter;
    state.usedLetters.push(letter);
    state.turnIndex = 0;
    state.answers = state.players.map(() => ({}));
    startTurn();
  }

  function startTurn() {
    letterScreen.style.display = "none";
    turnScreen.style.display = "block";

    const playerName = state.players[state.turnIndex];
    turnRoundLabel.textContent = `Letter "${state.currentLetter}" · Player ${state.turnIndex + 1} of ${state.players.length}`;
    turnPlayerLabel.textContent = `${playerName}'s turn`;

    turnFields.innerHTML = "";
    CATEGORIES.forEach((cat) => {
      const row = document.createElement("div");
      row.className = "cat-row";
      row.innerHTML = `
        <label>${cat}</label>
        <input type="text" data-cat="${cat}" placeholder="${state.currentLetter}..." />
      `;
      turnFields.appendChild(row);
    });

    lockInBtn.disabled = false;
    BabeNotify.notify(`${playerName}'s turn!`, `Fill in Name, Place, Animal, Thing, Food for "${state.currentLetter}".`, { sound: "turn", basePath: "../" });

    state.timer = new CountdownTimer(
      state.timePerTurn,
      (secondsLeft) => {
        timerDisplay.textContent = formatSeconds(secondsLeft);
        setTimerClass(timerDisplay, secondsLeft, state.timePerTurn);
        if (secondsLeft === 5) BabeNotify.playSound("tick");
      },
      () => finishTurn()
    );
    state.timer.start();
  }

  function finishTurn() {
    if (state.timer) state.timer.stop();
    const answers = {};
    turnFields.querySelectorAll("[data-cat]").forEach((input) => {
      answers[input.dataset.cat] = input.value.trim();
    });
    state.answers[state.turnIndex] = answers;

    state.turnIndex += 1;
    if (state.turnIndex < state.players.length) {
      startTurn();
    } else {
      goToScoring();
    }
  }

  lockInBtn.addEventListener("click", finishTurn);

  function goToScoring() {
    turnScreen.style.display = "none";
    scoringScreen.style.display = "block";
    renderScoringTable();
  }

  function renderScoringTable() {
    // marks[category][playerIndex] = true/false (valid or not), default: valid if non-empty
    state.marks = CATEGORIES.map((cat) =>
      state.players.map((_, pIdx) => {
        const val = state.answers[pIdx][cat] || "";
        return val.trim().length > 0;
      })
    );

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";

    const thead = document.createElement("tr");
    thead.innerHTML = `<th style="text-align:left;padding:8px;">Category</th>` +
      state.players.map((p) => `<th style="text-align:left;padding:8px;">${p}</th>`).join("");
    table.appendChild(thead);

    CATEGORIES.forEach((cat, catIdx) => {
      const tr = document.createElement("tr");
      const catCell = document.createElement("td");
      catCell.style.padding = "8px";
      catCell.style.color = "var(--text-dim)";
      catCell.textContent = cat;
      tr.appendChild(catCell);

      state.players.forEach((_, pIdx) => {
        const td = document.createElement("td");
        td.style.padding = "6px";
        const val = state.answers[pIdx][cat] || "(blank)";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "letter-btn";
        btn.style.width = "100%";
        btn.style.textAlign = "left";
        btn.style.padding = "8px 10px";
        const setLook = () => {
          btn.classList.toggle("chosen", state.marks[catIdx][pIdx]);
          btn.textContent = `${val} ${state.marks[catIdx][pIdx] ? "✓" : "✗"}`;
        };
        setLook();
        btn.addEventListener("click", () => {
          state.marks[catIdx][pIdx] = !state.marks[catIdx][pIdx];
          setLook();
        });
        td.appendChild(btn);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    scoringTable.innerHTML = "";
    scoringTable.appendChild(table);
  }

  finishRoundBtn.addEventListener("click", () => {
    // scoring: valid + unique among players who also marked it valid = 10, valid but shared = 5
    CATEGORIES.forEach((cat, catIdx) => {
      const validPlayers = state.players
        .map((_, pIdx) => pIdx)
        .filter((pIdx) => state.marks[catIdx][pIdx]);

      validPlayers.forEach((pIdx) => {
        const myAnswer = (state.answers[pIdx][cat] || "").trim().toLowerCase();
        const isDuplicate = validPlayers.some(
          (otherIdx) =>
            otherIdx !== pIdx &&
            (state.answers[otherIdx][cat] || "").trim().toLowerCase() === myAnswer
        );
        state.totals[pIdx] += isDuplicate ? 5 : 10;
      });
    });

    goToSummary();
  });

  function goToSummary() {
    scoringScreen.style.display = "none";
    summaryScreen.style.display = "block";
    summaryScores.innerHTML = "";
    state.players.forEach((name, i) => {
      const box = document.createElement("div");
      box.className = "score-box";
      box.innerHTML = `<div class="name">${name}</div><div class="val">${state.totals[i]}</div>`;
      summaryScores.appendChild(box);
    });
  }

  newRoundBtn.addEventListener("click", () => {
    state.roundNumber += 1;
    goToLetterScreen();
  });

  endGameBtn.addEventListener("click", endGame);

  function endGame() {
    summaryScreen.style.display = "none";
    endScreen.style.display = "block";
    finalScores.innerHTML = "";
    let maxScore = Math.max(...state.totals);
    let winners = state.players.filter((_, i) => state.totals[i] === maxScore);

    state.players.forEach((name, i) => {
      const box = document.createElement("div");
      box.className = "score-box";
      box.innerHTML = `<div class="name">${name}</div><div class="val">${state.totals[i]}</div>`;
      finalScores.appendChild(box);
    });

    winnerLine.textContent = winners.length > 1
      ? `It's a tie between ${winners.join(" & ")}!`
      : `${winners[0]} wins! \u{1F3C6}`;
    BabeNotify.notify("Game over!", winnerLine.textContent, { sound: "win", basePath: "../" });

    pushHighScore("categories", {
      players: state.players.join(", "),
      score: maxScore,
    });
  }

  playAgainBtn.addEventListener("click", () => {
    endScreen.style.display = "none";
    setupScreen.style.display = "block";
  });

  startBtn.addEventListener("click", startGame);
})();
