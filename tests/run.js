// Runs every *.test.js in this folder and reports the totals.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
let pass = 0, fail = 0;
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort()) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
  const lines = (r.stdout || "").split("\n");
  const p = lines.filter(l => l.startsWith("PASS ")).length, x = lines.filter(l => l.startsWith("FAIL ")).length;
  pass += p; fail += x + (r.status ? 1 : 0) * (x ? 0 : 1);
  console.log((x || r.status ? "FAIL " : "ok   ") + f + "  (" + p + " passed" + (x ? ", " + x + " failed" : "") + ")");
  lines.filter(l => l.startsWith("FAIL ")).forEach(l => console.log("     " + l));
  if (r.status && !x) console.log((r.stderr || "").split("\n").slice(0, 8).join("\n"));
}
console.log("\n" + pass + " checks passed" + (fail ? ", " + fail + " problems" : ""));
process.exit(fail ? 1 : 0);
