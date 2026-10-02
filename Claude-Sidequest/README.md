# Sidequest for Claude

`sidequest.html` is a single self-contained file. Publishing it as your own Claude artifact gives you a version of Sidequest that saves your data to your Claude account instead of your browser, so it works the same across your devices.

## First-time setup

1. Download `sidequest.html` from this folder.
2. Start a new conversation with Claude and upload the file.
3. Ask Claude to publish it as an artifact, and mention that it needs both the `db` and `downloads` capabilities. For example:

   > Please publish this as an artifact. It needs the `db` capability for storage and the `downloads` capability so Save backup works.

4. Open the artifact Claude gives you. That link is yours. Bookmark it or pin it, since it's how you'll get back to your data.

Without both capabilities declared at publish time, the app won't work right: no `db` means nothing saves, and no `downloads` means the Save backup button can't offer you a file.

## Updating to a new version

When a new `sidequest.html` is released, you can update without losing your data, but only if you republish onto your **existing** artifact rather than creating a new one.

In the same conversation where your artifact already lives (or by giving Claude the link to it), upload the new file and ask Claude to update your existing Sidequest artifact with it — not to publish it as a new one. For example:

> Here's an updated version of Sidequest. Please update my existing Sidequest artifact with it, not a new one.

Your saved data lives with the artifact itself, not with any particular copy of the file, so an in-place update keeps it. Publishing as a brand-new artifact instead creates an empty database with no path back to your old data, so don't do that by mistake.

## Sharing this with someone else

By default, only you can edit your artifact. If you make it public or share the link, other people can view it, but their changes won't save back to your data unless you specifically grant them edit access.

If you do grant someone edit access, keep in mind this version has no conflict handling: if two people edit the same task or project at the same moment, whoever saves last wins, silently. That's fine for occasional shared use, but it isn't built for two people actively working in it at the same time.

## What doesn't carry over from the web version

This file has no Claude or AI branding of its own — that's intentional, so the file itself is portable. This README is the only place that explains the Claude-specific setup, since using this version requires a Claude account and a Claude conversation to publish it.
