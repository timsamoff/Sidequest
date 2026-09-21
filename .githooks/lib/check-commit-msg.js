// Commit message convention checks for Sidequest.
// House style (confirmed 2026-09-21): terse single-line summary, no Conventional
// Commits prefix, no body unless truly necessary, no co-author notes.
//
// Numeric thresholds below are Sentinel's own suggested defaults (per
// 03-gate-check-implementation.md Part 2's fallback guidance), NOT something the
// user confirmed live in this run. Flagged in the implementation report as
// adjustable.
//
//   SUBJECT_MAX        = 72   (subject-line character cap; prompt's suggested 50-72 range)
//   BULLET_MAX_COUNT    = 5    (prompt's suggested default)
//   BULLET_LINE_MAX     = 80   (single physical line cap for a bullet)
//   BULLET_WRAP_MAX     = 160  (combined cap across a bullet's 2 allowed physical lines)

"use strict";

const SUBJECT_MAX = 72;
const BULLET_MAX_COUNT = 5;
const BULLET_LINE_MAX = 80;
const BULLET_WRAP_MAX = 160;

// Attribution/co-author stripping is unconditional -- never exempt, never a warning.
// Matches Claude Code's known attribution lines and generic co-author trailers.
const ATTRIBUTION_PATTERNS = [
  /Generated with \[?Claude Code\]?/i,
  /Co-Authored-By:\s*Claude/i,
  /^Claude-Session:/im,
  /^Co-authored-by:/im, // generic co-author trailer, any tool -- house style is "no co-author notes" full stop
];

function findAttribution(message) {
  const hits = [];
  ATTRIBUTION_PATTERNS.forEach((re) => {
    const m = message.match(re);
    if (m) hits.push(m[0]);
  });
  return hits;
}

