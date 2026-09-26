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
async function mk(saved) {
  const dom = new JSDOM(html, { url: "https://example.test/", pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
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
    stand: () => [...d.querySelectorAll("#view .standing li")].map(li => (li.querySelector(".plink,.slabel") || {}).textContent) };
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
  ok(k.$("view").textContent.includes("Next up") && k.d.querySelector("#view .chartbox svg") && /\d+ items remaining, out of \d+/.test(k.$("view").textContent), "Today works with sample data");
  const next = k.d.querySelector("#view .panel .ptitle").textContent;
  ok(next === "Write the page copy", "Next up is the lowest-block open sample task: " + next);
  const projLink = k.btn(k.d.querySelector("#view .panel"), "Sample Website");
  ok(!!projLink && projLink.classList.contains("plink"), "Next up names the project as a link");
  k.click(projLink);
  ok(k.$("viewTitle").textContent === "Sample Website", "clicking the project link opens that project's page");
}

/* ---- sample projects ---- */
{
  const k = kit(await mk()); k.tab("projects");
  ok(k.stand().join() === "Sample Website,Sample App,Sample Game,Next slot", "Where things stand lists the three sample projects (" + k.stand().join() + ")");
  const pagesList = [...k.d.querySelectorAll("#view .list")][0].textContent;
  ok(!pagesList.includes("Sample App") && !pagesList.includes("Sample Website") && !pagesList.includes("Sample Game"), "the Projects section excludes projects already shown in Where things stand");
  ok(k.$("view").textContent.includes("Sample Browser Extension") && k.$("view").textContent.includes("Sample Command-Line Tool"), "two sample candidates listed");
  k.tab("parking");
  ok(k.$("view").textContent.includes("Try a new game engine") && k.$("view").textContent.includes("Write up lessons learned") && !k.$("view").textContent.includes("Redesign the logo"), "parking lot samples (removed one is in the Archive)");
  k.tab("schedule");
  const rows = [...k.d.querySelectorAll(".listpane .tlist")[0].querySelectorAll(".item")].map(b => b.textContent);
  ok(rows.length === 12, "12 scheduled tasks (all tasks stay visible now -- completed ones aren't archived) (got " + rows.length + ")");
  ok(k.$("view").textContent.includes("Backlog (2)") && k.$("view").textContent.includes("Add a dark mode") && k.$("view").textContent.includes("Add a level editor"), "backlog has two samples");
  ok(k.d.getElementById("task-block").textContent.includes("Sprint 1"), "vocabulary is Sprint in the samples");
  // per-project schedules
  k.tab("timeline");
  const lanes = [...k.d.querySelectorAll("#view .lane .lname")].map(l => l.textContent);
  ok(lanes.filter(l => l.startsWith("Sample")).length === 3, "timeline has a lane for each sample project");
  const game = [...k.d.querySelectorAll("#view .lane")].find(l => l.querySelector(".lname").textContent.startsWith("Sample Game"));
  ok(game.querySelectorAll(".bar").length === 2 && game.querySelector(".ldates").textContent.includes("estimate to"), "Sample Game shows an estimate bar");
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
  const decs = [...k.d.querySelectorAll("#view .decision")];
  ok(decs.length === 1 && decs[0].querySelector("input").value.startsWith("Start with one store"), "Sample App's own decision shows here, not the Game's");
  ok(k.d.querySelector("#view .list.check li.done") && k.d.querySelector("#view .list.check").textContent.includes("Choose the first app store"), "answered decision's step is already ticked");
  // sync
  const before = k.d.querySelector("#view .progress").textContent;
  const box = [...k.d.querySelectorAll("#view .list.check li")].find(li => li.textContent.includes("Prepare screenshots")).querySelector("input"); box.checked = true; k.fire(box);
  ok(k.d.querySelector("#view .progress").textContent !== before, "ticking updates progress");
  // step toggle wording
  k.tab("schedule"); k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Submit to the app store")));
  ok(k.btn(k.d.querySelector(".detailpane"), "Cut from Launch") && k.d.querySelector(".detailpane").textContent.includes("Add to Launch puts a step on the Launch checklist"), "step toggle says Cut from Launch when already on the checklist");
  k.click(k.btn(k.d.querySelector("#nav"), "Sample App")); k.click(k.btn(k.$("view"), "Add item")); ok(k.$("modalTitle").textContent === "New launch item", "Add item dialog uses launch wording"); k.click(k.$("modalClose"));
}

/* ---- decision requires a step ---- */
{
  const k = kit(await mk()); k.click(k.btn(k.d.querySelector("#nav"), "Sample App"));
  k.click(k.btn(k.$("view"), "Add decision"));
  ok(k.$("modalTitle").textContent === "New decision", "decision dialog opens");
  ok(!k.d.querySelector('#modalBody option[value=""]'), "no unlinked/None option -- a step link is required");
  k.click(k.$("modalClose"));
}

/* ---- Help in the template ---- */
{
  const k = kit(await mk()); k.d.querySelector('#navBottom .tab[data-view="help"]').dispatchEvent(new k.w.MouseEvent("click", { bubbles: true }));
  const titles = [...k.d.querySelectorAll("#view summary")].map(s => s.textContent);
  ok(titles.length === 13 && titles.includes("Launch checklist and decisions"), "template Help has the Launch checklist topic (" + titles.length + " topics)");
  ok(k.$("view").textContent.includes("tap Add to Launch beside a step"), "and the topic explains the Launch button");
  const helpText = k.$("view").textContent;
  ok(!helpText.includes("Mark done") && !helpText.includes("archive completed tasks") && !helpText.includes("beside its name") && !helpText.includes("with its circle"), "Help no longer describes buttons and settings that were removed");
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
  k.tab("projects"); k.click(k.btn(k.$("view"), "My App"));
  k.click(k.btn(k.$("view"), "Choose as next project"));
  k.menuAct("newBtn", "newTask"); k.setField("what", "First task"); k.setField("block", "1"); k.click(k.btn(k.$("modalBody"), "Add task"));
  k.tab("today"); ok(k.$("view").textContent.includes("First task"), "can start working right away, once a project exists");
  // reload samples
  k.tab("settings"); k.click(k.$("startFresh")); const r = [...k.d.querySelectorAll('#modalBody input[name=fresh]')]; r[1].checked = true; k.fire(r[1]);
  const a2 = k.$("freshAck"); a2.checked = true; k.fire(a2); k.click(k.$("freshGo"));
  ok(k.saved().tasks.length === 14 && k.saved().pins.includes("proj:pApp"), "the samples can be reloaded");
}

/* ---- core behavior still intact ---- */
{
  const k = kit(await mk());
  k.tab("schedule"); const sel = k.d.querySelector(".detailpane select.status");
  ok(sel && sel.value === "In progress", "schedule shows the selected sample task");
  k.tab("settings"); ok(k.d.getElementById("set-word").value === "Sprint" && k.$("view").textContent.includes("Sprint length in days"), "Settings show the Sprint vocabulary");
  ok(k.d.querySelector("#view .about").textContent.includes("© Tim Samoff"), "About keeps the credit");
  // completing a sample task marks it Completed but keeps it visible (no archiving)
  k.tab("today"); const nextTaskTitle = k.d.querySelector("#view .panel .ptitle").textContent;
  ok(!k.btn(k.$("view"), "Mark completed"), "Today's Next up card has no one-click Mark completed shortcut");
  k.click(k.btn(k.$("view"), "Open task"));
  const statusSel = k.d.querySelector(".detailpane .status"); statusSel.value = "Completed"; k.fire(statusSel);
  k.tab("schedule");
  const completedRow = [...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes(nextTaskTitle));
  ok(completedRow && completedRow.classList.contains("done"), "the task shows as completed in Tasks, not moved anywhere");
  // backup text
  k.tab("settings"); k.click(k.$("showText")); const j = JSON.parse(k.$("backupText").value);
  ok(j.tasks.length === 14 && j.projects.find(p => p.name === "Sample Game").mult === 2, "backup export contains the sample data");
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
  const sel = k.$("proj-link-pick");
  sel.value = [...sel.options].find(o => o.textContent === "Sample Game").value;
  k.fire(sel); k.click(k.btn(k.$("view"), "Link project"));
  ok(k.$("view").textContent.includes("Sample Game"), "linking Sample Game from Sample Website's own picker shows it in the list");
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
  ok(!k.stand().includes("Sample App"), "a Complete project drops out of Where things stand");
  const appRow = [...k.d.querySelectorAll("#view .list li")].find(li => li.textContent.includes("Sample App"));
  ok(!!appRow, "a Complete project (no longer in Where things stand) appears in the Projects section instead");
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
  k.tab("schedule");
  k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Sketch the main screens")));
  const statusSel = k.d.querySelector(".detailpane .status"); statusSel.value = "In progress"; k.fire(statusSel);
  ok(k.saved().projects.find(p => p.id === "pApp").status === "complete", "reopening a task does not auto-revert a Complete project");
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
  k.click(k.btn(k.$("view"), "Sample Browser Extension"));
  k.click(k.btn(k.$("view"), "Choose as next project"));
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

console.log(fails ? ("\n" + fails + " FAILED") : "\nALL PASSED");
process.exit(fails ? 1 : 0);

}

main().catch(e => { console.error(e); process.exit(1); });
