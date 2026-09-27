// Pure game rules for Ncho. Two variants share this module:
//
//   "four"    - the main Ncho: any pit that ends up holding exactly four
//               seeds is collected. Normally the owner of that pit takes
//               them, but if your last sown seed is what made it four, you
//               take them even when the pit is on your opponent's side.
//               The houses are collecting bowls, not playing pits.
//
//   "classic" - the Mancala/Ayo style game: sow into your own store, land
//               your last seed in an empty pit of yours to capture what
//               faces it, land in your store to go again.
//
// No DOM, no globals - the same module drives local play, online play and
// the tests.
//
// Board indices: 0-5 = slot 0's pits, 6 = slot 0's house,
//                7-12 = slot 1's pits, 13 = slot 1's house.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NchoRules = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  const P1_PITS = [0, 1, 2, 3, 4, 5];
  const P2_PITS = [7, 8, 9, 10, 11, 12];
  const P1_HOUSE = 6;
  const P2_HOUSE = 13;
  const PLAY_PITS = P1_PITS.concat(P2_PITS);
  const CAPTURE_AT = 4;
  const STALE_MOVE_LIMIT = 60;

  const pitsOf = (slot) => (slot === 0 ? P1_PITS : P2_PITS);
  const houseOf = (slot) => (slot === 0 ? P1_HOUSE : P2_HOUSE);
  const ownerOf = (pit) => (P1_PITS.includes(pit) ? 0 : 1);
  const oppositePit = (i) => 12 - i;

  function createState(config) {
    const seedsPerPit = config.seedsPerPit || 4;
    const variant = config.variant === "classic" ? "classic" : "four";
    const pits = new Array(14).fill(0);
    PLAY_PITS.forEach((i) => (pits[i] = seedsPerPit));
    return {
      game: "ncho",
      variant,
      names: config.names || ["Player 1", "Player 2"],
      seedsPerPit,
      pits,
      turn: 0,
      over: false,
      winner: null,
      message: "",
      lastMove: null,
      movesSinceCapture: 0,
      rev: 0,
    };
  }

  function legalMoves(state, slot) {
    if (state.over || slot !== state.turn) return [];
    return pitsOf(slot).filter((i) => state.pits[i] > 0);
  }

  function seedsOnBoard(pits) {
    return PLAY_PITS.reduce((total, i) => total + pits[i], 0);
  }

  function applyAction(state, action, slot) {
    if (!action || action.type !== "sow") return null;
    if (state.over) return null;
    if (slot !== state.turn) return null;
    const pit = action.pit;
    if (!pitsOf(slot).includes(pit)) return null;
    if (state.pits[pit] === 0) return null;

    return state.variant === "classic" ? sowClassic(state, pit, slot) : sowFour(state, pit, slot);
  }

  // ---------------- the main Ncho: capture on four ----------------

  function sowFour(state, pit, slot) {
    const before = state.pits.slice();
    const pits = state.pits.slice();

    let seeds = pits[pit];
    pits[pit] = 0;
    let idx = pit;
    const path = [];

    while (seeds > 0) {
      idx = (idx + 1) % 14;
      if (idx === P1_HOUSE || idx === P2_HOUSE) continue; // houses aren't sown into
      pits[idx] += 1;
      path.push(idx);
      seeds -= 1;
    }

    // Only pits this sowing actually dropped a seed into can be collected —
    // otherwise the opening board (every pit already on four) would be
    // swept on the very first move. Of those, any now sitting on exactly
    // four goes to the pit's owner, except the pit the last seed landed in,
    // which belongs to whoever sowed it.
    const captures = [];
    [...new Set(path)].forEach((i) => {
      if (pits[i] !== CAPTURE_AT) return;
      const collector = i === idx ? slot : ownerOf(i);
      captures.push({ pit: i, by: collector, seeds: CAPTURE_AT, viaLastSeed: i === idx });
      pits[houseOf(collector)] += CAPTURE_AT;
      pits[i] = 0;
    });

    const mine = captures.filter((c) => c.by === slot).length;
    const theirs = captures.length - mine;
    let message = "";
    if (mine && theirs) message = `You collected ${mine * CAPTURE_AT}, they collected ${theirs * CAPTURE_AT}.`;
    else if (mine) message = `Collected ${mine * CAPTURE_AT} seeds!`;
    else if (theirs) message = `${state.names[1 - slot]} collected ${theirs * CAPTURE_AT}.`;

    const next = {
      ...state,
      pits,
      turn: 1 - slot,
      message,
      lastMove: { slot, from: pit, path, before, captures, extraTurn: false },
      movesSinceCapture: captures.length ? 0 : state.movesSinceCapture + 1,
      rev: state.rev + 1,
    };

    return settleFour(next);
  }

  function settleFour(state) {
    const pits = state.pits.slice();
    const left = seedsOnBoard(pits);

    // Nobody can reach four any more, so the rest is dead wood.
    if (left < CAPTURE_AT) {
      return finish({ ...state, pits }, "Too few seeds left to make four — game over.");
    }

    // The player to move has nothing to sow: whoever still holds seeds
    // takes everything left on the board.
    const toMove = state.turn;
    const stuck = pitsOf(toMove).every((i) => pits[i] === 0);
    if (stuck) {
      const collector = 1 - toMove;
      let swept = 0;
      PLAY_PITS.forEach((i) => { swept += pits[i]; pits[i] = 0; });
      pits[houseOf(collector)] += swept;
      return finish(
        { ...state, pits },
        `${state.names[toMove]} has nothing left to sow — ${state.names[collector]} takes the last ${swept}.`
      );
    }

    // Safety net so a shuffling stalemate can't run forever.
    if (state.movesSinceCapture >= STALE_MOVE_LIMIT) {
      [0, 1].forEach((s) => {
        pitsOf(s).forEach((i) => { pits[houseOf(s)] += pits[i]; pits[i] = 0; });
      });
      return finish({ ...state, pits }, "No captures for a long stretch — everyone keeps their own side.");
    }

    return state;
  }

  // ---------------- the Mancala/Ayo style variant ----------------

  function sowClassic(state, pit, slot) {
    const before = state.pits.slice();
    const pits = state.pits.slice();
    const ownHouse = houseOf(slot);
    const opponentHouse = houseOf(1 - slot);

    let seeds = pits[pit];
    pits[pit] = 0;
    let idx = pit;
    const path = [];

    while (seeds > 0) {
      idx = (idx + 1) % 14;
      if (idx === opponentHouse) continue;
      pits[idx] += 1;
      path.push(idx);
      seeds -= 1;
    }

    const captures = [];
    let extraTurn = false;
    let message = "";

    if (idx === ownHouse) {
      extraTurn = true;
      message = "Landed in your house — go again!";
    } else if (pitsOf(slot).includes(idx) && pits[idx] === 1 && pits[oppositePit(idx)] > 0) {
      const opp = oppositePit(idx);
      const total = pits[idx] + pits[opp];
      pits[ownHouse] += total;
      captures.push({ pit: idx, opposite: opp, by: slot, seeds: total });
      pits[idx] = 0;
      pits[opp] = 0;
      message = `Capture! +${total} seeds.`;
    }

    const next = {
      ...state,
      pits,
      turn: extraTurn ? slot : 1 - slot,
      message,
      lastMove: { slot, from: pit, path, before, captures, extraTurn },
      rev: state.rev + 1,
    };

    return settleClassic(next);
  }

  function settleClassic(state) {
    const pits = state.pits.slice();
    const p1Empty = P1_PITS.every((i) => pits[i] === 0);
    const p2Empty = P2_PITS.every((i) => pits[i] === 0);
    if (!p1Empty && !p2Empty) return state;

    let swept = 0;
    if (!p1Empty) P1_PITS.forEach((i) => { pits[P1_HOUSE] += pits[i]; swept += pits[i]; pits[i] = 0; });
    if (!p2Empty) P2_PITS.forEach((i) => { pits[P2_HOUSE] += pits[i]; swept += pits[i]; pits[i] = 0; });

    return finish({ ...state, pits }, swept ? "Board cleared — leftover seeds swept home." : state.message);
  }

  // ---------------- shared ----------------

  function finish(state, message) {
    const a = state.pits[P1_HOUSE];
    const b = state.pits[P2_HOUSE];
    return {
      ...state,
      over: true,
      winner: a === b ? -1 : a > b ? 0 : 1,
      message,
    };
  }

  function scores(state) {
    return [state.pits[P1_HOUSE], state.pits[P2_HOUSE]];
  }

  function isOver(state) {
    return !!state.over;
  }

  return {
    createState,
    applyAction,
    legalMoves,
    scores,
    isOver,
    seedsOnBoard,
    constants: {
      P1_PITS, P2_PITS, P1_HOUSE, P2_HOUSE, PLAY_PITS,
      CAPTURE_AT, oppositePit, ownerOf, houseOf, pitsOf,
    },
  };
});
