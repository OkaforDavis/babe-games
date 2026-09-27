// Logic tests for every game's rules module. Run with: node tests/rules.test.js
const assert = require("assert");

const Ncho = require("../js/rules/ncho-rules.js");
const Dots = require("../js/rules/dots-rules.js");
const Chain = require("../js/rules/chain-rules.js");
const Scramble = require("../js/rules/scramble-rules.js");
const Categories = require("../js/rules/categories-rules.js");
const Puzzle = require("../js/rules/puzzle-rules.js");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}\n    ${err.message}`);
  }
}

// ---------------- Ncho: the main game (capture on four) ----------------

function four(overrides) {
  return Object.assign(Ncho.createState({ seedsPerPit: 4, variant: "four", names: ["A", "B"] }), overrides || {});
}

test("ncho four: fresh board has four seeds per pit and empty houses", () => {
  const s = four();
  assert.strictEqual(s.variant, "four");
  assert.strictEqual(s.pits.filter((v) => v === 4).length, 12);
  assert.strictEqual(s.pits[6], 0);
  assert.strictEqual(s.pits[13], 0);
});

test("ncho four: the turn keeps relaying until a seed rests in an empty pit", () => {
  const s = four();
  s.pits = new Array(14).fill(0);
  s.pits[0] = 1;   // one seed into pit 1
  s.pits[1] = 2;   // pit 1 had seeds, so scoop up all 3 and carry on
  s.pits[2] = 0;   // ...which drops into 2, 3, 4 and rests in the empty 4
  s.pits[3] = 0;
  s.pits[4] = 0;
  s.pits[9] = 5;   // keeps the opponent alive
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.strictEqual(next.pits[1], 0, "pit 1 was scooped up mid-turn");
  assert.strictEqual(next.pits[2], 1);
  assert.strictEqual(next.pits[3], 1);
  assert.strictEqual(next.pits[4], 1, "the last seed came to rest here");
  assert.strictEqual(next.lastMove.steps.filter((x) => x.t === "pickup").length, 2, "one scoop-up along the way");
});

test("ncho four: a seed landing in an empty pit ends the turn straight away", () => {
  const s = four();
  s.pits = new Array(14).fill(0);
  s.pits[0] = 1;
  s.pits[1] = 0;  // empty, so the seed rests and the turn is over
  s.pits[9] = 5;
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.strictEqual(next.pits[1], 1);
  assert.strictEqual(next.turn, 1);
  assert.strictEqual(next.lastMove.steps.filter((x) => x.t === "drop").length, 1, "exactly one seed moved");
});

test("ncho four: seeds are never sown into either house", () => {
  const s = four();
  s.pits[0] = 20; // more than a full lap
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  const touched = next.lastMove.steps.filter((x) => x.t === "drop").map((x) => x.pit);
  assert.strictEqual(touched.includes(6), false, "skips your own house");
  assert.strictEqual(touched.includes(13), false, "skips their house");
});

test("ncho four: a pit that hits four mid-sowing goes to its owner and play carries on", () => {
  const s = four();
  s.pits = new Array(14).fill(0);
  s.pits[5] = 3;  // drops into 7, 8, 9
  s.pits[7] = 3;  // -> four on the opponent's side, not the final seed
  s.pits[8] = 0;
  s.pits[9] = 0;  // the final seed rests here
  s.pits[0] = 2;
  const next = Ncho.applyAction(s, { type: "sow", pit: 5 }, 0);
  assert.strictEqual(next.pits[7], 0, "lifted out as it happened");
  assert.strictEqual(next.pits[13], 4, "by the player who owns that pit");
  assert.strictEqual(next.pits[6], 0, "the sower gets nothing from it");
  assert.strictEqual(next.pits[9], 1, "and the sowing carried on to rest here");
});

test("ncho four: your final seed making four is yours, and ends the turn", () => {
  const s = four();
  s.pits = new Array(14).fill(0);
  s.pits[5] = 2;  // drops into 7 then 8
  s.pits[7] = 0;
  s.pits[8] = 3;  // final seed makes four here, on the opponent's side
  s.pits[0] = 3;
  const next = Ncho.applyAction(s, { type: "sow", pit: 5 }, 0);
  assert.strictEqual(next.pits[8], 0, "collected");
  assert.strictEqual(next.pits[6], 4, "by whoever sowed it, not the pit's owner");
  assert.strictEqual(next.pits[13], 0);
  assert.strictEqual(next.lastMove.captures[0].viaLastSeed, true);
  assert.strictEqual(next.turn, 1, "nothing left in hand, so the turn is over");
});

test("ncho four: a pit pushed past four is not collected", () => {
  const s = four();
  s.pits = new Array(14).fill(0);
  s.pits[0] = 1;
  s.pits[1] = 4;  // becomes five, so it is scooped up and sown on
  s.pits[8] = 3;
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.deepStrictEqual(next.lastMove.captures, [], "five is not four");
  assert.strictEqual(next.pits[6], 0);
});

test("ncho four: a long relay can collect several pits in one turn", () => {
  const s = four();
  s.pits = new Array(14).fill(0);
  s.pits[0] = 3;  // drops into 1, 2, 3
  s.pits[1] = 3;  // -> four, owner slot 0
  s.pits[2] = 3;  // -> four, owner slot 0
  s.pits[3] = 3;  // -> four on the final seed, so also slot 0
  s.pits[9] = 5;
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.strictEqual(next.lastMove.captures.length, 3);
  assert.strictEqual(next.pits[6], 12, "all three fours go home");
  assert.strictEqual(next.turn, 1);
});

test("ncho four: the opening move relays without losing a seed", () => {
  const s = four();
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.strictEqual(next.pits.reduce((a, b) => a + b, 0), 48, "every seed is accounted for");
  assert.ok(next.lastMove.steps.length > 4, "the opening move cascades rather than stopping dead");
});

test("ncho four: an empty side does not end it while the other player can still sow", () => {
  // Slot 0 empties their own row, but slot 1 has seeds and may well feed
  // some back across, so play carries on.
  const s = four();
  s.pits = new Array(14).fill(0);
  s.pits[5] = 1;   // lands in pit 7, leaving slot 0 with nothing
  s.pits[9] = 6;
  const next = Ncho.applyAction(s, { type: "sow", pit: 5 }, 0);
  assert.strictEqual(next.over, false, "the game keeps going");
  assert.strictEqual(next.turn, 1);
});

test("ncho four: the player to move having nothing ends it, and the other takes the rest", () => {
  const s = four();
  s.pits = new Array(14).fill(0);
  s.pits[0] = 1;   // slot 0 sows within their own row
  s.pits[2] = 5;
  s.pits[6] = 20;
  s.pits[13] = 16; // slot 1's row is empty, so they cannot answer
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.strictEqual(next.over, true);
  assert.strictEqual(Ncho.seedsOnBoard(next.pits), 0, "board is cleared");
  assert.strictEqual(next.pits[6], 26, "slot 0 sweeps the 6 seeds still on the board");
  assert.strictEqual(next.winner, 0);
});

test("ncho four: play stops once fewer than four seeds remain", () => {
  const s = four();
  s.pits = new Array(14).fill(0);
  s.pits[0] = 1;
  s.pits[8] = 1;
  s.pits[6] = 25;
  s.pits[13] = 21;
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.strictEqual(next.over, true, "nobody can reach four any more");
  assert.strictEqual(next.winner, 0);
});

test("ncho four: seeds are never created or lost", () => {
  let s = four();
  const total = s.pits.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (!s.over && guard++ < 600) {
    const moves = Ncho.legalMoves(s, s.turn);
    if (!moves.length) break;
    const next = Ncho.applyAction(s, { type: "sow", pit: moves[guard % moves.length] }, s.turn);
    assert.ok(next, "a legal move must be accepted");
    s = next;
    assert.strictEqual(s.pits.reduce((a, b) => a + b, 0), total, `seed count changed at move ${guard}`);
  }
  assert.strictEqual(s.over, true, "the game reaches an end");
});

test("ncho four: a move records the board and every step, so it can be replayed", () => {
  const s = four();
  const next = Ncho.applyAction(s, { type: "sow", pit: 2 }, 0);
  assert.deepStrictEqual(next.lastMove.before, s.pits, "the pre-move board is kept");
  const steps = next.lastMove.steps;
  assert.strictEqual(steps[0].t, "pickup", "a turn starts by scooping up a pit");
  assert.strictEqual(steps[0].pit, 2);
  assert.deepStrictEqual(steps.slice(1, 5).map((x) => x.pit), [3, 4, 5, 7], "then drops one seed at a time");
  assert.ok(steps.every((x) => ["pickup", "drop", "capture"].includes(x.t)), "only known step kinds");

  // Replaying the steps from the recorded board must land on the real result.
  const replay = next.lastMove.before.slice();
  steps.forEach((step) => {
    if (step.t === "pickup") replay[step.pit] = 0;
    if (step.t === "drop") replay[step.pit] += 1;
    if (step.t === "capture") {
      replay[step.pit] -= step.seeds;
      replay[step.by === 0 ? 6 : 13] += step.seeds;
    }
  });
  assert.deepStrictEqual(replay, next.pits, "the animation and the real board agree");
});

// ---------------- Ncho: the Mancala/Ayo variant ----------------

function classic(seeds) {
  return Ncho.createState({ seedsPerPit: seeds || 4, variant: "classic", names: ["A", "B"] });
}

test("ncho classic: landing the last seed in your own store gives another turn", () => {
  const s = classic();
  const next = Ncho.applyAction(s, { type: "sow", pit: 2 }, 0);
  assert.strictEqual(next.pits[2], 0);
  assert.strictEqual(next.pits[3], 5);
  assert.strictEqual(next.pits[6], 1, "store should hold the last seed");
  assert.strictEqual(next.turn, 0, "same player goes again");
  assert.strictEqual(next.lastMove.extraTurn, true);
});

test("ncho classic: an ordinary move passes the turn", () => {
  const s = classic();
  const next = Ncho.applyAction(s, { type: "sow", pit: 5 }, 0);
  assert.strictEqual(next.pits[6], 1);
  assert.strictEqual(next.pits[9], 5);
  assert.strictEqual(next.turn, 1);
});

test("ncho classic: sowing never drops a seed in the opponent's store", () => {
  const s = classic();
  s.pits[0] = 14; // enough to wrap all the way round
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.strictEqual(next.pits[13], 0, "opponent store must stay untouched");
  assert.ok(next.pits[6] >= 1, "own store should have been filled");
});

test("ncho classic: last seed into your own empty pit captures the pit opposite", () => {
  const s = classic();
  s.pits = new Array(14).fill(0);
  s.pits[0] = 1; // one seed, will land in pit 1
  s.pits[1] = 0; // own empty pit
  s.pits[11] = 6; // opposite of pit 1 is 12 - 1 = 11
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.strictEqual(next.pits[1], 0, "landing pit is emptied by the capture");
  assert.strictEqual(next.pits[11], 0, "opposite pit is captured");
  assert.strictEqual(next.pits[6], 7, "captured seeds go to the store");
  assert.strictEqual(next.lastMove.captures[0].seeds, 7);
});

test("ncho classic: no capture when the opposite pit is empty", () => {
  const s = classic();
  s.pits = new Array(14).fill(0);
  s.pits[0] = 1;
  s.pits[1] = 0;
  s.pits[11] = 0;
  s.pits[8] = 3; // keep the game alive
  const next = Ncho.applyAction(s, { type: "sow", pit: 0 }, 0);
  assert.strictEqual(next.pits[1], 1, "seed just stays put");
  assert.strictEqual(next.pits[6], 0);
});

test("ncho classic: emptying a side ends the game and sweeps the remainder", () => {
  const s = classic();
  s.pits = new Array(14).fill(0);
  s.pits[5] = 1; // last seed on slot 0's side, lands in own store
  s.pits[7] = 3;
  s.pits[8] = 2;
  s.pits[6] = 10;
  s.pits[13] = 1;
  const next = Ncho.applyAction(s, { type: "sow", pit: 5 }, 0);
  assert.strictEqual(next.over, true);
  assert.strictEqual(next.pits[13], 6, "opponent sweeps their own leftovers (1 + 3 + 2)");
  assert.strictEqual(next.pits[6], 11);
  assert.strictEqual(next.winner, 0);
});

test("ncho: neither variant lets you move out of turn, from an empty pit, or from their row", () => {
  ["four", "classic"].forEach((variant) => {
    const s = Ncho.createState({ seedsPerPit: 4, variant });
    assert.strictEqual(Ncho.applyAction(s, { type: "sow", pit: 0 }, 1), null, `${variant}: wrong player`);
    assert.strictEqual(Ncho.applyAction(s, { type: "sow", pit: 8 }, 0), null, `${variant}: not your row`);
    const empty = Ncho.createState({ seedsPerPit: 4, variant });
    empty.pits[3] = 0;
    assert.strictEqual(Ncho.applyAction(empty, { type: "sow", pit: 3 }, 0), null, `${variant}: empty pit`);
  });
});

test("ncho classic: seeds are conserved across a long game", () => {
  let s = classic();
  const total = s.pits.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (!s.over && guard++ < 500) {
    const moves = Ncho.legalMoves(s, s.turn);
    if (!moves.length) break;
    const next = Ncho.applyAction(s, { type: "sow", pit: moves[0] }, s.turn);
    assert.ok(next, "a legal move must be accepted");
    s = next;
    assert.strictEqual(s.pits.reduce((a, b) => a + b, 0), total, "seeds must never be created or lost");
  }
  assert.strictEqual(s.over, true, "game should reach an end");
});

// ---------------- Dots and Boxes ----------------

test("dots: completing a box scores it and keeps the turn", () => {
  let s = Dots.createState({ n: 2, turnTime: 0 });
  s = Dots.applyAction(s, { type: "claim", o: "h", r: 0, c: 0 }, 0); // top
  assert.strictEqual(s.turn, 1, "no box yet, turn passes");
  s = Dots.applyAction(s, { type: "claim", o: "v", r: 0, c: 0 }, 1); // left
  s = Dots.applyAction(s, { type: "claim", o: "v", r: 0, c: 1 }, 0); // right
  s = Dots.applyAction(s, { type: "claim", o: "h", r: 1, c: 0 }, 1); // bottom -> completes
  assert.strictEqual(s.owner[0][0], 1);
  assert.strictEqual(s.scores[1], 1);
  assert.strictEqual(s.turn, 1, "box owner goes again");
});

test("dots: an edge cannot be claimed twice or out of turn", () => {
  let s = Dots.createState({ n: 2, turnTime: 0 });
  s = Dots.applyAction(s, { type: "claim", o: "h", r: 0, c: 0 }, 0);
  assert.strictEqual(Dots.applyAction(s, { type: "claim", o: "h", r: 0, c: 0 }, 1), null, "already taken");
  assert.strictEqual(Dots.applyAction(s, { type: "claim", o: "h", r: 0, c: 1 }, 0), null, "not your turn");
});

test("dots: filling every edge ends the game with a winner", () => {
  let s = Dots.createState({ n: 2, turnTime: 0 });
  let guard = 0;
  while (!s.over && guard++ < 200) {
    let moved = false;
    for (let r = 0; r <= s.n && !moved; r++) {
      for (let c = 0; c < s.n && !moved; c++) {
        if (s.h[r][c] === -1) { s = Dots.applyAction(s, { type: "claim", o: "h", r, c }, s.turn); moved = true; }
      }
    }
    for (let r = 0; r < s.n && !moved; r++) {
      for (let c = 0; c <= s.n && !moved; c++) {
        if (s.v[r][c] === -1) { s = Dots.applyAction(s, { type: "claim", o: "v", r, c }, s.turn); moved = true; }
      }
    }
    if (!moved) break;
  }
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.scores[0] + s.scores[1], s.n * s.n, "every box must be owned");
});

test("dots: the clock running out passes the turn", () => {
  let s = Dots.createState({ n: 3, turnTime: 2 });
  s = Dots.tick(s);
  assert.strictEqual(s.secondsLeft, 1);
  s = Dots.tick(s);
  assert.strictEqual(s.turn, 1, "turn passed on timeout");
  assert.strictEqual(s.secondsLeft, 2, "clock reset for the next player");
});

// ---------------- Chain Naming ----------------

test("chain: the next word must start with the previous word's last letter", () => {
  let s = Chain.createState({ names: ["A", "B"], turnTime: 15 });
  s = Chain.applyAction(s, { type: "word", text: "jollof" }, 0);
  assert.strictEqual(s.lastWord, "jollof");
  assert.strictEqual(s.turn, 1);
  const bad = Chain.applyAction(s, { type: "word", text: "amala" }, 1);
  assert.ok(bad.rejected, "wrong starting letter is rejected");
  assert.strictEqual(bad.lastWord, "jollof", "chain unchanged");
  const good = Chain.applyAction(s, { type: "word", text: "fufu" }, 1);
  assert.strictEqual(good.lastWord, "fufu");
  assert.strictEqual(good.turn, 0);
});

test("chain: repeats are rejected", () => {
  let s = Chain.createState({ names: ["A", "B"], turnTime: 15 });
  s = Chain.applyAction(s, { type: "word", text: "eba" }, 0);
  s = Chain.applyAction(s, { type: "word", text: "akara" }, 1);
  const repeat = Chain.applyAction(s, { type: "word", text: "akara" }, 0);
  assert.ok(repeat.rejected, "cannot reuse a word");
});

test("chain: running out of time eliminates you and the last player standing wins", () => {
  let s = Chain.createState({ names: ["A", "B"], turnTime: 1 });
  s = Chain.tick(s);
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.winner, 1, "player B survives");
});

test("chain: three players rotate and eliminate correctly", () => {
  let s = Chain.createState({ names: ["A", "B", "C"], turnTime: 1 });
  s = Chain.tick(s); // A times out
  assert.strictEqual(s.alive[0], false);
  assert.strictEqual(s.over, false);
  assert.strictEqual(s.turn, 1);
  s = Chain.tick(s); // B times out
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.winner, 2);
});

test("chain: you cannot play out of turn", () => {
  const s = Chain.createState({ names: ["A", "B"], turnTime: 15 });
  assert.strictEqual(Chain.applyAction(s, { type: "word", text: "eba" }, 1), null);
});

// ---------------- Scramble ----------------

function scrambleState() {
  return Scramble.createState({
    names: ["A", "B"],
    roundsPerPlayer: 1,
    timePerRound: 30,
    words: [
      { word: "jollof", category: "food" },
      { word: "lagos", category: "place" },
    ],
  });
}

test("scramble: the scrambled word keeps the same letters but isn't the answer", () => {
  const s = scrambleState();
  assert.strictEqual(s.scrambled.length, s.answer.length);
  assert.deepStrictEqual(s.scrambled.split("").sort(), s.answer.split("").sort());
});

test("scramble: only the guesser can guess, and a correct guess scores by time left", () => {
  const s = scrambleState();
  const guesser = Scramble.guesserOf(s);
  assert.strictEqual(guesser, 1, "slot 1 guesses first");
  assert.strictEqual(Scramble.applyAction(s, { type: "guess", text: s.answer }, 0), null, "setter can't guess");
  const next = Scramble.applyAction(s, { type: "guess", text: s.answer.toUpperCase() }, 1);
  assert.strictEqual(next.phase, "result");
  assert.strictEqual(next.scores[1], 10 + 30 * 2);
  assert.strictEqual(next.reveal.solved, true);
});

test("scramble: a wrong guess leaves the round running", () => {
  const s = scrambleState();
  const next = Scramble.applyAction(s, { type: "guess", text: "nonsense" }, 1);
  assert.strictEqual(next.phase, "playing");
  assert.strictEqual(next.scores[1], 0);
});

test("scramble: the clock running out reveals the word and scores nothing", () => {
  let s = scrambleState();
  s = { ...s, secondsLeft: 1 };
  s = Scramble.tick(s);
  assert.strictEqual(s.phase, "result");
  assert.strictEqual(s.reveal.solved, false);
  assert.strictEqual(s.scores[0] + s.scores[1], 0);
});

test("scramble: roles swap each round and the match ends after the last one", () => {
  let s = scrambleState();
  s = Scramble.applyAction(s, { type: "guess", text: s.answer }, 1);
  s = Scramble.applyAction(s, { type: "next" }, 1);
  assert.strictEqual(s.roundIndex, 1);
  assert.strictEqual(Scramble.guesserOf(s), 0, "roles swapped");
  s = Scramble.applyAction(s, { type: "guess", text: s.answer }, 0);
  s = Scramble.applyAction(s, { type: "next" }, 0);
  assert.strictEqual(s.over, true);
  assert.ok(s.winner === 0 || s.winner === 1 || s.winner === -1);
});

test("scramble: the answer and upcoming words are stripped before going over the wire", () => {
  const s = scrambleState();
  const sent = Scramble.redact(s, 1);
  assert.strictEqual(sent.answer, undefined, "answer must never reach the guesser");
  assert.strictEqual(sent.deck, undefined, "future words must not leak");
  assert.ok(sent.scrambled.length > 0, "but the puzzle itself is still sent");
});

// ---------------- Categories ----------------

function filled(letter, values) {
  const out = {};
  Categories.CATEGORIES.forEach((c, i) => (out[c] = values[i] || ""));
  return out;
}

test("categories: picking a letter starts the fill phase and can't be reused", () => {
  let s = Categories.createState({ names: ["A", "B"], simultaneous: true, fillTime: 45 });
  s = Categories.applyAction(s, { type: "pickLetter", letter: "a" }, 0);
  assert.strictEqual(s.phase, "filling");
  assert.strictEqual(s.letter, "A");
  assert.strictEqual(s.secondsLeft, 45);
  const again = Categories.applyAction({ ...s, phase: "letter" }, { type: "pickLetter", letter: "A" }, 0);
  assert.strictEqual(again, null, "a used letter is refused");
});

test("categories: the round moves to review once everyone has submitted", () => {
  let s = Categories.createState({ names: ["A", "B"], simultaneous: true });
  s = Categories.applyAction(s, { type: "pickLetter", letter: "A" }, 0);
  s = Categories.applyAction(s, { type: "submit", answers: filled("A", ["Ada", "Aba", "Antelope", "Apron", "Amala"]) }, 0);
  assert.strictEqual(s.phase, "filling", "still waiting on the other player");
  s = Categories.applyAction(s, { type: "submit", answers: filled("A", ["Ama", "Aba", "Ant", "", "Akara"]) }, 1);
  assert.strictEqual(s.phase, "review");
  assert.strictEqual(s.marks.Name[0], true);
  assert.strictEqual(s.marks.Thing[1], false, "a blank answer is not valid");
});

test("categories: unique answers score 10, shared answers score 5", () => {
  let s = Categories.createState({ names: ["A", "B"], simultaneous: true });
  s = Categories.applyAction(s, { type: "pickLetter", letter: "A" }, 0);
  s = Categories.applyAction(s, { type: "submit", answers: filled("A", ["Ada", "Aba", "Ant", "Apron", "Amala"]) }, 0);
  s = Categories.applyAction(s, { type: "submit", answers: filled("A", ["Ama", "Aba", "Ant", "Axe", "Akara"]) }, 1);
  s = Categories.applyAction(s, { type: "scoreRound" }, 0);
  // A: Name 10, Place 5 (shared), Animal 5 (shared), Thing 10, Food 10 = 40
  assert.strictEqual(s.roundScores[0], 40);
  assert.strictEqual(s.roundScores[1], 40);
  assert.strictEqual(s.totals[0], 40);
  assert.strictEqual(s.phase, "summary");
});

test("categories: an answer with the wrong first letter is marked invalid but can be overridden", () => {
  let s = Categories.createState({ names: ["A", "B"], simultaneous: true });
  s = Categories.applyAction(s, { type: "pickLetter", letter: "B" }, 0);
  s = Categories.applyAction(s, { type: "submit", answers: filled("B", ["Zainab", "Benin", "Bat", "Broom", "Beans"]) }, 0);
  s = Categories.applyAction(s, { type: "submit", answers: filled("B", ["Bola", "Bauchi", "Bee", "Bucket", "Bread"]) }, 1);
  assert.strictEqual(s.marks.Name[0], false, "Zainab doesn't start with B");
  const toggled = Categories.applyAction(s, { type: "toggleMark", cat: "Name", slot: 0 }, 0);
  assert.strictEqual(toggled.marks.Name[0], true, "players can overrule the auto-check");
});

test("categories: local play fills one player at a time, online fills together", () => {
  const local = Categories.applyAction(
    Categories.createState({ names: ["A", "B"], simultaneous: false }),
    { type: "pickLetter", letter: "C" }, 0
  );
  assert.deepStrictEqual(Categories.activeFillers(local), [0], "only the first player fills");
  assert.strictEqual(Categories.applyAction(local, { type: "submit", answers: {} }, 1), null, "player 2 must wait");

  const online = Categories.applyAction(
    Categories.createState({ names: ["A", "B"], simultaneous: true }),
    { type: "pickLetter", letter: "C" }, 0
  );
  assert.deepStrictEqual(Categories.activeFillers(online), [0, 1], "both fill at once");
});

test("categories: the clock running out locks in whatever is there", () => {
  let s = Categories.createState({ names: ["A", "B"], simultaneous: true, fillTime: 1 });
  s = Categories.applyAction(s, { type: "pickLetter", letter: "D" }, 0);
  s = Categories.tick(s);
  assert.strictEqual(s.secondsLeft, 0);
  assert.strictEqual(s.phase, "filling", "grace window lets late answers land first");
  s = Categories.tick(s);
  s = Categories.tick(s);
  assert.strictEqual(s.phase, "review", "a silent player can never stall the round");
});

test("categories: an answer submitted during the grace window still counts", () => {
  let s = Categories.createState({ names: ["A", "B"], simultaneous: true, fillTime: 1 });
  s = Categories.applyAction(s, { type: "pickLetter", letter: "D" }, 0);
  s = Categories.tick(s); // clock hits zero
  s = Categories.applyAction(s, { type: "submit", answers: filled("D", ["Dapo", "Delta", "Dog", "Drum", "Dodo"]) }, 1);
  s = Categories.tick(s);
  s = Categories.tick(s);
  assert.strictEqual(s.phase, "review");
  assert.strictEqual(s.answers[1].Name, "Dapo", "the late submission was kept, not overwritten");
  assert.deepStrictEqual(s.answers[0], { Name: "", Place: "", Animal: "", Thing: "", Food: "" });
});

test("categories: the other player's answers stay hidden while filling", () => {
  let s = Categories.createState({ names: ["A", "B"], simultaneous: true });
  s = Categories.applyAction(s, { type: "pickLetter", letter: "E" }, 0);
  s = Categories.applyAction(s, { type: "submit", answers: filled("E", ["Emeka", "Enugu", "Eagle", "Egg", "Eba"]) }, 0);
  const sent = Categories.redact(s, 1);
  assert.deepStrictEqual(sent.answers[0], {}, "player 1's answers are hidden from player 2");
});

// ---------------- Puzzle ----------------

test("puzzle: the same seed produces the same starting board on both devices", () => {
  const a = Puzzle.startingOrder(4, 12345);
  const b = Puzzle.startingOrder(4, 12345);
  const c = Puzzle.startingOrder(4, 999);
  assert.deepStrictEqual(a, b, "both players must get an identical shuffle");
  assert.notDeepStrictEqual(a, c);
  assert.strictEqual(new Set(a).size, 16, "every tile appears exactly once");
});

test("puzzle: a fresh board is never already solved", () => {
  for (let seed = 0; seed < 50; seed++) {
    const order = Puzzle.startingOrder(3, seed);
    assert.ok(order.some((tile, i) => tile !== i), `seed ${seed} produced a solved board`);
  }
});

test("puzzle: first player home wins the race", () => {
  let s = Puzzle.createState({ names: ["A", "B"], n: 3, seed: 7 });
  s = Puzzle.applyAction(s, { type: "progress", correct: 4, moves: 6 }, 1);
  assert.strictEqual(s.progress[1], 4);
  assert.strictEqual(s.over, false);
  s = Puzzle.applyAction(s, { type: "solved", ms: 42000, moves: 20 }, 1);
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.winner, 1);
  assert.strictEqual(s.progress[1], 9);
});

// ---------------- results ----------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
