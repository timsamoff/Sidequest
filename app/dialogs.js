import { state, ui, changed, isISO, task, project as makeProject } from "./state.js";
import { iso, addDays, parseISO, fmt } from "./dates.js";
import {
  wd, wpC, counted, activeProjects, liveProjects, findProject, dispProject, nextTask, findTask,
  orderedAll, taskOptions, stepOptions, syncFromSteps, ordered, findStep, decisionFor,
  pset, blockStartFor, blockEndFor, linkProjects
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

export function taskDialog(prefillProjectId, backlog) {
  var nt = nextTask();
  var projOpts = activeProjects().map(function (p) { return { value: p.id, label: p.name }; });
  if (!projOpts.length) { notify("Add an active project first (Projects > Choose as next project)."); return; }
  var startId = typeof prefillProjectId === "string" ? prefillProjectId : (nt && !nt.isNext ? nt.projectId : projOpts[0].value);
  formDialog(backlog ? "New backlog item" : "New task", [
    { key: "project", label: "Project", type: "select", options: projOpts, value: startId },
    { key: "what", label: "Task" },
    { key: "done", label: "How you'll know it's done (optional)" },
    { key: "block", label: wd() + " number (1 to 12), or leave empty for the Backlog", type: "number", min: 1, max: 12, step: 1, placeholder: "Backlog", value: backlog ? "" : (nt ? nt.block : 4) }
  ], backlog ? "Add to Backlog" : "Add task", function (v) {
    var blk = v.block === "" ? 0 : Number(v.block);
    if (!v.project || !v.what) return "Choose a project and enter what you do.";
    if (v.block !== "" && (!Number.isInteger(blk) || blk < 1 || blk > 12)) return wd() + " number must be from 1 to 12, or empty for the Backlog.";
    var t = task("c" + uid(), blk, v.project, v.what.slice(0, 400), v.done.slice(0, 200) || "It's finished", [], { custom: true });
    state.tasks.push(t); ui.sel = t.id; changed();
    return { msg: blk === 0 ? "Task added to the Backlog." : "Task added to " + wd() + " " + blk + " (" + fmt(blockStartFor(v.project, blk)) + " to " + fmt(blockEndFor(v.project, blk)) + ")." };
  }, wpC() + " set the dates. " + wd() + " 1 starts on the project's start date. Leave it empty to put the task in the Backlog.");
}
export function projectDialog() {
  formDialog("New project", [{ key: "name", label: "Project name" }, { key: "notes", label: "Notes (optional)", type: "textarea", rows: 5 }], "Add project", function (v) {
    if (!v.name) return "Enter a project name.";
    state.projects.push(makeProject(uid(), v.name.slice(0, 120), "candidate", { notes: v.notes.slice(0, 5000) })); changed();
    return { msg: v.name + " added as a candidate for the next slot." };
  }, "It joins the candidates for the next slot. You can park it later.");
}
// With an idea passed in, edits it in place (same record, same id); with none,
// adds a new one.
// Links are bidirectional (see linkProjects()), so the chosen project shows
// this one too. Only projects not already linked are offered.
export function linkProjectDialog(p) {
  var opts = liveProjects().filter(function (x) { return x.id !== p.id && p.linkedProjectIds.indexOf(x.id) < 0; }).map(function (x) { return { value: x.id, label: x.name }; });
  if (!opts.length) { notify("Every other project is already linked."); return; }
  formDialog("Link project", [{ key: "project", label: "Project to link", type: "select", options: opts, value: opts[0].value }], "Link project", function (v) {
    var other = findProject(v.project);
    if (!other) return "Choose a project to link.";
    linkProjects(p.id, other.id); changed();
    return { msg: "Linked to " + other.name + "." };
  }, "The link goes both ways: that project will show this one too.");
}
// Edits a candidate project's own fields in place: Notes, Start date, Due
// date, and its own block/sprint length. Promotion (Candidate -> Active) is a
// separate row action on the Candidates list, not a button in this dialog --
// this dialog only saves, matching ideaDialog's own Edit/Save pattern.
export function candidateDialog(p) {
  formDialog("Edit candidate", [
    { key: "name", label: "Project name", value: p.name },
    { key: "notes", label: "Notes", type: "textarea", rows: 5, value: p.notes },
    { key: "start", label: "Start date", type: "date", value: p.start },
    { key: "due", label: "Due date", type: "date", value: p.due },
    { key: "days", label: "Days per " + wd(), type: "number", min: "1", max: "90", step: "1", value: p.days }
  ], "Save", function (v) {
    if (!v.name) return "Enter a project name.";
    var days = parseInt(v.days, 10);
    if (isNaN(days) || days < 1 || days > 90) return wd() + " length must be from 1 to 90 days.";
    p.name = v.name.slice(0, 120);
    p.notes = v.notes.slice(0, 5000);
    p.start = isISO(v.start) ? v.start : "";
    p.due = isISO(v.due) ? v.due : "";
    p.days = days;
    changed();
    return { msg: "Candidate saved." };
  });
}
export function ideaDialog(idea) {
  formDialog(idea ? "Edit idea" : "New idea", [
    { key: "text", label: "Idea", value: idea ? idea.text : undefined },
    { key: "note", label: "Note (optional)", type: "textarea", rows: 5, value: idea ? idea.note : undefined }
  ], idea ? "Save idea" : "Add to parking lot", function (v) {
    if (!v.text) return "Enter the idea.";
    if (idea) { idea.text = v.text.slice(0, 200); idea.note = v.note.slice(0, 5000); changed(); return { msg: "Idea saved." }; }
    state.parked.push({ id: uid(), text: v.text.slice(0, 200), note: v.note.slice(0, 5000) }); changed();
    return { msg: "Added to the parking lot." };
  });
}
// prefill is a project id (offer only that project's steps) or { step } (the step is
// already chosen, as when adding from a step's row). A decision must belong to a
// step (Project -> Task -> Step -> Decision, see DESIGN.md), and a step has at most one.
export function decisionDialog(prefill) {
  var stepId = prefill && typeof prefill === "object" ? prefill.step : null;
  var projectId = typeof prefill === "string" ? prefill : undefined;
  var opts = stepOptions(projectId).filter(function (o) { return !decisionFor(o.value); });
  if (stepId) { var fixed = findStep(stepId); opts = fixed ? [{ value: stepId, label: fixed.s.text }] : []; }
  if (!opts.length) { notify(stepId ? "That step is gone." : "Every step already has a decision. Add a step first (open a task and add one), then add the decision."); return; }
  var fields = [{ key: "q", label: "Decision" }];
  if (!stepId) fields.push({ key: "step", label: "Linked step", type: "select", options: opts, value: opts[0].value });
  formDialog("New decision", fields, "Add decision", function (v) {
    var step = stepId || v.step;
    if (!v.q) return "Enter the decision.";
    if (!step) return "Choose a step.";
    if (decisionFor(step)) return "That step already has a decision.";
    state.decisions.push({ id: uid(), q: v.q.slice(0, 300), a: "", step: step }); changed();
    return { msg: "Decision added." };
  }, (stepId ? "For the step: " + opts[0].label + ". " : "") + "A decision is something you need to figure out before you can move forward. Answering it automatically checks that step off.");
}
// Edits a decision in place: its question and its answer. Removal is supplied by the
// caller (it lives in views.js). Answering ticks the linked step and clearing the
// answer unticks it, but only when the answer itself changed, so fixing a typo in
// the question never flips a step the user set by hand.
export function decisionEditDialog(dec, onRemove) {
  var ls = findStep(dec.step);
  formDialog("Decision", [
    { key: "q", label: "Decision", value: dec.q },
    { key: "a", label: "Answer", type: "textarea", rows: 3, value: dec.a }
  ], "Save decision", function (v) {
    if (!v.q) return "Enter the decision.";
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
export function stepEditDialog(t, s) {
  var hasDecision = !!decisionFor(s.id);
  formDialog("Edit step", [
    { key: "text", label: "Step", value: s.text },
    { key: "launch", label: "On the launch checklist", type: "checkbox", value: s.launch }
  ], "Save step", function (v) {
    if (!v.text) return "Enter the step.";
    s.text = v.text.slice(0, 300); s.launch = v.launch === "1"; changed();
    return { msg: "Step saved." };
  }, hasDecision ? "Removing this step also removes its decision." : undefined,
  { label: "Remove", title: "Remove this step", onClick: function () {
    t.steps = t.steps.filter(function (x) { return x.id !== s.id; });
    state.decisions = state.decisions.filter(function (x) { return x.step !== s.id; });
    syncFromSteps(t); changed();
  } });
}
export function stepDialog(launchItem, prefillProjectId) {
  if (!orderedAll().length) { notify("Add a task first."); return; }
  var selTask = ui.sel && findTask(ui.sel);
  var startId = prefillProjectId || (selTask ? selTask.projectId : "");
  var projOpts = [{ value: "", label: "All projects" }].concat(liveProjects().filter(function (p) { return p.status === "active"; }).map(function (p) { return { value: p.id, label: p.name }; }));
  var pick = selTask ? selTask.id : ((nextTask() || orderedAll()[0]).id);
  formDialog(launchItem ? "New launch item" : "New step", [
    { key: "project", label: "Project", type: "select", options: projOpts, value: startId },
    { key: "task", label: "Task", type: "select", options: taskOptions(startId), value: pick },
    { key: "text", label: launchItem ? "What needs doing before you launch?" : "Step" }
  ], "Add step", function (v) {
    var t = findTask(v.task);
    if (!v.text) return "Enter the step.";
    if (!t) return "Choose a task.";
    t.steps.push({ id: uid(), text: v.text.slice(0, 300), done: false, launch: !!launchItem }); syncFromSteps(t); changed();
    return { msg: "Step added to " + dispProject(t) + (launchItem ? " and the launch checklist." : ".") };
  }, launchItem ? "The step lives in a task and also shows on this project's launch checklist." : "");
  var projSel = $("f-project"), taskSel = $("f-task");
  if (projSel && taskSel) {
    on(projSel, "change", function () {
      var opts = taskOptions(projSel.value);
      taskSel.innerHTML = "";
      opts.forEach(function (o) { taskSel.appendChild(el("option", { value: o.value }, o.label)); });
    });
  }
}
// With a milestone passed in, edits it in place and offers Remove (onRemove is
// supplied by the caller, since removal lives in views.js); with none, adds one.
export function milestoneDialog(m, onRemove) {
  var projOpts = activeProjects().map(function (p) { return { value: p.id, label: p.name }; });
  // A milestone can belong to a project that is no longer Active (Complete, say).
  if (m) { var cur = findProject(m.projectId); if (cur && !projOpts.some(function (o) { return o.value === cur.id; })) projOpts.unshift({ value: cur.id, label: cur.name }); }
  if (!projOpts.length) { notify("Add an active project first."); return; }
  formDialog(m ? "Edit milestone" : "New milestone", [
    { key: "project", label: "Project", type: "select", options: projOpts, value: m ? m.projectId : projOpts[0].value },
    { key: "text", label: "Milestone", value: m ? m.text : undefined },
    { key: "date", label: "Date", type: "date", value: m ? m.date : undefined }
  ], m ? "Save milestone" : "Add milestone", function (v) {
    if (!v.project || !v.text || !isISO(v.date)) return "Choose a project, and enter a milestone and a date.";
    if (m) { m.projectId = v.project; m.text = v.text.slice(0, 200); m.date = v.date; changed(); return { msg: "Milestone saved." }; }
    state.milestones.push({ id: uid(), text: v.text.slice(0, 200), date: v.date, projectId: v.project }); changed();
    return { msg: "Milestone added to the Timeline." };
  }, undefined, m && onRemove ? { label: "Remove", title: "Remove this milestone (can be undone)", onClick: onRemove } : undefined);
}
export function slipDialog() {
  openModal("Slip the schedule", function (body) {
    body.appendChild(el("p", { "class": "hint first" }, "This moves start dates later, so the dates that follow them move too."));
    var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": "slipDays" }, "Days to slip (1 to 90)"));
    var inp = el("input", { type: "number", id: "slipDays", min: "1", max: "90", step: "1" }); inp.value = "7"; w.appendChild(inp); body.appendChild(w);
    var tw = el("div", { "class": "field" }); tw.appendChild(el("label", { "for": "slipWhat" }, "What to slip"));
    var sel = el("select", { id: "slipWhat", "class": "plain" }); sel.appendChild(el("option", { value: "" }, "Everything"));
    var seen = {}; ordered().forEach(function (t) { if (!t.isNext && !seen[t.projectId]) { seen[t.projectId] = 1; sel.appendChild(el("option", { value: t.projectId }, "Only " + dispProject(t))); } });
    tw.appendChild(sel); body.appendChild(tw);
    var err = el("p", { "class": "msg", role: "alert" }); body.appendChild(err);
    var acts = el("div", { "class": "actions", style: "margin-top:6px" });
    acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "slipGo", title: "Push dates later" }, "Push dates later"), "click", function () {
      var n = parseInt(inp.value, 10), target = sel.value;
      if (isNaN(n) || n < 1 || n > 90) { err.textContent = "Enter a number of days from 1 to 90."; return; }
      // Snapshot every project's own start/days (for undo) -- a project record
      // is the source of truth now, not a separate state.pset dictionary.
      var projSnap = {}; state.projects.forEach(function (p) { projSnap[p.id] = { start: p.start, days: p.days }; });
      var snap = { start: state.start, projects: projSnap };
      var targetName = target ? dispProject({ projectId: target }) : "";
      if (target === "") {
        state.start = iso(addDays(parseISO(state.start), n));
        state.projects.forEach(function (p) { if (p.start) p.start = iso(addDays(parseISO(p.start), n)); });
      } else {
        var eff = pset(target), p2 = findProject(target);
        if (p2) { p2.start = iso(addDays(parseISO(eff.start), n)); p2.days = eff.days; }
      }
      state.lastSlip = { days: n, snap: snap };
      changed(); closeModal();
      notify((target === "" ? "Everything" : targetName) + " moved back " + n + (n === 1 ? " day" : " days") + ".");
    }));
    if (state.lastSlip) acts.appendChild(on(el("button", { type: "button", id: "slipUndo", title: "Reverse the last slip" }, "Undo last slip (" + state.lastSlip.days + " days)"), "click", function () {
      state.start = state.lastSlip.snap.start;
      Object.keys(state.lastSlip.snap.projects).forEach(function (pid) {
        var p = findProject(pid), snapped = state.lastSlip.snap.projects[pid];
        if (p && snapped) { if (snapped.start) p.start = snapped.start; if (snapped.days) p.days = snapped.days; }
      });
      state.lastSlip = null; changed(); closeModal();
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
