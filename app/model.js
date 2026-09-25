import { state, changed, CHECKPOINTS } from "./state.js";
import { notify } from "./dom.js";
import { addDays, parseISO, TODAY } from "./dates.js";

export var CORE = [["today", "Today"], ["projects", "Projects"], ["schedule", "Tasks"], ["timeline", "Timeline"]];
export var BOTTOM = [["parking", "Parking lot"], ["archive", "Archive"], ["help", "Help"], ["settings", "Settings"]];
export var WORDS = { Block: ["block", "blocks"], Sprint: ["sprint", "sprints"], Iteration: ["iteration", "iterations"], Phase: ["phase", "phases"], Week: ["week", "weeks"] };
export function wd() { return state.settings.blockWord in WORDS ? state.settings.blockWord : "Block"; }
export function wl() { return WORDS[wd()][0]; }
export function wpC() { var w = WORDS[wd()][1]; return w.charAt(0).toUpperCase() + w.slice(1); }
/* project helpers -- Project is the top-tier entity every task/decision/
   milestone attaches to by id (see DESIGN.md, "making Project a first-class
   entity"). A project is promoted in place from candidate to active -- one id
   for its whole life -- so "the active project named X" and "the candidate
   named X" are never two different records. */
export function live(a) { return a.filter(function (x) { return !x.arch; }); }
export function liveProjects() { return live(state.projects); }
export function activeProjects() { return liveProjects().filter(function (p) { return p.status === "active"; }); }
export function candidateProjects() { return liveProjects().filter(function (p) { return p.status === "candidate"; }); }
export function completeProjects() { return liveProjects().filter(function (p) { return p.status === "complete"; }); }
// Searches every project, archived or not -- an archived project's own page
// must stay reachable (read-only) until restored (see DESIGN.md's "New idea
// raised 2026-09-24"). Safe to widen past liveProjects() here because every
// caller either wants an archived match now, or already filters to live
// projects a level up (liveProjects()/activeProjects()/candidateProjects()/
// completeProjects()/chosen() all call live() first, so this never leaks an
// archived project into one of those lists).
export function findProject(id) { for (var i = 0; i < state.projects.length; i++) if (state.projects[i].id === id) return state.projects[i]; return null; }
export function findAnyProject(id) { return findProject(id); }
// True only when the project has at least one counted task and every one of
// them is Completed -- the empty-task-set case must never read as "done"
// (confirmed 2026-09-24).
export function projectTasksAllDone(p) {
  var ts = counted().filter(function (t) { return !t.isNext && t.projectId === p.id; });
  return ts.length > 0 && ts.every(function (t) { return t.status === "Completed"; });
}
// Direct links only, one hop -- a linked project may itself have further
// links, but this never walks past the first one (see DESIGN.md: this is
// what makes an arbitrary-depth/cyclic link graph safe to render).
export function linkedProjects(p) { return (p.linkedProjectIds || []).map(findProject).filter(Boolean); }
// A link is bidirectional -- one fact shared by both records, so linking
// writes the id to both sides' arrays, and unlinking removes it from both.
export function linkProjects(aId, bId) {
  var a = findAnyProject(aId), b = findAnyProject(bId);
  if (!a || !b || a === b) return;
  if (a.linkedProjectIds.indexOf(bId) < 0) a.linkedProjectIds.push(bId);
  if (b.linkedProjectIds.indexOf(aId) < 0) b.linkedProjectIds.push(aId);
}
export function unlinkProjects(aId, bId) {
  var a = findAnyProject(aId), b = findAnyProject(bId);
  if (a) a.linkedProjectIds = a.linkedProjectIds.filter(function (id) { return id !== bId; });
  if (b) b.linkedProjectIds = b.linkedProjectIds.filter(function (id) { return id !== aId; });
}
export function pset(projectId) { var p = findProject(projectId); return { start: (p && p.start) || state.start, mult: (p && p.mult) || state.mult }; }
export function offsetFor(projectId, n) { return Math.floor(n * state.days * pset(projectId).mult + 1e-9); }
export function blockStartFor(projectId, b) { return addDays(parseISO(pset(projectId).start), offsetFor(projectId, b - 1)); }
export function blockEndFor(projectId, b) { return addDays(parseISO(pset(projectId).start), offsetFor(projectId, b) - 1); }
export function projKey(t) { return t.isNext ? null : t.projectId; }
export function taskStart(t) { return blockStartFor(projKey(t), t.block); }
export function taskEnd(t) { return blockEndFor(projKey(t), t.block); }
export function chartStart() {
  var min = null;
  state.tasks.forEach(function (t) { if ((t.arch && t.arch.why !== "done") || t.block === 0) return; var v = parseISO(pset(projKey(t)).start); if (min === null || v < min) min = v; });
  return min === null ? parseISO(state.start) : min;
}
export function checkpoints() { var out = [], s = chartStart(); for (var i = 0; i < CHECKPOINTS; i++) out.push(addDays(s, 7 * i)); return out; }

