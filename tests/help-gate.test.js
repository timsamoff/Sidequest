// Tests for the Help drift reminder (.githooks/lib/check-help-drift.js). These cover
// the pure parts: label extraction, hunk/range logic, and the reminder decision.
// The git-reading wrapper is exercised for real by the pre-commit hook itself.
const gate = require("../.githooks/lib/check-help-drift.js");

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- reading a button's visible label off one line ---- */
const L = gate.controlLabelsFromLine;
ok(same(L('    var rm = el("button", { type: "button", "class": "small danger", title: "Archive this idea" }, "Archive");'), ["Archive"]), "label is the last argument, not the tooltip");
ok(same(L('acts.appendChild(on(el("button", { type: "button", title: "Open in Tasks" }, "Open task"), "click", function () { openTask(t.id); }));'), ["Open task"]), 'the "click" event name is not a label');
ok(same(L('el("button", { type: "button", "aria-pressed": pinned ? "true" : "false", title: "x" }, pinned ? "Unpin" : "Pin")'), ["Unpin", "Pin"]), "both sides of a toggled label are found, attribute strings are not");
ok(same(L('el("button", { type: "button", "aria-label": "Show: " + s.text, title: "Add to " + n }, s.launch ? "Cut from Launch" : "Add to Launch")'), ["Cut from Launch", "Add to Launch"]), "concatenated attribute strings are ignored");
ok(same(L('            <button type="button" role="menuitem" data-act="newTask" title="Add a new task">New task</button>'), ["New task"]), "an HTML button's text is its label");
ok(same(L('  var x = compute(a, b); // no controls here'), []), "a line with no button has no labels");

/* ---- which labels genuinely changed in a diff ---- */
const d = (...lines) => lines.join("\n");
ok(same(gate.changedLabels(d('-    el("button", { type: "button" }, "Open")', '+    el("button", { type: "button" }, "View")')).sort(), ["Open", "View"]), "renaming a label is a change");
ok(gate.changedLabels(d('-    el("button", { title: "Old tip" }, "Archive")', '+    el("button", { title: "New tip" }, "Archive")')).length === 0, "editing only a tooltip is not a label change");
ok(gate.changedLabels(d('-    acts.appendChild(el("button", {}, "Restore"));', '+    acts.appendChild(el("button", {}, "Restore"));', '+    other();')).length === 0, "a moved or reformatted line with the same label is not a change");
ok(same(gate.changedLabels(d('+    el("button", {}, "Reopen")')), ["Reopen"]), "a brand new button is a change");
ok(gate.changedLabels(d("--- a/app/views.js", "+++ b/app/views.js")).length === 0, "diff file headers are ignored");
ok(gate.changedLabels("").length === 0 && gate.changedLabels(undefined).length === 0, "an empty diff has no changes");

/* ---- new Settings control ---- */
ok(gate.addsSettingsControl('+  var ss = el("select", { id: "set-splash", "class": "plain" });'), "an added element with a set- id is a new Settings control");
ok(!gate.addsSettingsControl('-  var ss = el("select", { id: "set-splash" });'), "removing one is not flagged as a new control");
ok(!gate.addsSettingsControl('+  var x = el("select", { id: "proj-name" });'), "other ids are not Settings controls");

/* ---- locating helpTopics() and whether a diff touched it ---- */
const source = ["line1", "line2", "export function helpTopics() {", "  return [", "    [\"A\", [\"a\"]],", "  ];", "}", "line8", "line9"].join("\n");
const r = gate.helpRange(source);
ok(r && r.start === 3 && r.end === 7, "helpTopics() range is found (" + JSON.stringify(r) + ")");
ok(gate.helpRange("nothing here") === null, "no helpTopics() means no range");
ok(same(gate.newSideHunks("@@ -5,2 +5,3 @@\n@@ -9 +10 @@\n@@ -4,1 +4,0 @@"), [{ start: 5, end: 7, deletion: false }, { start: 10, end: 10, deletion: false }, { start: 4, end: 4, deletion: true }]), "hunk headers parse, including omitted counts and pure deletions");
ok(gate.helpTouched("@@ -5 +5 @@\n", source), "a hunk inside helpTopics() counts as touching Help");
ok(!gate.helpTouched("@@ -1 +1 @@\n@@ -9 +9 @@\n", source), "hunks outside helpTopics() do not");
ok(gate.helpTouched("@@ -6,1 +5,0 @@\n", source), "a deletion inside helpTopics() counts");
ok(!gate.helpTouched("", source) && !gate.helpTouched("@@ -5 +5 @@\n", "no help here"), "no diff, or no helpTopics(), is not touched");

/* ---- the reminder decision ---- */
const base = (over) => Object.assign({ diffs: {}, triggerHits: [], viewsSource: source }, over);
ok(gate.buildReminder(base({})) === null, "no UI change gives no reminder");
const labelChange = { "app/views.js": d('-    el("button", {}, "Open")', '+    el("button", {}, "View")', "@@ -1 +1 @@") };
ok(/button label changed \("Open", "View"\)|button label changed \("View", "Open"\)/.test(gate.buildReminder(base({ diffs: labelChange })) || ""), "a label change gives a reminder naming the labels");
ok(gate.buildReminder(base({ diffs: { "app/dialogs.js": d('+    el("button", {}, "Cancel")') } })) !== null, "a label change in dialogs.js also counts");
ok(/new xDialog/.test(gate.buildReminder(base({ triggerHits: ["new xDialog() function (new UI feature)"] })) || ""), "a new-feature trigger from the existing gate gives a reminder");
ok(/new Settings control/.test(gate.buildReminder(base({ diffs: { "app/views.js": '+  el("input", { id: "set-x" })\n@@ -1 +1 @@' } })) || ""), "a new Settings control gives a reminder");
const withHelp = { "app/views.js": d('-    el("button", {}, "Open")', '+    el("button", {}, "View")', "@@ -1 +1 @@", "@@ -5 +5 @@") };
ok(gate.buildReminder(base({ diffs: withHelp })) === null, "the reminder stays quiet when the same commit changes helpTopics()");
const many = { "app/views.js": Array.from({ length: 8 }, (_, i) => '+    el("button", {}, "Label' + i + '")').join("\n") + "\n@@ -1 +1 @@" };
ok(/and 3 more/.test(gate.buildReminder(base({ diffs: many })) || ""), "a long list of labels is trimmed to five");
ok(/Non-blocking/.test(gate.buildReminder(base({ triggerHits: ["x"] })) || ""), "the reminder says plainly it is non-blocking and cannot check accuracy");

console.log(fails ? "\n" + fails + " FAILED" : "\nALL PASSED");
process.exit(fails ? 1 : 0);
