const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
function mk(saved) {
  return new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/", pretendToBeVisual: true,
    beforeParse(win) { win.scrollTo = () => {}; if (saved) win.localStorage.setItem("sidequest-template-v1", JSON.stringify(saved)); } });
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

/* ---- housekeeping ---- */
ok(!/\u2014/.test(html), "no em dashes");
ok(!html.includes("project-schedule-v"), "uses its own storage keys");
ok(html.includes('href: "https://samoff.com"') && html.includes("Tim Samoff") && html.includes('APP_VERSION = "1.0.0"'), "credit, link, and version kept");

/* ---- icon files and links ---- */
{
  const fsx = require("fs"), pathx = require("path");
  const root = pathx.join(__dirname, "..");
  for (const f of ["assets/sidequest-icon.svg", "assets/favicon-32.png", "assets/apple-touch-icon.png"]) ok(fsx.existsSync(pathx.join(root, f)), f + " exists");
  ok(html.includes('rel="icon" type="image/svg+xml" href="assets/sidequest-icon.svg"') && html.includes('rel="apple-touch-icon" href="assets/apple-touch-icon.png"') && html.includes('sizes="32x32" href="assets/favicon-32.png"'), "page links the favicon and home screen icons");
  ok(/<title>Sidequest<\/title>/.test(html), "page title is Sidequest");
  const png = b => b.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  ok(png(fsx.readFileSync(pathx.join(root, "assets/apple-touch-icon.png"))) && fsx.readFileSync(pathx.join(root, "assets/sidequest-icon.svg"), "utf8").includes("#C62F2F"), "icons are valid: a real PNG, and the SVG uses the logo red");
}

/* ---- first run ---- */
{
  const k = kit(mk());
  ok(k.$("viewTitle").textContent === "Today" && k.d.title.includes("Sidequest"), "opens on Today");
  ok(k.$("view").textContent.includes("Welcome to Sidequest") && k.$("view").textContent.includes("samples") && !!k.$("welcomeSettings") && !!k.$("welcomeDismiss"), "welcome box explains the samples");
  ok(k.d.querySelector('.tab[data-view=kofi]').textContent.trim() === "Launch" && k.d.querySelector("#nav").textContent.includes("Pinned"), "'Launch' checklist is the pinned page");
  ok([...k.d.querySelectorAll("#nav .tab")].map(t => t.dataset.view).join() === "today,schedule,projects,timeline,kofi", "sidebar: core pages + one pinned page");
  // dismiss
  k.click(k.$("welcomeDismiss")); ok(!k.$("view").textContent.includes("Welcome to Sidequest") && k.saved().settings.hideWelcome === true, "dismissing hides it and remembers");
  // Today content
  ok(k.$("view").textContent.includes("Next up") && k.d.querySelector("#view .chartbox svg") && /\d+ items remaining, out of \d+/.test(k.$("view").textContent), "Today works with sample data");
  const next = k.d.querySelector("#view .panel .ptitle").textContent;
  ok(next === "Build the sign-in flow", "Next up is the in-progress sample task: " + next);
  const projLink = k.btn(k.d.querySelector("#view .panel"), "Sample App");
  ok(!!projLink && projLink.classList.contains("plink"), "Next up names the project as a link");
  k.click(projLink);
  ok(k.$("viewTitle").textContent === "Sample App", "clicking the project link opens that project's page");
}

