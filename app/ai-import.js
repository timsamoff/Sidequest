/* The Copy AI prompt text, the quest JSON format it asks for, and the Import quest dialog */
import { go } from "./app.js";
import { DAY, TODAY, iso, parseISO } from "./dates.js";
import { closeModal, openModal } from "./dialogs.js";
import { el, notify, on, uid } from "./dom.js";
import { uniqueQuestName } from "./model.js";
import { changed, isISO, makeQuest, st, state, task } from "./state.js";

export var IMPORT_LIMITS = { name: 120, notes: 5000, what: 400, done: 200, step: 300, steps: 60, decision: 300, decided: 1000, tasks: 300, est: 9999 };

// The prompt a user pastes into any AI chat. {{TODAY}} is filled in when it is copied.
var PROMPT_TEMPLATE = [
  "I want you to build a quest for Sidequest, a project planner. Read everything below, then do the job it describes.",
  "",
  "THE JOB",
  "[Describe the job here: what it is, who it is for, and any deadline or limits.]",
  "",
  "HOW TO WORK",
  "Work in this order, one step at a time, and wait for my answer after each question.",
  "1. If the job above is still the bracketed placeholder, ask me what the job is.",
  "2. If the job is missing details you need to plan it well, such as the goal, who it is for, the deadline, or limits, ask me up to five short questions about it. If it is already clear, skip this step.",
  "3. Then ask me this: do I want you to add the typical tasks, steps, and decisions for this kind of job, or do I want to define my own? If I define my own, ask me for them, or for an outline, and build the quest around what I give you.",
  "4. Once I have answered, reply with the quest as one JSON object and nothing else: no introduction, no explanation, no commentary after it. Put it in a single code block, or, if you can create files, give it to me as a file named after the quest, such as Paint the spare room.json.",
  "Today is {{TODAY}}.",
  "",
  "WHAT A QUEST IS",
  "A quest is one job broken into tasks. A task is one piece of work with a clear finish line. A task can have steps, which are the small actions inside it. A step can carry a decision: a question that has to be settled before the step can be finished (“Which game engine?”). Add a decision only where the work really depends on one. Aim for 8 to 25 tasks in the order the work would happen, with 2 to 6 steps on tasks that need them. Name each task by the work it covers (“Draft the first chapter”), not by a category (“Writing”).",
  "",
  "THE FORMAT",
  "{",
  "  \"sidequest\": 1,",
  "  \"quest\": {",
  "    \"name\": \"Paint the spare room\",",
  "    \"notes\": \"Two coats, light gray, finished before guests arrive.\"",
  "  },",
  "  \"tasks\": [",
  "    {",
  "      \"what\": \"Prepare the walls\",",
  "      \"done\": \"The walls are clean, patched, and sanded\",",
  "      \"est\": 3,",
  "      \"steps\": [\"Move the furniture out\", \"Patch the holes\", \"Sand and wipe the walls\"]",
  "    },",
  "    {",
  "      \"what\": \"Paint two coats\",",
  "      \"done\": \"Both coats are dry with no thin spots\",",
  "      \"est\": 6,",
  "      \"notes\": \"Let the first coat dry for four hours.\",",
  "      \"steps\": [{ \"text\": \"Buy the paint\", \"decision\": \"Which color and finish?\" }, \"Cut in the edges\", \"Roll the walls\"]",
  "    },",
  "    {",
  "      \"what\": \"Put the room back together\",",
  "      \"launch\": true",
  "    }",
  "  ]",
  "}",
  "",
  "FIELD RULES",
  "sidequest: always 1.",
  "quest.name: required, up to 120 characters.",
  "quest.notes: optional, a short summary of the job, up to 5000 characters.",
  "quest.start and quest.due: optional dates written YYYY-MM-DD.",
  "tasks[].what: required, the task’s title, up to 400 characters.",
  "tasks[].done: optional, up to 200 characters. The “Done when” line: how I will know the task is finished.",
  "tasks[].notes: optional, up to 5000 characters.",
  "tasks[].est: optional, estimated hours as a positive number, up to 9999.",
  "tasks[].due: optional date YYYY-MM-DD. A task with no due date goes to the quest’s Backlog. A due date must not be before quest.start or after quest.due.",
  "tasks[].start: optional date YYYY-MM-DD, only together with a due date and not after it.",
  "tasks[].launch: true for a task that must be finished before the job can launch or ship. Use it sparingly, and leave it out otherwise.",
  "tasks[].milestone: true for a checkpoint worth marking on the schedule. A milestone needs a due date. Leave it out otherwise.",
  "tasks[].issue: true for a problem to fix rather than planned work. An issue needs no due date. Leave it out otherwise.",
  "tasks[].steps: optional list. Each step is a short string up to 300 characters, or an object { \"text\": the step, \"decision\": a question to settle first, \"decided\": the answer }. A step has at most one decision. Leave decided out unless I have told you the answer.",
  "",
  "RULES",
  "Use only the fields above and do not invent others. Write valid JSON: double quotes, no trailing commas, no comments. Leave a field out rather than filling it with a guess.",
  "Do not set any dates unless I ask for a schedule. If I do, use today’s date and the deadline I give you to choose them.",
  "Text is plain text, not Markdown or HTML."
].join("\n");

