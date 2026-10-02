import { state, ui, save, changed, autoVault, STATUSES, APP_NAME, APP_VERSION, isISO, defaults, setState, normalize, quest as makeQuest } from "./state.js";
import { DAY, iso, parseISO, TODAY, fmt, fmtY, weekStart } from "./dates.js";
import {
  WORDS, wd, wl, pset, blockStartFor, blockEndFor, blockForDate, projKey, taskStart, taskEnd,
  checkpoints, live, counted, liveQuests, activeQuests, candidateQuests, completeQuests,
  findQuest, findAnyQuest, linkedQuests, unlinkQuests, chosen, dispQuest, dispWhat,
  totalUnits, remainingUnits, planned, ordered, backlogTasks, sortTasks,
  isLate, lateTasks, setStatus, syncFromSteps, nextTask, questTasksAllDone, questTotalUnits, questRemainingUnits,
  validPage, isPinned, pinPage, unpinPage, questMeta, fmtHours, fmtHoursLong, questEstimate, recordHist, checkpointStep, globalActual,
  findStep, decisionFor, short, launchItems, stepOptions, taskOptions, findTask
} from "./model.js";
import { $, el, on, uid, setFocusKey, notify, scrollTop, pencilButton, editInline } from "./dom.js";
import { drawChart, drawQuestChart, rangeBlock, questRangeBlock } from "./chart.js";
import { openTask, go, renderView, renderAll, renderChrome, applyTheme } from "./app.js";
import { stepDialog, stepEditDialog, decisionDialog, decisionEditDialog, linkQuestDialog, ideaDialog, candidateDialog, milestoneDialog, slipDialog, taskDialog, confirmDialog, openModal, closeModal } from "./dialogs.js";
import { buildExportSnapshot, renderExportDocument, exportFileName } from "./export.js";

