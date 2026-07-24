# 🛠️ Engineering backlog

Granular fixes, tech-debt, and ops tasks. **Internal — not community-facing.**
The public plan lives in [`ROADMAP.md`](../ROADMAP.md), which auto-posts to the
`#roadmap` Discord channel; keep raw bug detail and dashboard-only steps here so
that stays clean. Move items to **Done** as they land (or promote user-facing
ones to the roadmap).

Active milestone, task assignments, ownership boundaries and merge order live in
[`docs/PM-BOARD.md`](PM-BOARD.md) (not Discord-synced). This file stays the
long-lived engineering backlog; the board holds short-lived execution state.

## Auth / email / hosting
- [ ] **Custom SMTP — LIVE TEST PENDING.** Configured 2026-07-18: Brevo is the sending provider; `hanzi-dojo.com` shows **Authenticated** in Brevo (DKIM `brevo1/brevo2._domainkey`, `brevo-code` TXT, DMARC `p=none` — all added in Cloudflare DNS, the authoritative nameserver; Vercel only hosts). Supabase custom SMTP wired to `smtp-relay.brevo.com:587`, sender `no-reply@hanzi-dojo.com`. **Still to verify:** send a real magic-link/sign-up to an external inbox and confirm it (a) arrives (not spam) and (b) shows From `no-reply@hanzi-dojo.com`. Brevo "Branding" (the `em`/`img.em`/`r.em` CNAMEs) shows *Not branded* — optional, tracking-link cosmetics only, doesn't block sending.
- [ ] **Auth URL config** — set Site URL = `https://hanzi-dojo.com` and add redirect allowlist `https://hanzi-dojo.com/**` + `http://localhost:5173/**`. Fixes the login redirect that jumps to the raw github.io host. *(dashboard)*
- [ ] **Google sign-in shows the Supabase URL** — the Google consent screen reads "continue to `bvqvturqupbggxaeihvi.supabase.co`" because that's Supabase's OAuth **callback** domain. NOT a code bug (`src/Auth.jsx` `handleGoogle` already sets `redirectTo` = the app origin). Two-part dashboard fix: **(1)** Google Cloud Console → APIs & Services → OAuth consent screen → set **App name** "Hanzi Dojo" + logo + authorized domain `hanzi-dojo.com`, then publish/verify → Google names the app "Hanzi Dojo" instead of the project ref (biggest visible win, free). **(2)** To remove the `…supabase.co` "continue to" line entirely, set up a **Supabase Custom Domain** (`auth.hanzi-dojo.com` — Pro add-on + a CNAME in Cloudflare), then add the new `https://auth.hanzi-dojo.com/auth/v1/callback` as an authorized redirect URI on the Google OAuth client. Re-test the full Google flow after. *(dashboard + DNS)*
- [ ] **Turn off the retired GitHub Pages site** — repo Settings → Pages → Source → None. The deploy workflow is already removed; this disables the last-built site.

Already shipped (code side): `signUp` now sends `emailRedirectTo`; hardcoded github.io links replaced with `BRAND_URL`; app consolidated on Vercel (base `/`).

## Data safety
- [ ] **Transactional grading** — collapse the separate writes (card update, review log, daily activity) into a single Supabase RPC/transaction so a mid-write failure can't leave partial state. See the data-safety note in `README.md` and `src/syncQueue.js`.
- [ ] **Real-device verification pass** — offline grade replay, iOS/Safari flashcard + reader audio, and Web Push reminders end-to-end. All built and unit-tested but never exercised on a live device.

## Scheduling
- [ ] **Timezone-correct reminders** — `send-review-reminders.mjs` fires on a plain UTC hour, so it drifts ~1h across DST. Schedule per user timezone.

