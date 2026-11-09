import { state, ui, save, changed, autoVault, STATUSES, APP_NAME, APP_VERSION, SIDEQUEST_RAW_URL, isISO, defaults, setState, normalize, makeQuest, task, st, S, removeLinksTo } from "./state.js";
import { DAY, iso, parseISO, TODAY, fmt, fmtY, weekStart, addDays } from "./dates.js";
import {
  WORDS, wd, wl, pset, questDueLimit, dateProblems, blockStartFor, blockEndFor, blockForDate, projKey, taskStart, taskEnd,
  checkpoints, live, counted, planCounted, liveQuests, activeQuests, candidateQuests,
  findQuest, isDusty, findAnyQuest, linkedQuests, linkQuests, unlinkQuests, dispQuest, dispWhat,
  totalUnits, remainingUnits, planned, ordered, backlogTasks, sortTasks,
  isLate, lateTasks, setStatus, syncFromSteps, nextTask, questTasksAllDone, questTotalUnits, questRemainingUnits,
  validPage, isPinned, pinPage, unpinPage, questMeta, fmtHours, fmtHoursLong, estimateWarning, questEstimate, recordHist, checkpointStep, globalActual,
  findStep, decisionFor, short, launchItems, stepOptions, taskOptions, findTask, questTasks, openJobs, isJobLate, handJobs, deckJobs, rerollPick
} from "./model.js";
import { $, el, on, uid, setFocusKey, notify, scrollTop, pencilButton, editInline, playSfx, prepareSfx, moneyInput, formatMoney, inClaude, isHosted, helpLink, setHelpOpener } from "./dom.js";
import { drawChart, drawQuestChart, rangeBlock, questRangeBlock } from "./chart.js";
import { playConfetti } from "./confetti.js";
import { startTutorial } from "./tutorial.js";
import { openTask, go, renderView, renderAll, renderChrome, applyTheme, replaySplash } from "./app.js";
import { formDialog, stepDialog, decisionDialog, decisionEditDialog, linkQuestDialog, ideaDialog, slipDialog, taskDialog, confirmDialog, openModal, openModalOver, closeModal, closeAllModals } from "./dialogs.js";
import { buildExportSnapshot, renderExportDocument, exportFileName, exportSides } from "./export.js";

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
  if (!t.added || !t.questId || t.added <= pset(t.questId).start) return null;
  return el("span", { "class": "chip added", title: "Added to the plan after this quest started" }, "Added " + fmt(parseISO(t.added)));
}
export function nextUpPanel() {
  var box = el("div", { "class": "panel" });
  var t = nextTask();
  if (!t) {
    var nb = backlogTasks().length;
    box.appendChild(el("p", { "class": "ptitle" }, nb ? "Nothing is scheduled." : (planCounted().length ? "All tasks complete!" : "No tasks yet.")));
    var emptyMeta = nb ? nb + (nb === 1 ? " item is" : " items are") + " waiting in the Backlog. Choose a " + wl() + " for one." : (planCounted().length ? "" : (candidateQuests().length || activeQuests().length ? "Start one with the + button." : "Start a candidate quest with the + button to add tasks."));
    if (emptyMeta) box.appendChild(el("p", { "class": "pmeta" }, emptyMeta));
    if (nb) { var ba = el("div", { "class": "actions" }); ba.appendChild(on(el("button", { type: "button", "class": "primary", title: "Go to the Backlog on the Tasks page" }, "Open the Backlog"), "click", function () { go("schedule"); })); box.appendChild(ba); }
    return box;
  }
  box.appendChild(el("p", { "class": "ptitle" }, dispWhat(t)));
  var meta = el("p", { "class": "pmeta" });
  var pname = dispQuest(t);
  if (validPage("quest:" + t.questId)) {
    var pl = el("button", { type: "button", "class": "textbtn qlink", title: "View this quest" }, pname);
    on(pl, "click", function () { go("quest:" + t.questId); });
    meta.appendChild(pl);
  } else meta.appendChild(el("b", null, pname));
  meta.appendChild(document.createTextNode(" · " + fmt(taskStart(t)) + " to " + fmt(taskEnd(t)) + " "));
  if (isLate(t)) meta.appendChild(el("span", { "class": "badge" }, "Overdue"));
  box.appendChild(meta);
  box.appendChild(el("p", { "class": "pline" }, "Done when: " + t.done));
  var open = t.steps.filter(function (s) { return !s.done; })[0];
  if (open && t.steps.length) box.appendChild(el("p", { "class": "pline" }, "Next step: " + open.text));
  var acts = el("div", { "class": "actions" });
  if (t.status === "Not started") acts.appendChild(on(el("button", { type: "button", "class": "primary", title: "Mark in progress" }, "Start"), "click", function () { t.status = "In progress"; changed(); }));
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
  var box = el("div");
  box.appendChild(el("h2", { "class": "first" }, "Overdue"));
  if (!late.length) {
    var none = el("div", { "class": "box", style: "margin-top:8px" });
    none.appendChild(el("p", { "class": "hint first" }, "Nothing is overdue.")); box.appendChild(none); return box;
  }
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
// Auto-completion only; runs on every changed(). Skips a quest Reopen just reactivated, so it does not refire.
export function sweepQuestCompletion() {
  activeQuests().forEach(function (p) {
    if (p.justReopened) { p.justReopened = false; return; }
    if (questTasksAllDone(p)) { p.status = "complete"; completionDialog(p); }
  });
}
// Shared vault path for the Vault button, Mark complete, and the auto-sweep.
export function vaultQuest(p) {
  removeToVault(p, "Quest", function () {
    state.tasks.forEach(function (t) { if (t.questId === p.id && !t.vault) t.vault = { at: iso(TODAY), why: "removed" }; });
  });
}
// Asks which letterhead sides to include, offering only the sides that have something to print. With neither, it exports at once.
function askExportSides(p) {
  var sides = exportSides(p);
  if (!sides.by && !sides.forWhom) { exportQuestForClient(p); return; }
  var fields = [];
  if (sides.by) fields.push({ key: "by", label: "Include “Prepared by” (your contact info and brandmark from Options)", type: "checkbox", value: true });
  if (sides.forWhom) fields.push({ key: "forWhom", label: "Include “Prepared for” (this quest’s Quest giver)", type: "checkbox", value: true });
  formDialog("Quest giver export", fields, "Export", function (v) {
    exportQuestForClient(p, { preparedBy: !sides.by || v.by === "1", preparedFor: !sides.forWhom || v.forWhom === "1" });
  }, "Choose what appears at the top of the export.");
}
// Builds the standalone read-only export and offers it for saving, same
// fallback order as saveBackupFile(). Scoped to Active/Complete quests only.
export function exportQuestForClient(p, opts) {
  var snapshot = buildExportSnapshot(p, opts);
  var html = renderExportDocument(snapshot);
  var name = exportFileName(p);
  function exported() { notify("Exported " + p.name + "."); }
  saveFile(name, html, "text/html", "Sidequest export", ".html", exported).then(function (r) {
    if (r !== "manual") exported();
  }).catch(function (err) {
    notify(err && (err.code === "declined" || err.name === "AbortError") ? "Export canceled." : "The export could not be saved.");
  });
}
// Offers vaulting now or leaving it in Quests.
export function completionDialog(p) {
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
  cb.appendChild(lg);
  if (quest) drawQuestChart(host, quest, o.wide); else drawChart(host, o.wide);
  if (host.dataset.forecast) { var l4 = el("span"); l4.appendChild(el("i", { "class": "f" })); l4.appendChild(document.createTextNode("Forecast")); lg.appendChild(l4); }
  var l3 = el("span"); l3.appendChild(el("i", { "class": "s" })); l3.appendChild(document.createTextNode("Scope")); lg.appendChild(l3);
  var rn = quest ? questRemainingUnits(quest) : remainingUnits(), tot = quest ? questTotalUnits(quest) : totalUnits(), rb = el("div", { "class": "box" });
  var nbk = quest ? counted().filter(function (t) { return t.questId === quest.id && t.block === 0; }).length : backlogTasks().length;
  rb.appendChild(el("p", { "class": "hint first remaining" }, "Remaining: " + rn + " of " + tot + (tot === 1 ? " task" : " tasks") + (nbk ? " | Backlog: " + nbk + " unscheduled " + (nbk === 1 ? "task" : "tasks") : "")));
  return { h: h, chart: cb, count: rb };
}
export function burnPanel(o) {
  var box = el("div"), b = burnParts(o);
  b.count.style.marginTop = "0";
  box.appendChild(b.h); box.appendChild(b.chart); box.appendChild(el("h2", null, "Stats")); box.appendChild(b.count);
  return box;
}
export function welcomeBox() {
  var box = el("div", { "class": "box welcomebox", style: "margin-bottom:22px" });
  box.appendChild(el("h2", { style: "margin-bottom:4px" }, "Welcome to Sidequest"));
  var welcomeHint = el("p", { "class": "hint first" });
  welcomeHint.appendChild(el("strong", null, "Your new adventure begins here!"));
  var blank = !state.quests.length;
  function strong(t) { return el("strong", null, t); }
  function txt(t) { return document.createTextNode(t); }
  if (blank) welcomeHint.appendChild(txt(" You’re looking at a blank slate now, but that won’t last long. Time to start questing!"));
  else {
    welcomeHint.appendChild(txt(" These sample quests are here for you to explore. Look around, make changes, and press / to search. You can edit the existing quests or, when you’re ready to start your own, open "));
    welcomeHint.appendChild(strong("Options")); welcomeHint.appendChild(txt(" and choose ")); welcomeHint.appendChild(strong("Start fresh")); welcomeHint.appendChild(txt("."));
  }
  welcomeHint.appendChild(txt(" Press ")); welcomeHint.appendChild(strong("Play tutorial")); welcomeHint.appendChild(txt(" for a short walkthrough of adding a quest, giving it a task, and starting it."));
  box.appendChild(welcomeHint);
  var acts = el("div", { "class": "actions" });
  if (!blank) acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "welcomeSettings", title: "Open Options" }, "Open Options"), "click", function () {
    go("settings");
    // The welcome text sends people here for Start fresh, so land on it.
    var h = $("startFreshHeading");
    if (h) { if (typeof h.scrollIntoView === "function") h.scrollIntoView(); h.focus({ preventScroll: true }); }
  }));
  acts.appendChild(on(el("button", { type: "button", "class": "tutorialbtn", id: "welcomePlay", title: "Play the first-run walkthrough" }, "Play tutorial"), "click", function () { go("today"); startTutorial(); }));
  acts.appendChild(on(el("button", { type: "button", id: "welcomeDismiss", title: "Hide this welcome message" }, "Dismiss"), "click", function () { state.settings.hideWelcome = true; save(); renderView(); }));
  box.appendChild(acts);
  return box;
}
export function renderToday(root) {
  if (availableUpdateVersion && state.settings.dismissedUpdateVersion !== availableUpdateVersion) root.appendChild(updateBanner());
  if (backupReminderDue()) root.appendChild(backupReminder());
  if (!state.settings.hideWelcome) root.appendChild(welcomeBox());
  var g = pgrid(), b = burnParts({});
  g.put(withHelp(el("h2", null, "Next up"), "next-up", "Next up"), 1, 1); g.put(nextUpPanel(), 1, 2); g.put(overduePanel(), 1, 3);
  var progress = el("div"); b.count.style.marginTop = "0";
  progress.appendChild(el("h2", { "class": "progresshead" }, "Stats")); progress.appendChild(b.count);
  g.put(b.h, 2, 1); g.put(b.chart, 2, 2); g.put(progress, 2, 3);
  root.appendChild(g);
}
// Shown when a newer db version stamp exists (checkForAppUpdate() in state.js). Dismissing records the version, so a later update gets its own notice.
function updateBanner() {
  var box = el("div", { "class": "box updatebanner", style: "margin-bottom:22px" });
  box.appendChild(el("h2", { "class": "first", style: "margin-bottom:4px" }, "Sidequest has leveled up!"));
  box.appendChild(el("p", { "class": "hint first" }, "You are questing in version " + APP_VERSION + ", and Sidequest version " + availableUpdateVersion + " is ready to go. To update, copy the prompt below and paste it into your AI chat."));
  // The ?v= suffix makes the link a new address, so a fetch tool that cached an older copy cannot reuse it.
  var promptText = "Please update my Sidequest artifact with the latest version, keeping all of my existing data.\n" + SIDEQUEST_RAW_URL + "?v=" + availableUpdateVersion;
  var field = el("textarea", { "class": "updateprompt", readonly: "readonly", rows: "1", "aria-label": "Update prompt to paste into your AI chat" });
  field.value = promptText;
  on(field, "focus", function () { field.select(); });
  box.appendChild(field);
  // Sized to its text (the long URL wraps on a phone), once it is in the page.
  function fit() { if (!field.isConnected) return; field.style.height = "auto"; field.style.height = field.scrollHeight + 2 + "px"; }
  setTimeout(fit, 0); window.addEventListener("resize", fit);
  box.appendChild(el("p", { "class": "hint" }, "None of your data will be touched."));
  var ar = el("div", { "class": "actions" });
  function copyPrompt() {
    function fallback() { field.focus(); field.select(); try { document.execCommand("copy"); notify("Prompt copied."); } catch (e) { notify("Select the prompt and copy it."); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(promptText).then(function () { notify("Prompt copied."); }, fallback);
    else fallback();
  }
  ar.appendChild(on(el("button", { type: "button", "class": "primary", title: "Copy the prompt" }, "Copy prompt"), "click", copyPrompt));
  ar.appendChild(on(el("button", { type: "button", title: "Hide this notice for this version" }, "Dismiss"), "click", function () {
    state.settings.dismissedUpdateVersion = availableUpdateVersion; save(); box.remove();
  }));
  box.appendChild(ar);
  return box;
}
// A notice at the top of Today once it has been two weeks without a backup, with the button right there.
function backupReminder() {
  var n = daysSinceBackup(), box = el("div", { "class": "box backupreminder", style: "margin-bottom:22px" });
  box.appendChild(el("p", { "class": "first" }, state.settings.lastBackup ? "It has been " + n + " days since your last backup." : "You have used Sidequest for " + n + " days without saving a backup."));
  box.appendChild(el("p", { "class": "hint" }, "Your data is stored in this browser on this device. A backup file protects it if the browser’s data is ever cleared."));
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
  if (t.block !== 0) l1t.appendChild(document.createTextNode(" · " + fmt(taskStart(t)) + " to " + fmt(taskEnd(t))));
  l1.appendChild(l1t);
  var tag1 = addedChip(t); if (tag1) l1.appendChild(tag1);
  b.appendChild(l1);
  var l2 = el("div", { "class": "l2" });
  if (t.block === 0) l2.appendChild(el("span", { "class": "chip backlog", style: "margin-right:8px" }, "Backlog"));
  if (t.launch) l2.appendChild(el("span", { "class": "chip launchcrit", style: "margin-right:8px" }, "Launch critical"));
  if (t.milestone) l2.appendChild(el("span", { "class": "chip milestonechip", style: "margin-right:8px" }, "Milestone"));
  l2.appendChild(document.createTextNode(dispWhat(t)));
  b.appendChild(l2);
  var l3 = el("div", { "class": "l3" });
  l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
  stepsAndEst(l3, t);
  if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
  b.appendChild(l3);
  on(b, "click", function () { ui.sel = t.id; ui.detail = true; renderView(); scrollTop(); });
  li.appendChild(b); return li;
}
// A one-line empty state in the same card the lists use.
function emptyList(text) {
  var ul = el("ul", { "class": "list", style: "margin-top:0" });
  ul.appendChild(el("li", { "class": "hint" }, text));
  return ul;
}
export function renderSchedule(root) {
  var o = ordered(), bl = backlogTasks();
  if (!o.length && !bl.length) {
    root.appendChild(emptyList(planCounted().length ? "No open tasks. Completed tasks are in the Vault." : "No tasks yet. Use the + button to add one."));
    return;
  }
  if (!ui.sel || !findTask(ui.sel)) { var nt = nextTask() || o[0] || bl[0]; ui.sel = nt.id; }
  var split = el("div", { "class": "split" + (ui.detail ? " detail-open" : "") });
  var lp = el("div", { "class": "listpane" });
  var ul = el("ul", { "class": "tlist" });
  if (!o.length) ul.appendChild(el("li", { "class": "plain" }, "Nothing is scheduled. Choose a " + wl() + " for an item in the Backlog."));
  o.forEach(function (t) { ul.appendChild(taskRow(t)); });
  lp.appendChild(ul);
  if (bl.length) {
    lp.appendChild(withHelp(el("h2", null, "Backlog (" + bl.length + ")"), "backlog", "Backlog"));
    lp.appendChild(el("p", { "class": "hint" }, "All tasks that don’t have a due date yet."));
    var bul = el("ul", { "class": "tlist", style: "margin-top:10px" });
    bl.forEach(function (t) { bul.appendChild(taskRow(t)); });
    lp.appendChild(bul);
  }
  var dp = el("div", { "class": "detailpane" }); dp.appendChild(buildDetail(findTask(ui.sel)));
  split.appendChild(lp); split.appendChild(dp); root.appendChild(split);
  // A pane taller than the window scrolls with the page until its bottom shows, then pins.
  dp.style.top = Math.min(84, window.innerHeight - dp.offsetHeight - 16) + "px";
}

// `inline` is the quest page's in-place version: no heading or back button, plus an Open in Tasks link.
export function buildDetail(t, inline, readOnly) {
  var box = el("div", { "class": "detail" });
  var top = el("div", { style: "display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap" });
  var lh = el("div");
  if (!inline) lh.appendChild(el("h2", { style: "margin:0" }, dispQuest(t)));
  var dm = el("p", { "class": "dmeta" });
  if (t.block === 0) dm.appendChild(el("span", { "class": "chip backlog", style: "margin-right:6px" }, "Backlog"));
  else dm.appendChild(document.createTextNode(fmt(taskStart(t)) + " to " + fmt(taskEnd(t)) + " "));
  if (isLate(t)) dm.appendChild(el("span", { "class": "badge" }, "Overdue"));
  var tag2 = addedChip(t); if (tag2) { tag2.style.marginLeft = "6px"; dm.appendChild(tag2); }
  lh.appendChild(dm); top.appendChild(lh);
  var right = el("div", { style: "display:flex;gap:10px;align-items:center" });
  if (t.launch) right.appendChild(el("span", { "class": "chip launchcrit" }, "Launch critical"));
  if (t.milestone) right.appendChild(el("span", { "class": "chip milestonechip" }, "Milestone"));
  if (readOnly) {
    right.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
  } else {
    var sel = el("select", { "class": "status", "aria-label": "Status" });
    STATUSES.forEach(function (s) { var o = el("option", { value: s }, s); if (s === t.status) o.selected = true; sel.appendChild(o); });
    sel.setAttribute("data-v", t.status);
    on(sel, "change", function () { setStatus(t, sel.value); changed(); });
    right.appendChild(sel);
  }
  top.appendChild(right); box.appendChild(top);
  var whatRow = el("div", { "class": "editrow" });
  var whatP = el("p", { "class": "what", style: "flex:0 1 auto;min-width:0" }, dispWhat(t)); whatRow.appendChild(whatP);
  if (!readOnly) {
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
  box.appendChild(el("p", { "class": "dmeta" }, "Done when: " + t.done));
  if (readOnly) {
    box.appendChild(el("p", { "class": "dmeta" }, t.est > 0 ? "Estimated time: " + t.est + " h" : ""));
  }
  if (!readOnly) {
    var dg = el("div", { "class": "setgrid" });
    var smsg = el("p", { "class": "msg schedmsg errmsg", role: "status", "aria-live": "polite" });
    var dmsg = el("p", { "class": "msg schedmsg errmsg", role: "status", "aria-live": "polite" });
    var emsg = el("p", { "class": "msg schedmsg errmsg", role: "status", "aria-live": "polite" });
    function dfield(id2, label, input) { var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id2 }, label)); w.appendChild(input); dg.appendChild(w); return w; }
    function shownStart() { return t.start ? t.start : (t.block === 0 ? "" : iso(taskStart(t))); }
    function shownDue() { return t.block === 0 ? "" : iso(taskEnd(t)); }
    var sd = el("input", { type: "date", id: "task-start" }), bd = el("input", { type: "date", id: "task-due" });
    var ei = el("input", { type: "number", id: "task-est", min: "0", max: "9999", step: "0.25", inputmode: "decimal" });
    sd.value = shownStart(); bd.value = shownDue(); ei.value = t.est > 0 ? t.est : "";
    if (t.block > 0) emsg.textContent = estimateWarning(t.est, taskStart(t), taskEnd(t));
    var questFirst = parseISO(pset(projKey(t)).start);
    // A bad date stays in its field with its message until it is fixed; nothing is saved or reverted. "change" fires per segment while typing, so saving waits for blur.
    function liveCheck() { var m = dateProblems(projKey(t), sd.value, bd.value); smsg.textContent = m.start; dmsg.textContent = m.due; return m; }
    ["input", "change"].forEach(function (ev) { on(bd, ev, liveCheck); on(sd, ev, liveCheck); });
    on(bd, "blur", function () {
      if (bd.value === shownDue()) return;
      var m = liveCheck();
      if (bd.value === "") { var hadStart = !!t.start; t.block = 0; t.due = ""; t.added = ""; changed(); notify(hadStart ? "Moved to the Backlog. Its start date is kept." : "Moved to the Backlog."); return; }
      if (!isISO(bd.value)) { dmsg.textContent = "Enter a valid due date, or leave it empty for the Backlog."; return; }
      var blk = blockForDate(projKey(t), parseISO(bd.value));
      if (blk === null || m.due || m.start.indexOf("You can’t begin") === 0) { if (!dmsg.textContent && !smsg.textContent) dmsg.textContent = "This quest starts " + fmtY(questFirst) + ". Pick a due date on or after that."; return; }
      if (t.start && bd.value < t.start) { smsg.textContent = "You can’t begin after you finish! Pick a start date on or before the due date."; return; }
      if (t.block === 0) t.added = iso(TODAY);
      t.due = bd.value; t.block = blk; changed();
      notify("Due " + fmt(taskEnd(t)) + ", in " + wd() + " " + blk + ".");
    });
    on(sd, "blur", function () {
      if (sd.value === shownStart()) return;
      var m = liveCheck();
      if (sd.value === "") { smsg.textContent = ""; t.start = ""; changed(); notify(t.block === 0 ? "Start date cleared." : "Start date cleared. The task starts when its " + wl() + " does."); return; }
      if (!isISO(sd.value)) { smsg.textContent = "Enter a valid start date, or leave it empty."; return; }
      if (m.start) return;
      if (t.block > 0 && sd.value > iso(taskEnd(t))) { smsg.textContent = "You can’t begin after you finish! Pick a start date on or before the due date."; return; }
      t.start = sd.value; changed(); notify("Start date saved.");
    });
    // Warn while typing; saving still waits for blur.
    on(ei, "input", function () { emsg.textContent = t.block > 0 ? estimateWarning(parseFloat(ei.value), taskStart(t), taskEnd(t)) : ""; });
    on(ei, "blur", function () {
      var v = ei.value === "" ? 0 : parseFloat(ei.value);
      if (isNaN(v) || v < 0 || v > 9999) { ei.value = t.est > 0 ? t.est : ""; emsg.textContent = "Enter the estimated time as hours from 0 to 9999."; return; }
      v = Math.round(v * 100) / 100;
      if (v === (t.est || 0)) return;
      emsg.textContent = "";
      t.est = v; changed();
      notify(v > 0 ? "Estimated time saved." : "Estimated time cleared.");
    });
    dfield("task-start", "Start date (optional)", sd); dfield("task-due", "Due date (leave empty to backlog)", bd); dg.appendChild(smsg); dg.appendChild(dmsg); dfield("task-est", "Estimated time (hours)", ei).appendChild(emsg);
    box.appendChild(dg);
  }

  var nDone = t.steps.filter(function (s) { return s.done; }).length;
  box.appendChild(el("h3", null, t.steps.length ? "Steps (" + nDone + " of " + t.steps.length + " done)" : "Steps"));
  if (!t.steps.length) box.appendChild(el("p", { "class": "hint" }, "No steps yet. This task counts as one item in the burndown. Add steps to break it up."));
  if (t.steps.length && !readOnly) box.appendChild(el("p", { "class": "hint" }, "Use a step’s pencil to rename it in place, or Remove to delete it."));
  var ul = el("ul", { "class": "steps" });
  t.steps.forEach(function (s) {
    var sli = el("li", { "class": s.done ? "done" : "" });
    var lab = el("label"); var cb = el("input", { type: "checkbox" }); cb.checked = s.done;
    var dc = decisionFor(s.id);
    if (readOnly) {
      cb.disabled = true;
      lab.appendChild(cb); lab.appendChild(el("span", null, s.text)); sli.appendChild(lab);
      if (dc) sli.appendChild(el("p", { "class": "hint", style: "margin:4px 0 0" }, (dc.a ? "Decision: " : "Decision (open): ") + dc.q + (dc.a ? " — " + dc.a : "")));
    } else {
      on(cb, "change", function () { s.done = cb.checked; syncFromSteps(t); changed(); });
      var textSpan = el("span", null, s.text);
      lab.appendChild(cb); lab.appendChild(textSpan);
      var stepTop = el("div", { "class": "steptop" }); stepTop.appendChild(lab); sli.appendChild(stepTop);
      var ac = el("div", { "class": "li-actions stepactions" });
      if (dc) ac.appendChild(on(el("button", { type: "button", "class": "small", "aria-label": "Open the decision for this step", title: "Open this decision" }, dc.a ? "Decision: decided" : "Decision: open"), "click", function () { decisionEditDialog(dc, function () { removeNow(dc, "decisions", "Decision"); }); }));
      else ac.appendChild(on(el("button", { type: "button", "class": "small", "aria-label": "Add a decision to this step: " + s.text, title: "Add a decision to this step" }, "Add decision"), "click", function () { decisionDialog({ step: s.id }); }));
      var stepPen = pencilButton("Rename this step", "Rename this step");
      on(stepPen, "click", function () {
        stepPen.hidden = true; sli.classList.add("editing");
        editInline(textSpan, {
          label: "Step", max: 300, value: function () { return s.text; },
          onSave: function (v) { s.text = v.slice(0, 300); changed(); },
          onEmpty: function () { notify("A step needs text."); },
          onDone: function () { stepPen.hidden = false; sli.classList.remove("editing"); }
        });
      });
      stepTop.appendChild(stepPen);
      ac.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Remove this step" }, "Remove"), "click", function () {
        t.steps = t.steps.filter(function (x) { return x.id !== s.id; });
        state.decisions = state.decisions.filter(function (x) { return x.step !== s.id; });
        syncFromSteps(t); changed();
      }));
      sli.appendChild(ac);
    }
    ul.appendChild(sli);
  });
  box.appendChild(ul);
  if (!readOnly) {
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
  }
  box.appendChild(el("h3", null, "Notes"));
  if (readOnly) {
    box.appendChild(el("p", { "class": "hint notetext" }, t.notes || "No notes."));
  } else {
    var ta = el("textarea", { "aria-label": "Notes", style: "margin-top:8px" }); ta.value = t.notes;
    on(ta, "input", function () { t.notes = ta.value.slice(0, 5000); save(); });
    box.appendChild(ta);
  }
  if (inline || !readOnly) {
    var ar = el("div", { "class": "actions", style: "margin-top:14px" });
    if (readOnly) {
      // Nothing to offer here -- the quest page's Restore button is the one way back to editing.
    } else {
      if (inline) ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Open this task on the Tasks page" }, "Open in Tasks"), "click", function () { openTask(t.id); }));
      if (t.block === 0) {
        ar.appendChild(el("button", { type: "button", "class": "small", disabled: true, title: "This is a backlogged task. Add a due date to make it a milestone." }, "Make milestone"));
      } else if (t.milestone) {
        ar.appendChild(on(el("button", { type: "button", "class": "small on", "aria-pressed": "true", title: "Unmark this task as a milestone" }, "Remove milestone"), "click", function () { t.milestone = false; changed(); }));
      } else {
        ar.appendChild(on(el("button", { type: "button", "class": "small", "aria-pressed": "false", title: "Mark this task as a milestone" }, "Make milestone"), "click", function () { t.milestone = true; changed(); }));
      }
      if (t.launch) ar.appendChild(on(el("button", { type: "button", "class": "small on", "aria-pressed": "true", title: "Unmark this task as launch critical" }, "Skip launch"), "click", function () { t.launch = false; changed(); }));
      else ar.appendChild(on(el("button", { type: "button", "class": "small", "aria-pressed": "false", title: "Mark this task as launch critical" }, "Launch critical"), "click", function () { t.launch = true; changed(); }));
      ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Delete this task (can be undone)" }, "Delete"), "click", function () { ui.detail = false; removeNow(t, "tasks", "Task"); }));
    }
    if (ar.childNodes.length) box.appendChild(ar);
  }
  return box;
}

