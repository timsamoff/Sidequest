#!/usr/bin/env node
// Manual Sentinel command: with no flag it runs the pre-commit checks against the staged diff, and with --full it scans the whole repo and exits non-zero on violations beyond the baseline.
"use strict";
const fs = require("fs");
const path = require("path");
const common = require("./lib/sentinel-common");
const checks = require("./lib/check-pre-commit");
const extCheck = require("./lib/check-new-extension");
const helpDrift = require("./lib/check-help-drift");
const landing = require("./lib/check-landing");
const { checkCommitMessage } = require("./lib/check-commit-msg");
const { execSync } = require("child_process");

const BASELINE_PATH = path.join("Sentinel-Notes", "sentinel-baseline.json");

function loadBaseline() {
  const raw = common.diskRead(BASELINE_PATH);
  if (!raw) return { entries: [] };
  try {
    return JSON.parse(raw);
  } catch (e) {
    common.failLoud("Sentinel-Notes/sentinel-baseline.json is not valid JSON: " + e.message);
  }
}

function baselineKey(v) {
  return `${v.rule}::${v.file}::${(v.message || "").slice(0, 120)}`;
}

function writeBaseline(violations) {
  const entries = violations.map((v) => ({ key: baselineKey(v), rule: v.rule, file: v.file, message: v.message }));
  fs.writeFileSync(common.repoPath(BASELINE_PATH), JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2) + "\n", "utf8");
}

// --- Full-repo structural scans (things a single commit's diff cannot reveal) ---

function fullScanNormalizeDefaultsPairing() {
  // defaults()/normalize() moved to app/state.js in the JS module split
  // (2026-09-21) -- was index.html, read via common.diskRead("index.html").
  const source = common.diskRead("app/state.js");
  const defaultsKeys = checks.extractDefaultsKeys(source);
  const normalizeBody = checks.extractNormalizeBody(source);
  const INTENTIONALLY_UNPAIRED = new Set(["v"]);
  const violations = [];
  defaultsKeys.forEach((key) => {
    if (INTENTIONALLY_UNPAIRED.has(key)) return;
    const refRe = new RegExp("\\bd\\." + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    if (!refRe.test(normalizeBody)) {
      violations.push(common.violation("normalize-defaults-pairing", "app/state.js", null, `defaults() key "${key}" has no matching normalize() branch.`));
    }
  });
  return violations;
}

function fullScanCrossListPairing() {
  // Cross-list consistency, deliberately narrow: only SEARCH_LABELS/SEARCH_ORDER (app/search.js) and KIND_LABEL/KIND_FILTERS (app/views.js), each read from its own file. WORDS and CORE/BOTTOM are a different shape and excluded.
  const searchSource = common.diskRead("app/search.js") || "";
  const viewsSource = common.diskRead("app/views.js") || "";
  const violations = [];

  function pairCheck(source, file, labelName, orderOrFilterName, extractOrderKeys) {
    const labelMatch = source.match(new RegExp(labelName + "\\s*=\\s*\\{([\\s\\S]*?)\\};"));
    const orderMatch = source.match(new RegExp(orderOrFilterName + "\\s*=\\s*(\\[[\\s\\S]*?\\]);"));
    if (!labelMatch || !orderMatch) {
      violations.push(common.violation("cross-list-consistency", file, null, `Could not locate ${labelName} or ${orderOrFilterName} to verify they stay paired -- check manually.`));
      return;
    }
    const labelKeys = new Set();
    const keyRe = /(\w+):/g;
    let m;
    while ((m = keyRe.exec(labelMatch[1])) !== null) labelKeys.add(m[1]);
    const orderKeys = new Set(extractOrderKeys(orderMatch[1]));
    // "all" in KIND_FILTERS is an intentional UI-only option never used as a KIND_LABEL key, so it is excluded by name.
    const INTENTIONAL_ASYMMETRY = new Set(["all"]);
    labelKeys.forEach((k) => { if (!orderKeys.has(k)) violations.push(common.violation("cross-list-consistency", file, null, `${labelName} has key "${k}" with no matching entry in ${orderOrFilterName}.`)); });
    orderKeys.forEach((k) => { if (!labelKeys.has(k) && !INTENTIONAL_ASYMMETRY.has(k)) violations.push(common.violation("cross-list-consistency", file, null, `${orderOrFilterName} references "${k}" with no matching entry in ${labelName}.`)); });
  }

  function extractQuoted(text) {
    const out = [];
    const re = /"(\w+)"/g;
    let mm;
    while ((mm = re.exec(text)) !== null) out.push(mm[1]);
    return out;
  }
  // SEARCH_ORDER is a flat array of quoted kind-keys: ["task", "step", ...].
  // Both SEARCH_LABELS and SEARCH_ORDER live in app/search.js.
  pairCheck(searchSource, "app/search.js", "SEARCH_LABELS", "SEARCH_ORDER", extractQuoted);
  // KIND_FILTERS is an array of [key, label] pairs; only the first string in each pair is the key.
  pairCheck(viewsSource, "app/views.js", "KIND_LABEL", "KIND_FILTERS", (text) => {
    const out = [];
    const re = /\[\s*"(\w+)"\s*,\s*"[^"]*"\s*\]/g;
    let mm;
    while ((mm = re.exec(text)) !== null) out.push(mm[1]);
    return out;
  });

  return violations;
}

function fullScanSocialMetaDrift() {
  const indexSource = common.diskRead("index.html");
  const readmeSource = common.diskRead("README.md");
  if (!indexSource || !readmeSource) return [];
  const ogMatch = indexSource.match(/<meta\s+property="og:description"\s+content="([^"]*)"/);
  if (!ogMatch) return [];
  const ogDesc = ogMatch[1];
  const lines = readmeSource.split("\n");
  let readmeOpening = null;
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith("#") && !t.startsWith("<")) { readmeOpening = t; break; }
  }
  if (readmeOpening === null || !readmeOpening.startsWith(ogDesc)) {
    return [common.violation("social-meta-drift", "index.html", null, `og:description ("${ogDesc.slice(0, 60)}...") no longer matches the start of README's opening paragraph.`)];
  }
  return [];
}

