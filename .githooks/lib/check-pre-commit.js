// Pre-commit content checks: tracked files are read from the git index, gitignored ones (CLAUDE.md, Sentinel-Notes/*) from disk. Each check returns a list of violations; only common.failLoud() throws.

"use strict";
const fs = require("fs");
const path = require("path");
const common = require("./sentinel-common");
const landing = require("./check-landing");

// Every module under app/, read from disk, so a new module cannot fall out of the check lists.
function appModules() {
  return fs.readdirSync(common.repoPath("app")).filter((f) => f.endsWith(".js")).sort().map((f) => "app/" + f);
}

// Every landing-site file under tavern/ with one of the given extensions, read from disk so a new page or script is covered automatically.
function tavernFiles(exts) {
  const dir = common.repoPath("tavern");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => exts.some((e) => f.endsWith(e))).sort().map((f) => "tavern/" + f);
}

// Gate 1: CLAUDE.md touched. CLAUDE.md is gitignored, so this compares its mtime with the HEAD commit time instead of using git diff; patterns run against every file in SOURCE_FILES.

const SOURCE_FILES = ["index.html"].concat(appModules());

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

// Gate 2: README touched. README.md is tracked, so this one uses git diff.

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

  // Keyword map: a page label newly added to CORE/BOTTOM must appear in README's staged text. A presence check only, not an accuracy check.
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

// Gate 3 (design document): not implemented.

// Gate 4: TODO.md completion sync. A change to a Sentinel-Notes design brief needs a matching TODO.md change; both are gitignored, so this compares disk times against the HEAD commit instead of using git diff.

function listDesignBriefFiles() {
  const glob = require("child_process").execFileSync;
  let out;
  try {
    out = glob("git", ["ls-files", "--others", "--exclude-standard", "--cached", "--", "Sentinel-Notes"], {
      cwd: common.REPO_ROOT,
      encoding: "utf8",
    });
  } catch (e) {
    out = "";
  }
  // Sentinel-Notes/ is gitignored so `git ls-files --cached` returns nothing for it;
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
  walk(common.repoPath("Sentinel-Notes"));
  return results;
}

function checkTodoSync() {
  const violations = [];
  const exception = common.findException("todo-completion-sync");
  if (exception) return violations;

  const todoPath = path.join("Sentinel-Notes", "TODO.md");
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
          `${relPath} was modified since the last commit, but Sentinel-Notes/TODO.md was not updated at the same ` +
          `time (or was updated before it). This project's convention: a design-brief edit needs a matching status ` +
          `change in TODO.md's Open/Done sections in the same commit. (Both files are gitignored, so this is a ` +
          `filesystem-mtime comparison, not a git diff.)`
        )
      );
    }
  });
  return violations;
}