/* views */
// Added to the plan after its quest started: a scope change, marked on the task itself.
// "1 of 3 steps", then "Est 6 h" -- with a bullet between them only when both show.
function stepsAndEst(l3, t) {
  var steps = t.steps.length ? t.steps.filter(function (x) { return x.done; }).length + " of " + t.steps.length + " steps" : "";
  if (steps) l3.appendChild(el("span", null, steps));
  if (steps && t.est > 0) l3.appendChild(el("span", { "aria-hidden": "true" }, "\u00b7"));
  if (t.est > 0) l3.appendChild(el("span", null, "Est " + fmtHours(t.est)));
}
function addedChip(t) {
  if (!t.added || t.isNext || !t.questId || t.added <= pset(t.questId).start) return null;
  return el("span", { "class": "chip", title: "Added to the plan after this quest started" }, "Added " + fmt(parseISO(t.added)));
}
export function nextUpPanel() {
  var box = el("div", { "class": "panel" });
  var t = nextTask();
  if (!t) {
    var nb = backlogTasks().length;
    box.appendChild(el("p", { "class": "ptitle" }, nb ? "Nothing is scheduled." : (counted().length ? "Every task is done." : "No tasks yet.")));
    box.appendChild(el("p", { "class": "pmeta" }, nb ? nb + (nb === 1 ? " item is" : " items are") + " waiting in the Backlog. Choose a " + wl() + " for one." : (counted().length ? "Add a task with the + button, or choose your next quest." : "Add one with the + button.")));
    if (nb) { var ba = el("div", { "class": "actions" }); ba.appendChild(on(el("button", { type: "button", "class": "primary", title: "Go to the Backlog on the Tasks page" }, "Open the Backlog"), "click", function () { go("schedule"); })); box.appendChild(ba); }
    return box;
  }
  box.appendChild(el("p", { "class": "ptitle" }, dispWhat(t)));
  var meta = el("p", { "class": "pmeta" });
  var pname = dispQuest(t);
  if (!t.isNext && validPage("quest:" + t.questId)) {
    var pl = el("button", { type: "button", "class": "textbtn qlink", title: "View this quest" }, pname);
    on(pl, "click", function () { go("quest:" + t.questId); });
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
    acts.appendChild(on(el("button", { type: "button", "class": "primary", title: "Go to Quests to choose a candidate" }, "Choose the next quest"), "click", function () { go("projects"); }));
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
    b.appendChild(el("div", { "class": "l1" }, dispQuest(t) + " · ended " + fmt(taskEnd(t))));
    b.appendChild(el("div", { "class": "l2" }, dispWhat(t)));
    on(b, "click", function () { openTask(t.id); }); li.appendChild(b); ul.appendChild(li);
  });
  box.appendChild(ul);
  return box;
}
// Records the main burndown's and each quest's task counts on every change
// (see recordHist() in model.js for how that history is kept and read back).
export function recordHistory() {
  if (totalUnits() > 0 || Object.keys(state.hist).length) recordHist(state.hist, totalUnits(), remainingUnits());
}
export function recordQuestHistory() {
  liveQuests().forEach(function (p) {
    if (p.status !== "active" && p.status !== "complete") return;
    var total = questTotalUnits(p);
    if (total > 0 || Object.keys(p.hist).length) recordHist(p.hist, total, questRemainingUnits(p));
  });
}
// Auto-completion only -- runs on every changed(). Manual "Mark complete" is separate.
export function sweepQuestCompletion() {
  activeQuests().forEach(function (p) {
    if (questTasksAllDone(p)) { p.status = "complete"; completionDialog(p); }
  });
}
// Launch Critical is a property of the quest, not of one link.
export function incompleteLaunchCriticalLinks(p) {
  return linkedQuests(p).filter(function (lp) { return lp.launchCritical && lp.status !== "complete" && lp.status !== "archived" && !lp.vault; });
}
// Shared vault path for the Vault button, Mark complete, and the auto-sweep.
export function vaultQuest(p) {
  removeToVault(p, "Quest", function () {
    state.tasks.forEach(function (t) { if (t.questId === p.id && !t.vault) t.vault = { at: iso(TODAY), why: "removed" }; });
  });
}
// Builds the standalone read-only export and offers it for saving, same
// fallback order as saveBackupFile(): the Claude downloads capability, then a
// real Save As dialog, then a plain download. Scoped to Active/Complete
// quests, matching where the button itself lives (see renderQuestPage())
// -- Candidate and vaulted export layouts are unscoped, left for a future
// pass per the design brief.
export function exportQuestForClient(p) {
  var snapshot = buildExportSnapshot(p);
  var html = renderExportDocument(snapshot);
  var name = exportFileName(p);
  downloadsReady.then(function (d) {
    if (d) return d.save({ filename: name, data: html }).then(function () { notify("Exported " + p.name + "."); });
    var framed = false;
    try { framed = !!(window.claude && window.top !== window.self); } catch (e) { framed = true; }
    if (framed) { notify("This published copy was not given permission to save files. Publish it again with the downloads capability turned on."); return; }
    if (typeof window.showSaveFilePicker === "function") {
      return window.showSaveFilePicker({ suggestedName: name, types: [{ description: "Sidequest export", accept: { "text/html": [".html"] } }] })
        .then(function (h) { return h.createWritable(); })
        .then(function (w) { return w.write(html).then(function () { return w.close(); }); })
        .then(function () { notify("Exported " + p.name + "."); });
    }
    var blob = new Blob([html], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    notify("Exported " + p.name + ".");
  }).catch(function (err) {
    notify(err && (err.code === "declined" || err.name === "AbortError") ? "Export canceled." : "The export could not be saved.");
  });
}
// Offers vaulting now or leaving it in Quests. Launch-critical warning is soft, never blocking.
export function completionDialog(p) {
  var warn = incompleteLaunchCriticalLinks(p);
  openModal("Quest complete", function (body) {
    body.appendChild(el("p", { "class": "first" }, "“" + p.name + "” is marked complete. Send it to the Vault now, or leave it in Quests."));
    var openTasks = questRemainingUnits(p);
    if (openTasks) body.appendChild(el("p", { "class": "hint" }, openTasks + (openTasks === 1 ? " open task is" : " open tasks are") + " no longer counted in the main burndown. Reopen the quest to count " + (openTasks === 1 ? "it" : "them") + " again."));
    if (warn.length) body.appendChild(el("p", { "class": "hint" }, "Launch-critical linked " + (warn.length === 1 ? "quest isn’t" : "quests aren’t") + " finished yet: " + warn.map(function (lp) { return lp.name; }).join(", ") + "."));
    var acts = el("div", { "class": "actions" });
    var leave = el("button", { type: "button", title: "Keep visible on Quests" }, "Leave in Quests");
    var vault = el("button", { type: "button", "class": "dangerfill", title: "Send to the Vault right now" }, "Vault now");
    on(leave, "click", closeModal);
    on(vault, "click", function () { closeModal(); vaultQuest(p); });
    acts.appendChild(leave); acts.appendChild(vault); body.appendChild(acts);
  });
}
export function burnParts(o) {
  o = o || {};
  var quest = o.quest;
  var h = el(o.level || "h2", null, "Burndown");
  var cb = el("div", { "class": "chartbox" }); var host = el("div"); cb.appendChild(host);
  var lg = el("div", { "class": "legend" });
  var l1 = el("span"); l1.appendChild(el("i", { "class": "p" })); l1.appendChild(document.createTextNode("Ideal"));
  var l2 = el("span"); l2.appendChild(el("i")); l2.appendChild(document.createTextNode("Actual"));
  lg.appendChild(l1); lg.appendChild(l2);
  var l3 = el("span"); l3.appendChild(el("i", { "class": "s" })); l3.appendChild(document.createTextNode("Scope")); lg.appendChild(l3);
  cb.appendChild(lg);
  if (quest) drawQuestChart(host, quest, o.wide); else drawChart(host, o.wide);
  var rn = quest ? questRemainingUnits(quest) : remainingUnits(), tot = quest ? questTotalUnits(quest) : totalUnits(), rb = el("div", { "class": "box" });
  var nbk = quest ? counted().filter(function (t) { return t.questId === quest.id && !t.isNext && t.block === 0; }).length : backlogTasks().length;
  rb.appendChild(el("p", { "class": "hint first remaining" }, rn + (rn === 1 ? " task" : " tasks") + " remaining, out of " + tot + (nbk ? ". " + nbk + (nbk === 1 ? " backlog task is" : " backlog tasks are") + " not counted until scheduled." : "")));
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
  box.appendChild(el("p", { "class": "hint first" }, "The quests here are samples, so you can see how everything fits together. Look around, change things, and press / to search. When you are ready to start your own, open Settings and choose Start fresh."));
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
  if (backupReminderDue()) root.appendChild(backupReminder());
}
// A quiet note once it has been two weeks without a backup, with the button right there.
function backupReminder() {
  var n = daysSinceBackup(), box = el("div", { "class": "box", style: "margin-top:22px" });
  box.appendChild(el("p", { "class": "first" }, state.settings.lastBackup ? "It has been " + n + " days since your last backup." : "You have used Sidequest for " + n + " days without saving a backup."));
  box.appendChild(el("p", { "class": "hint" }, "Your data lives only in this browser on this device. A backup file protects it if the browser's data is ever cleared."));
  var msg = el("p", { "class": "msg schedulesmsg", role: "status", "aria-live": "polite" });
  backupControls(box, msg, function () { box.remove(); notify("Backup saved."); });
  box.appendChild(msg);
  return box;
}

export function taskRow(t) {
  var li = el("li");
  var b = el("button", { type: "button", "class": "item" + (t.status === "Completed" ? " done" : ""), title: "View this task" });
  if (t.id === ui.sel) b.setAttribute("aria-current", "true");
  var l1 = el("div", { "class": "l1 split" }), l1t = el("span"); l1t.appendChild(el("b", null, dispQuest(t)));
  l1t.appendChild(document.createTextNode(" · " + (t.block === 0 ? "Backlog" : fmt(taskStart(t)) + " to " + fmt(taskEnd(t)))));
  l1.appendChild(l1t);
  var tag1 = addedChip(t); if (tag1) l1.appendChild(tag1);
  b.appendChild(l1);
  b.appendChild(el("div", { "class": "l2" }, dispWhat(t)));
  var l3 = el("div", { "class": "l3" });
  l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
  stepsAndEst(l3, t);
  if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
  b.appendChild(l3);
  on(b, "click", function () { ui.sel = t.id; ui.detail = true; renderView(); scrollTop(); });
  li.appendChild(b); return li;
}
export function renderSchedule(root) {
  var o = ordered(), bl = backlogTasks();
  var hiddenNote = completeQuests().length ? el("p", { "class": "hint first" }, "Tasks from Complete quests are not listed here. Open a Complete quest's own page to see them.") : null;
  if (!o.length && !bl.length) {
    if (hiddenNote) root.appendChild(hiddenNote);
    root.appendChild(el("p", { "class": "hint" + (hiddenNote ? "" : " first") }, counted().length ? "No open tasks. Completed tasks are in the Vault." : "No tasks yet. Use the + button to add one."));
    return;
  }
  if (!ui.sel || !findTask(ui.sel)) { var nt = nextTask() || o[0] || bl[0]; ui.sel = nt.id; }
  if (hiddenNote) root.appendChild(hiddenNote);
  root.appendChild(el("p", { "class": "hint" + (hiddenNote ? "" : " first") + (ui.detail ? " hide-on-mobile" : "") }, "Choose a task to view its steps and notes."));
  var split = el("div", { "class": "split" + (ui.detail ? " detail-open" : "") });
  var lp = el("div", { "class": "listpane" });
  var ul = el("ul", { "class": "tlist" });
  if (!o.length) ul.appendChild(el("li", { "class": "plain" }, "Nothing is scheduled. Choose a " + wl() + " for an item in the Backlog."));
  o.forEach(function (t) { ul.appendChild(taskRow(t)); });
  lp.appendChild(ul);
  if (bl.length) {
    lp.appendChild(el("h2", null, "Backlog (" + bl.length + ")"));
    lp.appendChild(el("p", { "class": "hint" }, "Not scheduled yet. Open an item and set a due date to schedule it."));
    var bul = el("ul", { "class": "tlist", style: "margin-top:10px" });
    bl.forEach(function (t) { bul.appendChild(taskRow(t)); });
    lp.appendChild(bul);
  }
  var dp = el("div", { "class": "detailpane" }); dp.appendChild(buildDetail(findTask(ui.sel)));
  split.appendChild(lp); split.appendChild(dp); root.appendChild(split);
}

// `inline` is the quest page's in-place version: no heading or back button, plus an Open in Tasks link.
export function buildDetail(t, inline) {
  var box = el("div", { "class": "detail" });
  if (!inline) box.appendChild(on(el("button", { type: "button", "class": "small only-mobile", style: "margin-bottom:10px", title: "Back to the task list" }, "All tasks"), "click", function () { ui.detail = false; renderView(); scrollTop(); }));
  var top = el("div", { style: "display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap" });
  var lh = el("div");
  if (!inline) lh.appendChild(el("h2", { style: "margin:0" }, dispQuest(t)));
  var dm = el("p", { "class": "dmeta" }, (t.block === 0 ? "Backlog" : fmt(taskStart(t)) + " to " + fmt(taskEnd(t))) + " ");
  if (isLate(t)) dm.appendChild(el("span", { "class": "badge" }, "Overdue"));
  var tag2 = addedChip(t); if (tag2) { tag2.style.marginLeft = "6px"; dm.appendChild(tag2); }
  lh.appendChild(dm); top.appendChild(lh);
  var sel = el("select", { "class": "status", "aria-label": "Status" });
  STATUSES.forEach(function (s) { var o = el("option", { value: s }, s); if (s === t.status) o.selected = true; sel.appendChild(o); });
  sel.setAttribute("data-v", t.status);
  on(sel, "change", function () { setStatus(t, sel.value); changed(); });
  top.appendChild(sel); box.appendChild(top);
  var whatRow = el("div", { "class": "editrow" });
  var whatP = el("p", { "class": "what", style: "flex:0 1 auto;min-width:0" }, dispWhat(t)); whatRow.appendChild(whatP);
  if (!t.isNext) {
    var whatPen = pencilButton("Rename this task", "Rename this task");
    on(whatPen, "click", function () {
      whatPen.hidden = true;
      editInline(whatP, {
        label: "Task name", max: 400, value: function () { return t.what; },
        onSave: function (val) { t.what = val.slice(0, 400); changed(); },
        onEmpty: function () { notify("A task needs a name."); },
        onDone: function () { whatPen.hidden = false; }
      });
    });
    whatRow.appendChild(whatPen);
  }
  box.appendChild(whatRow);
  if (!(t.isNext && chosen())) box.appendChild(el("p", { "class": "dmeta" }, "Done when: " + t.done));
  if (!t.isNext) {
    var dg = el("div", { "class": "setgrid" });
    var dmsg = el("p", { "class": "msg schedmsg", role: "status", "aria-live": "polite" });
    function dfield(id2, label, input) { var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id2 }, label)); w.appendChild(input); dg.appendChild(w); }
    function shownStart() { return t.block === 0 ? "" : iso(taskStart(t)); }
    function shownDue() { return t.block === 0 ? "" : iso(taskEnd(t)); }
    var sd = el("input", { type: "date", id: "task-start" }), bd = el("input", { type: "date", id: "task-due" });
    var ei = el("input", { type: "number", id: "task-est", min: "0", max: "9999", step: "0.25" });
    sd.value = shownStart(); bd.value = shownDue(); ei.value = t.est > 0 ? t.est : "";
    function resetDates() { sd.value = shownStart(); bd.value = shownDue(); }
    var questFirst = parseISO(pset(projKey(t)).start);
    // "blur", not "change" -- a date input fires "change" per segment while typing.
    on(bd, "blur", function () {
      if (bd.value === shownDue()) return;
      if (bd.value === "") { t.block = 0; t.start = ""; t.due = ""; t.added = ""; changed(); notify("Moved to the Backlog."); return; }
      if (!isISO(bd.value)) { resetDates(); dmsg.textContent = "Enter a valid due date, or leave it empty for the Backlog."; return; }
      var blk = blockForDate(projKey(t), parseISO(bd.value));
      if (blk === null) { resetDates(); dmsg.textContent = "Pick a date on or after " + fmtY(questFirst) + ", this quest's own start date."; return; }
      if (t.block > 0 && t.start && bd.value < t.start) { resetDates(); dmsg.textContent = "The due date can't be before the start date."; return; }
      dmsg.textContent = "";
      if (t.block === 0) t.added = iso(TODAY);
      t.due = bd.value; t.block = blk; changed();
      notify("Due " + fmt(taskEnd(t)) + ", in " + wd() + " " + blk + ".");
    });
    on(sd, "blur", function () {
      if (sd.value === shownStart()) return;
      if (t.block === 0) { sd.value = ""; dmsg.textContent = "Add a due date first. A task with no due date is in the Backlog."; return; }
      if (sd.value === "") { dmsg.textContent = ""; t.start = ""; changed(); notify("Start date cleared. The task starts when its " + wl() + " does."); return; }
      if (!isISO(sd.value)) { resetDates(); dmsg.textContent = "Enter a valid start date, or leave it empty."; return; }
      if (parseISO(sd.value) < questFirst) { resetDates(); dmsg.textContent = "Pick a date on or after " + fmtY(questFirst) + ", this quest's own start date."; return; }
      if (sd.value > iso(taskEnd(t))) { resetDates(); dmsg.textContent = "The start date can't be after the due date."; return; }
      dmsg.textContent = "";
      t.start = sd.value; changed(); notify("Start date saved.");
    });
    on(ei, "blur", function () {
      var v = ei.value === "" ? 0 : parseFloat(ei.value);
      if (isNaN(v) || v < 0 || v > 9999) { ei.value = t.est > 0 ? t.est : ""; dmsg.textContent = "Enter the estimated time as hours from 0 to 9999."; return; }
      v = Math.round(v * 100) / 100;
      if (v === (t.est || 0)) return;
      dmsg.textContent = "";
      t.est = v; changed(); notify(v > 0 ? "Estimated time saved." : "Estimated time cleared.");
    });
    dfield("task-start", "Start date (optional)", sd); dfield("task-due", "Due date, or leave empty for the Backlog", bd); dfield("task-est", "Estimated time (hours)", ei);
    box.appendChild(dg); box.appendChild(dmsg);
  }

  var nDone = t.steps.filter(function (s) { return s.done; }).length;
  box.appendChild(el("h3", null, t.steps.length ? "Steps (" + nDone + " of " + t.steps.length + " done)" : "Steps"));
  if (!t.steps.length) box.appendChild(el("p", { "class": "hint" }, "No steps yet. This task counts as one item in the burndown. Add steps to break it up."));
  if (t.steps.length) box.appendChild(el("p", { "class": "hint" }, "Use a step's pencil to rename it, put it on the Launch checklist (it stays one step, so nothing is counted twice), or remove it."));
  var ul = el("ul", { "class": "steps" });
  t.steps.forEach(function (s) {
    var sli = el("li", { "class": s.done ? "done" : "" });
    var lab = el("label"); var cb = el("input", { type: "checkbox" }); cb.checked = s.done;
    on(cb, "change", function () { s.done = cb.checked; syncFromSteps(t); changed(); });
    lab.appendChild(cb); lab.appendChild(el("span", null, s.text)); sli.appendChild(lab);
    var ac = el("div", { "class": "li-actions" });
    if (s.launch) ac.appendChild(el("span", { "class": "chip", title: "On the launch checklist" }, "Launch"));
    var dc = decisionFor(s.id);
    if (dc) ac.appendChild(on(el("button", { type: "button", "class": "small", "aria-label": "Open the decision for this step", title: "Open this decision" }, dc.a ? "Decision: decided" : "Decision: open"), "click", function () { decisionEditDialog(dc, function () { removeNow(dc, "decisions", "Decision"); }); }));
    else ac.appendChild(on(el("button", { type: "button", "class": "small", "aria-label": "Add a decision to this step: " + s.text, title: "Add a decision to this step" }, "Add decision"), "click", function () { decisionDialog({ step: s.id }); }));
    ac.appendChild(pencilButton("Edit step: " + s.text, "Edit this step", function () { stepEditDialog(t, s); }));
    sli.appendChild(ac); ul.appendChild(sli);
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
    if (inline) ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Open this task on the Tasks page" }, "Open in Tasks"), "click", function () { openTask(t.id); }));
    box.appendChild(ar);
  }
  return box;
}