// Bidirectional link, not a subtask hierarchy. Lists p's direct links only, one hop.
export function linksSection(root, p) {
  // A live quest or a Candidate can add links (to live quests only); a vaulted quest keeps its links read-only.
  var links = linkedQuests(p);
  var ul = el("ul", { "class": "list" });
  if (!links.length) ul.appendChild(el("li", { "class": "hint" }, "No quest links."));
  links.forEach(function (lp) {
    var inert = !!lp.vault || lp.status === "candidate";
    var li = el("li"), row = el("div", { "class": "crow oneline" }), who = el("span", { "class": "linkwho" });
    if (inert) {
      who.appendChild(el("span", { "class": "qinert", style: "font-weight:600" }, lp.name));
      if (lp.vault) who.appendChild(el("span", { "class": "chip" }, "Vaulted"));
      else if (lp.status === "candidate") who.appendChild(el("span", { "class": "chip" }, "Candidate"));
    } else {
      var nm = el("button", { type: "button", "class": "textbtn qlink", title: "View this quest" }, lp.name);
      on(nm, "click", function () { go("quest:" + lp.id); });
      who.appendChild(nm);
    }
    row.appendChild(who);
    if (!p.vault) {
      var acts = el("div", { "class": "li-actions" });
      var rm = el("button", { type: "button", "class": "small danger", title: "Remove this link" }, "Unlink");
      on(rm, "click", function () { unlinkQuests(p.id, lp.id); changed(); });
      acts.appendChild(rm); row.appendChild(acts);
    }
    li.appendChild(row); ul.appendChild(li);
  });
  root.appendChild(ul);
  if (p.vault) return;
  // A Candidate is not a link target, and neither is a vaulted quest.
  var candidates = liveQuests().filter(function (x) { return x.id !== p.id && x.status !== "candidate" && p.linkedQuestIds.indexOf(x.id) < 0; });
  if (candidates.length) {
    var addRow = el("div", { "class": "actions", style: "margin-top:10px" });
    addRow.appendChild(on(el("button", { type: "button", "class": "small", title: "Create a link to another quest" }, "Link quest"), "click", function () { linkQuestDialog(p); }));
    root.appendChild(addRow);
  }
}

