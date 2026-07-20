# 🛠️ Engineering backlog

Granular fixes, tech-debt, and ops tasks. **Internal — not community-facing.**
The public plan lives in [`ROADMAP.md`](../ROADMAP.md), which auto-posts to the
`#roadmap` Discord channel; keep raw bug detail and dashboard-only steps here so
that stays clean. Move items to **Done** as they land (or promote user-facing
ones to the roadmap).

## Auth / email / hosting
- [ ] **Custom SMTP — LIVE TEST PENDING.** Configured 2026-07-18: Brevo is the sending provider; `hanzi-dojo.com` shows **Authenticated** in Brevo (DKIM `brevo1/brevo2._domainkey`, `brevo-code` TXT, DMARC `p=none` — all added in Cloudflare DNS, the authoritative nameserver; Vercel only hosts). Supabase custom SMTP wired to `smtp-relay.brevo.com:587`, sender `no-reply@hanzi-dojo.com`. **Still to verify:** send a real magic-link/sign-up to an external inbox and confirm it (a) arrives (not spam) and (b) shows From `no-reply@hanzi-dojo.com`. Brevo "Branding" (the `em`/`img.em`/`r.em` CNAMEs) shows *Not branded* — optional, tracking-link cosmetics only, doesn't block sending.
- [ ] **Auth URL config** — set Site URL = `https://hanzi-dojo.com` and add redirect allowlist `https://hanzi-dojo.com/**` + `http://localhost:5173/**`. Fixes the login redirect that jumps to the raw github.io host. *(dashboard)*
- [ ] **Turn off the retired GitHub Pages site** — repo Settings → Pages → Source → None. The deploy workflow is already removed; this disables the last-built site.

Already shipped (code side): `signUp` now sends `emailRedirectTo`; hardcoded github.io links replaced with `BRAND_URL`; app consolidated on Vercel (base `/`).

## Data safety
- [ ] **Transactional grading** — collapse the separate writes (card update, review log, daily activity, XP) into a single Supabase RPC/transaction so a mid-write failure can't leave partial state. See the data-safety note in `README.md` and `src/syncQueue.js`.
- [ ] **Real-device verification pass** — offline grade replay + XP-delta reconcile, iOS/Safari flashcard + reader audio, and Web Push reminders end-to-end. All built and unit-tested but never exercised on a live device.

## Scheduling
- [ ] **Timezone-correct reminders** — `send-review-reminders.mjs` fires on a plain UTC hour, so it drifts ~1h across DST. Schedule per user timezone.

## Learning quality
- [ ] **FSRS parameter tuning** — optimize scheduler parameters beyond library defaults once `review_logs` + analytics have real data.

## Reference dictionary (Pleco-style)

Shipped 2026-07-20 (see Claude.md §0). Data loaded to prod Supabase: **123,465** `dict_entries` (CC-CEDICT) + **~77,045** `dict_examples` (Tatoeba, simplified, with pinyin). Deferred, non-blocking polish:
- [ ] **Wire stroke-order into the entry** — `DictEntryView`'s Strokes button is gated off (`canShowStrokes`); hook up the existing `hanzi-writer` for the headword.
- [ ] **得-particle pinyin** — `pinyin-pro` renders degree-complement 得 as `dé` where neutral `de` is wanted (occasional; example sentences only).
- [ ] **Capitalized-pinyin display** — CC-CEDICT proper nouns (Běijīng) render lower-cased in `src/cedict.js` (`markTarget` lowercases; display-only, search unaffected).
- [ ] **Migration hardening** — add `drop policy if exists` before the `create policy` lines in `20260719120000` (idempotent re-runs) and a partial unique index `(language,system,word) where level is null` on `vocabulary` to bound concurrent dictionary-word inserts.
- [ ] **Both-language / other-language dictionaries** — Japanese (JMdict) + Russian; the entry view + search are language-agnostic, the data + `dict_search` are Chinese-only today.
- [ ] **Operator note** — reloading examples requires `truncate public.dict_examples` first (seed-examples is insert-only). CC-CEDICT/Tatoeba downloads + `--apply` are manual (service key); see the seed script headers.
- [ ] **HSK 3-6 stories — BLOCKED on LLM quota.** Vocabulary/examples/audio shipped (via `regen-content.yml` tasks `examples-hsk3-6`, `audio-hsk3-6`; serial configs added to `generate-serial-stories.mjs` for `chinese|hsk_3|3..6`). The `serial-hsk3-6` task runs but `generate-serial-stories` "plan season" call hits Gemini free-tier **429** on every level → `Published 0`. Unblock: enable billing on the Gemini API key (cheap, big RPM jump) OR set `ANTHROPIC_API_KEY` + `LLM_MODEL_PREMIUM` GitHub secrets (the generator's premium path). Then re-run `serial-hsk3-6` (tier taste-test first, then full). Also cosmetic: `storyTiers.js` tier labels say "HSK 1 words" regardless of level — make them level-aware once stories exist.

## Content
- [ ] **Chinese → HSK 3**: seed the HSK 3 vocab band, then run `generate-meanings` → `generate-examples` → `generate-serial-stories` → `generate-audio`/`generate-story-audio`. Add HSK 3 tiers to `storyTiers.js` and level labels in `utils.js`.
- [ ] **Japanese JLPT N4+ / Russian A2+**: same pipeline per new level; extend the level/tier config so onboarding offers them (Onboarding gates on seeded levels already).
- [ ] More graded stories at existing levels (volume, not just new levels) — improves the "read next" ladder density.
- [ ] **Spanish track**: add a `spanish` entry to `languageTheme.js` (accent, font, system=CEFR), level list + tiers in `storyTiers.js`, seed CEFR vocab, generate content. Onboarding/data layers are already data-driven, so most of the app picks it up for free.

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
