// Pure game rules for Chain Naming (last letter starts the next word).
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChainRules = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  function createState(config) {
    const names = config.names || ["Player 1", "Player 2"];
    const turnTime = config.turnTime || 15;
    return {
      game: "chain",
      names,
      category: config.category || "mixed",
      turnTime,
      secondsLeft: turnTime,
      alive: names.map(() => true),
      turn: 0,
      used: [],
      lastWord: null,
      log: [],
      over: false,
      winner: null,
      message: "",
      rev: 0,
    };
  }

  function aliveCount(state) {
    return state.alive.filter(Boolean).length;
  }

  function nextAlive(state, from) {
    const n = state.names.length;
    for (let step = 1; step <= n; step++) {
      const idx = (from + step) % n;
      if (state.alive[idx]) return idx;
    }
    return from;
  }

  function validate(state, raw) {
    const text = String(raw || "").trim();
    if (text.length < 2) return { ok: false, reason: "Too short — at least two letters." };
    if (!/^[a-zA-Z][a-zA-Z '-]*$/.test(text)) return { ok: false, reason: "Letters only, please." };
    const word = text.toLowerCase();
    if (state.used.includes(word)) return { ok: false, reason: "Already used! Try another word." };
    if (state.lastWord) {
      const required = state.lastWord[state.lastWord.length - 1];
      if (word[0] !== required) {
        return { ok: false, reason: `Must start with "${required.toUpperCase()}"` };
      }
    }
    return { ok: true, word, text };
  }

  function applyAction(state, action, slot) {
    if (state.over) return null;

    if (action.type === "timeout") {
      return eliminate(state, state.turn, "ran out of time");
    }

    if (action.type !== "word") return null;
    if (slot !== state.turn) return null;

    const check = validate(state, action.text);
    if (!check.ok) {
      // Invalid tries don't cost the round, they just get rejected — the
      // clock is the real pressure.
      return { ...state, message: check.reason, rev: state.rev + 1, rejected: { slot, reason: check.reason } };
    }

    const log = state.log.concat([{ who: state.names[slot], text: check.text, kind: "word" }]);
    return {
      ...state,
      used: state.used.concat([check.word]),
      lastWord: check.word,
      log,
      turn: nextAlive(state, slot),
      secondsLeft: state.turnTime,
      message: "",
      rejected: null,
      rev: state.rev + 1,
    };
  }

  function eliminate(state, slot, reason) {
    const alive = state.alive.slice();
    alive[slot] = false;
    const log = state.log.concat([{ who: state.names[slot], text: `eliminated — ${reason}`, kind: "out" }]);
    const partial = { ...state, alive, log, rejected: null, rev: state.rev + 1 };
    const remaining = partial.alive.filter(Boolean).length;
    if (remaining <= 1) {
      return {
        ...partial,
        over: true,
        winner: partial.alive.findIndex(Boolean),
        message: "",
        secondsLeft: 0,
      };
    }
    return {
      ...partial,
      turn: nextAlive(partial, slot),
      secondsLeft: state.turnTime,
      message: `${state.names[slot]} is out — ${reason}.`,
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

  return { createState, applyAction, tick, wantsTimer, isOver, validate, aliveCount };
});