export function buildAiPrompt(todayISO) { return PROMPT_TEMPLATE.replace("{{TODAY}}", todayISO); }

var TASK_FIELDS = ["what", "done", "notes", "est", "start", "due", "launch", "milestone", "issue", "steps"];
var QUEST_FIELDS = ["name", "notes", "start", "due"];

// Checks a parsed quest object and reports each problem by item, so it can be pasted back to the AI.
// Errors block the import; warnings say what was changed to fit.
export function validateQuestImport(obj) {
  var errors = [], warnings = [], unknown = {};
  var out = { errors: errors, warnings: warnings, clean: null };
  function str(v, where, max, required) {
    if (v === undefined || v === null || v === "") { if (required) errors.push(where + " is required."); return ""; }
    if (typeof v !== "string") { errors.push(where + " must be text."); return ""; }
    var t = v.trim();
    if (!t && required) errors.push(where + " is required.");
    if (t.length > max) { warnings.push(where + " was longer than " + max + " characters, so it was shortened."); t = t.slice(0, max); }
    return t;
  }
  function date(v, where) {
    if (v === undefined || v === null || v === "") return "";
    if (typeof v !== "string" || !isISO(v)) { errors.push(where + " must be a real date written YYYY-MM-DD."); return ""; }
    return v;
  }
  function bool(v, where) {
    if (v === undefined || v === null) return false;
    if (typeof v !== "boolean") { errors.push(where + " must be true or false."); return false; }
    return v;
  }
  function noteUnknown(o, allowed, prefix) {
    Object.keys(o).forEach(function (k) { if (allowed.indexOf(k) < 0) unknown[prefix + k] = true; });
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) { errors.push("The top level must be one JSON object with “quest” and “tasks”."); return out; }
  if (obj.sidequest !== undefined && obj.sidequest !== 1) errors.push("“sidequest” must be 1, the only format this version reads.");
  noteUnknown(obj, ["sidequest", "quest", "tasks"], "");
  var quest = { name: "", notes: "", start: "", due: "" };
  var q = obj.quest;
  if (!q || typeof q !== "object" || Array.isArray(q)) errors.push("“quest” is missing. It needs at least a name.");
  else {
    noteUnknown(q, QUEST_FIELDS, "quest.");
    quest.name = str(q.name, "quest.name", IMPORT_LIMITS.name, true);
    quest.notes = str(q.notes, "quest.notes", IMPORT_LIMITS.notes, false);
    quest.start = date(q.start, "quest.start");
    quest.due = date(q.due, "quest.due");
  }
  var tasks = [];
  if (!Array.isArray(obj.tasks)) errors.push("“tasks” must be a list of tasks.");
  else if (!obj.tasks.length) errors.push("“tasks” is empty. Add at least one task.");
  else if (obj.tasks.length > IMPORT_LIMITS.tasks) errors.push("“tasks” has " + obj.tasks.length + " tasks. The limit is " + IMPORT_LIMITS.tasks + ".");
  else obj.tasks.forEach(function (raw, i) {
    var label = "Task " + (i + 1);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { errors.push(label + " must be an object with at least a “what” title."); return; }
    noteUnknown(raw, TASK_FIELDS, "tasks[].");
    var what = str(raw.what, label + ": what", IMPORT_LIMITS.what, true);
    if (what) label += " “" + (what.length > 40 ? what.slice(0, 40) + "…" : what) + "”";
    var t = { what: what, done: str(raw.done, label + ": done", IMPORT_LIMITS.done, false), notes: str(raw.notes, label + ": notes", IMPORT_LIMITS.notes, false), est: 0, start: date(raw.start, label + ": start"), due: date(raw.due, label + ": due"), launch: bool(raw.launch, label + ": launch"), milestone: bool(raw.milestone, label + ": milestone"), issue: bool(raw.issue, label + ": issue"), steps: [], label: label };
    if (raw.est !== undefined && raw.est !== null && raw.est !== "") {
      var n = typeof raw.est === "string" ? Number(raw.est) : raw.est;
      if (typeof n !== "number" || !isFinite(n) || n <= 0 || n > IMPORT_LIMITS.est) errors.push(label + ": est must be a positive number of hours, up to " + IMPORT_LIMITS.est + ".");
      else t.est = Math.round(n * 100) / 100;
    }
    if (raw.steps !== undefined && raw.steps !== null) {
      if (!Array.isArray(raw.steps)) errors.push(label + ": steps must be a list of short strings.");
      else {
        raw.steps.forEach(function (s, j) {
          var where = label + ": step " + (j + 1), isObj = !!s && typeof s === "object" && !Array.isArray(s);
          var text = typeof s === "string" ? s : (isObj && typeof s.text === "string" ? s.text : null);
          if (text === null) { errors.push(where + " must be a string, or an object with “text”."); return; }
          text = text.trim();
          if (!text) return;
          if (text.length > IMPORT_LIMITS.step) { warnings.push(where + " was longer than " + IMPORT_LIMITS.step + " characters, so it was shortened."); text = text.slice(0, IMPORT_LIMITS.step); }
          var step = { text: text, decision: "", decided: "" };
          if (isObj) {
            noteUnknown(s, ["text", "decision", "decided"], "steps[].");
            step.decision = str(s.decision, where + ": decision", IMPORT_LIMITS.decision, false);
            step.decided = str(s.decided, where + ": decided", IMPORT_LIMITS.decided, false);
            if (step.decided && !step.decision) { warnings.push(where + ": decided was ignored because the step has no decision."); step.decided = ""; }
          }
          t.steps.push(step);
        });
        if (t.steps.length > IMPORT_LIMITS.steps) { warnings.push(label + ": only the first " + IMPORT_LIMITS.steps + " steps were kept."); t.steps = t.steps.slice(0, IMPORT_LIMITS.steps); }
      }
    }
    if (t.start && !t.due) { warnings.push(label + ": start was ignored because the task has no due date."); t.start = ""; }
    if (t.start && t.due && t.start > t.due) errors.push(label + ": start is after due. A task cannot begin after it finishes.");
    if (t.milestone && !t.due) { warnings.push(label + ": it was not marked as a milestone because a milestone needs a due date."); t.milestone = false; }
    if (t.milestone && t.issue) { warnings.push(label + ": it was not marked as a milestone because an issue cannot be one."); t.milestone = false; }
    tasks.push(t);
  });
  // The quest starts on its own start date, or on the earliest task date, or today.
  var dates = [];
  tasks.forEach(function (t) { if (t.start) dates.push(t.start); if (t.due) dates.push(t.due); });
  dates.sort();
  var derived = false;
  if (!quest.start) { quest.start = dates.length ? dates[0] : iso(TODAY); derived = true; }
  if (quest.due && quest.due < quest.start) errors.push("quest.due is before the quest’s start (" + quest.start + ").");
  tasks.forEach(function (t) {
    if (t.start && t.start < quest.start) errors.push(t.label + ": start is before the quest starts (" + quest.start + "). Move it later or set quest.start earlier.");
    if (t.due && t.due < quest.start) errors.push(t.label + ": due is before the quest starts (" + quest.start + "). Move it later or set quest.start earlier.");
    if (quest.due && t.due && t.due > quest.due) errors.push(t.label + ": due is after the quest’s due date (" + quest.due + "). Move it earlier or set quest.due later.");
  });
  var unk = Object.keys(unknown);
  if (unk.length) warnings.push("Ignored fields this version does not use: " + unk.join(", ") + ".");
  if (!errors.length) out.clean = { quest: quest, tasks: tasks, derivedStart: derived };
  return out;
}

