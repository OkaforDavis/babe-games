// End-to-end tests: loads each real page in a DOM, runs every script the
// browser would run, and plays the game by clicking things. This is what
// catches the errors the other suites can't — a typo in a renderer, a
// missing element, a handler that throws on the first click.
//
// Run with: node tests/pages.test.js
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM, VirtualConsole } = require("jsdom");

const root = path.join(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}\n    ${err.message.split("\n")[0]}`);
  }
}

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

// Every page we open keeps timers and animation frames running, so they are
// closed at the end or the process never exits.
const openWindows = [];

// Things a browser provides that jsdom doesn't, plus stand-ins for the two
// CDN libraries so nothing reaches the network.
function installStubs(window) {
  window.HTMLCanvasElement.prototype.getContext = function () {
    const noop = () => {};
    return {
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      fillRect: noop, fillText: noop, beginPath: noop, arc: noop, fill: noop,
      moveTo: noop, lineTo: noop, stroke: noop, closePath: noop,
      fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1,
    };
  };
  window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AAA";

  window.AudioContext = function () {
    return {
      state: "running",
      currentTime: 0,
      resume: () => Promise.resolve(),
      createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: {}, type: "" }),
      createGain: () => ({ connect() {}, gain: { value: 0, exponentialRampToValueAtTime() {} } }),
      destination: {},
    };
  };
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  window.navigator.serviceWorker = {
    register: () => Promise.resolve(),
    ready: Promise.resolve({ showNotification() {} }),
  };
  window.Notification = undefined;

  window.mqtt = {
    connect: () => ({
      connected: false,
      on() { return this; },
      subscribe(topic, opts, cb) { if (cb) cb(null); },
      publish() {},
      end() {},
    }),
  };
  window.Peer = function () {
    return { on() {}, connect: () => ({ on() {}, send() {}, open: false }), destroy() {} };
  };
}

// Loads a page the way a browser would. Local scripts are inlined so jsdom
// runs them as real script tags sharing one global scope — evaluating them
// separately would put each file's `const` in its own throwaway scope.
async function loadPage(relativePath) {
  const pageDir = path.dirname(path.join(root, relativePath));
  let html = fs.readFileSync(path.join(root, relativePath), "utf8");

  html = html.replace(/<script src="https:\/\/[^"]+"><\/script>/g, "");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (whole, src) => {
    const file = path.resolve(pageDir, src);
    const code = fs.readFileSync(file, "utf8").replace(/<\/script>/gi, "<\\/script>");
    return `<script data-from="${src}">\n${code}\n</script>`;
  });

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err) => errors.push(err));

  const dom = new JSDOM(html, {
    url: "https://example.test/" + relativePath,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse: installStubs,
  });

  openWindows.push(dom.window);
  await tick();
  if (errors.length) throw new Error(`page reported errors: ${errors[0].message}`);
  return { dom, window: dom.window, doc: dom.window.document, errors };
}

function click(window, el) {
  if (!el) throw new Error("tried to click something that isn't there");
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function visible(el) {
  return el && el.style.display !== "none";
}

// ---------------------------------------------------------------- pages

(async () => {
  const GAMES = [
    "games/ncho.html",
    "games/scramble.html",
    "games/categories.html",
    "games/chain.html",
    "games/dots-and-boxes.html",
    "games/puzzle.html",
  ];

  for (const page of GAMES) {
    await test(`${page}: loads without a single script error`, async () => {
      const { doc } = await loadPage(page);
      assert.ok(doc.getElementById("setup-screen"), "the setup screen is there");
      assert.ok(visible(doc.getElementById("setup-screen")), "and is what you see first");
      assert.ok(!visible(doc.getElementById("play-screen")), "the board is hidden until you start");
    });

    await test(`${page}: starting a local game shows the board`, async () => {
      const { window, doc, errors } = await loadPage(page);
      click(window, doc.getElementById("start-local"));
      await tick();
      assert.ok(visible(doc.getElementById("play-screen")), "the board is showing");
      assert.ok(!visible(doc.getElementById("setup-screen")), "the setup screen stepped aside");
      assert.strictEqual(errors.length, 0, `errors while starting: ${errors[0] && errors[0].message}`);
    });
  }

  await test("index.html: the homepage lists every playable game", async () => {
    const { doc } = await loadPage("index.html");
    const cards = doc.querySelectorAll("#ready-grid .card");
    assert.strictEqual(cards.length, 6, `expected six playable games, found ${cards.length}`);
    const links = [...cards].map((c) => c.getAttribute("href"));
    ["ncho", "scramble", "categories", "chain", "dots-and-boxes", "puzzle"].forEach((id) => {
      assert.ok(links.some((h) => h && h.includes(id)), `${id} is linked from the homepage`);
    });
  });

  // ------------------------------------------------------------- ncho

  await test("ncho: a full move plays out on the board", async () => {
    const { window, doc, errors } = await loadPage("games/ncho.html");
    click(window, doc.getElementById("start-local"));
    await tick();

    const svg = doc.querySelector("#board-stage svg");
    assert.ok(svg, "the board was drawn");
    const seeds = svg.querySelectorAll("circle");
    assert.ok(seeds.length > 40, `seeds are drawn as circles, found ${seeds.length}`);

    const playable = svg.querySelectorAll(".pit-hit.playable");
    assert.strictEqual(playable.length, 6, "all six of your pits are playable at the start");

    const before = [...svg.querySelectorAll("[data-pit] text")].map((t) => t.textContent).join(",");
    click(window, playable[0]);
    await tick(400);
    const after = [...doc.querySelectorAll("#board-stage [data-pit] text")].map((t) => t.textContent).join(",");
    assert.notStrictEqual(after, before, "the board changed after sowing");
    assert.strictEqual(errors.length, 0, `errors during a move: ${errors[0] && errors[0].message}`);
  });

  await test("ncho: the hand appears and carries a count while sowing", async () => {
    const { window, doc } = await loadPage("games/ncho.html");
    click(window, doc.getElementById("start-local"));
    await tick();
    const playable = doc.querySelectorAll("#board-stage .pit-hit.playable");
    click(window, playable[2]);
    await tick(120);
    const hand = doc.querySelector("#board-stage .hand-marker");
    assert.ok(hand, "a hand is shown while the seeds are being sown");
    const count = hand.querySelectorAll("text")[1];
    assert.ok(count && /^\d+$/.test(count.textContent), `the hand shows how many are left, got "${count && count.textContent}"`);
  });

  await test("ncho: tapping the board mid-sow skips to the end, tapping a pit does not", async () => {
    const { window, doc } = await loadPage("games/ncho.html");
    click(window, doc.getElementById("start-local"));
    await tick();
    const playable = doc.querySelectorAll("#board-stage .pit-hit.playable");
    click(window, playable[0]);
    await tick(60);
    // Mid-animation there should be no playable pits at all.
    assert.strictEqual(
      doc.querySelectorAll("#board-stage .pit-hit.playable").length, 0,
      "nothing is clickable while the seeds are moving"
    );
    click(window, doc.getElementById("board-stage"));
    await tick(60);
    assert.ok(
      doc.querySelectorAll("#board-stage .pit-hit.playable").length > 0,
      "tapping the board finished the turn and handed control back"
    );
  });

  await test("ncho: switching variant to the Mancala rules still starts", async () => {
    const { window, doc, errors } = await loadPage("games/ncho.html");
    doc.getElementById("variant").value = "classic";
    click(window, doc.getElementById("start-local"));
    await tick();
    assert.ok(doc.querySelector("#board-stage svg"), "the board drew for the other variant too");
    assert.strictEqual(errors.length, 0);
  });

  // --------------------------------------------------------- scramble

  await test("ncho: a whole game can be played through to the result", async () => {
    const { window, doc, errors } = await loadPage("games/ncho.html");
    doc.getElementById("seeds").value = "3";
    click(window, doc.getElementById("start-local"));
    await tick();

    const stage = doc.getElementById("board-stage");
    for (let move = 0; move < 500; move++) {
      if (visible(doc.getElementById("end-screen"))) break;
      const playable = doc.querySelectorAll("#board-stage .pit-hit.playable");
      if (playable.length === 0) {
        click(window, stage); // skip whatever is animating
        await tick(5);
        continue;
      }
      click(window, playable[0]);
      await tick(5);
      click(window, stage);
      await tick(5);
    }

    assert.ok(visible(doc.getElementById("end-screen")), "the game reached its end");
    const title = doc.getElementById("winner-line");
    assert.ok(title.textContent.length > 0, "a result is announced");
    assert.ok(title.className.includes("result-title"), "styled as a result");
    assert.ok(!/lose|lost|defeat/i.test(title.textContent), "and never phrased as losing");
    assert.strictEqual(errors.length, 0, `errors during the game: ${errors[0] && errors[0].message}`);
  });

  // --------------------------------------------------------- scramble

  await test("scramble: a wrong guess is refused without ending the round", async () => {
    const { window, doc } = await loadPage("games/scramble.html");
    click(window, doc.getElementById("start-local"));
    await tick();
    const scrambled = doc.getElementById("scramble-display").textContent;
    assert.ok(scrambled.length > 2, "a scrambled word is on screen");

    doc.getElementById("guess-input").value = "definitely-not-it";
    click(window, doc.getElementById("submit-guess"));
    await tick();
    assert.ok(
      /not quite/i.test(doc.getElementById("feedback").textContent),
      "a wrong guess is rejected kindly"
    );
    assert.strictEqual(
      doc.getElementById("scramble-display").textContent, scrambled,
      "and the same word is still up for guessing"
    );
  });

  // ------------------------------------------------------- categories

  await test("categories: picking a letter moves you to filling it in", async () => {
    const { window, doc } = await loadPage("games/categories.html");
    click(window, doc.getElementById("start-local"));
    await tick();
    assert.ok(visible(doc.getElementById("phase-letter")), "you pick a letter first");
    click(window, doc.querySelector("#letter-grid .letter-btn"));
    await tick();
    assert.ok(visible(doc.getElementById("phase-filling")), "then you fill the categories");
    assert.strictEqual(doc.querySelectorAll("#fill-fields input").length, 5, "five categories to fill");
  });

  await test("categories: locking in both players reaches the review table", async () => {
    const { window, doc, errors } = await loadPage("games/categories.html");
    click(window, doc.getElementById("start-local"));
    await tick();
    click(window, doc.querySelector("#letter-grid .letter-btn"));
    await tick();

    for (let player = 0; player < 2; player++) {
      doc.querySelectorAll("#fill-fields input").forEach((input, i) => {
        input.value = `A${player}${i}`;
      });
      click(window, doc.getElementById("lock-in"));
      await tick();
    }
    assert.ok(visible(doc.getElementById("phase-review")), "both locked in, so we review");
    assert.ok(doc.querySelector("#review-table table"), "the answers are laid out to check");
    assert.strictEqual(errors.length, 0);
  });

  // ------------------------------------------------------------ chain

  await test("chain: a valid word is accepted and the turn passes", async () => {
    const { window, doc } = await loadPage("games/chain.html");
    click(window, doc.getElementById("start-local"));
    await tick();
    doc.getElementById("word-input").value = "jollof";
    click(window, doc.getElementById("submit-word"));
    await tick();
    assert.strictEqual(doc.querySelectorAll("#chain-log li").length, 1, "the word was logged");
    assert.ok(/F/i.test(doc.getElementById("requirement-label").textContent), "next word must start with F");
  });

  await test("chain: a word with the wrong first letter is refused", async () => {
    const { window, doc } = await loadPage("games/chain.html");
    click(window, doc.getElementById("start-local"));
    await tick();
    doc.getElementById("word-input").value = "jollof";
    click(window, doc.getElementById("submit-word"));
    await tick();
    doc.getElementById("word-input").value = "amala";
    click(window, doc.getElementById("submit-word"));
    await tick();
    assert.strictEqual(doc.querySelectorAll("#chain-log li").length, 1, "the bad word was not logged");
    assert.ok(doc.getElementById("feedback").textContent.length > 0, "and you're told why");
  });

  // --------------------------------------------------- dots and boxes

  await test("dots and boxes: claiming edges closes a box and scores it", async () => {
    const { window, doc, errors } = await loadPage("games/dots-and-boxes.html");
    doc.getElementById("grid-size").value = "3";
    click(window, doc.getElementById("start-local"));
    await tick();

    assert.ok(doc.querySelectorAll("#board-stage .edge-hit").length > 0, "edges are there to draw");

    // Fill the whole grid: every box must end up owned and the game must end.
    for (let i = 0; i < 200; i++) {
      if (visible(doc.getElementById("end-screen"))) break;
      const remaining = doc.querySelectorAll("#board-stage .edge-hit");
      if (!remaining.length) break;
      click(window, remaining[0]);
      await tick(5);
    }

    assert.ok(visible(doc.getElementById("end-screen")), "the grid filled and the game ended");
    const finals = [...doc.querySelectorAll("#end-screen .seat-score")].map((n) => Number(n.textContent));
    assert.strictEqual(finals[0] + finals[1], 9, "all nine boxes were claimed by someone");
    assert.ok(doc.getElementById("winner-line").textContent.length > 0, "a result is announced");
    assert.strictEqual(errors.length, 0, `errors while playing: ${errors[0] && errors[0].message}`);
  });

  // ----------------------------------------------------------- puzzle

  await test("puzzle: a solo board is built and tiles respond to taps", async () => {
    const { window, doc, errors } = await loadPage("games/puzzle.html");
    doc.getElementById("grid-size").value = "3";
    click(window, doc.getElementById("start-local"));
    await tick();

    const tiles = doc.querySelectorAll("#puzzle-board .puzzle-tile");
    assert.strictEqual(tiles.length, 9, "nine tiles for a 3x3");
    click(window, tiles[0]);
    await tick();
    assert.ok(doc.querySelector("#puzzle-board .puzzle-tile.selected"), "tapping one selects it");
    click(window, doc.querySelectorAll("#puzzle-board .puzzle-tile")[1]);
    await tick();
    assert.strictEqual(
      doc.querySelectorAll("#puzzle-board .puzzle-tile.selected").length, 0,
      "tapping a second swaps them and clears the selection"
    );
    assert.strictEqual(errors.length, 0);
  });

  // ------------------------------------------------------ celebration

  await test("celebration: a win shows a title, a subtitle and confetti", async () => {
    const { window, doc } = await loadPage("games/ncho.html");
    window.eval(`
      BabeCelebrate.show({
        outcome: "win", title: "You win!", subtitle: "Only 2 seeds in it.",
        titleEl: document.getElementById("winner-line"),
        subtitleEl: document.getElementById("result-subtitle"),
      });
    `);
    await tick();
    assert.strictEqual(doc.getElementById("winner-line").textContent, "You win!");
    assert.ok(doc.getElementById("winner-line").className.includes("win"));
    assert.strictEqual(doc.getElementById("result-subtitle").textContent, "Only 2 seeds in it.");
    assert.ok(doc.querySelector(".confetti-layer"), "confetti was thrown");
    assert.ok(doc.querySelectorAll(".confetti-bit").length > 20, "and there's a decent amount of it");
  });

  await test("celebration: losing is never phrased as losing", async () => {
    const { window } = await loadPage("games/ncho.html");
    const result = window.eval(`JSON.stringify(BabeCelebrate.describe({
      isOnline: true, mySlot: 0, winner: 1,
      names: ["Ada", "Emeka"], scores: [22, 26], unit: "seeds",
    }))`);
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.outcome, "close");
    assert.ok(!/lose|lost|defeat/i.test(parsed.title + parsed.subtitle), `no losing language, got: ${parsed.title} / ${parsed.subtitle}`);
    assert.ok(/4 seeds/.test(parsed.subtitle), "it points out how close it was");
  });

  await test("celebration: a tie reads as level, not as a failure", async () => {
    const { window } = await loadPage("games/ncho.html");
    const parsed = JSON.parse(window.eval(`JSON.stringify(BabeCelebrate.describe({
      isOnline: true, mySlot: 0, winner: -1, names: ["Ada", "Emeka"], scores: [24, 24],
    }))`));
    assert.strictEqual(parsed.outcome, "tie");
    assert.ok(/level/i.test(parsed.title));
  });

  // ------------------------------------------------------- the lobby

  await test("lobby: opening Play Online shows the room controls", async () => {
    const { window, doc, errors } = await loadPage("games/ncho.html");
    click(window, doc.getElementById("start-online"));
    await tick();
    const modal = doc.getElementById("online-modal");
    assert.ok(modal, "the lobby opened");
    assert.ok(doc.getElementById("online-create-btn"), "you can create a room");
    assert.ok(doc.getElementById("online-join-code"), "or join with a code");
    assert.strictEqual(errors.length, 0, `errors opening the lobby: ${errors[0] && errors[0].message}`);
  });

  openWindows.forEach((w) => {
    try { w.close(); } catch { /* already gone */ }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
  process.exit(0);
})();
