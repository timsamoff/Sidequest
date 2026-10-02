import { DAY, iso, parseISO, TODAY } from "./dates.js";
import { findAnyTask, syncTaskBlocks } from "./model.js";
import { notify } from "./dom.js";
import { recordHistory, recordProjectHistory, sweepProjectCompletion } from "./views.js";
import { renderAll } from "./app.js";

export var KEY2 = "sidequest-template-v1", UIKEY = "sidequest-template-ui";
export var STATUSES = ["Not started", "In progress", "Completed"];
export var CHECKPOINTS = 7;
export var APP_VERSION = "1.0.0";
export var APP_NAME = "Sidequest";

export function S(v, max) { return typeof v === "string" ? v.slice(0, max || 500) : ""; }
export function st(id, text, launch, done) { return { id: id, text: text, done: done === true, launch: launch === true }; }
export function task(id, block, projectId, what, done, steps, extra) {
  var t = { id: id, block: block, projectId: projectId, what: what, done: done, status: "Not started", notes: "", steps: steps || [], custom: false, isNext: false, start: "", due: "", est: 0, added: "" };
  if (extra) Object.keys(extra).forEach(function (k) { t[k] = extra[k]; });
  return t;
}
// A project's own lifecycle: "candidate" (competing for the next slot, not yet
// started) or "active" (chosen, has tasks). Promoted in place -- the same
// record and id carry through candidate -> active -> archived, never a second
// record.
export function project(id, name, status, extra) {
  var p = { id: id, name: name, status: status, start: "", days: 7, due: "", notes: "", arch: null, linkedProjectIds: [], launchCritical: false, hist: {}, lastSlip: null };
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
  // Burndown history entries are [tasks in scope, tasks still open], keyed by the
  // day recorded. Sample App started two Mondays ago with four scheduled tasks and gained a fifth; its
  // second one is running late, so the burndown sits above the plan.
  var appHistory = {}; appHistory[day(0)] = [4, 4]; appHistory[day(5)] = [4, 3]; appHistory[day(9)] = [5, 4];
  // Sample Finished Project runs a little late, then ahead, then lands on time,
  // so its full-project Burndown crosses the planned line instead of tracking it.
  var doneHistory = {}; doneHistory[day(-28)] = [4, 4]; doneHistory[day(-20)] = [4, 3]; doneHistory[day(-15)] = [4, 2]; doneHistory[day(-12)] = [4, 1]; doneHistory[day(-1)] = [4, 0];
  // The main burndown counts every scheduled task that isn't hidden with a Complete project;
  // a twelfth task was added on day 9, so its line steps up once.
  var allHistory = {}; allHistory[day(0)] = [11, 11]; allHistory[day(5)] = [11, 10]; allHistory[day(9)] = [12, 11];
  var projects = [
    // pApp <-> pSite demonstrates a bidirectional project link.
    project("pApp", "Sample App", "active", { hist: appHistory, notes: "A simple habit tracker. Keep the first version small and add features after the beta.", linkedProjectIds: ["pSite"] }),
    // launchCritical: the app's launch checklist shows the site's own status.
    project("pSite", "Sample Website", "active", { start: day(14), linkedProjectIds: ["pApp"], launchCritical: true }),
    project("pGame", "Sample Game", "active", { start: day(21), days: 14, due: day(21 + 122) }),
    project("pExt", "Sample Browser Extension", "candidate", { notes: "A small tool that could ship in a month" }),
    project("pCli", "Sample Command-Line Tool", "candidate", { notes: "Would save time on your own projects" }),
    // Demonstrates a Complete project: drops out of In progress but still
    // shows in the plain Projects list with its Complete badge.
    project("pDone", "Sample Finished Project", "complete", { start: day(-28), notes: "Shipped and wrapped up.", hist: doneHistory }),
    // Demonstrates a promoted-but-task-less Active project: since In progress
    // is built entirely from tasks, this one never appears there and lands in
    // the plain Projects list under Pending instead -- no start date needed.
    project("pNext", "Sample Next Project", "active", { notes: "Chosen, but nothing scheduled yet." })
  ];
  var tasks = [
    task("a1", 1, "pApp", "Sketch the main screens", "Sketches for every screen", [st("a1a", "Sketch the home screen", false, true), st("a1b", "Sketch the sign-in screen", false, true), st("a1c", "Sketch the settings screen", false, true)], { status: "Completed", doneAt: lastWeek }),
    task("a2", 2, "pApp", "Build the sign-in flow", "People can sign up and log in", [st("a2a", "Build the sign-up form", false, true), st("a2b", "Connect to a login service"), st("a2c", "Handle wrong passwords")], { status: "In progress" }),
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
    task("n1", 6, null, "Choose one of the candidates and set the others aside", "One is chosen", [], { isNext: true }),
    // pDone's own tasks, all finished -- a Complete project keeps its task
    // history rather than clearing it out. Four weekly tasks at weight 2 each
    // give an even planned line, which doneHistory above then zig-zags around.
    task("d1", 1, "pDone", "Design the feature", "The design is agreed", [st("d1a", "Sketch the approach", false, true), st("d1b", "Get sign-off", false, true)], { status: "Completed", doneAt: day(-22) }),
    task("d2", 2, "pDone", "Build the core feature", "It works end to end", [st("d2a", "Build the happy path", false, true), st("d2b", "Handle errors", false, true)], { status: "Completed", doneAt: day(-15) }),
    task("d3", 3, "pDone", "Test it", "The top bugs are fixed", [st("d3a", "Run through every screen", false, true), st("d3b", "Fix what's broken", false, true)], { status: "Completed", doneAt: day(-8) }),
    task("d4", 4, "pDone", "Ship it", "It's live", [st("d4a", "Write the release notes", false, true), st("d4b", "Announce it", false, true)], { status: "Completed", doneAt: day(-1) })
  ];
  var EST = { a1: 3, a2: 6, a3: 8, a4: 4, a5: 5, a6: 4, w1: 3, w2: 10, w3: 2, g1: 12, g2: 20, g3: 8, g4: 16, d1: 6, d2: 12, d3: 8, d4: 3 };
  tasks.forEach(function (t) { if (EST[t.id]) t.est = EST[t.id]; });
  // When the finished tasks were completed (Sample Finished Project's are a bit late, early, then on time).
  var DONE = { a1: day(5), d1: day(-20), d2: day(-15), d3: day(-12), d4: day(-1) };
  tasks.forEach(function (t) { if (DONE[t.id]) t.doneAt = DONE[t.id]; });
  // Shorter than its two-week block: starts two days in, due a week later.
  tasks.forEach(function (t) { if (t.id === "g1") { t.start = day(23); t.due = day(30); } });
  // Sample App's last task joined the plan after the project started: a scope change.
  tasks.forEach(function (t) { if (t.id === "a5") t.added = day(9); });
  return {
    tasks: tasks,
    projects: projects,
    parked: [
      { id: "p1", text: "Try a new game engine", note: "Not competing for the next slot" },
      { id: "p2", text: "Write up lessons learned", note: "After the website launches" },
      { id: "p3", text: "Redesign the logo", note: "", arch: { at: yest, why: "removed" } }
    ],
    // Decisions attach through a required step link. d3 is an archived example.
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
    hist: allHistory,
    start: day(0)
  };
}
export function defaults() {
  var d = sampleData();
  return {
    v: 5, start: d.start, days: 7,
    tasks: d.tasks, hist: d.hist,
    decisions: d.decisions, projects: d.projects, parked: d.parked,
    milestones: d.milestones, pins: ["proj:pApp"],
    settings: { theme: "auto", dateFormat: "us", blockWord: "Sprint", hideWelcome: false, showSplash: true, lastBackup: "", since: iso(TODAY), archivePurgeDays: 0 }
  };
}

