#!/usr/bin/env node
// Sentinel pre-commit hook logic. Invoked by .githooks/pre-commit. Only gates the
// diff of THIS commit (staged content), not the whole codebase's pre-existing
// state -- see sentinel-check.js --full for the periodic whole-repo scan.
"use strict";
const common = require("./lib/sentinel-common");
const checks = require("./lib/check-pre-commit");
const extCheck = require("./lib/check-new-extension");

function main() {
  let violations = [];

  // Cheap checks first; npm test (slowest) last, per "fail fast on cheap checks."
  violations = violations.concat(extCheck.runCheck());
  violations = violations.concat(checks.checkClaudeMdTouched());
  violations = violations.concat(checks.checkReadmeTouched());
  violations = violations.concat(checks.checkTodoSync());
  violations = violations.concat(checks.checkNormalizeDefaultsPairing());
  violations = violations.concat(checks.checkHardcodedHex());
  violations = violations.concat(checks.checkDuplicatedIconMarkup());

  if (violations.length) {
    common.printViolations(violations, "Sentinel: pre-commit check failed");
    process.exitCode = 1;
    return;
  }

  // npm test gate -- last because it's the slowest.
  const testViolations = checks.runNpmTest();
  if (testViolations.length) {
    common.printViolations(testViolations, "Sentinel: pre-commit check failed");
    process.exitCode = 1;
    return;
  }

  const reminder = checks.todoBacklogReminder();
  if (reminder) process.stderr.write("\n[Sentinel] " + reminder + "\n");

  process.exitCode = 0;
}

try {
  main();
} catch (e) {
  if (process.exitCode === undefined || process.exitCode === 0) process.exitCode = 1;
  if (!/\[Sentinel\] INTERNAL ERROR/.test(String(e && e.message))) {
    process.stderr.write("[Sentinel] pre-commit hook crashed: " + (e && e.stack || e) + "\n");
  }
}