// Whole-file check for a literal (radius, height, text size) repeated 3+ times in styles.css with no token, the counterpart to checkCssTokenValue()'s diff-scoped check.
function fullScanCssRepeatedLiteral() {
  const source = common.diskRead("css/styles.css") || "";
  const tokensSource = common.diskRead("css/tokens.css") || "";
  const tokenValues = checks.extractTokenValues(tokensSource);
  const violations = [];
  checks.CSS_PROPERTY_TOKEN_FAMILIES.forEach(({ prop, nameRe }) => {
    const counts = new Map();
    const re = new RegExp("\\b" + prop + ":\\s*([\\d.]+(?:px|rem|em)|999px)\\b", "g");
    let m;
    while ((m = re.exec(source)) !== null) {
      const value = m[1];
      if (checks.tokenNameForFamily(tokenValues, value, nameRe)) continue; // already tokenized for THIS property; checkCssTokenValue's job
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    counts.forEach((count, value) => {
      if (count < 3) return;
      violations.push(common.violation("css-repeated-literal", "css/styles.css", null, `The literal "${value}" appears ${count} times for ${prop} with no token behind it. Consider adding one to css/tokens.css.`));
    });
  });
  return violations;
}

// Whole-file version of checkCommentVerbosity() -- catches existing comments
// that already have the tell, not just newly-added ones.
function fullScanCommentVerbosity() {
  const violations = [];
  checks.COMMENT_SCAN_FILES.forEach((file) => {
    const source = common.diskRead(file);
    if (!source) return;
    source.split("\n").forEach((line) => {
      const trimmed = line.trim();
      const looksLikeComment = /^\/\//.test(trimmed) || /^\/?\*/.test(trimmed) || /^<!--/.test(trimmed) || /-->$/.test(trimmed);
      if (!looksLikeComment) return;
      checks.COMMENT_VERBOSITY_PATTERNS.forEach(({ name, re }) => {
        if (!re.test(line)) return;
        violations.push(common.violation("comment-verbosity", file, null, `Comment reads like an inline changelog entry (${name}): "${trimmed.slice(0, 90)}". Keep it a short pointer; put narrative in CLAUDE.md instead.`));
      });
    });
  });
  return violations;
}

function fullScanHookIntegrity() {
  const violations = [];
  const { execFileSync } = require("child_process");
  let hooksPath;
  try {
    hooksPath = execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: common.REPO_ROOT, encoding: "utf8" }).trim();
  } catch (e) {
    hooksPath = "";
  }
  // Accept the relative .githooks path or an absolute path that resolves to it, since git on Windows can round-trip it to an absolute form.
  const path = require("path");
  const resolved = hooksPath ? path.resolve(common.REPO_ROOT, hooksPath) : "";
  const expected = common.repoPath(".githooks");
  if (!hooksPath || path.normalize(resolved) !== path.normalize(expected)) {
    violations.push(common.violation("hook-infrastructure-missing", ".git/config", null, `core.hooksPath is "${hooksPath || "(unset)"}", which does not resolve to the tracked .githooks directory. Run: git config core.hooksPath .githooks`));
    return violations;
  }
  ["commit-msg", "pre-commit"].forEach((name) => {
    const p = common.repoPath(".githooks", name);
    if (!fs.existsSync(p)) {
      violations.push(common.violation("hook-infrastructure-missing", `.githooks/${name}`, null, "Expected tracked hook file is missing."));
      return;
    }
    try {
      fs.accessSync(p, fs.constants.X_OK);
    } catch (e) {
      violations.push(common.violation("hook-infrastructure-missing", `.githooks/${name}`, null, "Hook file exists but is not executable (chmod +x needed on POSIX; Windows/git-bash generally does not need this, but a fresh clone on Linux/macOS would)."));
    }
  });
  return violations;
}

