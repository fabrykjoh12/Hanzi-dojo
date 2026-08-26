# 🛠️ Engineering backlog

Granular fixes, tech-debt, and ops tasks. **Internal — not community-facing.**
The public plan lives in [`ROADMAP.md`](../ROADMAP.md), which auto-posts to the
`#roadmap` Discord channel; keep raw bug detail and dashboard-only steps here so
that stays clean. Move items to **Done** as they land (or promote user-facing
ones to the roadmap).

Active milestone, task assignments, ownership boundaries and merge order live in
[`docs/PM-BOARD.md`](PM-BOARD.md) (not Discord-synced). This file stays the
long-lived engineering backlog; the board holds short-lived execution state.

### Reading a red check: CI is authoritative, a sandbox is not

Three kinds of red look identical in a terminal and mean completely different
things. Classify before you debug:

1. **A GitHub CI failure is real.** `check` (lint + unit + build) and
   `playwright` on a PR are the authority. Fix the code.
2. **A Playwright failure inside a remote Claude sandbox is usually the
   environment** — timing or font rasterisation, not behaviour. See the section
   directly below. **A snapshot diff produced against CI baselines on different
   font rendering is not a regression**, and app code must never be changed to
   make sandbox-only pixels match.
3. **The two `Workers Builds` checks are dead and not fixable from this repo** —
   see the Cloudflare entry under *Auth / email / hosting*. They fail in zero
   seconds because there is no wrangler config here, and there must not be one:
   adding it would turn every push to `main` into an automatic Worker deploy of
   a backend that ships by hand. The fix is two dashboard clicks outside this
   repo. **Do not spend a session trying to make them green from application or
   CI code.**

### Playwright in a remote sandbox is slower than the 30s default allows

A remote Claude session runs the e2e suite against a cold Vite dev server on a
shared container. Individual navigations that take ~1s on the GitHub runner take
10–15s here, so any spec doing several `page.goto`s inside one test blows the
30s default timeout and fails as a *timeout*, not an assertion — which reads
exactly like a product regression and is not one.

Observed 2026-08-15 on the release-integration branch: `home-v3-geometry.spec.js`
(three navigations per test) failed 6/6, and `home.spec.js`'s back-navigation
test failed 3/3, at the default timeout. Both passed **7/7 and 8/8** with
`--timeout=180000`, and both were green on GitHub CI for the same commit.

- **Do not raise the timeout in `playwright.config.js`.** CI passes at 30s;
  raising it globally would hide a real slowdown from the runner that matters.
  Pass `--timeout` on the command line in a sandbox instead.
- **`visual.spec.js` cannot pass here at all.** Its baselines are captured on
  the CI runner image (see the config comment); sandbox font rasterisation
  differs by ~5% of pixels against a 2% threshold. Two specs — `landing mobile`
  and `trust pages privacy desktop` — fail locally by design. CI is the only
  authority for those.
- Before calling a local e2e failure a regression, re-run it with a raised
  timeout and check the same test on GitHub CI.

### An art-fetch commit lands without CI (know it before you merge)

`manhua-art-fetch` commits the panels it downloads back to the branch, using the
workflow's own `GITHUB_TOKEN`. **GitHub does not trigger workflows for a push
made with that token** — deliberately, so a workflow cannot loop by pushing. So
the commit at the head of a manhua PR is routinely one that `ci.yml` and
`e2e.yml` never saw, and the PR's check list will look thin rather than red.

Two consequences worth carrying:

- Do not read "no failing checks" as "CI passed" on one of these PRs. Look at
  which commit the checks are attached to.
- To get a real run, push one more commit yourself (any real change on top), or
  verify the exact tree locally with lint + test + build before merging. The
  art-fetch commit only adds `.webp` files, so the risk is low — but "low" is
  not the same as "checked", and this project has already shipped blank panels
  once by assuming.

### The SPA rewrite makes a missing file look like a 200 (fixed, but know it)

`vercel.json` rewrites `/(.*)` → `/index.html`. That is what makes deep links
work on refresh, and it also means **a request for a file that does not exist
returns 200 with the app shell, not 404.** Two things were built on the wrong
assumption before this was understood:

- `public/sw.js` cached that HTML under the asset's URL (cache-first stores
  anything `ok`), so an image that shipped late stayed broken on every device
  that had asked for it early. Fixed in v7: `isShellHtml` refuses to store it and
  drops an existing poisoned hit, and the version bump clears the old caches.
- `publish-manhua.mjs`'s art preflight checked `res.ok` only, so it would have
  passed on every missing panel. It now requires `content-type: image/*`.

**Anything else that probes for a file's existence over HTTP has the same trap.**
Check the content type, not the status.

