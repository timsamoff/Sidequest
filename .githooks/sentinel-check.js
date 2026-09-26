#!/usr/bin/env node
// Manual Sentinel command. Two modes:
//   node .githooks/sentinel-check.js          -- diff-scoped, same checks the
//                                                 pre-commit hook runs, against
//                                                 whatever is currently staged.
//                                                 Useful for checking without
//                                                 committing, or if hooks are ever
//                                                 bypassed with --no-verify.
//   node .githooks/sentinel-check.js --full   -- whole-repo structural scan. Slower.
//                                                 Enforces (non-zero exit on
//                                                 violation), not report-only.
//                                                 Blocks only on violations NOT
//                                                 already present in the Part 4
//                                                 baseline (sentinel-notes/
//                                                 sentinel-baseline.json).
//   node .githooks/sentinel-check.js --full --report-only
//                                              -- whole-repo scan, prints findings,
//                                                 always exits 0. Used for the
//                                                 Part 4 one-time baseline pass.
//
// Wired into: package.json's "sentinel:check" script (diff mode) and
// "sentinel:check:full" (full mode). Also invocable directly with node.
"use strict";
const fs = require("fs");
const path = require("path");
const common = require("./lib/sentinel-common");
const checks = require("./lib/check-pre-commit");
const extCheck = require("./lib/check-new-extension");
const helpDrift = require("./lib/check-help-drift");

const BASELINE_PATH = path.join("sentinel-notes", "sentinel-baseline.json");

function loadBaseline() {
  const raw = common.diskRead(BASELINE_PATH);
  if (!raw) return { entries: [] };
  try {
    return JSON.parse(raw);
  } catch (e) {
    common.failLoud("sentinel-notes/sentinel-baseline.json is not valid JSON: " + e.message);
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
  // Narrow, specific pairing checks -- NOT a generic "all hardcoded lists must
  // match" rule (WORDS is an unrelated vocabulary set and is correctly excluded).
  // See report: this is the conservative version of the cross-list-consistency
  // idea, limited to the two pairs that are actually meant to enumerate the same
  // concept from two sides.
  //
  // Post-JS-split: SEARCH_LABELS/SEARCH_ORDER now live in app/search.js, and
  // KIND_LABEL/KIND_FILTERS now live in app/views.js -- both were index.html
  // before. Each pair is read from its own current file rather than one shared
  // `source` string.
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
    // Content-keyed exclusion, not positional: "all" in KIND_FILTERS is a real,
    // intentional UI-only "show everything" filter option, never used as a lookup
    // key into KIND_LABEL (confirmed by reading app/views.js's archiveEntries()/
    // renderArchive() -- KIND_LABEL is only indexed by an entry's actual kind,
    // never by the filter value). This asymmetry is a known, accepted design, not
    // a miss -- exclude it by name so it doesn't re-report as noise on every
    // future full scan.
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
  // KIND_FILTERS is an array of [key, label] pairs: [["all","All"],["task","Tasks"],...].
  // Only the FIRST quoted string in each [..] pair is the key; the second is a
  // display label and must not be treated as another key to match against KIND_LABEL.
  // Both KIND_LABEL and KIND_FILTERS live in app/views.js.
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
    if (t && !t.startsWith("#")) { readmeOpening = t; break; }
  }
  if (readmeOpening === null || !readmeOpening.startsWith(ogDesc)) {
    return [common.violation("social-meta-drift", "index.html", null, `og:description ("${ogDesc.slice(0, 60)}...") no longer matches the start of README's opening paragraph.`)];
  }
  return [];
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
  // Accept either the portable relative form (".githooks") or an absolute path
  // that resolves to the same tracked directory -- git itself may store/normalize
  // this differently depending on platform and how it was set (observed: `git
  // config core.hooksPath .githooks` on Windows can round-trip to an absolute
  // "C:\...\.githooks" on read-back). What matters is that it resolves to the
  // tracked .githooks directory, not the exact string.
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
  // README keyword map, whole-repo version: every current CORE/BOTTOM/pinned-page
  // label should appear in README's current text. CORE/BOTTOM moved to
  // app/model.js in the JS module split (2026-09-21) -- was index.html.
  //
  // Bug found and fixed while migrating this line to the new file (pre-existing,
  // not introduced by the split): the old regex `\[[^\]]*\]` cannot match CORE/
  // BOTTOM's actual shape, an array of [key, label] pairs (nested brackets), so
  // it matched the FIRST inner pair's closing "]" and stopped -- meaning
  // coreBottomMatch was always [] and this whole keyword-map block was silently
  // a no-op on every full scan, on index.html before the split too. Confirmed by
  // running the old regex against `git show HEAD:index.html` before this fix.
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
    violations = violations.concat(checks.checkDuplicatedIconMarkup());
    violations = violations.concat(checks.checkSocialMetaDrift());
    violations = violations.concat(checks.checkArtifactBuildDrift());
    violations = violations.concat(checks.runNpmTest());
    if (violations.length) {
      common.printViolations(violations, "Sentinel: sentinel-check found violations (diff-scoped)");
      process.exitCode = 1;
      return;
    }
    const helpReminder = helpDrift.helpDriftReminder();
    if (helpReminder) console.log("[Sentinel] " + helpReminder);
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
