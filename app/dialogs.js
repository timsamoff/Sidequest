import { state, ui, changed, isISO, task, makeQuest } from "./state.js";
import { iso, addDays, fmtY, TODAY } from "./dates.js";
import {
  wpC, questNameTaken, questDueLimit, liveQuests, findQuest, dispQuest, nextTask, findTask,
  orderedAll, taskOptions, stepOptions, stepOptionsForTask, syncFromSteps, findStep, decisionFor,
  blockForDate, taskStart, taskEnd, linkQuests
} from "./model.js";
import { $, el, on, uid, newPin, notify, moneyInput, parseMoney, helpLink, setMsg, isEmail } from "./dom.js";
import { closeMenus } from "./app.js";
import { phoneField } from "./phone.js";

/* modal */
export var modalReturn = null;
// opts.full makes the dialog fill the screen (less a small margin), for a big chart.
// A "?" opened from inside a dialog saves that dialog here, so closing the help brings it back as it was.
var modalSaved = null;
// The form now showing, if any. One Enter listener serves it; a listener per dialog would pile up and resubmit old forms.
var formSubmit = null;
on($("modalBody"), "keydown", function (e) { if (formSubmit && e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); formSubmit(); } });
// Freezes the page behind a dialog. overflow:hidden alone does not stop touch scrolling on some phones.
var lockedAt = null;
function lockPage() {
  if (lockedAt !== null) return;
  lockedAt = window.pageYOffset || 0;
  var s = document.body.style; s.position = "fixed"; s.top = -lockedAt + "px"; s.left = "0"; s.right = "0";
}
function unlockPage() {
  if (lockedAt === null) return;
  var y = lockedAt, s = document.body.style; lockedAt = null;
  s.position = ""; s.top = ""; s.left = ""; s.right = "";
  try { window.scrollTo(0, y); } catch (e) { /* ignore */ }
}
// Scrolls a just-added task (its quest page row, or its selected row in Tasks) to 20px below the sticky header.
export function scrollToTask(id) {
  var row = document.getElementById("ptask-" + id) || document.querySelector('#view .listpane [aria-current="true"]');
  if (!row) return;
  var bar = document.querySelector(".topbar"), below = bar ? bar.getBoundingClientRect().bottom : 0;
  try { window.scrollTo(0, Math.max(0, row.getBoundingClientRect().top + (window.pageYOffset || 0) - below - 20)); } catch (e) { /* ignore */ }
}
export function openModal(title, build, opts) {
  modalSaved = null; formSubmit = null;
  modalReturn = document.activeElement;
  document.querySelector("#overlay .modal").classList.toggle("full", !!(opts && opts.full));
  $("modalTitle").textContent = title;
  $("modalClose").title = "Close";
  // A dialog with its own Done button can drop the header Close; Escape and a tap outside still close it.
  $("modalClose").hidden = !!(opts && opts.noClose);
  var body = $("modalBody"); body.innerHTML = "";
  build(body);
  $("overlay").hidden = false; lockPage();
  var first = body.querySelector("input, textarea, select, button");
  if (first) first.focus();
}
// Opens over whatever dialog is showing; closing it (X, Escape, outside click) returns to that dialog.
export function openModalOver(title, build, opts) {
  if ($("overlay").hidden) { openModal(title, build, opts); return; }
  var body = $("modalBody"), modal = document.querySelector("#overlay .modal");
  var saved = { title: $("modalTitle").textContent, nodes: Array.prototype.slice.call(body.childNodes), full: modal.classList.contains("full"), ret: modalReturn, noClose: $("modalClose").hidden, submit: formSubmit };
  openModal(title, build, opts);
  modalSaved = saved;
}
// Closes everything, including a dialog saved underneath a help modal.
export function closeAllModals() { modalSaved = null; closeModal(); }
export function closeModal() {
  if (modalSaved) {
    var s = modalSaved, b = $("modalBody"); modalSaved = null;
    b.innerHTML = ""; s.nodes.forEach(function (n) { b.appendChild(n); });
    $("modalTitle").textContent = s.title;
    document.querySelector("#overlay .modal").classList.toggle("full", s.full);
    modalReturn = s.ret; formSubmit = s.submit;
    $("modalClose").hidden = s.noClose;
    var f = b.querySelector("input, textarea, select, button"); if (f) f.focus();
    return;
  }
  $("overlay").hidden = true; $("modalBody").innerHTML = ""; formSubmit = null; unlockPage();
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
    var inputs = {}, host = body;
    fields.forEach(function (f) {
      var w = el("div", { "class": "field" }); var id = "f-" + f.key;
      if (f.type === "checkbox") {
        var crow = el("label", { "class": "radiorow" }), cbx = el("input", { type: "checkbox", id: id }); cbx.checked = !!f.value;
        crow.appendChild(cbx); crow.appendChild(el("span", null, f.label)); w.appendChild(crow); host.appendChild(w); inputs[f.key] = cbx; return;
      }
      if (f.type === "static") {
        w.appendChild(el("span", { "class": "hint" }, f.label + ": " + f.value)); host.appendChild(w); return;
      }
      if (f.type === "heading") {
        host = body;
        var h3 = el("h3", { "class": "dialogheading" });
        if (f.collapsible) {
          // Same look as a quest page's collapsible section: a heading, then a one-row card that opens in place. Everything after the heading goes in the card.
          h3 = el("h2", { "class": "dialogheading hasq" }, f.label);
          if (f.help) h3.appendChild(helpLink(f.help, f.label));
          body.appendChild(h3);
          var cul = el("ul", { "class": "tlist sectionlist" }), cli = el("li");
          var cb = el("button", { type: "button", "class": "item", "aria-expanded": "false", title: "Show " + f.label }, null);
          var cline = el("div", { "class": "l2" }); cb.appendChild(cline);
          var grp = el("div", { "class": "detail" }); grp.hidden = true;
          var paintLine = function () {
            var t = (f.summaryKeys || []).map(function (k) { return inputs[k] ? inputs[k].value.trim() : ""; }).filter(Boolean).join(" · ");
            cline.textContent = t || f.emptyText || f.label; cline.style.color = t ? "" : "var(--muted)"; cline.style.fontSize = t ? "" : "var(--text-sm)";
          };
          paintLine();
          on(cb, "click", function () {
            var open = grp.hidden; grp.hidden = !open;
            cb.setAttribute("aria-expanded", open ? "true" : "false"); cb.title = (open ? "Hide " : "Show ") + f.label; paintLine();
          });
          cli.appendChild(cb); cli.appendChild(grp); cul.appendChild(cli); body.appendChild(cul);
          host = grp;
        } else {
          h3.appendChild(document.createTextNode(f.label)); if (f.help) h3.appendChild(helpLink(f.help, f.label));
          body.appendChild(h3);
          if (f.hint) body.appendChild(el("p", { "class": "hint" }, f.hint));
        }
        return;
      }
      w.appendChild(el("label", { "for": id }, f.label));
      var inp;
      if (f.type === "select") {
        inp = el("select", { id: id, "class": "plain" });
        (f.options || []).forEach(function (o) { inp.appendChild(el("option", { value: o.value }, o.label)); });
      } else if (f.type === "textarea") {
        inp = el("textarea", { id: id, rows: f.rows || 4 });
      } else if (f.type === "phone") {
        // The wrapper answers .value with the saved string, so the submit code reads it like any input.
        var pf = phoneField(id, f.value || "", null); inp = pf.el;
        Object.defineProperty(inp, "value", { get: function () { return pf.get(); }, set: function () { /* set at creation */ } });
      } else if (f.type === "money") {
        inp = moneyInput(el("input", { type: "text", id: id }), null, state.settings.coinFormat);
      } else {
        inp = el("input", { type: f.type || "text", id: id, autocomplete: "off" });
        if (f.list) inp.setAttribute("list", f.list);
        if (f.min !== undefined) inp.setAttribute("min", f.min);
        if (f.max !== undefined) inp.setAttribute("max", f.max);
        if (f.step !== undefined) inp.setAttribute("step", f.step);
        if (f.type === "number") inp.setAttribute("inputmode", String(f.step).indexOf(".") >= 0 ? "decimal" : "numeric");
      }
      if (f.placeholder) inp.setAttribute("placeholder", f.placeholder);
      if (f.value !== undefined) inp.value = f.value;
      w.appendChild(inp); host.appendChild(w); inputs[f.key] = inp;
    });
    var err = el("p", { "class": "msg", role: "alert" }); body.appendChild(err);
    var fieldErr = {};
    var acts = el("div", { "class": "actions", style: "margin-top:6px" });
    var ok = el("button", { type: "button", "class": "primary", title: "Save and close" }, submitLabel), cancel = el("button", { type: "button", title: "Close without saving" }, "Cancel");
    function submit() {
      var vals = {}; Object.keys(inputs).forEach(function (k) { vals[k] = inputs[k].type === "checkbox" ? (inputs[k].checked ? "1" : "") : inputs[k].value.trim(); });
      Object.keys(fieldErr).forEach(function (k) { setMsg(fieldErr[k], "", ""); });
      var res = onSubmit(vals);
      // { field, error } puts the message directly under that field; a plain string goes at the bottom.
      if (res && res.error && inputs[res.field] && inputs[res.field].closest(".field")) {
        var host = inputs[res.field].closest(".field");
        if (!fieldErr[res.field]) { fieldErr[res.field] = el("p", { "class": "msg", role: "alert" }); host.parentNode.insertBefore(fieldErr[res.field], host.nextSibling); }
        setMsg(fieldErr[res.field], res.error, "error"); inputs[res.field].focus(); return;
      }
      if (res && res.error) res = res.error;
      if (typeof res === "string") { setMsg(err, res, "error"); return; }
      closeModal(); if (res && res.msg) notify(res.msg);
    }
    on(ok, "click", submit); on(cancel, "click", closeModal);
    formSubmit = submit;
    acts.appendChild(ok); acts.appendChild(cancel);
    if (extra) {
      var xb = el("button", { type: "button", "class": "danger", style: "margin-left:auto", title: extra.title }, extra.label);
      on(xb, "click", function () { closeModal(); extra.onClick(); });
      acts.appendChild(xb);
    }
    body.appendChild(acts);
  });
}

