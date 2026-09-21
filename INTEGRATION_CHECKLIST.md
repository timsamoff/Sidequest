# Sidequest Integration Checklist

Produced by Sentinel: Integration Audit (`02-integration-audit.md`), run 2026-09-21.

## Grounding note (read this first)

This project has 2 commits, 1 contributor. Commit 1 (`bd33665`) added only `.gitattributes`, `LICENSE`, and a 2-line `README.md`. Commit 2 (`efdf8f8`, "v1.0.0") added the entire application — `index.html` at its full ~2026 lines, both test files, `package.json`, `.gitignore`, and the icon assets — in one bulk drop. There is no commit history showing a feature being added incrementally, no commit where a state field was introduced and a call site was missed and fixed later, no PR discussion. This means Part 1 below cannot be grounded in "here's a real bug this project's history produced" the way a mature codebase audit would be. Every touchpoint claim below is grounded instead in **reading the current structure of `index.html` directly** and reasoning about what a new instance of each recurring unit of work would mechanically require — plus the one concrete precedent that does exist: the logo-color-tokenization fix recorded in `sentinel-notes/TODO.md` and `sentinel-notes/archive/logo-color-tokenization-design-brief.md`, which is real evidence of a hardcoded-value-outside-the-token-system class of miss, just not a touchpoint-completeness miss in the Part 1 sense (add-a-field-forget-a-place). Anywhere a "real example from history" is asked for below and none exists, this file says so rather than manufacturing one.

## Scope

Single surface, confirmed. `index.html` is the entire application; `assets/` is a repo-only, runtime-optional asset directory; `tests/` covers it. No monorepo, no secondary app, no shared/separate-registry question to resolve — there is exactly one registry of everything (`state`, the module-level constants `CORE`/`BOTTOM`/`STATUSES`/`WORDS`, and the DOM built by the render functions), and it lives in the one file.

---

## Part 0 — Existing checks inventory

**No existing gate checks, CI, or enforcement of any kind.** Confirmed by reading (not assuming from absence):
- No `.github/` directory.
- `.git/hooks/` contains only Git's inactive `.sample` files.
- One npm script, `test` → `node tests/run.js`, which is real and does run 66 assertions in `tests/template.test.js` (counted from the `ok(...)` calls), but it is not wired to run automatically anywhere — it is manual, `npm test`.
- No `sentinel-exceptions.json`, no `AGENTS.md`/`CLAUDE.md` gate logic, no README gate logic anywhere in the repo.

This is a from-scratch install. Every item below is labeled **Not covered** for that reason; there is nothing to mark **Partially covered** or **Already covered** against, and no existing system's logic to scrutinize for blind spots (the scrutiny Part 0 asks for when a real system exists doesn't apply — there's nothing to scrutinize).

**Part 0's style-matching question is moot.** The prompt asks whether new checks should match an existing system's naming/style/format conventions. There is no existing system, so there is nothing to match. Sentinel's own conventions (`sentinel-exceptions.json`, `Sentinel-Override:` trailer) apply by default. Recorded here for `03` to read, not left as an open question, since there's genuinely nothing to decide.

**TODO.md candidate items folded in.** `sentinel-notes/TODO.md`'s Open section already flags several items that are gate-check candidates in the Sentinel sense, not just design-quality cleanup. Folded into this checklist's relevant sections below:
- `font-tokens` → Cross-cutting assumptions / token-discipline section.
- `a11y-tooling` → Known gaps section (explicitly named there already in TODO.md as "a strong candidate for the Integration Audit's gate-check checklist" — so this *is* that fold-in).
- `contrast-unverified` → Known gaps section.
- `spacing-scale` → Known gaps section (nice-to-have, not gateable as a hard rule without a decision on the scale itself).

Not folded in as gate items: `launchnote-stub`, `readme-license`, `asset-optimization-gap`, `responsive-narrow-verify`, `comment-tighten` — these are one-off cleanup items, not recurring-touchpoint categories a gate check would enforce on every future change. They stay where they are in TODO.md.

---

## Part 1 — Touchpoint inventory

Grounded in `index.html` directly. Organized by the prompt's 8 layer categories, with this project's three recurring units — **new view/page**, **new state field**, **new UI feature/control** — cutting across them.

### 1. Definition/registry layer

