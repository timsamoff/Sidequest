<img  src="assets/sidequest-icon-512.png"  width="128px"  alt="Sidequest">

# Sidequest

Sidequest is a lightweight project planner that runs entirely in your browser, with no account, no backend, and no build step. The web app keeps your quests on the device you use. To carry your quests across devices, use the Artifact version, which keeps them in your own account. It needs an account with the builder you choose.

It is built for someone juggling several quests at once: a few tasks in each, a rough timeline, and a place to workshop the ideas that are not ready yet.

## What it does

- **Today:** the one task to work on next, anything overdue, and a burndown chart.
- **Quests:** **In progress** lists each active quest with open scheduled tasks and what's next up. **Pending** lists quests with nothing scheduled yet, and **Completed** lists finished ones. A candidate has its own page, like any quest, where you add its tasks, notes, and schedule, then **Promote** it with one click when it's ready.
- **Quest page:** Each active quest has its own page where you can rename it and edit its notes and schedule. Its **Timeline** and **Burndown** sit right under the **Schedule** that drives them. If a quest runs behind, **Slip schedule** moves its unfinished tasks later by the number of days you pick. Completed tasks and the **Backlog** stay put, and you can undo it. **Pin** any quest to the sidebar. Link related quests to each other, and mark a link **Launch critical** if one can't ship without the other.
- **Finishing a quest:** Mark a quest complete at any time, or it will complete automatically once every task is done. Either way, you can send it to the **Vault** right then or leave it in **Quests**. If you need to **Reopen** it, you can.
- **Quest Giver Export:** Send a client a read-only copy of any active or complete quest. Choose whether it includes your contact info and the Quest Giver.
- **Tasks:** every task with steps, notes, and a status. Give a task a start date, a due date, and an estimated time in hours (a quest's page shows how much estimated time is left, and a task opens right there), or move it to the **Backlog** until you are ready. Rename a task, step, or quest with the pencil beside it. Add a decision to any step, and answering it checks the step off.
- **Timeline:** every open quest on one timeline, with optional estimates and milestones (any task with a due date can be one, and its diamond opens the task), plus the full-width burndown and a table of its counts. The burndown counts tasks and is recorded automatically as you work (nothing is typed in), so adding tasks later shows as the line stepping up. A dotted **Forecast** line projects when you'll finish at your current pace. Point at, tap, or arrow through any point on a burndown to see its counts and tasks.
- **Launch checklist:** on each quest's own page, a checklist of the tasks you flag **Launch critical** from their own detail. A launch task carries a badge in **Tasks** and on this checklist, and it's done once its own status is Completed.
- **Workshop:** a dedicated page for loose ideas that aren't ready to be quests yet. Edit an idea's text and multiline note any time, or turn it into a quest candidate. The note carries over as the quest's Notes. Lists show the first two lines of a note.
- **Vault:** quests and ideas you've sent there land here. A quest stays fully viewable, read only, until you restore it, and restoring it brings its tasks back too.
- **Search:** press `/` anywhere to search tasks, steps, notes, quests, ideas, decisions, and the Vault.
- **Field guide:** short instructions for everything, inside the app.
- **Options:** name each stretch of work Block, Sprint, Iteration, Phase, or Week, and set its default length in days. Pick a date format and a theme, turn the splash screen on or off, back up and restore, import from Trello or Todoist, or start fresh.
- **Install:** add Sidequest to your phone or computer from your browser and it will open in its own window. Install the app from the **Options** page.

It works on phones too, in a web browser. On a small screen the sidebar becomes a bottom tab bar, and the menu button lists every page.

## Try it

The first time you open it, you will see sample quests so you can look around. When you are ready, open **Options** and choose **Start fresh**.

The page loads two fonts from Google Fonts. Without a connection it falls back to your system fonts.

## Your data

Everything is saved in your own browser with `localStorage`. Nothing is sent anywhere. That also means:

- Data does not sync between devices or browsers.
- Clearing your browser data clears your planner.
- **Options, Backup and restore:** **Save backup** writes your data to a file wherever you choose, and **Restore backup** loads one back after a warning that it replaces everything. If the app can't save a file directly (some embedded views), it shows the text to copy instead, and the backup isn't counted until you save it. After two weeks without a backup, Today reminds you.
- The Artifact version keeps its own data in your account. It doesn't read the web version's data.

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

- `index.html`: the page that loads the app.
- `app/` and `css/`: the app's code and styles.
- `manifest.json` and `sw.js`: let the web app be installed on a device.
- `assets/`: the icon in SVG and PNG sizes, used for the browser tab and phone home screen.
- `Sidequest-Artifact/`: a single-file version for hosted app builders that keep your data in your own account. Its README has the setup steps.
- `tests/`: the test runner and the checks for the sample data and core features.
- `scripts/`: builds the single-file version.

## Credit

© [Tim Samoff](https://samoff.com). Licensed under [GPLv3](LICENSE).
