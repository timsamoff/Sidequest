# Sidequest: ground rules for any session

These are the rules that must hold even in a session that cannot see the project's private notes (a phone or remote session).

- Never run `git push` unless the owner says so in that message. Committing locally is fine when asked.
- Commit messages are one terse line in the author's own voice, describing the change. No co-author lines. The only trailers allowed are `Sentinel-Version-Skip:` and `Sentinel-Override:`.
- A commit that changes `app/*.js` or `css/*.css` also needs a version bump: `package.json`, `APP_VERSION` in `app/state.js`, the version assertion in `tests/template.test.js`, and the `?v=` on both stylesheet links in `index.html`. Then run `npm run build:artifact`.
- Run `npm test` before reporting work done.
- If `Sentinel-Notes/HANDOFF.md` and `Sentinel-Notes/session-log.md` are visible, rewrite the handoff from scratch and add a dated log line before stopping. If they are not visible, say so in the final message and list what the next session needs to know.
- Never write the published Artifact's `meta/version` stamp unless the owner asks.
- At the end, say the exact version and whether it is pushed.
