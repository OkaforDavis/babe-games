// Integration tests for online play: two real BabeGame instances wired
// together through a fake data channel. Messages are JSON round-tripped the
// way they would be over the wire, so anything that doesn't serialise, or
// any place where host and guest could drift apart, shows up here.
//
// Run with: node tests/online.test.js
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

const gameSrc = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");

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

// Values crossing a vm boundary have a different Array prototype, so compare
// them the way the wire does: by value.
function same(actual, expected, message) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

// ---- a sandboxed copy of game.js with a stubbed connection layer ----

function makeEndpoint(isHost) {
  const dataListeners = [];
  const stateListeners = [];
  const sandbox = {
    console,
    Date,
    setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams,
    location: { search: "" },
    document: { addEventListener() {} },
    BabeProfiles: { getActive: () => null },
    BabeOnline: {
      isHost,
      send(msg) { sandbox.outbox.push(msg); },
      onData(cb) { dataListeners.push(cb); },
      onState(cb) { stateListeners.push(cb); },
      disconnect() {},
    },
    BabeOnlineUI: {
      openLobby(opts) { sandbox.lobby = opts; },
      close() {},
    },
    outbox: [],
    deliver(msg) { dataListeners.forEach((cb) => cb(msg)); },
  };
  vm.createContext(sandbox);
  // `const BabeGame = ...` is lexically scoped, so expose it on the sandbox
  // global the same way a browser <script> tag would.
  vm.runInContext(gameSrc + "\nglobalThis.BabeGame = BabeGame;", sandbox);
  return sandbox;
}

// Exchanges everything queued on both sides until the wire is quiet.
function flush(a, b) {
  let guard = 0;
  while ((a.outbox.length || b.outbox.length) && guard++ < 200) {
    const fromA = a.outbox.splice(0);
    const fromB = b.outbox.splice(0);
    fromA.forEach((m) => b.deliver(JSON.parse(JSON.stringify(m))));
    fromB.forEach((m) => a.deliver(JSON.parse(JSON.stringify(m))));
  }
  if (guard >= 200) throw new Error("messages never settled - possible broadcast loop");
}

// Builds a connected host/guest pair playing the given rules.
function connectPair(rules, config, { hostName = "Ada", guestName = "Emeka" } = {}) {
  const hostBox = makeEndpoint(true);
  const guestBox = makeEndpoint(false);

  const seen = { host: null, guest: null };
  const overs = { host: 0, guest: 0 };
  const starts = { host: 0, guest: 0 };

  const mkSpec = (side) => ({
    rules,
    render(state) { seen[side] = state; },
    onMatchStart() { starts[side] += 1; },
    onOver() { overs[side] += 1; },
  });

  const host = hostBox.BabeGame.create(mkSpec("host"));
  const guest = guestBox.BabeGame.create(mkSpec("guest"));

  host.setLocalName(hostName);
  guest.setLocalName(guestName);
  host.startOnline({ myName: hostName });
  guest.startOnline({ myName: guestName });
  hostBox.lobby.onConnected();
  guestBox.lobby.onConnected();
  flush(hostBox, guestBox);

  host.hostStart(config);
  flush(hostBox, guestBox);

  return {
    host, guest, hostBox, guestBox, seen, overs, starts,
    sync() { flush(hostBox, guestBox); },
    stop() { host.stopTimer(); guest.stopTimer(); },
  };
}

// ---------------- shared behaviour ----------------

test("online: both sides land in the same match with the same player names", () => {
  const s = connectPair(Ncho, { seedsPerPit: 4 });
  assert.ok(s.seen.host, "host rendered a state");
  assert.ok(s.seen.guest, "guest received a state");
  same(s.seen.host.names, ["Ada", "Emeka"]);
  same(s.seen.guest.names, ["Ada", "Emeka"], "guest sees the same seating");
  assert.strictEqual(s.seen.host.matchId, s.seen.guest.matchId, "same match");
  assert.strictEqual(s.starts.host, 1);
  assert.strictEqual(s.starts.guest, 1, "guest's screen is told to switch to the board");
  assert.strictEqual(s.host.mySlot, 0);
  assert.strictEqual(s.guest.mySlot, 1);
  s.stop();
});

test("online: the guest's move is applied by the host and mirrored back", () => {
  const s = connectPair(Ncho, { seedsPerPit: 4 });
  s.host.dispatch({ type: "sow", pit: 5 }); // host's turn, ends on slot 1
  s.sync();
  assert.strictEqual(s.seen.host.turn, 1);
  assert.strictEqual(s.seen.guest.turn, 1);

  s.guest.dispatch({ type: "sow", pit: 12 });
  s.sync();
  same(s.seen.guest.pits, s.seen.host.pits, "boards must be identical");
  assert.strictEqual(s.seen.host.rev, s.seen.guest.rev);
  s.stop();
});

