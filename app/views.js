import { go, openTask, renderView } from "./app.js";
import { drawChart, drawQuestChart, rangeBlock } from "./chart.js";
import { DAY, TODAY, fmt, fmtY, iso, parseISO } from "./dates.js";
import { ideaDialog } from "./dialogs.js";
import { $, el, helpLink, isHosted, notify, on, scrollTop, uid } from "./dom.js";
import { backupControls, backupReminderDue, daysSinceBackup } from "./files.js";
import { deleteForever, emptyVault, promoteToActive, removeToVault, restoreEntry, vaultEntries } from "./lifecycle.js";
import { activeQuests, backlogTasks, candidateQuests, checkpointStep, checkpoints, counted, dispQuest, findQuest, findTask, fmtHours, globalActual, isDusty, isLate, isPinned, lateTasks, live, liveQuests, nextTask, ordered, pinPage, planCounted, planned, pset, questMeta, questRemainingUnits, questTotalUnits, remainingUnits, short, taskEnd, taskStart, totalUnits, unpinPage, validPage, wl } from "./model.js";
import { buildDetail } from "./quest-page.js";
import { APP_VERSION, changed, makeQuest, quest, releaseFileUrl, save, state, ui } from "./state.js";
import { startTutorial } from "./tutorial.js";

/* views */
// Added to the plan after its quest started: a scope change, marked on the task itself.
// "1 of 3 steps", then "Est 6 h" -- with a bullet between them only when both show.
export function stepsAndEst(l3, t) {
  var steps = t.steps.length ? t.steps.filter(function (x) { return x.done; }).length + " of " + t.steps.length + " steps" : "";
  if (steps) l3.appendChild(el("span", null, steps));
  if (steps && t.est > 0) l3.appendChild(el("span", { "aria-hidden": "true" }, "\u00b7"));
  if (t.est > 0) l3.appendChild(el("span", null, "Est " + fmtHours(t.est)));
}

export function addedChip(t) {
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
  box.appendChild(el("p", { "class": "ptitle" }, t.what));
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
    b.appendChild(el("div", { "class": "l1" }, dispQuest(t) + " · Ended on " + fmt(taskEnd(t))));
    b.appendChild(el("div", { "class": "l2" }, t.what));
    on(b, "click", function () { openTask(t.id); }); li.appendChild(b); ul.appendChild(li);
  });
  box.appendChild(ul);
  return box;
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
  if (versionBannerDue()) root.appendChild(versionBanner());
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
export var bannerFit = null;

// The web app and installed app show this once after they update; hosted copies have the prompt banner above instead.
function versionBannerDue() { return !isHosted() && !!state.settings.seenVersion && state.settings.seenVersion !== APP_VERSION; }
function versionBanner() {
  var box = el("div", { "class": "box updatebanner", style: "margin-bottom:22px" });
  box.appendChild(el("h2", { "class": "first", style: "margin-bottom:4px" }, "Sidequest has leveled up!"));
  box.appendChild(el("p", { "class": "hint first" }, "You are now questing in version " + APP_VERSION + "."));
  var ar = el("div", { "class": "actions" });
  ar.appendChild(on(el("button", { type: "button", title: "Hide this notice" }, "Dismiss"), "click", function () {
    state.settings.seenVersion = APP_VERSION; save(); box.remove();
  }));
  box.appendChild(ar);
  return box;
}
export function updateBanner() {
  var box = el("div", { "class": "box updatebanner", style: "margin-bottom:22px" });
  box.appendChild(el("h2", { "class": "first", style: "margin-bottom:4px" }, "Sidequest has leveled up!"));
  box.appendChild(el("p", { "class": "hint first" }, "You are questing in version " + APP_VERSION + ", and Sidequest version " + availableUpdateVersion + " is ready to go. To update, copy the prompt below and paste it into your AI chat."));
  // The ?v= suffix makes the link a new address, so a fetch tool that cached an older copy cannot reuse it.
  var promptText = "Please update my Sidequest artifact with the latest version, keeping all of my existing data.\n" + releaseFileUrl(availableUpdateVersion);
  var field = el("textarea", { "class": "updateprompt", readonly: "readonly", rows: "1", "aria-label": "Update prompt to paste into your AI chat" });
  field.value = promptText;
  on(field, "focus", function () { field.select(); });
  box.appendChild(field);
  // Sized to its text (the long URL wraps on a phone), once it is in the page.
  function fit() { if (!field.isConnected) return; field.style.height = "auto"; field.style.height = field.scrollHeight + 2 + "px"; }
  // One listener at a time: Today redraws this banner on every change.
  if (bannerFit) window.removeEventListener("resize", bannerFit);
  bannerFit = fit;
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
export function backupReminder() {
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
  l2.appendChild(document.createTextNode(t.what));
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
export function emptyList(text) {
  var ul = el("ul", { "class": "list", style: "margin-top:0" });
  ul.appendChild(el("li", { "class": "hint" }, text));
  return ul;
}

export function renderSchedule(root) {
  var o = ordered(), bl = backlogTasks();
  if (!o.length && !bl.length) {
    root.appendChild(emptyList(planCounted().length ? "No open tasks. A completed quest’s tasks stay on that quest’s page." : "No tasks yet. Use the + button to add one."));
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

// Pin/Unpin for a quest, shared by In progress and the Quests list.
export function questPinButton(key, name) {
  var pinned = isPinned(key);
  return on(el("button", { type: "button", "class": "small pintoggle" + (pinned ? " on" : ""), "aria-pressed": pinned ? "true" : "false", "aria-label": (pinned ? "Unpin " : "Pin ") + name, title: pinned ? "Unpin from the " + (isHosted() ? "main menu" : "sidebar") : "Pin to the " + (isHosted() ? "main menu" : "sidebar") }, pinned ? "Unpin" : "Pin"), "click", function () { if (pinned) unpinPage(key); else pinPage(key); });
}

export function dustChip() { return el("span", { "class": "chip dust", style: "margin-left:8px", title: "No activity for a while" }, "Gathering dust"); }

export function questRow(r) {
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
export function withHelp(h, id, name) { h.className = (h.className ? h.className + " " : "") + "hasq"; h.appendChild(helpLink(id, name)); return h; }

export function questListSection(title, rows, first, term) {
  var sec = el("div"), h = el("h2", first ? { "class": "first" } : null, title);
  sec.appendChild(term ? withHelp(h, term[0], term[1]) : h);
  var ul = el("ul", { "class": "list" });
  rows.forEach(function (r) { ul.appendChild(questRow(r)); });
  sec.appendChild(ul);
  return sec;
}

export function pendingSection(rows, first) { return questListSection("Pending", rows, first, ["pending", "Pending"]); }

export function completedSection(rows, first) { return questListSection("Completed", rows, first); }

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
export function pinStyle(pin) {
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

// A milestone diamond opens the task it's flagged on, same as any other task.
export function wireMilestoneDiamonds(node) {
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

/* vault */
export var KIND_LABEL = { quest: "Quest", idea: "Idea" };

export var KIND_FILTERS = [["all", "All"], ["quest", "Quests"], ["idea", "Ideas"]];

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

// Set by app.js after checkForAppUpdate() resolves; null unless a newer
// version's stamp was found in meta/version (Claude artifact build only).
export var availableUpdateVersion = null;

export function setAvailableUpdateVersion(v) { availableUpdateVersion = v; }