## Database
- [x] **`20260730090000_manhua_presentation_rename.sql` — APPLIED (verified 2026-08-03: constraint is the final `('paced','chat','scene','manhua')` form, 8 rows on `manhua`, 0 on `manga`).** The `presentationOf` alias in `src/readerMode.js` and the `LEGACY_PROGRESS_PREFIX` fallback in `src/manhuaProgress.js` are now deletable per the plan below — though the IndexedDB fallback is cheap insurance for devices that saved positions under the old key and is fine to keep a while longer. Original entry: Retags the fourth presentation `'manga'` → `'manhua'` (Chinese word for the form; the Japanese one was a slip). Idempotent: it widens `stories_presentation_check` to accept both spellings, UPDATEs the one row, then narrows the constraint to `'manhua'` alone. **Order does not matter** — `presentationOf` in `src/readerMode.js` aliases the old tag to the new one, so the app deploy and this migration can land in either order without the live episode dropping to a plain paced story in between. Once it is applied everywhere, that alias and the `LEGACY_PROGRESS_PREFIX` fallback in `src/manhuaProgress.js` (which reads reading positions saved under the old `manga:` IndexedDB key) can both be deleted.
- [x] **APPLIED 2026-07-28 — `20260728210000_fix_language_reset_missing_writing_stats.sql`.** "Reset HSK 3.0 progress" failed outright with `relation "public.writing_stats" does not exist`, so a language's progress could not be cleared. Root cause was the §10 classic: `20260605224500_add_writing_stats.sql` sat in the repo unapplied while the reset RPC that deletes from that table was applied. It cost more than the reset — `src/Writing.jsx` reads and upserts `writing_stats` on every writing answer, so writing practice was discarding its results. The fix creates the table idempotently AND guards the RPC's delete with `to_regclass`, so a missing optional table can never abort a reset again. Applied through the dashboard SQL editor (the sandbox's MCP write gate was unreachable that session). **Worth a check when convenient:** reset a language from Profile and confirm it completes, and that a writing answer now persists across a reload.

- [ ] 🟡 **Data defect: the vocabulary row `白` (bái) has `level = null`.**
  `id 77d6738b-e7f8-4608-aad0-f16404bfb291`, language `chinese`, system `hsk_3`,
  `is_active = true` — with **no `audio_path`, no Azure `tts_audio` row, and no
  `example_sentence`.** It is the only Chinese vocabulary row in the database
  with no playable audio of any kind.
  Surfaced 2026-08-15 while scoping the Azure S0 re-licensing migration, and
  **deliberately kept out of it** — that migration re-renders existing audio
  under a paid tier; this row has none to re-render, so voicing it would be new
  content generation smuggled into a licensing fix.
  A null level is the more interesting half: level gates study sets, so the row
  is effectively unreachable by any learner. Decide whether it should carry a
  level (and then get audio + an example sentence) or be deactivated
  (`is_active = false` — never deleted, §7.1). **Do not repair as part of any
  audio run.**

## Auth / email / hosting
- [ ] **Custom SMTP — LIVE TEST PENDING.** Configured 2026-07-18: Brevo is the sending provider; `hanzi-dojo.com` shows **Authenticated** in Brevo (DKIM `brevo1/brevo2._domainkey`, `brevo-code` TXT, DMARC `p=none` — all added in Cloudflare DNS, the authoritative nameserver; Vercel only hosts). Supabase custom SMTP wired to `smtp-relay.brevo.com:587`, sender `no-reply@hanzi-dojo.com`. **Still to verify:** send a real magic-link/sign-up to an external inbox and confirm it (a) arrives (not spam) and (b) shows From `no-reply@hanzi-dojo.com`. Brevo "Branding" (the `em`/`img.em`/`r.em` CNAMEs) shows *Not branded* — optional, tracking-link cosmetics only, doesn't block sending.
- [ ] **Auth URL config** — set Site URL = `https://hanzi-dojo.com` and add redirect allowlist `https://hanzi-dojo.com/**` + `http://localhost:5173/**`. Fixes the login redirect that jumps to the raw github.io host. *(dashboard)*
- [ ] **Google sign-in shows the Supabase URL — OWNER DECISION 2026-08-07: do the FREE fix only (part 1); the custom domain is deliberately deferred.** So `bvqvturqupbggxaeihvi.supabase.co` stays the OAuth callback domain, and **every provider must be configured against it** — Apple's Services ID return URL included. Revisiting later is not just a toggle: it means re-editing the Apple Services ID, re-verifying the domain with Apple, and updating Google's authorized redirect URI, so treat this as settled unless there's a reason to pay the ~$10/mo add-on (Supabase org is on Pro, which makes the add-on available but does not include it). Original entry: the Google consent screen reads "continue to `bvqvturqupbggxaeihvi.supabase.co`" because that's Supabase's OAuth **callback** domain. NOT a code bug (`src/Auth.jsx` already sets `redirectTo` = the app origin). Two-part dashboard fix: **(1)** Google Cloud Console → APIs & Services → OAuth consent screen → set **App name** "Hanzi Dojo" + logo + authorized domain `hanzi-dojo.com`, then publish/verify → Google names the app "Hanzi Dojo" instead of the project ref (biggest visible win, free). **(2)** To remove the `…supabase.co` "continue to" line entirely, set up a **Supabase Custom Domain** (`auth.hanzi-dojo.com` — Pro add-on + a CNAME in Cloudflare), then add the new `https://auth.hanzi-dojo.com/auth/v1/callback` as an authorized redirect URI on the Google OAuth client. Re-test the full Google flow after. *(dashboard + DNS)*
- [ ] **Turn off the retired GitHub Pages site** — repo Settings → Pages → Source → None. The deploy workflow is already removed; this disables the last-built site.
- [ ] **🔴 Two Cloudflare Workers projects fail CI on every commit — ONE-TIME DASHBOARD CLICK, confirmed not fixable in code (2026-07-31).** The two red checks are named `Workers Builds: hanzi-dojo` and `Workers Builds: hanzidojo`; they are check runs posted by the **Cloudflare Workers and Pages GitHub App**, one per Worker service that has a Workers Builds git integration pointed at this repo. Verified on PR #175: both completed as `failure` with `started_at == completed_at` (a **zero-second** build) and an empty `output.text` — the signature of a build that dies before it starts, because there is **no wrangler config in the repo at all** (`wrangler.toml` / `.jsonc` / `.json` — none, and none in git history) and no deploy script. A full grep of the repo finds **nothing Cloudflare-related in CI**: no workflow, no config, no secret, so there is nothing here to delete and no repo-side switch to flip. `docs/DEPLOY.md` §Cloudflare is explicit that Cloudflare is **DNS only, not hosting** — Vercel builds and serves (`vercel.json`, production tracks `main`) — and that `worker/index.js` is deployed by hand. **Do not "fix" this by adding a wrangler config:** that would turn every push to `main` into an automatic Worker deploy of a backend that ships manually on purpose. The fix, both halves outside this repo: **(1)** Cloudflare dashboard → Workers & Pages → open `hanzi-dojo`, then `hanzidojo` → **Settings → Build** → disconnect the GitHub repository (do **both**; one alone leaves the other red), or delete the Worker services if the standalone `*.chatgpt.site` build is retired; **(2)** equivalently/bluntly, repo Settings → GitHub Apps → *Cloudflare Workers and Pages* → Configure → drop `Hanzi-dojo` from the app's repo access. Neither is merge-blocking today (`main` is unprotected, so these were never required checks) — the cost is noise that trains everyone to ignore red. Now more clearly vestigial: Dojo HQ runs on Supabase, so `worker/index.js` only serves that standalone build. *(dashboard)*

Already shipped (code side): `signUp` now sends `emailRedirectTo`; hardcoded github.io links replaced with `BRAND_URL`; app consolidated on Vercel (base `/`).

## Data safety
- [x] **Transactional grading — SHIPPED AND APPLIED (verified in prod 2026-08-07: `grade_card` function exists).** Collapsed the separate writes (card update, review log, daily activity) into the single security-definer RPC `public.grade_card()` (`20260722120000`, PR #116). The client falls back to separate writes only if the RPC is ever absent.
- [ ] **Real-device verification pass** — offline grade replay, iOS/Safari flashcard + reader audio, and Web Push reminders end-to-end. All built and unit-tested but never exercised on a live device.

## Admin tooling
- [x] **Dojo HQ migration APPLIED 2026-07-27.** `dojo_items`, `dojo_comments`, `dojo_attachments` exist in prod with RLS on. Still open: a second person needs `is_admin = true` before they can see the board (`/make-admin`), and the board has not been exercised end-to-end against real data.
- [x] **`_reading_backup_20260725` had RLS disabled — FIXED 2026-07-27** (`20260727150000_enable_rls_on_reading_backup.sql`, applied). The pre-fix readings snapshot was created without RLS, leaving 1,871 rows readable *and writable* by anyone with the public anon key. Found by the Supabase security advisor. Nothing reads the table, so RLS is enabled with **no policies** deliberately: PostgREST denies everyone, the service key still reaches it for a restore. **Worth a habit:** run `get_advisors` after any migration — this sat exposed since 25 July and nothing in CI would have caught it.
- [ ] **Dojo HQ — schema notes.** `/hq` is backed by the app's own Supabase project and keyed to the signed-in account (`src/dojoSupabaseClient.js`), replacing the `localStorage` device board that could never be shared. `20260727140000_add_dojo_hq.sql` created `dojo_items`, `dojo_comments`, `dojo_attachments`, all with RLS where every policy requires `exists (select 1 from profiles where id = auth.uid() and is_admin)`, plus a security-definer `dojo_hq_members()` and a private `dojo-attachments` bucket. Membership *is* `profiles.is_admin` — there is no workspace or invite system, every admin shares one board. If the tables are ever missing the screen names the migration rather than showing an empty board (CLAUDE.md §10).
- [x] **`src/devTools.js` rule violations — FIXED 2026-08-07.** `masteredCardRow` now delegates to `creativeCardRow(mode: 'mastered')` (real FSRS stability, `is_easy` false, no `ease_factor`), `learningCardRow` dropped its `ease_factor` write, and the `.claude/commands/unlock.md` SQL was rewritten the same way. Regression specs assert neither row ever carries `ease_factor` or `is_easy: true`.
- [ ] **Creative mode is untested against a real account.** The admin sandbox on `/dashboard` (level jump, learn/master N words, force N cards due, reset) is unit-tested and writes only rows matching `user_id = session.user.id`, but has never been run against live data. Exercise it on the maintainer's own account before relying on it — especially the level jump, which appends to the append-only `level_unlocks` (§7.5).

## Scheduling
- [x] **Timezone-correct reminders — ALREADY SHIPPED; this entry was stale (verified 2026-08-07).** `send-review-reminders.mjs` has not fired on a plain UTC hour for some time: the per-user "is it their hour?" decision lives in the pure, tested `src/reminderSchedule.js`, which reads the wall clock in `profiles.timezone` and de-duplicates via `reminder_last_sent_at` (so the repeated hour on a DST fall-back day can't double-send). **All four columns — `timezone`, `reminder_last_sent_at`, `reminder_hour_utc`, `reminder_enabled` — exist in prod**, so the legacy fixed-UTC fallback path is not the one running, and `App.jsx`'s `recordTimezone` keeps each profile's zone current.
  ⚠️ **Worth knowing before investing more here: nobody has reminders on.** Prod counts on 2026-08-07: **0 of 31 profiles** have `reminder_enabled = true` (9 have a timezone recorded). So this feature is live, correct, and completely unexercised — which makes it a product question (is the toggle discoverable? is the browser permission prompt the blocker?) rather than an engineering one. It also folds into the native-push work, since Web Push is dead inside an iOS app anyway (`docs/PRE-RELEASE-CHECKLIST.md` §0b).

## Learning quality
- [x] **Ordering dependency between the two reading fixes — MOOT 2026-08-03.** The migration was applied first (see below), so the hazard window is closed. `normalize-readings.mjs` itself is now style-only (see next entry) and its header documents the same ordering rule if it is ever run.
- [x] **Pronunciation pinning for spaced readings — FIXED AT THE SOURCE (entry was stale).** `readingToPhonemes` in `src/pinyin.js` now treats a space (and an apostrophe) as the syllable boundary the author wrote, so a spaced reading like `jiù shì` pins correctly as-is — verified 2026-08-03 (`readingToPhonemes('jiù shì')` → `jiu4 shi4`). No data change is needed for audio; `normalize-readings.mjs` survives only as an optional house-style joiner (its own header now recommends leaving readable spaced forms alone). The old "79% of HSK 3–6 has no phoneme hint" framing described the pre-fix helper.
- [x] **HSK 3–6 wrong readings — MIGRATION APPLIED 2026-08-03.** All 54 rows corrected in prod (verified: 厂→`chǎng`, 忽略→`hūlüè`, 成功→`chénggōng`, 一切→`yíqiè`, 不必→`búbì`…). **Follow-up RESOLVED 2026-08-07:** the owner added the Azure secrets and the staged `tts-flashcards` run executed — dry run verified 21 records/84 clips, confirm run generated 84/84 with 0 failures (~240 characters), and all 84 rows are verified in `tts_audio`. The 21 words now play correct Azure audio (it takes precedence over the legacy `audio_path`). A real-device listen of a couple of them (厂, 美) closes the loop. Original staging notes: the regen was staged and one click away — `regen-content.yml` now has a `tts_ids` input for targeted runs, and a dry run on 2026-08-03 confirmed it selects exactly those 21 records (84 clips, ~240 characters — pennies) — but the same run's env dump shows `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` are STILL unset in Actions, so a confirm run cannot bill. Once the secrets exist: Actions → Regenerate vocabulary content → task `tts-flashcards`, language `chinese`, `tts_limit` 25, `tts_confirm` ticked, and `tts_ids` = the 21 ids from `select id from vocabulary where language='chinese' and system='hsk_3' and char_length(word)=1 and word in ('厂','合','约','胖','追','圈','广','抢','藏','匹','保','台','土','朝','美','诗','神','青','井','清','塞')`. Azure clips take precedence over the legacy `audio_path` at play time. Original entry kept below for the record.
- [ ] ~~**HSK 3–6 wrong readings — MIGRATION WRITTEN, NOT APPLIED.**~~ 54 of the ~1,870 HSK 3–6 words shipped with a wrong `reading`, because HSK 3–6 came from a bulk CC-CEDICT pass while HSK 1–2 was hand-curated. Four classes: CC-CEDICT's ASCII `u:` for ü leaked in verbatim (忽略 `hū lu:è`, 战略, 策略); a rare reading beat the everyday one (厂 `hǎn` not `chǎng`, 转 `zhuǎi`, 追 `duī`, 广 `yǎn`, 藏 `Zàng`, 作, 抢, 圈, 胖, 合, 约, 匹 `pī`→`pǐ`); a proper-noun capital on ordinary words (成功 `Chéng gōng`, 和平, 美元, 网络, 资源, 大众, 通道, 时代, 现代, 将军 + 12 single chars); and **dropped tone sandhi** on 17 words (一切 `yī qiè`→`yíqiè`, 不必→`búbì`, 不见→`bújiàn`…) that HSK 1–2 gets right (一下 `yíxià`, 不错 `búcuò`). ⚠️ Precise scope of the audio impact: only the **single-character** words actually pin, so only those are currently *spoken* wrong (厂 really does say "hǎn"); the multi-syllable spaced ones never pinned, so for them the bug is the **displayed** pinyin only. Found by diffing against the CC-CEDICT `dict_entries` already in the project — note 1,864/1,871 matched *some* attested reading, which is exactly how a polyphone error hides. All replacements are CC-CEDICT-attested and yield syllable-aligned phonemes; none of the 54 is in a learner's deck yet. Fix: apply `supabase/migrations/20260724120000_fix_hsk3_6_readings.sql` (idempotent — matches on the known-bad value), **then re-run Actions → task `audio-hsk3-6`**. ⚠️ Do *not* null `audio_path` to force that: the generator's work list is `vocab.filter(v => v.audio_path)` with `upsert: true`, so clearing the path *excludes* a word. Deliberately left alone: genuine proper nouns (上帝, 圣诞节, 国会, 佛) and ~14 words where both readings are defensible in context (待 dāi/dài, 答 dā/dá, 结 jiē/jié, 泡, 档, 扇, 尽, 切, 挨, 晕, 杆, 踏, 码头, 眼里) — those want a native-speaker call, not a blind edit.
- [x] **HSK 1–2 readings audited — clean, no action needed.** All 497 words checked the same way. The 23 that differ from CC-CEDICT are *better* than it: correct tone sandhi (一下 `yíxià`, 不要 `búyào`, 不错 `búcuò`), the Hanyu Pinyin apostrophe (女儿 `nǚ'ér`), and legitimate proper-noun capitals (中国, 汉语). Worth confirming because this is the band the 157 in-deck words actually sit in.
- [ ] **FSRS parameter tuning** — optimize scheduler parameters beyond library defaults once `review_logs` + analytics have real data.
- [ ] **"Read next" weighted by slipping words.** The SRS already knows which of a learner's words are due or repeatedly failing, and `storyReading.js` already matches stories against known vocabulary — combine them so the Stories shelf quietly prefers the published story containing the most of *that learner's* due words. Reading a word in context the day it comes due is the cheapest retention win available, needs zero new UI (it's a sort order), and fits the calm philosophy: no badge, no prompt, just the right story happening to be first.

## Reference dictionary (Pleco-style)

Shipped 2026-07-20 (see Claude.md §0). Data loaded to prod Supabase: **123,465** `dict_entries` (CC-CEDICT) + **~77,045** `dict_examples` (Tatoeba, simplified, with pinyin). Deferred, non-blocking polish:
- [x] **Wire stroke-order into the entry** — DONE: `src/StrokeOrder.jsx` (one animated hanzi-writer per Han char, reuses Writer.jsx config); the entry's Strokes button toggles it.
- [ ] **得-particle pinyin** — `pinyin-pro` renders degree-complement 得 as `dé` where neutral `de` is wanted (occasional; example sentences only).
- [ ] **Capitalized-pinyin display** — CC-CEDICT proper nouns (Běijīng) render lower-cased in `src/cedict.js` (`markTarget` lowercases; display-only, search unaffected).
- [ ] **Migration hardening** — add `drop policy if exists` before the `create policy` lines in `20260719120000` (idempotent re-runs) and a partial unique index `(language,system,word) where level is null` on `vocabulary` to bound concurrent dictionary-word inserts.
- [ ] **Both-language / other-language dictionaries** — Japanese (JMdict) + Russian; the entry view + search are language-agnostic, the data + `dict_search` are Chinese-only today. *(PAUSED — non-Chinese languages are on hold until the app scales.)*
- [ ] **Operator note** — reloading examples requires `truncate public.dict_examples` first (seed-examples is insert-only). CC-CEDICT/Tatoeba downloads + `--apply` are manual (service key); see the seed script headers.
- [ ] **HSK 3-6 stories — BLOCKED on LLM quota.** Vocabulary/examples/audio shipped (via `regen-content.yml` tasks `examples-hsk3-6`, `audio-hsk3-6`; serial configs added to `generate-serial-stories.mjs` for `chinese|hsk_3|3..6`). The `serial-hsk3-6` task runs but `generate-serial-stories` "plan season" call hits Gemini free-tier **429** on every level → `Published 0`. Unblock: enable billing on the Gemini API key (cheap, big RPM jump) OR set `ANTHROPIC_API_KEY` + `LLM_MODEL_PREMIUM` GitHub secrets (the generator's premium path). Then re-run `serial-hsk3-6` (tier taste-test first, then full). **No longer the only path:** the hand-authored lane now works for Chinese (PR #112) — dispatch `authored-vocab-hsk3`, commit the dump as `data/hsk3-vocab-snapshot.json`, author into `data/authored-stories.json`, and `authoredStories.test.js` validates every chapter against the real pool with the production matcher. No LLM, no quota. *(The "HSK 1 words" tier-label bug is fixed — PR #113 keys tiers by language AND level.)*

## Content

### A3.2 policy calibrated on the frozen six (2026-08-26)

**New defaults: `costBudget 16`, `offListMax 2`, `optionalMax 3`.**

Decomposition of the six frozen plans (`sweep-1`, nothing regenerated):

| plan | q | total | off-list | central | support | optional | max/sentence |
|---|---|---|---|---|---|---|---|
| **D** | 9 | 16 | 2 | 2× cost 5 | — | 3× cost 11 | 2 |
| **B** | 6 | 12 | 2 | 2× cost 6 | — | 2× cost 6 | 1 |
| F | 6 | 17 | **3** | 2× cost 5 | — | 2× cost 12 | 1 |
| E | 9 | 25 | 2 | 2× cost 5 | 4× cost 8 | 3× cost 12 | 2 |
| A | 8 | 29 | 5 | 4× cost 11 | — | 3× cost 18 | 2 |
| C | 4 | 38 | 8 | 7× cost 17 | — | 4× cost 21 | 4 |

**The Pareto frontier has three outcomes, one minimal policy each:**

| admits | minimal policy |
|---|---|
| **B + D** | **cost 16 · offList 2 · optionalMax 3** |
| B only | cost 12 · offList 2 · optionalMax 2 · optionalCostMax 6 |
| nothing | cost 12 · offList 2 · optionalMax 1 · optionalCostMax 3 |

**F never appears in any admitted set at `offListMax 2`** — it carries three
words the learner list does not have (`offer`, `conditional`, `email`), so the
off-list cap already rejects it and no separate optional ceiling is needed for
that job. `optionalCostMax` is left off: it never produced an outcome the count
cap did not.

D earns admission on its word list: 劝 (HSK 5) and `offer` are
CENTRAL_NECESSARY — it is a story about advising someone against an offer —
against 守, 危险 and `provides` as decoration. F's two dearest words are both
OPTIONAL_COMPLEXITY.

**Caveat worth carrying: `optionalMax 3` binds exactly at D's count.** It is
Pareto-minimal on this evidence and defensible on principle, but a fourth
decorative word now fails a plan, on a sample of six.

### The provenance audit found the next problem (open)

Every non-direct in-level match was listed, and the **synonym and component
bridges are producing false in-level matches** — which *understate* cost, the
opposite direction of the bugs fixed so far:

```
job    → synonym   → 沙发 / 邮件 / 邮箱      (sofa, email, mailbox)
offer  → synonym   → 开 / 打开 / 开花        (to open, to bloom)
view   → synonym   → 手表                   (wristwatch — the object, not the act)
current→ synonym   → 礼物                   (gift)
choice → component → 不                     (not)
guidance→component → 请                     (please)
```

Correct ones exist too (`happiness → 高兴/快乐/开心`, `night → 晚`,
`peace → 安静` via derivation, `suggested → 最好` via the parenthetical), so the
bridges are not worthless — but the synonym graph links single-word senses
*within* a polysemous entry, which is the tire/累 homograph problem again, one
level up: 看 "to look; to watch" makes watch ≈ look, and something glossing
"view" then chains to 手表.

**This biases every cost downward**, so the calibrated budget may be too
generous once it is fixed. Fix the bridge, re-run `sweep-1`, and confirm the
frontier before trusting 16 as a long-term number.

### 被 is a vocabulary content defect, not a pipeline one (open, found 2026-08-26)

**Do not compensate for this inside the story pipeline.** Deferring 被 is
currently the correct behaviour: the source row does not carry the sense a
learner needs, and the published corpus offers no contrary evidence.

| | |
|---|---|
| current gloss | `quilt; to cover (with)` |
| `part_of_speech` | null |
| example sentence | 折被子。 / "Fold the quilt." — the noun sense again |
| corpus uses | **0** in published stories |
| missing | the primary HSK 3 learner sense: **passive marker**, the 被 construction (被 + agent + verb) |

The pipeline now says so explicitly rather than dismissing a quilt: the bundle
judge reported *"the primary HSK 3 use is the passive marker, which is a
grammatical structure not listed in the senses provided; teaching it here with
the given definition is misleading."*

**Repair belongs in the vocabulary row**, with provenance and tests — a
migration that adds the passive sense and an example sentence showing the
construction. Until then, nothing downstream can teach 被 correctly, and the
`storyWordSenses` role detector cannot help because it needs corpus evidence
that does not exist yet.

### Matcher repaired, and the threshold trade-off finally appears (2026-08-26)

Three classes fixed generically (`fab9-risk@6`), plus two more the audit of
those fixes turned up:

| class | before → after | guard that holds |
|---|---|---|
| irregular inflection | `gave` off-list → **给** (HSK 1) | an English irregular lexicon: ablaut, -ought/-aught, suppletion, irregular plurals |
| derivation changing POS | `helpful` off-list → **帮/帮助** | each suffix states its base's POS — agentive -er needs a VERB, so `corner` ≠ `corn` |
| parenthetical evidence | `suggested` off-list → **最好** | only phrases about doing something; 养's "(animals)"/"(children)" and 外卖's "(of a restaurant)" gain nothing |
| comparatives *(found by the audit)* | `quieter` off-list → **安静** | recognised by sentence frame ("is quieter", "than"), not by -er |
| gloss-side derivation *(audit)* | `peace` off-list → **安静** ("peaceful") | indexed separately, stays derivational evidence |

Costs fell where the matcher was wrong: D 22→16, F 29→17. B unchanged at 12.

**Corrected matrix over the same six frozen plans (`matrix-3`):**

| cost / off-list | eligible |
|---|---|
| 12/2 · 12/3 · 15/3 | B (q6) |
| **18/3 · 18/4** | **D (q9)**, B (q6), F (q6) |

**The threshold is now doing real work** — and the decisive dimension is COST,
not off-list: D carries only 2 off-list words and is blocked purely by cost 16
against a budget of 12–15.

Residual noise, honestly: C (q4, fails quality anyway) still shows `quieter`
and `deeper` as off-list — its phrasing is outside the comparative frame list,
which is finite by design.

### Sense-aware targets, and why the lexical thresholds cannot be calibrated yet (2026-08-26)

**被 was deferred as a quilt.** The vocabulary row glosses it *"quilt; to cover
(with)"*, `part_of_speech` is null, and its example sentence is 折被子. The fix
is not a 被 case: `storyWordSenses.mjs` now hands the bundle judge every sense
in the gloss (516 of 950 in-level rows carry more than one), the POS where the
dataset has it (300 of 950), the row's own example (950 of 950), and **how the
word is actually used in the published corpus** — a word that keeps standing
between a noun and a verb is doing grammatical work whatever its noun gloss
says. The window is three entries because the passive puts the agent in
between (他[被][老师][叫]).

Rerun (`bundle-2`): the same rule reports **该 as grammatical, 8 of 9 uses**,
and finds nothing for ordinary nouns. **被 is still deferred, but now for the
right reason** — the judge says the passive marker *"is a grammatical structure
not listed in the senses provided; teaching it here with the given definition
is misleading."* **被 has zero uses in the published corpus**, so there was no
usage evidence to recover either.

**That is a content bug, not a pipeline bug: 被's vocabulary row is missing its
primary HSK 3 sense.** Until the row is fixed, 被 cannot be taught correctly by
anything downstream.

Selection changed: 如果 / 需要 / **认为** → 如果 / 需要 (认为 deferred).

### Threshold sensitivity — the thresholds are not what is binding

Matrix over the six frozen plans (`matrix-1`), nothing regenerated or
re-judged:

| cost / off-list | eligible |
|---|---|
| 12 / 2 | **B (q6)** |
| 12 / 3 | **B** |
| 15 / 3 | **B** |
| 18 / 3 | **B** |
| 18 / 4 | **B** |

**The eligible set is identical at every setting.** Raising the budget by half
and doubling the off-list allowance changes nothing, because the words pushing
plans over are almost all "off-list, charged 6" — and several of them are
matcher false negatives, reproduced directly:

- **gave** → absent, while **give** → 给 (HSK 1). Irregular past tense: `gave`
  is not a prefix of `give`, so the inflection rule cannot reach it.
- **helpful** → absent, though 帮 and 帮助 gloss "to help". Tagged a noun by the
  determiner in front of it, and the only senses containing "help" are verbal —
  the known noun/verb false-negative class, now doing real damage.
- **suggested** → absent, because 最好's "(do what we suggest)" is inside a
  parenthetical, and parentheticals are stripped when senses are parsed.

Each then costs 6: off-list (4) × the OPTIONAL_COMPLEXITY weight (1.5).

**Recommendation: do not move the thresholds yet.** No configuration in the
matrix argues for a change, and the data feeding it is distorted. Fix the three
matcher classes above, re-run the same matrix, and calibrate then. Plan B sits
at exactly 12/12 today, so a more accurate matcher will move every plan's cost
down and the honest budget may well be *lower* than 12, not higher.

Necessity pricing is live and visible: B carries two CENTRAL_NECESSARY words
(offer, conditional — the story is about a conditional offer) charged 3 each
against base 4, and two OPTIONAL_COMPLEXITY words (咨询, 明确) charged 3 against
base 2. Per-sentence density found genuine clusters in F and C.

### Target-bundle selection moved upstream, and the eligible set is finally non-empty (2026-08-26)

Four stored plans had been through placement viability and every one failed on
at least one of 男人 / 女人 / 关系 — always the same reason: the manifest
demanded the word and the story had no reason to say it. The fix is not in the
planner or the writer. It is that the manifest asked for five specific words at
once and left the planner to invent a reason for each.

`storyTargetBundle.mjs` chooses the words BEFORE the story is planned:
**REQUIRED** (a real communicative role, and they cohere as one story),
**OPPORTUNITY** (worth reinforcing if they fit; omitting them fails nothing),
**DEFERRED** (no compatible context yet — later, not never). The judgement asks
two separate questions, because individually storyable words can still be a bad
bundle when each needs its own subplot; selection from those answers is
deterministic. No word is blacklisted: 男人 passes the same machinery when it
tells two people at the door apart.

Deferral is recorded — times deferred, when, last real contextual exposure — and
two deferrals promote a word above anything fresher as soon as a context
appears, so difficult words are not silently starved. FSRS weakness has a field
and is left for the app side.

**First run (`bundle-1`).** Pool of 8; selected 如果 / 需要 / 认为 for *"a friend
asking for advice on a conditional life choice"*; deferred 被, 中, 该, 像, 生活
with reasons (被 was glossed "quilt" — the single-character gloss issue above).

**Candidates from that bundle (`bundle-plans-1`), same prompt and gates:**

| | structural | quality | JOINT |
|---|---|---|---|
| Qwen | 3/3 | 3/3 | **3/3** |
| gpt-oss | 3/3 | 2/3 | **2/3** |

against 0/6 and 0/6 for the original target set. **5 of 6 plans clear both bars.**

**Eligibility (`bundle-eligible-1`): plan B passes all four gates** — structural,
quality 6, A3.2 ASSISTED_OOL (4 assisted, cost 10/12), and placement viability
PASS on all three targets, each with a real role (*"marks the speaker's
subjective view, distinguishing advice from fact"*). Nothing was relaxed.

**The binding constraint has moved to lexical feasibility.** The three
highest-quality plans (qwen, 8–9) are all LEXICALLY_UNSAFE: D on 3 off-list
words against a cap of 2, E on cost 18/12 for a salary-and-advice story. The
gates are now trading quality against vocabulary — worth watching, because the
plan that survived is the one scoring 6, not the ones scoring 9.

### A3.2 is now comprehensibility, not purity (`fab9-risk@4`, 2026-08-26)

The product decision changed: a learner can tap any word, so a little
above-level vocabulary is desirable when it buys natural Chinese. Concepts are
classified IN_LEVEL or ASSISTED_OOL, and a plan is IN_LEVEL, ASSISTED_OOL or
LEXICALLY_UNSAFE. `ASSISTED_POLICY` holds the provisional budget — 4 assisted
words preferred / 8 max, 1 per beat preferred / 2 max, distance charged (+1=1,
+2=2, +3 or off-list=4, beyond=6), cost budget 12, and a 90–95%
at-or-below-level target for the finished text, which the deterministic
validator measures because there is no Chinese at plan time. Every number is
configurable per call and reported next to the verdict it produced.

**Three bugs of my own that the census caught, in order:**

1. **`-s` read as a verb.** 邻居 (HSK 3) and 谢谢 (HSK 1) were charged as
   off-list because "neighbors" and "thanks" end in -s. In beat prose that is a
   plural far more often than a verb; -ing and -ed stay.
2. **A substring coincidence counted as in-level.** "downstairs" was IN_LEVEL
   because 楼梯 is glossed "stair; staircase" — an out-of-level concept
   disguised as an in-level one, the one thing this must never do. A weak match
   is now assisted, pays the off-list price, and records the near miss.
3. **A plural gloss token collides.** "flat" (deflated) matches 公寓 "apartment
   building; block of **flats**". Still ASSISTED, so the gate is right; the
   attributed word and its cost (2 instead of 4) are wrong. **Open.**

**Known false-negative class, left deliberately.** An English noun whose Chinese
entry glosses only the verb reads as assisted: "go for a **walk**" does not
reach 走 (HSK 2, "to walk"), exactly as "the **help**" did not reach 帮助 before
the target exemption. Nothing in this dataset separates that from "a **tire**"
vs 累 "to tire", which is the bug the POS rule exists to stop. Under the new
model the cost is bounded — a false negative charges the budget instead of
declaring a plan infeasible.

**Census (`census-6/preflight.json`), original → assisted model:**

| plan | quality | before | after | assisted | cost |
|---|---|---|---|---|---|
| H | 9 | MEDIUM | **LEXICALLY_UNSAFE** | 6 | 20/12 |
| C | 9 | MEDIUM | ASSISTED_OOL | 3 | 12/12 |
| A | 7 | MEDIUM | LEXICALLY_UNSAFE | 8 | 24/12 |
| G | 6 | HIGH | **ASSISTED_OOL** | 3 | 7/12 |
| D | 9 | HIGH | LEXICALLY_UNSAFE | 7 | 26/12 |
| F | 5 | MEDIUM | ASSISTED_OOL | 3 | 10/12 |
| E, B | 8, 4 | LOW, MEDIUM | IN_LEVEL | 0 | 0/12 |

**轮胎 is recognised honestly**: off-list, cost 4 of 12 — comfortably affordable
on its own. H fails on accumulation (tire, downstairs, friendship, stronger,
flat, tool), not on one central noun. G improved from HIGH to ASSISTED, which
is the methodology change working as intended: a wrench and a repair are worth
tapping.

**Eligible set is still empty.**

### The adversarial review, and what it changed (2026-08-26)

Six reviewers went at `fab9-risk@4`; 28 of 55 claims were verified before the
run hit a session limit and 12 survived refutation. Confirmed and fixed in
`fab9-risk@5`:

- **A stem collision reopened the tire bug on the plural.** "tired" and "tires"
  both stem to `tir`, so 轮胎's plural reached 累 through the *adjective* sense
  while the verb sense was correctly blocked. Inflections may now only meet
  across a participle through a sense the gloss marks verbal.
- **The dearest word was charged, not the nearest** — cost depended on corpus
  row order, and the artifact named the wrong word.
- **A subordinate clause was a free channel** for the entire budget.
  Incidental material is charged at half: droppable, not free.
- **An UNSAFE verdict named no words**, so the one permitted replan re-ran the
  planner on identical input.
- **Off-list words outran the validator** — they arrive downstream as UNKNOWN
  words, where the gate is strict. `offListMax` (2) makes the plan-time promise
  answerable to it.
- **A partial policy override crashed** (`{costBudget: 40}` threw).

Charging incidental material then opened three smaller holes, all caught in the
next census: target **intents** ("Description", "Social bonding") were billed as
story vocabulary; legitimate inflections ("heard" vs 听见) were punished by the
weak-match rule; and `isn't` was charged as the word "isn".

**Process note.** Commit `67d58ef` swept in an `assistKey()` helper written into
the working tree by a review agent while `git add -A` ran. The code is sound and
is now read, extended and specced — but it entered under a message describing
only the `-s` fix.

### Census (`census-8`), original → assisted model

| plan | quality | before | after | assisted | cost | off-list |
|---|---|---|---|---|---|---|
| H | 9 | MEDIUM | LEXICALLY_UNSAFE | 7 | 17/12 | 4/2 |
| C | 9 | MEDIUM | LEXICALLY_UNSAFE | 5 | 16/12 | 4/2 |
| A | 7 | MEDIUM | LEXICALLY_UNSAFE | 19 | 39/12 | 10/2 |
| D | 9 | HIGH | LEXICALLY_UNSAFE | 15 | 38/12 | 12/2 |
| F | 5 | MEDIUM | LEXICALLY_UNSAFE | 11 | 23/12 | 6/2 |
| **G** | 6 | **HIGH** | **ASSISTED_OOL** | 4 | 8/12 | 1/2 |
| E | 8 | LOW | IN_LEVEL | 0 | 0/12 | 0/2 |
| B | 4 | MEDIUM | ASSISTED_OOL | 1 | 2/12 | 1/2 |

轮胎 costs **2 of 12** — affordable on its own, exactly as intended. H fails on
accumulation (downstairs, stronger, flat, tire, tool, wrench, repair) and on
carrying four words the learner list does not have at all.

**Eligible set: still empty.** G, the plan the methodology change rescued, was
judged on placement viability for the first time and failed on 女人, 男人 AND
关系 — *"a generic label for a character already established by name"* — the
same reason C failed, from the other model. **Four of the eight plans have now
been through the viability gate and every one fails on at least one of those
three words.** The required target set itself may be the thing that cannot be
placed naturally in a five-beat story.

### A3.2 matches a noun to a verb of the same spelling (open, found 2026-08-25)

`a3-H-2` ran frozen plan H — a bike-tire repair story — and stopped at the
lexical scaffold: the sketch for 帮助 in beat 1 needs to name the tire, and
**轮胎 is absent from the vocabulary at every level** (so is 修).

A3.2 had rated that beat MEDIUM, reporting `tire=supported`. Reproduced with
the real glosses:

```
tire   → supported via gloss → 累
```

累 is glossed **"tired, to tire"**. The gate matched the noun *tire* to the
verb *to tire*, concluded the object was sayable, and let a plan whose central
object cannot be named through the feasibility gate. The same collision put 累
at the top of the retrieval suggestions offered to the writer, where 自行车
(HSK 3, and the obvious way to talk around it) never appeared.

The fix is the part-of-speech agreement the synonym bridge already uses: the
glosses mark verbs with a leading "to", and a direct gloss hit should respect
that just as `buildSenseSynonyms` does. **Re-run feasibility over the stored
candidates afterwards** — H's MEDIUM may become HIGH, which would change the
eligible set.

Secondary, and real: given a correct repair brief naming 轮胎, permission to
delete it, and eight alternatives, the writer returned the identical sentence
on its retry.

**Fixed 2026-08-25 (`fab9-risk@3`).** `glossSenses()` reads each gloss sense
and its part of speech once, the index is built sense by sense, and
`senseCompatible()` gates every match. On the English side the sentence marks
the concept: a determiner in front makes a noun, an inflection without one
makes a verb, anything else stays unknown and never blocks. A word the story
TEACHES is exempt — 帮助 is glossed "assistance; aid; to help", and calling a
story's own target missing is never right.

Corrected census over all eight stored plans (`census-3/preflight.json`,
nothing re-planned, no dimension re-judged):

| | A3.2 before → after | eligible |
|---|---|---|
| H | MEDIUM → **HIGH** (flat, tire, downstairs, tool) | YES → no |
| C | MEDIUM → MEDIUM | no (viability) |
| A | MEDIUM → MEDIUM | no (viability) |
| D, G | HIGH → HIGH | no |
| F, B, E | unchanged | no |

**No candidate's verdict improved**, which is what removing false support
should look like. **Eligible set is now empty.**

**Residual false negative, in the verb direction.** C beat 4 reads "…and
thanks him", tagged a verb by its inflection; 谢谢 is glossed **"thank you"**,
which carries no "to" and so reads as non-verbal, and 谢谢 is not a target. The
beat is MEDIUM either way so nothing turned on it here. Worth noting that the
noun→verbal direction is what caught the tire, while the verb→noun direction
has so far produced one false negative and no catches.

### Target-placement viability is now a gate — and it changed the selection (2026-08-25)

`storyTargetViability.mjs` judges every target→beat placement on its own:
could a competent writer use THAT word in THAT beat, leaving the event
unchanged, without labelling the obvious, defining something so the word can
appear, or writing a line that would be cut if the word were not required.
One fatal placement makes a plan ineligible whatever its quality score.

Run over the three stored eligible candidates (`viability-1/preflight.json`,
nothing re-judged but this):

| plan | quality | verdict | failing placements |
|---|---|---|---|
| C (qwen) | 9 | **ineligible** | 女人→b1, 男人→b2, 关系→b6 |
| A (qwen) | 7 | **ineligible** | 男人→b4 |
| H (gpt-oss) | 9 | **eligible** | — (必须→b3 fails, but it is optional) |

C fails on both gender words for the general reason, not a story-specific one:
*"the reader already knows … labelling him adds no narrative value beyond
satisfying the word list"* — and 关系 too, as *"gratuitous meta-commentary"*.
The 女人 placement that happened to realize grammatically in a3-final-11 fails
the same way; passing beat realization was luck, not viability.

**Known gap, deliberately left:** the gate fails a plan only on REQUIRED
placements, as specified. H's 必须 → beat 3 was judged unwritable and H is
still eligible, yet `beat.targets` lists 必须, so the beat realizer will be
asked to use it — the same instruction that produced 那个男人就是小红. Either
optional targets should be droppable from a beat when the gate fails them, or
the gate should fail on any placement the realizer will be told to satisfy.

### A gender word placed as a label has no natural sentence (open, found 2026-08-25)

`a3-final-11` got beat 1 accepted on the first attempt (judged 6) and then lost
beat 2 twice, both times to the same contradiction:

```
a1  那个男人就是小红。   judged 1 — "calling a woman a man makes the text nonsensical"
a2  那个男人就是小红。   judged 1 — "fatal contradiction"
```

The beat gate is working. What it is enforcing is unwritable: plan C places
男人 in beat 2 with `refersTo: Li Ming` and the reason *"to identify Li Ming's
gender role when he enters the scene"*, in a beat whose only man is the
viewpoint character. The honest realization is 李明是一个男人 — a sentence with
no reason to exist — so the writer reached for a contrastive one and attached
the label to the wrong person, twice.

Both gender targets are placed this way; 女人 in beat 1 survives only because
这个女人很累 happens to read naturally. **The plan-quality judge scored this
plan targetFit 8 and overall 9.** A target with a real communicative purpose is
exactly what `target_no_intent` and the judge's targetFit dimension exist to
check, and "Description" passed both.

That is a plan-selection question, not a beat-realization one, and nothing has
been changed for it.

### Beat realization: a decorative detail and a narrated quote (open, found 2026-08-25)

`a3-final-7` is the first run to clear the lexical scaffold end to end — title
李明帮忙, five valid target sketches, six valid anchor sets — and it stopped at
`BEAT_REALIZATION_FAILED` on beat 1 after both attempts:

```
a1  ... 小红擦了擦额头上的汗。          unknown_words: 额头、汗 (2, max 1)
a2  ... 他走过去问：小红，你需要帮忙吗？  unknown_speaker: "他走过去问"
```

**a1** is the writer decorating: wiping sweat from a forehead is not in the
beat, and it costs two words the reader does not have. The limit is one and it
did not move.

**a2 was otherwise clean** — 5 lines, out-of-level 2.0%, zero unknown words,
the target present. Its only fault is form: 他走过去问：… is a narration clause
introducing a quote, and the house format is a bare name before the colon.

Worth fixing together with it: **the message is wrong.** `narrated_speaker`
only fires when the prefix is exactly a cast name (小明说), so a fuller clause
falls through to `unknown_speaker` and the writer is told the speaker is not in
the cast — which is not the problem and does not lead to the fix.

Not touched: this is the next layer, reported rather than changed.

### A3.1 sketches: a bare character where the word is a compound, and a drifting retry (open, found 2026-08-24)

`a3-final-3` re-ran frozen plan C through the corrected scaffold rules and
stopped earlier than before, at `TARGET_SCAFFOLD_FAILED` on beat 1's sketch
for 女人:

```
a1  这个女人很累，她拿着一个大绿箱子。   non-vocabulary text: 绿
a2  这个女人提着大盒子，很累。          non-vocabulary text: 提 · above-level: 盒子
```

**Everything that sentence needs is in level.** 绿色 is **HSK 2**, 箱子 is HSK 3,
拿 is HSK 2, 大 is HSK 1 — 拿着一个大箱子 was available. Two mechanisms:

1. **A bare character where the entry is a compound.** 绿 is not a vocabulary
   item; 绿色 is. Same family as the anchor fragmentation fixed in
   `fab9-scaffold@2`, but inside a sketch and against ordinary vocabulary
   rather than a frozen cast name or target.
2. **The retry drifted instead of correcting.** Told exactly which token was
   bad, the writer rewrote the whole sentence and introduced two NEW
   violations (提, absent at any level; 盒子, HSK 4) while dropping the words
   that had been fine.

Note what this is not: the beat's own risk was LOW/MEDIUM, and A3.2 was right —
the green box is incidental detail a beat can lose. The sketch stage has no way
to say so, and the deterministic gate cannot drop the word itself without
rewriting the story.

The three `fab9-scaffold@2` fixes are covered by regressions but were **not
exercised by this run** — it failed before any anchor set was generated.

### A3.1 scaffold: one bad anchor sinks the set, and the retry degenerates (open, found 2026-08-24)

`a3-final-2` ran the first eligible plan (C: structural PASS, quality 9,
A3.2 MEDIUM) and stopped at `BEAT_LEXICAL_SCAFFOLD_FAILED`, beat 3 — a beat
whose content is "Li Ming asks if the woman needs help with the box", which
its own usage sketches said perfectly (你需要我帮忙吗？ / 你需要我的帮助吗？).

Two separate defects, both in beat-anchor generation:

1. **All-or-nothing validation.** Attempt 1 returned 后来、门口、女人、拿、很重、不用
   and was rejected whole for one word: 很重 (重 is HSK 4). Five of the six were
   valid and the gate only requires three.
2. **The retry got worse, not better.** Told 重 was above level, attempt 2
   returned 李、明、女、人、拿、包 — single characters, including the cast name
   李明 and the target word 女人 broken apart. Rejected as non-vocabulary, and
   the one-retry rule ended the run.

Also seen, and not currently checked: the beat 2 sketch 李明的爸爸是大男人
passed. It introduces 爸爸, who is not in the cast — the sketch validator
checks vocabulary but never the closed cast, so a downstream stage can add a
character the plan does not have.

Nothing was fixed: the layer is identified, and which of the three to change
is a decision, not a cleanup.

### A3.2 lexical risk only sees a concept if the gloss uses that exact English word (open, found 2026-08-24)

The first full A3 run on a frozen, high-quality plan (`a3-final-1`, Qwen plan
D: structural PASS, overall 9, causality 9, chronology 10, plausibility 10)
never reached prose. It stopped at the A3.2 preflight with
`SHAPE_LEXICAL_FEASIBILITY_FAILURE`, blocking on: large, sweating, grip,
slipping, struggling, slips, falls, lift, carry.

**Some of those blocks are wrong.** `conceptSupport` matches an English
concept against the tokens of a learner-list gloss, with no synonym coverage,
so a supported action is invisible whenever the gloss uses a different English
verb. Reproduced with the real glosses:

| concept | verdict | truth |
|---|---|---|
| carry | none | 搬 is **HSK 3** — "to move (sth relatively heavy or bulky)" |
| lift | none | 搬 / 起来 (HSK 2) |
| large | none | 大 is **HSK 1** — glossed "big" |
| move | supported (搬) | the same word, found only under its own gloss word |
| hold | supported (拿) | correct |

So beat 5's HIGH ("lift, carry") is a false block. Beats 1-2 are a fair call:
sweating, grip, slipping and falls (掉 is HSK 4) have no in-level cover.

**Second, upstream:** plan selection has no lexical-feasibility signal at all.
The plan judge scores causality, chronology, plausibility, simplicity, target
fit and suitability — none of which ask whether the story can be *said* at
this level. A premise built on fine physical detail (sweating hands, a
slipping grip, a box hitting the floor) can therefore score 9/10 and win.

**Matcher fixed 2026-08-24 (`fab9-risk@2`).** Two bridges, both built from the
canonical dataset and neither hardcoded to a concept: sense synonyms (a gloss
lists alternative translations of one word, so its single-word senses are
synonyms — 抱 "to hold; to carry" gives hold ~ carry; linked only when the
senses agree in part of speech, which the glosses mark with a leading "to")
and component heads (an above-level compound whose head is an in-level word
means the reader has the simpler word — 大量 → 大). Re-run on the same frozen
plan D with the real corpus (`preflight-2/preflight.json`, 4998/4998 rows
glossed):

| beat | before | after | why |
|---|---|---|---|
| 1 | HIGH | MEDIUM | large → 大量 → 大 (HSK 1); heavy → 搬 (HSK 3) |
| 2 | HIGH | **HIGH** | slips (absent), falls (掉 is HSK 4) — genuine |
| 5 | HIGH | LOW | lift → "raise" → 起 (HSK 3); carry → "hold" → 拿 (HSK 2) |

The risk arithmetic and every threshold are unchanged, and the gate's original
cases still rate HIGH — 轮子 (wheel, HSK 6) stays a gap because 轮 is not a
word the reader has.

**Resolved 2026-08-24: feasibility is a prerequisite for selection.** Plan D
was rejected, not repaired. Ranking now sees only plans that pass the adapter,
the structural validator AND A3.2; a genuine HIGH is ineligible regardless of
quality score, and lexical risk stays a three-state verdict rather than a
number blended into quality.

Measured retrospectively over the eight stored transition-contract plans
(`eligibility-1/preflight.json`, no regeneration, no re-judging):

| | structural | quality | lexically feasible | **eligible** |
|---|---|---|---|---|
| Qwen | 4/4 | 3/4 | 3/4 | **2/4** |
| gpt-oss | 2/4 | 3/4 | 3/4 | **1/4** |

Two of the eight lose on feasibility alone: plan D (slips, falls) and plan G
(**wrench, repair** — exactly the class the gate was built for). Eligible, by
recorded quality: C (9), H (9), A (7).

### Planners omit beat-to-beat movement, and it is content, not notation (open, found 2026-08-24)

Measured on the twelve stored plans in `data/story-candidates/planner-bakeoff-1t/`
and `compile-1/compile.json`. Both planners were run on one manifest, one
prompt, one validator: **joint pass 0/6 each**. gpt-oss lost all six plans to
`unexplained_move`; Qwen lost two to unparseable JSON and two to unplaced
targets.

`storyPlanCompiler.mjs` was built to test whether that was serialization —
the plans do often say how the cast travelled, just in `what` or inside
`where` instead of in `arrivedHow`. It compiles the structural fields out of
the plan's own words and never invents any. **Answer: serialization was not
the main blocker.** It recovers exactly one plan of six (structural 0/6 → 1/6),
and joint pass stays 0/6, because that plan's story quality was 4/10 anyway.

The residual is real content: in E, G, H, B and F the cast arrives in a lobby,
a courtyard, a living room and an apartment with nothing in the plan saying
anyone went there. A planner writing a five-beat story simply does not narrate
its transitions.

**Resolved 2026-08-24 by asking the planner instead of the code.** The
planning contract now carries `location` and `transition_from_previous`
("same_place", or the movement the planner intends), and
`storySemanticShape.mjs` renames that into the strict schema with no
inference of any kind. Measured on 4 fresh plans per model
(`data/story-candidates/transition-1/`), same validator, same thresholds:

| | before | after |
|---|---|---|
| Qwen joint | 0/6 | **3/4** |
| gpt-oss joint | 0/6 | **2/4** |
| `unexplained_move` | 6/6 of gpt-oss plans | **0** |
| transitions stated | n/a | **9/9**, 0 contract violations, 0 adapter losses |

Watch one thing: Qwen's plans move much less (2 required transitions across
4 plans, against gpt-oss's 7), so part of its structural lead is staying in
one room. Its quality scores are the run's highest, so it is not buying
structure with dullness — but a planner that never leaves the kitchen would
be a regression worth catching early.

**Method note worth keeping.** The compiler's first two measured "successes"
were its own fabrications — it read "the box **has been moved** thanks **to
their teamwork**" as travel, and reused one beat's arrival for the next beat
by matching the shared word "apartment". Both were caught by reading the
compiled output, not by the specs; both are now specs. Any future harness that
derives a field must record its provenance and be read line by line before its
numbers are believed.

### Canonical segmentation splits unknown compounds into single characters (open, found 2026-08-22)

**Do not fix this without a separate investigation** — it lives in the canonical
vocabulary engine (`src/storyReading.js` → `segmentLine`, read through
`storyCorpusCalibration.analyzeStory`), which the reader, the FAB-5 coverage
audit, the calibration and the FAB-10 validator all share. Changing it would
move readability and coverage numbers **globally**, so it needs regression
examples and a measured before/after, not a quick patch.

**What happens.** A compound that is not itself a vocabulary entry can fall
apart into its characters, and each character is then judged as its own word.
Measured example (repair-2, `data/story-candidates/repair-2/`): a generated
line containing 公交站 was rejected by the per-line gate for "introducing"
公 (HSK 6) and 交 (HSK 4) — neither is a word the line uses, and the original
line's 公交车站 produced no such reading. Same class as the single-character
findings in the targetability work (被 glossed "quilt", 中 "China").

**Impact so far:** none on any decision. In repair-2 the affected candidate
scored 3/10 with the semantic judge and would have lost anyway. The risk is
false rejections in the per-line gate and inflated out-of-level counts for
stories using unlisted compounds.

**When it is investigated,** start from: which compounds in the published
corpus decompose this way, whether the fix belongs in segmentation or in
treating single-character residue as structural (as `storyTargetability.mjs`
already does for targeting), and what the change does to FAB-5's per-word
`availableByLevel` numbers.

### Targeted story generation: the free-tier ceiling (FAB-9, measured 2026-08-21)

**Anthropic is not available to this project** (no API billing), and the
fallback providers were measured rather than assumed — evidence in
`reports/llm-smoke.json` and `data/story-candidates/bench-*/`.

- **Gemini is dead, not throttled.** All 11 models probed return HTTP 429
  *"Your prepayment credits are depleted"*. Nothing on the Gemini path can run
  until credits are topped up — including the existing `serial-*` and
  `examples`/`meanings` content tasks.
- **Groq works but caps a request at 8000 tokens/minute** (`on_demand` tier).
  The pipeline inherited `max_tokens: 6000` from the serial generator, so
  prompt + budget hit HTTP 413 *"Requested 8999"* on every draft. Fixed by
  deriving the budget from the manifest (`outputBudget`), but the ceiling still
  bites: a 4-story batch spends 39-47 requests with **70-80% of them 429'd**.
  **Mass production is not viable on this tier** — that is a billing decision,
  not an engineering one.
- **Model trade-off, 5 benchmark rounds, 0/20 accepted.**
  `qwen/qwen3.6-27b` (needs `reasoning_effort=none`, or it spends its whole
  budget thinking) writes the best Chinese by a wide margin — real narration,
  character voices, genuine hooks — but ignores the constraints: 18-77 distinct
  out-of-level words against a cap of 3, and 33-87 lines against a max of 38.
  `openai/gpt-oss-120b` (needs `reasoning_effort=low`) obeys far better —
  21-23 lines, 9-16 out-of-level — but writes flat, near-all-dialogue prose and
  visibly bends sentences to force target words in (`我受到了她的笑容`).
- **Open calibration question:** `maxOutOfLevelDistinct: 3` (HSK 3) came from
  the published corpus's p75. No free-tier model got within 3× of it. Either
  the cap needs revisiting against what generation can actually achieve, or
  generation needs a two-stage write-then-simplify pass. Decide before the next
  pilot.


- [ ] **Four small letterbox bars in the two already-shipped Inkbound episodes.**
  Found on 2026-07-30 by the bar check newly added to
  `tools/manhua-contact-sheet.mjs`, which did not exist when those episodes were
  reviewed. 第一话: `panel-08-teacher` (bottom 6%), `panel-11-stroke` (top 6% and
  bottom 9%), `panel-13-watcher` (left 11%). 第二话: `panel-21-hook` (right 6%).
  All are small, all are dark-on-dark, and none of them puts a bubble on a bar —
  which is why nobody saw them. **Deliberately not fixed here:** reworking
  published art means a force re-fetch and a new commit on live episodes for a
  defect no reader has noticed, and this batch already spent three rounds on the
  bars that mattered. Worth doing the next time either episode is touched for
  another reason. The cause and the prompt wording that avoids it are in
  `docs/STORY-BIBLE.md` §6.

**Focus: Chinese only.** Japanese and Russian are paused until the app scales; the
gate lives in `PUBLIC_LANGUAGES`/`ADMIN_LANGUAGES` in `src/languageTheme.js` (add a
language key back to un-pause). The non-Chinese content items below are kept for
when we resume, not scheduled.

- [ ] **25 HSK 6 words still have no example sentence** (down from 335 on 2026-07-28; level 6 stands at 1596/1621). Levels 3, 4 and 5 are complete. Nothing is broken — this is purely a free-tier quota wall, and it does **not** clear on the hour. Two runs have now confirmed the shape of it: the 16:06 run wrote 300 and stopped at `Used 99085`; the 17:21 re-run, 65 minutes later, got only **10 more** words before stopping again at `Used 99430 / Limit 100000`, `retry-after: 3631`. Groq's tokens-per-day is a **rolling 24-hour window**, so an hourly re-run only recovers whatever trickles out of the window — roughly 10 words a run. Don't loop it. Either wait ~24h from the 16:06 bulk run for the window to clear properly and finish the last 25 in one pass, or use a key with real headroom (Gemini's daily free tier resets at midnight Pacific and would cover 25 words easily). Re-run is Actions → `examples-fill`, `language: chinese`, `level: 6`. History below.
- [ ] **335 HSK 3-6 words still have no example sentence.** ✅ *Mostly resolved 2026-07-28 — 300 of 335 filled; see the entry above.* The Tatoeba backfill (`backfill-examples.mjs --levels 3-6 --apply`, Actions task `examples-hsk3-6`) matched **4,160 of 4,495** on 2026-07-28 and is now exhausted — the remainder simply has no Tatoeba sentence containing the word. Left: level 3 ×3, level 4 ×33, level 5 ×74, level 6 ×225 (the tail is the rarest vocabulary, so it skews to level 6). Finish with the LLM path, one level at a time: Actions → `examples-fill`, `language: chinese`, `level: 3` … `6`. That path is already paged and stops early on a spent quota (`f51c626`) and reports a refusal instead of retrying it 46 times (`6834533`), so a quota wall costs one short run, not a burned hour. ⚠️ **Gemini's free daily quota is spent** — the 15:43 level-3 run got a 429 on all four attempts and wrote nothing. `llm.mjs` now fails over to Groq after three consecutive quota refusals, so the next run finishes on the standby; if both are walled, the fill simply has to wait for the daily reset. Nothing is broken meanwhile — the fill-in-the-blank question builder already filters to rows whose `example_sentence` contains the word (`src/fillBlank.js`), so a missing example just means that word never becomes a cloze question.
- [x] **Azure flashcard TTS can't run in CI — RESOLVED 2026-08-07: the owner added `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` as Actions secrets; run #108's env dump shows both set, and the 21-word regen ran successfully through Actions the same day (see §Learning quality). What remains open from this entry is only the optional per-level HSK 3–6 `tts-flashcards` pass for slow-word/sentence audio.** *(Re-confirmed 2026-08-03: a `tts-flashcards` dry run on that day's branch still shows both Azure vars empty in the workflow env — the 2026-08-02 story-audio batch must have run outside Actions. Adding the two secrets also unblocks the 21-word reading-fix regen in §Learning quality.)* `tts-flashcards` (`tts-generate.mjs`, the only script that spends money on speech) is wired into `regen-content.yml` with its dry-run/confirm/cap guards, but the 2026-07-28 run's env dump shows `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` **empty** — only `GOOGLE_TTS_KEY` is populated. So HSK 3-6 has zero rows in `tts_audio` (levels 1-2 have full `word` coverage from the earlier pass), which means no slow-word and no sentence audio there. ~~**This is not user-visible today:** all 4,498 words have a legacy `audio_path`, and `flashcardAudio()` falls back to it for the `word` variant, hiding the slow/sentence controls when absent.~~ ⚠️ **Corrected 2026-08-15 — that claim checked the column, not the object.** Having an `audio_path` is not the same as having a file behind it. Measured against production storage during the S0 release gate: of 4,995 active Chinese words carrying a legacy path, only **504 resolve to an object that exists**. By level, the bucket vs the references: L1 300/300, L2 198/197, L3 457/453 — complete; then **L4 468/929, L5 481/1,495, L6 465/1,621**. So **4,471 active Chinese words have no playable audio at all** — no ready `tts_audio` row and no resolvable legacy object — and they degrade to the audio-retry state rather than hiding the control.

  **Not caused by the S0 migration, and not a release blocker today.** The migration only re-rendered `tts_audio` rows and wrote under the `tts/` storage prefix; every object under `chinese/` was created between 2026-06-04 and 2026-07-20, before it ran. And the gap sits where nobody is: every Chinese learner is at HSK 1 or 2 (18 at L1, 4 at L2), where audio is complete, and the entire user base holds 5 cards at L5–L6. It becomes real the moment anyone reaches HSK 4. Fix is the deferred `tts-flashcards` run per level, not code. Fix is repo settings, not code: add `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` as Actions secrets, then run `tts-flashcards` per level (dry run first — `tts_confirm` unticked — then confirm; the 200-record cap needs `--override-max`, which the task adds automatically above a limit of 200).
- [ ] **Stale fix instruction above:** the HSK 3-6 reading-fix entry says "re-run Actions → task `audio-hsk3-6`". That task was **retired** in `5e65347` (it billed Google, not Azure) and now exits 1 with a pointer. Once the Azure secrets exist, the equivalent is `tts-flashcards` for the affected levels; the legacy Google `audio_path` rows it replaces are the ones carrying the wrong readings.
- [ ] **🔴 The serial-story generator cannot run on free LLM tiers — needs a funded key.** Settled empirically overnight 2026-07-29 across three batch runs (story-batch.yml #1, #3, #5). Run #5 was the clean experiment: dispatched at 07:30 UTC, half an hour after Gemini's daily reset, with the SEASON_SEEDS crash already fixed — all three levels ran real LLM calls for 27/16/16 minutes and published zero stories. Gemini's fresh daily quota exhausts mid-tier-one, failover lands on Groq, and Groq's 100k tokens-per-day is a rolling 24h window that the night's own attempts keep full (final reading: Used 98,091/100,000 with each season plan needing ~9k — it can never fit). This is structural, not timing: a season is ~100 calls and the two free tiers together cannot fund even one. The pipeline is otherwise healthy and now inherits the story canon. Fix is repo settings, not code: add a funded `ANTHROPIC_API_KEY` as an Actions secret (premiumLlm() picks it up automatically; a level costs a dollar or two on Sonnet) — or a paid-tier Gemini/Groq key. Until then, stories are hand-authored via `data/authored-stories.json` + `check-authored-stories.mjs`, which is how HSK 4-6 got their 45 chapters.
- [ ] **Chinese → HSK 7-9** (the advanced band): seed the vocab, then run `generate-meanings` → `generate-examples` → `generate-serial-stories` → `generate-audio`/`generate-story-audio`. Add tiers to `storyTiers.js` and level labels in `utils.js`. *(HSK 3-6 vocab/examples/audio already shipped; stories pending LLM quota.)*
- [ ] More graded stories at existing Chinese levels (volume, not just new levels) — improves the "read next" ladder density.
- [ ] **Eight published HSK 1-3 stories sit under their level's coverage bar.** Found by `node check-authored-stories.mjs`, which now runs the same validator the generator uses against the vocabulary lists in `data/` (no network, no API key). These predate that checker, so nothing regressed — but a learner reading them meets words that are not on their list yet:
  - `下雨天` (L1 t1) — 64% vs 85%. The worst at HSK 1: 拿着、伞、走路、树、鸟、花、美、心. Nearly every content word in it is off-list.
  - `我的早上` (L1 t1) — 74%: 刷牙洗脸、拿、包、公共汽车.
  - `放学以后` (L1 t1) — 84% (marginal): 放、以、起、公园、啊、门. `放学`/`以后`/`公园` are the recurring offenders; HSK 1 has neither.
  - `在动物园` (L2 t1) — 65% vs 90%. 狮子、熊、猴子、象、冰淇淋、拍、照片. A scene story, so the zoo animals are the point; it may be easier to re-level it to HSK 3 than to rewrite it.
  - `新的决定` (L3 t1) — 87%: 理解、紧张、支持、庆祝.
  - `坚持` (L3 t1) — 88% (marginal): 困、紧张、停止、建议、胜利.
  - `周末的电影` (L2 t1) — 88% vs 90%: 末、空、主意.
  - `2. 一个办法` (L3 t2) — 85% vs 86% (marginal): 田、秧苗、拉.
  Deliberately **not** rewritten — these are published stories and how far to push a reach word is a content call, not a lint. The marginal ones may just want a word swapped; `在动物园`, `下雨天` and `我的早上` need a decision.
  ✅ `回家的路` is FIXED (83% → above bar): 压力→累, 美丽→好看, 父母→爸爸妈妈, 幸福→家, 消失→变, and the 眼前都是光 line dropped. 村里/阳光/桥 stay as declared reach words — they are what the story is about.
  *(The three HSK 1 entries only became visible on 2026-07-29: `data/hsk1.json` was an empty file, so the checker had been silently skipping every HSK 1 story. `data/hsk1-vocab-snapshot.json` now supplies the pool.)*
- [ ] **`src/authoredStories.test.js` still has no HSK 1 pool.** `SNAPSHOT_FILES` covers `chinese|hsk_3|2` and `|3` (the latter now correctly unioned from `data/hsk2-vocab-snapshot.json` + `data/hsk3.json` — the old `data/hsk3-vocab-snapshot.json` was an obsolete draft that rejected 发现/相信/一直/然后/回答/忘记 and admitted ~400 words that are not in the database). HSK 1 has a real pool now, `data/hsk1-vocab-snapshot.json`, but wiring it in would immediately fail the three legacy HSK 1 stories listed above — this test is absolute, not a percentage. Do it in the same change that resolves them. Until then HSK 1 stories get structural checks in the suite plus the full coverage check in `check-authored-stories.mjs`.
- [x] **Cover art for all 60 new hand-authored chapters — DONE 2026-07-29, then REDONE the same day.** First pass was ten craft styles (gouache, ink wash, woodblock, riso, manhua, noir, screenprint, collage); read as tasteful but dated. Replaced with a single modern register — cinematic anime key art, lineless digital painting, volumetric light, filmic grade — varied per season by colour grade and time of day rather than by medium. That keeps the shelf coherent while the seasons stay distinguishable, and it lets the sea strand's three legs read as one arc through grade alone (cold steel → teal night → gold dawn). The manifest was swapped **in place** (same 60 keys, new URLs), not appended. Every prompt carried an explicit no-text/no-signage constraint — generated hanzi is always wrong and this is a language-learning app, so a cover must never show a character a learner might read. 16:9 to match the fixed cover slot in `Stories.jsx`.
  *Note for next time:* `data/story-covers.json` keys on `(language, system, level, story_number)` with no tier, so `story_number` has to be unique within a level — worth asserting before a batch, since two seasons at the same level can otherwise silently overwrite each other. Also: CDN URLs 403 from inside the sandbox proxy (a known-good already-applied URL 403s the same way), so don't read that as a broken link — the Actions runner fetches them fine.
- [ ] *(PAUSED)* **Japanese JLPT N4+ / Russian A2+**: same pipeline per new level; extend the level/tier config so onboarding offers them (Onboarding gates on seeded levels already). Repo already has `data/n4.json` (N4 vocab, meanings + readings) if/when we resume Japanese.
- [ ] *(PAUSED)* **Spanish track**: add a `spanish` entry to `languageTheme.js` (accent, font, system=CEFR), level list + tiers in `storyTiers.js`, seed CEFR vocab, generate content. Onboarding/data layers are already data-driven, so most of the app picks it up for free.

## Media
- [ ] **Pictures on flashcards**: generate/source one image per vocab item (image-gen pipeline → Supabase Storage `images/` bucket, mirror of the audio flow), add `image_path` to `vocabulary`, render lazily on the card back. Keep it optional so a missing image degrades cleanly.
- [ ] **Better TTS**: current narration is Google TTS (`generate-audio.mjs`, `generate-story-audio.mjs`). Evaluate more natural voices (e.g. Azure Neural, ElevenLabs, OpenAI TTS) per language, pick voices, regenerate vocab + story audio; watch blob size / offline-cache cost. A/B a sample before mass regen.

## Video (graded YouTube — the flagship idea)
Turn the current recommended-videos list (`YouTube.jsx`, `youtube_recommendations`) into graded comprehensible input — the video analog of the story reader:
- [ ] Fetch a video's **caption/transcript** by video id (YouTube timedtext / caption tracks); handle the no-captions case gracefully.
- [ ] Reuse `storyReading.js` to compute **% known** over the transcript and make words **tappable** (define / add to deck), exactly like the reader.
- [ ] **Sync the transcript to playback** (YouTube IFrame API `getCurrentTime`/state events) — highlight the current line, tap a line to seek.
- [ ] **Pre-teach flow**: surface the top-N unknown words as quick flashcards before watching.
- [ ] **Level-matched library**: tag recommendations with level + a computed "% you'll understand" badge so browsing mirrors the graded-story ladder.

## Your words & tools
- [ ] **Custom flashcards**: let users add their own cards (word, reading, meaning, optional TTS audio). Store as user-owned vocab (a `custom_vocab` table or a `source` flag on `vocabulary`), feed them into the study queue + FSRS exactly like seeded cards, and optionally group into named decks. Reuse the existing card/grading path so scheduling, offline, and XP work unchanged.
- [ ] **Built-in dictionary**: a searchable lookup over the vocabulary table, extended with an open dataset per language (CC-CEDICT for Chinese, JMdict for Japanese, an A1+ list for Russian). Search screen → result shows reading + meaning + a play button (recorded audio or TTS) + "add to deck" (which creates a custom card). Bundle/cache the dataset for offline. Pairs with the tap-to-define that already exists in the reader.

## Home & session-recap declutter (mod feedback, 2026-07-21)

Shipped 2026-07-21. From Eliazu's mod-chat review (old vs new mocks): the home and
session-complete screens were number-heavy and partly off-brand. Streamlined toward
"fewer numbers, straight to the story."
- [x] **Remove the "streak" from Home** — the Flame badge ("day streak") and the
  "Study today to keep it" guilt line are gone (they directly contradicted the *no
  streaks, no guilt* promise). *(Superseded 2026-07-22: the account-level (Lv/XP)
  badge mentioned below as staying was later removed too — see "Streak & XP system
  removal" below.)*
- [x] **Declutter the Dojo card** — removed the daily-goal ring, the mastery bar,
  "Your rhythm" dots, and the "Next 7 days" forecast. The New/Learning/Due counts
  stayed (functional, not decorative). The whole "Today's Dojo" card is now itself
  tappable (role="button", hover state, trailing chevron) — same destination as the
  "Review & unlock" CTA below — instead of a small nested pill being the only
  clickable part.
- [x] **Simplify the session recap** — dropped the XP badge and the Accuracy stat;
  collapsed the stat tiles + separate "Tomorrow" banner into two calm tiles ("Today:
  N reviewed, M new" / "Tomorrow: N due, M new"). The "Recommended next" story CTA
  (already the first action after the trimmed stats) leads straight to reading.
  *(The level-up card mentioned as "kept as-is" below was later removed too — see
  next section.)*

## Streak & XP system removal (2026-07-22)

Shipped 2026-07-22. Full removal of the streak counter, streak freezes, XP totals,
and account leveling — the mechanic itself ran against the *no streaks, no
leagues, no guilt* promise, not just its Home/recap presentation. Deleted
`src/xp.js` and `src/xpService.js` outright; trimmed `src/streak.js` down to the
two plain date helpers (`todayStr`, `daysBetween`) still needed elsewhere. Removed
the account-level badge (Home), the level-up card (session recap), the streak/
streak-freeze/account-level stat cards (Profile), the streak/level achievement
groups (`src/achievements.js`), the dev-only streak/XP debug actions (`src/Dev.jsx`),
and the "+N XP" completion copy from all 11 drill/reader screens. Deliberately kept:
`daily_activity` day-counting (feeds the Study Calendar heatmap) and a minimal
`profiles.last_studied_on` write-back in `Study.jsx` (feeds the calm "gentle return
after a break" welcome — the one non-gamified consumer of that field, previously
written only by the now-removed streak updater). DB columns (`total_xp`,
`streak_freezes`, `streak`, `longest_streak`) were left in place, unused — no
migration to drop them, since this removed the feature, not historical data.
- [ ] *(optional follow-up)* Drop the now-dead `profiles` columns (`total_xp`,
  `streak_freezes`, `streak`, `longest_streak`) once we're confident nothing else
  reads them.

## Frontend cleanup
- [x] **`Stories.jsx` shelf logic extracted to `src/storyShelves.js` (2026-07-30).** The
  screen held two closures over render scope (`shelvesForTier`, `tierInfo`) plus a
  ~70-line IIFE inside the JSX that filtered, arc-grouped and split every level of
  the open tier. All of it is pure and all of it decides what a learner can read,
  so it now lives in a module with 22 specs beside it — `shelvesForTier`,
  `tierInfo`, `defaultTier`, `splitShelf` — and the JSX renders a `LevelBlock`
  component instead. No behaviour change; the tier rules are identical.
- [ ] Continue extracting the large `Study` screen into focused hooks/components.
- [ ] Supabase generated types (gradual TypeScript adoption).
- [ ] Centralize design tokens (colors/spacing/shadows) beyond the current shared primitives.

## App icon V2 (E2 APPROVED and IMPLEMENTED 2026-08-15)

**Shipped on the icon branch:** V2 balanced brush mark + E2 shallow-inlay
vermilion lacquer, generated by the rewritten `tools/generate-app-icons.mjs`
from the locked mask (`docs/icon-v2/brush/masters/mask-V2.png`) and gated by
`tools/verify-app-icons.mjs` (8 checks incl. a mean-abs-diff match against the
approved device-gate render). iOS Any/Dark/Tinted authored in
`Contents.json`; Android full-bleed background, safe-zone foreground,
authored `<monochrome>` on both launcher XMLs, three dead template files
deleted; web icons + `favicon.svg` unified onto the same mark;
`monochrome-512.png` added to the manifest; `sw.js` bumped to v8 so cached
old icons flush. History: audit → concepts → rings → brush → device gate in
the `P14-APP-ICON-V2-*.md` docs.

Still open:

- [ ] **Device verification** (needs a phone/TestFlight): the four iOS
  appearance modes, Settings › Apps in dark mode, Android themed launchers,
  masks + parallax. Folded into the §4 device pass in PRE-RELEASE.
- [ ] **Splash screens + `Hanzi-logo.png` still show the pre-V2 mark** —
  regenerate together AFTER Home V3 lands (the web splash overlay draws
  Hanzi-logo.png; switching only one side makes the mark swap mid-launch).
- [ ] **Icon Composer `.icon`** on a Mac with Xcode 26 — an upgrade over the
  asset catalog, not a blocker. Flat layers ready in `assets/icon-composer/`.
- [ ] E1 (flat, no inlay) remains the documented fallback: set `bands: false`
  in the generator's `flatIcon()`/`markLayerPNG()` calls and re-run.

- [ ] **iOS `AppIcon.appiconset/Contents.json` declares only the Any appearance.**
  No `luminosity: dark` and no `luminosity: tinted` entry exists, and no dark or
  greyscale artwork exists anywhere in the repo to put in one — the generator's
  `DARK` constant is used by splash screens only. So iOS *synthesises* the dark
  and tinted icons from the light one, differently on different surfaces, which
  is why the icon appears to change by itself. The artwork is close to the worst
  case for that treatment: 82% of the canvas is `#FAFAF8` (luma 250) and the ink
  is *darker* than the ground (luma 87), so tinted inverts figure and ground.
- [ ] **Android has no `<monochrome>` layer**, on either `ic_launcher.xml` or
  `ic_launcher_round.xml` — themed icons (13+) are off by omission at
  `targetSdk 36`.
- [ ] **The adaptive background is inset 16.7%**, so it covers exactly the 72 dp
  mask and the 18 dp effect margin is transparent. A background layer must be
  full-bleed 108 dp. Compounding it, the foreground mark ends up at ~33% of the
  canvas inside a 66 dp safe zone. `docs/PRE-RELEASE-CHECKLIST.md` §0 records the
  inset as intentional; it isn't, and that entry needs correcting.
- [ ] **Dead Android Studio templates** still in the tree:
  `drawable/ic_launcher_background.xml` (teal grid),
  `drawable-v24/ic_launcher_foreground.xml` (the robot),
  `values/ic_launcher_background.xml`. Unreferenced, but they sit exactly where a
  future monochrome drawable goes.
- [ ] **Three reds and two marks.** `#B83A24` (product accent), `#C43A22`
  (`favicon.svg`, a geometric arc), `#E1350F` (the icon's brush artwork).
- [ ] **The current mark is an ensō — a Japanese Zen symbol** — on a
  Chinese-only product. Named as such in `tools/generate-app-icons.mjs`,
  `public/favicon.svg` and `docs/PRE-RELEASE-CHECKLIST.md`. This is the decision
  V2 actually turns on; the audit recommends a vermilion seal (印) with the ring
  reversed out of it, which fixes the appearance problem structurally at the same
  time.
- [ ] `docs/DEPLOY.md` (~132) is stale — it still describes icons as generated
  from `src/assets/Hanzi-logo.png` by an ad-hoc script.
- [ ] Follow-up, **sequenced after Home V3 lands**: `src/assets/Hanzi-logo.png`
  is the same ensō and is imported by eight screens including `Sidebar.jsx`, so
  the in-app logo and the app icon would show different marks until it follows.
  Asset swap only — no code change in those files.

## Pre-release readiness audit (2026-08-15) — 4 blockers

Full evidence table: [`docs/PRE-RELEASE-READINESS-AUDIT.md`](PRE-RELEASE-READINESS-AUDIT.md).
Research only; nothing was fixed. The five confirmed blockers:

- [x] ~~🔴 iOS cannot be built (Apple Sign-In SPM conflict)~~ — **RETRACTED
  2026-08-15, this was wrong.** It read the plugin's *upstream* manifest instead
  of what `cap sync ios` produces. Capacitor **8.4.1** shipped `fix(cli): patch
  Capacitor SPM dependency version in plugins` (#8492, `28bb2c6`); this project
  runs CLI **8.5.0**, and `node_modules/@capacitor/cli/dist/ios/update.js:49-63`
  rewrites the plugin's `from: "7.0.0"` → `from: "8.0.0"` on every sync, which
  `exact: "8.5.0"` then satisfies. `ios-testflight.yml` runs `npm ci` (:90) →
  `cap sync ios` (:126) → `xcodebuild archive` (:238), so the patch lands before
  Xcode resolves. Builds 43/44/45 prove it. This sandbox is Linux and has never
  run `cap sync`, so `node_modules` still holds the pristine manifest — reading
  it directly is **not** the build path. Now tracked as 🟠 REAL RISK: the CLI
  forces the version but warns *"built for Capacitor 7, it might cause issues"*,
  and the Apple sign-in **runtime** flow is still device-unverified. One
  successful TestFlight sign-in drops it to tech debt. **Do not downgrade
  Capacitor, vendor the plugin, or hand-patch Package.swift.**
- [ ] 🟠 **DojoHQ's code ships inside the store bundle.** Excluding `hq.html`
  (`vite.config.js:60-61`) drops only the second *entry point*; `src/App.jsx:58`
  still lazy-imports `./DojoHQ` for the in-app `/hq` route, so a
  `DOJO_PUBLIC_BUILD=1` build emits `DojoHQ-*.js` (**124 kB**) + `DojoHQ-*.css`
  (69 kB), with the `127.0.0.1:43127` bridge string inside. Access is
  server-enforced, so this is dead weight and an Apple 2.3.1(a) talking point,
  not a leak. **Fix needs `App.jsx` — do it after Codex merges.**
- [x] 🟠 **`build:public` — the bundle both stores ship — is never run in CI.**
  FIXED 2026-08-15 — `ci.yml` builds it on every PR, plus a personal-identifier
  assertion over `dist/`. Original finding:
  `ci.yml:53-54` runs `npm run build`, the *Sites* variant (emits `hq.html`).
  A store-only regression passes every PR check. Not a blocker (the native
  workflows do build it before upload) but cheap and high-value to close.
- [ ] 🔴 **No App Review demo account exists.** `docs/STORE-LISTING.md:133-136`
  holds a placeholder; Apple 2.1(a) makes a non-working login an automatic
  rejection. Needs a real seeded account, password entered in the console only.
- [ ] 🔴 **Content licensing is unproven.** *Partly closed 2026-08-15:* `LICENSE`
  (all-rights-reserved, flagged for owner confirmation), `NOTICE.md` and
  `docs/CONTENT-LICENSING.md` now exist; `/terms` no longer overclaims and
  CC-CEDICT's ShareAlike terms are properly disclosed; `public/icons.svg` is
  deleted; and new generated imagery must record its prompt and date
  (`artProvenance.mjs`). **What still blocks is owner-only:** the icon master's
  origin and the Azure Speech tier. Original finding: No LICENSE/NOTICE anywhere. Commercial-use
  rights for the Higgsfield/`nano_banana_pro` art (127 committed panels + covers),
  Azure Neural TTS audio, and LLM-generated story text are not recorded. Generation
  prompts are not archived either — `data/manhua/*.art.json` hold only `{file,url}`
  plus a prose `_style_comment`, so there is no per-image evidence the
  STORY-BIBLE "no resemblance to any franchise" constraint was applied.
  **Deep-dive 2026-08-15 → `docs/CONTENT-PROVENANCE-AUDIT.md`.** Higgsfield's
  terms came back *clean* (no ownership claim, commercial use permitted,
  sublicensable), but three harder sub-blockers surfaced: (a) the icon master
  `src/assets/86055582-…png` has **zero metadata** and no traceable origin, and
  every shipped icon is a pixel-derivative of it — the approved V2 mark is a
  cleaned raster, not a redraw; (b) `src/TrustPages.jsx:196` publicly claims
  © over that artwork; (c) Azure grants commercial rights for prebuilt neural
  voices on **paid tiers only** and the Speech resource tier is not in the repo.
  Also new: the 16 `upstairs/hsk3/ep01` panels have **no manifest at all**, and
  `public/icons.svg` ships four companies' brand marks while being referenced by
  zero app code.
- [x] 🔴 **A personal email ships in the production bundle** — FIXED 2026-08-15.
  The allowlist mechanism is gone; `/dev` gates on `profile.is_admin` inside
  `Dev.jsx`, and CI now builds `build:public` and fails if the address returns.
  Original finding: `src/devTools.js:11`
  `DEFAULT_DEV_EMAILS = 'fabrykjoh@gmail.com'`, confirmed present in
  the emitted `dist/client/assets/devTools-*.js`. Because `VITE_DEV_EMAILS` was
  unset at build time, Vite inlined the literal as the *only* surviving value.
  Related: `/dev` renders for **any** signed-in user (`src/App.jsx:690-701`) and is
  gated only inside the component, unlike `/hq` and `/dashboard` which 404.
  **Preferred fix (see `docs/RELEASE-BLOCKER-REMEDIATION.md` §3): delete the email
  allowlist entirely and gate `/dev` on `profile.is_admin` inside `Dev.jsx`** —
  closes both halves at once, and touches no file Codex is holding.
  Severity note: public-but-unprofessional, **not** a security exposure — every
  `/dev` action is RLS-scoped to the signed-in account.
- [ ] 🔴 **Play's web-accessible deletion URL.** Play requires an in-app path *and*
  a URL reachable without the app. `docs/STORE-LISTING.md:183` answers
  `/profile`, which sits behind the `!session` gate (`src/App.jsx:375-380`).
  **Decided: answer Play with `/support`**, which is already in `TRUST_PAGES`
  and already carries the in-app path plus the email fallback. What it lacks is
  Play's second half — *which data is deleted, which is kept, and any retention
  period*. Copy-only edit in `TrustPages.jsx`; no routing change, so it avoids
  `routes.js`, which Codex is editing.

Notable non-blockers worth queuing: `public/sw.js:177-178` references
`pwa-192.png`, which **does not exist** (App Icon V2 rename missed it — broken
push icon); `syncQueue.js:6-7` only enqueues when `navigator.onLine === false`,
so writes failing while nominally online are dropped; no timeout/backoff on any
Supabase call; Grammar screens degrade to *empty* rather than an error state.

Verified clean: no committed secrets, no third-party analytics/ads/crash SDK, no
advertising ID, no monetization of any kind, paused JP/RU tracks cannot leak
(both `PUBLIC_LANGUAGES` and `ADMIN_LANGUAGES` are Chinese-only), and all six
`admin_*` RPCs genuinely guard with `assert_admin()` (verified live).

## Deploy steps (apply before the feature works)
- [x] **Public story links — APPLIED (verified in prod 2026-08-07: `public_story` function exists).** Original entry: apply migration `supabase/migrations/20260716000000_add_public_story.sql` in the Supabase SQL editor. It adds the anon-callable `security-definer` RPC `public_story(uuid)` (returns one published story + its language's active vocab capped to the story's level). Until applied, `/read/:id` shows the "story not found" state (a `console.error` fires so it's diagnosable). Smoke-test: `POST $VITE_SUPABASE_URL/rest/v1/rpc/public_story` with the anon key and a published story UUID → JSON with `title` + `vocab_pool`; an unpublished id → `null`.

## Done
- [x] **#needs-testing Discord feed** — `docs/TESTING.md` mirrors to a Discord **forum** channel, one thread per item (stable-id keyed, edited in place, ✅ when checked off), so testers can react/reply per item. `scripts/needs-testing-discord.mjs` (pure parser unit-tested) + `.github/workflows/needs-testing-sync.yml` (fires on push to main touching `docs/TESTING.md`). *(one-time: make #needs-testing a FORUM channel, add its webhook as secret `DISCORD_TESTING_WEBHOOK`; skips until set.)*
- [x] **Public story links** — signed-out `/read/:id` page: pick a level → "you'd understand ~X%" (canonical `calculateStoryReadability`) → teaser lines with known/new highlighting → signup gate; the reader's share card now links here. Anon funnel events (`public_story_viewed/level_picked/signup_clicked`) feed the dashboard. Pure logic in `src/publicStoryHelpers.js` + `readStoryId` in `routes.js` (tested); page code-split (lazy). *(needs the migration above applied)*
- [x] Onboarding language cards render equal width — the longer "Русский" label no longer stretches the Russian card past the two CJK cards (`src/Onboarding.jsx`).
- [x] Story reader no longer dead-ends: "learn N more to unlock the next tier" hook (`src/StoryReaderImmersive.jsx`, `nextLockedTier`).

---

## Known issues (migrated from CLAUDE.md §16)

These moved out of `CLAUDE.md` so that file stays short enough to read every
session. **Some entries predate the current state** — they were accurate when
written and have not been re-verified since. Confirm against the code or the DB
before acting, and delete an entry once it is resolved rather than annotating it.

**In progress:**
- **Apply migration `20260630000000_add_xp_and_prefs.sql`** in the Supabase SQL Editor to enable persistence of account XP and study prefs (`total_xp`, `recall_mode`, `audio_autoplay`, `furigana_default`). The app is defensive — it runs without it (defaults applied in code), but XP/prefs won't save across reloads until the columns exist.
- **Apply migration `20260630010000_add_story_questions.sql`**, then generate questions (Action `task=comprehension`, or `node --env-file=.env.script generate-comprehension.mjs`). The end-of-story comprehension card only appears once questions exist; the "new words" recap works without it.
- **Japanese example sentences (N5 Part 1 + Part 2):** 798/800 words populated. Run `node --env-file=.env.script generate-examples.mjs --japanese` to fill the remaining 2.

**Russian (new language — frontend + DB ready, content pending):**
- **Apply migration `20260701120000_add_russian_language.sql`** so the DB accepts `language='russian'` / `system='russian'` (relaxes the CHECK constraints across profiles, language_tracks, vocabulary, test_attempts, level_unlocks, stories, youtube_recommendations; RLS unchanged). Until applied, creating a Russian track fails the CHECK.
- **Seed the starter deck** (`data/russian-a1.json`, 147 A1 words) via `seed-vocab.mjs --language russian --system russian --level 1 --apply` (needs a runner with Supabase access, like HSK 2). Then run the pipeline: `generate-audio --language russian --system russian --level 1` → `generate-examples --russian` → `generate-stories --language russian --system russian --level 1`.
- The Cyrillic alphabet drill, gating of CJK-only modes, background, accent, and native name all ship in the frontend already.

**Missing content:**
- **Japanese YouTube recommendations:** None published. Chinese HSK 1 has 3.
- **HSK 2 vocabulary: COMPLETE** (Chinese HSK 3.0 level 2) — 198 words + audio + example sentences + 15 stories + comprehension questions, all live. Only missing extra: YouTube recommendations. Both HSK 1 and HSK 2 are now done.
- **JLPT N4 (level 3): 636 words seeded** (`data/n4.json`); audio/examples/stories/comprehension run via the Action. **HSK 3–9 and JLPT N3–N1:** still no vocabulary — level selection exists but shows empty study queues.

**Technical debt:**
- **Vocabulary `meaning` data is messy and sometimes wrong (TODO — deferred).**
  AI-generated glosses have junk formatting ("Good morning., Good afternoon.,
  Hello.") and some are semantically off (こんにちは listed as "good morning").
  `cleanMeaning()` tidies *display* in the reader + flashcard, but the source
  data is still messy and used elsewhere. Two follow-ups, do **#1 first**:
  1. **Deterministic DB cleanup script — DONE (`clean-meanings.mjs`).** Imports
     `src/cleanMeaning.js` (no drift) and applies the same tidy to the `meaning`
     column across all active vocab. Conventions match the `generate-*.mjs`
     scripts (`--env-file=.env.script`, SUPABASE_URL + SUPABASE_SERVICE_KEY).
     **Dry-run by default** (prints every before→after, only rows that differ);
     `--apply` writes; `--chinese`/`--japanese` filter. Free, safe, no AI — never
     blanks a meaning. **Not yet run** — run it (or via a runner that can reach
     Supabase) to fix formatting everywhere (flashcards/test/writing/stories).
  2. **Regenerate meanings** (later) — `generate-meanings.mjs` already exists
     (70B, tighter prompt, `--dry-run`/`--chinese`/`--japanese`). Easiest path is
     the one-click Action (`task=meanings`, `language=both`). Neither Chinese nor
     Japanese meanings have been regenerated yet. Costs API calls; spot-check.
- **Example sentences — Chinese regenerated; Japanese still pending.**
  The generator was upgraded (`generate-examples.mjs`: 70B model + quality
  prompt + few-shot + an anti-tautology rule). **Chinese HSK 1 (all 300 words)
  has been regenerated** via the one-click Action (`task=examples,
  language=chinese`). **Japanese is still on the old data** — run the Action with
  `task=examples, language=japanese` (or `--japanese --regen` locally) to fix it.
  Costs Groq tokens; spot-check, and consider the counter-suffix entries
  (～さい/～グラム/～たち) for deactivation since they make awkward sentences.
- **Some Japanese audio mispronounces kanji.** Fix: generate-audio.mjs already uses `v.reading` (hiragana). Delete the storage folder for the level before regenerating so files are not skipped.
- **Duplicate kanji + counter-suffix cleanup — script written (`deactivate-awkward-vocab.mjs`), not yet run.** Duplicate-reading kanji (何 = なん/なに, 私 = わたし/わたくし) create identical-looking options across Test/Listening/Fill-in-the-blank; counter-suffix entries (～さい/～グラム/～たち) are grammar fragments that make nonsense in the sentence modes. The script deactivates suffix entries (Japanese words starting with a wave dash) and the secondary reading of the listed duplicates (only if the word keeps another active row — never fully removes a word). Safe/reversible (`is_active=false` only, dry-run by default). Run via the Action (`task=deactivate-awkward`) or `node --env-file=.env.script deactivate-awkward-vocab.mjs --apply`. Reading is also already shown in Test.jsx Japanese options.
- **Unified Stories reader.** All languages route through `src/StoryReader.jsx`, now a 50-line presentation dispatcher (immersive / paced / chat / scene / manhua). The old "dead in-file `StoryReader`/`CharacterGuide`/`StoryLine` in Stories.jsx" note was stale — verified gone 2026-08-07; no dead reader code remains.
- **Mobile layout.** Below 768px the left sidebar is replaced by a fixed bottom bar (MobileNav.jsx, 5 tabs + a "More" sheet); App.jsx branches the shell via useIsMobile(). Each top-level screen (Home, Study, Test, Writing, Stories, Profile, Settings, LanguageSwitcher, YouTube) reduces its horizontal padding (~32px → ~16px) on mobile via useIsMobile(). Stat/option grids use `1fr`/`minmax(0,1fr)` columns so they compress without overflow. Further polish (font scaling, 4-col → 2-col stat grids on very small phones) is optional.
- **ESLint baseline (current): `npx eslint .` = 7 errors / 6 warnings.** The §0a "0 errors" claim from PR #40 is stale — new rules (`react-hooks` v6's `set-state-in-effect`) and new non-app files landed since. Current breakdown:
  - **4 errors — `playwright.config.js`** (`no-undef` on `process`): the flat config only declares `globals.browser`, so Node globals in the e2e config are flagged. Harmless; fix by giving that file a Node-globals config block.
  - **3 errors — `tests/fixtures/mockSupabase.js`** (1 `no-empty`, 2 `react-hooks/rules-of-hooks` on a Playwright `page.use(...)` call the rule mistakes for a React hook). Test fixture, not app code.
  - **6 warnings** — the intentional `react-hooks/exhaustive-deps` on mount-load effects + audio autoplay (unchanged since PR #40).
  - **`.claude/**` is ignored** (`eslint.config.js` `globalIgnores`) — it holds Claude Code tooling (skills/commands/worktrees), not app source; it was contributing 15 `no-undef` errors on `require`/`process`.
  - **Zero errors remain in `src/`. Keep it that way** — don't add new ones.
- **Existing ESLint hook-dependency warnings** in some files — don't add new ones.
- **Legacy DB columns** `ease_factor` and old SM-2 `learning_step` semantics are kept in the cards table but unused. Do not write to `ease_factor`.
