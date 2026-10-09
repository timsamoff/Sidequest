import { state, changed, CHECKPOINTS } from "./state.js";
import { notify } from "./dom.js";
import { DAY, iso, addDays, parseISO, TODAY, weekStart } from "./dates.js";

export var CORE = [["today", "Today"], ["projects", "Quests"], ["schedule", "Tasks"], ["timeline", "Timeline"]];
export var BOTTOM = [["workshop", "Workshop"], ["vault", "Vault"], ["help", "Field guide"], ["settings", "Options"]];
export var WORDS = { Block: ["block", "blocks"], Sprint: ["sprint", "sprints"], Iteration: ["iteration", "iterations"], Phase: ["phase", "phases"], Week: ["week", "weeks"] };
export function wd() { return state.settings.blockWord in WORDS ? state.settings.blockWord : "Block"; }
export function wl() { return WORDS[wd()][0]; }
export function wpC() { var w = WORDS[wd()][1]; return w.charAt(0).toUpperCase() + w.slice(1); }
/* quest helpers -- Quest is the top-tier entity every task/decision/milestone
   attaches to by id, promoted in place from candidate to active. */
export function live(a) { return a.filter(function (x) { return !x.vault; }); }
export function liveQuests() { return live(state.quests); }
export function activeQuests() { return liveQuests().filter(function (p) { return p.status === "active"; }); }
export function candidateQuests() { return liveQuests().filter(function (p) { return p.status === "candidate"; }); }
export function completeQuests() { return liveQuests().filter(function (p) { return p.status === "complete"; }); }
// A Complete-but-not-vaulted quest's tasks drop out of every cross-quest
// surface (Tasks, Today, the burndown/Timeline), reversible the instant its status changes back.
export function isHiddenComplete(t) { var p = findQuest(t.questId); return !!p && p.status === "complete" && !p.vault; }
// Searches every quest, vaulted or not -- a vaulted quest's own page
// must stay reachable, read-only, until restored.
export function findQuest(id) { for (var i = 0; i < state.quests.length; i++) if (state.quests[i].id === id) return state.quests[i]; return null; }
export function findAnyQuest(id) { return findQuest(id); }
// True only when the quest has at least one counted task and every one of
// them is Completed -- an empty task list must never read as "done."
export function questTasksAllDone(p) {
  var ts = counted().filter(function (t) { return !t.isNext && t.questId === p.id; });
  return ts.length > 0 && ts.every(function (t) { return t.status === "Completed"; });
}
// Direct links only, one hop -- a linked quest may itself have further
// links, but this never walks past the first one.
export function linkedQuests(p) { return (p.linkedQuestIds || []).map(findQuest).filter(Boolean); }
// A link is bidirectional -- one fact shared by both records, so linking
// writes the id to both sides' arrays, and unlinking removes it from both.
export function linkQuests(aId, bId) {
  var a = findAnyQuest(aId), b = findAnyQuest(bId);
  if (!a || !b || a === b) return;
  if (a.linkedQuestIds.indexOf(bId) < 0) a.linkedQuestIds.push(bId);
  if (b.linkedQuestIds.indexOf(aId) < 0) b.linkedQuestIds.push(aId);
}
export function unlinkQuests(aId, bId) {
  var a = findAnyQuest(aId), b = findAnyQuest(bId);
  if (a) a.linkedQuestIds = a.linkedQuestIds.filter(function (id) { return id !== bId; });
  if (b) b.linkedQuestIds = b.linkedQuestIds.filter(function (id) { return id !== aId; });
}
export function pset(questId) { var p = findQuest(questId); return { start: (p && p.start) || state.start, days: (p && p.days) || state.days }; }
export function offsetFor(questId, n) { return n * pset(questId).days; }
export function blockStartFor(questId, b) { return addDays(parseISO(pset(questId).start), offsetFor(questId, b - 1)); }
export function blockEndFor(questId, b) { return addDays(parseISO(pset(questId).start), offsetFor(questId, b) - 1); }
// The inverse of blockStartFor/blockEndFor: which block a given date falls in,
// so a task can be scheduled by picking a due date. Null before the quest's own start.
export function blockForDate(questId, dateMs) {
  var eff = pset(questId), start = parseISO(eff.start);
  if (dateMs < start) return null;
  return Math.floor((dateMs - start) / (eff.days * DAY)) + 1;
}
export function projKey(t) { return t.isNext ? null : t.questId; }
// A task's own start/due dates, when set, are the truth; otherwise it fills its
// block. Its block is always the one containing its due date (see syncTaskBlocks).
export function taskStart(t) { return t.start ? parseISO(t.start) : blockStartFor(projKey(t), t.block); }
export function taskEnd(t) { return t.due ? parseISO(t.due) : blockEndFor(projKey(t), t.block); }
// Re-derives the block of every scheduled task that has its own due date, so a
// change to a quest's start or block length can't leave a stale block behind.
export function syncTaskBlocks() {
  state.tasks.forEach(function (t) {
    if (t.isNext || t.block === 0 || !t.due) return;
    var b = blockForDate(t.questId, parseISO(t.due));
    t.block = b === null ? 1 : b;
  });
}
// Estimated time is hours, shown as "3 h" or "1.5 h".
export function fmtHours(h) { return (Math.round(h * 100) / 100) + " h"; }
export function fmtHoursLong(h) { var r = Math.round(h * 100) / 100; return r + (r === 1 ? " hour" : " hours"); }
// Total and still-open estimated hours across every task of one quest,
// Backlog included.
export function questEstimate(p) {
  var total = 0, left = 0;
  counted().forEach(function (t) {
    if (t.isNext || t.questId !== p.id || !(t.est > 0)) return;
    total += t.est; if (t.status !== "Completed") left += t.est;
  });
  return { total: total, left: left };
}
export function chartStart() {
  var min = null;
  state.tasks.forEach(function (t) { if ((t.vault && t.vault.why !== "done") || t.block === 0 || isHiddenComplete(t)) return; var v = parseISO(pset(projKey(t)).start); if (min === null || v < min) min = v; });
  return min === null ? parseISO(state.start) : min;
}
// Days between points on the main burndown: daily or every few days when the
// whole schedule is short, weekly once it is long enough to fill the window.
export function checkpointStep() {
  var s = chartStart(), maxEnd = null;
  burnTasks().forEach(function (t) { var e = taskEnd(t); if (maxEnd === null || e > maxEnd) maxEnd = e; });
  if (maxEnd === null) return 7;
  var need = Math.max(1, Math.round((maxEnd - s) / DAY)) / (CHECKPOINTS - 1);
  return need <= 1 ? 1 : need <= 2 ? 2 : need <= 3 ? 3 : 7;
}
export function checkpoints() { var out = [], s = chartStart(), d = checkpointStep(); for (var i = 0; i < CHECKPOINTS; i++) out.push(addDays(s, d * i)); return out; }