// Bidirectional link, not a subtask hierarchy. Lists p's own direct links only, one hop.
export function linksSection(root, p) {
  var readOnly = !!p.vault;
  var links = linkedQuests(p);
  var ul = el("ul", { "class": "list" });
  if (!links.length) ul.appendChild(el("li", { "class": "hint" }, "No linked quests."));
  links.forEach(function (lp) {
    var li = el("li"), row = el("div", { "class": "crow oneline" });
    var nm = el("button", { type: "button", "class": "textbtn qlink", title: "View this quest" }, lp.name);
    on(nm, "click", function () { go("quest:" + lp.id); });
    row.appendChild(nm);
    if (lp.launchCritical) row.appendChild(el("span", { "class": "chip" }, "Launch critical"));
    if (!readOnly) {
      var acts = el("div", { "class": "li-actions" });
      // Toggles lp's own record -- visible from either side of the link.
      var lc = el("button", { type: "button", "class": "small" + (lp.launchCritical ? " on" : ""), "aria-pressed": lp.launchCritical ? "true" : "false", title: (lp.launchCritical ? "Unmark as" : "Mark as") + " launch critical" }, lp.launchCritical ? "Unmark launch critical" : "Mark launch critical");
      on(lc, "click", function () { lp.launchCritical = !lp.launchCritical; changed(); });
      acts.appendChild(lc);
      var rm = el("button", { type: "button", "class": "small danger", title: "Remove this link" }, "Unlink");
      on(rm, "click", function () { unlinkQuests(p.id, lp.id); changed(); });
      acts.appendChild(rm); row.appendChild(acts);
    }
    li.appendChild(row); ul.appendChild(li);
  });
  root.appendChild(ul);
  if (readOnly) return;
  var candidates = liveQuests().filter(function (x) { return x.id !== p.id && p.linkedQuestIds.indexOf(x.id) < 0; });
  if (candidates.length) {
    var addRow = el("div", { "class": "actions", style: "margin-top:10px" });
    addRow.appendChild(on(el("button", { type: "button", "class": "small", title: "Link this quest to another" }, "Link quest"), "click", function () { linkQuestDialog(p); }));
    root.appendChild(addRow);
  }
}

// Launch-critical items render as a section on a quest's own page, scoped
// to that quest's tasks -- there's no separate standalone Launch page.
export function launchSection(root, p) {
  var readOnly = !!p.vault;
  var ha = el("div", { "class": "sechead" }); ha.appendChild(el("h2", { "class": "sechead-h", id: "h-checks" }, "Before you launch"));
  if (!readOnly) ha.appendChild(on(el("button", { type: "button", "class": "small", title: "Add a launch checklist item" }, "Add item"), "click", function () { stepDialog(true, p.id); }));
  root.appendChild(ha);
  root.appendChild(el("p", { "class": "hint" }, "These are steps from this quest's tasks. Tick one here or in Tasks and it stays in sync."));
  var prog = el("p", { "class": "progress", role: "status", "aria-live": "polite" });
  var items = launchItems(p.id);
  var lcLinks = linkedQuests(p).filter(function (lp) { return lp.launchCritical; });
  function progress() {
    var n = items.filter(function (x) { return x.s.done; }).length + lcLinks.filter(function (lp) { return lp.status === "complete" || lp.status === "archived"; }).length;
    var total = items.length + lcLinks.length;
    prog.textContent = total ? n + " of " + total + " done" : "";
  }
  var ul = el("ul", { "class": "list check", "aria-labelledby": "h-checks" });
  if (!items.length && !lcLinks.length) ul.appendChild(el("li", { "class": "hint" }, "No steps are on the launch checklist. Edit a step in Tasks to put it here, or add an item."));
  items.forEach(function (x) {
    var li = el("li", { "class": x.s.done ? "done" : "" });
    var label = el("label"); var box = el("input", { type: "checkbox" }); box.checked = x.s.done; box.disabled = readOnly;
    on(box, "change", function () { x.s.done = box.checked; syncFromSteps(x.t); autoVault(); sweepQuestCompletion(); recordHistory(); recordQuestHistory(); save(); li.className = box.checked ? "done" : ""; progress(); renderChrome(); });
    label.appendChild(box); label.appendChild(el("span", null, x.s.text)); li.appendChild(label);
    var meta = el("div", { "class": "cnote" });
    if (x.t.vault) meta.appendChild(document.createTextNode(short(dispWhat(x.t), 48) + " (in the Vault)"));
    else meta.appendChild(on(el("button", { type: "button", "class": "textbtn", title: "View this task" }, short(dispWhat(x.t), 48)), "click", function () { showTaskInQuest(p, x.t); }));
    var dc = decisionFor(x.s.id);
    if (dc) meta.appendChild(document.createTextNode(" · Decision " + (dc.a ? "decided" : "open")));
    li.appendChild(meta);
    ul.appendChild(li);
  });
  // Read-only: done-state derives from lp's own status, never a manual checkbox.
  lcLinks.forEach(function (lp) {
    var done = lp.status === "complete" || lp.status === "archived";
    var li = el("li", { "class": done ? "done" : "" });
    var label = el("label"); var box = el("input", { type: "checkbox" }); box.checked = done; box.disabled = true;
    label.appendChild(box); label.appendChild(el("span", null, lp.name + " (linked quest)")); li.appendChild(label);
    var meta = el("div", { "class": "cnote" });
    meta.appendChild(on(el("button", { type: "button", "class": "textbtn", title: "View this quest" }, "Launch critical · " + lp.status), "click", function () { go("quest:" + lp.id); }));
    li.appendChild(meta); ul.appendChild(li);
  });
  progress();
  var lb = el("div", { "class": "listbox" }); lb.appendChild(prog); lb.appendChild(ul); root.appendChild(lb);

}

