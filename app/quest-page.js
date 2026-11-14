/* a quest's page and the task detail */
import { go, renderView } from "./app.js";
import { questRangeBlock } from "./chart.js";
import { TODAY, fmt, fmtY, iso, parseISO } from "./dates.js";
import { decisionDialog, decisionEditDialog, formDialog, issueDialog, linkQuestDialog, openModal, slipDialog, taskDialog } from "./dialogs.js";
import { phoneField } from "./phone.js";
import { autosize, emailField, editInline, el, formatMoney, helpLink, moneyInput, notify, on, pencilButton, playSfx, setFocusKey, uid, setMsg } from "./dom.js";
import { buildExportSnapshot, exportFileName, exportHasIssues, exportSides, renderExportDocument } from "./export.js";
import { saveFile } from "./files.js";
import { completionDialog, demoteToCandidate, promoteToActive, removeNow, removeToVault, restoreEntry, vaultQuest } from "./lifecycle.js";
import { blockForDate, dateProblems, decisionFor, dispQuest, estimateWarning, findQuest, fmtHoursLong, isDusty, isLate, isPinned, launchItems, linkedQuests, liveQuests, pset, questEstimate, questMeta, questTasks, setStatus, short, sortTasks, syncFromSteps, taskEnd, taskStart, unlinkQuests, wd, wl } from "./model.js";
import { STATUSES, changed, isISO, save, state, ui } from "./state.js";
import { addedChip, burnParts, stepsAndEst, wireMilestoneDiamonds, withHelp } from "./views.js";

// A vaulted quest’s tasks carry the vault mark, which the export’s task queries skip, so it is lifted while one runs.
function whileUnvaulted(p, fn) {
  var marked = state.tasks.filter(function (t) { return t.questId === p.id && t.vault; }), saved = marked.map(function (t) { return t.vault; });
  marked.forEach(function (t) { t.vault = null; });
  try { return fn(); } finally { marked.forEach(function (t, i) { t.vault = saved[i]; }); }
}

// Asks which letterhead sides to include, offering only the sides that have something to print. With neither, it exports at once.
export function askExportSides(p) {
  var sides = exportSides(p), hasIssues = whileUnvaulted(p, function () { return exportHasIssues(p); });
  if (!sides.by && !sides.forWhom && !hasIssues) { exportQuestForClient(p); return; }
  var fields = [];
  if (sides.by) fields.push({ key: "by", label: "Include “Prepared by” (your contact info and brandmark from Options)", type: "checkbox", value: true });
  if (sides.forWhom) fields.push({ key: "forWhom", label: "Include “Prepared for” (this quest’s Quest giver)", type: "checkbox", value: true });
  if (hasIssues) fields.push({ key: "issues", label: "Include issues (title, status, and notes)", type: "checkbox", value: false });
  formDialog("Quest giver export", fields, "Export", function (v) {
    exportQuestForClient(p, { preparedBy: !sides.by || v.by === "1", preparedFor: !sides.forWhom || v.forWhom === "1", issues: v.issues === "1" });
  }, sides.by || sides.forWhom ? "Choose what appears on the export." : "Choose whether the export lists this quest’s issues.");
}

// Builds the standalone read-only export and offers it for saving, same
// fallback order as saveBackupFile(). Scoped to Active/Complete quests only.
export function exportQuestForClient(p, opts) {
  var html = whileUnvaulted(p, function () { return renderExportDocument(buildExportSnapshot(p, opts)); });
  var name = exportFileName(p);
  function exported() { notify("Exported " + p.name + "."); }
  saveFile(name, html, "text/html", "Sidequest export", ".html", exported).then(function (r) {
    if (r !== "manual") exported();
  }).catch(function (err) {
    var stopped = !!err && (err.code === "declined" || err.name === "AbortError");
    notify(stopped ? "Export canceled." : "The export couldn’t be saved.", null, stopped ? "" : "problem");
  });
}

// Renaming happens in a small dialog, since a text field cannot sit inside the row's button.
function renameTaskDialog(t) {
  var noun = t.issue ? "issue" : "task", Noun = t.issue ? "Issue" : "Task";
  formDialog("Rename " + noun, [{ key: "what", label: Noun, value: t.what }], "Save", function (v) {
    if (!v.what) return "A" + (t.issue ? "n " : " ") + noun + " needs a title.";
    t.what = v.what.slice(0, 400); changed();
    return { msg: Noun + " renamed." };
  });
}
// The rename pencil and status pulldown for a task's row. They sit beside the row's button (controls cannot sit inside one), and alignStatuses() lines them up.
export function addRowControls(li, t) {
  var pen = pencilButton("Rename " + (t.issue ? "issue: " : "task: ") + short(t.what, 40), t.issue ? "Rename this issue" : "Rename this task", function () { renameTaskDialog(t); });
  pen.classList.add("rowpencil"); pen.setAttribute("data-task", t.id); li.appendChild(pen);
  var sel = el("select", { "class": "status rowstatus", "aria-label": "Status of " + short(t.what, 40), title: "Change this task’s status", "data-task": t.id, "data-focus": "status-" + t.id });
  STATUSES.forEach(function (s) { var o = el("option", { value: s }, s); if (s === t.status) o.selected = true; sel.appendChild(o); });
  sel.setAttribute("data-v", t.status);
  // Focus returns to the select only for keyboard use; after a tap or click it would look still open.
  var byPointer = false;
  on(sel, "pointerdown", function () { byPointer = true; });
  on(sel, "keydown", function () { byPointer = false; });
  on(sel, "change", function () { setStatus(t, sel.value); if (!byPointer) setFocusKey("status-" + t.id); changed(); });
  li.classList.add("hasstatus"); li.appendChild(sel);
}
// Opens or closes a row in place. Closing the row that was open above shifts the page, so the clicked row is put back where it was.
function toggleRow(p, t, open, li) {
  var before = li.getBoundingClientRect().top;
  ui.questOpen[p.id] = open ? null : t.id; renderView();
  var row = document.getElementById(li.id), shift = row ? row.getBoundingClientRect().top - before : 0;
  if (!shift) return;
  // A framed copy (Muse) scrolls the host page, so window.scrollBy does nothing there; keep the row in view instead.
  var y = window.pageYOffset || 0;
  window.scrollBy(0, shift);
  if ((window.pageYOffset || 0) === y && row && typeof row.scrollIntoView === "function") { try { row.scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ } }
}
// A long date line can wrap, so a title is not always at the same height; this reads each row's line positions, then hands them to the CSS.
export function alignStatuses(root) {
  var rows = Array.prototype.slice.call(root.querySelectorAll("li.hasstatus"));
  var tops = rows.map(function (li) { var l1 = li.querySelector(".l1"), l2 = li.querySelector(".l2"); return [l1 ? l1.offsetTop : 0, l2 ? l2.offsetTop : 0]; });
  rows.forEach(function (li, i) { li.style.setProperty("--row-l1", tops[i][0] + "px"); li.style.setProperty("--row-l2", tops[i][1] + "px"); });
}

