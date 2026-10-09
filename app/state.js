import { DAY, iso, parseISO, TODAY } from "./dates.js";
import { findAnyTask, syncTaskBlocks } from "./model.js";
import { notify } from "./dom.js";
import { recordHistory, recordQuestHistory, sweepQuestCompletion } from "./views.js";
import { renderAll } from "./app.js";

export var KEY2 = "sidequest-template-v1", UIKEY = "sidequest-template-ui";
export var STATUSES = ["Not started", "In progress", "Completed"];
export var CHECKPOINTS = 7;
export var APP_VERSION = "1.0.0";
export var APP_NAME = "Sidequest";

export function S(v, max) { return typeof v === "string" ? v.slice(0, max || 500) : ""; }
export function st(id, text, done) { return { id: id, text: text, done: done === true }; }
export function task(id, block, questId, what, done, steps, extra) {
  var t = { id: id, block: block, questId: questId, what: what, done: done, status: "Not started", notes: "", steps: steps || [], custom: false, isNext: false, start: "", due: "", est: 0, added: "", launch: false };
  if (extra) Object.keys(extra).forEach(function (k) { t[k] = extra[k]; });
  return t;
}
// A quest's own lifecycle: "candidate" or "active". Promoted in place -- the
// same record and id carry through candidate -> active -> vaulted, never a second record.
export function quest(id, name, status, extra) {
  var p = { id: id, name: name, status: status, start: "", days: 7, due: "", notes: "", vault: null, linkedQuestIds: [], savedLinkIds: null, launchCritical: false, hist: {}, lastSlip: null, wasPinned: false, justReopened: false, client: { org: "", poc: "", phone: "", email: "", address: "", website: "", coin: "", per: "Hour" } };
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
  // History entries are [tasks in scope, tasks still open], keyed by the day recorded.
  var appHistory = {}; appHistory[day(0)] = [4, 4]; appHistory[day(5)] = [4, 3]; appHistory[day(9)] = [5, 4];
  // Runs a little late, then ahead, then lands on time, so its Burndown crosses the planned line.
  var doneHistory = {}; doneHistory[day(-28)] = [4, 4]; doneHistory[day(-20)] = [4, 3]; doneHistory[day(-15)] = [4, 2]; doneHistory[day(-12)] = [4, 1]; doneHistory[day(-1)] = [4, 0];
  // A twelfth task was added on day 9, so the main burndown's scope line steps up once.
  var allHistory = {}; allHistory[day(0)] = [11, 11]; allHistory[day(5)] = [11, 10]; allHistory[day(9)] = [12, 11];
  var quests = [
    // pApp <-> pSite demonstrates a bidirectional quest link.
    quest("pApp", "Sample App", "active", { hist: appHistory, notes: "A simple habit tracker. Keep the first version small and add features after the beta.", linkedQuestIds: ["pSite"] }),
    // launchCritical: the app's launch checklist shows the site's own status.
    quest("pSite", "Sample Website", "active", { start: day(14), linkedQuestIds: ["pApp"], launchCritical: true }),
    quest("pGame", "Sample Game", "active", { start: day(21), days: 14, due: day(21 + 122) }),
    quest("pExt", "Sample Browser Extension", "candidate", { notes: "A small tool that could ship in a month" }),
    quest("pCli", "Sample Command-Line Tool", "candidate", { notes: "Would save time on your own quests" }),
    // Demonstrates a Complete quest: drops out of In progress but still shows in the plain Quests list.
    quest("pDone", "Sample Finished Quest", "complete", { start: day(-28), notes: "Shipped and wrapped up.", hist: doneHistory }),
    // Demonstrates a promoted-but-task-less Active quest, which lands under Pending instead of In progress.
    quest("pNext", "Sample Next Quest", "active", { notes: "Chosen, but nothing scheduled yet." })
  ];
  var tasks = [
    task("a1", 1, "pApp", "Sketch the main screens", "Sketches for every screen", [st("a1a", "Sketch the home screen", true), st("a1b", "Sketch the sign-in screen", true), st("a1c", "Sketch the settings screen", true)], { status: "Completed", doneAt: lastWeek }),
    task("a2", 2, "pApp", "Build the sign-in flow", "People can sign up and log in", [st("a2a", "Build the sign-up form", true), st("a2b", "Connect to a login service"), st("a2c", "Handle wrong passwords")], { status: "In progress" }),
    task("a3", 3, "pApp", "Build the home screen", "The list loads quickly and scrolls smoothly", [st("a3a", "Show the list of items", true), st("a3b", "Add pull to refresh"), st("a3c", "Handle an empty list")], { status: "In progress", notes: "Ask a friend to try this on an older phone before moving on." }),
    task("a4", 4, "pApp", "Run a beta with five friends", "Five people have tried it and sent notes", [st("a4a", "Pick five testers"), st("a4b", "Send the beta link"), st("a4c", "Collect and sort the feedback")]),
    task("a5", 5, "pApp", "Submit to the app store", "The app is live", [st("a5z", "Choose the first app store", true), st("a5a", "Write the store description"), st("a5b", "Prepare screenshots"), st("a5c", "Submit for review")], { launch: true }),
    task("a6", 0, "pApp", "Add a dark mode", "Every screen passes a contrast check in dark mode", []),
    task("w1", 1, "pSite", "Write the page copy", "Every page has final text", [st("w1a", "Write the home page", true), st("w1b", "Write the about page"), st("w1c", "Write the contact page")], { status: "In progress" }),
    task("w2", 2, "pSite", "Build the layout", "Pages look right on a phone and a laptop", [st("w2a", "Build the header and footer"), st("w2b", "Make the layout work on phones"), st("w2c", "Compress the images")]),
    task("w3", 3, "pSite", "Launch the site", "The site is live and checked", [st("w3a", "Point the domain at the site"), st("w3b", "Check every page on a phone"), st("w3c", "Announce it")]),
    task("g1", 1, "pGame", "Prototype the core mechanic", "Someone can play for one minute", [st("g1a", "Make the player move"), st("g1b", "Add one obstacle"), st("g1c", "Add a win and a lose state")]),
    task("g2", 2, "pGame", "Make the first ten levels", "Ten levels load and can be finished start to end"),
    task("g3", 3, "pGame", "Playtest and polish", "Three playtests done and the top problems fixed", [st("g3a", "Run three playtests"), st("g3b", "Fix the top five problems"), st("g3d", "Decide free or paid"), st("g3c", "Record a trailer")]),
    task("g4", 0, "pGame", "Add a level editor", "Players can build, save, and share a level"),
    task("n1", 6, null, "Choose one of the candidates and set the others aside", "One is chosen", [], { isNext: true }),
    // pDone's own tasks, all finished. Four weekly tasks at weight 2 each give
    // an even planned line, which doneHistory above then zig-zags around.
    task("d1", 1, "pDone", "Design the feature", "The design is agreed", [st("d1a", "Sketch the approach", true), st("d1b", "Get sign-off", true)], { status: "Completed", doneAt: day(-22) }),
    task("d2", 2, "pDone", "Build the core feature", "It works end to end", [st("d2a", "Build the happy path", true), st("d2b", "Handle errors", true)], { status: "Completed", doneAt: day(-15) }),
    task("d3", 3, "pDone", "Test it", "The top bugs are fixed", [st("d3a", "Run through every screen", true), st("d3b", "Fix what’s broken", true)], { status: "Completed", doneAt: day(-8) }),
    task("d4", 4, "pDone", "Ship it", "It’s live", [st("d4a", "Write the release notes", true), st("d4b", "Announce it", true)], { status: "Completed", doneAt: day(-1) })
  ];
  var EST = { a1: 3, a2: 6, a3: 8, a4: 4, a5: 5, a6: 4, w1: 3, w2: 10, w3: 2, g1: 12, g2: 20, g3: 8, g4: 16, d1: 6, d2: 12, d3: 8, d4: 3 };
  tasks.forEach(function (t) { if (EST[t.id]) t.est = EST[t.id]; });
  // When the finished tasks were completed (Sample Finished Quest's are a bit late, early, then on time).
  var DONE = { a1: day(5), d1: day(-20), d2: day(-15), d3: day(-12), d4: day(-1) };
  tasks.forEach(function (t) { if (DONE[t.id]) t.doneAt = DONE[t.id]; });
  // Explicit start/due dates for every scheduled task. A start date is only
  // set when the task's own estimate is light enough the block would otherwise look misleadingly full.
  var SCHEDULE = {
    a1: { start: day(2), due: day(4) }, a2: { start: day(9), due: day(12) }, a3: { start: day(18), due: day(20) },
    a4: { start: day(25), due: day(27) }, a5: { start: day(31), due: day(34) },
    w1: { start: day(19), due: day(20) }, w2: { start: day(22), due: day(27) }, w3: { due: day(34) },
    g2: { start: day(37), due: day(47) }, g3: { start: day(55), due: day(58) },
    d1: { due: day(-25) }, d2: { due: day(-18) }, d3: { due: day(-11) }, d4: { due: day(-4) }
  };
  tasks.forEach(function (t) {
    var s = SCHEDULE[t.id]; if (!s) return;
    if (s.start) t.start = s.start;
    t.due = s.due;
  });
  // Shorter than its two-week block: starts two days in, due a week later.
  tasks.forEach(function (t) { if (t.id === "g1") { t.start = day(23); t.due = day(30); } });
  // Sample App's last task joined the plan after the quest started: a scope change.
  tasks.forEach(function (t) { if (t.id === "a5") t.added = day(9); });
  return {
    tasks: tasks,
    quests: quests,
    workshop: [
      { id: "p1", text: "Try a new game engine", note: "Not competing for the next slot" },
      { id: "p2", text: "Write up lessons learned", note: "After the website launches" },
      { id: "p3", text: "Redesign the logo", note: "", vault: { at: yest, why: "removed" } }
    ],
    // Decisions attach through a required step link. d3 is a vaulted example.
    decisions: [
      { id: "d1", q: "Which app store should you launch on first?", a: "Start with one store, then add the other.", step: "a5z" },
      { id: "d2", q: "Will the game be free, paid, or free with a paid upgrade?", a: "", step: "g3d" },
      { id: "d3", q: "Should the site use a page builder?", a: "No, plain pages are enough.", step: "w3a" }
    ],
    // Milestones now require a direct quest link (no step/task chain to derive it from).
    milestones: [
      { id: "m1", text: "Sample App beta opens", date: day(21), questId: "pApp" },
      { id: "m2", text: "Sample Game demo day", date: day(63), questId: "pGame" }
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
    decisions: d.decisions, quests: d.quests, workshop: d.workshop,
    milestones: d.milestones, pins: ["quest:pApp"],
    settings: { theme: "auto", dateFormat: "us", blockWord: "Sprint", hideWelcome: false, showSplash: true, animatedBurndown: true, lastBackup: "", since: iso(TODAY), vaultPurgeDays: 0, contact: { name: "", company: "", phone: "", email: "", address: "", website: "" }, brandmark: "", audio: true, completionFx: true, affirmationBucket: [], dismissedUpdateVersion: "" }
  };
}

export function validVault(a) { return (a && typeof a === "object" && isISO(a.at) && (a.why === "done" || a.why === "removed")) ? { at: a.at, why: a.why } : null; }
export function isISO(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }
// Burndown history: { "<ISO day>": [tasks in scope, tasks still open] }.
// Malformed entries are dropped; the newest 1000 are kept.
function cleanHist(v) {
  var out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  Object.keys(v).sort().slice(-1000).forEach(function (k) {
    var e = v[k];
    if (isISO(k) && Array.isArray(e) && typeof e[0] === "number" && typeof e[1] === "number" && e[0] >= 0 && e[0] <= 5000 && e[1] >= 0 && e[1] <= e[0]) out[k] = [Math.round(e[0]), Math.round(e[1])];
  });
  return out;
}
// A slip's own undo snapshot: each affected task's prior block number, so Undo can restore it exactly.
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
  // Quests used to be called Projects; read whichever old or new field name is present.
  var rawQuests = Array.isArray(s.quests) ? s.quests : s.projects;
  if (Array.isArray(rawQuests)) {
    d.quests = rawQuests.filter(function (x) { return x && typeof x.id === "string"; }).map(function (x) {
      // `note` and `notes` used to be separate fields; fold a saved `note` into the front of `notes`.
      var oldNote = S(x.note, 5000), body = S(x.notes, 5000);
      // Old saved data may have `mult` (a multiplier on the global block length) instead of its own day count.
      var days = (typeof x.days === "number" && x.days >= 1 && x.days <= 90) ? Math.round(x.days)
        : (typeof x.mult === "number" && x.mult >= 0.25 && x.mult <= 5) ? Math.max(1, Math.round(d.days * x.mult)) : d.days;
      var linked = Array.isArray(x.linkedQuestIds) ? x.linkedQuestIds : x.linkedProjectIds;
      // Set aside while demoted to candidate, so a later promotion can restore the same links.
      var saved = Array.isArray(x.savedLinkIds) ? x.savedLinkIds : null;
      var xc = x.client && typeof x.client === "object" ? x.client : {};
      return {
        id: S(x.id, 40), name: S(x.name, 120),
        status: (x.status === "active" || x.status === "candidate" || x.status === "complete") ? x.status : "candidate",
        start: isISO(x.start) ? x.start : "", days: days,
        due: isISO(x.due) ? x.due : "",
        notes: (oldNote && body ? oldNote + "\n\n" + body : oldNote || body).slice(0, 5000), vault: validVault(x.vault || x.arch), launchCritical: x.launchCritical === true, hist: cleanHist(x.hist),
        lastSlip: cleanSlip(x.lastSlip),
        // Set aside by completionDialog()'s auto-unpin so Reopen can restore it.
        wasPinned: x.wasPinned === true,
        // Validated below, once every quest's real id is known.
        linkedQuestIds: Array.isArray(linked) ? linked.filter(function (id) { return typeof id === "string"; }).slice(0, 60) : [],
        savedLinkIds: saved ? saved.filter(function (id) { return typeof id === "string"; }).slice(0, 60) : null,
        client: { org: S(xc.org, 200), poc: S(xc.poc, 200), phone: S(xc.phone, 200), email: S(xc.email, 200), address: S(xc.address, 500), website: S(xc.website, 200), coin: (typeof xc.coin === "number" && xc.coin >= 0 && xc.coin <= 999999) ? xc.coin : "", per: (xc.per === "Hour" || xc.per === "Quest") ? xc.per : "Hour" }
      };
    });
  }
  var questIds = {}; d.quests.forEach(function (p) { questIds[p.id] = true; });
  d.quests.forEach(function (p) {
    p.linkedQuestIds = p.linkedQuestIds.filter(function (id) { return id !== p.id && questIds[id]; });
    if (p.savedLinkIds) p.savedLinkIds = p.savedLinkIds.filter(function (id) { return id !== p.id && questIds[id]; });
  });
  if (Array.isArray(s.tasks)) {
    var ts = [];
    s.tasks.forEach(function (t) {
      if (!t || typeof t !== "object" || typeof t.id !== "string") return;
      // A task's questId must match a real quest, or (for the "Next quest"
      // placeholder only) be null/absent; an orphaned questId drops the task.
      var rawId = typeof t.questId === "string" ? t.questId : t.projectId;
      var pid = (typeof rawId === "string" && questIds[rawId]) ? rawId : null;
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
      // The launch checklist now holds whole tasks, not steps -- a task with
      // any step that used to be flagged launch becomes a launch task itself,
      // so an old saved checklist isn't silently emptied.
      var wasStepLaunch = Array.isArray(t.steps) && t.steps.some(function (x) { return x && x.launch === true; });
      ts.push({
        id: S(t.id, 40), block: b, questId: pid, what: S(t.what, 400), done: S(t.done, 200), start: tstart, due: tdue, est: test, added: b > 0 && isISO(t.added) ? t.added : "",
        status: STATUSES.indexOf(t.status) >= 0 ? t.status : "Not started", notes: S(t.notes, 5000), steps: steps,
        custom: t.custom === true, isNext: t.isNext === true, launch: t.launch === true || wasStepLaunch,
        vault: validVault(t.vault || t.arch), doneAt: isISO(t.doneAt) ? t.doneAt : ""
      });
    });
    d.tasks = ts;
  }
  d.hist = cleanHist(s.hist);
  // A step id belonging to any live (not in the Vault) task, across every quest --
  // used below to require a decision's step link points at something real.
  var liveStepIds = {};
  d.tasks.forEach(function (t) { if (!t.vault) t.steps.forEach(function (x) { liveStepIds[x.id] = true; }); });
  // Decisions require a real step link; one with no step, or a step that
  // doesn't exist, is dropped rather than kept unrenderable.
  if (Array.isArray(s.decisions)) {
    d.decisions = s.decisions.filter(function (x) {
      return x && typeof x.id === "string" && typeof x.step === "string" && liveStepIds[x.step];
    }).map(function (x) { return { id: S(x.id, 40), q: S(x.q, 300), a: S(x.a, 1000), step: S(x.step, 40) }; });
  }
  // The Workshop array used to be called `parked`; read whichever is present.
  var rawWorkshop = Array.isArray(s.workshop) ? s.workshop : s.parked;
  if (Array.isArray(rawWorkshop)) d.workshop = rawWorkshop.filter(function (x) { return x && typeof x.id === "string"; }).map(function (x) { return { id: S(x.id, 40), text: S(x.text, 200), note: S(x.note, 5000), vault: validVault(x.vault || x.arch) }; });
  // Milestones require a direct quest link; one pointing at a quest that no longer exists is dropped.
  if (Array.isArray(s.milestones)) {
    d.milestones = s.milestones.filter(function (x) {
      var mid = typeof x.questId === "string" ? x.questId : x.projectId;
      return x && typeof x.id === "string" && isISO(x.date) && typeof mid === "string" && questIds[mid];
    }).map(function (x) { var mid = typeof x.questId === "string" ? x.questId : x.projectId; return { id: S(x.id, 40), text: S(x.text, 200), date: x.date, questId: mid }; });
  }
  if (s.settings && typeof s.settings === "object") {
    if (["auto", "light", "dark"].indexOf(s.settings.theme) >= 0) d.settings.theme = s.settings.theme;
    if (["us", "intl", "mdy", "dmy", "iso"].indexOf(s.settings.dateFormat) >= 0) d.settings.dateFormat = s.settings.dateFormat;
    if (["Block", "Sprint", "Iteration", "Phase", "Week"].indexOf(s.settings.blockWord) >= 0) d.settings.blockWord = s.settings.blockWord;
    if (typeof s.settings.hideWelcome === "boolean") d.settings.hideWelcome = s.settings.hideWelcome;
    if (typeof s.settings.showSplash === "boolean") d.settings.showSplash = s.settings.showSplash;
    if (typeof s.settings.animatedBurndown === "boolean") d.settings.animatedBurndown = s.settings.animatedBurndown;
    if (isISO(s.settings.lastBackup)) d.settings.lastBackup = s.settings.lastBackup;
    if (isISO(s.settings.since)) d.settings.since = s.settings.since;
    // vaultPurgeDays used to be called archivePurgeDays; read whichever is present.
    var rawPurge = [0, 7, 30, 60, 90].indexOf(s.settings.vaultPurgeDays) >= 0 ? s.settings.vaultPurgeDays : s.settings.archivePurgeDays;
    if ([0, 7, 30, 60, 90].indexOf(rawPurge) >= 0) d.settings.vaultPurgeDays = rawPurge;
    if (s.settings.contact && typeof s.settings.contact === "object") {
      var c = s.settings.contact;
      d.settings.contact = { name: S(c.name, 200), company: S(c.company, 200), phone: S(c.phone, 200), email: S(c.email, 200), address: S(c.address, 500), website: S(c.website, 200) };
    }
    // A data: URI, capped well above the 300 KB upload limit for base64 overhead; anything else is dropped, not truncated.
    if (typeof s.settings.brandmark === "string" && /^data:image\//.test(s.settings.brandmark) && s.settings.brandmark.length <= 500000) d.settings.brandmark = s.settings.brandmark;
    if (typeof s.settings.audio === "boolean") d.settings.audio = s.settings.audio;
    if (typeof s.settings.completionFx === "boolean") d.settings.completionFx = s.settings.completionFx;
    if (typeof s.settings.dismissedUpdateVersion === "string") d.settings.dismissedUpdateVersion = S(s.settings.dismissedUpdateVersion, 20);
    // Validated on load, not trusted blindly -- a stale saved bucket (from before an
    // AFFIRMATIONS edit) could hold out-of-range or duplicate indices.
    if (Array.isArray(s.settings.affirmationBucket)) {
      var seen = {};
      d.settings.affirmationBucket = s.settings.affirmationBucket.filter(function (n) {
        return typeof n === "number" && n >= 0 && n < 500 && !seen[n] && (seen[n] = true);
      });
    }
  }
  // Pins used to route to a quest's page via "proj:" + id; migrate any saved
  // pin to "quest:" + id so an old sidebar pin keeps working after the rename.
  if (Array.isArray(s.pins)) d.pins = s.pins.filter(function (k) { return typeof k === "string" && k.length < 130; }).map(function (k) { return k.indexOf("proj:") === 0 ? "quest:" + k.slice(5) : k; }).slice(0, 30);
  return d;
}
// Storage adapter: localStorage is synchronous and always available; Claude's
// db capability is async and may resolve null, which falls back to localStorage identically either way.
var dbPromise = null;
function getDb() {
  if (dbPromise) return dbPromise;
  dbPromise = (typeof window !== "undefined" && window.claude && typeof window.claude.use === "function")
    ? window.claude.use("db").catch(function () { return null; })
    : Promise.resolve(null);
  return dbPromise;
}

// One write in flight at a time (the db capability's own contract); a burst
// of saves coalesces into the running write plus exactly one more carrying the latest state.
var dbWriteInFlight = null, dbWritePending = false;
// Nothing is written to the db until it has been read once, or an empty
// device would overwrite real data with its own sample data.
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
// When this device's data last really changed, kept beside the state (not in
// it) so a fresh device's stamp can never look newer than the db's.
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

// Runs once at boot, after the initial paint. Swaps in the db's state if
// available and newer, and resolves true when the caller should re-render.
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
      if (dbLoadTries++ < 3) setTimeout(function () { loadFromDbIfAvailable().then(function (swapped) { if (swapped) { autoVault(); save(); renderAll(); } }); }, 2500 * dbLoadTries);
      return false;
    });
  });
}