// Soft check: nudges about plain TODO items with no linked brief. Returns a reminder string or null and never blocks.
function todoBacklogReminder() {
  const raw = common.diskRead(path.join("Sentinel-Notes", "TODO.md"));
  if (!raw) return null;
  const openSection = raw.split(/^## Done/m)[0];
  const openItems = (openSection.match(/^-\s*\[ \]/gm) || []).length;
  if (!openItems) return null;
  return `${openItems} open TODO item(s) in Sentinel-Notes/TODO.md untouched since before this session started. (Non-blocking reminder.)`;
}

// normalize()/defaults() pairing: every top-level key of defaults()'s returned object must be referenced in normalize()'s body as d.<key>. A name-presence check, not an interpreter.

function extractDefaultsKeys(source) {
  // defaults() is a top-level function in app/state.js; the "export " prefix is optional in the match.
  const fnMatch = source.match(/(?:export\s+)?function defaults\s*\(\s*\)\s*\{([\s\S]*?)\n\}\n/);
  if (!fnMatch) common.failLoud("could not locate defaults() function body in app/state.js to run the normalize/defaults pairing check");
  const body = fnMatch[1];
  // Pull only the top-level key names from the returned object literal; nested keys (settings: {...}) are paired separately and would false-positive here.
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
    // A key counts as paired if normalize() references d.<key>, or it is an allowlisted key always taken fresh from defaults() (such as "v").
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

// Hardcoded-hex check: flags a new hex literal added outside the token blocks (added diff lines only). assets/sidequest-icon.svg is excluded because a favicon cannot reference CSS variables.

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;

function isInsideTokenBlock(fullText, matchIndex) {
  // Token blocks are the :root block and the two dark-theme override blocks.
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

// Files scanned: app/*.js, css/styles.css, and css/tokens.css; the :root token block lives only in tokens.css.
// The landing pages are not hex-scanned: their theme-color metas must be literal hex, and the parity check ties those to the tokens.
const HEX_SCAN_FILES = ["css/tokens.css", "css/styles.css", "css/splash.css"].concat(appModules(), tavernFiles([".css", ".js"]));

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
        // Confirms the hex literal lands outside a token block in the full staged file, since a diff line has no block context. app/*.js has no :root block, so it never counts as inside one.
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

// Comment-verbosity check: flags changelog-style tells in comments (bare dates, "confirmed <date>", "an earlier version", DESIGN.md/CLAUDE.md pointers). It is not a length check.

const COMMENT_SCAN_FILES = ["css/tokens.css", "css/styles.css", "css/splash.css", "index.html"].concat(appModules(), tavernFiles([".css", ".js", ".html"]));

const COMMENT_VERBOSITY_PATTERNS = [
  { name: "dated confirmation", re: /\bconfirmed\s+20\d\d-\d\d-\d\d\b/i },
  { name: "bare date", re: /\b20\d\d-\d\d-\d\d\b/ },
  { name: "doc pointer", re: /\b(?:see\s+)?(?:DESIGN|CLAUDE)\.md\b/i },
  { name: "changelog framing", re: /\ban earlier version\b/i },
];

function checkCommentVerbosity() {
  const violations = [];
  const exception = common.findException("comment-verbosity");

  COMMENT_SCAN_FILES.forEach((file) => {
    if (!common.isStaged(file)) return;
    const diff = common.stagedDiff(file) || "";
    const addedLines = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    addedLines.forEach((line) => {
      const content = line.slice(1);
      // Only lines that are themselves a comment (or continue one) -- a
      // string literal that happens to contain "2026-09-27" (a real ISO date
      // the app stores/displays) is not this check's business.
      var trimmed = content.trim();
      var looksLikeComment = /^\/\//.test(trimmed) || /^\/?\*/.test(trimmed) || /^<!--/.test(trimmed) || /-->$/.test(trimmed);
      if (!looksLikeComment) return;
      COMMENT_VERBOSITY_PATTERNS.forEach(({ name, re }) => {
        if (!re.test(content)) return;
        if (exception && exception.scope === file) return;
        violations.push(
          common.violation(
            "comment-verbosity",
            file,
            null,
            `Added comment reads like an inline changelog entry (${name}): "${trimmed.slice(0, 90)}". ` +
            `Keep the comment a short pointer to the current behavior; put narrative/history in CLAUDE.md instead.`
          )
        );
      });
    });
  });
  return violations;
}

// CSS token-organization check: flags a newly added styles.css line that retypes a literal (border-radius, min-height, font-size) a token already covers.

// Maps each plain literal token value in tokens.css's first (light) :root block to a list of token names, because unrelated tokens can share a value (10px); callers choose by property family.
function extractTokenValues(tokensSource) {
  const map = new Map();
  const rootMatch = tokensSource.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!rootMatch) return map;
  const body = rootMatch[1];
  const re = /--([\w-]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const name = m[1], value = m[2].trim();
    if (/var\(/.test(value)) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(name);
  }
  return map;
}

// Given the value -> [names] map and a token-name-family test, returns the
// one matching name for that property, or null.
function tokenNameForFamily(tokenValues, value, nameRe) {
  const names = tokenValues.get(value);
  if (!names) return null;
  return names.find((n) => nameRe.test(n)) || null;
}

// Which property maps to which token-name family, so a shared literal never suggests the wrong token (border-radius only suggests --radius-*).
const CSS_PROPERTY_TOKEN_FAMILIES = [
  { prop: "border-radius", nameRe: /^radius-/ },
  { prop: "min-height", nameRe: /^control-height$/ },
  { prop: "font-size", nameRe: /^text-/ },
];

function checkCssTokenValue() {
  const violations = [];
  const file = "css/styles.css";
  if (!common.isStaged(file)) return violations;
  const tokensSource = common.stagedContent("css/tokens.css") || common.diskRead("css/tokens.css") || "";
  const tokenValues = extractTokenValues(tokensSource);
  if (!tokenValues.size) return violations;
  const exception = common.findException("css-token-value");

  const diff = common.stagedDiff(file) || "";
  const addedLines = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  addedLines.forEach((line) => {
    const content = line.slice(1);
    CSS_PROPERTY_TOKEN_FAMILIES.forEach(({ prop, nameRe }) => {
      const re = new RegExp("\\b" + prop + ":\\s*([\\d.]+(?:px|rem|em)|999px)\\b", "g");
      let m;
      while ((m = re.exec(content)) !== null) {
        const value = m[1];
        const tokenName = tokenNameForFamily(tokenValues, value, nameRe);
        if (!tokenName) continue;
        if (exception && exception.scope === value) continue;
        violations.push(
          common.violation(
            "css-token-value",
            file,
            null,
            `Added line uses the literal "${value}" for ${prop}, which already has a token (--${tokenName}): "${content.trim().slice(0, 80)}". ` +
            `Use var(--${tokenName}) instead of repeating the literal.`
          )
        );
      }
    });
  });
  return violations;
}

// Duplicated-icon check: flags a newly added static inline <svg> in index.html whose path data matches an existing ICON_* JS constant.

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
  // ICON_SEARCH/ICON_CANCEL live in app/app.js; their path data is read from the staged file, or from disk if it is not part of the commit.
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
            `(Sentinel-Notes/TODO.md, search-icon-dedup) -- render it from the JS constant at render time instead of ` +
            `hardcoding a second static copy.`
          )
        );
      }
    });
  });
  return violations;
}