// Pin/Unpin for a quest, shared by In progress and the Quests list.
function questPinButton(key, name) {
  var pinned = isPinned(key);
  return on(el("button", { type: "button", "class": "small pintoggle" + (pinned ? " on" : ""), "aria-pressed": pinned ? "true" : "false", "aria-label": (pinned ? "Unpin " : "Pin ") + name, title: pinned ? "Unpin from the sidebar" : "Pin to the sidebar" }, pinned ? "Unpin" : "Pin"), "click", function () { if (pinned) unpinPage(key); else pinPage(key); });
}
export function pagesSection(excludeIds) {
  var sec = el("div");
  var rows = liveQuests().filter(function (p) { return p.status !== "candidate" && (!excludeIds || excludeIds.indexOf(p.id) < 0); }).map(function (p) { return { id: p.id, key: "quest:" + p.id, name: p.name, meta: questMeta(p), complete: p.status === "complete" }; });
  var hasPending = rows.some(function (r) { return !r.complete; }), hasComplete = rows.some(function (r) { return r.complete; });
  var heading = !rows.length ? "Pending & completed" : hasPending && hasComplete ? "Pending & completed" : hasComplete ? "Completed" : "Pending";
  sec.appendChild(el("h2", { style: "margin-top:28px" }, heading));
  var ul = el("ul", { "class": "list" });
  if (!rows.length) sec.appendChild(el("p", { "class": "hint" }, "Nothing here right now."));
  rows.forEach(function (r) {
    var li = el("li"), row = el("div", { "class": "crow oneline" });
    var nm = el("div", { style: "flex:1 1 200px" });
    var link = el("button", { type: "button", "class": "textbtn qlink", style: "font-weight:600", title: "View this quest" }, r.name);
    on(link, "click", function () { go(r.key); });
    nm.appendChild(link);
    if (r.complete) nm.appendChild(el("span", { "class": "chip questcomplete", style: "margin-left:8px" }, "Complete"));
    nm.appendChild(el("p", { "class": "hint", style: "margin-top:2px" }, r.meta));
    row.appendChild(nm);
    var acts = el("div", { "class": "li-actions" });
    acts.appendChild(questPinButton(r.key, r.name));
    row.appendChild(acts);
    li.appendChild(row); ul.appendChild(li);
  });
  sec.appendChild(ul); return sec;
}
// A quest's own lifecycle status decides how much of the page renders:
// "candidate" isn't started yet, "active" has its own Tasks/Schedule/Notes/
// Launch sections. Promotion is in-place -- the same record and id carry
// through, never a second record.
export function renderQuestPage(root, id) {
  var p = findQuest(id);
  if (!p) { root.appendChild(el("p", { "class": "hint first" }, "Quest not found.")); return; }
  var readOnly = !!p.vault;
  // Active/complete: two columns (page content left, Schedule/Timeline/Burndown right), stacked on a phone.
  var page = root, split = null;
  var metaLine = el("p", { "class": "hint" });
  if (p.status === "complete") metaLine.appendChild(el("span", { "class": "chip questcomplete", style: "margin-right:8px" }, "Complete"));
  metaLine.appendChild(document.createTextNode(questMeta(p)));
  if (!readOnly && (p.status === "active" || p.status === "complete")) {
    split = el("div", { "class": "questsplit" });
    // Grid areas defined in styles.css.
    root = el("div", { "class": "questmain" });
    split.appendChild(root); page.appendChild(split);
  } else {
    root.appendChild(metaLine);
    if (readOnly) root.appendChild(el("p", { "class": "hint" }, "In the Vault. Restore it to make changes."));
  }

  // A live candidate has no page -- edited via candidateDialog() instead.
  // Vaulted candidates keep this read-only view (reachable from the Vault).
  if (p.status === "candidate") {
    root.appendChild(el("h2", null, "Notes"));
    root.appendChild(el("p", { "class": "hint notetext" }, p.notes || "No notes."));
    root.appendChild(el("h2", null, "Quest Giver"));
    var cgLines = [p.client.org, p.client.poc, p.client.address, p.client.phone, p.client.email, p.client.website].filter(Boolean);
    root.appendChild(el("p", { "class": "hint notetext" }, cgLines.length ? cgLines.join("\n") : "Nothing filled in."));
    return;
  }

  var hd = el("div", { "class": "sechead" + (split ? " first" : "") }); hd.appendChild(el("h2", split ? { "class": "first" } : null, "Tasks"));
  if (!readOnly) hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Add a task" }, "Add task"), "click", function () { taskDialog(p.id); }));
  root.appendChild(hd);
  // The count line on the left, the open estimated time on the right.
  var est = questEstimate(p), metaRow = el("div", { "class": "metarow" });
  metaRow.appendChild(metaLine);
  if (est.total > 0) metaRow.appendChild(el("span", { "class": "hint estleft" }, "Est. " + fmtHoursLong(est.left) + " remaining"));
  root.appendChild(metaRow);
  if (readOnly) root.appendChild(el("p", { "class": "hint" }, "In the Vault. Restore it to make changes."));
  else if (p.status === "complete") root.appendChild(el("p", { "class": "hint" }, "Its tasks are not included in Tasks, Timeline, or Today while this quest is Complete. Reopen it to bring them back."));
  // orderedAll(), not ordered()/backlogTasks() -- a quest's own page must
  // keep showing its own tasks even while Complete, when those cross-quest
  // lists start excluding them.
  var ts = sortTasks(live(state.tasks).filter(function (t) { return !t.isNext && t.questId === p.id; }));
  if (ts.length) {
    var ul = el("ul", { "class": "tlist" });
    ts.forEach(function (t) {
      // A live quest's task opens in place under its row; a vaulted quest's goes to the Tasks page.
      var open = !readOnly && ui.questOpen[p.id] === t.id;
      var li = el("li", { id: "ptask-" + t.id }), b = el("button", { type: "button", "class": "item" + (t.status === "Completed" ? " done" : ""), title: "View this task" });
      if (!readOnly) b.setAttribute("aria-expanded", open ? "true" : "false");
      var l1 = el("div", { "class": "l1 split" });
      l1.appendChild(el("span", null, t.block === 0 ? "Backlog" : fmt(taskStart(t)) + " to " + fmt(taskEnd(t))));
      var tag1 = addedChip(t); if (tag1) l1.appendChild(tag1);
      b.appendChild(l1);
      b.appendChild(el("div", { "class": "l2" }, t.what));
      var l3 = el("div", { "class": "l3" });
      l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
      stepsAndEst(l3, t);
      if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
      b.appendChild(l3);
      on(b, "click", function () { if (readOnly) { openTask(t.id); return; } ui.questOpen[p.id] = open ? null : t.id; renderView(); });
      li.appendChild(b);
      if (open) li.appendChild(buildDetail(t, true));
      ul.appendChild(li);
    });
    root.appendChild(ul);
  }
  if (!split) scheduleSection(root, p, readOnly);

  launchSection(root, p);

  root.appendChild(el("h2", null, "Notes"));
  if (readOnly) {
    root.appendChild(el("p", { "class": "hint notetext" }, p.notes || "No notes."));
  } else {
    var ta = el("textarea", { "aria-label": "Notes for " + p.name, style: "margin-top:8px" }); ta.value = p.notes;
    // Remember a dragged height for this session, since every change rebuilds the page.
    if (ui.notesH[p.id]) ta.style.height = ui.notesH[p.id] + "px";
    on(ta, "input", function () { p.notes = ta.value.slice(0, 5000); save(); });
    root.appendChild(ta);
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(function () { if (ta.offsetHeight > 0) ui.notesH[p.id] = ta.offsetHeight; }).observe(ta);
  }

  root.appendChild(el("h2", null, "Quest Giver"));
  root.appendChild(el("p", { "class": "hint" }, "Optional. The client or contact for this quest."));
  if (readOnly) {
    var gc = p.client, glines = [gc.org, gc.poc, gc.address, gc.phone, gc.email, gc.website].filter(Boolean);
    root.appendChild(el("p", { "class": "hint notetext" }, glines.length ? glines.join("\n") : "Nothing filled in."));
  } else {
    var giverBox = el("div", { "class": "box", style: "margin-top:10px" });
    var gg = el("div", { "class": "setgrid" });
    function gfield(key, id, label, type) {
      var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id }, label));
      var inp = el("input", { type: type || "text", id: id });
      inp.value = p.client[key];
      on(inp, "input", function () { p.client[key] = inp.value.slice(0, 200); save(); });
      w.appendChild(inp); gg.appendChild(w);
    }
    gfield("org", "giver-org-" + p.id, "Organization");
    gfield("poc", "giver-poc-" + p.id, "POC");
    gfield("phone", "giver-phone-" + p.id, "Phone", "tel");
    gfield("email", "giver-email-" + p.id, "Email", "email");
    gfield("website", "giver-website-" + p.id, "Website", "url");
    giverBox.appendChild(gg);
    var gaw = el("div", { "class": "field" }); gaw.appendChild(el("label", { "for": "giver-address-" + p.id }, "Address"));
    var gaddr = el("textarea", { id: "giver-address-" + p.id, rows: 3 }); gaddr.value = p.client.address;
    on(gaddr, "input", function () { p.client.address = gaddr.value.slice(0, 500); save(); });
    gaw.appendChild(gaddr); giverBox.appendChild(gaw);
    root.appendChild(giverBox);
  }

  root.appendChild(el("h2", null, "Linked quests"));
  linksSection(root, p);

  var ar = el("div", { "class": "actions", style: "margin-top:14px" });
  if (readOnly) {
    ar.appendChild(on(el("button", { type: "button", "class": "small primary", title: "Bring back to Quests" }, "Restore"), "click", function () { restoreEntry({ kind: "quest", list: "quests", item: p }); }));
  } else {
    if (p.status === "active") {
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Mark complete" }, "Mark complete"), "click", function () {
        // Manual path, equal in standing to the auto-trigger, not a fallback.
        p.status = "complete"; changed(); completionDialog(p);
      }));
    } else if (p.status === "complete") {
      // No auto-revert -- Reopen is the only way back to Active.
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Reopen this quest" }, "Reopen"), "click", function () {
        p.status = "active"; changed(); notify("Reopened.");
      }));
    }
    ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Send this quest to the Vault" }, "Vault"), "click", function () {
      var warn = incompleteLaunchCriticalLinks(p);
      if (warn.length) notify("Sending to the Vault even though " + (warn.length === 1 ? "a launch-critical linked quest isn’t" : "launch-critical linked quests aren’t") + " finished: " + warn.map(function (lp) { return lp.name; }).join(", ") + ".");
      vaultQuest(p);
    }));
    ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Export web page for client review" }, "Client Export"), "click", function () {
      exportQuestForClient(p);
    }));
  }
  root.appendChild(ar);
  if (split) split.appendChild(questChartsPanel(p));
}

