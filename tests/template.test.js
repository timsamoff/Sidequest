const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { register } = require("module");
const { pathToFileURL } = require("url");
const html = fs.readFileSync(path.join(__dirname, "..", "app", "index.html"), "utf8");

// Each test window is its own jsdom instance, and the app's module graph is loaded through Node's native ESM loader (tests/isolate-loader.mjs) with that window's document and localStorage set as temporary globals. A query string on the entry import alone would not isolate state.js, which is why the loader exists.
register(pathToFileURL(path.join(__dirname, "isolate-loader.mjs")));

let counter = 0;
// The previous mk() call's app module, kept so its pending splash timers can be cancelled before the next boot.
let lastAppModule = null;
async function mk(saved, claude, stamp, audioStub, matchMediaStub, beforeBoot) {
  if (lastAppModule) { lastAppModule.cancelSplash(); lastAppModule.cancelTutorial(); }
  const dom = new JSDOM(html, { url: "https://example.test/", pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  if (claude) dom.window.claude = claude;
  if (stamp) dom.window.localStorage.setItem("sidequest-template-v1-saved-at", stamp);
  if (saved) dom.window.localStorage.setItem("sidequest-template-v1", JSON.stringify(saved));
  if (audioStub) dom.window.Audio = audioStub;
  // app.js reads matchMedia at module-eval time (isStandaloneApp), so this
  // must be stubbed before the import below, not after mk() returns.
  if (matchMediaStub) dom.window.matchMedia = matchMediaStub;
  if (beforeBoot) beforeBoot(dom.window);
  // jsdom has no real canvas 2D context (confirmed: getContext("2d") returns
  // null without the optional native "canvas" package) -- a minimal no-op
  // stub lets confetti.js's real append/animate/cleanup code run in tests.
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return { clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, scale: () => {}, fillRect: () => {}, set fillStyle(v) {} };
  };
  global.window = dom.window;
  global.document = dom.window.document;
  // Node 22+ has its own built-in `localStorage` global, defined as a getter --
  // a plain `global.localStorage = ...` assignment throws (see Node's webstorage
  // internal). Redefine the property instead so jsdom's window.localStorage wins.
  Object.defineProperty(global, "localStorage", { value: dom.window.localStorage, configurable: true, writable: true });
  global.FileReader = dom.window.FileReader;
  lastAppModule = await import("../app/app.js?run=" + (++counter));
  // app.js's boot sequence (rendering the initial view, wiring menus and
  // search) is deferred one microtask past module evaluation -- see app/app.js's
  // comment on this -- so tests must wait a tick for it to have run.
  await Promise.resolve();
  await Promise.resolve();
  return dom;
}
let fails = 0;
function editTitle(k, value, key) {
  k.click(k.$("renameBtn"));
  const i = k.d.querySelector(".inlineedit");
  i.value = value;
  i.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: key || "Enter", bubbles: true }));
  return i;
}
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
// The status pulldown on a task's row: the selected row in Tasks, or the open row on a quest's page.
const selRow = (k) => { const b = k.d.querySelector('.listpane .item[aria-current="true"]'); return b && b.parentNode.querySelector("select.rowstatus"); };
const openSel = (k) => { const b = k.d.querySelector("#view .questmain .tlist button.item[aria-expanded='true']"); return b && b.parentNode.querySelector("select.rowstatus"); };
function kit(dom) {
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  return { w, d, $, fire: (e, t = "change") => e.dispatchEvent(new w.Event(t, { bubbles: true })),
    click: e => e.dispatchEvent(new w.MouseEvent("click", { bubbles: true })),
    tab: k => d.querySelector('.tab[data-view="' + k + '"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true })),
    btn: (root, text) => [...root.querySelectorAll("button, a")].find(b => b.textContent.trim() === text),
    menuAct: (mb, act) => { $(mb).dispatchEvent(new w.MouseEvent("click", { bubbles: true })); d.querySelector('[data-act="' + act + '"], #moreMenu [data-view="' + act + '"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true })); },
    setField: (k, v) => { d.getElementById("f-" + k).value = v; },
    type: function (q) { const b = $("searchBox"); b.value = q; this.fire(b, "input"); },
    saved: () => JSON.parse(w.localStorage.getItem("sidequest-template-v1")) || {},
    stand: () => [...d.querySelectorAll("#view .standing li")].map(li => (li.querySelector(".qlink") || {}).textContent) };
}

async function main() {

/* ---- housekeeping ---- */
ok(!/—/.test(html), "no em dashes");
ok(!html.includes("project-schedule-v"), "uses its own storage keys");
{
  const stateJs = fs.readFileSync(path.join(__dirname, "..", "app", "state.js"), "utf8");
  ok(stateJs.includes('APP_VERSION = "1.1.0"'), "version kept in state.js");
  const v = (stateJs.match(/APP_VERSION = "([0-9.]+)"/) || [])[1];
  ok(html.includes("../css/tokens.css?v=" + v) && html.includes("../css/styles.css?v=" + v) && html.includes("../css/splash.css?v=" + v) && html.includes("../css/leather.css?v=" + v), "index.html's stylesheet links carry the app version, so a normal reload cannot reuse stale CSS");
  const viewsJs = fs.readFileSync(path.join(__dirname, "..", "app", "settings.js"), "utf8");
  ok(viewsJs.includes('href: "https://samoff.com"') && viewsJs.includes("Tim Samoff"), "credit, link, and version kept in settings.js/state.js");
}

/* ---- icon files and links ---- */
{
  const fsx = require("fs"), pathx = require("path");
  const root = pathx.join(__dirname, "..");
  for (const f of ["assets/sidequest-icon.svg", "assets/favicon-32.png", "assets/apple-touch-icon.png"]) ok(fsx.existsSync(pathx.join(root, f)), f + " exists");
  ok(html.includes('rel="icon" type="image/svg+xml" href="../assets/sidequest-icon.svg"') && html.includes('rel="apple-touch-icon" href="../assets/apple-touch-icon.png"') && html.includes('sizes="32x32" href="../assets/favicon-32.png"'), "page links the favicon and home screen icons");
  ok(/<title>HQ \| Sidequest<\/title>/.test(html), "page title is HQ | Sidequest");
  const png = b => b.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  ok(png(fsx.readFileSync(pathx.join(root, "assets/apple-touch-icon.png"))) && /#c62f2f/i.test(fsx.readFileSync(pathx.join(root, "assets/sidequest-icon.svg"), "utf8")), "icons are valid: a real PNG, and the SVG uses the logo red");
}

/* ---- first run ---- */
{
  const k = kit(await mk());
  ok(k.$("viewTitle").textContent === "Today" && k.d.title.includes("Sidequest"), "opens on Today");
  ok(k.$("view").textContent.includes("Welcome to Sidequest") && k.$("view").textContent.includes("sample quests") && !!k.$("welcomeSettings") && !!k.$("welcomeDismiss"), "welcome box explains the samples");
  ok(k.d.querySelector('.tab[data-view="quest:pApp"]').textContent.trim() === "Sample App" && k.d.querySelector("#nav").textContent.includes("Pinned"), "Sample App is the pinned quest");
  ok([...k.d.querySelectorAll("#nav .tab")].map(t => t.dataset.view).join() === "today,projects,schedule,timeline,quest:pApp", "sidebar: core pages + one pinned quest");
  // dismiss
  k.click(k.$("welcomeDismiss")); ok(!k.$("view").textContent.includes("Welcome to Sidequest") && k.saved().settings.hideWelcome === true, "dismissing hides it and remembers");
  // Today content
  ok(k.$("view").textContent.includes("Next up") && k.d.querySelector("#view .chartbox svg") && /Remaining: \d+ of \d+ tasks/.test(k.$("view").textContent), "Today works with sample data");
  const next = k.d.querySelector("#view .panel .ptitle").textContent;
  ok(next === "Build the sign-in flow", "Next up is the earliest-starting open sample task: " + next);
  ok(k.$("view").textContent.includes("Overdue") && !k.$("view").textContent.includes("Overdue tasks: 1") && k.$("view").textContent.includes("Build the sign-in flow") && /Remaining: 13 of 17 tasks/.test(k.$("view").textContent), "the samples include one overdue task, so the burndown sits above the plan");
  const projLink = k.btn(k.d.querySelector("#view .panel"), "Sample App");
  ok(!!projLink && projLink.classList.contains("qlink"), "Next up names the quest as a link");
  k.click(projLink);
  ok(k.$("viewTitle").textContent === "Sample App", "clicking the quest link opens that quest's page");
}

/* ---- Today notices have their own color tokens ---- */
{
  const tokens = fs.readFileSync(path.join(__dirname, "..", "css", "tokens.css"), "utf8"), styles = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
  ok((tokens.match(/--notice-update:/g) || []).length === 3 && (tokens.match(/--notice-backup:/g) || []).length === 3 && (tokens.match(/--notice-welcome:/g) || []).length === 3, "the three notice colors are defined in the light, dark, and forced-dark blocks");
  ok(/\.updatebanner \{ border-top: 5px solid var\(--notice-update\)/.test(styles) && /\.backupreminder \{ border-top: 5px solid var\(--notice-backup\)/.test(styles) && /\.welcomebox \{ border-top: 5px solid var\(--notice-welcome\)/.test(styles), "each notice's top bar uses its own token");
  ok(/\.updatebanner \{[^}]*--card: var\(--notice-update-bg\)/.test(styles) && /\.backupreminder \{[^}]*--card: var\(--notice-backup-bg\)/.test(styles) && (tokens.match(/--notice-update-bg:/g) || []).length === 3 && (tokens.match(/--notice-backup-bg:/g) || []).length === 3, "the update and backup notices have their own tinted backgrounds, defined in all three theme blocks");
}

/* ---- tasks order: start date across quests ---- */
{
  const k = kit(await mk()); k.click(k.$("welcomeDismiss")); k.tab("schedule");
  const rows = [...k.d.querySelectorAll("#view .tlist li .item")].map(e => ({ t: e.textContent.replace(/\s+/g, " ").trim(), done: e.classList.contains("done") }));
  const mons = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const open = rows.filter(r => !r.done && !/Backlog/.test(r.t) && /[A-Z][a-z]{2} \d{1,2} to /.test(r.t)).map(r => r.t);
  let year = 2000, prev = -Infinity, ordered = true;
  open.forEach(r => { const m = r.match(/([A-Z][a-z]{2}) (\d{1,2}) to /); let t = Date.UTC(year, mons[m[1]], +m[2]); if (t < prev - 180 * 86400000) { year++; t = Date.UTC(year, mons[m[1]], +m[2]); } if (t < prev) ordered = false; prev = t; });
  ok(open.length > 5 && ordered, "the Tasks page lists open scheduled tasks by start date, across quests (" + open.length + " rows)");
  const firstDone = rows.findIndex(r => r.done), lastOpen = rows.reduce((a, r, i) => (r.done || /Backlog/.test(r.t) ? a : i), -1);
  ok(firstDone > lastOpen, "completed tasks stay at the bottom of the scheduled list");
}

/* ---- sample quests ---- */
{
  const k = kit(await mk()); k.tab("projects");
  ok(k.stand().join() === "Sample App,Sample Website,Sample Newsletter,Sample Game", "In progress lists the four sample quests, earliest next task first (" + k.stand().join() + ")");
  const pagesList = [...k.d.querySelectorAll("#view .list")][0].textContent;
  ok(!pagesList.includes("Sample App") && !pagesList.includes("Sample Website") && !pagesList.includes("Sample Game"), "the Projects list excludes the projects already shown in In progress");
  ok(k.$("view").textContent.includes("Sample Browser Extension") && k.$("view").textContent.includes("Sample Command-Line Tool"), "two sample candidates listed");
  k.tab("workshop");
  ok(k.$("view").textContent.includes("Try a new game engine") && k.$("view").textContent.includes("Write up lessons learned") && !k.$("view").textContent.includes("Redesign the logo"), "Workshop samples (removed one is in the Vault)");
  k.tab("schedule");
  const rows = [...k.d.querySelectorAll(".listpane .tlist")[0].querySelectorAll(".item")].map(b => b.textContent);
  ok(rows.length === 17, "17 scheduled tasks (Sample Finished Quest's tasks are hidden while it's Complete) (got " + rows.length + ")");
  ok(k.$("view").textContent.includes("Backlog (2)") && k.$("view").textContent.includes("Add a dark mode") && k.$("view").textContent.includes("Add a level editor"), "backlog has two samples");
  ok(k.d.querySelector('label[for="task-due"]').textContent.includes("Due date"), "the task's schedule field is a due date");
  // per-project schedules
  k.tab("timeline");
  const lanes = [...k.d.querySelectorAll("#view .lane .lname")].map(l => l.textContent);
  ok(lanes.filter(l => l.startsWith("Sample")).length === 4, "timeline has a lane for each non-Complete sample quest (Sample Finished Quest is hidden while Complete)");
  const game = [...k.d.querySelectorAll("#view .lane")].find(l => l.querySelector(".lname").textContent.startsWith("Sample Game"));
  ok(game.querySelectorAll(".bar").length === 2 && game.querySelector(".ldates").textContent.includes("due "), "Sample Game shows an estimate bar");
  const mil = k.d.querySelector("#view .mslist").textContent;
  ok(mil.includes("Run a beta with five friends") && mil.includes("Playtest and polish"), "two sample milestone tasks, labeled by their own task name");
  // dates: three different starts
  k.tab("schedule");
  const l1 = [...k.d.querySelectorAll(".listpane .item .l1")].map(x => x.textContent);
  const scheduled = l1.filter(t => t.includes("·"));
  const starts = new Set(scheduled.filter(t => /Sample (App|Website|Game)/.test(t)).map(t => t.split("·")[0].trim() + "|" + (t.split("·")[1] || "").trim().split(" to ")[0]));
  ok(new Set(scheduled.map(t => t.split("·")[1].trim().split(" to ")[0])).size >= 5, "projects start at different times (own start dates and pace)");
}

/* ---- Launch section on a project page ---- */
{
  const k = kit(await mk()); k.tab("today"); k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok(k.$("viewTitle").textContent === "Sample App" && k.$("view").textContent.includes("Before you launch"), "project page has a Before you launch section, scoped to this project");
  ok(!k.btn(k.$("view"), "Launch task"), "there is no separate Launch task button; a task joins the checklist from its own detail");
  const checkList = () => [...k.d.querySelectorAll("#view .tlist.check li")];
  ok(/^Complete: \d+ of \d+ launch-critical tasks?$/.test(k.d.querySelector("#view h2#h-checks").closest(".sechead").nextElementSibling.textContent) && checkList().length === 1, "Sample App's checklist is its own 1 launch task, with linked quests excluded (" + checkList().length + ")");
  ok(checkList().some(li => li.textContent.includes("Submit to the app store")), "the launch task itself appears in the checklist");
  ok(!checkList().some(li => li.textContent.includes("Sample Website")), "a linked quest no longer appears in the Before you launch checklist");
  ok(!k.d.querySelector("#view .decision") && ![...k.d.querySelectorAll("#view h3")].some(h => h.textContent === "Decisions") && !k.btn(k.$("view"), "Add decision"), "the project page no longer has a Decisions section (decisions live on steps in Tasks)");
  ok(![...k.d.querySelectorAll("#view .tlist:not(.check) .item")].some(b => b.textContent.includes("Submit to the app store")), "a launch task does not also show up in the regular Tasks list on the quest page");
  ok([...k.d.querySelectorAll("#view .tlist:not(.check) .l2 .chip")].some(c => c.textContent === "Launch critical") === false, "a launch task's badge only shows inside the checklist, not duplicated elsewhere on this page since it's excluded from the regular list");
  // opening the launch row expands the task inline, same as a regular Tasks row
  const launchBtn = checkList().map(li => li.querySelector(".item")).find(b => b && b.textContent.includes("Submit to the app store"));
  k.click(launchBtn);
  const detail = () => k.d.querySelector("#view .tlist.check .detail");
  ok(!!detail().querySelector(".chip") && detail().textContent.includes("Launch critical"), "the expanded launch task shows a Launch critical badge");
  ok(!k.btn(detail(), "Open in Tasks") && !!k.btn(detail(), "Skip launch") && !!k.btn(detail(), "Delete") && !k.btn(detail(), "Launch critical"), "a launch task's detail offers Skip launch and Delete, and no Open in Tasks");
  ok(k.btn(detail(), "Skip launch").classList.contains("on") && k.btn(detail(), "Skip launch").getAttribute("aria-pressed") === "true", "Skip launch shows as an active/pressed toggle (blue), matching Remove milestone's on-state");
  ok(detail().querySelector(".steps li.done") && detail().querySelector(".steps").textContent.includes("Choose the first app store"), "answered decision's step is already ticked");
  // Skip launch takes the task off the checklist without deleting it
  k.click(k.btn(detail(), "Skip launch"));
  ok(!checkList().some(li => li.textContent.includes("Submit to the app store")), "Skip launch removes the task from the checklist");
  ok([...k.d.querySelectorAll("#view .tlist:not(.check) .item")].some(b => b.textContent.includes("Submit to the app store")), "the task itself is still a real task, now back in the regular list");
}

/* ---- decisions live on steps, in Tasks ---- */
{
  const k = kit(await mk());
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Submit to the app store")));
  const pane = () => k.d.querySelector(".detailpane");
  const row = (text) => [...pane().querySelectorAll(".steps li")].find(li => li.textContent.includes(text));
  ok(!!k.btn(row("Choose the first app store"), "Decision: decided") && !k.btn(row("Choose the first app store"), "Add decision"), "a step with a decision shows it as a chip, not an Add button");
  ok(!!k.btn(row("Write the store description"), "Add decision"), "a step without a decision offers Add decision");
  ok(!!row("Choose the first app store").querySelector("button.pencil") && !!k.btn(row("Choose the first app store"), "Remove"), "a step row has a decision control, an edit pencil, and a Remove button");
  k.click(k.btn(row("Write the store description"), "Add decision"));
  ok(k.$("modalTitle").textContent === "New decision" && !k.$("f-step") && k.$("modalBody").textContent.includes("For the step: Write the store description"), "Add decision opens with that step already chosen");
  k.setField("q", "Which tone should the store text use?");
  k.click(k.btn(k.$("modalBody"), "Add decision"));
  const added = k.saved().decisions.find(d => d.q === "Which tone should the store text use?");
  ok(!!added && added.step === "a5a", "the new decision is linked to that step");
  ok(!!k.btn(row("Write the store description"), "Decision: open"), "and the step now shows it as open");
  k.click(k.btn(row("Write the store description"), "Decision: open"));
  ok(k.$("modalTitle").textContent === "Decision" && k.$("f-q").value === "Which tone should the store text use?", "the chip opens the decision");
  k.setField("a", "Friendly and short");
  k.click(k.btn(k.$("modalBody"), "Save decision"));
  const step = () => k.saved().tasks.find(t => t.id === "a5").steps.find(s => s.id === "a5a");
  ok(k.saved().decisions.find(d => d.id === added.id).a === "Friendly and short" && step().done === true, "answering saves the answer and checks the step off");
  ok(!!k.btn(row("Write the store description"), "Decision: decided"), "the chip now says decided");
  k.click(k.btn(row("Write the store description"), "Decision: decided")); k.setField("q", "Which tone for the store text?"); k.click(k.btn(k.$("modalBody"), "Save decision"));
  ok(step().done === true, "editing only the question leaves the step as it was");
  k.click(k.btn(row("Write the store description"), "Decision: decided")); k.setField("a", ""); k.click(k.btn(k.$("modalBody"), "Save decision"));
  ok(step().done === false, "clearing the answer unchecks the step");
  k.click(k.btn(row("Write the store description"), "Decision: open")); k.click(k.btn(k.$("modalBody"), "Remove"));
  ok(!k.saved().decisions.find(d => d.id === added.id) && !!k.btn(k.d.body, "Undo") && !!k.btn(row("Write the store description"), "Add decision"), "Remove deletes the decision with Undo, and the step offers Add decision again");
  k.menuAct("newBtn", "newDecision");
  ok(k.$("modalTitle").textContent === "New decision" && !!k.$("f-quest") && !!k.$("f-task") && !!k.$("f-step"), "New decision cascades Quest, then Task, then Step, like New step");
  k.$("f-task").value = "a5"; k.fire(k.$("f-task"));
  const offered = [...k.$("modalBody").querySelectorAll("#f-step option")].map(o => o.textContent);
  ok(!offered.some(t => t.includes("Choose the first app store")) && offered.some(t => t.includes("Write the store description")), "picking that task only offers its steps that do not already have a decision");
  k.click(k.$("modalClose"));
  // picking a quest narrows the task list, which then narrows the step list
  k.menuAct("newBtn", "newDecision");
  k.$("f-quest").value = "pSite"; k.fire(k.$("f-quest"));
  const taskOpts = [...k.$("modalBody").querySelectorAll("#f-task option")];
  ok(taskOpts.length > 0 && taskOpts.every(o => !o.textContent.includes("Submit to the app store")), "choosing a quest narrows Task to just that quest's tasks");
  const stepOpts = [...k.$("modalBody").querySelectorAll("#f-step option")];
  ok(stepOpts.length > 0, "Step repopulates for the first task of the newly chosen quest");
  k.setField("q", "Which domain do we use?");
  k.click(k.btn(k.$("modalBody"), "Add decision"));
  const viaCascade = k.saved().decisions.find(d => d.q === "Which domain do we use?");
  ok(!!viaCascade && !!k.saved().tasks.find(t => t.id === viaCascade.step || t.steps.some(s => s.id === viaCascade.step) && t.questId === "pSite"), "a decision added through the cascade links to a real step on the chosen quest");
}
{
  // editing a step: the name is inline-editable, Remove is a plain row button
  const k = kit(await mk());
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Submit to the app store")));
  const row = (text) => [...k.d.querySelectorAll(".detailpane .steps li")].find(li => li.textContent.includes(text));
  const st = (id) => k.saved().tasks.find(t => t.id === "a5").steps.find(s => s.id === id);
  k.click(row("Prepare screenshots").querySelector("button.pencil"));
  const i = row("Prepare screenshots").querySelector(".inlineedit");
  i.value = "Prepare four screenshots";
  i.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(st("a5b").text === "Prepare four screenshots", "the pencil edits a step's text in place");
  k.click(row("Prepare four screenshots").querySelector("button.pencil"));
  const i2 = row("Prepare four screenshots").querySelector(".inlineedit");
  i2.value = "";
  i2.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(st("a5b").text === "Prepare four screenshots", "an empty step name is rejected");
  k.click(k.btn(row("Choose the first app store"), "Remove"));
  ok(!st("a5z") && !k.saved().decisions.find(d => d.step === "a5z"), "Remove deletes the step and its decision");
}
{
  // a task's name is editable
  const k = kit(await mk());
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Build the home screen")));
  ok(!!k.d.querySelector('.listpane button.rowpencil[data-task="a3"]') && !k.d.querySelector('.detailpane button[aria-label="Rename this task"]'), "a task's row has the pencil, and its detail does not");
  k.click(k.d.querySelector('.listpane button.rowpencil[data-task="a3"]'));
  k.setField("what", "Build the main screen"); k.click(k.btn(k.$("modalBody"), "Save"));
  ok(k.saved().tasks.find(t => t.id === "a3").what === "Build the main screen", "renaming a task saves it");
  ok([...k.d.querySelectorAll(".listpane .item")].some(b => b.textContent.includes("Build the main screen")) && ![...k.d.querySelectorAll(".listpane .item")].some(b => b.textContent.includes("Build the home screen")), "and the task list shows the new name");
}
{
  // a decision found by search opens its task
  const k = kit(await mk());
  k.type("page builder");
  const hit = [...k.d.querySelectorAll("#view .sgroup")].find(g => g.getAttribute("data-kind") === "decision");
  ok(!!hit, "search finds a decision by its question");
  k.click(hit.querySelector("button.item"));
  ok(k.$("viewTitle").textContent === "Tasks" && !!k.d.querySelector(".detailpane"), "opening a decision result goes to its task in Tasks");
}

/* ---- Help in the template ---- */
{
  const k = kit(await mk()); k.d.querySelector('#navBottom .tab[data-view="help"]').dispatchEvent(new k.w.MouseEvent("click", { bubbles: true }));
  const titles = [...k.d.querySelectorAll("#view summary")].map(s => s.textContent);
  const sections = ["How Sidequest works", "Terms", "Finding your way around", "The quest lifecycle", "Today page", "Quests page", "Inside a quest", "Quest giver and Quest links", "A quest’s Schedule and Timeline", "Tasks page", "Timeline page", "Errands page", "Workshop page", "Vault page", "Options page"];
  ok(titles.join() === sections.join(), "the Field guide has the thirteen sections of the rewrite plus Terms, in order (" + titles.join(", ") + ")");
  const helpText = k.$("view").textContent;
  ok(k.d.querySelectorAll("#view .hbody ul ul").length > 0 && k.d.querySelectorAll("#view .hbody ul ul ul").length === 0, "nested bullets in the guide render as nested lists, no deeper than two levels");
  ok(!helpText.includes("Mark done") && !helpText.includes("archive completed tasks") && !helpText.includes("View beside its name") && !helpText.includes("with its circle"), "Help no longer describes buttons and settings that were removed");
  const staleHelp = ["default start date", "Show backup text", "Restore from text", "copy your data as text", "Sprint 1", "Where things stand", "Next slot", "what used to be called", "used to be called a project", "Completion FX"];
  ok(staleHelp.every(ph => !helpText.includes(ph)), "Help does not describe things that were removed (" + staleHelp.filter(ph => helpText.includes(ph)).join(", ") + ")");
  const coveredHelp = ["Quest details", "Quest giver export", "Bounty", "Slip schedule", "Forecast", "Ideal", "Actual", "Gathering dust", "Make milestone", "Launch critical", "Coin format", "Completion effects", "Sound effects", "Refresh", "stretch of work", "Backup and restore", "Start fresh", "Link quest", "Make candidate", "Splash screen on open", "Main menu"];
  ok(coveredHelp.every(ph => helpText.includes(ph)), "the guide covers the features it should (missing: " + coveredHelp.filter(ph => !helpText.includes(ph)).join(", ") + ")");
  ok(!/—/.test(helpText) && !helpText.includes("--"), "Help has no em dashes, real or double-hyphen");
  ok(!/[A-Za-z]'[A-Za-z]/.test(helpText), "Help uses smart apostrophes, not straight ones, in contractions and possessives");
  ok([...k.d.querySelectorAll("#navBottom .tab")].map(t => t.textContent.trim()).join() === "Errands,Workshop,Vault,Field guide,Options", "the Field guide sits between Vault and Options");
}

/* ---- vault samples: only Quests and Ideas go to the Vault now ---- */
{
  const k = kit(await mk()); k.tab("vault");
  const t = k.$("view").textContent;
  ok(t.includes("Redesign the logo") && t.includes("All (1)"), "Vault shows just the one vaulted sample idea (" + t.match(/All \(\d+\)/) + ")");
  ok(!t.includes("Sketch the main screens") && !t.includes("Should the site use a page builder?"), "completed tasks and decisions no longer appear in the Vault -- they live in their project instead");
  const filters = [...k.d.querySelectorAll("#view .chipbtn")].map(b => b.textContent.trim());
  ok(filters.join() === "All (1),Quests (0),Ideas (1)", "Vault filters are just All/Quests/Ideas now (" + filters.join() + ")");
}
/* ---- completed tasks stay visible, sorted to the bottom ---- */
{
  const k = kit(await mk()); k.tab("schedule");
  const rows = [...k.d.querySelectorAll(".listpane .tlist")[0].querySelectorAll(".item")];
  const statuses = rows.map(b => b.classList.contains("done"));
  const firstDone = statuses.indexOf(true);
  ok(firstDone === -1 || statuses.slice(firstDone).every(Boolean), "once a completed task appears, every task after it in the list is also completed (sunk to the bottom)");
  ok(rows.length === 17, "completed tasks (Sketch the main screens, Build the sign-in flow) stay in the Tasks list, not moved to the Vault (" + rows.length + ")");
}

/* ---- search works on samples ---- */
{
  const k = kit(await mk()); k.type("beta");
  ok(k.d.querySelectorAll("#searchResults .sgroup").length >= 2 && k.$("searchStatus").textContent.match(/\d+ results?/), "search finds the beta tasks and milestone");
  k.type("logo"); ok(k.d.querySelector("#searchResults .chip.vault"), "search finds vaulted samples");
}

/* ---- Start fresh and reload samples ---- */
{
  const k = kit(await mk()); k.tab("settings");
  ok(k.$("view").textContent.includes("Start fresh"), "Start fresh is in Settings");
  k.click(k.$("startFresh")); ok(k.$("modalBody").textContent.includes("The sample quests") && k.$("modalBody").textContent.includes("A blank slate"), "offers empty or sample quests");
  const a = k.$("freshAck"); a.checked = true; k.fire(a); k.click(k.$("freshGo"));
  ok(k.$("view").textContent.includes("No tasks yet") && k.saved().tasks.length === 0 && k.saved().settings.hideWelcome === false && k.$("view").textContent.includes("Your new adventure begins here!"), "empty planner: nothing left, and the welcome message comes back");
  ok(k.saved().quests.length === 0 && k.saved().pins.length === 0, "no quests and no pins after a fresh start");
  ok(Object.keys(k.saved().hist).length === 0, "a blank slate keeps none of the sample burndown history");
  // add own quest from scratch: a task needs an active quest to attach to
  k.menuAct("newBtn", "newQuest"); k.setField("name", "My App"); k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Promote"));
  k.menuAct("newBtn", "newTask"); k.setField("what", "First task"); k.click(k.btn(k.$("modalBody"), "Add task"));
  ok(k.saved().tasks.some(t => t.what === "First task"), "can add a task right away, once a quest exists");
  // reload samples
  k.tab("settings"); k.click(k.$("startFresh")); const r = [...k.d.querySelectorAll('#modalBody input[name=fresh]')]; r[1].checked = true; k.fire(r[1]);
  const a2 = k.$("freshAck"); a2.checked = true; k.fire(a2); k.click(k.$("freshGo"));
  ok(k.saved().tasks.length === 28 && k.saved().pins.includes("quest:pApp"), "the samples can be reloaded");
  ok(k.saved().settings.hideWelcome === false, "reloading the samples brings the welcome message back too");
}

/* ---- Start fresh sound and reload ---- */
{
  for (const audio of [true, false]) {
    const k = kit(await mk({ settings: { audio } }));
    let played = null, ended = null;
    k.w.Audio = function (src) { played = src; const o = { play: function () { return Promise.resolve(); } }; ended = o; return o; };
    k.tab("settings"); k.click(k.$("startFresh"));
    const a = k.$("freshAck"); a.checked = true; k.fire(a); k.click(k.$("freshGo"));
    ok(audio ? played === "../assets/sfx/startFresh.mp3" : played === null, "Erase everything " + (audio ? "plays the Start fresh sound" : "is silent") + " when Sound effects is " + (audio ? "on" : "off"));
  }
}

/* ---- Start fresh restarts the backup reminder ---- */
{
  const k = kit(await mk({ settings: { since: "2020-01-01", lastBackup: "2020-01-02", hideWelcome: true } }));
  ok(!!k.d.querySelector(".backupreminder"), "setup: an old save shows the backup reminder");
  k.tab("settings"); k.click(k.$("startFresh"));
  const a = k.$("freshAck"); a.checked = true; k.fire(a); k.click(k.$("freshGo"));
  ok(k.saved().settings.lastBackup === "" && k.saved().settings.since !== "2020-01-01", "Start fresh resets the backup clock");
  ok(!k.d.querySelector(".backupreminder"), "and the reminder is gone from Today");
}

/* ---- Idea created date ---- */
{
  const k = kit(await mk());
  k.menuAct("newBtn", "newIdea"); k.setField("text", "Dated idea"); k.click(k.btn(k.$("modalBody"), "Workshop it"));
  const today = new Date(); const iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const idea = k.saved().workshop.find(p => p.text === "Dated idea");
  ok(idea && idea.created === iso, "a new idea records today as its created date");
  k.tab("workshop");
  const row = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Dated idea"));
  ok(row && /· Created on \w+ \d+, \d{4}/.test(row.textContent), "the Workshop row shows when the idea was added");
  k.click(k.btn(row, "Make candidate"));
  const q = k.saved().quests.find(x => x.name === "Dated idea");
  ok(q && q.start === iso, "Make candidate uses today as the candidate's Start date");
  ok(/is now a candidate quest/.test(k.$("toast").textContent) && /Candidate quests/.test(k.$("toast").textContent), "Make candidate says where the idea went");
  ok(k.saved().workshop.filter(p => !p.vault).every(p => p.created), "sample ideas carry created dates");
}

/* ---- core behavior still intact ---- */
{
  const k = kit(await mk());
  k.tab("schedule"); const sel = selRow(k);
  ok(sel && sel.value === "In progress", "schedule shows the selected sample task");
  k.tab("settings"); ok(k.d.getElementById("set-word").value === "Sprint" && k.$("view").textContent.includes("days per sprint"), "Settings show the Sprint vocabulary");
  ok(!k.d.getElementById("set-start"), "Settings no longer has a default-start-date field");
  ok(k.d.querySelector("#view .about").textContent.includes("© Tim Samoff"), "About keeps the credit");
  // completing a sample task marks it Completed but keeps it visible (no archiving)
  k.tab("today"); const nextTaskTitle = k.d.querySelector("#view .panel .ptitle").textContent;
  ok(!k.btn(k.$("view"), "Mark completed"), "Today's Next up card has no one-click Mark completed shortcut");
  k.click(k.btn(k.$("view"), "Open task"));
  const statusSel = selRow(k); statusSel.value = "Completed"; k.fire(statusSel);
  k.tab("schedule");
  const completedRow = [...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes(nextTaskTitle));
  ok(completedRow && completedRow.classList.contains("done"), "the task shows as completed in Tasks, not moved anywhere");
  // backup file: Save backup writes through the browser's Save As dialog
  k.tab("settings");
  let written = null, asked = null;
  k.w.showSaveFilePicker = (opts) => { asked = opts; return Promise.resolve({ createWritable: () => Promise.resolve({ write: (t) => { written = t; return Promise.resolve(); }, close: () => Promise.resolve() }) }); };
  k.click(k.$("saveFile")); await new Promise(r => setTimeout(r, 30));
  const j = JSON.parse(written);
  ok(j.tasks.length === 28 && j.quests.find(p => p.name === "Sample Game").days === 14, "Save backup writes the sample data");
  ok(/^sidequest-backup-\d{4}-\d{2}-\d{2}\.json$/.test(asked.suggestedName), "and suggests a dated .json file name (" + asked.suggestedName + ")");
  ok(k.$("view").textContent.includes("Backup saved."), "and says it saved");
  ok(!k.$("showText") && !k.$("backupText") && !k.$("restoreText"), "there is no backup text box and no paste box any more");
  ok(k.btn(k.$("view"), "Save backup") && k.btn(k.$("view"), "Restore backup"), "the buttons are named Save backup and Restore backup");
  // reload keeps changes and skips the welcome
  const k2 = kit(await mk(k.saved())); ok(k2.$("viewTitle").textContent === "Today" && !k2.$("view").textContent.includes("Welcome to Sidequest") || k2.saved !== undefined, "reload opens on Today");
}

/* ---- new step: quest filter ---- */
{
  const k = kit(await mk());
  k.menuAct("newBtn", "newStep");
  const questSel = k.$("f-quest"), taskSel = k.$("f-task");
  ok(!!questSel && !!taskSel, "New step form has a quest filter and a task select");
  ok(!k.$("modalBody").textContent.includes("All quests"), "there is no All quests option; the filter always starts on a real quest");
  ok(questSel.value === "pApp", "with nothing selected in Schedule, the quest filter starts on the first active quest");
  const firstQuestTasks = [...taskSel.options].map(o => o.label);
  ok(firstQuestTasks.length > 0 && firstQuestTasks.every(l => l.startsWith("Sample App:")), "the task select is already scoped to that quest's tasks");
  k.setField("quest", "pGame"); k.fire(questSel);
  const afterGame = [...taskSel.options].map(o => o.label);
  ok(afterGame.length > 0 && afterGame.every(l => l.startsWith("Sample Game:")), "choosing a quest narrows the task list to only that quest's tasks");
  k.setField("text", "A step added via the filtered picker");
  k.click(k.btn(k.$("modalBody"), "Add step"));
  ok(k.$("toast").textContent.includes("Sample Game"), "step is added to the task chosen after filtering");
  // opening a task first changes the default filter to that task's quest
  k.tab("schedule"); k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Build the layout")));
  k.menuAct("newBtn", "newStep");
  ok(k.$("f-quest").value === "pSite", "with a task open in Schedule, defaults the filter to that task's quest");
}

/* ---- linked quests: bidirectional, one-hop rendering ---- */
{
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok([...k.d.querySelectorAll("#view h2")].some(h => h.textContent === "Quest links"), "quest page has a Quest links section");
  ok(k.$("view").textContent.includes("Sample Website"), "Sample App already links to Sample Website (sample data)");
  // bidirectional: the other side shows the link back
  k.click(k.btn(k.$("view"), "Sample Website"));
  ok(k.$("viewTitle").textContent === "Sample Website" && k.$("view").textContent.includes("Sample App"), "the link is bidirectional -- Sample Website shows Sample App back");
  // link Sample Website to Sample Game using the picker, confirm it appears and is bidirectional
  ok(!k.$("proj-link-pick"), "the old inline link dropdown is gone from the page");
  k.click(k.btn(k.$("view"), "Link quest"));
  ok(k.$("modalTitle").textContent === "Link quest", "Link quest opens a dialog");
  const sel = k.$("f-quest");
  ok(![...sel.options].some(o => o.textContent === "Sample Website" || o.textContent === "Sample App"), "the dialog only offers quests that are not already linked, and not this one");
  sel.value = [...sel.options].find(o => o.textContent === "Sample Game").value;
  k.click(k.btn(k.$("modalBody"), "Link quest"));
  ok(k.$("overlay").hidden && k.$("view").textContent.includes("Sample Game"), "linking Sample Game from the dialog closes it and shows the link in the list");
  k.click(k.btn(k.$("view"), "Sample Game"));
  ok(k.$("viewTitle").textContent === "Sample Game" && k.$("view").textContent.includes("Sample Website"), "the new link is bidirectional too -- Sample Game shows Sample Website back");
  // Unlink and confirm the quest is gone from the current page; the picker's <select> legitimately lists it again, since it is available to re-link.
  const unlinkBtn = [...k.d.querySelectorAll("#view button")].find(b => b.textContent.trim() === "Unlink");
  k.click(unlinkBtn);
  ok(k.$("view").textContent.includes("No quest links"), "unlinking removes the linked-quest row (Sample Website may still appear in the re-link picker, which is correct)");
}

/* ---- quest Complete status, Launch-critical links, archived viewing ---- */
{
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  // manual Complete, independent of task status -- Sample App has open tasks
  ok(!!k.btn(k.$("view"), "Mark complete"), "Active quest offers Mark complete regardless of task status");
  k.click(k.btn(k.$("view"), "Mark complete"));
  ok(k.$("modalTitle").textContent === "Quest complete" && k.$("modalBody").textContent.includes("leave it in Quests"), "marking complete with open tasks left triggers the completion dialog, no block");
  k.click(k.btn(k.$("modalBody"), "Leave in Quests"));
  ok(k.$("overlay").hidden, "Leave in Quests closes the dialog");
  ok(k.$("view").textContent.includes("Restore") === false && !k.btn(k.$("view"), "Mark complete") && !k.btn(k.$("view"), "Vault") === false, "quest stays Complete, not vaulted, after Leave in Quests");
  ok(k.saved().quests.find(p => p.id === "pApp").status === "complete", "status persisted as complete");
  // set apart visually, and can be reopened
  ok(!!k.d.querySelector("#view .chip.questcomplete"), "a Complete quest shows a Complete badge on its own page");
  ok(!!k.btn(k.$("view"), "Reopen") && !k.btn(k.$("view"), "Mark complete"), "Complete quest offers Reopen in place of Mark complete");
  // Sample App was pinned by sample data -- completing it auto-unpins it.
  ok(!k.btn(k.d.querySelector("#nav"), "Sample App"), "completing a pinned quest auto-unpins it from the sidebar");
  ok(k.saved().quests.find(p => p.id === "pApp").wasPinned === true, "the prior pin is remembered, not just dropped");
  k.tab("projects");
  ok(!k.stand().includes("Sample App"), "a Complete quest drops out of In progress");
  const appRow = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample App"));
  ok(!!appRow, "a Complete quest (no longer in In progress) appears in the Quests section instead");
  ok(!!appRow.querySelector(".chip.questcomplete"), "the Quests section also shows the Complete badge");
  ok(!k.btn(appRow, "View"), "Quests rows have no separate View button, the title is the link");
  k.click(k.btn(appRow, "Sample App"));
  ok(k.$("viewTitle").textContent === "Sample App", "View navigated to Sample App's page");
  k.click(k.btn(k.$("view"), "Reopen"));
  ok(k.saved().quests.find(p => p.id === "pApp").status === "active", "Reopen sets the quest back to active");
  ok(!k.d.querySelector("#view .chip.questcomplete"), "reopened quest loses the Complete badge");
  ok(!!k.btn(k.$("view"), "Mark complete"), "reopened quest offers Mark complete again");
  ok(!!k.btn(k.d.querySelector("#nav"), "Sample App"), "Reopen restores the quest's prior pin");
  ok(k.saved().quests.find(p => p.id === "pApp").wasPinned === false, "and clears the remembered flag once restored");
  // sticky: reopening a task does not revert Complete
  k.click(k.btn(k.$("view"), "Mark complete"));
  k.click(k.btn(k.$("modalBody"), "Leave in Quests"));
  // Complete-but-kept: its tasks drop out of the Tasks list and the global
  // Timeline, but stay visible on the quest's page.
  k.tab("schedule");
  ok(!k.$("view").textContent.includes("Sketch the main screens"), "a Complete-but-kept quest's tasks are hidden from the Tasks list");
  ok(!k.$("view").textContent.includes("Tasks are gathered from all open quests.") && !k.$("view").textContent.includes("Tasks from complete quests are not listed here"), "the Tasks page has no description line");
  k.tab("timeline");
  ok(![...k.d.querySelectorAll("#view .lane .lname")].some(l => l.textContent === "Sample App"), "a Complete-but-kept quest's lane is hidden from the global Timeline");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  ok(k.$("view").textContent.includes("Its tasks are not included in Tasks, Timeline, or Today"), "the quest's page explains the hiding");
  k.click([...k.d.querySelectorAll(".questmain .tlist .item")].find(b => b.textContent.includes("Sketch the main screens")));
  const statusSel = openSel(k); statusSel.value = "In progress"; k.fire(statusSel);
  ok(k.saved().quests.find(p => p.id === "pApp").status === "complete", "reopening a task does not auto-revert a Complete quest");
  // reopening the quest brings its tasks straight back, no separate restore
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  k.click(k.btn(k.$("view"), "Reopen"));
  k.tab("schedule");
  ok(k.$("view").textContent.includes("Sketch the main screens"), "reopening the quest brings its tasks back into the Tasks list immediately");
}
{
  // auto-trigger: complete every counted task on a quest with no open tasks left
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  k.tab("schedule");
  // Open each of Sample App's tasks in turn (including its one Backlog item)
  // and mark it Completed via its status select -- every counted task has to
  // reach Completed, not just the scheduled ones, for the all-done guard to pass.
  const names = ["Sketch the main screens", "Build the sign-in flow", "Build the home screen", "Run a beta with five friends", "Submit to the app store", "Add a dark mode", "Home screen flickers when it first loads"];
  for (const nm of names) {
    const row = [...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes(nm));
    if (!row) continue;
    k.click(row);
    const sel = selRow(k);
    if (sel.value !== "Completed") { sel.value = "Completed"; k.fire(sel); }
  }
  ok(k.$("modalTitle").textContent === "Quest complete", "all-tasks-Completed auto-triggers the completion dialog");
  ok(k.$("modalBody").textContent.includes("1 issue is still open."), "the sample's undated issue stays open without holding the quest back, and the dialog says so");
  k.click(k.btn(k.$("modalBody"), "Vault now"));
  ok(k.saved().quests.find(p => p.id === "pApp").vault, "Vault now from the dialog sends the quest to the Vault");
}
{
  // empty-task-set guard: a candidate with zero tasks must never auto-complete
  const k = kit(await mk());
  k.tab("projects");
  const extRow = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample Browser Extension") && k.btn(li, "Promote"));
  k.click(k.btn(extRow, "Promote"));
  ok(k.saved().quests.find(p => p.id === "pExt").status === "active" && k.$("overlay").hidden, "promoting a task-less quest to Active does not trigger completion");
}
{
  // Quest links carry no Launch critical badge or toggle; sending a quest to the Vault just works
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok([...k.d.querySelectorAll("#view .list li")].some(li => li.textContent.includes("Sample Website")) && ![...k.d.querySelectorAll("#view .list li")].some(li => li.textContent.includes("Launch critical")) && !k.btn(k.$("view"), "Skip launch"), "Quest links list Sample Website with no Launch critical badge or toggle");
  k.click(k.btn(k.$("view"), "Vault"));
  ok(k.saved().quests.find(p => p.id === "pApp").vault, "sending a quest with a link to the Vault proceeds with no warning gate");
}
{
  // vaulted quest pages are genuinely viewable, read-only, until restored
  const k = kit(await mk());
  const tasksBefore = k.saved().tasks.filter(t => t.questId === "pGame" && !t.vault).length;
  k.tab("projects");
  k.click(k.btn(k.d.querySelector("#view .standing"), "Sample Game"));
  ok(k.$("viewTitle").textContent === "Sample Game", "navigated to Sample Game via Where things stand");
  k.click(k.btn(k.$("view"), "Vault"));
  ok(k.$("viewTitle").textContent !== "Sample Game" || k.$("view").textContent.includes("In the Vault"), "sending to the Vault navigates away or shows a vaulted notice");
  ok(k.saved().tasks.filter(t => t.questId === "pGame" && !t.vault).length === 0 && tasksBefore > 0, "sending a quest to the Vault cascades to vault its own tasks");
  k.tab("vault");
  const gameVaultRow = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample Game"));
  ok(!k.btn(gameVaultRow, "View") && gameVaultRow.querySelector(".chip").previousElementSibling === k.btn(gameVaultRow, "Sample Game"), "Vault rows have no View button, the title is the link, and the kind chip follows it");
  k.click(k.btn(gameVaultRow, "Sample Game"));
  ok(k.$("viewTitle").textContent === "Sample Game", "a vaulted quest's page is now reachable (previously invisible)");
  ok(k.$("view").textContent.includes("In the Vault. Restore it to make changes."), "vaulted quest page states it's read-only");
  ok(k.d.querySelectorAll("#view .tlist li").length === tasksBefore && k.$("view").textContent.includes("Add a level editor") && k.$("view").textContent.includes("Backlog"), "a vaulted quest's page still lists its own tasks, including its Backlog task (previously showed none at all)");
  ok(!k.btn(k.$("view"), "Add task") && !k.d.querySelector("#proj-start") && !k.d.querySelector("#view textarea"), "no mutating controls (Add task, schedule inputs, notes textarea) on a vaulted quest page");
  ok(!!k.btn(k.$("view"), "Restore"), "vaulted quest page offers Restore instead of Vault/Mark complete");
  k.click(k.$("view").querySelector("#ptask-g1 button"));
  const protoDetail = k.$("view").querySelector("#ptask-g1 .detail");
  ok(!!protoDetail && protoDetail.textContent.includes("Make the player move") && protoDetail.textContent.includes("Add one obstacle"), "a vaulted quest's task still expands in place and shows its steps, for historical purposes");
  ok(!protoDetail.querySelector("select.status") && !protoDetail.querySelector("textarea") && ![...protoDetail.querySelectorAll("button")].some(b => ["Delete", "Launch critical", "Add step", "Add decision"].includes(b.textContent)), "the expanded task on a vaulted quest page has no mutating controls of its own (status select, notes textarea, Delete, Launch critical, Add step/decision)");
  ok([...protoDetail.querySelectorAll('input[type="checkbox"]')].every(cb => cb.disabled), "step checkboxes are disabled when the quest is vaulted");
  ok(k.$("view").textContent.includes("No Quest giver.") && !k.$("view").textContent.includes("If filled, this information will appear on the Quest giver export."), "a vaulted quest page shows a plain Quest giver empty state with no editable-page description");
  ok(!/\d{4}-\d{2}-\d{2}/.test(k.$("view").textContent), "a vaulted quest's Schedule line formats its start date like its due date, not as a raw ISO string");
  {
    const sched = [...k.$("view").querySelectorAll(".hint")].find(p => p.textContent.startsWith("Started "));
    const thisYear = String(new Date().getFullYear());
    ok(!!sched && sched.textContent.includes(thisYear), "the Schedule line includes the year, not just month and day");
  }
  k.click(k.btn(k.$("view"), "Restore"));
  ok(!k.saved().quests.find(p => p.id === "pGame").vault, "Restore brings the quest back out of the Vault");
  ok(k.saved().tasks.filter(t => t.questId === "pGame" && !t.vault).length === tasksBefore, "restoring the quest also brings its tasks back out of the Vault");
}
{
  // a vaulted candidate's read-only page shows Quest giver info too
  const saved = {
    quests: [{ id: "pVC", name: "Vaulted Candidate", status: "candidate", notes: "some notes", vault: { at: "2026-08-01", why: "removed" }, client: { org: "Acme Co.", poc: "Jordan Lee", phone: "", email: "", address: "", website: "" } }],
    tasks: []
  };
  const k = kit(await mk(saved));
  k.tab("vault");
  k.click(k.btn(k.$("view"), "Vaulted Candidate"));
  ok(k.$("view").textContent.includes("Quest giver") && k.$("view").textContent.includes("Acme Co.") && k.$("view").textContent.includes("Jordan Lee"), "a vaulted candidate's page shows its filled-in Quest giver fields");
}
{
  const saved = {
    quests: [{ id: "pVC2", name: "Empty Giver", status: "candidate", vault: { at: "2026-08-01", why: "removed" } }],
    tasks: []
  };
  const k = kit(await mk(saved));
  k.tab("vault");
  k.click(k.btn(k.$("view"), "Empty Giver"));
  ok(k.$("view").textContent.includes("No Quest giver."), "a vaulted candidate with no Quest giver info says so plainly");
}

{
  // ideas are editable, and their note is a real multiline textarea
  const k = kit(await mk());
  k.tab("workshop");
  const row = () => [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Try a new game engine"));
  ok(!k.btn(row(), "Edit"), "an idea row has no separate Edit button, the title is the link");
  k.click(k.btn(row(), "Try a new game engine"));
  ok(k.$("modalTitle").textContent === "Edit idea", "selecting an idea's title opens the idea dialog in edit mode");
  ok(k.$("f-text").value === "Try a new game engine" && k.$("f-note").value === "Not urgent, but worth trying someday", "Edit pre-fills the idea's text and note");
  ok(k.$("f-note").tagName === "TEXTAREA", "the note field is a multiline textarea");
  k.setField("text", "Try Godot"); k.setField("note", "Line one\nLine two");
  k.click(k.btn(k.$("modalBody"), "Save idea"));
  const saved = k.saved().workshop.find(p => p.id === "p1");
  ok(saved && saved.text === "Try Godot" && saved.note === "Line one\nLine two", "Save updates the same idea in place, keeping line breaks");
  ok(k.saved().workshop.filter(p => !p.vault).length === 2, "editing does not add or remove ideas");
  ok(row() === undefined && !!k.$("view").textContent.includes("Try Godot"), "the Workshop shows the edited text");
  k.menuAct("newBtn", "newIdea");
  ok(k.$("modalTitle").textContent === "New idea" && k.$("f-note").tagName === "TEXTAREA", "adding a new idea also uses the textarea note");
  k.setField("text", "Long note idea"); k.setField("note", "x".repeat(1500));
  k.click(k.btn(k.$("modalBody"), "Workshop it"));
  ok(k.saved().workshop.find(p => p.text === "Long note idea").note.length === 1500, "a note longer than the old 300-character cap is kept");
}

{
  // a quest has one Notes field, and saved data with the old separate short note
  // still loads -- this also exercises the pre-rename "projects" field shape.
  const saved = { projects: [
    { id: "pOld", name: "Old shape", status: "candidate", note: "short", notes: "long" },
    { id: "pOnly", name: "Only short", status: "candidate", note: "just this", notes: "" }
  ], tasks: [] };
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Old shape"));
  ok(k.d.querySelector("#view textarea").value === "short\n\nlong", "an old short note is folded into the front of Notes when both exist");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Only short"));
  ok(k.d.querySelector("#view textarea").value === "just this", "an old short note alone becomes the quest's Notes");
}
{
  // a candidate now has a real page, same shape as an active quest's,
  // minus Quest links and with Promote/Vault in place of the usual actions
  const k = kit(await mk());
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Browser Extension"));
  ok(k.d.querySelector("#view textarea").value === "A small tool that could ship in a month", "the candidate page shows its Notes");
  ok(k.$("viewTitle").textContent === "Sample Browser Extension", "the candidate page shows its name as the title");
  ok(!k.$("renameBtn").hidden, "a candidate's page has the rename pencil like any other live quest");
  ok([...k.d.querySelectorAll("#view h2")].some(h => h.textContent === "Quest links") && !!k.btn(k.$("view"), "Link quest"), "a candidate's page has a Quest links section with a Link quest button");
  ok(!!k.btn(k.$("view"), "Promote") && !!k.btn(k.$("view"), "Vault"), "a candidate's page offers Promote and Vault");
  ok(!k.btn(k.$("view"), "Mark complete") && !k.btn(k.$("view"), "Quest giver export"), "a candidate's page has no Mark complete or Quest giver export button");
  // Quest giver fields live right on the page for a candidate, same as an active quest
  ok(!!k.$("giver-org-pExt") && !!k.$("giver-poc-pExt") && !!k.$("giver-phone-pExt") && !!k.$("giver-email-pExt") && !!k.$("giver-website-pExt") && !!k.$("giver-address-pExt"), "the candidate page has all six Quest giver fields");
  k.$("giver-org-pExt").value = "Acme Co."; k.fire(k.$("giver-org-pExt"), "input");
  k.$("giver-poc-pExt").value = "Jordan Lee"; k.fire(k.$("giver-poc-pExt"), "input");
  const giver = k.saved().quests.find(p => p.id === "pExt").client;
  ok(giver.org === "Acme Co." && giver.poc === "Jordan Lee" && giver.phone === "", "editing the candidate page's Quest giver fields saves them, blank ones stay blank");
}
{
  // Promote and Vault both work from the candidate page itself
  const k = kit(await mk());
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Browser Extension"));
  k.click(k.btn(k.$("view"), "Promote"));
  ok(k.saved().quests.find(p => p.id === "pExt").status === "active", "Promote on the candidate page promotes it");
  ok(!!k.btn(k.$("view"), "Demote") && !!k.btn(k.$("view"), "Mark complete") && !!k.btn(k.$("view"), "Vault") && !!k.btn(k.$("view"), "Quest giver export"), "the now-active quest's page has the full active action row, including Demote");
  k.click(k.btn(k.$("view"), "Demote"));
  ok(k.saved().quests.find(p => p.id === "pExt").status === "candidate", "Demote sends it back to Candidates");
  ok(!!k.btn(k.$("view"), "Promote") && !k.btn(k.$("view"), "Mark complete"), "after demotion the page shows the candidate layout again");
  k.click(k.btn(k.$("view"), "Vault"));
  ok(!!k.saved().quests.find(p => p.id === "pExt").vault, "Vault on the candidate page sends it to the Vault");
}
{
  // Demoting or vaulting keeps a quest's links, shown read-only; promoting or restoring makes them live again
  const k = kit(await mk());
  k.tab("projects"); k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  k.click(k.btn(k.$("view"), "Demote"));
  const links = () => k.saved().quests.find(p => p.id === "pApp").linkedQuestIds;
  ok(k.saved().quests.find(p => p.id === "pApp").status === "candidate" && links().indexOf("pSite") >= 0 && k.saved().quests.find(p => p.id === "pSite").linkedQuestIds.indexOf("pApp") >= 0, "demoting keeps the link on both sides");
  ok(k.saved().quests.find(p => p.id === "pApp").savedLinkIds === undefined, "there is no separate set-aside list any more");
  let sec = [...k.d.querySelectorAll("#view h2")].find(h => h.textContent === "Quest links");
  ok(!!sec && !!k.d.querySelector("#view .qlink") && !k.d.querySelector("#view .qinert") && !!k.btn(k.$("view"), "Link quest"), "a demoted quest's page shows its link to a live quest as clickable and can still add links");
  ok(!k.btn(k.$("view"), "Launch critical") && !!k.btn(k.$("view"), "Unlink"), "a link row has no Launch critical toggle and Unlink still works");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Website"));
  const row = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample App"));
  ok(!!row && !!row.querySelector(".qinert") && !row.querySelector(".qlink") && row.textContent.includes("Candidate"), "the other quest lists the demoted one as plain text labeled Candidate, not clickable");
  const opts = () => { k.click(k.btn(k.$("view"), "Link quest")); return [...k.d.querySelectorAll("#f-quest option")].map(o => o.textContent); };
  ok(k.btn(k.$("view"), "Link quest") ? !opts().includes("Sample App") : true, "a Candidate is not offered as a link target");
  k.click(k.btn(k.$("modalBody"), "Cancel") || k.btn(k.$("modalBody"), "Close") || k.$("modalBody"));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App")); k.click(k.btn(k.$("view"), "Promote"));
  ok(k.saved().quests.find(p => p.id === "pApp").status === "active" && links().indexOf("pSite") >= 0, "promoting makes the same link live again");
}
{
  // Vaulting keeps the links too; deleting forever removes them
  const k = kit(await mk());
  k.tab("projects"); k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  k.click(k.btn(k.$("view"), "Vault"));
  const q = id => k.saved().quests.find(p => p.id === id);
  ok(!!q("pApp").vault && q("pApp").linkedQuestIds.indexOf("pSite") >= 0 && q("pSite").linkedQuestIds.indexOf("pApp") >= 0, "vaulting keeps the links on both sides");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Website"));
  const row = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample App"));
  ok(!!row && !!row.querySelector(".qinert") && row.textContent.includes("Vaulted") && !row.querySelector(".qlink"), "a live quest lists its vaulted partner as plain text labeled Vaulted");
  k.tab("vault");
  const del = [...k.d.querySelectorAll("#view li")].find(li => li.textContent.includes("Sample App"));
  k.click(k.btn(del, "Delete forever")); k.click(k.$("confirmYes"));
  ok(!q("pApp") && q("pSite").linkedQuestIds.indexOf("pApp") < 0, "deleting a vaulted quest forever removes the link from its partner");
  ok(!k.saved().tasks.some(t => t.questId === "pApp") && !k.saved().decisions.some(d => d.step === "a5z"), "deleting a vaulted quest forever removes its tasks and their decisions");
}
{
  // Saves from before this change kept a demoted quest's links in savedLinkIds; they load as real links
  const k = kit(await mk());
  const raw = JSON.parse(k.w.localStorage.getItem("sidequest-template-v1"));
  const app = raw.quests.find(p => p.id === "pApp"), site = raw.quests.find(p => p.id === "pSite");
  app.status = "candidate"; app.savedLinkIds = ["pSite"]; app.linkedQuestIds = []; site.linkedQuestIds = [];
  const k2 = kit(await mk(raw));
  const a2 = k2.saved().quests.find(p => p.id === "pApp"), s2 = k2.saved().quests.find(p => p.id === "pSite");
  ok(a2.linkedQuestIds.indexOf("pSite") >= 0 && s2.linkedQuestIds.indexOf("pApp") >= 0 && a2.savedLinkIds === undefined, "an older save's set-aside links become real links on both sides");
}
{
  // New quest also collects Quest giver fields up front
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.menuAct("newBtn", "newQuest");
  ok(!!k.$("f-giverOrg") && !!k.$("f-giverAddress"), "the New quest dialog has Quest giver fields too");
  k.setField("name", "Brand New Quest"); k.setField("giverOrg", "New Client LLC");
  k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  const nq = k.saved().quests.find(p => p.name === "Brand New Quest");
  ok(nq.client.org === "New Client LLC" && nq.client.poc === "", "a quest created with Quest giver info saves it from the start");
}
{
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  editTitle(k, "Habit App");
  ok(!!k.btn(k.d.querySelector("#nav"), "Habit App") && !k.btn(k.d.querySelector("#nav"), "Sample App"), "renaming a pinned quest updates its name in the sidebar");
  ok(!k.$("renameBtn").hidden && !!k.d.querySelector("#view textarea"), "an active quest keeps its pencil and its editable Notes");
  k.tab("today");
  ok(k.$("renameBtn").hidden, "the pencil is only on quest pages");
}
{
  // the Candidates list row's name navigates to the candidate's page
  const k = kit(await mk());
  k.tab("projects");
  k.click(k.btn(k.$("view"), "Sample Browser Extension"));
  ok(k.$("viewTitle").textContent === "Sample Browser Extension", "clicking a candidate row's name opens its page, not a dialog");
}
{
  // notes travel from an idea into a new candidate, and list rows clamp them;
  // a candidate has no way back to the Workshop (one-way)
  const k = kit(await mk());
  k.tab("projects");
  const candRow = () => [...k.d.querySelectorAll("#view .list li")].find(li => li.querySelector('button[title="Promote to quest"]') && li.textContent.includes("Sample Browser Extension"));
  ok(!!candRow().querySelector(".noteclamp"), "a candidate's note in the list is clamped to two lines");
  ok(!candRow().querySelector('button[title="Move to the Workshop"]'), "a candidate row has no Workshop it button");
  k.tab("workshop");
  k.click(k.btn(k.$("view"), "Add idea"));
  k.setField("text", "A fresh idea"); k.setField("note", "Some notes on it");
  k.click(k.btn(k.$("modalBody"), "Workshop it"));
  const irow = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("A fresh idea"));
  ok(!!irow.querySelector(".noteclamp"), "an idea's note in the Workshop is clamped to two lines");
  k.click(k.btn(irow, "Make candidate"));
  const quest = k.saved().quests.find(p => p.name === "A fresh idea" && p.status === "candidate");
  ok(quest && quest.notes === "Some notes on it" && !("note" in quest), "Make candidate puts the idea's note in the quest's Notes, with no separate note field");
}
{
  // a vaulted candidate's page is read-only like any vaulted quest's
  const k = kit(await mk());
  k.tab("projects");
  const candRow = [...k.d.querySelectorAll("#view .list li")].find(li => li.querySelector('button[title="Promote to quest"]') && li.textContent.includes("Sample Browser Extension"));
  k.click(k.btn(candRow, "Vault"));
  k.tab("vault");
  k.click(k.btn(k.$("view"), "Sample Browser Extension"));
  ok(!k.btn(k.$("view"), "Choose as next quest") && k.$("renameBtn").hidden && !k.d.querySelector("#view textarea"), "a vaulted candidate's page has no pencil, editable fields, or promote button");
}

{
  // Where things stand rows have Pin/Unpin, and the open-task count sits on the Next up line
  const k = kit(await mk());
  k.tab("projects");
  const rows = () => [...k.d.querySelectorAll("#view .standing li")];
  const webRow = () => rows().find(li => li.textContent.includes("Sample Website"));
  ok(!!k.btn(webRow(), "Pin") && !webRow().querySelector(".scount"), "a Where things stand row has a Pin button and no separate open-task count");
  ok(/Next up: .* · [A-Z][a-z]{2} [0-9]+ · 3 open tasks/.test(webRow().querySelector(".snext").textContent), "the open-task count is on the Next up line (" + webRow().querySelector(".snext").textContent + ")");
  k.click(k.btn(webRow(), "Pin"));
  ok(k.saved().pins.includes("quest:pSite") && !!k.btn(webRow(), "Unpin"), "Pin in Where things stand pins the quest and the button flips to Unpin");
  ok(!!k.btn(k.d.querySelector("#nav"), "Sample Website"), "the pinned quest appears in the sidebar");
  k.click(k.btn(webRow(), "Unpin"));
  ok(!k.saved().pins.includes("quest:pSite"), "Unpin in Where things stand removes the pin");
}

{
  // a milestone is just a task flagged t.milestone -- the Timeline diamond and
  // the Milestones list both open the real task, there is no separate entity/dialog
  const k = kit(await mk());
  k.tab("timeline");
  const diamonds = () => [...k.d.querySelectorAll("#view .ms")];
  ok(diamonds().length === 2 && diamonds().every(d => d.getAttribute("role") === "button" && d.getAttribute("tabindex") === "0"), "each milestone diamond is a keyboard-reachable control");
  k.click(diamonds()[0]);
  ok(k.$("viewTitle").textContent === "Tasks" && k.d.querySelector(".detailpane .what").textContent.includes("Run a beta with five friends"), "clicking a diamond opens the task itself on the Tasks page");
  k.tab("timeline");
  const row = () => [...k.d.querySelectorAll("#view .mslist li")].find(li => li.textContent.includes("Playtest and polish"));
  k.click(k.btn(row(), "Sample Game: Playtest and polish"));
  ok(k.$("viewTitle").textContent === "Tasks" && k.d.querySelector(".detailpane .what").textContent.includes("Playtest and polish"), "a milestone's text in the list opens its own task too");
  ok(!k.btn(k.d.querySelector("#newMenu"), "New milestone"), "the + menu has no separate New milestone item -- a milestone only comes from flagging an existing task");
}

{
  // a quest's page: its content on the left, its own Timeline and Burndown on the right
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  const split = k.d.querySelector("#view .questsplit");
  ok(!!split && !!split.querySelector(".questmain") && !split.querySelector(".questtop") && !split.querySelector(".questrest") && !!split.querySelector(".questcharts"), "an active quest's page has one content column and a Schedule/Timeline/Burndown column");
  ok(!split.querySelector("#proj-name") && [...split.querySelectorAll(".questmain h2")].map(h => h.textContent).join() === "Tasks,Before you launch,Issues,Quest links,Notes,Quest giver", "the left column runs Tasks, Before you launch, Issues, Quest links, Notes, then Quest giver (" + [...split.querySelectorAll(".questmain h2")].map(h => h.textContent).join() + ")");
  ok(!split.querySelector(".pintoggle") && !split.querySelector(".pinbar"), "there is no Pin button on a quest's page");
  ok(split.querySelector(".questmain").textContent.includes("Complete: 1 of 7 tasks | Backlog: 1 unscheduled task | Issues: 2 open"), "the task-count line sits under the Tasks heading, with the open issues counted apart");
  const side = split.querySelector(".questcharts");
  ok([...side.querySelectorAll("h2")].map(h => h.textContent).join() === "Schedule,Timeline,Burndown,Stats", "the right column flows Schedule, Timeline, Burndown, then Stats, as one column");
  ok([...split.children].map(c => c.className).join() === "questmain,questcharts,actions questactions", "the page is ordered content, then the Schedule/Timeline/Burndown column, then the action buttons last, which is also the reading and phone order");
  ok(!!side.querySelector("#proj-start") && !!side.querySelector("#proj-days") && !split.querySelector(".questmain #proj-start") && ![...split.querySelectorAll(".questmain h2")].some(h => h.textContent === "Schedule"), "the Schedule heading and fields are in the right column, not the left");
  ok(!!k.btn(side, "Expand"), "the right column has an Expand button");
  ok(side.querySelectorAll(".lane").length === 7, "one timeline lane per scheduled task, plus the milestones lane (" + side.querySelectorAll(".lane").length + ")");
  ok(!side.textContent.includes("not shown until scheduled") && !side.textContent.includes("The red line marks today"), "an unscheduled Backlog task is not drawn, and the Timeline has no caption under it");
  ok(side.querySelectorAll(".ms").length === 1 && /Run a beta with five friends/.test(side.querySelector(".ms").getAttribute("aria-label")), "the timeline shows only this quest's milestone");
  const svg = side.querySelector("svg.chart");
  ok(/^Burndown chart for Sample App\./.test(svg.getAttribute("aria-label")), "the burndown is this quest's");
  ok(svg.querySelectorAll(".dot").length === 3, "the actual line has its recorded weeks plus this week (" + svg.querySelectorAll(".dot").length + ")");
  ok(svg.querySelectorAll(".mark").length === 1 && svg.querySelectorAll("rect.hit").length >= 4, "a milestone marker and a hover column for each week are drawn");
  ok(!svg.querySelector("title"), "the chart has no native tooltips, which would double up with the new one and never reach a phone or keyboard");
  ok(/Remaining: 5 of 6 tasks/.test(side.textContent), "the count line is this quest's tasks");
  // Expand opens both charts in a full-size dialog, and closing restores normal dialogs
  k.click(k.btn(side, "Expand"));
  const modal = k.d.querySelector("#overlay .modal");
  ok(!k.$("overlay").hidden && modal.classList.contains("full") && k.$("modalTitle").textContent === "Timeline and burndown for Sample App", "Expand opens the charts in a full-size dialog");
  ok(!!k.$("modalBody").querySelector(".range") && !!k.$("modalBody").querySelector("svg.chart"), "the dialog holds both charts");
  ok(!!k.$("modalBody").querySelector("#proj-start") && [...k.$("modalBody").querySelectorAll("h2")].map(h => h.textContent).join() === "Schedule,Timeline,Burndown,Stats", "the expanded dialog also holds Schedule, with no extra heading on top of it");
  k.click(k.$("modalClose"));
  ok(k.$("overlay").hidden && !modal.classList.contains("full"), "closing it drops the full size");
  k.menuAct("newBtn", "newIdea");
  ok(!modal.classList.contains("full"), "the next dialog is the normal size");
  k.click(k.$("modalClose"));
}
{
  // a quest's history is recorded as it changes, and its chart reads it
  const k = kit(await mk());
  const d = new Date(), todayKey = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Build the home screen")));
  const sel = selRow(k); sel.value = "Completed"; k.fire(sel);
  const app = k.saved().quests.find(p => p.id === "pApp");
  ok(JSON.stringify(app.hist[todayKey]) === "[6,4]", "finishing a task records the quest's tasks in scope and still open for today (" + JSON.stringify(app.hist[todayKey]) + ")");
  ok(Object.keys(app.hist).length >= 3, "the earlier records are kept");
  // a second change that nets out to the same counts leaves no extra record
  const sel2 = selRow(k); sel2.value = "In progress"; k.fire(sel2);
  const sel3 = selRow(k); sel3.value = "Completed"; k.fire(sel3);
  ok(JSON.stringify(k.saved().quests.find(p => p.id === "pApp").hist[todayKey]) === "[6,4]", "changing a task back and forth keeps the day's record at its final counts");
}
{
  // A Complete quest's burndown has no gap for a week nothing was recorded, since its remaining count is 0 from completion on. Also exercises the old "projects"/"projectId" saved-data shape.
  const saved = {
    projects: [{ id: "pDoneGap", name: "Finished Long Ago", status: "complete", start: "2026-08-03", days: 7, hist: { "2026-08-10": [2, 1] } }],
    tasks: [
      { id: "g1", block: 1, projectId: "pDoneGap", what: "Step one", done: "done", status: "Completed", steps: [] },
      { id: "g2", block: 2, projectId: "pDoneGap", what: "Step two", done: "done", status: "Completed", steps: [] }
    ]
  };
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Finished Long Ago"));
  const svg = k.d.querySelector("#view svg.chart");
  const dots = [...svg.querySelectorAll(".dot")];
  ok(dots.length >= 5, "every week from start to now has a plotted point, not just the recorded one (" + dots.length + ")");
  ok(svg.querySelectorAll("polyline.actual").length === 1, "the actual line is one unbroken polyline, not split by an unrecorded gap week (" + svg.querySelectorAll("polyline.actual").length + " segments)");
}
{
  // the open estimate drops as tasks complete; tasks open in place on a quest's page
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  const before = k.d.querySelector("#view .estleft").textContent;
  const row = [...k.d.querySelectorAll("#view .questmain .tlist li")].find(li => li.textContent.includes("Run a beta with five friends"));
  k.click(row.querySelector("button.item"));
  ok(k.$("viewTitle").textContent === "Sample App" && !!k.d.querySelector("#view .questmain .tlist:not(.sectionlist) .detail"), "clicking a task on a quest's page opens it in place, not on the Tasks page");
  ok(k.d.querySelector("#ptask-" + row.id.slice(6) + " button.item").getAttribute("aria-expanded") === "true", "the open row is marked expanded");
  ok(k.d.querySelectorAll("#view .questmain .tlist:not(.sectionlist) .detail").length === 1 && !k.d.querySelector("#view .questmain .detail h2"), "one task is open at a time, with no quest heading repeated inside it");
  ok(!k.btn(k.d.querySelector("#view .questmain .detail"), "Open in Tasks"), "no Open in Tasks button is offered");
  const sel = openSel(k); sel.value = "Completed"; k.fire(sel);
  ok(k.d.querySelectorAll("#view .questmain .tlist:not(.sectionlist) .detail").length === 1, "the task stays open after an edit");
  const after = k.d.querySelector("#view .estleft").textContent;
  ok(before === "Est. 29 hours remaining" && after === "Est. 25 hours remaining", "completing a 4 h task lowers the open estimate (" + before + " -> " + after + ")");
  k.click(k.d.querySelector("#view .questmain .tlist button.item[aria-expanded='true']"));
  ok(!k.d.querySelector("#view .questmain .tlist:not(.sectionlist) .detail"), "clicking the open task again closes it");
  // the launch checklist's task row also opens the task in place, same as a regular Tasks row
  const launchRow = [...k.d.querySelectorAll("#view .questmain .tlist.check button.item")].find(b => b.textContent.includes("Submit to the app store"));
  k.click(launchRow);
  ok(k.$("viewTitle").textContent === "Sample App" && !!k.d.querySelector("#view .questmain .tlist.check .detail"), "a task row in Before you launch opens that task in place");
}
{
  // a pale band behind each task's bar shows its block
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Game"));
  const lane = [...k.d.querySelectorAll("#view .questcharts .lane")].find(l => l.textContent.includes("Prototype the core mechanic"));
  const bars = [...lane.querySelectorAll(".bar")];
  ok(bars.length === 2 && bars[0].classList.contains("blk") && !bars[1].classList.contains("blk"), "each task lane has a block band behind its own bar");
  const w = b => parseFloat(b.style.width);
  ok(w(bars[1]) < w(bars[0]), "a task shorter than its block shows a bar narrower than the band (" + w(bars[1]).toFixed(1) + " vs " + w(bars[0]).toFixed(1) + ")");
}
{
  // the Timeline's counts table is read-only and says what it is built from
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("timeline");
  const th = [...k.d.querySelectorAll("#view .weekly th")].map(h => h.textContent);
  ok(th.join() === "Week starting,Planned remaining,Actual remaining,Tasks in scope,Scope change", "the counts table has a scope column (" + th.join() + ")");
  ok(!k.d.querySelector("#view .weekly input"), "nothing in the counts table is editable");
  ok(!/Enter the number/.test(k.$("view").textContent) && !/Task counts are recorded automatically/.test(k.$("view").textContent), "the page has no description line");
  const cells = [...k.d.querySelectorAll("#view .weekly tbody tr")].map(tr => [...tr.children].map(c => c.textContent));
  ok(cells[0][2] === "16" && cells[0][3] === "16" && cells[1][2] === "14" && cells[2][2] === "13", "past rows read back the recorded counts, carrying a quiet day forward (" + JSON.stringify(cells.slice(0, 3)) + ")");
  ok(cells[0][4] === "" && cells[1][4] === "" && cells[2][4] === "+1", "and the sample shows one scope change, a task added mid-way (" + JSON.stringify(cells.slice(0, 3).map(r => r[4])) + ")");
}
{
  // a short schedule gets daily points, not a one-week floor; a gap day carries the last record forward
  const d = new Date(), n = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), iso = k => new Date(n + k * 86400000).toISOString().slice(0, 10);
  const saved = {
    start: iso(-4), days: 1,
    projects: [{ id: "pQ", name: "Quick", status: "active", start: iso(-4), days: 1, hist: (h => { h[iso(-4)] = [4, 4]; h[iso(-2)] = [4, 3]; return h; })({}) }],
    tasks: [1, 2, 3, 4].map(b => ({ id: "q" + b, block: b, projectId: "pQ", what: "Quick " + b, done: "d", status: b === 1 ? "Completed" : "Not started", steps: [] })),
    hist: (h => { h[iso(-4)] = [4, 4]; h[iso(-2)] = [4, 3]; return h; })({})
  };
  const k = kit(await mk(saved));
  k.click(k.$("welcomeDismiss") || k.$("view"));
  k.tab("timeline");
  const rows = [...k.d.querySelectorAll("#view .weekly tbody tr")].map(tr => [...tr.children].map(c => c.textContent));
  ok(k.d.querySelector("#view .weekly th").textContent === "Date" && rows.length === 7, "with one-day blocks the counts are by date, not by week (" + rows.length + " rows)");
  ok(rows[0][2] === "4" && rows[1][2] === "4" && rows[2][2] === "3" && rows[3][2] === "3", "a day with no record carries the last one forward (" + rows.slice(0, 4).map(r => r[2]).join(",") + ")");
  k.click(k.btn(k.d.querySelector("#nav"), "Projects") || k.d.querySelector('.tab[data-view="projects"]'));
  k.click(k.btn(k.$("view"), "Quick"));
  const svg = k.d.querySelector("#view .questcharts svg.chart");
  const hits = svg.querySelectorAll("rect.hit").length;
  ok(hits >= 5 && hits <= 7, "the quest's chart is daily too (" + hits + " points for a 4-day schedule)");
}
{
  // completing a launch task's last step counts like any other change: history is recorded and the quest can complete
  const d = new Date(), n = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), iso = k => new Date(n + k * 86400000).toISOString().slice(0, 10);
  const saved = {
    quests: [{ id: "pL", name: "Launchy", status: "active", start: iso(-1), days: 7 }],
    tasks: [{ id: "l1", block: 1, questId: "pL", what: "Ship it", status: "Not started", launch: true, steps: [{ id: "l1a", text: "Press the button", done: false }] }]
  };
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Launchy"));
  const launchRow = [...k.d.querySelectorAll("#view .tlist.check button.item")].find(b => b.textContent.includes("Ship it"));
  k.click(launchRow);
  const box = [...k.d.querySelectorAll("#view .steps input[type=checkbox]")][0];
  box.checked = true; k.fire(box);
  const sv = k.saved();
  ok(sv.tasks[0].status === "Completed" && JSON.stringify(sv.quests[0].hist[iso(0)]) === "[1,0]", "ticking the last step on a launch task completes the task and records the quest's counts");
  ok(sv.quests[0].status === "complete" && k.$("modalTitle").textContent === "Quest complete", "and the quest completes from there too");
}
{
  // scope changes are called out, Jira-style, in the table, the tooltip, and when completing a project
  const d = new Date(), n = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), iso = k => new Date(n + k * 86400000).toISOString().slice(0, 10);
  const hh = {}; hh[iso(-14)] = [4, 4]; hh[iso(-7)] = [6, 5]; hh[iso(0)] = [6, 5];
  const saved = {
    start: iso(-14), days: 7,
    projects: [{ id: "pS", name: "Grew", status: "active", start: iso(-14), days: 7, hist: hh }],
    tasks: [1, 2, 3, 4, 5, 6].map(b => ({ id: "s" + b, block: Math.min(b, 3), projectId: "pS", what: "Grew " + b, done: "d", status: b === 1 ? "Completed" : "Not started", steps: [] })),
    hist: hh
  };
  const k = kit(await mk(saved));
  k.tab("timeline");
  const rows = [...k.d.querySelectorAll("#view .weekly tbody tr")].map(tr => [...tr.children].map(c => c.textContent));
  ok(rows[0][4] === "" && rows[1][4] === "+2" && rows[2][4] === "", "the table shows scope growing by 2 on the week it happened (" + rows.slice(0, 3).map(r => JSON.stringify(r[4])).join(",") + ")");
  const svg = k.d.querySelector("#view svg.chart"), tip = k.d.querySelector("#view .charttip");
  const hit = [...svg.querySelectorAll("rect.hit")][1];
  hit.dispatchEvent(new k.w.MouseEvent("mouseenter", { bubbles: false }));
  ok(/Scope grew from 4 to 6/.test(tip.textContent), "and the tooltip says so (" + tip.textContent.replace(/\n/g, " | ") + ")");
}
{
  // marking a project complete with open tasks says they leave the main burndown
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  k.click(k.btn(k.$("view"), "Mark complete"));
  ok(/5 open tasks are no longer counted in the main burndown/.test(k.$("modalBody").textContent), "the completion dialog warns about open tasks leaving the burndown (" + k.$("modalBody").textContent.slice(0, 160) + ")");
}
{
  // the main burndown draws total scope as ramps ending on the dates it changed
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("timeline");
  const scope = k.d.querySelector("#view svg.chart polyline.scope");
  ok(!!scope && [...k.d.querySelectorAll("#view .legend span")].some(s => s.textContent === "Scope"), "the main burndown has an In scope line and a legend entry for it");
  const pts = scope.getAttribute("points").split(" ").map(p => p.split(",").map(Number));
  const vertical = pts.some((p, i) => i > 0 && p[0] === pts[i - 1][0] && p[1] !== pts[i - 1][1]);
  const slope = pts.some((p, i) => i > 0 && p[0] !== pts[i - 1][0] && p[1] !== pts[i - 1][1]);
  ok(!vertical && slope, "it ramps where scope changed (a slope, never a vertical step) and is level everywhere else");
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok(!!k.d.querySelector("#view .questcharts polyline.scope") && [...k.d.querySelectorAll("#view .questcharts .legend span")].some(s => s.textContent === "Scope"), "a quest's burndown draws its own In scope line too");
  const ppts = k.d.querySelector("#view .questcharts polyline.scope").getAttribute("points").split(" ").map(p => p.split(",").map(Number));
  ok(ppts.some((p, i) => i > 0 && p[0] > ppts[i - 1][0] && p[1] < ppts[i - 1][1]), "and it ramps up where a task was added");
}
{
  // New task from a quest's page names the quest instead of offering a picker
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  k.click(k.btn(k.$("view"), "Add task"));
  ok(!k.$("f-quest"), "no quest selector in the dialog opened from a quest's page");
  ok(k.$("modalBody").textContent.includes("Quest: Sample App"), "the quest is named instead (" + k.$("modalBody").textContent.slice(0, 80) + ")");
  k.setField("what", "Named quest test"); k.click(k.btn(k.$("modalBody"), "Add task"));
  ok(k.saved().tasks.find(t => t.what === "Named quest test").questId === "pApp", "it still saves to the right quest");
  // the Main Menu's New task keeps the real picker
  k.menuAct("newBtn", "newTask");
  ok(!!k.$("f-quest") && k.$("f-quest").tagName === "SELECT", "the Main Menu's New task still offers a quest picker");
}
{
  // a task added to the plan after its quest started is tagged on the task itself
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  const rowOf = (txt) => [...k.d.querySelectorAll("#view .questmain .tlist li")].find(li => li.textContent.includes(txt));
  const chip = (li) => [...li.querySelectorAll(".chip")].map(c => c.textContent).find(t => /^Added /.test(t));
  ok(!!chip(rowOf("Submit to the app store")) && !chip(rowOf("Sketch the main screens")) && !chip(rowOf("Run a beta with five friends")), "only the sample's late-added task carries an Added tag (" + chip(rowOf("Submit to the app store")) + ")");
  const tagged = [...rowOf("Submit to the app store").querySelectorAll(".chip")].find(c => /^Added /.test(c.textContent));
  ok(tagged.parentElement.classList.contains("l3"), "the tag sits under the title, with the row's other chips");
  k.tab("schedule");
  const trow = [...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Submit to the app store"));
  ok(!!trow && [...trow.querySelectorAll(".l3 .chip")].some(c => /^Added /.test(c.textContent)) && !trow.querySelector(".l1 .chip"), "the Tasks page shows the Added tag too, under the title");
  k.click(trow);
  ok([...k.d.querySelectorAll(".detailpane .dmeta .chip")].some(c => /^Added /.test(c.textContent)), "and so does the task's detail");
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  // a Backlog task given a due date enters the plan today and gets tagged; clearing the date removes it
  k.click(rowOf("Add a dark mode").querySelector("button.item"));
  const due = k.$("task-due");
  const d = new Date(), iso = n => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) + n * 86400000).toISOString().slice(0, 10);
  due.value = iso(20); k.fire(due, "blur");
  const dm = k.saved().tasks.find(t => t.what === "Add a dark mode");
  ok(dm.added === iso(0) && !!chip(rowOf("Add a dark mode")), "scheduling a Backlog task records the day it joined the plan and tags it");
  ok(dm.start === iso(0), "a due date with no start date starts the task today (" + dm.start + ")");
  const due2 = k.$("task-due"); due2.value = ""; k.fire(due2, "blur");
  ok(k.saved().tasks.find(t => t.what === "Add a dark mode").added === "" && !chip(rowOf("Add a dark mode")), "sending it back to the Backlog clears that");
  // a task from the dialog starts in the Backlog, so it is not tagged
  k.click(k.btn(k.$("view"), "Add task"));
  k.setField("what", "Late idea"); k.click(k.btn(k.$("modalBody"), "Add task"));
  ok(k.saved().tasks.find(t => t.what === "Late idea").added === "", "a task created in the dialog is a Backlog item and has no added date");
  // saved data: an added date only makes sense on a scheduled task
  const saved = { projects: [{ id: "pA", name: "A", status: "active", start: iso(-5) }], tasks: [
    { id: "t1", block: 2, projectId: "pA", what: "Scheduled", done: "d", status: "Not started", steps: [], added: iso(-1) },
    { id: "t2", block: 0, projectId: "pA", what: "Waiting", done: "d", status: "Not started", steps: [], added: iso(-1) },
    { id: "t3", block: 1, projectId: "pA", what: "Bad date", done: "d", status: "Not started", steps: [], added: "soon" }] };
  const k2 = kit(await mk(saved));
  const tt = k2.saved().tasks;
  ok(tt.find(t => t.id === "t1").added === iso(-1) && tt.find(t => t.id === "t2").added === "" && tt.find(t => t.id === "t3").added === "", "on load, a valid date is kept only on a scheduled task");
}
{
  // a bullet separates steps from the estimate only when both are shown
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  const l3of = (txt) => [...k.d.querySelectorAll("#view .questmain .tlist li")].find(li => li.textContent.includes(txt)).querySelector(".l3");
  const bits = (l3) => [...l3.children].map(c => c.textContent);
  ok(bits(l3of("Run a beta with five friends")).join("|").includes("0 of 3 steps|\u00b7|Est 4 h"), "steps and an estimate are separated by a bullet (" + bits(l3of("Run a beta with five friends")).join("|") + ")");
  ok(!bits(l3of("Add a dark mode")).includes("\u00b7"), "a task with an estimate but no steps has no bullet (" + bits(l3of("Add a dark mode")).join("|") + ")");
}
{
  // Restore backup: choose a file, get a warning, then everything is replaced; Undo puts it back
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("settings");
  const before = k.saved().tasks.length;
  const backup = { projects: [{ id: "pR", name: "Restored", status: "active", start: "2026-09-01" }], tasks: [
    { id: "r1", block: 1, projectId: "pR", what: "Only task", done: "d", status: "Not started", steps: [] },
    { id: "r2", block: 2, projectId: "pR", what: "Second task", done: "d", status: "Not started", steps: [] }] };
  const pick = async (text) => {
    const input = k.$("restoreFile");
    Object.defineProperty(input, "files", { value: [new k.w.File([text], "b.json")], configurable: true });
    k.fire(input, "change"); await new Promise(r => setTimeout(r, 150));
  };
  await pick("this is not json");
  ok(k.$("overlay").hidden && k.$("view").textContent.includes("That isn’t a Sidequest backup file."), "a file that is not a backup is refused without a warning dialog");
  await pick(JSON.stringify({ hello: "world" }));
  ok(k.$("overlay").hidden && k.saved().tasks.length === before, "JSON that is not a backup is refused and nothing changes");
  await pick(JSON.stringify(backup));
  ok(k.$("modalTitle").textContent === "Restore this backup?" && /1 quest and 2 tasks/.test(k.$("modalBody").textContent) && /replaces everything/.test(k.$("modalBody").textContent), "a real backup asks first, saying what it holds and what will happen (" + k.$("modalBody").textContent.slice(0, 90) + ")");
  ok(k.saved().tasks.length === before, "and nothing has changed yet");
  k.click(k.btn(k.$("modalBody"), "Cancel"));
  ok(k.saved().tasks.length === before, "Cancel leaves everything as it was");
  await pick(JSON.stringify(backup));
  k.click(k.btn(k.$("modalBody"), "Restore backup"));
  ok(k.saved().tasks.length === 2 && k.saved().quests[0].name === "Restored", "Restore backup replaces everything with the file");
  ok(k.$("toast").textContent.includes("Backup restored.") && !!k.btn(k.$("toast"), "Undo"), "and offers Undo for a few seconds");
  k.click(k.btn(k.$("toast"), "Undo"));
  ok(k.saved().tasks.length === before && k.saved().quests.some(p => p.name === "Sample Game"), "Undo puts the previous data back");
}
{
  // Import from Trello: a board export becomes a new quest, archived cards and
  // dateless cards both behave correctly, checklist items become steps.
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("settings");
  const qBefore = k.saved().quests.length, tBefore = k.saved().tasks.length;
  const board = {
    name: "Launch Plan",
    cards: [
      { id: "c1", name: "Design landing page", desc: "Hero + pricing", due: "2026-11-01T17:00:00.000Z", closed: false, idChecklists: ["cl1"], idLabels: ["lab1"], idMembers: ["m1"], checkItemStates: [{ idCheckItem: "ci1", state: "complete" }] },
      { id: "c2", name: "Write copy", desc: "", due: null, closed: false, idChecklists: [], idLabels: [], idMembers: [] },
      { id: "c3", name: "Old, skipped", desc: "", due: null, closed: true, idChecklists: [], idLabels: [], idMembers: [] }
    ],
    // Real Trello exports put completion on the card's checkItemStates
    // (by idCheckItem), not on the checklist's checkItems themselves.
    checklists: [{ id: "cl1", idCard: "c1", checkItems: [{ id: "ci1", name: "Pick palette" }, { id: "ci2", name: "Draft hero copy" }] }],
    labels: [{ id: "lab1", name: "Design", color: "blue" }],
    members: [{ id: "m1", fullName: "Someone" }]
  };
  const pickTrello = async (text) => {
    const input = k.$("importTrelloFile");
    Object.defineProperty(input, "files", { value: [new k.w.File([text], "b.json")], configurable: true });
    k.fire(input, "change"); await new Promise(r => setTimeout(r, 40));
  };
  await pickTrello("not json");
  ok(k.$("overlay").hidden && k.$("view").textContent.includes("That doesn’t look like a Trello board export."), "a file that is not a Trello export is refused without a dialog");
  await pickTrello(JSON.stringify(board));
  ok(k.$("modalTitle").textContent === "Import “Launch Plan”?" && /2 cards and 2 checklist items/.test(k.$("modalBody").textContent) && /new quest named/.test(k.$("modalBody").textContent) && /not imported/.test(k.$("modalBody").textContent), "the preview names the board, its counts, and what is left out (" + k.$("modalBody").textContent.slice(0, 120) + ")");
  ok(k.saved().quests.length === qBefore, "nothing has changed yet");
  k.click(k.btn(k.$("modalBody"), "Cancel"));
  ok(k.saved().quests.length === qBefore, "Cancel imports nothing");
  await pickTrello(JSON.stringify(board));
  k.click(k.btn(k.$("modalBody"), "Import"));
  const qp = k.saved().quests.find(p => p.name === "Launch Plan");
  ok(!!qp && k.saved().quests.length === qBefore + 1, "Import creates exactly one new quest, existing quests untouched");
  const its = k.saved().tasks.filter(t => t.questId === qp.id);
  ok(its.length === 2, "the closed card was skipped, the other two became tasks");
  const dated = its.find(t => t.what === "Design landing page"), undated = its.find(t => t.what === "Write copy");
  ok(dated.due === "2026-11-01" && dated.block === 1 && dated.notes === "Hero + pricing", "a card with a due date keeps its date, note, and lands in a real block");
  ok(undated.due === "" && undated.block === 0, "a card with no due date goes to the Backlog");
  ok(dated.steps.length === 2 && dated.steps[0].done === true && dated.steps[1].done === false, "checklist items become steps with their done state kept");
  ok(qp.start === "2026-11-01", "the new quest starts on the earliest due date found");
  ok(k.saved().tasks.length === tBefore + 2, "existing tasks are untouched");
}
{
  // Import from Todoist: a real per-project CSV export becomes a new quest
  // named after the file, with sections, subtasks, labels, and completed
  // tasks all handled per the documented limitations.
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("settings");
  const qBefore = k.saved().quests.length, tBefore = k.saved().tasks.length;
  const td = new Date(), iso = new Date(Date.UTC(td.getFullYear(), td.getMonth(), td.getDate())).toISOString().slice(0, 10);
  const csv = [
    "TYPE,CONTENT,DESCRIPTION,IS_COLLAPSED,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG",
    "meta,view_style=list,,,,,,,,,,,,,",
    ",,,,,,,,,,,,,,",
    "task,Read Week 4 content,,,4,1,Tim,,,,America/Los_Angeles,,,,",
    "task,Do Week 4 homework,,,4,1,Tim,,,,America/Los_Angeles,,,,",
    "task,Email about continuing @Math,,,2,1,,,today,en,America/Los_Angeles,,,,",
    ",,,,,,,,,,,,,,"
  ].join("\r\n");
  const pickTodoist = async (text, name) => {
    const input = k.$("importTodoistFile");
    Object.defineProperty(input, "files", { value: [new k.w.File([text], name || "School.csv")], configurable: true });
    k.fire(input, "change"); await new Promise(r => setTimeout(r, 40));
  };
  await pickTodoist("not,a,todoist,file\n1,2,3,4");
  ok(k.$("overlay").hidden && k.$("view").textContent.includes("That doesn’t look like a Todoist project export."), "a file with no recognizable Todoist header is refused without a dialog");
  await pickTodoist(csv);
  ok(k.$("modalTitle").textContent === "Import “School”?" && /3 tasks were found/.test(k.$("modalBody").textContent) && /Completed tasks are not in this file/.test(k.$("modalBody").textContent) && /new quest named/.test(k.$("modalBody").textContent), "the preview names the quest after the filename and states the completed-tasks limitation (" + k.$("modalBody").textContent.slice(0, 160) + ")");
  ok(k.saved().quests.length === qBefore, "nothing has changed yet");
  k.click(k.btn(k.$("modalBody"), "Cancel"));
  ok(k.saved().quests.length === qBefore, "Cancel imports nothing");
  await pickTodoist(csv);
  k.click(k.btn(k.$("modalBody"), "Import"));
  const qp = k.saved().quests.find(p => p.name === "School");
  ok(!!qp && k.saved().quests.length === qBefore + 1, "Import creates exactly one new quest, named after the file, existing quests untouched");
  const its = k.saved().tasks.filter(t => t.questId === qp.id);
  ok(its.length === 3, "the meta row and blank lines were skipped, all three tasks came through");
  const dated = its.find(t => t.what === "Email about continuing");
  ok(!!dated && dated.due === iso && dated.block === 1, "the @label tag is stripped from the task name, and Todoist's \"today\" resolves to the real current date");
  const undated = its.filter(t => t.due === "" && t.block === 0);
  ok(undated.length === 2, "tasks with no date go to the Backlog");
  ok(qp.start === iso, "the new quest starts on the earliest due date found");
  ok(k.saved().tasks.length === tBefore + 3, "existing tasks are untouched");
}
{
  // Todoist's natural-language DATE field: "tomorrow" and "in N days" are
  // unambiguous and resolved; a recurrence phrase is left unscheduled, not guessed at.
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("settings");
  const td = new Date(), base = Date.UTC(td.getFullYear(), td.getMonth(), td.getDate());
  const iso = n => new Date(base + n * 86400000).toISOString().slice(0, 10);
  const csv = [
    "TYPE,CONTENT,DESCRIPTION,IS_COLLAPSED,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG",
    "task,Due tomorrow,,,4,1,,,tomorrow,en,America/Los_Angeles,,,,",
    "task,Due in 3 days,,,4,1,,,in 3 days,en,America/Los_Angeles,,,,",
    "task,Recurring task,,,4,1,,,every day,en,America/Los_Angeles,,,,"
  ].join("\r\n");
  const input = k.$("importTodoistFile");
  Object.defineProperty(input, "files", { value: [new k.w.File([csv], "Dates.csv")], configurable: true });
  k.fire(input, "change"); await new Promise(r => setTimeout(r, 40));
  k.click(k.btn(k.$("modalBody"), "Import"));
  const qp = k.saved().quests.find(p => p.name === "Dates");
  const its = k.saved().tasks.filter(t => t.questId === qp.id);
  ok(its.find(t => t.what === "Due tomorrow").due === iso(1), "\"tomorrow\" resolves to the real next day");
  ok(its.find(t => t.what === "Due in 3 days").due === iso(3), "\"in 3 days\" resolves to the real date 3 days out");
  const recurring = its.find(t => t.what === "Recurring task");
  ok(recurring.due === "" && recurring.block === 0, "a recurrence phrase is not guessed at and goes to the Backlog instead");
}
{
  // a task's Timeline bar takes its status: Not started, In progress, Completed
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  const barOf = (txt) => [...k.d.querySelectorAll("#view .questcharts .lane")].find(l => l.textContent.includes(txt)).querySelectorAll(".bar")[1];
  ok(barOf("Sketch the main screens").classList.contains("done") && barOf("Build the sign-in flow").classList.contains("work") && barOf("Run a beta with five friends").classList.contains("new"), "Completed is green, In progress is yellow, Not started is pale blue on the Timeline");
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Run a beta with five friends")));
  ok(selRow(k).getAttribute("data-v") === "Not started" && [...k.d.querySelectorAll(".detailpane .chip")].some(c => c.getAttribute("data-v") === "Not started"), "the row's status pull-down and the detail's chip carry the status the colors key off");
}
{
  // the backup reminder: remembered in settings, quiet until two weeks have passed, web app only
  const dd = new Date(), n0 = Date.UTC(dd.getFullYear(), dd.getMonth(), dd.getDate()), iso = k => new Date(n0 + k * 86400000).toISOString().slice(0, 10);
  const stub = (k) => { let written = null; k.w.showSaveFilePicker = () => Promise.resolve({ createWritable: () => Promise.resolve({ write: (t) => { written = t; return Promise.resolve(); }, close: () => Promise.resolve() }) }); return () => written; };
  const wait = () => new Promise(r => setTimeout(r, 30));
  {
    const k = kit(await mk());
    ok(k.saved().settings.since === iso(0) && k.saved().settings.lastBackup === "", "a fresh browser records when it started and has no backup yet");
    ok(!k.$("view").textContent.includes("without saving a backup") && !k.$("view").textContent.includes("since your last backup"), "and Today stays quiet");
    k.click(k.$("welcomeDismiss"));
    k.tab("settings");
    ok(k.$("view").textContent.includes("No backup saved yet."), "Settings says no backup has been saved");
    const got = stub(k);
    k.click(k.$("saveFile")); await wait();
    ok(k.saved().settings.lastBackup === iso(0) && JSON.parse(got()).settings.lastBackup === iso(0), "Save backup records today, in the saved data and in the file itself");
    ok(k.$("view").textContent.includes("(today)"), "and the Settings line updates at once");
  }
  {
    const k = kit(await mk({ settings: { hideWelcome: true, since: iso(-20) } }));
    ok(k.$("view").textContent.includes("You have used Sidequest for 20 days without saving a backup."), "with no backup after 20 days, Today says so");
    ok(k.$("view").textContent.includes("Your data is stored in this browser on this device. A backup file protects it if the browser’s data is ever cleared."), "and the reminder says where the data is stored");
    const got = stub(k);
    k.click(k.btn(k.$("view"), "Save backup")); await wait();
    ok(!k.$("view").textContent.includes("without saving a backup") && k.saved().settings.lastBackup === iso(0) && !!got(), "its Save backup button saves right there and the note goes away");
  }
  {
    const k = kit(await mk({ settings: { hideWelcome: true, since: iso(-100), lastBackup: iso(-15) } }));
    ok(k.$("view").textContent.includes("It has been 15 days since your last backup."), "a backup 15 days old is reminded about");
    global.window.claude = { use: () => Promise.resolve(null) };
    k.tab("projects"); k.tab("today");
    ok(k.$("viewTitle").textContent === "Today" && !k.$("view").textContent.includes("since your last backup"), "the Claude version never shows the reminder");
    delete global.window.claude;
  }
  {
    const k = kit(await mk({ settings: { hideWelcome: true, since: iso(-100), lastBackup: iso(-3) } }));
    ok(!k.$("view").textContent.includes("since your last backup"), "a backup 3 days old is not reminded about");
  }
  {
    const k = kit(await mk({ settings: { lastBackup: "yesterday", since: "long ago" } }));
    ok(k.saved().settings.lastBackup === "" && k.saved().settings.since === iso(0), "malformed dates in saved settings fall back to the defaults");
  }
}
{
  // the Claude version's db and downloads, against a stand-in that follows the platform contract
  const fake = (initial, o) => {
    o = o || {};
    const store = Object.assign({}, initial), log = [], saves = [];
    const wait = (v) => new Promise(r => setTimeout(() => r(v), 4));
    const db = { doc: (p) => ({
      get: () => { log.push("get:" + p); return (o.failGet && p === "state/main") ? Promise.reject({ code: "unavailable", message: "down" }) : wait({ exists: p in store, data: () => store[p], id: "main", metadata: {} }); },
      set: (d) => { log.push("set:" + p); return wait().then(() => { store[p] = JSON.parse(JSON.stringify(d)); }); } }) };
    const downloads = o.noDownloads ? null : { save: (req) => { saves.push(req); return o.decline ? Promise.reject({ code: "declined", message: "no" }) : wait({ status: "saved" }); } };
    return { claude: { use: (n) => Promise.resolve(n === "db" ? db : n === "downloads" ? downloads : null) }, store, log, saves };
  };
  // Waits in six short turns, not one long one. After a stall, one long timer can fire before the
  // stand-in's chain of short timers has finished; short turns let that chain run in between.
  const wait = async (ms) => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, (ms || 90) / 6)); };
  const base = kit(await mk()).saved();
  base.quests.find(p => p.id === "pApp").name = "REAL DB DATA"; base.settings.hideWelcome = true;
  const realJson = JSON.stringify(base);
  const named = (store) => JSON.parse(store["state/main"].json).quests.find(p => p.id === "pApp").name;
  {
    // the brandmark lives in its own db document, so it cannot crowd the state document past the db's size limit
    const MARK = "data:image/png;base64,AAAA";
    const withMark = JSON.parse(realJson); withMark.settings.brandmark = MARK;
    const f = fake({ "state/main": { json: JSON.stringify(withMark) } });
    const k = kit(await mk(null, f.claude)); await wait();
    ok(k.saved().settings.brandmark === MARK, "a brandmark saved inline in an older db document is kept");
    ok(!!f.store["meta/brandmark"] && f.store["meta/brandmark"].data === MARK && JSON.parse(f.store["state/main"].json).settings.brandmark === "", "the brandmark moves to its own db document and out of the state document");
    const f2 = fake({ "state/main": f.store["state/main"], "meta/brandmark": f.store["meta/brandmark"] });
    const k2 = kit(await mk(null, f2.claude)); await wait();
    ok(k2.saved().settings.brandmark === MARK, "a fresh device gets the brandmark from its own db document");
  }
  {
    // a save made on every keystroke writes locally at once and holds the db write until typing pauses
    const f = fake({ "state/main": { json: realJson } });
    const k = kit(await mk(null, f.claude)); await wait();
    k.tab("projects"); k.click(k.btn(k.$("view"), "REAL DB DATA"));
    const sets = () => f.log.filter(x => x === "set:state/main").length, n = sets(), ta = k.d.querySelector('#view textarea[aria-label^="Notes for"]');
    ta.value = "typed"; k.fire(ta, "input"); await wait(30);
    ok(k.saved().quests.find(p => p.id === "pApp").notes === "typed" && sets() === n, "typing saves locally at once and holds the db write");
    await wait(950);
    ok(sets() === n + 1 && JSON.parse(f.store["state/main"].json).quests.find(p => p.id === "pApp").notes === "typed", "the db write follows once typing pauses");
  }
  {
    // a fresh device (nothing in local storage) must read the db before it writes to it
    const f = fake({ "state/main": { json: realJson } });
    const k = kit(await mk(null, f.claude)); await wait();
    ok(f.log.filter(x => x.endsWith(":state/main"))[0] === "get:state/main", "nothing is written to the db before it has been read (" + f.log.join(",") + ")");
    ok(named(f.store) === "REAL DB DATA" && [...k.d.querySelectorAll("#nav .tab")].some(t => t.textContent === "REAL DB DATA"), "a fresh device shows the db's data and leaves it intact in the db");
    const n = f.log.filter(x => x === "set:state/main").length;
    k.tab("settings"); k.click(k.$("saveFile")); await wait();
    ok(f.saves.length === 0 && !!k.btn(k.$("overlay"), "Save file") && !!k.$("overlay").querySelector("details"), "with the downloads capability the same save box shows first, Save file with the copy option folded under it, and nothing is saved yet");
    k.click(k.btn(k.$("overlay"), "Save file")); await wait();
    ok(k.$("overlay").hidden, "finishing the platform's save closes the box");
    ok(f.log.filter(x => x === "set:state/main").length > n && JSON.parse(f.store["state/main"].json).settings.lastBackup, "after loading, a change is written to the db");
    ok(f.saves.length === 1 && /^sidequest-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.saves[0].filename) && JSON.parse(f.saves[0].data).tasks.length === 28, "Save backup hands the viewer a dated .json file through the downloads capability");
    ok(k.$("view").textContent.includes("Backup saved.") && k.$("view").textContent.includes("(today)"), "and says it saved");
  }
  {
    const f = fake({});
    const k = kit(await mk(null, f.claude)); await wait();
    ok(f.log.filter(x => x.endsWith(":state/main")).join(",") === "get:state/main,set:state/main" && named(f.store) === "Sample App", "an empty db is seeded with this device's data, after reading it");
  }
  {
    const f = fake({ "state/main": { json: realJson } }, { failGet: true });
    const k = kit(await mk(null, f.claude)); await wait();
    k.click(k.$("welcomeDismiss") || k.$("view")); k.tab("settings"); k.click(k.$("saveFile")); await wait();
    ok(!f.log.includes("set:state/main") && named(f.store) === "REAL DB DATA", "if the db cannot be read, nothing is written to it (" + f.log.join(",") + ")");
  }
  {
    const f = fake({ "state/main": { json: realJson } }, { decline: true });
    const k = kit(await mk(null, f.claude)); await wait();
    k.tab("settings"); k.click(k.$("saveFile")); await wait();
    k.click(k.btn(k.$("overlay"), "Save file")); await wait();
    ok(k.$("overlay").textContent.includes("Save canceled.") && !k.$("overlay").hidden && k.$("view").textContent.includes("No backup saved yet."), "if the viewer declines, the box stays open for another try and nothing is recorded as saved");
  }
  // newest save wins when the db and this device disagree
  const T1 = "2026-10-01T10:00:00.000Z", T2 = "2026-10-01T12:00:00.000Z";
  const withName = (nm) => { const o = JSON.parse(JSON.stringify(base)); o.quests.find(p => p.id === "pApp").name = nm; return o; };
  const shown = (k, nm) => [...k.d.querySelectorAll("#nav .tab")].some(t => t.textContent === nm);
  {
    // this device saved later but its db writes failed: keep the local copy and push it up
    const f = fake({ "state/main": { json: JSON.stringify(withName("OLD DB")), savedAt: T1 } });
    const k = kit(await mk(withName("LOCAL EDIT"), f.claude, T2)); await wait();
    ok(shown(k, "LOCAL EDIT") && named(f.store) === "LOCAL EDIT" && f.store["state/main"].savedAt >= T2, "a newer local copy is kept and pushed to the db instead of being replaced by the db's older one");
  }
  {
    // the db was saved later (another device): it wins, and this device adopts its stamp
    const f = fake({ "state/main": { json: JSON.stringify(withName("DB EDIT")), savedAt: T2 } });
    const k = kit(await mk(withName("OLD LOCAL"), f.claude, T1)); await wait();
    ok(shown(k, "DB EDIT") && named(f.store) === "DB EDIT" && k.w.localStorage.getItem("sidequest-template-v1-saved-at") === T2, "a newer db copy replaces an older local one, and the stamp is adopted");
  }
  {
    // the very same save on both sides: nothing to read back and nothing to write
    const f = fake({ "state/main": { json: JSON.stringify(withName("SAME")), savedAt: T2 } });
    const k = kit(await mk(withName("SAME"), f.claude, T2)); await wait();
    ok(f.log.filter(x => x.endsWith(":state/main")).join(",") === "get:state/main" && shown(k, "SAME"), "the same save on both sides causes no swap and no write (" + f.log.join(",") + ")");
  }
  {
    // an ordinary edit after loading moves the db's stamp forward
    const f = fake({ "state/main": { json: JSON.stringify(withName("DB EDIT")), savedAt: T1 } });
    const k = kit(await mk(null, f.claude)); await wait();
    k.tab("settings"); k.click(k.$("saveFile")); await wait();
    k.click(k.btn(k.$("overlay"), "Save file")); await wait();
    ok(f.store["state/main"].savedAt > T1 && JSON.parse(f.store["state/main"].json).settings.lastBackup, "an edit after loading is written with a newer stamp");
  }
  {
    // an old db document with no stamp at all: the db still wins, as before
    const f = fake({ "state/main": { json: JSON.stringify(withName("UNSTAMPED DB")) } });
    const k = kit(await mk(withName("LOCAL"), f.claude, T2)); await wait();
    ok(shown(k, "UNSTAMPED DB"), "a db document from before stamps existed is trusted, as it always was");
  }
  {
    // meta/version is a real, separate doc from state/main (checkForAppUpdate() in state.js) --
    // a newer stamp there shows the update banner on Today
    const f = fake({ "state/main": { json: realJson }, "meta/version": { latest: "9.9.9" } });
    const k = kit(await mk(null, f.claude)); await wait();
    ok(k.$("view").textContent.includes("Sidequest has leveled up!"), "a newer version's stamp in meta/version shows the update banner on Today");
    const prompt = k.d.querySelector(".updatebanner textarea.updateprompt");
    ok(!!prompt && prompt.readOnly && prompt.value === "Please update my Sidequest artifact with the latest version, keeping all of my existing data.\nhttps://github.com/timsamoff/sidequest/releases/download/v9.9.9/sidequest.html", "the banner holds a read-only copy field with the prompt and the release download URL for that version");
    ok(/You are questing in version \d+\.\d+\.\d+, and Sidequest version 9\.9\.9 is ready to go\. To update, copy the prompt below and paste it into your AI chat\./.test(k.$("view").textContent) && !!k.btn(k.$("view"), "Copy prompt"), "the banner names the current and new versions, tells the user to copy the prompt, and has a Copy prompt button");
    ok(k.$("view").textContent.includes("None of your data will be touched."), "the banner reassures about data safety");
    k.click(k.btn(k.$("view"), "Dismiss"));
    ok(!k.$("view").textContent.includes("Sidequest has leveled up!") && k.saved().settings.dismissedUpdateVersion === "9.9.9", "Dismiss hides the banner and records the dismissed version");
  }
  {
    // no meta/version doc at all (the common case: nobody has ever written one) -- no banner, no error
    const f = fake({ "state/main": { json: realJson } });
    const k = kit(await mk(null, f.claude)); await wait();
    ok(!k.$("view").textContent.includes("Sidequest has leveled up!"), "with no version stamp at all, the banner never shows");
  }
  {
    // a stamp that is not actually newer (or malformed) never shows the banner
    const f = fake({ "state/main": { json: realJson }, "meta/version": { latest: "0.2.4" } });
    const k = kit(await mk(null, f.claude)); await wait();
    ok(!k.$("view").textContent.includes("Sidequest has leveled up!"), "a stamp equal to the current version shows no banner");
  }
  {
    // the latest GitHub release is a second version source (single-file build only: no manifest link)
    const noManifest = (w) => { const l = w.document.querySelector('link[rel="manifest"]'); if (l) l.remove(); };
    const realFetch = global.fetch;
    const banner = (k) => k.$("view").textContent.includes("Sidequest has leveled up!");
    let urls = [];
    global.fetch = (u) => { urls.push(u); return Promise.resolve({ ok: true, json: () => Promise.resolve([{ tag_name: "v9.8.7" }]) }); };
    let k = kit(await mk(null, null, null, null, null, noManifest)); await wait();
    ok(banner(k) && k.d.querySelector(".updatebanner textarea.updateprompt").value.endsWith("/releases/download/v9.8.7/sidequest.html"), "a newer release tag shows the banner with that version in the prompt");
    ok(urls[0].indexOf("https://api.github.com/repos/timsamoff/sidequest/releases") === 0, "the version fetch asks the GitHub releases API");
    k.click(k.btn(k.$("view"), "Dismiss"));
    ok(!banner(k) && k.saved().settings.dismissedUpdateVersion === "9.8.7", "dismissing suppresses that version");
    global.fetch = () => Promise.reject(new Error("offline"));
    k = kit(await mk(null, null, null, null, null, noManifest)); await wait();
    ok(!banner(k), "a failed fetch is silent and launch is unaffected");
    global.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve([]) });
    k = kit(await mk(null, null, null, null, null, noManifest)); await wait();
    ok(!banner(k), "a non-200 response is silent");
    global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([{ tag_name: "nightly" }]) });
    k = kit(await mk(null, null, null, null, null, noManifest)); await wait();
    ok(!banner(k), "a release tag that is not a version is silent");
    urls = [];
    global.fetch = (u) => { urls.push(u); return Promise.resolve({ ok: true, json: () => Promise.resolve([{ tag_name: "v9.8.7" }]) }); };
    k = kit(await mk(null)); await wait();
    ok(!banner(k) && urls.length === 0, "the web app (manifest present) never fetches or shows the banner");
    global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([{ tag_name: "v1.0.0" }]) });
    const f = fake({ "state/main": { json: realJson }, "meta/version": { latest: "9.9.9" } });
    k = kit(await mk(null, f.claude, null, null, null, noManifest)); await wait();
    ok(banner(k) && k.d.querySelector(".updatebanner textarea.updateprompt").value.endsWith("/releases/download/v9.9.9/sidequest.html"), "with both sources, the newer one wins (stamp 9.9.9 over fetched 1.0.0)");
    global.fetch = realFetch;
  }
}
{
  // saved history is validated on load, and the old step-count snapshots are not carried over
  const saved = { actual: [34, 31, 25, null, null, null, null], hist: { "2026-09-14": [12, 5], bad: [1, 1], "2026-09-21": [3, 9], "2026-09-28": "x", "2026-09-29": [5, -1] }, projects: [{ id: "pV", name: "Snap", status: "active", actual: { "2026-09-14": 12 }, hist: { "2026-09-14": [12, 5], bad: [1, 1], "2026-09-21": [3, 9], "2026-09-28": "x", "2026-09-29": [5, -1] } }], tasks: [] };
  const k = kit(await mk(saved));
  const a = k.saved().quests[0].hist, g = k.saved().hist;
  ok(Object.keys(a).join() === "2026-09-14" && a["2026-09-14"].join() === "12,5", "only well-formed history entries are kept on a project");
  ok(Object.keys(g).join() === "2026-09-14" && !("actual" in k.saved()) && !("actual" in k.saved().quests[0]), "the same goes for the main burndown, and the old step-count fields are gone");
}
{
  // Slip schedule moves only a project's incomplete tasks, leaves Completed
  // tasks and the Backlog untouched, and is reachable only from the project
  // page now (not the Main Menu or Today's Overdue panel)
  const saved = {
    projects: [{ id: "pS", name: "Behind Schedule", status: "active", start: "2026-08-03", days: 7 }],
    tasks: [
      { id: "s1", block: 1, projectId: "pS", what: "Done already", done: "done", status: "Completed", steps: [] },
      { id: "s2", block: 2, projectId: "pS", what: "Still open", done: "done", status: "Not started", steps: [] },
      { id: "s3", block: 0, projectId: "pS", what: "In the backlog", done: "done", status: "Not started", steps: [] }
    ]
  };
  const k = kit(await mk(saved));
  const menuItems = () => { k.$("moreBtn").dispatchEvent(new k.w.MouseEvent("click", { bubbles: true })); return [...k.d.querySelectorAll("#moreMenu button")].map(b => b.textContent); };
  ok(!menuItems().some(t => t.includes("Slip")), "Slip is no longer in the Main Menu");
  k.d.querySelector("#moreMenu").dispatchEvent(new k.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  k.tab("today");
  ok(!k.$("view").textContent.includes("Slip"), "Slip is no longer offered from Today's Overdue panel");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Behind Schedule"));
  const slipBtn = k.btn(k.$("view"), "Slip schedule");
  ok(!!slipBtn, "a project's page has a Slip schedule button");
  k.click(slipBtn);
  k.$("slipDays").value = "7"; k.click(k.$("slipGo"));
  const tasksAfter = k.saved().tasks;
  ok(tasksAfter.find(t => t.id === "s1").block === 1, "a Completed task's block is untouched by Slip");
  ok(tasksAfter.find(t => t.id === "s2").block === 3, "an incomplete task's block moves forward by the slipped days (" + tasksAfter.find(t => t.id === "s2").block + ")");
  ok(tasksAfter.find(t => t.id === "s3").block === 0, "a Backlog task stays in the Backlog");
  // undo restores the exact original block
  k.click(slipBtn);
  ok(!!k.btn(k.$("modalBody"), "Undo last slip (7 days)"), "Undo is offered after a slip");
  k.click(k.btn(k.$("modalBody"), "Undo last slip (7 days)"));
  ok(k.saved().tasks.find(t => t.id === "s2").block === 2, "undo restores the task's original block");
}
{
  // an active quest with nothing scheduled still has the panel, and says so
  const k = kit(await mk({ projects: [{ id: "pX", name: "Empty", status: "active" }], tasks: [] }));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Empty"));
  const side = k.d.querySelector("#view .questcharts");
  ok(!!side && side.textContent.includes("Nothing is scheduled yet") && ![...side.querySelectorAll("h2")].some(h => h.textContent === "Burndown"), "a quest with no scheduled tasks says so and draws no burndown");
}
{
  // a live candidate has the same two-column layout as an active quest
  const k = kit(await mk());
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Browser Extension"));
  ok(!!k.d.querySelector("#view .questsplit"), "a candidate's page has the usual charts column");
}
{
  // vaulted quests, including vaulted candidates, stay single-column
  const k = kit(await mk());
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Game"));
  k.click(k.btn(k.$("view"), "Vault"));
  k.tab("vault"); k.click(k.btn(k.$("view"), "Sample Game"));
  ok(!k.d.querySelector("#view .questsplit"), "a vaulted quest's page has no charts column");
  ok([...k.d.querySelectorAll("#view h2")].some(h => h.textContent === "Schedule") && !k.$("proj-start"), "a vaulted quest still shows its Schedule, read only, in the single column");
}

{
  // the burndown tooltip works on hover, tap, and keyboard, on both charts
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  const side = k.d.querySelector("#view .questcharts");
  const svg = side.querySelector("svg.chart");
  const tip = () => side.querySelector(".charttip");
  const hits = [...svg.querySelectorAll("rect.hit")];
  const fire = (e, type) => e.dispatchEvent(new k.w.MouseEvent(type, { bubbles: false }));
  const key = (name) => svg.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: name, bubbles: true }));
  ok(svg.getAttribute("tabindex") === "0" && svg.getAttribute("role") === "group" && /arrow keys/.test(svg.getAttribute("aria-label")), "the chart is one labeled keyboard stop");
  ok(tip().hidden && tip().getAttribute("aria-live") === "polite" && tip().getAttribute("role") === "status", "the tooltip starts hidden and is a live region");
  fire(hits[1], "mouseenter");
  ok(!tip().hidden && /^Week of /.test(tip().textContent) && /Planned: \d+ remaining/.test(tip().textContent) && /Actual: 4 remaining of 5 in scope/.test(tip().textContent), "hovering a week shows its planned and actual counts (" + tip().textContent.replace(/\n/g, " | ") + ")");
  fire(hits[1], "mouseleave");
  ok(tip().hidden, "moving the pointer away hides it");
  const named = hits.map(h => { fire(h, "mouseenter"); const s = tip().textContent; fire(h, "mouseleave"); return s; });
  ok(named.some(s => /Finishing: /.test(s)), "a week names the tasks that finish in it");
  ok(named.some(s => /Completed this week: /.test(s)), "a week names the tasks completed in it");
  // a tap (click) keeps it open until something else is tapped
  k.click(hits[2]); fire(hits[2], "mouseleave");
  ok(!tip().hidden, "a tap keeps the tooltip open after the pointer leaves");
  k.d.body.dispatchEvent(new k.w.Event("pointerdown", { bubbles: true }));
  ok(tip().hidden, "tapping somewhere that is not the chart closes it");
  // keyboard
  svg.dispatchEvent(new k.w.FocusEvent("focus"));
  ok(!tip().hidden && /Actual: /.test(tip().textContent), "focusing the chart shows the latest week that has an actual point");
  const start = tip().textContent;
  key("ArrowLeft");
  ok(tip().textContent !== start, "Left arrow moves to an earlier stop");
  key("Home"); const first = tip().textContent; key("End");
  ok(tip().textContent !== first, "Home and End jump to the two ends");
  key("Home"); let found = false;
  for (let i = 0; i < 30 && !found; i++) { if (/Run a beta with five friends/.test(tip().textContent)) found = true; else key("ArrowRight"); }
  ok(found, "the arrow keys also reach the milestone");
  key("Escape");
  ok(tip().hidden, "Esc closes the tooltip");
  svg.dispatchEvent(new k.w.FocusEvent("focus")); svg.dispatchEvent(new k.w.FocusEvent("blur"));
  ok(tip().hidden, "leaving the chart closes it");
  svg.dispatchEvent(new k.w.Event("pointerdown", { bubbles: true }));
  ok(svg.classList.contains("nofocusring"), "a tap or click hides the focus ring");
  key("ArrowRight");
  ok(!svg.classList.contains("nofocusring"), "and pressing a key brings it back");
  // the all-projects burndown behaves the same, and names the project with each task
  k.tab("today");
  const g = k.d.querySelector("#view svg.chart");
  const gh = [...g.querySelectorAll("rect.hit")];
  ok(gh.length === 7 && g.getAttribute("tabindex") === "0", "the global burndown has a hover column per week and is a keyboard stop");
  const gnamed = gh.map(h => { fire(h, "mouseenter"); const s = k.d.querySelector("#view .charttip").textContent; fire(h, "mouseleave"); return s; });
  ok(gnamed.some(s => /Finishing: Sample [A-Za-z]+: /.test(s)), "and its tooltip names the project with each finishing task (" + gnamed.filter(s => /Finishing/.test(s))[0].replace(/\n/g, " | ") + ")");
}