// Plain "x.y.z" compare, each part numeric. Returns true only when b is
// strictly newer than a; a malformed string on either side is treated as not-newer.
function isNewerVersion(a, b) {
  var pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  if (pa.length !== 3 || pb.length !== 3 || pa.some(isNaN) || pb.some(isNaN)) return false;
  for (var i = 0; i < 3; i++) { if (pb[i] > pa[i]) return true; if (pb[i] < pa[i]) return false; }
  return false;
}
// A separate db document from state/main -- deliberately outside the state
// object itself, so an ordinary save() (which only ever writes state/main)
// can never overwrite a version stamp set here from outside the app.
// No-op (resolves null) on the web build or with no db. The stamp itself is
// written by hand when a new sidequest.html is published; nothing in this
// app's own code ever writes meta/version.
export function checkForAppUpdate() {
  return getDb().then(function (db) {
    if (!db) return null;
    return db.doc("meta/version").get().then(function (snap) {
      var data = snap.exists ? snap.data() : null;
      var latest = data && typeof data.latest === "string" ? data.latest : null;
      return latest && isNewerVersion(APP_VERSION, latest) ? latest : null;
    }).catch(function () { return null; });
  });
}

export var ui = { view: "today", sel: null, detail: false, query: "", prev: "today", searchVault: true, notesH: {}, questOpen: {} };
// Always opens on Today -- no-op.
export function saveUI() { /* nothing to save */ }