// Reads text an AI produced. Anything before the first { or after the last } (a code fence, a sentence) is dropped.
export function parseQuestImport(text) {
  var s = String(text || "").trim();
  if (!s) return { errors: ["There is nothing to import. Choose a file or paste the JSON."], warnings: [], clean: null };
  var a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  var obj;
  try { obj = JSON.parse(s); } catch (e) { return { errors: ["This is not valid JSON (" + e.message + "). Ask the AI to send the whole quest again as plain JSON."], warnings: [], clean: null }; }
  return validateQuestImport(obj);
}

// A new Candidate quest and its tasks. Tasks with no due date go to the Backlog; the others land in the block holding their due date.
export function buildQuestFromImport(clean) {
  var q = clean.quest;
  var p = makeQuest(uid(), uniqueQuestName(q.name), "candidate", { notes: q.notes, start: q.start, due: q.due });
  var startMs = parseISO(q.start);
  var decisions = [];
  var tasks = clean.tasks.map(function (c) {
    var blk = c.due ? Math.floor((parseISO(c.due) - startMs) / (p.days * DAY)) + 1 : 0;
    var steps = c.steps.map(function (s) {
      var id = uid();
      if (s.decision) decisions.push({ id: uid(), q: s.decision, a: s.decided, step: id });
      return st(id, s.text, false);
    });
    return task(uid(), blk, p.id, c.what, c.done, steps, { notes: c.notes, est: c.est, start: c.start, due: c.due, launch: c.launch, milestone: c.milestone, issue: c.issue });
  });
  return { quest: p, tasks: tasks, decisions: decisions };
}

