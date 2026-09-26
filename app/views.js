import { state, ui, save, changed, autoArchive, STATUSES, APP_NAME, APP_VERSION, isISO, defaults, setState, normalize, project as makeProject } from "./state.js";
import { DAY, iso, parseISO, TODAY, fmt, fmtY } from "./dates.js";
import {
  WORDS, wd, wl, pset, blockStartFor, blockEndFor, projKey, taskStart, taskEnd,
  checkpoints, live, counted, liveProjects, activeProjects, candidateProjects, completeProjects,
  findProject, findAnyProject, linkedProjects, linkProjects, unlinkProjects, chosen, dispProject, dispWhat,
  totalUnits, remainingUnits, planned, ordered, backlogTasks,
  isLate, lateTasks, setStatus, syncFromSteps, nextTask, projectTasksAllDone,
  validPage, isPinned, pinPage, unpinPage, projectMeta,
  findStep, decisionFor, short, launchItems, stepOptions, taskOptions, findTask
} from "./model.js";
import { $, el, on, uid, setFocusKey, notify, scrollTop } from "./dom.js";
import { drawChart, rangeBlock } from "./chart.js";
import { openTask, go, renderView, renderAll, renderChrome, applyTheme } from "./app.js";
import { stepDialog, decisionDialog, ideaDialog, milestoneDialog, slipDialog, taskDialog, confirmDialog, openModal, closeModal } from "./dialogs.js";

/* views */
export function nextUpPanel() {
  var box = el("div", { "class": "panel" });
  var t = nextTask();
  if (!t) {
    var nb = backlogTasks().length;
    box.appendChild(el("p", { "class": "ptitle" }, nb ? "Nothing is scheduled." : (counted().length ? "Every task is done." : "No tasks yet.")));
    box.appendChild(el("p", { "class": "pmeta" }, nb ? nb + (nb === 1 ? " item is" : " items are") + " waiting in the Backlog. Choose a " + wl() + " for one." : (counted().length ? "Add a task with the + button, or choose your next project." : "Add one with the + button.")));
    if (nb) { var ba = el("div", { "class": "actions" }); ba.appendChild(on(el("button", { type: "button", "class": "primary", title: "Go to the Backlog on the Tasks page" }, "Open the Backlog"), "click", function () { go("schedule"); })); box.appendChild(ba); }
    return box;
  }
  box.appendChild(el("p", { "class": "ptitle" }, dispWhat(t)));
  var meta = el("p", { "class": "pmeta" });
  var pname = dispProject(t);
  if (!t.isNext && validPage("proj:" + t.projectId)) {
    var pl = el("button", { type: "button", "class": "textbtn plink", title: "View this project" }, pname);
    on(pl, "click", function () { go("proj:" + t.projectId); });
    meta.appendChild(pl);
  } else meta.appendChild(el("b", null, pname));
  meta.appendChild(document.createTextNode(" · " + fmt(taskStart(t)) + " to " + fmt(taskEnd(t)) + " "));
  if (isLate(t)) meta.appendChild(el("span", { "class": "badge" }, "Overdue"));
  box.appendChild(meta);
  if (!(t.isNext && !chosen())) box.appendChild(el("p", { "class": "pline" }, "Done when: " + t.done));
  var open = t.steps.filter(function (s) { return !s.done; })[0];
  if (open && t.steps.length) box.appendChild(el("p", { "class": "pline" }, "Next step: " + open.text));
  var acts = el("div", { "class": "actions" });
  if (t.isNext && !chosen()) {
    acts.appendChild(on(el("button", { type: "button", "class": "primary", title: "Go to Projects to choose a candidate" }, "Choose the next project"), "click", function () { go("projects"); }));
  } else {
    if (t.status === "Not started") acts.appendChild(on(el("button", { type: "button", "class": "primary", title: "Mark in progress" }, "Start"), "click", function () { t.status = "In progress"; changed(); }));
  }
  acts.appendChild(on(el("button", { type: "button", title: "View this task" }, "Open task"), "click", function () { openTask(t.id); }));
  box.appendChild(acts);
  return box;
}
export function pgrid() {
  var g = el("div", { "class": "pgrid" });
  g.put = function (node, col, row) { node.className = (node.className ? node.className + " " : "") + (col === 1 ? "cl" : "cr") + " r" + row; g.appendChild(node); return node; };
  return g;
}
export function overduePanel() {
  var late = lateTasks();
  var box = el("div", { "class": "box" });
  if (!late.length) { box.appendChild(el("p", { "class": "hint first" }, "Nothing is overdue.")); return box; }
  box.appendChild(el("h2", null, late.length + (late.length === 1 ? " task is overdue" : " tasks are overdue")));
  var ul = el("ul", { "class": "tlist", style: "margin-top:8px" });
  late.forEach(function (t) {
    var li = el("li"); var b = el("button", { type: "button", "class": "item", title: "View this task" });
    b.appendChild(el("div", { "class": "l1" }, dispProject(t) + " · ended " + fmt(taskEnd(t))));
    b.appendChild(el("div", { "class": "l2" }, dispWhat(t)));
    on(b, "click", function () { openTask(t.id); }); li.appendChild(b); ul.appendChild(li);
  });
  box.appendChild(ul);
  box.appendChild(on(el("button", { type: "button", "class": "textbtn", style: "margin-top:10px", title: "Push every date later to catch up" }, "Running behind? Slip the schedule"), "click", function () { slipDialog(); }));
  return box;
}
export function currentCheckpointIndex() {
  var cps = checkpoints(), idx = 0;
  cps.forEach(function (ms, i) { if (ms <= TODAY) idx = i; });
  return idx;
}
export function recordCurrentWeek() { state.actual[currentCheckpointIndex()] = remainingUnits(); }
// Runs on every changed() call (same choke point as recordCurrentWeek), so
// any task-status edit anywhere in the app is caught without patching each
// call site individually. Only the auto-trigger lives here -- the manual
// "Mark complete" button (renderProjectPage) sets status directly and calls
// completionDialog itself, since it isn't gated on task state at all (see
// DESIGN.md: both paths are equal, neither is secondary).
export function sweepProjectCompletion() {
  activeProjects().forEach(function (p) {
    if (projectTasksAllDone(p)) { p.status = "complete"; completionDialog(p); }
  });
}
// A project is Launch Critical to whoever links to it (a property of the
// project itself, not of one specific link -- confirmed 2026-09-24). "Not yet
// done" reads from the linked project's own status: complete/archived count
// as done, anything else (active/candidate) does not.
export function incompleteLaunchCriticalLinks(p) {
  return linkedProjects(p).filter(function (lp) { return lp.launchCritical && lp.status !== "complete" && lp.status !== "archived" && !lp.arch; });
}
// Shared by the manual "Mark complete" button and the auto-trigger sweep, and
// itself shares the same task-archive cascade as the plain Archive button.
export function archiveProject(p) {
  removeToArchive(p, "Project", function () {
    state.tasks.forEach(function (t) { if (t.projectId === p.id && !t.arch) t.arch = { at: iso(TODAY), why: "removed" }; });
  });
}
// Fires the moment a project becomes Complete, however it got there (manual
// button or all-tasks-done auto-trigger) -- offers archiving now or leaving
// it in Projects. Soft-gate only: an incomplete Launch-critical link shows a
// warning line but never removes either choice (confirmed 2026-09-24).
export function completionDialog(p) {
  var warn = incompleteLaunchCriticalLinks(p);
  openModal("Project complete", function (body) {
    body.appendChild(el("p", { "class": "first" }, "“" + p.name + "” is marked complete. Archive it now, or leave it in Projects."));
    if (warn.length) body.appendChild(el("p", { "class": "hint" }, "Launch-critical linked " + (warn.length === 1 ? "project isn’t" : "projects aren’t") + " finished yet: " + warn.map(function (lp) { return lp.name; }).join(", ") + "."));
    var acts = el("div", { "class": "actions" });
    var leave = el("button", { type: "button", title: "Keep visible on Projects" }, "Leave in Projects");
    var arch = el("button", { type: "button", "class": "dangerfill", title: "Archive right now" }, "Archive now");
    on(leave, "click", closeModal);
    on(arch, "click", function () { closeModal(); archiveProject(p); });
    acts.appendChild(leave); acts.appendChild(arch); body.appendChild(acts);
  });
}
export function burnParts(o) {
  o = o || {};
  var h = el(o.level || "h2", null, "Burndown");
  var cb = el("div", { "class": "chartbox" }); var host = el("div"); cb.appendChild(host);
  var lg = el("div", { "class": "legend" });
  var l1 = el("span"); l1.appendChild(el("i", { "class": "p" })); l1.appendChild(document.createTextNode("Planned"));
  var l2 = el("span"); l2.appendChild(el("i")); l2.appendChild(document.createTextNode("Actual"));
  lg.appendChild(l1); lg.appendChild(l2); cb.appendChild(lg);
  drawChart(host, o.wide);
  var rn = remainingUnits(), rb = el("div", { "class": "box" }), nbk = backlogTasks().length;
  rb.appendChild(el("p", { "class": "hint first remaining" }, rn + (rn === 1 ? " item" : " items") + " remaining, out of " + totalUnits() + (nbk ? ". " + nbk + (nbk === 1 ? " backlog item is" : " backlog items are") + " not counted until scheduled." : "")));
  return { h: h, chart: cb, count: rb };
}
export function burnPanel(o) {
  var box = el("div"), b = burnParts(o);
  b.count.style.marginTop = "12px";
  box.appendChild(b.h); box.appendChild(b.chart); box.appendChild(b.count);
  return box;
}
export function welcomeBox() {
  var box = el("div", { "class": "box", style: "margin-bottom:22px" });
  box.appendChild(el("h2", { style: "margin-bottom:4px" }, "Welcome to Sidequest"));
  box.appendChild(el("p", { "class": "hint first" }, "The projects here are samples, so you can see how everything fits together. Look around, change things, and press / to search. When you are ready to start your own, open Settings and choose Start fresh."));
  var acts = el("div", { "class": "actions" });
  acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "welcomeSettings", title: "Go to Settings" }, "Go to Settings"), "click", function () { go("settings"); }));
  acts.appendChild(on(el("button", { type: "button", id: "welcomeDismiss", title: "Hide this welcome message" }, "Dismiss"), "click", function () { state.settings.hideWelcome = true; save(); renderView(); }));
  box.appendChild(acts);
  return box;
}
export function renderToday(root) {
  if (!state.settings.hideWelcome) root.appendChild(welcomeBox());
  var g = pgrid(), b = burnParts({});
  g.put(el("h2", null, "Next up"), 1, 1); g.put(nextUpPanel(), 1, 2); g.put(overduePanel(), 1, 3);
  g.put(b.h, 2, 1); g.put(b.chart, 2, 2); g.put(b.count, 2, 3);
  root.appendChild(g);
}