export function validArch(a) { return (a && typeof a === "object" && isISO(a.at) && (a.why === "done" || a.why === "removed")) ? { at: a.at, why: a.why } : null; }
export function isISO(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }
// A slip's own undo snapshot: each affected task's own block number right
// before the slip, so Undo can put every one of them back exactly where it was.
// Burndown history: { "<ISO day>": [tasks in scope, tasks still open] }. Anything
// malformed is dropped; the newest 1000 entries are kept. Saved data from before
// history counted tasks (an `actual` field in step units) is not carried over.
function cleanHist(v) {
  var out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  Object.keys(v).sort().slice(-1000).forEach(function (k) {
    var e = v[k];
    if (isISO(k) && Array.isArray(e) && typeof e[0] === "number" && typeof e[1] === "number" && e[0] >= 0 && e[0] <= 5000 && e[1] >= 0 && e[1] <= e[0]) out[k] = [Math.round(e[0]), Math.round(e[1])];
  });
  return out;
}
function cleanSlip(v) {
  if (!v || typeof v !== "object" || typeof v.days !== "number" || !Array.isArray(v.snap)) return null;
  var snap = v.snap.slice(0, 500).filter(function (s) { return s && typeof s.id === "string" && typeof s.block === "number" && s.block >= 0 && s.block <= 5000; }).map(function (s) { return { id: S(s.id, 40), block: Math.round(s.block), start: isISO(s.start) ? s.start : "", due: isISO(s.due) ? s.due : "" }; });
  if (!snap.length) return null;
  return { days: Math.round(v.days) || 0, snap: snap };
}
export function normalize(s) {
  var d = defaults();
  if (!s || typeof s !== "object") return d;
  if (isISO(s.start)) d.start = s.start;
  if (typeof s.days === "number" && s.days >= 1 && s.days <= 30) d.days = Math.round(s.days);
  if (Array.isArray(s.projects)) {
    d.projects = s.projects.filter(function (x) { return x && typeof x.id === "string"; }).map(function (x) {
      // A project used to have a separate short description (`note`) as well
      // as `notes`. They are one field now: fold a saved `note` into the front
      // of `notes` so nothing is lost. Once saved, `note` no longer exists.
      var oldNote = S(x.note, 5000), body = S(x.notes, 5000);
      // Old saved data may still have `mult`, a multiplier on the global
      // block length instead of its own day count -- convert once on load.
      var days = (typeof x.days === "number" && x.days >= 1 && x.days <= 90) ? Math.round(x.days)
        : (typeof x.mult === "number" && x.mult >= 0.25 && x.mult <= 5) ? Math.max(1, Math.round(d.days * x.mult)) : d.days;
      return {
        id: S(x.id, 40), name: S(x.name, 120),
        status: (x.status === "active" || x.status === "candidate" || x.status === "complete") ? x.status : "candidate",
        start: isISO(x.start) ? x.start : "", days: days,
        due: isISO(x.due) ? x.due : "",
        notes: (oldNote && body ? oldNote + "\n\n" + body : oldNote || body).slice(0, 5000), arch: validArch(x.arch), launchCritical: x.launchCritical === true, hist: cleanHist(x.hist),
        lastSlip: cleanSlip(x.lastSlip),
        // Validated below, once every project's real id is known -- a link
        // can only point at another project that actually exists in the final
        // set. Arbitrary depth or cycles are fine; each side of a link is just
        // an id in this array, and nothing here ever traverses the graph.
        linkedProjectIds: Array.isArray(x.linkedProjectIds) ? x.linkedProjectIds.filter(function (id) { return typeof id === "string"; }).slice(0, 60) : []
      };
    });
  }
  var projectIds = {}; d.projects.forEach(function (p) { projectIds[p.id] = true; });
  d.projects.forEach(function (p) {
    p.linkedProjectIds = p.linkedProjectIds.filter(function (id) { return id !== p.id && projectIds[id]; });
  });
  if (Array.isArray(s.tasks)) {
    var ts = [];
    s.tasks.forEach(function (t) {
      if (!t || typeof t !== "object" || typeof t.id !== "string") return;
      // A task's projectId must match a real project, or (for the "Next
      // project" placeholder only) be null/absent. An orphaned projectId --
      // pointing at nothing -- drops the task rather than keeping it around
      // unreachable.
      var pid = (typeof t.projectId === "string" && projectIds[t.projectId]) ? t.projectId : null;
      if (!pid && !t.isNext) return;
      var steps = [];
      if (Array.isArray(t.steps)) t.steps.forEach(function (x) {
        if (x && typeof x.id === "string") steps.push({ id: S(x.id, 40), text: S(x.text, 300), done: x.done === true, launch: x.launch === true });
      });
      var b = typeof t.block === "number" ? Math.round(t.block) : 1;
      b = Math.min(5000, Math.max(0, b));
      // Explicit dates belong only to a scheduled task, and a start after its
      // due date is dropped. The block is re-derived from the due date on load.
      var tdue = b > 0 && isISO(t.due) ? t.due : "", tstart = b > 0 && isISO(t.start) ? t.start : "";
      if (tstart && tdue && tstart > tdue) tstart = "";
      var test = typeof t.est === "number" && t.est > 0 && t.est <= 9999 ? Math.round(t.est * 100) / 100 : 0;
      ts.push({
        id: S(t.id, 40), block: b, projectId: pid, what: S(t.what, 400), done: S(t.done, 200), start: tstart, due: tdue, est: test, added: b > 0 && isISO(t.added) ? t.added : "",
        status: STATUSES.indexOf(t.status) >= 0 ? t.status : "Not started", notes: S(t.notes, 5000), steps: steps,
        custom: t.custom === true, isNext: t.isNext === true,
        arch: validArch(t.arch), doneAt: isISO(t.doneAt) ? t.doneAt : ""
      });
    });
    d.tasks = ts;
  }
  d.hist = cleanHist(s.hist);
  // A step id belonging to any live (non-archived) task, across every project --
  // used below to require a decision's step link points at something real.
  var liveStepIds = {};
  d.tasks.forEach(function (t) { if (!t.arch) t.steps.forEach(function (x) { liveStepIds[x.id] = true; }); });
  // Decisions require a real step link (Project -> Task -> Step -> Decision) --
  // a decision with no step, or one pointing at a step that doesn't exist, is
  // dropped rather than kept in a state the UI can't render meaningfully.
  // Only Projects and Ideas archive independently, so there's no "archived,
  // exempt from this rule" case: every decision must resolve to a real, live step.
  if (Array.isArray(s.decisions)) {
    d.decisions = s.decisions.filter(function (x) {
      return x && typeof x.id === "string" && typeof x.step === "string" && liveStepIds[x.step];
    }).map(function (x) { return { id: S(x.id, 40), q: S(x.q, 300), a: S(x.a, 1000), step: S(x.step, 40) }; });
  }
  if (Array.isArray(s.parked)) d.parked = s.parked.filter(function (x) { return x && typeof x.id === "string"; }).map(function (x) { return { id: S(x.id, 40), text: S(x.text, 200), note: S(x.note, 5000), arch: validArch(x.arch) }; });
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
    if (typeof s.settings.showSplash === "boolean") d.settings.showSplash = s.settings.showSplash;
    if (isISO(s.settings.lastBackup)) d.settings.lastBackup = s.settings.lastBackup;
    if (isISO(s.settings.since)) d.settings.since = s.settings.since;
    if ([0, 7, 30, 60, 90].indexOf(s.settings.archivePurgeDays) >= 0) d.settings.archivePurgeDays = s.settings.archivePurgeDays;
  }
  if (Array.isArray(s.pins)) d.pins = s.pins.filter(function (k) { return typeof k === "string" && k.length < 130; }).slice(0, 30);
  return d;
}
// Storage adapter: localStorage (web app) is synchronous and always available;
// Claude's db capability (artifact version) is asynchronous and may resolve
// null (not a published artifact, not granted, or failed to load --
// indistinguishable by design). Rather than make every call site across
// app/*.js that reads `state.x` deal with that, the whole app keeps reading
// `state` as a plain, already-populated object -- this adapter is the only
// place that knows storage might be async, at the load/save boundary alone.
//
// Once resolved, db stays a live reference for the rest of the page's life
// (awaiting use('db') again is free, per its own contract). A null db means
// either "not a published artifact with db granted" or "db failed to load" --
// both fall back to localStorage identically, since a page that can't reach
// the network shouldn't lose the ability to save at all.
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
// Nothing is written to the db until it has been read once. A device with empty
// local storage would otherwise save its own sample data over the real data
// before loading it. A change made before then waits in dbWritePending.
var dbReadDone = false, dbLoadTries = 0;
function dbSave(rawState) {
  if (!dbReadDone || dbWriteInFlight) { dbWritePending = true; return; }
  getDb().then(function (db) {
    if (!db) return; // no db in this view: localStorage (below) is already the real save
    dbWriteInFlight = db.doc("state/main").set({ json: JSON.stringify(rawState), savedAt: localSavedAt })
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
// When this device's data last really changed, kept beside the state (not in it, so backups
// are unchanged). bootSavedAt is what an earlier session left, read before this boot saves
// anything: it is what gets compared with the db's stamp, so a fresh device (no stamp)
// can never look newer than the db, and a boot that changes nothing never refreshes it.
var SAVED_AT_KEY = KEY2 + "-saved-at";
function readSavedAt() { try { return window.localStorage.getItem(SAVED_AT_KEY) || ""; } catch (e) { return ""; } }
var bootSavedAt = readSavedAt(), localSavedAt = bootSavedAt, savesSeen = 0, editedAfterBoot = false;
function writeLocal(json, stamp) {
  try { window.localStorage.setItem(KEY2, json); window.localStorage.setItem(SAVED_AT_KEY, stamp); } catch (e) { /* ignore */ }
}
export function setState(newState) { state = newState; }
export function save() {
  var json = JSON.stringify(state), prev = null;
  try { prev = window.localStorage.getItem(KEY2); } catch (e) { prev = null; }
  var changed = json !== prev;
  if (changed || !localSavedAt) localSavedAt = new Date().toISOString(); // only a real change moves the stamp
  if (changed && savesSeen > 0) editedAfterBoot = true; // the first save is the boot's own, not an edit
  savesSeen++;
  writeLocal(json, localSavedAt);
  dbSave(state);
}

// Runs once at boot (called from app.js's deferred boot sequence, after the
// page has already rendered from load()'s synchronous localStorage/defaults
// result -- never blocks the initial paint on this). If db is available and
// holds real saved data, swap it in and ask the caller to re-render. Resolves
// to true if state was swapped (caller should re-render), false otherwise.
export function loadFromDbIfAvailable() {
  return getDb().then(function (db) {
    if (!db) { dbReadDone = true; dbWritePending = false; return false; }
    return db.doc("state/main").get().then(function (snap) {
      var data = snap.exists ? snap.data() : null, parsed = null;
      // A document that exists but cannot be parsed is treated as unreadable, never overwritten.
      if (data && typeof data.json === "string") parsed = JSON.parse(data.json);
      dbReadDone = true; dbWritePending = false;
      if (!parsed) { dbSave(state); return false; } // the db holds nothing yet: this device's data seeds it
      var dbAt = typeof data.savedAt === "string" ? data.savedAt : "";
      var mine = editedAfterBoot ? localSavedAt : bootSavedAt; // edits since boot (a retry after a failed read) count
      // Newest save wins. This device's writes to the db can fail while it still saves locally,
      // so a newer local copy is kept and pushed up rather than replaced by the db's older one.
      if (mine && dbAt && mine > dbAt) { dbSave(state); return false; }
      if (mine && mine === dbAt) return false; // the very same save: nothing to do
      state = normalize(parsed);
      localSavedAt = dbAt || localSavedAt;
      writeLocal(JSON.stringify(state), localSavedAt); // so the save that follows sees no change
      return true;
    }).catch(function () {
      // Could not read it, so what it holds is unknown: stay local-only and try again shortly.
      if (dbLoadTries++ < 3) setTimeout(function () { loadFromDbIfAvailable().then(function (swapped) { if (swapped) { autoArchive(); save(); renderAll(); } }); }, 2500 * dbLoadTries);
      return false;
    });
  });
}

export var ui = { view: "today", sel: null, detail: false, query: "", prev: "today", searchArchive: true, notesH: {}, projOpen: {} };
// Always opens on Today -- no-op.
export function saveUI() { /* nothing to save */ }

// Stamps a task's completion date the moment its status becomes Done, and
// clears it if the task is reopened. Only Projects and Ideas archive
// independently -- a completed task just stays visible, marked Done, inside
// its live project; this function never moves anything to the Archive itself.
export function autoArchive() {
  state.tasks.forEach(function (t) {
    if (t.status !== "Completed") { t.doneAt = ""; return; }
    if (!t.doneAt) t.doneAt = iso(TODAY);
  });
}
// Permanently deletes Archive entries older than settings.archivePurgeDays,
// checked once at boot (not every save) since it only matters at day
// granularity. Age is time since arch.at, so a restored-then-re-archived
// item gets a fresh clock. 0 means Never; no confirmation is shown, since
// the Settings control itself is the user's standing consent.
export function purgeOldArchive() {
  var days = state.settings.archivePurgeDays;
  if (!days) return;
  var cutoff = TODAY - days * DAY;
  var old = function (item) { return item.arch && parseISO(item.arch.at) < cutoff; };
  state.projects.filter(old).forEach(function (p) {
    state.tasks = state.tasks.filter(function (t) { return t.projectId !== p.id; });
  });
  state.projects = state.projects.filter(function (p) { return !old(p); });
  state.parked = state.parked.filter(function (p) { return !old(p); });
}
export function changed() {
  autoArchive(); syncTaskBlocks(); sweepProjectCompletion(); recordHistory(); recordProjectHistory(); save(); renderAll();
}

