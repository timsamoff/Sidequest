<img  src="assets/sidequest-icon-512.png"  width="128px"  alt="Sidequest">

# Sidequest

A lightweight project planner for juggling several projects.

## I just made the perfect project management system... for me. And maybe you'll like it too!

I wanted something simple. Something that would help me keep track of multiple projects, organize tasks, figure out what I should be working on, and actually get things done. I didn't want to spend more time managing my projects than working on them.

So I made Sidequest.

Sidequest is a lightweight, easy-to-use project management system. There's no complicated process to learn, no particular way you're expected to work, and no elaborate system to maintain. Just organize your projects, add some tasks, and get to work.

Learning how to use Sidequest takes about a minute. There's a quick tutorial to show you around, and then you're on your own... in a good way.

If you're already using Trello or Todoist, you can import your existing projects and tasks into Sidequest. And if you don't need anything fancy, Sidequest works just as well as a simple to-do list.

You can use Sidequest wherever you want. Run it right in your browser, or install it as a Progressive Web App (PWA) for offline access. The browser and PWA versions save your data locally, and won't sync between devices. You can also use Sidequest as a Claude or Muse Artifact, which saves your data to your account and makes it available across all of your devices. Claude and Muse operate independently, so choose one.

Sidequest has plenty of features to help you organize and keep track of your work, but you don't have to use all of them. Use as much or as little as you need. It's your system.

So give Sidequest a try! It's free, and maybe it'll become your new favorite way to keep track of all your side quests.

*"Even the smallest step carrieth thee onward."* (Sidequest)

## Getting started

Pick whichever way suits you. You can switch later, but your data doesn't travel between versions on its own. You can carry it over with a backup file (see [Saving and syncing your data](#saving-and-syncing-your-data)).

