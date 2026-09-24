import { DAY, iso, parseISO, TODAY } from "./dates.js";
import { findAnyTask } from "./model.js";
import { notify } from "./dom.js";
import { recordCurrentWeek } from "./views.js";
import { renderAll } from "./app.js";

export var KEY2 = "sidequest-template-v1", UIKEY = "sidequest-template-ui";
export var STATUSES = ["Not started", "In progress", "Completed"];
export var CHECKPOINTS = 7;
export var APP_VERSION = "1.0.0";
export var APP_NAME = "Sidequest";

export function S(v, max) { return typeof v === "string" ? v.slice(0, max || 500) : ""; }
export function st(id, text, launch, done) { return { id: id, text: text, done: done === true, launch: launch === true }; }
export function task(id, block, projectId, what, done, steps, extra) {
  var t = { id: id, block: block, projectId: projectId, what: what, done: done, status: "Not started", notes: "", steps: steps || [], custom: false, isNext: false };
  if (extra) Object.keys(extra).forEach(function (k) { t[k] = extra[k]; });
  return t;
}
// A project's own lifecycle: "candidate" (competing for the next slot, not yet
// started) or "active" (chosen, has tasks). Promoted in place -- the same
// record and id carry through Candidate -> Active -> Archived, never a second
// record. See DESIGN.md's "making Project a first-class entity" section.
export function project(id, name, status, extra) {
  var p = { id: id, name: name, note: "", status: status, start: "", mult: 1, months: "", notes: "", arch: null };
  if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
  return p;
}
export function sampleData() {
  var n = new Date(), D = 86400000;
  var thisMon = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7));
  var m0 = thisMon - 14 * D;
  function day(k) { return new Date(m0 + k * D).toISOString().slice(0, 10); }
  var yest = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() - 1)).toISOString().slice(0, 10);
  var lastWeek = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() - 7)).toISOString().slice(0, 10);
  var projects = [
    project("pApp", "Sample App", "active", { notes: "A simple habit tracker. Keep the first version small and add features after the beta." }),
    project("pSite", "Sample Website", "active", { start: day(14), mult: 1 }),
    project("pGame", "Sample Game", "active", { start: day(21), mult: 2, months: 4 }),
    project("pExt", "Sample Browser Extension", "candidate", { note: "A small tool that could ship in a month" }),
    project("pCli", "Sample Command-Line Tool", "candidate", { note: "Would save time on your own projects" })
  ];
  var tasks = [
    task("a1", 1, "pApp", "Sketch the main screens", "Sketches for every screen", [st("a1a", "Sketch the home screen", false, true), st("a1b", "Sketch the sign-in screen", false, true), st("a1c", "Sketch the settings screen", false, true)], { status: "Completed", doneAt: lastWeek }),
    task("a2", 2, "pApp", "Build the sign-in flow", "People can sign up and log in", [st("a2a", "Build the sign-up form", false, true), st("a2b", "Connect to a login service"), st("a2c", "Handle wrong passwords")], { status: "Completed", doneAt: yest }),
    task("a3", 3, "pApp", "Build the home screen", "The list loads quickly and scrolls smoothly", [st("a3a", "Show the list of items", false, true), st("a3b", "Add pull to refresh"), st("a3c", "Handle an empty list")], { status: "In progress", notes: "Ask a friend to try this on an older phone before moving on." }),
    task("a4", 4, "pApp", "Run a beta with five friends", "Five people have tried it and sent notes", [st("a4a", "Pick five testers"), st("a4b", "Send the beta link", true), st("a4c", "Collect and sort the feedback")]),
    task("a5", 5, "pApp", "Submit to the app store", "The app is live", [st("a5z", "Choose the first app store", true, true), st("a5a", "Write the store description", true), st("a5b", "Prepare screenshots", true), st("a5c", "Submit for review", true)]),
    task("a6", 0, "pApp", "Add a dark mode", "Dark mode works on every screen", []),
    task("w1", 1, "pSite", "Write the page copy", "Every page has final text", [st("w1a", "Write the home page", false, true), st("w1b", "Write the about page"), st("w1c", "Write the contact page")], { status: "In progress" }),
    task("w2", 2, "pSite", "Build the layout", "Pages look right on a phone and a laptop", [st("w2a", "Build the header and footer"), st("w2b", "Make the layout work on phones"), st("w2c", "Compress the images")]),
    task("w3", 3, "pSite", "Launch the site", "The site is live and checked", [st("w3a", "Point the domain at the site", true), st("w3b", "Check every page on a phone", true), st("w3c", "Announce it", true)]),
    task("g1", 1, "pGame", "Prototype the core mechanic", "Someone can play for one minute", [st("g1a", "Make the player move"), st("g1b", "Add one obstacle"), st("g1c", "Add a win and a lose state")]),
    task("g2", 2, "pGame", "Make the first ten levels", "Ten playable levels"),
    task("g3", 3, "pGame", "Playtest and polish", "Three playtests done and the top problems fixed", [st("g3a", "Run three playtests"), st("g3b", "Fix the top five problems"), st("g3d", "Decide free or paid", true), st("g3c", "Record a trailer", true)]),
    task("g4", 0, "pGame", "Add a level editor", "Players can make their own levels"),
    task("n1", 6, null, "Choose one of the candidates and set the others aside", "One is chosen", [], { isNext: true })
  ];
  return {
    tasks: tasks,
    projects: projects,
    parked: [
      { id: "p1", text: "Try a new game engine", note: "Not competing for the next slot" },
      { id: "p2", text: "Write up lessons learned", note: "After the website launches" },
      { id: "p3", text: "Redesign the logo", note: "", arch: { at: yest, why: "removed" } }
    ],
    // Decisions attach through a required step link (Project -> Task -> Step ->
    // Decision) -- see DESIGN.md. d3 demonstrates an archived decision, which
    // predates the required-step rule and is kept archived rather than backfilled.
    decisions: [
      { id: "d1", q: "Which app store should you launch on first?", a: "Start with one store, then add the other.", step: "a5z" },
      { id: "d2", q: "Will the game be free, paid, or free with a paid upgrade?", a: "", step: "g3d" },
      { id: "d3", q: "Should the site use a page builder?", a: "No, plain pages are enough.", step: "w3a" }
    ],
    // Milestones now require a direct project link (no step/task chain to derive it from).
    milestones: [
      { id: "m1", text: "Sample App beta opens", date: day(21), projectId: "pApp" },
      { id: "m2", text: "Sample Game demo day", date: day(63), projectId: "pGame" }
    ],
    start: day(0)
  };
}
export function defaults() {
  var d = sampleData();
  return {
    v: 5, start: d.start, mult: 1, days: 7,
    tasks: d.tasks, actual: [34, 31, 25, null, null, null, null],
    decisions: d.decisions, projects: d.projects, parked: d.parked,
    milestones: d.milestones, lastSlip: null, pins: ["proj:pApp"],
    settings: { theme: "auto", dateFormat: "us", blockWord: "Sprint", hideWelcome: false }
  };
}

