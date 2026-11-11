/* the Field guide */
import { go } from "./app.js";
import { closeAllModals, openModalOver } from "./dialogs.js";
import { el, isHosted, on, setHelpOpener } from "./dom.js";
import { highlight } from "./search.js";
import { ui } from "./state.js";
import { startTutorial } from "./tutorial.js";

/* help */
export function helpMarkup(text) {
  var frag = document.createDocumentFragment();
  text.replace(/^\{#[a-z-]+\}/, "").split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/).forEach(function (part) {
    if (!part) return;
    if (part.indexOf("**") === 0) frag.appendChild(el("b", null, part.slice(2, -2)));
    else if (part.indexOf("[[") === 0) frag.appendChild(el("kbd", null, part.slice(2, -2)));
    else frag.appendChild(document.createTextNode(part));
  });
  return frag;
}

// A Terms line is "{#id}**Name:** Definition. See “Topic”." The id is what a "?" button points at.
export function helpTerm(id) {
  var lines = helpTopics().filter(function (t) { return t[0] === "Terms"; })[0][1], found = null;
  lines.forEach(function (l) {
    var m = l.match(/^\{#([a-z-]+)\}\*\*([^*]+):\*\* (.+?) See “([^”]+)”\.$/);
    if (m && m[1] === id) found = { id: m[1], name: m[2], text: m[3], topic: m[4] };
  });
  return found;
}

// The "?" modal: the definition, plus a button that opens the Field guide at the topic that explains more.
export function openTermHelp(id) {
  var t = helpTerm(id); if (!t) return;
  openModalOver(t.name, function (body) {
    var tp = el("p", { "class": "first" }); tp.appendChild(helpMarkup(t.text)); body.appendChild(tp);
    var acts = el("div", { "class": "actions" });
    acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "termMore", title: "Open “" + t.topic + "” in the Field guide" }, "Read more in the Field guide"), "click", function () { closeAllModals(); ui.helpTopic = t.topic; go("help"); }));
    body.appendChild(acts);
  });
}

setHelpOpener(openTermHelp);