export function taskRow(t) {
  var li = el("li");
  var b = el("button", { type: "button", "class": "item" + (t.status === "Completed" ? " done" : ""), title: "View this task" });
  if (t.id === ui.sel) b.setAttribute("aria-current", "true");
  var l1 = el("div", { "class": "l1" }); l1.appendChild(el("b", null, dispProject(t)));
  l1.appendChild(document.createTextNode(" · " + (t.block === 0 ? "Backlog" : fmt(taskStart(t)) + " to " + fmt(taskEnd(t)))));
  b.appendChild(l1);
  b.appendChild(el("div", { "class": "l2" }, dispWhat(t)));
  var l3 = el("div", { "class": "l3" });
  l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
  if (t.steps.length) l3.appendChild(el("span", null, t.steps.filter(function (s) { return s.done; }).length + " of " + t.steps.length + " steps"));
  if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
  b.appendChild(l3);
  on(b, "click", function () { ui.sel = t.id; ui.detail = true; renderView(); scrollTop(); });
  li.appendChild(b); return li;
}
export function renderSchedule(root) {
  var o = ordered(), bl = backlogTasks();
  if (!o.length && !bl.length) { root.appendChild(el("p", { "class": "hint first" }, counted().length ? "No open tasks. Completed tasks are in the Archive." : "No tasks yet. Use the + button to add one.")); return; }
  if (!ui.sel || !findTask(ui.sel)) { var nt = nextTask() || o[0] || bl[0]; ui.sel = nt.id; }
  root.appendChild(el("p", { "class": "hint first" + (ui.detail ? " hide-on-mobile" : "") }, "Choose a task to view its steps and notes."));
  var split = el("div", { "class": "split" + (ui.detail ? " detail-open" : "") });
  var lp = el("div", { "class": "listpane" });
  var ul = el("ul", { "class": "tlist" });
  if (!o.length) ul.appendChild(el("li", { "class": "plain" }, "Nothing is scheduled. Choose a " + wl() + " for an item in the Backlog."));
  o.forEach(function (t) { ul.appendChild(taskRow(t)); });
  var c = chosen();
  if (o.length) ul.appendChild(el("li", { "class": "plain" }, "Next: start " + (c ? c.name : "the next project") + "."));
  lp.appendChild(ul);
  if (bl.length) {
    lp.appendChild(el("h2", null, "Backlog (" + bl.length + ")"));
    lp.appendChild(el("p", { "class": "hint" }, "Not scheduled yet. Open an item and choose a " + wl() + " to schedule it."));
    var bul = el("ul", { "class": "tlist", style: "margin-top:10px" });
    bl.forEach(function (t) { bul.appendChild(taskRow(t)); });
    lp.appendChild(bul);
  }
  var dp = el("div", { "class": "detailpane" }); dp.appendChild(buildDetail(findTask(ui.sel)));
  split.appendChild(lp); split.appendChild(dp); root.appendChild(split);
}