// Launch-critical items render as a section on a quest's page, scoped
// to that quest's tasks -- there's no separate standalone Launch page.
export function launchSection(root, p) {
  var readOnly = !!p.vault;
  var ha = el("div", { "class": "sechead" }); ha.appendChild(withHelp(el("h2", { "class": "sechead-h", id: "h-checks" }, "Before you launch"), "before-you-launch", "Before you launch"));
  root.appendChild(ha);
  var items = launchItems(p.id);
  var n = items.filter(function (t) { return t.status === "Completed"; }).length;
  var total = items.length;
  root.appendChild(el("p", { "class": "hint" }, total ? "Complete: " + n + " of " + total + " launch-critical " + (total === 1 ? "task" : "tasks") : "No tasks have been marked as launch critical yet."));
  var ul = el("ul", { "class": "tlist check", "aria-labelledby": "h-checks" });
  items.forEach(function (t) {
    var done = t.status === "Completed";
    // A vaulted quest, or an individually vaulted task, still opens in place -- read-only, not redirected away.
    var taskReadOnly = readOnly || !!t.vault;
    var open = ui.questOpen[p.id] === t.id;
    var li = el("li", { id: "ltask-" + t.id });
    var b = el("button", { type: "button", "class": "item" + (done ? " done" : ""), title: "View this task" });
    b.setAttribute("aria-expanded", open ? "true" : "false");
    var l1 = el("div", { "class": "l1 split" });
    l1.appendChild(t.block === 0 ? el("span", { "class": "chip backlog" }, "Backlog") : el("span", null, fmt(taskStart(t)) + " to " + fmt(taskEnd(t))));
    var tag1 = addedChip(t); if (tag1) { tag1.style.marginLeft = "6px"; l1.appendChild(tag1); }
    b.appendChild(l1);
    b.appendChild(el("div", { "class": "l2" }, short(dispWhat(t), 60) + (t.vault ? " (in the Vault)" : "")));
    var l3 = el("div", { "class": "l3" });
    l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
    if (t.milestone) l3.appendChild(el("span", { "class": "chip milestonechip" }, "Milestone"));
    stepsAndEst(l3, t);
    if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
    b.appendChild(l3);
    on(b, "click", function () { ui.questOpen[p.id] = open ? null : t.id; renderView(); });
    li.appendChild(b);
    if (open) li.appendChild(buildDetail(t, true, taskReadOnly));
    ul.appendChild(li);
  });
  if (total) root.appendChild(ul);
}

// Pin/Unpin for a quest, shared by In progress and the Quests list.
function questPinButton(key, name) {
  var pinned = isPinned(key);
  return on(el("button", { type: "button", "class": "small pintoggle" + (pinned ? " on" : ""), "aria-pressed": pinned ? "true" : "false", "aria-label": (pinned ? "Unpin " : "Pin ") + name, title: pinned ? "Unpin from the " + (isHosted() ? "main menu" : "sidebar") : "Pin to the " + (isHosted() ? "main menu" : "sidebar") }, pinned ? "Unpin" : "Pin"), "click", function () { if (pinned) unpinPage(key); else pinPage(key); });
}
function dustChip() { return el("span", { "class": "chip dust", style: "margin-left:8px", title: "No activity for a while" }, "Gathering dust"); }
function questRow(r) {
  var li = el("li"), row = el("div", { "class": "crow oneline" });
  var nm = el("div", { style: "flex:1 1 200px" });
  var link = el("button", { type: "button", "class": "textbtn qlink", style: "font-weight:600", title: "View this quest" }, r.name);
  on(link, "click", function () { go(r.key); });
  nm.appendChild(link);
  if (r.complete) nm.appendChild(el("span", { "class": "chip questcomplete", style: "margin-left:8px" }, "Complete"));
  var rq = findQuest(r.key.slice(6));
  if (rq && isDusty(rq)) nm.appendChild(dustChip());
  nm.appendChild(el("p", { "class": "hint", style: "margin-top:2px" }, r.meta));
  row.appendChild(nm);
  var acts = el("div", { "class": "li-actions" });
  acts.appendChild(questPinButton(r.key, r.name));
  row.appendChild(acts);
  li.appendChild(row);
  return li;
}
// Quests that are not In progress and not Candidates: Pending (Active with no open tasks yet) and Completed.
export function questRowsOutsideProgress(excludeIds) {
  return liveQuests().filter(function (p) { return p.status !== "candidate" && (!excludeIds || excludeIds.indexOf(p.id) < 0); }).map(function (p) { return { id: p.id, key: "quest:" + p.id, name: p.name, meta: questMeta(p), complete: p.status === "complete" }; });
}
// Puts a "?" button inside a heading, after its text.
function withHelp(h, id, name) { h.className = (h.className ? h.className + " " : "") + "hasq"; h.appendChild(helpLink(id, name)); return h; }
function questListSection(title, rows, first, term) {
  var sec = el("div"), h = el("h2", first ? { "class": "first" } : null, title);
  sec.appendChild(term ? withHelp(h, term[0], term[1]) : h);
  var ul = el("ul", { "class": "list" });
  rows.forEach(function (r) { ul.appendChild(questRow(r)); });
  sec.appendChild(ul);
  return sec;
}
export function pendingSection(rows, first) { return questListSection("Pending", rows, first, ["pending", "Pending"]); }
export function completedSection(rows, first) { return questListSection("Completed", rows, first); }
// A one-row section that opens in place like a task row. Starts collapsed.
function collapsibleSection(key, summary, detail, emptyText) {
  var ul = el("ul", { "class": "tlist sectionlist" }), li = el("li");
  var open = !!ui.sectionOpen[key];
  var line = el("div", { "class": "l2" });
  var b = el("button", { type: "button", "class": "item", "aria-expanded": open ? "true" : "false", title: open ? "Collapse this section" : "Expand this section" }, null);
  b.appendChild(line);
  function paint() { var t = summary(); line.textContent = t || emptyText; line.style.color = t ? "" : "var(--muted)"; line.style.fontSize = t ? "" : "var(--text-sm)"; }
  paint();
  detail.classList.add("detail"); detail.hidden = !open;
  on(b, "click", function () {
    open = !open; ui.sectionOpen[key] = open; detail.hidden = !open;
    b.setAttribute("aria-expanded", open ? "true" : "false"); b.title = open ? "Collapse this section" : "Expand this section";
    paint();
  });
  li.appendChild(b); li.appendChild(detail); ul.appendChild(li);
  return ul;
}
export function renderQuestPage(root, id) {
  var p = findQuest(id);
  if (!p) { root.appendChild(el("p", { "class": "hint first" }, "Quest not found.")); return; }
  var readOnly = !!p.vault;
  // Active/complete: two columns (page content left, Schedule/Timeline/Burndown right), stacked on a phone.
  var page = root, split = null;
  var metaLine = el("p", { "class": "hint" });
  if (p.status === "complete") metaLine.appendChild(el("span", { "class": "chip questcomplete", style: "margin-right:8px" }, "Complete"));
  if (isDusty(p)) metaLine.appendChild(el("span", { "class": "chip dust", style: "margin-right:8px", title: "No activity for a while" }, "Gathering dust"));
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
    root.appendChild(el("h2", null, "Quest giver"));
    var cgLines = [p.client.org, p.client.poc, p.client.address, p.client.phone, p.client.email, p.client.website, p.client.coin !== "" ? "Bounty: " + formatMoney(p.client.coin, state.settings.coinFormat) + " per " + p.client.per.toLowerCase() : ""].filter(Boolean);
    root.appendChild(el("p", { "class": "hint notetext" }, cgLines.length ? cgLines.join("\n") : "No Quest giver."));
    if (linkedQuests(p).length) { root.appendChild(el("h2", null, "Quest links")); linksSection(root, p); }
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
  if (!readOnly && p.status === "complete") root.appendChild(el("p", { "class": "hint" }, "Its tasks are not included in Tasks, Timeline, or Today while this quest is Complete. Reopen it to bring them back."));
  // questTasks(), not ordered()/backlogTasks()/live() -- a quest's page keeps
  // showing its tasks even while Complete or vaulted, when cross-quest lists exclude them.
  var ts = sortTasks(questTasks(p.id).filter(function (t) { return !t.launch; }));
  if (ts.length) {
    var ul = el("ul", { "class": "tlist" });
    ts.forEach(function (t) {
      // A vaulted quest's task opens in place too, read-only, so its steps and decisions stay visible for historical purposes.
      var open = ui.questOpen[p.id] === t.id;
      var li = el("li", { id: "ptask-" + t.id }), b = el("button", { type: "button", "class": "item" + (t.status === "Completed" ? " done" : ""), title: "View this task" });
      b.setAttribute("aria-expanded", open ? "true" : "false");
      var l1 = el("div", { "class": "l1 split" });
      l1.appendChild(t.block === 0 ? el("span", { "class": "chip backlog" }, "Backlog") : el("span", null, fmt(taskStart(t)) + " to " + fmt(taskEnd(t))));
      var tag1 = addedChip(t); if (tag1) { tag1.style.marginLeft = "6px"; l1.appendChild(tag1); }
      b.appendChild(l1);
      b.appendChild(el("div", { "class": "l2" }, t.what));
      var l3 = el("div", { "class": "l3" });
      l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
      if (t.milestone) l3.appendChild(el("span", { "class": "chip milestonechip" }, "Milestone"));
      stepsAndEst(l3, t);
      if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
      b.appendChild(l3);
      on(b, "click", function () { ui.questOpen[p.id] = open ? null : t.id; renderView(); });
      li.appendChild(b);
      if (open) li.appendChild(buildDetail(t, true, readOnly));
      ul.appendChild(li);
    });
    root.appendChild(ul);
  }
  if (!split) scheduleSection(root, p, readOnly);

  launchSection(root, p);

  root.appendChild(el("h2", null, "Quest links"));
  linksSection(root, p);

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

  if (readOnly) {
    root.appendChild(el("h2", null, "Quest giver"));
    var gc = p.client, glines = [gc.org, gc.poc, gc.address, gc.phone, gc.email, gc.website, gc.coin !== "" ? "Bounty: " + formatMoney(gc.coin, state.settings.coinFormat) + " per " + gc.per.toLowerCase() : ""].filter(Boolean);
    root.appendChild(el("p", { "class": "hint notetext" }, glines.length ? glines.join("\n") : "No Quest giver."));
  } else {
    root.appendChild(withHelp(el("h2", null, "Quest giver"), "quest-giver", "Quest giver"));
    var giverBox = el("div");
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
    var gcw = el("div", { "class": "field" }), gcl = el("div", { "class": "labelrow" });
    gcl.appendChild(el("label", { "for": "giver-coin-" + p.id }, "Bounty")); gcl.appendChild(helpLink("bounty", "Bounty")); gcw.appendChild(gcl);
    var gcoin = moneyInput(el("input", { type: "text", id: "giver-coin-" + p.id }), function (n) { p.client.coin = n; save(); }, state.settings.coinFormat);
    gcoin.value = formatMoney(p.client.coin, state.settings.coinFormat);
    gcw.appendChild(gcoin); gg2.appendChild(gcw);
    var gpw = el("div", { "class": "field" }); gpw.appendChild(el("label", { "for": "giver-per-" + p.id }, "Per"));
    var gper = el("select", { id: "giver-per-" + p.id, "class": "plain" });
    ["Hour", "Quest"].forEach(function (o) { var op = el("option", { value: o }, o); if (o === p.client.per) op.selected = true; gper.appendChild(op); });
    on(gper, "change", function () { p.client.per = gper.value; save(); });
    gpw.appendChild(gper); gg2.appendChild(gpw);
    giverBox.appendChild(gg2);
    root.appendChild(collapsibleSection("giver:" + p.id, function () { return [p.client.org, p.client.poc].filter(Boolean).join(" · "); }, giverBox, "Add Quest giver details"));
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
    ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Send this quest to the Vault" }, "Vault"), "click", function () { vaultQuest(p); }));
    ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Export web page for client review" }, "Quest giver export"), "click", function () {
      askExportSides(p);
    }));
  }
  // Sits outside .questmain so it renders last when stacked; CSS puts it back under the left column on wide screens.
  if (split) { split.appendChild(questChartsPanel(p)); split.appendChild(ar); } else { root.appendChild(ar); }
}