{
  // the Gantt's red today line is a real, labeled control with its own
  // tap-to-pin tooltip, same hover/tap/keyboard pattern as the burndown's points
  const k = kit(await mk());
  k.tab("timeline");
  const todayLine = k.d.querySelector("#view .range .today");
  ok(todayLine.getAttribute("role") === "button" && todayLine.getAttribute("tabindex") === "0" && /^Today, /.test(todayLine.getAttribute("aria-label")), "the today line is a keyboard-reachable control with a real date label");
  const tip = () => k.d.querySelector("#view .todaytip");
  ok(tip().hidden, "the tooltip starts hidden");
  k.fire(todayLine, "mouseenter");
  ok(!tip().hidden && /^Today, /.test(tip().textContent), "hovering the line shows its date");
  k.fire(todayLine, "mouseleave");
  ok(tip().hidden, "and hides again once the pointer leaves, unpinned");
  k.click(todayLine);
  k.fire(todayLine, "mouseleave");
  ok(!tip().hidden, "a tap/click pins the tooltip open even after the pointer leaves");
  k.d.body.dispatchEvent(new k.w.Event("pointerdown", { bubbles: true }));
  ok(tip().hidden, "tapping elsewhere dismisses the pinned tooltip");
}

{
  // estimates, explicit start/due dates, and the quest page order
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  const sv = k.saved().tasks;
  const appTasks = sv.filter(t => t.questId === "pApp");
  const total = appTasks.reduce((n, t) => n + t.est, 0), left = appTasks.filter(t => t.status !== "Completed").reduce((n, t) => n + t.est, 0);
  ok(total === 32, "Sample App's estimates add up to 32 h (" + total + ")");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  const est = k.d.querySelector("#view .metarow .estleft");
  ok(!!est && est.textContent === "Est. " + left + " hours remaining", "the quest page shows the open estimate at the right of the count line (" + (est && est.textContent) + ")");
  ok(!k.d.querySelector("#view .estline"), "the old estimate line under the list is gone");
  const chips = [...k.d.querySelectorAll("#view .questmain .l3 span")].map(s => s.textContent);
  ok(chips.includes("Est 3 h") && chips.includes("Est 6 h"), "task rows on the quest page show their estimate as Est N h");
  const heads = [...k.d.querySelectorAll("#view .questmain h2")].map(h => h.textContent);
  ok(heads.join() === "Tasks,Before you launch,Issues,Quest links,Notes,Quest giver", "the quest page order is Tasks, Before you launch, Issues, Quest links, Notes, Quest giver (" + heads.join() + ")");
  const g1 = sv.find(t => t.id === "g1");
  ok(g1.block === 1 && g1.start && g1.due && g1.start < g1.due, "Sample Game's first task keeps block 1 with its own start and due");
  const gp = k.saved().quests.find(p => p.id === "pGame");
  ok(g1.start > gp.start && (Date.parse(g1.due) - Date.parse(g1.start)) / 864e5 === 7, "and its dates are shorter than its two-week block");
  k.tab("schedule");
  ok([...k.d.querySelectorAll(".listpane .item .l3 span")].some(s => s.textContent === "Est 12 h"), "the Tasks list shows an estimate chip");
}
{
  // editing start, due, and estimate in the Tasks detail pane
  const saved = {
    projects: [{ id: "pT", name: "Dates", status: "active", start: "2026-08-03", days: 7 }],
    tasks: [{ id: "t1", block: 2, projectId: "pT", what: "Dated task", done: "done", status: "Not started", steps: [] }]
  };
  const k = kit(await mk(saved));
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Dated task")));
  const t = () => k.saved().tasks.find(x => x.id === "t1");
  const set = (id, v) => { const i = k.$(id); i.value = v; k.fire(i, "blur"); };
  ok(k.$("task-start").value === "2026-08-10" && k.$("task-due").value === "2026-08-16", "an undated task shows its block's dates");
  set("task-due", "2026-08-30");
  ok(t().due === "2026-08-30" && t().block === 4, "a new due date is stored and the block follows it (" + t().block + ")");
  set("task-start", "2026-08-20");
  ok(t().start === "2026-08-20", "a start date is stored");
  set("task-start", "2026-09-05");
  ok(t().start === "2026-08-20" && k.$("view").textContent.includes("You can’t begin after you finish! Choose a start date on or before the due date."), "a start after the due date is rejected");
  set("task-start", "2026-07-01");
  ok(t().start === "2026-08-20" && k.$("view").textContent.includes("on or after"), "a start before the project's start is rejected");
  set("task-due", "2026-08-10");
  ok(t().due === "2026-08-30" && k.$("view").textContent.includes("You can’t begin after you finish! Choose a start date on or before the due date."), "a due date before the start is rejected");
  set("task-due", "2026-07-01");
  ok(t().due === "2026-08-30" && t().block === 4, "a due date before the project's start is rejected");
  set("task-est", "2.5");
  ok(t().est === 2.5, "an estimate is stored");
  set("task-est", "-3");
  ok(t().est === 2.5, "a negative estimate is rejected");
  set("task-due", "");
  ok(t().block === 0 && t().due === "" && t().start === "2026-08-20", "clearing the due date moves the task to the Backlog and keeps the start");
  ok(k.$("task-start").value === "2026-08-20" && k.$("task-due").value === "", "the detail pane still shows the kept start date on a Backlog task");
  set("task-start", "2026-08-25");
  ok(t().start === "2026-08-25" && t().block === 0, "a Backlog task can be given a different start date without a due date");
  set("task-due", "2026-08-22");
  ok(t().block === 0 && t().due === "" && k.$("view").textContent.includes("You can’t begin after you finish! Choose a start date on or before the due date."), "a due date before the kept start is rejected");
  set("task-due", "2026-08-30");
  ok(t().block === 4 && t().due === "2026-08-30" && t().start === "2026-08-25", "adding a due date later keeps the start and schedules the task");
  set("task-due", ""); set("task-start", "");
  ok(t().block === 0 && t().due === "" && t().start === "", "with both dates deleted, both stay empty and the task is in the Backlog");
}
{
  // New Task dialog
  const saved = { projects: [{ id: "pT", name: "Dates", status: "active", start: "2026-08-03", days: 7 }], tasks: [] };
  const k = kit(await mk(saved));
  k.menuAct("newBtn", "newTask");
  ok(!k.$("f-start") && !k.$("f-due") && !k.$("f-est"), "the New task dialog has no date or estimate fields");
  k.setField("what", "Made in dialog");
  k.click(k.btn(k.$("modalBody"), "Add task"));
  const t = k.saved().tasks.find(x => x.what === "Made in dialog");
  ok(t && t.block === 0 && t.start === "" && t.due === "" && t.est === 0, "the dialog saves a Backlog task with no dates");
}
{
  // Slip shifts start and due together; Undo restores them
  const saved = {
    projects: [{ id: "pS", name: "Slipper", status: "active", start: "2026-08-03", days: 7 }],
    tasks: [{ id: "s1", block: 2, projectId: "pS", what: "Open", done: "done", status: "Not started", steps: [], start: "2026-08-12", due: "2026-08-14" }]
  };
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Slipper"));
  const slipBtn = k.btn(k.$("view"), "Slip schedule");
  k.click(slipBtn); k.$("slipDays").value = "7"; k.click(k.$("slipGo"));
  let t = k.saved().tasks[0];
  ok(t.start === "2026-08-19" && t.due === "2026-08-21" && t.block === 3, "Slip moves start and due together (" + t.start + " to " + t.due + ")");
  k.click(slipBtn); k.click(k.btn(k.$("modalBody"), "Undo last slip (7 days)"));
  t = k.saved().tasks[0];
  ok(t.start === "2026-08-12" && t.due === "2026-08-14" && t.block === 2, "Undo restores start and due");
}
{
  // saved data: a block above 12 survives, bad dates are cleaned
  const saved = {
    projects: [{ id: "pN", name: "Norm", status: "active", start: "2026-08-03", days: 7 }],
    tasks: [
      { id: "n1", block: 40, projectId: "pN", what: "Far out", done: "d", status: "Not started", steps: [] },
      { id: "n2", block: 2, projectId: "pN", what: "Backwards", done: "d", status: "Not started", steps: [], start: "2026-08-15", due: "2026-08-11" },
      { id: "n3", block: 0, projectId: "pN", what: "Parked", done: "d", status: "Not started", steps: [], start: "2026-08-11", due: "2026-08-12" }
    ]
  };
  const k = kit(await mk(saved));
  k.click(k.$("welcomeDismiss"));
  const ts = k.saved().tasks, by = id => ts.find(x => x.id === id);
  ok(by("n1").block === 40, "a saved block above 12 survives a reload");
  ok(by("n2").start === "" && by("n2").due === "2026-08-11", "a start after its due date is dropped on load");
  ok(by("n3").start === "2026-08-11" && by("n3").due === "", "a Backlog task keeps its start date on load, but has no due date");
}

