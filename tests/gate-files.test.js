// The gate's file lists must cover every module under app/. They used to be
// hand-written, and app/splash.js and app/dates.js silently dropped out of them.
const fs = require("fs");
const path = require("path");
const pre = require("../.githooks/lib/check-pre-commit.js");

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

const onDisk = fs.readdirSync(path.join(__dirname, "..", "app")).filter(f => f.endsWith(".js")).map(f => "app/" + f);
ok(onDisk.length >= 10, "found the app modules on disk (" + onDisk.length + ")");
ok(onDisk.every(f => pre.SOURCE_FILES.includes(f)), "SOURCE_FILES covers every app/*.js module");
ok(onDisk.every(f => pre.HEX_SCAN_FILES.includes(f)), "HEX_SCAN_FILES covers every app/*.js module");
ok(pre.SOURCE_FILES.includes("app/splash.js") && pre.SOURCE_FILES.includes("app/dates.js"), "the two modules that used to be missing are included");
ok(pre.SOURCE_FILES.includes("index.html"), "index.html is still checked");
ok(pre.HEX_SCAN_FILES.includes("css/tokens.css") && pre.HEX_SCAN_FILES.includes("css/styles.css"), "both stylesheets are still hex-scanned");
ok(JSON.stringify(pre.appModules()) === JSON.stringify(onDisk.slice().sort()), "appModules() returns the sorted app/*.js list");

console.log(fails ? "\n" + fails + " FAILED" : "\nALL PASSED");
process.exit(fails ? 1 : 0);
