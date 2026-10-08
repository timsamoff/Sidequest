# Sidequest

A small quest planner that runs entirely in your browser. There is no account, no server, and no build step. Open `index.html` and start.

It is built for someone juggling several quests at once: a few tasks in each, a rough timeline, and a place to workshop the ideas that are not ready yet.

## What it does

- **Today:** the one task to work on next, anything overdue, and a burndown chart.
- **Quests:** "In progress" lists each active quest with open tasks and what’s next up. Below it, any Complete or not-yet-started quest. A candidate is edited in a dialog (notes, start date, due date, and pace) and promoted to active with one click when it’s ready. Each active quest also has its own page where you can rename it and edit its notes and schedule; its page also charts its own Timeline and Burndown, right under the Schedule that drives them. Running behind? Slip schedule, above the Timeline, moves that quest’s still-incomplete tasks later by the number of days you pick — completed tasks and the Backlog are not affected, and it can be undone. Mark a quest Complete at any time, or let it complete itself once every task is done; either way you can send it to the Vault right then or leave it visible in Quests, and Reopen it later if it isn’t really done. Pin any quest to the sidebar. Link related quests to each other, and mark a link "Launch critical" if one quest genuinely can’t ship without the other.
- **Tasks:** every task with steps, notes, and a status. Give a task a start date, a due date, and an estimated time in hours (a quest’s page shows how much estimated time is left, and a task opens right there), or move it to the Backlog until you are ready. Rename a task, step, or quest with the pencil beside it. Add a decision to any step, and answering it checks the step off.
- **Timeline:** every quest on one timeline, with optional estimates and your own milestones (select one to edit or remove it), plus the full-width burndown and a table of its counts. The burndown counts tasks and is recorded automatically as you work (nothing is typed in), so adding tasks later shows as the line stepping up. Point at, tap, or arrow through any point on a burndown to see its counts and tasks.
- **Launch checklist:** on each quest’s own page, a checklist built from any of its steps you flag as "Launch", plus a line for any Launch-critical linked quest that tracks that quest’s own status automatically. Tick a step there or in Tasks and both stay in sync.
- **Workshop:** a dedicated page for loose ideas and waiting items that are not competing for the next quest slot. Edit an idea’s text and multiline note any time, or turn it into a quest candidate. The note carries over as the quest’s Notes. Lists show the first two lines of a note.
- **Vault:** quests and ideas you’ve sent there land here. A quest stays fully viewable, read only, until you restore it, and restoring it brings its tasks back too.
- **Search:** press `/` anywhere to search tasks, steps, notes, quests, decisions, milestones, and the Vault.
- **Field guide:** short instructions for everything, inside the app.
- **Options:** name each stretch of work Block, Sprint, Iteration, Phase, or Week, and set its default length in days. Pick a date format and a theme, turn the splash screen on or off, back up and restore, or start fresh.

It works on phones too, in a web browser. On a small screen the sidebar becomes a bottom tab bar, and the menu button lists every page.

## Try it

Open `index.html` in a browser. The first time, you will see sample quests so you can look around. When you are ready, open **Options** and choose **Start fresh**.

To host it, turn on GitHub Pages for this repository (Settings, then Pages, then deploy from the `main` branch and the root folder). The site is a single page plus a few icon files.

The page loads two fonts from Google Fonts. Without a connection it falls back to your system fonts.

## Your data

Everything is saved in your own browser with `localStorage`. Nothing is sent anywhere. That also means:

- Data does not sync between devices or browsers.
- Clearing your browser data clears your planner.
- **Options, Backup and restore:** **Save backup** writes your data to a file wherever you choose, and **Restore backup** loads one back after a warning that it replaces everything. After two weeks without a backup, Today reminds you.

## Tests

The tests use a simulated browser, so they run in Node without any setup beyond the install:

```
npm install
npm test
```

Node 22 or newer is required.

There is also a real-browser accessibility check, which needs a real Chromium install first:

```
npx playwright install chromium
npm run test:a11y
```

## Files

- `index.html`: the whole app.
- `assets/`: the icon in SVG and PNG sizes, used for the browser tab and phone home screen.
- `tests/`: the test runner and the checks for the sample data and core features.

## Credit

Version 1.0.0. © [Tim Samoff](https://samoff.com). Licensed under [GPLv3](LICENSE).