// `inline` is the quest page's in-place version, without the heading or back button.
export function buildDetail(t, inline, readOnly) {
  var box = el("div", { "class": "detail" });
  var top = el("div", { style: "display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap" });
  var lh = el("div");
  if (!inline) lh.appendChild(el("h2", { style: "margin:0" }, dispQuest(t)));
  var dm = el("p", { "class": "dmeta" });
  if (t.block === 0) { if (!t.issue) dm.appendChild(el("span", { "class": "chip backlog", style: "margin-right:6px" }, "Backlog")); }
  else dm.appendChild(document.createTextNode(fmt(taskStart(t)) + " to " + fmt(taskEnd(t)) + " "));
  if (isLate(t)) dm.appendChild(el("span", { "class": "badge" }, "Overdue"));
  var tag2 = addedChip(t); if (tag2) { tag2.style.marginLeft = "6px"; dm.appendChild(tag2); }
  // The folded (in-place) detail leaves the title and dates to the row above it.
  if (!inline) { lh.appendChild(dm); top.appendChild(lh); }
  var right = el("div", { style: "display:flex;gap:10px;align-items:center" });
  if (t.launch) right.appendChild(el("span", { "class": "chip launchcrit" }, "Launch critical"));
  if (t.milestone) right.appendChild(el("span", { "class": "chip milestonechip" }, "Milestone"));
  if (t.issue && !inline) right.appendChild(el("span", { "class": "chip issuechip" }, "Issue"));
  // The pulldown lives on the task's row; the Tasks pane (no row above it) and a read-only task show the status as a chip.
  if (readOnly || !inline) right.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
  if (right.childNodes.length) top.appendChild(right);
  if (top.childNodes.length) box.appendChild(top);
  // The Tasks pane shows the title read-only; renaming is the pencil on the task's row.
  if (!inline) box.appendChild(el("p", { "class": "what" }, t.what));
  if (readOnly) {
    box.appendChild(el("p", { "class": "dmeta" }, t.est > 0 ? "Estimated time: " + t.est + " h" : ""));
  }
  if (!readOnly) {
    var dg = el("div", { "class": "setgrid" });
    var smsg = el("p", { "class": "msg schedmsg", role: "status", "aria-live": "polite" });
    var dmsg = el("p", { "class": "msg schedmsg", role: "status", "aria-live": "polite" });
    var emsg = el("p", { "class": "msg schedmsg", role: "status", "aria-live": "polite" });
    function dfield(id2, label, input) { var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id2 }, label)); w.appendChild(input); dg.appendChild(w); return w; }
    function shownStart() { return t.start ? t.start : (t.block === 0 ? "" : iso(taskStart(t))); }
    function shownDue() { return t.block === 0 ? "" : iso(taskEnd(t)); }
    var sd = el("input", { type: "date", id: "task-start" }), bd = el("input", { type: "date", id: "task-due" });
    var ei = el("input", { type: "number", id: "task-est", min: "0", max: "9999", step: "0.25", inputmode: "decimal" });
    sd.value = shownStart(); bd.value = shownDue(); ei.value = t.est > 0 ? t.est : "";
    if (t.block > 0) setMsg(emsg, estimateWarning(t.est, taskStart(t), taskEnd(t)), "note");
    var questFirst = parseISO(pset(t.questId).start);
    // A bad date stays in its field with its message until it is fixed; nothing is saved or reverted. "change" fires per segment while typing, so saving waits for blur.
    function liveCheck() { var m = dateProblems(t.questId, sd.value, bd.value); setMsg(smsg, m.start, "error"); setMsg(dmsg, m.due, "error"); return m; }
    ["input", "change"].forEach(function (ev) { on(bd, ev, liveCheck); on(sd, ev, liveCheck); });
    on(bd, "blur", function () {
      if (bd.value === shownDue()) return;
      var m = liveCheck();
      if (bd.value === "") { var hadStart = !!t.start, wasMilestone = t.milestone; t.block = 0; t.due = ""; t.added = ""; t.milestone = false; changed(); notify((t.issue ? "Due date cleared." : "Moved to the Backlog.") + (hadStart ? " Its start date is kept." : "") + (wasMilestone ? " It is no longer a milestone." : "")); return; }
      if (!isISO(bd.value)) { setMsg(dmsg, t.issue ? "Enter a valid due date, or leave it empty." : "Enter a valid due date, or leave it empty for the Backlog.", "error"); return; }
      var blk = blockForDate(t.questId, parseISO(bd.value));
      if (blk === null || m.due || m.start.indexOf("You can’t begin") === 0) { if (!dmsg.textContent && !smsg.textContent) setMsg(dmsg, "This quest starts " + fmtY(questFirst) + ". Choose a due date on or after that.", "error"); return; }
      if (t.start && bd.value < t.start) { setMsg(smsg, "You can’t begin after you finish! Choose a start date on or before the due date.", "error"); return; }
      if (t.block === 0) t.added = iso(TODAY);
      // A due date with no start date starts the task today, when today falls inside the quest and before that date.
      var startedToday = !t.start && iso(TODAY) >= pset(t.questId).start && iso(TODAY) <= bd.value;
      if (startedToday) t.start = iso(TODAY);
      t.due = bd.value; t.block = blk; changed();
      notify("Due " + fmt(taskEnd(t)) + ", in " + wd() + " " + blk + "." + (startedToday ? " Starts today." : ""));
    });
    on(sd, "blur", function () {
      if (sd.value === shownStart()) return;
      var m = liveCheck();
      if (sd.value === "") { setMsg(smsg, "", ""); t.start = ""; changed(); notify(t.block === 0 ? "Start date cleared." : "Start date cleared. The task starts when its " + wl() + " does."); return; }
      if (!isISO(sd.value)) { setMsg(smsg, "Enter a valid start date, or leave it empty.", "error"); return; }
      if (m.start) return;
      if (t.block > 0 && sd.value > iso(taskEnd(t))) { setMsg(smsg, "You can’t begin after you finish! Choose a start date on or before the due date.", "error"); return; }
      t.start = sd.value; changed(); notify("Start date saved.");
    });
    // Warn while typing; saving still waits for blur.
    on(ei, "input", function () { setMsg(emsg, t.block > 0 ? estimateWarning(parseFloat(ei.value), taskStart(t), taskEnd(t)) : "", "note"); });
    on(ei, "blur", function () {
      var v = ei.value === "" ? 0 : parseFloat(ei.value);
      if (isNaN(v) || v < 0 || v > 9999) { ei.value = t.est > 0 ? t.est : ""; setMsg(emsg, "Enter the estimated time as hours from 0 to 9999.", "error"); return; }
      v = Math.round(v * 100) / 100;
      if (v === (t.est || 0)) return;
      setMsg(emsg, "", "");
      t.est = v; changed();
      notify(v > 0 ? "Estimated time saved." : "Estimated time cleared.");
    });
    dfield("task-start", "Start date (optional)", sd); dfield("task-due", t.issue ? "Due date (optional)" : "Due date (leave empty to backlog)", bd); dg.appendChild(smsg); dg.appendChild(dmsg); dfield("task-est", "Estimated time (hours)", ei).appendChild(emsg);
    box.appendChild(dg);
  }

  if (!readOnly || t.done) box.appendChild(el("h3", null, "Done when"));
  if (readOnly) { if (t.done) box.appendChild(el("p", null, t.done)); }
  else if (!t.done) {
    // Nothing entered yet: a plain field. Once it has text it becomes the text with a pencil.
    var dwIn = el("input", { type: "text", "class": "donewhenfield", "aria-label": "Done when", placeholder: "How you’ll know it’s finished", maxlength: "200", autocomplete: "off" });
    function saveDone() { var v = dwIn.value.trim(); if (!v) return; t.done = v.slice(0, 200); changed(); }
    on(dwIn, "blur", saveDone);
    on(dwIn, "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); saveDone(); } });
    box.appendChild(dwIn);
  } else {
    var dw = el("div", { "class": "donewhen" }), dwText = el("span", null, t.done), dwPen = pencilButton("Edit Done when", "Edit Done when");
    on(dwPen, "click", function () {
      dwPen.hidden = true;
      editInline(dwText, {
        label: "Done when", max: 200, value: function () { return t.done; },
        onSave: function (v) { t.done = v.slice(0, 200); changed(); },
        onEmpty: function () { t.done = ""; changed(); },
        onDone: function () { dwPen.hidden = false; }
      });
    });
    dw.appendChild(dwText); dw.appendChild(dwPen); box.appendChild(dw);
  }
  var nDone = t.steps.filter(function (s) { return s.done; }).length;
  box.appendChild(el("h3", null, t.steps.length ? "Steps (" + nDone + " of " + t.steps.length + " done)" : "Steps"));
  if (!t.steps.length) box.appendChild(el("p", { "class": "hint" }, t.issue ? "No steps yet. Add steps to break it up." : "No steps yet. This task counts as one item in the burndown. Add steps to break it up."));
  if (t.steps.length && !readOnly) box.appendChild(el("p", { "class": "hint" }, "Use a step’s pencil to rename it in place, or Remove to delete it."));
  var ul = el("ul", { "class": "steps" });
  t.steps.forEach(function (s) {
    var sli = el("li", { "class": s.done ? "done" : "" });
    var lab = el("label"); var cb = el("input", { type: "checkbox" }); cb.checked = s.done;
    var dc = decisionFor(s.id);
    if (readOnly) {
      cb.disabled = true;
      lab.appendChild(cb); lab.appendChild(el("span", null, s.text)); sli.appendChild(lab);
      if (dc) sli.appendChild(el("p", { "class": "hint", style: "margin:4px 0 0" }, (dc.a ? "Decision: " : "Decision (open): ") + dc.q));
      if (dc && dc.a) sli.appendChild(el("p", { "class": "hint", style: "margin:2px 0 0" }, "Answer: " + dc.a));
    } else {
      on(cb, "change", function () { s.done = cb.checked; syncFromSteps(t); changed(); });
      var textSpan = el("span", null, s.text);
      lab.appendChild(cb); lab.appendChild(textSpan);
      var stepTop = el("div", { "class": "steptop" }); stepTop.appendChild(lab); sli.appendChild(stepTop);
      var ac = el("div", { "class": "li-actions stepactions" });
      if (dc) ac.appendChild(on(el("button", { type: "button", "class": "small", "aria-label": "Open the decision for this step", title: "Open this decision" }, dc.a ? "Decision: decided" : "Decision: open"), "click", function () { decisionEditDialog(dc, function () { removeNow(dc, "decisions", "Decision"); }); }));
      else ac.appendChild(on(el("button", { type: "button", "class": "small", "aria-label": "Add a decision to this step: " + s.text, title: "Add a decision to this step" }, "Add decision"), "click", function () { decisionDialog({ step: s.id }); }));
      var stepPen = pencilButton("Rename this step", "Rename this step");
      on(stepPen, "click", function () {
        stepPen.hidden = true; sli.classList.add("editing");
        editInline(textSpan, {
          label: "Step", max: 300, value: function () { return s.text; },
          onSave: function (v) { s.text = v.slice(0, 300); changed(); },
          onEmpty: function () { notify("A step needs a title.", null, "problem"); },
          onDone: function () { stepPen.hidden = false; sli.classList.remove("editing"); }
        });
      });
      stepTop.appendChild(stepPen);
      ac.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Remove this step" }, "Remove"), "click", function () {
        t.steps = t.steps.filter(function (x) { return x.id !== s.id; });
        state.decisions = state.decisions.filter(function (x) { return x.step !== s.id; });
        syncFromSteps(t); changed();
      }));
      sli.appendChild(ac);
    }
    ul.appendChild(sli);
  });
  box.appendChild(ul);
  if (!readOnly) {
    var add = el("div", { "class": "inline" });
    var inp = el("input", { type: "text", placeholder: "Add a step", "aria-label": "New step", "data-focus": "step-" + t.id, autocomplete: "off" });
    var addBtn = el("button", { type: "button", "class": "small", title: "Add a step to this task" }, "Add step");
    function addStep() {
      var v = inp.value.trim(); if (!v) return;
      t.steps.push({ id: uid(), text: v.slice(0, 300), done: false });
      syncFromSteps(t); setFocusKey("step-" + t.id); changed();
    }
    on(addBtn, "click", addStep);
    on(inp, "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addStep(); } });
    add.appendChild(inp); add.appendChild(addBtn); box.appendChild(add);
  }
  box.appendChild(el("h3", null, "Notes"));
  if (readOnly) {
    box.appendChild(el("p", { "class": "hint notetext" }, t.notes || "No notes."));
  } else {
    var ta = autosize(el("textarea", { "aria-label": "Notes", style: "margin-top:8px" })); ta.value = t.notes;
    on(ta, "input", function () { t.notes = ta.value.slice(0, 5000); save(true); });
    box.appendChild(ta);
  }
  if (inline || !readOnly) {
    var ar = el("div", { "class": "actions", style: "margin-top:14px" });
    if (readOnly) {
      // Nothing to offer here -- the quest page's Restore button is the one way back to editing.
    } else {
      if (t.issue) {
        // An issue is never a milestone.
      } else if (t.block === 0) {
        ar.appendChild(el("button", { type: "button", "class": "small", disabled: true, title: "This is a backlogged task. Add a due date to make it a milestone." }, "Make milestone"));
      } else if (t.milestone) {
        ar.appendChild(on(el("button", { type: "button", "class": "small on", "aria-pressed": "true", title: "Unmark this task as a milestone" }, "Remove milestone"), "click", function () { t.milestone = false; changed(); }));
      } else {
        ar.appendChild(on(el("button", { type: "button", "class": "small", "aria-pressed": "false", title: "Mark this task as a milestone" }, "Make milestone"), "click", function () { t.milestone = true; changed(); }));
      }
      var kind = t.issue ? "issue" : "task";
      if (t.launch) ar.appendChild(on(el("button", { type: "button", "class": "small on", "aria-pressed": "true", title: "Unmark this " + kind + " as launch critical" }, "Skip launch"), "click", function () { t.launch = false; changed(); }));
      else ar.appendChild(on(el("button", { type: "button", "class": "small", "aria-pressed": "false", title: "Mark this " + kind + " as launch critical" }, "Launch critical"), "click", function () { t.launch = true; changed(); }));
      ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Delete this " + kind + " (can be undone)" }, "Delete"), "click", function () { ui.detail = false; removeNow(t, "tasks", t.issue ? "Issue" : "Task"); }));
    }
    if (ar.childNodes.length) box.appendChild(ar);
  }
  return box;
}

