import { state, ui, save, changed, autoVault, STATUSES, APP_NAME, APP_VERSION, isISO, defaults, setState, normalize, quest as makeQuest, task, st, S } from "./state.js";
import { DAY, iso, parseISO, TODAY, fmt, fmtY, weekStart, addDays } from "./dates.js";
import {
  WORDS, wd, wl, pset, blockStartFor, blockEndFor, blockForDate, projKey, taskStart, taskEnd,
  checkpoints, live, counted, liveQuests, activeQuests, candidateQuests, completeQuests,
  findQuest, findAnyQuest, linkedQuests, linkQuests, unlinkQuests, chosen, dispQuest, dispWhat,
  totalUnits, remainingUnits, planned, ordered, backlogTasks, sortTasks,
  isLate, lateTasks, setStatus, syncFromSteps, nextTask, questTasksAllDone, questTotalUnits, questRemainingUnits,
  validPage, isPinned, pinPage, unpinPage, questMeta, fmtHours, fmtHoursLong, questEstimate, recordHist, checkpointStep, globalActual,
  findStep, decisionFor, short, launchItems, stepOptions, taskOptions, findTask
} from "./model.js";
import { $, el, on, uid, setFocusKey, notify, scrollTop, pencilButton, editInline, playSfx } from "./dom.js";
import { drawChart, drawQuestChart, rangeBlock, questRangeBlock } from "./chart.js";
import { playConfetti } from "./confetti.js";
import { openTask, go, renderView, renderAll, renderChrome, applyTheme } from "./app.js";
import { stepDialog, stepEditDialog, decisionDialog, decisionEditDialog, linkQuestDialog, ideaDialog, milestoneDialog, slipDialog, taskDialog, confirmDialog, openModal, closeModal } from "./dialogs.js";
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
// Auto-completion only -- runs on every changed(). Manual "Mark complete" is
// separate. Skips a quest Reopen just reactivated, so completing() doesn't
// immediately refire for a quest whose tasks are still all done.
export function sweepQuestCompletion() {
  activeQuests().forEach(function (p) {
    if (p.justReopened) { p.justReopened = false; return; }
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
// fallback order as saveBackupFile(). Scoped to Active/Complete quests only.
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
  // Unpinned directly (not unpinPage(), whose toast would compete with this
  // dialog), remembered via wasPinned so Reopen can restore it.
  var key = "quest:" + p.id;
  if (isPinned(key)) { p.wasPinned = true; state.pins = state.pins.filter(function (k) { return k !== key; }); changed(); }
  if (state.settings.audio) playSfx("assets/sfx/complete.mp3");
  if (state.settings.completionFx) playConfetti();
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
  rb.appendChild(el("p", { "class": "hint first remaining" }, "Remaining: " + rn + " of " + tot + (tot === 1 ? " task" : " tasks") + (nbk ? " | Backlog: " + nbk + " unscheduled " + (nbk === 1 ? "task" : "tasks") : "")));
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
  var welcomeHint = el("p", { "class": "hint first" });
  welcomeHint.appendChild(el("strong", null, "Your new adventure begins here!"));
  welcomeHint.appendChild(document.createTextNode(" These sample quests are here for you to explore. Look around, make changes, and press / to search. You can edit the existing quests or, when you’re ready to start your own, open Options and choose Start fresh."));
  box.appendChild(welcomeHint);
  var acts = el("div", { "class": "actions" });
  acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "welcomeSettings", title: "Go to Options" }, "Go to Options"), "click", function () { go("settings"); }));
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
  box.appendChild(el("p", { "class": "hint" }, "Your data lives only in this browser on this device. A backup file protects it if the browser’s data is ever cleared."));
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
  var hiddenNote = completeQuests().length ? el("p", { "class": "hint first" }, "Tasks from Complete quests are not listed here. Open a Complete quest’s own page to see them.") : null;
  if (!o.length && !bl.length) {
    if (hiddenNote) root.appendChild(hiddenNote);
    root.appendChild(el("p", { "class": "hint" + (hiddenNote ? "" : " first") }, counted().length ? "No open tasks. Completed tasks are in the Vault." : "No tasks yet. Use the + button to add one."));
    return;
  }
  if (!ui.sel || !findTask(ui.sel)) { var nt = nextTask() || o[0] || bl[0]; ui.sel = nt.id; }
  if (hiddenNote) root.appendChild(hiddenNote);
  root.appendChild(el("p", { "class": "hint" + (hiddenNote ? "" : " first") + (ui.detail ? " hide-on-mobile" : "") }, "Tasks gathered from all open quests."));
  var split = el("div", { "class": "split" + (ui.detail ? " detail-open" : "") });
  var lp = el("div", { "class": "listpane" });
  var ul = el("ul", { "class": "tlist" });
  if (!o.length) ul.appendChild(el("li", { "class": "plain" }, "Nothing is scheduled. Choose a " + wl() + " for an item in the Backlog."));
  o.forEach(function (t) { ul.appendChild(taskRow(t)); });
  lp.appendChild(ul);
  if (bl.length) {
    lp.appendChild(el("h2", null, "Backlog (" + bl.length + ")"));
    lp.appendChild(el("p", { "class": "hint" }, "All tasks that haven’t been scheduled yet."));
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
      if (blk === null) { resetDates(); dmsg.textContent = "Pick a date on or after " + fmtY(questFirst) + ", this quest’s own start date."; return; }
      if (t.block > 0 && t.start && bd.value < t.start) { resetDates(); dmsg.textContent = "The due date can’t be before the start date."; return; }
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
      if (parseISO(sd.value) < questFirst) { resetDates(); dmsg.textContent = "Pick a date on or after " + fmtY(questFirst) + ", this quest’s own start date."; return; }
      if (sd.value > iso(taskEnd(t))) { resetDates(); dmsg.textContent = "The start date can’t be after the due date."; return; }
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
  if (t.steps.length) box.appendChild(el("p", { "class": "hint" }, "Use a step’s pencil to rename it, put it on the Launch checklist (it stays one step, so nothing is counted twice), or remove it."));
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
  if (!links.length) ul.appendChild(el("li", { "class": "hint" }, "No quest links."));
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
    addRow.appendChild(on(el("button", { type: "button", "class": "small", title: "Create a link to another quest" }, "Link quest"), "click", function () { linkQuestDialog(p); }));
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
  root.appendChild(el("p", { "class": "hint" }, "These are steps from this quest’s tasks. Tick one here or in Tasks and it stays in sync."));
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
function questRow(r) {
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
  li.appendChild(row);
  return li;
}
export function pagesSection(excludeIds) {
  var sec = el("div");
  var rows = liveQuests().filter(function (p) { return p.status !== "candidate" && (!excludeIds || excludeIds.indexOf(p.id) < 0); }).map(function (p) { return { id: p.id, key: "quest:" + p.id, name: p.name, meta: questMeta(p), complete: p.status === "complete" }; });
  var pending = rows.filter(function (r) { return !r.complete; }), complete = rows.filter(function (r) { return r.complete; });
  if (!rows.length) {
    sec.appendChild(el("h2", { style: "margin-top:28px" }, "Pending and completed"));
    sec.appendChild(el("p", { "class": "hint" }, "Nothing here right now."));
    return sec;
  }
  if (pending.length) {
    sec.appendChild(el("h2", { style: "margin-top:28px" }, "Pending"));
    var pul = el("ul", { "class": "list" });
    pending.forEach(function (r) { pul.appendChild(questRow(r)); });
    sec.appendChild(pul);
  }
  if (complete.length) {
    sec.appendChild(el("h2", { style: "margin-top:28px" }, "Completed"));
    var cul = el("ul", { "class": "list" });
    complete.forEach(function (r) { cul.appendChild(questRow(r)); });
    sec.appendChild(cul);
  }
  return sec;
}
// A quest's own lifecycle status decides how much of the page renders.
// Promotion is in-place -- the same record and id carry through, never a second record.
export function renderQuestPage(root, id) {
  var p = findQuest(id);
  if (!p) { root.appendChild(el("p", { "class": "hint first" }, "Quest not found.")); return; }
  var readOnly = !!p.vault;
  // Active/complete: two columns (page content left, Schedule/Timeline/Burndown right), stacked on a phone.
  var page = root, split = null;
  var metaLine = el("p", { "class": "hint" });
  if (p.status === "complete") metaLine.appendChild(el("span", { "class": "chip questcomplete", style: "margin-right:8px" }, "Complete"));
  metaLine.appendChild(document.createTextNode(questMeta(p)));
  if (!readOnly) {
    split = el("div", { "class": "questsplit" });
    // Grid areas defined in styles.css.
    root = el("div", { "class": "questmain" });
    split.appendChild(root); page.appendChild(split);
  } else {
    root.appendChild(metaLine);
    root.appendChild(el("p", { "class": "hint" }, "In the Vault. Restore it to make changes."));
  }

  // A vaulted candidate keeps this read-only, Notes-only view (reachable
  // from the Vault list) -- a live candidate falls through to the full page below.
  if (p.status === "candidate" && readOnly) {
    root.appendChild(el("h2", null, "Notes"));
    root.appendChild(el("p", { "class": "hint notetext" }, p.notes || "No notes."));
    root.appendChild(el("h2", null, "Quest Giver"));
    var cgLines = [p.client.org, p.client.poc, p.client.address, p.client.phone, p.client.email, p.client.website, p.client.coin !== "" ? "Bounty: " + p.client.coin + " per " + p.client.per.toLowerCase() : ""].filter(Boolean);
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
  // orderedAll(), not ordered()/backlogTasks() -- a quest's own page keeps
  // showing its tasks even while Complete, when cross-quest lists exclude them.
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
  root.appendChild(el("p", { "class": "hint" }, "The client or contact for this quest. If filled, this information will appear on the Quest Giver Export."));
  if (readOnly) {
    var gc = p.client, glines = [gc.org, gc.poc, gc.address, gc.phone, gc.email, gc.website, gc.coin !== "" ? "Bounty: " + gc.coin + " per " + gc.per.toLowerCase() : ""].filter(Boolean);
    root.appendChild(el("p", { "class": "hint notetext" }, glines.length ? glines.join("\n") : "Nothing filled in."));
  } else {
    var giverBox = el("div", { "class": "box", style: "margin-top:10px" });
    var gg = el("div", { "class": "setgrid" });
    function gfield(key, id, label, type, full) {
      var w = el("div", { "class": "field" + (full ? " full" : "") }); w.appendChild(el("label", { "for": id }, label));
      var inp = el("input", { type: type || "text", id: id });
      inp.value = p.client[key];
      on(inp, "input", function () { p.client[key] = inp.value.slice(0, 200); save(); });
      w.appendChild(inp); gg.appendChild(w);
    }
    gfield("org", "giver-org-" + p.id, "Organization");
    gfield("poc", "giver-poc-" + p.id, "POC");
    gfield("phone", "giver-phone-" + p.id, "Phone", "tel");
    gfield("email", "giver-email-" + p.id, "Email", "email");
    gfield("website", "giver-website-" + p.id, "Website", "url", true);
    giverBox.appendChild(gg);
    var gaw = el("div", { "class": "field" }); gaw.appendChild(el("label", { "for": "giver-address-" + p.id }, "Address"));
    var gaddr = el("textarea", { id: "giver-address-" + p.id, rows: 3 }); gaddr.value = p.client.address;
    on(gaddr, "input", function () { p.client.address = gaddr.value.slice(0, 500); save(); });
    gaw.appendChild(gaddr); giverBox.appendChild(gaw);
    var gg2 = el("div", { "class": "setgrid", style: "margin-top:10px" });
    var gcw = el("div", { "class": "field" }); gcw.appendChild(el("label", { "for": "giver-coin-" + p.id }, "Bounty"));
    var gcoin = el("input", { type: "number", id: "giver-coin-" + p.id, min: "0", max: "999999", step: "1" });
    gcoin.value = p.client.coin === "" ? "" : String(p.client.coin);
    on(gcoin, "input", function () {
      if (gcoin.value === "") { p.client.coin = ""; save(); return; }
      var n = parseInt(gcoin.value, 10);
      p.client.coin = (isNaN(n) || n < 0) ? "" : Math.min(999999, n);
      save();
    });
    gcw.appendChild(gcoin); gg2.appendChild(gcw);
    var gpw = el("div", { "class": "field" }); gpw.appendChild(el("label", { "for": "giver-per-" + p.id }, "Per"));
    var gper = el("select", { id: "giver-per-" + p.id, "class": "plain" });
    ["Hour", "Quest"].forEach(function (o) { var op = el("option", { value: o }, o); if (o === p.client.per) op.selected = true; gper.appendChild(op); });
    on(gper, "change", function () { p.client.per = gper.value; save(); });
    gpw.appendChild(gper); gg2.appendChild(gpw);
    giverBox.appendChild(gg2);
    root.appendChild(giverBox);
  }

  // A candidate isn't a real destination for other quests to link to yet.
  if (p.status !== "candidate") {
    root.appendChild(el("h2", null, "Quest links"));
    linksSection(root, p);
  }

  var ar = el("div", { "class": "actions questactions", style: "margin-top:14px" });
  if (readOnly) {
    ar.appendChild(on(el("button", { type: "button", "class": "small primary", title: "Bring back to Quests" }, "Restore"), "click", function () { restoreEntry({ kind: "quest", list: "quests", item: p }); }));
  } else if (p.status === "candidate") {
    ar.appendChild(on(el("button", { type: "button", "class": "small primary", title: "Promote to quest" }, "Promote"), "click", function () { promoteToActive(p.id); }));
    ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Send this candidate to the Vault" }, "Vault"), "click", function () { removeToVault(p, "Quest"); }));
  } else {
    if (p.status === "active") {
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Mark complete" }, "Mark complete"), "click", function () {
        // Manual path, equal in standing to the auto-trigger, not a fallback.
        p.status = "complete"; changed(); completionDialog(p);
      }));
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Send this quest back to Candidates" }, "Demote"), "click", function () { demoteToCandidate(p.id); }));
    } else if (p.status === "complete") {
      // No auto-revert -- Reopen is the only way back to Active.
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Reopen this quest" }, "Reopen"), "click", function () {
        p.status = "active";
        // Lets sweepQuestCompletion() skip this quest once, so reopening one
        // whose tasks are all still Completed doesn't immediately re-fire it.
        p.justReopened = true;
        // Restore a pin completionDialog() auto-removed on completion.
        if (p.wasPinned) { var key = "quest:" + p.id; if (!isPinned(key)) state.pins.push(key); p.wasPinned = false; }
        changed(); notify("Reopened.");
        if (state.settings.audio) playSfx("assets/sfx/quest.mp3");
      }));
    }
    ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Send this quest to the Vault" }, "Vault"), "click", function () {
      var warn = incompleteLaunchCriticalLinks(p);
      if (warn.length) notify("Sending to the Vault even though " + (warn.length === 1 ? "a launch-critical linked quest isn’t" : "launch-critical linked quests aren’t") + " finished: " + warn.map(function (lp) { return lp.name; }).join(", ") + ".");
      vaultQuest(p);
    }));
    ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Export web page for client review" }, "Quest Giver Export"), "click", function () {
      exportQuestForClient(p);
    }));
  }
  // ar is a sibling of .questmain/.questcharts inside .questsplit, not nested
  // in .questmain, so it naturally renders last (after Schedule/Timeline/
  // Burndown) when stacked; CSS order puts it back at the end of the left
  // column on a wide screen, where it visually sat before this change.
  if (split) { split.appendChild(questChartsPanel(p)); split.appendChild(ar); } else { root.appendChild(ar); }
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
    host.appendChild(el("p", { "class": "hint" }, "Set the quest’s start date, due date, and " + wl() + " length."));
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
  // Schedule keeps its own heading from scheduleSection(); Expand rides along on that same row.
  scheduleSection(out, p, false, first, expandBtn);
  var tl = questRangeBlock(p);
  if (tl.empty) {
    // Nothing to chart -- one combined heading, no Slip button.
    out.appendChild(el("h2", null, "Timeline & burndown"));
    out.appendChild(tl.node);
  } else {
    // Slip moves incomplete tasks only -- see slipDialog().
    var slipBtn = el("button", { type: "button", "class": "small", title: "Push this quest’s incomplete tasks later to catch up" }, "Slip schedule");
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

// Promotes in place -- same record, same id. Restores any links set aside by
// a prior demoteToCandidate(), only ones still pointing at a quest that still exists.
export function promoteToActive(id) {
  var p = findAnyQuest(id);
  if (!p) return;
  p.status = "active";
  if (p.savedLinkIds) {
    p.savedLinkIds.forEach(function (lid) { if (findAnyQuest(lid)) linkQuests(p.id, lid); });
    p.savedLinkIds = null;
  }
  var t = state.tasks.filter(function (x) { return x.isNext; })[0];
  if (t) t.status = "Completed";
  changed();
  if (state.settings.audio) playSfx("assets/sfx/quest.mp3");
}
// Sends an active quest back to Candidates. A candidate isn't a real link
// target, so its links are set aside in savedLinkIds (restored on re-promotion), not just dropped.
export function demoteToCandidate(id) {
  var p = findAnyQuest(id);
  if (!p) return;
  p.savedLinkIds = p.linkedQuestIds.slice();
  p.linkedQuestIds.slice().forEach(function (lid) { unlinkQuests(p.id, lid); });
  p.status = "candidate";
  changed();
  notify("Sent back to Candidates.");
}
export function standingBlock() {
  var wrap = el("div");
  wrap.appendChild(el("h2", { "class": "first" }, "In progress"));
  wrap.appendChild(el("p", { "class": "hint" }, "Quests are ordered by the start date of their next task. Pin a quest to the sidebar for quick access."));
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
  var hd = el("div", { "class": "sechead", style: "margin-top:28px" }); hd.appendChild(el("h2", null, "Candidate quests")); sec.appendChild(hd);
  sec.appendChild(el("p", { "class": "hint" }, "Promoting a candidate quest moves it to In progress. Sending it to the Vault shelves it."));
  var list = el("ul", { "class": "list" });
  var cs = candidateQuests();
  if (!cs.length) list.appendChild(el("li", { "class": "hint" }, "No candidates. Add a candidate."));
  cs.forEach(function (cd) {
    var li = el("li"), row = el("div", { "class": "crow oneline" });
    var nmWrap = el("div", { style: "flex:1 1 200px" });
    var nm = el("button", { type: "button", "class": "textbtn qlink", title: "View this candidate" }, cd.name);
    on(nm, "click", function () { go("quest:" + cd.id); });
    nmWrap.appendChild(nm);
    if (cd.notes) nmWrap.appendChild(el("p", { "class": "cnote notetext noteclamp", style: "margin-left:0" }, cd.notes));
    row.appendChild(nmWrap);
    var acts = el("div", { "class": "li-actions" });
    var pr = el("button", { type: "button", "class": "small", title: "Promote to quest" }, "Promote");
    on(pr, "click", function () { promoteToActive(cd.id); });
    acts.appendChild(pr);
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
  root.appendChild(el("p", { "class": "hint first" }, "Your ideas live here until you make them a candidate quest. Sending them to the Vault shelves them."));
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
  root.appendChild(el("p", { "class": "hint" }, "Task counts are recorded automatically when you make changes. On days with no changes, the previous count carries forward."));
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
  root.appendChild(el("p", { "class": "hint first" }, "Quests and ideas can be sent here to be shelved. When a Quest is completed, you can choose to send it to the Vault. Restore returns an item to where it was before. Deleting an item from the Vault is permanent. The Vault can be set to clear automatically at chosen intervals, or never."));
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
    acts.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Delete this " + e.kind + " forever (can’t be undone)" }, "Delete forever"), "click", function () { deleteForever(e); }));
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
      "The **Main menu** (three lines, top right) lists every page, including the ones that don’t fit in the sidebar or the tab bar.",
      "Use the **+** button to add a quest, task, step, decision, milestone, backlog item, or idea. It opens a menu in that order, since quests and tasks are what you’ll reach for most.",
      "Press [[/]] to search on a computer, or tap the magnifier on a phone. [[Enter]] opens the first result, [[Esc]] clears it. On a phone, tap the **X** where the magnifier was to cancel."]],
    ["From idea to quest: the whole path", [
      "An idea starts in the **Workshop**, with nothing more than a line of text and an optional note. This is the place for something you’re not ready to commit to. It costs nothing to put there, and nothing to leave sitting.",
      "When an idea is worth doing, select **Make candidate**. Its note becomes the candidate’s Notes, and it moves to **Quests**, under **Candidate quests**. This move only goes one way: a candidate can’t be sent back to the Workshop. If you change your mind, vault it instead.",
      "A candidate has its own page, the same shape as an active quest’s: Tasks, Schedule, Notes, Quest Giver info. You can build the whole thing out, start date and all, before it’s running. The only pieces missing are Quest links and the usual finish-line buttons, since neither one means anything until the quest is real.",
      "**Promote** turns a candidate into an active quest. It’s the same record with the same id and the same tasks, only its status moves. From here it behaves like any other quest: it can be marked complete, sent to the Vault, or demoted back to a candidate if it turns out the timing was wrong.",
      "**Demote**, on an active quest’s page, is the reverse of Promote. Its Quest links come off on both sides first, since a candidate isn’t a link target, but Sidequest remembers them, and promoting the quest again puts them back.",
      "A quest finishes by **Mark complete**, or on its own once every task is done. From there, **Reopen** brings it back to active, or **Vault** sets it aside. Nothing is destroyed until you delete it from the Vault."]],
    ["Work through your day (Today)", [
      "**Next up** shows the task to do now. **Start** marks it in progress, and **Open task** takes you to it in Tasks.",
      "Anything past its end date appears below it. If you’re running behind, open that quest’s own page and use **Slip schedule** there.",
      "The burndown counts tasks, one each, against the plan. Sidequest records the count itself every time something changes, so there’s nothing to type in, and a day you don’t open the app just keeps the last count. An orange line tracks scope. It climbs when a task is added and drops when one is removed, so growing work doesn’t quietly look like progress. A task added after its quest started carries an Added tag with its date, on the quest’s page and in Tasks. A quest marked Complete takes its open tasks off this chart. Point at a day or week, tap it, or focus the chart and use the arrow keys, to see its counts and which tasks are behind them."]],
    ["Add and schedule tasks", [
      "Tap **+**, then **New task**. Enter the quest, what you’re doing, and how you’ll know it’s done.",
      "Pick a due date and the task lands in whichever " + w + " contains it. Add a start date if it begins later than that " + w + " does, and an estimated time in hours if that’s useful to you. Leave the due date empty and the task goes to the Backlog instead.",
      "Open a task from **Tasks**, or select it right on its quest’s page where it expands in place, to change its status, add steps and notes, or edit its dates and estimate. A start date can’t fall after the due date. The pencil beside its name renames it.",
      "A quest’s page shows the estimated time still open beside its task count, something like “Est. 12 hours remaining,” and that number drops as tasks get done.",
      "A task is Not started, In progress, or Completed, shown as blue, yellow, and green everywhere it appears: the status menu, the task’s row, and its bar on a quest’s Timeline.",
      "Finishing every step on a task marks it done. Add a new step to a finished task and it reopens, since there’s now something left to do."]],
    ["Use the Backlog", [
      "The Backlog holds work with no dates yet. Add something directly with **+**, then **New backlog item**, or clear a task’s due date to send it there.",
      "To schedule a Backlog item, open it and set a due date. Nothing in the Backlog counts toward the burndown until it has one. Going the other way, clearing a due date, also clears the start date, but keeps whatever estimate you set."]],
    ["Use the Workshop", [
      "The Workshop is where an idea lives before it’s worth a full quest record. **Add idea** needs nothing but a line of text and, if you want, a note.",
      "Select an idea’s title to open it and change the text or note. **Make candidate** is the only way out. See “From idea to quest: the whole path” for where it goes from there."]],
    ["Manage quests", [
      "A quest is the same thing a project would be called anywhere else. Yours haven’t changed, only the word has.",
      "Every quest has its own page. Open **Quests** and select its name. The pencil beside the title renames it; the Notes field below is yours to use however you like. Further down: Tasks, the Before you launch checklist, Notes, and Quest links, in that order, with its Schedule, Timeline, and Burndown running alongside (below, on a phone). Change the schedule and the Timeline and Burndown redraw to match. On the Timeline, a pale band behind each task’s bar marks the " + w + " it falls in. **Expand**, on a wide screen, makes all three large.",
      "**In progress**, on the Quests page, lists each active quest with its next task. **Pin** keeps one in the sidebar for quick access. Unpinning only hides it there; it’s still listed on this page either way. A quest that’s Complete loses its pin automatically, since there’s nothing left to jump to, and Reopen brings the pin back along with everything else.",
      "Below In progress, the Quests page lists anything not yet started under **Pending** and anything finished under **Completed**, each its own section, shown only when it actually has something in it.",
      "**Quest Giver Export**, on an active or complete quest’s page, downloads one self-contained web page with that quest’s tasks, notes, and a working schedule and burndown, meant for sharing outside the app. A linked quest that’s also active or complete rides along with its own section. Fill in **Your contact info** in Settings and this quest’s own **Quest Giver** section, and both print at the top as Prepared by and Prepared for. **Add brandmark**, also in Settings, uploads a small image that prints above Prepared by. **Bounty** and **Per**, at the bottom of a quest’s own Quest Giver section, track a contract pay rate for your own reference. They never print on the export."]],
    ["Finish or vault a quest", [
      "**Mark complete** works even with tasks still open. A quest also completes on its own once every task actually is. Either way you’re offered the Vault right away, or you can leave it sitting in Quests.",
      "A completed quest wears a **Complete** badge and drops out of In progress. Its tasks leave Tasks, the main Timeline, Today, and the main burndown too, though they’re still right there on the quest’s own page. **Reopen** undoes all of it: back to active, tasks back everywhere, pin restored if it had one.",
      "**Vault** sends a quest and its open tasks to the Vault together. **Restore** brings all of it back, exactly as it was."]],
    ["Link quests", [
      "**Quest links**, on a quest’s page, tie it to related quests. **Link quest** creates one, and it runs both directions, so it shows up on the other quest’s page too.",
      "**Mark launch critical** flags a linked quest as something that has to finish first. It shows up on the other quest’s Launch checklist, counted done once the linked one is complete or vaulted. Completing or vaulting a quest with an unfinished launch-critical link only warns you, it doesn’t block you."]],
    ["Read the Timeline", [
      "Every quest gets a lane. The light bar is an estimate you set yourself on the quest’s page, not a promise.",
      "**Add milestone** places a diamond on the date you choose, also listed below the timeline. Select a diamond, or its text in that list, to change its quest, text, or date, or to remove it.",
      "A quest’s own page has its own Timeline, one lane per scheduled task, and its own Burndown beneath it. Point at a week, tap it, or focus the chart and use the arrow keys, to see the count and which tasks finish or were completed that week. The counts come straight from your tasks and can’t be edited by hand.",
      "On a quest’s own Timeline, a task’s bar takes its status color: blue for Not started, yellow for In progress, green for Completed."]],
    ["Launch checklist and decisions", [
      "The pencil beside any step lets you rename it, put it on that quest’s **Launch** checklist, or remove it. A step on the checklist carries a **Launch** tag, and ticking it there or in Tasks keeps both in sync.",
      "A decision always belongs to exactly one step. **Add decision** beside a step writes down what needs settling; the decision tag opens it again to answer, change, or remove it. Answering it ticks the step, and clearing the answer unticks it again.",
      "**Add item**, on a quest’s Launch section, creates a new step for the list without going through a task first."]],
    ["The Vault and undo", [
      "Only **Quests** and **Ideas** go to the Vault, each with its own **Vault** button. A completed task just stays in its quest, marked done.",
      "**Delete** on a task, or **Remove** on a decision or milestone, is immediate, with a short **Undo** right after in case that wasn’t what you meant.",
      "In the Vault, select a quest’s name to see it read-only. **Restore** brings a quest or idea back, tasks included. **Delete forever** always asks first, and there’s no undo once you confirm it."]],
    ["Slip a quest’s schedule", [
      "On a quest’s own page, above the Timeline, **Slip schedule** pushes its still-incomplete tasks later by however many days you choose. Completed tasks and anything in the Backlog don’t move.",
      "**Undo last slip**, in the same dialog, puts everything back where it was."]],
    ["Options, backup, and starting over", [
      "**Options** covers how Sidequest looks and schedules by default: the length of a " + w + " in days, what to call it (Block, Sprint, and so on), date format, theme, whether the splash plays on open, whether a burndown draws its lines in when it comes into view (**Animated burndown**), whether **Sound Effects** play at all, and whether finishing a quest sets off a **Completion FX** confetti burst.",
      "Everything lives in this browser only, so **Backup and restore** matters. **Save backup** writes a file wherever you choose. **Restore backup** reads one back in, after warning you it replaces everything currently here, with a few seconds to undo if you change your mind. Go two weeks without a backup and Today will say so, quietly.",
      "**Vault** items can delete themselves automatically, 7, 30, 60, or 90 days after being vaulted, or never, if you leave it there. Sidequest checks this once, each time it opens, with no second warning once the setting is on.",
      "**Start fresh** erases everything, after one warning. Back it up first if there’s anything worth keeping. You can start completely empty, or with the sample quests back in place."]],
    ["Import from Trello or Todoist", [
      "Options has an **Import** section with two buttons, one for each tool. Either one turns a board or a project into a new quest here and never touches your existing quests or tasks.",
      "**Import from Trello** needs the JSON file from Trello’s own board menu, Print, Export, and Share, then Export as JSON: a CSV export will not work. A card becomes a task, its description becomes the task note, and its checklist items become steps, already ticked if they were. Labels, members, comments, and attachments have no place in Sidequest, so they are left out rather than half-imported. A card with a due date is scheduled on it; a card with none goes to the Backlog, and a card you had archived in Trello is skipped.",
      "**Import from Todoist** needs the CSV file from a project’s own Export option, and the new quest takes its name from that file. Todoist leaves finished work out of this file entirely, so only what is still open comes across, and a project with Todoist’s own 300-task limit may be missing some tasks from the file itself. A Todoist subtask comes in as its own task here, not nested under its parent, since Sidequest has no such nesting. A due date written as a real date, “today,” “tomorrow,” or “in a number of days” is understood; a repeating due date is left for the Backlog rather than guessed at.",
      "Either import shows a dialog first, naming exactly what it found and what will be left out, before anything actually happens."]],
    ["Install Sidequest on this device", [
      "Options has an **Install Sidequest** section. On a computer running Chrome or Edge, or on Android, it shows a real **Install Sidequest** button. Selecting it puts Sidequest on this device with its own icon and its own window, separate from the browser, and it keeps working without a connection once you have opened it there at least once.",
      "On an iPhone or iPad there is no such button anywhere, in Options or in the browser itself. Tap the Share icon in Safari, then **Add to Home Screen**, and it installs the same way.",
      "This only applies to the version of Sidequest running in its own browser tab. It has no meaning inside a published Claude artifact, so the section does not appear there at all."]]
  ];
}
export function renderHelp(root) {
  root.appendChild(el("p", { "class": "hint first" }, "Everything you need to know about Sidequest. Choose a topic to learn more."));
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
    body.appendChild(el("p", { "class": "first" }, "Start fresh erases everything stored in this browser or in Claude. This cannot be undone."));
    body.appendChild(el("p", { "class": "hint" }, "Save a backup first if you think you’ll want anything back."));
    var msg = el("p", { "class": "msg", role: "status", "aria-live": "polite" });
    backupControls(body, msg); body.appendChild(msg);
    body.appendChild(el("h3", null, "Start with"));
    var choices = [["empty", "A blank slate"], ["original", "The sample quests"]], picked = "empty";
    choices.forEach(function (c) {
      var lab = el("label", { "class": "radiorow" }); var rb = el("input", { type: "radio", name: "fresh", value: c[0] }); rb.checked = c[0] === picked;
      on(rb, "change", function () { picked = c[0]; });
      lab.appendChild(rb); lab.appendChild(el("span", null, c[1])); body.appendChild(lab);
    });
    var ack = el("label", { "class": "radiorow" }); var cb = el("input", { type: "checkbox", id: "freshAck" });
    ack.appendChild(cb); ack.appendChild(el("span", null, "I understand that this will erase everything.")); body.appendChild(ack);
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
var BRANDMARK_MAX_DIM = 320;
var BRANDMARK_MAX_BYTES = 300 * 1024;
// Reads a chosen image file, rejecting it outright (no cropping or resizing)
// if it's too large in bytes or in either pixel dimension.
function readBrandmarkFile(file, msg, onDone) {
  if (file.size > BRANDMARK_MAX_BYTES) { msg.textContent = "File is larger than " + Math.round(BRANDMARK_MAX_BYTES / 1024) + " KB."; return; }
  var r = new FileReader();
  r.onerror = function () { msg.textContent = "The file could not be read."; };
  r.onload = function () {
    var img = new Image();
    img.onerror = function () { msg.textContent = "That file isn’t a usable image."; };
    img.onload = function () {
      if (img.naturalWidth > BRANDMARK_MAX_DIM || img.naturalHeight > BRANDMARK_MAX_DIM) {
        msg.textContent = "That image is " + img.naturalWidth + "×" + img.naturalHeight + " pixels. Each side must be " + BRANDMARK_MAX_DIM + " pixels or less.";
        return;
      }
      state.settings.brandmark = String(r.result); save(); msg.textContent = ""; onDone();
    };
    img.src = String(r.result);
  };
  r.readAsDataURL(file);
}
function brandmarkField() {
  var w = el("div", { "class": "field" });
  w.appendChild(el("label", null, "Brandmark"));
  w.appendChild(el("p", { "class": "hint" }, "Must be " + BRANDMARK_MAX_DIM + "×" + BRANDMARK_MAX_DIM + " pixels or smaller, and up to " + Math.round(BRANDMARK_MAX_BYTES / 1024) + " KB."));
  var msg = el("p", { "class": "msg", role: "alert" });
  var preview = el("div", { "class": "brandmarkpreview" });
  function renderPreview() {
    preview.innerHTML = "";
    if (state.settings.brandmark) {
      preview.appendChild(el("img", { src: state.settings.brandmark, alt: "Your brandmark" }));
      preview.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Remove the brandmark" }, "Remove"), "click", function () {
        state.settings.brandmark = ""; save(); renderPreview();
      }));
    } else {
      var file = el("input", { type: "file", id: "set-brandmark", accept: "image/*", hidden: "hidden", "aria-label": "Choose a brandmark image" });
      on(file, "change", function () {
        var f = file.files && file.files[0]; if (!f) return;
        readBrandmarkFile(f, msg, renderPreview); file.value = "";
      });
      preview.appendChild(on(el("button", { type: "button", "class": "small", title: "Add brandmark" }, "Add brandmark"), "click", function () { file.click(); }));
      preview.appendChild(file);
    }
  }
  renderPreview();
  w.appendChild(preview); w.appendChild(msg);
  return w;
}
// Set by app.js's beforeinstallprompt listener; null once installed or triggered.
var deferredInstallPrompt = null;
export function setDeferredInstallPrompt(e) { deferredInstallPrompt = e; }
function triggerInstall() {
  if (!deferredInstallPrompt) return;
  var p = deferredInstallPrompt;
  deferredInstallPrompt = null;
  p.prompt();
  renderChrome();
}

