// Part 0b -- new-file-extension-category check. A standing Sentinel default, not a
// project-specific proposal: build it on every 03 run regardless of what
// INTEGRATION_CHECKLIST.md says.
//
// Manifest location decision (flagged in the implementation report as a fork
// resolved without live user confirmation, per this run's non-interactive
// override): the manifest lives in the TRACKED hook directory
// (.githooks/sentinel-known-extensions.txt), not under the gitignored
// sentinel-notes/. Reasoning: the manifest's CONTENT isn't sensitive (it's just a
// list of file extensions like ".html" or ".png"), and a future clone or
// contributor benefits from seeing what kinds of files this project expects --
// unlike sentinel-exceptions.json, which can carry internal-detail reasons the
// project wants to keep off a public repo.

"use strict";
const fs = require("fs");
const path = require("path");
const common = require("./sentinel-common");

const MANIFEST_PATH = path.join(".githooks", "sentinel-known-extensions.txt");

function extOf(filePath) {
  const base = path.basename(filePath);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "(no extension)"; // dotfiles like .gitignore, and extensionless files like LICENSE
  return base.slice(dot).toLowerCase();
}

function loadKnownExtensions() {
  const raw = common.diskRead(MANIFEST_PATH);
  if (raw === null) return new Set();
  return new Set(raw.split("\n").map((l) => l.trim()).filter(Boolean));
}

function saveKnownExtensions(set) {
  const sorted = Array.from(set).sort();
  fs.writeFileSync(common.repoPath(MANIFEST_PATH), sorted.join("\n") + "\n", "utf8");
}

// Seed the manifest from the current working tree (used once at build time, and
// safe to call again -- it only adds, never removes).
function seedFromWorkingTree() {
  const known = loadKnownExtensions();
  const { execFileSync } = require("child_process");
  const tracked = execFileSync("git", ["ls-files"], { cwd: common.REPO_ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
  tracked.forEach((f) => known.add(extOf(f)));
  saveKnownExtensions(known);
  return known;
}

// Checks staged files for this commit. Returns { newExtensions: [...], updatedManifest }.
// Does NOT ask interactive questions itself (a git hook has no reliable interactive
// prompt channel mid-commit) -- instead it prints the routing questions as text and
// blocks with a clear "answer these, then re-run with SENTINEL_ACK_NEW_EXT=<ext> to
// proceed" escape hatch, so it fails loud rather than silently letting a new asset
// category through unnoticed, and never assumes an answer on the user's behalf.
function checkNewExtensions() {
  const known = loadKnownExtensions();
  const added = common.stagedFiles().filter((f) => f.status === "A");
  const newOnes = [];
  const seen = new Set();
  added.forEach((f) => {
    const ext = extOf(f.path);
    if (!known.has(ext) && !seen.has(ext)) {
      seen.add(ext);
      newOnes.push({ ext, examplePath: f.path });
    }
  });
  return newOnes;
}

function acknowledgedExtensions() {
  const raw = process.env.SENTINEL_ACK_NEW_EXT || "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

function runCheck() {
  const violations = [];
  const newOnes = checkNewExtensions();
  if (!newOnes.length) return violations;

  const acked = acknowledgedExtensions();
  const stillNew = newOnes.filter((n) => !acked.has(n.ext));
  if (!stillNew.length) {
    // All flagged extensions were acknowledged via env var -- update the manifest
    // so they don't re-trigger next time, per the "manifest updates after a fire" requirement.
    const known = loadKnownExtensions();
    newOnes.forEach((n) => known.add(n.ext));
    saveKnownExtensions(known);
    return violations;
  }

  stillNew.forEach((n) => {
    violations.push(
      common.violation(
        "new-file-extension",
        n.examplePath,
        null,
        `This commit introduces the first file with extension "${n.ext}" this project has ever tracked (example: ${n.examplePath}). ` +
        `Before committing, consider: (1) What kind of file/asset is this, in plain terms? (2) Does it plausibly need ` +
        `design-quality treatment (2D art, 3D models/textures, audio, voice/video) -- if so, bring it up next time the ` +
        `Design & Code Quality Audit (01) runs, or run it now. (3) Does it plausibly need an integration touchpoint ` +
        `(referenced by rendering, persistence, a registry, etc.) -- if so, log it to sentinel-notes/TODO.md as a ` +
        `candidate for the next Integration Audit (02) run. If this is genuinely a one-off with no standing ` +
        `implication, that's fine -- re-run with SENTINEL_ACK_NEW_EXT=${n.ext} set (comma-separate multiple) to ` +
        `acknowledge and let this commit through; the manifest updates automatically so "${n.ext}" won't re-trigger.`
      )
    );
  });
  return violations;
}

module.exports = { extOf, loadKnownExtensions, saveKnownExtensions, seedFromWorkingTree, checkNewExtensions, runCheck, MANIFEST_PATH };
