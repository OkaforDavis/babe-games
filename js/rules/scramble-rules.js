// Pure game rules for Word Scramble.
// The answer word only ever lives in the authority's copy of the state —
// redact() strips it before the state is sent to the other player.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ScrambleRules = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  function shuffleWord(word, rand) {
    const letters = word.split("");
    const random = rand || Math.random;
    let attempt = letters.join("");
    for (let tries = 0; tries < 12 && attempt.toLowerCase() === word.toLowerCase(); tries++) {
      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
      attempt = letters.join("");
    }
    return attempt;
  }

  // config.words: [{word, category}] already shuffled by the caller
  function createState(config) {
    const roundsPerPlayer = config.roundsPerPlayer || 5;
    const timePerRound = config.timePerRound || 60;
    const total = roundsPerPlayer * 2;
    const deck = (config.words || []).slice(0, Math.max(total, 1));
    const state = {
      game: "scramble",
      names: config.names || ["Player 1", "Player 2"],
      deck,
      roundIndex: 0,
      totalRounds: total,
      timePerRound,
      secondsLeft: timePerRound,
      scores: [0, 0],
      phase: "playing",
      scrambled: "",
      category: "",
      reveal: null,
      message: "",
      over: false,
      winner: null,
      rev: 0,
    };
    return beginRound(state, 0, config.rand);
  }

  function beginRound(state, roundIndex, rand) {
    if (roundIndex >= state.totalRounds || state.deck.length === 0) {
      return finish(state);
    }
    const entry = state.deck[roundIndex % state.deck.length];
    return {
      ...state,
      roundIndex,
      phase: "playing",
      answer: entry.word,
      category: entry.category,
      scrambled: shuffleWord(entry.word, rand),
      secondsLeft: state.timePerRound,
      reveal: null,
      message: "",
      rev: state.rev + 1,
    };
  }

  // Even rounds: slot 0 sets, slot 1 guesses. Odd rounds: swapped.
  function guesserOf(state) {
    return state.roundIndex % 2 === 0 ? 1 : 0;
  }

  function setterOf(state) {
    return 1 - guesserOf(state);
  }

  function applyAction(state, action, slot) {
    if (state.over) return null;

    if (action.type === "guess") {
      if (state.phase !== "playing") return null;
      if (slot !== guesserOf(state)) return null;
      const guess = String(action.text || "").trim().toLowerCase();
      if (!guess) return null;
      if (guess !== String(state.answer).toLowerCase()) {
        return { ...state, message: "Not quite — try again!", rev: state.rev + 1 };
      }
      const points = 10 + state.secondsLeft * 2;
      const scores = state.scores.slice();
      scores[slot] += points;
      return {
        ...state,
        scores,
        phase: "result",
        reveal: { word: state.answer, solved: true, points, by: slot },
        message: `${state.names[slot]} got it! +${points} points`,
        rev: state.rev + 1,
      };
    }

    if (action.type === "timeout") {
      if (state.phase !== "playing") return null;
      return {
        ...state,
        phase: "result",
        reveal: { word: state.answer, solved: false, points: 0, by: null },
        message: `Time's up! The word was "${String(state.answer).toUpperCase()}".`,
        rev: state.rev + 1,
      };
    }

    if (action.type === "next") {
      if (state.phase !== "result") return null;
      const nextIndex = state.roundIndex + 1;
      if (nextIndex >= state.totalRounds) return finish(state);
      return beginRound(state, nextIndex);
    }

    return null;
  }

  function finish(state) {
    const [a, b] = state.scores;
    return {
      ...state,
      phase: "over",
      over: true,
      winner: a === b ? -1 : a > b ? 0 : 1,
      secondsLeft: 0,
      rev: state.rev + 1,
    };
  }

  function wantsTimer(state) {
    return !state.over && state.phase === "playing";
  }

  function tick(state) {
    if (!wantsTimer(state)) return null;
    const secondsLeft = state.secondsLeft - 1;
    if (secondsLeft > 0) return { ...state, secondsLeft };
    return applyAction({ ...state, secondsLeft: 0 }, { type: "timeout" }, null);
  }

  // Never ship the unguessed answer or the upcoming deck to the other side.
  function redact(state) {
    const copy = { ...state };
    delete copy.answer;
    delete copy.deck;
    return copy;
  }

  function isOver(state) {
    return !!state.over;
  }

  return { createState, applyAction, tick, wantsTimer, redact, isOver, guesserOf, setterOf, shuffleWord };
});
