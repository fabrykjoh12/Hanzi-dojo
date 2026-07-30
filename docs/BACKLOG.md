# 🛠️ Engineering backlog

Granular fixes, tech-debt, and ops tasks. **Internal — not community-facing.**
The public plan lives in [`ROADMAP.md`](../ROADMAP.md), which auto-posts to the
`#roadmap` Discord channel; keep raw bug detail and dashboard-only steps here so
that stays clean. Move items to **Done** as they land (or promote user-facing
ones to the roadmap).

Active milestone, task assignments, ownership boundaries and merge order live in
[`docs/PM-BOARD.md`](PM-BOARD.md) (not Discord-synced). This file stays the
long-lived engineering backlog; the board holds short-lived execution state.

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
- [ ] **`20260730090000_manhua_presentation_rename.sql` — WRITTEN, NOT APPLIED.** Retags the fourth presentation `'manga'` → `'manhua'` (Chinese word for the form; the Japanese one was a slip). Idempotent: it widens `stories_presentation_check` to accept both spellings, UPDATEs the one row, then narrows the constraint to `'manhua'` alone. **Order does not matter** — `presentationOf` in `src/readerMode.js` aliases the old tag to the new one, so the app deploy and this migration can land in either order without the live episode dropping to a plain paced story in between. Once it is applied everywhere, that alias and the `LEGACY_PROGRESS_PREFIX` fallback in `src/manhuaProgress.js` (which reads reading positions saved under the old `manga:` IndexedDB key) can both be deleted.
- [x] **APPLIED 2026-07-28 — `20260728210000_fix_language_reset_missing_writing_stats.sql`.** "Reset HSK 3.0 progress" failed outright with `relation "public.writing_stats" does not exist`, so a language's progress could not be cleared. Root cause was the §10 classic: `20260605224500_add_writing_stats.sql` sat in the repo unapplied while the reset RPC that deletes from that table was applied. It cost more than the reset — `src/Writing.jsx` reads and upserts `writing_stats` on every writing answer, so writing practice was discarding its results. The fix creates the table idempotently AND guards the RPC's delete with `to_regclass`, so a missing optional table can never abort a reset again. Applied through the dashboard SQL editor (the sandbox's MCP write gate was unreachable that session). **Worth a check when convenient:** reset a language from Profile and confirm it completes, and that a writing answer now persists across a reload.

## Auth / email / hosting
- [ ] **Custom SMTP — LIVE TEST PENDING.** Configured 2026-07-18: Brevo is the sending provider; `hanzi-dojo.com` shows **Authenticated** in Brevo (DKIM `brevo1/brevo2._domainkey`, `brevo-code` TXT, DMARC `p=none` — all added in Cloudflare DNS, the authoritative nameserver; Vercel only hosts). Supabase custom SMTP wired to `smtp-relay.brevo.com:587`, sender `no-reply@hanzi-dojo.com`. **Still to verify:** send a real magic-link/sign-up to an external inbox and confirm it (a) arrives (not spam) and (b) shows From `no-reply@hanzi-dojo.com`. Brevo "Branding" (the `em`/`img.em`/`r.em` CNAMEs) shows *Not branded* — optional, tracking-link cosmetics only, doesn't block sending.
- [ ] **Auth URL config** — set Site URL = `https://hanzi-dojo.com` and add redirect allowlist `https://hanzi-dojo.com/**` + `http://localhost:5173/**`. Fixes the login redirect that jumps to the raw github.io host. *(dashboard)*
- [ ] **Google sign-in shows the Supabase URL** — the Google consent screen reads "continue to `bvqvturqupbggxaeihvi.supabase.co`" because that's Supabase's OAuth **callback** domain. NOT a code bug (`src/Auth.jsx` `handleGoogle` already sets `redirectTo` = the app origin). Two-part dashboard fix: **(1)** Google Cloud Console → APIs & Services → OAuth consent screen → set **App name** "Hanzi Dojo" + logo + authorized domain `hanzi-dojo.com`, then publish/verify → Google names the app "Hanzi Dojo" instead of the project ref (biggest visible win, free). **(2)** To remove the `…supabase.co` "continue to" line entirely, set up a **Supabase Custom Domain** (`auth.hanzi-dojo.com` — Pro add-on + a CNAME in Cloudflare), then add the new `https://auth.hanzi-dojo.com/auth/v1/callback` as an authorized redirect URI on the Google OAuth client. Re-test the full Google flow after. *(dashboard + DNS)*
- [ ] **Turn off the retired GitHub Pages site** — repo Settings → Pages → Source → None. The deploy workflow is already removed; this disables the last-built site.
- [ ] **🔴 Two Cloudflare Workers projects fail CI on every commit** — `hanzi-dojo` and `hanzidojo` both have the GitHub Git integration enabled and try to auto-build this repo on every push. They cannot succeed: there is **no wrangler config in the repo at all** (no `wrangler.toml` / `.jsonc` / `.json`) and no deploy script. `docs/DEPLOY.md` §Cloudflare is explicit that Cloudflare is **DNS only, not hosting** — Vercel builds and serves — and that `worker/index.js` is deployed by hand. So every PR carries two permanently-red checks that mean nothing, which is exactly how a real failure gets ignored. **Do not "fix" this by adding a wrangler config:** that would start auto-deploying a worker the docs say ships manually. Fix is in the Cloudflare dashboard — disconnect the Git integration on both Workers projects, or delete them if the standalone `*.chatgpt.site` build is retired. Now more clearly vestigial: Dojo HQ runs on Supabase, so `worker/index.js` only serves that standalone build. *(dashboard)*

Already shipped (code side): `signUp` now sends `emailRedirectTo`; hardcoded github.io links replaced with `BRAND_URL`; app consolidated on Vercel (base `/`).

## Data safety
- [ ] **Transactional grading** — collapse the separate writes (card update, review log, daily activity) into a single Supabase RPC/transaction so a mid-write failure can't leave partial state. See the data-safety note in `README.md` and `src/syncQueue.js`.
- [ ] **Real-device verification pass** — offline grade replay, iOS/Safari flashcard + reader audio, and Web Push reminders end-to-end. All built and unit-tested but never exercised on a live device.

## Admin tooling
- [x] **Dojo HQ migration APPLIED 2026-07-27.** `dojo_items`, `dojo_comments`, `dojo_attachments` exist in prod with RLS on. Still open: a second person needs `is_admin = true` before they can see the board (`/make-admin`), and the board has not been exercised end-to-end against real data.
- [x] **`_reading_backup_20260725` had RLS disabled — FIXED 2026-07-27** (`20260727150000_enable_rls_on_reading_backup.sql`, applied). The pre-fix readings snapshot was created without RLS, leaving 1,871 rows readable *and writable* by anyone with the public anon key. Found by the Supabase security advisor. Nothing reads the table, so RLS is enabled with **no policies** deliberately: PostgREST denies everyone, the service key still reaches it for a restore. **Worth a habit:** run `get_advisors` after any migration — this sat exposed since 25 July and nothing in CI would have caught it.
- [ ] **Dojo HQ — schema notes.** `/hq` is backed by the app's own Supabase project and keyed to the signed-in account (`src/dojoSupabaseClient.js`), replacing the `localStorage` device board that could never be shared. `20260727140000_add_dojo_hq.sql` created `dojo_items`, `dojo_comments`, `dojo_attachments`, all with RLS where every policy requires `exists (select 1 from profiles where id = auth.uid() and is_admin)`, plus a security-definer `dojo_hq_members()` and a private `dojo-attachments` bucket. Membership *is* `profiles.is_admin` — there is no workspace or invite system, every admin shares one board. If the tables are ever missing the screen names the migration rather than showing an empty board (CLAUDE.md §10).
- [ ] **`src/devTools.js` violates two standing rules.** The `/unlock` helper writes `state: 'review', is_easy: true` (line 32) and `ease_factor: 2.5` (lines 33, 43). §7.3 reserves `is_easy = true` for the SRS grading flow alone, and §10 says never write `ease_factor` — it is a dead SM-2 column. `src/creativeMode.js` (Creative mode, below) does the same job correctly: FSRS `stability`/`difficulty`/`due_at`, `is_easy` explicitly false, no `ease_factor` key. Port `/unlock` onto it and the duplication goes too.
- [ ] **Creative mode is untested against a real account.** The admin sandbox on `/dashboard` (level jump, learn/master N words, force N cards due, reset) is unit-tested and writes only rows matching `user_id = session.user.id`, but has never been run against live data. Exercise it on the maintainer's own account before relying on it — especially the level jump, which appends to the append-only `level_unlocks` (§7.5).

## Scheduling
- [ ] **Timezone-correct reminders** — `send-review-reminders.mjs` fires on a plain UTC hour, so it drifts ~1h across DST. Schedule per user timezone.

## Learning quality
- [ ] **⚠️ Ordering dependency between the two reading fixes.** Apply `20260724120000_fix_hsk3_6_readings.sql` **before** running `normalize-readings.mjs`. The script joins a reading by stripping whitespace only, so it would rewrite 一切 `yī qiè` → `yīqiè` and lose the tone sandhi the migration applies (`yíqiè`) — silently, because `yīqiè` passes the script's phoneme validation, and because afterwards the migration's `where reading = 'yī qiè'` no longer matches, so all 17 sandhi fixes become no-ops. In the correct order there is no conflict: every value the migration writes is already joined, so the script skips those rows as "already joined".
- [ ] **🔴 Pronunciation pinning is silently OFF for ~79% of HSK 3–6.** Chinese audio pins pronunciation with `chinesePhonemeSsml(word, reading)` → `readingToPhonemes(reading)`, but that helper returns `null` for **any reading containing a space**, and the caller then falls back to bare hanzi with no phoneme hint at all. HSK 1–2 joins its syllables (`xièxie`) so it pins ~95% of the time; the HSK 3–6 bulk pass emitted space-separated readings (`jiù shì`), so **HSK 3 pins only 97 of 457 rows (21%)** and ~1,437 rows across levels 3–6 lose the hint entirely. Nothing errors — the TTS just guesses from the hanzi, so polyphones are unprotected exactly where they matter most. Fix is a normalisation pass joining HSK 3–6 readings to the HSK 1–2 style, validated per row (`readingToPhonemes` must return a syllable-aligned string) and followed by an `audio-hsk3-6` regeneration. Sized but not attempted; the 54-row migration below only re-joins the rows it was already touching.
- [ ] **HSK 3–6 wrong readings — MIGRATION WRITTEN, NOT APPLIED.** 54 of the ~1,870 HSK 3–6 words shipped with a wrong `reading`, because HSK 3–6 came from a bulk CC-CEDICT pass while HSK 1–2 was hand-curated. Four classes: CC-CEDICT's ASCII `u:` for ü leaked in verbatim (忽略 `hū lu:è`, 战略, 策略); a rare reading beat the everyday one (厂 `hǎn` not `chǎng`, 转 `zhuǎi`, 追 `duī`, 广 `yǎn`, 藏 `Zàng`, 作, 抢, 圈, 胖, 合, 约, 匹 `pī`→`pǐ`); a proper-noun capital on ordinary words (成功 `Chéng gōng`, 和平, 美元, 网络, 资源, 大众, 通道, 时代, 现代, 将军 + 12 single chars); and **dropped tone sandhi** on 17 words (一切 `yī qiè`→`yíqiè`, 不必→`búbì`, 不见→`bújiàn`…) that HSK 1–2 gets right (一下 `yíxià`, 不错 `búcuò`). ⚠️ Precise scope of the audio impact: only the **single-character** words actually pin, so only those are currently *spoken* wrong (厂 really does say "hǎn"); the multi-syllable spaced ones never pinned, so for them the bug is the **displayed** pinyin only. Found by diffing against the CC-CEDICT `dict_entries` already in the project — note 1,864/1,871 matched *some* attested reading, which is exactly how a polyphone error hides. All replacements are CC-CEDICT-attested and yield syllable-aligned phonemes; none of the 54 is in a learner's deck yet. Fix: apply `supabase/migrations/20260724120000_fix_hsk3_6_readings.sql` (idempotent — matches on the known-bad value), **then re-run Actions → task `audio-hsk3-6`**. ⚠️ Do *not* null `audio_path` to force that: the generator's work list is `vocab.filter(v => v.audio_path)` with `upsert: true`, so clearing the path *excludes* a word. Deliberately left alone: genuine proper nouns (上帝, 圣诞节, 国会, 佛) and ~14 words where both readings are defensible in context (待 dāi/dài, 答 dā/dá, 结 jiē/jié, 泡, 档, 扇, 尽, 切, 挨, 晕, 杆, 踏, 码头, 眼里) — those want a native-speaker call, not a blind edit.
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

**Focus: Chinese only.** Japanese and Russian are paused until the app scales; the
gate lives in `PUBLIC_LANGUAGES`/`ADMIN_LANGUAGES` in `src/languageTheme.js` (add a
language key back to un-pause). The non-Chinese content items below are kept for
when we resume, not scheduled.

- [ ] **25 HSK 6 words still have no example sentence** (down from 335 on 2026-07-28; level 6 stands at 1596/1621). Levels 3, 4 and 5 are complete. Nothing is broken — this is purely a free-tier quota wall, and it does **not** clear on the hour. Two runs have now confirmed the shape of it: the 16:06 run wrote 300 and stopped at `Used 99085`; the 17:21 re-run, 65 minutes later, got only **10 more** words before stopping again at `Used 99430 / Limit 100000`, `retry-after: 3631`. Groq's tokens-per-day is a **rolling 24-hour window**, so an hourly re-run only recovers whatever trickles out of the window — roughly 10 words a run. Don't loop it. Either wait ~24h from the 16:06 bulk run for the window to clear properly and finish the last 25 in one pass, or use a key with real headroom (Gemini's daily free tier resets at midnight Pacific and would cover 25 words easily). Re-run is Actions → `examples-fill`, `language: chinese`, `level: 6`. History below.
- [ ] **335 HSK 3-6 words still have no example sentence.** ✅ *Mostly resolved 2026-07-28 — 300 of 335 filled; see the entry above.* The Tatoeba backfill (`backfill-examples.mjs --levels 3-6 --apply`, Actions task `examples-hsk3-6`) matched **4,160 of 4,495** on 2026-07-28 and is now exhausted — the remainder simply has no Tatoeba sentence containing the word. Left: level 3 ×3, level 4 ×33, level 5 ×74, level 6 ×225 (the tail is the rarest vocabulary, so it skews to level 6). Finish with the LLM path, one level at a time: Actions → `examples-fill`, `language: chinese`, `level: 3` … `6`. That path is already paged and stops early on a spent quota (`f51c626`) and reports a refusal instead of retrying it 46 times (`6834533`), so a quota wall costs one short run, not a burned hour. ⚠️ **Gemini's free daily quota is spent** — the 15:43 level-3 run got a 429 on all four attempts and wrote nothing. `llm.mjs` now fails over to Groq after three consecutive quota refusals, so the next run finishes on the standby; if both are walled, the fill simply has to wait for the daily reset. Nothing is broken meanwhile — the fill-in-the-blank question builder already filters to rows whose `example_sentence` contains the word (`src/fillBlank.js`), so a missing example just means that word never becomes a cloze question.
- [ ] **Azure flashcard TTS can't run in CI — the secrets are unset.** `tts-flashcards` (`tts-generate.mjs`, the only script that spends money on speech) is wired into `regen-content.yml` with its dry-run/confirm/cap guards, but the 2026-07-28 run's env dump shows `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` **empty** — only `GOOGLE_TTS_KEY` is populated. So HSK 3-6 has zero rows in `tts_audio` (levels 1-2 have full `word` coverage from the earlier pass), which means no slow-word and no sentence audio there. **This is not user-visible today:** all 4,498 words have a legacy `audio_path`, and `flashcardAudio()` falls back to it for the `word` variant, hiding the slow/sentence controls when absent. Fix is repo settings, not code: add `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` as Actions secrets, then run `tts-flashcards` per level (dry run first — `tts_confirm` unticked — then confirm; the 200-record cap needs `--override-max`, which the task adds automatically above a limit of 200).
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
- [ ] Continue extracting the large `Study` screen into focused hooks/components.
- [ ] Supabase generated types (gradual TypeScript adoption).
- [ ] Centralize design tokens (colors/spacing/shadows) beyond the current shared primitives.

## Deploy steps (apply before the feature works)
- [ ] **Public story links** — apply migration `supabase/migrations/20260716000000_add_public_story.sql` in the Supabase SQL editor. It adds the anon-callable `security-definer` RPC `public_story(uuid)` (returns one published story + its language's active vocab capped to the story's level). Until applied, `/read/:id` shows the "story not found" state (a `console.error` fires so it's diagnosable). Smoke-test: `POST $VITE_SUPABASE_URL/rest/v1/rpc/public_story` with the anon key and a published story UUID → JSON with `title` + `vocab_pool`; an unpublished id → `null`.

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
- **Unified Stories reader.** Both Chinese and Japanese now use `StoryReaderImmersive.jsx` (Intl.Segmenter word tapping, furigana/pinyin, per-speaker dialogue labels, bottom-sheet definitions, audio bar). The old in-file `StoryReader` (and `CharacterGuide`/`StoryLine`/sidebar cards) in Stories.jsx are now **dead code** — safe to delete in a cleanup pass.
- **Mobile layout.** Below 768px the left sidebar is replaced by a fixed bottom bar (MobileNav.jsx, 5 tabs + a "More" sheet); App.jsx branches the shell via useIsMobile(). Each top-level screen (Home, Study, Test, Writing, Stories, Profile, Settings, LanguageSwitcher, YouTube) reduces its horizontal padding (~32px → ~16px) on mobile via useIsMobile(). Stat/option grids use `1fr`/`minmax(0,1fr)` columns so they compress without overflow. Further polish (font scaling, 4-col → 2-col stat grids on very small phones) is optional.
- **ESLint baseline (current): `npx eslint .` = 7 errors / 6 warnings.** The §0a "0 errors" claim from PR #40 is stale — new rules (`react-hooks` v6's `set-state-in-effect`) and new non-app files landed since. Current breakdown:
  - **4 errors — `playwright.config.js`** (`no-undef` on `process`): the flat config only declares `globals.browser`, so Node globals in the e2e config are flagged. Harmless; fix by giving that file a Node-globals config block.
  - **3 errors — `tests/fixtures/mockSupabase.js`** (1 `no-empty`, 2 `react-hooks/rules-of-hooks` on a Playwright `page.use(...)` call the rule mistakes for a React hook). Test fixture, not app code.
  - **6 warnings** — the intentional `react-hooks/exhaustive-deps` on mount-load effects + audio autoplay (unchanged since PR #40).
  - **`.claude/**` is ignored** (`eslint.config.js` `globalIgnores`) — it holds Claude Code tooling (skills/commands/worktrees), not app source; it was contributing 15 `no-undef` errors on `require`/`process`.
  - **Zero errors remain in `src/`. Keep it that way** — don't add new ones.
- **Existing ESLint hook-dependency warnings** in some files — don't add new ones.
- **Legacy DB columns** `ease_factor` and old SM-2 `learning_step` semantics are kept in the cards table but unused. Do not write to `ease_factor`.
