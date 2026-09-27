# Sidequest

A small project planner that runs entirely in your browser. There is no account, no server, and no build step. Open `index.html` and start.

It is built for someone juggling several projects at once: a few tasks in each, a rough timeline, and a place to park the ideas that are not ready yet.

## What it does

- **Today:** the one task to work on next, anything overdue, and a burndown chart.
- **Projects:** "In progress" lists each active project with open tasks and what's next up. Below it, any Complete or not-yet-started project. A candidate is edited in a dialog (notes, start date, due date, and pace) and promoted to active with one click when it's ready. Each active project also has its own page where you can rename it and edit its notes and schedule; its page also charts its own Timeline and Burndown, right under the Schedule that drives them. Running behind? Slip schedule, above the Timeline, moves that project's still-incomplete tasks later by the number of days you pick — completed tasks and the Backlog are not affected, and it can be undone. Mark a project Complete at any time, or let it complete itself once every task is done; either way you can archive it right then or leave it visible in Projects, and Reopen it later if it isn't really done. Pin any project to the sidebar. Link related projects to each other, and mark a link "Launch critical" if one project genuinely can't ship without the other.
- **Tasks:** every task with steps, notes, and a status. Move tasks between sprints, or park them in the Backlog until you are ready. Rename a task, step, or project with the pencil beside it. Add a decision to any step, and answering it checks the step off.
- **Timeline:** every project on one timeline, with optional estimates and your own milestones (select one to edit or remove it), plus the full-width burndown. Point at, tap, or arrow through any week on a burndown to see its counts and tasks.
- **Launch checklist:** on each project's own page, a checklist built from any of its steps you flag as "Launch", plus a line for any Launch-critical linked project that tracks that project's own status automatically. Tick a step there or in Tasks and both stay in sync.
- **Parking lot:** a dedicated page for loose ideas and waiting items that are not competing for the next project slot. Edit an idea's text and multiline note any time, or turn it into a project candidate. The note carries over as the project's Notes. Lists show the first two lines of a note.
- **Archive:** archived projects and ideas land here. A project stays fully viewable, read only, until you restore it, and restoring it brings its tasks back too.
- **Search:** press `/` anywhere to search tasks, steps, notes, projects, decisions, milestones, and the Archive.
- **Help:** short instructions for everything, inside the app.
- **Settings:** name each stretch of work Block, Sprint, Iteration, Phase, or Week, and set its default length in days. Pick a date format and a theme, turn the splash screen on or off, back up and restore, or start fresh.

It works on phones too, in a web browser. On a small screen the sidebar becomes a bottom tab bar, and the menu button lists every page.

## Try it

Open `index.html` in a browser. The first time, you will see sample projects so you can look around. When you are ready, open **Settings** and choose **Start fresh**.

To host it, turn on GitHub Pages for this repository (Settings, then Pages, then deploy from the `main` branch and the root folder). The site is a single page plus a few icon files.

The page loads two fonts from Google Fonts. Without a connection it falls back to your system fonts.

## Your data

Everything is saved in your own browser with `localStorage`. Nothing is sent anywhere. That also means:

- Data does not sync between devices or browsers.
- Clearing your browser data clears your planner.
- **Settings, Backup and restore** shows your data as text you can copy and paste back in later. Do this now and then.

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
