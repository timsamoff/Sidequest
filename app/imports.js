/* Trello and Todoist imports */
import { go } from "./app.js";
import { TODAY, addDays, iso, parseISO } from "./dates.js";
import { closeModal, openModal } from "./dialogs.js";
import { el, notify, on, uid, setMsg } from "./dom.js";
import { blockForDate } from "./model.js";
import { S, changed, makeQuest, st, state, task } from "./state.js";

// Reads a Trello JSON board export into a plain summary. Labels, members, comments, attachments, and custom fields are dropped by design.
export function parseTrelloExport(obj) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.cards)) return null;
  var boardName = typeof obj.name === "string" && obj.name ? obj.name : "Imported board";
  var checklistsById = {};
  (obj.checklists || []).forEach(function (c) { checklistsById[c.id] = c; });
  var dropped = 0;
  if ((obj.labels || []).length) dropped += obj.labels.length;
  if ((obj.members || []).length) dropped += obj.members.length;
  var cards = (obj.cards || []).filter(function (c) { return !c.closed; }).map(function (c) {
    // Completion can live directly on a checkItem (state) or, in a real
    // Trello export, on the card's checkItemStates by idCheckItem -- check both.
    var completedIds = {};
    (c.checkItemStates || []).forEach(function (s) { if (s.state === "complete") completedIds[s.idCheckItem] = true; });
    var steps = [];
    (c.idChecklists || []).forEach(function (clId) {
      var cl = checklistsById[clId]; if (!cl) return;
      (cl.checkItems || []).forEach(function (ci) { steps.push({ text: S(ci.name, 300), done: ci.state === "complete" || !!completedIds[ci.id] }); });
    });
    if (Array.isArray(c.idLabels) && c.idLabels.length) dropped++;
    if (Array.isArray(c.idMembers) && c.idMembers.length) dropped++;
    return { name: S(c.name, 300) || "Untitled card", desc: S(c.desc, 5000), due: isISOInstant(c.due) ? c.due.slice(0, 10) : "", steps: steps };
  });
  return { boardName: boardName, cards: cards, droppedCount: dropped };
}

export function isISOInstant(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v); }

// Builds a quest from a parsed Trello summary. Start is the earliest due date found (or today),
// so no card's due date falls before it.
export function buildQuestFromTrello(summary) {
  var dues = summary.cards.map(function (c) { return c.due; }).filter(Boolean).sort();
  var start = dues.length ? dues[0] : iso(TODAY);
  var p = makeQuest(uid(), S(summary.boardName, 120) || "Imported board", "active", { start: start });
  var tasks = summary.cards.map(function (c) {
    var blk = 0, due = "";
    if (c.due) { var b = blockForDate(p.id, parseISO(c.due)); if (b !== null) { blk = b; due = c.due; } }
    var t = task(uid(), blk, p.id, S(c.name, 300), false, c.steps.map(function (s) { return st(uid(), s.text, s.done); }));
    t.notes = c.desc; t.due = due;
    return t;
  });
  return { quest: p, tasks: tasks };
}