// On a quest's own page a task opens in place; the Tasks page is for the cross-quest list.
function showTaskInQuest(p, t) {
  if (p.vault) { openTask(t.id); return; }
  ui.questOpen[p.id] = t.id; renderView();
  var row = document.getElementById("ptask-" + t.id);
  if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
}
// `first` zeroes the heading's top margin; `extraBtn` rides its heading row.
function scheduleSection(host, p, readOnly, first, extraBtn) {
  var hd = el("div", { "class": "sechead" + (first ? " first" : "") });
  hd.appendChild(el("h2", first ? { "class": "first" } : null, "Schedule"));
  if (extraBtn) hd.appendChild(extraBtn);
  host.appendChild(hd);
  var eff = pset(p.id);
  if (readOnly) {
    host.appendChild(el("p", { "class": "hint" }, "Started " + (eff.start || "unset") + (p.due ? ", due " + fmt(p.due) : "") + ", " + wl() + " length " + eff.days + " days" + "."));
  } else {
    host.appendChild(el("p", { "class": "hint" }, "Set this quest's own start date, due date, and " + wl() + " length."));
    var sg = el("div", { "class": "setgrid" }), smsg = el("p", { "class": "msg schedmsg", role: "status", "aria-live": "polite" });
    function sfield(id2, label, input) { var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id2 }, label)); w.appendChild(input); sg.appendChild(w); }
    var ps = el("input", { type: "date", id: "proj-start" }); ps.value = eff.start;
    var pd = el("input", { type: "date", id: "proj-due" }); pd.value = p.due;
    var pl = el("input", { type: "number", id: "proj-days", min: "1", max: "90", step: "1" }); pl.value = eff.days;
    function applyOwn() {
      var sv = ps.value, lv = parseInt(pl.value, 10);
      if (!isISO(sv)) { ps.value = eff.start; smsg.textContent = "Enter a valid start date."; return; }
      if (isNaN(lv) || lv < 1 || lv > 90) { pl.value = eff.days; smsg.textContent = wd() + " length must be from 1 to 90 days."; return; }
      p.start = sv; p.days = lv; changed(); notify(p.name + " schedule saved.");
    }
    // "blur", not "change" -- a date input fires "change" per segment while typing.
    on(ps, "blur", applyOwn); on(pl, "blur", applyOwn);
    on(pd, "blur", function () { p.due = isISO(pd.value) ? pd.value : ""; changed(); notify(p.due ? "Due date saved." : "Due date cleared."); });
    sfield("proj-start", "Start date", ps); sfield("proj-due", "Due date", pd); sfield("proj-days", "Days per " + wd(), pl);
    host.appendChild(sg); host.appendChild(smsg);
  }
}

// Right column: Schedule, Timeline, Burndown, flowing continuously. Expand opens all three large.
function questChartsPanel(p) {
  var side = el("aside", { "class": "questcharts", "aria-label": "Schedule, timeline, and burndown" });
  var ex = el("button", { type: "button", "class": "small questexpand", title: "Expand the schedule, timeline, and burndown" }, "Expand");
  on(ex, "click", function () { openModal("Timeline and burndown for " + p.name, function (body) { body.appendChild(questCharts(p, true, null, true)); }, { full: true }); });
  side.appendChild(questCharts(p, false, ex, true));
  return side;
}
function questCharts(p, wide, expandBtn, first) {
  var out = el("div");
  // Schedule keeps its own single "Schedule" heading from scheduleSection() -- the
  // Expand button rides along on that same heading row, no separate heading added.
  scheduleSection(out, p, false, first, expandBtn);
  var tl = questRangeBlock(p);
  if (tl.empty) {
    // Nothing to chart -- one combined heading, no Slip button.
    out.appendChild(el("h2", null, "Timeline & burndown"));
    out.appendChild(tl.node);
  } else {
    // Slip moves incomplete tasks only -- see slipDialog().
    var slipBtn = el("button", { type: "button", "class": "small", title: "Push this quest's incomplete tasks later to catch up" }, "Slip schedule");
    on(slipBtn, "click", function () { slipDialog(p); });
    var hd1 = el("div", { "class": "sechead" }); hd1.appendChild(el("h2", null, "Timeline")); hd1.appendChild(slipBtn);
    out.appendChild(hd1);
    out.appendChild(tl.node); wireMilestoneDiamonds(tl.node);
    var b = burnParts({ quest: p, wide: wide, level: "h2" });
    b.count.style.marginTop = "12px";
    out.appendChild(b.h); out.appendChild(b.chart); out.appendChild(b.count);
  }
  return out;
}

// Promotes in place -- same record, same id.
export function promoteToActive(id) {
  var p = findAnyQuest(id);
  if (!p) return;
  p.status = "active";
  var t = state.tasks.filter(function (x) { return x.isNext; })[0];
  if (t) t.status = "Completed";
  changed();
}
export function standingBlock() {
  var wrap = el("div");
  wrap.appendChild(el("h2", { "class": "first" }, "In progress"));
  wrap.appendChild(el("p", { "class": "hint" }, "Built from your open tasks, ordered by when each quest's next task starts. Pin a quest to the sidebar for quick access."));
  var box = el("div", { "class": "box", style: "margin-top:10px" });
  var groups = {}, order = [];
  ordered().forEach(function (t) {
    if (t.isNext || t.status === "Completed") return;
    var quest = findQuest(t.questId);
    if (quest && quest.status === "complete") return;
    var g = groups[t.questId]; if (!g) { g = groups[t.questId] = { questId: t.questId, name: dispQuest(t), open: 0, first: t }; order.push(g); }
    g.open++;
  });
  order.sort(function (a, b) { return taskStart(a.first) - taskStart(b.first); });
  var questIds = order.map(function (g) { return g.questId; });
  var ul = el("ul", { "class": "standing" });
  if (!order.length) ul.appendChild(el("li", null, "No open tasks."));
  order.forEach(function (g) {
    var li = el("li"), row = el("div", { "class": "srow" }), textWrap = el("div", { style: "flex:1 1 200px" });
    var nm = el("button", { type: "button", "class": "textbtn qlink", title: "View this quest" }, g.name);
    on(nm, "click", function () { go(validPage("quest:" + g.questId) ? "quest:" + g.questId : "projects"); });
    textWrap.appendChild(nm);
    var nx = el("div", { "class": "snext" }); nx.appendChild(document.createTextNode("Next up: "));
    var tl = el("button", { type: "button", "class": "textbtn", title: "View this task" }, short(g.first.what, 90));
    on(tl, "click", function () { openTask(g.first.id); });
    nx.appendChild(tl); nx.appendChild(document.createTextNode(" · " + fmt(taskStart(g.first)) + " · " + g.open + " open " + (g.open === 1 ? "task" : "tasks")));
    textWrap.appendChild(nx);
    row.appendChild(textWrap); row.appendChild(questPinButton("quest:" + g.questId, g.name));
    li.appendChild(row); ul.appendChild(li);
  });
  box.appendChild(ul); wrap.appendChild(box);
  return { node: wrap, questIds: questIds };
}
export function candidatesSection() {
  var sec = el("div");
  var hd = el("div", { "class": "sechead", style: "margin-top:28px" }); hd.appendChild(el("h2", null, "Candidates")); sec.appendChild(hd);
  sec.appendChild(el("p", { "class": "hint" }, "Choose which quest gets the next slot. Use New quest in the menu, or make an idea in the Workshop a candidate."));
  var list = el("ul", { "class": "list" });
  var cs = candidateQuests();
  if (!cs.length) list.appendChild(el("li", { "class": "hint" }, "No candidates. Add a candidate."));
  cs.forEach(function (cd) {
    var li = el("li"), row = el("div", { "class": "crow oneline" });
    var nmWrap = el("div", { style: "flex:1 1 200px" });
    var nm = el("button", { type: "button", "class": "textbtn qlink", title: "Edit this candidate" }, cd.name);
    on(nm, "click", function () { candidateDialog(cd); });
    nmWrap.appendChild(nm);
    if (cd.notes) nmWrap.appendChild(el("p", { "class": "cnote notetext noteclamp", style: "margin-left:0" }, cd.notes));
    row.appendChild(nmWrap);
    var acts = el("div", { "class": "li-actions" });
    var pr = el("button", { type: "button", "class": "small", title: "Promote to quest" }, "Promote");
    on(pr, "click", function () { promoteToActive(cd.id); });
    acts.appendChild(pr);
    acts.appendChild(on(el("button", { type: "button", "class": "small", title: "Move to the Workshop" }, "Workshop it"), "click", function () {
      state.quests = state.quests.filter(function (x) { return x.id !== cd.id; });
      state.workshop.push({ id: uid(), text: cd.name, note: cd.notes }); changed();
    }));
    var rm = el("button", { type: "button", "class": "small danger", title: "Send this candidate to the Vault" }, "Vault");
    on(rm, "click", function () { removeToVault(cd, "Quest"); });
    acts.appendChild(rm); row.appendChild(acts); li.appendChild(row);
    list.appendChild(li);
  });
  sec.appendChild(list);
  return sec;
}
export function renderQuests(root) {
  var standing = standingBlock();
  root.appendChild(standing.node);
  root.appendChild(pagesSection(standing.questIds));
  root.appendChild(candidatesSection());
}
export function renderWorkshop(root) {
  root.appendChild(el("p", { "class": "hint first" }, "Ideas and waiting items that are not competing for the next slot."));
  var hd = el("div", { "class": "sechead" });
  hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Add new idea" }, "Add idea"), "click", function () { ideaDialog(); })); root.appendChild(hd);
  var pl = el("ul", { "class": "list", style: "margin-top:12px" });
  var ps = live(state.workshop);
  if (!ps.length) pl.appendChild(el("li", { "class": "hint" }, "Nothing here."));
  ps.forEach(function (p) {
    var li = el("li"), row = el("div", { "class": "crow oneline" });
    var nm = el("div", { style: "flex:1 1 200px" });
    var link = el("button", { type: "button", "class": "textbtn qlink", style: "font-weight:600", title: "Open this idea" }, p.text);
    on(link, "click", function () { ideaDialog(p); });
    nm.appendChild(link);
    if (p.note) nm.appendChild(el("p", { "class": "hint notetext noteclamp", style: "margin-top:2px" }, p.note));
    row.appendChild(nm);
    var acts = el("div", { "class": "li-actions" });
    acts.appendChild(on(el("button", { type: "button", "class": "small", title: "Make this a candidate quest" }, "Make candidate"), "click", function () {
      state.workshop = state.workshop.filter(function (x) { return x.id !== p.id; });
      state.quests.push(makeQuest(uid(), p.text, "candidate", { notes: p.note })); changed();
    }));
    var rm = el("button", { type: "button", "class": "small danger", title: "Send this idea to the Vault" }, "Vault");
    on(rm, "click", function () { removeToVault(p, "Idea"); });
    acts.appendChild(rm); row.appendChild(acts); li.appendChild(row); pl.appendChild(li);
  });
  root.appendChild(pl);
}