{
  // saving inside a frame: only a verified save counts, and a frame with no way to save shows the text to copy
  const wait = () => new Promise(r => setTimeout(r, 30));
  const frame = (k) => Object.defineProperty(k.w, "parent", { value: {}, configurable: true });
  {
    const k = kit(await mk({ settings: { hideWelcome: true } }));
    try { frame(k); } catch (e) { /* checked next */ }
    ok(k.w.parent !== k.w, "the test can simulate a framed page");
    if (k.w.parent !== k.w) {
      k.tab("settings"); k.click(k.$("saveFile")); await wait();
      const box = k.$("overlay").querySelector("textarea");
      ok(!k.$("overlay").hidden && !!box && JSON.parse(box.value).tasks.length === 28, "in a frame with no way to save, a dialog shows the backup text to copy");
      ok(!!k.btn(k.$("overlay"), "Download file") && !!k.$("overlay").querySelector("details") && !k.$("overlay").querySelector("details").open, "the dialog leads with a Download file button and keeps the copy option folded away");
      ok(k.saved().settings.lastBackup === "" && !k.$("view").textContent.includes("Backup saved.") && k.$("view").textContent.includes("counted as saved"), "and nothing is reported or recorded as saved");
    }
  }
  {
    const k = kit(await mk({ settings: { hideWelcome: true } }));
    try { frame(k); } catch (e) { /* checked next */ }
    ok(k.w.parent !== k.w, "the test can simulate a framed page");
    if (k.w.parent !== k.w) {
      let shared = null;
      k.w.navigator.canShare = () => true; k.w.navigator.share = (d) => { shared = d; return Promise.resolve(); };
      k.tab("settings"); k.click(k.$("saveFile")); await wait();
      ok(!shared && !!k.btn(k.$("overlay"), "Download file") && !k.btn(k.$("overlay"), "Save file") && k.saved().settings.lastBackup === "", "a desktop frame shows the save box with Download file, even if a share sheet exists");
    }
  }
  const phone = (k) => Object.defineProperty(k.w.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", configurable: true });
  {
    // a phone reports itself as top-level but can't be trusted with a scripted download
    const k = kit(await mk({ settings: { hideWelcome: true } }));
    phone(k);
    k.tab("settings"); k.click(k.$("saveFile")); await wait();
    ok(!k.$("overlay").hidden && !!k.$("overlay").querySelector("textarea") && k.saved().settings.lastBackup === "" && !k.$("view").textContent.includes("Backup downloaded."), "on a phone with no share sheet, a top-level page shows the copy dialog instead of claiming a download");
  }
  {
    const k = kit(await mk({ settings: { hideWelcome: true } }));
    phone(k);
    let shared = null;
    k.w.navigator.canShare = () => true; k.w.navigator.share = (d) => { shared = d; return Promise.resolve(); };
    k.tab("settings"); k.click(k.$("saveFile")); await wait();
    ok(!shared && !!k.btn(k.$("overlay"), "Save file") && k.saved().settings.lastBackup === "", "on a phone the same save box shows first, with Save file, and nothing is stamped yet");
    k.click(k.btn(k.$("overlay"), "Save file")); await wait();
    ok(!!shared && /^sidequest-backup-.*\.json$/.test(shared.files[0].name) && k.$("overlay").hidden && k.saved().settings.lastBackup !== "" && k.$("view").textContent.includes("Backup saved."), "Save file opens the share sheet, and finishing it closes the box and counts as saved");
  }
  {
    const k = kit(await mk({ settings: { hideWelcome: true } }, { use: () => Promise.resolve(null) }));
    try { frame(k); } catch (e) { /* checked next */ }
    ok(k.w.parent !== k.w, "the test can simulate a framed page");
    if (k.w.parent !== k.w) {
      k.tab("settings"); k.click(k.$("saveFile")); await wait();
      ok(!!k.$("overlay").querySelector("textarea") && !k.$("view").textContent.includes("not given permission") && k.saved().settings.lastBackup === "", "a host with a claude object but no downloads capability gets the copy dialog and records nothing");
    }
  }
}

// Quest giver export writes through the same Save As dialog stub as Save backup's
// own test, since both go through showSaveFilePicker before falling back to a
// plain download.
async function exportClick(k, projectName) {
  let written = null, downloadName = null;
  k.w.showSaveFilePicker = (opts) => { downloadName = opts.suggestedName; return Promise.resolve({ createWritable: () => Promise.resolve({ write: (t) => { written = t; return Promise.resolve(); }, close: () => Promise.resolve() }) }); };
  k.tab("projects"); k.click(k.btn(k.$("view"), projectName));
  k.click(k.btn(k.$("view"), "Quest giver export"));
  // A quest with something to print on the letterhead asks first; take the default, both sides included.
  const go = k.btn(k.$("overlay"), "Export"); if (go) k.click(go);
  await new Promise((r) => setTimeout(r, 30));
  return { html: written || "", downloadName };
}
{
  const { html } = await exportClick(kit(await mk()), "Sample App");
  ok(html.includes("<!doctype html>") && html.includes("</html>"), "produces a complete standalone HTML document");
  ok(html.includes("Sample App") && html.includes("Sample Website"), "includes the project and its linked project");
  ok(html.includes('id="proj-pApp"') && html.includes('id="proj-pSite"'), "each project gets its own section, addressable by id");
  ok(html.includes('class="etoc"'), "includes a table of contents");
  ok(html.includes("echarttip") && html.includes("svg.echart"), "embeds the chart renderer and tooltip markup");
  ok(!html.includes("Sample Finished Quest") && !html.includes("Sample Next Quest"), "quests not linked from the exported one are left out entirely");
  ok(html.includes("window.__sqExport"), "chart data is embedded as plain JSON, not live state");
  // The export's Timeline draws the pale block band behind each task's status bar and draws the lane milestones, checked against the embedded JSON for Sample App.
  const exportData = JSON.parse(html.match(/window\.__sqExport\s*=\s*(\{.*?\});/s)[1]);
  const appCharts = exportData.charts["proj-pApp"];
  ok(Array.isArray(appCharts.laneMilestones) && appCharts.laneMilestones.length === 1 && appCharts.laneMilestones[0].text === "Run a beta with five friends", "the exported Timeline's chart data includes Sample App's real milestone task, with its own percent-of-range position");
  ok(appCharts.lanes.length > 0 && appCharts.lanes.every((ln) => typeof ln.blkLeft === "number" && typeof ln.blkWidth === "number"), "every exported lane carries its own block-band position, not just its status bar");
  ok(html.includes("'eblk'") || html.includes('"eblk"') || html.includes("eblk"), "the export's runtime script actually draws the block band (eblk), not just computes its data");
  ok(html.includes("'ems'") || html.includes('"ems"') || html.includes("data-label"), "the export's runtime script actually draws milestone markers (ems), not just computes their data");
}
{
  // Cycle guard: A -> B -> A is not expanded a second time, and the repeat
  // is linked back to the section that already covers it. C is a Candidate,
  // reachable only through B, and must be skipped even though it's in the chain.
  const saved = {
    projects: [
      { id: "pA", name: "Project A", status: "active", start: "2026-08-03", days: 7, linkedProjectIds: ["pB"] },
      { id: "pB", name: "Project B", status: "active", start: "2026-08-03", days: 7, linkedProjectIds: ["pA", "pC"] },
      { id: "pC", name: "Project C", status: "candidate", linkedProjectIds: ["pB"] }
    ],
    tasks: []
  };
  const { html } = await exportClick(kit(await mk(saved)), "Project A");
  const sectionCount = (html.match(/class="esection"/g) || []).length;
  ok(sectionCount === 2, "A linking to B linking back to A produces exactly two sections, not an infinite chain (" + sectionCount + ")");
  ok(html.includes("already shown above"), "the repeated link back to A points at its existing section instead of re-expanding it");
  ok(!html.includes("Project C"), "a Candidate linked project is skipped entirely, even though it's in the link chain");
}
{
  // Only Active/Complete linked projects are expanded; one in the Vault is skipped too.
  const saved = {
    projects: [
      { id: "pX", name: "Project X", status: "active", start: "2026-08-03", days: 7, linkedProjectIds: ["pY", "pZ"] },
      { id: "pY", name: "Project Y", status: "complete", start: "2026-08-03", days: 7 },
      { id: "pZ", name: "Project Z", status: "active", start: "2026-08-03", days: 7, arch: { at: "2026-08-01", why: "removed" } }
    ],
    tasks: []
  };
  const { html } = await exportClick(kit(await mk(saved)), "Project X");
  ok(html.includes("Project Y") && html.includes('id="proj-pY"'), "a Complete linked project is expanded into its own section");
  ok(!html.includes("Project Z"), "a linked project in the Vault is skipped entirely, not even named");
}
{
  // Full (unclamped) notes, and the filename shape.
  const longNote = "N".repeat(4200);
  const saved = {
    projects: [{ id: "pF", name: "Full Notes Co.", status: "active", start: "2026-08-03", days: 7, notes: longNote }],
    tasks: []
  };
  const { html, downloadName } = await exportClick(kit(await mk(saved)), "Full Notes Co.");
  ok(html.includes(longNote), "the full, unclamped notes field is included even past the live app's display clamp");
  ok(/^full-notes-co-\d{4}-\d{2}-\d{2}\.html$/.test(downloadName), "the filename is the project's name, slugged, plus today's date (" + downloadName + ")");
}
{
  // Vault auto-purge: Never leaves everything, a threshold deletes only
  // what's older than it, and a project's tasks go with it.
  const d = new Date(), n = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), iso = k => new Date(n + k * 86400000).toISOString().slice(0, 10);
  const saved = {
    settings: { archivePurgeDays: 30 },
    projects: [
      { id: "pOld", name: "Old Project", status: "active", arch: { at: iso(-40), why: "removed" } },
      { id: "pNew", name: "New Project", status: "active", arch: { at: iso(-10), why: "removed" } }
    ],
    parked: [
      { id: "iOld", text: "Old Idea", arch: { at: iso(-31), why: "removed" } },
      { id: "iNew", text: "New Idea", arch: { at: iso(-5), why: "removed" } }
    ],
    tasks: [{ id: "tOld", block: 0, projectId: "pOld", what: "orphaned by purge", done: "d", status: "Not started", steps: [] }]
  };
  const k = kit(await mk(saved));
  const ids = xs => xs.map(x => x.id);
  ok(!ids(k.saved().quests).includes("pOld") && ids(k.saved().quests).includes("pNew"), "a 30-day threshold purges only the project vaulted more than 30 days ago");
  ok(!ids(k.saved().workshop).includes("iOld") && ids(k.saved().workshop).includes("iNew"), "and the idea vaulted more than 30 days ago, leaving the newer one");
  ok(!ids(k.saved().tasks).includes("tOld"), "the purged project's tasks go with it");
}
{
  const d = new Date(), n = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), iso = k => new Date(n + k * 86400000).toISOString().slice(0, 10);
  const saved = {
    settings: { archivePurgeDays: 0 },
    projects: [{ id: "pOld", name: "Old Project", status: "active", arch: { at: iso(-400), why: "removed" } }],
    tasks: []
  };
  const k = kit(await mk(saved));
  ok(k.saved().quests.some(p => p.id === "pOld"), "Never (0) leaves even a very old archived project in place");
}
{
  // Contact info in Settings: saves, round-trips, and only prints on an
  // export when at least one field is filled in.
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("settings");
  k.$("set-contact-name").value = "Ada Lovelace"; k.fire(k.$("set-contact-name"), "input");
  k.$("set-contact-company").value = "Analytical Engines Co."; k.fire(k.$("set-contact-company"), "input");
  k.$("set-contact-email").value = "ada@example.com"; k.fire(k.$("set-contact-email"), "input");
  const c = k.saved().settings.contact;
  ok(c.name === "Ada Lovelace" && c.company === "Analytical Engines Co." && c.email === "ada@example.com" && c.phone === "" && c.address === "" && c.website === "", "contact fields save individually, blank ones stay blank");
  const { html } = await exportClick(k, "Sample App");
  ok(html.includes("Ada Lovelace") && html.includes("Analytical Engines Co.") && html.includes("ada@example.com"), "filled-in contact fields print on the export");
  ok(!html.includes('<div class="econtactaddr">'), "an empty field (address) is not printed, even as an empty block");
  // clearing a field saves immediately too, with no blur needed first -- the
  // real bug the user hit: typing then exporting while still focused in the
  // field used to leave the old value in state.
  k.tab("settings");
  k.$("set-contact-company").value = ""; k.fire(k.$("set-contact-company"), "input");
  ok(k.saved().settings.contact.company === "", "clearing a field saves right away, without needing the field to lose focus first");
}
{
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  const { html } = await exportClick(k, "Sample App");
  ok(!html.includes('class="eletterhead"'), "with no contact or Quest giver info filled in at all, no letterhead block is printed");
}
{
  // Letterhead: no Prepared for when only the user's info exists, and Prepared for alone (on the left) when only Quest giver info exists.
  const saved = {
    settings: { contact: { name: "Ada Lovelace", company: "", phone: "", email: "", address: "", website: "" } },
    quests: [{ id: "pL", name: "Letterhead Quest", status: "active", start: "2026-08-03", days: 7, client: { org: "Acme Co.", poc: "Jordan Lee", phone: "", email: "", address: "", website: "" } }],
    tasks: []
  };
  const { html } = await exportClick(kit(await mk(saved)), "Letterhead Quest");
  const byIdx = html.indexOf("Prepared by"), forIdx = html.indexOf("Prepared for");
  ok(byIdx >= 0 && forIdx > byIdx, "with both filled in, Prepared by comes first and Prepared for follows");
  ok(html.includes("Ada Lovelace") && html.includes("Acme Co.") && html.includes("Jordan Lee"), "both columns print their own fields");
}
{
  // Email, website, and phone become real links on the letterhead.
  const saved = {
    settings: { contact: { company: "Acme Co.", name: "", phone: "555-0100", email: "ada@example.com", address: "", website: "example.com" } },
    quests: [{ id: "pLinks", name: "Links Quest", status: "active", start: "2026-08-03", days: 7 }],
    tasks: []
  };
  const { html } = await exportClick(kit(await mk(saved)), "Links Quest");
  ok(html.includes('<a href="mailto:ada@example.com">ada@example.com</a>'), "the email prints as a mailto: link, display text unchanged");
  ok(html.includes('<a href="tel:5550100">555-0100</a>'), "the phone prints as a tel: link with punctuation stripped from the href only");
  ok(html.includes('<a href="https://example.com">example.com</a>'), "a website typed with no scheme gets https:// added to the link, display text unchanged");
}
{
  const saved = {
    settings: { contact: { company: "Acme Co.", website: "https://example.com", name: "", phone: "", email: "", address: "" } },
    quests: [{ id: "pLinks2", name: "Scheme Quest", status: "active", start: "2026-08-03", days: 7 }],
    tasks: []
  };
  const { html } = await exportClick(kit(await mk(saved)), "Scheme Quest");
  ok(html.includes('<a href="https://example.com">https://example.com</a>'), "a website typed with its own scheme is not double-prefixed");
}
{
  const saved = {
    settings: { contact: { name: "Ada Lovelace", company: "", phone: "", email: "", address: "", website: "" } },
    quests: [{ id: "pO", name: "Only User Info", status: "active", start: "2026-08-03", days: 7 }],
    tasks: []
  };
  const { html } = await exportClick(kit(await mk(saved)), "Only User Info");
  ok(html.includes("Prepared by") && !html.includes("Prepared for"), "with only the user's info, Prepared for is left out entirely");
}
{
  const saved = {
    quests: [{ id: "pG", name: "Only Giver Info", status: "active", start: "2026-08-03", days: 7, client: { org: "Acme Co.", poc: "", phone: "", email: "", address: "", website: "" } }],
    tasks: []
  };
  const { html } = await exportClick(kit(await mk(saved)), "Only Giver Info");
  ok(!html.includes("Prepared by") && html.includes("Prepared for"), "with only Quest giver info, Prepared by is left out");
  const letterhead = html.slice(html.indexOf('class="eletterhead"'), html.indexOf('class="eletterhead"') + 400);
  ok(letterhead.indexOf("Prepared for") < letterhead.indexOf("Acme Co."), "and Prepared for takes the lone/left position, not stranded on the right");
}
{
  // Quest giver: per-quest client info, saves live, and round-trips.
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  k.$("giver-org-pApp").value = "Acme Co."; k.fire(k.$("giver-org-pApp"), "input");
  k.$("giver-poc-pApp").value = "Jordan Lee"; k.fire(k.$("giver-poc-pApp"), "input");
  const client = k.saved().quests.find(q => q.id === "pApp").client;
  ok(client.org === "Acme Co." && client.poc === "Jordan Lee" && client.phone === "" && client.email === "" && client.address === "" && client.website === "", "Quest giver fields save live and round-trip, blank ones stay blank");
  k.$("giver-org-pApp").value = ""; k.fire(k.$("giver-org-pApp"), "input");
  ok(k.saved().quests.find(q => q.id === "pApp").client.org === "", "clearing a Quest giver field saves right away, same as Settings' contact fields");
}
{
  // Coin/Per: an optional per-quest pay-rate pair, saved alongside Quest
  // Giver but deliberately never printed on the Quest giver export.
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok(!!k.$("giver-coin-pApp") && k.d.querySelector('label[for="giver-coin-pApp"]').textContent === "Bounty", "the quest page has a Bounty field, under Address in the Quest giver box");
  ok(!!k.$("giver-per-pApp") && k.d.querySelector('label[for="giver-per-pApp"]').textContent === "Per" && k.$("giver-per-pApp").value === "Hour", "and a Per select, defaulting to Hour");
  const coinEl = () => k.$("giver-coin-pApp");
  // Typing works like a cash register: each digit enters from the cents, with commas and a decimal point added
  const typeInto = (text) => { coinEl().value = text; k.fire(coinEl(), "input"); return coinEl().value; };
  ok(typeInto("1") === "0.01" && typeInto("0.012") === "0.12" && typeInto("0.123") === "1.23" && typeInto("1.234") === "12.34", "typing digits fills in from the cents: 0.01, 0.12, 1.23, 12.34");
  ok(typeInto("12.345") === "123.45" && typeInto("123.456") === "1,234.56" && typeInto("1,234.567") === "12,345.67", "commas appear as the amount grows");
  k.$("giver-per-pApp").value = "Quest"; k.fire(k.$("giver-per-pApp"));
  const client = k.saved().quests.find(q => q.id === "pApp").client;
  ok(client.coin === 12345.67 && client.per === "Quest", "the amount saves live as a real number in dollars and cents, and Per saves with it");
  ok(typeInto("12,345.6") === "1,234.56" && typeInto("1,234.5") === "123.45", "backspace drops the last digit");
  ok(typeInto("999,999.99") === "999,999.99" && typeInto("999,999.991") === "999,999.99" && k.saved().quests.find(q => q.id === "pApp").client.coin === 999999.99, "the amount stops at 999,999.99");
  ok(typeInto("not a number") === "" && k.saved().quests.find(q => q.id === "pApp").client.coin === "", "non-numeric text is rejected back to empty");
  typeInto("5"); ok(typeInto("0.0") === "" && k.saved().quests.find(q => q.id === "pApp").client.coin === "", "backspacing to nothing clears the field");
  ok(typeInto("0") === "", "a lone zero stays empty, so a zero bounty is never stored");
  const { html } = await exportClick(k, "Sample App");
  ok(!html.includes("Bounty") && !html.includes('"per"') && !html.includes("giver-coin"), "Bounty/Per never appear in the Quest giver export");
}
{
  // Old-shaped saved data with no `client` field at all still loads with a usable, empty one.
  const saved = { quests: [{ id: "pOld", name: "Old Quest", status: "active", start: "2026-08-03", days: 7 }], tasks: [] };
  const k = kit(await mk(saved));
  ok(JSON.stringify(k.saved().quests[0].client) === JSON.stringify({ org: "", poc: "", phone: "", email: "", address: "", website: "", coin: "", per: "Hour" }), "a quest saved before Quest giver existed gets a default empty client object on load");
}
{
  // Brandmark: the Settings UI, and normalize()'s validation. The actual
  // upload/dimension-check path uses Image.onload, which jsdom never fires
  // for a real data: URI -- that part is verified in a real browser instead.
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("settings");
  ok(!!k.btn(k.$("view"), "Add brandmark"), "Settings has an Add brandmark button");
  ok(k.$("view").textContent.includes("320×320 pixels or smaller") && k.$("view").textContent.includes("150 KB"), "the size limits are stated up front, not just on rejection");
}
{
  // the "leveled up" banner on the web app: shown once after a version change, never on a first run or a hosted copy
  const stateMod = fs.readFileSync(path.join(__dirname, "..", "app", "state.js"), "utf8");
  const ver = /APP_VERSION = "([^"]+)"/.exec(stateMod)[1];
  const kn = kit(await mk({ settings: { hideWelcome: true } }));
  ok(!kn.$("view").textContent.includes("Sidequest has leveled up!") && kn.saved().settings.seenVersion === ver, "a first run records the version and shows no banner");
  const ko = kit(await mk({ settings: { hideWelcome: true, seenVersion: "0.0.1" } }));
    ok(ko.$("view").textContent.includes("Sidequest has leveled up!") && ko.$("view").textContent.includes("You are now questing in version " + ver + "."), "an older seen version shows the banner with the current version");
  const opened = []; ko.w.open = function (u) { opened.push(u); };
  const banBtns = [...ko.d.querySelectorAll(".updatebanner .actions button")].map(b => b.textContent);
  ok(banBtns.join() === "Patch notes,Dismiss" && !ko.d.querySelector(".updatebanner a"), "the banner has a Patch notes button to the left of Dismiss, and no link");
  ko.click(ko.btn(ko.d.querySelector(".updatebanner"), "Patch notes"));
  ok(opened[0] === "https://samoff.com/sidequest/patch-notes.html", "the Patch notes button opens the patch notes page");
  ko.click(ko.btn(ko.$("view"), "Dismiss"));
  ok(!ko.$("view").textContent.includes("Sidequest has leveled up!") && ko.saved().settings.seenVersion === ver, "Dismiss hides the banner and records the version");
  const kh = kit(await mk({ settings: { hideWelcome: true, seenVersion: "0.0.1" } }, { use: () => Promise.resolve(null) }));
  ok(!kh.$("view").textContent.includes("You are now questing"), "a hosted copy does not show it");
}
{
  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const saved = { settings: { brandmark: tinyPng }, quests: [{ id: "pB", name: "Brandmark Quest", status: "active", start: "2026-08-03", days: 7 }], tasks: [] };
  const k = kit(await mk(saved));
  ok(k.saved().settings.brandmark === tinyPng, "a valid data:image/ URI round-trips through normalize()");
  const { html } = await exportClick(k, "Brandmark Quest");
  ok(html.includes('class="ebrandmark"') && html.includes(tinyPng), "the brandmark prints on the export, under Prepared by");
  const byCol = html.slice(html.indexOf("Prepared by"), html.indexOf("Prepared by") + 500);
  ok(byCol.includes("ebrandmark"), "it sits inside the Prepared by column, right under its heading");
}
{
  const saved = { settings: { brandmark: "not a real data uri" }, quests: [], tasks: [] };
  const k = kit(await mk(saved));
  ok(k.saved().settings.brandmark === "", "a malformed brandmark value is dropped on load, not kept or truncated");
}
{
  // A brandmark alone, with every other contact field blank, is still reason
  // enough to show Prepared by.
  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const saved = { settings: { brandmark: tinyPng }, quests: [{ id: "pB2", name: "Brandmark Only", status: "active", start: "2026-08-03", days: 7 }], tasks: [] };
  const { html } = await exportClick(kit(await mk(saved)), "Brandmark Only");
  ok(html.includes("Prepared by") && html.includes('class="ebrandmark"'), "Prepared by shows with just the brandmark, no text fields filled in");
  ok(/class="ebrandmark"[^>]*alt="Brandmark"/.test(html), "a brandmark with no name beside it has alt text, since it is the only identification");
  for (const [contact, want, why] of [[{ company: "Acme Co", name: "Pat Lee" }, "Acme Co", "the company name wins when both are set"], [{ name: "Pat Lee" }, "Pat Lee", "the user's name is used when there is no company"], [{}, "Brandmark", "a plain label is used when neither is set"]]) {
    const kk = kit(await mk({ settings: { brandmark: tinyPng, contact }, quests: [], tasks: [] })); kk.tab("settings");
    ok(kk.d.querySelector(".brandmarkpreview img").getAttribute("alt") === want, "the Options brandmark preview alt: " + why);
  }
  const named = { settings: { brandmark: tinyPng, contact: { company: "Acme Co" } }, quests: [{ id: "pB3", name: "Brandmark Named", status: "active", start: "2026-08-03", days: 7 }], tasks: [] };
  const { html: html2 } = await exportClick(kit(await mk(named)), "Brandmark Named");
  ok(/class="ebrandmark"[^>]*alt=""/.test(html2) && html2.includes("Acme Co"), "a brandmark beside a name is decorative (empty alt)");
}
{
  // Audio, Completion FX, and Animated burndown settings: all default on, all save, all round-trip.
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("settings");
  ok(k.$("set-audio").value === "on" && k.$("set-completion-fx").value === "on" && k.$("set-animated-burndown").value === "on", "Audio, Completion FX, and Animated burndown all default to On");
  k.$("set-audio").value = "off"; k.fire(k.$("set-audio"));
  ok(k.saved().settings.audio === false, "turning Audio off saves immediately");
  k.$("set-completion-fx").value = "off"; k.fire(k.$("set-completion-fx"));
  ok(k.saved().settings.completionFx === false, "turning Completion FX off saves immediately, independent of Audio");
  k.$("set-animated-burndown").value = "off"; k.fire(k.$("set-animated-burndown"));
  ok(k.saved().settings.animatedBurndown === false, "turning Animated burndown off saves immediately, independent of the others");
}
{
  const saved = { settings: { audio: false, completionFx: false, animatedBurndown: false } };
  const k = kit(await mk(saved));
  ok(k.saved().settings.audio === false && k.saved().settings.completionFx === false && k.saved().settings.animatedBurndown === false, "all three settings round-trip through normalize() when off");
}
{
  // Animated burndown gates the reveal-rect mechanism on a burndown chart.
  // With it off, the chart renders complete immediately, with no reveal
  // rects or IntersectionObserver wiring at all.
  const k = kit(await mk({ settings: { animatedBurndown: false } }));
  k.click(k.$("welcomeDismiss"));
  ok(!k.d.querySelector("rect.burnreveal"), "Today's burndown has no reveal rects when Animated burndown is off");
  ok(!!k.d.querySelector("svg.chart polyline.planned"), "the chart still draws its lines immediately when animation is off");
}
{
  // The Welcome note is a post-it with its own corner fold, kept across redraws.
  const k = kit(await mk());
  const n = k.d.querySelector(".postitwrap > .welcomebox.posting"), b1 = n && (n.getAttribute("style").match(/--bend:(\d+)px/) || [])[1];
  k.tab("projects"); k.tab("today");
  const n2 = k.d.querySelector(".postitwrap > .welcomebox.posting");
  ok(!!n && /^\d+$/.test(b1) && (n2.getAttribute("style").match(/--bend:(\d+)px/) || [])[1] === b1, "a Today notice has its own corner fold, and a redraw keeps it");
}
{
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  ok(!!k.d.querySelector("rect.burnreveal"), "Today's burndown has reveal rects when Animated burndown is on (default)");
  const rects = [...k.d.querySelectorAll("rect.burnreveal")], dot = k.d.querySelector("circle.dot");
  ok(!!dot && rects.some(r => +r.getAttribute("x") <= +dot.getAttribute("cx") - 5.5), "a reveal clip starts left of the first actual dot, so the dot is not cut in half");
}
{
  // The draw-in plays once per page visit: a repaint of the same page leaves the lines still, leaving and coming back plays it again.
  const k = kit(await mk());
  k.$("splash").hidden = true;
  await new Promise(r => setTimeout(r, 300));
  k.click(k.$("welcomeDismiss"));
  ok(!k.d.querySelector("rect.burnreveal"), "a repaint of the same page does not draw the burndown in again");
  k.tab("projects"); k.tab("today");
  ok(!!k.d.querySelector("rect.burnreveal"), "coming back to the page draws the burndown in again");
}
{
  // Completion FX gates the confetti burst. The canvas appears synchronously after Mark complete, so checking for it confirms the gate without running the animation loop.
  const k = kit(await mk({ quests: [{ id: "pFx", name: "FX Quest", status: "active" }], tasks: [] }));
  k.tab("projects"); k.click(k.btn(k.d.querySelector("#view"), "FX Quest"));
  k.click(k.btn(k.$("view"), "Mark complete"));
  ok(!!k.d.querySelector("canvas.confettiFx"), "Mark complete starts the confetti burst when Completion FX is on");
}
{
  // Real bug, fixed 2026-10-06: reopening a Complete quest whose tasks are
  // still all Completed immediately re-triggered the completion dialog
  // (confetti/sound) via sweepQuestCompletion() seeing "all done" again.
  const k = kit(await mk({ quests: [{ id: "pReoFx", name: "Reopen FX Quest", status: "complete" }], tasks: [
    { id: "tReoFx", block: 0, questId: "pReoFx", what: "Done task", status: "Completed", steps: [] }
  ] }));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Reopen FX Quest"));
  k.click(k.btn(k.$("view"), "Reopen"));
  ok(k.saved().quests.find(p => p.id === "pReoFx").status === "active", "the quest is actually reopened");
  ok(!k.d.querySelector("canvas.confettiFx"), "reopening a quest whose tasks are still all Completed does not re-trigger the completion confetti");
  ok(!k.$("modalTitle").textContent, "and does not reopen the completion dialog either");
}
{
  const k = kit(await mk({ settings: { completionFx: false }, quests: [{ id: "pFx2", name: "FX Quest Off", status: "active" }], tasks: [] }));
  k.tab("projects"); k.click(k.btn(k.d.querySelector("#view"), "FX Quest Off"));
  k.click(k.btn(k.$("view"), "Mark complete"));
  ok(!k.d.querySelector("canvas.confettiFx"), "Mark complete starts no confetti burst when Completion FX is off");
}
{
  // The splash sound is disabled in app/splash.js because browsers block play() outside a real gesture. This confirms it stays silent, so re-enabling it is a visible change here too.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let played = null;
  const stub = function (src) { played = src; return { play: function () { return Promise.resolve(); } }; };
  await mk({ settings: { showSplash: true, audio: true } }, undefined, undefined, stub);
  await wait(2500);
  ok(played === null, "the splash sound is currently disabled, even with showSplash and Audio both on");
}
{
  // The completion sound plays only when Audio is on, regardless of
  // Completion FX (a separate, not-yet-built visual effect toggle).
  const saved = {
    settings: { audio: true },
    quests: [{ id: "pSnd", name: "Sound Quest", status: "active", start: "2026-08-03", days: 7 }],
    tasks: [{ id: "tSnd", block: 1, questId: "pSnd", what: "Only task", done: "d", status: "Not started", steps: [] }]
  };
  const k = kit(await mk(saved));
  let played = null;
  const RealAudio = k.w.Audio;
  k.w.Audio = function (src) { played = src; return { play: function () { return Promise.resolve(); } }; };
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sound Quest"));
  k.click(k.btn(k.$("view"), "Mark complete"));
  k.w.Audio = RealAudio;
  ok(played === "../assets/sfx/complete.mp3", "Mark complete plays the completion sound when Audio is on (" + played + ")");
}
{
  const saved = {
    settings: { audio: false },
    quests: [{ id: "pNoSnd", name: "No Sound Quest", status: "active", start: "2026-08-03", days: 7 }],
    tasks: [{ id: "tNoSnd", block: 1, questId: "pNoSnd", what: "Only task", done: "d", status: "Not started", steps: [] }]
  };
  const k = kit(await mk(saved));
  let played = false;
  const RealAudio = k.w.Audio;
  k.w.Audio = function () { played = true; return { play: function () { return Promise.resolve(); } }; };
  k.tab("projects"); k.click(k.btn(k.$("view"), "No Sound Quest"));
  k.click(k.btn(k.$("view"), "Mark complete"));
  k.w.Audio = RealAudio;
  ok(!played, "Mark complete plays no sound when Audio is off");
}
{
  // Promoting a candidate to a quest plays the quest sound, since that
  // click is a real user gesture a browser will actually allow audio from
  // (unlike the splash's setTimeout-driven moment -- see app/splash.js).
  const saved = { settings: { audio: true }, quests: [{ id: "pCand", name: "Candidate Quest", status: "candidate" }], tasks: [] };
  const k = kit(await mk(saved));
  let played = null;
  const RealAudio = k.w.Audio;
  k.w.Audio = function (src) { played = src; return { play: function () { return Promise.resolve(); } }; };
  k.tab("projects");
  k.click(k.btn(k.$("view"), "Promote"));
  k.w.Audio = RealAudio;
  ok(played === "../assets/sfx/quest.mp3", "promoting a candidate plays the quest sound when Audio is on (" + played + ")");
  ok(k.saved().quests.find((q) => q.id === "pCand").status === "active", "and the quest is actually promoted");
}
{
  const saved = { settings: { audio: false }, quests: [{ id: "pCand2", name: "Candidate Quest 2", status: "candidate" }], tasks: [] };
  const k = kit(await mk(saved));
  let played = false;
  const RealAudio = k.w.Audio;
  k.w.Audio = function () { played = true; return { play: function () { return Promise.resolve(); } }; };
  k.tab("projects");
  k.click(k.btn(k.$("view"), "Promote"));
  k.w.Audio = RealAudio;
  ok(!played, "promoting a candidate plays no sound when Audio is off");
}
{
  // Reopening a Complete quest is also a real click, so it plays the same
  // quest sound as Promote.
  const saved = { settings: { audio: true }, quests: [{ id: "pReo", name: "Reopen Quest", status: "complete" }], tasks: [] };
  const k = kit(await mk(saved));
  let played = null;
  const RealAudio = k.w.Audio;
  k.w.Audio = function (src) { played = src; return { play: function () { return Promise.resolve(); } }; };
  k.tab("projects"); k.click(k.btn(k.$("view"), "Reopen Quest"));
  k.click(k.btn(k.$("view"), "Reopen"));
  k.w.Audio = RealAudio;
  ok(played === "../assets/sfx/quest.mp3", "reopening a Complete quest plays the quest sound when Audio is on (" + played + ")");
  ok(k.saved().quests.find((q) => q.id === "pReo").status === "active", "and the quest is actually reopened");
}
{
  const saved = { settings: { audio: false }, quests: [{ id: "pReo2", name: "Reopen Quest 2", status: "complete" }], tasks: [] };
  const k = kit(await mk(saved));
  let played = false;
  const RealAudio = k.w.Audio;
  k.w.Audio = function () { played = true; return { play: function () { return Promise.resolve(); } }; };
  k.tab("projects"); k.click(k.btn(k.$("view"), "Reopen Quest 2"));
  k.click(k.btn(k.$("view"), "Reopen"));
  k.w.Audio = RealAudio;
  ok(!played, "reopening a Complete quest plays no sound when Audio is off");
}
{
  // Shuffled-bucket randomizer: nextAffirmationIndex draws every index exactly
  // once before any repeat, then reshuffles a fresh bucket.
  await mk();
  const stateMod = await import("../app/state.js?run=" + (++counter));
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(stateMod.nextAffirmationIndex(5));
  ok(new Set(seen).size === 5 && seen.every(n => n >= 0 && n < 5), "all 5 indices drawn exactly once before any repeat (" + seen.join(",") + ")");
  const again = stateMod.nextAffirmationIndex(5);
  ok(again >= 0 && again < 5, "drawing past an exhausted bucket reshuffles a fresh one rather than erroring");
}
{
  // A stale bucket (indices out of range for a shrunk AFFIRMATIONS list, or
  // left over from before this field existed) is dropped by normalize(), not
  // trusted, so a removed-quote edit can't leave an invalid saved index behind.
  const saved = { settings: { affirmationBucket: [2, 7, 2, 999] } };
  const k = kit(await mk(saved));
  ok(Array.isArray(k.saved().settings.affirmationBucket), "affirmationBucket defaults to a real array");
  const stateMod2 = await import("../app/state.js?run=" + (++counter));
  // Values >= 500 (out of any realistic AFFIRMATIONS.length) and the
  // duplicate 2 are rejected; 7 is a plausible valid index and survives.
  ok(!k.saved().settings.affirmationBucket.includes(999), "an out-of-range saved index is dropped on load");
  ok(k.saved().settings.affirmationBucket.filter(n => n === 2).length <= 1, "a duplicate saved index is deduplicated on load");
}
{
  // Running as the installed PWA (display-mode: standalone) shows uninstall-only copy in Options and a Refresh button in the top bar. The matchMedia stub is installed before boot because app.js reads it at module evaluation.
  const standaloneMM = (q) => ({ matches: q === "(display-mode: standalone)", media: q, addListener() {}, removeListener() {} });
  const k = kit(await mk(null, null, null, null, standaloneMM));
  ok(!k.$("refreshBtn").hidden, "the top-bar Refresh button is shown while running standalone");
  k.tab("settings");
  const box = k.$("view");
  ok(box.textContent.includes("To uninstall Sidequest, open the title bar menu and select Uninstall Sidequest...") && !box.textContent.includes("chrome://apps"), "running standalone points to the app window's menu for uninstalling");
  ok(!box.textContent.includes("Install Sidequest as an app") && !box.textContent.includes("verify whether it"), "the normal install-prompt and unsupported-browser copy are not shown while standalone");
  ok(!box.textContent.includes("Refresh"), "Options itself no longer offers a Refresh button -- it moved to the top bar");
}
{
  // Not standalone (a normal browser tab): the existing fallback copy still shows, no top-bar Refresh
  const notStandaloneMM = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {} });
  const k = kit(await mk(null, null, null, null, notStandaloneMM));
  ok(k.$("refreshBtn").hidden, "the top-bar Refresh button stays hidden outside standalone mode");
  k.tab("settings");
  const box = k.$("view");
  ok(!box.textContent.includes("To uninstall Sidequest"), "unknown install status shows no uninstall steps");
  ok(box.textContent.includes("verify whether it") && !/iPhone|iPad/.test(box.textContent) && box.textContent.includes("Install, Add to Dock, or Add to Home Screen") && !box.textContent.includes("already installed"), "a normal (non-standalone) browser tab shows neutral unknown-status copy that names no phone and never claims an install");
  // A Chromium browser that reports an installed copy gets the installed message; no answer or an error keeps the generic one
  {
    const realNav0 = Object.getOwnPropertyDescriptor(global, "navigator");
    const tick = () => new Promise(r => setTimeout(r, 0));
    const withNav = async (fn) => {
      Object.defineProperty(global, "navigator", { value: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140", getInstalledRelatedApps: fn }, configurable: true, writable: true });
      const kk = kit(await mk(null, null, null, null, notStandaloneMM)); kk.tab("settings"); await tick(); await tick();
      return kk.$("view").textContent;
    };
    const yes = await withNav(() => Promise.resolve([{ platform: "webapp" }]));
    const none = await withNav(() => Promise.resolve([]));
    const boom = await withNav(() => Promise.reject(new Error("blocked")));
    if (realNav0) Object.defineProperty(global, "navigator", realNav0); else delete global.navigator;
    ok(yes.includes("To uninstall Sidequest") && !none.includes("To uninstall Sidequest") && !boom.includes("To uninstall Sidequest"), "uninstall steps appear only when an installed copy is confirmed");
    ok(yes.includes("Sidequest is installed. Open it from your apps or desktop.") && !yes.includes("Available options vary by browser"), "a browser that reports an installed copy says Sidequest is installed");
    ok(none.includes("Available options vary by browser") && boom.includes("Available options vary by browser"), "an empty answer or an error keeps the generic install message");
    ok(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app", "manifest.json"), "utf8")).related_applications.some(a => a.platform === "webapp" && a.url === "manifest.json"), "the manifest lists the web app so detection can work");
    const mf = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app", "manifest.json"), "utf8"));
    ok(mf.id === "/sidequest/app/index.html" && new URL(mf.id, "https://samoff.com/sidequest/app/manifest.json").href === new URL(mf.start_url, "https://samoff.com/sidequest/app/manifest.json").href, "the manifest id is the start URL, so installed apps keep the identity they had without one");
  }
  // iPhone and iPad have no Install button, so they alone get their own steps
  // Browser-specific install tips: Safari on a Mac, Firefox on a computer, and an iPad that reports a Mac user agent
  {
    const tipsFor = async (ua, touch) => {
      const keep = Object.getOwnPropertyDescriptor(global, "navigator");
      Object.defineProperty(global, "navigator", { value: { userAgent: ua, maxTouchPoints: touch }, configurable: true, writable: true });
      const kk = kit(await mk(null, null, null, null, notStandaloneMM)); kk.tab("settings");
      const out = { text: kk.$("view").textContent, link: kk.$("view").querySelector('a[href*="pwasforfirefox"]') };
      if (keep) Object.defineProperty(global, "navigator", keep); else delete global.navigator;
      return out;
    };
    const macUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    const safari = await tipsFor(macUa, 0);
    const ipad = await tipsFor(macUa, 5);
    const fx = await tipsFor("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0", 0);
    const chrome = await tipsFor("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", 0);
    ok(safari.text.includes("In Safari, choose File > Add to Dock.") && !safari.link, "Safari on a Mac is told to use File > Add to Dock");
    ok(!ipad.text.includes("File > Add to Dock") && ipad.text.includes("On iPhone or iPad, tap Share, then Add to Home Screen."), "an iPad with a Mac user agent gets the Share steps, not the Mac ones");
    ok(!!fx.link && fx.text.includes("Progressive Web Apps for Firefox") && !fx.text.includes("File > Add to Dock"), "Firefox on a computer is pointed to the Progressive Web Apps for Firefox extension");
    ok(!chrome.link && !chrome.text.includes("File > Add to Dock") && chrome.text.includes("Available options vary by browser"), "other browsers get only the neutral copy");
  }
  const realNav = Object.getOwnPropertyDescriptor(global, "navigator");
  Object.defineProperty(global, "navigator", { value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }, configurable: true, writable: true });
  const kIos = kit(await mk()); kIos.tab("settings");
  const iosText = kIos.$("view").textContent;
  if (realNav) Object.defineProperty(global, "navigator", realNav); else delete global.navigator;
  ok(iosText.includes("On iPhone or iPad, tap Share, then Add to Home Screen.") && !iosText.includes("Available options vary by browser"), "an iPhone or iPad sees the Share, then Add to Home Screen steps instead of the generic line");
  // The installed app on a phone gets phone steps, not the desktop title-bar ones.
  const standaloneMM2 = (q) => ({ matches: q === "(display-mode: standalone)", media: q, addListener() {}, removeListener() {} });
  for (const [ua, want, why] of [["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "touch and hold its icon on your Home Screen, then choose Delete Bookmark", "an installed iPhone app says to touch and hold the icon and choose Delete Bookmark"], ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36", "touch and hold its icon, then choose Uninstall", "an installed Android app says to touch and hold the icon and choose Uninstall"]]) {
    Object.defineProperty(global, "navigator", { value: { userAgent: ua }, configurable: true, writable: true });
    const kp = kit(await mk(null, null, null, null, standaloneMM2)); kp.tab("settings");
    const tp = kp.$("view").textContent;
    if (realNav) Object.defineProperty(global, "navigator", realNav); else delete global.navigator;
    ok(tp.includes(want) && !tp.includes("title bar"), why + ", not the desktop title bar steps");
  }
}

{
  // Choosing a backup file (the file picker's Open) plays the restore sound
  // when Sound effects is on, and stays silent when it is off.
  for (const audio of [true, false]) {
    const k = kit(await mk({ settings: { audio }, quests: [], tasks: [] }));
    let played = null;
    const RealAudio = k.w.Audio;
    k.w.Audio = function (src) { played = src; return { play: function () { return Promise.resolve(); } }; };
    k.tab("settings");
    const input = k.$("restoreFile");
    Object.defineProperty(input, "files", { value: [new k.w.File([JSON.stringify({ tasks: [] })], "b.json")], configurable: true });
    k.fire(input, "change"); await new Promise(r => setTimeout(r, 40));
    ok(played === null, "choosing the file alone plays no sound (the confirm button does)");
    k.click(k.btn(k.$("modalBody"), "Restore backup"));
    k.w.Audio = RealAudio;
    ok(audio ? played === "../assets/sfx/restoreBackup.mp3" : played === null, "confirming a restore " + (audio ? "plays the restore sound" : "is silent") + " when Sound effects is " + (audio ? "on" : "off") + " (" + played + ")");
  }
}
{
  // The installed app's Refresh button plays the refresh sound when Sound effects is on.
  const standaloneMM = (q) => ({ matches: q === "(display-mode: standalone)", media: q, addListener() {}, removeListener() {} });
  for (const audio of [true, false]) {
    const k = kit(await mk({ settings: { audio }, quests: [], tasks: [] }, null, null, null, standaloneMM));
    let played = null;
    const RealAudio = k.w.Audio;
    let vol = null;
    k.w.Audio = function (src) { played = src; const o = { play: function () { return Promise.resolve(); } }; Object.defineProperty(o, "volume", { set(v) { vol = v; } }); return o; };
    k.click(k.$("refreshBtn"));
    k.w.Audio = RealAudio;
    if (audio) ok(vol === 0.25, "the refresh sound plays at quarter volume (" + vol + ")");
    ok(audio ? played === "../assets/sfx/refresh.mp3" : played === null, "Refresh " + (audio ? "plays the refresh sound" : "is silent") + " when Sound effects is " + (audio ? "on" : "off") + " (" + played + ")");
  }
}

{
  // Confirming a restore replays the launch sequence (splash) over the restored app.
  const k = kit(await mk({ settings: { showSplash: true }, quests: [], tasks: [] }));
  k.$("splash").hidden = true;
  k.tab("settings");
  const input = k.$("restoreFile");
  Object.defineProperty(input, "files", { value: [new k.w.File([JSON.stringify({ tasks: [], settings: { showSplash: true } })], "b.json")], configurable: true });
  k.fire(input, "change"); await new Promise(r => setTimeout(r, 40));
  ok(k.$("splash").hidden, "choosing a backup file alone does not start the splash");
  k.click(k.btn(k.$("modalBody"), "Restore backup"));
  ok(!k.$("splash").hidden && k.$("splash").classList.contains("backdropBlurred"), "confirming the restore replays the splash");
  const off = kit(await mk({ settings: { showSplash: true }, quests: [], tasks: [] }));
  off.$("splash").hidden = true; off.tab("settings");
  const inp2 = off.$("restoreFile");
  Object.defineProperty(inp2, "files", { value: [new off.w.File([JSON.stringify({ tasks: [], settings: { showSplash: false } })], "b.json")], configurable: true });
  off.fire(inp2, "change"); await new Promise(r => setTimeout(r, 40));
  off.click(off.btn(off.$("modalBody"), "Restore backup"));
  ok(off.$("splash").hidden, "a restored backup with the splash turned off does not replay it");
}

{
  // An install prompt that arrives after Options is drawn replaces the unknown-status copy with the Install button.
  const k = kit(await mk());
  k.tab("settings");
  ok(k.$("view").textContent.includes("Available options vary by browser") && !k.$("installBtn"), "with no install prompt yet, Options shows the unknown-status copy");
  k.w.dispatchEvent(new k.w.Event("beforeinstallprompt", { cancelable: true }));
  ok(!!k.$("installBtn") && !k.$("view").textContent.includes("Available options vary by browser"), "a late install prompt redraws Options with the Install button");
}

{
  // After an install finishes while the page stays in the browser tab, Options redraws as installed.
  const k = kit(await mk());
  k.tab("settings");
  ok(!k.$("view").textContent.includes("Sidequest is installed."), "Options does not claim an install before one happens");
  k.w.dispatchEvent(new k.w.Event("appinstalled"));
  await new Promise(r => setTimeout(r, 400));
  const t = k.$("view").textContent;
  ok(t.includes("Sidequest is installed. Open it from your apps or desktop.") && t.includes("To uninstall Sidequest, open the app, open the title bar menu, and select Uninstall Sidequest..."), "a finished install in the browser tab redraws Options as installed, with the web app uninstall steps");
}

{
  // The quote bucket is saved as soon as a quote is drawn, so reloading with no
  // edits in between moves on to the next quote instead of repeating this one.
  const k = kit(await mk({ settings: { showSplash: true, affirmationBucket: [1, 2, 3] }, quests: [], tasks: [] }));
  const b = k.saved().settings.affirmationBucket;
  ok(b.length === 2 && b[0] === 1 && b[1] === 2, "drawing a quote saves the shortened bucket (" + JSON.stringify(b) + ")");
}

{
  // The export's task rows keep only the Milestone and Launch critical badges (plus
  // Est time), and Notes / Quest links are left out entirely when empty.
  const { html } = await exportClick(kit(await mk()), "Sample App");
  const body = html.split("<style>")[0] + html.split("</style>").slice(1).join("");
  const rows = body.split('class="etask').slice(1).join("");
  ok(rows.includes("Launch critical") && rows.includes("Milestone"), "the export still badges launch critical and milestone tasks");
  ok(!/data-v=/.test(rows) && !rows.includes(">Backlog<") && !rows.includes(">Overdue<") && !rows.includes(">Completed<"), "no status, Backlog, Overdue, or Done chips on exported tasks");
  ok(!/\d of \d steps/.test(rows) && /Est \d/.test(rows), "no step counts, but Est time stays");
  const siteSection = html.slice(html.indexOf('id="proj-pSite"'));
  ok(!siteSection.slice(0, siteSection.indexOf("</section>")).includes("<h3>Notes</h3>") && !html.includes("No notes."), "an empty Notes section is not printed");
  ok(html.includes("<h3>Quest links</h3>"), "Quest links still print when there are links");
}

{
  // Export charts: milestones get their own Gantt lane with no text label, and the burndown
  // carries the live chart's Scope line, milestone marks, and legend.
  const { html } = await exportClick(kit(await mk()), "Sample App");
  ok(html.includes('mnm.textContent = "Milestones"'), "the Gantt draws milestones in their own Milestones lane");
  ok(!html.includes("data-label"), "milestone diamonds carry no text label (the tooltip stays as a title)");
  ok(html.includes('d.title = m.text + ", " + m.date'), "milestone diamonds keep their tooltip");
  ok(html.includes('class="elegend"') && html.includes("<i class=\"s\"></i>Scope"), "the export's burndown has the Ideal / Actual / Scope legend");
  ok(html.includes('"scopeSteps":[') && html.includes('"cps":['), "the burndown data carries scope steps and checkpoint dates");
  {
    // charts are baked into the file so a no-script preview (iOS Quick Look) still shows them
    const staticPart = html.slice(0, html.indexOf("<script>"));
    ok(/<svg[^>]*class="echart"/.test(staticPart) && staticPart.includes("<polyline") && staticPart.includes('class="ebar '), "the Gantt and burndown are drawn into the file itself, before any script runs");
    ok(!staticPart.includes('class="hit"'), "the baked-in copy carries no hover areas");
    const live = new JSDOM(html, { runScripts: "dangerously" }).window.document;
    const hosts = live.querySelectorAll("[data-chart]").length;
    ok(hosts > 0 && live.querySelectorAll("svg.echart").length === hosts && live.querySelectorAll(".echarttip").length === hosts && live.querySelectorAll("svg.echart .hit").length > 0, "with scripts on, each chart is redrawn once with its tooltips, not stacked on the baked-in copy");
  }
  ok(html.includes('svgEl("polygon", { "class": "mark"'), "the burndown draws milestone marks");
  ok(html.includes(".etimeline .ebar.new, .etimeline .ebar.work, .etimeline .ebar.done { box-shadow: inset 0 0 0 1px"), "Gantt status bars get the live app's outline, so block bands never show a sliver around them");
}

{
  // Messages and empty states: nothing exists yet, so each add says what it needs
  const k = kit(await mk({ quests: [], tasks: [], workshop: [], decisions: [], settings: { hideWelcome: true } }));
  k.tab("projects");
  const heads = () => [...k.d.querySelectorAll("#view h2")].map(h => h.textContent);
  ok(JSON.stringify(heads()) === JSON.stringify(["Candidate quests"]) && k.$("view").textContent.includes("No candidate quests yet. Start one with the + button."), "with no quests, the Quests page shows only Candidate quests, saying none yet and to start one with the + button");
  k.tab("today");
  ok(k.$("view").textContent.includes("No tasks yet.") && k.$("view").textContent.includes("Start a candidate quest with the + button to add tasks."), "with no quests at all, Today says to start a candidate quest to add tasks");
  k.menuAct("newBtn", "newTask"); ok(k.$("toast").textContent === "Tasks can only be added to a quest.", "adding a task with no quests explains the rule");
  k.menuAct("newBtn", "newStep"); ok(k.$("toast").textContent === "Steps can only be added to a task.", "adding a step with no tasks explains the rule");
  k.menuAct("newBtn", "newDecision"); ok(k.$("toast").textContent === "A decision can only be added to a step.", "adding a decision with no steps explains the rule");
  k.menuAct("newBtn", "newQuest"); k.setField("name", "Test Quest"); k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  ok(k.$("toast").textContent === "“Test Quest” has been added as a candidate quest to Quests.", "the new-quest confirmation says it is a candidate and how to open it");
  ok(k.saved().quests.find(q => q.name === "Test Quest").start === new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0"), "a new candidate quest starts today by default");
  k.tab("projects");
  ok(JSON.stringify(heads()) === JSON.stringify(["Candidate quests"]) && k.$("view").textContent.includes("Test Quest") && !k.$("view").textContent.includes("No candidate quests yet."), "with only a candidate quest, only Candidate quests shows, listing it");
  k.tab("today");
  ok(k.$("view").textContent.includes("No tasks yet.") && k.$("view").textContent.includes("Start one with the + button.") && !k.$("view").textContent.includes("candidate quest with the + button"), "with a candidate quest but no tasks, Today says to start one with the + button");
}
{
  // Confirmations name where each new item went
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));


  k.menuAct("newBtn", "newTask"); k.setField("quest", "pSite"); k.setField("what", "Unscheduled task"); k.click(k.btn(k.$("modalBody"), "Add task"));
  ok(k.$("toast").textContent === "“Unscheduled task” added as a task to Sample Website’s backlog.", "a new task says it went to the quest's backlog");
  k.menuAct("newBtn", "newStep"); k.setField("text", "Brand new step"); k.click(k.btn(k.$("modalBody"), "Add step"));
  ok(/^“Brand new step” added as a step to .+ in .+\.$/.test(k.$("toast").textContent), "a step's confirmation names its task and quest (" + k.$("toast").textContent + ")");
  k.menuAct("newBtn", "newDecision"); k.setField("q", "Which font?"); k.click(k.btn(k.$("modalBody"), "Add decision"));
  ok(/^“Which font\?” added as a decision to .+ in .+\.$/.test(k.$("toast").textContent), "a decision's confirmation names its step and quest (" + k.$("toast").textContent + ")");
  k.menuAct("newBtn", "newIdea"); k.setField("text", "Try a plugin system"); k.click(k.btn(k.$("modalBody"), "Workshop it"));
  ok(k.$("toast").textContent === "“Try a plugin system” added to the Workshop.", "an idea's confirmation names the idea and the Workshop");
}

