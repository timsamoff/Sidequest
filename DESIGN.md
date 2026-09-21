# Sidequest: Design Document (v2 direction)

Status: draft, actively being developed. This document describes a planned architectural and product direction, not the current shipped state. Where it diverges from what exists in `index.html` today, the current code is the v1 baseline and this document is where v2 is being decided before implementation starts.

## Why this document exists

Sidequest is changing in two ways at once: how it's built (single self-contained file to a multi-file static site) and what it is (a plain planner to a planner with a gamification layer). Both changes are substantial enough to warrant deciding the shape of things before writing code, rather than discovering the shape through implementation. This document is that record.

## What Sidequest is (unchanged)

Sidequest is a project planner for someone juggling several side projects at once: a backlog of tasks, each broken into steps, scheduled into blocks (renamed Sprint/Iteration/Phase/Week per user preference), with a burndown chart tracking progress against a plan. Projects have their own pace, start date, and notes. A parking lot holds ideas not ready to become projects yet. Decisions can block launch-critical steps. Completed and removed items go to an Archive, not straight to deletion.

**This model does not change.** The task/step/block data structure, the burndown math, the Backlog/Candidates/Parking-lot/Archive workflow, and the terminology-flexibility feature are the working core of the app and are considered done and good. Any new work (architecture or gamification) builds on top of this model or reads from it; it does not replace, duplicate, or route around it.

## What's changing: distribution and architecture

### Decision: drop Claude Artifact support (and any AI-tool library-item consideration)

Sidequest will no longer be distributed or maintained as a Claude Artifact, or as a "library item" for another AI chat tool. This was a deliberate trade, made explicitly (2026-09-21), not an accidental casualty of the architecture change. **This part of the decision is already in effect today**, independent of whether the multi-file rebuild described below has happened yet — it governs the current single-file v1 code too, not just the planned v2:

- An Artifact must be one self-contained HTML file with everything inline. Splitting the app into logical files/modules with a shared design-token source is incompatible with that constraint.
- The original reason Sidequest was pursued as an Artifact was distribution and reach through Claude's user base, not a belief that the artifact sandbox made the planner itself better. Once the sandbox's constraints (single file, no build step, restricted CDN allowlist, no `window.claude`/capability APIs, no reliable persistence on the Claude mobile app) stopped being worth the reach they bought, dropping them was the right call.
- Practical effect: no more publishing to a claude.ai artifact link. `assets/` and repo-only icon files are no longer "extras that must be optional" — they're just normal project assets now. External scripts are no longer restricted to Claude's CDN allowlist. `window.claude`/`window.storage` are irrelevant; there was never a real API by that second name, and the real one (`db`) is off the table along with the rest of the artifact model.
- Also effective immediately, in the current v1 code: no user-facing mention of Claude, an AI, an artifact, or a library item anywhere in `index.html` or `README.md`, including generic/hedged phrasing about "apps that embed a web page." A mobile-storage warning was written and then removed the same day (2026-09-21) once this became the settled direction — see `sentinel-notes/storage-persistence-design-brief.md`'s "Superseded" section. The underlying platform fact that warning described (an embedded webview can lack `localStorage` access) has not changed; the decision is that it's no longer worth designing or writing around, given Sidequest's narrowed distribution surface.

### Decision: static multi-file site, still no backend

Sidequest becomes a normal small static site: separate HTML/CSS/JS files (structure to be decided — see Open Questions), served from GitHub Pages exactly as today, with **no server-side code and no database.** This is not a "web app with a backend" in the sense of accounts, sync, or a server process — it's the same static-file model Sidequest already uses, just organized as more than one file.

Consequence: **persistence does not change.** Still `localStorage`, still per-browser, still no cross-device sync, still the same backup/restore workflow. No in-app warning exists anymore about embedded/in-app browser contexts (removed 2026-09-21, see the decision above) — but the underlying "a browser is required, `localStorage` doesn't sync" fact still applies to anyone using the GitHub Pages site on multiple devices; there's just no copy calling that out explicitly.

### Decision: shared design-token source of truth

