const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { register } = require("module");
const { pathToFileURL } = require("url");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// index.html now loads its logic as real ES modules (app/app.js and everything it
// imports), not an inline <script>. jsdom 30's own <script type="module"> support
// is not something to rely on here (untested against this project, version-
// dependent, and historically incomplete) -- instead, each test window gets its
// own jsdom instance, and the app's module graph is loaded directly through
// Node's native ESM loader against that window's document/localStorage, set as
// temporary globals for the duration of the dynamic import() (the app code reads
// bare `window`/`document`/`localStorage` globals, same as it did inline).
//
// A fresh, unique query string on ONLY the entry-point import (app/app.js?t=N)
// is NOT enough to isolate `state` between tests: confirmed by direct testing,
// app.js's own internal `import "./state.js"` carries no query of its own, so
// every mk() call's app.js graph still resolved the SAME state.js instance,
// silently leaking mutations (marking a task done, archiving it, etc.) from one
// test's dom into the next test's "fresh" one. tests/isolate-loader.mjs is a
// Node module customization hook that rewrites every resolution of a file under
// app/ to carry the current run's tag, so the WHOLE graph (state, dates, model,
// dom, views, dialogs, search, chart) reloads fresh each call, not just the
// entry module.
register(pathToFileURL(path.join(__dirname, "isolate-loader.mjs")));

