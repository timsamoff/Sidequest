# Sidequest as an artifact

`sidequest.html` is a single self-contained file. Hand it to an AI app builder and you get your own copy of Sidequest that saves your data to your account instead of your browser, so it works the same across your devices. This folder covers two builders: Claude and Muse.

Sidequest itself has no account and never will. These versions do need an account with the builder you choose, because building the app and storing its data both happen there. The plain web version (`index.html`) needs no account of any kind.

The raw link to the file, used in the prompts below:

```
https://raw.githubusercontent.com/timsamoff/Sidequest/main/Sidequest-Artifact/sidequest.html
```

## Claude

### First-time setup

1. Start a new conversation with Claude.
2. Send this message:

   > Please fetch this file and publish it as an artifact: https://raw.githubusercontent.com/timsamoff/Sidequest/main/Sidequest-Artifact/sidequest.html. It needs the `db` capability for storage and the `downloads` capability so Save backup works.

3. Open the artifact Claude gives you. That link is yours. Bookmark it or pin it, since it's how you get back to your data.

Claude fetches the file itself, so there's nothing to download or upload.

If fetching doesn't work, or you'd rather upload: download `sidequest.html` from this folder, upload it to a new conversation, and ask Claude to publish it as an artifact with the `db` and `downloads` capabilities.

Both capabilities matter. Without `db`, nothing saves. Without `downloads`, the Save backup button can't give you a file.

## Muse

Muse can't provision a database for a shared artifact on its own, so you ask your own Muse to build the app from the repo. You end up with your own private copy and your own private Muse database. Nothing is shared with anyone.

### First-time setup

1. Start a new chat with your own Muse.
2. Paste this prompt. Muse fetches the file from the repo itself, so there's nothing to download or attach:

```
Please fetch https://raw.githubusercontent.com/timsamoff/Sidequest/main/Sidequest-Artifact/sidequest.html and build it as a private fullstack web artifact for me, and call it Sidequest. I understand the build can take 20 to 30 minutes. Keep all of its features, behavior, and design exactly as they are. To avoid gaps, first inventory every interactive element in the original file — every button, dialog, toggle, setting, view, and import flow — then verify each one works identically in the build. Examples of what must survive the port: the sound effects (audible when the Sound Effects setting in Options is ON), the completion graffiti effect (turned off by the Completion FX setting in Options), the GitHub version-check and update-prompt flow. Migrate all of the app's persisted state, which is the whole JSON object stored in the browser localStorage key "sidequest-template-v1" (quests, tasks, decisions, Workshop ideas, sidebar pins, burndown history, and settings, plus its start-date and sprint-length defaults), into the Muse database so my data persists in my Muse environment. Start with empty data. Before handing the app over, work through the full inventory click-testing each item — and fix anything that errors, stays silent, or behaves differently instead of working. Do not rely on console errors alone; some failures (like swallowed audio errors) leave no trace there.
```

Muse builds the app in the background and hands you a card to open it. Your data lives only in your Muse environment.

If fetching doesn't work, you can attach the file instead. Save `sidequest.html` from this folder (or from the repo: https://github.com/timsamoff/Sidequest/blob/main/Sidequest-Artifact/sidequest.html, using the Raw button), attach it to the chat, and paste the same prompt with "Please fetch ... and build it" changed back to "Please build the attached sidequest.html".

The first time you open the app, it asks for permission to check for updates online. Choose "Always allow" so the version check runs without asking again.

## Updating to a new version

When a new version is released, a banner on the Today page says so. It holds a prompt you can copy, and the same prompt works in both builders:

> Please update my Sidequest artifact with the latest version, keeping all of my existing data.
> https://raw.githubusercontent.com/timsamoff/Sidequest/main/Sidequest-Artifact/sidequest.html

Paste it into the conversation where you built your app, or give the builder the link to your artifact. Your data lives with your account, not in the file, so an update keeps it.

On Claude, update your **existing** artifact. Publishing the file as a brand-new artifact creates an empty database with no path back to your old data. If you do it by accident, your old artifact and its data are still there; go back to that one.

## Sharing

By default, only you can edit your copy. If you make it public or share the link, other people can view it, but their changes won't save back to your data unless you grant them edit access.

If you do grant edit access, there is no conflict handling. If two people change the same task or quest at the same moment, whoever saves last wins, silently. That's fine for occasional use but not for two people working in it at once.

## What's different from the web version

- **Where your data lives.** The web version keeps it in your browser, on one device. These versions keep it in your Claude or Muse account.
- **No AI branding in the file.** That's on purpose, so the file stays portable. This README is the one place that explains the builder-specific setup.
- **The installable app and its Refresh button** are part of the web version only.
