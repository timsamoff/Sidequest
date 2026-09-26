// Help drift reminder for Sidequest. NON-BLOCKING: it prints a reminder, it never
// fails a commit. A hook can see that user-facing UI changed in a diff; it cannot
// judge whether Help's prose still describes it correctly. That takes a human read,
// so the most this can honestly do is ask "did Help need to change?" at the moment
// a change is made, instead of finding the drift months later.
//
// Signals (kept narrow on purpose -- "any UI text changed" would fire on nearly
// every commit and become noise):
//   1. A button's visible label was added, removed, or renamed (a moved line, or a
//      change to a tooltip/attribute only, does not count).
//   2. One of check-pre-commit.js's TRIGGER_PATTERNS fired (new page, dialog, or
//      state field -- the project's own definition of a feature-sized change).
//   3. A new Settings control was added (an element id starting "set-").
// The reminder stays quiet if the commit also changed helpTopics() in app/views.js.

"use strict";
const common = require("./sentinel-common");
const pre = require("./check-pre-commit");

const LABEL_FILES = ["app/views.js", "app/dialogs.js", "app/app.js", "index.html"];
const VIEWS_FILE = "app/views.js";

// Returns the index of the bracket that closes the one at openIdx, skipping over
// string literals. -1 if it never closes on this line.
function findMatching(text, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i;
  }
  return -1;
}

function stringLiterals(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let s = "";
      for (i++; i < text.length && text[i] !== c; i++) {
        if (text[i] === "\\" && i + 1 < text.length) i++;
        s += text[i];
      }
      out.push(s);
    }
  }
  return out;
}

// Visible button labels on ONE source line: el("button", {attrs}, "Label" ...) in JS,
// or <button ...>Label</button> in HTML. Attribute values (title, aria-label) are
// deliberately not labels.
function controlLabelsFromLine(line) {
  const labels = [];
  let from = 0;
  for (;;) {
    const i = line.indexOf('el("button"', from);
    if (i < 0) break;
    const open = i + 2;
    const end = findMatching(line, open, "(", ")");
    let inner = end < 0 ? line.slice(open + 1) : line.slice(open + 1, end);
    inner = inner.replace(/^\s*"button"\s*,?/, "");
    const b = inner.indexOf("{");
    if (b >= 0) {
      const be = findMatching(inner, b, "{", "}");
      inner = inner.slice(0, b) + (be >= 0 ? inner.slice(be + 1) : "");
    }
    stringLiterals(inner).forEach((s) => { if (s.trim()) labels.push(s.trim()); });
    from = i + 11;
  }
  const re = /<button\b[^>]*>([^<]+)<\/button>/g;
  let m;
  while ((m = re.exec(line))) if (m[1].trim()) labels.push(m[1].trim());
  return labels;
}

// Labels on the added and removed sides of a unified diff.
function labelSides(diffText) {
  const added = new Set(), removed = new Set();
  (diffText || "").split("\n").forEach((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) return;
    if (line.startsWith("+")) controlLabelsFromLine(line.slice(1)).forEach((l) => added.add(l));
    else if (line.startsWith("-")) controlLabelsFromLine(line.slice(1)).forEach((l) => removed.add(l));
  });
  return { added, removed };
}

// Labels that genuinely changed: present on one side only. A line that merely moved
// or had a tooltip edited carries the same label on both sides and cancels out.
function changedLabels(diffText) {
  const { added, removed } = labelSides(diffText);
  const out = [];
  added.forEach((l) => { if (!removed.has(l)) out.push(l); });
  removed.forEach((l) => { if (!added.has(l)) out.push(l); });
  return out;
}

function addsSettingsControl(diffText) {
  return /^\+.*\bid:\s*"set-/m.test(diffText || "");
}

// 1-based first and last line of helpTopics() in a source file, or null.
function helpRange(source) {
  if (!source) return null;
  const lines = source.split("\n");
  const start = lines.findIndex((l) => /^export function helpTopics\s*\(/.test(l));
  if (start < 0) return null;
  let end = start;
  while (end < lines.length && lines[end] !== "}") end++;
  return { start: start + 1, end: end + 1 };
}

// New-side line ranges of each hunk in a --unified=0 diff. A pure deletion has
// count 0 and sits just after line `start`.
function newSideHunks(diffText) {
  const hunks = [];
  const re = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  let m;
  while ((m = re.exec(diffText || ""))) {
    const start = Number(m[1]), count = m[2] === undefined ? 1 : Number(m[2]);
    hunks.push({ start, end: count === 0 ? start : start + count - 1, deletion: count === 0 });
  }
  return hunks;
}

function helpTouched(viewsDiff, viewsSource) {
  const range = helpRange(viewsSource);
  if (!range || !viewsDiff) return false;
  return newSideHunks(viewsDiff).some((h) =>
    h.deletion ? h.start >= range.start - 1 && h.start <= range.end : h.start <= range.end && h.end >= range.start
  );
}

// Pure core, so it can be tested without git. Returns a reminder string or null.
function buildReminder(input) {
  const reasons = [];
  const labels = [];
  LABEL_FILES.forEach((f) => changedLabels(input.diffs[f]).forEach((l) => { if (labels.indexOf(l) < 0) labels.push(l); }));
  if (labels.length) {
    const shown = labels.slice(0, 5).map((l) => '"' + l + '"').join(", ");
    reasons.push("button label changed (" + shown + (labels.length > 5 ? ", and " + (labels.length - 5) + " more" : "") + ")");
  }
  (input.triggerHits || []).forEach((h) => reasons.push(h));
  if (addsSettingsControl(input.diffs[VIEWS_FILE])) reasons.push("new Settings control");
  if (!reasons.length) return null;
  if (helpTouched(input.diffs[VIEWS_FILE], input.viewsSource)) return null;
  return "Help may be out of date: " + reasons.join("; ") + ". helpTopics() in app/views.js was not changed in this commit. " +
    "If something a user sees changed, check the matching Help topic and README. " +
    "(Non-blocking: a hook can see that the UI changed, not whether Help still describes it correctly.)";
}

function helpDriftReminder() {
  const diffs = {};
  LABEL_FILES.forEach((f) => { diffs[f] = common.isStaged(f) ? common.stagedDiff(f) : ""; });
  const { hits } = pre.classifySourceDiffs();
  return buildReminder({ diffs, triggerHits: hits, viewsSource: common.stagedContent(VIEWS_FILE) });
}

module.exports = {
  findMatching,
  stringLiterals,
  controlLabelsFromLine,
  changedLabels,
  addsSettingsControl,
  helpRange,
  newSideHunks,
  helpTouched,
  buildReminder,
  helpDriftReminder,
};
