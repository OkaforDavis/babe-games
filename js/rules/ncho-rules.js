// Pure game rules for Ncho (Mancala / Ayo family).
// No DOM, no globals — same module drives local play, online play and tests.
//
// Board indices: 0-5 = slot 0's pits, 6 = slot 0's store,
//                7-12 = slot 1's pits, 13 = slot 1's store.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NchoRules = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  const P1_PITS = [0, 1, 2, 3, 4, 5];
  const P2_PITS = [7, 8, 9, 10, 11, 12];
  const P1_STORE = 6;
  const P2_STORE = 13;

  const pitsOf = (slot) => (slot === 0 ? P1_PITS : P2_PITS);
  const storeOf = (slot) => (slot === 0 ? P1_STORE : P2_STORE);
  const oppositePit = (i) => 12 - i;

  function createState(config) {
    const seedsPerPit = config.seedsPerPit || 4;
    const pits = new Array(14).fill(0);
    P1_PITS.forEach((i) => (pits[i] = seedsPerPit));
    P2_PITS.forEach((i) => (pits[i] = seedsPerPit));
    return {
      game: "ncho",
      names: config.names || ["Player 1", "Player 2"],
      seedsPerPit,
      pits,
      turn: 0,
      over: false,
      winner: null,
      message: "",
      lastMove: null,
      rev: 0,
    };
  }

  function legalMoves(state, slot) {
    if (state.over || slot !== state.turn) return [];
    return pitsOf(slot).filter((i) => state.pits[i] > 0);
  }

  function applyAction(state, action, slot) {
    if (!action || action.type !== "sow") return null;
    if (state.over) return null;
    if (slot !== state.turn) return null;
    const pit = action.pit;
    if (!pitsOf(slot).includes(pit)) return null;
    if (state.pits[pit] === 0) return null;

    const pits = state.pits.slice();
    const ownStore = storeOf(slot);
    const opponentStore = storeOf(1 - slot);

    let seeds = pits[pit];
    pits[pit] = 0;
    let idx = pit;
    const path = [];

    while (seeds > 0) {
      idx = (idx + 1) % 14;
      if (idx === opponentStore) continue; // never sow into their store
      pits[idx] += 1;
      path.push(idx);
      seeds -= 1;
    }

    let captured = null;
    let extraTurn = false;
    let message = "";

    if (idx === ownStore) {
      extraTurn = true;
      message = "Landed in your store — go again!";
    } else if (pitsOf(slot).includes(idx) && pits[idx] === 1 && pits[oppositePit(idx)] > 0) {
      const opp = oppositePit(idx);
      const total = pits[idx] + pits[opp];
      pits[ownStore] += total;
      pits[idx] = 0;
      pits[opp] = 0;
      captured = { pit: idx, opposite: opp, total };
      message = `Capture! +${total} seeds.`;
    }

    let next = {
      ...state,
      pits,
      turn: extraTurn ? slot : 1 - slot,
      message,
      lastMove: { slot, from: pit, path, captured, extraTurn },
      rev: state.rev + 1,
    };

    return settleIfFinished(next);
  }

  // When one side runs out of seeds the other sweeps whatever is left on
  // their own side into their store, then scores are compared.
  function settleIfFinished(state) {
    const pits = state.pits.slice();
    const p1Empty = P1_PITS.every((i) => pits[i] === 0);
    const p2Empty = P2_PITS.every((i) => pits[i] === 0);
    if (!p1Empty && !p2Empty) return state;

    let swept = 0;
    if (!p1Empty) P1_PITS.forEach((i) => { pits[P1_STORE] += pits[i]; swept += pits[i]; pits[i] = 0; });
    if (!p2Empty) P2_PITS.forEach((i) => { pits[P2_STORE] += pits[i]; swept += pits[i]; pits[i] = 0; });

    const a = pits[P1_STORE];
    const b = pits[P2_STORE];
    return {
      ...state,
      pits,
      over: true,
      winner: a === b ? -1 : a > b ? 0 : 1,
      message: swept ? "Board cleared — leftover seeds swept home." : state.message,
    };
  }

  function scores(state) {
    return [state.pits[P1_STORE], state.pits[P2_STORE]];
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
    constants: { P1_PITS, P2_PITS, P1_STORE, P2_STORE, oppositePit },
  };
});