// `first` zeroes the heading's top margin; `extraBtn` rides its heading row.
function scheduleSection(host, p, readOnly, first, extraBtn) {
  // `first` can be a plain boolean (always zero the heading's top margin,
  // e.g. the Expand modal) or the string "questcharts-head" (zero it only at
  // the wide breakpoint, via CSS, so a stacked page keeps its normal section gap).
  var cls = first === true ? "first" : first === "questcharts-head" ? "questcharts-head" : "";
  var hd = el("div", { "class": "sechead" + (cls ? " " + cls : "") });
  hd.appendChild(el("h2", cls ? { "class": cls + (cls === "questcharts-head" ? " sechead-h" : "") } : null, "Schedule"));
  if (extraBtn) hd.appendChild(extraBtn);
  host.appendChild(hd);
  var eff = pset(p.id);
  if (readOnly) {
    host.appendChild(el("p", { "class": "hint" }, "Started " + (eff.start ? fmtY(parseISO(eff.start)) : "unset") + (p.due ? ", due " + fmtY(parseISO(p.due)) : "") + ", " + wl() + " length " + eff.days + " days" + "."));
  } else {
    var sg = el("div", { "class": "setgrid" }), smsg = el("p", { "class": "msg schedmsg", role: "status", "aria-live": "polite" });
    function sfield(id2, label, input) { var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id2 }, label)); w.appendChild(input); sg.appendChild(w); }
    var ps = el("input", { type: "date", id: "proj-start" }); ps.value = eff.start;
    var pd = el("input", { type: "date", id: "proj-due" }); pd.value = p.due;
    var pl = el("input", { type: "number", id: "proj-days", min: "1", max: "90", step: "1", inputmode: "numeric" }); pl.value = eff.days;
    function applyOwn() {
      var sv = ps.value, lv = parseInt(pl.value, 10);
      if (!isISO(sv)) { ps.value = eff.start; smsg.textContent = "Enter a valid start date."; return; }
      if (isNaN(lv) || lv < 1 || lv > 90) { pl.value = eff.days; smsg.textContent = wd() + " length must be from 1 to 90 days."; return; }
      p.start = sv; p.days = lv; changed(); notify(p.name + " schedule saved.");
    }
    // "blur", not "change" -- a date input fires "change" per segment while typing.
    on(ps, "blur", applyOwn); on(pl, "blur", applyOwn);
    on(pd, "blur", function () { p.due = isISO(pd.value) ? pd.value : ""; changed(); notify(p.due ? "Due date saved." : "Due date cleared."); });
    sfield("proj-start", "Start date", ps); sfield("proj-due", "Due date", pd); sfield("proj-days", "Days per " + wd().toLowerCase(), pl);
    host.appendChild(sg); host.appendChild(smsg);
  }
}

var EXPAND_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>';
// Right column: Schedule, Timeline, Burndown, flowing continuously. Expand opens all three large.
function questChartsPanel(p) {
  var side = el("aside", { "class": "questcharts", "aria-label": "Schedule, timeline, and burndown" });
  var ex = el("button", { type: "button", "class": "small questexpand", title: "Expand the schedule, timeline, and burndown" }, "Expand");
  ex.appendChild(el("span", { "class": "expandicon", "aria-hidden": "true" })); ex.lastChild.innerHTML = EXPAND_ICON;
  on(ex, "click", function () { openModal("Timeline and burndown for " + p.name, function (body) { body.appendChild(questCharts(p, true, null, true)); }, { full: true }); });
  side.appendChild(questCharts(p, false, ex));
  return side;
}
function questCharts(p, wide, expandBtn, first) {
  var out = el("div");
  // Schedule keeps its own heading from scheduleSection(), with Expand on the same row. .questcharts-head zeroes the heading margin only at the wide breakpoint.
  scheduleSection(out, p, false, "questcharts-head", expandBtn);
  var tl = questRangeBlock(p);
  if (tl.empty) {
    // Nothing to chart -- one combined heading, no Slip button.
    out.appendChild(el("h2", null, "Timeline & burndown"));
    out.appendChild(tl.node);
  } else {
    // Slip moves incomplete tasks only -- see slipDialog().
    var slipBtn = el("button", { type: "button", "class": "small", title: "Push this quest’s incomplete tasks later to catch up" }, "Slip schedule");
    on(slipBtn, "click", function () { slipDialog(p); });
    var hd1 = el("div", { "class": "sechead" }); hd1.appendChild(el("h2", { "class": "sechead-h" }, "Timeline")); hd1.appendChild(slipBtn);
    out.appendChild(hd1);
    out.appendChild(tl.node); wireMilestoneDiamonds(tl.node);
    var b = burnParts({ quest: p, wide: wide, level: "h2" });
    b.count.style.marginTop = "0";
    out.appendChild(b.h); out.appendChild(b.chart); out.appendChild(el("h2", null, "Stats")); out.appendChild(b.count);
  }
  return out;
}

// Promotes in place -- same record, same id. Restores any links set aside by
// a prior demoteToCandidate(), only ones still pointing at a quest that still exists.
function overWip() { var n = state.settings.wipLimit; return !!n && activeQuests().length >= n; }
export function promoteToActive(id) {
  var p = findAnyQuest(id);
  if (!p) return;
  var n = activeQuests().length;
  if (overWip() && p.status !== "active") {
    confirmDialog("Promote past your limit?", "You already have " + n + " active " + (n === 1 ? "quest" : "quests") + ". Promote it anyway?", "Promote anyway", function () { doPromote(p); });
    return;
  }
  doPromote(p);
}
function doPromote(p) {
  p.status = "active";
  // Tasks added while it was a Candidate were part of the plan from the start, not scope added later.
  state.tasks.forEach(function (x) { if (x.questId === p.id) x.added = ""; });
  changed();
  if (state.settings.audio) playSfx("assets/sfx/quest.mp3");
}
// Sends an active quest back to Candidates. Its links are kept, shown read-only, and live again on promotion.
export function demoteToCandidate(id) {
  var p = findAnyQuest(id);
  if (!p) return;
  p.status = "candidate";
  changed();
  notify("Sent back to Candidates.");
}
export function standingBlock() {
  var groups = {}, order = [];
  ordered().forEach(function (t) {
    if (t.status === "Completed") return;
    var quest = findQuest(t.questId);
    if (!quest || quest.status !== "active") return;
    var g = groups[t.questId]; if (!g) { g = groups[t.questId] = { questId: t.questId, name: dispQuest(t), open: 0, first: t }; order.push(g); }
    g.open++;
  });
  order.sort(function (a, b) { return taskStart(a.first) - taskStart(b.first); });
  var questIds = order.map(function (g) { return g.questId; });
  if (!order.length) return { node: null, questIds: questIds };
  var wrap = el("div");
  wrap.appendChild(withHelp(el("h2", { "class": "first" }, "In progress"), "in-progress", "In progress"));
  var box = el("div", { "class": "box", style: "margin-top:10px" });
  var ul = el("ul", { "class": "standing" });
  order.forEach(function (g) {
    var li = el("li"), row = el("div", { "class": "srow" }), textWrap = el("div", { style: "flex:1 1 200px" });
    var nm = el("button", { type: "button", "class": "textbtn qlink", title: "View this quest" }, g.name);
    on(nm, "click", function () { go(validPage("quest:" + g.questId) ? "quest:" + g.questId : "projects"); });
    textWrap.appendChild(nm);
    var dq = findQuest(g.questId);
    if (dq && isDusty(dq)) textWrap.appendChild(dustChip());
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
export function candidatesSection(first) {
  var sec = el("div");
  sec.appendChild(withHelp(el("h2", first ? { "class": "first" } : null, "Candidate quests"), "candidate-quest", "Candidate quest"));
  if (state.settings.wipLimit && activeQuests().length > state.settings.wipLimit) sec.appendChild(el("p", { "class": "hint" }, "You have " + activeQuests().length + " active quests. Your limit is " + state.settings.wipLimit + "."));
  var list = el("ul", { "class": "list" });
  var cs = candidateQuests();
  if (!cs.length) list.appendChild(el("li", { "class": "hint" }, "No candidate quests yet. Start one with the + button."));
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
  var rows = questRowsOutsideProgress(standing.questIds);
  var pending = rows.filter(function (r) { return !r.complete; }), complete = rows.filter(function (r) { return r.complete; });
  var first = true;
  function lead() { var f = first; first = false; return f; }
  if (standing.node) { root.appendChild(standing.node); first = false; }
  if (pending.length) root.appendChild(pendingSection(pending, lead()));
  root.appendChild(candidatesSection(lead()));
  if (complete.length) root.appendChild(completedSection(complete, false));
}
// Each idea carries the offsets and curl size it was given when it was created (newPin in dom.js).
function pinStyle(pin) {
  pin = pin || { x: 0, y: 0, bend: 62 };
  return "--rx:" + pin.x + ";--ry:" + pin.y + ";--bend:" + pin.bend + "px;--bbox:" + Math.round(pin.bend * 1.2) + "px";
}
export function renderWorkshop(root) {
  var hd = el("div", { "class": "sechead workshophead" });
  hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Add new idea" }, "Add idea"), "click", function () { ideaDialog(); })); root.appendChild(hd);
  var pl = el("ul", { "class": "list pinboard", style: "margin-top:12px" });
  var ps = live(state.workshop);
  if (!ps.length) pl.appendChild(el("li", { "class": "hint" }, "No ideas yet. Add one with the Add idea button."));
  ps.forEach(function (p) {
    var li = el("li", { "class": "posting", style: pinStyle(p.pin) }), row = el("div", { "class": "crow oneline" });
    var nm = el("div", { style: "flex:1 1 200px" });
    var link = el("button", { type: "button", "class": "textbtn qlink", style: "font-weight:600", title: "Open this idea" }, p.text);
    on(link, "click", function () { ideaDialog(p); });
    nm.appendChild(link);
    if (p.created) {
      var made = el("span", { "class": "hint ideamade" });
      made.appendChild(el("span", { "class": "ideadot", "aria-hidden": "true" }, "· "));
      made.appendChild(document.createTextNode("Created on " + fmtY(parseISO(p.created))));
      nm.appendChild(made);
    }
    if (p.note) nm.appendChild(el("p", { "class": "hint notetext noteclamp", style: "margin-top:2px" }, p.note));
    row.appendChild(nm);
    var acts = el("div", { "class": "li-actions" });
    acts.appendChild(on(el("button", { type: "button", "class": "small", title: "Make this a candidate quest" }, "Make candidate"), "click", function () {
      state.workshop = state.workshop.filter(function (x) { return x.id !== p.id; });
      state.quests.push(makeQuest(uid(), p.text, "candidate", { notes: p.note, start: iso(TODAY) })); changed();
      notify("“" + p.text + "” is now a candidate quest. Find it under Candidate quests on the Quests page.");
    }));
    var rm = el("button", { type: "button", "class": "small danger", title: "Send this idea to the Vault" }, "Vault");
    on(rm, "click", function () { removeToVault(p, "Idea"); });
    acts.appendChild(rm); row.appendChild(acts); li.appendChild(row); pl.appendChild(li);
  });
  root.appendChild(pl);
}

export function renderJobs(root) {
  var bar = el("div", { "class": "jobbar" });
  var txt = el("input", { type: "text", id: "job-new", maxlength: "200", placeholder: "New errand", "aria-label": "New errand", autocomplete: "off", style: "flex:1 1 220px" });
  var dueWrap = el("div", { "class": "jobdue" });
  dueWrap.appendChild(el("label", { "for": "job-new-due" }, "Due date"));
  var due = el("input", { type: "date", id: "job-new-due" });
  dueWrap.appendChild(due);
  var msg = el("p", { "class": "msg", role: "alert" });
  function add() {
    var v = txt.value.trim();
    if (!v) { msg.textContent = "Enter an errand to add it."; txt.focus(); return; }
    state.jobs.push({ id: uid(), text: v.slice(0, 200), done: false, due: isISO(due.value) ? due.value : "" });
    setFocusKey("job-new"); changed(); notify("“" + v.slice(0, 200) + "” added to Errands.");
  }
  txt.setAttribute("data-focus", "job-new");
  on(txt, "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
  bar.appendChild(txt); bar.appendChild(dueWrap);
  bar.appendChild(on(el("button", { type: "button", "class": "small", title: "Add this errand" }, "Add errand"), "click", add));
  root.appendChild(bar); root.appendChild(msg);
  stopFlip();
  var open = openJobs(), done = state.jobs.filter(function (j) { return j.done; });
  var hand = handJobs(), deck = deckJobs();
  if (open.length) handSection(root, hand, open);
  var ul = el("ul", { "class": "list jobs", style: "margin-top:12px" });
  if (!open.length) ul.appendChild(el("li", { "class": "hint" }, "No open errands. Add one with the Add errand button."));
  deck.forEach(function (j) { ul.appendChild(jobRow(j)); });
  if (deck.length || !open.length) root.appendChild(ul);
  if (done.length) {
    root.appendChild(el("h2", null, "Completed"));
    var dl = el("ul", { "class": "list jobs" });
    done.forEach(function (j) { dl.appendChild(jobRow(j)); });
    root.appendChild(dl);
  }
}
var CALENDAR = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>';
function jobRow(j, opts) {
  var li = el("li", { "class": (j.done ? "done" : "") + (opts && opts.card ? " handcard" : "") }), row = el("div", { "class": "jobrow" });
  var lab = el("label", { "class": "jobmain" });
  var cb = el("input", { type: "checkbox", "aria-label": (j.done ? "Restore errand: " : "Complete errand: ") + j.text }); cb.checked = j.done;
  on(cb, "change", function () { j.done = cb.checked; changed(); });
  var text = el("span", { "class": "jobtext" }, j.text);
  lab.appendChild(cb); lab.appendChild(text); row.appendChild(lab);
  var badges = el("div", { "class": "jobbadges" });
  if (isJobLate(j)) badges.appendChild(el("span", { "class": "badge" }, "Overdue"));
  var dueBtn = el("button", { type: "button", "class": "chip datechip" + (j.due ? "" : " nodue"), title: j.due ? "Change the due date" : "Add a due date" });
  var dueIcon = el("span", { "class": "dateicon", "aria-hidden": "true" }); dueIcon.innerHTML = CALENDAR;
  dueBtn.appendChild(dueIcon); dueBtn.appendChild(document.createTextNode(j.due ? "Due " + fmtY(parseISO(j.due)) : "No due date"));
  on(dueBtn, "click", function () {
    formDialog("Errand due date", [{ key: "due", label: "Due date", type: "date", value: j.due }], "Save", function (v) {
      j.due = isISO(v.due) ? v.due : ""; changed();
      return { msg: j.due ? j.text + " is due " + fmtY(parseISO(j.due)) + "." : "Due date cleared." };
    }, j.text, j.due ? { label: "Clear", title: "Remove the due date", onClick: function () { j.due = ""; changed(); notify("Due date cleared."); } } : null);
  });
  badges.appendChild(dueBtn);
  row.appendChild(badges);
  if (j.done) {
    var del = el("button", { type: "button", "class": "small danger jobend del", title: "Delete this errand permanently" }, "Delete forever");
    row.appendChild(on(del, "click", function () { removeNow(j, "jobs", "Errand"); }));
  } else {
    var pen = pencilButton("Rename this errand", "Rename this errand"); pen.classList.add("jobend", "pen");
    on(pen, "click", function () {
      pen.hidden = true;
      editInline(text, {
        label: "Errand", max: 200, value: function () { return j.text; },
        onSave: function (v) { j.text = v.slice(0, 200); changed(); },
        onEmpty: function () { notify("An errand needs some text."); },
        onDone: function () { pen.hidden = false; }
      });
    });
    row.appendChild(pen);
  }
  li.appendChild(row);
  return li;
}

/* errands hand: up to three errands kept at the top of the page */
var HAND = {
  label: "Your hand", edit: "Manage hand", empty: "Empty hand", done: "Done", up: "Up", down: "Down",
  reroll: "Reroll", roll: "Roll", pick: "Choose", discard: "Discard", deck: "Errands deck",
  none: "Nothing in your hand. Choose up to three errands to keep here.",
  editorTitle: "Manage your hand", editorHint: "Choose up to three errands. Then put them in the order you want.",
  rerolled: "Hand rerolled.", rolled: "Hand rolled.", emptied: "Hand emptied.", needTwo: "Reroll needs at least two open errands.", needOne: "Roll needs at least one open errand."
};
var HAND_MAX = 3, FLIP_GAP = 140, REROLL_SFX = "assets/sfx/reroll.mp3";
function refocus(sels) {
  for (var i = 0; i < sels.length; i++) { var f = document.querySelector(sels[i]); if (f && !f.disabled) { f.focus(); return; } }
}
function handChoose(id) {
  if (state.hand.indexOf(id) >= 0 || state.hand.length >= HAND_MAX) return;
  state.hand = state.hand.concat([id]); changed();
}
function handDiscard(id) { state.hand = state.hand.filter(function (x) { return x !== id; }); changed(); }
function handMove(id, dir) {
  var h = state.hand.slice(), i = h.indexOf(id), k = i + dir;
  if (i < 0 || k < 0 || k >= h.length) return;
  h[i] = h[k]; h[k] = id; state.hand = h; changed();
}
function emptyHand() {
  var prev = state.hand.slice();
  state.hand = []; changed(); closeModal();
  notify(HAND.emptied, function () { state.hand = prev; changed(); });
  refocus(['[data-focus="hand-edit"]']);
}
function reduceMotion() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
}
var flip = { anims: [], ghosts: [] };
function stopFlip() {
  flip.anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* already gone */ } });
  flip.ghosts.forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); });
  flip = { anims: [], ghosts: [] };
}
// Puts a new hand in place, flipping the cards over (and playing the landing sound) when animation is on. Reroll and its Undo both use it.
function swapHand(ids, focusKey) {
  stopFlip();
  var animate = state.settings.animatedReroll && !reduceMotion();
  // The old cards are copied first because changed() rebuilds the page; the copies turn away while the new cards turn in.
  var old = animate ? Array.prototype.map.call(document.querySelectorAll("#view .handlist > li"), function (li) { return li.cloneNode(true); }) : [];
  state.hand = ids;
  if (focusKey) setFocusKey(focusKey);
  changed();
  var cards = document.querySelectorAll("#view .handlist > li");
  if (!cards.length) return;
  if (!animate || typeof cards[0].animate !== "function") { if (state.settings.audio) playSfx(REROLL_SFX, 0.25); return; }
  var ul = cards[0].parentNode, persp = "perspective(900px) ";
  Array.prototype.forEach.call(cards, function (card, i) {
    var delay = i * FLIP_GAP, ghost = old[i];
    var land = state.settings.audio ? prepareSfx(REROLL_SFX, 0.25) : null;
    if (ghost) {
      ghost.classList.add("handghost"); ghost.setAttribute("aria-hidden", "true"); ghost.setAttribute("inert", "");
      Array.prototype.forEach.call(ghost.querySelectorAll("[data-focus]"), function (n) { n.removeAttribute("data-focus"); });
      ghost.style.top = card.offsetTop + "px";
      ul.appendChild(ghost); flip.ghosts.push(ghost);
      var out = ghost.animate([{ transform: persp + "rotateX(0deg)" }, { transform: persp + "rotateX(90deg)" }], { duration: 200, delay: delay, easing: "ease-in", fill: "both" });
      out.onfinish = function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); };
      flip.anims.push(out);
    }
    var into = card.animate([
      { transform: persp + "rotateX(-90deg)", offset: 0 },
      { transform: persp + "rotateX(0deg) translateY(-6px) scale(1.03)", offset: 0.65 },
      { transform: "none", offset: 1 }
    ], { duration: 340, delay: delay + 200, easing: "ease-out", fill: "both" });
    into.onfinish = function () { if (land) land(); into.cancel(); };
    flip.anims.push(into);
  });
}
function rerollHand() {
  var open = openJobs(), prev = state.hand.slice();
  if (open.length < (prev.length ? 2 : 1)) return;
  swapHand(rerollPick(open, prev), "hand-reroll");
  notify(prev.length ? HAND.rerolled : HAND.rolled, function () { swapHand(prev); });
}
function handSection(root, hand, open) {
  var head = el("div", { "class": "handhead" });
  head.appendChild(el("h2", { "class": "handlabel" }, HAND.label));
  var btns = el("div", { "class": "handbtns" });
  var hand0 = hand.length > 0;
  var eb = el("button", { type: "button", "class": "small", "data-focus": "hand-edit" }, HAND.edit);
  on(eb, "click", openHandEditor); btns.appendChild(eb);
  var grp = el("span", { "class": "rerollgroup" });
  var rr = el("button", { type: "button", "class": "small", "data-focus": "hand-reroll" }, hand0 ? HAND.reroll : HAND.roll);
  if (open.length < (hand0 ? 2 : 1)) { rr.disabled = true; rr.title = hand0 ? HAND.needTwo : HAND.needOne; } else on(rr, "click", rerollHand);
  grp.appendChild(rr); grp.appendChild(helpLink("reroll", "Reroll and Roll")); btns.appendChild(grp);
  head.appendChild(btns); root.appendChild(head);
  if (!hand0) root.appendChild(el("p", { "class": "hint handnone" }, HAND.none));
  else {
    var cl = el("ul", { "class": "handlist" });
    hand.forEach(function (j) { cl.appendChild(jobRow(j, { card: true })); });
    root.appendChild(cl);
  }
  root.appendChild(withHelp(el("h2", { "class": "handlabel decklabel" }, HAND.deck), "errands-deck", "Errands deck"));
}
// One row of a hand dialog: the errand, its date, and whatever buttons the dialog gives it.
function handDialogRow(j, chosen) {
  var li = el("li", { "class": chosen ? "chosen" : "" }), main = el("div", { "class": "hpmain" });
  main.appendChild(el("span", { "class": "hptext" }, j.text));
  var sub = el("span", { "class": "hpsub" });
  if (isJobLate(j)) sub.appendChild(el("span", { "class": "badge" }, "Overdue"));
  sub.appendChild(document.createTextNode(j.due ? "Due " + fmtY(parseISO(j.due)) : "No due date"));
  main.appendChild(sub); li.appendChild(main);
  return li;
}
function handDialogBtn(label, aria, j, key, fn, off) {
  var b = el("button", { type: "button", "class": "small", "data-focus": key + j.id, "aria-label": aria + ": " + j.text }, label);
  if (off) b.disabled = true; else on(b, "click", fn);
  return b;
}
// One dialog for the whole hand: the cards in it (reorder or discard) with the rest of the open errands below (choose).
function openHandEditor() {
  openModal(HAND.editorTitle, function (body) {
    body.appendChild(el("p", { "class": "first hint" }, HAND.editorHint));
    var list = el("ul", { "class": "handpick" }), foot = el("div", { "class": "handfoot" }), count = el("span", { "class": "hint handcount" });
    var doneBtn = el("button", { type: "button", "class": "primary" }, HAND.done);
    var clear = on(el("button", { type: "button" }, HAND.empty), "click", emptyHand);
    var paint = function (focusSels) {
      list.innerHTML = "";
      var hand = handJobs(), full = hand.length >= HAND_MAX;
      hand.forEach(function (j, i) {
        var li = handDialogRow(j, true), bt = el("div", { "class": "hpbtns" });
        bt.appendChild(handDialogBtn(HAND.up, "Move up in hand", j, "ed-up-", function () { handMove(j.id, -1); paint(['[data-focus="ed-up-' + j.id + '"]', '[data-focus="ed-down-' + j.id + '"]']); }, i === 0));
        bt.appendChild(handDialogBtn(HAND.down, "Move down in hand", j, "ed-down-", function () { handMove(j.id, 1); paint(['[data-focus="ed-down-' + j.id + '"]', '[data-focus="ed-up-' + j.id + '"]']); }, i === hand.length - 1));
        bt.appendChild(handDialogBtn(HAND.discard, "Discard from hand", j, "ed-discard-", function () {
          handDiscard(j.id);
          paint(['[data-focus="pick-' + j.id + '"]', '[data-focus="ed-discard-' + (state.hand[0] || "") + '"]']);
        }));
        li.appendChild(bt); list.appendChild(li);
      });
      deckJobs().forEach(function (j) {
        var li = handDialogRow(j, false);
        li.appendChild(handDialogBtn(HAND.pick, "Choose for hand", j, "pick-", function () {
          handChoose(j.id);
          paint(['[data-focus="ed-discard-' + j.id + '"]']);
        }, full));
        list.appendChild(li);
      });
      clear.hidden = !hand.length;
      count.textContent = hand.length + " of " + HAND_MAX + " in hand";
      if (focusSels) refocus(focusSels.map(function (q) { return "#modalBody " + q; }).concat(["#modalBody .primary"]));
    };
    paint();
    body.appendChild(list);
    on(doneBtn, "click", function () { closeModal(); refocus(['[data-focus="hand-edit"]']); });
    var acts = el("div", { "class": "handacts" });
    acts.appendChild(doneBtn); acts.appendChild(clear);
    foot.appendChild(acts); foot.appendChild(count); body.appendChild(foot);
  }, { noClose: true });
}

