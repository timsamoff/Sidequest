// Help drift reminder for Sidequest. NON-BLOCKING: it prints a reminder, it never
// fails a commit. A hook can see that something a user sees or does changed in a
// diff; it cannot judge whether Help's prose still describes it correctly. That
// takes a human read, so the most this can honestly do is ask "did Help need to
// change?" at the moment a change is made, instead of finding the drift later.
//
// Signals:
//   1. A button's visible label was added, removed, or renamed (a moved line, or a
//      change to a tooltip/attribute only, does not count).
//   2. One of check-pre-commit.js's TRIGGER_PATTERNS fired (new page, dialog, or
//      state field).
//   3. A new Settings control was added (an element id starting "set-").
//   4. A step in a user's process changed: a section heading, a dialog or
//      confirmation, or an input control was added, removed, or renamed.
//   5. Code that decides what a user is told changed. AREAS lists those parts of the
//      app (burndown and task counting, scheduling, status colors, backup and
//      restore, project lifecycle, and so on) and the Help topics that describe each.
// Signals 1 to 4 stay quiet if the commit edited any part of helpTopics(). Signal 5
// is stricter: it stays quiet only if a topic that describes that area was edited,
// so fixing one unrelated topic does not hide drift in another.

"use strict";
const fs = require("fs");
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

// Titles and line ranges of the topics inside helpTopics(), found from lines of the
// form    ["Title", [
function helpTopicRanges(source) {
  const range = helpRange(source);
  if (!range) return [];
  const lines = source.split("\n");
  const starts = [];
  for (let i = range.start - 1; i < range.end && i < lines.length; i++) {
    const m = /^\s+\["([^"]+)",\s*\[\s*$/.exec(lines[i].replace(/\r$/, ""));
    if (m) starts.push({ title: m[1], start: i + 1 });
  }
  return starts.map((t, i) => ({ title: t.title, start: t.start, end: i + 1 < starts.length ? starts[i + 1].start - 1 : range.end }));
}

// Titles of the Help topics whose lines a diff of app/views.js touched.
function topicsTouched(viewsDiff, viewsSource) {
  const ranges = helpTopicRanges(viewsSource);
  if (!ranges.length || !viewsDiff) return [];
  const hunks = newSideHunks(viewsDiff);
  return ranges.filter((r) => hunks.some((h) =>
    h.deletion ? h.start >= r.start - 1 && h.start <= r.end : h.start <= r.end && h.end >= r.start
  )).map((r) => r.title);
}

// Parts of the app whose behavior Help describes. `re` is matched against the lines a
// diff added or removed and against the function named in each hunk header, so editing
// inside a function counts even when its name is not on a changed line.
const AREAS = [
  { name: "burndown and task counting",
    topics: ["Work through your day (Today)", "Read the Timeline", "Finish or vault a quest"],
    re: /\b(totalUnits|remainingUnits|burnTasks|questBurn|questBurnTasks|questTotalUnits|questRemainingUnits|globalActual|recordHist|histAt|recordHistory|recordQuestHistory|checkpointStep|checkpoints|scopeSteps|weekTip|isHiddenComplete|questEstimate|renderBurn|drawChart|drawQuestChart|burnParts)\b/ },
  { name: "scheduling and dates",
    topics: ["Add and schedule tasks", "Use the Backlog", "Slip a quest's schedule"],
    re: /\b(taskStart|taskEnd|blockStartFor|blockEndFor|blockForDate|syncTaskBlocks|offsetFor|slipDialog|taskDialog|isLate|lateTasks)\b/ },
  { name: "status colors",
    topics: ["Add and schedule tasks", "Read the Timeline"],
    re: /(\.chip\[data-v|select\.status|\.bar\b|--chip-[a-z]+|\bdata-v\b|\bSTATUSES\b)/ },
  { name: "backup and restore",
    topics: ["Settings, backup, and starting over"],
    re: /\b(saveBackupFile|restoreBackupFile|backupJSON|backupPanel|backupControls|backupReminder|backupReminderDue|lastBackup|BACKUP_REMIND_DAYS)\b/ },
  { name: "quest lifecycle and what each page shows",
    topics: ["From idea to quest: the whole path", "Finish or vault a quest", "Manage quests", "The Vault and undo"],
    re: /\b(sweepQuestCompletion|vaultQuest|completionDialog|promoteToActive|demoteToCandidate|restoreEntry|removeToVault|removeNow|questTasksAllDone|renderQuestPage|renderQuests|standingBlock|pagesSection|candidatesSection)\b/ },
  { name: "launch checklist, decisions, and links",
    topics: ["Launch checklist and decisions", "Link quests"],
    re: /\b(launchSection|launchItems|decisionDialog|decisionEditDialog|stepDialog|stepEditDialog|linkQuestDialog|linksSection|incompleteLaunchCriticalLinks)\b/ },
  { name: "the Workshop and candidates",
    topics: ["From idea to quest: the whole path", "Use the Workshop", "Manage quests"],
    re: /\b(ideaDialog|renderWorkshop)\b/ },
  { name: "Today and Next up",
    topics: ["Work through your day (Today)"],
    re: /\b(nextUpPanel|overduePanel|renderToday|nextTask|welcomeBox)\b/ },
];

// The lines a diff added or removed, plus the function name git puts after each hunk header.
function changedText(diffText) {
  const out = [];
  (diffText || "").split("\n").forEach((line) => {
    const h = /^@@ [^@]*@@\s*(.*)$/.exec(line);
    if (h) { if (h[1]) out.push(h[1]); return; }
    if (line.startsWith("+++") || line.startsWith("---")) return;
    if (line.startsWith("+") || line.startsWith("-")) out.push(line.slice(1));
  });
  return out.join("\n");
}

// Areas a set of diffs (file path -> diff text) touched, each with the matches that showed it.
function areaHits(diffs) {
  const hits = [];
  AREAS.forEach((area) => {
    const found = new Set();
    Object.keys(diffs || {}).forEach((f) => {
      const re = new RegExp(area.re.source, "g");
      const text = changedText(diffs[f]);
      let m;
      while ((m = re.exec(text))) found.add(m[0]);
    });
    if (found.size) hits.push({ area, what: Array.from(found) });
  });
  return hits;
}

// Section headings, dialog titles, and input ids on the added and removed sides of a
// diff. One that exists on only one side was added, removed, or renamed.
function structureSides(diffText) {
  const sides = { added: new Set(), removed: new Set() };
  (diffText || "").split("\n").forEach((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) return;
    const side = line.startsWith("+") ? sides.added : line.startsWith("-") ? sides.removed : null;
    if (!side) return;
    const body = line.slice(1);
    if (/\bel\("h[1-3]"/.test(body)) {
      const lits = stringLiterals(body);
      if (lits.length) side.add("heading: " + lits[lits.length - 1]);
    }
    if (!/^\s*(export )?function\b/.test(body)) {
      const d = /\b(confirmDialog|formDialog|openModal)\(\s*"([^"]+)"/.exec(body);
      if (d) side.add("dialog: " + d[2]);
    }
    const ids = /\bel\("(input|select|textarea)"[^\n]*?\bid:\s*"([^"]+)"/.exec(body);
    if (ids) side.add("input: " + ids[2]);
  });
  return sides;
}