export function validArch(a) { return (a && typeof a === "object" && isISO(a.at) && (a.why === "done" || a.why === "removed")) ? { at: a.at, why: a.why } : null; }
export function isISO(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }
// A slip-snapshot's per-project start/mult pairs (used by slipDialog's undo).
// Content-validated the same way a real project's own start/mult are.
function cleanProjectSnap(o) {
  var out = {};
  if (o && typeof o === "object" && !Array.isArray(o)) Object.keys(o).slice(0, 200).forEach(function (k) {
    var v = o[k]; if (!v || typeof v !== "object") return;
    var e = {}; if (isISO(v.start)) e.start = v.start; if (typeof v.mult === "number" && v.mult >= 0.25 && v.mult <= 5) e.mult = v.mult;
    if (e.start || e.mult) out[S(k, 40)] = e;
  });
  return out;
}
export function normalize(s) {
  var d = defaults();
  if (!s || typeof s !== "object") return d;
  if (isISO(s.start)) d.start = s.start;
  if (typeof s.mult === "number" && s.mult >= 0.25 && s.mult <= 5) d.mult = s.mult;
  if (typeof s.days === "number" && s.days >= 1 && s.days <= 30) d.days = Math.round(s.days);
  if (Array.isArray(s.projects)) {
    d.projects = s.projects.filter(function (x) { return x && typeof x.id === "string"; }).map(function (x) {
      return {
        id: S(x.id, 40), name: S(x.name, 120), note: S(x.note, 300),
        status: (x.status === "active" || x.status === "candidate") ? x.status : "candidate",
        start: isISO(x.start) ? x.start : "", mult: (typeof x.mult === "number" && x.mult >= 0.25 && x.mult <= 5) ? x.mult : 1,
        months: (typeof x.months === "number" && x.months >= 1 && x.months <= 36) ? Math.round(x.months) : "",
        notes: S(x.notes, 5000), arch: validArch(x.arch)
      };
    });
  }
  var projectIds = {}; d.projects.forEach(function (p) { projectIds[p.id] = true; });
  if (Array.isArray(s.tasks)) {
    var ts = [];
    s.tasks.forEach(function (t) {
      if (!t || typeof t !== "object" || typeof t.id !== "string") return;
      // A task's projectId must match a real project, or (for the "Next
      // project" placeholder only) be null/absent. An orphaned projectId --
      // pointing at nothing -- drops the task rather than silently keeping it
      // unreachable; there is no real saved data yet for this to affect (see
      // DESIGN.md's migration decision), so this is a clean-shape guarantee,
      // not a data-loss risk being accepted.
      var pid = (typeof t.projectId === "string" && projectIds[t.projectId]) ? t.projectId : null;
      if (!pid && !t.isNext) return;
      var steps = [];
      if (Array.isArray(t.steps)) t.steps.forEach(function (x) {
        if (x && typeof x.id === "string") steps.push({ id: S(x.id, 40), text: S(x.text, 300), done: x.done === true, launch: x.launch === true });
      });
      var b = typeof t.block === "number" ? Math.round(t.block) : 1;
      ts.push({
        id: S(t.id, 40), block: Math.min(12, Math.max(0, b)), projectId: pid, what: S(t.what, 400), done: S(t.done, 200),
        status: STATUSES.indexOf(t.status) >= 0 ? t.status : "Not started", notes: S(t.notes, 5000), steps: steps,
        custom: t.custom === true, isNext: t.isNext === true,
        arch: validArch(t.arch), doneAt: isISO(t.doneAt) ? t.doneAt : ""
      });
    });
    d.tasks = ts;
  }
  if (Array.isArray(s.actual) && s.actual.length === CHECKPOINTS) {
    d.actual = s.actual.map(function (v) { return (typeof v === "number" && v >= 0 && v <= 1000) ? v : null; });
  }
  // A step id belonging to any live (non-archived) task, across every project --
  // used below to require a decision's step link points at something real.
  var liveStepIds = {};
  d.tasks.forEach(function (t) { if (!t.arch) t.steps.forEach(function (x) { liveStepIds[x.id] = true; }); });
  // Decisions require a real step link (Project -> Task -> Step -> Decision) --
  // a decision with no step, or one pointing at a step that doesn't exist, is
  // dropped rather than kept in a state the UI can't render meaningfully.
  // Decisions no longer archive independently (confirmed 2026-09-24 -- only
  // Projects/Ideas do), so there's no "archived, exempt from this rule" case
  // anymore: every decision must resolve to a real, live step.
  if (Array.isArray(s.decisions)) {
    d.decisions = s.decisions.filter(function (x) {
      return x && typeof x.id === "string" && typeof x.step === "string" && liveStepIds[x.step];
    }).map(function (x) { return { id: S(x.id, 40), q: S(x.q, 300), a: S(x.a, 1000), step: S(x.step, 40) }; });
  }
  if (Array.isArray(s.parked)) d.parked = s.parked.filter(function (x) { return x && typeof x.id === "string"; }).map(function (x) { return { id: S(x.id, 40), text: S(x.text, 200), note: S(x.note, 300), arch: validArch(x.arch) }; });
  // Milestones require a direct project link (no task/step chain to derive it
  // from) -- one pointing at a project that no longer exists is dropped.
  if (Array.isArray(s.milestones)) {
    d.milestones = s.milestones.filter(function (x) {
      return x && typeof x.id === "string" && isISO(x.date) && typeof x.projectId === "string" && projectIds[x.projectId];
    }).map(function (x) { return { id: S(x.id, 40), text: S(x.text, 200), date: x.date, projectId: x.projectId }; });
  }
  if (s.settings && typeof s.settings === "object") {
    if (["auto", "light", "dark"].indexOf(s.settings.theme) >= 0) d.settings.theme = s.settings.theme;
    if (["us", "intl", "mdy", "dmy", "iso"].indexOf(s.settings.dateFormat) >= 0) d.settings.dateFormat = s.settings.dateFormat;
    if (["Block", "Sprint", "Iteration", "Phase", "Week"].indexOf(s.settings.blockWord) >= 0) d.settings.blockWord = s.settings.blockWord;
    if (typeof s.settings.hideWelcome === "boolean") d.settings.hideWelcome = s.settings.hideWelcome;
  }
  if (Array.isArray(s.pins)) d.pins = s.pins.filter(function (k) { return typeof k === "string" && k.length < 130; }).slice(0, 30);
  if (s.lastSlip && s.lastSlip.snap && isISO(s.lastSlip.snap.start)) d.lastSlip = { days: Math.round(+s.lastSlip.days) || 0, snap: { start: s.lastSlip.snap.start, projects: cleanProjectSnap(s.lastSlip.snap.projects) } };
  return d;
}
// Storage adapter: localStorage (web app) is synchronous and always available;
// Claude's db capability (artifact version) is asynchronous and may resolve
// null (not served as a published artifact, not granted, or failed to load --
// indistinguishable by design, per the db capability contract). Rather than
// make every one of the ~150 call sites across app/*.js that read `state.x`
// synchronously deal with that, the whole app keeps reading `state` as a
// plain, already-populated object -- this adapter is the only place that
// knows storage might be async, at the load/save boundary alone. See
// DESIGN.md's "Solved" subsection under "Claude Artifact parity version" for
// the full reasoning.
//
// db, once resolved, stays a live reference for the rest of the page's life
// (per the capability contract: "Awaiting use('db') again is free (memoized)").
// null means either "this isn't a published artifact with db granted" (the
// normal web-app case) or "db failed to load" -- both fall back to
// localStorage identically, since a page that can't reach the network
// shouldn't lose the ability to save at all.
var dbPromise = null;
function getDb() {
  if (dbPromise) return dbPromise;
  dbPromise = (typeof window !== "undefined" && window.claude && typeof window.claude.use === "function")
    ? window.claude.use("db").catch(function () { return null; })
    : Promise.resolve(null);
  return dbPromise;
}