| Touchpoint | Location | Change required | Failure mode | Coverage |
|---|---|---|---|---|
| Core nav pages | `index.html:383` `CORE` array | Add `["key","Label"]` entry | **Loud** — a view with no tab is simply unreachable via the sidebar/bottom bar; a developer notices immediately when testing | Not covered |
| Bottom nav pages (Archive/Help/Settings) | `index.html:384` `BOTTOM` array | Add `["key","Label"]` entry | Loud, same as above | Not covered |
| View dispatch switch | `index.html:1466-1480` `renderView()` | Add an `else if (ui.view === "x")` branch | **Loud-ish** — falls through to the final `else renderTimeline(root)` (line 1479 has no explicit terminal case), so a missing branch doesn't crash, it silently renders the wrong view. This is a real trap: the dispatch has no default/error case, it has a default *page* (Timeline), so a forgotten branch reads as "works" during a quick glance | Not covered |
| Page-title lookup | `index.html:617-624` `pageTitle(key)` | Add a branch or extend the `CORE`/`BOTTOM` loops it already reads | **Silent** — an unmatched key returns `""`; the topbar `<h1>` and `document.title` both go blank instead of erroring | Not covered |
| `validPage()` allow-list | `index.html:616` | Extend the condition if the new page isn't `"kofi"` or `proj:`-prefixed | **Silent** — `renderChrome()` filters `state.pins` through `validPage`, so a pinned-but-invalid key just quietly disappears from the sidebar with no error | Not covered |
| Settings vocabulary registries | `index.html:560` `WORDS`, `index.html:508` normalize's blockWord allow-list | Add a new "call it X" word choice | **Silent-ish** — `wd()` (line 561) falls back to `"Block"` if `state.settings.blockWord` isn't a recognized key, so a new word added to the settings `<select>` but not to `WORDS`/the normalize allow-list gets silently rejected on load and reverts to Block | Not covered |

**Real example, not from history but from present code:** the `WORDS`/`wd()`/normalize allow-list is a genuine 3-places-in-sync requirement right now (`index.html:560`, `index.html:508`, and the `<select>` built at `index.html:1924-1926`), and it is exactly the kind of hardcoded-by-name list the prompt's "cross-cutting assumptions" category is meant to catch. No incident report exists for it because there's no history to draw one from — this is inference from present structure, flagged as such, not a confirmed past miss.

### 2. Rendering/presentation layer

| Touchpoint | Location | Change required | Failure mode |
|---|---|---|---|
| New view's own render function | e.g. would be a new `renderXxx(root)` alongside `renderToday`/`renderSchedule`/etc. | Write it, wire into `renderView()` dispatch | Loud if omitted entirely (page shows blank/wrong content) |
| More-menu / new-item menu entries | `index.html:698-711` `buildMoreMenu()`, `index.html:349-357` the `#newMenu` static HTML | Add a menu item and `data-act`/`data-view` wiring | **Silent** — a page that exists but has no menu entry is only reachable by direct state manipulation; nothing errors, the feature is just undiscoverable |
| Search integration | `index.html:1339-1391` `SEARCH_LABELS`, `SEARCH_ORDER`, `searchAll()` | Add a `kind` key to both constants and a `consider(...)` call for the new data type | **Silent** — new data that isn't wired into search simply never appears in results; no error, just an invisible gap a user discovers by accident |
| Help topic for a new feature | `index.html:1816-1859` `helpTopics()` | Add a topic array entry | Silent, cosmetic-severity — the in-app Help just goes stale |
| Legacy/fallback rendering for old saved data | e.g. `dispProject`/`dispWhat` (`index.html:583-584`) special-casing `isNext` | New fields need equivalent "what does this look like on data saved before the field existed" handling | **Silent** — this is exactly what `normalize()` defaults are for; a rendering function that assumes a field is always present will throw (loud) only if it dereferences an undefined value without a guard, otherwise it silently renders wrong/blank |

### 3. Interaction/control layer

