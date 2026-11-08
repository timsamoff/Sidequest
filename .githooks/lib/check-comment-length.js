// Comment-length check: a comment is one or two sentences. Longer background goes in CLAUDE.md, not in the code. Directives, commented-out code, and data are exempt.

"use strict";

const common = require("./sentinel-common");
const checks = require("./check-pre-commit");

const MAX_SENTENCES = 2;

// Pragmas, shebangs, license headers, and build magic comments are not prose.
const DIRECTIVE_RE = /^(?:eslint|prettier|istanbul|c8|@ts-|#!|!|global\s|jshint|webpack|copyright|license|spdx|\/\/#)/i;

function stripMarkers(line) {
  return line.trim().replace(/^<!--/, "").replace(/-->$/, "").replace(/^\/\*+/, "").replace(/\*+\/$/, "").replace(/^\*+/, "").replace(/^\/\/+/, "").trim();
}

// Commented-out code or data (a quoted phrase, a CSS declaration, a tag) is not a sentence.
function looksLikeCode(text) {
  return /^["'`<{}.#@]/.test(text) || /^[\w-]+\s*:\s*[^;]+;\s*$/.test(text) || /^(?:var|let|const|function|import|export|return|if|for)\b/.test(text);
}

// Contiguous comment blocks as { line, lines: [..] }, line being the 1-based first line.
function commentBlocks(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (/^\/\//.test(t)) {
      const start = i;
      while (i < lines.length && /^\/\//.test(lines[i].trim())) i++;
      blocks.push({ line: start + 1, lines: lines.slice(start, i) });
      continue;
    }
    const open = t.startsWith("/*") ? "/*" : t.startsWith("<!--") ? "<!--" : null;
    if (open) {
      const close = open === "/*" ? "*/" : "-->";
      const start = i;
      while (i < lines.length && !lines[i].includes(close)) i++;
      i = Math.min(i + 1, lines.length);
      blocks.push({ line: start + 1, lines: lines.slice(start, i) });
      continue;
    }
    i++;
  }
  return blocks;
}

function countSentences(text) {
  const flat = text
    .replace(/\b(?:e\.g|i\.e|vs|etc|approx)\./gi, (m) => m.replace(/\./g, ""))
    .replace(/\.{2,}/g, " ")
    .replace(/`[^`]*`/g, "x");
  return flat.split(/[.!?](?:\s+|$)/).filter((s) => /\w/.test(s)).length;
}

// Blocks in a source string that run past the limit, with their sentence count.
function overlongBlocks(source) {
  const out = [];
  commentBlocks(source).forEach((b) => {
    const parts = b.lines.map(stripMarkers).filter(Boolean);
    if (!parts.length) return;
    const text = parts.join(" ");
    if (DIRECTIVE_RE.test(parts[0]) || looksLikeCode(parts[0])) return;
    if (b.lines.some((l) => /^\s*\/\/\s*["'`]/.test(l))) return;
    const n = countSentences(text);
    if (n > MAX_SENTENCES) out.push({ line: b.line, count: n, text });
  });
  return out;
}

function addedLineNumbers(diff) {
  const added = new Set();
  let cur = 0;
  (diff || "").split("\n").forEach((l) => {
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { cur = parseInt(h[1], 10); return; }
    if (l.startsWith("+++") || l.startsWith("---")) return;
    if (l.startsWith("+")) { added.add(cur); cur++; }
    else if (!l.startsWith("-")) cur++;
  });
  return added;
}

function message(count, text) {
  return `Comment runs ${count} sentences (the limit is ${MAX_SENTENCES}): "${text.slice(0, 90)}". Cut it to one or two sentences and put the background in CLAUDE.md.`;
}

// Diff-scoped: only blocks that contain a line this commit added.
function checkCommentLength() {
  const violations = [];
  const exception = common.findException("comment-length");
  checks.COMMENT_SCAN_FILES.forEach((file) => {
    if (!common.isStaged(file)) return;
    if (exception && exception.scope === file) return;
    const source = common.stagedContent(file);
    if (!source) return;
    const added = addedLineNumbers(common.stagedDiff(file));
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    overlongBlocks(source).forEach((b) => {
      const span = lines.slice(b.line - 1).findIndex((l, k) => k > 0 && !/^\s*(?:\/\/|\*|\/\*|<!--)/.test(l) && !l.includes("*/") && !l.includes("-->"));
      const end = b.line + (span === -1 ? lines.length : span) - 1;
      for (let n = b.line; n <= end; n++) {
        if (added.has(n)) { violations.push(common.violation("comment-length", file, b.line, message(b.count, b.text))); return; }
      }
    });
  });
  return violations;
}

function fullScanCommentLength() {
  const violations = [];
  checks.COMMENT_SCAN_FILES.forEach((file) => {
    const source = common.diskRead(file);
    if (!source) return;
    overlongBlocks(source).forEach((b) => violations.push(common.violation("comment-length", file, b.line, message(b.count, b.text))));
  });
  return violations;
}

module.exports = { MAX_SENTENCES, commentBlocks, countSentences, overlongBlocks, checkCommentLength, fullScanCommentLength };