// Bidirectional link, not a subtask hierarchy. Lists p's direct links only, one hop.
export function linksSection(root, p) {
  // A live quest or a Candidate can add links (to live quests only); a vaulted quest keeps its links read-only.
  var links = linkedQuests(p);
  var ul = el("ul", { "class": "list" });
  if (!links.length) ul.appendChild(el("li", { "class": "hint" }, "No quest links."));
  links.forEach(function (lp) {
    var inert = !!lp.vault || lp.status === "candidate";
    var li = el("li"), row = el("div", { "class": "crow oneline" }), who = el("span", { "class": "linkwho" });
    if (inert) {
      who.appendChild(el("span", { "class": "qinert", style: "font-weight:600" }, lp.name));
      if (lp.vault) who.appendChild(el("span", { "class": "chip" }, "Vaulted"));
      else if (lp.status === "candidate") who.appendChild(el("span", { "class": "chip" }, "Candidate"));
    } else {
      var nm = el("button", { type: "button", "class": "textbtn qlink", title: "View this quest" }, lp.name);
      on(nm, "click", function () { go("quest:" + lp.id); });
      who.appendChild(nm);
    }
    row.appendChild(who);
    if (!p.vault) {
      var acts = el("div", { "class": "li-actions" });
      var rm = el("button", { type: "button", "class": "small danger", title: "Remove this link" }, "Unlink");
      on(rm, "click", function () { unlinkQuests(p.id, lp.id); changed(); });
      acts.appendChild(rm); row.appendChild(acts);
    }
    li.appendChild(row); ul.appendChild(li);
  });
  root.appendChild(ul);
  if (p.vault) return;
  // A Candidate is not a link target, and neither is a vaulted quest.
  var candidates = liveQuests().filter(function (x) { return x.id !== p.id && x.status !== "candidate" && p.linkedQuestIds.indexOf(x.id) < 0; });
  if (candidates.length) {
    var addRow = el("div", { "class": "actions", style: "margin-top:10px" });
    addRow.appendChild(on(el("button", { type: "button", "class": "small", title: "Create a link to another quest" }, "Link quest"), "click", function () { linkQuestDialog(p); }));
    root.appendChild(addRow);
  }
}