| Touchpoint | Location | Change required | Failure mode |
|---|---|---|---|
| Modal dialog for new-item creation | `index.html:1547-1582` `formDialog()` used by `taskDialog`, `projectDialog`, `ideaDialog`, `decisionDialog`, `stepDialog`, `milestoneDialog` | Write a new `xDialog()` following the pattern, wire into the `newMenu`'s `data-act` map at `index.html:1996` | Loud if the menu item exists but no handler — the `({...})[act]()` lookup at line 1996 throws a TypeError calling `undefined()`. This is actually one of the few *loud* failures in the file, which is a small positive: a menu entry with no matching handler crashes immediately rather than silently no-oping |
| Pin/unpin access control | `index.html:625-627` `isPinned`/`pinPage`/`unpinPage`, gated through `validPage()` | New page types need to be `validPage`-eligible to be pinnable at all | **Silent** — see registry-layer row above; an invalid pin just vanishes from the sidebar next render |
| Archive-eligibility per data kind | `index.html:1746-1756` `KIND_LABEL`, `KIND_FILTERS`, `archiveEntries()` | A new archivable data type needs an entry in all three | **Silent** — an archived item of an unregistered kind is invisible in the Archive view (it's in `state` but `archiveEntries()` never surfaces it), which also means it can never be restored or permanently deleted through the UI — a real orphaned-data risk |

### 4. Core logic/computation layer

| Touchpoint | Location | Change required | Failure mode |
|---|---|---|---|
| Value resolution: default vs. per-project override vs. computed | `index.html:564` `pset(name)` (falls back to `state.start`/`state.mult` if no per-project override), `index.html:565-567` offset/date math built on it | Any new per-project override needs the same three-tier fallback pattern respected | **Silent** — a new override field that bypasses `pset()` and reads `state.pset[name].x` directly will crash (loud) on projects with no override entry, or silently ignore the global default if written carelessly |
| Burn-down unit accounting | `index.html:585-589` `weight()`, `doneUnits()`, `totalUnits()`, `remainingUnits()`, `planned()` | A new "countable work" concept needs to flow through `burnTasks()`'s filter and `weight()`'s definition of a countable unit | **Silent** — the chart and the "N items remaining" text would simply not reflect the new unit type; no crash, just a wrong number nobody is prompted to double-check |
| `isLate` / overdue computation | `index.html:598` | Depends on `taskEnd(t)` and `TODAY`; any new schedulable entity needs its own end-date resolution to plug in here | Silent if omitted — new entity types just never show up in "Overdue" |

### 5. Persistence layer (the project's own stated highest-priority category)

This is the one category the project explicitly flagged as most important, and it's grounded directly in `normalize()`/`defaults()`/`sampleData()`.

| Touchpoint | Location | Change required | Failure mode |
|---|---|---|---|
| `defaults()` | `index.html:444-453` | New top-level state field needs a default value here | **Loud eventually, silent at first** — omitting it means `state.newField` is `undefined` for a brand-new user (no saved data yet triggers `load()` → `defaults()` at `index.html:526`); any code reading it will either throw (if dereferenced) or silently treat it as falsy |
| `normalize()` | `index.html:471-520` | New field needs an explicit validated-copy branch (`if (... s.newField ...) d.newField = ...`) | **Silent, and this is the important one.** If a new field is added to `defaults()` but never given a `normalize()` branch, `load()` still returns a valid object (line 524 parses raw JSON through `normalize`), but the new field silently reverts to its default on every single load for every user who has *any* existing saved data, permanently, with no error. This is precisely the "backward-compatible loading" concern the project flagged — the current 20+ field `normalize()` function (lines 474-518) shows the pattern is followed conscientiously today, but it's manual and there's no mechanical check that a new `defaults()` key has a matching `normalize()` branch |
| `sampleData()` | `index.html:397-443` | Not required for correctness, but is the concrete example of "what does this look like" for a new field — if skipped, sample/demo data just won't exercise the new feature | Silent, low-severity — cosmetic/demo gap only |
| Sanitizer helper functions | `cleanEst()` (`index.html:455-459`), `cleanPset()` (`index.html:460-468`), `validArch()` (`index.html:469`) | Any field with the same shape (bounded numeric maps, dated-object maps) should reuse or extend these rather than hand-rolling new validation inline | Not a failure mode exactly — a "known gap" in consistency if a future field reinvents validation instead of extending the existing helpers |
| Storage key stability | `index.html:379` `KEY2 = "sidequest-template-v1"` | Must never change | **Catastrophic if violated** — changing this key orphans every existing user's saved data with no migration path, since there is no migration code, only `normalize()` defaulting. This is a hard invariant, not a per-field touchpoint, and belongs in a gate rule of its own |

**Concrete illustration using an existing field:** `pins` (line 450 in `defaults()`, line 511 in `normalize()`) and `pset`/`pest` (defaults lines 450, normalize lines 516-517) show the pattern correctly applied — each has a default, each has a `normalize()` branch with real bounds-checking (e.g. `cleanPset`'s `mult` range 0.25–5, `index.html:464`). This is the template a future field should follow; there's no discovered case in this project's actual history where a field skipped this step, since the file arrived in one commit already following the convention.

### 6. Wiring/registration layer

This project has no dependency injection, no event bus, no startup-sequence registry in the conventional sense — it's a single IIFE (`index.html:378-2023`) with direct function calls and one `document.addEventListener` per interaction type. The closest equivalents:

| Touchpoint | Location | Change required | Failure mode |
|---|---|---|---|
| Boot sequence | `index.html:2018-2022` | New startup-time logic (like `applyTheme()`, `autoArchive()`) needs an explicit call added to this tail sequence | Loud or silent depending on what's skipped — e.g. skipping `applyTheme()` would be visually obvious (loud-ish); skipping something purely internal like a new default-computation step could be silent |
| Global keydown listeners | `index.html:1534-1546` (Escape/Tab-trap), `index.html:2007-2013` (`/` for search) | A new global keyboard shortcut needs its own listener or a branch in an existing one | N/A unless a shortcut is planned — noted as thin/not-yet-applicable rather than forced |
| Menu action dispatch table | `index.html:1996` | Already covered under Interaction/control layer above — this is this project's actual "event registration" equivalent | (see above) |

**Explicit statement:** true DI/event-bus/plugin-registration patterns from the prompt's generic category don't exist here and would be over-engineering for a single-file app with no build step — this category is real but thin for this project, and forcing a heavier interpretation onto it would misrepresent the codebase.

### 7. Cross-cutting assumptions

Hardcoded-by-name spots, flagged as known gaps per the prompt's instruction to flag every one:

- `KEY2`/`UIKEY` string literals (`index.html:379`) — intentional, not a gap (storage key stability is a feature, not a miss).
- `WORDS` object (`index.html:560`) — closed set of 5 vocabulary choices, hardcoded by name, cross-referenced in 3 places (see Definition/registry layer above).
- `SEARCH_LABELS`/`SEARCH_ORDER` (`index.html:1339-1340`) — closed set of 6 searchable kinds, hardcoded by name.
- `KIND_LABEL`/`KIND_FILTERS` (`index.html:1746-1747`) — closed set of 5 archivable kinds, hardcoded by name.
- `CORE`/`BOTTOM` (`index.html:383-384`) — closed set of 7 fixed pages, hardcoded by name (pinned/project pages are more dynamic, driven by `state.pins` and `projectNames()`, which is the more "schema-driven" pattern by contrast).

None of these are bugs — a single-file app with a genuinely fixed, small set of page/kind types is a reasonable design choice, not an oversight. They're flagged because the prompt asks for every hardcoded-by-name list to be named explicitly as a place future additions can silently miss, which is exactly the shape of the Part 1 risk here: adding a 6th archivable kind or an 8th page means touching 3-5 separate hardcoded lists with no compiler or schema to catch a missed one.

### 8. Documentation that isn't the README

- **`CLAUDE.md`** — exists, is current as of 2026-09-21, and per its own "Standing process notes" section is the designated home for settled operational conventions. This is covered as its own gate in Part 2 below, not folded in here.
- **Code comments describing intent** — per `CLAUDE.md`'s documented "terse/minimal" convention, comments are section labels or one real *why* (e.g. `index.html:532` `/* The app always opens on Today, on every device. */`, already flagged in TODO.md's `comment-tighten` item for being slightly too verbose relative to the house style, not for being wrong). No comment found during this audit contradicts current behavior — comments and code are in sync as of this read.
- **No design doc** — see Part 2 below; N/A, already decided against by the user.
- **`sentinel-notes/TODO.md` and its archived design briefs** — function as this project's de facto architecture/decision log in place of a `DESIGN.md`, per `CLAUDE.md`'s own "Documentation routing" section. Covered under Part 2's fourth gate.

---

## Part 2 — CLAUDE.md, README, design-doc, and TODO.md gate requirements

### Gate 1: CLAUDE.md (highest priority)

**Trigger:** any commit that adds/changes a view, a state field, a UI feature, or a settled operational convention should touch `CLAUDE.md`.

**Important wrinkle specific to this project:** `CLAUDE.md` is gitignored (`.gitignore:3`, confirmed, and stated explicitly in `CLAUDE.md`'s own first line: "This file is intentionally local-only (gitignored)"). A commit-diff-based gate (`git diff --name-only` against the commit) **cannot see this file at all** for a gitignored file in the working tree the normal way, but a `pre-commit`/`commit-msg` hook running in the working directory *can* still read the file's current mtime/content directly off disk — it just can't rely on `git status`/`git diff` reporting it as part of the commit. The gate-check logic (for `03` to build) needs to check "was `CLAUDE.md` modified more recently than the last commit that touched `index.html`" via filesystem mtime comparison or a local marker, not via `git diff`, since git-based diffing structurally cannot see a gitignored file's changes. This is a real, project-specific constraint this audit found by reading `.gitignore` and `CLAUDE.md` together — worth flagging clearly for `03` rather than assuming a standard git-diff gate will work here.

### Gate 2: README

**Trigger:** any commit changing user-facing behavior, setup, or capabilities should touch `README.md`.

Current README (`README.md`) documents: Today, Schedule, Projects, Timeline, Launch checklist, Archive, Search, Help, Settings (the "What it does" section, lines 9-17) — this matches `CORE`+`BOTTOM`+the pinned Launch page currently in `index.html`, so the file-level content is accurate as of this read.

**"File touched" is necessary but not sufficient** — restated per the prompt's own instruction, not just accepted as given: a commit could touch both `index.html` and `README.md` for unrelated reasons (e.g. a typo fix landing alongside a real feature) and the file-level check would pass while the actual new feature goes undocumented.

**Proposed second-layer strengthening (option, not a decision):** a maintained keyword-mapping table, e.g. adding a page named "Focus mode" would require the literal string "Focus mode" (or a configured synonym) to appear somewhere in `README.md`'s current text, checked independent of whether the file changed in that commit. This is a presence check only — it confirms a keyword exists, not that the surrounding prose is accurate or up to date, and that limitation should be stated in the gate's own output, not just here. **Tradeoff for this specific project:** Sidequest is a single-file, single-contributor, ~9-feature-area project. A keyword map here would be small (roughly one entry per `CORE`/`BOTTOM`/pinned-page name, maybe 10-12 entries total) and cheap to maintain, but it is still one more thing to update by hand every time a feature is added, for a project whose current README is short enough that a human re-read at commit time is also a realistic option. Recommend as a genuine option worth adopting given how small the mapping would stay, but explicitly not forcing it — this is the kind of judgment call the prompt says should go to the user, and it's cheap here in a way it wouldn't be on a larger project, so the case for it is stronger than average, not a foregone yes.

### Gate 3: Design document

**N/A.** No `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, or equivalent exists. Per `CLAUDE.md`'s "Known accepted gaps" section, this was declined by the user during the Design & Code Quality Audit (2026-09-21) as a deliberate decision, not an oversight — the project's constraints and decisions are tracked in `CLAUDE.md` and ad hoc handoff notes instead. Stating this explicitly rather than silently skipping the gate, per the run instructions.

### Gate 4: TODO.md completion-sync

Two-part gate, matching the project's actual documented convention (`sentinel-notes/TODO.md` lines 1-6, and `CLAUDE.md`'s "Standing process notes" section):

- **Hard check (design-brief-linked items):** if a commit modifies a `sentinel-notes/[issue]-design-brief.md` file (in `sentinel-notes/` or `sentinel-notes/archive/`) without a corresponding status change in `sentinel-notes/TODO.md` in the same commit (an item moving from Open to Done, referencing that brief), block or warn. This matches the exact convention already in use — see the resolved `logo-color-tokenization-design-brief.md`, which was archived only once its linked TODO item moved to Done.
- **Soft check (plain one-line items):** for items with no linked brief (the majority of the current Open list — `font-tokens`, `launchnote-stub`, `readme-license`, etc.), there's no structural signal to check against. Per the prompt's own instruction, this should be a non-blocking reminder, not a forced heuristic — e.g. a periodic nudge ("N open TODO items untouched since before this session started"), which is already the pattern `CLAUDE.md`'s "Backlog visibility" convention describes for session-level tracking, just not yet mechanized as a gate.

Both `sentinel-notes/` and `sentinel-notes/archive/` are also gitignored (`.gitignore:4`; `CLAUDE.md` is local-only by the same stated policy). The same mtime-vs-git-diff caveat from Gate 1 applies here too — a git-diff-based hard check needs a filesystem-level read, not `git diff --name-only`, to see whether `TODO.md` or a design-brief file actually changed.

---

## Part 3 — Deliverables

### 1. This file (`INTEGRATION_CHECKLIST.md`)

Delivered at the project root, as required. Structure: Grounding note, Scope, Part 0 (existing-checks inventory), Part 1 (8-category touchpoint inventory with file/line citations and silent-vs-loud notes), Part 2 (four gates), this Part 3, Part 4 (commit conventions — recorded as open questions, not decided), Part 5 (exceptions mechanism, described not built), Known gaps.

### 2. Gate-check step — described in plain terms (not implemented)

**Commit-time check** (would run as a `pre-commit` hook once built in `03`):
1. Read the diff of staged changes for `index.html` (via `git diff --cached`).
2. If the diff touches any of: `CORE`/`BOTTOM` arrays, `normalize()`, `defaults()`, `renderView()`'s dispatch, `WORDS`, `SEARCH_LABELS`/`SEARCH_ORDER`, `KIND_LABEL`/`KIND_FILTERS`, or adds a new `xDialog()` function — classify this as "likely touches a recurring unit of work."
3. If classified as such, check (via filesystem read, not `git diff`, since both are gitignored): has `CLAUDE.md` been modified more recently than the current `HEAD`? Has `README.md` been modified more recently, or does it need the keyword-mapping check (if adopted)? Has `sentinel-notes/TODO.md` been touched if a design-brief file was also touched?
4. Any category not touched but plausibly required → block with a specific, actionable message: which category, which rule, and a self-review question (e.g. "`index.html` diff adds a new key to the `CORE` array (new view/page) but `CLAUDE.md` was not updated since the last commit touching `index.html`. Does this new view need a mention in CLAUDE.md's 'What this project is' or 'Conventions established' section?").
5. Run `npm test` as a required gate before allowing the commit — currently a manual step (`README.md` line 43), never enforced. This is the most straightforward addition available: an existing, working, 66-assertion test suite that isn't wired to anything.
6. Fold in Part 4's chosen commit style (once confirmed by the user) as a `commit-msg` hook check, and Part 5's exception mechanisms as an escape valve on steps 2-5, not step 6 (attribution-stripping in Part 5 below is never exempt, per the prompt's own instruction).

**Full-repo scan mode** (separate from the above, would run less often):
- Since this project has no CI (`.github/` doesn't exist) and no scheduled infrastructure, the practical option is a `pre-push` hook rather than a CI-scheduled job — pushing already implies "share this with the world" (it's a public repo), which is a reasonable natural checkpoint for a heavier, slower, whole-file scan.
- What it would check that commit-time can't: whether every key in `CORE`+`BOTTOM`+currently-pinned-page-producing code paths has a matching `WORDS`/`SEARCH_LABELS`/`KIND_LABEL` entry where applicable (cross-list consistency that no single commit's diff can reveal, since the two touched lists might have been edited in different commits); whether every `defaults()` key has a `normalize()` branch (structural pairing check across the whole function, not just the diff); whether `README.md`'s keyword map (if adopted) still matches the current `CORE`/`BOTTOM`/pinned-page set.
- Should not run on every commit — the file is ~2000 lines and a full structural scan is meaningfully slower than a diff-scoped check; running it every commit would either slow down every commit or train the user to skip/bypass the hook, which defeats the purpose.

### 3. Known gaps (real, flagged, not mechanically gateable)

- **Accessibility (`a11y-tooling` in TODO.md):** no axe-core/jest-axe integration exists. A gate check can confirm a test file exists and ran; it cannot confirm the app is actually accessible. Already flagged as a TODO candidate — restated here as a known gap rather than something this pass can turn into a hard rule.
- **Color contrast (`contrast-unverified` in TODO.md):** spot-checked by eye only. A gate could mechanically compute WCAG contrast ratios for token pairs if the tokens were extracted programmatically, but that's a real implementation task for `03`, not something describable as already-covered.
- **Font-family token discipline (`font-tokens` in TODO.md):** 6 literal font-family strings exist outside a token (`index.html` lines ~50, 51, 86, 164, 190, 247, per TODO.md's own citation). A grep-based gate rule ("no literal font-family string outside the `:root` block") is mechanically buildable in `03`, but the fix itself (introducing `--font-serif`/`--font-sans`) is a `01`-style code change, not something this audit implements.
- **Spacing scale (`spacing-scale` in TODO.md):** no formal `--space-*` scale exists. Not gateable as a hard rule until the user decides whether to adopt one at all — a "no literal pixel value" rule would be extremely noisy against the current codebase's actual, accepted style.
- **The `WORDS`/`SEARCH_LABELS`/`KIND_LABEL` cross-list consistency problem** (Part 1, Cross-cutting assumptions): gateable in principle (a full-repo scan could grep for all four arrays and diff their key sets against a canonical list), but genuinely tricky to get right without false positives, since not every list needs the same keys (e.g. `WORDS` is a closed vocabulary set unrelated to `KIND_LABEL`'s archivable-kind set) — flagging this as a "real but needs careful design in `03`" item rather than a simple grep rule.
- **CLAUDE.md/TODO.md/design-brief gitignored status vs. git-diff-based gating** (Part 2, Gates 1 and 4): the mtime-based workaround described above is a real design requirement for `03`, not a trivial swap-in — flagged clearly so `03` doesn't default to a standard `git diff --name-only` implementation that would silently never fire.

---

## Part 4 — Commit conventions (confirmed by user, 2026-09-21)

**Commit message style:** terse single-line summary, no Conventional Commits prefix, no body unless truly necessary, no co-author notes. Confirmed by the user directly, matching both the (thin) observed 2-commit history and their stated general preference.

**Commit granularity:** one commit per session by default; split into multiple atomic commits only when a change is clearly large enough to warrant it. Confirmed by the user directly.

Both are now recorded in `CLAUDE.md`'s "Conventions established" section as settled, for `03` to build the enforcement hook against and for future sessions to follow even without the hook running.

---

## Part 5 — Exceptions mechanism (described, not implemented)

**Standing exceptions — `sentinel-exceptions.json`:** confirmed by the user (2026-09-21) to live under `sentinel-notes/`, not the project root — already gitignored, so exception reasons (which may reference internal detail) stay private rather than visible in this public, no-personal-content repo. Each entry would require: the specific checklist category/rule being exempted (e.g. "Gate 2: README" or "font-tokens grep rule"), a narrow file/line scope, a concrete reason, an owner (in a 1-contributor project, still recorded explicitly rather than assumed), and a review-by date. An expired entry fails the same as no exception at all — no silent grace period.

**Per-commit override — `Sentinel-Override:` trailer:** for a one-off judgment call (e.g. "this commit is large because it's a genuine bulk migration, not a discipline failure") that doesn't need a standing file entry. Recorded directly in the commit message as a trailer with a reason. Neither mechanism is created or self-approved by an agent mid-session — both are proposed here for the user to actually add when `03` builds the enforcement logic.

**Attribution stripping is separate from both of these and is never exempt:** a `commit-msg` hook stripping/blocking Claude Code's "Generated with Claude Code" line and `Claude-Session:` trailer (or equivalents) is hygiene, not a gateable judgment call — it should be unconditional in `03`'s implementation, per the prompt's explicit instruction that this class of check doesn't get a warning-only downgrade.

---

## Part 6 — Implementation status (Gate-Check Implementation `03`, run 2026-09-21)

Mechanism: native git hooks, tracked at `.githooks/` (`commit-msg`, `pre-commit`, plus `lib/*.js` for the shared check logic), installed via `git config core.hooksPath .githooks`. Manual command: `node .githooks/sentinel-check.js` (diff-scoped, mirrors the pre-commit hook) and `node .githooks/sentinel-check.js --full` (whole-repo structural scan, enforcing).

- **Gate 1, CLAUDE.md-touched**: **Implemented.** `.githooks/lib/check-pre-commit.js`, `checkClaudeMdTouched()`. Uses filesystem mtime (`common.diskMTimeMs`) against HEAD's commit time, never `git diff`, per the gitignored-file constraint identified here. Tested against a real staged `CORE`-array addition (fired correctly) and against a bumped `CLAUDE.md` mtime (cleared correctly).
- **Gate 2, README-touched**: **Implemented, including the optional keyword-mapping layer.** `.githooks/lib/check-pre-commit.js`, `checkReadmeTouched()`. The keyword-mapping second layer was built as recommended in this checklist's own tradeoff analysis, but was NOT reconfirmed live with the user during `03` (non-interactive run) — flagged in `03`'s report and `sentinel-notes/TODO.md` (`readme-keyword-mapping-maintenance`) as needing a look to confirm the maintenance cost is still acceptable.
- **Gate 3, design document**: **N/A, as decided here.** Not implemented; no `DESIGN.md` exists.
- **Gate 4, TODO.md completion-sync**: **Implemented (hard check); soft check implemented as a non-blocking reminder.** `.githooks/lib/check-pre-commit.js`, `checkTodoSync()` (hard, mtime-based, design-brief-linked) and `todoBacklogReminder()` (soft, prints a non-blocking count of open items on every pre-commit run).
- **npm test gate**: **Implemented.** `.githooks/lib/check-pre-commit.js`, `runNpmTest()`. Runs last in the pre-commit hook (slowest check, so it runs after the cheap ones). Tested with a deliberately broken assertion — confirmed blocking.
- **normalize()/defaults() pairing**: **Implemented.** `.githooks/lib/check-pre-commit.js`, `checkNormalizeDefaultsPairing()`, plus a whole-file version in the full-scan mode. A content-keyed `INTENTIONALLY_UNPAIRED` allowlist (currently just `v`) covers the one legitimate exception. Tested for a new unpaired key and for deletion of an existing paired branch.
- **Cross-list consistency (`WORDS`/`SEARCH_LABELS`/`KIND_LABEL`)**: **Implemented in narrowed form.** Per this checklist's own caution that the full 4-list version needs careful design, `03` built a conservative version limited to `SEARCH_LABELS`/`SEARCH_ORDER` and `KIND_LABEL`/`KIND_FILTERS` only — two pairs that are genuinely meant to enumerate the same concept from two sides. `WORDS` was excluded (unrelated closed vocabulary, not a pairing) and `CORE`/`BOTTOM` were not folded in (not the same two-sided shape). Runs only in the full-scan mode (`sentinel-check.js --full`), not per-commit, since it needs the whole file. Flagged as new/unconfirmed in `03`'s report.
- **Hardcoded-hex-outside-tokens**: **Implemented.** `.githooks/lib/check-pre-commit.js`, `checkHardcodedHex()`. Scans only added lines for new hex literals landing outside the `:root` token blocks; `assets/sidequest-icon.svg` is excluded from this rule specifically (documented reason: it's a static favicon asset that cannot use CSS custom properties), not given a blanket exemption from other checks.
- **Duplicated-icon/SVG-markup**: **Implemented.** `.githooks/lib/check-pre-commit.js`, `checkDuplicatedIconMarkup()`. Flags a newly-added static `<svg>` block whose path data exactly matches an existing `ICON_*` JS constant's path data — the same shape as the real `search-icon-dedup` fix.
- **Part 0b, new-file-extension check**: **Implemented as a standing default**, independent of this checklist. `.githooks/lib/check-new-extension.js`; manifest at `.githooks/sentinel-known-extensions.txt` (tracked, not under gitignored `sentinel-notes/` — a fork resolved without live confirmation, flagged in `03`'s report). Seeded from the current working tree.
- **Known gaps not made into hard checks** (a11y-tooling, contrast-unverified, spacing-scale): left as-is, per this checklist's own assessment that they aren't easily gateable yet. Not attempted in `03`.

Baseline: a report-only full-scan pass (`sentinel-notes/sentinel-baseline.json`) found **zero pre-existing violations** across all implemented checks — nothing needed logging to `sentinel-notes/TODO.md`'s Open section as backlog.

## Next step

Sequence complete for this pass. See `03`'s own report for open questions (README keyword-mapping confirmation, commit-autonomy level, numeric thresholds) still needing the user's live confirmation.
