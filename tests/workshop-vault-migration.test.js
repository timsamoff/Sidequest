// Round-trip test for the Parking lot -> Workshop and Archive -> Vault
// data-shape rename. Constructs an OLD-shaped saved object by hand
// (state.parked, t.arch/p.arch/x.arch, settings.archivePurgeDays) covering
// all three record types that carry the marker (a task, a quest, and a
// parked idea), loads it through the real normalize() via a full boot, and
// asserts everything survived under the new field names with no data loss.
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

// The pre-rename shape: state.parked[], t.arch/p.arch/x.arch, settings.archivePurgeDays.
const OLD_SAVE = {
  v: 5, start: "2026-01-01", days: 7,
  quests: [
    { id: "q1", name: "Live Quest", status: "active", start: "2026-01-01", days: 7, due: "", notes: "Notes here", arch: null, linkedQuestIds: [], launchCritical: false, hist: {}, lastSlip: null },
    { id: "q2", name: "Archived Quest", status: "active", start: "2026-01-01", days: 7, due: "", notes: "", arch: { at: "2026-01-15", why: "done" }, linkedQuestIds: [], launchCritical: false, hist: {}, lastSlip: null }
  ],
  tasks: [
    { id: "t1", block: 1, questId: "q1", what: "Live task", done: "", status: "Not started", notes: "", steps: [], custom: false, isNext: false, start: "", due: "", est: 0, added: "" },
    { id: "t2", block: 1, questId: "q2", what: "Archived task", done: "", status: "Completed", notes: "", steps: [], custom: false, isNext: false, start: "", due: "", est: 0, added: "", arch: { at: "2026-01-15", why: "removed" } }
  ],
  decisions: [],
  parked: [
    { id: "i1", text: "Live idea", note: "An idea note", arch: null },
    { id: "i2", text: "Archived idea", note: "", arch: { at: "2026-01-10", why: "removed" } }
  ],
  milestones: [],
  hist: {},
  pins: ["quest:q1"],
  settings: { theme: "auto", dateFormat: "us", blockWord: "Sprint", hideWelcome: false, showSplash: true, lastBackup: "", since: "2026-01-01", archivePurgeDays: 0 }
};

async function main() {
  await mk(OLD_SAVE);
  const stateMod = await import("../app/state.js?run=" + counter);
  const s = stateMod.state;

  ok(Array.isArray(s.workshop), "state.workshop exists after loading an old-shaped save");
  ok(!("parked" in s) || s.parked === undefined, "state.parked is not populated on the new state shape");
  ok(s.workshop.length === 2, "both parked ideas survived in the Workshop (" + (s.workshop && s.workshop.length) + ")");

  const i1 = s.workshop.find(x => x.id === "i1");
  const i2 = s.workshop.find(x => x.id === "i2");
  ok(!!i1 && i1.text === "Live idea" && !i1.vault, "live idea i1 kept its text with no vault marker");
  ok(!!i2 && i2.text === "Archived idea" && !!i2.vault && i2.vault.why === "removed", "vaulted idea i2 survived with its vault marker intact (" + JSON.stringify(i2 && i2.vault) + ")");

  const q1 = s.quests.find(q => q.id === "q1");
  const q2 = s.quests.find(q => q.id === "q2");
  ok(!!q1 && !("arch" in q1), "live quest q1 has no stale arch field");
  ok(!!q1 && !q1.vault, "live quest q1 has no vault marker");
  ok(!!q2 && !!q2.vault && q2.vault.why === "done", "vaulted quest q2 survived with its vault marker intact (" + JSON.stringify(q2 && q2.vault) + ")");

  const t1 = s.tasks.find(t => t.id === "t1");
  const t2 = s.tasks.find(t => t.id === "t2");
  ok(!!t1 && !t1.vault, "live task t1 has no vault marker");
  ok(!!t2 && !!t2.vault && t2.vault.why === "removed", "vaulted task t2 survived with its vault marker intact (" + JSON.stringify(t2 && t2.vault) + ")");
  ok(s.tasks.length === 2, "no tasks were lost in migration");

  ok(s.settings.vaultPurgeDays === 0, "settings.archivePurgeDays migrated to settings.vaultPurgeDays (" + s.settings.vaultPurgeDays + ")");
  ok(!("archivePurgeDays" in s.settings), "no stale archivePurgeDays left on settings");

  // A separate save with no vaulted items and a nonzero purge setting, so the
  // migrated value itself is checked without purgeOldVault() deleting anything.
  const PURGE_SAVE = Object.assign({}, OLD_SAVE, { quests: [OLD_SAVE.quests[0]], tasks: [OLD_SAVE.tasks[0]], parked: [OLD_SAVE.parked[0]], settings: Object.assign({}, OLD_SAVE.settings, { archivePurgeDays: 60 }) });
  await mk(PURGE_SAVE);
  const stateMod2 = await import("../app/state.js?run=" + counter);
  ok(stateMod2.state.settings.vaultPurgeDays === 60, "a nonzero archivePurgeDays migrates to vaultPurgeDays (" + stateMod2.state.settings.vaultPurgeDays + ")");

  console.log("\n" + (fails ? "FAIL" : "PASS") + " workshop-vault-migration.test.js: " + (fails ? fails + " failed" : "all checks passed"));
  process.exit(fails ? 1 : 0);
}
main();
