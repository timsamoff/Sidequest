// Session-start hook: once a week, ask GitHub whether a newer Sentinel exists. Prints nothing on any failure.
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stamp = path.join(root, "Sentinel-Notes", ".sentinel-update-check");
const URL = "https://raw.githubusercontent.com/timsamoff/Sentinel/main/Sentinel-Prompts/sentinel-init.md";
const VERSION_RE = /^\*\*Version (\d+\.\d+\.\d+)\*\*\s*$/m;

function read(p) { try { return fs.readFileSync(p, "utf8"); } catch (e) { return ""; } }
function newer(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if (y[i] !== x[i]) return y[i] > x[i]; }
  return false;
}

function main() {
  const local = read(path.join(root, "Sentinel-Prompts", "sentinel-init.md")).split("\n").slice(0, 5).join("\n").match(VERSION_RE);
  if (!local) return;
  try {
    if (Date.now() - fs.statSync(stamp).mtimeMs < 7 * 86400000) return;
  } catch (e) { /* no stamp yet */ }
  const req = https.get(URL, { timeout: 4000 }, (res) => {
    let body = "";
    res.setEncoding("utf8");
    res.on("data", (c) => { if (body.length < 4000) body += c; });
    res.on("end", () => {
      try { fs.writeFileSync(stamp, new Date().toISOString()); } catch (e) { /* unwritable: skip quietly */ }
      const remote = body.split("\n").slice(0, 5).join("\n").match(VERSION_RE);
      if (!remote || !newer(local[1], remote[1])) return;
      const skipped = read(path.join(root, "PROJECT_PROFILE.md")).match(/^Skipped update:\s*(\S+)/m);
      if (skipped && skipped[1] === remote[1]) return;
      console.log("A newer version of Sentinel is available (" + remote[1] + "; installed: " + local[1] + "). In your first reply, whatever the user asks, tell them and ask whether to update now, not now, or skip this version. If they say update now, follow 'Apply the update' in 00-project-discovery.md.");
    });
  });
  req.on("timeout", () => req.destroy());
  req.on("error", () => {});
}

try { main(); } catch (e) { /* never fail a session start */ }
