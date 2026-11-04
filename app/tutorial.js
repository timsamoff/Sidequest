// First-run walkthrough: a small card that points at real controls and moves on when the action is done.
import { state, ui, save } from "./state.js";
import { $, el, on } from "./dom.js";

function questOf(c) { return state.quests.filter(function (p) { return p.id === c.questId; })[0]; }
function hasTask(c) { return !!c.questId && state.tasks.some(function (t) { return t.questId === c.questId; }); }
function promoted(c) { return state.quests.some(function (p) { return p.status === "active" && c.baseActive.indexOf(p.id) < 0; }); }
function onQuestPage(c) { return !!c.questId && ui.view === "quest:" + c.questId; }
function tab(view) { return document.querySelector('.tab[data-view="' + view + '"]'); }
// The new quest's row in Candidate quests, when the Quests page is showing.
function candidateRow(c) {
  var q = questOf(c); if (!q || ui.view !== "projects") return null;
  var names = document.querySelectorAll("#view button.qlink");
  for (var i = 0; i < names.length; i++) if (names[i].textContent === q.name && names[i].closest(".crow")) return names[i].closest(".crow");
  return null;
}
// Points at the quest wherever the reader is: its row on Quests, else the Quests tab.
function toQuest(c) {
  var row = candidateRow(c);
  return row ? { target: row.closest("li"), text: "Select your new quest under **Candidate quests**." }
    : { target: tab("projects"), text: "Open **Quests**, then select your new quest under **Candidate quests**." };
}

// Each step: a title, a done() check, and view(), which gives the highlighted element and the text for where the reader is now.
// **bold** in text marks an on-screen label.
var STEPS = [
  { title: "Welcome to Sidequest", view: function () { return { text: "This takes about a minute. You will add a quest, give it a task, and start it. Skip any time, and replay it from the Field guide." }; } },
  { title: "Add a quest", view: function () { return { target: document.getElementById("newBtn"), text: "Select the **+** button and choose **New candidate quest**. Give it a name and select **Add candidate quest**." }; },
    done: function (c) { var q = state.quests.filter(function (p) { return c.baseIds.indexOf(p.id) < 0; })[0]; if (q) c.questId = q.id; return !!q; } },
  { title: "Open your quest", view: toQuest, done: function (c) { return onQuestPage(c) || hasTask(c) || promoted(c); } },
  { title: "Add a task",
    view: function (c) {
      if (!onQuestPage(c)) { var w = toQuest(c); w.text = candidateRow(c) ? "Open your quest from **Candidate quests**, then add a task there." : "Open **Quests**, then open your quest under **Candidate quests**."; return w; }
      return { target: document.querySelector('#view button[title="Add a task"]'), text: "Select **Add task**. Give the task a name and a due date, then select **Add task**. A task without a due date goes to the quest’s Backlog and is not scheduled." };
    },
    done: function (c) { return hasTask(c) || promoted(c); } },
  { title: "Start the quest",
    view: function (c) {
      var btn = 'button[title="Promote to quest"]';
      if (onQuestPage(c)) return { target: document.querySelector("#view " + btn), text: "Find the **Promote** button at the bottom of the Quest details." };
      var row = candidateRow(c);
      if (row) return { target: row.querySelector(btn), text: "Select **Promote** next to your quest under **Candidate quests**." };
      return { target: tab("projects"), text: "Open **Quests**, then select **Promote** next to your quest under **Candidate quests**." };
    },
    done: promoted },
  { title: "See your plan",
    view: function (c) {
      var dated = state.tasks.some(function (t) { return t.questId === c.questId && t.block > 0; });
      return { target: tab("today"), text: dated
        ? "Open **Today** to see what to work on next across all your quests. **Timeline** draws your task on a calendar."
        : "Open **Today** to see what to work on next across all your quests. Your task has no due date, so it sits in the quest’s Backlog and is not on **Timeline**. Give a task a due date to schedule it." };
    },
    done: function () { return ui.view === "today"; } },
  { title: "Welcome to the adventure!", view: function () { return { text: "Everything else is in the Field guide. To run this walkthrough again, open the Field guide and select **Replay tutorial**." }; } }
];