// Social-meta drift check: index.html's og:description must still match the start of README's opening paragraph. A prefix check, not a meaning check.

function extractOgDescription(source) {
  const m = source.match(/<meta\s+property="og:description"\s+content="([^"]*)"/);
  return m ? m[1] : null;
}

function extractReadmeOpeningParagraph(readmeText) {
  // First paragraph line that is not blank, a heading, or an HTML tag.
  const lines = readmeText.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith("#") && !t.startsWith("<")) return t; // skips headings and HTML lines such as the logo <img>
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

// Artifact-build drift: Sidequest-Artifact/sidequest.html is generated and committed, so a commit that changes a build input without staging the rebuilt file is blocked. A presence check, not a rebuild-and-diff.

const ARTIFACT_BUNDLE = "Sidequest-Artifact/sidequest.html";
const ARTIFACT_SOURCE_PATTERN = /^(app\/[\w-]+\.js|css\/[\w-]+\.css)$/;

// Runs the landing-site parity check when the landing pages, README, or tokens are staged, reading staged content first.
function checkLandingParity() {
  const watched = common.stagedFiles().some((f) => f.path.startsWith("tavern/") || f.path === "README.md" || f.path === "css/tokens.css");
  if (!watched) return [];
  return landing.landingViolations((f) => common.stagedContent(f) || common.diskRead(f), tavernFiles([".html"]));
}

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

// npm test gate: runs the suite, deliberately last because it is the slowest check.

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
  HEX_SCAN_FILES,
  appModules,
  tavernFiles,
  checkClaudeMdTouched,
  checkReadmeTouched,
  checkTodoSync,
  todoBacklogReminder,
  checkNormalizeDefaultsPairing,
  extractDefaultsKeys,
  extractNormalizeBody,
  checkHardcodedHex,
  checkCommentVerbosity,
  COMMENT_SCAN_FILES,
  COMMENT_VERBOSITY_PATTERNS,
  checkCssTokenValue,
  extractTokenValues,
  tokenNameForFamily,
  CSS_PROPERTY_TOKEN_FAMILIES,
  checkDuplicatedIconMarkup,
  checkSocialMetaDrift,
  checkArtifactBuildDrift,
  checkLandingParity,
  ARTIFACT_BUNDLE,
  runNpmTest,
  README_KEYWORDS,
};