export function helpTopics() {
  return [
    ["How Sidequest works", [
      "**Web and installed version:** Your quest data is stored in the browser and on the device you’re using. This means your data is available on that device, including when you’re offline. Installing Sidequest does not create a separate set of quests from the browser version.",
      "**Backups:** If your browser’s local storage is cleared, you will lose all of your quest data, so back up your quests periodically.",
      "**Artifact version:** The Artifact version works as a Claude artifact or a Muse space. When you use Sidequest this way, your quest data is stored with your account. You can access your quests from the web, the app, or a mobile device where you’re signed in. You need an internet connection.",
      "**Artifact updates:** The Artifact version tells you when an update is available and how to install it without losing any data."
    ]],
    ["Terms", [
      "{#active-quest}**Active quest:** A quest that has been promoted from a candidate. If it has scheduled tasks, it appears in the **In progress** section. Otherwise, it appears in the **Pending** section. See “Quests page”.",
      "{#actual}**Actual:** The burndown line showing the tasks you have left. See “Timeline page”.",
      "{#badge-added}**Added badge:** Marks a task added after the quest started. See “Inside a quest”.",
      "{#adventurer}**Adventurer:** Your contact information and brandmark, used on exports. See “Options page”.",
      "{#backlog}**Backlog:** Open tasks without a due date. See “Tasks page”.",
      "{#before-you-launch}**Before you launch:** The section that lists a quest’s **Launch critical** tasks. These tasks must be completed before launch. See “Inside a quest”.",
      "{#bounty}**Bounty:** The amount a quest pays. This does not appear on exports. See “Quest giver and Quest links”.",
      "{#candidate-quest}**Candidate quest:** A quest you’re considering but haven’t started. See “Quests page”.",
      "{#decision}**Decision:** A question attached to a step. Answering it completes the step. See “Inside a quest”.",
      "{#errand}**Errand:** One item on the **Errands** page. See “Errands page”.",
      "{#errands-deck}**Errands deck:** Incomplete errands you can add to your hand to give them higher priority. See “Errands page”.",
      "{#forecast}**Forecast:** The dotted burndown line estimating when you’ll finish. See “Timeline page”.",
      "{#gathering-dust}**Gathering dust:** A badge for an active quest nobody has changed for a while. See “Options page”.",
      "{#hand}**Your hand:** Choose up to three errands to keep in your hand. See “Errands page”.",
      "{#idea}**Idea:** A note in the **Workshop** that hasn’t become a quest. See “Workshop page”.",
      "{#ideal}**Ideal:** The burndown line showing your planned pace. See “Timeline page”.",
      "{#in-progress}**In progress:** An active quest with at least one incomplete task that has a due date. See “Quests page”.",
      "{#launch-critical}**Launch critical:** A task that must be completed before launch. These tasks are grouped in the **Before you launch** section. See “Inside a quest”.",
      "{#make-candidate}**Make candidate:** Turns an idea into a candidate quest. See “The quest lifecycle”.",
      "{#milestone}**Milestone:** A task with a date that appears on the **Timeline**. See “Inside a quest”.",
      "{#next-up}**Next up:** The earliest-starting incomplete task across all open quests. See “Today page”.",
      "{#pending}**Pending:** An active quest with no incomplete tasks that have due dates. See “Quests page”.",
      "{#pin}**Pin:** Adds a shortcut to a quest in the sidebar. See “Quests page”.",
      "{#prepared}**Prepared by and Prepared for:** The export’s letterhead, showing your information first and the Quest giver’s second. See “Quest giver and Quest links”.",
      "{#promote-demote}**Promote and Demote:** **Promote** moves a candidate quest to active. **Demote** moves it back to candidate. See “The quest lifecycle”.",
      "{#quest}**Quest:** A project, from the initial idea through completion. See “The quest lifecycle”.",
      "{#quest-giver}**Quest giver:** The client or contact for this quest. See “Quest giver and Quest links”.",
      "{#quest-giver-export}**Quest giver export:** A read-only page you can share with a client. See “Quest giver and Quest links”.",
      "{#quest-links}**Quest links:** Connections between quests that belong to the same job. See “Quest giver and Quest links”.",
      "{#reroll}**Reroll and Roll:** Reroll replaces your hand of errands with a new one. Roll deals a first hand when your hand is empty. Overdue errands are prioritized, and you can undo either. See “Errands page”.",
      "{#scope}**Scope:** The total amount of work in a quest. The orange line shows when that amount changes. See “Timeline page”.",
      "{#slip-schedule}**Slip schedule:** Moves a quest’s incomplete tasks to later dates. You can undo this change. See “A quest’s Schedule and Timeline”.",
      "{#step}**Step:** A smaller action that makes up a task. See “Inside a quest”.",
      "{#stretch-of-work}**Stretch of work:** A period in a quest’s schedule, labeled Block, Sprint, Iteration, Phase, or Week. See “Options page”.",
      "{#task}**Task:** A piece of work within a quest. See “Inside a quest”.",
      "{#task-counts}**Task counts:** A weekly table of tasks in scope, how many remain against the plan, and tasks added or removed. See “Timeline page”.",
      "{#vault}**Vault:** Where you keep ideas and quests you’re no longer working on. See “Vault page”.",
      "{#workshop}**Workshop:** Where you keep and develop ideas before turning them into quests. See “Workshop page”."
    ]],
    ["Finding your way around", [
      "**Search:** Press [[/]] to search on a computer, or tap the magnifier on a phone. [[Enter]] opens the first result, [[Esc]] clears it. On a phone, tap the **x** where the magnifier was to cancel.",
      "**New (+) button:** Use the **+** button to add a candidate quest, task, step, decision, idea, or errand.",
      "**Main menu:** The **Main menu** (hamburger menu) lists every page in the app.",
      "**Tab bar (mobile):** On a mobile device, the tab bar holds the main pages. Find the other pages in the **Main menu**.",
      "**Undo:** Removing an item or sending it to the **Vault** shows an **Undo** button for a few seconds."
    ]],
    ["The quest lifecycle", [
      "Ideas live in the **Workshop** until you’re ready to consider pursuing them. Making an idea a candidate quest moves it to the **Candidate quests** section on the **Quests** page.",
      "A promoted quest is an active quest. It lands in **In progress** only if it has incomplete scheduled tasks. Otherwise it goes to **Pending**. You can later complete an active quest, demote it back to a candidate, or vault it.",
      "If you already know what you want to pursue, you can create a candidate quest directly with the **+** button.",
      "Finishing the last step of a task completes the task, and completing the last task of a quest (including its backlog tasks) completes the quest. You can also mark a task or quest complete manually. A quest has **Mark complete** and **Reopen** buttons on its page.",
      "The **Vault** stores old ideas and quests, either permanently or for a specified period of time (see the **Options** section for more)."
    ]],
    ["Today page", [
      "The **Today** page shows your most pressing task, and any overdue tasks. The **Burndown** chart shows how many tasks remain in all open quests (see the **Timeline** page for more). The **Stats** section displays all remaining and backlogged tasks."
    ]],
    ["Quests page", [
      "**In progress:** This section lists the quests you’re working on. Each quest appears as a row with its name, its next scheduled task and that task’s start date, and the number of incomplete scheduled tasks it has left.",
      ">Rows are ordered by the start date of each quest’s next task, from earliest to latest. A quest appears here only if it has incomplete scheduled tasks. Backlog tasks don’t count.",
      "**Pending:** These are promoted quests with no incomplete scheduled tasks. This includes new quests with no tasks, and quests whose only open tasks are backlogged. When it has an incomplete task with a due date, a quest moves up to **In progress**.",
      "**Completed:** This section lists completed quests.",
      "**Candidate quests:** These are quests you’re considering but aren’t working on. You can demote an active quest back to a candidate quest in the **Quest details**. Before promoting a candidate quest, you can add tasks, steps, and decisions to it.",
      ">A candidate quest keeps the links it had when it was demoted.",
      "**Pinned quests:** You can pin in progress, pending, and completed quests that are still on the **Quests** page. Pinning places a shortcut to that quest in the sidebar (or the **Main menu** on mobile). Completing a quest unpins it automatically. Reopening a formerly pinned quest restores the pin."
    ]],
    ["Inside a quest", [
      "**Quest details:** Tapping a quest title on the **Quests** page opens the quest details for editing.",
      "**Tasks:** You can add tasks with the **+** button or from inside a quest. Tasks can have start and due dates and a time estimate. You can also describe how you’ll know a task is complete.",
      ">Tasks without due dates show a **Backlog** badge. Tasks added after a quest’s start date show an **Added** badge with the date. Even with open steps and decisions, you can close a task.",
      ">Select **Make milestone** to turn a task with a due date into a milestone. A milestone moved to the **Backlog** is no longer a milestone.",
      ">Each task goes into its quest’s **stretch of work**. A stretch of work is a period that divides a quest’s schedule. Stretches of work appear on the **Timeline** as gray bands. Tasks appear within each stretch of work and their color shows status: gray-blue for not started, gold for in progress, and green for completed.",
      "**Steps:** You can add steps with the **+** button or from inside a task. Steps break a task into smaller actions. Completing all of a task’s steps completes the task.",
      "**Decisions:** Every step within a task can require a decision. Answering an open decision closes the step.",
      "**Before you launch:** Tasks that must be done before a quest can launch go in this section. Selecting **Launch critical** adds a task to this section. This is only an organizational feature and does not otherwise change the task.",
      "**Notes:** Use **Notes** for any additional information about the quest. An idea’s note carries over when the idea becomes a candidate quest."
    ]],
    ["Quest giver and Quest links", [
      "**Quest giver:** The Quest giver is the client for a quest. You can also enter a **Bounty** (a monetary value), either as an hourly rate or a fixed payment for the quest.",
      ">The **Quest giver export** includes everything entered here except the **Bounty**. It creates a read-only, interactive web page you can share with the client. Before it exports, you choose whether to include **Prepared by** (your contact information and brandmark) and **Prepared for** (the Quest giver). Its button is at the bottom of an in progress or complete quest’s details and doesn’t appear on a candidate or vaulted quest.",
      "**Quest links:** When a job requires more than one quest, link them. Use **Link quest** to link a quest to any quest that is in progress, pending, or completed.",
      ">A candidate quest can add links the same way, but other quests can’t link to a candidate quest. Links to a candidate or vaulted quest show as plain text, and you can follow links to other quests.",
      ">Vaulting or demoting a quest keeps its links, and promoting or restoring it makes them active again."
    ]],
    ["A quest’s Schedule and Timeline", [
      "**Schedule:** Quests can have start and due dates, and stretch of work durations (see the **Options** section for more). A quest’s start and due dates divide its total time into stretches of work.",
      ">A quest can’t start after any of its tasks’ due dates, and its due date can’t come before its start date or any of its tasks’ due dates. If a date conflicts with either rule, you’ll be told which date needs to change.",
      "**Timeline:** The **Timeline** for a quest shows that quest’s schedule as a simple Gantt chart, along with its burndown chart.",
      ">Use the **Slip schedule** button to move incomplete tasks to a later date. Slips can be undone. If a slip would push tasks past the quest’s due date, Sidequest warns you first. Select the button again to proceed.",
      ">The Gantt chart displays milestones and all open tasks. A red line shows today’s date when it falls within the displayed schedule.",
      ">The **Burndown** works the same way as on the **Timeline** page, but counts only this quest’s tasks."
    ]],
    ["Tasks page", [
      "**Tasks:** This section shows tasks from all open quests, excluding candidate quests. They are listed by start date, earliest first. Tasks with the same start date are ordered by due date, then by the order they were created. Completed tasks appear at the bottom. You can edit tasks here without returning to the **Quests** page.",
      "**Backlog:** This section shows all open tasks without due dates."
    ]],
    ["Timeline page", [
      "The **Timeline** page shows the schedules of all open quests. It includes a Gantt chart of open quests and milestones, plus the overall burndown and task counts. A red line shows today’s date when it falls within the displayed schedules.",
      ">The **Burndown** chart shows how many tasks remain in all open quests. The straight **Ideal** line shows the planned rate of progress, and the **Actual** line shows your progress. Adding or removing work changes the amount remaining.",
      ">The dotted **Forecast** line shows the projected trajectory for completing the remaining work. Hovering over the dot at the end shows the projected completion date. The orange **Scope** line shows changes in scope. You can tap or drag across the burndown to see dates and remaining tasks.",
      "The **Stats** section displays all remaining and backlogged tasks. The **Task counts** table shows how many tasks remain and tracks changes in scope. Adding a scheduled task raises the scope and deleting one lowers it. Each change shows in the **Scope change** column."
    ]],
    ["Errands page", [
      "**Errands:** List for small errands that aren’t quite a quest. Errands don’t appear on the **Timeline**, the **Burndown**, or the **Tasks** page, and they don’t change any counts.",
      "**Add errand:** Type an errand and select **Add errand** or press [[Enter]]. You can also give errands a due date. Select the pencil to rename an errand.",
      "**Errands deck:** Contains open errands that aren’t in your hand. Errands with due dates appear first, earliest due date first. The rest follow in the order they were added. Overdue errands display an **Overdue** badge.",
      "**Your hand:** Up to three errands you keep at the top of the page. Select **Manage hand** to choose errands, put them in order, or discard them. **Empty hand**, in **Manage hand**, clears your hand, and you can undo that.",
      "**Choose** and **Discard:** **Choose** adds an errand to your hand and **Discard** returns it to the deck. **Discard** never deletes an errand. Your hand holds three errands, so **Choose** turns off when it’s full.",
      "**Reroll** and **Roll:** Once you have a hand, the button reads **Reroll** and replaces your whole hand, including errands you chose yourself. With an empty hand, it reads **Roll** and deals a first hand. Overdue errands get priority, followed by other errands not currently in your hand. This helps you work through overdue errands before repeating them. Select **Undo** right away to restore your previous hand. **Reroll** is disabled when fewer than two open errands remain, and **Roll** needs only one. With **Sound effects** on, it plays a sound. Turn off the **Animated reroll** in **Options**.",
      "**Complete errand:** Check the box next to an errand to mark it complete. It moves to the **Completed** section.",
      "**Restore errand:** Uncheck a completed errand to move it back to the **Errands deck**.",
      "**Delete forever:** Permanently deletes an errand. Select **Undo** right away to restore it."
    ]],
    ["Workshop page", [
      "All ideas live here. Use them to think through new quests or prospects. You can either select **Make candidate** to turn an idea into a candidate quest or **Vault** it."
    ]],
    ["Vault page", [
      "The **Vault** is a place to store ideas and quests you’re no longer actively working with but may want to keep. You can use **Restore** or **Delete forever** on vaulted items. You can also choose to have the **Vault** automatically delete old items after a set period."
    ]],
    ["Options page", [
      "**Adventurer:** This is where you can add your contact information and brandmark or logo. You can choose whether or not to include it when creating a **Quest giver export**.",
      "**Schedule defaults:** Set the default length of a **stretch of work**. You can adjust the stretch duration for individual quests.",
      ">You can also choose what to call a stretch of work: Block, Sprint, Iteration, Phase, or Week.",
      ">**Warn when active quests exceed:** Set the number of active quests you want to allow at a time. If you try to promote another candidate quest past that number, Sidequest warns you, and you can bypass the warning.",
      ">**Quests begin gathering dust after:** Set how long an active quest can go without progress before it displays a **Gathering dust** badge.",
      "**Appearance and formats:** These settings include **Date format**, **Coin format** (1,234.56 or 1.234,56), **Splash screen on open** (on/off), **Theme** (light and dark mode), **Animated burndown** (on/off), **Animated reroll** (on/off), **Completion effects** (on/off), and **Sound effects** (on/off).",
      "**Vault:** Set how long the **Vault** keeps items before it deletes them: never, or after 7, 30, 60, or 90 days.",
      "**Install Sidequest:** If you’re using Sidequest on the web, you can install it to your device. iPhones and iPads don’t show this button: tap the **Share** icon in Safari, then **Add to Home Screen**, to install it. The installed version works offline and displays a **Refresh** button in the top bar.",
      "**Import:** Bring tasks from another application into Sidequest. Sidequest can import Trello JSON or Todoist CSV as a new quest.",
      "**Backup and restore:** Download a backup of your Sidequest data as a JSON file. Because the web and installed versions store your data on your device, make occasional backups. **Restore backup** loads a backup file and replaces everything in Sidequest with it. You’ll see a warning first, and an **Undo** button afterward.",
      ">If Sidequest can’t save a change, it tells you once. Save a backup when you see that message.",
      "**Start fresh:** Erase all Sidequest data and start again (your options are retained). You can begin with an empty Sidequest or with the sample quests. You’ll get a warning and a chance to save a backup first. This cannot be undone."
    ]],
  ];
}