Currently, design tokens are a `:root` CSS custom-properties block inside the single `index.html` file. In the multi-file structure, this becomes an actual shared file (e.g. `tokens.css` or similar) that every component/module references, rather than one block sitting at the top of one big file. This is a natural consequence of splitting into multiple files, not a new idea layered on top — the current token *values* and *naming* are expected to carry over; the mechanism they live in changes.

## What's changing: per-project scoping for decisions, milestones, and the Launch page

### Problem, found via user testing (2026-09-21)

Decisions, milestones, and the Launch checklist ("kofi" page, internally named after the user's own Ryewired Ko-fi fundraising campaign — a real, specific example of the underlying problem, not just a hypothetical) are currently global and shared across every project in the app, with no per-project scoping at all. This is one underlying data-model gap surfacing in three places, not three separate problems:

- `state.decisions` (index.html) is one flat list. Any decision, regardless of which project it's conceptually about, appears on the single shared Launch/"kofi" page. Its only field even indirectly related to a project is an optional `step` link (a decision can link to a specific step; if it does, the step's task's `.project` is the only way to infer which project the decision is "about"). A decision with no linked step, which the dialog explicitly allows, has no relationship to any project at all.
- `state.milestones` is the same shape of gap, one level simpler: entries only ever have `text` and `date`. There is no project field and no linking mechanism of any kind (not even an optional step link like decisions have), so a milestone can never be associated with a specific project today, full stop.
- A step's `kofi` flag (marking it "Launch-critical") works the same way as decisions: any task from any project can have a step flagged for the Launch checklist, and it all lands on that one shared page.
- Concretely: the user is building a specific fundraising campaign called "Ko-fi" as a subtask of their Ryewired project. Because Sidequest's built-in Launch-checklist feature is also internally called "kofi," and because it's global rather than scoped, there's a real risk of the two concepts bleeding into each other, and more generally, any project's launch-critical steps/decisions currently show up mixed in with every other project's on one page, with no way to keep them separate.
- The confirmation message a user sees after adding a decision ("Decision added on the Launch page") is accurate today, but doesn't convey that this is one page shared by every project, which is why a newly created decision can feel like it "disappeared" if the user expected something project-specific.
- The New Decision and New Milestone dialogs cannot offer a "which project" picker today, because neither underlying data structure has a field to hold that answer yet — this isn't a missing UI control, it's a missing column.

### Decision: scope decisions, milestones, and the Launch checklist per-project

Rather than a copy-only fix, this becomes a real data-model change, deliberately deferred for proper design work rather than implemented ad hoc (2026-09-21). Treating decisions and milestones as one combined design effort, since they're the same underlying gap (a small, previously-flat sub-object needing project association) rather than two unrelated features. Needs answers before implementation:

1. **Does each project get its own Launch page, or does one shared page filter/group by project?** A separate page per project changes navigation/pinning (currently one `kofi` pin in `state.pins`); a filtered single page keeps one page but adds a project-selector or grouped sections.
2. **Does a decision or milestone require a project, or can either stand alone** (e.g. for the "Next project" placeholder, which isn't a real named project yet, or a milestone that's genuinely about the whole planner rather than one project)? `decisions` currently link to a step (`step: "..."`), not directly to a project — project scoping would likely be derived from the linked step's task's project, but decisions can also exist with no linked step at all (`step: ""` is valid), which needs its own answer. Milestones have no existing link of any kind to build on, so this is a more open question for them: a direct `project` field added to the milestone itself is the more obvious shape, rather than trying to invent an indirect link the way decisions have one.
3. **Migration for existing saved data.** Every current user's saved decisions, milestones, and launch-flagged steps have no project association today. `normalize()` needs a real default/backfill strategy (e.g. infer project from the linked step for decisions, an explicit "unassigned"/general bucket for milestones with no obvious project to infer) so existing data doesn't break or silently vanish.
4. **Pinning behavior.** If Launch becomes per-project, does the pin model change (one pin per project's Launch page) or does the single `kofi` pin become a launcher to a project-picker?
5. **Timeline display.** Milestones currently render on the single shared Timeline regardless of project. If milestones become project-scoped, decide whether the Timeline still shows all of them together (now labeled by project) or whether project-scoping changes how/where they render there too.

This is a v1 architecture fix (the current single-file app), independent of the v2 pivot (multi-file rebuild, gamification) described below — it should likely be designed and possibly implemented before or during the v1 backlog work, not bundled into the v2 rebuild.

## What's changing: gamification layer

### Decision: HP is pure emotional flavor, not a real stakes mechanic

Hitpoints/health, inspired by Habitica's HP mechanic, will exist in Sidequest as a **prominent, emotionally resonant readout**, not a real loss condition. Explicitly decided (2026-09-21): no actual penalty, no data loss, no feature lockout tied to HP reaching zero. It should *feel* like it matters in the moment (visually, emotionally) without ever punishing the user in a way that damages their actual planning data or blocks their work. This is a deliberate divergence from Habitica's model, chosen because Sidequest's existing audience and tone (calm, low-pressure, side-project planning) doesn't fit a genuinely punishing mechanic.

What "prominent" means in practice (visual placement, exact triggers) is still open — see below.

### Reference points (researched 2026-09-21, not yet decided which ideas Sidequest adopts)

- **Habitica**: the most mechanically deep of the three references. Public/general knowledge (not independently re-verified against Habitica's own docs in this session due to a fetch access issue): HP decreases when scheduled "Dailies" are missed, and reaching 0 HP triggers a real, consequential loss (historically framed as a `"death"` state with a real setback). Also has XP/leveling, gold, classes with skills, and party/guild social accountability. **Sidequest is explicitly not adopting the real-consequence half of this model** (see decision above) — HP as flavor only.
- **Do It Now**: avatar-based RPG framing. Completing tasks grants XP and "gold," gold buys user-defined real-world rewards. Has difficulty/importance ratings per task, auto-fail for overdue items, skill-binding (a task can feed a specific character skill/stat), and calendar/chart-based progress visualization.
- **LifeRPG**: similar RPG framing (quests = daily duties, leveling, skills), notable mainly for flexible task organization by multiple priority dimensions rather than one axis, and an energy-based task categorization.

### Open questions to resolve before implementation

These need real decisions, not defaults, before the gamification layer can be built:

1. **XP/Score mapping.** Should XP per completion reuse the existing burndown `weight()` concept (a task's step count, minimum 1) directly, so game-score and burndown accounting are always the same number? Or should score be a separate, independently-tuned value?
2. **HP trigger and readout.** What specifically decreases HP — the existing `isLate()` overdue concept? Something else? Is HP a single global number, or per-project? What does the "prominent" readout actually look like (a top-of-page bar like a game HUD, a badge, something else)?
3. **Reward triggers.** Visual/audio effects on completion — which completion events trigger them (a step, a task, a whole project)? Is this the cheapest, lowest-risk gamification element to prototype first, independent of the bigger architecture change (nothing about a completion animation requires the multi-file rebuild)?
4. **File/module structure.** What the actual split looks like (by view, by concern, a components directory, a build step or none) is not yet decided.
5. **Naming/theming.** Whether "Hitpoints" and RPG terminology apply everywhere or are optional/skinnable, and how they interact with the existing Block/Sprint/Iteration/Phase/Week terminology flexibility, is undecided.

## Decision log

- 2026-09-21: Investigated cross-device/cross-app persistence options (`window.storage`, Claude `db` capability, a flat-file DB). Concluded none fit Sidequest's goals without unacceptable tradeoffs (Claude-only lock-in, shared storage ceiling, architecture mismatch). Decided to keep `localStorage` and instead document the Claude-mobile-app limitation clearly (shipped same day, see `sentinel-notes/TODO.md`'s Done section, `mobile-storage-warning`).
- 2026-09-21: Reconsidered whether Sidequest is worth pursuing as "just another web planner" given the crowded market. Concluded the real differentiators (solo-project burn-down modeling, terminology flexibility, decision-linked launch checklist) are product-design choices independent of Claude-artifact distribution, and are worth continuing to build regardless of distribution model.
- 2026-09-21: Decided to pivot to a multi-file static site (dropping Claude Artifact support) with an added gamification layer, HP as flavor only. This document created to track that pivot's design decisions before implementation.