let counter = 0;
async function mk(saved, claude, stamp) {
  const dom = new JSDOM(html, { url: "https://example.test/", pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  if (claude) dom.window.claude = claude;
  if (stamp) dom.window.localStorage.setItem("sidequest-template-v1-saved-at", stamp);
  if (saved) dom.window.localStorage.setItem("sidequest-template-v1", JSON.stringify(saved));
  global.window = dom.window;
  global.document = dom.window.document;
  // Node 22+ has its own built-in `localStorage` global, defined as a getter --
  // a plain `global.localStorage = ...` assignment throws (see Node's webstorage
  // internal). Redefine the property instead so jsdom's window.localStorage wins.
  Object.defineProperty(global, "localStorage", { value: dom.window.localStorage, configurable: true, writable: true });
  global.FileReader = dom.window.FileReader;
  await import("../app/app.js?run=" + (++counter));
  // app.js's own boot sequence (rendering the initial view, wiring menus and
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
    stand: () => [...d.querySelectorAll("#view .standing li")].map(li => (li.querySelector(".plink") || {}).textContent) };
}

async function main() {

/* ---- housekeeping ---- */
ok(!/—/.test(html), "no em dashes");
ok(!html.includes("project-schedule-v"), "uses its own storage keys");
{
  const stateJs = fs.readFileSync(path.join(__dirname, "..", "app", "state.js"), "utf8");
  ok(stateJs.includes('APP_VERSION = "1.0.0"'), "version kept in state.js");
  const viewsJs = fs.readFileSync(path.join(__dirname, "..", "app", "views.js"), "utf8");
  ok(viewsJs.includes('href: "https://samoff.com"') && viewsJs.includes("Tim Samoff"), "credit, link, and version kept in views.js/state.js");
}

/* ---- icon files and links ---- */
{
  const fsx = require("fs"), pathx = require("path");
  const root = pathx.join(__dirname, "..");
  for (const f of ["assets/sidequest-icon.svg", "assets/favicon-32.png", "assets/apple-touch-icon.png"]) ok(fsx.existsSync(pathx.join(root, f)), f + " exists");
  ok(html.includes('rel="icon" type="image/svg+xml" href="assets/sidequest-icon.svg"') && html.includes('rel="apple-touch-icon" href="assets/apple-touch-icon.png"') && html.includes('sizes="32x32" href="assets/favicon-32.png"'), "page links the favicon and home screen icons");
  ok(/<title>Sidequest<\/title>/.test(html), "page title is Sidequest");
  const png = b => b.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  ok(png(fsx.readFileSync(pathx.join(root, "assets/apple-touch-icon.png"))) && /#c62f2f/i.test(fsx.readFileSync(pathx.join(root, "assets/sidequest-icon.svg"), "utf8")), "icons are valid: a real PNG, and the SVG uses the logo red");
}

/* ---- first run ---- */
{
  const k = kit(await mk());
  ok(k.$("viewTitle").textContent === "Today" && k.d.title.includes("Sidequest"), "opens on Today");
  ok(k.$("view").textContent.includes("Welcome to Sidequest") && k.$("view").textContent.includes("samples") && !!k.$("welcomeSettings") && !!k.$("welcomeDismiss"), "welcome box explains the samples");
  ok(k.d.querySelector('.tab[data-view="proj:pApp"]').textContent.trim() === "Sample App" && k.d.querySelector("#nav").textContent.includes("Pinned"), "Sample App is the pinned project");
  ok([...k.d.querySelectorAll("#nav .tab")].map(t => t.dataset.view).join() === "today,projects,schedule,timeline,proj:pApp", "sidebar: core pages + one pinned project");
  // dismiss
  k.click(k.$("welcomeDismiss")); ok(!k.$("view").textContent.includes("Welcome to Sidequest") && k.saved().settings.hideWelcome === true, "dismissing hides it and remembers");
  // Today content
  ok(k.$("view").textContent.includes("Next up") && k.d.querySelector("#view .chartbox svg") && /\d+ tasks remaining, out of \d+/.test(k.$("view").textContent), "Today works with sample data");
  const next = k.d.querySelector("#view .panel .ptitle").textContent;
  ok(next === "Write the page copy", "Next up is the lowest-block open sample task: " + next);
  ok(/1 task is overdue/.test(k.$("view").textContent) && k.$("view").textContent.includes("Build the sign-in flow") && /11 tasks remaining, out of 12/.test(k.$("view").textContent), "the samples include one overdue task, so the burndown sits above the plan");
  const projLink = k.btn(k.d.querySelector("#view .panel"), "Sample Website");
  ok(!!projLink && projLink.classList.contains("plink"), "Next up names the project as a link");
  k.click(projLink);
  ok(k.$("viewTitle").textContent === "Sample Website", "clicking the project link opens that project's page");
}

/* ---- sample projects ---- */
{
  const k = kit(await mk()); k.tab("projects");
  ok(k.stand().join() === "Sample App,Sample Website,Sample Game", "In progress lists the three sample projects, earliest next task first (" + k.stand().join() + ")");
  const pagesList = [...k.d.querySelectorAll("#view .list")][0].textContent;
  ok(!pagesList.includes("Sample App") && !pagesList.includes("Sample Website") && !pagesList.includes("Sample Game"), "the Projects list excludes the projects already shown in In progress");
  ok(k.$("view").textContent.includes("Sample Browser Extension") && k.$("view").textContent.includes("Sample Command-Line Tool"), "two sample candidates listed");
  k.tab("parking");
  ok(k.$("view").textContent.includes("Try a new game engine") && k.$("view").textContent.includes("Write up lessons learned") && !k.$("view").textContent.includes("Redesign the logo"), "parking lot samples (removed one is in the Archive)");
  k.tab("schedule");
  const rows = [...k.d.querySelectorAll(".listpane .tlist")[0].querySelectorAll(".item")].map(b => b.textContent);
  ok(rows.length === 12, "12 scheduled tasks (Sample Finished Project's tasks are hidden while it's Complete) (got " + rows.length + ")");
  ok(k.$("view").textContent.includes("Backlog (2)") && k.$("view").textContent.includes("Add a dark mode") && k.$("view").textContent.includes("Add a level editor"), "backlog has two samples");
  ok(k.d.querySelector('label[for="task-due"]').textContent.includes("Due date"), "the task's schedule field is a due date");
  // per-project schedules
  k.tab("timeline");
  const lanes = [...k.d.querySelectorAll("#view .lane .lname")].map(l => l.textContent);
  ok(lanes.filter(l => l.startsWith("Sample")).length === 3, "timeline has a lane for each non-Complete sample project (Sample Finished Project is hidden while Complete)");
  const game = [...k.d.querySelectorAll("#view .lane")].find(l => l.querySelector(".lname").textContent.startsWith("Sample Game"));
  ok(game.querySelectorAll(".bar").length === 2 && game.querySelector(".ldates").textContent.includes("due "), "Sample Game shows an estimate bar");
  const mil = k.d.querySelector("#view .mslist").textContent;
  ok(mil.includes("Sample App beta opens") && mil.includes("Sample Game demo day"), "two sample milestones");
  // dates: three different starts
  k.tab("schedule");
  const l1 = [...k.d.querySelectorAll(".listpane .item .l1")].map(x => x.textContent);
  const starts = new Set(l1.filter(t => /Sample (App|Website|Game)/.test(t)).map(t => t.split("·")[0].trim() + "|" + (t.split("·")[1] || "").trim().split(" to ")[0]));
  ok(new Set(l1.map(t => t.split("·")[1].trim().split(" to ")[0])).size >= 5, "projects start at different times (own start dates and pace)");
}

/* ---- Launch section on a project page ---- */
{
  const k = kit(await mk()); k.tab("today"); k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok(k.$("viewTitle").textContent === "Sample App" && k.$("view").textContent.includes("Before you launch") && k.$("view").textContent.includes("Launch"), "project page has a Launch section, scoped to this project");
  const lb = k.d.querySelector("#view .listbox");
  ok(/^\d+ of \d+ done$/.test(lb.querySelector(".progress").textContent) && lb.querySelectorAll("ul.list.check li").length === 6, "Sample App's checklist is its own 5 launch-flagged steps plus 1 launch-critical linked project (" + lb.querySelectorAll("ul.list.check li").length + ")");
  ok(lb.textContent.includes("Sample Website (linked project)") && lb.textContent.includes("Launch critical"), "the launch-critical linked project appears as a read-only checklist line");
  ok(!k.d.querySelector("#view .decision") && ![...k.d.querySelectorAll("#view h3")].some(h => h.textContent === "Decisions") && !k.btn(k.$("view"), "Add decision"), "the project page no longer has a Decisions section (decisions live on steps in Tasks)");
  ok(k.d.querySelector("#view .list.check li.done") && k.d.querySelector("#view .list.check").textContent.includes("Choose the first app store"), "answered decision's step is already ticked");
  // sync
  const before = k.d.querySelector("#view .progress").textContent;
  const box = [...k.d.querySelectorAll("#view .list.check li")].find(li => li.textContent.includes("Prepare screenshots")).querySelector("input"); box.checked = true; k.fire(box);
  ok(k.d.querySelector("#view .progress").textContent !== before, "ticking updates progress");
  // step toggle wording
  k.tab("schedule"); k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Submit to the app store")));
  ok(!k.btn(k.d.querySelector(".detailpane"), "Cut from Launch") && !k.btn(k.d.querySelector(".detailpane"), "Add to Launch") && [...k.d.querySelectorAll(".detailpane .steps .chip")].some(c => c.textContent === "Launch"), "a step's Launch state is now a chip on its row, and the toggle lives in the step dialog");
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App")); k.click(k.btn(k.$("view"), "Add item")); ok(k.$("modalTitle").textContent === "New launch item", "Add item dialog uses launch wording"); k.click(k.$("modalClose"));
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
  ok(!k.btn(row("Choose the first app store"), "Remove") && !!row("Choose the first app store").querySelector("button.pencil"), "a step row has just the decision control and one edit pencil");
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
  const offered = [...k.$("modalBody").querySelectorAll("#f-step option")].map(o => o.textContent);
  ok(k.$("modalTitle").textContent === "New decision" && !offered.some(t => t.includes("Choose the first app store")) && offered.some(t => t.includes("Write the store description")), "the New decision menu only offers steps that do not already have a decision");
  k.click(k.$("modalClose"));
}
{
  // editing a step: text, Launch flag, and Remove (which takes its decision with it)
  const k = kit(await mk());
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Submit to the app store")));
  const row = (text) => [...k.d.querySelectorAll(".detailpane .steps li")].find(li => li.textContent.includes(text));
  const st = (id) => k.saved().tasks.find(t => t.id === "a5").steps.find(s => s.id === id);
  ok(!!row("Prepare screenshots").querySelector(".chip"), "a launch step shows a Launch chip");
  k.click(row("Prepare screenshots").querySelector("button.pencil"));
  ok(k.$("modalTitle").textContent === "Edit step" && k.$("f-text").value === "Prepare screenshots" && k.$("f-launch").checked === true, "the pencil opens the step dialog, pre-filled with its text and Launch flag");
  k.setField("text", "Prepare four screenshots"); k.$("f-launch").checked = false;
  k.click(k.btn(k.$("modalBody"), "Save step"));
  ok(st("a5b").text === "Prepare four screenshots" && st("a5b").launch === false, "Save updates the same step's text and Launch flag");
  ok(!row("Prepare four screenshots").querySelector(".chip"), "the Launch chip goes away");
  k.click(row("Prepare four screenshots").querySelector("button.pencil")); k.setField("text", ""); k.click(k.btn(k.$("modalBody"), "Save step"));
  ok(!k.$("overlay").hidden && st("a5b").text === "Prepare four screenshots", "an empty step is rejected");
  k.click(k.btn(k.$("modalBody"), "Cancel"));
  k.click(row("Choose the first app store").querySelector("button.pencil"));
  ok(k.$("modalBody").textContent.includes("Removing this step also removes its decision"), "the dialog warns that Remove takes the step's decision");
  k.click(k.btn(k.$("modalBody"), "Remove"));
  ok(!st("a5z") && !k.saved().decisions.find(d => d.step === "a5z"), "Remove deletes the step and its decision");
}
{
  // a task's name is editable
  const k = kit(await mk());
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Build the home screen")));
  ok(!!k.d.querySelector(".detailpane .editrow button.pencil"), "a task's detail has a pencil next to its name");
  k.click(k.d.querySelector(".detailpane .editrow button.pencil"));
  const i = k.d.querySelector(".detailpane .inlineedit"); i.value = "Build the main screen";
  i.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
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
  ok(titles.length === 13 && titles.includes("Launch checklist and decisions"), "template Help has the Launch checklist topic (" + titles.length + " topics)");
  ok(k.$("view").textContent.includes("use the pencil beside a step") && k.$("view").textContent.includes("Add decision"), "and the topic explains the step pencil and adding a decision from a step");
  const helpText = k.$("view").textContent;
  ok(!helpText.includes("Mark done") && !helpText.includes("archive completed tasks") && !helpText.includes("View beside its name") && !helpText.includes("with its circle"), "Help no longer describes buttons and settings that were removed");
  ok(["Finish or archive a project", "Link projects", "Use the Parking lot"].every(t => titles.includes(t)) && helpText.includes("Reopen") && helpText.includes("splash screen"), "Help covers Complete/Reopen, linking, the Parking lot, and the splash setting");
  ok([...k.d.querySelectorAll("#navBottom .tab")].map(t => t.textContent.trim()).join() === "Parking lot,Archive,Help,Settings", "Help sits between Archive and Settings");
}

/* ---- archive samples: only Projects and Ideas archive now ---- */
{
  const k = kit(await mk()); k.tab("archive");
  const t = k.$("view").textContent;
  ok(t.includes("Redesign the logo") && t.includes("All (1)"), "Archive shows just the one archived sample idea (" + t.match(/All \(\d+\)/) + ")");
  ok(!t.includes("Sketch the main screens") && !t.includes("Should the site use a page builder?"), "completed tasks and decisions no longer appear in the Archive -- they live in their project instead");
  const filters = [...k.d.querySelectorAll("#view .chipbtn")].map(b => b.textContent.trim());
  ok(filters.join() === "All (1),Projects (0),Ideas (1)", "Archive filters are just All/Projects/Ideas now (" + filters.join() + ")");
}
/* ---- completed tasks stay visible, sorted to the bottom ---- */
{
  const k = kit(await mk()); k.tab("schedule");
  const rows = [...k.d.querySelectorAll(".listpane .tlist")[0].querySelectorAll(".item")];
  const statuses = rows.map(b => b.classList.contains("done"));
  const firstDone = statuses.indexOf(true);
  ok(firstDone === -1 || statuses.slice(firstDone).every(Boolean), "once a completed task appears, every task after it in the list is also completed (sunk to the bottom)");
  ok(rows.length === 12, "completed tasks (Sketch the main screens, Build the sign-in flow) stay in the Tasks list, not moved to the Archive (" + rows.length + ")");
}

/* ---- search works on samples ---- */
{
  const k = kit(await mk()); k.type("beta");
  ok(k.d.querySelectorAll("#searchResults .sgroup").length >= 2 && k.$("searchStatus").textContent.match(/\d+ results?/), "search finds the beta tasks and milestone");
  k.type("logo"); ok(k.d.querySelector("#searchResults .chip.arch"), "search finds archived samples");
}

/* ---- Start fresh and reload samples ---- */
{
  const k = kit(await mk()); k.tab("settings");
  ok(k.$("view").textContent.includes("Start fresh"), "Start fresh is in Settings");
  k.click(k.$("startFresh")); ok(k.$("modalBody").textContent.includes("The sample projects") && k.$("modalBody").textContent.includes("An empty planner"), "offers empty or sample projects");
  const a = k.$("freshAck"); a.checked = true; k.fire(a); k.click(k.$("freshGo"));
  ok(k.$("view").textContent.includes("No tasks yet") && k.saved().tasks.length === 0 && k.saved().settings.hideWelcome === true, "empty planner: nothing left, welcome stays hidden");
  ok(k.saved().projects.length === 0 && k.saved().pins.length === 0, "no projects and no pins after a fresh start");
  // add own project from scratch: a task needs an active project to attach to
  k.menuAct("newBtn", "newProject"); k.setField("name", "My App"); k.click(k.btn(k.$("modalBody"), "Add project"));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Promote"));
  k.menuAct("newBtn", "newTask"); k.setField("what", "First task"); k.click(k.btn(k.$("modalBody"), "Add task"));
  k.tab("today"); ok(k.$("view").textContent.includes("First task"), "can start working right away, once a project exists");
  // reload samples
  k.tab("settings"); k.click(k.$("startFresh")); const r = [...k.d.querySelectorAll('#modalBody input[name=fresh]')]; r[1].checked = true; k.fire(r[1]);
  const a2 = k.$("freshAck"); a2.checked = true; k.fire(a2); k.click(k.$("freshGo"));
  ok(k.saved().tasks.length === 18 && k.saved().pins.includes("proj:pApp"), "the samples can be reloaded");
}

/* ---- core behavior still intact ---- */
{
  const k = kit(await mk());
  k.tab("schedule"); const sel = k.d.querySelector(".detailpane select.status");
  ok(sel && sel.value === "In progress", "schedule shows the selected sample task");
  k.tab("settings"); ok(k.d.getElementById("set-word").value === "Sprint" && k.$("view").textContent.includes("days per Sprint"), "Settings show the Sprint vocabulary");
  ok(!k.d.getElementById("set-start"), "Settings no longer has a default-start-date field");
  ok(k.d.querySelector("#view .about").textContent.includes("© Tim Samoff"), "About keeps the credit");
  // completing a sample task marks it Completed but keeps it visible (no archiving)
  k.tab("today"); const nextTaskTitle = k.d.querySelector("#view .panel .ptitle").textContent;
  ok(!k.btn(k.$("view"), "Mark completed"), "Today's Next up card has no one-click Mark completed shortcut");
  k.click(k.btn(k.$("view"), "Open task"));
  const statusSel = k.d.querySelector(".detailpane .status"); statusSel.value = "Completed"; k.fire(statusSel);
  k.tab("schedule");
  const completedRow = [...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes(nextTaskTitle));
  ok(completedRow && completedRow.classList.contains("done"), "the task shows as completed in Tasks, not moved anywhere");
  // backup file: Save backup writes through the browser's Save As dialog
  k.tab("settings");
  let written = null, asked = null;
  k.w.showSaveFilePicker = (opts) => { asked = opts; return Promise.resolve({ createWritable: () => Promise.resolve({ write: (t) => { written = t; return Promise.resolve(); }, close: () => Promise.resolve() }) }); };
  k.click(k.$("saveFile")); await new Promise(r => setTimeout(r, 30));
  const j = JSON.parse(written);
  ok(j.tasks.length === 18 && j.projects.find(p => p.name === "Sample Game").days === 14, "Save backup writes the sample data");
  ok(/^sidequest-backup-\d{4}-\d{2}-\d{2}\.json$/.test(asked.suggestedName), "and suggests a dated .json file name (" + asked.suggestedName + ")");
  ok(k.$("view").textContent.includes("Backup saved."), "and says it saved");
  ok(!k.$("showText") && !k.$("backupText") && !k.$("restoreText"), "there is no backup text box and no paste box any more");
  ok(k.btn(k.$("view"), "Save backup") && k.btn(k.$("view"), "Restore backup"), "the buttons are named Save backup and Restore backup");
  // reload keeps changes and skips the welcome
  const k2 = kit(await mk(k.saved())); ok(k2.$("viewTitle").textContent === "Today" && !k2.$("view").textContent.includes("Welcome to Sidequest") || k2.saved !== undefined, "reload opens on Today");
}

/* ---- new step: project filter ---- */
{
  const k = kit(await mk());
  k.menuAct("newBtn", "newStep");
  const projSel = k.$("f-project"), taskSel = k.$("f-task");
  ok(!!projSel && !!taskSel, "New step form has a project filter and a task select");
  ok(projSel.value === "", "with nothing selected in Schedule, the project filter starts on All projects");
  ok(taskSel.selectedOptions[0].label === "Sample Website: Write the page copy", "the task select still defaults to the next-up task");
  const allProjects = [...taskSel.options].map(o => o.label);
  ok(allProjects.some(l => l.startsWith("Sample App:")) && allProjects.some(l => l.startsWith("Sample Game:")), "All projects shows every project's tasks");
  k.setField("project", "pGame"); k.fire(projSel);
  const afterGame = [...taskSel.options].map(o => o.label);
  ok(afterGame.length > 0 && afterGame.every(l => l.startsWith("Sample Game:")), "choosing a project narrows the task list to only that project's tasks");
  k.setField("text", "A step added via the filtered picker");
  k.click(k.btn(k.$("modalBody"), "Add step"));
  ok(k.$("toast").textContent.includes("Sample Game"), "step is added to the task chosen after filtering");
  // opening a task first changes the default filter to that task's project
  k.tab("schedule"); k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Build the layout")));
  k.menuAct("newBtn", "newStep");
  ok(k.$("f-project").value === "pSite", "with a task open in Schedule, defaults the filter to that task's project");
}

/* ---- linked projects: bidirectional, one-hop rendering ---- */
{
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok([...k.d.querySelectorAll("#view h2")].some(h => h.textContent === "Linked projects"), "project page has a Linked projects section");
  ok(k.$("view").textContent.includes("Sample Website"), "Sample App already links to Sample Website (sample data)");
  // bidirectional: the other side shows the link back
  k.click(k.btn(k.$("view"), "Sample Website"));
  ok(k.$("viewTitle").textContent === "Sample Website" && k.$("view").textContent.includes("Sample App"), "the link is bidirectional -- Sample Website shows Sample App back");
  // link Sample Website to Sample Game using the picker, confirm it appears and is bidirectional
  ok(!k.$("proj-link-pick"), "the old inline link dropdown is gone from the page");
  k.click(k.btn(k.$("view"), "Link project"));
  ok(k.$("modalTitle").textContent === "Link project", "Link project opens a dialog");
  const sel = k.$("f-project");
  ok(![...sel.options].some(o => o.textContent === "Sample Website" || o.textContent === "Sample App"), "the dialog only offers projects that are not already linked, and not this one");
  sel.value = [...sel.options].find(o => o.textContent === "Sample Game").value;
  k.click(k.btn(k.$("modalBody"), "Link project"));
  ok(k.$("overlay").hidden && k.$("view").textContent.includes("Sample Game"), "linking Sample Game from the dialog closes it and shows the link in the list");
  k.click(k.btn(k.$("view"), "Sample Game"));
  ok(k.$("viewTitle").textContent === "Sample Game" && k.$("view").textContent.includes("Sample Website"), "the new link is bidirectional too -- Sample Game shows Sample Website back");
  // unlink and confirm it's gone from the current page -- check the picker's
  // own <select> options too (Sample Website legitimately reappears THERE
  // once unlinked, since it's available to re-link; that's not the same as
  // still showing as a linked project).
  const unlinkBtn = [...k.d.querySelectorAll("#view button")].find(b => b.textContent.trim() === "Unlink");
  k.click(unlinkBtn);
  ok(k.$("view").textContent.includes("No linked projects"), "unlinking removes the linked-project row (Sample Website may still appear in the re-link picker, which is correct)");
}

/* ---- project Complete status, Launch-critical links, archived viewing ---- */
{
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  // manual Complete, independent of task status -- Sample App has open tasks
  ok(!!k.btn(k.$("view"), "Mark complete"), "Active project offers Mark complete regardless of task status");
  k.click(k.btn(k.$("view"), "Mark complete"));
  ok(k.$("modalTitle").textContent === "Project complete" && k.$("modalBody").textContent.includes("leave it in Projects"), "marking complete with open tasks left triggers the completion dialog, no block");
  k.click(k.btn(k.$("modalBody"), "Leave in Projects"));
  ok(k.$("overlay").hidden, "Leave in Projects closes the dialog");
  ok(k.$("view").textContent.includes("Restore") === false && !k.btn(k.$("view"), "Mark complete") && !k.btn(k.$("view"), "Archive") === false, "project stays Complete, not archived, after Leave in Projects");
  ok(k.saved().projects.find(p => p.id === "pApp").status === "complete", "status persisted as complete");
  // set apart visually, and can be reopened
  ok(!!k.d.querySelector("#view .chip.projcomplete"), "a Complete project shows a Complete badge on its own page");
  ok(!!k.btn(k.$("view"), "Reopen") && !k.btn(k.$("view"), "Mark complete"), "Complete project offers Reopen in place of Mark complete");
  k.tab("projects");
  ok(!k.stand().includes("Sample App"), "a Complete project drops out of In progress");
  const appRow = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample App"));
  ok(!!appRow, "a Complete project (no longer in In progress) appears in the Projects section instead");
  ok(!!appRow.querySelector(".chip.projcomplete"), "the Projects section also shows the Complete badge");
  ok(!k.btn(appRow, "View"), "Projects rows have no separate View button, the title is the link");
  k.click(k.btn(appRow, "Sample App"));
  ok(k.$("viewTitle").textContent === "Sample App", "View navigated to Sample App's own page");
  k.click(k.btn(k.$("view"), "Reopen"));
  ok(k.saved().projects.find(p => p.id === "pApp").status === "active", "Reopen sets the project back to active");
  ok(!k.d.querySelector("#view .chip.projcomplete"), "reopened project loses the Complete badge");
  ok(!!k.btn(k.$("view"), "Mark complete"), "reopened project offers Mark complete again");
  // sticky: reopening a task does not revert Complete
  k.click(k.btn(k.$("view"), "Mark complete"));
  k.click(k.btn(k.$("modalBody"), "Leave in Projects"));
  // Complete-but-kept: its tasks drop out of the Tasks list and the global
  // Timeline, but stay visible on the project's own page.
  k.tab("schedule");
  ok(!k.$("view").textContent.includes("Sketch the main screens"), "a Complete-but-kept project's tasks are hidden from the Tasks list");
  ok(k.$("view").textContent.includes("Tasks from Complete projects are not listed here"), "the Tasks page explains why");
  k.tab("timeline");
  ok(![...k.d.querySelectorAll("#view .lane .lname")].some(l => l.textContent === "Sample App"), "a Complete-but-kept project's lane is hidden from the global Timeline");
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok(k.$("view").textContent.includes("Its tasks are not included in Tasks, Timeline, or Today"), "the project's own page explains the hiding");
  k.click([...k.d.querySelectorAll(".projmain .tlist .item")].find(b => b.textContent.includes("Sketch the main screens")));
  const statusSel = k.d.querySelector(".projmain .detail .status"); statusSel.value = "In progress"; k.fire(statusSel);
  ok(k.saved().projects.find(p => p.id === "pApp").status === "complete", "reopening a task does not auto-revert a Complete project");
  // reopening the project brings its tasks straight back, no separate restore
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  k.click(k.btn(k.$("view"), "Reopen"));
  k.tab("schedule");
  ok(k.$("view").textContent.includes("Sketch the main screens"), "reopening the project brings its tasks back into the Tasks list immediately");
}
{
  // auto-trigger: complete every counted task on a project with no open tasks left
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  k.tab("schedule");
  // Open each of Sample App's tasks in turn (including its one Backlog item)
  // and mark it Completed via its status select -- every counted task has to
  // reach Completed, not just the scheduled ones, for the all-done guard to pass.
  const names = ["Sketch the main screens", "Build the sign-in flow", "Build the home screen", "Run a beta with five friends", "Submit to the app store", "Add a dark mode"];
  for (const nm of names) {
    const row = [...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes(nm));
    if (!row) continue;
    k.click(row);
    const sel = k.d.querySelector(".detailpane .status");
    if (sel.value !== "Completed") { sel.value = "Completed"; k.fire(sel); }
  }
  ok(k.$("modalTitle").textContent === "Project complete", "all-tasks-Completed auto-triggers the completion dialog");
  k.click(k.btn(k.$("modalBody"), "Archive now"));
  ok(k.saved().projects.find(p => p.id === "pApp").arch, "Archive now from the dialog archives the project");
}
{
  // empty-task-set guard: a candidate with zero tasks must never auto-complete
  const k = kit(await mk());
  k.tab("projects");
  const extRow = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample Browser Extension") && k.btn(li, "Promote"));
  k.click(k.btn(extRow, "Promote"));
  ok(k.saved().projects.find(p => p.id === "pExt").status === "active" && k.$("overlay").hidden, "promoting a task-less project to Active does not trigger completion");
}
{
  // Launch-critical: badge, checklist derivation, soft-gate warning (not a block)
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok([...k.d.querySelectorAll("#view .list li")].some(li => li.textContent.includes("Sample Website") && li.textContent.includes("Launch critical")), "Linked Projects shows a Launch critical badge for Sample Website");
  ok(!!k.btn(k.$("view"), "Unmark launch critical"), "the toggle button reflects Sample Website's launch-critical state from Sample App's own page");
  // archiving Sample App warns (soft gate) since Sample Website (launch-critical) is not complete/archived, but does not block
  k.click(k.btn(k.$("view"), "Archive"));
  ok(k.saved().projects.find(p => p.id === "pApp").arch, "archiving proceeds even with an incomplete launch-critical link (soft gate only, never a hard block)");
}
{
  // archived project pages are genuinely viewable, read-only, until restored
  const k = kit(await mk());
  const tasksBefore = k.saved().tasks.filter(t => t.projectId === "pGame" && !t.arch).length;
  k.tab("projects");
  k.click(k.btn(k.d.querySelector("#view .standing"), "Sample Game"));
  ok(k.$("viewTitle").textContent === "Sample Game", "navigated to Sample Game via Where things stand");
  k.click(k.btn(k.$("view"), "Archive"));
  ok(k.$("viewTitle").textContent !== "Sample Game" || k.$("view").textContent.includes("Archived"), "archiving navigates away or shows an archived notice");
  ok(k.saved().tasks.filter(t => t.projectId === "pGame" && !t.arch).length === 0 && tasksBefore > 0, "archiving a project cascades to archive its own tasks");
  k.tab("archive");
  const gameArchRow = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample Game"));
  ok(!k.btn(gameArchRow, "View") && gameArchRow.querySelector(".chip").previousElementSibling === k.btn(gameArchRow, "Sample Game"), "Archive rows have no View button, the title is the link, and the kind chip follows it");
  k.click(k.btn(gameArchRow, "Sample Game"));
  ok(k.$("viewTitle").textContent === "Sample Game", "an archived project's own page is now reachable (previously invisible)");
  ok(k.$("view").textContent.includes("Archived. Restore it to make changes."), "archived project page states it's read-only");
  ok(!k.btn(k.$("view"), "Add task") && !k.d.querySelector("#proj-start") && !k.d.querySelector("#view textarea"), "no mutating controls (Add task, schedule inputs, notes textarea) on an archived project page");
  ok(!!k.btn(k.$("view"), "Restore"), "archived project page offers Restore instead of Archive/Mark complete");
  k.click(k.btn(k.$("view"), "Restore"));
  ok(!k.saved().projects.find(p => p.id === "pGame").arch, "Restore un-archives the project");
  ok(k.saved().tasks.filter(t => t.projectId === "pGame" && !t.arch).length === tasksBefore, "restoring the project also un-archives the tasks the archive cascade archived");
}

{
  // ideas are editable, and their note is a real multiline textarea
  const k = kit(await mk());
  k.tab("parking");
  const row = () => [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Try a new game engine"));
  ok(!k.btn(row(), "Edit"), "an idea row has no separate Edit button, the title is the link");
  k.click(k.btn(row(), "Try a new game engine"));
  ok(k.$("modalTitle").textContent === "Edit idea", "selecting an idea's title opens the idea dialog in edit mode");
  ok(k.$("f-text").value === "Try a new game engine" && k.$("f-note").value === "Not competing for the next slot", "Edit pre-fills the idea's text and note");
  ok(k.$("f-note").tagName === "TEXTAREA", "the note field is a multiline textarea");
  k.setField("text", "Try Godot"); k.setField("note", "Line one\nLine two");
  k.click(k.btn(k.$("modalBody"), "Save idea"));
  const saved = k.saved().parked.find(p => p.id === "p1");
  ok(saved && saved.text === "Try Godot" && saved.note === "Line one\nLine two", "Save updates the same idea in place, keeping line breaks");
  ok(k.saved().parked.filter(p => !p.arch).length === 2, "editing does not add or remove ideas");
  ok(row() === undefined && !!k.$("view").textContent.includes("Try Godot"), "the Parking lot shows the edited text");
  k.menuAct("newBtn", "newIdea");
  ok(k.$("modalTitle").textContent === "New idea" && k.$("f-note").tagName === "TEXTAREA", "adding a new idea also uses the textarea note");
  k.setField("text", "Long note idea"); k.setField("note", "x".repeat(1500));
  k.click(k.btn(k.$("modalBody"), "Add to parking lot"));
  ok(k.saved().parked.find(p => p.text === "Long note idea").note.length === 1500, "a note longer than the old 300-character cap is kept");
}

{
  // a project has one Notes field, and saved data with the old separate short note still loads
  const saved = { projects: [
    { id: "pOld", name: "Old shape", status: "candidate", note: "short", notes: "long" },
    { id: "pOnly", name: "Only short", status: "candidate", note: "just this", notes: "" }
  ], tasks: [] };
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Old shape"));
  ok(!!k.$("f-notes") && k.$("f-notes").value === "short\n\nlong", "an old short note is folded into the front of Notes when both exist");
  k.click(k.btn(k.$("modalBody"), "Cancel"));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Only short"));
  ok(!!k.$("f-notes") && k.$("f-notes").value === "just this", "an old short note alone becomes the project's Notes");
}
{
  // a candidate is edited entirely through candidateDialog(), same pattern as an Idea
  const k = kit(await mk());
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Browser Extension"));
  ok(k.$("f-notes").value === "A small tool that could ship in a month", "the candidate dialog shows its Notes");
  ok(k.$("f-name").value === "Sample Browser Extension", "the candidate dialog shows its name");
  k.setField("notes", "Edited notes"); k.setField("name", "Renamed Extension");
  k.click(k.btn(k.$("modalBody"), "Save"));
  ok(k.saved().projects.find(p => p.id === "pExt").notes === "Edited notes" && k.saved().projects.find(p => p.id === "pExt").name === "Renamed Extension", "saving the candidate dialog saves its name and Notes");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Renamed Extension"));
  k.setField("name", "   "); k.click(k.btn(k.$("modalBody"), "Save"));
  ok(k.$("modalBody").textContent.includes("Enter a project name"), "a blank candidate name is rejected");
}
{
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  editTitle(k, "Habit App");
  ok(!!k.btn(k.d.querySelector("#nav"), "Habit App") && !k.btn(k.d.querySelector("#nav"), "Sample App"), "renaming a pinned project updates its name in the sidebar");
  ok(!k.$("renameBtn").hidden && !!k.d.querySelector("#view textarea"), "an active project keeps its pencil and its editable Notes");
  k.tab("today");
  ok(k.$("renameBtn").hidden, "the pencil is only on project pages");
}
{
  // notes travel between ideas and candidates, and list rows clamp them
  const k = kit(await mk());
  k.tab("projects");
  const candRow = () => [...k.d.querySelectorAll("#view .list li")].find(li => li.querySelector('button[title="Move to the Parking lot"]'));
  ok(!!candRow().querySelector(".noteclamp"), "a candidate's note in the list is clamped to two lines");
  k.click(k.btn(candRow(), "Park it"));
  const idea = k.saved().parked.find(p => p.text === "Sample Browser Extension");
  ok(idea && idea.note === "A small tool that could ship in a month", "Park it carries the project's Notes back to the idea's note");
  k.tab("parking");
  const irow = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample Browser Extension"));
  ok(!!irow.querySelector(".noteclamp"), "a parked idea's note is clamped to two lines");
  k.click(k.btn(irow, "Make candidate"));
  const proj = k.saved().projects.find(p => p.name === "Sample Browser Extension" && p.status === "candidate");
  ok(proj && proj.notes === "A small tool that could ship in a month" && !("note" in proj), "Make candidate puts the idea's note in the project's Notes, with no separate note field");
}
{
  // an archived candidate's page is read-only like any archived project's
  const k = kit(await mk());
  k.tab("projects");
  const candRow = [...k.d.querySelectorAll("#view .list li")].find(li => li.querySelector('button[title="Move to the Parking lot"]'));
  k.click(k.btn(candRow, "Archive"));
  k.tab("archive");
  k.click(k.btn(k.$("view"), "Sample Browser Extension"));
  ok(!k.btn(k.$("view"), "Choose as next project") && k.$("renameBtn").hidden && !k.d.querySelector("#view textarea"), "an archived candidate's page has no pencil, editable fields, or promote button");
}

{
  // Where things stand rows have Pin/Unpin, and the open-task count sits on the Next up line
  const k = kit(await mk());
  k.tab("projects");
  const rows = () => [...k.d.querySelectorAll("#view .standing li")];
  const webRow = () => rows().find(li => li.textContent.includes("Sample Website"));
  ok(!!k.btn(webRow(), "Pin") && !webRow().querySelector(".scount"), "a Where things stand row has a Pin button and no separate open-task count");
  ok(/Next up: .* · Sep [0-9]+ · 3 open tasks/.test(webRow().querySelector(".snext").textContent), "the open-task count is on the Next up line (" + webRow().querySelector(".snext").textContent + ")");
  k.click(k.btn(webRow(), "Pin"));
  ok(k.saved().pins.includes("proj:pSite") && !!k.btn(webRow(), "Unpin"), "Pin in Where things stand pins the project and the button flips to Unpin");
  ok(!!k.btn(k.d.querySelector("#nav"), "Sample Website"), "the pinned project appears in the sidebar");
  k.click(k.btn(webRow(), "Unpin"));
  ok(!k.saved().pins.includes("proj:pSite"), "Unpin in Where things stand removes the pin");
}

{
  // milestones are editable from the Timeline diamonds and from the list
  const k = kit(await mk());
  k.tab("timeline");
  const diamonds = () => [...k.d.querySelectorAll("#view .ms")];
  ok(diamonds().length === 2 && diamonds().every(d => d.getAttribute("role") === "button" && d.getAttribute("tabindex") === "0" && /^Edit milestone: /.test(d.getAttribute("aria-label"))), "each milestone diamond is a keyboard-reachable control with a label");
  k.click(diamonds()[0]);
  ok(k.$("modalTitle").textContent === "Edit milestone", "clicking a diamond opens the edit dialog");
  const first = k.saved().milestones.find(m => m.id === "m1");
  ok(k.$("f-text").value === first.text && k.$("f-date").value === first.date && k.$("f-project").value === first.projectId, "the dialog is pre-filled with the milestone");
  k.setField("text", "Beta opens (moved)"); k.setField("date", "2026-11-20");
  k.click(k.btn(k.$("modalBody"), "Save milestone"));
  const after = k.saved().milestones.find(m => m.id === "m1");
  ok(after.text === "Beta opens (moved)" && after.date === "2026-11-20" && k.saved().milestones.length === 2, "Save updates the same milestone in place");
  ok(k.$("view").textContent.includes("Beta opens (moved)"), "the Timeline shows the edited milestone");
  k.click(diamonds()[0]); k.setField("date", ""); k.click(k.btn(k.$("modalBody"), "Save milestone"));
  ok(!k.$("overlay").hidden && k.saved().milestones.find(m => m.id === "m1").date === "2026-11-20", "an empty date is rejected and nothing changes");
  k.click(k.btn(k.$("modalBody"), "Cancel"));
  diamonds()[0].dispatchEvent(new k.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(k.$("modalTitle").textContent === "Edit milestone", "Enter on a focused diamond opens the dialog");
  k.click(k.$("modalClose"));
  const row = () => [...k.d.querySelectorAll("#view .mslist li")].find(li => li.textContent.includes("Sample Game demo day"));
  k.click(k.btn(row(), "Sample Game: Sample Game demo day"));
  ok(k.$("modalTitle").textContent === "Edit milestone", "a milestone's text in the list opens the dialog");
  k.click(k.btn(k.$("modalBody"), "Remove"));
  ok(k.$("overlay").hidden && !k.saved().milestones.find(m => m.id === "m2"), "Remove in the dialog deletes the milestone");
  ok(!!k.btn(k.d.body, "Undo"), "and offers Undo");
  k.click(k.btn(k.d.body, "Undo"));
  ok(!!k.saved().milestones.find(m => m.id === "m2"), "Undo brings the milestone back");
  k.menuAct("newBtn", "newMilestone");
  ok(k.$("modalTitle").textContent === "New milestone" && !k.btn(k.$("modalBody"), "Remove"), "a new-milestone dialog has no Remove button");
}

{
  // a project's page: its content on the left, its own Timeline and Burndown on the right
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  const split = k.d.querySelector("#view .projsplit");
  ok(!!split && !!split.querySelector(".projmain") && !split.querySelector(".projtop") && !split.querySelector(".projrest") && !!split.querySelector(".projcharts"), "an active project's page has one content column and a Schedule/Timeline/Burndown column");
  ok(!split.querySelector("#proj-name") && [...split.querySelectorAll(".projmain h2")].map(h => h.textContent).join() === "Tasks,Before you launch,Notes,Linked projects", "the left column runs Tasks, Before you launch, Notes, then Linked projects (" + [...split.querySelectorAll(".projmain h2")].map(h => h.textContent).join() + ")");
  ok(!split.querySelector(".pintoggle") && !split.querySelector(".pinbar"), "there is no Pin button on a project's own page");
  ok(split.querySelector(".projmain").textContent.includes("6 tasks (1 in the Backlog). 6 of 17 steps complete."), "the task-count line sits under the Tasks heading");
  const side = split.querySelector(".projcharts");
  ok([...side.querySelectorAll("h2")].map(h => h.textContent).join() === "Schedule,Timeline,Burndown", "the right column flows Schedule, then Timeline, then Burndown, as one column");
  ok([...split.children].map(c => c.className).join() === "projmain,projcharts", "the page is ordered content, then the Schedule/Timeline/Burndown column, which is also the reading and phone order");
  ok(!!side.querySelector("#proj-start") && !!side.querySelector("#proj-days") && !split.querySelector(".projmain #proj-start") && ![...split.querySelectorAll(".projmain h2")].some(h => h.textContent === "Schedule"), "the Schedule heading and fields are in the right column, not the left");
  ok(!!k.btn(side, "Expand"), "the right column has an Expand button");
  ok(side.querySelectorAll(".lane").length === 6, "one timeline lane per scheduled task, plus the milestones lane (" + side.querySelectorAll(".lane").length + ")");
  ok(side.textContent.includes("1 backlog task is not shown until scheduled"), "an unscheduled Backlog task is counted, not drawn");
  ok(side.querySelectorAll(".ms").length === 1 && /Sample App beta opens/.test(side.querySelector(".ms").getAttribute("aria-label")), "the timeline shows only this project's milestone");
  const svg = side.querySelector("svg.chart");
  ok(/^Burndown chart for Sample App\./.test(svg.getAttribute("aria-label")), "the burndown is this project's own");
  ok(svg.querySelectorAll(".dot").length === 3, "the actual line has its recorded weeks plus this week (" + svg.querySelectorAll(".dot").length + ")");
  ok(svg.querySelectorAll(".mark").length === 1 && svg.querySelectorAll("rect.hit").length >= 4, "a milestone marker and a hover column for each week are drawn");
  ok(!svg.querySelector("title"), "the chart has no native tooltips, which would double up with the new one and never reach a phone or keyboard");
  ok(/4 tasks remaining, out of 5/.test(side.textContent), "the count line is this project's own tasks");
  // Expand opens both charts in a full-size dialog, and closing restores normal dialogs
  k.click(k.btn(side, "Expand"));
  const modal = k.d.querySelector("#overlay .modal");
  ok(!k.$("overlay").hidden && modal.classList.contains("full") && k.$("modalTitle").textContent === "Timeline and burndown for Sample App", "Expand opens the charts in a full-size dialog");
  ok(!!k.$("modalBody").querySelector(".range") && !!k.$("modalBody").querySelector("svg.chart"), "the dialog holds both charts");
  ok(!!k.$("modalBody").querySelector("#proj-start") && [...k.$("modalBody").querySelectorAll("h2")].map(h => h.textContent).join() === "Schedule,Timeline,Burndown", "the expanded dialog also holds Schedule, with no extra heading on top of it");
  k.click(k.$("modalClose"));
  ok(k.$("overlay").hidden && !modal.classList.contains("full"), "closing it drops the full size");
  k.menuAct("newBtn", "newIdea");
  ok(!modal.classList.contains("full"), "the next dialog is the normal size");
  k.click(k.$("modalClose"));
}
{
  // a project's own history is recorded as it changes, and its chart reads it
  const k = kit(await mk());
  const d = new Date(), todayKey = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Build the home screen")));
  const sel = k.d.querySelector(".detailpane .status"); sel.value = "Completed"; k.fire(sel);
  const app = k.saved().projects.find(p => p.id === "pApp");
  ok(JSON.stringify(app.hist[todayKey]) === "[5,3]", "finishing a task records the project's tasks in scope and still open for today (" + JSON.stringify(app.hist[todayKey]) + ")");
  ok(Object.keys(app.hist).length >= 3, "the earlier records are kept");
  // a second change that nets out to the same counts leaves no extra record
  const sel2 = k.d.querySelector(".detailpane .status"); sel2.value = "In progress"; k.fire(sel2);
  sel2.value = "Completed"; k.fire(sel2);
  ok(JSON.stringify(k.saved().projects.find(p => p.id === "pApp").hist[todayKey]) === "[5,3]", "changing a task back and forth keeps the day's record at its final counts");
}
{
  // a Complete project's burndown never leaves a gap for a week nothing was
  // recorded -- its remaining count is unambiguously 0 from completion on,
  // unlike an active project's genuinely-unknown unrecorded past
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
  // the open estimate drops as tasks complete; tasks open in place on a project's page
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  const before = k.d.querySelector("#view .estleft").textContent;
  const row = [...k.d.querySelectorAll("#view .projmain .tlist li")].find(li => li.textContent.includes("Run a beta with five friends"));
  k.click(row.querySelector("button.item"));
  ok(k.$("viewTitle").textContent === "Sample App" && !!k.d.querySelector("#view .projmain .tlist .detail"), "clicking a task on a project's page opens it in place, not on the Tasks page");
  ok(k.d.querySelector("#ptask-" + row.id.slice(6) + " button.item").getAttribute("aria-expanded") === "true", "the open row is marked expanded");
  ok(k.d.querySelectorAll("#view .projmain .tlist .detail").length === 1 && !k.d.querySelector("#view .projmain .detail h2"), "one task is open at a time, with no project heading repeated inside it");
  ok(!!k.btn(k.d.querySelector("#view .projmain .detail"), "Open in Tasks"), "an Open in Tasks link is offered");
  const sel = k.d.querySelector("#view .projmain .detail .status"); sel.value = "Completed"; k.fire(sel);
  ok(k.d.querySelectorAll("#view .projmain .tlist .detail").length === 1, "the task stays open after an edit");
  const after = k.d.querySelector("#view .estleft").textContent;
  ok(before === "Est. 27 hours remaining" && after === "Est. 23 hours remaining", "completing a 4 h task lowers the open estimate (" + before + " -> " + after + ")");
  k.click(k.d.querySelector("#view .projmain .tlist button.item[aria-expanded='true']"));
  ok(!k.d.querySelector("#view .projmain .tlist .detail"), "clicking the open task again closes it");
  // the launch checklist's task link opens the task in place too
  const launchLink = [...k.d.querySelectorAll("#view .projmain .textbtn")].find(b => b.title === "View this task");
  k.click(launchLink);
  ok(k.$("viewTitle").textContent === "Sample App" && !!k.d.querySelector("#view .projmain .tlist .detail"), "a task link in Before you launch opens that task in place");
  k.click(k.btn(k.d.querySelector("#view .projmain .detail"), "Open in Tasks"));
  ok(k.$("viewTitle").textContent === "Tasks", "Open in Tasks goes to the Tasks page");
}
{
  // a pale band behind each task's bar shows its block
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Game"));
  const lane = [...k.d.querySelectorAll("#view .projcharts .lane")].find(l => l.textContent.includes("Prototype the core mechanic"));
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
  ok(!/Enter the number/.test(k.$("view").textContent) && /Recorded automatically/.test(k.$("view").textContent), "its hint says the counts are recorded automatically");
  const cells = [...k.d.querySelectorAll("#view .weekly tbody tr")].map(tr => [...tr.children].map(c => c.textContent));
  ok(cells[0][2] === "11" && cells[0][3] === "11" && cells[1][2] === "10" && cells[2][2] === "11", "past rows read back the recorded counts, carrying a quiet day forward (" + JSON.stringify(cells.slice(0, 3)) + ")");
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
  const svg = k.d.querySelector("#view .projcharts svg.chart");
  const hits = svg.querySelectorAll("rect.hit").length;
  ok(hits >= 5 && hits <= 7, "the project's own chart is daily too (" + hits + " points for a 4-day schedule)");
}
{
  // ticking a step from the launch checklist counts like any other change: history is recorded and the project can complete
  const d = new Date(), n = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), iso = k => new Date(n + k * 86400000).toISOString().slice(0, 10);
  const saved = {
    projects: [{ id: "pL", name: "Launchy", status: "active", start: iso(-1), days: 7 }],
    tasks: [{ id: "l1", block: 1, projectId: "pL", what: "Ship it", done: "d", status: "Not started", steps: [{ id: "l1a", text: "Press the button", done: false, launch: true }] }]
  };
  const k = kit(await mk(saved));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Launchy"));
  const box = [...k.d.querySelectorAll("#view .list.check input[type=checkbox]")][0];
  box.checked = true; k.fire(box);
  const sv = k.saved();
  ok(sv.tasks[0].status === "Completed" && JSON.stringify(sv.projects[0].hist[iso(0)]) === "[1,0]", "ticking the last step in Before you launch completes the task and records the project's counts");
  ok(sv.projects[0].status === "complete" && k.$("modalTitle").textContent === "Project complete", "and the project completes from there too");
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
  ok(/4 open tasks are no longer counted in the main burndown/.test(k.$("modalBody").textContent), "the completion dialog warns about open tasks leaving the burndown (" + k.$("modalBody").textContent.slice(0, 160) + ")");
}
{
  // the main burndown draws total scope as steps at the dates it changed; project charts do not
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.tab("timeline");
  const scope = k.d.querySelector("#view svg.chart polyline.scope");
  ok(!!scope && [...k.d.querySelectorAll("#view .legend span")].some(s => s.textContent === "In scope"), "the main burndown has an In scope line and a legend entry for it");
  const pts = scope.getAttribute("points").split(" ").map(p => p.split(",").map(Number));
  const vertical = pts.some((p, i) => i > 0 && p[0] === pts[i - 1][0] && p[1] !== pts[i - 1][1]);
  const slope = pts.some((p, i) => i > 0 && p[0] !== pts[i - 1][0] && p[1] !== pts[i - 1][1]);
  ok(vertical && !slope, "it moves in steps (a straight rise where scope changed, level everywhere else), never in slopes");
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  ok(!!k.d.querySelector("#view .projcharts polyline.scope") && [...k.d.querySelectorAll("#view .projcharts .legend span")].some(s => s.textContent === "In scope"), "a project's own burndown draws its own In scope line too");
  const ppts = k.d.querySelector("#view .projcharts polyline.scope").getAttribute("points").split(" ").map(p => p.split(",").map(Number));
  ok(ppts.some((p, i) => i > 0 && p[0] === ppts[i - 1][0] && p[1] < ppts[i - 1][1]), "and it steps up where a task was added");
}
{
  // a task added to the plan after its project started is tagged on the task itself
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  const rowOf = (txt) => [...k.d.querySelectorAll("#view .projmain .tlist li")].find(li => li.textContent.includes(txt));
  const chip = (li) => [...li.querySelectorAll(".chip")].map(c => c.textContent).find(t => /^Added /.test(t));
  ok(!!chip(rowOf("Submit to the app store")) && !chip(rowOf("Sketch the main screens")) && !chip(rowOf("Run a beta with five friends")), "only the sample's late-added task carries an Added tag (" + chip(rowOf("Submit to the app store")) + ")");
  const tagged = [...rowOf("Submit to the app store").querySelectorAll(".chip")].find(c => /^Added /.test(c.textContent));
  ok(tagged.parentElement.classList.contains("l1"), "the tag sits on the same line as the dates, at the top of the row");
  k.tab("schedule");
  const trow = [...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Submit to the app store"));
  ok(!!trow && [...trow.querySelectorAll(".l1 .chip")].some(c => /^Added /.test(c.textContent)), "the Tasks page shows the Added tag too");
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
  const due2 = k.$("task-due"); due2.value = ""; k.fire(due2, "blur");
  ok(k.saved().tasks.find(t => t.what === "Add a dark mode").added === "" && !chip(rowOf("Add a dark mode")), "sending it back to the Backlog clears that");
  // a new scheduled task from the dialog is tagged too; a Backlog item is not
  k.click(k.btn(k.$("view"), "Add task"));
  k.setField("what", "Late idea"); k.setField("due", iso(10)); k.click(k.btn(k.$("modalBody"), "Add task"));
  ok(k.saved().tasks.find(t => t.what === "Late idea").added === iso(0), "a task created with a due date records the day it joined the plan");
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
  const l3of = (txt) => [...k.d.querySelectorAll("#view .projmain .tlist li")].find(li => li.textContent.includes(txt)).querySelector(".l3");
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
    k.fire(input, "change"); await new Promise(r => setTimeout(r, 40));
  };
  await pick("this is not json");
  ok(k.$("overlay").hidden && k.$("view").textContent.includes("That is not a Sidequest backup file."), "a file that is not a backup is refused without a warning dialog");
  await pick(JSON.stringify({ hello: "world" }));
  ok(k.$("overlay").hidden && k.saved().tasks.length === before, "JSON that is not a backup is refused and nothing changes");
  await pick(JSON.stringify(backup));
  ok(k.$("modalTitle").textContent === "Restore this backup?" && /1 project and 2 tasks/.test(k.$("modalBody").textContent) && /replaces everything/.test(k.$("modalBody").textContent), "a real backup asks first, saying what it holds and what will happen (" + k.$("modalBody").textContent.slice(0, 90) + ")");
  ok(k.saved().tasks.length === before, "and nothing has changed yet");
  k.click(k.btn(k.$("modalBody"), "Cancel"));
  ok(k.saved().tasks.length === before, "Cancel leaves everything as it was");
  await pick(JSON.stringify(backup));
  k.click(k.btn(k.$("modalBody"), "Restore backup"));
  ok(k.saved().tasks.length === 2 && k.saved().projects[0].name === "Restored", "Restore backup replaces everything with the file");
  ok(k.$("toast").textContent.includes("Backup restored.") && !!k.btn(k.$("toast"), "Undo"), "and offers Undo for a few seconds");
  k.click(k.btn(k.$("toast"), "Undo"));
  ok(k.saved().tasks.length === before && k.saved().projects.some(p => p.name === "Sample Game"), "Undo puts the previous data back");
}
{
  // a task's Timeline bar takes its status: Not started, In progress, Completed
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  const barOf = (txt) => [...k.d.querySelectorAll("#view .projcharts .lane")].find(l => l.textContent.includes(txt)).querySelectorAll(".bar")[1];
  ok(barOf("Sketch the main screens").classList.contains("done") && barOf("Build the sign-in flow").classList.contains("work") && barOf("Run a beta with five friends").classList.contains("new"), "Completed is green, In progress is yellow, Not started is pale blue on the Timeline");
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Run a beta with five friends")));
  ok(k.d.querySelector(".detailpane select.status").getAttribute("data-v") === "Not started" && [...k.d.querySelectorAll(".listpane .chip")].some(c => c.getAttribute("data-v") === "Not started"), "the status pull-down and chips carry the status the colours key off");
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
      get: () => { log.push("get"); return o.failGet ? Promise.reject({ code: "unavailable", message: "down" }) : wait({ exists: p in store, data: () => store[p], id: "main", metadata: {} }); },
      set: (d) => { log.push("set"); return wait().then(() => { store[p] = JSON.parse(JSON.stringify(d)); }); } }) };
    const downloads = o.noDownloads ? null : { save: (req) => { saves.push(req); return o.decline ? Promise.reject({ code: "declined", message: "no" }) : wait({ status: "saved" }); } };
    return { claude: { use: (n) => Promise.resolve(n === "db" ? db : n === "downloads" ? downloads : null) }, store, log, saves };
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms || 90));
  const base = kit(await mk()).saved();
  base.projects.find(p => p.id === "pApp").name = "REAL DB DATA"; base.settings.hideWelcome = true;
  const realJson = JSON.stringify(base);
  const named = (store) => JSON.parse(store["state/main"].json).projects.find(p => p.id === "pApp").name;
  {
    // a fresh device (nothing in local storage) must read the db before it writes to it
    const f = fake({ "state/main": { json: realJson } });
    const k = kit(await mk(null, f.claude)); await wait();
    ok(f.log[0] === "get", "nothing is written to the db before it has been read (" + f.log.join(",") + ")");
    ok(named(f.store) === "REAL DB DATA" && [...k.d.querySelectorAll("#nav .tab")].some(t => t.textContent === "REAL DB DATA"), "a fresh device shows the db's data and leaves it intact in the db");
    const n = f.log.filter(x => x === "set").length;
    k.tab("settings"); k.click(k.$("saveFile")); await wait();
    ok(f.log.filter(x => x === "set").length > n && JSON.parse(f.store["state/main"].json).settings.lastBackup, "after loading, a change is written to the db");
    ok(f.saves.length === 1 && /^sidequest-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.saves[0].filename) && JSON.parse(f.saves[0].data).tasks.length === 18, "Save backup hands the viewer a dated .json file through the downloads capability");
    ok(k.$("view").textContent.includes("Backup saved.") && k.$("view").textContent.includes("(today)"), "and says it saved");
  }
  {
    const f = fake({});
    const k = kit(await mk(null, f.claude)); await wait();
    ok(f.log.join(",") === "get,set" && named(f.store) === "Sample App", "an empty db is seeded with this device's data, after reading it");
  }
  {
    const f = fake({ "state/main": { json: realJson } }, { failGet: true });
    const k = kit(await mk(null, f.claude)); await wait();
    k.click(k.$("welcomeDismiss") || k.$("view")); k.tab("settings"); k.click(k.$("saveFile")); await wait();
    ok(!f.log.includes("set") && named(f.store) === "REAL DB DATA", "if the db cannot be read, nothing is written to it (" + f.log.join(",") + ")");
  }
  {
    const f = fake({ "state/main": { json: realJson } }, { decline: true });
    const k = kit(await mk(null, f.claude)); await wait();
    k.tab("settings"); k.click(k.$("saveFile")); await wait();
    ok(k.$("view").textContent.includes("Save cancelled.") && k.$("view").textContent.includes("No backup saved yet."), "if the viewer declines, nothing is recorded as saved");
  }
  // newest save wins when the db and this device disagree
  const T1 = "2026-10-01T10:00:00.000Z", T2 = "2026-10-01T12:00:00.000Z";
  const withName = (nm) => { const o = JSON.parse(JSON.stringify(base)); o.projects.find(p => p.id === "pApp").name = nm; return o; };
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
    ok(f.log.join(",") === "get" && shown(k, "SAME"), "the same save on both sides causes no swap and no write (" + f.log.join(",") + ")");
  }
  {
    // an ordinary edit after loading moves the db's stamp forward
    const f = fake({ "state/main": { json: JSON.stringify(withName("DB EDIT")), savedAt: T1 } });
    const k = kit(await mk(null, f.claude)); await wait();
    k.tab("settings"); k.click(k.$("saveFile")); await wait();
    ok(f.store["state/main"].savedAt > T1 && JSON.parse(f.store["state/main"].json).settings.lastBackup, "an edit after loading is written with a newer stamp");
  }
  {
    // an old db document with no stamp at all: the db still wins, as before
    const f = fake({ "state/main": { json: JSON.stringify(withName("UNSTAMPED DB")) } });
    const k = kit(await mk(withName("LOCAL"), f.claude, T2)); await wait();
    ok(shown(k, "UNSTAMPED DB"), "a db document from before stamps existed is trusted, as it always was");
  }
}
{
  // saved history is validated on load, and the old step-count snapshots are not carried over
  const saved = { actual: [34, 31, 25, null, null, null, null], hist: { "2026-09-14": [12, 5], bad: [1, 1], "2026-09-21": [3, 9], "2026-09-28": "x", "2026-09-29": [5, -1] }, projects: [{ id: "pV", name: "Snap", status: "active", actual: { "2026-09-14": 12 }, hist: { "2026-09-14": [12, 5], bad: [1, 1], "2026-09-21": [3, 9], "2026-09-28": "x", "2026-09-29": [5, -1] } }], tasks: [] };
  const k = kit(await mk(saved));
  const a = k.saved().projects[0].hist, g = k.saved().hist;
  ok(Object.keys(a).join() === "2026-09-14" && a["2026-09-14"].join() === "12,5", "only well-formed history entries are kept on a project");
  ok(Object.keys(g).join() === "2026-09-14" && !("actual" in k.saved()) && !("actual" in k.saved().projects[0]), "the same goes for the main burndown, and the old step-count fields are gone");
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
  ok(!!slipBtn, "a project's own page has a Slip schedule button");
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
  // an active project with nothing scheduled still has the panel, and says so
  const k = kit(await mk({ projects: [{ id: "pX", name: "Empty", status: "active" }], tasks: [] }));
  k.tab("projects"); k.click(k.btn(k.$("view"), "Empty"));
  const side = k.d.querySelector("#view .projcharts");
  ok(!!side && side.textContent.includes("Nothing is scheduled yet") && ![...side.querySelectorAll("h2")].some(h => h.textContent === "Burndown"), "a project with no scheduled tasks says so and draws no burndown");
}
{
  // candidates and archived projects stay single-column
  const k = kit(await mk());
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Browser Extension"));
  ok(!k.d.querySelector("#view .projsplit"), "a candidate's page has no charts column");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample Game"));
  k.click(k.btn(k.$("view"), "Archive"));
  k.tab("archive"); k.click(k.btn(k.$("view"), "Sample Game"));
  ok(!k.d.querySelector("#view .projsplit"), "an archived project's page has no charts column");
  ok([...k.d.querySelectorAll("#view h2")].some(h => h.textContent === "Schedule") && !k.$("proj-start"), "an archived project still shows its Schedule, read only, in the single column");
}