// Opens the edit dialog for a real milestone (state.milestones entry) by id.
function editMilestone(id) {
  var orig = state.milestones.filter(function (x) { return x.id === id; })[0];
  if (orig) milestoneDialog(orig, function () { removeNow(orig, "milestones", "Milestone"); });
}
// Makes each milestone diamond inside a chart open its edit dialog (click, Enter, Space).
function wireMilestoneDiamonds(node) {
  Array.prototype.forEach.call(node.querySelectorAll(".ms[data-ms-id]"), function (d) {
    var id = d.getAttribute("data-ms-id");
    on(d, "click", function () { editMilestone(id); });
    on(d, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); editMilestone(id); } });
  });
}
export function renderTimeline(root) {
  var r = rangeBlock(); root.appendChild(r.node);
  wireMilestoneDiamonds(r.node);
  var hd = el("div", { "class": "sechead" }); hd.appendChild(el("h2", null, "Milestones"));
  hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Add a milestone to the timeline" }, "Add milestone"), "click", function () { milestoneDialog(); })); root.appendChild(hd);
  var mbox = el("div", { "class": "box", style: "margin-top:10px" });
  var ul = el("ul", { "class": "mslist" });
  if (!r.milestones.length) ul.appendChild(el("li", { "class": "hint" }, "No milestones yet. Add one to see it on the timeline."));
  r.milestones.slice().sort(function (a, b) { return a.date - b.date; }).forEach(function (m) {
    var li = el("li"); li.appendChild(el("span", { "class": "d" }, fmtY(m.date)));
    var mtext = el("span", { style: "flex:1 1 auto" });
    if (m.auto) mtext.appendChild(document.createTextNode(m.text));
    else { var ml = el("button", { type: "button", "class": "textbtn qlink", title: "Open this milestone" }, m.text); on(ml, "click", function () { editMilestone(m.id); }); mtext.appendChild(ml); }
    li.appendChild(mtext);
    if (!m.auto) {
      var rm = el("button", { type: "button", "class": "small danger", title: "Remove this milestone (can be undone)" }, "Remove");
      on(rm, "click", function () { var orig = state.milestones.filter(function (x) { return x.id === m.id; })[0]; if (orig) removeNow(orig, "milestones", "Milestone"); });
      li.appendChild(rm);
    }
    ul.appendChild(li);
  });
  mbox.appendChild(ul); root.appendChild(mbox);
  root.appendChild(burnPanel({ wide: true, level: "h2" }));
  root.appendChild(el("h2", null, "Task counts"));
  root.appendChild(el("p", { "class": "hint" }, "Recorded automatically from your tasks each time you make a change. A date with no record keeps the last count."));
  var wrap = el("div", { "class": "tablewrap weekly" }); var table = el("table");
  var cps = checkpoints(), ga = globalActual(cps), stepMs = checkpointStep() * DAY;
  var thead = el("thead"); var hr = el("tr"); [stepMs === 7 * DAY ? "Week starting" : "Date", "Planned remaining", "Actual remaining", "Tasks in scope", "Scope change"].forEach(function (h) { hr.appendChild(el("th", null, h)); }); thead.appendChild(hr); table.appendChild(thead);
  var body = el("tbody"), prevScope = null;
  cps.forEach(function (ms, i) {
    var tr = el("tr"); tr.appendChild(el("td", null, fmt(ms))); tr.appendChild(el("td", null, String(planned(ms))));
    var live = ms <= TODAY && TODAY < ms + stepMs;
    [ga.actual[i], ga.scope[i]].forEach(function (v) {
      var td = el("td");
      if (v !== null) td.appendChild(el("span", live ? { title: "Counted from your tasks right now" } : null, String(v)));
      else td.appendChild(el("span", { "class": "hint" }, ms > TODAY ? "" : "Not recorded"));
      tr.appendChild(td);
    });
    // Added or removed work, compared with the previous point that has a count.
    var sc = ga.scope[i], diff = sc !== null && prevScope !== null ? sc - prevScope : 0, tdc = el("td");
    tdc.appendChild(el("span", { "class": "scopechg", style: "--n:" + Math.min(Math.abs(diff), 10) }, diff > 0 ? "+" + diff : diff < 0 ? "\u2212" + (-diff) : ""));
    tr.appendChild(tdc);
    if (sc !== null) prevScope = sc;
    body.appendChild(tr);
  });
  table.appendChild(body); wrap.appendChild(table); root.appendChild(wrap);
}

// Only Quests and Ideas go to the Vault independently -- see removeNow() for the rest.
export function removeToVault(item, label, before) {
  if (before) before();
  item.vault = { at: iso(TODAY), why: "removed" };
  changed();
  notify(label + " moved to the Vault.", function () { item.vault = null; changed(); });
}
// Immediate delete with a short-lived Undo toast, no Vault entry.
export function removeNow(item, list, label) {
  var arr = state[list], idx = arr.indexOf(item);
  if (idx < 0) return;
  arr.splice(idx, 1); changed();
  notify(label + " removed.", function () { arr.splice(idx, 0, item); changed(); });
}