export function importTrelloFile(file, msg) {
  var r = new FileReader();
  r.onerror = function () { setMsg(msg, "The file couldn’t be read.", "error"); };
  r.onload = function () {
    var obj = null;
    try { obj = JSON.parse(String(r.result || "")); } catch (e) { obj = null; }
    var summary = null;
    try { summary = obj && parseTrelloExport(obj); } catch (e) { summary = null; }
    if (!summary) { setMsg(msg, "That doesn’t look like a Trello board export.", "error"); return; }
    setMsg(msg, "", "");
    var nc = summary.cards.length, ns = summary.cards.reduce(function (n, c) { return n + c.steps.length; }, 0);
    openModal("Import “" + summary.boardName + "”?", function (body) {
      var lines = [nc + (nc === 1 ? " card" : " cards") + " and " + ns + (ns === 1 ? " checklist item" : " checklist items") + " were found."];
      lines.push("This creates a new quest named “" + summary.boardName + ".” Your existing quests and tasks are not changed.");
      if (summary.droppedCount) lines.push("Labels, members, comments, and attachments on this board are not imported.");
      lines.forEach(function (t, i) { body.appendChild(el("p", { "class": i === 0 ? "first" : "" }, t)); });
      var acts = el("div", { "class": "actions" });
      var no = el("button", { type: "button", title: "Cancel this import" }, "Cancel");
      var yes = el("button", { type: "button", "class": "primary", title: "Create a new quest from this board" }, "Import");
      on(no, "click", closeModal);
      on(yes, "click", function () {
        closeModal();
        var built = buildQuestFromTrello(summary);
        state.quests.push(built.quest);
        built.tasks.forEach(function (t) { state.tasks.push(t); });
        changed(); go("quest:" + built.quest.id);
        notify("Imported “" + summary.boardName + ".”");
      });
      acts.appendChild(no); acts.appendChild(yes); body.appendChild(acts);
    });
  };
  r.readAsText(file);
}

// Minimal RFC-4180 CSV parser: handles quoted fields with embedded commas,
// newlines, and doubled "" escapes. Blank lines are skipped by the caller.
export function parseCsv(text) {
  var rows = [], row = [], field = "", inQuotes = false, i = 0;
  while (i < text.length) {
    var c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  row.push(field); rows.push(row);
  return rows;
}

export var TODOIST_HEADER_FIELDS = ["TYPE", "CONTENT", "DESCRIPTION", "PRIORITY", "INDENT", "DATE", "DEADLINE"];

// Reads a Todoist per-project CSV export into a plain summary. Sections are informational;
// subtasks (INDENT > 1) flatten to tasks, since Sidequest has only Task and Step.
export function parseTodoistExport(text) {
  var rows = parseCsv(text).filter(function (r) { return r.length > 1 || (r.length === 1 && r[0] !== ""); });
  if (!rows.length) return null;
  var header = rows[0].map(function (h) { return h.trim(); });
  var idx = {};
  header.forEach(function (h, i) { idx[h] = i; });
  if (!TODOIST_HEADER_FIELDS.every(function (f) { return f in idx; })) return null;
  var capped = rows.length - 1 >= 300;
  var hasSubtasks = false, items = [], section = "";
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var type = (r[idx.TYPE] || "").trim();
    if (type === "meta") continue;
    if (type === "section") { section = S(r[idx.CONTENT], 120); continue; }
    if (type !== "task") continue;
    var indent = parseInt(r[idx.INDENT], 10) || 1;
    if (indent > 1) hasSubtasks = true;
    var content = (r[idx.CONTENT] || "").replace(/@\S+/g, "").replace(/\s+/g, " ").trim();
    var date = (r[idx.DATE] || "").trim();
    items.push({ name: S(content, 300) || "Untitled task", section: section, due: resolveTodoistDate(date) });
  }
  return { items: items, hasSubtasks: hasSubtasks, capped: capped };
}

export function isPlainISODate(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }

// Todoist's date field: an ISO date is used as is, "today", "tomorrow" and "in N days" resolve to real dates, and anything else stays unscheduled.
export function resolveTodoistDate(v) {
  if (isPlainISODate(v)) return v;
  var s = (v || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "today") return iso(TODAY);
  if (s === "tomorrow") return iso(addDays(TODAY, 1));
  var m = s.match(/^in (\d+) days?$/);
  if (m) return iso(addDays(TODAY, parseInt(m[1], 10)));
  return "";
}