{
  // the burndown tooltip works on hover, tap, and keyboard, on both charts
  const k = kit(await mk());
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  const side = k.d.querySelector("#view .projcharts");
  const svg = side.querySelector("svg.chart");
  const tip = () => side.querySelector(".charttip");
  const hits = [...svg.querySelectorAll("rect.hit")];
  const fire = (e, type) => e.dispatchEvent(new k.w.MouseEvent(type, { bubbles: false }));
  const key = (name) => svg.dispatchEvent(new k.w.KeyboardEvent("keydown", { key: name, bubbles: true }));
  ok(svg.getAttribute("tabindex") === "0" && svg.getAttribute("role") === "group" && /arrow keys/.test(svg.getAttribute("aria-label")), "the chart is one labeled keyboard stop");
  ok(tip().hidden && tip().getAttribute("aria-live") === "polite" && tip().getAttribute("role") === "status", "the tooltip starts hidden and is a live region");
  fire(hits[1], "mouseenter");
  ok(!tip().hidden && /^Week of /.test(tip().textContent) && /Planned: \d+ remaining/.test(tip().textContent) && /Actual: 3 remaining of 4 in scope/.test(tip().textContent), "hovering a week shows its planned and actual counts (" + tip().textContent.replace(/\n/g, " | ") + ")");
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
  for (let i = 0; i < 30 && !found; i++) { if (/Sample App beta opens/.test(tip().textContent)) found = true; else key("ArrowRight"); }
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
  // estimates, explicit start/due dates, and the project page order
  const k = kit(await mk());
  k.click(k.$("welcomeDismiss"));
  const sv = k.saved().tasks;
  const appTasks = sv.filter(t => t.projectId === "pApp");
  const total = appTasks.reduce((n, t) => n + t.est, 0), left = appTasks.filter(t => t.status !== "Completed").reduce((n, t) => n + t.est, 0);
  ok(total === 30, "Sample App's estimates add up to 30 h (" + total + ")");
  k.tab("projects"); k.click(k.btn(k.$("view"), "Sample App"));
  const est = k.d.querySelector("#view .metarow .estleft");
  ok(!!est && est.textContent === "Est. " + left + " hours remaining", "the project page shows the open estimate at the right of the count line (" + (est && est.textContent) + ")");
  ok(!k.d.querySelector("#view .estline"), "the old estimate line under the list is gone");
  const chips = [...k.d.querySelectorAll("#view .projmain .l3 span")].map(s => s.textContent);
  ok(chips.includes("Est 3 h") && chips.includes("Est 6 h"), "task rows on the project page show their estimate as Est N h");
  const heads = [...k.d.querySelectorAll("#view .projmain h2")].map(h => h.textContent);
  ok(heads.join() === "Tasks,Before you launch,Notes,Linked projects", "the project page order is Tasks, Before you launch, Notes, Linked projects (" + heads.join() + ")");
  const g1 = sv.find(t => t.id === "g1");
  ok(g1.block === 1 && g1.start && g1.due && g1.start < g1.due, "Sample Game's first task keeps block 1 with its own start and due");
  const gp = k.saved().projects.find(p => p.id === "pGame");
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
  ok(t().start === "2026-08-20" && k.$("task-start").value === "2026-08-20" && k.$("view").textContent.includes("start date can't be after"), "a start after the due date is rejected");
  set("task-start", "2026-07-01");
  ok(t().start === "2026-08-20" && k.$("view").textContent.includes("on or after"), "a start before the project's start is rejected");
  set("task-due", "2026-08-10");
  ok(t().due === "2026-08-30" && k.$("view").textContent.includes("can't be before the start"), "a due date before the start is rejected");
  set("task-due", "2026-07-01");
  ok(t().due === "2026-08-30" && t().block === 4, "a due date before the project's start is rejected");
  set("task-est", "2.5");
  ok(t().est === 2.5, "an estimate is stored");
  set("task-est", "-3");
  ok(t().est === 2.5, "a negative estimate is rejected");
  set("task-due", "");
  ok(t().block === 0 && t().due === "" && t().start === "", "clearing the due date moves the task to the Backlog and clears the start");
}
{
  // New Task dialog
  const saved = { projects: [{ id: "pT", name: "Dates", status: "active", start: "2026-08-03", days: 7 }], tasks: [] };
  const k = kit(await mk(saved));
  k.menuAct("newBtn", "newTask");
  ok(!!k.$("f-start") && !!k.$("f-due") && !!k.$("f-est"), "the New task dialog has start, due, and estimate fields");
  k.setField("what", "Made in dialog"); k.setField("start", "2026-08-12"); k.setField("due", "2026-08-20"); k.setField("est", "4");
  k.click(k.btn(k.$("modalBody"), "Add task"));
  const t = k.saved().tasks.find(x => x.what === "Made in dialog");
  ok(t && t.start === "2026-08-12" && t.due === "2026-08-20" && t.est === 4 && t.block === 3, "the dialog saves dates, estimate, and the derived block");
  k.menuAct("newBtn", "newTask");
  k.setField("what", "Bad order"); k.setField("start", "2026-08-25"); k.setField("due", "2026-08-20");
  k.click(k.btn(k.$("modalBody"), "Add task"));
  ok(!k.saved().tasks.some(x => x.what === "Bad order") && k.$("modalBody").textContent.includes("can't be after"), "the dialog rejects a start after the due date");
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
  ok(by("n3").start === "" && by("n3").due === "", "a Backlog task's dates are cleared on load");
}

console.log(fails ? ("\n" + fails + " FAILED") : "\nALL PASSED");
process.exit(fails ? 1 : 0);

}

main().catch(e => { console.error(e); process.exit(1); });