- **Browser:** Open Sidequest at [samoff.com/Sidequest](https://samoff.com/Sidequest) and start working. It needs no account.
- **Installed app (PWA):** In a browser that supports it, open **Options** and choose **Install Sidequest**. It then opens in its own window and works offline. Some phones don't show an install button, so use your browser's **Add to Home Screen** instead.
- **Claude:** Build your own copy as a Claude Artifact. See [Creating a Claude or Muse version](#creating-a-claude-or-muse-version).
- **Muse:** Build your own copy as a Muse Artifact. See the same section.

A short tutorial walks you through adding a quest, giving it a task, and starting it. To run it, choose **Play tutorial** in the Welcome box or in the **Field guide**. You'll also see a few sample quests so you can look around. When you're ready for a clean slate, open **Options** and choose **Start fresh**.

## Features

Sidequest has its own vocabulary. A project is called a **quest**, and a quest is made of **tasks**, which can have **steps**.

### Quests and tasks

- **Quests:** Each quest has its own page for its tasks, notes, and schedule. A new quest starts as a **candidate**, where you can flesh it out. Choose **Promote** when you're ready to start it, and **Mark complete** when you're done.
- **Tasks:** Give a task a name, a status, notes, and a checklist of steps. A due date, a start date, and an estimate in hours are optional. A task with no due date sits in the quest's **Backlog** until you're ready for it.
- **Errands:** A plain to-do list for small things that don't deserve a quest. Give an errand a due date if you like, and check it off when it's done.

### Knowing what to work on

- **Today:** Shows your next task, anything overdue, and a burndown chart of your progress.
- **Quests page:** Lists the quests you're working on, with what's next up in each, plus the ones still waiting to start and the ones you've finished.

### Keeping things tidy

- **Workshop:** A place for ideas that aren't ready to be quests. When one is, choose **Make candidate**.
- **Pinning:** Pin the quests you use most to the sidebar.
- **Vault:** Quests and ideas you send here are kept out of the way. A vaulted quest stays viewable, read only, until you restore it.

## Additional features

None of these are required. They're there when you want them.

- **Timeline and burndown:** See every quest on one calendar, and track planned versus actual progress, with a forecast of when you'll finish at your current pace.
- **Milestones and launch checklist:** Mark any dated task as a milestone, or flag the tasks that must be done before a quest can launch.
- **Decisions:** Attach a question to any step, and answering it checks the step off.
- **Quest links:** Link related quests together.
- **Search:** Press `/` anywhere to search everything.
- **Slip schedule:** If a quest runs behind, move its unfinished tasks later in one step, with undo.
- **Quest giver export:** Send a client a read-only copy of a quest, with your contact details if you want them.
- **Options:** Rename each stretch of work (Block, Sprint, Iteration, Phase, or Week), set its length, and choose a date format, a theme, and whether you hear sound effects.
- **Field guide:** Short instructions for everything, inside the app.

## Importing existing projects

Open **Options** and use **Import from Trello** or **Import from Todoist**. Each import creates a new quest, so importing the same file twice makes two quests. You see a summary of what will be imported before anything is saved.

- **Trello:** Export your board as JSON from Trello and choose that file. Cards become tasks, with their descriptions as notes and their due dates kept. Checklist items become steps, and ones you ticked stay ticked. Cards without a due date go to the Backlog. Archived cards are skipped. Labels, members, comments, attachments, and custom fields aren't imported.
- **Todoist:** Export a project as CSV from Todoist and choose that file. Tasks come across with their due dates and notes. Todoist leaves completed tasks out of its export, so they won't appear, and a file with exactly 300 tasks may be incomplete, because Todoist caps its exports there. Subtasks become ordinary tasks, and labels aren't imported. Dates like "today," "tomorrow," and "in 3 days" are turned into real dates. Repeating tasks are left unscheduled.

## Saving and syncing your data

**Browser and installed app:** Your data is saved in your browser on the device you use, and nothing is sent anywhere. That means:

- It doesn't sync between devices or browsers.
- Clearing your browser's data clears your quests.
- **Save backup** in **Options** writes everything to a file, and **Restore backup** loads one back. After two weeks without a backup, Today reminds you.

**Claude and Muse:** Your data is saved to your own account, so it's there on every device you sign in to. Claude and Muse keep separate data and don't sync with each other, and neither reads the browser version's data. To move quests between versions, save a backup in one and restore it in the other.

## Creating a Claude or Muse version

Sidequest's single-file version runs as an artifact on Claude and Muse. You need an account with the one you choose, because building the app and storing its data both happen there. Copy the prompt for your platform, paste it into a new chat there, and it builds your copy. Updating, sharing, and what differs from the browser version are covered in [Sidequest-Artifact/README.md](Sidequest-Artifact/README.md).

### Claude

Start a new conversation with Claude and send this message. Sidequest needs the `db` capability to save anything, and the `downloads` capability so **Save backup** can give you a file.

```
Please fetch this file and publish it as an artifact: https://raw.githubusercontent.com/timsamoff/Sidequest/main/Sidequest-Artifact/sidequest.html. It needs the `db` capability for storage and the `downloads` capability so Save backup works.
```

Open the artifact Claude gives you. That link is yours, so bookmark it, since it's how you get back to your data. If fetching doesn't work, download `sidequest.html` from the `Sidequest-Artifact` folder, upload it to a new conversation, and ask Claude to publish it as an artifact with the `db` and `downloads` capabilities.

### Muse

Start a new chat with your own Muse and paste this prompt. It asks Muse to build the app from this repository and keep your data in your Muse database.

```
Please build the Sidequest fullstack app as a private artifact for me, and call it Sidequest, from https://raw.githubusercontent.com/timsamoff/Sidequest/main/Sidequest-Artifact/sidequest.html. Store all of the app's data (the whole JSON object it keeps in the browser localStorage key "sidequest-template-v1") in the Muse database so it persists, starting empty.

Keep every feature as is, including the sound effects and the GitHub version check, and keep its update prompt word for word. Set window.sidequestHosted = true before the app starts, so it shows its hosted wording about where your data is saved.

Keep this Google Fonts stylesheet in the <head> of the client's index.html, and make sure it survives the build into the published bundles, because the launch quotes are sized for Spectral and overflow their two-line box in the Georgia fallback:
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;600&family=Public+Sans:wght@400;500;600&display=swap">

When it's built, launch the app several times to confirm every launch quote fits its two-line box, and click-test every button, dialog, and import before handing it over.
```

Muse builds the app in the background and hands you a card to open it. The first time you open it, it asks for permission to check for updates online. Choose **Always allow** so the version check runs without asking again. If fetching doesn't work, attach `sidequest.html` to the chat instead and replace the link in the prompt's first sentence with "the attached sidequest.html".

## License and credits

© [Tim Samoff](https://samoff.com). Licensed under [GPLv3](LICENSE).
