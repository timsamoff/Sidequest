import { state, ui, changed, isISO, task, quest as makeQuest } from "./state.js";
import { iso, addDays, parseISO, fmt, fmtY, TODAY } from "./dates.js";
import {
  wd, wl, wpC, activeQuests, liveQuests, findQuest, dispQuest, nextTask, findTask,
  orderedAll, taskOptions, stepOptions, stepOptionsForTask, syncFromSteps, findStep, decisionFor,
  pset, blockForDate, taskStart, taskEnd, linkQuests
} from "./model.js";
import { $, el, on, uid, notify } from "./dom.js";
import { closeMenus } from "./app.js";

/* modal */
export var modalReturn = null;
// opts.full makes the dialog fill the screen (less a small margin), for a big chart.
export function openModal(title, build, opts) {
  modalReturn = document.activeElement;
  document.querySelector("#overlay .modal").classList.toggle("full", !!(opts && opts.full));
  $("modalTitle").textContent = title;
  $("modalClose").title = "Close";
  var body = $("modalBody"); body.innerHTML = "";
  build(body);
  $("overlay").hidden = false;
  var first = body.querySelector("input, textarea, select, button");
  if (first) first.focus();
}
export function closeModal() {
  $("overlay").hidden = true; $("modalBody").innerHTML = "";
  document.querySelector("#overlay .modal").classList.remove("full");
  if (modalReturn && document.body.contains(modalReturn) && modalReturn.focus) modalReturn.focus();
  modalReturn = null;
}
on($("modalClose"), "click", closeModal);
on($("overlay"), "click", function (e) { if (e.target === $("overlay")) closeModal(); });
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    if (!$("overlay").hidden) { closeModal(); return; }
    closeMenus(true);
  }
  if (e.key === "Tab" && !$("overlay").hidden) {
    var f = Array.prototype.slice.call($("overlay").querySelectorAll("button, input, textarea, select, a[href]")).filter(function (x) { return !x.disabled && !x.hidden && x.offsetParent !== null || x === document.activeElement; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// `extra` is an optional {label, title, onClick} for one more destructive button
// (Remove) shown after Cancel. It closes the dialog first, then runs onClick.
export function formDialog(title, fields, submitLabel, onSubmit, intro, extra) {
  openModal(title, function (body) {
    if (intro) body.appendChild(el("p", { "class": "hint first" }, intro));
    var inputs = {};
    fields.forEach(function (f) {
      var w = el("div", { "class": "field" }); var id = "f-" + f.key;
      if (f.type === "checkbox") {
        var crow = el("label", { "class": "radiorow" }), cbx = el("input", { type: "checkbox", id: id }); cbx.checked = !!f.value;
        crow.appendChild(cbx); crow.appendChild(el("span", null, f.label)); w.appendChild(crow); body.appendChild(w); inputs[f.key] = cbx; return;
      }
      if (f.type === "static") {
        w.appendChild(el("span", { "class": "hint" }, f.label + ": " + f.value)); body.appendChild(w); return;
      }
      if (f.type === "heading") {
        body.appendChild(el("h3", { "class": "dialogheading" }, f.label));
        if (f.hint) body.appendChild(el("p", { "class": "hint" }, f.hint));
        return;
      }
      w.appendChild(el("label", { "for": id }, f.label));
      var inp;
      if (f.type === "select") {
        inp = el("select", { id: id, "class": "plain" });
        (f.options || []).forEach(function (o) { inp.appendChild(el("option", { value: o.value }, o.label)); });
      } else if (f.type === "textarea") {
        inp = el("textarea", { id: id, rows: f.rows || 4 });
      } else {
        inp = el("input", { type: f.type || "text", id: id, autocomplete: "off" });
        if (f.list) inp.setAttribute("list", f.list);
        if (f.min !== undefined) inp.setAttribute("min", f.min);
        if (f.max !== undefined) inp.setAttribute("max", f.max);
        if (f.step !== undefined) inp.setAttribute("step", f.step);
      }
      if (f.placeholder) inp.setAttribute("placeholder", f.placeholder);
      if (f.value !== undefined) inp.value = f.value;
      w.appendChild(inp); body.appendChild(w); inputs[f.key] = inp;
    });
    var err = el("p", { "class": "msg", role: "alert" }); body.appendChild(err);
    var acts = el("div", { "class": "actions", style: "margin-top:6px" });
    var ok = el("button", { type: "button", "class": "primary", title: "Save and close" }, submitLabel), cancel = el("button", { type: "button", title: "Close without saving" }, "Cancel");
    function submit() {
      var vals = {}; Object.keys(inputs).forEach(function (k) { vals[k] = inputs[k].type === "checkbox" ? (inputs[k].checked ? "1" : "") : inputs[k].value.trim(); });
      var res = onSubmit(vals);
      if (typeof res === "string") { err.textContent = res; return; }
      closeModal(); if (res && res.msg) notify(res.msg);
    }
    on(ok, "click", submit); on(cancel, "click", closeModal);
    on(body, "keydown", function (e) { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); submit(); } });
    acts.appendChild(ok); acts.appendChild(cancel);
    if (extra) {
      var xb = el("button", { type: "button", "class": "danger", style: "margin-left:auto", title: extra.title }, extra.label);
      on(xb, "click", function () { closeModal(); extra.onClick(); });
      acts.appendChild(xb);
    }
    body.appendChild(acts);
  });
}

export function taskDialog(prefillQuestId) {
  var nt = nextTask();
  var questOpts = activeQuests().map(function (p) { return { value: p.id, label: p.name }; });
  if (!questOpts.length) { notify("Add an active quest first (Quests > Choose as next quest)."); return; }
  var fixedQuest = typeof prefillQuestId === "string";
  var startId = fixedQuest ? prefillQuestId : (nt && !nt.isNext ? nt.questId : questOpts[0].value);
  var startQuest = findQuest(startId);
  var fields = fixedQuest && startQuest
    ? [{ key: "quest", label: "Quest", type: "static", value: startQuest.name }]
    : [{ key: "quest", label: "Quest", type: "select", options: questOpts, value: startId }];
  fields.push({ key: "what", label: "Task" });
  fields.push({ key: "done", label: "How you’ll know it’s done (optional)" });
  fields.push({ key: "start", label: "Start date (optional)", type: "date" });
  fields.push({ key: "due", label: "Due date (leave empty to add to the quest’s backlog)", type: "date" });
  fields.push({ key: "est", label: "Estimated time in hours (optional)", type: "number", min: "0", max: "9999", step: "0.25" });
  formDialog("New task", fields, "Add task", function (v) {
    if (fixedQuest) v.quest = startId;
    if (!v.quest) return "Choose a quest.";
    if (!v.what) return "Enter a title for the task.";
    var blk = 0, start = "", due = "";
    if (v.due) {
      if (!isISO(v.due)) return "Enter a valid due date, or leave it empty for the Backlog.";
      var first = parseISO(pset(v.quest).start);
      blk = blockForDate(v.quest, parseISO(v.due));
      if (blk === null) return "Pick a due date on or after " + fmtY(first) + ", this quest’s own start date.";
      due = v.due;
      if (v.start) {
        if (!isISO(v.start)) return "Enter a valid start date, or leave it empty.";
        if (parseISO(v.start) < first) return "Pick a start date on or after " + fmtY(first) + ", this quest’s own start date.";
        if (v.start > due) return "The start date can’t be after the due date.";
        start = v.start;
      }
    } else if (v.start) return "Add a due date too, or clear the start date. A task with no due date goes to the Backlog.";
    var est = v.est === "" ? 0 : parseFloat(v.est);
    if (isNaN(est) || est < 0 || est > 9999) return "Enter the estimated time as hours from 0 to 9999, or leave it empty.";
    var t = task("c" + uid(), blk, v.quest, v.what.slice(0, 400), v.done.slice(0, 200) || "It’s finished", [], { custom: true, start: start, due: due, est: Math.round(est * 100) / 100, added: blk > 0 ? iso(TODAY) : "" });
    state.tasks.push(t); ui.sel = t.id; changed();
    return { msg: blk === 0 ? "Task added to the Backlog." : "Task added to " + wd() + " " + blk + " (" + fmt(taskStart(t)) + " to " + fmt(taskEnd(t)) + ")." };
  }, (fixedQuest ? "Assign a new task to this quest." : "Assign a new task to any open quest.") + " Adding start and due dates will automatically place the task within the quest’s " + wl() + ".");
}
export function questDialog() {
  formDialog("New candidate quest", [
    { key: "name", label: "Quest name" },
    { key: "notes", label: "Notes", type: "textarea", rows: 5 },
    { key: "giverHeading", label: "Quest Giver", type: "heading", hint: "The client or contact for this quest. If filled, this information will appear on the Quest Giver Export." },
    { key: "giverOrg", label: "Organization" },
    { key: "giverPoc", label: "POC" },
    { key: "giverPhone", label: "Phone", type: "tel" },
    { key: "giverEmail", label: "Email", type: "email" },
    { key: "giverWebsite", label: "Website", type: "url" },
    { key: "giverAddress", label: "Address", type: "textarea", rows: 3 },
    { key: "giverCoin", label: "Bounty", type: "number", min: "0", max: "999999", step: "1" },
    { key: "giverPer", label: "Per", type: "select", options: [{ value: "Hour", label: "Hour" }, { value: "Quest", label: "Quest" }] }
  ], "Add quest", function (v) {
    if (!v.name) return "Enter a title for the candidate quest.";
    var coinN = v.giverCoin === "" ? "" : parseInt(v.giverCoin, 10);
    var coin = (coinN === "" || isNaN(coinN) || coinN < 0) ? "" : Math.min(999999, coinN);
    var client = { org: v.giverOrg.slice(0, 200), poc: v.giverPoc.slice(0, 200), phone: v.giverPhone.slice(0, 200), email: v.giverEmail.slice(0, 200), address: v.giverAddress.slice(0, 500), website: v.giverWebsite.slice(0, 200), coin: coin, per: v.giverPer === "Quest" ? "Quest" : "Hour" };
    state.quests.push(makeQuest(uid(), v.name.slice(0, 120), "candidate", { notes: v.notes.slice(0, 5000), client: client })); changed();
    return { msg: v.name + " added as a candidate for the next slot." };
  }, "New quests appear in the Candidate quests section on the Quests page. The quest name is the only required field.");
}
// Links are bidirectional, so the chosen quest shows this one too. Only
// quests not already linked are offered.
export function linkQuestDialog(p) {
  var opts = liveQuests().filter(function (x) { return x.id !== p.id && p.linkedQuestIds.indexOf(x.id) < 0; }).map(function (x) { return { value: x.id, label: x.name }; });
  if (!opts.length) { notify("Every other quest is already linked."); return; }
  formDialog("Link quest", [{ key: "quest", label: "Quest to link", type: "select", options: opts, value: opts[0].value }], "Link quest", function (v) {
    var other = findQuest(v.quest);
    if (!other) return "Choose a quest to link.";
    linkQuests(p.id, other.id); changed();
    return { msg: "Linked to " + other.name + "." };
  }, "The link goes both ways: that quest will show this one too.");
}
// With an idea passed in, edits it in place; with none, adds a new one.
export function ideaDialog(idea) {
  formDialog(idea ? "Edit idea" : "New idea", [
    { key: "text", label: "Idea", value: idea ? idea.text : undefined },
    { key: "note", label: "Note (optional)", type: "textarea", rows: 5, value: idea ? idea.note : undefined }
  ], idea ? "Save idea" : "Workshop it", function (v) {
    if (!v.text) return "Enter a title for the idea.";
    if (idea) { idea.text = v.text.slice(0, 200); idea.note = v.note.slice(0, 5000); changed(); return { msg: "Idea saved." }; }
    state.workshop.push({ id: uid(), text: v.text.slice(0, 200), note: v.note.slice(0, 5000) }); changed();
    return { msg: "Added to the Workshop." };
  }, idea ? undefined : "New ideas go to the Workshop first. When ready, ideas can be made into candidate quests.");
}
// Steps with no decision yet, for one task -- shared by the cascade below.
function openStepOptions(taskId) {
  return stepOptionsForTask(taskId).filter(function (o) { return !decisionFor(o.value); });
}
export function decisionDialog(prefill) {
  var stepId = prefill && typeof prefill === "object" ? prefill.step : null;
  if (stepId) {
    var fixed = findStep(stepId);
    var opts = fixed ? [{ value: stepId, label: fixed.s.text }] : [];
    if (!opts.length) { notify("That step is gone."); return; }
    formDialog("New decision", [{ key: "q", label: "Decision" }], "Add decision", function (v) {
      if (!v.q) return "Enter a title for the decision.";
      if (decisionFor(stepId)) return "That step already has a decision.";
      state.decisions.push({ id: uid(), q: v.q.slice(0, 300), a: "", step: stepId }); changed();
      return { msg: "Decision added." };
    }, "For the step: " + opts[0].label + ". A decision is something you need to figure out before you can move forward. Answering it automatically checks that step off.");
    return;
  }
  // No fixed step: cascade Quest -> Task -> Step, same pattern as stepDialog().
  if (!stepOptions().some(function (o) { return !decisionFor(o.value); })) {
    notify("Every step already has a decision. Add a step first (open a task and add one), then add the decision.");
    return;
  }
  var questOpts = liveQuests().filter(function (p) { return p.status === "active"; }).map(function (p) { return { value: p.id, label: p.name }; });
  var startQuest = (typeof prefill === "string" && prefill) || (questOpts.length ? questOpts[0].value : "");
  var startTasks = taskOptions(startQuest);
  var startTask = startTasks.length ? startTasks[0].value : "";
  var startSteps = openStepOptions(startTask);
  if (!startSteps.length) {
    var found = startTasks.filter(function (o) { return openStepOptions(o.value).length; })[0];
    startTask = found ? found.value : startTask;
    startSteps = startTask ? openStepOptions(startTask) : [];
  }
  formDialog("New decision", [
    { key: "quest", label: "Quest", type: "select", options: questOpts, value: startQuest },
    { key: "task", label: "Task", type: "select", options: startTasks, value: startTask },
    { key: "step", label: "Step", type: "select", options: startSteps, value: startSteps.length ? startSteps[0].value : "" },
    { key: "q", label: "Decision" }
  ], "Add decision", function (v) {
    if (!v.q) return "Enter a title for the decision.";
    if (!v.step) return "Choose a step.";
    if (decisionFor(v.step)) return "That step already has a decision.";
    state.decisions.push({ id: uid(), q: v.q.slice(0, 300), a: "", step: v.step }); changed();
    return { msg: "Decision added." };
  }, "A decision is something that needs to be figured out before completing a step. Answering a decision will automatically check the step off.");
  var questSel = $("f-quest"), taskSel = $("f-task"), stepSel = $("f-step");
  if (questSel && taskSel && stepSel) {
    function fillSteps(taskId) {
      var sOpts = openStepOptions(taskId);
      stepSel.innerHTML = "";
      sOpts.forEach(function (o) { stepSel.appendChild(el("option", { value: o.value }, o.label)); });
    }
    on(questSel, "change", function () {
      var tOpts = taskOptions(questSel.value);
      taskSel.innerHTML = "";
      tOpts.forEach(function (o) { taskSel.appendChild(el("option", { value: o.value }, o.label)); });
      fillSteps(taskSel.value);
    });
    on(taskSel, "change", function () { fillSteps(taskSel.value); });
  }
}
// Answering ticks the linked step; clearing it unticks -- but only when the
// answer itself changed, so fixing a typo in the question never flips the step.
export function decisionEditDialog(dec, onRemove) {
  var ls = findStep(dec.step);
  formDialog("Decision", [
    { key: "q", label: "Decision", value: dec.q },
    { key: "a", label: "Answer", type: "textarea", rows: 3, value: dec.a }
  ], "Save decision", function (v) {
    if (!v.q) return "Enter a title for the decision.";
    var was = dec.a;
    dec.q = v.q.slice(0, 300); dec.a = v.a.slice(0, 1000);
    if (dec.a !== was && ls) { ls.s.done = dec.a !== ""; syncFromSteps(ls.t); }
    changed();
    return { msg: "Decision saved." };
  }, ls ? "For the step: " + ls.s.text + ". Answering it checks that step off, and clearing the answer unchecks it." : undefined,
  onRemove ? { label: "Remove", title: "Remove this decision (can be undone)", onClick: onRemove } : undefined);
}
// Edits one step in place: its text and whether it is on the Launch checklist. Remove
// also removes its decision, since a decision must belong to a step.
export function stepDialog(prefillQuestId) {
  if (!orderedAll().length) { notify("Add a task first."); return; }
  var selTask = ui.sel && findTask(ui.sel);
  var questOpts = liveQuests().filter(function (p) { return p.status === "active"; }).map(function (p) { return { value: p.id, label: p.name }; });
  var startId = prefillQuestId || (selTask ? selTask.questId : (questOpts.length ? questOpts[0].value : ""));
  var pick = selTask ? selTask.id : ((nextTask() || orderedAll()[0]).id);
  formDialog("New step", [
    { key: "quest", label: "Quest", type: "select", options: questOpts, value: startId },
    { key: "task", label: "Task", type: "select", options: taskOptions(startId), value: pick },
    { key: "text", label: "Step" }
  ], "Add step", function (v) {
    var t = findTask(v.task);
    if (!v.text) return "Enter a title for the step.";
    if (!t) return "Choose a task.";
    t.steps.push({ id: uid(), text: v.text.slice(0, 300), done: false }); syncFromSteps(t); changed();
    return { msg: "Step added to " + dispQuest(t) + "." };
  }, "Steps can be added on all tasks within a quest.");
  var questSel = $("f-quest"), taskSel = $("f-task");
  if (questSel && taskSel) {
    on(questSel, "change", function () {
      var opts = taskOptions(questSel.value);
      taskSel.innerHTML = "";
      opts.forEach(function (o) { taskSel.appendChild(el("option", { value: o.value }, o.label)); });
    });
  }
}
// Slips only incomplete, scheduled tasks later by N days -- Completed tasks,
// the Backlog, and the quest's own start date are never touched.
export function slipDialog(p) {
  openModal("Slip " + p.name + "'s schedule", function (body) {
    body.appendChild(el("p", { "class": "hint first" }, "This moves incomplete tasks later by the same number of days. Completed tasks and the Backlog are not affected."));
    var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": "slipDays" }, "Days to slip (1 to 90)"));
    var inp = el("input", { type: "number", id: "slipDays", min: "1", max: "90", step: "1" }); inp.value = "7"; w.appendChild(inp); body.appendChild(w);
    var err = el("p", { "class": "msg", role: "alert" }); body.appendChild(err);
    var acts = el("div", { "class": "actions", style: "margin-top:6px" });
    acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "slipGo", title: "Push dates later" }, "Push dates later"), "click", function () {
      var n = parseInt(inp.value, 10);
      if (isNaN(n) || n < 1 || n > 90) { err.textContent = "Enter a number of days from 1 to 90."; return; }
      var targets = state.tasks.filter(function (t) { return t.questId === p.id && !t.isNext && t.block > 0 && t.status !== "Completed" && !t.vault; });
      if (!targets.length) { err.textContent = "Nothing incomplete is scheduled to slip."; return; }
      var snap = targets.map(function (t) { return { id: t.id, block: t.block, start: t.start, due: t.due }; });
      targets.forEach(function (t) {
        // Both ends move by the same days, so a task keeps its own length.
        var newStart = addDays(taskStart(t), n), newDue = addDays(taskEnd(t), n);
        t.start = iso(newStart); t.due = iso(newDue);
        var newBlock = blockForDate(p.id, newDue);
        t.block = newBlock === null ? t.block : newBlock;
      });
      p.lastSlip = { days: n, snap: snap };
      changed(); closeModal();
      notify(targets.length + (targets.length === 1 ? " task" : " tasks") + " in " + p.name + " moved back " + n + (n === 1 ? " day" : " days") + ".");
    }));
    if (p.lastSlip) acts.appendChild(on(el("button", { type: "button", id: "slipUndo", title: "Reverse the last slip" }, "Undo last slip (" + p.lastSlip.days + " days)"), "click", function () {
      p.lastSlip.snap.forEach(function (s) { var t = findTask(s.id); if (t) { t.block = s.block; t.start = s.start || ""; t.due = s.due || ""; } });
      p.lastSlip = null; changed(); closeModal();
      notify("Slip undone.");
    }));
    acts.appendChild(on(el("button", { type: "button", title: "Cancel" }, "Cancel"), "click", closeModal));
    body.appendChild(acts);
  });
}

export function confirmDialog(title, text, label, onConfirm) {
  openModal(title, function (body) {
    body.appendChild(el("p", { "class": "first" }, text));
    var acts = el("div", { "class": "actions" });
    var no = el("button", { type: "button", title: "Cancel this action" }, "Cancel"), yes = el("button", { type: "button", "class": "dangerfill", id: "confirmYes", title: "Confirm this action" }, label);
    on(no, "click", closeModal); on(yes, "click", function () { closeModal(); onConfirm(); });
    acts.appendChild(no); acts.appendChild(yes); body.appendChild(acts);
  });
}
