# Sidequest: Design Document (v2 direction)

Status: draft, actively being developed. This document describes a planned architectural and product direction, not the current shipped state. Where it diverges from what exists in `index.html` today, the current code is the v1 baseline and this document is where v2 is being decided before implementation starts.

## Why this document exists

Sidequest is changing in two ways at once: how it's built (single self-contained file to a multi-file static site) and what it is (a plain planner to a planner with a gamification layer). Both changes are substantial enough to warrant deciding the shape of things before writing code, rather than discovering the shape through implementation. This document is that record.

## What Sidequest is (unchanged)

Sidequest is a project planner for someone juggling several side projects at once: a backlog of tasks, each broken into steps, scheduled into blocks (renamed Sprint/Iteration/Phase/Week per user preference), with a burn-down chart tracking progress against a plan. Projects have their own pace, start date, and notes. A parking lot holds ideas not ready to become projects yet. Decisions can block launch-critical steps. Completed and removed items go to an Archive, not straight to deletion.

**This model does not change.** The task/step/block data structure, the burn-down math, the Backlog/Candidates/Parking-lot/Archive workflow, and the terminology-flexibility feature are the working core of the app and are considered done and good. Any new work (architecture or gamification) builds on top of this model or reads from it; it does not replace, duplicate, or route around it.

## What's changing: distribution and architecture

### Decision: drop Claude Artifact support

Sidequest will no longer be distributed or maintained as a Claude Artifact. This was a deliberate trade, made explicitly (2026-09-21), not an accidental casualty of the architecture change:

- An Artifact must be one self-contained HTML file with everything inline. Splitting the app into logical files/modules with a shared design-token source is incompatible with that constraint.
- The original reason Sidequest was pursued as an Artifact was distribution and reach through Claude's user base, not a belief that the artifact sandbox made the planner itself better. Once the sandbox's constraints (single file, no build step, restricted CDN allowlist, no `window.claude`/capability APIs, no reliable persistence on the Claude mobile app) stopped being worth the reach they bought, dropping them was the right call.
- Practical effect: no more publishing to a claude.ai artifact link. `assets/` and repo-only icon files are no longer "extras that must be optional" — they're just normal project assets now. External scripts are no longer restricted to Claude's CDN allowlist. `window.claude`/`window.storage` are irrelevant; there was never a real API by that second name, and the real one (`db`) is off the table along with the rest of the artifact model.

### Decision: static multi-file site, still no backend

Sidequest becomes a normal small static site: separate HTML/CSS/JS files (structure to be decided — see Open Questions), served from GitHub Pages exactly as today, with **no server-side code and no database.** This is not a "web app with a backend" in the sense of accounts, sync, or a server process — it's the same static-file model Sidequest already uses, just organized as more than one file.

Consequence: **persistence does not change.** Still `localStorage`, still per-browser, still no cross-device sync, still the same backup/restore workflow, still the same Claude-mobile-app warning already shipped (2026-09-21) — that warning becomes somewhat less relevant once there's no Claude Artifact to open from the mobile app, but the underlying "a browser is required, localStorage doesn't sync" fact still applies to anyone using the GitHub Pages site on multiple devices.

### Decision: shared design-token source of truth

Currently, design tokens are a `:root` CSS custom-properties block inside the single `index.html` file. In the multi-file structure, this becomes an actual shared file (e.g. `tokens.css` or similar) that every component/module references, rather than one block sitting at the top of one big file. This is a natural consequence of splitting into multiple files, not a new idea layered on top — the current token *values* and *naming* are expected to carry over; the mechanism they live in changes.

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

1. **XP/Score mapping.** Should XP per completion reuse the existing burn-down `weight()` concept (a task's step count, minimum 1) directly, so game-score and burn-down accounting are always the same number? Or should score be a separate, independently-tuned value?
2. **HP trigger and readout.** What specifically decreases HP — the existing `isLate()` overdue concept? Something else? Is HP a single global number, or per-project? What does the "prominent" readout actually look like (a top-of-page bar like a game HUD, a badge, something else)?
3. **Reward triggers.** Visual/audio effects on completion — which completion events trigger them (a step, a task, a whole project)? Is this the cheapest, lowest-risk gamification element to prototype first, independent of the bigger architecture change (nothing about a completion animation requires the multi-file rebuild)?
4. **File/module structure.** What the actual split looks like (by view, by concern, a components directory, a build step or none) is not yet decided.
5. **Naming/theming.** Whether "Hitpoints" and RPG terminology apply everywhere or are optional/skinnable, and how they interact with the existing Block/Sprint/Iteration/Phase/Week terminology flexibility, is undecided.

## Decision log

- 2026-09-21: Investigated cross-device/cross-app persistence options (`window.storage`, Claude `db` capability, a flat-file DB). Concluded none fit Sidequest's goals without unacceptable tradeoffs (Claude-only lock-in, shared storage ceiling, architecture mismatch). Decided to keep `localStorage` and instead document the Claude-mobile-app limitation clearly (shipped same day, see `sentinel-notes/TODO.md`'s Done section, `mobile-storage-warning`).
- 2026-09-21: Reconsidered whether Sidequest is worth pursuing as "just another web planner" given the crowded market. Concluded the real differentiators (solo-project burn-down modeling, terminology flexibility, decision-linked launch checklist) are product-design choices independent of Claude-artifact distribution, and are worth continuing to build regardless of distribution model.
- 2026-09-21: Decided to pivot to a multi-file static site (dropping Claude Artifact support) with an added gamification layer, HP as flavor only. This document created to track that pivot's design decisions before implementation.
