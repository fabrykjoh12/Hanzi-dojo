Verify the current changes and ship them to GitHub.

Run the canonical verification and show me the output:

```bash
npm run verify:pr
```

That one command IS the gate — CI's `check` job runs exactly it
(`.github/workflows/ci.yml`), so a pass here and a pass there mean the same
thing. Don't run its stages individually and don't substitute a shorter set;
`package.json` defines what it covers, and that definition is allowed to grow
without this file changing.

If it fails, STOP. Do not commit. Show me what failed and fix it first — a
failure here is a failure that would block the merge anyway, so catching it now
just saves a round trip.

Two things it deliberately does not cover, so don't treat a green run as
covering them: Playwright e2e is its own PR job (`e2e.yml`), and the native
artifact has its own tier — `npm run verify:native`.

**Run `npm run verify:native` too if the change touches any of:**
`src/**` (every screen compiles into the store bundle) · `public/**` ·
`android/**` · `ios/**` · `package.json` / `package-lock.json` ·
`vite.config.js` · `index.html` · `capacitor.config.json` · the font modules
(`nativeFonts.mjs`, `fetch-webfonts.mjs`) · the verifiers under `tools/`.

CI enforces the same list: `native.yml` runs on every PR, decides internally
whether those paths moved, and reports a `native-gate` status either way. So a
missed local run shows up there rather than at a release cut.

The store *web bundle* is covered here already: `build:public` is one of the
`verify:pr` stages.

If it passes:

1. Show me `git status` and `git diff --stat` so I can see what's about to ship.
2. Suggest a short, specific commit message based on what changed (or ask me for
   one). It becomes the Discord #announcements text when this reaches `main` —
   write it for a reader, not a machine.
3. Stage **explicitly by path** — `git add <the files you changed>`. Never
   `git add .`: it sweeps up scratch files, local env files and half-finished
   work that happen not to be gitignored.
4. Commit, then `git push -u origin <current-branch>`.
5. Confirm the push succeeded and print the branch name.

Rules:
- Never commit without `npm run verify:pr` passing first.
- **Never push directly to `main`.** A push to `main` deploys to real users
  immediately. If I'm on `main`, create a branch first and push that, then tell
  me to open a PR.
- If there is nothing to commit, say so instead of making an empty commit.
- If the change added a feature or fixed something users see, remind me to move
  the matching item in `ROADMAP.md` (it posts to Discord once this merges to
  `main`, so it needs to read as user-facing language).
- Only update `CLAUDE.md` if a *rule or convention* changed — not to record what
  happened this session. That's what `git log` is for.