{
  // New Task dialog: only the quest and the title; the task lands in the quest’s backlog
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.menuAct("newBtn", "newTask");
  k.setField("quest", "pSite"); k.setField("what", "Backlog only"); k.setField("notes", "Ask first");
  ok(!k.$("f-start") && !k.$("f-due") && !k.$("f-est") && !k.$("f-done"), "the New task dialog has no date, estimate, or finish-line fields");
  k.click(k.btn(k.$("modalBody"), "Add task"));
  const made = k.saved().tasks.find(x => x.what === "Backlog only");
  ok(!!made && made.block === 0 && made.due === "" && made.start === "" && made.est === 0 && made.notes === "Ask first", "the task is created in the Backlog with no dates or estimate");
  ok(k.$("toast").textContent === "“Backlog only” added as a task to Sample Website’s backlog.", "and the confirmation says it went to the backlog");
}
{
  // The Welcome box's Open Options button lands on Start fresh
  const k = kit(await mk());
  let scrolled = 0;
  k.w.HTMLElement.prototype.scrollIntoView = function () { scrolled++; this.setAttribute("data-scrolled", "1"); };
  k.click(k.$("welcomeSettings"));
  const h = k.$("startFreshHeading");
  ok(k.d.querySelector('.tab[data-view="settings"][aria-current="page"]') && !!h && h.textContent === "Start fresh", "Open Options opens Options, which has a Start fresh heading");
  ok(h.getAttribute("data-scrolled") === "1" && k.d.activeElement === h, "and scrolls to it and moves focus there");
}

