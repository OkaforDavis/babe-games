// Runs every test suite and reports one verdict. `npm test`
const { execFileSync } = require("child_process");
const path = require("path");

const SUITES = [
  ["game rules", "rules.test.js"],
  ["online sync", "online.test.js"],
  ["connecting", "transport.test.js"],
  ["page wiring", "dom.test.js"],
  ["playing the real pages", "pages.test.js"],
];

let total = 0;
let failedSuites = 0;

for (const [label, file] of SUITES) {
  process.stdout.write(`\n— ${label} —`);
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, file)], { encoding: "utf8" });
    const match = out.match(/(\d+) passed, (\d+) failed/);
    if (match) total += Number(match[1]);
    process.stdout.write(out.trimEnd().split("\n").pop().replace(/^/, " ") + "\n");
  } catch (err) {
    failedSuites++;
    process.stdout.write("\n" + (err.stdout || "") + (err.stderr || "") + "\n");
  }
}

console.log(`\n${total} tests passed across ${SUITES.length} suites` + (failedSuites ? `, ${failedSuites} suite(s) FAILED` : ""));
process.exit(failedSuites ? 1 : 0);