/* vault */
export var KIND_LABEL = { quest: "Quest", idea: "Idea" };
export var KIND_FILTERS = [["all", "All"], ["quest", "Quests"], ["idea", "Ideas"]];
export function vaultEntries() {
  var out = [];
  state.quests.forEach(function (p) { if (p.vault) out.push({ kind: "quest", list: "quests", item: p, title: p.name }); });
  state.workshop.forEach(function (p) { if (p.vault) out.push({ kind: "idea", list: "workshop", item: p, title: p.text }); });
  return out.sort(function (a, b) { return a.item.vault.at < b.item.vault.at ? 1 : (a.item.vault.at > b.item.vault.at ? -1 : 0); });
}
export function dropEntry(e) { state[e.list] = state[e.list].filter(function (x) { return x !== e.item; }); }
export function restoreEntry(e) {
  e.item.vault = null;
  // Reverses vaultQuest()'s task cascade, or the quest comes back empty.
  if (e.kind === "quest") {
    state.tasks.forEach(function (t) { if (t.questId === e.item.id && t.vault) t.vault = null; });
  }
  changed(); notify(KIND_LABEL[e.kind] + " restored.");
}
export function deleteForever(e) {
  var extra = e.kind === "task" ? " Its steps also stop counting in the burndown and on the launch checklist." : "";
  confirmDialog("Delete forever?", "“" + short(e.title, 80) + "” will be permanently deleted. This cannot be undone." + extra, "Delete forever", function () {
    dropEntry(e); save(); renderAll(); notify("Deleted.");
  });
}
export function emptyVault() {
  var all = vaultEntries();
  confirmDialog("Empty the Vault?", all.length + (all.length === 1 ? " item" : " items") + " will be permanently deleted. This cannot be undone.", "Delete everything in the Vault", function () {
    all.forEach(dropEntry); save(); renderAll(); notify("Vault emptied.");
  });
}
export function renderVault(root) {
  var all = vaultEntries(), filter = ui.vaultFilter || "all";
  root.appendChild(el("p", { "class": "hint first" }, "Completed tasks and removed items live here. Restore puts an item back where it was. Deleting from the Vault is permanent."));
  var counts = { all: all.length }; all.forEach(function (e) { counts[e.kind] = (counts[e.kind] || 0) + 1; });
  var chips = el("div", { "class": "chips", role: "group", "aria-label": "Filter the Vault" });
  KIND_FILTERS.forEach(function (f) {
    var b = el("button", { type: "button", "class": "chipbtn", "aria-pressed": filter === f[0] ? "true" : "false" }, f[1] + " (" + (counts[f[0]] || 0) + ")");
    on(b, "click", function () { ui.vaultFilter = f[0]; renderView(); });
    chips.appendChild(b);
  });
  root.appendChild(chips);
  var shown = all.filter(function (e) { return filter === "all" || e.kind === filter; });
  if (!shown.length) { root.appendChild(el("p", { "class": "hint" }, all.length ? "Nothing of that kind in the Vault." : "The Vault is empty. Completed tasks and removed items appear here.")); return; }
  var ul = el("ul", { "class": "list" });
  shown.forEach(function (e) {
    var li = el("li"), row = el("div", { "class": "crow", style: "align-items:center" });
    var info = el("div", { style: "flex:1 1 220px" });
    // Quests link to their read-only vaulted page; Ideas have no page.
    if (e.kind === "quest") {
      var tl = el("button", { type: "button", "class": "textbtn qlink", style: "font-weight:600", title: "View this quest" }, e.title);
      on(tl, "click", function () { go("quest:" + e.item.id); });
      info.appendChild(tl);
    } else info.appendChild(el("span", { style: "font-weight:600" }, e.title));
    info.appendChild(el("span", { "class": "chip", style: "margin-left:8px" }, KIND_LABEL[e.kind]));
    info.appendChild(el("p", { "class": "hint", style: "margin-top:4px" }, (e.item.vault.why === "done" ? "Completed " : "Removed ") + fmtY(parseISO(e.item.vault.at))));
    row.appendChild(info);
    var acts = el("div", { "class": "li-actions" });
    acts.appendChild(on(el("button", { type: "button", "class": "small primary", title: "Restore this " + e.kind }, "Restore"), "click", function () { restoreEntry(e); }));
    acts.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Delete this " + e.kind + " forever (can't be undone)" }, "Delete forever"), "click", function () { deleteForever(e); }));
    row.appendChild(acts); li.appendChild(row); ul.appendChild(li);
  });
  root.appendChild(ul);
  root.appendChild(on(el("button", { type: "button", "class": "danger", style: "margin-top:16px" }, "Empty vault"), "click", emptyVault));
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
  var w = wl();
  return [
    ["Find your way around", [
      "On a computer, use the sidebar on the left. On a phone, use the tabs along the bottom.",
      "The menu button (three lines, top right) lists every page.",
      "The **+** button adds things: a task, backlog item, step, quest, idea, decision, or milestone.",
      "Search: press [[/]] on a computer, or tap the magnifier on a phone. Press [[Enter]] to open the first result and [[Esc]] to clear it. On a phone, tap the **X** where the magnifier was to cancel."]],
    ["Work through your day (Today)", [
      "**Next up** shows the task to do now. **Start** marks it in progress, and **Open task** takes you to it in Tasks.",
      "Anything past its end date appears below it. If you are running behind, open that quest's own page and use **Slip schedule** there.",
      "The burndown counts tasks, one each, and shows how many are still open against the plan. The app records the counts itself whenever you make a change, so nothing is typed in, and a day you did not open the app keeps the last count. An orange line shows how many tasks are in scope, ramping up when tasks are added and down when they are removed. A task added after its quest started carries an Added tag with its date, on the quest's page and in Tasks. A quest marked Complete takes its open tasks off the main chart. Scope changes are also called out in the tooltip and the table. Point at a day or week, tap it, or focus the chart and use the arrow keys to see its counts and tasks."]],
    ["Add and schedule tasks", [
      "Tap **+**, then **New task**. Enter the quest, what you do, and how you will know it is done.",
      "Pick a due date and the task lands in the " + w + " that contains it. Add a start date if it begins later than that " + w + " does, and an estimated time in hours if you want one. Leave the due date empty to put the task in the Backlog.",
      "Open a task in **Tasks**, or select it on its quest's page where it opens right in place, to change its status, add steps and notes, or edit its start date, due date, and estimated time. A start date can't be after the due date. Use the pencil beside its name to rename it.",
      "A quest's page shows the estimated time still open beside its task count, like \"Est. 12 hours remaining\". It drops as you complete tasks.",
      "A task is Not started, In progress, or Completed. Not started shows in blue, In progress in yellow, and Completed in green, on the status menu, on the task's row, and on its bar in a quest's Timeline.",
      "Finishing every step marks the task done, and adding a step to a finished task reopens it."]],
    ["Use the Backlog", [
      "The Backlog holds work that has no dates yet. Add an item with **+**, then **New backlog item**.",
      "To schedule it, open the item and set a due date. Backlog items stay out of the burndown until you do. Clearing a task's due date sends it back to the Backlog and clears its start date. An estimated time is kept either way."]],
    ["Manage quests", [
      "A quest is what used to be called a project here. Same thing, new name -- nothing about your existing quests changed.",
      "Each active quest has its own page. Open **Quests** and select the quest's name. Use the pencil beside its title to rename it, and edit its notes there. Down the page you will find its Tasks, Before you launch checklist, Notes, and Linked quests, in that order. Select a task to open it right there. Beside that (below it on a phone) are its Schedule, where you set its start date, due date, and block length, and its own Timeline and Burndown, which redraw as you change the schedule. On the Timeline, a pale band behind each task's bar shows the block it sits in. On a wide screen, **Expand** shows them large.",
      "**Candidates** are quests that could take the next slot. Select one to edit its notes, start date, due date, and block length in a dialog, then use **Promote** to start it. Add a candidate with **New quest** in the **+** menu, or turn an idea into one with **Make candidate**.",
      "**In progress** lists each active quest with its next task. Use **Pin** on a quest for quick access from the sidebar. Unpinning only hides it there.",
      "Below it, the Quests page lists any quest that is complete or has no tasks yet, under the heading Pending, Completed, or Pending & completed.",
      "**Client Export**, on an active or complete quest's page, downloads a single read-only web page with that quest's tasks, notes, and an interactive schedule and burndown, for sharing outside the app. A linked quest that is active or complete comes along too, with its own section. If you filled in **Your contact info** in Settings, it prints at the top."]],
    ["Finish or vault a quest", [
      "**Mark complete** on a quest's page marks it done, even with tasks still open. A quest also completes by itself once all its tasks are done. Either way, you can send it to the Vault right away or leave it in Quests.",
      "A completed quest shows a **Complete** badge and drops out of In progress. Its tasks also leave Tasks, the main Timeline, Today, and the main burndown, though its own page still lists them. **Reopen** makes it active again and brings them back.",
      "**Vault** puts a quest and its open tasks in the Vault. **Restore** brings all of it back."]],
    ["Link quests", [
      "**Linked quests**, on a quest's page, connects it to related quests. Choose **Link quest** and pick one. A link goes both ways.",
      "**Mark launch critical** flags a linked quest that has to finish first. It shows on the other quest's Launch checklist, and counts as done once it is complete or in the Vault. Completing a quest or sending it to the Vault with an unfinished launch-critical link only warns you."]],
    ["Use the Workshop", [
      "Ideas that are not ready yet live in the **Workshop**. Add one with **Add idea**. Select an idea's title to open it and change its text or note.",
      "**Make candidate** turns an idea into a quest candidate, and its note becomes the quest's **Notes**. **Workshop it** on a candidate sends the notes back. **Vault** sends an idea to the Vault."]],
    ["Read the Timeline", [
      "Every quest gets a lane. A light bar is an estimate you set on the quest's page. It is not a promise.",
      "Add milestones with **Add milestone**. They show as diamonds and in the list below the timeline. Select a diamond, or a milestone's text in the list, to change its quest, text, or date, or to remove it.",
      "A quest's own page has a Timeline with a lane for each scheduled task, and its own Burndown. Point at a week on a burndown, tap it, or focus it and use the left and right arrow keys, to see its counts and which tasks finish or were completed. The full-width burndown and a table of the counts are further down this page. The counts are recorded automatically from your tasks and can't be edited.",
      "On a quest's own Timeline, each task's bar takes its status color: blue for Not started, yellow for In progress, green for Completed."]],
    ["Launch checklist and decisions", [
      "On any task, use the pencil beside a step to rename it, put it on that quest's own **Launch** section, or remove it. A step on the checklist shows a **Launch** tag. Ticking it there or in **Tasks** keeps both in sync.",
      "A decision belongs to one step. Select **Add decision** beside a step to write down what you need to settle. Select the decision tag to answer it, change it, or remove it. Answering it ticks the step, and clearing the answer unticks it.",
      "Use **Add item** on a quest's Launch section to create a new step for the list."]],
    ["The Vault and undo", [
      "Only **Quests** and **Ideas** go to the **Vault**, using their **Vault** button. A completed task just stays visible in its quest, marked done.",
      "**Delete** on a task, or **Remove** on a decision or milestone, deletes it right away, with a short **Undo** in case you didn't mean to.",
      "In the Vault, select a quest's name to look at it. **Restore** puts a quest or idea back, and a quest's tasks with it. **Delete forever** always asks first, and it cannot be undone."]],
    ["Slip a quest's schedule", [
      "On a quest's own page, above the Timeline, choose **Slip schedule**. Pick the number of days and choose **Push dates later**, and its still-incomplete tasks move later by that many days. Completed tasks and the Backlog are not affected.",
      "**Undo last slip** in the same dialog reverses it."]],
    ["Settings, backup, and starting over", [
      "In **Settings**, set the default length of a stretch of work in days, what to call it (Block, Sprint, and so on), the date format, the theme, and whether the splash screen plays when the app opens.",
      "Everything is saved in this browser only. Under **Backup and restore**, **Save backup** lets you choose where to put a backup file, and **Restore backup** loads one back after warning you that it replaces everything. You get a few seconds to undo a restore. After two weeks without a backup, Today adds a quiet reminder.",
      "Under **Vault**, you can set items to delete automatically after 7, 30, 60, or 90 days, counted from when each one was vaulted, or leave it set to Never. This is checked each time Sidequest opens, and there's no further warning once it's turned on.",
      "**Start fresh** erases everything after a warning. Save a backup first. You can begin empty or with the starting quests."]]
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
  d.tasks = []; d.decisions = []; d.quests = []; d.workshop = []; d.milestones = []; d.pins = []; d.lastSlip = null;
  d.start = iso(TODAY); d.days = state.days; d.settings = state.settings;
  return d;
}
export function startFreshDialog() {
  openModal("Start fresh", function (body) {
    body.appendChild(el("p", { "class": "first" }, "Start fresh erases every task, quest, decision, note, milestone, and everything in the Vault stored in this browser. This cannot be undone."));
    body.appendChild(el("p", { "class": "hint" }, "Save a backup first if you might want anything back."));
    var msg = el("p", { "class": "msg", role: "status", "aria-live": "polite" });
    backupControls(body, msg); body.appendChild(msg);
    body.appendChild(el("h3", null, "Start with"));
    var choices = [["empty", "An empty planner"], ["original", "The sample quests"]], picked = "empty";
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
      ui.sel = null; ui.detail = false; ui.vaultFilter = "all"; applyTheme(); save(); closeModal(); go("today"); notify("Started fresh.");
    });
    acts.appendChild(on(el("button", { type: "button", title: "Cancel" }, "Cancel"), "click", closeModal)); acts.appendChild(go1); body.appendChild(acts);
  });
}
export function renderSettings(page) {
  // Split like a quest's own page, but the side panel comes FIRST in DOM
  // order so it stacks above the main settings on a phone, not below --
  // the opposite of .questsplit, where the charts column trails.
  var split = el("div", { "class": "setsplit" });
  var side = el("aside", { "class": "setside" });
  var root = el("div", { "class": "setmain" });
  split.appendChild(side); split.appendChild(root); page.appendChild(split);
  side.appendChild(el("h2", { "class": "first" }, "Your contact info"));
  side.appendChild(el("p", { "class": "hint" }, "Optional. Anything filled in here prints on a Client Export."));
  var contactBox = el("div", { "class": "box", style: "margin-top:10px" });
  var cg = el("div", { "class": "setgrid" });
  function cfield(key, id, label, type) {
    var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id }, label));
    var inp = el("input", { type: type || "text", id: id });
    inp.value = state.settings.contact[key];
    on(inp, "input", function () { state.settings.contact[key] = inp.value.slice(0, 200); save(); });
    w.appendChild(inp); cg.appendChild(w);
  }
  cfield("name", "set-contact-name", "Name");
  cfield("company", "set-contact-company", "Company");
  cfield("phone", "set-contact-phone", "Phone", "tel");
  cfield("email", "set-contact-email", "Email", "email");
  cfield("website", "set-contact-website", "Website", "url");
  contactBox.appendChild(cg);
  var aw = el("div", { "class": "field" }); aw.appendChild(el("label", { "for": "set-contact-address" }, "Address"));
  var addr = el("textarea", { id: "set-contact-address", rows: 3 }); addr.value = state.settings.contact.address;
  on(addr, "input", function () { state.settings.contact.address = addr.value.slice(0, 500); save(); });
  aw.appendChild(addr); contactBox.appendChild(aw);
  side.appendChild(contactBox);

  var msg = el("p", { "class": "msg schedulesmsg", role: "status", "aria-live": "polite" });
  root.appendChild(el("h2", { "class": "first" }, "Schedule defaults"));
  root.appendChild(el("p", { "class": "hint" }, "Each quest sets its own start date on its page. This is the default " + wl() + " length for any quest that hasn't set its own."));
  var scheduleBox = el("div", { "class": "box", style: "margin-top:10px" });
  var grid = el("div", { "class": "setgrid" });
  function fieldOf(id, label, input) { var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id }, label)); w.appendChild(input); grid.appendChild(w); }
  var da = el("input", { type: "number", id: "set-days", min: "1", max: "30", step: "1" }); da.value = state.days;
  on(da, "change", function () { var v = parseInt(da.value, 10); if (isNaN(v) || v < 1 || v > 30) { da.value = state.days; msg.textContent = wd() + " length must be from 1 to 30 days."; return; } state.days = v; changed(); notify(wd() + " length saved."); });
  fieldOf("set-days", "Default days per " + wd(), da);
  var bwSel = el("select", { id: "set-word", "class": "plain" });
  Object.keys(WORDS).forEach(function (k) { var op = el("option", { value: k }, k); if (k === wd()) op.selected = true; bwSel.appendChild(op); });
  on(bwSel, "change", function () { state.settings.blockWord = bwSel.value; changed(); });
  fieldOf("set-word", "Name for each stretch of work", bwSel);
  scheduleBox.appendChild(grid); scheduleBox.appendChild(msg); root.appendChild(scheduleBox);

  root.appendChild(el("h2", null, "Appearance and formats"));
  var appearanceBox = el("div", { "class": "box", style: "margin-top:10px" });
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
  appearanceBox.appendChild(ag);
  appearanceBox.appendChild(el("p", { "class": "hint" }, "Date pickers follow your device's own format. Nothing here uses a time of day yet."));
  root.appendChild(appearanceBox);

  root.appendChild(el("h2", null, "Vault"));
  root.appendChild(el("p", { "class": "hint" }, "Removing a quest or an idea sends it to the Vault. A completed task just stays visible in its quest."));
  var vaultBox = el("div", { "class": "box", style: "margin-top:10px" });
  var pg = el("div", { "class": "setgrid" });
  var pw = el("div", { "class": "field" }); pw.appendChild(el("label", { "for": "set-purge" }, "Auto-delete items after"));
  var ps = el("select", { id: "set-purge", "class": "plain" });
  [[0, "Never"], [7, "7 days"], [30, "30 days"], [60, "60 days"], [90, "90 days"]].forEach(function (o) { var op = el("option", { value: String(o[0]) }, o[1]); if (o[0] === state.settings.vaultPurgeDays) op.selected = true; ps.appendChild(op); });
  on(ps, "change", function () { state.settings.vaultPurgeDays = parseInt(ps.value, 10); changed(); });
  pw.appendChild(ps); pg.appendChild(pw);
  vaultBox.appendChild(pg);
  if (state.settings.vaultPurgeDays) vaultBox.appendChild(el("p", { "class": "hint" }, "Checked each time Sidequest opens. An item older than this, counted from when it was vaulted, is deleted permanently with no further warning."));
  root.appendChild(vaultBox);

  root.appendChild(el("h2", null, "Backup and restore"));
  var backupBox = el("div", { "class": "box", style: "margin-top:10px" });
  backupPanel(backupBox, root);
  root.appendChild(backupBox);

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
// The Claude version saves through its own downloads capability. Elsewhere the
// browser's Save As dialog is used where it exists, and a plain download where not.
export var downloads = null;
var downloadsReady = Promise.resolve(null);
try {
  if (window.claude && typeof window.claude.use === "function") {
    downloadsReady = window.claude.use("downloads").then(function (d) { downloads = d; return d; }).catch(function () { return null; });
  }
} catch (e) { /* unavailable */ }
// The file records today as its own backup date, so restoring from it starts the reminder fresh.
export function backupJSON() {
  return JSON.stringify(Object.assign({}, state, { settings: Object.assign({}, state.settings, { lastBackup: iso(TODAY) }) }), null, 2);
}
var BACKUP_REMIND_DAYS = 14;
// Whole days since the last backup, or since this browser started using Sidequest if there has been none.
function daysSinceBackup() {
  return Math.max(0, Math.round((TODAY - parseISO(state.settings.lastBackup || state.settings.since)) / DAY));
}
// The Claude version keeps its data in its own db, so only the web app nags.
function backupReminderDue() {
  var inClaude = false;
  try { inClaude = !!(window.claude && typeof window.claude.use === "function"); } catch (e) { inClaude = false; }
  return !inClaude && daysSinceBackup() >= BACKUP_REMIND_DAYS;
}
function lastBackupText() {
  var lb = state.settings.lastBackup;
  if (!lb) return "No backup saved yet.";
  var n = Math.max(0, Math.round((TODAY - parseISO(lb)) / DAY));
  return "Last backup: " + fmtY(parseISO(lb)) + " (" + (n === 0 ? "today" : n === 1 ? "yesterday" : n + " days ago") + ").";
}
function saveBackupFile(msg, onDone) {
  var name = "sidequest-backup-" + iso(TODAY) + ".json", text = backupJSON();
  function saved(note) { state.settings.lastBackup = iso(TODAY); save(); msg.textContent = note; if (onDone) onDone(); }
  downloadsReady.then(function (d) {
    if (d) return d.save({ filename: name, data: text }).then(function () { saved("Backup saved."); });
    // Inside a published page's frame a plain download is blocked, so without the capability there is no way to save.
    var framed = false;
    try { framed = !!(window.claude && window.top !== window.self); } catch (e) { framed = true; }
    if (framed) { msg.textContent = "This published copy was not given permission to save files. Publish it again with the downloads capability turned on."; return; }
    if (typeof window.showSaveFilePicker === "function") {
      return window.showSaveFilePicker({ suggestedName: name, types: [{ description: "Sidequest backup", accept: { "application/json": [".json"] } }] })
        .then(function (h) { return h.createWritable(); })
        .then(function (w) { return w.write(text).then(function () { return w.close(); }); })
        .then(function () { saved("Backup saved."); });
    }
    var a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    saved("Backup downloaded.");
  }).catch(function (err) {
    msg.textContent = err && (err.code === "declined" || err.name === "AbortError") ? "Save canceled." : "The backup could not be saved.";
  });
}
// Reads the chosen file, then asks before replacing everything with it.
function restoreBackupFile(file, msg) {
  var r = new FileReader();
  r.onerror = function () { msg.textContent = "The file could not be read."; };
  r.onload = function () {
    var obj = null;
    try { obj = JSON.parse(String(r.result || "")); } catch (e) { obj = null; }
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.tasks)) { msg.textContent = "That is not a Sidequest backup file."; return; }
    msg.textContent = "";
    var next = normalize(obj), np = next.quests.length, nt = next.tasks.length;
    confirmDialog("Restore this backup?",
      "This backup holds " + np + (np === 1 ? " quest" : " quests") + " and " + nt + (nt === 1 ? " task" : " tasks") + ". Restoring replaces everything in Sidequest on this device: all current quests, tasks, notes, history, and settings. You will have a few seconds to undo it.",
      "Restore backup", function () {
        var before = JSON.stringify(state);
        setState(next); ui.sel = null; ui.detail = false; applyTheme(); save(); renderAll();
        notify("Backup restored.", function () { setState(normalize(JSON.parse(before))); ui.sel = null; ui.detail = false; applyTheme(); save(); renderAll(); });
      });
  };
  r.readAsText(file);
}
// The Save backup button, alone (the Start fresh dialog uses it); returns its row of buttons.
export function backupControls(host, msg, onDone) {
  var acts = el("div", { "class": "actions" });
  acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "saveFile", title: "Choose where to save a backup file" }, "Save backup"), "click", function () { saveBackupFile(msg, onDone); }));
  host.appendChild(acts);
  return acts;
}
// `hintHost`, if given, is where the leading description sentence goes instead
// of `root` -- lets a caller keep that sentence outside a card wrapper around
// the rest, matching this page's own heading/hint-outside-the-box convention.
export function backupPanel(root, hintHost) {
  (hintHost || root).appendChild(el("p", { "class": "hint" }, "Everything is saved in this browser on this device only. Save a backup now and then, and keep the file somewhere safe."));
  var msg = el("p", { "class": "msg schedulesmsg", role: "status", "aria-live": "polite" });
  var last = el("p", { "class": "hint" }, lastBackupText());
  var acts = backupControls(root, msg, function () { last.textContent = lastBackupText(); });
  var file = el("input", { type: "file", id: "restoreFile", accept: ".json,application/json", hidden: "hidden", "aria-label": "Choose a backup file to restore" });
  acts.appendChild(on(el("button", { type: "button", id: "restoreBtn", title: "Choose a backup file to restore" }, "Restore backup"), "click", function () { file.click(); }));
  on(file, "change", function () {
    var f = file.files && file.files[0]; if (!f) return;
    restoreBackupFile(f, msg); file.value = "";
  });
  root.appendChild(last); root.appendChild(file); root.appendChild(msg);
}
