Run several unrelated pieces of work at the same time, then report back once.

The user lists things they want done, comma- or newline-separated. Treat each as
one task. They will NOT explain the rules — everything you need is below.

## 1. Split and locate

Turn the list into concrete tasks. For each one, find the file(s) it touches
before launching anything — grep, don't guess. A task whose target you cannot
identify is not ready to dispatch; ask about that one and proceed with the rest.

## 2. Check for collisions — this is the important step

Two agents editing the same file will conflict and cost more than the
parallelism saved. Before dispatching, confirm no two tasks touch the same file.

**Never split across parallel agents:**
- The big components — `Study.jsx`, `DojoHQ.jsx`, `StoryReaderImmersive.jsx`.
  One agent may own one of them; two agents must never share one.
- The shared core — `srs.js`, `mastery.js`, `storyReading.js`, `syncQueue.js`,
  `languageTheme.js`, `utils.js`, `navConfig.js`. Half the app imports these.
- `ROADMAP.md` / `docs/BACKLOG.md`. Two agents editing the same list conflict on
  merge, and the resolution is always guesswork about which item belongs where.
  **One agent makes the roadmap edit, at the end**, covering everything that
  landed. (These reach Discord when the PR merges to `main` — nothing syncs from
  a branch, so there is no rush to get the edit in early.)
- Migrations in `supabase/migrations/`. Ordering is load-bearing — see
  `docs/BACKLOG.md`. Run these sequentially, never in parallel.

If two tasks collide, say so in one line and run those two in sequence while the
rest go in parallel. Don't silently drop one.

## 3. Dispatch

Run the non-colliding tasks concurrently, each with `isolation: "worktree"` so
they get separate checkouts and cannot stomp each other.

Give every agent this context:
- Read `CLAUDE.md` first — especially §6 coding rules (no TypeScript, no complex
  regex, inline style objects only, no `localStorage`, no `<form>`) and §7
  Supabase safety rules.
- Extract logic into a plain `.js` module with a `.test.js` beside it rather than
  adding another branch inside a big component (§3).
- A bug fix ships with the regression test that would have caught it.
- Must finish with `npm run lint` (0 errors), `npm test`, and `npm run build`
  all passing. Do not commit otherwise.
- Do not push, do not open a PR, do not edit `ROADMAP.md` — the parent handles
  integration.

## 4. Integrate

When the agents return, do this yourself — don't hand it back to the user:
1. Bring the work together on the current branch, one task at a time.
2. Run `npm run lint`, `npm test`, `npm run build` on the combined result. The
   agents each verified in isolation; the combination is unverified until now.
3. Fix anything the merge broke.
4. Update `ROADMAP.md` once, covering everything that landed.
5. Commit (one commit per task, descriptive titles — they become the Discord
   #announcements text) and push the branch.

## 5. Report — keep this short

`CLAUDE.md` "How to answer" applies: the user has ADHD and long reports are
unusable. Report in **five lines or fewer**:

- One line per task: what changed, and ✅ or ❌.
- One line for the combined verification result.
- If something failed or was skipped, say which and why — one line, no detail
  dump. Offer the detail; don't pre-emptively give it.

Never paste diffs, test output, or file listings into the report unless asked.

## Rules

- **Anything not clearly parallel, run in sequence instead.** If task 2's shape
  depends on task 1's outcome, they are not parallel work — say so in one line
  and do them in order.
- **Two or three tasks is the sweet spot.** Above four, the user is reviewing a
  queue rather than a change; ask whether to split across two runs.
- **Small tasks don't need an agent.** Under ~15 minutes of work, just do it
  inline — the worktree, branch and hand-off cost more than the task.
- **Never push to `main`** and never open a PR unless asked.
