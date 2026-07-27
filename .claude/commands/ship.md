Verify the current changes and ship them to GitHub.

Run all three checks, in order, and show me the output of each:

1. `npm run lint` — must report **0 errors in `src/`**.
2. `npm test` — the full vitest suite. Every spec must pass.
3. `npm run build` — must succeed.

If ANY of the three fails, STOP. Do not commit. Show me what failed and fix it
first. These are the same three checks CI runs (`.github/workflows/ci.yml`), so a
failure here is a failure that would block the merge anyway — catching it now
just saves a round trip.

If all three pass:

4. Show me `git status` and `git diff --stat` so I can see what's about to ship.
5. Suggest a short, specific commit message based on what changed (or ask me for
   one). It becomes the Discord #announcements text when this reaches `main` —
   write it for a reader, not a machine.
6. Stage **explicitly by path** — `git add <the files you changed>`. Never
   `git add .`: it sweeps up scratch files, local env files and half-finished
   work that happen not to be gitignored.
7. Commit, then `git push -u origin <current-branch>`.
8. Confirm the push succeeded and print the branch name.

Rules:
- Never commit without all three checks passing first.
- **Never push directly to `main`.** A push to `main` deploys to real users
  immediately. If I'm on `main`, create a branch first and push that, then tell
  me to open a PR.
- If there is nothing to commit, say so instead of making an empty commit.
- If the change added a feature or fixed something users see, remind me to move
  the matching item in `ROADMAP.md` (it syncs live to Discord).
- Only update `CLAUDE.md` if a *rule or convention* changed — not to record what
  happened this session. That's what `git log` is for.