/* task helpers */
export function counted() { return state.tasks.filter(function (t) { return !t.arch || t.arch.why === "done"; }); }
// "Chosen as the next project" placeholder: the first active project with no
// tasks yet -- there is no separate "next" pointer anymore (a project's own
// status IS the chosen signal, set the moment it's promoted from candidate).
// "Chosen as the next project" placeholder resolves to the first active
// project (in state.projects array order, i.e. promotion order) that has no
// tasks yet. This replaces the old explicit state.next pointer: choosing a
// candidate now directly promotes it to "active" in place (see
// promoteToActive() below), so a task-less active project IS the one just
// chosen -- there's no longer a separate "chosen but not yet promoted" state
// to track with its own pointer. Known simplification: if two active
// projects were both promoted and neither has a task yet, this returns the
// earlier one by array order, not necessarily the most recently promoted --
// an acceptable edge case, not a design goal.
export function chosen() { var a = activeProjects(); for (var i = 0; i < a.length; i++) if (!counted().some(function (t) { return t.projectId === a[i].id; })) return a[i]; return null; }
export function dispProject(t) { if (t.isNext) { var c = chosen(); return c ? c.name : "Next project"; } var p = findProject(t.projectId); return p ? p.name : ""; }
export function dispWhat(t) { if (t.isNext && chosen()) return "Chosen as the next project. Add its first tasks with the + button."; return t.what; }
export function weight(t) { return Math.max(1, t.steps.length); }
export function doneUnits(t) { return t.status === "Completed" ? weight(t) : t.steps.filter(function (s) { return s.done; }).length; }
export function totalUnits() { return burnTasks().reduce(function (a, t) { return a + weight(t); }, 0); }
export function remainingUnits() { return burnTasks().reduce(function (a, t) { return a + weight(t) - doneUnits(t); }, 0); }
export function planned(ms) { var d = 0; burnTasks().forEach(function (t) { if (taskEnd(t) <= ms) d += weight(t); }); return totalUnits() - d; }
export function sortTasks(list) {
  // Completed tasks sink to the bottom (confirmed 2026-09-24, since a task no
  // longer archives away once done -- it stays visible in this same list
  // permanently), ahead of the existing block/insertion-order sort.
  return list.map(function (t) { return { t: t, i: state.tasks.indexOf(t) }; }).sort(function (a, b) {
    var aDone = a.t.status === "Completed" ? 1 : 0, bDone = b.t.status === "Completed" ? 1 : 0;
    return aDone - bDone || (a.t.block || 99) - (b.t.block || 99) || a.i - b.i;
  }).map(function (x) { return x.t; });
}
export function ordered() { return sortTasks(live(state.tasks).filter(function (t) { return t.block > 0; })); }
export function orderedAll() { return sortTasks(live(state.tasks)); }
export function backlogTasks() { return sortTasks(live(state.tasks).filter(function (t) { return t.block === 0; })); }
export function burnTasks() { return counted().filter(function (t) { return t.block > 0; }); }
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
// "proj:" + id routes to a project's own page -- id-based, not name-based, so
// renaming a project never breaks its pin or an in-flight link to it. No
// separate standalone Launch page exists anymore (see DESIGN.md: only Projects
// are pinnable, launch-critical items render as a section on a project's own page).
export function validPage(key) { return typeof key === "string" && key.indexOf("proj:") === 0 && !!findProject(key.slice(5)); }
export function pageTitle(key) {
  if (key === "search") return "Search";
  if (typeof key === "string" && key.indexOf("proj:") === 0) { var p = findProject(key.slice(5)); return p ? p.name : ""; }
  for (var i = 0; i < CORE.length; i++) if (CORE[i][0] === key) return CORE[i][1];
  for (var j = 0; j < BOTTOM.length; j++) if (BOTTOM[j][0] === key) return BOTTOM[j][1];
  return "";
}
export function isPinned(key) { return state.pins.indexOf(key) >= 0; }
export function pinPage(key) { if (!isPinned(key)) state.pins.push(key); changed(); notify(pageTitle(key) + " pinned to the sidebar."); }
export function unpinPage(key) { state.pins = state.pins.filter(function (k) { return k !== key; }); changed(); notify(pageTitle(key) + " removed from the sidebar. It is still listed under Projects."); }
export function projectMeta(p) {
  var ts = counted().filter(function (t) { return !t.isNext && t.projectId === p.id; });
  var parts = [];
  if (ts.length) {
    var tot = 0, dn = 0, bk = ts.filter(function (t) { return t.block === 0; }).length; ts.forEach(function (t) { tot += weight(t); dn += doneUnits(t); });
    parts.push(ts.length + (ts.length === 1 ? " task" : " tasks") + (bk ? " (" + bk + " in the Backlog)" : "") + ". " + dn + " of " + tot + " items done.");
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
// Launch-critical steps, scoped to one project -- renders as a section on
// that project's own page (no separate global Launch page anymore).
export function launchItems(projectId) {
  var out = [];
  orderedCounted().forEach(function (t) { if (t.projectId !== projectId) return; t.steps.forEach(function (s) { if (s.launch) out.push({ t: t, s: s }); }); });
  return out;
}
// A decision must link to a real step (Project -> Task -> Step -> Decision,
// see DESIGN.md) -- no "None" option, since an unlinked decision can no
// longer be created. If projectId is given, only that project's steps are offered.
export function stepOptions(projectId) {
  var o = [];
  orderedCounted().forEach(function (t) {
    if (projectId && t.projectId !== projectId) return;
    t.steps.forEach(function (s) { o.push({ value: s.id, label: dispProject(t) + ": " + short(s.text, 60) }); });
  });
  return o;
}
export function taskOptions(projectId) {
  var ts = orderedAll();
  if (projectId) ts = ts.filter(function (t) { return t.projectId === projectId; });
  return ts.map(function (t) { return { value: t.id, label: dispProject(t) + ": " + short(dispWhat(t), 60) }; });
}
export function findTask(id) { var a = live(state.tasks); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
export function findAnyTask(id) { for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i]; return null; }