var panel = null, textHost = null, shownText = "", timer = null, startTimer = null, index = 0, ctx = null, lit = null, flashed = "";

function richText(host, text) {
  text.split("**").forEach(function (part, i) { host.appendChild(i % 2 ? el("strong", null, part) : document.createTextNode(part)); });
}

function clearLit() { if (lit) lit.classList.remove("tutorialtarget", "tutorialflash"); lit = null; }

export function stopTutorial() {
  if (timer) clearInterval(timer);
  if (startTimer) clearTimeout(startTimer);
  timer = startTimer = null;
  clearLit();
  document.documentElement.style.removeProperty("--tutorial-top");
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  panel = textHost = null;
}

function draw() {
  var step = STEPS[index], last = index === STEPS.length - 1;
  panel.innerHTML = "";
  // Restart the card ring's swell for each step.
  panel.classList.remove("tutorialflash"); void panel.offsetWidth; panel.classList.add("tutorialflash");
  panel.appendChild(el("div", { "class": "tutorialcount" }, "Step " + (index + 1) + " of " + STEPS.length));
  panel.appendChild(el("h2", { "class": "tutorialtitle" }, step.title));
  textHost = el("p", { "class": "tutorialtext" }); panel.appendChild(textHost); shownText = "";
  var acts = el("div", { "class": "actions", style: "margin-top:10px" });
  acts.appendChild(on(el("button", { type: "button", "class": "small primary", id: "tutorialNext" }, last ? "Finish" : step.done ? "Skip step" : "Next"), "click", function () { advance(); }));
  if (!last) acts.appendChild(on(el("button", { type: "button", "class": "small", id: "tutorialSkip" }, "Skip tutorial"), "click", stopTutorial));
  panel.appendChild(acts);
}

function advance() {
  if (index >= STEPS.length - 1) { stopTutorial(); return; }
  index++; draw(); tick();
}

// Views rebuild their DOM often, so the highlight and the text are re-read on every tick.
function tick() {
  if (!panel) return;
  var step = STEPS[index];
  if (step.done && step.done(ctx)) { advance(); return; }
  var w = step.view(ctx);
  if (w.text !== shownText) { textHost.innerHTML = ""; richText(textHost, w.text); shownText = w.text; }
  // Toasts read this to stay above the card, whatever its height or visibility.
  var box = panel.getBoundingClientRect();
  document.documentElement.style.setProperty("--tutorial-top", (box.height ? Math.round(window.innerHeight - box.top) : 0) + "px");
  var target = w.target || null;
  if (target !== lit) { clearLit(); if (target) { target.classList.add("tutorialtarget"); lit = target;
    // A new kind of target flashes (a tab, then the quest row on Quests). Views rebuild their DOM, so the same kind re-found stays quiet.
    var kind = index + "|" + (target.tagName === "LI" ? "row" : target.getAttribute("data-view") || target.id || target.title || target.tagName);
    if (flashed !== kind) { flashed = kind; target.classList.add("tutorialflash"); }
    if (target.closest("#view")) { try { target.scrollIntoView({ block: "center" }); } catch (e) { /* ignore */ } } } }
}

// Starts the walkthrough now. A replay begins from the current state, so it adds a second quest.
export function startTutorial() {
  stopTutorial();
  index = 0; flashed = ""; ctx = { baseIds: state.quests.map(function (p) { return p.id; }), baseActive: state.quests.filter(function (p) { return p.status === "active"; }).map(function (p) { return p.id; }), questId: null };
  panel = el("section", { "class": "tutorial", role: "region", "aria-label": "Tutorial", "aria-live": "polite" });
  document.body.appendChild(panel);
  draw(); tick();
  timer = setInterval(tick, 300);
}

// First launch only: waits for the splash to finish, then marks the tutorial seen so it never returns on its own.
export function maybeStartTutorial(ready) {
  Promise.resolve(ready).then(check, check);
  function check() {
    if (state.settings.tutorialDone) return;
    wait();
  }
  function wait() {
    var splash = $("splash");
    if (splash && !splash.hidden) { startTimer = setTimeout(wait, 250); return; }
    state.settings.tutorialDone = true; save();
    startTutorial();
  }
}