export function buildDetail(t) {
  var box = el("div", { "class": "detail" });
  box.appendChild(on(el("button", { type: "button", "class": "small only-mobile", style: "margin-bottom:10px", title: "Back to the task list" }, "All tasks"), "click", function () { ui.detail = false; renderView(); scrollTop(); }));
  var top = el("div", { style: "display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap" });
  var lh = el("div");
  lh.appendChild(el("h2", { style: "margin:0" }, dispProject(t)));
  var dm = el("p", { "class": "dmeta" }, (t.block === 0 ? "Backlog" : fmt(taskStart(t)) + " to " + fmt(taskEnd(t))) + " ");
  if (isLate(t)) dm.appendChild(el("span", { "class": "badge" }, "Overdue"));
  lh.appendChild(dm); top.appendChild(lh);
  var sel = el("select", { "class": "status", "aria-label": "Status" });
  STATUSES.forEach(function (s) { var o = el("option", { value: s }, s); if (s === t.status) o.selected = true; sel.appendChild(o); });
  sel.setAttribute("data-v", t.status);
  on(sel, "change", function () { setStatus(t, sel.value); changed(); });
  top.appendChild(sel); box.appendChild(top);
  box.appendChild(el("p", { "class": "what" }, dispWhat(t)));
  if (!(t.isNext && chosen())) box.appendChild(el("p", { "class": "dmeta" }, "Done when: " + t.done));
  if (!t.isNext) {
    var bw = el("div", { "class": "field", style: "max-width:24rem" }); bw.appendChild(el("label", { "for": "task-block" }, wd()));
    var bs = el("select", { id: "task-block", "class": "plain" });
    bs.appendChild(el("option", { value: "0" }, "Backlog (not scheduled)"));
    for (var bi = 1; bi <= 12; bi++) bs.appendChild(el("option", { value: String(bi) }, wd() + " " + bi + " (" + fmt(blockStartFor(projKey(t), bi)) + " to " + fmt(blockEndFor(projKey(t), bi)) + ")"));
    bs.value = String(t.block);
    on(bs, "change", function () { var v = parseInt(bs.value, 10); t.block = v; changed(); notify(v === 0 ? "Moved to the Backlog." : "Moved to " + wd() + " " + v + "."); });
    bw.appendChild(bs); box.appendChild(bw);
  }

  var nDone = t.steps.filter(function (s) { return s.done; }).length;
  box.appendChild(el("h3", null, t.steps.length ? "Steps (" + nDone + " of " + t.steps.length + " done)" : "Steps"));
  if (!t.steps.length) box.appendChild(el("p", { "class": "hint" }, "No steps yet. This task counts as one item in the burndown. Add steps to break it up."));
  if (t.steps.length) box.appendChild(el("p", { "class": "hint" }, "Add to Launch puts a step on the Launch checklist. It stays one step, so nothing is counted twice."));
  var ul = el("ul", { "class": "steps" });
  t.steps.forEach(function (s) {
    var sli = el("li", { "class": s.done ? "done" : "" });
    var lab = el("label"); var cb = el("input", { type: "checkbox" }); cb.checked = s.done;
    on(cb, "change", function () { s.done = cb.checked; syncFromSteps(t); changed(); });
    lab.appendChild(cb); lab.appendChild(el("span", null, s.text)); sli.appendChild(lab);
    var ac = el("div", { "class": "li-actions" });
    var dc = decisionFor(s.id);
    if (dc) ac.appendChild(on(el("button", { type: "button", "class": "small", "aria-label": "Open the linked decision", title: "Go to the linked decision on the project page" }, dc.a ? "Decision: decided" : "Decision: open"), "click", function () { go("proj:" + t.projectId); }));
    var kb = el("button", { type: "button", "class": "small" + (s.launch ? " on" : ""), "aria-pressed": s.launch ? "true" : "false", "aria-label": "Show on the launch checklist: " + s.text, title: (s.launch ? "Remove from" : "Add to") + " the launch checklist" }, s.launch ? "Cut from Launch" : "Add to Launch");
    on(kb, "click", function () { s.launch = !s.launch; changed(); });
    ac.appendChild(kb);
    var rm = el("button", { type: "button", "class": "small danger", "aria-label": "Remove step: " + s.text, title: "Remove this step" }, "Remove");
    on(rm, "click", function () { t.steps = t.steps.filter(function (x) { return x.id !== s.id; }); syncFromSteps(t); changed(); });
    ac.appendChild(rm); sli.appendChild(ac); ul.appendChild(sli);
  });
  box.appendChild(ul);
  var add = el("div", { "class": "inline" });
  var inp = el("input", { type: "text", placeholder: "Add a step", "aria-label": "New step", "data-focus": "step-" + t.id, autocomplete: "off" });
  var addBtn = el("button", { type: "button", "class": "small", title: "Add a step to this task" }, "Add step");
  function addStep() {
    var v = inp.value.trim(); if (!v) return;
    t.steps.push({ id: uid(), text: v.slice(0, 300), done: false });
    syncFromSteps(t); setFocusKey("step-" + t.id); changed();
  }
  on(addBtn, "click", addStep);
  on(inp, "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addStep(); } });
  add.appendChild(inp); add.appendChild(addBtn); box.appendChild(add);
  box.appendChild(el("h3", null, "Notes"));
  var ta = el("textarea", { "aria-label": "Notes", style: "margin-top:8px" }); ta.value = t.notes;
  on(ta, "input", function () { t.notes = ta.value.slice(0, 5000); save(); });
  box.appendChild(ta);
  if (!t.isNext) {
    var ar = el("div", { "class": "actions", style: "margin-top:14px" });
    ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Delete this task (can be undone)" }, "Delete"), "click", function () { ui.detail = false; removeNow(t, "tasks", "Task"); }));
    box.appendChild(ar);
  }
  return box;
}

// Bidirectional link between two independent projects -- NOT a subtask
// hierarchy (see DESIGN.md: "linking related projects, not nesting them").
// Rendering is capped at one hop even though the data model allows arbitrary
// depth/cycles: this section only ever lists p's own direct links.
export function linksSection(root, p) {
  var readOnly = !!p.arch;
  var links = linkedProjects(p);
  var ul = el("ul", { "class": "list" });
  if (!links.length) ul.appendChild(el("li", { "class": "hint" }, "No linked projects."));
  links.forEach(function (lp) {
    var li = el("li"), row = el("div", { "class": "crow oneline" });
    var nm = el("button", { type: "button", "class": "textbtn plink", title: "View this project" }, lp.name);
    on(nm, "click", function () { go("proj:" + lp.id); });
    row.appendChild(nm);
    if (lp.launchCritical) row.appendChild(el("span", { "class": "chip" }, "Launch critical"));
    if (!readOnly) {
      var acts = el("div", { "class": "li-actions" });
      // Launch Critical is a property of the linked project itself, not of
      // this one relationship -- toggling it here flips lp's own record,
      // visible the same way from either side of the (bidirectional) link.
      var lc = el("button", { type: "button", "class": "small" + (lp.launchCritical ? " on" : ""), "aria-pressed": lp.launchCritical ? "true" : "false", title: (lp.launchCritical ? "Unmark as" : "Mark as") + " launch critical" }, lp.launchCritical ? "Unmark launch critical" : "Mark launch critical");
      on(lc, "click", function () { lp.launchCritical = !lp.launchCritical; changed(); });
      acts.appendChild(lc);
      var rm = el("button", { type: "button", "class": "small danger", title: "Remove this link" }, "Unlink");
      on(rm, "click", function () { unlinkProjects(p.id, lp.id); changed(); });
      acts.appendChild(rm); row.appendChild(acts);
    }
    li.appendChild(row); ul.appendChild(li);
  });
  root.appendChild(ul);
  if (readOnly) return;
  var candidates = liveProjects().filter(function (x) { return x.id !== p.id && p.linkedProjectIds.indexOf(x.id) < 0; });
  if (candidates.length) {
    var addRow = el("div", { "class": "inline", style: "margin-top:10px" });
    var sel = el("select", { id: "proj-link-pick", "class": "plain", "aria-label": "Project to link" });
    candidates.forEach(function (x) { sel.appendChild(el("option", { value: x.id }, x.name)); });
    addRow.appendChild(sel);
    addRow.appendChild(on(el("button", { type: "button", "class": "small", title: "Link the selected project" }, "Link project"), "click", function () { linkProjects(p.id, sel.value); changed(); }));
    root.appendChild(addRow);
  }
}

// Launch-critical items and Decisions render as sections on a project's own
// page, scoped to that project's tasks -- no separate standalone Launch page
// exists anymore (see DESIGN.md: only Projects are pinnable).
export function launchSection(root, p) {
  var readOnly = !!p.arch;
  var g = pgrid();
  var ha = el("div", { "class": "sechead" }); ha.appendChild(el("h3", { id: "h-checks" }, "Before you launch"));
  if (!readOnly) ha.appendChild(on(el("button", { type: "button", "class": "small", title: "Add a launch checklist item" }, "Add item"), "click", function () { stepDialog(true, p.id); }));
  g.put(ha, 1, 1);
  g.put(el("p", { "class": "hint" }, "These are steps from this project's tasks. Tick one here or in Tasks and it stays in sync."), 1, 2);
  var prog = el("p", { "class": "progress", role: "status", "aria-live": "polite" });
  var items = launchItems(p.id), rows = {};
  var lcLinks = linkedProjects(p).filter(function (lp) { return lp.launchCritical; });
  function progress() {
    var n = items.filter(function (x) { return x.s.done; }).length + lcLinks.filter(function (lp) { return lp.status === "complete" || lp.status === "archived"; }).length;
    var total = items.length + lcLinks.length;
    prog.textContent = total ? n + " of " + total + " done" : "";
  }
  var ul = el("ul", { "class": "list check", "aria-labelledby": "h-checks" });
  if (!items.length && !lcLinks.length) ul.appendChild(el("li", { "class": "hint" }, "No steps are marked for the launch checklist. Use Launch on a step in Tasks, or add an item."));
  items.forEach(function (x) {
    var li = el("li", { "class": x.s.done ? "done" : "" });
    var label = el("label"); var box = el("input", { type: "checkbox" }); box.checked = x.s.done; box.disabled = readOnly;
    on(box, "change", function () { x.s.done = box.checked; syncFromSteps(x.t); autoArchive(); save(); li.className = box.checked ? "done" : ""; progress(); renderChrome(); });
    label.appendChild(box); label.appendChild(el("span", null, x.s.text)); li.appendChild(label);
    var meta = el("div", { "class": "cnote" });
    if (x.t.arch) meta.appendChild(document.createTextNode(short(dispWhat(x.t), 48) + " (archived)"));
    else meta.appendChild(on(el("button", { type: "button", "class": "textbtn", title: "View this task" }, short(dispWhat(x.t), 48)), "click", function () { openTask(x.t.id); }));
    var dc = decisionFor(x.s.id);
    if (dc) meta.appendChild(document.createTextNode(" · Decision " + (dc.a ? "decided" : "open")));
    li.appendChild(meta);
    rows[x.s.id] = { li: li, box: box }; ul.appendChild(li);
  });
  // Launch-critical linked projects: a read-only line, done-state derived
  // from the linked project's own status -- never a manual checkbox (see
  // DESIGN.md: "auto-derived, never a manual checkbox").
  lcLinks.forEach(function (lp) {
    var done = lp.status === "complete" || lp.status === "archived";
    var li = el("li", { "class": done ? "done" : "" });
    var label = el("label"); var box = el("input", { type: "checkbox" }); box.checked = done; box.disabled = true;
    label.appendChild(box); label.appendChild(el("span", null, lp.name + " (linked project)")); li.appendChild(label);
    var meta = el("div", { "class": "cnote" });
    meta.appendChild(on(el("button", { type: "button", "class": "textbtn", title: "View this project" }, "Launch critical · " + lp.status), "click", function () { go("proj:" + lp.id); }));
    li.appendChild(meta); ul.appendChild(li);
  });
  progress();
  var lb = el("div", { "class": "listbox" }); lb.appendChild(prog); lb.appendChild(ul); g.put(lb, 1, 3);

  var hd = el("div", { "class": "sechead" }); hd.appendChild(el("h3", { id: "h-dec" }, "Decisions"));
  if (!readOnly) hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Add a decision" }, "Add decision"), "click", function () { decisionDialog(p.id); }));
  g.put(hd, 2, 1);
  g.put(el("p", { "class": "hint" }, "Write down the answer once you settle it. Answering a decision ticks its linked step, and clearing the answer unticks it."), 2, 2);
  var dl = el("ul", { "class": "list", "aria-labelledby": "h-dec" });
  var ds = live(state.decisions).filter(function (d) { var ls = findStep(d.step); return ls && ls.t.projectId === p.id; });
  if (!ds.length) dl.appendChild(el("li", { "class": "hint" }, "No open decisions."));
  ds.forEach(function (d) {
    var li = el("li", { "class": "decision" });
    var q = el("div"); q.appendChild(el("span", { "class": "dq" }, d.q));
    var stt = el("span", { "class": "dstate" + (d.a ? " ok" : "") }, d.a ? "Decided" : "Open"); q.appendChild(stt); li.appendChild(q);
    if (readOnly) {
      li.appendChild(el("p", { "class": "hint" }, d.a || "No answer yet."));
      dl.appendChild(li); return;
    }
    var inp = el("input", { type: "text", placeholder: "Your answer", "aria-label": "Answer: " + d.q, autocomplete: "off" }); inp.value = d.a;
    on(inp, "input", function () {
      d.a = inp.value.slice(0, 1000); stt.textContent = d.a ? "Decided" : "Open"; stt.className = "dstate" + (d.a ? " ok" : "");
      var ls = findStep(d.step);
      if (ls) {
        ls.s.done = d.a !== ""; syncFromSteps(ls.t);
        var r = rows[ls.s.id]; if (r) { r.box.checked = ls.s.done; r.li.className = ls.s.done ? "done" : ""; progress(); }
        renderChrome();
      }
      autoArchive(); save();
    });
    li.appendChild(inp);
    var lf = el("div", { "class": "field" }); lf.appendChild(el("label", { "for": "ds-" + d.id }, "Linked step"));
    var sel = el("select", { id: "ds-" + d.id, "class": "plain" });
    stepOptions(p.id).forEach(function (o) { var op = el("option", { value: o.value }, o.label); if (o.value === d.step) op.selected = true; sel.appendChild(op); });
    on(sel, "change", function () { d.step = sel.value; save(); renderView(); });
    lf.appendChild(sel); li.appendChild(lf);
    var rm = el("button", { type: "button", "class": "small danger", style: "margin-top:10px", title: "Remove this decision (can be undone)" }, "Remove");
    on(rm, "click", function () { removeNow(d, "decisions", "Decision"); });
    li.appendChild(rm); dl.appendChild(li);
  });
  g.put(dl, 2, 3); root.appendChild(g);
}

export function pinBar(key) {
  var bar = el("div", { "class": "pinbar" }), pinned = isPinned(key);
  var b = el("button", { type: "button", "class": "small pintoggle" + (pinned ? " on" : ""), "aria-pressed": pinned ? "true" : "false", title: pinned ? "Unpin from the sidebar" : "Pin to the sidebar" }, pinned ? "Unpin" : "Pin");
  on(b, "click", function () { if (pinned) unpinPage(key); else pinPage(key); });
  bar.appendChild(b); return bar;
}
export function pagesSection(excludeIds) {
  var sec = el("div");
  sec.appendChild(el("p", { "class": "hint", style: "margin-top:28px" }, "Pin a project to the sidebar for quick access. Removing it from the sidebar only hides it there. It stays listed here."));
  var ul = el("ul", { "class": "list" });
  var rows = liveProjects().filter(function (p) { return !excludeIds || excludeIds.indexOf(p.id) < 0; }).map(function (p) { return { key: "proj:" + p.id, name: p.name, meta: projectMeta(p), complete: p.status === "complete" }; });
  if (!rows.length) sec.appendChild(el("p", { "class": "hint" }, "No projects yet."));
  rows.forEach(function (r) {
    var li = el("li"), row = el("div", { "class": "crow oneline" });
    var nm = el("div", { style: "flex:1 1 200px" });
    var link = el("button", { type: "button", "class": "textbtn plink", style: "font-weight:600", title: "View this project" }, r.name);
    on(link, "click", function () { go(r.key); });
    nm.appendChild(link);
    if (r.complete) nm.appendChild(el("span", { "class": "chip projcomplete", style: "margin-left:8px" }, "Complete"));
    nm.appendChild(el("p", { "class": "hint", style: "margin-top:2px" }, r.meta));
    row.appendChild(nm);
    var acts = el("div", { "class": "li-actions" }), pinned = isPinned(r.key);
    acts.appendChild(on(el("button", { type: "button", "class": "small pintoggle" + (pinned ? " on" : ""), "aria-pressed": pinned ? "true" : "false", "aria-label": (pinned ? "Unpin " : "Pin ") + r.name, title: pinned ? "Unpin from the sidebar" : "Pin to the sidebar" }, pinned ? "Unpin" : "Pin"), "click", function () { if (pinned) unpinPage(r.key); else pinPage(r.key); }));
    row.appendChild(acts); li.appendChild(row); ul.appendChild(li);
  });
  sec.appendChild(ul); return sec;
}
// A project's own lifecycle status decides how much of the page renders:
// "candidate" (not yet started -- estimate fields and a Promote action) or
// "active" (has its own Tasks/Schedule/Notes/Launch sections). Promotion is
// in-place: the same record and id carry through, never a second record --
// see DESIGN.md's "making Project a first-class entity" section.
export function renderProjectPage(root, id) {
  var p = findProject(id);
  if (!p) { root.appendChild(el("p", { "class": "hint first" }, "Project not found.")); return; }
  var key = "proj:" + p.id, readOnly = !!p.arch;
  root.appendChild(pinBar(key));
  if (!readOnly) {
    // Renaming is safe: tasks, pins, links, and milestones all point at the
    // project's id, never its name. Saves on change (blur/Enter) so the title
    // and sidebar update once, not on every keystroke.
    var nameField = el("div", { "class": "field", style: "margin-top:0" });
    nameField.appendChild(el("label", { "for": "proj-name" }, "Project name"));
    var nameInput = el("input", { type: "text", id: "proj-name", autocomplete: "off", maxlength: "120" }); nameInput.value = p.name;
    on(nameInput, "change", function () {
      var v = nameInput.value.trim();
      if (!v) { nameInput.value = p.name; notify("A project needs a name."); return; }
      if (v !== p.name) { p.name = v.slice(0, 120); changed(); }
    });
    nameField.appendChild(nameInput); root.appendChild(nameField);
  }
  var metaLine = el("p", { "class": "hint" });
  if (p.status === "complete") metaLine.appendChild(el("span", { "class": "chip projcomplete", style: "margin-right:8px" }, "Complete"));
  metaLine.appendChild(document.createTextNode(projectMeta(p)));
  root.appendChild(metaLine);
  if (readOnly) root.appendChild(el("p", { "class": "hint" }, "Archived. Restore it to make changes."));

  if (p.status === "candidate" && readOnly) {
    root.appendChild(el("h2", null, "Notes"));
    root.appendChild(el("p", { "class": "hint notetext" }, p.notes || "No notes."));
    return;
  }
  if (p.status === "candidate") {
    var cb = el("div", { "class": "box", style: "margin-top:16px" });
    var nf = el("div", { "class": "field", style: "margin-top:0" });
    nf.appendChild(el("label", { "for": "cn-" + p.id }, "Notes"));
    var nt = el("textarea", { id: "cn-" + p.id, rows: 6 }); nt.value = p.notes;
    on(nt, "input", function () { p.notes = nt.value.slice(0, 5000); save(); });
    nf.appendChild(nt); cb.appendChild(nf);
    var f = el("div", { "class": "cfields", style: "margin:14px 0 0" });
    var f1 = el("div", { "class": "field" }); f1.appendChild(el("label", { "for": "cs-" + p.id }, "Start date (optional)"));
    var sd = el("input", { type: "date", id: "cs-" + p.id }); sd.value = p.start;
    on(sd, "change", function () { p.start = isISO(sd.value) ? sd.value : ""; cf.disabled = !p.start; if (!p.start) cf.value = ""; save(); notify("Start date saved. See it on the Timeline."); });
    f1.appendChild(sd);
    var f2 = el("div", { "class": "field" }); f2.appendChild(el("label", { "for": "cm-" + p.id }, "Estimated months (optional)"));
    var mo = el("input", { type: "number", id: "cm-" + p.id, min: "1", max: "36", step: "1" }); mo.value = p.months;
    on(mo, "change", function () { var v = parseInt(mo.value, 10); p.months = (v >= 1 && v <= 36) ? v : ""; if (p.months === "") mo.value = ""; if (cf) cf.value = ""; save(); });
    f2.appendChild(mo); f.appendChild(f1); f.appendChild(f2);
    var f3 = el("div", { "class": "field" }); f3.appendChild(el("label", { "for": "cf-" + p.id }, "Or pick a target completion date (optional)"));
    var cf = el("input", p.start ? { type: "date", id: "cf-" + p.id } : { type: "date", id: "cf-" + p.id, disabled: "disabled" });
    on(cf, "change", function () {
      if (!p.start || !isISO(cf.value)) { cf.value = ""; return; }
      var months = Math.round((parseISO(cf.value) - parseISO(p.start)) / (DAY * 30.44));
      if (months < 1 || months > 36) { cf.value = ""; notify("Pick a date between 1 and 36 months from the start date."); return; }
      p.months = months; mo.value = months; save(); notify("Completion date saved as about " + months + (months === 1 ? " month" : " months") + ".");
    });
    f3.appendChild(cf); f.appendChild(f3); cb.appendChild(f);
    var ca = el("div", { "class": "actions", style: "margin-top:10px" });
    ca.appendChild(on(el("button", { type: "button", "class": "primary", title: "Make this the active project" }, "Choose as next project"), "click", function () { promoteToActive(p.id); }));
    cb.appendChild(ca); root.appendChild(cb);
    return;
  }

  var hd = el("div", { "class": "sechead" }); hd.appendChild(el("h2", null, "Tasks"));
  if (!readOnly) hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Add a task" }, "Add task"), "click", function () { taskDialog(p.id); }));
  root.appendChild(hd);
  var ts = ordered().filter(function (t) { return !t.isNext && t.projectId === p.id; }).concat(backlogTasks().filter(function (t) { return t.projectId === p.id; }));
  if (!ts.length) root.appendChild(el("p", { "class": "hint" }, "No tasks yet."));
  else {
    var ul = el("ul", { "class": "tlist" });
    ts.forEach(function (t) {
      var li = el("li"), b = el("button", { type: "button", "class": "item" + (t.status === "Completed" ? " done" : ""), title: "View this task" });
      b.appendChild(el("div", { "class": "l1" }, t.block === 0 ? "Backlog" : fmt(taskStart(t)) + " to " + fmt(taskEnd(t))));
      b.appendChild(el("div", { "class": "l2" }, t.what));
      var l3 = el("div", { "class": "l3" });
      l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
      if (t.steps.length) l3.appendChild(el("span", null, t.steps.filter(function (x) { return x.done; }).length + " of " + t.steps.length + " steps"));
      if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
      b.appendChild(l3); on(b, "click", function () { openTask(t.id); }); li.appendChild(b); ul.appendChild(li);
    });
    root.appendChild(ul);
  }
  root.appendChild(el("h2", null, "Schedule"));
  var eff = pset(p.id);
  if (readOnly) {
    root.appendChild(el("p", { "class": "hint" }, "Started " + (eff.start || "unset") + ", time multiplier " + eff.mult + "."));
  } else {
    root.appendChild(el("p", { "class": "hint" }, "Set this project's own start date and pace."));
    var sg = el("div", { "class": "setgrid" }), smsg = el("p", { "class": "msg", role: "status", "aria-live": "polite" });
    function sfield(id2, label, input) { var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id2 }, label)); w.appendChild(input); sg.appendChild(w); }
    var ps = el("input", { type: "date", id: "proj-start" }); ps.value = eff.start;
    var pm = el("input", { type: "number", id: "proj-mult", min: "0.25", max: "5", step: "0.25" }); pm.value = eff.mult;
    function applyOwn() {
      var sv = ps.value, mv = parseFloat(pm.value);
      if (!isISO(sv)) { ps.value = eff.start; smsg.textContent = "Enter a valid start date."; return; }
      if (isNaN(mv) || mv < 0.25 || mv > 5) { pm.value = eff.mult; smsg.textContent = "The time multiplier must be from 0.25 to 5."; return; }
      p.start = sv; p.mult = mv; changed(); notify(p.name + " schedule saved.");
    }
    on(ps, "change", applyOwn); on(pm, "change", applyOwn);
    sfield("proj-start", "Start date", ps); sfield("proj-mult", "Time multiplier", pm);
    root.appendChild(sg); root.appendChild(smsg);
  }
  root.appendChild(el("h2", null, "Notes"));
  if (readOnly) {
    root.appendChild(el("p", { "class": "hint notetext" }, p.notes || "No notes."));
  } else {
    var ta = el("textarea", { "aria-label": "Notes for " + p.name, style: "margin-top:8px" }); ta.value = p.notes;
    on(ta, "input", function () { p.notes = ta.value.slice(0, 5000); save(); });
    root.appendChild(ta);
  }

  root.appendChild(el("h2", null, "Linked projects"));
  linksSection(root, p);

  root.appendChild(el("h2", null, "Launch"));
  launchSection(root, p);

  var ar = el("div", { "class": "actions", style: "margin-top:14px" });
  if (readOnly) {
    ar.appendChild(on(el("button", { type: "button", "class": "small primary", title: "Bring back to Projects" }, "Restore"), "click", function () { restoreEntry({ kind: "project", list: "projects", item: p }); }));
  } else {
    if (p.status === "active") {
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Mark complete" }, "Mark complete"), "click", function () {
        // Manual path: available any time the project is Active, regardless of
        // task status -- equal in standing to the all-tasks-done auto-trigger,
        // not a fallback for it (confirmed 2026-09-24).
        p.status = "complete"; changed(); completionDialog(p);
      }));
    } else if (p.status === "complete") {
      // No auto-revert exists (a reopened task doesn't undo Complete on its
      // own -- confirmed 2026-09-24), so this is the only way back to Active.
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Reopen this project" }, "Reopen"), "click", function () {
        p.status = "active"; changed(); notify("Reopened.");
      }));
    }
    ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Archive this project" }, "Archive"), "click", function () {
      var warn = incompleteLaunchCriticalLinks(p);
      if (warn.length) notify("Archiving even though " + (warn.length === 1 ? "a launch-critical linked project isn’t" : "launch-critical linked projects aren’t") + " finished: " + warn.map(function (lp) { return lp.name; }).join(", ") + ".");
      archiveProject(p);
    }));
  }
  root.appendChild(ar);
}