export function renderSettings(page) {
  // Side panel comes FIRST in DOM order so it stacks above the main settings
  // on a phone -- the opposite of .questsplit, where the charts column trails.
  var split = el("div", { "class": "setsplit" });
  var side = el("aside", { "class": "setside" });
  var root = el("div", { "class": "setmain" });
  split.appendChild(side); split.appendChild(root); page.appendChild(split);
  side.appendChild(el("h2", { "class": "first" }, "Your contact info"));
  side.appendChild(el("p", { "class": "hint" }, "Your contact info (global). If filled, this information will appear on the Quest Giver Export."));
  var contactBox = el("div", { "class": "box", style: "margin-top:10px" });
  var cg = el("div", { "class": "setgrid" });
  function cfield(key, id, label, type, full) {
    var w = el("div", { "class": "field" + (full ? " full" : "") }); w.appendChild(el("label", { "for": id }, label));
    var inp = el("input", { type: type || "text", id: id });
    inp.value = state.settings.contact[key];
    on(inp, "input", function () { state.settings.contact[key] = inp.value.slice(0, 200); save(); });
    w.appendChild(inp); cg.appendChild(w);
  }
  cfield("company", "set-contact-company", "Organization");
  cfield("name", "set-contact-name", "Name");
  cfield("phone", "set-contact-phone", "Phone", "tel");
  cfield("email", "set-contact-email", "Email", "email");
  cfield("website", "set-contact-website", "Website", "url", true);
  contactBox.appendChild(cg);
  var aw = el("div", { "class": "field" }); aw.appendChild(el("label", { "for": "set-contact-address" }, "Address"));
  var addr = el("textarea", { id: "set-contact-address", rows: 3 }); addr.value = state.settings.contact.address;
  on(addr, "input", function () { state.settings.contact.address = addr.value.slice(0, 500); save(); });
  aw.appendChild(addr); contactBox.appendChild(aw);
  contactBox.appendChild(brandmarkField());
  side.appendChild(contactBox);

  var msg = el("p", { "class": "msg schedulesmsg", role: "status", "aria-live": "polite" });
  root.appendChild(el("h2", { "class": "first" }, "Schedule defaults"));
  root.appendChild(el("p", { "class": "hint" }, "Set the default " + wl() + " length for all quests. Individual quests can have their own " + wl() + " length. You can also choose what to call a " + wl() + " throughout the app."));
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
  var tw = el("div", { "class": "field" }); tw.appendChild(el("label", { "for": "set-theme" }, "Theme"));
  var th = el("select", { id: "set-theme", "class": "plain" });
  [["auto", "Match this device"], ["light", "Light"], ["dark", "Dark"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if (o[0] === state.settings.theme) op.selected = true; th.appendChild(op); });
  on(th, "change", function () { state.settings.theme = th.value; applyTheme(); save(); });
  tw.appendChild(th); ag.appendChild(tw);
  appearanceBox.appendChild(ag);
  var ag2 = el("div", { "class": "setgrid", style: "margin-top:10px" });
  var sw = el("div", { "class": "field" }); sw.appendChild(el("label", { "for": "set-splash" }, "Splash screen on open"));
  var ss = el("select", { id: "set-splash", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.showSplash) op.selected = true; ss.appendChild(op); });
  on(ss, "change", function () { state.settings.showSplash = ss.value === "on"; save(); });
  sw.appendChild(ss); ag2.appendChild(sw);
  var abw = el("div", { "class": "field" }); abw.appendChild(el("label", { "for": "set-animated-burndown" }, "Animated burndown"));
  var abs = el("select", { id: "set-animated-burndown", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.animatedBurndown) op.selected = true; abs.appendChild(op); });
  on(abs, "change", function () { state.settings.animatedBurndown = abs.value === "on"; save(); });
  abw.appendChild(abs); ag2.appendChild(abw);
  var fxw = el("div", { "class": "field" }); fxw.appendChild(el("label", { "for": "set-completion-fx" }, "Completion FX"));
  var fxs = el("select", { id: "set-completion-fx", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.completionFx) op.selected = true; fxs.appendChild(op); });
  on(fxs, "change", function () { state.settings.completionFx = fxs.value === "on"; save(); });
  fxw.appendChild(fxs); ag2.appendChild(fxw);
  var aw2 = el("div", { "class": "field" }); aw2.appendChild(el("label", { "for": "set-audio" }, "Sound Effects"));
  var as = el("select", { id: "set-audio", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.audio) op.selected = true; as.appendChild(op); });
  on(as, "change", function () { state.settings.audio = as.value === "on"; save(); });
  aw2.appendChild(as); ag2.appendChild(aw2);
  appearanceBox.appendChild(ag2);
  root.appendChild(appearanceBox);

  root.appendChild(el("h2", null, "Vault"));
  var vaultBox = el("div", { "class": "box", style: "margin-top:10px" });
  var pg = el("div", { "class": "setgrid" });
  var pw = el("div", { "class": "field" }); pw.appendChild(el("label", { "for": "set-purge" }, "Auto-delete Vaulted items after"));
  var ps = el("select", { id: "set-purge", "class": "plain" });
  [[0, "Never"], [7, "7 days"], [30, "30 days"], [60, "60 days"], [90, "90 days"]].forEach(function (o) { var op = el("option", { value: String(o[0]) }, o[1]); if (o[0] === state.settings.vaultPurgeDays) op.selected = true; ps.appendChild(op); });
  on(ps, "change", function () { state.settings.vaultPurgeDays = parseInt(ps.value, 10); changed(); });
  pw.appendChild(ps); pg.appendChild(pw);
  vaultBox.appendChild(pg);
  if (state.settings.vaultPurgeDays) vaultBox.appendChild(el("p", { "class": "hint" }, "Checked each time Sidequest opens. An item older than this, counted from when it was vaulted, is deleted permanently with no further warning."));
  root.appendChild(vaultBox);

  var inClaudeNow = false;
  try { inClaudeNow = !!(window.claude && typeof window.claude.use === "function"); } catch (e) { inClaudeNow = false; }
  if (!inClaudeNow) {
    root.appendChild(el("h2", null, "Install Sidequest"));
    var installBox = el("div", { "class": "box", style: "margin-top:10px" });
    if (deferredInstallPrompt) {
      installBox.appendChild(el("p", { "class": "hint first" }, "Install Sidequest as an app on your computer or mobile device. PWA installation is not supported by all browsers or devices."));
      installBox.appendChild(on(el("button", { type: "button", id: "installBtn" }, "Install Sidequest"), "click", triggerInstall));
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      installBox.appendChild(el("p", { "class": "hint first" }, "On iPhone or iPad: tap Share, then Add to Home Screen."));
    } else {
      installBox.appendChild(el("p", { "class": "hint first" }, "Sidequest is already installed as an app, or your browser does not support PWA installation."));
      var uninst = el("p", { "class": "hint" });
      uninst.appendChild(document.createTextNode("To uninstall Sidequest, open your browser and go to "));
      uninst.appendChild(el("code", null, "chrome://apps"));
      uninst.appendChild(document.createTextNode(" or "));
      uninst.appendChild(el("code", null, "edge://apps"));
      uninst.appendChild(document.createTextNode(". Right-click the Sidequest icon and select "));
      uninst.appendChild(el("strong", null, "Remove"));
      uninst.appendChild(document.createTextNode(" or "));
      uninst.appendChild(el("strong", null, "Uninstall"));
      uninst.appendChild(document.createTextNode("."));
      installBox.appendChild(uninst);
    }
    root.appendChild(installBox);
  }

  root.appendChild(el("h2", null, "Import"));
  root.appendChild(el("p", { "class": "hint" }, "Bring in tasks from Trello (JSON) or Todoist (CSV) as a new quest."));
  var importBox = el("div", { "class": "box", style: "margin-top:10px" });
  importPanel(importBox);
  root.appendChild(importBox);

  root.appendChild(el("h2", null, "Backup and restore"));
  var backupBox = el("div", { "class": "box", style: "margin-top:10px" });
  backupPanel(backupBox, root);
  root.appendChild(backupBox);

  root.appendChild(el("h2", null, "Start fresh"));
  var box = el("div", { "class": "dangerbox" });
  box.appendChild(el("p", { "class": "first" }, "Erase all Sidequest data stored in this browser or in Claude and start again. You’ll see a warning and have a chance to save a backup first."));
  box.appendChild(on(el("button", { type: "button", "class": "danger", style: "margin-top:12px", id: "startFresh", title: "Erase everything and start over" }, "Start fresh…"), "click", startFreshDialog));
  root.appendChild(box);

  root.appendChild(el("h2", null, "About"));
  var ab = el("div", { "class": "box about" });
  ab.appendChild(el("p", { style: "font-weight:600", "class": "first" }, APP_NAME));
  ab.appendChild(el("p", { "class": "hint" }, "Version " + APP_VERSION));
  var sp = el("p", { "class": "hint" });
  var supportLink = el("a", { href: "https://www.paypal.com/paypalme/timsamoff", target: "_blank", rel: "noopener", "class": "textbtn", style: "display:inline-flex;align-items:center;gap:6px" });
  supportLink.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="2" x2="6" y2="4"></line><line x1="10" y1="2" x2="10" y2="4"></line><line x1="14" y1="2" x2="14" y2="4"></line></svg>';
  supportLink.appendChild(document.createTextNode("Support Sidequest"));
  sp.appendChild(supportLink); ab.appendChild(sp);
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
// Reads a Trello JSON board export into a plain summary Sidequest can act on.
// Only name/desc/due/checklist-items survive; labels, members, comments,
// attachments, and custom fields are dropped by design, not by oversight.
function parseTrelloExport(obj) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.cards)) return null;
  var boardName = typeof obj.name === "string" && obj.name ? obj.name : "Imported board";
  var checklistsById = {};
  (obj.checklists || []).forEach(function (c) { checklistsById[c.id] = c; });
  var dropped = 0;
  if ((obj.labels || []).length) dropped += obj.labels.length;
  if ((obj.members || []).length) dropped += obj.members.length;
  var cards = (obj.cards || []).filter(function (c) { return !c.closed; }).map(function (c) {
    // Completion can live directly on a checkItem (state) or, in a real
    // Trello export, on the card's own checkItemStates by idCheckItem -- check both.
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
function isISOInstant(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v); }
// Builds a new quest from a parsed Trello summary: start is the earliest due
// date found (or today, with nothing to anchor to), so every card's own due
// date is guaranteed on or after the quest's start and never gets rejected.
function buildQuestFromTrello(summary) {
  var dues = summary.cards.map(function (c) { return c.due; }).filter(Boolean).sort();
  var start = dues.length ? dues[0] : iso(TODAY);
  var p = makeQuest(uid(), S(summary.boardName, 120) || "Imported board", "active", { start: start });
  var tasks = summary.cards.map(function (c) {
    var blk = 0, due = "";
    if (c.due) { var b = blockForDate(p.id, parseISO(c.due)); if (b !== null) { blk = b; due = c.due; } }
    var t = task(uid(), blk, p.id, S(c.name, 300), false, c.steps.map(function (s) { return st(uid(), s.text, false, s.done); }));
    t.notes = c.desc; t.due = due; t.added = due ? iso(TODAY) : "";
    return t;
  });
  return { quest: p, tasks: tasks };
}
function importTrelloFile(file, msg) {
  var r = new FileReader();
  r.onerror = function () { msg.textContent = "The file could not be read."; };
  r.onload = function () {
    var obj = null;
    try { obj = JSON.parse(String(r.result || "")); } catch (e) { obj = null; }
    var summary = obj && parseTrelloExport(obj);
    if (!summary) { msg.textContent = "That does not look like a Trello board export."; return; }
    msg.textContent = "";
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
function parseCsv(text) {
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
var TODOIST_HEADER_FIELDS = ["TYPE", "CONTENT", "DESCRIPTION", "PRIORITY", "INDENT", "DATE", "DEADLINE"];
// Reads a Todoist per-project CSV export into a plain summary. Sections are
// informational only; subtasks (INDENT > 1) flatten to their own tasks,
// since Sidequest has no sub-task-of-a-task concept, only Task -> Step.
function parseTodoistExport(text) {
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
function isPlainISODate(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }
// Todoist's natural-language date field: a real ISO date is used as-is;
// "today"/"tomorrow"/"in N day(s)" are unambiguous and resolved to a real
// date; anything else (a recurrence phrase like "every day", or unrecognized
// text) is left unscheduled rather than guessed at.
function resolveTodoistDate(v) {
  if (isPlainISODate(v)) return v;
  var s = (v || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "today") return iso(TODAY);
  if (s === "tomorrow") return iso(addDays(TODAY, 1));
  var m = s.match(/^in (\d+) days?$/);
  if (m) return iso(addDays(TODAY, parseInt(m[1], 10)));
  return "";
}
function buildQuestFromTodoist(summary, name) {
  var dues = summary.items.map(function (c) { return c.due; }).filter(Boolean).sort();
  var start = dues.length ? dues[0] : iso(TODAY);
  var p = makeQuest(uid(), S(name, 120) || "Imported from Todoist", "active", { start: start });
  var tasks = summary.items.map(function (c) {
    var blk = 0, due = "";
    if (c.due) { var b = blockForDate(p.id, parseISO(c.due)); if (b !== null) { blk = b; due = c.due; } }
    var t = task(uid(), blk, p.id, c.name, false, []);
    t.notes = c.section ? "Section: " + c.section : ""; t.due = due; t.added = due ? iso(TODAY) : "";
    return t;
  });
  return { quest: p, tasks: tasks };
}
function importTodoistFile(file, msg) {
  var name = file.name.replace(/\.csv$/i, "");
  var r = new FileReader();
  r.onerror = function () { msg.textContent = "The file could not be read."; };
  r.onload = function () {
    var summary = parseTodoistExport(String(r.result || ""));
    if (!summary) { msg.textContent = "That does not look like a Todoist project export."; return; }
    msg.textContent = "";
    var nt = summary.items.length;
    openModal("Import “" + name + "”?", function (body) {
      var lines = [nt + (nt === 1 ? " task was" : " tasks were") + " found."];
      lines.push("Completed tasks are not in this file, so only what is still open comes across.");
      if (summary.capped) lines.push("This file has 300 tasks, Todoist’s own export limit, so some tasks may be missing from the file itself.");
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
// of `root`, so a caller can keep it outside the card wrapping the rest.
export function backupPanel(root, hintHost) {
  (hintHost || root).appendChild(el("p", { "class": "hint" }, "Your data is saved in this browser on this device, or in Claude when using Sidequest there. Create a backup from time to time and keep the file somewhere safe. You can restore your data from a backup at any time."));
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