function copyText(text, done) {
  var nav = window.navigator;
  function fallback() {
    var ta = document.createElement("textarea"), ok = false;
    ta.value = text; ta.setAttribute("readonly", "readonly"); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove(); done(ok);
  }
  if (nav && nav.clipboard && nav.clipboard.writeText) nav.clipboard.writeText(text).then(function () { done(true); }, fallback);
  else fallback();
}

// Copies the prompt; when the browser refuses, shows it in a box to copy by hand.
export function copyAiPrompt() {
  var text = buildAiPrompt(iso(TODAY));
  copyText(text, function (ok) {
    if (ok) { notify("AI prompt copied. Paste it into any AI chat."); return; }
    openModal("AI prompt", function (body) {
      body.appendChild(el("p", { "class": "first" }, "Your browser wouldn’t copy it automatically. Select all of the text below and copy it."));
      var box = el("textarea", { readonly: "readonly", rows: "12", "aria-label": "AI prompt", spellcheck: "false" });
      box.value = text;
      on(box, "focus", function () { box.select(); });
      body.appendChild(box);
      var acts = el("div", { "class": "actions" });
      acts.appendChild(on(el("button", { type: "button", "class": "primary", title: "Close" }, "Done"), "click", closeModal));
      body.appendChild(acts);
    });
  });
}

function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