// Promotes a candidate to active in place -- same record, same id, only its
// status field changes. Replaces the old separate state.next pointer.
export function promoteToActive(id) {
  var p = findAnyProject(id);
  if (!p) return;
  p.status = "active";
  var t = state.tasks.filter(function (x) { return x.isNext; })[0];
  if (t) t.status = "Completed";
  changed();
}
export function standingBlock(c) {
  var wrap = el("div");
  wrap.appendChild(el("h2", { "class": "first" }, "Where things stand"));
  wrap.appendChild(el("p", { "class": "hint" }, "Built from your open tasks, ordered by when each project's next task starts."));
  var box = el("div", { "class": "box", style: "margin-top:10px" });
  var groups = {}, order = [], listedIds = [];
  ordered().forEach(function (t) {
    if (t.isNext || t.status === "Completed") return;
    var proj = findProject(t.projectId);
    if (proj && proj.status === "complete") return;
    var g = groups[t.projectId]; if (!g) { g = groups[t.projectId] = { projectId: t.projectId, name: dispProject(t), open: 0, first: t }; order.push(g); }
    g.open++;
  });
  order.sort(function (a, b) { return taskStart(a.first) - taskStart(b.first); });
  var ul = el("ul", { "class": "standing" });
  if (!order.length) ul.appendChild(el("li", null, "No open tasks."));
  order.forEach(function (g) {
    listedIds.push(g.projectId);
    var li = el("li"), top = el("div", { "class": "srow" });
    var nm = el("button", { type: "button", "class": "textbtn plink", title: "View this project" }, g.name);
    on(nm, "click", function () { go(validPage("proj:" + g.projectId) ? "proj:" + g.projectId : "projects"); });
    top.appendChild(nm); top.appendChild(el("span", { "class": "scount" }, g.open + " open " + (g.open === 1 ? "task" : "tasks")));
    li.appendChild(top);
    var nx = el("div", { "class": "snext" }); nx.appendChild(document.createTextNode("Next up: "));
    var tl = el("button", { type: "button", "class": "textbtn", title: "View this task" }, short(g.first.what, 90));
    on(tl, "click", function () { openTask(g.first.id); });
    nx.appendChild(tl); nx.appendChild(document.createTextNode(" · " + fmt(taskStart(g.first))));
    li.appendChild(nx); ul.appendChild(li);
  });
  var sl = el("li"), stEl = el("div", { "class": "srow" });
  stEl.appendChild(el("span", { "class": "slabel" }, "Next slot"));
  if (c) { var cl = el("button", { type: "button", "class": "textbtn plink", title: "View this project" }, c.name); on(cl, "click", function () { go("proj:" + c.id); }); stEl.appendChild(cl); }
  else stEl.appendChild(el("span", { "class": "scount" }, "Not chosen yet"));
  sl.appendChild(stEl); ul.appendChild(sl);
  box.appendChild(ul); wrap.appendChild(box);
  return { node: wrap, projectIds: listedIds };
}
export function candidatesSection() {
  var sec = el("div");
  var hd = el("div", { "class": "sechead", style: "margin-top:28px" }); hd.appendChild(el("h2", null, "Candidates")); sec.appendChild(hd);
  sec.appendChild(el("p", { "class": "hint" }, "Choose which project gets the next slot. Use New project in the menu, or make an idea in the Parking lot a candidate."));
  var list = el("ul", { "class": "list" });
  var cs = candidateProjects();
  if (!cs.length) list.appendChild(el("li", { "class": "hint" }, "No candidates. Add a candidate."));
  cs.forEach(function (cd) {
    var li = el("li"), row = el("div", { "class": "crow oneline" });
    var nmWrap = el("div", { style: "flex:1 1 200px" });
    var nm = el("button", { type: "button", "class": "textbtn plink", title: "View this project" }, cd.name);
    on(nm, "click", function () { go("proj:" + cd.id); });
    nmWrap.appendChild(nm);
    if (cd.notes) nmWrap.appendChild(el("p", { "class": "cnote notetext noteclamp", style: "margin-left:0" }, cd.notes));
    row.appendChild(nmWrap);
    var acts = el("div", { "class": "li-actions" });
    acts.appendChild(on(el("button", { type: "button", "class": "small", title: "Move to the Parking lot" }, "Park it"), "click", function () {
      state.projects = state.projects.filter(function (x) { return x.id !== cd.id; });
      state.parked.push({ id: uid(), text: cd.name, note: cd.notes }); changed();
    }));
    var rm = el("button", { type: "button", "class": "small danger", title: "Archive this project" }, "Archive");
    on(rm, "click", function () { removeToArchive(cd, "Project"); });
    acts.appendChild(rm); row.appendChild(acts); li.appendChild(row);
    list.appendChild(li);
  });
  sec.appendChild(list);
  return sec;
}
export function renderProjects(root) {
  var c = chosen();
  var standing = standingBlock(c);
  root.appendChild(standing.node);
  root.appendChild(pagesSection(standing.projectIds));
  root.appendChild(candidatesSection());
}
export function renderParkingLot(root) {
  root.appendChild(el("p", { "class": "hint first" }, "Ideas and waiting items that are not competing for the next slot."));
  var hd = el("div", { "class": "sechead" });
  hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Add new idea" }, "Add idea"), "click", function () { ideaDialog(); })); root.appendChild(hd);
  var pl = el("ul", { "class": "list", style: "margin-top:12px" });
  var ps = live(state.parked);
  if (!ps.length) pl.appendChild(el("li", { "class": "hint" }, "Nothing parked."));
  ps.forEach(function (p) {
    var li = el("li"), row = el("div", { "class": "crow oneline" });
    var nm = el("div", { style: "flex:1 1 200px" });
    var link = el("button", { type: "button", "class": "textbtn plink", style: "font-weight:600", title: "Open this idea" }, p.text);
    on(link, "click", function () { ideaDialog(p); });
    nm.appendChild(link);
    if (p.note) nm.appendChild(el("p", { "class": "hint notetext noteclamp", style: "margin-top:2px" }, p.note));
    row.appendChild(nm);
    var acts = el("div", { "class": "li-actions" });
    acts.appendChild(on(el("button", { type: "button", "class": "small", title: "Make this a candidate project" }, "Make candidate"), "click", function () {
      state.parked = state.parked.filter(function (x) { return x.id !== p.id; });
      state.projects.push(makeProject(uid(), p.text, "candidate", { notes: p.note })); changed();
    }));
    var rm = el("button", { type: "button", "class": "small danger", title: "Archive this idea" }, "Archive");
    on(rm, "click", function () { removeToArchive(p, "Idea"); });
    acts.appendChild(rm); row.appendChild(acts); li.appendChild(row); pl.appendChild(li);
  });
  root.appendChild(pl);
}