// One write in flight at a time per the db capability's own contract ("ONE
// WRITE AT A TIME per document... await each set/update before the next").
// A rapid burst of saves (e.g. several quick edits) coalesces into: whichever
// write is already running finishes, then exactly one more write carrying
// the LATEST state runs after it -- never a growing backlog of queued writes,
// and never two writes racing on the same document.
var dbWriteInFlight = null, dbWritePending = false;
function dbSave(rawState) {
  if (dbWriteInFlight) { dbWritePending = true; return; }
  getDb().then(function (db) {
    if (!db) return; // no db in this view: localStorage (below) is already the real save
    dbWriteInFlight = db.doc("state/main").set({ json: JSON.stringify(rawState) })
      .catch(function () { /* transient store error: localStorage already has this save; next change retries */ })
      .then(function () {
        dbWriteInFlight = null;
        if (dbWritePending) { dbWritePending = false; dbSave(state); }
      });
  });
}

export function load() {
  try {
    var raw = window.localStorage.getItem(KEY2);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* storage unavailable or unreadable: use defaults */ }
  return defaults();
}
export var state = load();
export function setState(newState) { state = newState; }
export function save() {
  try { window.localStorage.setItem(KEY2, JSON.stringify(state)); } catch (e) { /* ignore */ }
  dbSave(state);
}

