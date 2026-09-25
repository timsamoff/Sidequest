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
// Trigger: staged diff of one of the app's source files touches a "recurring
// unit of work" registry/area. CLAUDE.md is gitignored, so "was it touched" is
// answered by filesystem mtime versus the current HEAD commit time, not
// git diff --name-only.
//
// Post-JS-split (Phase 2, 2026-09-21): the logic that used to live in one
// index.html <script> block is now spread across app/*.js modules. Each pattern
// below is checked against every file in SOURCE_FILES, not just index.html --
// index.html itself is kept in the list since a future change could still touch
// markup-level registries there (e.g. new static nav markup), and dropping it
// would silently stop checking it.

const SOURCE_FILES = [
  "index.html",
  "app/app.js",
  "app/state.js",
  "app/model.js",
  "app/dom.js",
  "app/views.js",
  "app/dialogs.js",
  "app/search.js",
  "app/chart.js",
];

const TRIGGER_PATTERNS = [
  { name: "CORE array (new view/page)", re: /^\+.*\bCORE\s*=/m },
  { name: "BOTTOM array (new view/page)", re: /^\+.*\bBOTTOM\s*=/m },
  { name: "defaults() (new state field)", re: /^\+.*\bfunction defaults\s*\(/m },
  { name: "normalize() (new state field)", re: /^\+.*\bfunction normalize\s*\(/m },
  { name: "renderView() dispatch (new view/page)", re: /^\+\s*(else )?if \(ui\.view ===/m },
  { name: "WORDS registry (new vocabulary)", re: /^\+.*\bWORDS\s*=/m },
  { name: "SEARCH_LABELS/SEARCH_ORDER (new searchable kind)", re: /^\+.*\bSEARCH_(LABELS|ORDER)\s*=/m },
  { name: "KIND_LABEL/KIND_FILTERS (new archivable kind)", re: /^\+.*\bKIND_(LABEL|FILTERS)\s*=/m },
  { name: "new xDialog() function (new UI feature)", re: /^\+\s*(export )?function \w*Dialog\s*\(/m },
];

// Kept for any external caller (e.g. tests) that still names this function
// against a single diff string -- callers within this file use
// classifySourceDiffs() below, which checks every SOURCE_FILES entry.
function classifyIndexHtmlDiff(diffText) {
  if (!diffText) return [];
  return TRIGGER_PATTERNS.filter((p) => p.re.test(diffText)).map((p) => p.name);
}

// Classifies the staged diff across ALL of SOURCE_FILES, returning the union of
// trigger names hit in any of them plus which staged files were touched at all
// (so callers can decide whether to even run).
function classifySourceDiffs() {
  const touchedFiles = SOURCE_FILES.filter((f) => common.isStaged(f));
  const hitNames = new Set();
  touchedFiles.forEach((f) => {
    const diff = common.stagedDiff(f);
    classifyIndexHtmlDiff(diff).forEach((name) => hitNames.add(name));
  });
  return { touchedFiles, hits: Array.from(hitNames) };
}

function checkClaudeMdTouched() {
  const violations = [];
  const { touchedFiles, hits } = classifySourceDiffs();
  if (!touchedFiles.length || !hits.length) return violations;

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
        `${touchedFiles.join(", ")} diff touches: ${hits.join("; ")}. This looks like a new view/page, state field, or UI feature ` +
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
  const { touchedFiles, hits } = classifySourceDiffs();
  if (!touchedFiles.length || !hits.length) return violations;

  const exception = common.findException("readme-touched");
  if (exception) return violations;

  if (!common.isStaged("README.md")) {
    violations.push(
      common.violation(
        "readme-touched",
        "README.md",
        null,
        `${touchedFiles.join(", ")} diff touches: ${hits.join("; ")}, which may be user-facing (a new view/page, feature, or control), ` +
        `but README.md was not part of this commit. If this change is user-visible, document it in README.md's ` +
        `"What it does" section.`
      )
    );
    return violations; // file-level check failed; keyword layer would be redundant noise on top of this
  }

  // Keyword-mapping second layer: if CORE/BOTTOM (app/model.js, post-JS-split)
  // gained a new page-name literal in this commit's diff, require that literal
  // string to appear somewhere in README's CURRENT (staged) text. This is a
  // presence check only -- it confirms a keyword exists, not that the
  // surrounding prose is accurate.
  const addedPageNames = [];
  const coreBottomAdd = /^\+.*\[\s*"([a-z0-9:_-]+)"\s*,\s*"([^"]+)"\s*\]/gim;
  const modelDiff = common.isStaged("app/model.js") ? common.stagedDiff("app/model.js") : "";
  let m;
  while ((m = coreBottomAdd.exec(modelDiff || "")) !== null) {
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
  // Post-JS-split (2026-09-21): defaults() lives in app/state.js as a top-level
  // `export function`, indented one level shallower than it was inside
  // index.html's old IIFE -- its closing brace is at column 0 ("\n}\n"), not
  // "\n  }\n". The "export "? prefix is optional so this still matches if a
  // future refactor makes it a plain (non-exported) function.
  const fnMatch = source.match(/(?:export\s+)?function defaults\s*\(\s*\)\s*\{([\s\S]*?)\n\}\n/);
  if (!fnMatch) common.failLoud("could not locate defaults() function body in app/state.js to run the normalize/defaults pairing check");
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
  const fnMatch = source.match(/(?:export\s+)?function normalize\s*\(\s*s\s*\)\s*\{([\s\S]*?)\n\}\n/);
  if (!fnMatch) common.failLoud("could not locate normalize() function body in app/state.js to run the normalize/defaults pairing check");
  return fnMatch[1];
}

function checkNormalizeDefaultsPairing() {
  const violations = [];
  if (!common.isStaged("app/state.js")) return violations;
  const source = common.stagedContent("app/state.js");
  if (source === null) return violations; // app/state.js deleted in this commit; nothing to pair

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
        "app/state.js",
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

// Files this check scans. Post-Phase-1 CSS split (2026-09-21), the :root token
// block itself lives only in css/tokens.css -- index.html has had ZERO ":root"
// occurrences since that split, which silently made this check a no-op for
// index.html (isInsideTokenBlock() always returned false there for lack of any
// :root block to find, but index.html also stopped containing any CSS at all
// after that split, so there was nothing left to false-negative on in practice).
// This was not caught or fixed at the time -- flagged here now, fixed as part of
// this same pass: css/styles.css (added lines could reintroduce a hardcoded hex
// there) and css/tokens.css (the token block itself; a literal added INSIDE it is
// exactly what a token is supposed to be, so isInsideTokenBlock's exemption is
// still correct there) are the real CSS-side surface now, not index.html.
//
// Post-JS-split (Phase 2), app/*.js is a second, genuinely new risk surface: a
// dynamically-generated inline style (e.g. `el("div", { style: "color:#fff" })`)
// could hardcode a hex literal in JS the same way old inline <style> markup once
// could. Checked here too, though CLAUDE.md/state.js's own findings show no such
// literal exists yet -- this is a forward-looking check, not a fix for an
// existing violation.
const HEX_SCAN_FILES = ["css/tokens.css", "css/styles.css", "app/app.js", "app/state.js", "app/model.js", "app/dom.js", "app/views.js", "app/dialogs.js", "app/search.js", "app/chart.js"];

function checkHardcodedHex() {
  const violations = [];
  const exception = common.findException("hardcoded-hex-outside-tokens");

  HEX_SCAN_FILES.forEach((file) => {
    if (!common.isStaged(file)) return;
    const diff = common.stagedDiff(file) || "";
    const addedLines = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const source = common.stagedContent(file) || "";

    addedLines.forEach((line) => {
      const content = line.slice(1);
      let m;
      HEX_COLOR_RE.lastIndex = 0;
      while ((m = HEX_COLOR_RE.exec(content)) !== null) {
        // Confirm this literal hex actually lands outside a token block in the FULL
        // staged file (the diff line alone has no block context) by locating one
        // occurrence of the same literal text outside a :root block anywhere in
        // source. app/*.js files have no :root block at all, so isInsideTokenBlock
        // trivially returns false for them -- correct, since there is no legitimate
        // "inside the token definition" location for a hex literal in JS.
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
            file,
            null,
            `Added line introduces a literal hex color "${literal}" outside the :root token block: "${content.trim().slice(0, 80)}". ` +
            `Reference an existing --token or add a new one instead, per the project's design-token convention. ` +
            `(assets/sidequest-icon.svg is exempt from this rule -- it is a static favicon asset that cannot use CSS ` +
            `custom properties -- but ${file} is not.)`
          )
        );
      }
    });
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
  // ICON_SEARCH/ICON_CANCEL moved to app/app.js in the JS module split
  // (2026-09-21) -- read the known path data from THAT file's current staged
  // content (falling back to its on-disk content if it isn't part of this
  // commit, since the constants still need to be known even when only
  // index.html's markup changed). Static SVG markup that could duplicate them
  // still lives in index.html's HTML body (e.g. the #sqLogo symbol), so that
  // remains the file whose diff is scanned for a newly-added duplicate.
  if (!common.isStaged("index.html")) return violations;
  const diff = common.stagedDiff("index.html") || "";
  const iconSource = common.isStaged("app/app.js") ? common.stagedContent("app/app.js") : common.diskRead("app/app.js");
  const icons = extractIconConstants(iconSource || "");
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
// Gate: artifact-build-drift
// ---------------------------------------------------------------------------
// Claude-Sidequest/sidequest.html is a committed, generated file (npm run
// build:artifact concatenates app/*.js + css/*.css -- see scripts/build-
// artifact.js) so users can download it directly from GitHub without needing
// Node/npm. If a commit changes one of the build's real inputs but doesn't
// also stage the regenerated bundle, the committed artifact silently goes
// stale. This is a presence/timing check (was the bundle touched at all in
// the same commit), not a rebuild-and-diff -- consistent with this project's
// other gates (checkClaudeMdTouched/checkReadmeTouched), and avoids running
// the actual build script inside a git hook.

const ARTIFACT_BUNDLE = "Claude-Sidequest/sidequest.html";
const ARTIFACT_SOURCE_PATTERN = /^(app\/[\w-]+\.js|css\/[\w-]+\.css)$/;

function checkArtifactBuildDrift() {
  const violations = [];
  const touchedInputs = common.stagedFiles()
    .map((f) => f.path)
    .filter((p) => ARTIFACT_SOURCE_PATTERN.test(p));
  if (!touchedInputs.length) return violations;

  const exception = common.findException("artifact-build-drift");
  if (exception) return violations;

  if (!common.isStaged(ARTIFACT_BUNDLE)) {
    violations.push(
      common.violation(
        "artifact-build-drift",
        ARTIFACT_BUNDLE,
        null,
        `This commit changes ${touchedInputs.join(", ")} (an input to the Claude Artifact build), but ` +
        `${ARTIFACT_BUNDLE} was not regenerated and staged in the same commit. Run \`npm run build:artifact\` ` +
        `and stage its output, or this commit leaves the downloadable artifact bundle stale.`
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
  classifySourceDiffs,
  SOURCE_FILES,
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
  checkArtifactBuildDrift,
  ARTIFACT_BUNDLE,
  runNpmTest,
  README_KEYWORDS,
};