export function renderHelp(root) {
  // A filter box: typing narrows the sections to those that contain the text, and opens them.
  var filterWrap = el("div", { "class": "field", style: "margin-top:0" });
  var filt = el("input", { type: "search", id: "helpFilter", placeholder: "Filter the Field guide", "aria-label": "Filter the Field guide", autocomplete: "off" });
  filterWrap.appendChild(filt); root.appendChild(filterWrap);
  var acts = el("div", { "class": "actions", style: "margin-top:10px" }), items = [];
  var openAll = el("button", { type: "button", "class": "small", id: "helpOpen" }, "Open all"), closeAll = el("button", { type: "button", "class": "small", id: "helpClose" }, "Close all");
  on(openAll, "click", function () { items.forEach(function (d) { d.open = true; }); });
  on(closeAll, "click", function () { items.forEach(function (d) { d.open = false; }); });
  var replay = el("button", { type: "button", "class": "small tutorialbtn", id: "helpReplay", style: "margin-left:auto", title: "Play the first-run walkthrough" }, "Play tutorial");
  on(replay, "click", function () { go("today"); startTutorial(); });
  acts.appendChild(openAll); acts.appendChild(closeAll); acts.appendChild(replay); root.appendChild(acts);
  // A line that starts with ">" is nested one level under the line above it (">>" is two levels).
  // The install line is about the web app, so a hosted version (Claude, or any host that sets the flag) skips it.
  helpTopics().forEach(function (t, i) {
    var d = el("details", { "class": "helpitem" }); if (i === 0) d.open = true;
    d.appendChild(el("summary", null, t[0]));
    var body = el("div", { "class": "hbody" }), ul = el("ul"), stack = [ul];
    t[1].forEach(function (line) {
      var depth = 0; while (line.charAt(depth) === ">") depth++;
      var text = line.slice(depth);
      if (isHosted() && text.indexOf("**Install Sidequest:**") === 0) return;
      while (stack.length > depth + 1) stack.pop();
      while (stack.length < depth + 1) {
        var parent = stack[stack.length - 1].lastChild, nested = el("ul");
        if (!parent) { parent = el("li"); stack[stack.length - 1].appendChild(parent); }
        parent.appendChild(nested); stack.push(nested);
      }
      var li = el("li"), tm = text.match(/^\{#([a-z-]+)\}/); if (tm) li.setAttribute("data-term", tm[1]);
      li.appendChild(helpMarkup(text)); stack[stack.length - 1].appendChild(li);
    });
    body.appendChild(ul); d.appendChild(body); root.appendChild(d); items.push(d);
  });
  var noMatch = el("p", { "class": "hint", role: "status", "aria-live": "polite" }); noMatch.hidden = true; root.appendChild(noMatch);
  // Arriving from a "?" button: open that one topic and bring it into view.
  if (ui.helpTopic) {
    var target = ui.helpTopic; ui.helpTopic = null;
    items.forEach(function (d) {
      var hit = d.querySelector("summary").textContent === target;
      d.open = hit;
      if (hit) { var sm = d.querySelector("summary"); sm.setAttribute("tabindex", "-1"); window.setTimeout(function () { try { d.scrollIntoView(); sm.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50); }
    });
  }
  // Curly and straight quotes count as the same, so typing an apostrophe always matches.
  function norm(s) { return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"'); }
  var texts = items.map(function (d) { return norm(d.textContent); });
  var titles = items.map(function (d) { return norm(d.querySelector("summary").textContent); });
  var labels = items.map(function (d) { return [].map.call(d.querySelectorAll(".hbody b"), function (b) { return norm(b.textContent); }); });
  var sums = items.map(function (d) { return d.querySelector("summary"); }), sumOriginals = sums.map(function (x) { return x.textContent; });
  var bodies = items.map(function (d) { return d.querySelector(".hbody"); }), originals = bodies.map(function (b) { return b.innerHTML; });
  function esc(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  // Wraps each matching word in a <mark>; a phrase split across bold text still opens the section but is not marked.
  function highlight(body, words) {
    var re = new RegExp(words.slice().sort(function (x, y) { return y.length - x.length; }).map(esc).join("|"), "g");
    var walker = document.createTreeWalker(body, 4), nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var low = norm(node.data), m, pos = 0, frag = document.createDocumentFragment(), found = false;
      re.lastIndex = 0;
      while ((m = re.exec(low))) {
        if (!m[0]) { re.lastIndex++; continue; }
        found = true;
        if (m.index > pos) frag.appendChild(document.createTextNode(node.data.slice(pos, m.index)));
        frag.appendChild(el("mark", null, node.data.slice(m.index, m.index + m[0].length)));
        pos = m.index + m[0].length;
      }
      if (!found) return;
      if (pos < node.data.length) frag.appendChild(document.createTextNode(node.data.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    });
  }
  function place(order) { order.forEach(function (i) { root.insertBefore(items[i], noMatch); }); }
  // Every word must appear in a topic. A Terms entry that starts with the whole query ranks first, then a title hit,
  // then a bold label hit, then the body; only topics with one of the first three open on their own.
  function score(i, q, words) {
    var all = words.every(function (w) { return texts[i].indexOf(w) >= 0; });
    if (!all) return null;
    var sc = 0, strong = false;
    if (titles[i] === "terms" && labels[i].some(function (l) { return l === q || l.indexOf(q) === 0; })) { sc += 1000; strong = true; }
    if (words.every(function (w) { return titles[i].indexOf(w) >= 0; })) { sc += 100; strong = true; }
    var lab = labels[i].filter(function (l) { return words.every(function (w) { return l.indexOf(w) >= 0; }); }).length;
    if (lab) { sc += 50 * Math.min(lab, 3); strong = true; }
    var count = 0, at = texts[i].indexOf(words[0]);
    while (at >= 0) { count++; at = texts[i].indexOf(words[0], at + words[0].length); }
    sc += Math.min(count, 20);
    return { score: sc, strong: strong, count: count };
  }
  on(filt, "input", function () {
    var q = norm(filt.value.trim()), words = q ? q.split(/\s+/) : [], any = false, ranked = [];
    items.forEach(function (d, i) {
      bodies[i].innerHTML = originals[i]; sums[i].textContent = sumOriginals[i];
      var r = q ? score(i, q, words) : null;
      d.hidden = !!q && !r;
      if (q && r) ranked.push({ i: i, r: r });
    });
    if (!q) { place(items.map(function (d, i) { return i; })); items.forEach(function (d, i) { d.open = i === 0; }); }
    else {
      ranked.sort(function (x, y) { return y.r.score - x.r.score || x.i - y.i; });
      any = ranked.length > 0;
      var anyStrong = ranked.some(function (x) { return x.r.strong; });
      place(ranked.map(function (x) { return x.i; }).concat(items.map(function (d, i) { return i; }).filter(function (i) { return items[i].hidden; })));
      ranked.forEach(function (x, k) {
        items[x.i].open = x.r.strong || (!anyStrong && k === 0);
        highlight(bodies[x.i], words);
        // The Terms list is long, so only its matching entries stay while searching.
        if (titles[x.i] === "terms") [].forEach.call(bodies[x.i].querySelectorAll("li"), function (li) { var t = norm(li.textContent); li.hidden = !words.every(function (w) { return t.indexOf(w) >= 0; }); });
        sums[x.i].appendChild(el("span", { "class": "helpcount" }, " (" + x.r.count + (x.r.count === 1 ? " match)" : " matches)")));
      });
    }
    noMatch.hidden = !q || any;
    noMatch.textContent = q && !any ? "No sections match “" + filt.value.trim() + "”." : "";
  });
  on(filt, "keydown", function (e) { if (e.key === "Escape" && filt.value) { e.preventDefault(); filt.value = ""; filt.dispatchEvent(new Event("input")); } });
}