export function buildQuestFromTodoist(summary, name) {
  var dues = summary.items.map(function (c) { return c.due; }).filter(Boolean).sort();
  var start = dues.length ? dues[0] : iso(TODAY);
  var p = makeQuest(uid(), S(name, 120) || "Imported from Todoist", "active", { start: start });
  var tasks = summary.items.map(function (c) {
    var blk = 0, due = "";
    if (c.due) { var b = blockForDate(p.id, parseISO(c.due)); if (b !== null) { blk = b; due = c.due; } }
    var t = task(uid(), blk, p.id, c.name, false, []);
    t.notes = c.section ? "Section: " + c.section : ""; t.due = due;
    return t;
  });
  return { quest: p, tasks: tasks };
}

export function importTodoistFile(file, msg) {
  var name = file.name.replace(/\.csv$/i, "");
  var r = new FileReader();
  r.onerror = function () { setMsg(msg, "The file couldn’t be read.", "error"); };
  r.onload = function () {
    var summary = parseTodoistExport(String(r.result || ""));
    if (!summary) { setMsg(msg, "That doesn’t look like a Todoist project export.", "error"); return; }
    setMsg(msg, "", "");
    var nt = summary.items.length;
    openModal("Import “" + name + "”?", function (body) {
      var lines = [nt + (nt === 1 ? " task was" : " tasks were") + " found."];
      lines.push("Completed tasks are not in this file, so only what is still open comes across.");
      if (summary.capped) lines.push("This file has 300 tasks, Todoist’s export limit, so some tasks may be missing from the file itself.");
      if (summary.hasSubtasks) lines.push("Subtasks come in as their own tasks, not nested under their parent.");
      lines.push("This creates a new quest named “" + name + ".” Your existing quests and tasks are not changed.");
      lines.push("Labels and other Todoist-only details are not imported.");
      lines.forEach(function (t, i) { body.appendChild(el("p", { "class": i === 0 ? "first" : "" }, t)); });
      var acts = el("div", { "class": "actions" });
      var no = el("button", { type: "button", title: "Cancel this import" }, "Cancel");
      var yes = el("button", { type: "button", "class": "primary", title: "Create a new quest from this project" }, "Import");
      on(no, "click", closeModal);
      on(yes, "click", function () {
        closeModal();
        var built = buildQuestFromTodoist(summary, name);
        state.quests.push(built.quest);
        built.tasks.forEach(function (t) { state.tasks.push(t); });
        changed(); go("quest:" + built.quest.id);
        notify("Imported “" + name + ".”");
      });
      acts.appendChild(no); acts.appendChild(yes); body.appendChild(acts);
    });
  };
  r.readAsText(file);
}

export function importPanel(root) {
  var msg = el("p", { "class": "msg schedulesmsg", role: "status", "aria-live": "polite" });
  var trelloFile = el("input", { type: "file", id: "importTrelloFile", accept: ".json,application/json", hidden: "hidden", "aria-label": "Choose a Trello board export to import" });
  var trelloBtn = el("button", { type: "button", id: "importTrelloBtn", title: "Choose a Trello board export (.json) to import" }, "Import from Trello");
  on(trelloBtn, "click", function () { trelloFile.click(); });
  on(trelloFile, "change", function () {
    var f = trelloFile.files && trelloFile.files[0]; if (!f) return;
    importTrelloFile(f, msg); trelloFile.value = "";
  });
  var todoistFile = el("input", { type: "file", id: "importTodoistFile", accept: ".csv,text/csv", hidden: "hidden", "aria-label": "Choose a Todoist project export to import" });
  var todoistBtn = el("button", { type: "button", id: "importTodoistBtn", title: "Choose a Todoist project export (.csv) to import", style: "margin-left:8px" }, "Import from Todoist");
  on(todoistBtn, "click", function () { todoistFile.click(); });
  on(todoistFile, "change", function () {
    var f = todoistFile.files && todoistFile.files[0]; if (!f) return;
    importTodoistFile(f, msg); todoistFile.value = "";
  });
  root.appendChild(trelloBtn); root.appendChild(trelloFile);
  root.appendChild(todoistBtn); root.appendChild(todoistFile);
  root.appendChild(msg);
}