/* burndown history -- { "<ISO day>": [tasks in scope, tasks still open] }.
   Written only when it differs from the prior record; a day with no record carries forward, not a gap. */
export function recordHist(hist, scope, left) {
  var key = iso(TODAY), prior = Object.keys(hist).filter(function (k) { return k < key; }).sort();
  var prev = prior.length ? hist[prior[prior.length - 1]] : null;
  if (prev && prev[0] === scope && prev[1] === left) delete hist[key]; else hist[key] = [scope, left];
  var all = Object.keys(hist).sort();
  if (all.length > 1000) all.slice(0, all.length - 1000).forEach(function (k) { delete hist[k]; });
}
// The record in force at the end of the given day, or null before the first one.
export function histAt(hist, ms) {
  var cut = iso(ms), best = null;
  Object.keys(hist).forEach(function (k) { if (k <= cut && (best === null || k > best)) best = k; });
  return best === null ? null : hist[best];
}
// Actual open tasks (and tasks in scope) at each point; the point covering today is live.
export function globalActual(cps) {
  var step = cps.length > 1 ? cps[1] - cps[0] : 7 * DAY, live = remainingUnits(), total = totalUnits(), actual = [], scope = [];
  cps.forEach(function (ms) {
    if (ms <= TODAY && TODAY < ms + step) { actual.push(live); scope.push(total); return; }
    if (ms > TODAY) { actual.push(null); scope.push(null); return; }
    var rec = histAt(state.hist, ms);
    actual.push(rec ? rec[1] : null); scope.push(rec ? rec[0] : null);
  });
  return { actual: actual, scope: scope };
}