// Quests that can take work: Candidates (so they can be built out before promotion) and In progress.
function workQuests() { return liveQuests().filter(function (p) { return p.status === "active" || p.status === "candidate"; }); }
export function taskDialog(prefillQuestId) {
  var nt = nextTask();
  var questOpts = workQuests().map(function (p) { return { value: p.id, label: p.name }; });
  if (!questOpts.length) { notify("Tasks can only be added to a quest.", null, "problem"); return; }
  var fixedQuest = typeof prefillQuestId === "string";
  var startId = fixedQuest ? prefillQuestId : (nt ? nt.questId : questOpts[0].value);
  var startQuest = findQuest(startId);
  var fields = fixedQuest && startQuest
    ? [{ key: "quest", label: "Quest", type: "static", value: startQuest.name }]
    : [{ key: "quest", label: "Quest", type: "select", options: questOpts, value: startId }];
  fields.push({ key: "what", label: "Task" });
  fields.push({ key: "notes", label: "Notes", type: "textarea", rows: 5 });
  formDialog("New task", fields, "Add task", function (v) {
    if (fixedQuest) v.quest = startId;
    if (!v.quest) return "Choose a quest.";
    if (!v.what) return { field: "what", error: "Enter a title for the task." };
    var t = task("c" + uid(), 0, v.quest, v.what.slice(0, 400), "It’s finished", [], { custom: true, start: "", due: "", est: 0, added: "", notes: v.notes.slice(0, 5000) });
    state.tasks.push(t); ui.sel = t.id; changed();
    // After the dialog closes and the page unlocks, so the scroll is not undone.
    setTimeout(function () { scrollToTask(t.id); }, 0);
    return { msg: "“" + t.what + "” added as a task to " + dispQuest(t) + "’s backlog." };
  }, (fixedQuest ? "Assign a new task to this quest." : "Assign a new task to any open quest.") + " New tasks start in the quest’s backlog. Open the task afterward to set its dates, estimate, and finish line.");
}
export function questDialog() {
  formDialog("New candidate quest", [
    { key: "name", label: "Quest name" },
    { key: "notes", label: "Notes", type: "textarea", rows: 5 },
    { key: "giverHeading", label: "Quest giver", type: "heading", collapsible: true, help: "quest-giver", emptyText: "Add Quest giver details", summaryKeys: ["giverOrg", "giverPoc"] },
    { key: "giverOrg", label: "Organization" },
    { key: "giverPoc", label: "POC" },
    { key: "giverPhone", label: "Phone", type: "phone" },
    { key: "giverEmail", label: "Email", type: "email" },
    { key: "giverWebsite", label: "Website", type: "url" },
    { key: "giverAddress", label: "Address", type: "textarea", rows: 3 },
    { key: "giverCoin", label: "Bounty", type: "money" },
    { key: "giverPer", label: "Per", type: "select", options: [{ value: "Hour", label: "Hour" }, { value: "Quest", label: "Quest" }] }
  ], "Add candidate quest", function (v) {
    if (!v.name) return { field: "name", error: "Enter a title for the candidate quest." };
    if (questNameTaken(v.name)) return { field: "name", error: "A quest named “" + questNameTaken(v.name).name + "” already exists. Choose another name." };
    if (v.giverEmail && !isEmail(v.giverEmail)) return { field: "giverEmail", error: "The Quest giver email isn’t an address. Enter one like name@example.com, or leave it empty." };
    var coin = parseMoney(v.giverCoin, state.settings.coinFormat);
    var client = { org: v.giverOrg.slice(0, 200), poc: v.giverPoc.slice(0, 200), phone: v.giverPhone.slice(0, 200), email: v.giverEmail.slice(0, 200), address: v.giverAddress.slice(0, 500), website: v.giverWebsite.slice(0, 200), coin: coin, per: v.giverPer === "Quest" ? "Quest" : "Hour" };
    state.quests.push(makeQuest(uid(), v.name.slice(0, 120), "candidate", { notes: v.notes.slice(0, 5000), client: client, start: iso(TODAY) })); changed();
    return { msg: "“" + v.name + "” has been added as a candidate quest to Quests." };
  }, "New quests appear in the Candidate quests section on the Quests page. The quest name is the only required field.");
}
// Links are bidirectional, so the chosen quest shows this one too. Only
// quests not already linked are offered.
export function linkQuestDialog(p) {
  var opts = liveQuests().filter(function (x) { return x.id !== p.id && x.status !== "candidate" && p.linkedQuestIds.indexOf(x.id) < 0; }).map(function (x) { return { value: x.id, label: x.name }; });
  if (!opts.length) { notify("Every other quest is already linked.", null, "problem"); return; }
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
    if (!v.text) return { field: "text", error: "Enter a title for the idea." };
    if (idea) { idea.text = v.text.slice(0, 200); idea.note = v.note.slice(0, 5000); changed(); return { msg: "Idea saved." }; }
    state.workshop.push({ id: uid(), text: v.text.slice(0, 200), note: v.note.slice(0, 5000), created: iso(TODAY), pin: newPin() }); changed();
    return { msg: "“" + v.text + "” added to the Workshop." };
  }, idea ? undefined : "New ideas live in the Workshop. When ready, ideas can be made into candidate quests.");
}
export function jobDialog() {
  formDialog("New errand", [
    { key: "text", label: "Errand" },
    { key: "due", label: "Due date (optional)", type: "date" }
  ], "Add errand", function (v) {
    if (!v.text) return { field: "text", error: "Enter an errand to add it." };
    state.jobs.push({ id: uid(), text: v.text.slice(0, 200), done: false, due: isISO(v.due) ? v.due : "" }); changed();
    return { msg: "“" + v.text.slice(0, 200) + "” added to Errands." };
  }, "Small errands that aren’t worth a quest go on the Errands list.");
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
    if (!opts.length) { notify("That step is gone.", null, "problem"); return; }
    formDialog("New decision", [{ key: "q", label: "Decision" }], "Add decision", function (v) {
      if (!v.q) return { field: "q", error: "Enter a title for the decision." };
      if (decisionFor(stepId)) return "That step already has a decision.";
      state.decisions.push({ id: uid(), q: v.q.slice(0, 300), a: "", step: stepId }); changed();
      return { msg: "“" + v.q + "” added as a decision to " + fixed.s.text + " in " + dispQuest(fixed.t) + "." };
    }, "For the step: " + opts[0].label + ". A decision is something you need to figure out before you can move forward. Answering it automatically checks that step off.");
    return;
  }
  // No fixed step: cascade Quest -> Task -> Step, same pattern as stepDialog().
  if (!stepOptions().length) { notify("A decision can only be added to a step.", null, "problem"); return; }
  if (!stepOptions().some(function (o) { return !decisionFor(o.value); })) {
    notify("Every step already has a decision. Add a step first (open a task and add one), then add the decision.", null, "problem");
    return;
  }
  var questOpts = workQuests().map(function (p) { return { value: p.id, label: p.name }; });
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
    if (!v.q) return { field: "q", error: "Enter a title for the decision." };
    if (!v.step) return { field: "step", error: "Choose a step." };
    if (decisionFor(v.step)) return "That step already has a decision.";
    state.decisions.push({ id: uid(), q: v.q.slice(0, 300), a: "", step: v.step }); changed();
    var at = findStep(v.step);
    return { msg: "“" + v.q + "” added as a decision to " + (at ? at.s.text + " in " + dispQuest(at.t) : "a step") + "." };
  }, "Decisions can be added to any step within a task.");
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
    if (!v.q) return { field: "q", error: "Enter a title for the decision." };
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
  if (!orderedAll().length) { notify("Steps can only be added to a task.", null, "problem"); return; }
  var selTask = ui.sel && findTask(ui.sel);
  var questOpts = workQuests().map(function (p) { return { value: p.id, label: p.name }; });
  var startId = prefillQuestId || (selTask ? selTask.questId : (questOpts.length ? questOpts[0].value : ""));
  var pick = selTask ? selTask.id : ((nextTask() || orderedAll()[0]).id);
  formDialog("New step", [
    { key: "quest", label: "Quest", type: "select", options: questOpts, value: startId },
    { key: "task", label: "Task", type: "select", options: taskOptions(startId), value: pick },
    { key: "text", label: "Step" }
  ], "Add step", function (v) {
    var t = findTask(v.task);
    if (!v.text) return { field: "text", error: "Enter a title for the step." };
    if (!t) return "Choose a task.";
    t.steps.push({ id: uid(), text: v.text.slice(0, 300), done: false }); syncFromSteps(t); changed();
    return { msg: "“" + v.text + "” added as a step to " + t.what + " in " + dispQuest(t) + "." };
  }, "Steps can be added to any task within a quest.");
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
// the Backlog, and the quest's start date are never touched.
export function slipDialog(p) {
  openModal("Slip " + p.name + "’s schedule", function (body) {
    body.appendChild(el("p", { "class": "hint first" }, "This moves incomplete tasks later by the same number of days. Completed tasks and the Backlog are not affected."));
    var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": "slipDays" }, "Days to slip (1 to 90)"));
    var inp = el("input", { type: "number", id: "slipDays", min: "1", max: "90", step: "1", inputmode: "numeric" }); inp.value = "7"; w.appendChild(inp); body.appendChild(w);
    var err = el("p", { "class": "msg", role: "alert" }); body.appendChild(err);
    var acts = el("div", { "class": "actions", style: "margin-top:6px" });
    var warnedFor = null;
    acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "slipGo", title: "Push dates later" }, "Push dates later"), "click", function () {
      var n = parseInt(inp.value, 10);
      if (isNaN(n) || n < 1 || n > 90) { setMsg(err, "Enter a number of days from 1 to 90.", "error"); return; }
      var targets = state.tasks.filter(function (t) { return t.questId === p.id && t.block > 0 && t.status !== "Completed" && !t.vault; });
      if (!targets.length) { setMsg(err, "Nothing incomplete is scheduled to slip.", "error"); return; }
      // Warns once for this number of days; choosing the button again goes ahead.
      var limit = questDueLimit(p.id), past = limit === null ? 0 : targets.filter(function (t) { return addDays(taskEnd(t), n) > limit; }).length;
      if (past && warnedFor !== n) {
        warnedFor = n;
        setMsg(err, past + (past === 1 ? " task" : " tasks") + " would land after this quest’s due date (" + fmtY(limit) + "). Choose Push dates later again to go ahead.", "note");
        return;
      }
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