export function renderTimeline(root) {
  var r = rangeBlock(); root.appendChild(r.node);
  var hd = el("div", { "class": "sechead" }); hd.appendChild(el("h2", null, "Milestones"));
  hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Add a milestone to the timeline" }, "Add milestone"), "click", function () { milestoneDialog(); })); root.appendChild(hd);
  var mbox = el("div", { "class": "box", style: "margin-top:10px" });
  var ul = el("ul", { "class": "mslist" });
  if (!r.milestones.length) ul.appendChild(el("li", { "class": "hint" }, "No milestones yet. Add one to see it on the timeline."));
  r.milestones.slice().sort(function (a, b) { return a.date - b.date; }).forEach(function (m) {
    var li = el("li"); li.appendChild(el("span", { "class": "d" }, fmtY(m.date))); li.appendChild(el("span", { style: "flex:1 1 auto" }, m.text));
    if (!m.auto) {
      var rm = el("button", { type: "button", "class": "small danger", title: "Remove this milestone (can be undone)" }, "Remove");
      on(rm, "click", function () { var orig = state.milestones.filter(function (x) { return x.id === m.id; })[0]; if (orig) removeNow(orig, "milestones", "Milestone"); });
      li.appendChild(rm);
    }
    ul.appendChild(li);
  });
  mbox.appendChild(ul); root.appendChild(mbox);
  root.appendChild(burnPanel({ wide: true, level: "h2" }));
  root.appendChild(el("h2", null, "Weekly counts"));
  root.appendChild(el("p", { "class": "hint" }, "Enter the number of items left each week to draw your actual line on the burndown."));
  var wrap = el("div", { "class": "tablewrap weekly" }); var table = el("table");
  var thead = el("thead"); var hr = el("tr"); ["Week starting", "Planned remaining", "Actual remaining"].forEach(function (h) { hr.appendChild(el("th", null, h)); }); thead.appendChild(hr); table.appendChild(thead);
  var body = el("tbody"); var tot = totalUnits(), curIdx = currentCheckpointIndex();
  checkpoints().forEach(function (ms, i) {
    var tr = el("tr"); tr.appendChild(el("td", null, fmt(ms))); tr.appendChild(el("td", null, String(planned(ms))));
    var td = el("td");
    if (i === curIdx) {
      // The current week's actual count is kept in sync automatically
      // (recordCurrentWeek(), on every change anywhere in the app) --
      // showing it as an input invites edits that the next change overwrites.
      td.appendChild(el("span", { title: "Kept up to date automatically as you complete tasks" }, String(state.actual[i] !== null ? state.actual[i] : tot)));
    } else {
      var inp = el("input", { type: "number", min: "0", max: "1000", step: "1", inputmode: "numeric", "aria-label": "Actual items remaining, week of " + fmt(ms), title: "Correct or fill in this past week's actual count" });
      if (state.actual[i] !== null) inp.value = state.actual[i];
      on(inp, "input", function () {
        var v = inp.value === "" ? null : parseInt(inp.value, 10);
        if (v !== null && (isNaN(v) || v < 0 || v > 1000)) return;
        state.actual[i] = v; save();
      });
      td.appendChild(inp);
    }
    tr.appendChild(td); body.appendChild(tr);
  });
  table.appendChild(body); wrap.appendChild(table); root.appendChild(wrap);
}