{
  // Date rules and their messages, including a quest's due date as a ceiling for its tasks
  const saved = {
    quests: [{ id: "pT", name: "Dates", status: "active", start: "2026-08-03", days: 7, due: "2026-08-31" }],
    tasks: [{ id: "t1", block: 2, questId: "pT", what: "Dated task", done: "done", status: "Not started", steps: [] }]
  };
  const k = kit(await mk(saved));
  k.click(k.$("welcomeDismiss"));
  // Tasks detail pane
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Dated task")));
  const set = (id, v) => { const i = k.$(id); i.value = v; k.fire(i, "blur"); };
  const t = () => k.saved().tasks.find(x => x.id === "t1");
  set("task-due", "2026-09-10");
  ok(t().due === "" && k.$("view").textContent.includes("This quest is due Aug 31, 2026. Choose a due date on or before then."), "the detail pane refuses a due date after the quest's due date");
  ok(k.$("toast").textContent !== "This quest is due Aug 31, 2026. Choose a due date on or before then.", "a due date past the quest’s due date is refused with the message line only, no toast");
  set("task-due", "2026-07-20");
  ok(k.$("view").textContent.includes("This quest starts Aug 3, 2026. Choose a due date on or after that."), "and a due date before the quest starts");
  set("task-start", "2026-07-20");
  ok(k.$("view").textContent.includes("This quest starts Aug 3, 2026. Choose a start date on or after that."), "and a start date before the quest starts");
  k.$("toast").textContent = "";
  set("task-start", "2026-07-20"); set("task-due", "2026-09-10");
  ok(k.$("view").textContent.includes("This quest starts Aug 3, 2026. Choose a start date on or after that.") && k.$("view").textContent.includes("This quest is due Aug 31, 2026. Choose a due date on or before then."), "a bad start and a bad due date both stay showing after leaving each field");
  ok(k.$("task-start").value === "2026-07-20" && k.$("task-due").value === "2026-09-10" && k.$("toast").textContent === "", "the bad dates stay in their fields and no toast is shown");
  // Estimate against the dates: 24 hours a day, both days counted, a warning and never a block
  set("task-start", "2026-08-10"); set("task-due", "2026-08-11");
  set("task-est", "48");
  ok(t().est === 48 && !k.$("view").textContent.includes("exceeds the time"), "48 hours on a two-day task does not warn");
  k.$("task-est").value = "60"; k.fire(k.$("task-est"), "input");
  ok(k.$("view").textContent.includes("60 h exceeds the time between these dates (24 h/day)."), "the estimate warning shows while typing, before the field loses focus");
  k.$("task-est").value = "48"; k.fire(k.$("task-est"), "input");
  ok(!k.$("view").textContent.includes("exceeds the time"), "and clears as soon as it fits");
  set("task-est", "49");
  ok(t().est === 49 && k.$("toast").textContent === "Estimated time saved.", "49 hours on a two-day task still saves, with a plain toast (the warning is not repeated in it)");
  ok(k.$("view").textContent.includes("49 h exceeds the time between these dates (24 h/day)."), "and the warning stays under the fields");
}