function runFullScan() {
  let violations = [];
  violations = violations.concat(fullScanNormalizeDefaultsPairing());
  violations = violations.concat(fullScanCrossListPairing());
  violations = violations.concat(fullScanHookIntegrity());
  violations = violations.concat(fullScanSocialMetaDrift());
  violations = violations.concat(fullScanCssRepeatedLiteral());
  violations = violations.concat(fullScanCommentVerbosity());
  violations = violations.concat(landing.landingViolations(common.diskRead, checks.tavernFiles([".html"])));
  // README keyword map, whole-repo: every CORE/BOTTOM/pinned-page label must appear in README. The regex has to handle CORE/BOTTOM's nested [key, label] pair arrays.
  const source = common.diskRead("app/model.js");
  const readme = common.diskRead("README.md");
  const coreBottomMatch = source.match(/(?:export )?var (?:CORE|BOTTOM) = (\[(?:\[[^\]]*\],?\s*)*\]);/g) || [];
  coreBottomMatch.forEach((decl) => {
    const labels = (decl.match(/"([^"]+)"\s*\]/g) || []).map((s) => s.match(/"([^"]+)"/)[1]);
    labels.forEach((label) => {
      if (!readme.includes(label)) {
        violations.push(common.violation("readme-keyword-missing", "README.md", null, `Page label "${label}" (from CORE/BOTTOM) does not appear in README.md's current text.`));
      }
    });
  });
  return violations;
}

// After-the-fact check of the latest commit message. A hook can stop a bad
// message before it lands; this can only flag one that already did (for example
// after a --no-verify), so it prints a notice and does not fail the command.
function lastCommitNotice() {
  let message;
  try {
    message = execSync("git log -1 --format=%B", { cwd: common.REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return; // no commits yet, or git unavailable: nothing to inspect
  }
  const bad = checkCommitMessage(message).violations;
  if (!bad.length) return;
  console.log("[Sentinel] The latest commit message breaks the convention (checked after the fact, so this cannot undo it):");
  bad.forEach((v) => console.log("  - " + v.rule + ": " + v.message));
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const reportOnly = args.includes("--report-only");

  if (!full) {
    // Diff-scoped mode: identical checks to the pre-commit hook, run against
    // whatever is currently staged (or nothing, if nothing is staged -- in which
    // case every diff-scoped check trivially finds nothing to say, which is correct).
    let violations = [];
    violations = violations.concat(extCheck.runCheck());
    violations = violations.concat(checks.checkClaudeMdTouched());
    violations = violations.concat(checks.checkReadmeTouched());
    violations = violations.concat(checks.checkTodoSync());
    violations = violations.concat(checks.checkNormalizeDefaultsPairing());
    violations = violations.concat(checks.checkHardcodedHex());
    violations = violations.concat(checks.checkCommentVerbosity());
    violations = violations.concat(checks.checkCssTokenValue());
    violations = violations.concat(checks.checkDuplicatedIconMarkup());
    violations = violations.concat(checks.checkSocialMetaDrift());
    violations = violations.concat(checks.checkArtifactBuildDrift());
    violations = violations.concat(checks.checkLandingParity());
    violations = violations.concat(checks.runNpmTest());
    if (violations.length) {
      common.printViolations(violations, "Sentinel: sentinel-check found violations (diff-scoped)");
      process.exitCode = 1;
      return;
    }
    const helpReminder = helpDrift.helpDriftReminder();
    if (helpReminder) console.log("[Sentinel] " + helpReminder);
    lastCommitNotice();
    console.log("Sentinel: diff-scoped check passed, no violations.");
    process.exitCode = 0;
    return;
  }

  // Full-repo scan.
  const violations = runFullScan();

  if (reportOnly) {
    if (!violations.length) {
      console.log("Sentinel full scan (report-only): no violations found.");
    } else {
      common.printViolations(violations, "Sentinel full scan (report-only) findings");
      console.log(`\n${violations.length} finding(s). Report-only mode: not failing the build.`);
    }
    process.exitCode = 0;
    return;
  }

  const baseline = loadBaseline();
  const baselineKeys = new Set(baseline.entries.map((e) => e.key));
  const newViolations = violations.filter((v) => !baselineKeys.has(baselineKey(v)));
  const knownBacklog = violations.filter((v) => baselineKeys.has(baselineKey(v)));

  if (knownBacklog.length) {
    console.log(`(${knownBacklog.length} known pre-existing violation(s) from the baseline -- not blocking.)`);
  }
  if (newViolations.length) {
    common.printViolations(newViolations, "Sentinel full scan: NEW violations (not in baseline)");
    process.exitCode = 1;
    return;
  }
  lastCommitNotice();
  console.log("Sentinel full scan: no new violations beyond the recorded baseline.");
  process.exitCode = 0;
}

try {
  main();
} catch (e) {
  if (process.exitCode === undefined || process.exitCode === 0) process.exitCode = 1;
  if (!/\[Sentinel\] INTERNAL ERROR/.test(String(e && e.message))) {
    process.stderr.write("[Sentinel] sentinel-check crashed: " + (e && e.stack || e) + "\n");
  }
}

module.exports = { runFullScan, loadBaseline, writeBaseline, baselineKey };