// Only Projects and Ideas are independently archivable (confirmed 2026-09-24)
// -- everything else (Tasks, Decisions, Milestones) lives inside its owning
// Project and is removed immediately with a lightweight undo, not archived
// as its own entry. See removeNow() below for that path.
export function removeToArchive(item, label, before) {
  if (before) before();
  item.arch = { at: iso(TODAY), why: "removed" };
  changed();
  notify(label + " moved to the Archive.", function () { item.arch = null; changed(); });
}
// Lightweight removal for Tasks/Decisions/Milestones: deleted immediately
// (spliced out of state[list]), with a short-lived Undo toast that
// re-inserts the exact same object at its original index -- no Archive
// entry, no `arch` field involved. Confirmed 2026-09-24: these three kinds
// no longer get their own Archive presence; only Projects/Ideas do.
export function removeNow(item, list, label) {
  var arr = state[list], idx = arr.indexOf(item);
  if (idx < 0) return;
  arr.splice(idx, 1); changed();
  notify(label + " removed.", function () { arr.splice(idx, 0, item); changed(); });
}

/* archive */
export var KIND_LABEL = { project: "Project", idea: "Idea" };
export var KIND_FILTERS = [["all", "All"], ["project", "Projects"], ["idea", "Ideas"]];
export function archiveEntries() {
  var out = [];
  state.projects.forEach(function (p) { if (p.arch) out.push({ kind: "project", list: "projects", item: p, title: p.name }); });
  state.parked.forEach(function (p) { if (p.arch) out.push({ kind: "idea", list: "parked", item: p, title: p.text }); });
  return out.sort(function (a, b) { return a.item.arch.at < b.item.arch.at ? 1 : (a.item.arch.at > b.item.arch.at ? -1 : 0); });
}
export function dropEntry(e) { state[e.list] = state[e.list].filter(function (x) { return x !== e.item; }); }
export function restoreEntry(e) {
  e.item.arch = null;
  // Archiving a project cascades to archive its still-open tasks (see
  // archiveProject()) -- restoring it must reverse that, or the project comes
  // back as an empty shell. Tasks are never independently archivable (only
  // removeNow()'d), so any task with .arch set on this project got there
  // solely through that cascade, safe to reopen unconditionally.
  if (e.kind === "project") {
    state.tasks.forEach(function (t) { if (t.projectId === e.item.id && t.arch) t.arch = null; });
  }
  changed(); notify(KIND_LABEL[e.kind] + " restored.");
}
export function deleteForever(e) {
  var extra = e.kind === "task" ? " Its steps also stop counting in the burndown and on the launch checklist." : "";
  confirmDialog("Delete forever?", "“" + short(e.title, 80) + "” will be permanently deleted. This cannot be undone." + extra, "Delete forever", function () {
    dropEntry(e); save(); renderAll(); notify("Deleted.");
  });
}
export function emptyArchive() {
  var all = archiveEntries();
  confirmDialog("Empty the Archive?", all.length + (all.length === 1 ? " item" : " items") + " will be permanently deleted. This cannot be undone.", "Delete everything in the Archive", function () {
    all.forEach(dropEntry); save(); renderAll(); notify("Archive emptied.");
  });
}
export function renderArchive(root) {
  var all = archiveEntries(), filter = ui.archFilter || "all";
  root.appendChild(el("p", { "class": "hint first" }, "Completed tasks and removed items live here. Restore puts an item back where it was. Deleting from the Archive is permanent."));
  var counts = { all: all.length }; all.forEach(function (e) { counts[e.kind] = (counts[e.kind] || 0) + 1; });
  var chips = el("div", { "class": "chips", role: "group", "aria-label": "Filter the Archive" });
  KIND_FILTERS.forEach(function (f) {
    var b = el("button", { type: "button", "class": "chipbtn", "aria-pressed": filter === f[0] ? "true" : "false" }, f[1] + " (" + (counts[f[0]] || 0) + ")");
    on(b, "click", function () { ui.archFilter = f[0]; renderView(); });
    chips.appendChild(b);
  });
  root.appendChild(chips);
  var shown = all.filter(function (e) { return filter === "all" || e.kind === filter; });
  if (!shown.length) { root.appendChild(el("p", { "class": "hint" }, all.length ? "Nothing of that kind in the Archive." : "The Archive is empty. Completed tasks and removed items appear here.")); return; }
  var ul = el("ul", { "class": "list" });
  shown.forEach(function (e) {
    var li = el("li"), row = el("div", { "class": "crow", style: "align-items:center" });
    var info = el("div", { style: "flex:1 1 220px" });
    // An archived project's own page is a real, reachable, read-only view
    // (confirmed 2026-09-24) -- Ideas have no page of their own, so only a
    // project's title is a link.
    if (e.kind === "project") {
      var tl = el("button", { type: "button", "class": "textbtn plink", style: "font-weight:600", title: "View this project" }, e.title);
      on(tl, "click", function () { go("proj:" + e.item.id); });
      info.appendChild(tl);
    } else info.appendChild(el("span", { style: "font-weight:600" }, e.title));
    info.appendChild(el("span", { "class": "chip", style: "margin-left:8px" }, KIND_LABEL[e.kind]));
    info.appendChild(el("p", { "class": "hint", style: "margin-top:4px" }, (e.item.arch.why === "done" ? "Completed " : "Removed ") + fmtY(parseISO(e.item.arch.at))));
    row.appendChild(info);
    var acts = el("div", { "class": "li-actions" });
    acts.appendChild(on(el("button", { type: "button", "class": "small primary", title: "Restore this " + e.kind }, "Restore"), "click", function () { restoreEntry(e); }));
    acts.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Delete this " + e.kind + " forever (can't be undone)" }, "Delete forever"), "click", function () { deleteForever(e); }));
    row.appendChild(acts); li.appendChild(row); ul.appendChild(li);
  });
  root.appendChild(ul);
  root.appendChild(on(el("button", { type: "button", "class": "danger", style: "margin-top:16px" }, "Empty archive"), "click", emptyArchive));
}

/* help */
export function helpMarkup(text) {
  var frag = document.createDocumentFragment();
  text.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/).forEach(function (part) {
    if (!part) return;
    if (part.indexOf("**") === 0) frag.appendChild(el("b", null, part.slice(2, -2)));
    else if (part.indexOf("[[") === 0) frag.appendChild(el("kbd", null, part.slice(2, -2)));
    else frag.appendChild(document.createTextNode(part));
  });
  return frag;
}
export function helpTopics() {
  var W = wd(), w = wl();
  return [
    ["Find your way around", [
      "On a computer, use the sidebar on the left. On a phone, use the tabs along the bottom.",
      "The menu button (three lines, top right) lists every page, and **Slip Schedule**.",
      "The **+** button adds things: a task, backlog item, step, project, idea, decision, or milestone.",
      "Search: press [[/]] on a computer, or tap the magnifier on a phone. Press [[Enter]] to open the first result and [[Esc]] to clear it. On a phone, tap the **X** where the magnifier was to cancel."]],
    ["Work through your day (Today)", [
      "**Next up** shows the task to do now. **Start** marks it in progress, and **Open task** takes you to it in Tasks.",
      "Anything past its end date appears below it. If you are running behind, use **Slip the schedule** there, or **Slip Schedule** in the menu.",
      "The burndown shows work left against the plan. It records this week's count automatically whenever you make a change."]],
    ["Add and schedule tasks", [
      "Tap **+**, then **New task**. Enter the project, what you do, and when it is done.",
      "The " + W + " number sets the dates. " + W + " 1 starts on the project's start date. Leave it empty to put the task in the Backlog.",
      "Open a task in **Tasks** to change its status, add steps and notes, or move it to another " + w + ".",
      "Finishing every step marks the task done."]],
    ["Use the Backlog", [
      "The Backlog holds work that has no dates yet. Add an item with **+**, then **New backlog item**.",
      "To schedule it, open the item and choose a " + w + ". Backlog items stay out of the burndown until you do."]],
    ["Manage projects", [
      "Each project has its own page. Open **Projects** and select the project's name. There you can rename it and edit its notes, and set its start date and pace.",
      "**Candidates** are projects that could take the next slot. Open one and choose **Choose as next project** to start it. Add a candidate with **New project** in the **+** menu, or turn an idea into one with **Make candidate**.",
      "**Where things stand** lists each active project with its next task. Use **Pin** on a project for quick access from the sidebar. Unpinning only hides it there."]],
    ["Finish or archive a project", [
      "**Mark complete** on a project's page marks it done, even with tasks still open. A project also completes by itself once all its tasks are done. Either way, you can archive it right away or leave it in Projects.",
      "A completed project shows a **Complete** badge and drops out of Where things stand. **Reopen** makes it active again.",
      "**Archive** puts a project and its open tasks in the Archive. **Restore** brings all of it back."]],
    ["Link projects", [
      "**Linked projects**, on a project's page, connects it to related projects. A link goes both ways.",
      "**Mark launch critical** flags a linked project that has to finish first. It shows on the other project's Launch checklist, and counts as done once it is complete or archived. Completing or archiving a project with an unfinished launch-critical link only warns you."]],
    ["Use the Parking lot", [
      "Ideas that are not ready yet live on the **Parking lot**. Add one with **Add idea**. Select an idea's title to open it and change its text or note.",
      "**Make candidate** turns an idea into a project candidate, and its note becomes the project's **Notes**. **Park it** on a candidate sends the notes back. **Archive** sends an idea to the Archive."]],
    ["Read the Timeline", [
      "Every project gets a lane. A light bar is an estimate you set on the project's page. It is not a promise.",
      "Add milestones with **Add milestone**. They show as diamonds and in the list below the timeline.",
      "The full-width burndown and the weekly counts are further down the page. This week's actual count fills in by itself. You can correct or fill in earlier weeks by hand."]],
    ["Launch checklist and decisions", [
      "On any task, tap **Add to Launch** beside a step to put that step on that project's own **Launch** section. **Cut from Launch** takes it off. Ticking it there or in **Tasks** keeps both in sync.",
      "A decision always links to a step. Answering the decision ticks the step, and clearing the answer unticks it.",
      "Use **Add item** to create a new step for the list, and **Add decision** to add a question to settle."]],
    ["Archive and undo", [
      "Only **Projects** and **Ideas** go to the **Archive**, using their **Archive** button. A completed task just stays visible in its project, marked done.",
      "**Delete** on a task, or **Remove** on a decision or milestone, deletes it right away, with a short **Undo** in case you didn't mean to.",
      "In the Archive, select a project's name to look at it. **Restore** puts a project or idea back, and a project's tasks with it. **Delete forever** always asks first, and it cannot be undone."]],
    ["Slip the schedule", [
      "Open the menu and choose **Slip Schedule**. Pick the number of days, and whether to move everything or one project, then choose **Push dates later**.",
      "**Undo last slip** in the same dialog reverses it."]],
    ["Settings, backup, and starting over", [
      "In **Settings**, set the default start date and pace, what to call a stretch of work (Block, Sprint, and so on), the date format, the theme, and whether the splash screen plays when the app opens.",
      "Everything is saved in this browser only. Under **Backup and restore**, copy your data as text, or save a file if your browser offers it. Restore from a file or pasted text later.",
      "**Start fresh** erases everything after a warning. Save a backup first. You can begin empty or with the starting projects."]]
  ];
}
export function renderHelp(root) {
  root.appendChild(el("p", { "class": "hint first" }, "Everything you can do in Sidequest, in short. Tap a topic to open it."));
  var acts = el("div", { "class": "actions", style: "margin-top:10px" }), items = [];
  var openAll = el("button", { type: "button", "class": "small", id: "helpOpen" }, "Open all"), closeAll = el("button", { type: "button", "class": "small", id: "helpClose" }, "Close all");
  on(openAll, "click", function () { items.forEach(function (d) { d.open = true; }); });
  on(closeAll, "click", function () { items.forEach(function (d) { d.open = false; }); });
  acts.appendChild(openAll); acts.appendChild(closeAll); root.appendChild(acts);
  helpTopics().forEach(function (t, i) {
    var d = el("details", { "class": "helpitem" }); if (i === 0) d.open = true;
    d.appendChild(el("summary", null, t[0]));
    var body = el("div", { "class": "hbody" }), ul = el("ul");
    t[1].forEach(function (line) { var li = el("li"); li.appendChild(helpMarkup(line)); ul.appendChild(li); });
    body.appendChild(ul); d.appendChild(body); root.appendChild(d); items.push(d);
  });
}