/* task helpers */
export function counted() { return state.tasks.filter(function (t) { return !t.vault || t.vault.why === "done"; }); }
// The "chosen" quest is the first active one with no tasks yet. If two are
// both task-less, whichever was promoted first wins.
export function chosen() { var a = activeQuests(); for (var i = 0; i < a.length; i++) if (!counted().some(function (t) { return t.questId === a[i].id; })) return a[i]; return null; }
export function dispQuest(t) { if (t.isNext) { var c = chosen(); return c ? c.name : "Next quest"; } var p = findQuest(t.questId); return p ? p.name : ""; }
export function dispWhat(t) { if (t.isNext && chosen()) return "Chosen as the next quest. Add its first tasks with the + button."; return t.what; }
// The burndown counts tasks, one each.
function isOpen(t) { return t.status !== "Completed"; }
export function totalUnits() { return burnTasks().length; }
export function remainingUnits() { return burnTasks().filter(isOpen).length; }
export function planned(ms) { var d = 0; burnTasks().forEach(function (t) { if (taskEnd(t) <= ms) d++; }); return totalUnits() - d; }
export function sortTasks(list) {
  // Completed tasks sink to the bottom -- a finished task stays in this list
  // rather than archiving away, so it needs somewhere to settle.
  return list.map(function (t) { return { t: t, i: state.tasks.indexOf(t) }; }).sort(function (a, b) {
    var aDone = a.t.status === "Completed" ? 1 : 0, bDone = b.t.status === "Completed" ? 1 : 0;
    return aDone - bDone || (a.t.block || 99) - (b.t.block || 99) || a.i - b.i;
  }).map(function (x) { return x.t; });
}
export function ordered() { return sortTasks(live(state.tasks).filter(function (t) { return t.block > 0 && !isHiddenComplete(t); })); }
export function orderedAll() { return sortTasks(live(state.tasks)); }
export function backlogTasks() { return sortTasks(live(state.tasks).filter(function (t) { return t.block === 0 && !isHiddenComplete(t); })); }
export function burnTasks() { return counted().filter(function (t) { return t.block > 0 && !isHiddenComplete(t); }); }
// --- One quest's own burndown ---
// From counted(), not burnTasks() -- a Complete quest's own page keeps
// showing its burndown even while its tasks are hidden cross-quest.
export function questBurnTasks(p) { return counted().filter(function (t) { return t.block > 0 && t.questId === p.id; }); }
export function questTotalUnits(p) { return questBurnTasks(p).length; }
export function questRemainingUnits(p) { return questBurnTasks(p).filter(isOpen).length; }
// Points are daily for a short/near-term schedule, otherwise weekly Mondays
// stretched to include today if overrun. Returns null if nothing is scheduled.
export function questBurn(p) {
  var ts = questBurnTasks(p);
  if (!ts.length) return null;
  var total = ts.length, first = Infinity, last = -Infinity;
  ts.forEach(function (t) { first = Math.min(first, taskStart(t)); last = Math.max(last, taskEnd(t)); });
  var daily = (last - first) / DAY <= 21 && (TODAY - first) / DAY <= 45, base = daily ? TODAY : weekStart(TODAY), unit = daily ? 1 : 7;
  var startPt = daily ? first : weekStart(first), endPt = daily ? addDays(last, 1) : addDays(weekStart(last), 7);
  if (base > endPt) endPt = base;
  var count = Math.round((endPt - startPt) / (unit * DAY)), step = daily ? 1 : Math.max(1, Math.ceil(count / 52));
  var cps = [];
  for (var m = startPt; m < endPt; m = addDays(m, unit * step)) cps.push(m);
  cps.push(endPt);
  var planned = cps.map(function (ms) { var d = 0; ts.forEach(function (t) { if (taskEnd(t) <= ms) d++; }); return total - d; });
  var live = questRemainingUnits(p), actual = [], scope = [];
  cps.forEach(function (ms, i) {
    var next = i < cps.length - 1 ? cps[i + 1] : Infinity;
    if (ms <= base && base < next) { actual.push(live); scope.push(total); return; }
    if (ms > base) { actual.push(null); scope.push(null); return; }
    var rec = histAt(p.hist, ms);
    actual.push(rec ? rec[1] : null); scope.push(rec ? rec[0] : null);
  });
  return { cps: cps, planned: planned, actual: actual, scope: scope, total: total, tasks: ts, stepDays: unit * step };
}
export function orderedCounted() { return sortTasks(counted()); }
export function isLate(t) { return t.block > 0 && t.status !== "Completed" && taskEnd(t) < TODAY; }
export function lateTasks() { return ordered().filter(isLate); }
export function setStatus(t, v) { t.status = v; if (v === "Completed") t.steps.forEach(function (s) { s.done = true; }); }
export function syncFromSteps(t) {
  var n = t.steps.filter(function (s) { return s.done; }).length;
  if (t.steps.length && n === t.steps.length) t.status = "Completed";
  else if (n > 0 && t.status === "Not started") t.status = "In progress";
  else if (t.status === "Completed" && n < t.steps.length) t.status = "In progress";
}
export function nextTask() { var o = ordered(); for (var i = 0; i < o.length; i++) if (o[i].status !== "Completed") return o[i]; return null; }
export function isCore(v) { return CORE.some(function (c) { return c[0] === v; }); }
// "quest:" + id routes to a quest's own page -- id-based, not name-based, so
// renaming a quest never breaks its pin or an in-flight link to it.
export function validPage(key) {
  if (typeof key !== "string" || key.indexOf("quest:") !== 0) return false;
  return !!findQuest(key.slice(6));
}
export function pageTitle(key) {
  if (key === "search") return "Search";
  if (typeof key === "string" && key.indexOf("quest:") === 0) { var p = findQuest(key.slice(6)); return p ? p.name : ""; }
  for (var i = 0; i < CORE.length; i++) if (CORE[i][0] === key) return CORE[i][1];
  for (var j = 0; j < BOTTOM.length; j++) if (BOTTOM[j][0] === key) return BOTTOM[j][1];
  return "";
}
export function isPinned(key) { return state.pins.indexOf(key) >= 0; }
export function pinPage(key) { if (!isPinned(key)) state.pins.push(key); changed(); notify(pageTitle(key) + " pinned to the sidebar."); }
export function unpinPage(key) { state.pins = state.pins.filter(function (k) { return k !== key; }); changed(); notify(pageTitle(key) + " removed from the sidebar. It is still listed under Quests."); }
export function questMeta(p) {
  var ts = counted().filter(function (t) { return !t.isNext && t.questId === p.id; });
  var parts = [];
  if (ts.length) {
    var bk = ts.filter(function (t) { return t.block === 0; }).length;
    var dn = ts.filter(function (t) { return t.status === "Completed"; }).length;
    parts.push("Complete: " + dn + " of " + ts.length + (ts.length === 1 ? " task" : " tasks") + (bk ? " | Backlog: " + bk + " unscheduled " + (bk === 1 ? "task" : "tasks") : ""));
  } else if (p.status === "candidate") {
    parts.push("Candidate for the next slot.");
  }
  return parts.length ? parts.join(" ") : "No tasks yet";
}
export function findStep(id) {
  if (!id) return null;
  var ct = counted();
  for (var i = 0; i < ct.length; i++) { var t = ct[i]; for (var j = 0; j < t.steps.length; j++) if (t.steps[j].id === id) return { t: t, s: t.steps[j] }; }
  return null;
}
export function decisionFor(stepId) { var ds = live(state.decisions); for (var i = 0; i < ds.length; i++) if (ds[i].step === stepId) return ds[i]; return null; }
export function short(str, n) { return str.length > n ? str.slice(0, n - 1) + "…" : str; }
// Tasks flagged for a quest's own launch checklist -- renders as a section on
// that quest's own page (no separate global Launch page anymore).
export function launchItems(questId) {
  return orderedCounted().filter(function (t) { return t.questId === questId && t.launch; });
}
// A decision must link to a real step -- no "None" option. If questId is
// given, only that quest's steps are offered.
export function stepOptions(questId) {
  var o = [];
  orderedCounted().forEach(function (t) {
    if (questId && t.questId !== questId) return;
    t.steps.forEach(function (s) { o.push({ value: s.id, label: dispQuest(t) + ": " + short(s.text, 60) }); });
  });
  return o;
}
// One task's own steps, for the Quest -> Task -> Step cascade in decisionDialog().
export function stepOptionsForTask(taskId) {
  var t = findTask(taskId);
  if (!t) return [];
  return t.steps.map(function (s) { return { value: s.id, label: short(s.text, 60) }; });
}
export function taskOptions(questId) {
  var ts = orderedAll();
  if (questId) ts = ts.filter(function (t) { return t.questId === questId; });
  return ts.map(function (t) { return { value: t.id, label: dispQuest(t) + ": " + short(dispWhat(t), 60) }; });
}
export function findTask(id) { var a = live(state.tasks); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
export function findAnyTask(id) { for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i]; return null; }
