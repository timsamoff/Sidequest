// The AI prompt and quest import: the validator's item-by-item errors, the Candidate it builds, the prompt text, and the dialog.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { register } = require("module");
const { pathToFileURL } = require("url");
const html = fs.readFileSync(path.join(__dirname, "..", "app", "index.html"), "utf8");

register(pathToFileURL(path.join(__dirname, "isolate-loader.mjs")));

let counter = 0;
async function mk() {
  const dom = new JSDOM(html, { url: "https://example.test/", pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
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
const GOOD = {
  sidequest: 1,
  quest: { name: "Paint the spare room", notes: "Two coats." },
  tasks: [
    { what: "Prepare the walls", done: "Walls are sanded", est: 3, steps: ["Move the furniture", "Patch the holes", { text: "Choose the paint", decision: "Which color?", decided: "Light gray" }] },
    { what: "Paint two coats", est: "6", notes: "Let it dry.", due: "2030-03-10", milestone: true },
    { what: "Put the room back", launch: true },
    { what: "Fix the drip", issue: true }
  ]
};

async function main() {
  const dom = await mk();
  const ai = await import("../app/ai-import.js?run=" + counter);
  const stateMod = await import("../app/state.js?run=" + counter);
  const state = stateMod.state;

  // Valid input
  let r = ai.validateQuestImport(JSON.parse(JSON.stringify(GOOD)));
  ok(r.errors.length === 0 && !!r.clean, "a valid quest passes (" + r.errors.join("; ") + ")");
  ok(r.clean.tasks.length === 4 && r.clean.tasks[1].est === 6, "a numeric string est is read as a number");
  ok(r.clean.quest.start === "2030-03-10", "with no quest start, the earliest task date is used");

  // Errors are reported by item
  r = ai.validateQuestImport({ sidequest: 1, quest: { name: "" }, tasks: [{ what: "A", due: "next week" }, { what: "", est: -2 }, "oops", { what: "B", steps: "one" }] });
  ok(!r.clean && r.errors.length >= 5, "bad input is refused with several errors (" + r.errors.length + ")");
  ok(r.errors.some(e => e.indexOf("quest.name is required") === 0), "a missing quest name is named");
  ok(r.errors.some(e => e.indexOf("Task 1 “A”: due must be a real date") === 0), "a bad date names the task and the field");
  ok(r.errors.some(e => e.indexOf("Task 2: what is required") === 0) && r.errors.some(e => e.indexOf("Task 2: est") === 0), "an untitled task is Task 2 and its est is checked");
  ok(r.errors.some(e => e.indexOf("Task 3 must be an object") === 0), "a non-object task is refused");
  ok(r.errors.some(e => e.indexOf("Task 4 “B”: steps must be a list") === 0), "steps that are not a list are refused");
  ok(ai.validateQuestImport([]).errors.length === 1 && ai.validateQuestImport({ sidequest: 2, quest: { name: "x" }, tasks: [{ what: "a" }] }).errors.length === 1, "an array, or a newer format number, is refused");
  ok(ai.validateQuestImport({ quest: { name: "x" }, tasks: [] }).errors.length === 1, "an empty task list is refused");

  // Dates against the quest's start and due
  r = ai.validateQuestImport({ quest: { name: "x", start: "2030-02-01", due: "2030-03-01" }, tasks: [{ what: "early", due: "2030-01-15" }, { what: "late", due: "2030-04-01" }, { what: "flip", start: "2030-02-20", due: "2030-02-10" }] });
  ok(r.errors.length === 3, "a task before the start, after the due date, or starting after its due is refused (" + r.errors.length + ")");
  ok(ai.validateQuestImport({ quest: { name: "x", start: "2030-02-01", due: "2030-01-01" }, tasks: [{ what: "a" }] }).errors.length === 1, "a quest due before its start is refused");

  // Warnings change the input but do not block it
  r = ai.validateQuestImport({ quest: { name: "x".repeat(200), extra: 1 }, tasks: [{ what: "a", milestone: true, start: "2030-01-01", mystery: 1, steps: ["s".repeat(400), ""] }, { what: "b", issue: true, milestone: true, due: "2030-01-05" }] });
  ok(!!r.clean && r.warnings.length >= 5, "oversize text, a milestone with no due date, a start with no due date, an issue milestone, and unknown fields are warnings (" + r.warnings.length + ")");
  ok(r.clean.quest.name.length === 120 && r.clean.tasks[0].steps.length === 1 && r.clean.tasks[0].steps[0].text.length === 300 && !r.clean.tasks[0].milestone && r.clean.tasks[0].start === "", "the warnings were applied");
  ok(r.warnings.some(w => w.indexOf("quest.extra") >= 0 && w.indexOf("tasks[].mystery") >= 0), "unknown fields are listed once");

  // parseQuestImport takes what an AI really sends
  ok(ai.parseQuestImport("Here you go:\n```json\n" + JSON.stringify(GOOD) + "\n```\nLet me know!").clean !== null, "a code fence and chatter around the JSON are ignored");
  ok(ai.parseQuestImport("{ not json").errors.length === 1 && ai.parseQuestImport("   ").errors.length === 1, "broken JSON and empty text each give one error");

  // Building the Candidate
  const built = ai.buildQuestFromImport(ai.validateQuestImport(JSON.parse(JSON.stringify(GOOD))).clean);
  const bt = built.tasks;
  ok(built.quest.status === "candidate" && built.quest.name === "Paint the spare room", "the quest is a Candidate with its name");
  ok(bt[0].block === 0 && bt[0].due === "" && bt[0].steps.length === 3 && bt[0].steps[0].done === false && bt[0].done === "Walls are sanded", "an undated task is in the Backlog with its steps and Done when");
  ok(bt[1].block === 1 && bt[1].due === "2030-03-10" && bt[1].milestone === true && bt[1].est === 6 && bt[1].notes === "Let it dry.", "a dated task lands in block 1 and keeps its milestone, est, and notes");
  ok(bt[2].launch === true && bt[3].issue === true && bt[3].block === 0, "launch and issue flags carry across, and an undated issue is loose");
  ok(new Set(bt.map(t => t.id).concat(bt.flatMap(t => t.steps.map(s => s.id)))).size === 4 + 3, "every task and step gets its own id");
  ok(bt.every(t => t.questId === built.quest.id && t.added === ""), "tasks belong to the new quest");

  const dec = built.decisions;
  ok(dec.length === 1 && dec[0].q === "Which color?" && dec[0].a === "Light gray" && dec[0].step === bt[0].steps[2].id, "a step's decision is built and linked to that step");
  r = ai.validateQuestImport({ quest: { name: "x" }, tasks: [{ what: "a", steps: [{ text: "s", decided: "yes", other: 1 }, { decision: "no text" }, 5] }] });
  ok(r.errors.length === 2 && r.errors[0].indexOf("Task 1 “a”: step 2 must be a string") === 0 && r.errors[1].indexOf("step 3") >= 0, "a step that is not a string or an object with text is refused (" + r.errors.join("; ") + ")");
  r = ai.validateQuestImport({ quest: { name: "x" }, tasks: [{ what: "a", steps: [{ text: "s", decided: "yes", other: 1 }, "  "] }] });
  ok(!!r.clean && r.clean.tasks[0].steps.length === 1 && r.warnings.some(w => w.indexOf("decided was ignored") >= 0) && r.warnings.some(w => w.indexOf("steps[].other") >= 0), "a decided answer with no decision, a blank step, and unknown step fields are tolerated with warnings");

  // Quest giver organization
  r = ai.validateQuestImport({ quest: { name: "x", client: { org: "  Northwind Paint  ", poc: "Sam" } }, tasks: [{ what: "a" }] });
  ok(!!r.clean && r.clean.quest.org === "Northwind Paint" && r.warnings.some(w => w.indexOf("quest.client.poc") >= 0), "quest.client.org is read, and other client fields are warned about");
  ok(ai.validateQuestImport({ quest: { name: "x", client: "Northwind" }, tasks: [{ what: "a" }] }).errors.length === 1, "a client that is not an object is refused");
  ok(ai.buildQuestFromImport(r.clean).quest.client.org === "Northwind Paint", "the organization lands in the Quest giver");

  // The prompt
  const p = ai.buildAiPrompt("2030-05-06");
  ok(p.indexOf("“What is the quest called?”") >= 0 && p.indexOf("quest.client.org") >= 0, "the prompt asks for the quest name first and explains the organization field");
  ok(p.indexOf("Today is 2030-05-06.") >= 0 && p.indexOf("{{TODAY}}") < 0, "the prompt carries today's date");
  ok(/[–—]/.test(p) === false, "the prompt has no dashes");
  ok(p.indexOf("typical tasks, steps, and decisions") >= 0 && p.indexOf("define my own") >= 0 && p.indexOf("what the job is") < p.indexOf("typical tasks"), "the prompt asks whether to add typical tasks or use the user's own");
  const example = p.slice(p.indexOf("{\n  \"sidequest\""), p.indexOf("\n}\n", p.indexOf("{\n  \"sidequest\"")) + 2);
  let exampleOk = false;
  try { exampleOk = ai.validateQuestImport(JSON.parse(example)).errors.length === 0; } catch (e) { exampleOk = false; }
  ok(exampleOk, "the example in the prompt passes the validator");

  // The Quests page buttons and the dialog
  const appMod = await import("../app/app.js?run=" + counter);
  appMod.go("projects");
  const $ = id => dom.window.document.getElementById(id);
  ok(!!$("copyAiPromptBtn") && !!$("importQuestBtn"), "the Quests page shows Copy AI prompt and Import quest");
  const before = state.quests.length;
  $("importQuestBtn").click();
  const area = dom.window.document.querySelector("#modalBody textarea");
  ok(!!area, "Import quest opens a dialog with a paste box");
  ok(![...dom.window.document.querySelectorAll("#modalBody button")].some(b => b.textContent === "Review"), "there is no Review button");
  area.dispatchEvent(new dom.window.Event("change"));
  ok(dom.window.document.querySelector("#modalBody .errmsg") === null, "an empty box shows no complaint");
  area.value = JSON.stringify({ quest: { name: "Bad" }, tasks: [{ what: "x", due: "nope" }] });
  area.dispatchEvent(new dom.window.Event("paste"));
  await new Promise(res => setTimeout(res, 10));
  ok(dom.window.document.querySelector("#modalBody .errmsg") !== null && state.quests.length === before, "a bad quest shows its problems and imports nothing");
  area.value = JSON.stringify(GOOD);
  area.dispatchEvent(new dom.window.Event("change"));
  const go2 = [...dom.window.document.querySelectorAll("#modalBody button")].find(b => b.textContent === "Import quest");
  area.dispatchEvent(new dom.window.Event("change"));
  ok([...dom.window.document.querySelectorAll("#modalBody button")].find(b => b.textContent === "Import quest") === go2, "a blur with unchanged text leaves the Import button in place");
  ok(!!go2 && state.quests.length === before, "a good quest shows a summary and still imports nothing");
  go2.click();
  const q = state.quests.find(x => x.name === "Paint the spare room");
  ok(state.quests.length === before + 1 && !!q && q.status === "candidate" && state.tasks.filter(t => t.questId === q.id).length === 4, "confirming adds the Candidate and its four tasks");
  ok(state.decisions.some(d => d.q === "Which color?" && d.a === "Light gray"), "confirming adds the decision too");
  ok(dom.window.document.getElementById("overlay").hidden === true, "the dialog closes after the import");

  console.log("\n" + (fails ? "FAIL" : "PASS") + " ai-import.test.js: " + (fails ? fails + " failed" : "all checks passed"));
  process.exit(fails ? 1 : 0);
}
main();
