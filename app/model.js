import { state, changed, CHECKPOINTS } from "./state.js";
import { notify } from "./dom.js";
import { addDays, parseISO, TODAY } from "./dates.js";

export var CORE = [["today", "Today"], ["projects", "Projects"], ["schedule", "Tasks"], ["timeline", "Timeline"]];
export var BOTTOM = [["parking", "Parking lot"], ["archive", "Archive"], ["help", "Help"], ["settings", "Settings"]];
export var WORDS = { Block: ["block", "blocks"], Sprint: ["sprint", "sprints"], Iteration: ["iteration", "iterations"], Phase: ["phase", "phases"], Week: ["week", "weeks"] };
export function wd() { return state.settings.blockWord in WORDS ? state.settings.blockWord : "Block"; }
export function wl() { return WORDS[wd()][0]; }
export function wpC() { var w = WORDS[wd()][1]; return w.charAt(0).toUpperCase() + w.slice(1); }
export function pset(name) { var o = (name && state.pset[name]) || {}; return { start: o.start || state.start, mult: o.mult || state.mult }; }
export function offsetFor(name, n) { return Math.floor(n * state.days * pset(name).mult + 1e-9); }
export function blockStartFor(name, b) { return addDays(parseISO(pset(name).start), offsetFor(name, b - 1)); }
export function blockEndFor(name, b) { return addDays(parseISO(pset(name).start), offsetFor(name, b) - 1); }
export function projKey(t) { return t.isNext ? "" : t.project; }
export function taskStart(t) { return blockStartFor(projKey(t), t.block); }
export function taskEnd(t) { return blockEndFor(projKey(t), t.block); }
export function chartStart() {
  var min = null;
  state.tasks.forEach(function (t) { if ((t.arch && t.arch.why !== "done") || t.block === 0) return; var v = parseISO(pset(projKey(t)).start); if (min === null || v < min) min = v; });
  return min === null ? parseISO(state.start) : min;
}
export function checkpoints() { var out = [], s = chartStart(); for (var i = 0; i < CHECKPOINTS; i++) out.push(addDays(s, 7 * i)); return out; }

