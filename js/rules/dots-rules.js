// Pure game rules for Dots and Boxes.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DotsRules = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  function createState(config) {
    const n = config.n || 3;
    const turnTime = config.turnTime || 0;
    return {
      game: "dots",
      names: config.names || ["Player 1", "Player 2"],
      n,
      turnTime,
      secondsLeft: turnTime,
      h: Array.from({ length: n + 1 }, () => Array(n).fill(-1)),
      v: Array.from({ length: n }, () => Array(n + 1).fill(-1)),
      owner: Array.from({ length: n }, () => Array(n).fill(-1)),
      scores: [0, 0],
      turn: 0,
      claimed: 0,
      over: false,
      winner: null,
      message: "",
      lastMove: null,
      rev: 0,
    };
  }

  function edgeTaken(state, o, r, c) {
    const grid = o === "h" ? state.h : state.v;
    if (!grid[r] || grid[r][c] === undefined) return true;
    return grid[r][c] !== -1;
  }

  function boxComplete(h, v, r, c) {
    return h[r][c] !== -1 && h[r + 1][c] !== -1 && v[r][c] !== -1 && v[r][c + 1] !== -1;
  }

  function applyAction(state, action, slot) {
    if (state.over) return null;
    if (!action) return null;

    if (action.type === "timeout") {
      // only the authority issues this, via tick()
      return {
        ...state,
        turn: 1 - state.turn,
        secondsLeft: state.turnTime,
        message: `${state.names[state.turn]} ran out of time — turn passes.`,
        lastMove: null,
        rev: state.rev + 1,
      };
    }

    if (action.type !== "claim") return null;
    if (slot !== state.turn) return null;

    const { o, r, c } = action;
    if (o !== "h" && o !== "v") return null;
    if (edgeTaken(state, o, r, c)) return null;

    const h = state.h.map((row) => row.slice());
    const v = state.v.map((row) => row.slice());
    const owner = state.owner.map((row) => row.slice());
    const scores = state.scores.slice();
    const n = state.n;

    if (o === "h") h[r][c] = slot;
    else v[r][c] = slot;

    const gained = [];
    const candidates = o === "h"
      ? [[r - 1, c], [r, c]]
      : [[r, c - 1], [r, c]];

    candidates.forEach(([br, bc]) => {
      if (br < 0 || bc < 0 || br >= n || bc >= n) return;
      if (owner[br][bc] !== -1) return;
      if (!boxComplete(h, v, br, bc)) return;
      owner[br][bc] = slot;
      scores[slot] += 1;
      gained.push([br, bc]);
    });

    const claimed = state.claimed + gained.length;
    const over = claimed >= n * n;

    return {
      ...state,
      h, v, owner, scores, claimed, over,
      winner: over ? (scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1) : null,
      turn: gained.length ? slot : 1 - slot,
      secondsLeft: state.turnTime,
      message: gained.length ? `${state.names[slot]} claimed ${gained.length} box${gained.length > 1 ? "es" : ""} — go again!` : "",
      lastMove: { slot, o, r, c, gained },
      rev: state.rev + 1,
    };
  }

  function wantsTimer(state) {
    return !state.over && state.turnTime > 0;
  }

  function tick(state) {
    if (!wantsTimer(state)) return null;
    const secondsLeft = state.secondsLeft - 1;
    if (secondsLeft > 0) return { ...state, secondsLeft };
    return applyAction({ ...state, secondsLeft: 0 }, { type: "timeout" }, state.turn);
  }

  function isOver(state) {
    return !!state.over;
  }

  return { createState, applyAction, tick, wantsTimer, isOver };
});