function changedStructure(diffText) {
  const { added, removed } = structureSides(diffText);
  const out = [];
  added.forEach((x) => { if (!removed.has(x)) out.push(x); });
  removed.forEach((x) => { if (!added.has(x)) out.push(x); });
  return out;
}

// Pure core, so it can be tested without git. Returns a reminder string or null.
function buildReminder(input) {
  const diffs = input.diffs || {};
  const anyHelpReasons = [];
  const labels = [];
  LABEL_FILES.forEach((f) => changedLabels(diffs[f]).forEach((l) => { if (labels.indexOf(l) < 0) labels.push(l); }));
  if (labels.length) {
    const shown = labels.slice(0, 5).map((l) => '"' + l + '"').join(", ");
    anyHelpReasons.push("button label changed (" + shown + (labels.length > 5 ? ", and " + (labels.length - 5) + " more" : "") + ")");
  }
  (input.triggerHits || []).forEach((h) => anyHelpReasons.push(h));
  if (addsSettingsControl(diffs[VIEWS_FILE])) anyHelpReasons.push("new Settings control");
  const structure = [];
  LABEL_FILES.forEach((f) => changedStructure(diffs[f]).forEach((x) => { if (structure.indexOf(x) < 0) structure.push(x); }));
  if (structure.length) anyHelpReasons.push("a step in the user's process changed (" + structure.slice(0, 4).join("; ") + (structure.length > 4 ? "; and " + (structure.length - 4) + " more" : "") + ")");

  const helpEdited = helpTouched(diffs[VIEWS_FILE], input.viewsSource);
  const edited = topicsTouched(diffs[VIEWS_FILE], input.viewsSource);
  const areaReasons = [];
  areaHits(diffs).forEach(({ area, what }) => {
    if (area.topics.some((t) => edited.indexOf(t) >= 0)) return;
    const shown = what.slice(0, 3).join(", ") + (what.length > 3 ? ", and " + (what.length - 3) + " more" : "");
    areaReasons.push(area.name + " changed (" + shown + "); check the Help " + (area.topics.length === 1 ? "topic " : "topics ") + area.topics.map((t) => '"' + t + '"').join(", "));
  });

  const reasons = (helpEdited ? [] : anyHelpReasons).concat(areaReasons);
  if (!reasons.length) return null;
  return "Help may be out of date: " + reasons.join("; ") + ". " +
    (helpEdited ? "" : "helpTopics() in app/views.js was not changed in this commit. ") +
    "If something a user sees or does changed, check the matching Help topic and README. " +
    "(Non-blocking: a hook can see that the UI changed, not whether Help still describes it correctly.)";
}

function helpDriftReminder() {
  const diffs = {};
  const files = LABEL_FILES.concat(fs.readdirSync("app").filter((f) => f.endsWith(".js")).map((f) => "app/" + f), ["css/styles.css", "css/tokens.css"]);
  files.forEach((f) => { if (!(f in diffs)) diffs[f] = common.isStaged(f) ? common.stagedDiff(f) : ""; });
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
  helpTopicRanges,
  topicsTouched,
  AREAS,
  changedText,
  areaHits,
  changedStructure,
  buildReminder,
  helpDriftReminder,
};
