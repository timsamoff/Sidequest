// Sentinel gate-check shared helpers.
// Used by both the commit-msg/pre-commit hooks and the manual sentinel-check.js runner.
// Node, no dependencies (project has none at runtime and this must run inside a git hook
// with no npm install guarantee at commit time).

"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

// --- Staged-content access (the index, not the working tree) ---

// List of files staged in this commit, by status. Never uses the working tree.
// Returns [{status: 'A'|'M'|'D'|'R'..., path: '...'}]
function stagedFiles() {
  const out = execFileSync("git", ["diff", "--cached", "--name-status", "--no-renames"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((line) => {
    const [status, ...rest] = line.split("\t");
    return { status: status[0], path: rest[rest.length - 1] };
  });
}

// Full staged diff text (unified). Optionally scoped to one path.
function stagedDiff(filePath) {
  const args = ["diff", "--cached", "--unified=0", "--no-color"];
  if (filePath) args.push("--", filePath);
  try {
    return normalizeNewlines(execFileSync("git", args, { encoding: "utf8" }));
  } catch (e) {
    failLoud("git diff --cached failed: " + e.message);
  }
}

// Normalizes CRLF -> LF. This project's working tree is checked out with CRLF
// line endings on Windows (git's core.autocrlf conversion) -- any regex that
// anchors on a literal "\n" boundary (e.g. "find the line ending a function body")
// silently fails to match against "\r\n" content otherwise. Every function in this
// module that hands back raw file/diff text normalizes through this first, so
// every downstream check (and check-pre-commit.js's own extraction regexes) can
// assume LF-only content without each one having to remember to normalize itself.
function normalizeNewlines(text) {
  return text === null || text === undefined ? text : text.replace(/\r\n/g, "\n");
}

// Content of a path as it is STAGED (the index), not the working tree.
// Returns null if the path does not exist in the index (e.g. it was deleted).
function stagedContent(filePath) {
  try {
    return normalizeNewlines(execFileSync("git", ["show", ":" + filePath], { encoding: "utf8" }));
  } catch (e) {
    return null;
  }
}

function isStaged(filePath) {
  return stagedFiles().some((f) => f.path === filePath);
}

// --- Gitignored-file access (mtime/disk, never git) ---
// CLAUDE.md and everything under sentinel-notes/ are gitignored per this project's
// local-only decision. A git-based read (`git show :<path>`, `git diff --cached`)
// structurally cannot see their content, staged or not, so any check needing their
// current state must read the filesystem directly.

function diskMTimeMs(relPath) {
  try {
    return fs.statSync(repoPath(relPath)).mtimeMs;
  } catch (e) {
    return null; // file does not exist
  }
}

function diskRead(relPath) {
  try {
    return normalizeNewlines(fs.readFileSync(repoPath(relPath), "utf8"));
  } catch (e) {
    return null;
  }
}

// mtime of the current HEAD commit (used as "since the last commit touching index.html").
function headCommitTimeMs() {
  const out = execFileSync("git", ["log", "-1", "--format=%ct"], { encoding: "utf8" }).trim();
  if (!out) return null;
  return Number(out) * 1000;
}

// --- Exceptions mechanism (sentinel-exceptions.json, local-only under sentinel-notes/) ---
// Each entry: { rule, scope, reason, owner, reviewBy: "YYYY-MM-DD" }
// An expired entry (reviewBy in the past) is treated as if it did not exist -- no grace period.

function loadExceptions() {
  const raw = diskRead(path.join("sentinel-notes", "sentinel-exceptions.json"));
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    failLoud("sentinel-notes/sentinel-exceptions.json exists but is not valid JSON: " + e.message);
  }
  if (!Array.isArray(parsed)) failLoud("sentinel-notes/sentinel-exceptions.json must be a JSON array of exception entries.");
  return parsed;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Returns the matching, still-valid exception entry for a rule+scope, or null.
// scope is matched as an exact string (content-keyed, e.g. a file path or a specific
// identifier) -- never a line number or position, per the "don't key to position" rule.
function findException(rule, scope) {
  const today = todayISO();
  const entries = loadExceptions();
  return entries.find((e) => {
    if (!e || e.rule !== rule) return false;
    if (scope !== undefined && e.scope !== undefined && e.scope !== scope) return false;
    if (!e.reviewBy || e.reviewBy < today) return false; // expired or missing = no exception
    return true;
  }) || null;
}

// --- Output / failure ---

function failLoud(message) {
  // Every check must fail loudly, never silently, when it cannot run at all
  // (parse error, missing tool, unexpected internal state).
  process.stderr.write("\n[Sentinel] INTERNAL ERROR -- unable to verify: " + message + "\n");
  process.exitCode = 1;
  throw new Error(message);
}

function violation(rule, file, line, message) {
  return { rule, file: file || "(commit message)", line: line || null, message };
}

function printViolations(list, header) {
  if (!list.length) return;
  process.stderr.write("\n" + (header || "Sentinel gate check failed") + ":\n\n");
  list.forEach((v) => {
    const file = v.file || "(commit message)";
    const loc = v.line ? `${file}:${v.line}` : file;
    process.stderr.write(`  [${v.rule}] ${loc}\n    ${v.message}\n\n`);
  });
}

module.exports = {
  REPO_ROOT,
  repoPath,
  stagedFiles,
  stagedDiff,
  stagedContent,
  isStaged,
  diskMTimeMs,
  diskRead,
  headCommitTimeMs,
  loadExceptions,
  findException,
  failLoud,
  violation,
  printViolations,
  todayISO,
};
