(function () {
  const setupScreen = document.getElementById("setup-screen");
  const gameScreen = document.getElementById("game-screen");
  const endScreen = document.getElementById("end-screen");

  const imageChoiceRow = document.getElementById("image-choice-row");
  const uploadInput = document.getElementById("upload-input");
  const gridSizeSelect = document.getElementById("grid-size");
  const startBtn = document.getElementById("start-btn");

  const timeDisplay = document.getElementById("time-display");
  const movesDisplay = document.getElementById("moves-display");
  const puzzleBoard = document.getElementById("puzzle-board");
  const feedback = document.getElementById("feedback");
  const giveUpBtn = document.getElementById("give-up-btn");

  const finalTime = document.getElementById("final-time");
  const finalMoves = document.getElementById("final-moves");
  const playAgainBtn = document.getElementById("play-again");

  let chosenImage = null;
  let state = null;
  let tickHandle = null;

  // ---- built-in placeholder pictures, drawn on canvas so no external
  // image files are needed ----

  function makeBuiltinImage(variant) {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;

    if (variant === "sunset") {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#ff7a3d");
      g.addColorStop(1, "#3d1a4a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.4, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 100 - 20, h);
        ctx.lineTo(i * 100 + 40, h * 0.65);
        ctx.lineTo(i * 100 + 100, h);
        ctx.fill();
      }
    } else if (variant === "ocean") {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#35e0a1");
      g.addColorStop(1, "#123a5c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 6;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 100 + i * 60);
        for (let x = 0; x <= w; x += 40) {
          ctx.lineTo(x, 100 + i * 60 + Math.sin(x / 40) * 12);
        }
        ctx.stroke();
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#ff4d97");
      g.addColorStop(1, "#251536");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return canvas.toDataURL("image/png");
  }

  const BUILTIN_IMAGES = [
    { id: "sunset", label: "Sunset" },
    { id: "ocean", label: "Ocean" },
    { id: "bloom", label: "Bloom" },
  ];

  function renderImageChoices() {
    imageChoiceRow.innerHTML = "";
    BUILTIN_IMAGES.forEach((img, idx) => {
      const url = makeBuiltinImage(img.id);
      const el = document.createElement("div");
      el.className = "image-choice" + (idx === 0 ? " chosen" : "");
      el.style.backgroundImage = `url(${url})`;
      el.title = img.label;
      el.addEventListener("click", () => {
        chosenImage = url;
        [...imageChoiceRow.children].forEach((c) => c.classList.remove("chosen"));
        el.classList.add("chosen");
      });
      imageChoiceRow.appendChild(el);
      if (idx === 0) chosenImage = url;
    });
  }
  renderImageChoices();

  uploadInput.addEventListener("change", () => {
    const file = uploadInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      chosenImage = reader.result;
      [...imageChoiceRow.children].forEach((c) => c.classList.remove("chosen"));
    };
    reader.readAsDataURL(file);
  });

  // ---- puzzle logic ----

  function startGame() {
    const n = parseInt(gridSizeSelect.value, 10);
    const tiles = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        tiles.push({ correctRow: r, correctCol: c, correctIndex: r * n + c });
      }
    }

    let slots = shuffleArray(tiles);
    // make sure it isn't already solved
    if (slots.every((t, i) => t.correctIndex === i)) {
      [slots[0], slots[1]] = [slots[1], slots[0]];
    }

    state = {
      n,
      image: chosenImage,
      slots,
      selectedSlot: null,
      moves: 0,
      startedAt: Date.now(),
      solved: false,
    };

    setupScreen.style.display = "none";
    gameScreen.style.display = "block";
    endScreen.style.display = "none";
    feedback.textContent = "";
    feedback.className = "feedback";
    movesDisplay.textContent = "0";

    buildBoard();
    startTicker();
  }

  function buildBoard() {
    const n = state.n;
    puzzleBoard.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    puzzleBoard.innerHTML = "";
    state.slots.forEach((tile, slotIndex) => {
      const el = document.createElement("div");
      el.className = "puzzle-tile";
      el.dataset.slot = slotIndex;
      el.style.backgroundImage = `url(${state.image})`;
      el.style.backgroundSize = `${n * 100}% ${n * 100}%`;
      const denom = n - 1 || 1;
      el.style.backgroundPosition = `${(tile.correctCol / denom) * 100}% ${(tile.correctRow / denom) * 100}%`;
      el.addEventListener("click", () => onTileClick(slotIndex));
      puzzleBoard.appendChild(el);
    });
  }

  function onTileClick(slotIndex) {
    if (state.solved) return;
    const tiles = [...puzzleBoard.children];
    if (state.selectedSlot === null) {
      state.selectedSlot = slotIndex;
      tiles[slotIndex].classList.add("selected");
      return;
    }
    if (state.selectedSlot === slotIndex) {
      tiles[slotIndex].classList.remove("selected");
      state.selectedSlot = null;
      return;
    }
    // swap
    [state.slots[state.selectedSlot], state.slots[slotIndex]] = [state.slots[slotIndex], state.slots[state.selectedSlot]];
    state.moves += 1;
    movesDisplay.textContent = state.moves;
    tiles[state.selectedSlot].classList.remove("selected");
    state.selectedSlot = null;
    buildBoard();
    checkSolved();
  }

  function checkSolved() {
    if (state.slots.every((t, i) => t.correctIndex === i)) {
      state.solved = true;
      stopTicker();
      BabeNotify.playSound("win");
      endGame();
    }
  }

  function startTicker() {
    stopTicker();
    tickHandle = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      timeDisplay.textContent = formatSeconds(elapsed);
    }, 1000);
  }

  function stopTicker() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function endGame() {
    gameScreen.style.display = "none";
    endScreen.style.display = "block";
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    finalTime.textContent = formatSeconds(elapsed);
    finalMoves.textContent = state.moves;

    BabeNotify.notify("Puzzle solved!", `Done in ${formatSeconds(elapsed)} with ${state.moves} swaps.`, {
      sound: "win",
      basePath: "../",
    });

    const active = BabeProfiles.getActive();
    const score = Math.max(0, 10000 - elapsed * 10 - state.moves * 5);
    pushHighScore("puzzle", {
      players: (active && active.name) || "Player",
      score,
    });
  }

  giveUpBtn.addEventListener("click", () => {
    stopTicker();
    setupScreen.style.display = "block";
    gameScreen.style.display = "none";
    endScreen.style.display = "none";
  });

  startBtn.addEventListener("click", startGame);
  playAgainBtn.addEventListener("click", () => {
    setupScreen.style.display = "block";
    gameScreen.style.display = "none";
    endScreen.style.display = "none";
  });
})();
