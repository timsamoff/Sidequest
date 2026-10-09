// Round-trip test for the Project -> Quest data-shape rename. Constructs an
// OLD-shaped saved object by hand (state.projects, task.projectId,
// p.linkedProjectIds, "proj:" pins) exactly as a real user's save would look
// before this rename, loads it through the real normalize() via a full boot,
// and asserts every quest/link/pin survived under its new field name with no
// data loss. The fixture's own old-shaped milestones[] array (from before
// milestones became a task flag) is left in place as real historical save
// data but asserts nothing -- that entity is gone, not migrated.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { register } = require("module");
const { pathToFileURL } = require("url");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

register(pathToFileURL(path.join(__dirname, "isolate-loader.mjs")));

let counter = 0;
async function mk(saved) {
  const dom = new JSDOM(html, { url: "https://example.test/", pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  if (saved) dom.window.localStorage.setItem("sidequest-template-v1", JSON.stringify(saved));
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, "localStorage", { value: dom.window.localStorage, configurable: true, writable: true });
  global.FileReader = dom.window.FileReader;
  await import("../app/app.js?run=" + (++counter));
  await Promise.resolve();
  await Promise.resolve();
  return dom;
}

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// The pre-rename shape: state.projects[], task.projectId, p.linkedProjectIds,
// milestone.projectId, pins using "proj:" + id.
const OLD_SAVE = {
  v: 5, start: "2026-01-01", days: 7,
  projects: [
    { id: "p1", name: "Old Project One", status: "active", start: "2026-01-01", days: 7, due: "", notes: "First project notes", arch: null, linkedProjectIds: ["p2"], launchCritical: false, hist: { "2026-01-01": [2, 2] }, lastSlip: null },
    { id: "p2", name: "Old Project Two", status: "active", start: "2026-01-08", days: 7, due: "", notes: "Second project", arch: null, linkedProjectIds: ["p1"], launchCritical: true, hist: {}, lastSlip: null },
    { id: "p3", name: "Archived Project", status: "active", start: "2026-01-01", days: 7, due: "", notes: "", arch: { at: "2026-01-15", why: "done" }, linkedProjectIds: [], launchCritical: false, hist: {}, lastSlip: null }
  ],
  tasks: [
    { id: "t1", block: 1, projectId: "p1", what: "Task on project one", done: "", status: "Not started", notes: "", steps: [], custom: false, isNext: false, start: "", due: "", est: 0, added: "" },
    { id: "t2", block: 1, projectId: "p2", what: "Task on project two", done: "", status: "Not started", notes: "", steps: [], custom: false, isNext: false, start: "", due: "", est: 0, added: "" }
  ],
  decisions: [],
  parked: [],
  milestones: [
    { id: "m1", text: "Old milestone", date: "2026-02-01", projectId: "p1" }
  ],
  hist: {},
  pins: ["proj:p1", "proj:p2"],
  settings: { theme: "auto", dateFormat: "us", blockWord: "Sprint", hideWelcome: false, showSplash: true, lastBackup: "", since: "2026-01-01", archivePurgeDays: 0 }
};

async function main() {
  const dom = await mk(OLD_SAVE);
  const stateMod = await import("../app/state.js?run=" + counter);
  const s = stateMod.state;

  ok(Array.isArray(s.quests), "state.quests exists after loading an old-shaped save");
  ok(!("projects" in s) || s.projects === undefined, "state.projects is not populated on the new state shape");
  ok(s.quests.length === 3, "all three old projects survived as quests (" + (s.quests && s.quests.length) + ")");

  const q1 = s.quests.find(q => q.id === "p1");
  const q2 = s.quests.find(q => q.id === "p2");
  const q3 = s.quests.find(q => q.id === "p3");
  ok(!!q1 && q1.name === "Old Project One", "quest p1 kept its name");
  ok(!!q2 && q2.name === "Old Project Two", "quest p2 kept its name");
  ok(!!q3 && q3.name === "Archived Project" && !!q3.vault, "archived quest p3 survived with its vault marker intact");

  ok(Array.isArray(q1.linkedQuestIds) && q1.linkedQuestIds.indexOf("p2") >= 0, "p1's linkedProjectIds migrated to linkedQuestIds (" + JSON.stringify(q1.linkedQuestIds) + ")");
  ok(Array.isArray(q2.linkedQuestIds) && q2.linkedQuestIds.indexOf("p1") >= 0, "p2's linkedProjectIds migrated to linkedQuestIds");
  ok(q2.launchCritical === true, "launchCritical survived the migration");
  ok(q1.hist && q1.hist["2026-01-01"] && q1.hist["2026-01-01"][0] === 2, "per-quest history survived");

  const t1 = s.tasks.find(t => t.id === "t1");
  const t2 = s.tasks.find(t => t.id === "t2");
  ok(!!t1 && t1.questId === "p1", "task t1's projectId migrated to questId (" + (t1 && t1.questId) + ")");
  ok(!!t2 && t2.questId === "p2", "task t2's projectId migrated to questId");
  ok(s.tasks.length === 2, "no tasks were lost in migration");

  ok(Array.isArray(s.pins) && s.pins.indexOf("quest:p1") >= 0, "pin 'proj:p1' migrated to 'quest:p1' (" + JSON.stringify(s.pins) + ")");
  ok(Array.isArray(s.pins) && s.pins.indexOf("quest:p2") >= 0, "pin 'proj:p2' migrated to 'quest:p2'");
  ok(s.pins.indexOf("proj:p1") < 0 && s.pins.indexOf("proj:p2") < 0, "no stale 'proj:' pins remain");

  console.log("\n" + (fails ? "FAIL" : "PASS") + " quest-migration.test.js: " + (fails ? fails + " failed" : "all checks passed"));
  process.exit(fails ? 1 : 0);
}
main();