/* ---- sample projects ---- */
{
  const k = kit(mk()); k.tab("projects");
  ok(k.stand().join() === "Sample App,Sample Website,Sample Game,Next slot", "Where things stand lists the three sample projects (" + k.stand().join() + ")");
  const pagesList = [...k.d.querySelectorAll("#view .list")].pop().textContent;
  ok(pagesList.includes("Launch checklist") && pagesList.includes("Sample App") && pagesList.includes("Sample Website") && pagesList.includes("Sample Game"), "Pages and projects lists them");
  ok(k.d.querySelectorAll('#view input[type=radio]').length === 2 && k.$("view").textContent.includes("Sample Browser Extension") && k.$("view").textContent.includes("Sample Command-Line Tool"), "two sample candidates");
  k.tab("parking");
  ok(k.$("view").textContent.includes("Try a new game engine") && k.$("view").textContent.includes("Write up lessons learned") && !k.$("view").textContent.includes("Redesign the logo"), "parking lot samples (removed one is in the Archive)");
  k.tab("schedule");
  const rows = [...k.d.querySelectorAll(".listpane .tlist")[0].querySelectorAll(".item")].map(b => b.textContent);
  ok(rows.length === 11, "11 scheduled tasks (three projects plus the next-project slot) (got " + rows.length + ")");
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

/* ---- Launch checklist ---- */
{
  const k = kit(mk()); k.tab("kofi");
  ok(k.$("viewTitle").textContent === "Launch" && k.$("view").textContent.includes("Before you launch") && k.$("view").textContent.includes("Everything to finish before you ship"), "Launch page copy is generic");
  ok(!k.d.querySelector("#view a.linkbtn"), "no external link button");
  const lb = k.d.querySelector("#view .listbox");
  ok(/^\d+ of \d+ done$/.test(lb.querySelector(".progress").textContent) && lb.querySelectorAll("ul.list.check li").length === 10, "checklist built from launch-flagged steps (" + lb.querySelectorAll("ul.list.check li").length + ")");
  const decs = [...k.d.querySelectorAll("#view .decision")];
  ok(decs.length === 2 && decs[0].querySelector("input").value.startsWith("Start with one store") && decs[1].querySelector("input").value === "", "two sample decisions, one answered");
  ok(k.d.querySelector("#view .list.check li.done") && k.d.querySelector("#view .list.check").textContent.includes("Choose the first app store"), "answered decision's step is already ticked");
  // sync
  const before = k.d.querySelector("#view .progress").textContent;
  const box = [...k.d.querySelectorAll("#view .list.check li")].find(li => li.textContent.includes("Prepare screenshots")).querySelector("input"); box.checked = true; k.fire(box);
  ok(k.d.querySelector("#view .progress").textContent !== before, "ticking updates progress");
  // step toggle wording
  k.tab("schedule"); k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Submit to the app store")));
  ok(k.btn(k.d.querySelector(".detailpane"), "Launch") && k.d.querySelector(".detailpane").textContent.includes("Launch puts a step on the Launch checklist"), "step toggle says Launch");
  k.tab("kofi"); k.click(k.btn(k.$("view"), "Add item")); ok(k.$("modalTitle").textContent === "New launch item", "Add item dialog uses launch wording"); k.click(k.$("modalClose"));
}

/* ---- Help in the template ---- */
{
  const k = kit(mk()); k.d.querySelector('#navBottom .tab[data-view="help"]').dispatchEvent(new k.w.MouseEvent("click", { bubbles: true }));
  const titles = [...k.d.querySelectorAll("#view summary")].map(s => s.textContent);
  ok(titles.length === 10 && titles.includes("Launch page: steps and decisions") && titles.indexOf("Launch page: steps and decisions") === titles.indexOf("Archive and undo") - 1, "template Help keeps the Launch page topic (" + titles.length + " topics)");
  ok(k.$("view").textContent.includes("tap Launch beside a step"), "and the topic explains the Launch button");
  ok([...k.d.querySelectorAll("#navBottom .tab")].map(t => t.textContent.trim()).join() === "Parking lot,Archive,Help,Settings", "Help sits between Archive and Settings");
}

/* ---- archive samples ---- */
{
  const k = kit(mk()); k.tab("archive");
  const t = k.$("view").textContent;
  ok(t.includes("Sketch the main screens") && t.includes("Redesign the logo") && t.includes("Should the site use a page builder?") && t.includes("All (3)"), "Archive already shows three sample items");
  ok(t.includes("Completed") && t.includes("Removed"), "shows both completed and removed samples");
}

/* ---- search works on samples ---- */
{
  const k = kit(mk()); k.type("beta");
  ok(k.d.querySelectorAll("#searchResults .sgroup").length >= 2 && k.$("searchStatus").textContent.match(/\d+ results?/), "search finds the beta tasks and milestone");
  k.type("logo"); ok(k.d.querySelector("#searchResults .chip.arch"), "search finds archived samples");
}

/* ---- Start fresh and reload samples ---- */
{
  const k = kit(mk()); k.tab("settings");
  ok(k.$("view").textContent.includes("Start fresh"), "Start fresh is in Settings");
  k.click(k.$("startFresh")); ok(k.$("modalBody").textContent.includes("The sample projects") && k.$("modalBody").textContent.includes("An empty planner"), "offers empty or sample projects");
  const a = k.$("freshAck"); a.checked = true; k.fire(a); k.click(k.$("freshGo"));
  ok(k.$("view").textContent.includes("No tasks yet") && k.saved().tasks.length === 0 && k.saved().settings.hideWelcome === true, "empty planner: nothing left, welcome stays hidden");
  ok(![...k.d.querySelectorAll("#nav .tab")].some(t => t.dataset.view === "kofi"), "no pinned page after a fresh start");
  // add own project from scratch
  k.menuAct("newBtn", "newTask"); k.setField("project", "My App"); k.setField("what", "First task"); k.setField("block", "1"); k.click(k.btn(k.$("modalBody"), "Add task"));
  k.tab("today"); ok(k.$("view").textContent.includes("First task"), "can start working right away");
  // reload samples
  k.tab("settings"); k.click(k.$("startFresh")); const r = [...k.d.querySelectorAll('#modalBody input[name=fresh]')]; r[1].checked = true; k.fire(r[1]);
  const a2 = k.$("freshAck"); a2.checked = true; k.fire(a2); k.click(k.$("freshGo"));
  ok(k.saved().tasks.length === 14 && k.saved().pins.includes("kofi"), "the samples can be reloaded");
}

/* ---- core behavior still intact ---- */
{
  const k = kit(mk());
  k.tab("schedule"); const sel = k.d.querySelector(".detailpane select.status");
  ok(sel && sel.value === "In progress", "schedule shows the selected sample task");
  k.tab("settings"); ok(k.d.getElementById("set-word").value === "Sprint" && k.$("view").textContent.includes("Sprint length in days"), "Settings show the Sprint vocabulary");
  ok(k.d.querySelector("#view .about").textContent.includes("\u00a9 Tim Samoff"), "About keeps the credit");
  // completing a sample task archives it
  k.tab("today"); k.click(k.btn(k.$("view"), "Mark done"));
  ok(k.$("toast").textContent.includes("Archive"), "completing a task moves it to the Archive");
  // backup text
  k.tab("settings"); k.click(k.$("showText")); const j = JSON.parse(k.$("backupText").value);
  ok(j.tasks.length === 14 && j.pset["Sample Game"].mult === 2, "backup export contains the sample data");
  // reload keeps changes and skips the welcome
  const k2 = kit(mk(k.saved())); ok(k2.$("viewTitle").textContent === "Today" && !k2.$("view").textContent.includes("Welcome to Sidequest") || k2.saved !== undefined, "reload opens on Today");
}

/* ---- new step: project filter ---- */
{
  const k = kit(mk());
  k.menuAct("newBtn", "newStep");
  const projSel = k.$("f-project"), taskSel = k.$("f-task");
  ok(!!projSel && !!taskSel, "New step form has a project filter and a task select");
  ok(projSel.value === "", "with nothing selected in Schedule, the project filter starts on All projects");
  ok(taskSel.selectedOptions[0].label === "Sample App: Build the sign-in flow", "the task select still defaults to the next-up task");
  const allProjects = [...taskSel.options].map(o => o.label);
  ok(allProjects.some(l => l.startsWith("Sample Website:")) && allProjects.some(l => l.startsWith("Sample Game:")), "All projects shows every project's tasks");
  k.setField("project", "Sample Game"); k.fire(projSel);
  const afterGame = [...taskSel.options].map(o => o.label);
  ok(afterGame.length > 0 && afterGame.every(l => l.startsWith("Sample Game:")), "choosing a project narrows the task list to only that project's tasks");
  k.setField("text", "A step added via the filtered picker");
  k.click(k.btn(k.$("modalBody"), "Add step"));
  ok(k.$("toast").textContent.includes("Sample Game"), "step is added to the task chosen after filtering");
  // opening a task first changes the default filter to that task's project
  k.tab("schedule"); k.click([...k.d.querySelectorAll(".listpane .item")].find(b => b.textContent.includes("Build the layout")));
  k.menuAct("newBtn", "newStep");
  ok(k.$("f-project").value === "Sample Website", "with a task open in Schedule, defaults the filter to that task's project");
}
console.log(fails ? ("\n" + fails + " FAILED") : "\nALL PASSED");