// Launch-critical items render as a section on a quest's page, scoped
// to that quest's tasks -- there's no separate standalone Launch page.
export function launchSection(root, p) {
  var readOnly = !!p.vault;
  var ha = el("div", { "class": "sechead" }); ha.appendChild(withHelp(el("h2", { "class": "sechead-h", id: "h-checks" }, "Before you launch"), "before-you-launch", "Before you launch"));
  root.appendChild(ha);
  var items = launchItems(p.id);
  var n = items.filter(function (t) { return t.status === "Completed"; }).length;
  var total = items.length;
  // "items" once an issue is on the list, since an issue is not called a task anywhere else.
  var unit = items.some(function (t) { return t.issue; }) ? ["item", "items"] : ["task", "tasks"];
  root.appendChild(el("p", { "class": "hint" }, total ? "Complete: " + n + " of " + total + " launch-critical " + (total === 1 ? unit[0] : unit[1]) : "No tasks have been marked as launch critical yet."));
  var ul = el("ul", { "class": "tlist check", "aria-labelledby": "h-checks" });
  items.forEach(function (t) {
    var done = t.status === "Completed";
    // A vaulted quest, or an individually vaulted task, still opens in place -- read-only, not redirected away.
    var taskReadOnly = readOnly || !!t.vault;
    var open = ui.questOpen[p.id] === t.id;
    var li = el("li", { id: "ltask-" + t.id });
    var b = el("button", { type: "button", "class": "item" + (done ? " done" : ""), title: "View this task" });
    b.setAttribute("aria-expanded", open ? "true" : "false");
    var l1 = el("div", { "class": "l1 split" });
    if (t.block !== 0) l1.appendChild(el("span", null, fmt(taskStart(t)) + " to " + fmt(taskEnd(t))));
    if (l1.childNodes.length) b.appendChild(l1); else li.classList.add("nol1");
    b.appendChild(el("div", { "class": "l2" }, short(t.what, 60) + (t.vault ? " (in the Vault)" : "")));
    var l3 = el("div", { "class": "l3" });
    if (t.block === 0 && !t.issue) l3.appendChild(el("span", { "class": "chip backlog" }, "Backlog"));
    if (taskReadOnly) l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
    if (t.issue) l3.appendChild(el("span", { "class": "chip issuechip" }, "Issue"));
    if (t.milestone) l3.appendChild(el("span", { "class": "chip milestonechip" }, "Milestone"));
    var tag1 = addedChip(t); if (tag1) l3.appendChild(tag1);
    stepsAndEst(l3, t);
    if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
    if (l3.childNodes.length) b.appendChild(l3);
    on(b, "click", function () { toggleRow(p, t, open, li); });
    li.appendChild(b);
    if (!taskReadOnly) addRowControls(li, t);
    if (open) li.appendChild(buildDetail(t, true, taskReadOnly));
    ul.appendChild(li);
  });
  if (total) root.appendChild(ul);
}

