// Pre-commit content checks for Sidequest. Reads STAGED content (git index) for
// anything tracked; reads the WORKING-TREE FILESYSTEM DIRECTLY (mtime/content) for
// anything gitignored (CLAUDE.md, sentinel-notes/*), since git structurally cannot
// see a gitignored file's content, staged or not.
//
// Each check function returns a list of violation objects (possibly empty) and
// never throws for a normal violation -- only common.failLoud() throws, for a
// genuine internal error.

"use strict";
const path = require("path");
const common = require("./sentinel-common");

// ---------------------------------------------------------------------------
// Gate 1: CLAUDE.md-touched (highest priority)
// ---------------------------------------------------------------------------
// Trigger: staged index.html diff touches a "recurring unit of work" registry/area.
// CLAUDE.md is gitignored, so "was it touched" is answered by filesystem mtime
// versus the current HEAD commit time, not git diff --name-only.

const TRIGGER_PATTERNS = [
  { name: "CORE array (new view/page)", re: /^\+.*\bCORE\s*=/m },
  { name: "BOTTOM array (new view/page)", re: /^\+.*\bBOTTOM\s*=/m },
  { name: "defaults() (new state field)", re: /^\+.*\bfunction defaults\s*\(/m },
  { name: "normalize() (new state field)", re: /^\+.*\bfunction normalize\s*\(/m },
  { name: "renderView() dispatch (new view/page)", re: /^\+\s*(else )?if \(ui\.view ===/m },
  { name: "WORDS registry (new vocabulary)", re: /^\+.*\bWORDS\s*=/m },
  { name: "SEARCH_LABELS/SEARCH_ORDER (new searchable kind)", re: /^\+.*\bSEARCH_(LABELS|ORDER)\s*=/m },
  { name: "KIND_LABEL/KIND_FILTERS (new archivable kind)", re: /^\+.*\bKIND_(LABEL|FILTERS)\s*=/m },
  { name: "new xDialog() function (new UI feature)", re: /^\+\s*function \w*Dialog\s*\(/m },
];

function classifyIndexHtmlDiff(diffText) {
  if (!diffText) return [];
  return TRIGGER_PATTERNS.filter((p) => p.re.test(diffText)).map((p) => p.name);
}

function checkClaudeMdTouched() {
  const violations = [];
  if (!common.isStaged("index.html")) return violations;
  const diff = common.stagedDiff("index.html");
  const hits = classifyIndexHtmlDiff(diff);
  if (!hits.length) return violations;

  const exception = common.findException("claude-md-touched");
  if (exception) return violations;

  const claudeMdMtime = common.diskMTimeMs("CLAUDE.md");
  const headTime = common.headCommitTimeMs();
  const touchedSinceHead = claudeMdMtime !== null && headTime !== null && claudeMdMtime > headTime;

  if (!touchedSinceHead) {
    violations.push(
      common.violation(
        "claude-md-touched",
        "CLAUDE.md",
        null,
        `index.html diff touches: ${hits.join("; ")}. This looks like a new view/page, state field, or UI feature ` +
        `(the project's three recurring units of work), but CLAUDE.md has not been modified since the last commit. ` +
        `Does this change need a mention in CLAUDE.md's "Conventions established" or "What this project is" section? ` +
        `(CLAUDE.md is gitignored, so this check reads its file-modification time directly off disk, not from git.)`
      )
    );
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Gate 2: README-touched (+ optional keyword-mapping layer)
// ---------------------------------------------------------------------------
// README.md is TRACKED (not gitignored), so this one legitimately uses git diff.

const README_KEYWORDS = [
  "Today", "Schedule", "Projects", "Timeline", "Launch checklist", "Archive",
  "Search", "Help", "Settings",
];

function checkReadmeTouched() {
  const violations = [];
  if (!common.isStaged("index.html")) return violations;
  const diff = common.stagedDiff("index.html");
  const hits = classifyIndexHtmlDiff(diff);
  if (!hits.length) return violations;

  const exception = common.findException("readme-touched");
  if (exception) return violations;

  if (!common.isStaged("README.md")) {
    violations.push(
      common.violation(
        "readme-touched",
        "README.md",
        null,
        `index.html diff touches: ${hits.join("; ")}, which may be user-facing (a new view/page, feature, or control), ` +
        `but README.md was not part of this commit. If this change is user-visible, document it in README.md's ` +
        `"What it does" section.`
      )
    );
    return violations; // file-level check failed; keyword layer would be redundant noise on top of this
  }

  // Keyword-mapping second layer: if CORE/BOTTOM gained a new page-name literal in
  // this diff, require that literal string to appear somewhere in README's CURRENT
  // (staged) text. This is a presence check only -- it confirms a keyword exists,
  // not that the surrounding prose is accurate.
  const addedPageNames = [];
  const coreBottomAdd = /^\+.*\[\s*"([a-z0-9:_-]+)"\s*,\s*"([^"]+)"\s*\]/gim;
  let m;
  while ((m = coreBottomAdd.exec(diff || "")) !== null) {
    addedPageNames.push(m[2]);
  }
  if (addedPageNames.length) {
    const readmeText = common.stagedContent("README.md") || "";
    addedPageNames.forEach((label) => {
      if (!readmeText.includes(label)) {
        violations.push(
          common.violation(
            "readme-keyword-missing",
            "README.md",
            null,
            `A new page/label "${label}" was added to CORE or BOTTOM, but the literal string "${label}" does not ` +
            `appear anywhere in README.md's current text. This is a presence check only (it does not verify the ` +
            `surrounding prose is accurate) -- add a mention of "${label}" to README's "What it does" section.`
          )
        );
      }
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Gate 3: design document -- N/A for this project (no DESIGN.md exists, declined
// by the user). Deliberately not implemented. See report.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Gate 4: TODO.md completion-sync
// ---------------------------------------------------------------------------
// Hard check: a commit modifying a sentinel-notes/[issue]-design-brief.md file
// (in sentinel-notes/ or sentinel-notes/archive/) without a corresponding status
// change in sentinel-notes/TODO.md in the same commit. Both files are gitignored,
// so "was it touched in this commit" cannot be answered by git diff at all --
// there is no staged git-index version of a gitignored file to compare. Since a
// gitignored file is invisible to git regardless of hooks, this hard check instead
// treats "the working commit that's about to be made" as inseparable from
// "TODO.md's current mtime relative to the design-brief file's current mtime":
// if a design-brief file's mtime is newer than TODO.md's mtime, TODO.md was not
// updated after (or alongside) the brief, which is the structural signal available.
//
// This runs from pre-commit (not commit-msg) because it is a working-tree/disk
// state check, not something derivable from staged index.html content.

function listDesignBriefFiles() {
  const glob = require("child_process").execFileSync;
  let out;
  try {
    out = glob("git", ["ls-files", "--others", "--exclude-standard", "--cached", "--", "sentinel-notes"], {
      cwd: common.REPO_ROOT,
      encoding: "utf8",
    });
  } catch (e) {
    out = "";
  }
  // sentinel-notes/ is gitignored so `git ls-files --cached` returns nothing for it;
  // walk the filesystem directly instead.
  const fs = require("fs");
  const results = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    entries.forEach((ent) => {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/-design-brief\.md$/.test(ent.name)) results.push(full);
    });
  }
  walk(common.repoPath("sentinel-notes"));
  return results;
}

function checkTodoSync() {
  const violations = [];
  const exception = common.findException("todo-completion-sync");
  if (exception) return violations;

  const todoPath = path.join("sentinel-notes", "TODO.md");
  const todoMtime = common.diskMTimeMs(todoPath);
  const briefs = listDesignBriefFiles();

  // Only fire when there is at least one design-brief file whose mtime is newer
  // than TODO.md's mtime AND newer than HEAD's commit time -- i.e. it was edited
  // "just now" as part of preparing this commit, but TODO.md was not touched to match.
  const headTime = common.headCommitTimeMs();
  briefs.forEach((briefAbsPath) => {
    const relPath = path.relative(common.REPO_ROOT, briefAbsPath).split(path.sep).join("/");
    const briefMtime = common.diskMTimeMs(relPath);
    if (briefMtime === null) return;
    const briefEditedRecently = headTime !== null && briefMtime > headTime;
    if (!briefEditedRecently) return; // brief wasn't touched since the last commit; not this commit's concern
    const todoUpdatedAfterBrief = todoMtime !== null && todoMtime >= briefMtime;
    if (!todoUpdatedAfterBrief) {
      violations.push(
        common.violation(
          "todo-completion-sync",
          relPath,
          null,
          `${relPath} was modified since the last commit, but sentinel-notes/TODO.md was not updated at the same ` +
          `time (or was updated before it). This project's convention: a design-brief edit needs a matching status ` +
          `change in TODO.md's Open/Done sections in the same commit. (Both files are gitignored, so this is a ` +
          `filesystem-mtime comparison, not a git diff.)`
        )
      );
    }
  });
  return violations;
}

// Soft check (non-blocking reminder): plain one-line TODO items with no linked
// brief get a periodic nudge, not a hard rule -- there is no structural signal
// to check a plain line against. Returns a reminder string or null; never a
// blocking violation.
function todoBacklogReminder() {
  const raw = common.diskRead(path.join("sentinel-notes", "TODO.md"));
  if (!raw) return null;
  const openSection = raw.split(/^## Done/m)[0];
  const openItems = (openSection.match(/^-\s*\[ \]/gm) || []).length;
  if (!openItems) return null;
  return `${openItems} open TODO item(s) in sentinel-notes/TODO.md untouched since before this session started. (Non-blocking reminder.)`;
}

// ---------------------------------------------------------------------------
// normalize()/defaults() pairing check (persistence layer, highest-priority
// touchpoint category per the project's own Integration Audit)
// ---------------------------------------------------------------------------
// Structural rule: every top-level key assigned in defaults()'s returned object
// literal must have SOME corresponding reference inside normalize()'s function
// body (a "d.<key> = ..." assignment). This is deliberately a name-presence
// check within normalize()'s source text, not a full JS interpreter -- concrete
// and mechanical, per the prompt's own "translate vague adjectives into numeric/
// checkable rules" guidance, at the cost of being fooled by a key referenced only
// in an unrelated comment (accepted false-negative risk, documented in the report).

function extractDefaultsKeys(source) {
  const fnMatch = source.match(/function defaults\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\n/);
  if (!fnMatch) common.failLoud("could not locate defaults() function body in index.html to run the normalize/defaults pairing check");
  const body = fnMatch[1];
  // Find the object literal that's returned and pull ONLY its top-level "key:"
  // names -- a nested object literal (e.g. settings: { theme: ..., ... }) has its
  // own keys, which are a different, nested pairing concern (normalize() pairs
  // them via s.settings.<key> / d.settings.<key>, not d.<key>) and must not be
  // treated as top-level defaults() keys, or every nested key false-positives here.
  const returnMatch = body.match(/return\s*\{([\s\S]*)\};\s*$/);
  if (!returnMatch) common.failLoud("could not locate defaults()'s return object literal to run the normalize/defaults pairing check");
  const objLiteral = returnMatch[1];
  const keys = new Set();
  const keyRe = /(^|,|\n)\s*([A-Za-z_$][\w$]*)\s*:/g;
  let m;
  while ((m = keyRe.exec(objLiteral)) !== null) {
    const keyStart = m.index + m[0].length; // position right after the matched "key:"
    // Depth of THIS key's position within the object literal: count unmatched
    // braces/brackets before it. Depth 0 means top-level (directly inside the
    // outer {...} the regex is already scoped to); anything deeper is nested.
    let depth = 0;
    for (let i = 0; i < m.index; i++) {
      const c = objLiteral[i];
      if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") depth--;
    }
    if (depth === 0) keys.add(m[2]);
  }
  return keys;
}

function extractNormalizeBody(source) {
  const fnMatch = source.match(/function normalize\s*\(\s*s\s*\)\s*\{([\s\S]*?)\n  \}\n/);
  if (!fnMatch) common.failLoud("could not locate normalize() function body in index.html to run the normalize/defaults pairing check");
  return fnMatch[1];
}

function checkNormalizeDefaultsPairing() {
  const violations = [];
  if (!common.isStaged("index.html")) return violations;
  const source = common.stagedContent("index.html");
  if (source === null) return violations; // index.html deleted in this commit; nothing to pair

  let defaultsKeys, normalizeBody;
  try {
    defaultsKeys = extractDefaultsKeys(source);
    normalizeBody = extractNormalizeBody(source);
  } catch (e) {
    // failLoud already set exitCode/threw; re-throw so the caller sees it as a hard failure.
    throw e;
  }

  const exception = common.findException("normalize-defaults-pairing");

  defaultsKeys.forEach((key) => {
    // A key is "paired" if normalize() references d.<key> anywhere in its body
    // (an assignment branch), OR the key is one of the handful whose value is
    // always taken unconditionally from a fresh defaults() call inside normalize
    // itself (e.g. "v" -- a version stamp that is deliberately never overridden
    // by saved data). That second case is content-keyed (an explicit allowlist
    // of key NAMES, not positions), and is the one legitimate reason a defaults()
    // key has no normalize() branch.
    const INTENTIONALLY_UNPAIRED = new Set(["v"]);
    if (INTENTIONALLY_UNPAIRED.has(key)) return;

    const refRe = new RegExp("\\bd\\." + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    if (refRe.test(normalizeBody)) return;

    if (exception && exception.scope === key) return;

    violations.push(
      common.violation(
        "normalize-defaults-pairing",
        "index.html",
        null,
        `defaults() sets a top-level key "${key}" but normalize() has no branch referencing "d.${key}". If this key ` +
        `is new, saved data from before it existed will silently revert "${key}" to its default on every load, ` +
        `permanently, for every existing user -- add a validated normalize() branch for it (or, if this key is ` +
        `deliberately never restored from saved data, add it to the INTENTIONALLY_UNPAIRED allowlist in ` +
        `.githooks/lib/check-pre-commit.js with a comment explaining why).`
      )
    );
  });

  return violations;
}

// ---------------------------------------------------------------------------
// Hardcoded-hex-outside-token-block check
// ---------------------------------------------------------------------------
// Real precedent: the logo-color-tokenization fix (sentinel-notes/archive/
// logo-color-tokenization-design-brief.md) -- hex values that duplicated existing
// tokens were hardcoded outside the :root block. This check flags a NEW hex color
// literal added outside the :root/dark-theme token blocks, added by a `git diff`
// added-lines scan (only additions are new risk here; existing hex use is the
// known, accepted baseline handled in Part 4).
//
// Exclusion, justified per-rule: assets/sidequest-icon.svg is EXCLUDED from this
// rule specifically, because it is a static, favicon-shaped asset that cannot
// reference CSS custom properties at all (per CLAUDE.md's "Known accepted gaps").
// That file is excluded from THIS rule only -- it is not given a blanket
// exclusion from other checks.

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;

function isInsideTokenBlock(fullText, matchIndex) {
  // Token blocks: the :root { ... } block and the two dark-theme override blocks.
  // Find the nearest enclosing brace pair that starts with one of those selectors.
  const before = fullText.slice(0, matchIndex);
  const rootOpen = before.lastIndexOf(":root");
  if (rootOpen === -1) return false;
  const braceOpen = fullText.indexOf("{", rootOpen);
  if (braceOpen === -1 || braceOpen > matchIndex) return false;
  // crude brace-depth scan from braceOpen to matchIndex to confirm we're still inside
  let depth = 0;
  for (let i = braceOpen; i < matchIndex; i++) {
    if (fullText[i] === "{") depth++;
    else if (fullText[i] === "}") depth--;
    if (depth <= 0 && i > braceOpen) return false; // block closed before matchIndex
  }
  return depth > 0;
}

function checkHardcodedHex() {
  const violations = [];
  if (!common.isStaged("index.html")) return violations;
  const diff = common.stagedDiff("index.html") || "";
  const addedLines = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const source = common.stagedContent("index.html") || "";

  const exception = common.findException("hardcoded-hex-outside-tokens");

  addedLines.forEach((line) => {
    const content = line.slice(1);
    let m;
    HEX_COLOR_RE.lastIndex = 0;
    while ((m = HEX_COLOR_RE.exec(content)) !== null) {
      // Confirm this literal hex actually lands outside a token block in the FULL
      // staged file (the diff line alone has no block context) by locating one
      // occurrence of the same literal text outside a :root block anywhere in source.
      const literal = m[0];
      const occursOutsideToken = (() => {
        const re = new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        let mm;
        while ((mm = re.exec(source)) !== null) {
          if (!isInsideTokenBlock(source, mm.index)) return true;
        }
        return false;
      })();
      if (!occursOutsideToken) continue;
      if (exception && exception.scope === literal) continue;
      violations.push(
        common.violation(
          "hardcoded-hex-outside-tokens",
          "index.html",
          null,
          `Added line introduces a literal hex color "${literal}" outside the :root token block: "${content.trim().slice(0, 80)}". ` +
          `Reference an existing --token or add a new one instead, per the project's design-token convention. ` +
          `(assets/sidequest-icon.svg is exempt from this rule -- it is a static favicon asset that cannot use CSS ` +
          `custom properties -- but index.html is not.)`
        )
      );
    }
  });
  return violations;
}

// ---------------------------------------------------------------------------
// Duplicated-icon/SVG-markup check
// ---------------------------------------------------------------------------
// Real precedent: the search-icon duplication fix (sentinel-notes/TODO.md Done
// section, search-icon-dedup) -- a static inline SVG duplicated markup that a JS
// constant (ICON_SEARCH/ICON_CANCEL) already produced at render time. This check
// flags a newly-added static inline <svg>...</svg> block in index.html's HTML body
// whose path/d data exactly matches an existing ICON_* JS string constant's path
// data -- a mechanical, content-keyed duplication signal, not a broad "no two SVGs
// look similar" heuristic (which would be far too noisy against a file with many
// legitimate distinct icons).

function extractIconConstants(source) {
  const iconVarRe = /var\s+(ICON_\w+)\s*=\s*'([^']*)'/g;
  const icons = {};
  let m;
  while ((m = iconVarRe.exec(source)) !== null) icons[m[1]] = m[2];
  return icons;
}

function extractPathData(svgMarkup) {
  const pathRe = /\bd="([^"]+)"/g;
  const out = [];
  let m;
  while ((m = pathRe.exec(svgMarkup)) !== null) out.push(m[1]);
  return out;
}

function checkDuplicatedIconMarkup() {
  const violations = [];
  if (!common.isStaged("index.html")) return violations;
  const diff = common.stagedDiff("index.html") || "";
  const source = common.stagedContent("index.html") || "";
  const icons = extractIconConstants(source);
  const knownPathData = new Set();
  Object.keys(icons).forEach((k) => extractPathData(icons[k]).forEach((d) => knownPathData.add(d)));
  if (!knownPathData.size) return violations;

  const addedText = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
  const addedSvgBlocks = addedText.match(/<svg\b[^]*?<\/svg>/g) || [];
  addedSvgBlocks.forEach((block) => {
    const pathData = extractPathData(block);
    pathData.forEach((d) => {
      if (knownPathData.has(d)) {
        violations.push(
          common.violation(
            "duplicated-icon-markup",
            "index.html",
            null,
            `A newly-added static <svg> block's path data exactly matches an existing ICON_* JS constant's path data ` +
            `("${d.slice(0, 40)}..."). This is the same shape as the search-icon duplication bug fixed on 2026-09-21 ` +
            `(sentinel-notes/TODO.md, search-icon-dedup) -- render it from the JS constant at render time instead of ` +
            `hardcoding a second static copy.`
          )
        );
      }
    });
  });
  return violations;
}

// ---------------------------------------------------------------------------
// Social meta description drift check
// ---------------------------------------------------------------------------
// index.html's <meta property="og:description"> was deliberately copied from
// README.md's opening paragraph (minus its trailing "Open index.html and start"
// sentence, which doesn't belong in a social share preview). This is a real,
// separate drift risk from the general README-touched gate above: og:description
// is a hardcoded literal duplicating README prose, and nothing else re-derives
// it, so a future README rewrite can silently leave the social preview stale.
//
// This is a presence/prefix check, not a semantic-accuracy check: it confirms
// og:description's exact text still appears as the leading portion of README's
// current opening paragraph, not that the two are still "about the same thing"
// in some looser sense. If the wording is deliberately shortened or reworded on
// either side, this check needs updating along with it, same as any other
// content-keyed check in this file.

function extractOgDescription(source) {
  const m = source.match(/<meta\s+property="og:description"\s+content="([^"]*)"/);
  return m ? m[1] : null;
}

function extractReadmeOpeningParagraph(readmeText) {
  // First non-heading, non-blank paragraph line.
  const lines = readmeText.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith("#")) return t;
  }
  return null;
}

function checkSocialMetaDrift() {
  const violations = [];
  const touchesIndex = common.isStaged("index.html");
  const touchesReadme = common.isStaged("README.md");
  if (!touchesIndex && !touchesReadme) return violations;

  const exception = common.findException("social-meta-drift");
  if (exception) return violations;

  const indexSource = common.stagedContent("index.html");
  const readmeSource = common.stagedContent("README.md");
  if (indexSource === null || readmeSource === null) return violations; // one of the files was deleted in this commit

  const ogDesc = extractOgDescription(indexSource);
  if (ogDesc === null) return violations; // no og:description tag present; nothing to check

  const readmeOpening = extractReadmeOpeningParagraph(readmeSource);
  if (readmeOpening === null || !readmeOpening.startsWith(ogDesc)) {
    violations.push(
      common.violation(
        "social-meta-drift",
        "index.html",
        null,
        `index.html's <meta property="og:description"> content ("${ogDesc.slice(0, 60)}...") no longer matches the ` +
        `start of README.md's opening paragraph. This tag was deliberately copied from README's intro so shared links ` +
        `show an accurate description -- update og:description to match README's current wording (it can be a ` +
        `shortened prefix of the README sentence, but must start the same way).`
      )
    );
  }
  return violations;
}

// ---------------------------------------------------------------------------
// npm test gate
// ---------------------------------------------------------------------------
// This runs the actual test suite. It is intentionally the LAST check run (see
// pre-commit hook), since it is the slowest, and every other check is cheap by
// comparison -- fail fast on the cheap checks first.

function runNpmTest() {
  const { spawnSync } = require("child_process");
  const result = spawnSync(process.execPath, [common.repoPath("tests", "run.js")], {
    cwd: common.REPO_ROOT,
    encoding: "utf8",
  });
  const violations = [];
  if (result.status !== 0) {
    violations.push(
      common.violation(
        "npm-test-failing",
        "tests/",
        null,
        "`npm test` (tests/run.js) did not pass. Fix the failing assertions before committing.\n" +
        (result.stdout || "").split("\n").slice(-20).join("\n")
      )
    );
  }
  return violations;
}

module.exports = {
  classifyIndexHtmlDiff,
  checkClaudeMdTouched,
  checkReadmeTouched,
  checkTodoSync,
  todoBacklogReminder,
  checkNormalizeDefaultsPairing,
  extractDefaultsKeys,
  extractNormalizeBody,
  checkHardcodedHex,
  checkDuplicatedIconMarkup,
  checkSocialMetaDrift,
  runNpmTest,
  README_KEYWORDS,
};
