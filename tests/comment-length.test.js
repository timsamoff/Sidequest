// Tests for the comment-length gate (.githooks/lib/check-comment-length.js): sentence counting, block detection, and exemptions.
const gate = require("../.githooks/lib/check-comment-length.js");

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const n = (s) => gate.overlongBlocks(s).length;

ok(n("// One. Two.\nvar a;") === 0, "two sentences pass");
ok(n("// One. Two. Three.\nvar a;") === 1, "three sentences in // lines fail");
ok(n("// One.\n// Two.\n// Three.\nvar a;") === 1, "consecutive // lines count as one comment");
ok(n("/* a.\n * b.\n * c. */") === 1, "a block comment is counted as a whole");
ok(n("<!-- a. b. c. -->") === 1, "an HTML comment is counted");
ok(n("// e.g. this, i.e. that. Two.") === 0, "abbreviations do not end a sentence");
ok(n("// 1.125rem and 2.5 are numbers. ok") === 0, "decimals do not end a sentence");
ok(n("// eslint-disable-next-line a. b. c.") === 0, "directives are exempt");
ok(n('// "one. two. three."') === 0, "commented-out data is exempt");
ok(n("// `a. b. c.` is code. Done.") === 0, "inline code is not counted");
ok(gate.countSentences("What? Yes! Fine.") === 3, "? and ! end sentences");
ok(gate.fullScanCommentLength().length === 0, "no comment in the repo runs past the limit");

console.log(fails ? fails + " failed" : "all passed");
process.exitCode = fails ? 1 : 0;