// A quest's issues that are not launch critical.
export function issuesSection(root, p) {
  var readOnly = !!p.vault;
  var items = sortTasks(questTasks(p.id).filter(function (t) { return t.issue && !t.launch; }));
  var hd = el("div", { "class": "sechead" }); hd.appendChild(withHelp(el("h2", { "class": "sechead-h", id: "h-issues" }, "Issues"), "issue", "Issue"));
  if (!readOnly) hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Log an issue on this quest" }, "Add issue"), "click", function () { issueDialog(p.id); }));
  root.appendChild(hd);
  var n = items.filter(function (t) { return t.status === "Completed"; }).length;
  root.appendChild(el("p", { "class": "hint" }, items.length ? "Complete: " + n + " of " + items.length + (items.length === 1 ? " issue" : " issues") : "No issues yet."));
  if (!items.length) return;
  var ul = el("ul", { "class": "tlist", "aria-labelledby": "h-issues" });
  items.forEach(function (t) {
    var open = ui.questOpen[p.id] === t.id;
    var li = el("li", { id: "itask-" + t.id }), b = el("button", { type: "button", "class": "item" + (t.status === "Completed" ? " done" : ""), title: "View this issue" });
    b.setAttribute("aria-expanded", open ? "true" : "false");
    // An issue with no due date has no first line: it is not Backlog.
    if (t.block !== 0) {
      var l1 = el("div", { "class": "l1 split" });
      l1.appendChild(el("span", null, fmt(taskStart(t)) + " to " + fmt(taskEnd(t))));
      b.appendChild(l1);
    } else li.classList.add("nol1");
    b.appendChild(el("div", { "class": "l2" }, t.what));
    var l3 = el("div", { "class": "l3" });
    if (readOnly) l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
    var tag1 = addedChip(t); if (tag1) l3.appendChild(tag1);
    stepsAndEst(l3, t);
    if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
    if (l3.childNodes.length) b.appendChild(l3);
    on(b, "click", function () { toggleRow(p, t, open, li); });
    li.appendChild(b);
    if (!readOnly) addRowControls(li, t);
    if (open) li.appendChild(buildDetail(t, true, readOnly));
    ul.appendChild(li);
  });
  root.appendChild(ul);
}

// A one-row section that opens in place like a task row. Starts collapsed.
export function collapsibleSection(key, summary, detail, emptyText) {
  var ul = el("ul", { "class": "tlist sectionlist" }), li = el("li");
  var open = !!ui.sectionOpen[key];
  var line = el("div", { "class": "l2" });
  var b = el("button", { type: "button", "class": "item", "aria-expanded": open ? "true" : "false", title: open ? "Collapse this section" : "Expand this section" }, null);
  b.appendChild(line);
  function paint() { var t = summary(); line.textContent = t || emptyText; line.style.color = t ? "" : "var(--muted)"; line.style.fontSize = t ? "" : "var(--text-sm)"; }
  paint();
  detail.classList.add("detail"); detail.hidden = !open;
  on(b, "click", function () {
    open = !open; ui.sectionOpen[key] = open; detail.hidden = !open;
    b.setAttribute("aria-expanded", open ? "true" : "false"); b.title = open ? "Collapse this section" : "Expand this section";
    paint();
  });
  li.appendChild(b); li.appendChild(detail); ul.appendChild(li);
  return ul;
}