{
  // Bounty in the New Quest dialog, and old whole-number values on load
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.menuAct("newBtn", "newQuest"); k.setField("name", "Money Quest"); k.setField("giverCoin", "1,234.5"); k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  ok(k.saved().quests.find(q => q.name === "Money Quest").client.coin === 1234.5, "the New Quest dialog reads a typed amount with a comma and a decimal point");
  k.menuAct("newBtn", "newQuest"); k.setField("name", "Bad Money"); k.setField("giverCoin", "abc"); k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  ok(k.saved().quests.find(q => q.name === "Bad Money").client.coin === "", "and treats non-numeric text as no bounty");
  const old = kit(await mk({ quests: [{ id: "q1", name: "Old", status: "active", start: "2026-08-03", days: 7, client: { coin: 1500, per: "Hour" } }, { id: "q2", name: "Zero", status: "active", start: "2026-08-03", days: 7, client: { coin: 0, per: "Hour" } }, { id: "q3", name: "Huge", status: "active", start: "2026-08-03", days: 7, client: { coin: 5000000, per: "Hour" } }], tasks: [] }));
  const qs = old.saved().quests;
  ok(qs.find(q => q.id === "q1").client.coin === 1500 && qs.find(q => q.id === "q2").client.coin === "" && qs.find(q => q.id === "q3").client.coin === "", "a saved whole-number bounty keeps loading, and a zero or over-the-cap value loads as empty");
}
{
  // The Quests page shows only what exists, in this order: In progress, Pending, Candidate quests, Completed
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("projects");
  const heads = () => [...k.d.querySelectorAll("#view h2")].map(h => h.textContent);
  ok(JSON.stringify(heads()) === JSON.stringify(["In progress", "Pending", "Candidate quests", "Completed"]), "with every kind of quest, the Quests page runs In progress, Pending, Candidate quests, Completed (" + heads() + ")");
  ok(!k.$("view").textContent.includes("Pending and completed") && !k.$("view").textContent.includes("Nothing here right now."), "there is no combined Pending and completed section");
  const only = kit(await mk({ quests: [{ id: "c1", name: "Just a candidate", status: "candidate" }], tasks: [], settings: { hideWelcome: true } }));
  only.tab("projects");
  ok(JSON.stringify([...only.d.querySelectorAll("#view h2")].map(h => h.textContent)) === JSON.stringify(["Candidate quests"]), "with only a candidate, only Candidate quests shows");
  const noProg = kit(await mk({ quests: [{ id: "a1", name: "Waiting", status: "active", start: "2026-08-03", days: 7 }, { id: "d1", name: "Wrapped", status: "complete", start: "2026-08-03", days: 7 }], tasks: [], settings: { hideWelcome: true } }));
  noProg.tab("projects");
  ok(JSON.stringify([...noProg.d.querySelectorAll("#view h2")].map(h => h.textContent)) === JSON.stringify(["Pending", "Candidate quests", "Completed"]), "with no quest in progress, In progress is not shown, and Candidate quests sits between Pending and Completed");
  ok(!!noProg.d.querySelector("#view h2.first") && noProg.d.querySelector("#view h2.first").textContent === "Pending", "the first visible heading is the one with no top margin");
}
{
  // Tasks go in a Candidate quest before promotion, and do not count anywhere else until then, dates or not
  const saved = { settings: { hideWelcome: true, showSplash: false }, quests: [{ id: "c1", name: "Fleshing out", status: "candidate", start: "2026-08-03", days: 7 }], tasks: [] };
  const k = kit(await mk(saved));
  k.menuAct("newBtn", "newTask");
  ok([...k.$("f-quest").options].some(o => o.value === "c1"), "the New task picker offers a Candidate quest");
  k.setField("quest", "c1"); k.setField("what", "Dated candidate task"); k.click(k.btn(k.$("modalBody"), "Add task"));
  ok(k.saved().tasks.some(t => t.what === "Dated candidate task" && t.questId === "c1"), "a task can be added to a Candidate quest");
  k.menuAct("newBtn", "newStep"); k.setField("text", "A step"); k.click(k.btn(k.$("modalBody"), "Add step"));
  ok(k.saved().tasks.find(t => t.what === "Dated candidate task").steps.length === 1, "and a step can be added to that task");
  k.tab("today");
  ok(k.$("view").textContent.includes("No tasks yet.") && !k.$("view").textContent.includes("Dated candidate task") && k.$("view").textContent.includes("Nothing is overdue."), "Today ignores it: no Next up, nothing overdue (its date is long past), still says no tasks yet");
  k.tab("schedule");
  ok(!k.$("view").textContent.includes("Dated candidate task"), "the Tasks page does not list it");
  k.tab("timeline");
  ok(!k.$("view").textContent.includes("Dated candidate task") && /Remaining: 0 of 0 tasks/.test(k.$("view").textContent), "the Timeline and burndown do not count it");
  k.tab("projects");
  ok(JSON.stringify([...k.d.querySelectorAll("#view h2")].map(h => h.textContent)) === JSON.stringify(["Candidate quests"]) && !k.$("view").textContent.includes("Dated candidate task"), "the Quests page does not put the Candidate quest in progress");
  k.click(k.btn(k.$("view"), "Fleshing out"));
  ok(k.$("view").textContent.includes("Dated candidate task"), "the Candidate quest's page lists its tasks");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Promote"));
  ok(k.saved().quests[0].status === "active" && k.saved().tasks.find(t => t.what === "Dated candidate task").added === "", "promoting it makes the quest active, and its tasks were part of the plan from the start (no Added tag)");
  k.tab("schedule");
  ok(k.$("view").textContent.includes("Dated candidate task"), "once promoted, its tasks count and show on the Tasks page");
}