// Stamps a task's completion date when it becomes Done, clears it if reopened.
// Never moves anything to the Vault itself -- only Quests and Ideas do that.
export function autoVault() {
  state.tasks.forEach(function (t) {
    if (t.status !== "Completed") { t.doneAt = ""; return; }
    if (!t.doneAt) t.doneAt = iso(TODAY);
  });
}
// Permanently deletes Vault entries older than settings.vaultPurgeDays,
// checked once at boot. 0 means Never; no confirmation, the Settings control itself is standing consent.
export function purgeOldVault() {
  var days = state.settings.vaultPurgeDays;
  if (!days) return;
  var cutoff = TODAY - days * DAY;
  var old = function (item) { return item.vault && parseISO(item.vault.at) < cutoff; };
  state.quests.filter(old).forEach(function (p) {
    state.tasks = state.tasks.filter(function (t) { return t.questId !== p.id; });
  });
  state.quests = state.quests.filter(function (p) { return !old(p); });
  state.workshop = state.workshop.filter(function (p) { return !old(p); });
}
// Shuffled-bucket randomizer: draws from state.settings.affirmationBucket (a
// shuffled list of remaining indices), refilling and reshuffling a fresh full
// bucket once empty, so no quote repeats until every one has shown once.
// `count` is the live AFFIRMATIONS.length, since the list itself can change.
export function nextAffirmationIndex(count) {
  var bucket = state.settings.affirmationBucket;
  if (!bucket || bucket.length === 0 || bucket.some(function (n) { return n >= count; })) {
    bucket = [];
    for (var i = 0; i < count; i++) bucket.push(i);
    for (var j = bucket.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = bucket[j]; bucket[j] = bucket[k]; bucket[k] = tmp;
    }
  }
  var next = bucket.pop();
  state.settings.affirmationBucket = bucket;
  return next;
}
export function changed() {
  autoVault(); syncTaskBlocks(); sweepQuestCompletion(); recordHistory(); recordQuestHistory(); save(); renderAll();
}