export function renderQuestPage(root, id) {
  var p = findQuest(id);
  if (!p) { root.appendChild(el("p", { "class": "hint first" }, "Quest not found.")); return; }
  var readOnly = !!p.vault;
  // Active/complete: two columns (page content left, Schedule/Timeline/Burndown right), stacked on a phone.
  var page = root, split = null;
  var metaLine = el("p", { "class": "hint" });
  if (p.status === "complete") metaLine.appendChild(el("span", { "class": "chip questcomplete", style: "margin-right:8px" }, "Complete"));
  if (isDusty(p)) metaLine.appendChild(el("span", { "class": "chip dust", style: "margin-right:8px", title: "No activity for a while" }, "Gathering dust"));
  metaLine.appendChild(document.createTextNode(questMeta(p)));
  if (!readOnly) {
    split = el("div", { "class": "questsplit" });
    // Grid areas defined in styles.css.
    root = el("div", { "class": "questmain" });
    split.appendChild(root); page.appendChild(split);
  } else {
    root.appendChild(metaLine);
    root.appendChild(el("p", { "class": "hint" }, "In the Vault. Restore it to make changes."));
  }

  var hd = el("div", { "class": "sechead" + (split ? " first" : "") }); hd.appendChild(el("h2", split ? { "class": "first" } : null, "Tasks"));
  if (!readOnly) hd.appendChild(on(el("button", { type: "button", "class": "small", title: "Add a task" }, "Add task"), "click", function () { taskDialog(p.id); }));
  root.appendChild(hd);
  // The count line on the left, the open estimated time on the right.
  var est = questEstimate(p), metaRow = el("div", { "class": "metarow" });
  metaRow.appendChild(metaLine);
  if (est.total > 0) metaRow.appendChild(el("span", { "class": "hint estleft" }, "Est. " + fmtHoursLong(est.left) + " remaining"));
  root.appendChild(metaRow);
  if (!readOnly && p.status === "complete") root.appendChild(el("p", { "class": "hint" }, "Its tasks are not included in Tasks, Timeline, or Today while this quest is Complete. Reopen it to bring them back."));
  // questTasks(), not ordered()/backlogTasks()/live() -- a quest's page keeps
  // showing its tasks even while Complete or vaulted, when cross-quest lists exclude them.
  var ts = sortTasks(questTasks(p.id).filter(function (t) { return !t.launch && !t.issue; }));
  if (ts.length) {
    var ul = el("ul", { "class": "tlist" });
    ts.forEach(function (t) {
      // A vaulted quest's task opens in place too, read-only, so its steps and decisions stay visible for historical purposes.
      var open = ui.questOpen[p.id] === t.id;
      var li = el("li", { id: "ptask-" + t.id }), b = el("button", { type: "button", "class": "item" + (t.status === "Completed" ? " done" : ""), title: "View this task" });
      b.setAttribute("aria-expanded", open ? "true" : "false");
      // An undated task has no first line; its Backlog chip leads the chips under the title.
      if (t.block !== 0) { var l1 = el("div", { "class": "l1 split" }); l1.appendChild(el("span", null, fmt(taskStart(t)) + " to " + fmt(taskEnd(t)))); b.appendChild(l1); } else li.classList.add("nol1");
      b.appendChild(el("div", { "class": "l2" }, t.what));
      var l3 = el("div", { "class": "l3" });
      if (t.block === 0) l3.appendChild(el("span", { "class": "chip backlog" }, "Backlog"));
      if (readOnly) l3.appendChild(el("span", { "class": "chip", "data-v": t.status }, t.status));
      if (t.milestone) l3.appendChild(el("span", { "class": "chip milestonechip" }, "Milestone"));
      var tag1 = addedChip(t); if (tag1) l3.appendChild(tag1);
      stepsAndEst(l3, t);
      if (isLate(t)) l3.appendChild(el("span", { "class": "badge" }, "Overdue"));
      if (l3.childNodes.length) b.appendChild(l3);
      on(b, "click", function () { toggleRow(p, t, open, li); });
      li.appendChild(b);
      if (!readOnly) addRowControls(li, t);
      if (open) li.appendChild(buildDetail(t, true, readOnly));
      ul.appendChild(li);
    });
    root.appendChild(ul);
  }
  if (!split) scheduleSection(root, p, readOnly);

  launchSection(root, p);
  issuesSection(root, p);

  root.appendChild(el("h2", null, "Quest links"));
  linksSection(root, p);

  root.appendChild(el("h2", null, "Notes"));
  if (readOnly) {
    root.appendChild(el("p", { "class": "hint notetext" }, p.notes || "No notes."));
  } else {
    var ta = autosize(el("textarea", { "aria-label": "Notes for " + p.name, style: "margin-top:8px" })); ta.value = p.notes;
    on(ta, "input", function () { p.notes = ta.value.slice(0, 5000); save(true); });
    root.appendChild(ta);
  }

  if (readOnly) {
    root.appendChild(el("h2", null, "Quest giver"));
    var gc = p.client, glines = [gc.org, gc.poc, gc.address, gc.phone, gc.email, gc.website, gc.coin !== "" ? "Bounty: " + formatMoney(gc.coin, state.settings.coinFormat) + " per " + gc.per.toLowerCase() : ""].filter(Boolean);
    root.appendChild(el("p", { "class": "hint notetext" }, glines.length ? glines.join("\n") : "No Quest giver."));
  } else {
    root.appendChild(withHelp(el("h2", null, "Quest giver"), "quest-giver", "Quest giver"));
    var giverBox = el("div");
    var gg = el("div", { "class": "setgrid" });
    function gfield(key, id, label, type, full) {
      var w = el("div", { "class": "field" + (full ? " full" : "") }); w.appendChild(el("label", { "for": id }, label));
      if (type === "phone") {
        w.appendChild(phoneField(id, p.client[key], function (v) { p.client[key] = v.slice(0, 200); save(true); }).el);
        gg.appendChild(w); return;
      }
      if (type === "email") {
        w.appendChild(emailField(id, p.client[key], function (v) { p.client[key] = v.slice(0, 200); save(true); }));
        gg.appendChild(w); return;
      }
      var inp = el("input", { type: type || "text", id: id });
      inp.value = p.client[key];
      on(inp, "input", function () { p.client[key] = inp.value.slice(0, 200); save(true); });
      w.appendChild(inp); gg.appendChild(w);
    }
    gfield("org", "giver-org-" + p.id, "Organization");
    gfield("poc", "giver-poc-" + p.id, "POC");
    gfield("phone", "giver-phone-" + p.id, "Phone", "phone", true);
    gfield("email", "giver-email-" + p.id, "Email", "email", true);
    gfield("website", "giver-website-" + p.id, "Website", "url", true);
    giverBox.appendChild(gg);
    var gaw = el("div", { "class": "field" }); gaw.appendChild(el("label", { "for": "giver-address-" + p.id }, "Address"));
    var gaddr = el("textarea", { id: "giver-address-" + p.id, rows: 3 }); gaddr.value = p.client.address;
    on(gaddr, "input", function () { p.client.address = gaddr.value.slice(0, 500); save(true); });
    gaw.appendChild(gaddr); giverBox.appendChild(gaw);
    var gg2 = el("div", { "class": "setgrid", style: "margin-top:10px" });
    var gcw = el("div", { "class": "field" }), gcl = el("div", { "class": "labelrow" });
    gcl.appendChild(el("label", { "for": "giver-coin-" + p.id }, "Bounty")); gcl.appendChild(helpLink("bounty", "Bounty")); gcw.appendChild(gcl);
    var gcoin = moneyInput(el("input", { type: "text", id: "giver-coin-" + p.id }), function (n) { p.client.coin = n; save(); }, state.settings.coinFormat);
    gcoin.value = formatMoney(p.client.coin, state.settings.coinFormat);
    gcw.appendChild(gcoin); gg2.appendChild(gcw);
    var gpw = el("div", { "class": "field" }); gpw.appendChild(el("label", { "for": "giver-per-" + p.id }, "Per"));
    var gper = el("select", { id: "giver-per-" + p.id, "class": "plain" });
    ["Hour", "Quest"].forEach(function (o) { var op = el("option", { value: o }, o); if (o === p.client.per) op.selected = true; gper.appendChild(op); });
    on(gper, "change", function () { p.client.per = gper.value; save(); });
    gpw.appendChild(gper); gg2.appendChild(gpw);
    giverBox.appendChild(gg2);
    root.appendChild(collapsibleSection("giver:" + p.id, function () { return [p.client.org, p.client.poc].filter(Boolean).join(" · "); }, giverBox, "Add Quest giver details"));
  }

  var ar = el("div", { "class": "actions questactions", style: "margin-top:14px" });
  if (readOnly) {
    ar.appendChild(on(el("button", { type: "button", "class": "small primary", title: "Bring back to Quests" }, "Restore"), "click", function () { restoreEntry({ kind: "quest", list: "quests", item: p }); }));
    if (p.status !== "candidate") ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Export web page for client review" }, "Quest giver export"), "click", function () { askExportSides(p); }));
  } else if (p.status === "candidate") {
    ar.appendChild(on(el("button", { type: "button", "class": "small primary", title: "Promote to quest" }, "Promote"), "click", function () { promoteToActive(p.id); }));
    ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Send this candidate to the Vault" }, "Vault"), "click", function () { removeToVault(p, "Quest"); }));
  } else {
    if (p.status === "active") {
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Mark complete" }, "Mark complete"), "click", function () {
        // Manual path, equal in standing to the auto-trigger, not a fallback.
        p.status = "complete"; changed(); completionDialog(p);
      }));
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Send this quest back to Candidates" }, "Demote"), "click", function () { demoteToCandidate(p.id); }));
    } else if (p.status === "complete") {
      // No auto-revert -- Reopen is the only way back to Active.
      ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Reopen this quest" }, "Reopen"), "click", function () {
        p.status = "active";
        // Lets sweepQuestCompletion() skip this quest once, so reopening one
        // whose tasks are all still Completed doesn't immediately re-fire it.
        p.justReopened = true;
        // Restore a pin completionDialog() auto-removed on completion.
        if (p.wasPinned) { var key = "quest:" + p.id; if (!isPinned(key)) state.pins.push(key); p.wasPinned = false; }
        changed(); notify("Reopened.");
        if (state.settings.audio) playSfx("../assets/sfx/quest.mp3");
      }));
    }
    ar.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Send this quest to the Vault" }, "Vault"), "click", function () { vaultQuest(p); }));
    ar.appendChild(on(el("button", { type: "button", "class": "small", title: "Export web page for client review" }, "Quest giver export"), "click", function () {
      askExportSides(p);
    }));
  }
  // Sits outside .questmain so it renders last when stacked; CSS puts it back under the left column on wide screens.
  if (split) { split.appendChild(questChartsPanel(p)); split.appendChild(ar); } else { root.appendChild(ar); }
}