## Learning quality
- [ ] **🔴 Pronunciation pinning is silently OFF for ~79% of HSK 3–6.** Chinese audio pins pronunciation with `chinesePhonemeSsml(word, reading)` → `readingToPhonemes(reading)`, but that helper returns `null` for **any reading containing a space**, and the caller then falls back to bare hanzi with no phoneme hint at all. HSK 1–2 joins its syllables (`xièxie`) so it pins ~95% of the time; the HSK 3–6 bulk pass emitted space-separated readings (`jiù shì`), so **HSK 3 pins only 97 of 457 rows (21%)** and ~1,437 rows across levels 3–6 lose the hint entirely. Nothing errors — the TTS just guesses from the hanzi, so polyphones are unprotected exactly where they matter most. Fix is a normalisation pass joining HSK 3–6 readings to the HSK 1–2 style, validated per row (`readingToPhonemes` must return a syllable-aligned string) and followed by an `audio-hsk3-6` regeneration. Sized but not attempted; the 54-row migration below only re-joins the rows it was already touching.
- [ ] **HSK 3–6 wrong readings — MIGRATION WRITTEN, NOT APPLIED.** 54 of the ~1,870 HSK 3–6 words shipped with a wrong `reading`, because HSK 3–6 came from a bulk CC-CEDICT pass while HSK 1–2 was hand-curated. Four classes: CC-CEDICT's ASCII `u:` for ü leaked in verbatim (忽略 `hū lu:è`, 战略, 策略); a rare reading beat the everyday one (厂 `hǎn` not `chǎng`, 转 `zhuǎi`, 追 `duī`, 广 `yǎn`, 藏 `Zàng`, 作, 抢, 圈, 胖, 合, 约, 匹 `pī`→`pǐ`); a proper-noun capital on ordinary words (成功 `Chéng gōng`, 和平, 美元, 网络, 资源, 大众, 通道, 时代, 现代, 将军 + 12 single chars); and **dropped tone sandhi** on 17 words (一切 `yī qiè`→`yíqiè`, 不必→`búbì`, 不见→`bújiàn`…) that HSK 1–2 gets right (一下 `yíxià`, 不错 `búcuò`). ⚠️ Precise scope of the audio impact: only the **single-character** words actually pin, so only those are currently *spoken* wrong (厂 really does say "hǎn"); the multi-syllable spaced ones never pinned, so for them the bug is the **displayed** pinyin only. Found by diffing against the CC-CEDICT `dict_entries` already in the project — note 1,864/1,871 matched *some* attested reading, which is exactly how a polyphone error hides. All replacements are CC-CEDICT-attested and yield syllable-aligned phonemes; none of the 54 is in a learner's deck yet. Fix: apply `supabase/migrations/20260724120000_fix_hsk3_6_readings.sql` (idempotent — matches on the known-bad value), **then re-run Actions → task `audio-hsk3-6`**. ⚠️ Do *not* null `audio_path` to force that: the generator's work list is `vocab.filter(v => v.audio_path)` with `upsert: true`, so clearing the path *excludes* a word. Deliberately left alone: genuine proper nouns (上帝, 圣诞节, 国会, 佛) and ~14 words where both readings are defensible in context (待 dāi/dài, 答 dā/dá, 结 jiē/jié, 泡, 档, 扇, 尽, 切, 挨, 晕, 杆, 踏, 码头, 眼里) — those want a native-speaker call, not a blind edit.
- [x] **HSK 1–2 readings audited — clean, no action needed.** All 497 words checked the same way. The 23 that differ from CC-CEDICT are *better* than it: correct tone sandhi (一下 `yíxià`, 不要 `búyào`, 不错 `búcuò`), the Hanyu Pinyin apostrophe (女儿 `nǚ'ér`), and legitimate proper-noun capitals (中国, 汉语). Worth confirming because this is the band the 157 in-deck words actually sit in.
- [ ] **FSRS parameter tuning** — optimize scheduler parameters beyond library defaults once `review_logs` + analytics have real data.

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

- [ ] **Chinese → HSK 7-9** (the advanced band): seed the vocab, then run `generate-meanings` → `generate-examples` → `generate-serial-stories` → `generate-audio`/`generate-story-audio`. Add tiers to `storyTiers.js` and level labels in `utils.js`. *(HSK 3-6 vocab/examples/audio already shipped; stories pending LLM quota.)*
- [ ] More graded stories at existing Chinese levels (volume, not just new levels) — improves the "read next" ladder density.
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