function splitMessage(message) {
  // Normalize line endings, drop a trailing newline, strip comment lines (# ...)
  // the way git itself does before it ever gets to a message body.
  const lines = message.replace(/\r\n/g, "\n").split("\n").filter((l) => !l.startsWith("#"));
  // Drop trailing blank lines
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

// Returns { violations: [...] } -- never throws for a normal bad message, only for
// an internal error (per the fail-loud rule).
function checkCommitMessage(rawMessage) {
  const violations = [];
  if (typeof rawMessage !== "string") {
    violations.push({ rule: "commit-msg-internal", message: "commit message could not be read as text" });
    return { violations };
  }

  // Attribution stripping -- unconditional, checked first, never exempt.
  const attribution = findAttribution(rawMessage);
  if (attribution.length) {
    violations.push({
      rule: "attribution-stripped",
      message:
        "Commit message contains an attribution/co-author line (" + attribution.join(", ") +
        "). This project's convention is no co-author notes, ever -- remove it and recommit.",
    });
  }

  const lines = splitMessage(rawMessage);
  if (!lines.length || lines.every((l) => l.trim() === "")) {
    violations.push({ rule: "commit-msg-empty", message: "Commit message is empty." });
    return { violations };
  }

  const subject = lines[0];
  if (subject.length > SUBJECT_MAX) {
    violations.push({
      rule: "subject-too-long",
      message: `Subject line is ${subject.length} characters; house style caps it at ${SUBJECT_MAX}. Shorten it to one terse line.`,
    });
  }
  if (/^\w+(\(.+\))?:\s/.test(subject)) {
    // Conventional-Commits-style prefix, e.g. "feat(x): ..." -- explicitly not this project's style.
    violations.push({
      rule: "no-conventional-commits",
      message: "Subject line looks like a Conventional Commits prefix (e.g. \"feat: \"). This project's style has no such prefix -- use a plain terse summary.",
    });
  }

  const bodyLines = lines.slice(1);
  // A commit with nothing more to say has no body at all -- a single blank line
  // separator with nothing after it is fine (git's own convention); real content
  // after that blank line is what gets scrutinized below.
  const bodyContent = bodyLines.filter((l, i) => !(i === 0 && l.trim() === ""));
  // Known trailer lines (e.g. "Sentinel-Override: <reason>") are a separate
  // structural element, not narrative body prose or a bullet -- exclude them from
  // the bullet-structure scan before checking it, or a trailer with no "- " marker
  // would otherwise misreport as a narrative-body violation.
  const TRAILER_RE = /^(Sentinel-Override|Claude-Session|Co-Authored-By|Co-authored-by):/;
  const contentLines = bodyContent.filter((l) => l.trim() !== "" && !TRAILER_RE.test(l.trim()));
  if (!contentLines.length) {
    return { violations }; // subject-only commit (plus maybe only trailers): the common, clean case.
  }

  // There IS a body. House style: "no body unless truly necessary" -- when a body
  // is present, it must be bullet-structured, never narrative prose.
  const BULLET_RE = /^-\s+\S/; // "- " marker followed by real content
  const CONT_RE = /^\s{2,}\S/; // indented continuation line, no marker

  // Group physical lines into logical bullets.
  const bullets = []; // { lines: [str, str?] }
  let i = 0;
  while (i < contentLines.length) {
    const line = contentLines[i];
    if (BULLET_RE.test(line)) {
      const bullet = { lines: [line] };
      // Allow exactly one indented continuation line with no marker.
      if (i + 1 < contentLines.length && CONT_RE.test(contentLines[i + 1]) && !BULLET_RE.test(contentLines[i + 1])) {
        bullet.lines.push(contentLines[i + 1]);
        i += 2;
      } else {
        i += 1;
      }
      // A third line under the same bullet (another unmarked continuation
      // immediately following) is NOT allowed -- catch it explicitly rather than
      // silently absorbing it, so a 3-line-wrapped bullet is flagged, not accepted.
      if (i < contentLines.length && CONT_RE.test(contentLines[i]) && !BULLET_RE.test(contentLines[i])) {
        violations.push({
          rule: "bullet-wrap-too-long",
          message: `A bullet body wraps onto a 3rd physical line ("${contentLines[i].trim().slice(0, 60)}..."). Bullets may wrap once (2 physical lines total), not more -- this is the exact "cap satisfied, structure defeated" shape the wrap allowance must not permit.`,
        });
        i += 1; // consume it so it doesn't get treated as a new (unmarked) bullet too
      }
      bullets.push(bullet);
    } else if (CONT_RE.test(line)) {
      // An indented line with no preceding bullet marker on this line and no bullet
      // immediately before it, OR a continuation-shaped line appearing where a new
      // bullet was expected -- this is unmarked narrative wearing indentation.
      violations.push({
        rule: "narrative-body-unmarked-continuation",
        message: `Line "${line.trim().slice(0, 60)}..." is indented like a bullet continuation but has no bullet marker ("- ") starting its own bullet. Every logical bullet must start with "- ".`,
      });
      i += 1;
    } else {
      // A body line with no bullet marker at all -- narrative prose, the thing this
      // rule exists to hard-block. This is the case the numeric-cap-alone approach
      // would miss: several short unmarked lines under any length cap, forming one
      // continuous narrative block with no marker on any line.
      violations.push({
        rule: "narrative-body-hard-block",
        message: `Body line "${line.trim().slice(0, 60)}..." has no bullet marker. This project's style has no body at all for the common case, and a bullet list (not prose) for the rare case that needs one -- every body line must start with "- ".`,
      });
      i += 1;
    }
  }

  // Structural checks per bullet: marker present, line-length cap, wrap combined cap.
  bullets.forEach((b) => {
    const first = b.lines[0];
    if (first.length > BULLET_LINE_MAX && b.lines.length === 1) {
      violations.push({
        rule: "bullet-line-too-long",
        message: `Bullet "${first.trim().slice(0, 50)}..." is ${first.length} characters; single-line bullets are capped at ${BULLET_LINE_MAX}. Wrap it onto one indented continuation line, or shorten it.`,
      });
    }
    if (b.lines.length === 2) {
      const combined = b.lines.join(" ").length;
      if (combined > BULLET_WRAP_MAX) {
        violations.push({
          rule: "bullet-wrap-combined-too-long",
          message: `A wrapped 2-line bullet totals ${combined} characters across both lines; the combined cap is ${BULLET_WRAP_MAX}, even though each individual physical line may be under ${BULLET_LINE_MAX}. Shorten the bullet -- wrapping is not a loophole for a mini-paragraph.`,
        });
      }
    }
  });

  // Bullet count cap -- hard block unless a Sentinel-Override trailer is present with a reason.
  const overrideMatch = rawMessage.match(/^Sentinel-Override:\s*(.+)$/im);
  if (bullets.length > BULLET_MAX_COUNT && !overrideMatch) {
    violations.push({
      rule: "bullet-count-exceeded",
      message:
        `Does this commit bundle together several separate things? Consider splitting it. ` +
        `This commit has ${bullets.length} bullets; house style caps it at ${BULLET_MAX_COUNT}. ` +
        `If this genuinely is one coherent unit of work, add a trailer "Sentinel-Override: <reason>" explaining why, and recommit.`,
    });
  }

  return { violations, overrideReason: overrideMatch ? overrideMatch[1].trim() : null };
}

module.exports = { checkCommitMessage, SUBJECT_MAX, BULLET_MAX_COUNT, BULLET_LINE_MAX, BULLET_WRAP_MAX, ATTRIBUTION_PATTERNS };
