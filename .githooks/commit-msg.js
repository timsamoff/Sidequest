#!/usr/bin/env node
// Sentinel commit-msg hook logic. Invoked by .githooks/commit-msg with the path to
// git's commit-message file as argv[2]. Reads STAGED message content (the file git
// gives us here IS the about-to-be-committed message; there is no separate staged
// vs. working-tree distinction for the commit message itself the way there is for
// file content).
"use strict";
const fs = require("fs");
const common = require("./lib/sentinel-common");
const { checkCommitMessage } = require("./lib/check-commit-msg");

function main() {
  const msgFile = process.argv[2];
  if (!msgFile) common.failLoud("commit-msg hook was not given a message file path by git");
  let message;
  try {
    message = fs.readFileSync(msgFile, "utf8");
  } catch (e) {
    common.failLoud("could not read commit message file " + msgFile + ": " + e.message);
  }

  const { violations } = checkCommitMessage(message);
  if (violations.length) {
    common.printViolations(violations, "Sentinel: commit message rejected");
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;
}

try {
  main();
} catch (e) {
  // A genuine internal error must fail the hook, never pass silently.
  if (process.exitCode === undefined || process.exitCode === 0) process.exitCode = 1;
  if (!/\[Sentinel\] INTERNAL ERROR/.test(String(e && e.message))) {
    process.stderr.write("[Sentinel] commit-msg hook crashed: " + (e && e.stack || e) + "\n");
  }
}