/* task helpers */
export function live(a) { return a.filter(function (x) { return !x.arch; }); }
export function counted() { return state.tasks.filter(function (t) { return !t.arch || t.arch.why === "done"; }); }
export function liveCands() { return live(state.candidates); }
export function chosen() { var c = liveCands(); for (var i = 0; i < c.length; i++) if (c[i].id === state.next) return c[i]; return null; }
export function dispProject(t) { if (t.isNext) { var c = chosen(); return c ? c.name : "Next project"; } return t.project; }
export function dispWhat(t) { if (t.isNext && chosen()) return "Chosen as the next project. Add its first tasks with the + button."; return t.what; }
export function weight(t) { return Math.max(1, t.steps.length); }
export function doneUnits(t) { return t.status === "Done" ? weight(t) : t.steps.filter(function (s) { return s.done; }).length; }
export function totalUnits() { return burnTasks().reduce(function (a, t) { return a + weight(t); }, 0); }
export function remainingUnits() { return burnTasks().reduce(function (a, t) { return a + weight(t) - doneUnits(t); }, 0); }
export function planned(ms) { var d = 0; burnTasks().forEach(function (t) { if (taskEnd(t) <= ms) d += weight(t); }); return totalUnits() - d; }
export function sortTasks(list) {
  return list.map(function (t) { return { t: t, i: state.tasks.indexOf(t) }; }).sort(function (a, b) { return (a.t.block || 99) - (b.t.block || 99) || a.i - b.i; }).map(function (x) { return x.t; });
}
export function ordered() { return sortTasks(live(state.tasks).filter(function (t) { return t.block > 0; })); }
export function orderedAll() { return sortTasks(live(state.tasks)); }
export function backlogTasks() { return sortTasks(live(state.tasks).filter(function (t) { return t.block === 0; })); }
export function burnTasks() { return counted().filter(function (t) { return t.block > 0; }); }
export function orderedCounted() { return sortTasks(counted()); }
export function isLate(t) { return t.block > 0 && t.status !== "Done" && taskEnd(t) < TODAY; }
export function lateTasks() { return ordered().filter(isLate); }
export function setStatus(t, v) { t.status = v; if (v === "Done") t.steps.forEach(function (s) { s.done = true; }); }
export function syncFromSteps(t) {
  var n = t.steps.filter(function (s) { return s.done; }).length;
  if (t.steps.length && n === t.steps.length) t.status = "Done";
  else if (n > 0 && t.status === "Not started") t.status = "In progress";
  else if (t.status === "Done" && n < t.steps.length) t.status = "In progress";
}
export function nextTask() { var o = ordered(); for (var i = 0; i < o.length; i++) if (o[i].status !== "Done") return o[i]; return null; }
export function projectNames() {
  var names = [], seen = {};
  function add(n) { if (n && n !== "Next project" && !seen[n]) { seen[n] = 1; names.push(n); } }
  orderedCounted().forEach(function (t) { if (!t.isNext) add(t.project); });
  liveCands().forEach(function (c) { add(c.name); });
  return names;
}
export function isCore(v) { return CORE.some(function (c) { return c[0] === v; }); }
export function validPage(key) { return key === "kofi" || (typeof key === "string" && key.indexOf("proj:") === 0 && projectNames().indexOf(key.slice(5)) >= 0); }
export function pageTitle(key) {
  if (key === "kofi") return "Launch";
  if (key === "search") return "Search";
  if (typeof key === "string" && key.indexOf("proj:") === 0) return key.slice(5);
  for (var i = 0; i < CORE.length; i++) if (CORE[i][0] === key) return CORE[i][1];
  for (var j = 0; j < BOTTOM.length; j++) if (BOTTOM[j][0] === key) return BOTTOM[j][1];
  return "";
}
export function isPinned(key) { return state.pins.indexOf(key) >= 0; }
export function pinPage(key) { if (!isPinned(key)) state.pins.push(key); changed(); notify(pageTitle(key) + " pinned to the sidebar."); }
export function unpinPage(key) { state.pins = state.pins.filter(function (k) { return k !== key; }); changed(); notify(pageTitle(key) + " removed from the sidebar. It is still listed under Projects."); }
export function projectMeta(name) {
  var ts = counted().filter(function (t) { return !t.isNext && t.project === name; });
  var cand = liveCands().filter(function (c) { return c.name === name; })[0];
  var parts = [];
  if (ts.length) {
    var tot = 0, dn = 0, bk = ts.filter(function (t) { return t.block === 0; }).length; ts.forEach(function (t) { tot += weight(t); dn += doneUnits(t); });
    parts.push(ts.length + (ts.length === 1 ? " task" : " tasks") + (bk ? " (" + bk + " in the Backlog)" : "") + ". " + dn + " of " + tot + " items done.");
  }
  if (cand) parts.push(state.next === cand.id ? "Chosen as the next project." : "Candidate for the next slot.");
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
export function kofiItems() { var out = []; orderedCounted().forEach(function (t) { t.steps.forEach(function (s) { if (s.kofi) out.push({ t: t, s: s }); }); }); return out; }
export function stepOptions() {
  var o = [{ value: "", label: "None" }];
  orderedCounted().forEach(function (t) { t.steps.forEach(function (s) { o.push({ value: s.id, label: dispProject(t) + ": " + short(s.text, 60) }); }); });
  return o;
}
export function taskOptions(projectFilter) {
  var ts = orderedAll();
  if (projectFilter) ts = ts.filter(function (t) { return dispProject(t) === projectFilter; });
  return ts.map(function (t) { return { value: t.id, label: dispProject(t) + ": " + short(dispWhat(t), 60) }; });
}
export function findTask(id) { var a = live(state.tasks); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
export function findAnyTask(id) { for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i]; return null; }