// Runs once at boot (called from app.js's deferred boot sequence, after the
// page has already rendered from load()'s synchronous localStorage/defaults
// result -- never blocks the initial paint on this). If db is available and
// holds real saved data, swap it in and ask the caller to re-render. Resolves
// to true if state was swapped (caller should re-render), false otherwise.
export function loadFromDbIfAvailable() {
  return getDb().then(function (db) {
    if (!db) return false;
    return db.doc("state/main").get().then(function (snap) {
      if (!snap.exists) return false;
      var data = snap.data();
      if (!data || typeof data.json !== "string") return false;
      var parsed;
      try { parsed = JSON.parse(data.json); } catch (e) { return false; }
      state = normalize(parsed);
      return true;
    }).catch(function () { return false; });
  });
}

export var ui = { view: "today", sel: null, detail: false, query: "", prev: "today", searchArchive: true };
/* The app always opens on Today, on every device. */
export function saveUI() { /* nothing to save */ }

// Stamps a task's completion date the moment its status becomes Done, and
// clears it if the task is reopened. Only Projects and Ideas independently
// archive now (confirmed 2026-09-24) -- a completed task just stays visible,
// marked Done, inside its live Project; this function no longer moves
// anything to the Archive itself.
export function autoArchive() {
  state.tasks.forEach(function (t) {
    if (t.status !== "Completed") { t.doneAt = ""; return; }
    if (!t.doneAt) t.doneAt = iso(TODAY);
  });
}
export function changed() {
  autoArchive(); recordCurrentWeek(); save(); renderAll();
}