// A milestone diamond opens the task it's flagged on, same as any other task.
function wireMilestoneDiamonds(node) {
  Array.prototype.forEach.call(node.querySelectorAll(".ms[data-ms-id]"), function (d) {
    var id = d.getAttribute("data-ms-id");
    on(d, "click", function () { openTask(id); });
    on(d, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTask(id); } });
  });
}
export function renderTimeline(root) {
  var r = rangeBlock(); root.appendChild(r.node);
  wireMilestoneDiamonds(r.node);
  root.appendChild(el("h2", null, "Milestones"));
  var mbox = el("div", { "class": "box", style: "margin-top:10px" });
  var ul = el("ul", { "class": "mslist" });
  if (!r.milestones.length) ul.appendChild(el("li", { "class": "hint" }, "No milestones set. Mark any open task as a milestone."));
  r.milestones.slice().sort(function (a, b) { return a.date - b.date; }).forEach(function (m) {
    var li = el("li"); li.appendChild(el("span", { "class": "d" }, fmtY(m.date)));
    var mtext = el("span", { style: "flex:1 1 auto" });
    var ml = el("button", { type: "button", "class": "textbtn qlink", title: "Open this task" }, m.text); on(ml, "click", function () { openTask(m.id); }); mtext.appendChild(ml);
    li.appendChild(mtext);
    ul.appendChild(li);
  });
  mbox.appendChild(ul); root.appendChild(mbox);
  root.appendChild(burnPanel({ wide: true, level: "h2" }));
  root.appendChild(withHelp(el("h2", null, "Task counts"), "task-counts", "Task counts"));
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
export function dropEntry(e) {
  state[e.list] = state[e.list].filter(function (x) { return x !== e.item; });
  if (e.list === "quests") removeLinksTo([e.item.id]);
}
export function restoreEntry(e) {
  e.item.vault = null;
  // Reverses vaultQuest()'s task cascade, or the quest comes back empty.
  if (e.kind === "quest") {
    state.tasks.forEach(function (t) { if (t.questId === e.item.id && t.vault) t.vault = null; });
  }
  var where = e.kind === "idea" ? "the Workshop" : e.item.status === "candidate" ? "Candidate quests" : "the Quests page";
  changed(); notify(KIND_LABEL[e.kind] + " restored to " + where + ".");
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
  var counts = { all: all.length }; all.forEach(function (e) { counts[e.kind] = (counts[e.kind] || 0) + 1; });
  if (!all.length) { root.appendChild(emptyList("The Vault is empty. Completed tasks and removed items appear here.")); return; }
  var chips = el("div", { "class": "chips", role: "group", "aria-label": "Filter the Vault" });
  KIND_FILTERS.forEach(function (f) {
    var b = el("button", { type: "button", "class": "chipbtn", "aria-pressed": filter === f[0] ? "true" : "false" }, f[1] + " (" + (counts[f[0]] || 0) + ")");
    on(b, "click", function () { ui.vaultFilter = f[0]; renderView(); });
    chips.appendChild(b);
  });
  root.appendChild(chips);
  var shown = all.filter(function (e) { return filter === "all" || e.kind === filter; });
  if (!shown.length) { root.appendChild(emptyList("Nothing of that kind in the Vault.")); return; }
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
  text.replace(/^\{#[a-z-]+\}/, "").split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/).forEach(function (part) {
    if (!part) return;
    if (part.indexOf("**") === 0) frag.appendChild(el("b", null, part.slice(2, -2)));
    else if (part.indexOf("[[") === 0) frag.appendChild(el("kbd", null, part.slice(2, -2)));
    else frag.appendChild(document.createTextNode(part));
  });
  return frag;
}
// A Terms line is "{#id}**Name:** Definition. See “Topic”." The id is what a "?" button points at.
export function helpTerm(id) {
  var lines = helpTopics().filter(function (t) { return t[0] === "Terms"; })[0][1], found = null;
  lines.forEach(function (l) {
    var m = l.match(/^\{#([a-z-]+)\}\*\*([^*]+):\*\* (.+?) See “([^”]+)”\.$/);
    if (m && m[1] === id) found = { id: m[1], name: m[2], text: m[3], topic: m[4] };
  });
  return found;
}
// The "?" modal: the definition, plus a button that opens the Field guide at the topic that explains more.
function openTermHelp(id) {
  var t = helpTerm(id); if (!t) return;
  openModalOver(t.name, function (body) {
    var tp = el("p", { "class": "first" }); tp.appendChild(helpMarkup(t.text)); body.appendChild(tp);
    var acts = el("div", { "class": "actions" });
    acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "termMore", title: "Open “" + t.topic + "” in the Field guide" }, "Read more in the Field guide"), "click", function () { closeAllModals(); ui.helpTopic = t.topic; go("help"); }));
    body.appendChild(acts);
  });
}
setHelpOpener(openTermHelp);
export function helpTopics() {
  return [
    ["How Sidequest works", [
      "**Web and installed version:** Your quest data is stored in the browser and on the device you’re using. This means your data is available on that device, including when you’re offline. Installing Sidequest does not create a separate set of quests from the browser version.",
      "**Backups:** If your browser’s local storage is cleared, you will lose all of your quest data, so back up your quests periodically.",
      "**Artifact version:** The Artifact version works as a Claude artifact or a Muse space. When you use Sidequest this way, your quest data is stored with your account. You can access your quests from the web, the app, or a mobile device where you’re signed in. You need an internet connection.",
      "**Artifact updates:** The Artifact version tells you when an update is available and how to install it without losing any data."
    ]],
    ["Terms", [
      "{#active-quest}**Active quest:** A quest that has been promoted from a candidate. If it has scheduled tasks, it appears in the **In progress** section. Otherwise, it appears in the **Pending** section. See “Quests page”.",
      "{#actual}**Actual:** The burndown line showing the tasks you have left. See “Timeline page”.",
      "{#badge-added}**Added badge:** Marks a task added after the quest started. See “Inside a quest”.",
      "{#adventurer}**Adventurer:** Your contact information and brandmark, used on exports. See “Options page”.",
      "{#backlog}**Backlog:** Open tasks without a due date. See “Tasks page”.",
      "{#before-you-launch}**Before you launch:** The section that lists a quest’s **Launch critical** tasks. These tasks must be completed before launch. See “Inside a quest”.",
      "{#bounty}**Bounty:** The amount a quest pays. This does not appear on exports. See “Quest giver and Quest links”.",
      "{#candidate-quest}**Candidate quest:** A quest you’re considering but haven’t started. See “Quests page”.",
      "{#decision}**Decision:** A question attached to a step. Answering it completes the step. See “Inside a quest”.",
      "{#errand}**Errand:** One item on the **Errands** page. See “Errands page”.",
      "{#errands-deck}**Errands deck:** Incomplete errands you can add to your hand to give them higher priority. See “Errands page”.",
      "{#forecast}**Forecast:** The dotted burndown line estimating when you’ll finish. See “Timeline page”.",
      "{#gathering-dust}**Gathering dust:** A badge for an active quest nobody has changed for a while. See “Options page”.",
      "{#hand}**Your hand:** Choose up to three errands to keep in your hand. See “Errands page”.",
      "{#idea}**Idea:** A note in the **Workshop** that hasn’t become a quest. See “Workshop page”.",
      "{#ideal}**Ideal:** The burndown line showing your planned pace. See “Timeline page”.",
      "{#in-progress}**In progress:** An active quest with at least one incomplete task that has a due date. See “Quests page”.",
      "{#launch-critical}**Launch critical:** A task that must be completed before launch. These tasks are grouped in the **Before you launch** section. See “Inside a quest”.",
      "{#make-candidate}**Make candidate:** Turns an idea into a candidate quest. See “The quest lifecycle”.",
      "{#milestone}**Milestone:** A task with a date that appears on the **Timeline**. See “Inside a quest”.",
      "{#next-up}**Next up:** The earliest-starting incomplete task across all open quests. See “Today page”.",
      "{#pending}**Pending:** An active quest with no incomplete tasks that have due dates. See “Quests page”.",
      "{#pin}**Pin:** Adds a shortcut to a quest in the sidebar. See “Quests page”.",
      "{#prepared}**Prepared by and Prepared for:** The export’s letterhead, showing your information first and the Quest giver’s second. See “Quest giver and Quest links”.",
      "{#promote-demote}**Promote and Demote:** **Promote** moves a candidate quest to active. **Demote** moves it back to candidate. See “The quest lifecycle”.",
      "{#quest}**Quest:** A project, from the initial idea through completion. See “The quest lifecycle”.",
      "{#quest-giver}**Quest giver:** The client or contact for this quest. See “Quest giver and Quest links”.",
      "{#quest-giver-export}**Quest giver export:** A read-only page you can share with a client. See “Quest giver and Quest links”.",
      "{#quest-links}**Quest links:** Connections between quests that belong to the same job. See “Quest giver and Quest links”.",
      "{#reroll}**Reroll and Roll:** Reroll replaces your hand of errands with a new one. Roll deals a first hand when your hand is empty. Overdue errands are prioritized, and you can undo either. See “Errands page”.",
      "{#scope}**Scope:** The total amount of work in a quest. The orange line shows when that amount changes. See “Timeline page”.",
      "{#slip-schedule}**Slip schedule:** Moves a quest’s incomplete tasks to later dates. You can undo this change. See “A quest’s Schedule and Timeline”.",
      "{#step}**Step:** A smaller action that makes up a task. See “Inside a quest”.",
      "{#stretch-of-work}**Stretch of work:** A period in a quest’s schedule, labeled Block, Sprint, Iteration, Phase, or Week. See “Options page”.",
      "{#task}**Task:** A piece of work within a quest. See “Inside a quest”.",
      "{#task-counts}**Task counts:** A weekly table of tasks in scope, how many remain against the plan, and tasks added or removed. See “Timeline page”.",
      "{#vault}**Vault:** Where you keep ideas and quests you’re no longer working on. See “Vault page”.",
      "{#workshop}**Workshop:** Where you keep and develop ideas before turning them into quests. See “Workshop page”."
    ]],
    ["Finding your way around", [
      "**Search:** Press [[/]] to search on a computer, or tap the magnifier on a phone. [[Enter]] opens the first result, [[Esc]] clears it. On a phone, tap the **x** where the magnifier was to cancel.",
      "**New (+) button:** Use the **+** button to add a candidate quest, task, step, decision, idea, or errand.",
      "**Main menu:** The **Main menu** (hamburger menu) lists every page in the app.",
      "**Tab bar (mobile):** On a mobile device, the tab bar holds the main pages. Find the other pages in the **Main menu**.",
      "**Undo:** Removing an item or sending it to the **Vault** shows an **Undo** button for a few seconds."
    ]],
    ["The quest lifecycle", [
      "Ideas live in the **Workshop** until you’re ready to consider pursuing them. Making an idea a candidate quest moves it to the **Candidate quests** section on the **Quests** page.",
      "A promoted quest is an active quest. It lands in **In progress** only if it has incomplete scheduled tasks. Otherwise it goes to **Pending**. You can later complete an active quest, demote it back to a candidate, or vault it.",
      "If you already know what you want to pursue, you can create a candidate quest directly with the **+** button.",
      "Finishing the last step of a task completes the task, and completing the last task of a quest (including its backlog tasks) completes the quest. You can also mark a task or quest complete manually. A quest has **Mark complete** and **Reopen** buttons on its page.",
      "The **Vault** stores old ideas and quests, either permanently or for a specified period of time (see the **Options** section for more)."
    ]],
    ["Today page", [
      "The **Today** page shows your most pressing task, and any overdue tasks. The **Burndown** chart shows how many tasks remain in all open quests (see the **Timeline** page for more). The **Stats** section displays all remaining and backlogged tasks."
    ]],
    ["Quests page", [
      "**In progress:** This section lists the quests you’re working on. Each quest appears as a row with its name, its next scheduled task and that task’s start date, and the number of incomplete scheduled tasks it has left.",
      ">Rows are ordered by the start date of each quest’s next task, from earliest to latest. A quest appears here only if it has incomplete scheduled tasks. Backlog tasks don’t count.",
      "**Pending:** These are promoted quests with no incomplete scheduled tasks. This includes new quests with no tasks, and quests whose only open tasks are backlogged. When it has an incomplete task with a due date, a quest moves up to **In progress**.",
      "**Completed:** This section lists completed quests.",
      "**Candidate quests:** These are quests you’re considering but aren’t working on. You can demote an active quest back to a candidate quest in the **Quest details**. Before promoting a candidate quest, you can add tasks, steps, and decisions to it.",
      ">A candidate quest keeps the links it had when it was demoted.",
      "**Pinned quests:** You can pin in progress, pending, and completed quests that are still on the **Quests** page. Pinning places a shortcut to that quest in the sidebar (or the **Main menu** on mobile). Completing a quest unpins it automatically. Reopening a formerly pinned quest restores the pin."
    ]],
    ["Inside a quest", [
      "**Quest details:** Tapping a quest title on the **Quests** page opens the quest details for editing.",
      "**Tasks:** You can add tasks with the **+** button or from inside a quest. Tasks can have start and due dates and a time estimate. You can also describe how you’ll know a task is complete.",
      ">Tasks without due dates show a **Backlog** badge. Tasks added after a quest’s start date show an **Added** badge with the date. Even with open steps and decisions, you can close a task.",
      ">Select **Make milestone** to turn a task with a due date into a milestone.",
      ">Each task goes into its quest’s **stretch of work**. A stretch of work is a period that divides a quest’s schedule. Stretches of work appear on the **Timeline** as gray bands. Tasks appear within each stretch of work and their color shows status: gray-blue for not started, gold for in progress, and green for completed.",
      "**Steps:** You can add steps with the **+** button or from inside a task. Steps break a task into smaller actions. Completing all of a task’s steps completes the task.",
      "**Decisions:** Every step within a task can require a decision. Answering an open decision closes the step.",
      "**Before you launch:** Tasks that must be done before a quest can launch go in this section. Selecting **Launch critical** adds a task to this section. This is only an organizational feature and does not otherwise change the task.",
      "**Notes:** Use **Notes** for any additional information about the quest. An idea’s note carries over when the idea becomes a candidate quest."
    ]],
    ["Quest giver and Quest links", [
      "**Quest giver:** The Quest giver is the client for a quest. You can also enter a **Bounty** (a monetary value), either as an hourly rate or a fixed payment for the quest.",
      ">The **Quest giver export** includes everything entered here except the **Bounty**. It creates a read-only, interactive web page you can share with the client. Before it exports, you choose whether to include **Prepared by** (your contact information and brandmark) and **Prepared for** (the Quest giver). Its button is at the bottom of an in progress or complete quest’s details and doesn’t appear on a candidate or vaulted quest.",
      "**Quest links:** When a job requires more than one quest, link them. Use **Link quest** to link a quest to any quest that is in progress, pending, or completed.",
      ">A candidate quest can add links the same way, but other quests can’t link to a candidate quest. Links to a candidate or vaulted quest show as plain text, and you can follow links to other quests.",
      ">Vaulting or demoting a quest keeps its links, and promoting or restoring it makes them active again."
    ]],
    ["A quest’s Schedule and Timeline", [
      "**Schedule:** Quests can have start and due dates, and stretch of work durations (see the **Options** section for more). A quest’s start and due dates divide its total time into stretches of work.",
      "**Timeline:** The **Timeline** for a quest shows that quest’s schedule as a simple Gantt chart, along with its burndown chart.",
      ">Use the **Slip schedule** button to push any incomplete tasks to a later date (you can undo a slip).",
      ">The Gantt chart displays milestones and all open tasks. A red line shows today’s date when it falls within the displayed schedule.",
      ">The **Burndown** works the same way as on the **Timeline** page, but counts only this quest’s tasks."
    ]],
    ["Tasks page", [
      "**Tasks:** This section shows tasks from all open quests, excluding candidate quests. They are listed by start date, earliest first. Tasks with the same start date are ordered by due date, then by the order they were created. Completed tasks appear at the bottom. You can edit tasks here without returning to the **Quests** page.",
      "**Backlog:** This section shows all open tasks without due dates."
    ]],
    ["Timeline page", [
      "The **Timeline** page shows the schedules of all open quests. It includes a Gantt chart of open quests and milestones, plus the overall burndown and task counts. A red line shows today’s date when it falls within the displayed schedules.",
      ">The **Burndown** chart shows how many tasks remain in all open quests. The straight **Ideal** line shows the planned rate of progress, and the **Actual** line shows your progress. Adding or removing work changes the amount remaining.",
      ">The dotted **Forecast** line shows the projected trajectory for completing the remaining work. Hovering over the dot at the end shows the projected completion date. The orange **Scope** line shows changes in scope. You can tap or drag across the burndown to see dates and remaining tasks.",
      "The **Stats** section displays all remaining and backlogged tasks. The **Task counts** table shows how many tasks remain and tracks changes in scope. Adding a scheduled task raises the scope and deleting one lowers it. Each change shows in the **Scope change** column."
    ]],
    ["Errands page", [
      "**Errands:** List for small errands that aren’t quite a quest. Errands don’t appear on the **Timeline**, the **Burndown**, or the **Tasks** page, and they don’t change any counts.",
      "**Add errand:** Type an errand and select **Add errand** or press [[Enter]]. You can also give errands a due date. Select the pencil to rename an errand.",
      "**Errands deck:** Contains open errands that aren’t in your hand. Errands with due dates appear first, earliest due date first. The rest follow in the order they were added. Overdue errands display an **Overdue** badge.",
      "**Your hand:** Up to three errands you keep at the top of the page. Select **Manage hand** to choose errands, put them in order, or discard them. **Empty hand**, in **Manage hand**, clears your hand, and you can undo that.",
      "**Choose** and **Discard:** **Choose** adds an errand to your hand and **Discard** returns it to the deck. **Discard** never deletes an errand. Your hand holds three errands, so **Choose** turns off when it’s full.",
      "**Reroll** and **Roll:** Once you have a hand, the button reads **Reroll** and replaces your whole hand, including errands you chose yourself. With an empty hand, it reads **Roll** and deals a first hand. Overdue errands get priority, followed by other errands not currently in your hand. This helps you work through overdue errands before repeating them. Select **Undo** right away to restore your previous hand. **Reroll** is disabled when fewer than two open errands remain, and **Roll** needs only one. With **Sound effects** on, it plays a sound. Turn off the **Animated reroll** in **Options**.",
      "**Complete errand:** Check the box next to an errand to mark it complete. It moves to the **Completed** section.",
      "**Restore errand:** Uncheck a completed errand to move it back to the **Errands deck**.",
      "**Delete forever:** Permanently deletes an errand. Select **Undo** right away to restore it."
    ]],
    ["Workshop page", [
      "All ideas live here. Use them to think through new quests or prospects. You can either select **Make candidate** to turn an idea into a candidate quest or **Vault** it."
    ]],
    ["Vault page", [
      "The **Vault** is a place to store ideas and quests you’re no longer actively working with but may want to keep. You can use **Restore** or **Delete forever** on vaulted items. You can also choose to have the **Vault** automatically delete old items after a set period."
    ]],
    ["Options page", [
      "**Adventurer:** This is where you can add your contact information and brandmark or logo. You can choose whether or not to include it when creating a **Quest giver export**.",
      "**Schedule defaults:** Set the default length of a **stretch of work**. You can adjust the stretch duration for individual quests.",
      ">You can also choose what to call a stretch of work: Block, Sprint, Iteration, Phase, or Week.",
      ">**Warn when active quests exceed:** Set the number of active quests you want to allow at a time. If you try to promote another candidate quest past that number, Sidequest warns you, and you can bypass the warning.",
      ">**Quests begin gathering dust after:** Set how long an active quest can go without progress before it displays a **Gathering dust** badge.",
      "**Appearance and formats:** These settings include **Date format**, **Coin format** (1,234.56 or 1.234,56), **Splash screen on open** (on/off), **Theme** (light and dark mode), **Animated burndown** (on/off), **Animated reroll** (on/off), **Completion effects** (on/off), and **Sound effects** (on/off).",
      "**Vault:** Set how long the **Vault** keeps items before it deletes them: never, or after 7, 30, 60, or 90 days.",
      "**Install Sidequest:** If you’re using Sidequest on the web, you can install it to your device. iPhones and iPads don’t show this button: tap the **Share** icon in Safari, then **Add to Home Screen**, to install it. The installed version displays a **Refresh** button in the top bar.",
      "**Import:** Bring tasks from another application into Sidequest. Sidequest can import Trello JSON or Todoist CSV as a new quest.",
      "**Backup and restore:** Download a backup of your Sidequest data as a JSON file. Because the web and installed versions store your data on your device, make occasional backups. **Restore backup** loads a backup file and replaces everything in Sidequest with it. You’ll see a warning first, and an **Undo** button afterward.",
      "**Start fresh:** Erase all Sidequest data and start again (your options are retained). You can begin with an empty Sidequest or with the sample quests. You’ll get a warning and a chance to save a backup first. This cannot be undone."
    ]],
  ];
}
export function renderHelp(root) {
  // A filter box: typing narrows the sections to those that contain the text, and opens them.
  var filterWrap = el("div", { "class": "field", style: "margin-top:0" });
  var filt = el("input", { type: "search", id: "helpFilter", placeholder: "Filter the Field guide", "aria-label": "Filter the Field guide", autocomplete: "off" });
  filterWrap.appendChild(filt); root.appendChild(filterWrap);
  var acts = el("div", { "class": "actions", style: "margin-top:10px" }), items = [];
  var openAll = el("button", { type: "button", "class": "small", id: "helpOpen" }, "Open all"), closeAll = el("button", { type: "button", "class": "small", id: "helpClose" }, "Close all");
  on(openAll, "click", function () { items.forEach(function (d) { d.open = true; }); });
  on(closeAll, "click", function () { items.forEach(function (d) { d.open = false; }); });
  var replay = el("button", { type: "button", "class": "small tutorialbtn", id: "helpReplay", style: "margin-left:auto", title: "Play the first-run walkthrough" }, "Play tutorial");
  on(replay, "click", function () { go("today"); startTutorial(); });
  acts.appendChild(openAll); acts.appendChild(closeAll); acts.appendChild(replay); root.appendChild(acts);
  // A line that starts with ">" is nested one level under the line above it (">>" is two levels).
  // The install line is about the web app, so a hosted version (Claude, or any host that sets the flag) skips it.
  helpTopics().forEach(function (t, i) {
    var d = el("details", { "class": "helpitem" }); if (i === 0) d.open = true;
    d.appendChild(el("summary", null, t[0]));
    var body = el("div", { "class": "hbody" }), ul = el("ul"), stack = [ul];
    t[1].forEach(function (line) {
      var depth = 0; while (line.charAt(depth) === ">") depth++;
      var text = line.slice(depth);
      if (isHosted() && text.indexOf("**Install Sidequest:**") === 0) return;
      while (stack.length > depth + 1) stack.pop();
      while (stack.length < depth + 1) {
        var parent = stack[stack.length - 1].lastChild, nested = el("ul");
        if (!parent) { parent = el("li"); stack[stack.length - 1].appendChild(parent); }
        parent.appendChild(nested); stack.push(nested);
      }
      var li = el("li"), tm = text.match(/^\{#([a-z-]+)\}/); if (tm) li.setAttribute("data-term", tm[1]);
      li.appendChild(helpMarkup(text)); stack[stack.length - 1].appendChild(li);
    });
    body.appendChild(ul); d.appendChild(body); root.appendChild(d); items.push(d);
  });
  var noMatch = el("p", { "class": "hint", role: "status", "aria-live": "polite" }); noMatch.hidden = true; root.appendChild(noMatch);
  // Arriving from a "?" button: open that one topic and bring it into view.
  if (ui.helpTopic) {
    var target = ui.helpTopic; ui.helpTopic = null;
    items.forEach(function (d) {
      var hit = d.querySelector("summary").textContent === target;
      d.open = hit;
      if (hit) { var sm = d.querySelector("summary"); sm.setAttribute("tabindex", "-1"); window.setTimeout(function () { try { d.scrollIntoView(); sm.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50); }
    });
  }
  // Curly and straight quotes count as the same, so typing an apostrophe always matches.
  function norm(s) { return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"'); }
  var texts = items.map(function (d) { return norm(d.textContent); });
  var titles = items.map(function (d) { return norm(d.querySelector("summary").textContent); });
  var labels = items.map(function (d) { return [].map.call(d.querySelectorAll(".hbody b"), function (b) { return norm(b.textContent); }); });
  var sums = items.map(function (d) { return d.querySelector("summary"); }), sumOriginals = sums.map(function (x) { return x.textContent; });
  var bodies = items.map(function (d) { return d.querySelector(".hbody"); }), originals = bodies.map(function (b) { return b.innerHTML; });
  function esc(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  // Wraps each matching word in a <mark>; a phrase split across bold text still opens the section but is not marked.
  function highlight(body, words) {
    var re = new RegExp(words.slice().sort(function (x, y) { return y.length - x.length; }).map(esc).join("|"), "g");
    var walker = document.createTreeWalker(body, 4), nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var low = norm(node.data), m, pos = 0, frag = document.createDocumentFragment(), found = false;
      re.lastIndex = 0;
      while ((m = re.exec(low))) {
        if (!m[0]) { re.lastIndex++; continue; }
        found = true;
        if (m.index > pos) frag.appendChild(document.createTextNode(node.data.slice(pos, m.index)));
        frag.appendChild(el("mark", null, node.data.slice(m.index, m.index + m[0].length)));
        pos = m.index + m[0].length;
      }
      if (!found) return;
      if (pos < node.data.length) frag.appendChild(document.createTextNode(node.data.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    });
  }
  function place(order) { order.forEach(function (i) { root.insertBefore(items[i], noMatch); }); }
  // Every word must appear in a topic. A Terms entry that starts with the whole query ranks first, then a title hit,
  // then a bold label hit, then the body; only topics with one of the first three open on their own.
  function score(i, q, words) {
    var all = words.every(function (w) { return texts[i].indexOf(w) >= 0; });
    if (!all) return null;
    var sc = 0, strong = false;
    if (titles[i] === "terms" && labels[i].some(function (l) { return l === q || l.indexOf(q) === 0; })) { sc += 1000; strong = true; }
    if (words.every(function (w) { return titles[i].indexOf(w) >= 0; })) { sc += 100; strong = true; }
    var lab = labels[i].filter(function (l) { return words.every(function (w) { return l.indexOf(w) >= 0; }); }).length;
    if (lab) { sc += 50 * Math.min(lab, 3); strong = true; }
    var count = 0, at = texts[i].indexOf(words[0]);
    while (at >= 0) { count++; at = texts[i].indexOf(words[0], at + words[0].length); }
    sc += Math.min(count, 20);
    return { score: sc, strong: strong, count: count };
  }
  on(filt, "input", function () {
    var q = norm(filt.value.trim()), words = q ? q.split(/\s+/) : [], any = false, ranked = [];
    items.forEach(function (d, i) {
      bodies[i].innerHTML = originals[i]; sums[i].textContent = sumOriginals[i];
      var r = q ? score(i, q, words) : null;
      d.hidden = !!q && !r;
      if (q && r) ranked.push({ i: i, r: r });
    });
    if (!q) { place(items.map(function (d, i) { return i; })); items.forEach(function (d, i) { d.open = i === 0; }); }
    else {
      ranked.sort(function (x, y) { return y.r.score - x.r.score || x.i - y.i; });
      any = ranked.length > 0;
      var anyStrong = ranked.some(function (x) { return x.r.strong; });
      place(ranked.map(function (x) { return x.i; }).concat(items.map(function (d, i) { return i; }).filter(function (i) { return items[i].hidden; })));
      ranked.forEach(function (x, k) {
        items[x.i].open = x.r.strong || (!anyStrong && k === 0);
        highlight(bodies[x.i], words);
        // The Terms list is long, so only its matching entries stay while searching.
        if (titles[x.i] === "terms") [].forEach.call(bodies[x.i].querySelectorAll("li"), function (li) { var t = norm(li.textContent); li.hidden = !words.every(function (w) { return t.indexOf(w) >= 0; }); });
        sums[x.i].appendChild(el("span", { "class": "helpcount" }, " (" + x.r.count + (x.r.count === 1 ? " match)" : " matches)")));
      });
    }
    noMatch.hidden = !q || any;
    noMatch.textContent = q && !any ? "No sections match “" + filt.value.trim() + "”." : "";
  });
  on(filt, "keydown", function (e) { if (e.key === "Escape" && filt.value) { e.preventDefault(); filt.value = ""; filt.dispatchEvent(new Event("input")); } });
}

/* settings */
export function blankState() {
  var d = defaults();
  d.tasks = []; d.decisions = []; d.quests = []; d.workshop = []; d.jobs = []; d.hand = []; d.pins = []; d.lastSlip = null;
  d.start = iso(TODAY); d.days = state.days; d.settings = state.settings;
  return d;
}
export function startFreshDialog() {
  openModal("Start fresh", function (body) {
    body.appendChild(el("p", { "class": "first" }, "Start fresh erases everything stored in " + (isHosted() ? "your account" : "this browser") + ". This cannot be undone."));
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
      var keep = state.settings; keep.hideWelcome = false;
      keep.since = iso(TODAY); keep.lastBackup = ""; // new data, so the backup reminder clock starts over
      if (picked === "original") { setState(defaults()); state.settings = keep; } else { setState(blankState()); }
      ui.sel = null; ui.detail = false; ui.vaultFilter = "all"; applyTheme(); save(); closeModal(); go("today"); notify("Started fresh.");
      if (state.settings.audio) playSfx("assets/sfx/startFresh.mp3");
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
  var msg = el("p", { "class": "msg schedulesmsg", role: "alert" });
  var preview = el("div", { "class": "brandmarkpreview" });
  var limits = el("p", { "class": "hint", style: "margin-top:0" }, "Must be " + BRANDMARK_MAX_DIM + "×" + BRANDMARK_MAX_DIM + " pixels or smaller, and up to " + Math.round(BRANDMARK_MAX_BYTES / 1024) + " KB.");
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
    limits.hidden = !!state.settings.brandmark;
  }
  renderPreview();
  w.appendChild(preview); w.appendChild(limits); w.appendChild(msg);
  return w;
}
// Set by app.js's beforeinstallprompt listener; null once installed or triggered.
var deferredInstallPrompt = null;
export function setDeferredInstallPrompt(e) { deferredInstallPrompt = e; }
// True once an install finishes while this browser tab stays open.
var installedThisSession = false;
export function setInstalledThisSession(v) { installedThisSession = v; }
// Resolves true when this browser reports an installed copy (Chromium only); any other answer or error is false.
function detectInstalledApp() {
  try {
    if (typeof navigator === "undefined" || typeof navigator.getInstalledRelatedApps !== "function") return Promise.resolve(false);
    return navigator.getInstalledRelatedApps().then(function (apps) { return apps.some(function (a) { return a.platform === "webapp"; }); }, function () { return false; });
  } catch (e) { return Promise.resolve(false); }
}
// Set by app.js after checkForAppUpdate() resolves; null unless a newer
// version's stamp was found in meta/version (Claude artifact build only).
var availableUpdateVersion = null;
export function setAvailableUpdateVersion(v) { availableUpdateVersion = v; }
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
  side.appendChild(withHelp(el("h2", { "class": "first" }, "Adventurer"), "adventurer", "Adventurer"));
  var contactBox = el("div");
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
  side.appendChild(collapsibleSection("contact", function () { var c = state.settings.contact; return [c.company, c.name].filter(Boolean).join(" · "); }, contactBox, "Add your contact details"));

  var msg = el("p", { "class": "msg schedulesmsg", role: "status", "aria-live": "polite" });
  root.appendChild(el("h2", { "class": "setmain-head" }, "Schedule defaults"));
  var scheduleBox = el("div", { "class": "box", style: "margin-top:10px" });
  var grid = el("div", { "class": "setgrid hinted" });
  function fieldOf(id, label, input, hint, term) { var w = el("div", { "class": "field" }), lab = el("label", { "for": id }, label); if (term) { var lr = el("div", { "class": "labelrow" }); lr.appendChild(lab); lr.appendChild(helpLink(term[0], term[1])); w.appendChild(lr); } else w.appendChild(lab); w.appendChild(input); if (hint) { input.setAttribute("aria-describedby", id + "-hint"); w.appendChild(el("p", { "class": "hint", id: id + "-hint" }, hint)); } grid.appendChild(w); }
  var da = el("input", { type: "number", id: "set-days", min: "1", max: "30", step: "1", inputmode: "numeric" }); da.value = state.days;
  on(da, "change", function () { var v = parseInt(da.value, 10); if (isNaN(v) || v < 1 || v > 30) { da.value = state.days; msg.textContent = wd() + " length must be from 1 to 30 days."; return; } state.days = v; changed(); notify(wd() + " length saved."); });
  fieldOf("set-days", "Default days per " + wd().toLowerCase(), da);
  var bwSel = el("select", { id: "set-word", "class": "plain" });
  Object.keys(WORDS).forEach(function (k) { var op = el("option", { value: k }, k); if (k === wd()) op.selected = true; bwSel.appendChild(op); });
  on(bwSel, "change", function () { state.settings.blockWord = bwSel.value; changed(); });
  fieldOf("set-word", "Name for each stretch of work", bwSel, undefined, ["stretch-of-work", "Stretch of work"]);
  var dustSel = el("select", { id: "set-dust", "class": "plain" });
  [[0, "Never"], [7, "7 days"], [14, "14 days"], [30, "30 days"], [60, "60 days"]].forEach(function (o) { var op = el("option", { value: String(o[0]) }, o[1]); if (o[0] === state.settings.dustDays) op.selected = true; dustSel.appendChild(op); });
  on(dustSel, "change", function () { state.settings.dustDays = parseInt(dustSel.value, 10); changed(); });
  var wipSel = el("select", { id: "set-wip", "class": "plain" });
  [[0, "No limit"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]].forEach(function (o) { var op = el("option", { value: String(o[0]) }, o[1]); if (o[0] === state.settings.wipLimit) op.selected = true; wipSel.appendChild(op); });
  on(wipSel, "change", function () { state.settings.wipLimit = parseInt(wipSel.value, 10); changed(); });
  fieldOf("set-wip", "Warn when active quests exceed", wipSel);
  fieldOf("set-dust", "Quests begin gathering dust after", dustSel);
  scheduleBox.appendChild(grid); scheduleBox.appendChild(msg); root.appendChild(scheduleBox);

  root.appendChild(el("h2", null, "Appearance and formats"));
  var appearanceBox = el("div", { "class": "box", style: "margin-top:10px" });
  var ag = el("div", { "class": "setgrid hinted" });
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
  tw.appendChild(th);
  var ag2 = el("div", { "class": "setgrid", style: "margin-top:10px" });
  var cw = el("div", { "class": "field" }); cw.appendChild(el("label", { "for": "set-coin" }, "Coin format"));
  var cs = el("select", { id: "set-coin", "class": "plain" });
  [["us", "1,234.56"], ["eu", "1.234,56"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if (o[0] === state.settings.coinFormat) op.selected = true; cs.appendChild(op); });
  on(cs, "change", function () { state.settings.coinFormat = cs.value; changed(); });
  cw.appendChild(cs); ag.appendChild(cw);
  appearanceBox.appendChild(ag);
  var sw = el("div", { "class": "field" }); sw.appendChild(el("label", { "for": "set-splash" }, "Splash screen on open"));
  var ss = el("select", { id: "set-splash", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.showSplash) op.selected = true; ss.appendChild(op); });
  on(ss, "change", function () { state.settings.showSplash = ss.value === "on"; save(); });
  sw.appendChild(ss);
  var abw = el("div", { "class": "field" }); abw.appendChild(el("label", { "for": "set-animated-burndown" }, "Animated burndown"));
  var abs = el("select", { id: "set-animated-burndown", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.animatedBurndown) op.selected = true; abs.appendChild(op); });
  on(abs, "change", function () { state.settings.animatedBurndown = abs.value === "on"; save(); });
  abw.appendChild(abs);
  var arw = el("div", { "class": "field" }); arw.appendChild(el("label", { "for": "set-animated-reroll" }, "Animated reroll"));
  var ars = el("select", { id: "set-animated-reroll", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.animatedReroll) op.selected = true; ars.appendChild(op); });
  on(ars, "change", function () { state.settings.animatedReroll = ars.value === "on"; save(); });
  arw.appendChild(ars);
  var fxw = el("div", { "class": "field" }); fxw.appendChild(el("label", { "for": "set-completion-fx" }, "Completion effects"));
  var fxs = el("select", { id: "set-completion-fx", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.completionFx) op.selected = true; fxs.appendChild(op); });
  on(fxs, "change", function () { state.settings.completionFx = fxs.value === "on"; save(); });
  fxw.appendChild(fxs);
  var aw2 = el("div", { "class": "field" }); aw2.appendChild(el("label", { "for": "set-audio" }, "Sound effects"));
  var as = el("select", { id: "set-audio", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.audio) op.selected = true; as.appendChild(op); });
  on(as, "change", function () { state.settings.audio = as.value === "on"; save(); });
  aw2.appendChild(as);
  // Order on screen: Date format, Coin format, Splash screen on open, Theme, Animated burndown, Animated reroll, Completion effects, Sound effects.
  [sw, tw, abw, arw, fxw, aw2].forEach(function (w) { ag2.appendChild(w); });
  appearanceBox.appendChild(ag2);
  root.appendChild(appearanceBox);

  root.appendChild(el("h2", null, "Vault"));
  var vaultBox = el("div", { "class": "box", style: "margin-top:10px" });
  var pg = el("div", { "class": "setgrid" });
  var pw = el("div", { "class": "field" }); pw.appendChild(el("label", { "for": "set-purge" }, "Auto-delete vaulted items after"));
  var ps = el("select", { id: "set-purge", "class": "plain" });
  [[0, "Never"], [7, "7 days"], [30, "30 days"], [60, "60 days"], [90, "90 days"]].forEach(function (o) { var op = el("option", { value: String(o[0]) }, o[1]); if (o[0] === state.settings.vaultPurgeDays) op.selected = true; ps.appendChild(op); });
  on(ps, "change", function () { state.settings.vaultPurgeDays = parseInt(ps.value, 10); changed(); });
  pw.appendChild(ps); pg.appendChild(pw);
  vaultBox.appendChild(pg);
  if (state.settings.vaultPurgeDays) vaultBox.appendChild(el("p", { "class": "hint" }, "Checked each time Sidequest opens. An item older than this, counted from when it was vaulted, is deleted permanently with no further warning."));
  root.appendChild(vaultBox);

  if (!isHosted()) {
    root.appendChild(el("h2", null, "Install Sidequest"));
    // navigator.standalone is a non-standard flag some mobile browsers use instead of
    // the display-mode query; the two checks together cover every installed app.
    var isStandalone = (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    function uninstallLine() {
      var p = el("p", { "class": "hint" });
      if (isStandalone) {
        p.appendChild(document.createTextNode("To uninstall Sidequest, open the title bar menu and select "));
      } else {
        p.appendChild(document.createTextNode("To uninstall Sidequest, open the app, open the title bar menu, and select "));
      }
      p.appendChild(el("strong", null, "Uninstall Sidequest..."));
      p.appendChild(document.createTextNode("."));
      return p;
    }
    var installBox = el("div", { "class": "box", style: "margin-top:10px" });
    if (isStandalone) {
      installBox.appendChild(uninstallLine());
    } else if (installedThisSession) {
      installBox.appendChild(el("p", { "class": "hint first" }, "Sidequest is installed. Open it from your apps or desktop."));
      installBox.appendChild(uninstallLine());
    } else if (deferredInstallPrompt) {
      installBox.appendChild(el("p", { "class": "hint first" }, "Install Sidequest as an app on your computer or mobile device. PWA installation is not supported by all browsers or devices."));
      installBox.appendChild(on(el("button", { type: "button", id: "installBtn" }, "Install Sidequest"), "click", triggerInstall));
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      // These devices have no Install button, so they get their own steps.
      installBox.appendChild(el("p", { "class": "hint first" }, "On iPhone or iPad: tap Share, then Add to Home Screen."));
    } else {
      var installNote = el("p", { "class": "hint first" }, "Sidequest is already installed as an app, or your browser does not show an Install button. If it is not installed, look in your browser’s menu for Install or Add to Home Screen.");
      installBox.appendChild(installNote);
      installBox.appendChild(uninstallLine());
      detectInstalledApp().then(function (yes) { if (yes) installNote.textContent = "Sidequest is installed. Open it from your apps or desktop."; });
    }
    root.appendChild(installBox);
  }

  root.appendChild(el("h2", null, "Import"));
  var importBox = el("div", { "class": "box", style: "margin-top:10px" });
  importBox.appendChild(el("p", { "class": "hint", style: "margin-bottom:12px" }, "Import tasks from Trello (JSON) or Todoist (CSV) into a new quest."));
  importPanel(importBox);
  root.appendChild(importBox);

  root.appendChild(el("h2", null, "Backup and restore"));
  var backupBox = el("div", { "class": "box", style: "margin-top:10px" });
  backupPanel(backupBox);
  root.appendChild(backupBox);

  root.appendChild(el("h2", { id: "startFreshHeading", "class": "scrollhead", tabindex: "-1" }, "Start fresh"));
  var box = el("div", { "class": "dangerbox" });
  box.appendChild(el("p", { "class": "hint first" }, "Erase all Sidequest data stored in " + (isHosted() ? "your account" : "this browser") + " and start again (options are retained). You will receive a warning and have a chance to save a backup first."));
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
function isFramed() {
  try { return window.parent !== window.self; } catch (e) { return true; }
}
// Phones and tablets: a webview there swallows a scripted download without saying so, and
// nothing reports the difference, so the plain download can't be trusted on them.
function isMobileDevice() {
  try {
    var ua = window.navigator.userAgent || "";
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
  } catch (e) { return false; }
}
function cancelled(err) { return !!err && (err.code === "declined" || err.name === "AbortError"); }
// Shows the file's text with a Copy button, for a frame where nothing else can hand over a file.
function manualSaveDialog(name, text, mime, onSaved, capability) {
  openModal("Save " + name, function (body) {
    var file = null;
    try { file = new window.File([text], name, { type: mime }); } catch (e) { file = null; }
    var canShare = !!(isMobileDevice() && file && window.navigator.share && window.navigator.canShare && window.navigator.canShare({ files: [file] }));
    var label = canShare || capability ? "Save file" : "Download file";
    body.appendChild(el("p", { "class": "hint first" }, "Choose " + label + " to save " + name + ". If nothing happens, open the copy option below."));
    var note = el("p", { "class": "hint" }, "");
    function copyInstead(why) { note.textContent = why + " Copy the text below instead."; }
    var main = on(el("button", { type: "button", "class": "primary" }, label), "click", function () {
      if (capability) {
        capability.save({ filename: name, data: text }).then(function () { closeModal(); if (onSaved) onSaved(); }, function (err) {
          if (cancelled(err)) note.textContent = "Save canceled.";
          else copyInstead("Saving isn't available here.");
        });
        return;
      }
      if (canShare) {
        window.navigator.share({ files: [file] }).then(function () { closeModal(); if (onSaved) onSaved(); }, function (err) {
          if (!cancelled(err)) copyInstead("Saving isn't available here.");
        });
        return;
      }
      try {
        var url = URL.createObjectURL(new Blob([text], { type: mime })), a = el("a", { href: url, download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        copyInstead("If nothing downloaded,");
      } catch (e) { copyInstead("Download isn't available here."); }
    });
    var acts = el("div", { "class": "actions" }); acts.appendChild(main); body.appendChild(acts); body.appendChild(note);
    var more = el("details", { style: "margin-top:var(--space-16)" });
    more.appendChild(el("summary", null, "Didn't work? Copy the text instead"));
    more.appendChild(el("p", { "class": "hint" }, "Copy the text, paste it into a new text file, and save it as " + name + "."));
    var box = el("textarea", { readonly: "readonly", rows: "8", "aria-label": name, style: "margin-top:var(--space-10)" });
    box.value = text; more.appendChild(box);
    var copyNote = el("p", { "class": "hint" }, "");
    var copyActs = el("div", { "class": "actions" });
    copyActs.appendChild(on(el("button", { type: "button" }, "Copy"), "click", function () {
      function done(ok) { copyNote.textContent = ok ? "Copied." : "Select the text and copy it."; }
      box.focus(); box.select();
      try {
        if (window.navigator.clipboard && window.navigator.clipboard.writeText) { window.navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); return; }
        done(document.execCommand("copy"));
      } catch (e) { done(false); }
    }));
    more.appendChild(copyActs); more.appendChild(copyNote); body.appendChild(more);
  });
}
// Hands the viewer a file. Resolves "saved", "downloaded" (unverifiable) or "manual" (nothing saved yet), and rejects on cancel or failure.
function saveFile(name, text, mime, desc, ext, onSaved) {
  return downloadsReady.then(function (d) {
    if (d) { manualSaveDialog(name, text, mime, onSaved, d); return "manual"; }
    var unreliable = isFramed() || isMobileDevice();
    function fallback() {
      if (unreliable) { manualSaveDialog(name, text, mime, onSaved); return "manual"; }
      var blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob);
      var a = el("a", { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return "downloaded";
    }
    if (typeof window.showSaveFilePicker === "function") {
      var accept = {}; accept[mime] = [ext];
      return window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept: accept }] })
        .then(function (h) { return h.createWritable(); })
        .then(function (w) { return w.write(text).then(function () { return w.close(); }); })
        .then(function () { return "saved"; }, function (err) {
          if (cancelled(err) || !unreliable) throw err;
          return fallback();
        });
    }
    return fallback();
  });
}
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
  return !isHosted() && daysSinceBackup() >= BACKUP_REMIND_DAYS;
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
  saveFile(name, text, "application/json", "Sidequest backup", ".json", function () { saved("Backup saved."); }).then(function (r) {
    if (r === "manual") msg.textContent = "Use Save or Copy in the box to save " + name + ". It is not counted as saved until you do.";
    else saved(r === "downloaded" ? "Backup downloaded." : "Backup saved.");
  }).catch(function (err) {
    msg.textContent = err && (err.code === "declined" || err.name === "AbortError") ? "Save canceled." : "The backup could not be saved.";
  });
}
// Reads a Trello JSON board export into a plain summary. Labels, members, comments, attachments, and custom fields are dropped by design.
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
function isISOInstant(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v); }
// Builds a new quest from a parsed Trello summary: start is the earliest due
// date found (or today, with nothing to anchor to), so every card's due
// date is guaranteed on or after the quest's start and never gets rejected.
function buildQuestFromTrello(summary) {
  var dues = summary.cards.map(function (c) { return c.due; }).filter(Boolean).sort();
  var start = dues.length ? dues[0] : iso(TODAY);
  var p = makeQuest(uid(), S(summary.boardName, 120) || "Imported board", "active", { start: start });
  var tasks = summary.cards.map(function (c) {
    var blk = 0, due = "";
    if (c.due) { var b = blockForDate(p.id, parseISO(c.due)); if (b !== null) { blk = b; due = c.due; } }
    var t = task(uid(), blk, p.id, S(c.name, 300), false, c.steps.map(function (s) { return st(uid(), s.text, s.done); }));
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
// Todoist's date field: an ISO date is used as is, "today", "tomorrow" and "in N days" resolve to real dates, and anything else stays unscheduled.
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
      "This backup holds " + np + (np === 1 ? " quest" : " quests") + " and " + nt + (nt === 1 ? " task" : " tasks") + ". Restoring replaces everything in Sidequest" + (isHosted() ? "" : " on this device") + ": all current quests, tasks, notes, history, and settings. You will have a few seconds to undo it.",
      "Restore backup", function () {
        if (state.settings.audio) playSfx("assets/sfx/restoreBackup.mp3");
        var before = JSON.stringify(state);
        setState(next); ui.sel = null; ui.detail = false; applyTheme(); save(); renderAll();
        replaySplash();
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
  (hintHost || root).appendChild(el("p", { "class": "hint" }, (isHosted() ? "Your data is saved in your account." : "Your data is saved in this browser on this device.") + " Create a backup from time to time and keep the file somewhere safe. You can restore your data from a backup at any time."));
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
