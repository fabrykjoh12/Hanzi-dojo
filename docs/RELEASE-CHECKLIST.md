# 🚦 Release checklist

The release gate for Hanzi Dojo (HD-P14). **Every merge to `main` is a release**:
it deploys to real users immediately and posts to Discord #announcements. This
page is the one list to walk before that merge — and the shorter list to walk
after it. Keep it honest: if a step doesn't apply, say so in the PR, don't skip
it silently.

## 1 · Automated gate (every PR — CI enforces)

- [ ] `npm run lint` — **0 errors in `src/`**, no new warnings.
- [ ] `npm test` — full vitest suite green (~3,000 specs).
- [ ] `npm run build` — clean.
- [ ] Playwright e2e green (`e2e.yml` on the PR), **including the visual
      screenshots** (`tests/e2e/visual.spec.js`). An intentional visual change
      is blessed by dispatching **Actions → Visual regression baselines** on
      the branch and reviewing the committed image diff — never by loosening
      the comparison.
- [ ] New behaviour ships **with its test**; anything touching scheduling,
      scoring, progression or story matching has a spec (CLAUDE.md §8).
- [ ] Check the PR's checks are attached to the **head commit** — a
      `manhua-art-fetch` or baseline commit pushed by a workflow gets no CI of
      its own (see `docs/BACKLOG.md`). Push a real commit on top if in doubt.
- [ ] The two `Workers Builds` checks are **always red and always ignorable**
      (dead Cloudflare hookup — `docs/BACKLOG.md` §Auth/hosting). Everything
      else red blocks the merge.

## 2 · Data gate (only when a migration or data script ships)

- [ ] Migration is **idempotent**, committed to `supabase/migrations/`
      **before** it is applied, and applied exactly as committed (no
      improvised DDL).
- [ ] §7 safety rules hold: no vocabulary deletes, no card deletes outside the
      reset RPC, never write `is_easy = true` or `ease_factor`,
      `level_unlocks` stays append-only.
- [ ] Ordering dependencies checked against `docs/BACKLOG.md` §Database before
      any overlapping data script runs.
- [ ] After applying: run the Supabase **security advisors** (`get_advisors`) —
      an unprotected table sat exposed for two days once because nothing in CI
      checks this.
- [ ] `docs/ARCHITECTURE.md` updated if the schema changed.

## 3 · Content gate (only when published content changed)

- [ ] Actions → **Content utilities → `check-published`** run against prod,
      and its warnings actually read — they're real (held-chapter gaps,
      numbering, previews).
- [ ] New story chapters passed the authored/serial validators
      (`authoredStories.test.js` / the generator's checks) before publish.

## 4 · Docs gate (every meaningful change)

- [ ] `ROADMAP.md` moved/added its line — it syncs to Discord instantly, so
      write it in user-facing language.
- [ ] `docs/BACKLOG.md` updated if a known issue was fixed or found.
- [ ] Commit + PR titles are descriptive — the merge posts them to
      #announcements.

## 5 · After the merge (same day)

- [ ] Production loads and the changed surface works once deployed (Vercel
      tracks `main`).
- [ ] `/dashboard` → client errors panel: no new error shape appearing after
      the deploy.
- [ ] The Discord #announcements / #roadmap posts landed and read sensibly.

## 6 · Before a *wider* push (beta announcement, invite wave — not every merge)

- [ ] Real-device manual pass per `docs/TESTING.md` (iOS Safari audio,
      offline replay especially).
- [ ] Trust pages (`/privacy` `/terms` `/support` `/methodology`) reviewed by
      the owner — they are drafts until then.
- [ ] Fresh-account walkthrough: signup → onboarding → first session → first
      story → reset a language from Profile.
- [ ] Open items in `docs/PM-BOARD.md`'s milestone table re-read: nothing
      **blocked** that the announcement would promise.