/* settings */
export function blankState() {
  var d = defaults();
  d.tasks = []; d.decisions = []; d.projects = []; d.parked = []; d.milestones = []; d.pins = []; d.lastSlip = null;
  d.start = iso(TODAY); d.mult = state.mult; d.days = state.days; d.settings = state.settings;
  return d;
}
export function startFreshDialog() {
  openModal("Start fresh", function (body) {
    body.appendChild(el("p", { "class": "first" }, "Start fresh erases every task, project, decision, note, milestone, and everything in the Archive stored in this browser. This cannot be undone."));
    body.appendChild(el("p", { "class": "hint" }, "Save a backup first if you might want anything back."));
    var msg = el("p", { "class": "msg", role: "status", "aria-live": "polite" });
    backupControls(body, msg); body.appendChild(msg);
    body.appendChild(el("h3", null, "Start with"));
    var choices = [["empty", "An empty planner"], ["original", "The sample projects"]], picked = "empty";
    choices.forEach(function (c) {
      var lab = el("label", { "class": "radiorow" }); var rb = el("input", { type: "radio", name: "fresh", value: c[0] }); rb.checked = c[0] === picked;
      on(rb, "change", function () { picked = c[0]; });
      lab.appendChild(rb); lab.appendChild(el("span", null, c[1])); body.appendChild(lab);
    });
    var ack = el("label", { "class": "radiorow" }); var cb = el("input", { type: "checkbox", id: "freshAck" });
    ack.appendChild(cb); ack.appendChild(el("span", null, "I understand this will erase everything.")); body.appendChild(ack);
    var acts = el("div", { "class": "actions" });
    var go1 = el("button", { type: "button", "class": "dangerfill", id: "freshGo", title: "Erase everything and start over" }, "Erase everything"); go1.disabled = true;
    on(cb, "change", function () { go1.disabled = !cb.checked; });
    on(go1, "click", function () {
      var keep = state.settings; keep.hideWelcome = true;
      if (picked === "original") { setState(defaults()); state.settings = keep; } else { setState(blankState()); }
      ui.sel = null; ui.detail = false; ui.archFilter = "all"; applyTheme(); save(); closeModal(); go("today"); notify("Started fresh.");
    });
    acts.appendChild(on(el("button", { type: "button", title: "Cancel" }, "Cancel"), "click", closeModal)); acts.appendChild(go1); body.appendChild(acts);
  });
}
export function renderSettings(root) {
  dlWaiters.length = 0;
  var msg = el("p", { "class": "msg", role: "status", "aria-live": "polite" });
  root.appendChild(el("h2", { "class": "first" }, "Schedule defaults"));
  root.appendChild(el("p", { "class": "hint" }, "Each project can set its own start date and pace on its page. These are used by any project that has not. At 1.5x each " + wl() + " runs about 50% longer. Lengths are rounded down to whole days."));
  var grid = el("div", { "class": "setgrid" });
  function fieldOf(id, label, input) { var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id }, label)); w.appendChild(input); grid.appendChild(w); }
  var st = el("input", { type: "date", id: "set-start" }); st.value = state.start;
  on(st, "change", function () { if (!isISO(st.value)) { st.value = state.start; msg.textContent = "Enter a valid start date."; return; } state.start = st.value; state.lastSlip = null; changed(); notify("Start date saved."); });
  var mu = el("input", { type: "number", id: "set-mult", min: "0.25", max: "5", step: "0.25" }); mu.value = state.mult;
  on(mu, "change", function () { var v = parseFloat(mu.value); if (isNaN(v) || v < 0.25 || v > 5) { mu.value = state.mult; msg.textContent = "The time multiplier must be from 0.25 to 5."; return; } state.mult = v; changed(); notify("Time multiplier saved."); });
  var da = el("input", { type: "number", id: "set-days", min: "1", max: "30", step: "1" }); da.value = state.days;
  on(da, "change", function () { var v = parseInt(da.value, 10); if (isNaN(v) || v < 1 || v > 30) { da.value = state.days; msg.textContent = wd() + " length must be from 1 to 30 days."; return; } state.days = v; changed(); notify(wd() + " length saved."); });
  fieldOf("set-start", "Default start date", st); fieldOf("set-mult", "Default time multiplier", mu); fieldOf("set-days", wd() + " length in days (at 1.0x)", da);
  var bwSel = el("select", { id: "set-word", "class": "plain" });
  Object.keys(WORDS).forEach(function (k) { var op = el("option", { value: k }, k); if (k === wd()) op.selected = true; bwSel.appendChild(op); });
  on(bwSel, "change", function () { state.settings.blockWord = bwSel.value; changed(); });
  fieldOf("set-word", "Call each stretch of work a", bwSel);
  root.appendChild(grid); root.appendChild(msg);

  root.appendChild(el("h2", null, "Appearance and formats"));
  var ag = el("div", { "class": "setgrid" });
  var tw = el("div", { "class": "field" }); tw.appendChild(el("label", { "for": "set-theme" }, "Theme"));
  var th = el("select", { id: "set-theme", "class": "plain" });
  [["auto", "Match this device"], ["light", "Light"], ["dark", "Dark"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if (o[0] === state.settings.theme) op.selected = true; th.appendChild(op); });
  on(th, "change", function () { state.settings.theme = th.value; applyTheme(); save(); });
  tw.appendChild(th); ag.appendChild(tw);
  var fw = el("div", { "class": "field" }); fw.appendChild(el("label", { "for": "set-datefmt" }, "Date format"));
  var df = el("select", { id: "set-datefmt", "class": "plain" });
  var sample = Date.UTC(2026, 8, 21);
  ["us", "intl", "mdy", "dmy", "iso"].forEach(function (k) {
    var keep = state.settings.dateFormat; state.settings.dateFormat = k;
    var op = el("option", { value: k }, fmtY(sample)); state.settings.dateFormat = keep;
    if (k === keep) op.selected = true; df.appendChild(op);
  });
  on(df, "change", function () { state.settings.dateFormat = df.value; changed(); });
  fw.appendChild(df); ag.appendChild(fw);
  var sw = el("div", { "class": "field" }); sw.appendChild(el("label", { "for": "set-splash" }, "Splash screen on open"));
  var ss = el("select", { id: "set-splash", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.showSplash) op.selected = true; ss.appendChild(op); });
  on(ss, "change", function () { state.settings.showSplash = ss.value === "on"; save(); });
  sw.appendChild(ss); ag.appendChild(sw);
  root.appendChild(ag);
  root.appendChild(el("p", { "class": "hint" }, "Date pickers follow your device's own format. Nothing here uses a time of day yet."));

  root.appendChild(el("h2", null, "Archive"));
  root.appendChild(el("p", { "class": "hint" }, "Removing a project or an idea sends it to the Archive. A completed task just stays visible in its project."));
  var n = archiveEntries().length;
  root.appendChild(on(el("button", { type: "button", "class": "small", style: "margin-top:12px", title: "Go to the Archive" }, "Open the Archive (" + n + (n === 1 ? " item" : " items") + ")"), "click", function () { go("archive"); }));

  root.appendChild(el("h2", null, "Backup and restore"));
  backupPanel(root);

  root.appendChild(el("h2", null, "Start fresh"));
  var box = el("div", { "class": "dangerbox" });
  box.appendChild(el("p", { "class": "first" }, "Erase everything in this browser and begin again. You will see a warning and a chance to save a backup first."));
  box.appendChild(on(el("button", { type: "button", "class": "danger", style: "margin-top:12px", id: "startFresh", title: "Erase everything and start over" }, "Start fresh…"), "click", startFreshDialog));
  root.appendChild(box);

  root.appendChild(el("h2", null, "About"));
  var ab = el("div", { "class": "box about" });
  ab.appendChild(el("p", { style: "font-weight:600", "class": "first" }, APP_NAME));
  ab.appendChild(el("p", { "class": "hint" }, "Version " + APP_VERSION));
  var cp = el("p", { "class": "hint" }); cp.appendChild(document.createTextNode("© "));
  cp.appendChild(el("a", { href: "https://samoff.com", target: "_blank", rel: "noopener", "class": "textbtn" }, "Tim Samoff")); ab.appendChild(cp);
  root.appendChild(ab);
}