// `first` zeroes the heading's top margin; `extraBtn` rides its heading row.
export function scheduleSection(host, p, readOnly, first, extraBtn) {
  // `first` can be a plain boolean (always zero the heading's top margin,
  // e.g. the Expand modal) or the string "questcharts-head" (zero it only at
  // the wide breakpoint, via CSS, so a stacked page keeps its normal section gap).
  var cls = first === true ? "first" : first === "questcharts-head" ? "questcharts-head" : "";
  var hd = el("div", { "class": "sechead" + (cls ? " " + cls : "") });
  hd.appendChild(el("h2", cls ? { "class": cls + (cls === "questcharts-head" ? " sechead-h" : "") } : null, "Schedule"));
  if (extraBtn) hd.appendChild(extraBtn);
  host.appendChild(hd);
  var eff = pset(p.id);
  if (readOnly) {
    host.appendChild(el("p", { "class": "hint" }, "Started " + (eff.start ? fmtY(parseISO(eff.start)) : "unset") + (p.due ? ", due " + fmtY(parseISO(p.due)) : "") + ", " + wl() + " length " + eff.days + " days" + "."));
  } else {
    var sg = el("div", { "class": "setgrid" }), smsg = el("p", { "class": "msg schedmsg", role: "status", "aria-live": "polite" });
    function sfield(id2, label, input) { var w = el("div", { "class": "field" }); w.appendChild(el("label", { "for": id2 }, label)); w.appendChild(input); sg.appendChild(w); }
    var ps = el("input", { type: "date", id: "proj-start" }); ps.value = eff.start;
    var pd = el("input", { type: "date", id: "proj-due" }); pd.value = p.due;
    var pl = el("input", { type: "number", id: "proj-days", min: "1", max: "90", step: "1", inputmode: "numeric" }); pl.value = eff.days;
    // The earliest and latest dates on this quest's tasks; its start and due date must stay outside them.
    var firstTask = "", lastTask = "";
    questTasks(p.id).forEach(function (t) {
      [t.start, t.due].forEach(function (v) { if (v && (!firstTask || v < firstTask)) firstTask = v; });
      if (t.due && t.due > lastTask) lastTask = t.due;
    });
    function applyOwn() {
      var sv = ps.value, lv = parseInt(pl.value, 10);
      if (sv === eff.start && lv === eff.days) { setMsg(smsg, "", ""); return; }
      if (!isISO(sv)) { setMsg(smsg, "Enter a valid start date.", "error"); return; }
      if (isNaN(lv) || lv < 1 || lv > 90) { setMsg(smsg, wd() + " length must be from 1 to 90 days.", "error"); return; }
      if (p.due && sv > p.due) { setMsg(smsg, "This quest is due " + fmtY(parseISO(p.due)) + ". Choose a start date on or before then.", "error"); return; }
      if (firstTask && sv > firstTask) { setMsg(smsg, "A task in this quest is dated " + fmtY(parseISO(firstTask)) + ". Choose a start date on or before that.", "error"); return; }
      p.start = sv; p.days = lv; changed(); notify(p.name + " schedule saved.");
    }
    // "blur", not "change" -- a date input fires "change" per segment while typing.
    on(ps, "blur", applyOwn); on(pl, "blur", applyOwn);
    on(pd, "blur", function () {
      var dv = pd.value;
      if (dv === p.due) { if (ps.value === eff.start) setMsg(smsg, "", ""); return; }
      if (dv !== "" && !isISO(dv)) { setMsg(smsg, "Enter a valid due date, or leave it empty.", "error"); return; }
      if (dv && dv < eff.start) { setMsg(smsg, "This quest starts " + fmtY(parseISO(eff.start)) + ". Choose a due date on or after that.", "error"); return; }
      if (dv && lastTask && dv < lastTask) { setMsg(smsg, "A task in this quest is due " + fmtY(parseISO(lastTask)) + ". Choose a due date on or after that.", "error"); return; }
      p.due = dv; changed(); notify(p.due ? "Due date saved." : "Due date cleared.");
    });
    sfield("proj-start", "Start date", ps); sfield("proj-due", "Due date", pd); sfield("proj-days", "Days per " + wd().toLowerCase(), pl);
    host.appendChild(sg); host.appendChild(smsg);
  }
}