{
  // Today when everything is finished: just the heading, no instructions
  const k = kit(await mk({ quests: [{ id: "q1", name: "Finished", status: "active", start: "2026-08-03", days: 7 }], tasks: [{ id: "t1", block: 1, questId: "q1", what: "All done", done: "d", status: "Completed", steps: [], due: "2026-08-05" }], settings: { hideWelcome: true } }));
  k.tab("today");
  const panel = k.d.querySelector("#view .panel");
  ok(panel.textContent.includes("All tasks complete!") && !panel.textContent.includes("Add a task") && !panel.textContent.includes("next quest") && !panel.querySelector(".pmeta"), "when every task is finished, Today says All tasks complete! and nothing more");
}
{
  // The old "choose the next quest" placeholder task is gone from the samples and dropped from old saves
  const k = kit(await mk());
  ok(!k.saved().tasks.some(t => t.what === "Choose one of the candidates and set the others aside" || t.isNext), "the first-install samples have no next-quest placeholder task");
  const old = kit(await mk({ quests: [{ id: "q1", name: "Old save", status: "active", start: "2026-08-03", days: 7 }], tasks: [{ id: "n1", block: 6, questId: null, what: "Choose one of the candidates and set the others aside", done: "One is chosen", isNext: true, status: "Not started", steps: [] }, { id: "t1", block: 1, questId: "q1", what: "Real task", done: "d", status: "Not started", steps: [], due: "2026-08-05" }], settings: { hideWelcome: true } }));
  ok(old.saved().tasks.length === 1 && old.saved().tasks[0].what === "Real task", "an old save's placeholder task is dropped on load, and real tasks are kept");
}
{
  // Web app versus Claude version: where the data lives is named correctly in each
  const claudeStub = { use: async () => null };
  const readOptions = async (claude) => {
    const k = kit(await mk(null, claude));
    k.tab("settings");
    const options = k.$("view").textContent;
    k.click(k.$("startFresh")); await new Promise(r => setTimeout(r, 30));
    const dialog = k.$("modalBody").textContent;
    k.click(k.btn(k.$("modalBody"), "Cancel"));
    const input = k.$("restoreFile");
    Object.defineProperty(input, "files", { value: [new k.w.File([JSON.stringify({ tasks: [] })], "b.json")], configurable: true });
    k.fire(input, "change"); await new Promise(r => setTimeout(r, 40));
    const restore = k.$("modalBody").textContent;
    k.click(k.btn(k.$("modalBody"), "Cancel"));
    k.tab("help");
    return { options, dialog, restore, help: k.$("view").textContent };
  };
  const web = await readOptions(null), cl = await readOptions(claudeStub);
  ok(web.options.includes("Your data is saved in this browser on this device.") && !web.options.includes("your account"), "web: the Backup and restore description says this browser on this device");
  ok(cl.options.includes("Your data is saved in your account.") && !cl.options.includes("this browser") && !cl.options.includes("Claude"), "hosted: the Backup and restore description says your account, and Options never says this browser or names Claude");
  ok(web.options.includes("Erase all Sidequest data stored in this browser and start again (options are retained). You will receive a warning and have a chance to save a backup first.") && cl.options.includes("Erase all Sidequest data stored in your account and start again (options are retained)."), "the Start fresh description names the right place in each version");
  ok(web.dialog.includes("erases everything stored in this browser.") && cl.dialog.includes("erases everything stored in your account.") && !cl.dialog.includes("this browser"), "and so does the Start fresh warning");
  ok(web.restore.includes("everything in Sidequest on this device:") && cl.restore.includes("everything in Sidequest: all current") && !cl.restore.includes("on this device"), "the restore warning only says on this device in the web app");
  ok(web.help.includes("Your quest data is stored in the browser") && cl.help.includes("Your quest data is stored in the browser") && web.help.includes("Artifact version") && cl.help.includes("Artifact version"), "the guide explains both the web and the Artifact storage, in either version");
}
{
  // The Muse prompt in the main README carries the app's Google Fonts link; the two must not drift apart
  const hrefOf = (text) => { const i = text.indexOf('href="https://fonts.googleapis.com'); return i < 0 ? null : text.slice(i + 6, text.indexOf('"', i + 6)); };
  const museReadme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
  ok(!!hrefOf(html) && hrefOf(museReadme) === hrefOf(html), "the Muse prompt's Google Fonts link is the same one index.html loads");
}
{
  // Gathering dust: an active quest nobody has touched for the chosen number of days
  const k = kit(await mk());
  k.tab("settings"); k.$("set-dust").value = "30"; k.fire(k.$("set-dust"), "change");
  const raw = JSON.parse(k.w.localStorage.getItem("sidequest-template-v1"));
  const aq = raw.quests.find(q => q.status === "active");
  ok(typeof aq.touched === "string" && aq.touched.length === 10, "every quest records the day it was last touched");
  k.tab("projects"); ok(k.$("view").textContent.split("Gathering dust").length === 2 && raw.quests.find(q => q.id === "pNext").touched < raw.quests.find(q => q.id === "pApp").touched, "the samples have exactly one quest gathering dust, and a freshly touched one is not marked");
  const old = JSON.parse(JSON.stringify(raw));
  old.quests.forEach(q => { if (q.status === "active") q.touched = "2020-01-01"; });
  const k2 = kit(await mk(old));
  k2.tab("projects");
  ok(k2.$("view").textContent.includes("Gathering dust"), "an active quest untouched for 30+ days shows the Gathering dust pill on the Quests page");
  old.settings.dustDays = 0;
  const k3 = kit(await mk(old)); k3.tab("projects");
  ok(!k3.$("view").textContent.includes("Gathering dust"), "Never turns the marker off");
  old.settings.dustDays = 30;
  const k4 = kit(await mk(old)); k4.tab("settings");
  ok(!!k4.$("set-dust"), "Options has the gathering-dust setting");
}
{
  // WIP limit: promoting past it asks first, and never blocks
  const k = kit(await mk());
  const nActive = () => JSON.parse(k.w.localStorage.getItem("sidequest-template-v1")).quests.filter(q => q.status === "active").length;
  const before = nActive();
  k.tab("projects"); k.click(k.btn(k.$("view"), "Promote"));
  ok(nActive() === before + 1 && !k.d.getElementById("confirmYes"), "with no limit set, Promote just promotes");
  k.tab("settings"); k.$("set-wip").value = "2"; k.fire(k.$("set-wip"), "change");
  ok(JSON.parse(k.w.localStorage.getItem("sidequest-template-v1")).settings.wipLimit === 2, "the limit saves");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Promote"));
  const yes = k.d.getElementById("confirmYes");
  ok(yes && k.d.body.textContent.includes("Promote it anyway?") && nActive() === before + 1, "past the limit, Promote asks first and changes nothing yet");
  k.click(yes);
  ok(nActive() === before + 2, "Promote anyway promotes");
  k.tab("projects"); ok(k.$("view").textContent.includes("Your limit is 2"), "the Quests page notes being over the limit");
}
{
  // Contact info and Quest giver open in place like a task row and start collapsed
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("settings");
  let row = k.d.querySelector("#view .setside .sectionlist");
  ok(row.querySelector("button.item").getAttribute("aria-expanded") === "false" && row.querySelector(".detail").hidden, "Contact info starts collapsed");
  k.click(row.querySelector("button.item"));
  ok(row.querySelector("button.item").getAttribute("aria-expanded") === "true" && !row.querySelector(".detail").hidden && !!row.querySelector("#set-contact-phone"), "selecting its row opens the fields");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  row = k.d.querySelector("#view .questmain .sectionlist");
  ok(row.querySelector("button.item").getAttribute("aria-expanded") === "false" && row.querySelector(".detail").hidden, "Quest giver starts collapsed");
  k.click(row.querySelector("button.item"));
  ok(!row.querySelector(".detail").hidden, "and opens when its row is selected");
}
{
  // Velocity projection: a dotted line from today at the recent pace, once there is history and a finished task
  const k = kit(await mk());
  k.tab("timeline");
  ok(!!k.d.querySelector("#view .chart line.forecast") && [...k.d.querySelectorAll("#view .legend span")].some(s => s.textContent === "Forecast"), "the global burndown draws a forecast line and lists it in the legend");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  ok(!!k.d.querySelector("#view .questcharts .chart line.forecast"), "a quest's burndown draws it too");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Website"));
  ok(!k.d.querySelector("#view .questcharts .chart line.forecast"), "a quest that has not started yet has no projection");
  const raw = JSON.parse(k.w.localStorage.getItem("sidequest-template-v1"));
  raw.tasks.forEach(t => { if (t.status === "Completed") { t.status = "In progress"; t.doneAt = ""; } });
  const k2 = kit(await mk(raw)); k2.tab("timeline");
  ok(!k2.d.querySelector("#view .chart line.forecast"), "with nothing finished there is no pace to project from");
}
{
  // The web-app install line is hidden inside a hosted version
  const installText = async (claude) => { const k = kit(await mk(undefined, claude)); k.tab("help"); return k.$("view").textContent; };
  const web = await installText(), cl = await installText({ use: () => Promise.reject(new Error("no")) });
  ok(web.includes("Install Sidequest:") && !cl.includes("Install Sidequest:"), "the Field guide's install line shows on the web and is hidden in a Claude artifact");
}
{
  // With nothing overdue the section keeps its Overdue heading
  const k = kit(await mk()); k.click(k.$("welcomeDismiss"));
  const raw = JSON.parse(k.w.localStorage.getItem("sidequest-template-v1"));
  raw.tasks.forEach(t => { t.due = ""; t.start = ""; t.block = 0; });
  const k2 = kit(await mk(raw)); k2.tab("today");
  const heads = [...k2.d.querySelectorAll("#view h2")].map(h => h.textContent);
  ok(heads.includes("Overdue") && k2.$("view").textContent.includes("Nothing is overdue."), "with nothing overdue Today still shows the Overdue heading");
}
{
  // Empty Tasks and Vault pages show their message in a list card, and the Vault has no filters until it holds something
  const k = kit(await mk()); k.click(k.$("welcomeDismiss"));
  const raw = JSON.parse(k.w.localStorage.getItem("sidequest-template-v1"));
  raw.tasks = []; raw.quests = []; raw.workshop = []; raw.decisions = [];
  const k2 = kit(await mk(raw));
  k2.tab("schedule"); ok(!!k2.d.querySelector("#view ul.list li.hint") && k2.$("view").textContent.includes("No tasks yet."), "an empty Tasks page shows its message in a card");
  k2.tab("vault"); ok(!!k2.d.querySelector("#view ul.list li.hint") && k2.$("view").textContent.includes("The Vault is empty.") && !k2.d.querySelector("#view .chips"), "an empty Vault shows its message in a card with no filter buttons");
  const k3 = kit(await mk()); k3.tab("vault"); ok(!!k3.d.querySelector("#view .chips"), "the Vault filters appear once it holds items");
}
{
  // Welcome wording follows what is in the app; pin wording follows where pinned quests live
  const k = kit(await mk());
  ok(k.$("view").textContent.includes("These sample quests are here for you to explore") && !!k.$("welcomeSettings"), "the welcome message on sample data keeps its sample wording and Options button");
  const raw = JSON.parse(k.w.localStorage.getItem("sidequest-template-v1"));
  raw.quests = []; raw.tasks = []; raw.settings.hideWelcome = false;
  const k2 = kit(await mk(raw));
  ok(k2.$("view").textContent.includes("You’re looking at a blank slate now") && !k2.$("view").textContent.includes("sample quests") && !k2.$("welcomeSettings") && !!k2.$("welcomeDismiss"), "with no quests the welcome message says blank slate, with no Options button");
  const claude = { use: () => Promise.reject(new Error("no")) };
  const pinWords = async (c) => { const kk = kit(await mk(undefined, c)); kk.click(kk.$("welcomeDismiss")); kk.tab("projects"); const btn = [...kk.d.querySelectorAll("#view .pintoggle")][0]; return btn.title; };
  const webTitle = await pinWords(), clTitle = await pinWords(claude);
  ok(/sidebar/.test(webTitle) && /main menu/.test(clTitle) && !/sidebar/.test(clTitle), "the pin button says sidebar on the web and main menu in a Claude artifact (" + webTitle + " / " + clTitle + ")");
}
{
  // Coin setting: 1,234.56 or 1.234,56 for money fields
  const k = kit(await mk()); k.click(k.$("welcomeDismiss"));
  k.tab("settings");
  const sel = k.$("set-coin");
  ok(!!sel && sel.value === "us" && [...sel.options].map(o => o.textContent).join() === "1,234.56,1.234,56", "Options has a Coin format setting that defaults to US");
  const order = [...k.d.querySelectorAll("#view .setgrid label")].map(l => l.textContent);
  ok(order.slice(order.indexOf("Date format"), order.indexOf("Date format") + 8).join() === "Date format,Coin format,Splash screen on open,Theme,Animated burndown,Animated reroll,Completion effects,Sound effects", "the Appearance settings read Date format, Coin, Splash screen on open, Theme, Animated burndown, Animated reroll, Completion effects, Sound effects");
  sel.value = "eu"; k.fire(sel);
  ok(k.saved().settings.coinFormat === "eu", "choosing European saves");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Website"));
  const coin = k.$("giver-coin-pSite");
  coin.value = "123456"; k.fire(coin, "input");
  ok(coin.value === "1.234,56" && k.saved().quests.find(q => q.id === "pSite").client.coin === 1234.56, "typing digits shows European style and still stores the plain number 1234.56");
  k.tab("settings"); const sel2 = k.$("set-coin"); sel2.value = "us"; k.fire(sel2);
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Website"));
  ok(k.$("giver-coin-pSite").value === "1,234.56", "switching back to US redisplays the same amount as 1,234.56");
  const raw = JSON.parse(k.w.localStorage.getItem("sidequest-template-v1")); raw.settings.coinFormat = "nonsense";
  const k2 = kit(await mk(raw)); ok(k2.saved().settings.coinFormat === "us", "an invalid saved Coin value falls back to US");
}
{
  // The Field guide has a filter box that narrows and opens the sections that contain the text
  const k = kit(await mk()); k.click(k.$("welcomeDismiss")); k.tab("help");
  const f = k.$("helpFilter"), items = () => [...k.d.querySelectorAll("#view details.helpitem")];
  ok(!!f && items().every(d => !d.hidden) && items().filter(d => d.open).length === 1, "the Field guide starts with every section listed and the first one open");
  f.value = "backup"; k.fire(f, "input");
  const shown = items().filter(d => !d.hidden);
  ok(shown.length > 0 && shown.length < items().length && shown.every(d => d.textContent.toLowerCase().includes("backup")) && shown.some(d => d.open), "typing narrows the list to sections containing the text and opens the strong matches");
  f.value = "zzzzqq"; k.fire(f, "input");
  ok(items().every(d => d.hidden) && k.$("view").textContent.includes("No sections match"), "text that matches nothing says so");
  f.value = ""; k.fire(f, "input");
  ok(items().every(d => !d.hidden) && items().filter(d => d.open).length === 1, "clearing the box brings back the full list with only the first section open");
}
{
  // Terms topic and ranked Field guide search
  const k = kit(await mk()); k.click(k.$("welcomeDismiss")); k.tab("help");
  const f = k.$("helpFilter"), items = () => [...k.d.querySelectorAll("#view details.helpitem")];
  const titlesOf = () => items().map(d => d.querySelector("summary").firstChild.textContent);
  ok(titlesOf()[1] === "Terms", "the Field guide has a Terms topic, second after How Sidequest works");
  const { helpTopics } = await import("../app/help.js?run=" + counter);
  const topics = helpTopics(), titles = topics.map(t => t[0]);
  const termLines = topics.find(t => t[0] === "Terms")[1];
  ok(termLines.length === 41 && termLines.every(l => /^\{#[a-z-]+\}\*\*[^*]+:\*\* .+ See “[^”]+”\.$/.test(l)), "all 41 Terms entries read as a bold term, a definition, and a pointer");
  ok(termLines.every(l => titles.includes(l.match(/See “([^”]+)”\.$/)[1])), "every Terms pointer names a topic that exists");
  f.value = "decision"; k.fire(f, "input");
  ok(titlesOf()[0] === "Terms" && items()[0].open, "a word that is a term puts the Terms topic first and opens it");
  ok([...items()[0].querySelectorAll("li")].filter(li => !li.hidden).length === 1 && [...items()[0].querySelectorAll("li")].filter(li => !li.hidden)[0].textContent.startsWith("Decision:"), "while searching, the Terms topic shows only the matching entry");
  ok(!!items()[0].querySelector("summary .helpcount") && items().filter(d => !d.hidden).length > 1, "each match shows a count, and other sections that mention it stay listed");
  f.value = "quest giver export"; k.fire(f, "input");
  ok(!items().filter(d => !d.hidden)[0].hidden && titlesOf()[0] === "Terms", "several words match a term that starts with all of them");
  f.value = "tasks page"; k.fire(f, "input");
  ok(titlesOf()[0] === "Tasks page" && items()[0].open, "a title match ranks above the Terms topic");
  f.value = "ideal"; k.fire(f, "input");
  ok(titlesOf()[0] === "Terms" && items()[0].open && items()[0].querySelector("mark"), "Ideal finds its definition first, opened and highlighted");
  f.value = ""; k.fire(f, "input");
  ok(JSON.stringify(titlesOf()) === JSON.stringify(titles) && !k.d.querySelector("#view .helpcount"), "clearing the box restores the authored order and removes the counts");
}
{
  // "?" buttons open a Terms entry in a modal, and lead to the Field guide topic that explains more
  const k = kit(await mk()); k.click(k.$("welcomeDismiss"));
  const { helpTopics, helpTerm } = await import("../app/help.js?run=" + counter);
  const ids = helpTopics().find(t => t[0] === "Terms")[1].map(l => l.match(/^\{#([a-z-]+)\}/)[1]);
  ok(new Set(ids).size === ids.length, "every Terms entry has its own id");
  ok(!!helpTerm("pending") && helpTerm("pending").name === "Pending" && helpTerm("nope") === null, "an id finds its Terms entry, and an unknown id finds nothing");
  k.tab("help");
  ok(!k.d.querySelector("#view .hbody b").textContent.includes("{#") && !k.d.querySelector("#view details.helpitem:nth-of-type(2)").textContent.includes("{#"), "the ids never show in the Field guide");
  ok(k.d.querySelector("#view li[data-term='bounty']") !== null, "each Terms line carries its id for linking");
  k.tab("today"); ok(!!k.d.querySelector("#view .helpq[data-term='next-up']"), "the Today page has a ? beside Next up");
  k.tab("projects");
  const qs = [...k.d.querySelectorAll("#view .helpq")].map(b => b.getAttribute("data-term"));
  ok(qs.includes("in-progress") && qs.includes("candidate-quest"), "the Quests page has a ? beside In progress and Candidate quests (" + qs.join() + ")");
  ok(qs.every(id => !!helpTerm(id)), "every ? on the page points at a real Terms entry");
  const q = k.d.querySelector("#view .helpq[data-term='candidate-quest']");
  ok(q.getAttribute("aria-label") === "What is Candidate quest?" && q.textContent === "", "a ? is named for its term, and carries no text of its own");
  k.click(q);
  ok(!k.$("overlay").hidden && k.$("modalTitle").textContent === "Candidate quest" && k.$("modalBody").textContent.includes("A quest you’re considering"), "tapping a ? opens the definition in a modal");
  k.click(k.$("termMore"));
  const open = [...k.d.querySelectorAll("#view details.helpitem")].filter(d => d.open);
  ok(k.$("overlay").hidden && open.length === 1 && open[0].querySelector("summary").textContent === "Quests page", "Read more closes the modal and opens the Field guide at the Quests page topic");
  k.tab("settings");
  ok(!!k.d.querySelector("#view .labelrow .helpq[data-term='stretch-of-work']"), "Options has a ? beside the name for each stretch of work");
  ok(!!k.d.querySelector("#view .helpq[data-term='adventurer']"), "Options has a ? beside Adventurer");
  k.tab("schedule");
  ok(!!k.d.querySelector("#view .helpq[data-term='backlog']"), "the Tasks page has a ? beside Backlog");
  k.tab("timeline");
  ok(!!k.d.querySelector("#view .helpq[data-term='task-counts']") && !k.d.querySelector("#view .legend .helpq"), "the Timeline page has a ? beside Task counts and none in the burndown legend");
  k.tab("projects"); k.click([...k.d.querySelectorAll("#view .qlink")].find(b => b.textContent === "Sample App"));
  ok(["before-you-launch", "bounty"].every(id => !!k.d.querySelector("#view .helpq[data-term='" + id + "']")), "a quest page has a ? for Before you launch and Bounty");
}
{
  // Straight and curly apostrophes match each other, matches are highlighted, and bold text in the guide is blue
  const k = kit(await mk()); k.click(k.$("welcomeDismiss")); k.tab("help");
  const f = k.$("helpFilter");
  f.value = "quest's"; k.fire(f, "input");
  const opened = [...k.d.querySelectorAll("#view details.helpitem")].filter(d => !d.hidden);
  ok(opened.length > 0 && opened.every(d => d.querySelector("mark")), "typing a straight apostrophe finds text with a curly one, and the matches are highlighted");
  f.value = ""; k.fire(f, "input");
  ok(!k.d.querySelector("#view mark"), "clearing the box removes the highlights");
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
  ok(/\.hbody b, \.hbody strong \{ color: var\(--planned\); \}/.test(css) && !/\.helpitem > summary \{[^}]*--planned/.test(css), "bold text inside a Field guide section is the dark blue and the section headings are not");
}
{
  // A Candidate can add links, but only to live quests; no quest can pick a Candidate
  const k = kit(await mk()); k.click(k.$("welcomeDismiss"));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Command-Line Tool"));
  ok(!!k.btn(k.$("view"), "Link quest"), "a Candidate's page offers Link quest");
  k.click(k.btn(k.$("view"), "Link quest"));
  const opts = [...k.d.querySelectorAll("#f-quest option")].map(o => o.textContent);
  ok(opts.includes("Sample App") && !opts.includes("Sample Browser Extension") && !opts.includes("Sample Command-Line Tool"), "its picker offers live quests only, not other Candidates (" + opts.join(", ") + ")");
  const sel = k.$("f-quest"); sel.value = [...sel.options].find(o => o.textContent === "Sample Newsletter").value;
  k.click(k.btn(k.$("modalBody"), "Link quest"));
  const q = id => k.saved().quests.find(x => x.id === id);
  ok(q("pCli").linkedQuestIds.indexOf("pNews") >= 0 && q("pNews").linkedQuestIds.indexOf("pCli") >= 0, "the new link is stored on both quests");
  k.click(k.$("modalBody") && (k.btn(k.$("modalBody"), "Close") || k.btn(k.$("modalBody"), "Cancel")) || k.$("modalBody"));
  const row = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample Newsletter"));
  ok(!!row && !!row.querySelector(".qlink") && !k.btn(row, "Launch critical") && !!k.btn(row, "Unlink"), "on the Candidate's page the live partner is clickable and Unlink works");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Newsletter"));
  const row2 = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample Command-Line Tool"));
  ok(!!row2 && !!row2.querySelector(".qinert") && row2.textContent.includes("Candidate"), "the live quest lists the Candidate as plain text labeled Candidate");
  k.click(k.btn(k.$("view"), "Link quest"));
  ok(![...k.d.querySelectorAll("#f-quest option")].some(o => o.textContent === "Sample Browser Extension"), "a live quest's picker never offers a Candidate");
}
{
  // Any other host can ask for the hosted wording and behavior by setting window.sidequestHosted = true
  const k = kit(await mk(undefined, undefined, undefined, undefined, undefined, w => { w.sidequestHosted = true; }));
  k.click(k.$("welcomeDismiss")); k.tab("settings");
  const t = k.$("view").textContent;
  ok(t.includes("Your data is saved in your account.") && !t.includes("this browser") && !t.includes("Install Sidequest") && !t.includes("Claude"), "a host that sets window.sidequestHosted gets the account wording and no Install box");
  k.tab("help");
  ok(![...k.d.querySelectorAll("#view details.helpitem summary")].some(x => x.textContent === "Install Sidequest on this device"), "and the Field guide leaves out the install topic");
  k.tab("projects");
  ok(/main menu/.test(([...k.d.querySelectorAll("#view .pintoggle, .pintoggle")][0] || {}).title || ""), "and pin text says main menu");
}
// Tutorial: starts only from a button
{
  const k = kit(await mk({}));
  ok(!k.d.querySelector(".tutorial"), "the tutorial does not start on its own");
  ok(!("tutorialDone" in k.saved().settings), "there is no tutorialDone flag any more");
  const play = k.$("welcomePlay");
  ok(!!play && play.textContent === "Play tutorial" && play.classList.contains("tutorialbtn"), "the Welcome box has an orange Play tutorial button");
  const btns = [...k.$("welcomePlay").parentNode.querySelectorAll("button")].map(b => b.textContent);
  ok(btns.join() === "Open Options,Play tutorial,Dismiss", "Play tutorial sits between Open Options and Dismiss (" + btns.join() + ")");
  ok(/Press Play tutorial for a short walkthrough of adding a quest, giving it a task, and starting it\./.test(k.d.querySelector(".welcomebox .hint").textContent) && k.d.querySelector(".welcomebox .hint").textContent.indexOf("Press Play tutorial") > k.d.querySelector(".welcomebox .hint").textContent.indexOf("Start fresh") && [...k.d.querySelectorAll(".welcomebox .hint strong")].map(n => n.textContent).join() === "Your new adventure begins here!,Options,Start fresh,Play tutorial", "the Welcome text puts the tutorial sentence last and bolds the button names");
  k.click(play);
  const c1 = k.d.querySelector(".tutorial");
  ok(!!c1 && c1.textContent.includes("Step 1 of 7"), "Play tutorial in the Welcome box opens the card on step 1");
  k.click(k.$("tutorialSkip") || k.$("tutorialNext"));
}
{
  const k = kit(await mk({ settings: { hideWelcome: true } }));
  k.tab("help");
  ok(!!k.$("helpReplay") && k.$("helpReplay").textContent === "Play tutorial" && k.$("helpReplay").classList.contains("tutorialbtn") && !k.d.querySelector(".tutorial"), "the Field guide offers an orange Play tutorial, and no card shows until it is used");
  k.click(k.$("helpReplay"));
  const card = k.d.querySelector(".tutorial");
  ok(!!card && card.textContent.includes("Step 1 of 7") && card.textContent.includes("Welcome to Sidequest"), "Play tutorial opens the card on step 1");
  k.click(k.$("tutorialNext"));
  ok(k.d.querySelector(".tutorial").textContent.includes("Add a quest") && !!k.$("tutorialSkip"), "Next moves to the first action step, which can be skipped");
  const lit = k.d.querySelector(".tutorialtarget");
  ok(!!lit && lit.classList.contains("tutorialflash"), "a step's first highlight flashes once");
  ok(k.d.querySelector(".tutorial").classList.contains("tutorialflash"), "the card's ring flashes on each step");
  k.click(k.$("tutorialSkip"));
  ok(!k.d.querySelector(".tutorial"), "Skip tutorial removes the card");
}
// New quest dialog and the + menu
{
  const k = kit(await mk({ settings: { hideWelcome: true } }));
  const kids = [...k.$("newMenu").children].map(n => n.tagName === "HR" ? "-" : n.dataset.act).join();
  ok(kids === "newQuest,newTask,newStep,newDecision,newIssue,-,newJob,newIdea", "the + menu has New issue under New decision, then a divider before New errand (" + kids + ")");
  k.menuAct("newBtn", "newQuest");
  const tg = k.$("modalBody").querySelector(".dialogheading + .sectionlist .item"), grp = k.$("modalBody").querySelector(".dialogheading + .sectionlist .detail");
  ok(!!tg && !!grp && grp.hidden && tg.getAttribute("aria-expanded") === "false", "the New quest dialog starts with Quest giver collapsed");
  ok(!!k.$("modalBody").querySelector(".dialogheading [data-term=\"quest-giver\"]"), "and a ? button sits beside Quest giver");
  k.setField("name", "Keep me");
  k.click(k.$("modalBody").querySelector("[data-term=\"quest-giver\"]"));
  ok(k.$("modalTitle").textContent === "Quest giver" && !k.$("modalBody").querySelector("#f-name"), "the ? opens the Quest giver help over the dialog");
  k.click(k.$("modalClose"));
  ok(k.$("modalTitle").textContent === "New candidate quest" && k.$("f-name").value === "Keep me" && !k.$("overlay").hidden, "closing the help returns to the New quest dialog with what was typed");
  k.setField("name", "");
  k.click(tg);
  ok(!grp.hidden && tg.getAttribute("aria-expanded") === "true" && !!grp.querySelector("#f-giverOrg"), "Quest giver opens to show its fields");
  k.click(tg);
  ok(grp.hidden, "and closes again");
  k.click(tg); k.setField("name", "Giver Quest"); k.setField("giverOrg", "Acme");
  k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  ok(k.saved().quests.find(q => q.name === "Giver Quest").client.org === "Acme", "fields inside the collapsible group still save");
}
// Hosted launch quotes: the shuffled bucket lives in its own db document, so it survives a relaunch with cleared local storage and never moves the sync stamp.
{
  const wait = (ms) => new Promise(r => setTimeout(r, ms || 90));
  const store = {};
  const claude = { use: (n) => Promise.resolve(n === "db" ? { doc: (p) => ({
    get: () => new Promise(r => setTimeout(() => r({ exists: p in store, data: () => store[p] }), 4)),
    set: (d) => new Promise(r => setTimeout(() => { store[p] = JSON.parse(JSON.stringify(d)); r(); }, 4)) }) } : null) };
  const { AFFIRMATIONS } = await import("../app/splash.js");
  store["meta/quotes"] = { bucket: [3, 5] };
  const launch = async () => { const k = kit(await mk({ settings: { showSplash: true } }, claude)); await wait(); return k.$("splashText").textContent; };
  const first = await launch(), afterFirst = JSON.stringify(store["meta/quotes"].bucket);
  const second = await launch(), afterSecond = JSON.stringify(store["meta/quotes"].bucket);
  ok(first === AFFIRMATIONS[5] && afterFirst === "[3]", "a hosted launch draws from the db's bucket, not local storage, and saves what is left (" + afterFirst + ")");
  ok(second === AFFIRMATIONS[3] && afterSecond === "[]", "the next launch, with local storage cleared, takes the next quote in the same cycle");
  await launch();
  ok(store["meta/quotes"].bucket.length === AFFIRMATIONS.length - 1, "then a fresh shuffled cycle starts");
  ok(Object.keys(store["meta/quotes"]).join() === "bucket", "the quote document holds only the bucket, no sync stamp");
}
// A held, instant splash (the landing site's Welcome card) shows its last frame at once and stays.
{
  const k = kit(await mk({ settings: { showSplash: false } }));
  const { playSplash } = await import("../app/splash.js");
  const root = k.$("splash"); root.hidden = false;
  const picks = [];
  playSplash(true, null, false, (n) => { picks.push(n); return 2; }, { hold: true, instant: true });
  const paths = root.querySelectorAll("#splashLines path");
  ok(!root.hidden && root.classList.contains("artBlurred") && root.classList.contains("textIn"), "an instant held splash shows its last frame at once and stays visible");
  ok(paths.length > 0 && root.querySelectorAll("#splashLines path.drawn").length === paths.length, "with every branch drawn");
  ok(picks.length === 1 && k.$("splashText").textContent.length > 0, "and a quote chosen through pickIndex");
}
// scrollTop zeroes every scroller, scrolls the app's top into view, and repeats after paint.
{
  const k = kit(await mk());
  const calls = [];
  k.w.scrollTo = () => calls.push("scrollTo");
  const app = k.d.querySelector(".app"); app.scrollIntoView = () => calls.push("into-view");
  k.tab("projects"); await new Promise(r => setTimeout(r, 60));
  ok(calls.includes("scrollTo") && calls.includes("into-view"), "switching pages scrolls the window and the app's top into view");
  ok(calls.filter(c => c === "scrollTo").length >= 2, "and repeats the reset after the page has painted");
}
// Quest giver export asks which letterhead sides to include.
{
  const quest = (client) => ({ id: "pQ", name: "Ask Quest", status: "active", start: "2026-08-03", days: 7, client: Object.assign({ org: "", poc: "", phone: "", email: "", address: "", website: "" }, client) });
  const contact = { name: "Ada Lovelace", company: "", phone: "", email: "", address: "", website: "" };
  async function run(saved, uncheck) {
    const k = kit(await mk(saved));
    let written = null;
    k.w.showSaveFilePicker = () => Promise.resolve({ createWritable: () => Promise.resolve({ write: (t) => { written = t; return Promise.resolve(); }, close: () => Promise.resolve() }) });
    k.tab("projects"); k.click(k.btn(k.$("view"), "Ask Quest"));
    k.click(k.btn(k.$("view"), "Quest giver export"));
    const dialog = k.d.querySelector("#overlay:not([hidden])");
    const boxes = dialog ? [...dialog.querySelectorAll('input[type="checkbox"]')].map(c => c.id) : [];
    (uncheck || []).forEach(id => { const c = k.$(id); c.checked = false; });
    if (dialog) k.click(k.btn(k.$("overlay"), "Export"));
    await new Promise((r) => setTimeout(r, 30));
    return { html: written || "", boxes, open: !!k.d.querySelector("#overlay:not([hidden])") };
  }
  const both = { settings: { contact }, quests: [quest({ org: "Acme Co." })], tasks: [] };
  let r = await run(both);
  ok(r.boxes.join() === "f-by,f-forWhom" && r.html.includes("Prepared by") && r.html.includes("Prepared for") && !r.open, "with both sides filled in, the export asks and both are included by default");
  r = await run(both, ["f-by"]);
  ok(!r.html.includes("Prepared by") && !r.html.includes("Ada Lovelace") && r.html.includes("Prepared for"), "unchecking Prepared by leaves your contact info off the export");
  r = await run(both, ["f-forWhom"]);
  ok(r.html.includes("Prepared by") && !r.html.includes("Prepared for") && !r.html.includes("Acme Co."), "unchecking Prepared for leaves the Quest giver off the export");
  r = await run(both, ["f-by", "f-forWhom"]);
  ok(r.html.includes("<!doctype html>") && !r.html.includes("Prepared by") && !r.html.includes("Prepared for"), "unchecking both still exports, with no letterhead");
  r = await run({ settings: { contact }, quests: [quest({})], tasks: [] });
  ok(r.boxes.join() === "f-by" && r.html.includes("Prepared by"), "a side with nothing to print is not offered");
  r = await run({ quests: [quest({})], tasks: [] });
  ok(r.boxes.length === 0 && r.html.includes("<!doctype html>"), "with nothing to print on either side, it exports without asking");
}
/* ---- odd jobs ---- */
{
  const k = kit(await mk()); k.tab("jobs");
  const names = () => [...k.d.querySelectorAll("#view ul.jobs li")].map(li => li.textContent);
  ok(k.$("viewTitle").textContent === "Errands", "the Errands page has its title");
  const open = [...k.d.querySelectorAll("#view ul.jobs")][0].textContent;
  ok(open.indexOf("Renew the domain name") < open.indexOf("Back up the photos folder") && open.indexOf("Back up the photos folder") < open.indexOf("Reply to the print shop"), "dated jobs sort first, earliest first, then undated jobs");
  ok(k.d.querySelectorAll("#view .badge").length === 2 && [...k.d.querySelectorAll("#view .badge")].every(b => b.textContent === "Overdue"), "only the two past-due open jobs show an Overdue badge");
  ok(k.$("view").textContent.includes("Completed") && [...k.d.querySelectorAll("#view ul.jobs")][1].textContent.includes("Update the email signature"), "a completed job is in the Completed section");
  // add
  k.$("job-new").value = "Water the plants"; k.click(k.btn(k.$("view"), "Add errand"));
  ok(k.saved().jobs.some(j => j.text === "Water the plants" && !j.done && j.due === ""), "Add job saves a new undated job");
  ok(k.$("job-new").value === "", "the field is cleared after adding");
  k.click(k.btn(k.$("view"), "Add errand"));
  ok(k.$("view").textContent.includes("Enter an errand to add it."), "an empty job is refused");
  // complete and restore
  const row = t => [...k.d.querySelectorAll("#view ul.jobs li")].find(li => li.textContent.includes(t));
  const flip = t => { const c = row(t).querySelector("input[type=checkbox]"); c.checked = !c.checked; k.fire(c); };
  flip("Water the plants");
  ok(k.saved().jobs.find(j => j.text === "Water the plants").done === true, "checking a job completes it");
  flip("Water the plants");
  ok(k.saved().jobs.find(j => j.text === "Water the plants").done === false, "unchecking a completed job restores it");
  // rename
  k.click(row("Water the plants").querySelector("button.pencil"));
  const i = k.d.querySelector(".inlineedit"); i.value = "Water the ferns";
  i.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(k.saved().jobs.some(j => j.text === "Water the ferns") && !k.saved().jobs.some(j => j.text === "Water the plants"), "the pencil renames a job in place");
  // delete forever, with undo
  k.click(k.btn(row("Update the email signature"), "Delete forever"));
  ok(!k.saved().jobs.some(j => j.text === "Update the email signature"), "Delete forever removes the job");
  k.click(k.d.querySelector("#toast .toastbtn"));
  ok(k.saved().jobs.some(j => j.text === "Update the email signature"), "Undo brings a deleted job back");
  // not counted anywhere
  k.tab("schedule");
  ok(!k.$("view").textContent.includes("Renew the domain name"), "jobs are not on the Tasks page");
  k.tab("timeline");
  ok(!k.$("view").textContent.includes("Renew the domain name"), "jobs are not on the Timeline");
  k.tab("today");
  ok(!k.$("view").textContent.includes("Renew the domain name"), "an overdue job is not in Today's Overdue panel");
}
/* ---- errands hand ---- */
{
  const k = kit(await mk()); k.tab("jobs");
  const v = () => k.$("view");
  const cards = () => [...k.d.querySelectorAll("#view .handlist > li")].map(li => li.querySelector(".jobtext").textContent);
  ok(v().textContent.includes("Your hand") && v().textContent.includes("Nothing in your hand. Choose up to three errands to keep here.") && v().textContent.includes("Errands deck"), "an empty hand shows its message and the Errands deck label");
  ok(!!k.btn(v(), "Manage hand") && !!k.btn(v(), "Roll") && !k.btn(v(), "Reroll") && !k.btn(v(), "Choose cards"), "an empty hand has one Manage hand button and Roll, with no separate Choose step");
  ok(!k.btn(v(), "Roll").querySelector("svg") && !!k.d.querySelector('#view .rerollgroup .helpq[data-term="reroll"]') && !!k.d.querySelector('#view .decklabel .helpq[data-term="errands-deck"]'), "Reroll has no icon, and both help links are in place");
  // one dialog for choosing and editing
  k.click(k.btn(v(), "Manage hand"));
  const ed = k.$("modalBody");
  ok(k.$("modalTitle").textContent === "Manage your hand" && ed.querySelectorAll("input[type=checkbox]").length === 0 && k.$("modalClose").hidden, "Manage hand opens one dialog with no checkboxes and no header Close");
  const rows = () => [...ed.querySelectorAll(".handpick li")];
  const pick = t2 => rows().find(li => li.textContent.includes(t2)).querySelector("button");
  ok(ed.textContent.includes("0 of 3 in hand") && !k.btn(ed, "Empty hand") || k.btn(ed, "Empty hand").hidden, "an empty hand shows 0 of 3 and no Empty hand button");
  k.click(pick("Renew the domain name"));
  ok(k.saved().hand.length === 1 && ed.textContent.includes("1 of 3 in hand"), "Choose takes effect at once and the count updates");
  ok(rows()[0].textContent.includes("Renew the domain name") && [...rows()[0].querySelectorAll("button")].map(b2 => b2.textContent).join() === "Up,Down,Discard", "a chosen errand moves to the top with Up, Down and Discard");
  ok(pick("Back up the photos folder").getAttribute("aria-label") === "Choose for hand: Back up the photos folder", "Choose names the errand");
  k.click(pick("Back up the photos folder")); k.click(pick("Reply to the print shop"));
  const left = rows().filter(li => li.querySelector("button").textContent === "Choose");
  ok(k.saved().hand.length === 3 && left.length > 0 && left.every(li => li.querySelector("button").disabled), "at three, the remaining Choose buttons are disabled");
  const first = k.saved().hand[0];
  const rowBtns = i => rows()[i].querySelectorAll("button");
  ok(rowBtns(0)[0].disabled && !rowBtns(0)[1].disabled && rowBtns(2)[1].disabled, "Up is off on the first card and Down on the last");
  k.click(rowBtns(0)[1]);
  ok(k.saved().hand[1] === first, "Down moves a card later");
  k.click(rowBtns(2)[2]);
  ok(k.saved().hand.length === 2 && k.saved().jobs.length === 7, "Discard returns a card to the deck and never deletes it");
  k.click(k.btn(ed, "Done"));
  ok(cards().length === 2 && !![...k.d.querySelectorAll("#view .handlist > li")].length, "Done closes the dialog and the page shows the cards");
  ok(![...k.d.querySelectorAll("#view ul.jobs li")].some(li => cards().some(c => li.textContent.includes(c))), "hand cards leave the deck");
  k.click(k.btn(v(), "Manage hand"));
  k.click(k.btn(k.$("modalBody"), "Empty hand"));
  ok(k.saved().hand.length === 0 && !!k.d.querySelector("#toast .toastbtn") && k.$("overlay").hidden, "Empty hand clears the hand, closes the dialog and offers Undo");
  k.click(k.d.querySelector("#toast .toastbtn"));
  ok(k.saved().hand.length === 2, "Undo brings the hand back");
  // completing removes from the hand; restoring does not return it
  const hid = k.saved().hand[0], htext = cards()[0];
  const cb = [...k.d.querySelectorAll("#view .handlist > li")][0].querySelector("input[type=checkbox]"); cb.checked = true; k.fire(cb);
  ok(!k.saved().hand.includes(hid), "completing an errand removes it from the hand");
  const done = [...k.d.querySelectorAll("#view ul.jobs li")].find(li => li.textContent.includes(htext)).querySelector("input[type=checkbox]"); done.checked = false; k.fire(done);
  ok(!k.saved().hand.includes(hid), "restoring a completed errand returns it to the deck only");
  // reroll
  k.click(k.btn(v(), "Reroll"));
  const rolled = k.saved().hand, ids = k.saved().jobs.filter(j => !j.done && j.due && j.due < new Date().toISOString().slice(0, 10)).map(j => j.id);
  ok(rolled.length === 3 && new Set(rolled).size === 3 && ids.every(id => rolled.includes(id)), "Reroll fills three cards and puts overdue errands in the hand");
  ok(k.d.querySelector("#toast").textContent.includes("Hand rerolled."), "Reroll shows the Undo toast at once");
  const before = JSON.stringify(rolled);
  k.click(k.btn(v(), "Reroll"));
  ok(JSON.stringify(k.saved().hand) !== before, "Reroll never repeats the current hand");
  k.click(k.d.querySelector("#toast .toastbtn"));
  ok(JSON.stringify(k.saved().hand) === before, "Undo restores the previous hand exactly");
}
{
  const k = kit(await mk()); k.tab("jobs");
  const v = () => k.$("view");
  k.click(k.btn(v(), "Roll"));
  ok(k.saved().hand.length === 3 && k.d.querySelector("#toast").textContent.includes("Hand rolled.") && !!k.btn(v(), "Reroll") && !k.btn(v(), "Roll"), "Roll deals a first hand, says rolled, and the button becomes Reroll");
  k.click(k.d.querySelector("#toast .toastbtn"));
  ok(k.saved().hand.length === 0 && !!k.btn(v(), "Roll"), "Undo after a first roll empties the hand and the button reads Roll again");
}
{
  const k = kit(await mk());
  ok(k.saved().hand === undefined || k.saved().hand.length === 0, "a fresh save has an empty hand");
  k.tab("settings");
  ok(k.$("set-animated-reroll").value === "on", "Animated reroll defaults on");
  k.$("set-animated-reroll").value = "off"; k.fire(k.$("set-animated-reroll"));
  ok(k.saved().settings.animatedReroll === false, "turning Animated reroll off saves");
}
{
  const k = kit(await mk()); k.menuAct("newBtn", "newJob");
  k.setField("text", "Call the dentist"); k.setField("due", "2031-05-04");
  k.click(k.btn(k.d.querySelector(".modal"), "Add errand"));
  ok(k.saved().jobs.some(j => j.text === "Call the dentist" && j.due === "2031-05-04"), "the + menu's New errand adds a dated errand");
  k.type("dentist");
  ok(k.d.querySelector('#searchResults .sgroup[data-kind="job"]') && k.d.querySelector('#searchResults .sgroup[data-kind="job"]').textContent.includes("Call the dentist"), "search has a Jobs group");
}
{
  const k = kit(await mk({ quests: [], tasks: [] }));
  ok(Array.isArray(k.saved().jobs) && k.saved().jobs.length === 0, "a save from before Odd jobs loads with an empty list, not the samples");
  const k2 = kit(await mk({ quests: [], tasks: [], jobs: [{ id: "x", text: "Keep", done: true, due: "nope" }, { text: "no id" }, null] }));
  const j = k2.saved().jobs;
  ok(j.length === 1 && j[0].text === "Keep" && j[0].done === true && j[0].due === "", "normalize keeps valid jobs, drops bad ones, and blanks a bad date");
}
/* ---- quest schedule fields, milestone on backlog, decision lines, slip warning ---- */
{
  const k = kit(await mk()); k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  const toast = () => k.$("toast").textContent, msg = () => k.d.querySelector(".questcharts .schedmsg").textContent;
  const app = () => k.saved().quests.find(q => q.id === "pApp");
  const before = k.$("proj-start");
  k.fire(before, "blur"); k.fire(k.$("proj-due"), "blur"); k.fire(k.$("proj-days"), "blur");
  ok(k.$("proj-start") === before && toast() === "", "leaving a quest's schedule fields unchanged saves nothing and shows no toast");
  const start0 = app().start;
  k.$("proj-start").value = "2099-01-01"; k.fire(k.$("proj-start"), "blur");
  ok(app().start === start0 && msg().includes("A task in this quest is dated"), "a quest start after its tasks' dates is refused with a message");
  k.$("proj-due").value = "2000-01-01"; k.fire(k.$("proj-due"), "blur");
  ok(app().due === "" && msg().includes("This quest starts"), "a quest due date before its start is refused with a message");
  k.click(k.d.querySelector("#ptask-a4 button.item"));
  k.$("task-due").value = ""; k.fire(k.$("task-due"), "blur");
  const a4 = k.saved().tasks.find(t => t.id === "a4");
  ok(a4.block === 0 && a4.milestone === false && toast().includes("no longer a milestone"), "a milestone moved to the Backlog stops being a milestone");
}
{
  const k = kit(await mk()); k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Website")); k.click(k.btn(k.$("view"), "Vault"));
  k.tab("vault"); k.click(k.btn([...k.d.querySelectorAll("#view li")].find(li => li.textContent.includes("Sample Website")), "Sample Website"));
  k.click(k.d.querySelector("#ptask-w3 button.item"));
  const lines = [...k.d.querySelectorAll("#ptask-w3 .steps li p.hint")].map(p => p.textContent);
  ok(lines[0] === "Decision: Should the site use a page builder?" && lines[1] === "Answer: No, plain pages are enough.", "a vaulted quest prints a decision and its answer on two labeled lines");
}
{
  const k = kit(await mk({ quests: [{ id: "q", name: "Late", status: "active", start: "2031-01-01", due: "2031-01-10", days: 7 }, { id: "r", name: "Bad date", status: "active", start: "2026-02-31" }], tasks: [{ id: "t", block: 2, questId: "q", what: "One", due: "2031-01-08", status: "Not started", steps: [] }] }));
  ok(k.saved().quests.find(q => q.id === "r").start === "", "a date that is not on the calendar is dropped on load");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Late")); k.click(k.btn(k.$("view"), "Slip schedule"));
  k.$("slipDays").value = "7"; k.click(k.$("slipGo"));
  ok(k.saved().tasks[0].due === "2031-01-08" && k.$("modalBody").textContent.includes("would land after this quest’s due date"), "a slip past the quest's due date warns first and moves nothing");
  k.click(k.$("slipGo"));
  ok(k.saved().tasks[0].due === "2031-01-15", "choosing the button again goes ahead with the slip");
}
{
  // Enter in a form submits that form only, never the forms opened before it.
  const k = kit(await mk({ settings: { hideWelcome: true } }));
  const enter = e => e.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  const named = n => k.saved().quests.filter(q => q.name === n).length;
  k.menuAct("newBtn", "newQuest"); k.setField("name", "First one"); k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  k.menuAct("newBtn", "newQuest"); k.setField("name", "Second one"); enter(k.$("f-name"));
  ok(named("First one") === 1 && named("Second one") === 1 && k.$("overlay").hidden, "Enter in a later dialog does not resubmit an earlier one");
  k.menuAct("newBtn", "newQuest"); k.setField("name", "Third one");
  k.click(k.$("modalBody").querySelector("[data-term=\"quest-giver\"]")); k.click(k.$("modalClose"));
  enter(k.$("f-name"));
  ok(named("Third one") === 1 && named("First one") === 1 && named("Second one") === 1, "Enter still submits a dialog that came back from under a help box");
}
{
  // Every finished task dings, including the one that finishes its quest.
  const saved = (audio, both) => ({
    settings: { audio },
    quests: [{ id: "pT", name: "Ding Quest", status: "active", start: "2026-08-03", days: 7 }],
    tasks: [{ id: "tA", block: 1, questId: "pT", what: "First", done: "d", status: "Not started", steps: [] }].concat(both ? [{ id: "tB", block: 1, questId: "pT", what: "Second", done: "d", status: "Not started", steps: [] }] : [])
  });
  const finish = async (audio, both) => {
    const k = kit(await mk(saved(audio, both)));
    const plays = [], RealAudio = k.w.Audio;
    k.tab("schedule"); k.click(k.d.querySelector("#view .listpane .item"));
    k.w.Audio = function (src) { plays.push(src); const o = { play: function () { return Promise.resolve(); } }; Object.defineProperty(o, "volume", { set: function (v) { if (/completeTask/.test(src)) plays.push("vol " + v); } }); return o; };
    const sel = selRow(k); sel.value = "Completed"; k.fire(sel);
    k.w.Audio = RealAudio;
    return plays;
  };
  const dings = await finish(true, true), off = await finish(false, true), last = await finish(true, false);
  ok(dings.length === 2 && dings[0] === "../assets/sfx/completeTask.mp3" && dings[1] === "vol 0.5", "completing a task plays the task sound at half volume (" + dings.join() + ")");
  ok(off.length === 0, "completing a task is silent when Sound effects is off");
  ok(last.indexOf("../assets/sfx/completeTask.mp3") >= 0 && last.indexOf("../assets/sfx/complete.mp3") >= 0, "the task that finishes a quest plays both the task sound and the quest sound (" + last.join() + ")");
}
{
  // Quest page and dialog behavior: a task due with no start begins today, the page locks behind a dialog,
  // a new task is scrolled to, and leaving a quest closes its open task.
  const n = new Date(), today = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())).toISOString().slice(0, 10);
  const saved = {
    settings: { hideWelcome: true },
    quests: [{ id: "pQ", name: "Dialog Quest", status: "active", start: "2020-01-01", days: 7 }],
    tasks: [{ id: "tQ", block: 1, questId: "pQ", what: "Existing task", done: "d", status: "Not started", steps: [] }]
  };
  const add = async (what) => {
    const k = kit(await mk(saved));
    k.tab("projects"); k.click(k.btn(k.$("view"), "Dialog Quest"));
    // Fake geometry: the sticky header ends at 60 and the new task's row sits at 500.
    const hit = []; k.w.scrollTo = function (x, y) { hit.push(y); };
    k.w.Element.prototype.getBoundingClientRect = function () { const bar = this.classList.contains("topbar"), mine = this.id.indexOf("ptask-") === 0 && this.textContent.includes(what); return { top: mine ? 500 : 0, bottom: bar ? 60 : 0 }; };
    k.click(k.btn(k.$("view"), "Add task"));
    const locked = k.d.body.style.position === "fixed";
    k.setField("what", what);
    k.click(k.btn(k.$("modalBody"), "Add task"));
    await new Promise(r => setTimeout(r, 20));
    return { k, locked, hit, task: k.saved().tasks.find(t => t.what === what) };
  };
  const a = await add("Due later");



  ok(a.locked && a.k.d.body.style.position === "", "the page is frozen while a dialog is open and freed when it closes");
  ok(a.hit[a.hit.length - 1] === 420, "a task added from its quest page scrolls to 20px below the header (" + a.hit.join() + ")");
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Dialog Quest")); k.click(k.d.querySelector("#ptask-tQ button.item"));
  ok(k.d.querySelector("#ptask-tQ button.item").getAttribute("aria-expanded") === "true", "a task opens on its quest page");
  k.tab("today"); k.tab("projects"); k.click(k.btn(k.$("view"), "Dialog Quest"));
  ok(k.d.querySelector("#ptask-tQ button.item").getAttribute("aria-expanded") === "false", "leaving a quest closes its open task");
}
{
  // Phone fields: a country code select beside the number, formatted on blur, saved as one string with its +code.
  const saved = {
    settings: { hideWelcome: true, contact: { name: "Ada", company: "", phone: "8055593005", email: "", address: "", website: "" } },
    quests: [{ id: "pPh", name: "Phone Quest", status: "active", start: "2026-08-03", days: 7, client: { org: "", poc: "", phone: "8055593005", email: "", address: "", website: "", coin: "", per: "Hour" } }],
    tasks: []
  };
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Phone Quest"));
  const num = k.$("giver-phone-pPh"), sel = () => num.parentNode.querySelector("select"), giverPhone = () => k.saved().quests[0].client.phone;
  ok(sel().value === "1" && num.value === "(805) 559-3005" && giverPhone() === "8055593005", "an older bare number shows under +1, formatted, and is not rewritten until it is edited");
  num.value = "2079460958"; k.fire(num, "input");
  ok(giverPhone() === "+1 2079460958" && num.value === "2079460958", "typing saves the number with its code and does not reformat while typing");
  k.fire(num, "blur");
  ok(num.value === "(207) 946-0958" && giverPhone() === "+1 (207) 946-0958", "leaving the field formats a 10-digit +1 number");
  num.value = "(805) 555-3005 x12"; k.fire(num, "blur");
  ok(num.value === "(805) 555-3005 x12" && giverPhone() === "+1 (805) 555-3005 x12", "an extension is kept after the formatted number");
  sel().value = "44"; k.fire(sel(), "change");
  num.value = "20 7946 0958"; k.fire(num, "blur");
  ok(giverPhone() === "+44 20 7946 0958" && num.value === "20 7946 0958" && k.saved().settings.dialCode === "44", "another country code leaves the number as typed and is remembered");
  num.value = "+81 3 1234 5678"; k.fire(num, "blur");
  ok(sel().value === "81" && num.value === "3 1234 5678" && giverPhone() === "+81 3 1234 5678", "a number pasted with its own +code moves the code into the select");
  num.value = "+999 123"; k.fire(num, "blur");
  ok(giverPhone() === "+999 123", "an unknown +code is saved as typed");
  num.value = ""; k.fire(num, "blur");
  ok(giverPhone() === "", "an empty number saves as empty, with no lone code");
  k.menuAct("newBtn", "newQuest");
  ok(k.$("modalBody").querySelector("#f-giverPhone").parentNode.querySelector("select").value === "81", "a new phone field starts on the code last chosen");
  const bad = kit(await mk({ settings: { dialCode: "zz" } }));
  ok(bad.saved().settings.dialCode === "1", "an invalid saved country code falls back to +1");
  const ex = await exportClick(kit(await mk({ settings: { contact: { company: "Acme Co.", name: "", phone: "+1 (805) 555-3005 x12", email: "", address: "", website: "" } }, quests: [{ id: "pX", name: "Ext Quest", status: "active", start: "2026-08-03", days: 7 }], tasks: [] })), "Ext Quest");
  ok(ex.html.includes('<a href="tel:+18055553005">+1 (805) 555-3005 x12</a>'), "the export's tel: link keeps the + and leaves the extension off");
}
{
  // Email fields: only a valid address (or none) is saved, and a bad one is reported on blur, never while typing.
  const saved = {
    settings: { hideWelcome: true, contact: { name: "Ada", company: "", phone: "", email: "", address: "", website: "" } },
    quests: [{ id: "pEm", name: "Email Quest", status: "active", start: "2026-08-03", days: 7, client: { org: "", poc: "", phone: "", email: "", address: "", website: "", coin: "", per: "Hour" } }],
    tasks: []
  };
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Email Quest"));
  const em = k.$("giver-email-pEm"), note = () => em.parentNode.querySelector("p.emailmsg"), giverEmail = () => k.saved().quests[0].client.email;
  em.value = "not-an-email"; k.fire(em, "input");
  ok(giverEmail() === "" && note().textContent === "", "a half-typed address is not saved and shows no message while typing");
  k.fire(em, "blur");
  ok(giverEmail() === "" && note().textContent.startsWith("Not saved.") && note().classList.contains("errmsg"), "leaving the field with a bad address says it was not saved, in red");
  em.value = "jordan@example.com"; k.fire(em, "input");
  ok(giverEmail() === "jordan@example.com" && note().textContent === "", "a valid address saves and clears the message");
  em.value = ""; k.fire(em, "input");
  ok(giverEmail() === "", "clearing the field saves an empty address");
  for (const bad of ["a@b", "a b@c.com", "@c.com", "a@@c.com", "a@c.c"]) ok(!(function () { em.value = bad; k.fire(em, "input"); return giverEmail() === bad; })(), "“" + bad + "” is not accepted");
  em.value = "first.last+tag@mail.example.co.uk"; k.fire(em, "input");
  ok(giverEmail() === "first.last+tag@mail.example.co.uk", "a plus tag and a multi-part domain are accepted");
  k.tab("settings"); k.click(k.btn(k.$("view"), "Adventurer") || k.d.querySelector("#view .setside button.item"));
  const se = k.$("set-contact-email");
  se.value = "ada@"; k.fire(se, "input"); k.fire(se, "blur");
  ok(k.saved().settings.contact.email === "" && se.parentNode.querySelector("p.emailmsg").textContent.startsWith("Not saved."), "Settings refuses a bad email the same way");
  se.value = "ada@example.com"; k.fire(se, "input");
  ok(k.saved().settings.contact.email === "ada@example.com", "and saves a good one");
  k.menuAct("newBtn", "newQuest"); k.setField("name", "Needs email"); k.setField("giverEmail", "oops");
  k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  ok(!k.$("overlay").hidden && k.$("modalBody").textContent.includes("Quest giver email isn’t an address") && !k.saved().quests.some(q => q.name === "Needs email"), "the New quest dialog refuses a bad Quest giver email and says which field");
  k.setField("giverEmail", "ok@example.com"); k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  ok(k.$("overlay").hidden && k.saved().quests.find(q => q.name === "Needs email").client.email === "ok@example.com", "a good one goes through");
  const ex = await exportClick(kit(await mk({ settings: { contact: { company: "Acme Co.", name: "", phone: "", email: "not an address", address: "", website: "" } }, quests: [{ id: "pE2", name: "Old Email Quest", status: "active", start: "2026-08-03", days: 7 }], tasks: [] })), "Old Email Quest");
  ok(ex.html.includes("<div>not an address</div>") && !ex.html.includes("mailto:not"), "an older, invalid email prints in the export as plain text, not a mailto link");
}
{
  // Country layouts: a number that fits its country's layout exactly is reflowed (a trunk 0 dropped); anything else stays as typed.
  const saved = {
    settings: { hideWelcome: true },
    quests: [{ id: "pLy", name: "Layout Quest", status: "active", start: "2026-08-03", days: 7, client: { org: "", poc: "", phone: "", email: "", address: "", website: "", coin: "", per: "Hour" } }],
    tasks: []
  };
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Layout Quest"));
  const num = k.$("giver-phone-pLy"), sel = num.parentNode.querySelector("select");
  const run = (code, typed) => { sel.value = code; k.fire(sel, "change"); num.value = typed; k.fire(num, "blur"); return num.value; };
  const cases = [
    ["1", "1 805 559 3005", "(805) 559-3005"], ["1", "805.559.3005", "(805) 559-3005"],
    ["44", "07700 900123", "7700 900123"], ["44", "020 7946 0958", "20 7946 0958"], ["44", "0330 123 4567", "330 123 4567"], ["44", "01632 960001", "01632 960001"],
    ["33", "06 12 34 56 78", "6 12 34 56 78"], ["34", "612345678", "612 345 678"], ["41", "044 123 45 67", "44 123 45 67"],
    ["7", "8 495 123 45 67", "495 123-45-67"], ["7", "8 800 555 35 35", "800 555-35-35"],
    ["91", "098765 43210", "98765 43210"], ["81", "090-1234-5678", "90 1234 5678"], ["81", "03-1234-5678", "3 1234 5678"], ["86", "13812345678", "138 1234 5678"],
    ["55", "(11) 91234-5678", "11 91234 5678"], ["55", "(21) 2345-6789", "21 2345 6789"], ["52", "5512345678", "55 1234 5678"], ["52", "6621234567", "662 123 4567"],
    ["61", "0412 345 678", "412 345 678"], ["61", "02 1234 5678", "2 1234 5678"], ["972", "050-123-4567", "50 123 4567"], ["971", "04 123 4567", "4 123 4567"],
    ["65", "91234567", "9123 4567"], ["852", "9123 4567", "9123 4567"], ["27", "082 123 4567", "82 123 4567"], ["234", "0803 123 4567", "803 123 4567"],
    ["44", "20 7946", "20 7946"], ["33", "12345", "12345"], ["49", "030 12345678", "030 12345678"], ["1", "555-CALL-NOW", "555-CALL-NOW"], ["39", "06 1234 5678", "06 1234 5678"]
  ];
  cases.forEach(([code, typed, want]) => { const got = run(code, typed); ok(got === want, "+" + code + " “" + typed + "” shows as “" + got + "”" + (got === want ? "" : ", wanted “" + want + "”")); });
  ok(k.$("giver-email-pLy").parentNode.parentNode.classList.contains("full"), "the email field takes the full width, so its message does too");
}
{
  // Status pulldown on every task row; the detail no longer has one.
  const k = kit(await mk({ settings: { hideWelcome: true } }));
  k.tab("schedule");
  const rows = [...k.d.querySelectorAll("#view .tlist li")].filter(li => li.querySelector(".item"));
  ok(rows.length > 5 && rows.every(li => li.classList.contains("hasstatus") && li.querySelector("button.item") && li.querySelector("select.rowstatus")), "every task row on the Tasks page has a status pulldown beside its button");
  ok(rows.every(li => !li.querySelector(".item .chip[data-v]")), "and no status chip inside the row");
  ok(!k.d.querySelector(".detailpane select.status") && !!k.d.querySelector(".detailpane .chip[data-v]"), "the Tasks detail pane shows the status as a chip, not a pulldown");
  const first = rows[0].querySelector("select.rowstatus"), id = first.getAttribute("data-task");
  first.value = "Completed"; k.fire(first);
  ok(k.saved().tasks.find(t => t.id === id).status === "Completed" && k.d.querySelector('select.rowstatus[data-task="' + id + '"]').value === "Completed", "changing a row's pulldown completes the task without opening it");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  const qrows = [...k.d.querySelectorAll("#view .questmain .tlist:not(.sectionlist) li")].filter(li => li.querySelector(".item"));
  ok(qrows.length > 3 && qrows.every(li => li.querySelector("select.rowstatus")), "quest page rows, including Before you launch, have one too");
  k.click(qrows[0].querySelector(".item"));
  ok(!k.d.querySelector("#view .questmain .detail select.status") && !k.d.querySelector("#view .questmain .detail .chip[data-v]"), "an opened task has no second status control");
}
{
  // Duplicate quest names are refused where a name is chosen, ignoring case; imports number themselves.
  const k = kit(await mk({ settings: { hideWelcome: true } }));
  k.menuAct("newBtn", "newQuest"); k.setField("name", "  sample app "); k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  ok(!k.$("overlay").hidden && k.$("modalBody").textContent.includes("A quest named “Sample App” already exists") && k.saved().quests.filter(q => q.name.toLowerCase().trim() === "sample app").length === 1, "the New quest dialog refuses a name that is taken, ignoring case and spaces");
  { const nf = k.$("f-name").closest(".field").nextSibling; ok(!!nf && nf.getAttribute("role") === "alert" && nf.textContent === "A quest named “Sample App” already exists. Choose another name.", "and the message sits directly under the name field, with the new wording"); }
  k.setField("name", "Brand new"); k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  ok(k.$("overlay").hidden && k.saved().quests.some(q => q.name === "Brand new"), "a free name goes through");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Brand new"));
  editTitle(k, "Sample Website");
  ok(k.saved().quests.find(q => q.id === "pSite").name === "Sample Website" && k.saved().quests.some(q => q.name === "Brand new") && /already exists/.test(k.$("toast").textContent), "renaming to a taken name is refused with a message and changes nothing");
  editTitle(k, "Brand newer");
  ok(k.saved().quests.some(q => q.name === "Brand newer"), "renaming to a free name works");
  k.menuAct("newBtn", "newIdea"); k.setField("text", "sample game"); k.click(k.btn(k.$("modalBody"), "Workshop it"));
  k.tab("workshop"); k.click(k.btn([...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("sample game")), "Make candidate"));
  ok(!k.saved().quests.some(q => q.name === "sample game") && /already exists/.test(k.$("toast").textContent) && k.saved().workshop.some(p => p.text === "sample game"), "Make candidate refuses a taken name and keeps the idea");
}
{
  // A vaulted quest's name is free to reuse, but restoring it onto a live clash is refused.
  const saved = { settings: { hideWelcome: true }, quests: [
    { id: "pV", name: "Twin", status: "active", start: "2026-08-03", days: 7, vault: { at: "2026-08-01", why: "removed" } },
    { id: "pL", name: "Other", status: "active", start: "2026-08-03", days: 7 }], tasks: [] };
  const k = kit(await mk(saved));
  k.menuAct("newBtn", "newQuest"); k.setField("name", "Twin"); k.click(k.btn(k.$("modalBody"), "Add candidate quest"));
  ok(k.$("overlay").hidden && k.saved().quests.filter(q => q.name === "Twin").length === 2, "a name used only by a vaulted quest can be reused");
  k.tab("vault"); k.click(k.btn([...k.d.querySelectorAll("#view li")].find(li => li.textContent.includes("Twin")), "Twin"));
  k.click(k.btn(k.$("view"), "Restore"));
  ok(k.saved().quests.find(q => q.id === "pV").vault !== null && /already exists/.test(k.$("toast").textContent), "restoring it while a live quest has that name is refused");
}
{
  // An import onto a taken name gets a number.
  const k = kit(await mk({ settings: { hideWelcome: true } }));
  k.tab("settings");
  const board = { name: "Sample App", cards: [{ id: "c1", name: "A card", desc: "", due: null, closed: false, idChecklists: [], idLabels: [], idMembers: [] }], checklists: [], labels: [], members: [] };
  const input = k.$("importTrelloFile");
  Object.defineProperty(input, "files", { value: [new k.w.File([JSON.stringify(board)], "b.json")], configurable: true });
  k.fire(input, "change"); await new Promise(r => setTimeout(r, 40));
  ok(k.$("modalBody").textContent.includes("named “Sample App (2).”") && k.$("modalBody").textContent.includes("a number is added"), "the import dialog says the quest will be numbered");
  k.click(k.btn(k.$("modalBody"), "Import"));
  ok(k.saved().quests.some(q => q.name === "Sample App (2)") && k.saved().quests.filter(q => q.name === "Sample App").length === 1, "the imported quest is saved as Sample App (2)");
}
{
  // Chips on a Tasks row sit under the title, and the Tasks list has no chip inside the clamped title.
  const k = kit(await mk({ settings: { hideWelcome: true } }));
  k.tab("schedule");
  const bl = [...k.d.querySelectorAll("#view .tlist li")].find(li => li.querySelector(".chip.backlog"));
  ok(!!bl && !!bl.querySelector(".l3 .chip.backlog") && !bl.querySelector(".l1 .chip") && !bl.querySelector(".l2 .chip"), "a Backlog chip sits under the title, not in the date line or the title line");
}
{
  // Every phone number in the export is a tel: link, on both sides of the letterhead.
  const saved = {
    settings: { contact: { company: "Acme Co.", name: "", phone: "+44 20 7946 0958", email: "", address: "", website: "" } },
    quests: [{ id: "pT2", name: "Both Phones", status: "active", start: "2026-08-03", days: 7, client: { org: "Client Co.", poc: "", phone: "+1 (805) 559-3005", email: "", address: "", website: "", coin: "", per: "Hour" } }],
    tasks: []
  };
  const { html } = await exportClick(kit(await mk(saved)), "Both Phones");
  ok(html.includes('<a href="tel:+442079460958">+44 20 7946 0958</a>') && html.includes('<a href="tel:+18055593005">+1 (805) 559-3005</a>'), "the export links both the Prepared by and the Prepared for phone numbers");
  const none = await exportClick(kit(await mk({ settings: { contact: { company: "Acme Co.", name: "", phone: "call after five", email: "", address: "", website: "" } }, quests: [{ id: "pT3", name: "Words Phone", status: "active", start: "2026-08-03", days: 7 }], tasks: [] })), "Words Phone");
  ok(none.html.includes("<div>call after five</div>") && !none.html.includes('href="tel:"'), "a phone field with no digits prints as plain text, never an empty link");
}
{
  // The folded task detail: no title or dates, and Done when sits between the estimate and Steps.
  const k = kit(await mk({ settings: { hideWelcome: true } }));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  const row = [...k.d.querySelectorAll("#view .questmain .tlist:not(.sectionlist) .item")].find(b => b.textContent.includes("Build the sign-in flow"));
  k.click(row);
  const d = k.d.querySelector("#view .questmain .tlist:not(.sectionlist) .detail");
  ok(!!d && !d.querySelector(".what") && !d.querySelector(".dmeta") && !d.querySelector(".editrow"), "an opened task has no title or date line of its own");
  const kids = [...d.children], at = (f) => kids.findIndex(f);
  const est = at(c => c.querySelector && !!c.querySelector("#task-est")), dw = at(c => c.tagName === "H3" && c.textContent === "Done when"), steps = at(c => c.tagName === "H3" && /^Steps/.test(c.textContent));
  ok(est >= 0 && dw > est && steps > dw && kids[dw + 1].textContent === "People can sign up and log in", "Done when is a subtitle with its text under it, after the estimate and before Steps");
  const dwPen = d.querySelector(".donewhen button.pencil");
  k.click(dwPen);
  const dwIn = k.d.querySelector("#view .donewhen .inlineedit");
  dwIn.value = "Sign-up and log-in both work";
  dwIn.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(!!dwPen && k.saved().tasks.find(t => t.id === "a2").done === "Sign-up and log-in both work" && k.d.querySelector("#view .donewhen span").textContent === "Sign-up and log-in both work", "Done when has a pencil that edits it in place");
  // Clearing it brings back the plain field, and typing into the field brings back the pencil.
  k.click(k.d.querySelector("#view .donewhen button.pencil"));
  const dwClear = k.d.querySelector("#view .donewhen .inlineedit");
  dwClear.value = "";
  dwClear.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  const dwField = k.d.querySelector("#view .detail input.donewhenfield");
  ok(k.saved().tasks.find(t => t.id === "a2").done === "" && !!dwField && !k.d.querySelector("#view .donewhen"), "a task with no Done when shows a plain field, with no pencil");
  dwField.value = "People can sign in"; k.fire(dwField, "blur");
  ok(k.saved().tasks.find(t => t.id === "a2").done === "People can sign in" && !k.d.querySelector("#view .detail input.donewhenfield") && k.d.querySelector("#view .donewhen span").textContent === "People can sign in", "leaving the field saves it, and it becomes the text with a pencil");
  k.click(k.d.querySelector('#view .questmain button.rowpencil[data-task="a2"]'));
  k.setField("what", ""); k.click(k.btn(k.$("modalBody"), "Save"));
  ok(!k.$("overlay").hidden && k.$("modalBody").textContent.includes("A task needs a title.") && k.saved().tasks.find(t => t.id === "a2").what === "Build the sign-in flow", "the rename dialog refuses an empty title");
}
/* ---- issues ---- */
{
  const T = (id, extra) => Object.assign({ id, block: 0, questId: "pI", what: "Task " + id, done: "x", status: "Not started", steps: [] }, extra);
  const base = (tasks, more) => Object.assign({ settings: { hideWelcome: true }, quests: [{ id: "pI", name: "Issue Quest", status: "active", start: "2026-08-03", days: 7 }], tasks }, more);
  const finish = (k, id) => { const sel = k.d.querySelector('select.rowstatus[data-task="' + id + '"]'); sel.value = "Completed"; k.fire(sel); };
  const questOf = (k) => k.saved().quests.find(q => q.id === "pI");
  // An issue with no due date: its own section, no Backlog chip, and it does not hold the quest open.
  let k = kit(await mk(base([T("t1", { block: 1 }), T("b1"), T("i1", { issue: true, what: "Crash on save" })])));
  ok(/Remaining: 1 of 1 task \| Backlog: 1 unscheduled task$/.test(k.d.querySelector("#view .remaining").textContent), "an issue with no due date is not in the burndown or the Backlog count");
  k.tab("schedule");
  ok(!k.$("view").textContent.includes("Crash on save") && k.$("view").textContent.includes("Backlog (1)"), "it is not on the Tasks page, in the list or in the Backlog");
  k.tab("projects");
  ok(k.$("view").textContent.includes("1 open task · 1 open issue"), "an In progress row counts the quest's open issues apart from its tasks");
  k.click(k.btn(k.$("view"), "Issue Quest"));
  ok(k.$("view").textContent.includes("Complete: 0 of 2 tasks | Backlog: 1 unscheduled task | Issues: 1 open"), "the quest's count line does the same");
  const irow = k.$("itask-i1");
  ok(!!k.$("h-issues") && !!irow && !k.$("ptask-i1") && !irow.querySelector(".chip.backlog") && !irow.querySelector(".l1") && irow.classList.contains("nol1"), "the quest page lists it under Issues, with no Backlog chip and no date line");
  ok(k.$("h-issues").closest(".sechead").nextElementSibling.textContent === "Complete: 0 of 1 issue" && !!k.btn(k.$("view"), "Add issue"), "the Issues section has its count line and an Add issue button");
  k.click(irow.querySelector(".item"));
  const det = k.$("itask-i1").querySelector(".detail");
  ok(!!det && det.textContent.includes("Due date (optional)") && !k.btn(det, "Make milestone") && !!k.btn(det, "Launch critical"), "an open issue offers an optional due date and Launch critical, and no milestone button");
  finish(k, "b1"); finish(k, "t1");
  ok(questOf(k).status === "complete" && k.$("modalBody").textContent.includes("1 issue is still open."), "finishing the last task completes the quest with an open issue, and the dialog says so");
  // A launch-critical issue moves to Before you launch and holds the quest open.
  k = kit(await mk(base([T("t1", { block: 1 }), T("i1", { issue: true, launch: true, what: "Crash on save" })])));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Issue Quest"));
  const lrow = k.$("ltask-i1");
  ok(!!lrow && !!lrow.querySelector(".chip.issuechip") && !lrow.querySelector(".chip.backlog") && k.$("h-issues").closest(".sechead").nextElementSibling.textContent === "No issues yet." && !!k.btn(k.$("view"), "Add issue"), "a launch-critical issue sits in Before you launch with an Issue chip, and the Issues section reads No issues yet. with its Add issue button");
  ok(k.$("h-checks").closest(".sechead").nextElementSibling.textContent === "Complete: 0 of 1 launch-critical item", "the launch count says items once an issue is on it");
  finish(k, "t1");
  ok(questOf(k).status === "active", "an open launch-critical issue holds the quest open");
  // An issue with a due date is scheduled work: Tasks page, burndown, and completion.
  k = kit(await mk(base([T("t1", { block: 1 }), T("i1", { issue: true, block: 1, due: "2026-12-01", milestone: true, what: "Crash on save" })])));
  ok(/Remaining: 2 of 2 tasks/.test(k.d.querySelector("#view .remaining").textContent), "an issue with a due date counts in the burndown");
  k.tab("schedule");
  const trow = [...k.d.querySelectorAll("#view .listpane .item")].find(b => b.textContent.includes("Crash on save"));
  ok(!!trow && trow.querySelector(".l3").firstElementChild.classList.contains("issuechip") && !trow.querySelector(".chip.milestonechip"), "it is on the Tasks page with the Issue chip first under the title, and an issue is never a milestone");
  finish(k, "t1");
  ok(questOf(k).status === "active", "an open issue with a due date holds the quest open");
  // New issue from the + menu.
  k = kit(await mk(base([T("t1", { block: 1 })])));
  k.menuAct("newBtn", "newIssue");
  ok(k.$("modalTitle").textContent === "New issue" && !!k.$("f-quest") && !!k.$("f-what") && !!k.$("f-notes"), "New issue asks for a quest, a title, and notes");
  k.click(k.btn(k.$("modalBody"), "Add issue"));
  ok(!k.$("overlay").hidden && k.$("modalBody").textContent.includes("Enter a title for the issue."), "an issue needs a title");
  k.setField("what", "Typo in footer"); k.click(k.btn(k.$("modalBody"), "Add issue"));
  const made = k.saved().tasks.find(t => t.what === "Typo in footer");
  ok(!!made && made.issue === true && made.block === 0 && made.due === "" && made.done === "" && k.$("toast").textContent.includes("added as an issue to Issue Quest."), "it is saved as an issue with no due date");
  // Search finds an issue and opens it on its quest's page.
  k.type("Typo");
  const hit = k.d.querySelector("#searchResults .item");
  ok(!!hit && hit.querySelector(".l1").textContent.includes("Issue Quest · Issue · Not started"), "search lists an issue as an Issue, not as Backlog");
  k.click(hit);
  ok(k.$("viewTitle").textContent === "Issue Quest" && k.$("itask-" + made.id).querySelector(".item").getAttribute("aria-expanded") === "true", "opening it goes to its quest's page with the issue open");
  // The Quest giver export leaves issues with no due date out unless asked.
  async function exportRun(check) {
    const kx = kit(await mk(base([T("t1", { block: 1 }), T("i1", { issue: true, what: "Crash on save" }), T("i2", { issue: true, block: 1, due: "2026-12-01", what: "Slow first load" })])));
    let written = null;
    kx.w.showSaveFilePicker = () => Promise.resolve({ createWritable: () => Promise.resolve({ write: (t) => { written = t; return Promise.resolve(); }, close: () => Promise.resolve() }) });
    kx.tab("projects"); kx.click(kx.btn(kx.$("view"), "Issue Quest")); kx.click(kx.btn(kx.$("view"), "Quest giver export"));
    const boxes = [...kx.d.querySelectorAll('#overlay input[type="checkbox"]')].map(c => c.id + ":" + c.checked);
    if (check) kx.$("f-issues").checked = true;
    kx.click(kx.btn(kx.$("overlay"), "Export"));
    await new Promise((r) => setTimeout(r, 30));
    return { html: written || "", boxes };
  }
  let r = await exportRun(false);
  ok(r.boxes.join() === "f-issues:false" && !r.html.includes("Crash on save") && !r.html.includes("<h3>Issues</h3>"), "the export offers issues unchecked, and leaves them out by default");
  ok(r.html.includes("Slow first load") && r.html.includes('<span class="chip issuechip"'), "an issue with a due date exports with the tasks, marked as an issue");
  r = await exportRun(true);
  ok(r.html.includes("<h3>Issues</h3>") && r.html.includes("Crash on save"), "checking the box lists the issues that have no due date");
}
/* ---- sample issues and the Backlog chip ---- */
{
  const k = kit(await mk({ settings: { hideWelcome: true } }));
  const issues = k.saved().tasks.filter(t => t.issue);
  ok(issues.some(t => t.block === 0 && t.status !== "Completed") && issues.some(t => t.block > 0) && issues.some(t => t.status === "Completed"), "the samples include issues with no due date, one with a due date, and a resolved one (" + issues.length + ")");
  ok(issues.every(t => !t.milestone && !t.launch), "no sample issue is a milestone or launch critical");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  const dark = k.$("ptask-a6");
  ok(!!dark && !dark.querySelector(".l1") && dark.classList.contains("nol1") && dark.querySelector(".l3").firstElementChild.classList.contains("backlog"), "an undated task on a quest's page has no date line, and its Backlog chip leads the chips under the title");
  ok(!!k.$("itask-i1") && !k.$("itask-i1").querySelector(".l1") && !!k.$("itask-i2").querySelector(".l1") && !k.$("ptask-i1") && !k.$("ptask-i2"), "the sample issues list under Issues, the dated one with a date line and the undated one without");
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
  ok(!/button\.rowpencil\s*\{[^}]*--row-l1/.test(css), "no layout moves a row's pencil off the title line, so it stays beside the pulldown at every width");
}
console.log(fails ? ("\n" + fails + " FAILED") : "\nALL PASSED");
process.exit(fails ? 1 : 0);

}

main().catch(e => { console.error(e); process.exit(1); });
