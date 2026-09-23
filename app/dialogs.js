import { state, ui, changed, isISO, cleanPset, task } from "./state.js";
import { iso, addDays, parseISO, fmt } from "./dates.js";
import {
  wd, wpC, counted, liveCands, dispProject, nextTask, findTask,
  orderedAll, taskOptions, stepOptions, syncFromSteps, projectNames, ordered,
  pset, blockStartFor, blockEndFor
} from "./model.js";
import { $, el, on, uid, notify } from "./dom.js";
import { launchNote, closeMenus } from "./app.js";

/* modal */
export var modalReturn = null;
export function openModal(title, build) {
  modalReturn = document.activeElement;
  $("modalTitle").textContent = title;
  var body = $("modalBody"); body.innerHTML = "";
  build(body);
  $("overlay").hidden = false;
  var first = body.querySelector("input, textarea, select, button");
  if (first) first.focus();
}
export function closeModal() {
  $("overlay").hidden = true; $("modalBody").innerHTML = "";
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

export function formDialog(title, fields, submitLabel, onSubmit, intro) {
  openModal(title, function (body) {
    if (intro) body.appendChild(el("p", { "class": "hint first" }, intro));
    var inputs = {};
    fields.forEach(function (f) {
      var w = el("div", { "class": "field" }); var id = "f-" + f.key;
      w.appendChild(el("label", { "for": id }, f.label));
      var inp;
      if (f.type === "select") {
        inp = el("select", { id: id, "class": "plain" });
        (f.options || []).forEach(function (o) { inp.appendChild(el("option", { value: o.value }, o.label)); });
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
    var ok = el("button", { type: "button", "class": "primary" }, submitLabel), cancel = el("button", { type: "button" }, "Cancel");
    function submit() {
      var vals = {}; Object.keys(inputs).forEach(function (k) { vals[k] = inputs[k].value.trim(); });
      var res = onSubmit(vals);
      if (typeof res === "string") { err.textContent = res; return; }
      closeModal(); if (res && res.msg) notify(res.msg);
    }
    on(ok, "click", submit); on(cancel, "click", closeModal);
    on(body, "keydown", function (e) { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); submit(); } });
    acts.appendChild(ok); acts.appendChild(cancel); body.appendChild(acts);
  });
}

export function taskDialog(prefill, backlog) {
  var names = {}; counted().forEach(function (t) { var n = dispProject(t); if (n !== "Next project") names[n] = 1; });
  liveCands().forEach(function (c) { names[c.name] = 1; });
  var dl = $("projectNames"); if (dl) dl.remove();
  dl = el("datalist", { id: "projectNames" }); Object.keys(names).forEach(function (n) { dl.appendChild(el("option", { value: n })); }); document.body.appendChild(dl);
  var nt = nextTask();
  formDialog(backlog ? "New backlog item" : "New task", [
    { key: "project", label: "Project", list: "projectNames", value: typeof prefill === "string" ? prefill : (nt && !nt.isNext ? nt.project : "") },
    { key: "what", label: "Task" },
    { key: "done", label: "How you'll know it's done (optional)" },
    { key: "block", label: wd() + " number (1 to 12), or leave empty for the Backlog", type: "number", min: 1, max: 12, step: 1, placeholder: "Backlog", value: backlog ? "" : (nt ? nt.block : 4) }
  ], backlog ? "Add to Backlog" : "Add task", function (v) {
    var blk = v.block === "" ? 0 : Number(v.block);
    if (!v.project || !v.what) return "Enter a project and what you do.";
    if (v.block !== "" && (!Number.isInteger(blk) || blk < 1 || blk > 12)) return wd() + " number must be from 1 to 12, or empty for the Backlog.";
    var t = task("c" + uid(), blk, v.project.slice(0, 120), v.what.slice(0, 400), v.done.slice(0, 200) || "It's finished", [], { custom: true });
    state.tasks.push(t); ui.sel = t.id; changed();
    return { msg: blk === 0 ? "Task added to the Backlog." : "Task added to " + wd() + " " + blk + " (" + fmt(blockStartFor(v.project, blk)) + " to " + fmt(blockEndFor(v.project, blk)) + ")." };
  }, wpC() + " set the dates. " + wd() + " 1 starts on the project's start date. Leave it empty to put the task in the Backlog.");
}
export function projectDialog() {
  formDialog("New project", [{ key: "name", label: "Project name" }, { key: "note", label: "Short note (optional)" }], "Add project", function (v) {
    if (!v.name) return "Enter a project name.";
    state.candidates.push({ id: uid(), name: v.name.slice(0, 120), note: v.note.slice(0, 300), start: "", months: "" }); changed();
    return { msg: v.name + " added as a candidate for the next slot." };
  }, "It joins the candidates for the next slot. You can park it later.");
}
export function ideaDialog() {
  formDialog("New idea", [{ key: "text", label: "Idea" }, { key: "note", label: "Note (optional)" }], "Add to parking lot", function (v) {
    if (!v.text) return "Enter the idea.";
    state.parked.push({ id: uid(), text: v.text.slice(0, 200), note: v.note.slice(0, 300) }); changed();
    return { msg: "Added to the parking lot." };
  });
}
export function decisionDialog() {
  formDialog("New decision", [
    { key: "q", label: "Decision" },
    { key: "step", label: "Link to a step (optional)", type: "select", options: stepOptions(), value: "" }
  ], "Add decision", function (v) {
    if (!v.q) return "Enter the decision.";
    state.decisions.push({ id: uid(), q: v.q.slice(0, 300), a: "", step: v.step }); changed();
    return { msg: "Decision added on the Launch page." };
  }, "A decision is something you need to figure out before you can move forward. Optionally link it to a step so answering it automatically checks that step off.");
}
export function stepDialog(kofi) {
  if (!orderedAll().length) { notify("Add a task first."); return; }
  var selTask = ui.sel && findTask(ui.sel);
  var pick = selTask ? selTask.id : (nextTask() || orderedAll()[0]).id;
  var startProject = selTask ? dispProject(selTask) : "";
  var projOpts = [{ value: "", label: "All projects" }].concat(projectNames().map(function (n) { return { value: n, label: n }; }));
  formDialog(kofi ? "New launch item" : "New step", [
    { key: "project", label: "Project", type: "select", options: projOpts, value: startProject },
    { key: "task", label: "Task", type: "select", options: taskOptions(startProject), value: pick },
    { key: "text", label: kofi ? "What needs doing before you launch?" : "Step" }
  ], "Add step", function (v) {
    var t = findTask(v.task);
    if (!v.text) return "Enter the step.";
    if (!t) return "Choose a task.";
    t.steps.push({ id: uid(), text: v.text.slice(0, 300), done: false, kofi: !!kofi }); syncFromSteps(t); changed();
    return { msg: "Step added to " + dispProject(t) + (kofi ? " and the launch checklist." : ".") };
  }, kofi ? "The step lives in a task and also shows on the launch checklist." : "");
  var projSel = $("f-project"), taskSel = $("f-task");
  if (projSel && taskSel) {
    on(projSel, "change", function () {
      var opts = taskOptions(projSel.value);
      taskSel.innerHTML = "";
      opts.forEach(function (o) { taskSel.appendChild(el("option", { value: o.value }, o.label)); });
    });
  }
}
export function milestoneDialog() {
  formDialog("New milestone", [{ key: "text", label: "Milestone" }, { key: "date", label: "Date", type: "date" }], "Add milestone", function (v) {
    if (!v.text || !isISO(v.date)) return "Enter a milestone and a date.";
    state.milestones.push({ id: uid(), text: v.text.slice(0, 200), date: v.date }); changed();
    return { msg: "Milestone added to the Timeline." };
  });
}
export function slipDialog() {
  openModal("Slip the schedule", function (body) {
    body.appendChild(el("p", { "class": "hint first" }, "This moves start dates later, so the dates that follow them move too." + launchNote("currently ")));
    var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": "slipDays" }, "Days to slip (1 to 90)"));
    var inp = el("input", { type: "number", id: "slipDays", min: "1", max: "90", step: "1" }); inp.value = "7"; w.appendChild(inp); body.appendChild(w);
    var tw = el("div", { "class": "field" }); tw.appendChild(el("label", { "for": "slipWhat" }, "What to slip"));
    var sel = el("select", { id: "slipWhat", "class": "plain" }); sel.appendChild(el("option", { value: "" }, "Everything"));
    var seen = {}; ordered().forEach(function (t) { if (!t.isNext && !seen[t.project]) { seen[t.project] = 1; sel.appendChild(el("option", { value: t.project }, "Only " + t.project)); } });
    tw.appendChild(sel); body.appendChild(tw);
    var err = el("p", { "class": "msg", role: "alert" }); body.appendChild(err);
    var acts = el("div", { "class": "actions", style: "margin-top:6px" });
    acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "slipGo" }, "Slip schedule"), "click", function () {
      var n = parseInt(inp.value, 10), target = sel.value;
      if (isNaN(n) || n < 1 || n > 90) { err.textContent = "Enter a number of days from 1 to 90."; return; }
      var snap = { start: state.start, pset: JSON.parse(JSON.stringify(state.pset)) };
      if (target === "") {
        state.start = iso(addDays(parseISO(state.start), n));
        Object.keys(state.pset).forEach(function (k) { if (state.pset[k].start) state.pset[k].start = iso(addDays(parseISO(state.pset[k].start), n)); });
      } else {
        var eff = pset(target); state.pset[target] = { start: iso(addDays(parseISO(eff.start), n)), mult: eff.mult };
      }
      state.lastSlip = { days: n, snap: snap };
      changed(); closeModal();
      notify((target === "" ? "Everything" : target) + " moved back " + n + (n === 1 ? " day" : " days") + "." + launchNote("now "));
    }));
    if (state.lastSlip) acts.appendChild(on(el("button", { type: "button", id: "slipUndo" }, "Undo last slip (" + state.lastSlip.days + " days)"), "click", function () {
      state.start = state.lastSlip.snap.start; state.pset = cleanPset(state.lastSlip.snap.pset); state.lastSlip = null; changed(); closeModal();
      notify("Slip undone." + launchNote(""));
    }));
    acts.appendChild(on(el("button", { type: "button" }, "Cancel"), "click", closeModal));
    body.appendChild(acts);
  });
}

export function confirmDialog(title, text, label, onConfirm) {
  openModal(title, function (body) {
    body.appendChild(el("p", { "class": "first" }, text));
    var acts = el("div", { "class": "actions" });
    var no = el("button", { type: "button" }, "Cancel"), yes = el("button", { type: "button", "class": "dangerfill", id: "confirmYes" }, label);
    on(no, "click", closeModal); on(yes, "click", function () { closeModal(); onConfirm(); });
    acts.appendChild(no); acts.appendChild(yes); body.appendChild(acts);
  });
}
