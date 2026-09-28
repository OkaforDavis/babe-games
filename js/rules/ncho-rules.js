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
  // Relay sowing can in principle cycle forever on a contrived board, so a
  // single turn is capped. In real play it is never close to this.
  const MAX_DROPS_PER_TURN = 2000;

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
      lastCaptureBy: null,
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

  function nextPlayPit(idx) {
    let next = idx;
    do {
      next = (next + 1) % 14;
    } while (next === P1_HOUSE || next === P2_HOUSE); // houses are never sown into
    return next;
  }

  // Relay sowing: you keep going as long as your last seed drops into a pit
  // that already had seeds in it — you scoop that pit up, hand and all, and
  // carry on. The turn only ends when a seed comes to rest in an empty pit
  // (or when it makes a four, which gets lifted straight out, leaving
  // nothing in your hand to continue with).
  function sowFour(state, pit, slot) {
    const before = state.pits.slice();
    const pits = state.pits.slice();
    const steps = [];
    const captures = [];

    let hand = pits[pit];
    pits[pit] = 0;
    steps.push({ t: "pickup", pit, count: hand });

    let cursor = pit;
    let drops = 0;
    let done = false;

    while (!done) {
      while (hand > 0) {
        cursor = nextPlayPit(cursor);
        pits[cursor] += 1;
        hand -= 1;
        drops += 1;
        steps.push({ t: "drop", pit: cursor });

        // A pit landing on exactly four is lifted out there and then.
        if (pits[cursor] === CAPTURE_AT) {
          const lastInHand = hand === 0;
          const by = lastInHand ? slot : ownerOf(cursor);
          pits[houseOf(by)] += CAPTURE_AT;
          pits[cursor] = 0;
          captures.push({ pit: cursor, by, seeds: CAPTURE_AT, viaLastSeed: lastInHand });
          steps.push({ t: "capture", pit: cursor, by, seeds: CAPTURE_AT });
          // Collected with your final seed: nothing left to scoop up, so
          // the turn is over.
          if (lastInHand) done = true;
        }

        if (drops >= MAX_DROPS_PER_TURN) { done = true; break; }
      }
      if (done) break;

      // The hand is empty and the last seed is resting at the cursor.
      if (pits[cursor] === 1) break; // it landed in an empty pit: turn over
      hand = pits[cursor];
      pits[cursor] = 0;
      steps.push({ t: "pickup", pit: cursor, count: hand });
    }

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
      lastMove: { slot, from: pit, before, steps, captures, extraTurn: false },
      lastCaptureBy: captures.length ? captures[captures.length - 1].by : state.lastCaptureBy,
      movesSinceCapture: captures.length ? 0 : state.movesSinceCapture + 1,
      rev: state.rev + 1,
    };

    return settleFour(next);
  }

  function sweepTo(state, pits, collector) {
    let swept = 0;
    PLAY_PITS.forEach((i) => { swept += pits[i]; pits[i] = 0; });
    pits[houseOf(collector)] += swept;
    return swept;
  }

  function settleFour(state) {
    const pits = state.pits.slice();
    const left = seedsOnBoard(pits);

    if (left === 0) return finish({ ...state, pits }, "Every seed is home.");

    // The player to move has nothing to sow: whoever still holds seeds
    // takes everything left on the board.
    const toMove = state.turn;
    const stuck = pitsOf(toMove).every((i) => pits[i] === 0);
    if (stuck) {
      const collector = 1 - toMove;
      const swept = sweepTo(state, pits, collector);
      return finish(
        { ...state, pits },
        `${state.names[toMove]} has nothing left to sow — ${state.names[collector]} takes the last ${swept}.`
      );
    }

    // Down to the last four. Gathering them all into one pit to make a four
    // is not realistically going to happen, so rather than shuffle them
    // about forever they go to whoever collected most recently.
    if (left <= CAPTURE_AT) {
      const collector = state.lastCaptureBy;
      if (collector == null) {
        return finish({ ...state, pits }, "Too few seeds left to make four — game over.");
      }
      const swept = sweepTo(state, pits, collector);
      return finish(
        { ...state, pits },
        `Only ${swept} left and no way to make four — ${state.names[collector]} collected last, so they take them.`
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
    const steps = [];

    let seeds = pits[pit];
    pits[pit] = 0;
    steps.push({ t: "pickup", pit, count: seeds });
    let idx = pit;

    while (seeds > 0) {
      idx = (idx + 1) % 14;
      if (idx === opponentHouse) continue;
      pits[idx] += 1;
      steps.push({ t: "drop", pit: idx });
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
      const mine = pits[idx];
      const theirs = pits[opp];
      pits[ownHouse] += mine + theirs;
      pits[idx] = 0;
      pits[opp] = 0;
      captures.push({ pit: idx, opposite: opp, by: slot, seeds: mine + theirs });
      steps.push({ t: "capture", pit: opp, by: slot, seeds: theirs });
      steps.push({ t: "capture", pit: idx, by: slot, seeds: mine });
      message = `Capture! +${mine + theirs} seeds.`;
    }

    const next = {
      ...state,
      pits,
      turn: extraTurn ? slot : 1 - slot,
      message,
      lastMove: { slot, from: pit, before, steps, captures, extraTurn },
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