/* backup */
export var downloads = null, dlWaiters = [];
try {
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then(function (d) { downloads = d; dlWaiters.forEach(function (fn) { fn(); }); }).catch(function () { /* unavailable */ });
  }
} catch (e) { /* unavailable */ }
export function backupJSON() { return JSON.stringify(state, null, 2); }
export function backupControls(host, msg) {
  var acts = el("div", { "class": "actions" });
  var saveBtn = el("button", { type: "button", "class": "primary", id: "saveFile", title: "Save a backup file to your device" }, "Save backup file"); saveBtn.hidden = !downloads;
  dlWaiters.push(function () { saveBtn.hidden = !downloads; });
  on(saveBtn, "click", function () {
    if (!downloads) return;
    downloads.save({ filename: "sidequest-backup-" + iso(TODAY) + ".json", data: backupJSON() })
      .then(function () { msg.textContent = "Backup saved."; })
      .catch(function (err) { msg.textContent = (err && err.code === "declined") ? "Save cancelled." : "The file could not be saved. Use the backup text instead."; });
  });
  acts.appendChild(saveBtn);
  var tbox = el("div", { style: "margin-top:12px" }); tbox.hidden = true;
  tbox.appendChild(el("label", { "for": "backupText", "class": "hint" }, "Copy this text and keep it somewhere safe."));
  var bt = el("textarea", { id: "backupText", readonly: "readonly" }); tbox.appendChild(bt);
  acts.appendChild(on(el("button", { type: "button", id: "showText", title: "Show your backup as plain text to copy" }, "Show backup text"), "click", function () { bt.value = backupJSON(); tbox.hidden = false; bt.focus(); bt.select(); }));
  host.appendChild(acts); host.appendChild(tbox);
}
export function backupPanel(root) {
  root.appendChild(el("p", { "class": "hint" }, "Everything is saved in this browser on this device only. Save a backup now and then."));
  var msg = el("p", { "class": "msg", role: "status", "aria-live": "polite" });
  backupControls(root, msg);
  root.appendChild(el("h3", null, "Restore"));
  var ff = el("div", { "class": "field" }); ff.appendChild(el("label", { "for": "restoreFile" }, "Choose a backup file"));
  var file = el("input", { type: "file", id: "restoreFile", accept: ".json,application/json" }); ff.appendChild(file); root.appendChild(ff);
  var tf = el("div", { "class": "field" }); tf.appendChild(el("label", { "for": "restoreText" }, "Or paste backup text"));
  var rt = el("textarea", { id: "restoreText" }); tf.appendChild(rt); root.appendChild(tf);
  function restoreFrom(text) {
    try {
      var obj = JSON.parse(text);
      if (!obj || typeof obj !== "object" || !Array.isArray(obj.tasks)) { msg.textContent = "That does not look like a schedule backup."; return; }
      setState(normalize(obj)); ui.sel = null; ui.detail = false; applyTheme(); save(); renderAll();
      var m2 = $("restoreMsg"); if (m2) m2.textContent = "Restored. " + state.tasks.length + " tasks loaded.";
    } catch (e) { msg.textContent = "That text could not be read. Paste the full backup text."; }
  }
  on(file, "change", function () {
    var f = file.files && file.files[0]; if (!f) return;
    var r = new FileReader(); r.onload = function () { restoreFrom(String(r.result || "")); }; r.onerror = function () { msg.textContent = "The file could not be read."; }; r.readAsText(f);
  });
  var a2 = el("div", { "class": "actions" });
  a2.appendChild(on(el("button", { type: "button", id: "restoreBtn", title: "Restore from the pasted backup text" }, "Restore from text"), "click", function () { restoreFrom(rt.value); }));
  root.appendChild(a2); root.appendChild(msg);
  root.appendChild(el("p", { "class": "msg", id: "restoreMsg", role: "status", "aria-live": "polite" }));
}
