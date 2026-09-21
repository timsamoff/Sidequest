# Sidequest

A small project planner that runs entirely in your browser. There is no account, no server, and no build step. Open `index.html` and start.

It is built for someone juggling several projects at once: a few tasks in each, a rough timeline, and a place to park the ideas that are not ready yet.

## What it does

- **Today:** the one task to work on next, anything overdue, and a burn-down chart.
- **Schedule:** every task with steps, notes, and a status. Move tasks between sprints, or park them in the Backlog until you are ready.
- **Projects:** each project has its own page, start date, pace, and notes. Choose which candidate gets the next slot.
- **Timeline:** every project on one timeline, with optional estimates and your own milestones, plus the full-width burn-down.
- **Launch checklist:** a pinned page built from any step you flag as "Launch", with decisions linked to the steps they unblock. Tick a step here or in the Schedule and both stay in sync.
- **Parking lot:** a dedicated page for loose ideas and waiting items that are not competing for the next project slot.
- **Archive:** completed tasks and anything you remove land here first. Restore items, or delete them for good after a warning.
- **Search:** press `/` anywhere to search tasks, steps, notes, projects, decisions, milestones, and the Archive.
- **Help:** short instructions for everything, inside the app.
- **Settings:** call each stretch of work a Block, Sprint, Iteration, Phase, or Week. Pick a date format and a theme, choose when completed tasks are archived, back up and restore, or start fresh.

It works on phones too, in a web browser. On a small screen the sidebar becomes a bottom tab bar, and the menu button lists every page. See **Your data** below if you plan to use Sidequest as a Claude Artifact on a phone. The Claude mobile app itself cannot save your work.

## Try it

Open `index.html` in a browser. The first time, you will see sample projects so you can look around. When you are ready, open **Settings** and choose **Start fresh**.

To host it, turn on GitHub Pages for this repository (Settings, then Pages, then deploy from the `main` branch and the root folder). The site is a single page plus a few icon files.

The page loads two fonts from Google Fonts. Without a connection it falls back to your system fonts.

## Your data

Everything is saved in your own browser with `localStorage`. Nothing is sent anywhere. That also means:

- Data does not sync between devices or browsers.
- Clearing your browser data clears your planner.
- **Settings, Backup and restore** shows your data as text you can copy and paste back in later. Do this now and then.

**Important if you're using Sidequest through Claude:** it must be open in an actual web browser tab to save anything. That includes the Claude website on your computer or phone, or opening the artifact link directly in your phone's browser. The Claude mobile app itself does not give web pages access to browser storage, so if you open Sidequest inside the Claude app, it will look and work normally, but nothing you do will be saved once you leave or close it. There's no warning from the app when this happens, since it isn't something Sidequest can detect on its own. If you're on mobile, always open it through your browser, not the Claude app.

## Tests

The tests use a simulated browser, so they run in Node without any setup beyond the install:

```
npm install
npm test
```

Node 22 or newer is required.

## Files

- `index.html`: the whole app.
- `assets/`: the icon in SVG and PNG sizes, used for the browser tab and phone home screen.
- `tests/`: the test runner and the checks for the sample data and core features.

## Credit

Version 1.0.0. © [Tim Samoff](https://samoff.com)