export var EXPAND_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>';

// Right column: Schedule, Timeline, Burndown, flowing continuously. Expand opens all three large.
export function questChartsPanel(p) {
  var side = el("aside", { "class": "questcharts", "aria-label": "Schedule, timeline, and burndown" });
  var ex = el("button", { type: "button", "class": "small questexpand", title: "Expand the schedule, timeline, and burndown" }, "Expand");
  ex.appendChild(el("span", { "class": "expandicon", "aria-hidden": "true" })); ex.lastChild.innerHTML = EXPAND_ICON;
  on(ex, "click", function () { openModal("Timeline and burndown for " + p.name, function (body) { body.appendChild(questCharts(p, true, null, true)); }, { full: true }); });
  side.appendChild(questCharts(p, false, ex));
  return side;
}

export function questCharts(p, wide, expandBtn, first) {
  var out = el("div");
  // Schedule keeps its own heading from scheduleSection(), with Expand on the same row. .questcharts-head zeroes the heading margin only at the wide breakpoint.
  scheduleSection(out, p, false, "questcharts-head", expandBtn);
  var tl = questRangeBlock(p);
  if (tl.empty) {
    // Nothing to chart -- one combined heading, no Slip button.
    out.appendChild(el("h2", null, "Timeline & burndown"));
    out.appendChild(tl.node);
  } else {
    // Slip moves incomplete tasks only -- see slipDialog().
    var slipBtn = el("button", { type: "button", "class": "small", title: "Push this quest’s incomplete tasks later to catch up" }, "Slip schedule");
    on(slipBtn, "click", function () { slipDialog(p); });
    var hd1 = el("div", { "class": "sechead" }); hd1.appendChild(el("h2", { "class": "sechead-h" }, "Timeline")); hd1.appendChild(slipBtn);
    out.appendChild(hd1);
    out.appendChild(tl.node); wireMilestoneDiamonds(tl.node);
    var b = burnParts({ quest: p, wide: wide, level: "h2" });
    b.count.style.marginTop = "0";
    out.appendChild(b.h); out.appendChild(b.chart); out.appendChild(el("h2", null, "Stats")); out.appendChild(b.count);
  }
  return out;
}