test("online: a guest cannot move out of turn or touch the host's pits", () => {
  const s = connectPair(Ncho, { seedsPerPit: 4 });
  const before = JSON.stringify(s.seen.host.pits);

  s.guest.dispatch({ type: "sow", pit: 8 }); // not their turn yet
  s.sync();
  assert.strictEqual(JSON.stringify(s.seen.host.pits), before, "nothing moved");

  s.host.dispatch({ type: "sow", pit: 5 });
  s.sync();
  s.guest.dispatch({ type: "sow", pit: 2 }); // host's row
  s.sync();
  assert.strictEqual(s.seen.host.turn, 1, "still the guest's turn - the move was refused");
  s.stop();
});

test("online: a full game of Ncho stays in sync to the final seed", () => {
  const s = connectPair(Ncho, { seedsPerPit: 4 });
  let guard = 0;
  while (!s.seen.host.over && guard++ < 400) {
    const state = s.seen.host;
    const moves = Ncho.legalMoves(state, state.turn);
    if (!moves.length) break;
    const mover = state.turn === 0 ? s.host : s.guest;
    mover.dispatch({ type: "sow", pit: moves[moves.length - 1] });
    s.sync();
    assert.strictEqual(s.seen.guest.rev, s.seen.host.rev, `desync at move ${guard}`);
    same(s.seen.guest.pits, s.seen.host.pits, `board desync at move ${guard}`);
  }
  assert.strictEqual(s.seen.host.over, true, "game finished");
  assert.strictEqual(s.seen.guest.over, true, "guest saw the finish");
  assert.strictEqual(s.seen.guest.winner, s.seen.host.winner, "both agree who won");
  assert.strictEqual(s.overs.host, 1);
  assert.strictEqual(s.overs.guest, 1);
  s.stop();
});

test("online: a rematch moves both sides into a brand new match", () => {
  const s = connectPair(Ncho, { seedsPerPit: 3 });
  const firstMatch = s.seen.host.matchId;
  s.host.hostStart({ seedsPerPit: 6 });
  s.sync();
  assert.notStrictEqual(s.seen.host.matchId, firstMatch);
  assert.strictEqual(s.seen.guest.matchId, s.seen.host.matchId);
  assert.strictEqual(s.seen.guest.seedsPerPit, 6, "guest picked up the new settings");
  assert.strictEqual(s.starts.guest, 2, "guest was moved back to the board");
  s.stop();
});

test("online: the capture-on-four variant syncs captures and the animation data", () => {
  const s = connectPair(Ncho, { seedsPerPit: 4, variant: "four" });
  assert.strictEqual(s.seen.guest.variant, "four");

  s.host.dispatch({ type: "sow", pit: 0 });
  s.sync();
  const move = s.seen.guest.lastMove;
  assert.ok(Array.isArray(move.before), "the pre-move board reaches the other device");
  same(move.before, s.seen.host.lastMove.before, "so both can replay the same animation");
  same(move.steps, s.seen.host.lastMove.steps, "following the same route, scoop for scoop");
  same(move.captures, s.seen.host.lastMove.captures, "collecting the same pits");
  assert.ok(move.steps.length > 1, "a relay records more than one step");

  // The guest animates from these steps, so replaying them has to land on
  // exactly the board the guest was sent.
  const replay = move.before.slice();
  move.steps.forEach((step) => {
    if (step.t === "pickup") replay[step.pit] = 0;
    if (step.t === "drop") replay[step.pit] += 1;
    if (step.t === "capture") {
      replay[step.pit] -= step.seeds;
      replay[step.by === 0 ? 6 : 13] += step.seeds;
    }
  });
  same(replay, s.seen.guest.pits, "the guest's animation ends on the guest's real board");
  s.stop();
});

test("online: the Mancala-style variant runs through the same engine", () => {
  const s = connectPair(Ncho, { seedsPerPit: 4, variant: "classic" });
  assert.strictEqual(s.seen.guest.variant, "classic");
  s.host.dispatch({ type: "sow", pit: 2 }); // ends in their own house
  s.sync();
  assert.strictEqual(s.seen.guest.turn, 0, "the guest agrees the host goes again");
  assert.strictEqual(s.seen.guest.pits[6], 1);
  s.stop();
});

// ---------------- per game ----------------

test("online: dots and boxes keeps both boards identical", () => {
  const s = connectPair(Dots, { n: 2, turnTime: 0 });
  s.host.dispatch({ type: "claim", o: "h", r: 0, c: 0 });
  s.sync();
  s.guest.dispatch({ type: "claim", o: "v", r: 0, c: 0 });
  s.sync();
  same(s.seen.guest.h, s.seen.host.h);
  same(s.seen.guest.v, s.seen.host.v);
  assert.strictEqual(s.seen.guest.turn, s.seen.host.turn);
  s.stop();
});

