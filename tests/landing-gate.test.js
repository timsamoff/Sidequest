// The landing-site parity check and the satchel/ gate coverage: real files must be clean, and a deliberate drift must be caught.
const fs = require("fs");
const path = require("path");
const pre = require("../.githooks/lib/check-pre-commit.js");
const landing = require("../.githooks/lib/check-landing.js");

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

const root = path.join(__dirname, "..");
const read = (f) => { const p = path.join(root, f); return fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\r\n").join("\n") : null; };
const pages = fs.readdirSync(path.join(root, "satchel")).filter((f) => f.endsWith(".html")).sort().map((f) => "satchel/" + f);

ok(pages.length === 6, "found the six landing pages (" + pages.length + ")");
ok(pre.satchelFiles([".html"]).length === pages.length, "satchelFiles() lists every landing page");
ok(pre.COMMENT_SCAN_FILES.includes("satchel/satchel.css") && pre.COMMENT_SCAN_FILES.includes("satchel/index.html") && pre.COMMENT_SCAN_FILES.includes("satchel/welcome-splash.js"), "the comment check scans satchel css, html, and js");
ok(pre.HEX_SCAN_FILES.includes("satchel/satchel.css") && pre.HEX_SCAN_FILES.includes("satchel/satchel.js"), "the hex check scans satchel css and js");
ok(!pre.HEX_SCAN_FILES.some((f) => f.endsWith(".html") && f.startsWith("satchel/")), "landing html is not hex-scanned (theme-color metas must be literal)");
ok(landing.landingViolations(read, pages).length === 0, "the real landing site has no parity violations");

function drift(file, edit) {
  const swapped = (f) => (f === file ? edit(read(f)) : read(f));
  return landing.landingViolations(swapped, pages);
}
ok(drift("satchel/why.html", (s) => s.replace("Source on GitHub", "Source")).some((v) => /footer/.test(v.message)), "a changed footer is caught");
ok(drift("satchel/why.html", (s) => s.replace("Features</a>", "Feature list</a>")).some((v) => /header/.test(v.message)), "a changed header is caught");
ok(drift("satchel/why.html", (s) => s.replace(' aria-current="page"', "")).some((v) => /aria-current/.test(v.message)), "a page that does not mark itself in the nav is caught");
ok(drift("satchel/import.html", (s) => s.replace('<symbol id="sqLogo" viewBox="0 0 512 512">', '<symbol id="sqLogo" viewBox="0 0 500 500">')).some((v) => /logo symbol/.test(v.message)), "a changed logo symbol is caught");
ok(drift("satchel/features.html", (s) => s.replace('content="#4F3416"', 'content="#000000"')).some((v) => /Light theme-color/.test(v.message)), "a stale light theme-color is caught");
ok(drift("satchel/features.html", (s) => s.replace('content="#4D3428"', 'content="#000000"')).some((v) => /Dark theme-color/.test(v.message)), "a stale dark theme-color is caught");
ok(drift("satchel/app.html", (s) => s.replace("It needs the", "It really needs the")).some((v) => /claudePrompt/.test(v.message)), "a drifted Claude prompt is caught");
ok(drift("satchel/app.html", (s) => s.replace("click-test every button", "click every button")).some((v) => /musePrompt/.test(v.message)), "a drifted Muse prompt is caught");
ok(drift("satchel/index.html", (s) => s.replace("data-parity=\"tagline\">A lightweight project planner for juggling several", "data-parity=\"tagline\">A lightweight project planner for juggling")).some((v) => /tagline/.test(v.message)), "a drifted tagline is caught");
ok(drift("satchel/why.html", (s) => s.replace("GPLv3", "MIT")).some((v) => /license/.test(v.message)), "a drifted license line is caught");

console.log(fails ? "\n" + fails + " FAILED" : "\nALL PASSED");
process.exit(fails ? 1 : 0);
