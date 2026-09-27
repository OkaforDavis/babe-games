// Pure game rules for Name / Place / Animal / Thing / Food.
// Phases: letter -> filling -> review -> summary (-> letter again, or over)
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CategoriesRules = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  const CATEGORIES = ["Name", "Place", "Animal", "Thing", "Food"];
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  function createState(config) {
    const names = config.names || ["Player 1", "Player 2"];
    return {
      game: "categories",
      names,
      categories: CATEGORIES,
      // online: everyone fills at the same time. local: one at a time.
      simultaneous: !!config.simultaneous,
      fillTime: config.fillTime || 45,
      secondsLeft: 0,
      phase: "letter",
      letter: null,
      usedLetters: [],
      answers: names.map(() => ({})),
      submitted: names.map(() => false),
      marks: {},
      totals: names.map(() => 0),
      roundScores: names.map(() => 0),
      round: 1,
      over: false,
      winner: null,
      message: "",
      rev: 0,
    };
  }

  // In local pass-and-play only one player fills at a time.
  function activeFillers(state) {
    if (state.phase !== "filling") return [];
    const pending = state.submitted.map((done, i) => (done ? -1 : i)).filter((i) => i >= 0);
    if (state.simultaneous) return pending;
    return pending.slice(0, 1);
  }

  function applyAction(state, action, slot) {
    if (state.over) return null;

    if (action.type === "pickLetter") {
      if (state.phase !== "letter") return null;
      const letter = String(action.letter || "").toUpperCase();
      if (!ALPHABET.includes(letter)) return null;
      if (state.usedLetters.includes(letter)) return null;
      return {
        ...state,
        phase: "filling",
        letter,
        usedLetters: state.usedLetters.concat([letter]),
        answers: state.names.map(() => ({})),
        submitted: state.names.map(() => false),
        marks: {},
        secondsLeft: state.fillTime,
        message: "",
        rev: state.rev + 1,
      };
    }

    if (action.type === "submit") {
      if (state.phase !== "filling") return null;
      if (slot == null || slot < 0 || slot >= state.names.length) return null;
      if (state.submitted[slot]) return null;
      if (!activeFillers(state).includes(slot)) return null;

      const clean = {};
      CATEGORIES.forEach((cat) => {
        clean[cat] = String((action.answers && action.answers[cat]) || "").trim().slice(0, 40);
      });
      const answers = state.answers.map((a, i) => (i === slot ? clean : a));
      const submitted = state.submitted.slice();
      submitted[slot] = true;

      const allDone = submitted.every(Boolean);
      if (!allDone) {
        return {
          ...state,
          answers,
          submitted,
          // sequential play gives each player their own fresh clock
          secondsLeft: state.simultaneous ? state.secondsLeft : state.fillTime,
          rev: state.rev + 1,
        };
      }

      const marks = {};
      CATEGORIES.forEach((cat) => {
        marks[cat] = answers.map((a) => startsWithLetter(a[cat], state.letter));
      });
      return {
        ...state,
        answers,
        submitted,
        marks,
        phase: "review",
        secondsLeft: 0,
        message: "Check the answers together, then score the round.",
        rev: state.rev + 1,
      };
    }

    if (action.type === "toggleMark") {
      if (state.phase !== "review") return null;
      const cat = action.cat;
      if (!CATEGORIES.includes(cat)) return null;
      const target = action.slot;
      if (target == null || target < 0 || target >= state.names.length) return null;
      const marks = { ...state.marks };
      marks[cat] = marks[cat].slice();
      marks[cat][target] = !marks[cat][target];
      return { ...state, marks, rev: state.rev + 1 };
    }

    if (action.type === "scoreRound") {
      if (state.phase !== "review") return null;
      const roundScores = state.names.map(() => 0);
      CATEGORIES.forEach((cat) => {
        const valid = state.names.map((_, i) => i).filter((i) => state.marks[cat][i]);
        valid.forEach((i) => {
          const mine = normalise(state.answers[i][cat]);
          const shared = valid.some((j) => j !== i && normalise(state.answers[j][cat]) === mine);
          roundScores[i] += shared ? 5 : 10;
        });
      });
      const totals = state.totals.map((t, i) => t + roundScores[i]);
      return {
        ...state,
        roundScores,
        totals,
        phase: "summary",
        message: "",
        rev: state.rev + 1,
      };
    }

    if (action.type === "nextRound") {
      if (state.phase !== "summary") return null;
      if (state.usedLetters.length >= ALPHABET.length) return endGame(state);
      return {
        ...state,
        phase: "letter",
        letter: null,
        round: state.round + 1,
        message: "",
        rev: state.rev + 1,
      };
    }

    if (action.type === "endGame") {
      if (state.phase === "filling") return null;
      return endGame(state);
    }

    return null;
  }

  function endGame(state) {
    const best = Math.max(...state.totals);
    const leaders = state.totals.map((t, i) => (t === best ? i : -1)).filter((i) => i >= 0);
    return {
      ...state,
      phase: "over",
      over: true,
      winner: leaders.length > 1 ? -1 : leaders[0],
      secondsLeft: 0,
      rev: state.rev + 1,
    };
  }

  function startsWithLetter(value, letter) {
    const text = String(value || "").trim();
    if (!text || !letter) return false;
    return text[0].toUpperCase() === String(letter).toUpperCase();
  }

  function normalise(value) {
    return String(value || "").trim().toLowerCase();
  }

  function wantsTimer(state) {
    return !state.over && state.phase === "filling" && state.fillTime > 0;
  }

  function tick(state) {
    if (!wantsTimer(state)) return null;

    if (state.secondsLeft > 0) {
      const secondsLeft = state.secondsLeft - 1;
      // At zero we give clients a couple of seconds to push the answers
      // they were still typing before the backstop below fires.
      return { ...state, secondsLeft, graceLeft: secondsLeft === 0 ? 2 : 0 };
    }

    const graceLeft = (state.graceLeft || 0) - 1;
    if (graceLeft > 0) return { ...state, graceLeft };

    // Backstop: lock in whatever is on record so a silent or disconnected
    // player can never stall the round forever.
    let next = { ...state, graceLeft: 0 };
    activeFillers(next).forEach((slot) => {
      const forced = applyAction(next, { type: "submit", answers: next.answers[slot] || {} }, slot);
      if (forced) next = forced;
    });
    return next;
  }

  // During filling nobody should see anyone else's answers.
  function redact(state, slot) {
    if (state.phase !== "filling") return state;
    return {
      ...state,
      answers: state.answers.map((a, i) => (i === slot ? a : {})),
    };
  }

  function isOver(state) {
    return !!state.over;
  }

  return {
    createState, applyAction, tick, wantsTimer, redact, isOver,
    activeFillers, startsWithLetter, CATEGORIES, ALPHABET,
  };
});