test("online: scramble never sends the answer or the upcoming words to the guesser", () => {
  const s = connectPair(Scramble, {
    roundsPerPlayer: 1,
    timePerRound: 30,
    words: [{ word: "jollof", category: "food" }, { word: "lagos", category: "place" }],
  });
  assert.strictEqual(Scramble.guesserOf(s.seen.host), 1, "the guest guesses first");
  assert.ok(s.seen.host.answer, "host holds the answer");
  assert.strictEqual(s.seen.guest.answer, undefined, "guest must not receive it");
  assert.strictEqual(s.seen.guest.deck, undefined, "guest must not receive future words");
  assert.ok(s.seen.guest.scrambled, "but they do get the scrambled word");

  s.guest.dispatch({ type: "guess", text: "wrong" });
  s.sync();
  assert.strictEqual(s.seen.guest.phase, "playing", "a wrong guess keeps the round alive");

  s.guest.dispatch({ type: "guess", text: s.seen.host.answer });
  s.sync();
  assert.strictEqual(s.seen.guest.phase, "result");
  assert.strictEqual(s.seen.guest.reveal.word, s.seen.host.answer, "the word is revealed after the round");
  same(s.seen.guest.scores, s.seen.host.scores);
  s.stop();
});

test("online: categories hides answers while writing and scores once both are in", () => {
  const s = connectPair(Categories, { fillTime: 45 });
  s.host.dispatch({ type: "pickLetter", letter: "A" }, 0);
  s.sync();
  assert.strictEqual(s.seen.guest.phase, "filling");

  const hostAnswers = { Name: "Ada", Place: "Aba", Animal: "Ant", Thing: "Apron", Food: "Amala" };
  s.host.dispatch({ type: "submit", answers: hostAnswers }, 0);
  s.sync();
  same(s.seen.guest.answers[0], {}, "the guest cannot peek at the host's answers");

  s.guest.dispatch({ type: "submit", answers: { Name: "Ama", Place: "Aba", Animal: "Antelope", Thing: "Axe", Food: "Akara" } }, 1);
  s.sync();
  assert.strictEqual(s.seen.host.phase, "review");
  assert.strictEqual(s.seen.guest.phase, "review");
  assert.strictEqual(s.seen.guest.answers[0].Name, "Ada", "answers are revealed at review time");

  s.guest.dispatch({ type: "scoreRound" }, 1);
  s.sync();
  same(s.seen.guest.totals, s.seen.host.totals);
  assert.strictEqual(s.seen.host.totals[0], 45, "Name 10 + Place 5 + Animal 10 + Thing 10 + Food 10");
  s.stop();
});

test("online: chain naming passes the turn between devices", () => {
  const s = connectPair(Chain, { turnTime: 999, category: "food" });
  s.host.dispatch({ type: "word", text: "jollof" }, 0);
  s.sync();
  assert.strictEqual(s.seen.guest.turn, 1);
  assert.strictEqual(s.seen.guest.lastWord, "jollof");

  s.guest.dispatch({ type: "word", text: "amala" }, 1); // wrong letter
  s.sync();
  assert.strictEqual(s.seen.guest.turn, 1, "still their turn after a rejected word");
  assert.ok(s.seen.guest.rejected, "the guest is told why");

  s.guest.dispatch({ type: "word", text: "fufu" }, 1);
  s.sync();
  assert.strictEqual(s.seen.host.lastWord, "fufu");
  assert.strictEqual(s.seen.host.turn, 0);
  assert.strictEqual(s.seen.guest.log.length, 2);
  s.stop();
});

test("online: the puzzle race gives both players the identical board", () => {
  const s = connectPair(Puzzle, { n: 3, seed: 4242, variant: "ocean", startedAt: 1000 });
  same(s.seen.guest.order, s.seen.host.order, "same scramble for both");
  assert.strictEqual(s.seen.guest.seed, 4242);
  assert.strictEqual(s.seen.guest.startedAt, 1000, "same clock start");

  s.guest.dispatch({ type: "progress", correct: 5, moves: 9 }, 1);
  s.sync();
  assert.strictEqual(s.seen.host.progress[1], 5, "host sees the guest's progress");

  s.guest.dispatch({ type: "solved", ms: 31000, moves: 14 }, 1);
  s.sync();
  assert.strictEqual(s.seen.host.over, true);
  assert.strictEqual(s.seen.host.winner, 1);
  assert.strictEqual(s.seen.guest.winner, 1);
  s.stop();
});

test("online: state survives being serialised over the wire", () => {
  const s = connectPair(Dots, { n: 3, turnTime: 0 });
  const wire = JSON.parse(JSON.stringify(s.seen.host));
  same(wire.h, s.seen.host.h, "nested arrays survive the trip");
  assert.strictEqual(typeof wire.matchId, "number");
  s.stop();
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}

