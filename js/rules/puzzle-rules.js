// Pure game rules for the Photo Puzzle.
// Online play is a race: both players get the SAME picture and the SAME
// starting shuffle (derived from a shared seed), solve their own board, and
// first one home wins. Only progress is synced, not every tile swap.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PuzzleRules = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  function makeRng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(list, seed) {
    const rng = makeRng(seed);
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // The starting arrangement: value at position i is the tile that sits there.
  function startingOrder(n, seed) {
    const tiles = Array.from({ length: n * n }, (_, i) => i);
    let order = seededShuffle(tiles, seed);
    if (order.every((tile, i) => tile === i)) {
      [order[0], order[1]] = [order[1], order[0]];
    }
    return order;
  }

  function createState(config) {
    const names = config.names || ["Player 1", "Player 2"];
    const n = config.n || 4;
    const seed = config.seed || Math.floor(Math.random() * 1e9);
    return {
      game: "puzzle",
      names,
      n,
      seed,
      variant: config.variant || "sunset",
      customImage: config.customImage || null,
      solo: !!config.solo,
      order: startingOrder(n, seed),
      progress: names.map(() => 0),
      moves: names.map(() => 0),
      finished: names.map(() => null),
      startedAt: config.startedAt || Date.now(),
      over: false,
      winner: null,
      message: "",
      rev: 0,
    };
  }

  function applyAction(state, action, slot) {
    if (state.over) return null;
    if (slot == null || slot < 0 || slot >= state.names.length) return null;

    if (action.type === "progress") {
      const progress = state.progress.slice();
      const moves = state.moves.slice();
      progress[slot] = Math.max(0, Math.min(state.n * state.n, action.correct | 0));
      moves[slot] = Math.max(0, action.moves | 0);
      return { ...state, progress, moves, rev: state.rev + 1 };
    }

    if (action.type === "solved") {
      if (state.finished[slot] != null) return null;
      const finished = state.finished.slice();
      const progress = state.progress.slice();
      const moves = state.moves.slice();
      finished[slot] = Math.max(0, action.ms | 0);
      progress[slot] = state.n * state.n;
      moves[slot] = Math.max(0, action.moves | 0);

      // First one home wins and the race is over.
      const firstHome = finished
        .map((ms, i) => ({ ms, i }))
        .filter((e) => e.ms != null)
        .sort((a, b) => a.ms - b.ms)[0];

      return {
        ...state,
        finished,
        progress,
        moves,
        over: true,
        winner: firstHome ? firstHome.i : null,
        message: `${state.names[slot]} solved it!`,
        rev: state.rev + 1,
      };
    }

    return null;
  }

  function isOver(state) {
    return !!state.over;
  }

  return { createState, applyAction, isOver, startingOrder, makeRng, seededShuffle };
});
