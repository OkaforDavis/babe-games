// Checks that every element id the page scripts reach for actually exists in
// the HTML (or is created by that same script). Catches the classic
// "Cannot read properties of null" crash without needing a browser.
//
// Run with: node tests/dom.test.js
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");

const PAGES = [
  { html: "games/ncho.html", js: ["games/ncho.js"] },
  { html: "games/scramble.html", js: ["games/scramble.js"] },
  { html: "games/categories.html", js: ["games/categories.js"] },
  { html: "games/chain.html", js: ["games/chain.js"] },
  { html: "games/dots-and-boxes.html", js: ["games/dots-and-boxes.js"] },
  { html: "games/puzzle.html", js: ["games/puzzle.js"] },
  { html: "index.html", js: [] },
];

// Ids that the shared modules require every game page to provide.
const SHARED_REQUIRED = ["setup-screen", "play-screen", "end-screen", "online-bar", "start-local", "start-online", "notify-widget", "profile-widget"];

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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function idsIn(source) {
  const found = new Set();
  const re = /\bid\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(source))) found.add(m[1]);
  return found;
}

function lookupsIn(source) {
  const found = new Set();
  const re = /getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  let m;
  while ((m = re.exec(source))) found.add(m[1]);
  return found;
}

PAGES.forEach((page) => {
  test(`${page.html}: every element the scripts look up exists`, () => {
    const html = read(page.html);
    const htmlIds = idsIn(html);

    page.js.forEach((jsFile) => {
      const js = read(jsFile);
      const createdHere = idsIn(js); // ids this script builds itself
      lookupsIn(js).forEach((id) => {
        // `seat-${slot}` style lookups are per-seat: check every seat exists.
        const candidates = id.includes("${")
          ? [0, 1].map((i) => id.replace(/\$\{[^}]+\}/g, String(i)))
          : [id];
        candidates.forEach((candidate) => {
          assert.ok(
            htmlIds.has(candidate) || createdHere.has(candidate),
            `${jsFile} looks up #${candidate}, which ${page.html} never defines`
          );
        });
      });
    });
  });

  if (page.js.length) {
    test(`${page.html}: provides the shared game shell elements`, () => {
      const htmlIds = idsIn(read(page.html));
      SHARED_REQUIRED.forEach((id) => {
        assert.ok(htmlIds.has(id), `${page.html} is missing #${id}, which the shared engine needs`);
      });
    });

    test(`${page.html}: loads the engine scripts in the right order`, () => {
      const html = read(page.html);
      const order = ["common.js", "online.js", "-rules.js", "game.js", "game-ui.js"];
      let cursor = -1;
      order.forEach((needle) => {
        const at = html.indexOf(needle);
        assert.ok(at > -1, `${page.html} never loads ${needle}`);
        assert.ok(at > cursor, `${page.html} loads ${needle} out of order`);
        cursor = at;
      });
      const own = page.js[0].split("/").pop();
      assert.ok(html.indexOf(own) > cursor, `${page.html} must load ${own} after the engine`);
    });
  }
});

test("shared modules only reach for ids the pages are required to provide", () => {
  const gameUi = read("js/game-ui.js");
  const created = idsIn(gameUi);
  lookupsIn(gameUi).forEach((id) => {
    assert.ok(
      SHARED_REQUIRED.includes(id) || created.has(id),
      `game-ui.js looks up #${id}, which isn't in the shared contract`
    );
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