export function importQuestDialog() {
  openModal("Import a quest", function (body) {
    body.appendChild(el("p", { "class": "first" }, "Choose the quest file generated by an AI, or paste its contents. Imported quests are added to Candidate quests. Nothing is added until you review and confirm the import."));
    var file = el("input", { type: "file", accept: ".json,application/json,text/plain", hidden: "hidden", "aria-label": "Choose a quest file to import" });
    var pick = el("button", { type: "button", title: "Choose a quest file (.json)" }, "Choose file");
    var area = el("textarea", { rows: "8", "aria-label": "Quest JSON", placeholder: "Or paste the quest JSON here", spellcheck: "false", style: "margin-top:var(--space-14)" });
    var result = el("div", { role: "status", "aria-live": "polite" });
    function list(items) { var ul = el("ul", { "class": "importlist" }); items.forEach(function (t) { ul.appendChild(el("li", null, t)); }); return ul; }
    var checked = null;
    function check(text) {
      checked = text;
      result.innerHTML = "";
      if (!String(text || "").trim()) return;
      var r = parseQuestImport(text);
      if (r.errors.length) {
        result.appendChild(el("p", { "class": "msg errmsg" }, plural(r.errors.length, "problem", "problems") + " found. Nothing was imported."));
        result.appendChild(list(r.errors));
        var ra = el("div", { "class": "actions" });
        var cp = on(el("button", { type: "button", title: "Copy these problems to send back to the AI" }, "Copy problems"), "click", function () {
          copyText("Sidequest could not import the quest JSON you gave me. Please fix these problems and send the whole JSON again, with nothing else:\n" + r.errors.map(function (e) { return "- " + e; }).join("\n"), function (ok) { notify(ok ? "Problems copied. Paste them back to the AI." : "Select the problems and copy them.", null, ok ? "" : "problem"); });
        });
        ra.appendChild(cp); result.appendChild(ra);
        return;
      }
      var c = r.clean, dated = c.tasks.filter(function (t) { return !!t.due; }).length, steps = c.tasks.reduce(function (n, t) { return n + t.steps.length; }, 0), decs = c.tasks.reduce(function (n, t) { return n + t.steps.filter(function (s) { return !!s.decision; }).length; }, 0);
      var name = uniqueQuestName(c.quest.name);
      result.appendChild(el("p", { "class": "first" }, "“" + name + "” has " + plural(c.tasks.length, "task", "tasks") + " (" + dated + " scheduled, " + (c.tasks.length - dated) + " in the Backlog) and " + plural(steps, "step", "steps") + (decs ? " (" + decs + (decs === 1 ? " with a decision)" : " with decisions)") : "") + ". It will be added to Candidate quests, and your existing quests are not changed." + (name !== c.quest.name ? " A quest called “" + c.quest.name + "” already exists, so a number is added." : "")));
      if (r.warnings.length) { result.appendChild(el("p", { "class": "msg notemsg" }, "Adjusted to fit:")); result.appendChild(list(r.warnings)); }
      var ya = el("div", { "class": "actions" });
      ya.appendChild(on(el("button", { type: "button", title: "Cancel this import" }, "Cancel"), "click", closeModal));
      ya.appendChild(on(el("button", { type: "button", "class": "primary", title: "Add this quest to Candidate quests" }, "Import quest"), "click", function () {
        var built = buildQuestFromImport(c);
        state.quests.push(built.quest);
        built.tasks.forEach(function (t) { state.tasks.push(t); });
        built.decisions.forEach(function (d) { state.decisions.push(d); });
        changed(); closeModal(); go("quest:" + built.quest.id);
        notify("Imported “" + built.quest.name + ".”");
      }));
      result.appendChild(ya);
    }
    on(pick, "click", function () { file.click(); });
    on(file, "change", function () {
      var f = file.files && file.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onerror = function () { result.innerHTML = ""; result.appendChild(el("p", { "class": "msg errmsg" }, "The file couldn’t be read.")); };
      rd.onload = function () { area.value = String(rd.result || ""); check(area.value); };
      rd.readAsText(f); file.value = "";
    });
    // Pasting checks at once; edits are checked on blur, but unchanged text is not rebuilt under a click.
    on(area, "paste", function () { setTimeout(function () { check(area.value); }, 0); });
    on(area, "change", function () { if (area.value !== checked) check(area.value); });
    var top = el("div", { "class": "actions" });
    top.appendChild(pick); top.appendChild(file);
    body.appendChild(top);
    body.appendChild(area);
    body.appendChild(result);
  });
}

// The two buttons beside a section heading.
export function aiButtons() {
  var wrap = el("div", { "class": "sechead-btns" });
  wrap.appendChild(on(el("button", { type: "button", "class": "small", id: "copyAiPromptBtn", title: "Copy a prompt that asks any AI to build a quest you can import" }, "Copy AI prompt"), "click", copyAiPrompt));
  wrap.appendChild(on(el("button", { type: "button", "class": "small", id: "importQuestBtn", title: "Import a quest file an AI made" }, "Import quest"), "click", importQuestDialog));
  return wrap;
}
