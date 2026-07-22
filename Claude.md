# CLAUDE.md — Hanzi-dojo

Read this entire file before making any change. It describes not just *what* the project is, but *why* it exists and *how* it should feel. When a decision isn't covered here, choose the option that best serves the vision and learning philosophy below.

### Keep the roadmap current (every task — it is live in Discord)

Whenever we finish or start a meaningful piece of work, edit **`ROADMAP.md`** in the same change: move finished items to **✅ Shipped** and add newly started/planned work under **🚧 Now** / **🔜 Next**. Treat this as part of "done", not optional bookkeeping — the roadmap is the community's live view of progress.

**It syncs to Discord instantly, no manual merge:** any change to `ROADMAP.md` (or the internal `docs/BACKLOG.md`) on a working branch is auto-copied to `main` by **`.github/workflows/roadmap-live-sync.yml`**, and that `main` push triggers **`.github/workflows/discord-notify.yml`**, which edits the pinned **#roadmap** (and **#backlog**) message in place. So you never wait for the feature PR to merge — edit the roadmap, push your branch, and it's live. (That sync only ever moves those two doc files to `main`, never code. A merge to `main` also posts the changelog to **#announcements**, so write descriptive commit/PR titles.)

---

## 0. LATEST SESSION — read first (2026-07-22 — Azure Chinese TTS: provider-abstracted, cached, guarded)

**Full design + operator runbook: [`docs/TTS.md`](docs/TTS.md). Read that before touching anything under `src/tts/`.** Built on branch `feature/chinese-tts`. Suite after: unit **1000** (79 files, +267 new), build green, `src/` lint unchanged (2 pre-existing errors in `Dashboard.jsx` / `HowMuchCanYouRead.jsx`, both untouched).

**The boundary (this is the important part):** the app is a static SPA with no backend, so paid synthesis lives where every other content pipeline already lives — a root `.mjs` script run with `--env-file=.env.script`. **Nothing under `src/` reads `process.env`**; configuration is passed *in* as an argument. `src/tts/serverOnly.test.js` fails the build if a browser-reachable file imports a server-only TTS module, uses a `node:` builtin, or so much as names a credential variable. The browser only ever reads a `storage_path` from `tts_audio` and plays it.

**Domain layer (`src/tts/`, all unit-tested):** `constants.js` (variants, statuses, voices, `SYNTHESIS_CONFIG_VERSION`) · `errors.js` (typed, `retryable`, HTTP→error) · `normalize.js` · `ssml.js` (escaping + Azure SAPI phones, reuses `src/pinyin.js`, `u:`→`v`) · `overrides.js` · `request.js` · `contentHash.js` (**SERVER-ONLY**, `node:crypto`) · `config.js` (validation + redacted summary) · `retry.js` / `concurrency.js` / `log.js` · `providers/{azure,mock,index}.js` · `records.js` (cache-hit / stale / dedupe) · `sources.js` · `utterances.js` · `storage.js` / `repository.js` · `runner.js`. Client side: `src/ttsAudio.js`, `src/AudioButton.jsx`, `src/audioPlayback.js` (one voice at a time).

**Cache:** the content hash covers text, locale, provider, voice, rate, override version, output format, content type and config version. Match → no request. Differ → **stale**, and the old clip keeps playing until replaced. Legacy Google audio has no hash, so it reads as stale and is regenerable with no data migration. Storage is content-addressed: `tts/{locale}/{sourceType}/{sourceId}/{variant}/{hash}.mp3`.

**Cost guards:** dry run is the default (`--confirm` required), `--limit` defaults to **20 source records** (hard max 200 without `--override-max`), concurrency capped at 8, auth failures never retried, `request_count`/`character_count` recorded per clip and per job. `npm run tts:dry-run` / `tts:generate` / `tts:retry-failed`; plus `tts-overrides.mjs`, `story-utterances.mjs`, and `tts-integration-check.mjs` (opt-in real Azure, needs `TTS_INTEGRATION=1` **and** `--confirm`).

**Pronunciation:** flashcard *word* clips are auto-pinned to `vocabulary.reading` (labelled `inferred`, never `verified` — only a human may set `verified`/`rejected`). `data/tts-pronunciation-overrides.json` seeds ~24 polyphone fixes (银行/行李, 长城/校长, 觉得/睡觉 …); matching is longest-first and non-overlapping, so 银行 consumes its own 行.

**Two things Azure does NOT do, both measured against the live service, both easy to re-break:**
1. **`<phoneme>` is rejected for every zh-CN voice** (400, empty body) with `sapi` *and* `ipa`, while the same element works on en-US from the same key. Recorded as `LOCALE_CAPABILITIES` in `constants.js`; the pin is skipped and `overrideVersion` reports `none` so the hash stays honest. Judged acceptable by ear (觉得/睡觉 read correctly). The real fix, if ever needed, is a hosted custom lexicon. **Do not "restore" the phoneme tag — it fails the whole request.**
2. **Concurrency 3 gets throttled** ("Downstream Service Throttled"), so the default is 2 with a 1s first backoff.

**Also worth knowing:** PostgREST caps responses at 1000 rows, so `repository.js` paginates with `.range()` — without it a full-library cost estimate silently under-reports by half. And `src/storyReading.js` now imports `./characterNames.js` **with** the extension, because Node ESM (unlike Vite) requires it and the story-sync script imports that module.

**Status: live and validated, backfill not yet run.** Both migrations applied, 24 pronunciation corrections loaded, 122 clips generated with 0 failures, 45 stories split into 550 utterances with gender-aware casting (妈妈/小红 female, 李明/小明 male, narrator distinct). Remaining: ~9,300 vocabulary + ~1,100 story clips (~51k characters, ~1 hour). Everything is additive: `vocabulary.audio_path`, `stories.content` and `stories.has_audio` are untouched, and `flashcardAudio()` falls back to the legacy path per word.

---

## 0.1 PREVIOUS SESSION (2026-07-20 — Pleco-style reference dictionary + flashcard-anything + examples)

**Shipped a full Pleco-style Chinese reference dictionary** across two plans (17 subagent-reviewed tasks + follow-ups), merged to `main`. Turns the old "search-your-syllabus" Dictionary into a real ~120k-entry reference. Built via brainstorming → writing-plans → subagent-driven-development (fresh implementer + independent reviewer per task, two opus whole-branch reviews). Suite after: unit **654**, e2e dictionary 9/9, build green.

**Data model — 2 new tables, Chinese-only (`supabase/migrations/20260719120000_add_reference_dictionary.sql`):**
- `dict_entries` (~123k CC-CEDICT rows): `simplified`, `traditional`, `pinyin` (tone-marked), `pinyin_plain` (toneless, for search), `definitions` (jsonb array), `hsk_level`. `pg_trgm` GIN indexes on simplified/traditional/pinyin_plain/(definitions::text) + btree on simplified.
- `dict_examples` (~77k Tatoeba pairs): `hanzi` (simplified), `pinyin` (tone-marked), `english`. GIN trigram on hanzi.
- 4 **security-definer, stable, authenticated-only** search RPCs: `dict_search(p_query,p_limit)` (ranked exact-hanzi > exact-toneless-pinyin > prefix > shorter), `dict_entry(p_id)`, `dict_examples_for(p_word,p_limit)`, `dict_words_containing(p_word,p_id,p_limit)`. Value-bound `ilike`, no dynamic SQL.

**New pure/tested modules:** `src/cedict.js` (CC-CEDICT line parser + `numberedPinyinToMarks`), `src/toneColor.js` (`toneOf`/`splitHanziWithTones`/`TONE_CLASS`), `src/dictSearch.js` (RPC wrappers; `normalizeQuery` reuses `searchFold`), `src/tatoeba.js` (`parseTatoebaPairLine`).

**Entry view — "Refined" direction (`src/DictEntryView.jsx`):** tone color applied ONLY to the headword + character-breakdown cards (definitions/examples/words-containing chips stay neutral); `Meaning · Chars · Examples` tabs; tappable character drill-down via an `entryStack`. Tone palette lives in `src/index.css` (light+dark). `src/Dictionary.jsx` now defaults to **full-dictionary** scope with a `Full dictionary | My syllabus` toggle — **gated to Chinese** (`track.language === 'chinese'`); non-Chinese tracks keep the old curriculum-only screen (no toggle). The `setTab` reset uses the render-phase "adjust state during render" pattern (repo lints `react-hooks/set-state-in-effect`).

**Flashcard-anything (`supabase/migrations/20260719130000_flashcard_anything.sql`):** save any reference word to the FSRS deck. Non-curriculum words become dictionary-sourced `vocabulary` rows with **`level = NULL`** — the sentinel that keeps them out of every level-scoped surface (level tests filter `.eq('level',N)`, home/Study/Profile use `.gte/.lte`, `levelScope.js` guards `level != null`; all auto-exclude NULL — audited + locked in `levelScope.test.js`/`testLogic.test.js`). The review deck was the ONE place that filtered them out (`getTrackCards({maxLevel})` uses `.lte('vocabulary.level',max)`), so `getTrackCards` gained an **`includeUnleveled`** option → `.or('level.lte.X,level.is.null', {referencedTable:'vocabulary'})`, used by Study's two review/forecast fetches. Privileged insert via security-definer `dict_add_to_deck(p_dict_entry_id,p_language,p_system)` (vocabulary has NO INSERT policy); validates `auth.uid()` + track ownership + **language match** (else a Chinese entry could be written into a JP track), idempotent. **CRITICAL:** the syllabus browse query in `Dictionary.jsx` MUST keep `.not('level','is',null)` or NULL words leak cross-user into the curriculum list (vocabulary is globally shared).

**Seed pipeline (operator-run with the service key — NOT in CI):** `seed-dict.mjs` (CC-CEDICT → dict_entries; existence-check chunked to avoid oversized `.in()` URLs — a wide `.in()` of hanzi builds a URL the gateway rejects as opaque "fetch failed"), `seed-examples.mjs` (Tatoeba pairs → dict_examples; converts traditional→simplified via **`opencc-js`** `{from:'t',to:'cn'}`, generates tone-marked pinyin via **`pinyin-pro`**, **insert-only + retry** since example `hanzi` are full sentences and a `.in()` of them overflows the URL). Both dry-run by default, `--apply` to write; `data/cedict.sample.u8` + `data/tatoeba.sample.tsv` fixtures. `opencc-js`/`pinyin-pro` are **devDependencies** (seed-time only, not in the client bundle). Data loaded to prod Supabase (project `bvqvturqupbggxaeihvi`): **123,465** entries + **~77,045** examples with pinyin.

**Deferred follow-ups (non-blocking, tracked in docs/BACKLOG.md):** stroke-order animation wiring in the entry (button gated off via `canShowStrokes`), 得-particle pinyin edge case, capitalized-pinyin display for proper nouns, migration `drop policy if exists` idempotency + a partial unique index on dictionary-sourced words, Japanese (JMdict)/Russian reference dictionaries.

**Specs/plans:** `docs/superpowers/specs/2026-07-19-pleco-style-dictionary-design.md`; `docs/superpowers/plans/2026-07-19-reference-dictionary.md` + `2026-07-19-flashcard-anything.md`.

---

### Previous session (2026-07-19, autonomous overnight: additive polish sweep — search, filters, progress viz, chart a11y)

**14 items shipped across 10 PRs (#100–#109), all squash-merged to `main` by the session itself. Every change is ADDITIVE and MIGRATION-FREE — no schema, no scheduling/FSRS, no reader reading-behavior changes.** This was an all-day autonomous `send_later` loop (merge green PR → reset branch onto main → ship one safe item → open PR → re-arm). The user granted standing merge authority mid-session ("merge and continue"). Suite after: unit **623**, full Playwright e2e green (dictionary 7, profile 4, home/words/grammar/analyzer/reader/study).

**New pure, unit-tested helpers (the pattern — logic in a tiny module, wired by the screen):**
- `src/recentLookups.js` — `addRecent(list, entry, cap=8)` (dedupe-by-id, cap) + localStorage wrappers (`readRecent`/`saveRecent`/`clearRecent`/`recordRecent`, per-language key `dict:recent:<lang>`).
- `src/monthReview.js` — `monthReview(activity, now)` (this-month active-days/reviews/best-day/day-of-month), `monthHeadline`, `monthShareText`. Profile's month panel + share route through it.
- `src/knownWordMap.js` — `knownWordMap(vocab, cardById)` buckets every active word by status (mastered/known/learning/new) per level via `wordStatus` (uses `mastery.js`); `readableSummary`, `rowA11yLabel`.
- `src/dictionaryFilters.js` — `DICT_FILTERS` + `matchesDictFilter`/`filterVocab` (status), `dictionaryEmptyState` (filter-aware copy), `levelsInVocab`/`filterByLevel` (level).
- `src/searchFold.js` — `foldForSearch`/`foldIncludes`: NFD + strip U+0300–U+036F so toneless pinyin ("tianqi" ⇒ tiānqì) matches; **kana-safe** (dakuten U+3099 is outside the range). Used by Dictionary + Words search and grammarSearch.
- `src/grammarSearch.js` — `filterTopics(topics, query)` + `topicHaystack` (title/blurb/pattern/points, foldForSearch-based).
- `src/reviewForecast.js` — added `forecastA11yLabel(buckets, days=7)`.
- `src/reviewAccuracy.js` — `last30A11yLabel(counts)` for the Profile 30-day chart.
- `src/achievements.js` — new **Reading** group (`read_1/read_10/read_25`) driven by a lifetime `storiesRead` stat (0 when absent → backward-compatible); first unit coverage added (`achievements.test.js`).

**By PR:**
- **#100** (bundle of 5): Dictionary **recent lookups** (Recent section when search empty, per-language, Clear); Dictionary **status filter chips** (All/In deck/Learning/Mastered/Not started) + **filter-aware empty states**; Profile **month-in-review** recap (headline + best-day + share); **Known-Word Map** panel (per-level readable-reach stacked bars).
- **#101 / #102** — toneless pinyin search in Dictionary / Word list.
- **#103** — Reading achievements (Profile counts `story_reads` read-only, `head`+`count:exact`).
- **#104** — Grammar-guide topic search (accordion `open` re-keyed by topic id so filtering is robust).
- **#105** — Analyzer "words to learn next" chips are now tappable (open shared `WordLookupSheet`); **+ Discord roadmap-render fix** (see below).
- **#106 / #108 / #109** — screen-reader `role="img"` + aria-label summaries for **all three** progress charts (Known-Word Map bars, Home 7-day forecast, Profile review-accuracy 30-day). Every progress chart now has a text alternative.
- **#107** — Dictionary **level filter** (`<select>`, shown only when the language has >1 level; composes with search + status).

**Discord roadmap render fix (in #105):** the pinned #roadmap message looked frozen because `.github/workflows/roadmap-live-sync.yml`'s `render()` only prints headings + `- [x]/[ ]` items — it dropped the `_Recently shipped: …_` paragraph and rendered the `_Next up — …_` line as a broken `• _Next up` (it strips ` — …`). Fix: the top of `ROADMAP.md` now has a real **"Just shipped"** `- [x]` checklist using `:` / `()` separators (which survive the ` — ` strip). The sync IS working — logs show `Edited 🗺️ Hanzi Dojo Roadmap message …750067` on every push. (If it ever looks stale again: Discord shows a CONDENSED view — titles only, Shipped capped at 10, at the very bottom; and a past failed PATCH could leave a stale *pinned* duplicate while the bot edits the current id.)

**e2e mock notes (`tests/fixtures/mockSupabase.js`):** unknown tables return `[]`; specs `page.route`-override `/rest/v1/{cards,vocabulary,review_logs,daily_activity}` in-spec (GET only; non-GET → `route.fallback()`) to synthesize new words / a 2nd level / review logs / activity. Full suite ~5 min — prefer a single targeted spec per change.

**Process notes for next session:** GITHUB_TOKEN git pushes do NOT fire the PR `synchronize` event, so the `playwright` check only runs on a PR's FIRST commit — later same-branch pushes are locally-verified (the push-to-main E2E validates everything at merge). Cloudflare "Workers Builds" checks fail on every PR = pre-existing deploy infra, ignore; only a RED `playwright` blocks. The session STOPPED (rather than ship filler) once the clearly-safe additive pool was exhausted — remaining roadmap needs the user's decision, a migration, content authoring, or touches readers/Study/scheduling/audio-mic.

---

## 0.0e PREVIOUS SESSION (2026-07-19: calm-mechanics + reading tools + on-device bug fixes)

**Two PRs squash-merged to `main` this session (#97, #98). All work is additive and migration-free — no schema changes.** Theme: ship the built-but-dormant "calm progress" ideas, add reading/vocab tools, and fix a batch of on-device reader bugs. Suite after: unit **547**, e2e **31/31**.

**New pure, unit-tested helpers (the pattern to follow — logic in a tiny module, wired by the screen):**
- `src/prelogin.js` — pre-login onboarding choices (language + reason). `REASONS`, `examLabelFor`, `encouragementFor`, `save/read/clearPreloginPrefs` (localStorage `prelogin:prefs`).
- `src/reviewForecast.js` — `reviewForecast(cards, now, days)` buckets scheduled reviews per local day (overdue → today; learning cards excluded, hence "~N"); `forecastSummary`.
- `src/studyRhythm.js` — `studyRhythm(studiedDates, now, days)` → last-N-days studied flags; `rhythmSummary`; `dateKey`.
- `src/gentleReturn.js` — `isReturningFromBreak(profile,{threshold:3})` (uses `last_studied_on`), `gentleReviewTarget({returning,dueReviewCount,cap:20})`, `gentleReturnMessage`.
- `src/dailyStory.js` — `unlockedStories` + `pickDailyStory` (deterministic per calendar day via a string hash; unread-preferred, graceful re-read).
- `src/readingLadder.js` — `readingLadder(learnedCount, categories)` + `nextRung`.
- Exported `hasKanjiChar` from `storyReading.js` (drives "no furigana over kana-only words").

**PR #97 — pre-login onboarding + calm Home widgets + reader bug fixes:**
- **Smoother start:** `Landing.jsx` hosts a wizard (landing → pick language → why), saves prefs, fires `prelogin_*` analytics; `Auth.jsx` takes an optional `intro` (defaults to Sign-up tab + personalized subtitle); `Onboarding.jsx` reads prefs via lazy `useState` init (skips the language step, greets by reason) then `clearPreloginPrefs()`.
- **A gentle forecast** (Home): `homeCounts.js` returns `forecast7`; `Home.jsx` renders a 7-day per-day bar chart ("~N reviews a day").
- **Study rhythm** (Home): `homeCounts.js` fetches `daily_activity` for the window → `rhythm7`; `Home.jsx` renders a "studied N of last 7 days" dot ring (shown only when ≥1 study day). No streak pressure.
- **5 reader bugs** (from #bug-reports): (1) `ReaderLaunch.jsx` centered content (killed the big blank gap); (2) furigana no longer renders over kana-only JP words — `PacedReader`/`SceneReader` `readingLine(tokens, language)` gates on `hasKanjiChar`; (3) Analyzer underlines new words instead of boxing every word; (4) paced reader shows the **current line's** English — `useStoryReaderCore` attaches `beat.english` (newline-aligned with `english_content`), not the whole story; (5) `SessionRecap` no longer shows two boxes for the same unlocked story (`nextStepIsUnlockStory` guard).
- **Word-lookup sheet mobile fix:** `WordLookupSheet.jsx` now renders through a **portal to `document.body`** — the app shell's `<main>` (position:relative + z-index) trapped the fixed sheet below the mobile nav, so it opened as a ~10px sliver. Portaling escapes the stacking context (z-index bumped to 200). e2e asserts real height at a mobile viewport.

**PR #98 — reading/vocab tools + gentle return + a11y:**
- **Gentle return:** `Study.jsx loadQueue` caps `dueReview` to 20 (oldest-due first) when `isReturningFromBreak` (review mode only); deferring is safe (FSRS reschedules from actual elapsed time, cards stay due). `Home.jsx` shows a "welcome back — N ready" banner only when the cap bites.
- **Built-in dictionary:** new `src/Dictionary.jsx` (Practice → Dictionary) — search any active vocab in the language (all levels), tap a row to open `WordLookupSheet` (hear + add-to-deck), status dot for in-deck words. `dictionary` added to `KNOWN_VIEWS` (`routes.js`) + App route + Practice card.
- **A fresh story every day:** `Stories.jsx` category view renders a "Today's story" card from `pickDailyStory` (sets the story's category on open so the reader's next-story/tier-unlock logic works). Push-nudge part still planned.
- **Interactive word list:** `Words.jsx` rows are now buttons that open `WordLookupSheet` (hear + add-to-deck).
- **Reading ladder:** `Stories.jsx` renders the tiers as rungs (unlocked/current + "N more words to reach <tier>") from its existing `learnedCount` + `CATEGORIES`.
- **ChatMission dialog a11y:** `role="dialog"` + `aria-modal` + `aria-label`, Escape-to-close (parity with the X), initial focus to Close. **No focus trap yet** — still on the roadmap.

**Process notes for next session:** autonomous overnight loop drove much of #98 via `send_later` self-wakeups (PRs only, never auto-merged to `main` — deploys/migrations/big calls left to the user). `mcp__github__actions_list` output is huge — parse the auto-saved JSON file with python instead of printing it. Deliberately **not** done (need the user's call): retention dial (needs a `profiles` column), cram mode, mastery-ladder state, graduated pinyin in the paced/scene readers (changes reader behavior), grammar-as-SRS, and anything needing content/authoring, migrations, or new infra.

---

## 0.0d PREVIOUS SESSION (2026-07-17: story-format readers · N5 vocab fix · favicon)

**The story reader is now a shared engine with four swappable presentation formats — all shipped to `main`.** `stories.presentation` (`'paced'|'chat'|'scene'`, default `paced`) + an optional `stories.interactions` JSONB pick the renderer in `src/StoryReader.jsx` (dispatcher) via `resolvePresentation(story, modePref)` (`src/readerMode.js`). Classic continuous scroll (`StoryReaderImmersive.jsx`) stays a per-user preference for paced stories.

- **Shared engine `src/useStoryReaderCore.js`** — all non-visual behavior: beat parse (`splitSpeaker`+`segmentLine`, memoized on `buildVocabMatcher`), `% known` (`calculateStoryReadability`), progression (`cur`/`advance`/`finish`), the once-guarded mark-read (online `story_reads` upsert + `awardXp(STORY_FINISH_XP=10)`; offline `enqueueStoryRead`; `STORY_COMPLETED`/`FIRST_STORY_COMPLETED` analytics — parity with classic `finishStory`), audio read-along (`speakFrom`/`togglePlay`, MP3→speech-synth fallback), word lookup (`selectWord`/`addToDeck`), keyboard nav, and an opt-in `setAdvanceBlocked(bool)` flag (default off) so a renderer can block keyboard advance (used by the interactive reply gate).
- **Shared UI:** `ReaderLaunch.jsx` (cover + `%known` + Start; hides the classic-scroll link for fixed formats), `WordLookupSheet.jsx`, `FinishOverlay.jsx` (optional `note` line), and **`ChatThread.jsx`** (the bubble list, shared by both chat readers so they can't drift).
- **Four renderers:** `PacedReader.jsx` (Phase 1: focus-flow, one line lit at a time), `ChatReader.jsx` (Phase 2: observer messaging bubbles, tap-to-reveal, `typing…` shimmer), `SceneReader.jsx` (Phase 3: emoji picture-book — one big emoji + one line per tap; `splitScene`/`stripSceneEmoji` in `src/sceneReading.js` strip a leading emoji off each `content` line so it never counts as vocab), `InteractiveChatReader.jsx` (Phase 4: reply-along — at the learner's turns a reply panel offers the correct line + distractors, **retry-until-right**, correct pick becomes their bubble; first-try accuracy on finish).
- **Pure helpers (unit-tested):** `assignSpeakerSides` (`chatReading.js`), `splitScene`/`stripSceneEmoji` (`sceneReading.js`), `buildReplyOptions` (`interactiveChat.js` — deterministic `Math.imul`-seeded shuffle; the seed is the beat index so options don't reshuffle on re-render).
- **Data model:** migrations `20260717120000_story_presentation.sql` (CHECK-constrained presentation) + `20260717130000_story_interactions.sql` (nullable jsonb `{you, distractors:{"<beatIdx>":[{text,pinyin}]}}`; the correct reply at a gate is that beat's own `content` text — only distractors are stored). `authored-stories.mjs` passes `presentation` + (conditionally, only when present) `interactions` on insert. Story cards show `💬 Chat` / `🎬 Scene` / `🗨️ Reply` badges (`Stories.jsx`). Content: 3 chat + 3 scene + 2 interactive Chinese stories in `data/authored-stories.json`; `authoredStories.test.js` validators are now lane-aware (chat=summary-only exempt from english-parallel; scene emoji-per-line guard; interactions beat-index/you-speaker check; known-speakers keyed by language). e2e fixtures `st1`(paced)/`st2`(chat)/`st3`(scene)/`st4`(interactive) in `mockSupabase.js`; `tests/e2e/reader.spec.js` exercises all four. Built subagent-driven; specs/plans in `docs/superpowers/{specs,plans}/2026-07-17-{paced,chat,scene,interactive-chat}*`. Suite: unit **464**, e2e **15/15**.
- **NOT live until** the two migrations are applied (Supabase GitHub integration on merge, or the SQL editor) and the authored chat/scene/interactive stories are seeded via `authored-insert` — but the app queries `stories.select('*')`, so a missing `interactions`/`presentation` column degrades gracefully (chat with no interactions → observer reader; unknown presentation → classic), **no error**.

**⚠️ N5 (jlpt level 1) vocabulary kana→kanji correction — APPLIED to production (93 rows, verified live).** Many N5 `vocabulary.word` values were seeded in kana where a standard kanji belongs (the flashcard showed きょねん instead of 去年). Fixed via `data/jlpt-n5-kanji-corrections.json` (reviewed: `apply` = 85 unambiguous, `homophones` = 4 resolved by example-sentence context → 風/風邪/箸/早い/速い, `keepKana` = deliberately-kana words) + `fix-vocab-kanji.mjs` (dry-run default, `--apply`; updates `word` + patches `example_sentence`; a homophone is SKIPPED unless exactly one reading's keywords match the row meaning — never guesses; **reading is unchanged so audio_path + furigana are intact**). Ran through a new **`content-utils` task `fix-vocab-kanji` (dry) / `fix-vocab-kanji-apply`**. Guard: `src/vocabKanji.test.js` fails CI if a corrected kana form reappears in `data/jlpt1-vocab-snapshot.json` (the mirror was updated to match). **This does NOT contradict the §0.00 "never blanket-kanji-ify" rule** — that rule is about STORY text matching the stored pool's written shape; here we corrected the POOL itself (a genuine data bug), which is the right fix, and only for words with an unambiguous standard kanji. N4 + Chinese HSK audited and clean (N4's kana words are legitimately kana; the bug was N5-specific).

**Favicon fixed:** `public/favicon.svg` was the **Vite lightning-bolt logo** (recolored purple) → replaced with a vector ensō in brand red (`#C43A22`) matching the PWA icons; removed the unused default `src/assets/vite.svg`. (Deploy + hard-refresh to clear the SW/browser favicon cache.)

---

## 0.0c PREVIOUS SESSION (2026-07-17: reader polish — serif font + focus hint)

**Reader comfort polish — shipped to `main` (commit `36ddd8c`).** Two small, self-contained additions to `src/StoryReaderImmersive.jsx`, both persisted in the existing `reader:prefs` IndexedDB object (extended `DEFAULT_PREFS` with `serif` + `seenFocusHint`, restored on mount, saved in the same `prefsSet` effect):
1. **Serif reading-font toggle** — a new **Reading font · Sans / Serif** segmented control in `ReaderSettings` (desktop popover + mobile sheet). Derives `readingFont = serif ? SERIF_FONTS[language] : theme.font`, applied to the reading body `<p>` lines and the chapter `<h1>` only (chrome stays Inter; word tokens + furigana inherit). `SERIF_FONTS` is a per-script **system** serif stack (Mincho / Songti·SimSun / Noto Serif·Georgia) — **no web font is loaded** (zero bundle/network cost; generic `serif` fallback). New `setSerif` threaded to both `ReaderSettings` call sites.
2. **Sentence-focus first-time hint** — a calm, dismissible tip pill under the coverage card (*"tap any line to focus it and dim the rest"*), shown only when `!seenFocusHint && parsed.length >= 2`. Self-retires via `dismissFocusHint()` the first time the reader focuses a line (called in both `selectToken` and `toggleFocus`) or taps the ✕. Reduced-motion aware.

Verified: `npm run build` ✓, vitest **366 pass** (the lone failing *suite* `writingMatch.test.js` throws on missing `VITE_SUPABASE_*` — sandbox-only, unrelated), `eslint src/StoryReaderImmersive.jsx` clean. No new test file (presentational state + a persisted flag). Design: user approved skipping the formal spec for this small polish. Remaining deferred reader-polish item: **per-story furigana override** (furigana mode for one story, keyed by story id, without changing the global default).

## 0.0b PREVIOUS SESSION (2026-07-16, later: public story links)

**Public story links — built on branch `claude/public-story-links` (subagent-driven, reviewed).** A signed-out visitor opens `/read/:storyId`, picks a rough level chip (Just starting / Some / Quite a bit), sees "you'd understand ~X%" of that story computed by the canonical `calculateStoryReadability`, reads a few teaser lines with known/new highlighting, then hits a "Sign up free to read the rest" gate (standard onboarding after — no story context carried through in v1). New: `src/PublicStory.jsx` (lazy-loaded page, no app shell), `src/publicStoryHelpers.js` (`buildVocabMap`/`assumedKnownCards`/`teaserLines`/`LEVEL_CHOICES` — pure, tested; note the **lowercase** filename to avoid a Windows case-collision with the `PublicStory.jsx` component), `readStoryId` in `routes.js` (tested), and the anon-callable `security-definer` RPC `public_story(uuid)` in `supabase/migrations/20260716000000_add_public_story.sql` (returns one **published** story + its language's active vocab **capped to the story's level** for data-minimization; RLS otherwise stays authenticated-only). `App.jsx` renders the page for `/read/:id` before the Landing gate; a signed-in visitor is redirected into the in-app reader (via `pendingStoryId`) behind a `ViewFallback` so no NotFound flashes. The reader's share card (`StoryReaderImmersive.jsx`) now links to `BRAND_URL + '/read/' + story.id`. Anon funnel events `public_story_viewed/level_picked/signup_clicked` feed the dashboard. **Not live until** the migration is applied in the Supabase SQL editor (until then `/read/:id` shows a "story not found" state and `console.error`s the RPC failure). Design + plan: `docs/superpowers/{specs,plans}/2026-07-16-public-story-links*`. Deferred fast-follows: land the visitor back on the story after signup; server-side OG prerender for crawler unfurls.

## 0.0a PREVIOUS SESSION (2026-07-16: admin analytics dashboard shipped to main)

**Admin analytics dashboard (v1) — shipped.** New admin-only `/dashboard` (`src/Dashboard.jsx`), gated by a new `profiles.is_admin` flag. It reads the existing `analytics_events` table through five `security definer` RPCs — `admin_overview`, `admin_funnel`, `admin_active_users`, `admin_retention`, `admin_story_stats` — in migration `supabase/migrations/20260715000000_add_admin_analytics.sql`. Each RPC asserts the caller is an admin and returns **only aggregates** (no raw event rows leave the DB); the table's insert-only RLS is unchanged, so a normal client still can't read it. Pure metric transforms live in `src/dashboardMetrics.js` (+`dashboardMetrics.test.js`). `seed-analytics.mjs` inserts synthetic events (tagged `app_version='seed'`; `--apply` / `--purge --apply`) so the dashboard is buildable/demoable before real traffic. The nav entry (Sidebar + MobileNav "More") appears only when `profile.is_admin`; the `/make-admin` slash command hands over the SQL to set the flag. Retention + language-filter UI are intentionally deferred (data paths ready). Design + plan: `docs/superpowers/{specs,plans}/2026-07-15-analytics-dashboard*`. **Not live until:** the migration is applied, an account is flagged admin (`/make-admin`), and events exist (real traffic or the seeder). Reviewed (no Critical findings); two correctness fixes applied (windowed `returned` funnel stage; DAU chart plots today). Full details in §16/§17.

## 0.00 PREVIOUS SESSION (2026-07-14, second session: tiers, cumulative levels, Japanese story fix)

Shipped to `main` as PRs #45–#48, plus content operations run via the `regen-content` GitHub Action (which holds the Supabase/LLM secrets — the dev sandbox cannot reach Supabase directly).

### Tier onboarding + placement test (PR #45)
- Onboarding step 2 now offers **Beginner / Intermediate / Professional** (`src/tiers.js` → `resolveTiers` derives tiers from the seeded levels; `TIER_META` copy). Intermediate/Professional require passing a **placement test** (`src/PlacementTest.jsx`: 12 MCQs from that level's vocab, pass ≥75%, fail → offered Beginner). Beginner never tests.

### Cumulative levels (PR #45)
- Advancing a level **keeps earlier levels' cards** (H2→H3 still reviews H1+H2). `src/levelScope.js` → `studyFloorLevel(cards, currentLevel)` derives the "study floor" from the user's existing cards (no schema change): a placed learner's assumed-known lower levels never resurface as new cards. Applied in `Study.loadQueue`/`loadForecast` + `homeCounts`; `getTrackCards` gained a `maxLevel` (≤) option alongside `level` (=).

### UI (PR #45)
- Landing language chips uniform 160×46; Home "Cards waiting" badge is a button → same target as the Review & unlock CTA.

### ⚠️ Japanese N5 vocabulary — stored word shapes (PRs #46, #48 — read before touching JP stories/matching)
A live dump (Action task `authored-vocab-jlpt1`) showed `vocabulary.word` for `japanese|jlpt|1` is **not dictionary form**:
- verbs in **ます-form**: 食べます, 行きます, かえります (kana verbs too)
- set phrases **include trailing 。**: すみません。, ありがとうございます。 (11 chars)
- **～ placeholders**: この～, その～; **parenthesized particles**: 後(で), いっしょ(に)
- many words **kana-only** (こうえん, えいが, としょかん, 友だち) even where kanji is standard; duplicates exist (水×2, 高い×2)

Consequences: story text must use pool words **in their stored written form** (never blanket-kanji-ify — こうえん written as 公園 is untappable), and any matcher must normalize decorations + handle ます-conjugation.

### Reader word-matching (PRs #46 + #48 — `storyReading.js`)
- `buildVocabMatcher(vocabMap, language)` + `matchVocabAt` shared by the reader's `segmentLine` AND `calculateStoryReadability` (so tappable ⇔ counted). Normalizes keys (strip 。/～, expand 後(で)→後で+後), splits multi-form keys (やはり; やっぱり), indexes **readings** (がっこう↔学校, まいげつ/まいつき), **kanji stems** with okurigana disambiguation + kana-follows guard (食べた→食べます but 見物≠見る), **kana verb stems** (かえった→かえります), dictionary-form guesses (row shift かえり→かえる), する/ある/いる/くる irregulars, 12-char exact window for set phrases. Tests in `storyReading.test.js` include a block built from the real stored shapes. Suite **253**.

### Generators made pool-faithful (PR #48)
- `generate-stories.mjs` + `generate-serial-stories.mjs`: Japanese prompts instruct "write every pool word EXACTLY as listed" (kanji stays kanji, kana stays kana, ます-verbs conjugate naturally). N5's legacy `kanaOnly: true` removed (PR #46). Serial validator's dict mirrors the reader's normalization/stems, so "validates ⇒ tappable".

### Content ops (regen-content Action, run from this session)
- `stories-jlpt1-replace` (new task, PR #47): one-shot kanji regen — superseded the same day by the **serial pipeline** rerun (`serial-jlpt1`) after the matcher fix, since one-shot quality was poor.
- ⚠️ `--replace` regeneration **resets story_number to 1** and orphans `data/story-covers.json` entries (JP level 1 covers were keyed 11–35 → images vanished) and drops comprehension questions + recorded narration. After any story regen, re-run: covers (`story-images-list` → author → `story-images-apply`), `comprehension` (japanese), `story-audio-jlpt1`.
- No `ANTHROPIC_API_KEY` secret is set — the serial pipeline's premium tier falls back to `gemini-2.5-flash`.

### Claude-authored stories lane (PRs #56–#58, #61–#62 — the preferred quality path)
- **Write seasons directly in chat** → `data/authored-stories.json` → merge → run the **`authored-insert` workflow** (own file + concurrency group, so it never queues behind generation runs). `src/authoredStories.test.js` validates every chapter with the PRODUCTION matcher + Intl.Segmenter against `data/jlpt1-vocab-snapshot.json` (kanji must resolve; ≤4 unexplained kana reach words/chapter) — tappable by construction.
- First authored season: **「しろいねこ」The White Cat** (jlpt/1 #24–28, tier 1). しろ is a protected character name (characterNames.js).
- **`content-utils` workflow** (own concurrency group): `story-images-apply`, parameterized `publish-held` (`--tier` capable), `fix-collisions`.
- ⚠️ **story_number collision hazard**: serial runs read their number counter ONCE at start — an authored insert mid-run grabs the same range. Fixed with `publish-stories.mjs --fix-collisions` (renumbers held duplicates past the level max). Don't run `authored-insert` while a serial run is mid-flight.
- ⚠️ **GitHub concurrency queues hold ONE pending run** — queuing a third run silently cancels the older pending one (lost a comprehension run this way). Utility tasks live in separate workflows for this reason.
- Gemini serial-run quality is uneven: the append run's tier 2–3 seasons scored 3–5 and were left HELD (whole seasons hidden = no visible gaps; jlpt/1 shows only the good seasons). Level 2 published in full (each tier already had visible chapters). Replacing weak seasons with authored ones is the standing plan.

### Developer page /dev (PR #59–#60)
- Hidden route (KNOWN_VIEWS, no nav link), gated to dev emails (`devTools.js`, default `fabrykjoh@gmail.com`, override `VITE_DEV_EMAILS`). Self-service, RLS-scoped: level jump, master-all vocab (level / ≤current), start-as-learning, delete level cards, FULL reset (existing RPC), story reads, test attempts, XP/streak/freezes, cache clear. Replaces the manual /reset & /unlock SQL flows.

---

## 0.0 PREVIOUS SESSION (2026-07-14, first session)

Everything below is **shipped to `main`** (PRs #39–#43), so a fresh chat has current context. Where this section conflicts with older text, **this section wins.** The whole arc was one "overhaul" branch (`claude/hanzi-dojo-overhaul-kxutp5`), themed around the **first-run activation funnel** (land → learn a few words → read your first story → come back) and turning the **story reader into the app's strongest feature**.

### Premium story-reader redesign (PR #43)
Reworked `StoryReaderImmersive.jsx` to read like a book, reusing all existing parsing / readability / highlighting / SRS / tap-to-define — no rewrite.
- **Furigana modes** — Always / Learning / Unknown / Off — decided **per word** from the shared status buckets via the new pure `readingVisibleFor(mode, status)` in `storyReading.js`. Furigana space is reserved per line (`reserveRuby`) so readings appearing/disappearing never shift the baseline. Default **Unknown** (scaffold only new words). Replaces the old binary furigana toggle.
- **Learning Lens** toggle (replaces the old "Known" toggle / `adaptive`): spotlight new + learning words, quiet the ones you know, keep **today's** words strongly emphasized (solid accent underline + tint + weight — three cues, not color alone).
- **Sentence focus:** tapping a line calmly dims the rest (opacity, not blur; second tap releases). Cursor stays default so it still reads like text; words (Token) keep the pointer.
- **Redesigned lookup sheet:** word + reading + status + meaning, plus context chips from data already in memory — "appears N× here" (new `counts` Map from `calculateStoryReadability`), "studied today", "review due soon" (`isDueSoon` + `due_at`, which was added to the existing `cards` select in Stories.jsx — **no new query**). Slide-up animation.
- **Quieter controls:** the three always-on top toggles collapsed into one **Lens** pill + one **Reader** settings control (desktop popover / mobile bottom sheet, `ReaderSettings`/`SettingRow`/`MetaChip` components). Top bar z-index raised above the reading column so the popover isn't painted under the text.
- **Preferences persist** in the IndexedDB prefs store (`READER_PREFS_KEY`, via `prefsGet`/`prefsSet`) and **never reload the story**. Typography roomier (line-height 2.15 w/ furigana, larger 0.56em furigana, 700px measure). Animations (`hd-sheet-up`/`hd-pop-in`/`hd-pop-check` in index.css) are subtle, fast, and reduced-motion-aware.
- New pure logic unit-tested in `storyReading.test.js` (`readingVisibleFor`, `isDueSoon`, occurrence counts). Suite **224**.

### Privacy-friendly learning-journey analytics (PR #43)
- **Single service `src/analytics.js`** — clean API (`track`, `trackOnce`, `startSession`/`endSession`, `setAnalyticsContext`, `EVENTS`). Components call it; they never touch Supabase directly. **No third-party trackers, no personal data.** Every path is try/caught and inserts fire-and-forget, so **analytics can never break learning**.
- **`sanitizeProps`** keeps only finite numbers, booleans, and strings ≤40 chars — objects / arrays / long text are dropped, so story text, typed answers, and emails can't leak even by mistake. Events carry timestamp, language, level, user id (if signed in), session id, app version (build sha).
- **New append-only table `analytics_events`** (migration `20260713120000_add_analytics_events.sql` **+ mirrored into `schema.sql`**). RLS is **insert-only** with `user_id is null OR auth.uid() = user_id` — anonymous rows capture the pre-signup top of funnel (Landing → Signup); no client SELECT/UPDATE/DELETE (dashboards read with the service role). ⚠️ **Apply the migration in the Supabase SQL editor** before events collect (until then inserts fail silently, by design).
- **Offline reuses the existing outbox** (`enqueueAnalytics` in `syncQueue.js`) — no second queue. Analytics replay is **lossy by design** (always returns done) so it can never wedge critical grade/XP writes.
- Instrumented across Landing, Auth, Onboarding, App (session start/end + first-mission), Study (session + streak + achievements), StoryReaderImmersive (story open/complete + first-story), LanguageSwitcher. Events consolidated daily/weak/review into `STUDY_SESSION_*` with a `mode` prop; kept explicit FIRST_MISSION / FIRST_STORY milestone events for the activation funnel. Tests in `analytics.test.js` (event build, sanitize, offline queue, missing user/language, duplicate-session guard).

### First Mission — interactive teach-by-doing onboarding (PR #42)
- `src/firstMission.js` + `src/FirstMissionWelcome.jsx`: a brand-new account is walked through its very first study session and first story as a guided "mission" (the `firstMission` prop threads through Study and the reader — first-run hints, the reader guidance line, the completion copy). Interactive, not a slideshow.

### Build/version stamp (PR #41)
- `src/version.js` exposes **`BUILD_SHA`** (injected via `vite.config` `define: import.meta.env.VITE_BUILD_SHA`, from `version.json` at build). Surfaced in **Settings** and logged to the console on boot, so "am I on the latest deploy?" is answerable. Analytics stamps every event with it.

### ESLint baseline eliminated (PR #40)
- The long-standing **24-error** lint baseline is gone — `npx eslint .` was **0 errors / 6 warnings** at the time of PR #40 (the 6 are intentional `react-hooks/exhaustive-deps` on mount-load effects + audio autoplay). **Do not add new errors.** The cleanup was behavior-preserving. ⚠️ **That is no longer the current number — see "ESLint baseline (current)" in §16 Known issues for the live count.**

### Study.jsx refactor — pure logic extracted + tested (PR #39)
Study.jsx was large and hard to test; carved into focused, unit-tested pieces (behavior unchanged):
- `SessionRecap.jsx` (recap UI), `useStudyAudio.js` (audio hook), `useStudyKeyboardShortcuts.js` (desktop shortcuts), `typedAnswer.js` (typed-mode matching), `missionOffer.js` (post-session chat-mission bucketing), `studyTally.js` (session-tally decisions). Each has a `*.test.js`.

### Unified story readability — one canonical "% known" (PR #39)
- **`calculateStoryReadability({ content, vocabMap, cards, language })`** in `storyReading.js` is now the **single source of truth** for coverage: the reader shows it AND the post-study recap ranks/recommends with it, so they always agree. It mirrors exactly what the reader visibly counts (strips speaker labels, treats Chinese proper names as names, excludes JP single-kana particles, greedy longest-match). Pure token/status helpers (`wordStatus`, `splitSpeaker`, `matchName`, `todayWordsInStory`) live here too. Well tested (`storyReading.test.js`).

### First-run onboarding & activation funnel (PR #39)
- **First-run onboarding** (`src/firstRun.js`): a fresh account's very first session is capped small (5 cards) and pointed at learning its first words → unlocking its first story.
- **"First Story Unlocked" recap module** + deep-link: after the first study session, the recap surfaces the newly-readable story and links straight into it.
- **Seeded review-first queue ordering** (`studyQueue.js`): replaced the fixed new/review interleave with a seeded review-first ordering.
- **Reader today-words thread:** the reader surfaces "N words from today appear here", guidance, and an end-of-story recap that closes the study→read loop.

### Product identity hardening (PR #39)
- Reading-first landing/marketing copy; rewritten README; **auth email normalization** (`normalizeEmail` in utils — trims + lowercases so " Me@X.com " and "me@x.com" are one account, preventing an unreachable duplicate from a mobile auto-capital); NotFound routing (`src/NotFound.jsx`) for unknown paths.

---

## 0a. SESSION (2026-07-05)

### Brand wordmark — retired the brush script
- The "Hanzi Dojo" wordmark used `Nanum Brush Script` (a Korean brush font whose Latin letters read thin/uneven — user called it "awful"). `brand.js` `heroWordmarkStyle` now uses **Poppins 700**, `-0.02em` tracking, `var(--text)` color — clean and legible, letting the red ensō logo carry the brand color. Fixes all hero placements (landing / auth / onboarding / password-reset) at once. Dropped `Nanum+Brush+Script` from the `index.html` font link (unused now); `BRAND_BRUSH_FONT` kept exported for back-compat but unreferenced.

### Typing leniency, flashcard overlap, grammar audio, kana chart
- **Leniency (items 1 & 3, "hai marked wrong"):** `testLogic.normalizePinyin` now NFD-decomposes and strips combining marks — a tone stored **decomposed** (a + U+030C) is accepted like precomposed ǎ (the silent cause). `checkAnswer` uses `lenientPinyin` (numeric tones too). Writing's `normalizeRomaji` ignores the syllable apostrophe + hyphens. Strictly more lenient. Tests added.
- **Flashcard (item 6, "Replay covers furigana"):** the flipped side's tall content could bleed up over the header controls; header is now `flex-shrink:0` and the content area scrolls (`minHeight:0`/`overflow-y:auto`).
- **Grammar guide (item 4a):** every example got a **play button** (browser TTS via `speakText`). Plus a **"Try it" reorder exercise** per topic (`TryIt` in Grammar.jsx): scrambles one of the topic's own examples into word tiles to rebuild (word-order practice, no new content). Tokenizer extracted to shared **`src/segment.js`** (`tokenize`/`makeSegmenter`/`isContent`/`scrambleIndices`), now used by both Grammar and SentenceBuilder. Japanese tiles come from the hand-authored `segs` (clean word units); other languages segment the target. Topics whose examples don't land at 3–8 tiles just skip it. Coverage: zh 10/14, ja 13/14, ru 9/12 topics.
- **Kana (item 5):** three tabs now — **Learn | Practice | Chart**. Chart = browsable gojūon grid, tap any kana to hear it (`speakKana`, ja-JP TTS). **Learn = guided learn-then-quiz**: one gojūon row per lesson (`LESSONS`), study screen shows the row's hira+kata+romaji (tap to hear) + prev/next lesson browse, then "Quiz these kana" drills just that row (`startLesson`; distractors drawn from `ALL_ROMAJI` so even 3-kana rows work in tap mode), and the recap offers "Next lesson". Practice (row-select quiz) is unchanged. **Lesson progress persists** (`prefsGet`/`prefsSet`, key `kanaLessonsDone`): clearing a lesson at ≥⅔ correct marks it done (`markLessonDone` in `finish`), the picker shows a tappable 15-lesson map (✓ = cleared, ring = current) + "N of 15 cleared", and on mount the Learn tab resumes at the first uncleared lesson. Durable across sessions and survives "Clear downloads".
- **Item 4b (furigana on kana):** could NOT reproduce — the grammar guide's 23 JP examples all carry `segs`, so furigana renders over kanji only (kana get none); flashcards/reader use the same kanji-only `furiganaParts`. Need the exact screen from the user.

### Chat Missions — higher-level banks
- `src/chatMissions.js` BANK gained **`chinese|2` (HSK2, 3 missions)** and **`japanese|2` (N5 Part 2, 2 missions)** so the post-study chat now reaches the higher levels (was level-1 only for CN/JP/RU). Same mission shape; `targetWords` were aligned to words that actually appear as tappable tokens (so in-chat highlight + weak-marking work). Japanese missions stay all-kana like the other JP banks.

### Sentence Builder — curated common-sentence bank
- The builder used to draw ONLY on per-word LLM `example_sentence` values (often stilted / uncommon-word). Added **`src/sentenceBank.js`** — hand-written everyday sentences keyed `language|system|level`, `{ text, en }`. `SentenceBuilder.buildQuestions(pool, seg, curated)` now builds curated questions first (as pseudo-vocab so the render is unchanged), shuffles them, and tops up with the best vocab examples — so a level with a full bank is entirely natural sentences; levels with no bank fall back to the old behavior unchanged.
- Banks (158 sentences): `chinese|hsk_3|1` (31), `chinese|hsk_3|2` (24), `japanese|jlpt|1`/N5·Pt1 (23), `japanese|jlpt|2`/N5·Pt2 (21), `japanese|jlpt|3`/N4 (25), `russian|russian|1` (34) — covers every seeded level. **Every sentence was verified with Node's `Intl.Segmenter` to tokenize to 3–8 content tiles** (same isContent/PUNCT logic as the app). **Japanese must use kanji** — all-kana fragments into single-character tiles under the word segmenter; kanji compounds segment into clean word tiles (and match the existing example-sentence style). `markWordDue` on a curated miss targets the hardest level word present, or is skipped if none map. Tested (`sentenceBank.test.js`; suite **66**).

### Offline support — additive layer, online path untouched
- **Design rule:** offline is strictly additive. The normal online code path is byte-for-byte unchanged; offline branches only run when `navigator.onLine === false`, and every helper no-ops safely if IndexedDB is missing. Verified: `npm run build` ✓, vitest **63** ✓, eslint total errors **24 = baseline** (added none).
- **`src/offline.js`** — dependency-free IndexedDB wrapper (`hanzi-offline` db v2, stores `cache`/`outbox`/`audio`/`prefs`). All ops resolve to harmless defaults on any failure. (localStorage is still banned — IndexedDB is the sanctioned store.) The **`prefs`** store (`prefsGet`/`prefsSet`) holds durable local progress/prefs and is deliberately **NOT** cleared by "Clear downloads" (unlike `cache`) — used for kana lesson progress.
- **`src/syncQueue.js`** — durable write outbox replayed on reconnect. Idempotency: card writes are upserts to a known next-state; **new cards de-dupe on (user_id, vocab_id)** before insert (offline new cards use a throwaway `local-…` id in-session, the op carries `cardId:null`); XP is reconciled as a **delta** against the live server total (worst case on a mid-flush crash is a little LOST XP, never inflated). `review_logs`/`daily_activity` are best-effort. Pure helpers (`xpTotalOf`/`dayCountsOf`/`reconcileAward`) unit-tested in `syncQueue.test.js`.
- **`src/data.js`** `getTrackCards` — read-through cache: mirrors every good fetch to IndexedDB, serves the last copy when a fetch comes back empty (offline). Transparent to Study/Home/Test.
- **`src/Study.jsx`** — offline: `loadQueue` rebuilds from cached vocab+cards; `applyGrade` grades locally (FSRS already client-side) and enqueues the write; undo drops the queued op (`snapshot.outboxId`) instead of hitting the network. **`OfflineSaveButton`** on the done screen prefetches the level's vocab + audio (`src/prefetch.js`).
- **`src/Stories.jsx`** caches its whole snapshot (list+text+reads) for offline reading; **`StoryReaderImmersive.finishStory`** queues the read + XP offline.
- **`src/OfflineBar.jsx`** (mounted in App) — calm status pill: "Offline — saved on this device" / "Syncing N reviews…"; it also drives `flushOutbox` on mount and on every `online` event.
- **Background Sync (`sw.js` v6):** when writes are pending offline, OfflineBar registers a `'hd-flush'` background sync; on reconnect the SW's `sync` handler `postMessage`s open clients to flush (OfflineBar listens). The SW never holds credentials — it delegates to a client; if none is open, the on-launch flush covers it. No-op where Background Sync is unsupported.
- **Settings → "Offline storage"** (`OfflineStorageCard`): shows `navigator.storage.estimate()` MB + saved-audio-clip count + pending unsynced reviews, and a two-tap "Clear downloaded data" (`clearDownloads` wipes the `cache`+`audio` stores but **keeps the outbox** so unsynced writes are never lost).
- **`src/audioCache.js`** — iOS offline audio. `ensureAudio(url)` (called on card/word view) persists the full MP3 as a blob in IndexedDB and preloads an in-memory object URL; `readyUrl(url)` (sync) is consulted inside `playAudioEl` so a preloaded clip plays directly — no network, no await in the gesture (both of which iOS/Safari block, since it ranges media around the SW cache). Study preloads current+next card; the reader preloads a word when its lookup sheet opens; the prefetch button stores the whole level's blobs. A clip never cached (never played online, never prefetched) still needs the network.
- **KNOWN GAPS (need a real-device pass — can't test browser/live-Supabase from the sandbox):** (1) **offline writes** (grade replay, XP delta reconcile) verified only by unit tests + build; exercise on a real device before trusting. (2) Offline level-ups don't grant the streak-freeze reward in-session (reconciled on flush via the XP delta).

## 0.1 PREVIOUS SESSION (2026-07-02)

### Batch 19 — serial-story pipeline made to actually work (plain-text protocol)
- The big lesson: **JSON is the wrong container for multi-line CJK prose.** gemini (pro AND flash) constantly emitted raw newlines + unescaped quotes inside JSON string values ("Unterminated string in JSON"), which (a) triggered endless slow retries — a full HSK1 level took **2h46m** — and (b) silently broke the revise steps, so quality fixes never applied and scores stuck at 3-4. A `repairJson` escape pass did NOT fully fix it (unescaped quotes + truncation remained).
- **Fix that worked:** replaced JSON with a **plain-text protocol** for every LLM pass in `generate-serial-stories.mjs`. `callText(prompt, tokens, check)` + per-pass string-op parsers: `parseChapter` (a `TITLE:` line then one story line per line), `parsePlan` (`SEASON:`/`PREMISE:`/`CHAPTER:`/`SUMMARY:`/`HOOK:`), critique (`SCORE:`/`FEEDBACK:`), translate (N lines, ±2 tolerated). `callJson`/`parseJsonLoose`/`repairJson` deleted. Result: runtime **2h46m → ~12 min/tier**, and yield jumped because revises finally apply.
- **Other fixes this arc:** empty-"thinking"-response crash guarded in extract/retry (gemini reasoning models eat the token budget → empty content); premium default switched pro → **gemini-2.5-flash** (LLM_MODEL_PREMIUM=gemini-2.5-pro opts back to the slow top tier); allowed pool widened to the WHOLE level (was choking on the first-100 words → 60% coverage → over-revision flattened prose); publish bar 7 → 6; HSK1 coverage floor relaxed to 0.85/0.83.
- **Result:** HSK1 tier-1 taste test = **5/6 published** (scores 6-7). Full HSK1 level = **7 published, 11 held** (~48 min) — tier 1 strong, tiers 2-3 (longer 30-42-line stories) weaker on flash so more held. User chose to **keep the 7 and move on** rather than re-run tiers 2-3 on pro. The 11 held rows are `is_published=false` (invisible to users); regenerate on `gemini-2.5-pro` later to raise tier-2/3 yield. `story-audio-hsk1` dispatched for the 7 published.

### Batch 18 — serial-story tuning: longer + richer (user: "longer, more vocabulary, very interesting")
- `generate-serial-stories.mjs` tuned after the user added Gemini billing. Per-tier `lines` bumped ~50% (HSK1/HSK2/JLPT1/N4 now 18–26 / 24–34 / 30–42; Russian 16–24 / 20–30 / 26–38). Draft/revise/translate `max_tokens` 4000→6000 for the longer output. Focus-word chunk 10–22/chapter (was 8–18).
- New per-tier vocabulary knobs: `minCov` (graduated coverage floor — tier1 0.90 down to tier3 0.83–0.85, since rank beginners need near-full comprehension but advanced tiers can handle a few reach words) and `maxMisses` (cap on DISTINCT out-of-pool words, 6→14 by tier). Validator enforces both; the draft prompt now explicitly permits ~half of maxMisses as "vivid reach words" (tappable in the reader) and pushes for WIDE vocabulary variety instead of the same handful.
- `llm.mjs premiumLlm()`: with no Anthropic key but Gemini provider, premium tier now defaults to **gemini-2.5-pro** (bulk jobs stay on flash-lite via LLM_MODEL) — so enabling billing on the Gemini key is enough, no repo variable needed. `LLM_MODEL_PREMIUM` still overrides; ANTHROPIC_API_KEY still wins.
- New `story_tier` workflow input (blank / 1 / 2 / 3) + `--tier` script flag: generates only that tier's season and, with `--replace`, deletes only that tier — a cheap taste test before committing a whole level. After a serial run, dispatch the matching `story-audio-*` task.

### Batch 17 — serial-story pipeline (user: "stories are terrible, we have a bad system")
- Diagnosis agreed with the user: one cheap model, one overloaded prompt, nothing verified, auto-published, same 4 flavorless characters/15 stock scenes/1 plot template, choppy 15-char line caps. Decisions made together: **serial chapters** (not standalone vignettes), **premium model** (Anthropic key) for the writing passes, **auto-publish gated by validators**.
- New `generate-serial-stories.mjs` — see the full doc in the scripts section ("the CURRENT story generator"). `generate-stories.mjs` is legacy. New `premiumLlm()` export in `llm.mjs` (Anthropic via its OpenAI-compatible endpoint when `ANTHROPIC_API_KEY` is set; falls back to standard client). New Action tasks `serial-hsk1/2`, `serial-jlpt1`, `serial-n4`, `serial-russian` (all REPLACE the level's stories).
- Coverage validator sanity-tested offline (greedy matcher catches out-of-pool CJK runs, passes clean text, allows JP hiragana grammar while catching out-of-pool katakana).
- **Needs before dispatch:** `ANTHROPIC_API_KEY` repo secret. Then run e.g. `serial-hsk1`, skim results, then the matching `story-audio-*` task.

### Batch 16 — opt-in daily review reminder via Web Push (product review item #16, 3 of 3 remaining — LAST original-review item)
- New tables/columns: `push_subscriptions` (endpoint/p256dh/auth per device, RLS insert/select/delete own) and `profiles.reminder_enabled` / `profiles.reminder_hour_utc` (migration `20260702220000_add_push_reminders.sql`).
- **No Supabase Edge Function** — this repo has no Supabase CLI/functions setup, so sending is a plain Node script (`send-review-reminders.mjs`, uses the `web-push` npm package) run hourly by a new GitHub Action (`.github/workflows/send-reminders.yml`, `cron: '0 * * * *'`). It matches profiles where `reminder_hour_utc` equals the current UTC hour, counts due cards for their active track (any level, `state in (review, learning, relearning)` and `due_at <= now`), and pushes to every subscribed device; 404/410 responses (dead subscriptions) are pruned automatically.
- `src/push.js`: `enableReminders` (requests Notification permission, subscribes via `registration.pushManager`, upserts the subscription + hour), `setReminderHour` (change hour without re-subscribing), `disableReminders` (best-effort unsubscribe + clears the DB rows/flag), `pushSupported()` capability check.
- `sw.js` → **v5**: added `push` (shows the notification from the JSON payload `{title, body, url}`) and `notificationclick` (focuses an existing tab at that URL or opens one) handlers. No caching behavior changed.
- Settings.jsx: new "Daily review reminder" card — toggle + an hour `<select>` labeled in the user's **local** time (converted to/from UTC at the boundary; a plain hour number, not a full IANA timezone, so it can drift ~1h across a DST change — noted as a known v1 limitation) — inline error text if the browser denies/lacks push support.
- **Setup required before this does anything** (see the deployment section further down for exact steps): a VAPID keypair was generated this session (private key given to the user in chat only — never committed) — needs `VAPID_PRIVATE_KEY` + `VITE_VAPID_PUBLIC_KEY` as GitHub repo secrets, `VITE_VAPID_PUBLIC_KEY` as a Vercel env var, and optionally a `VAPID_SUBJECT` repo variable (`mailto:` contact).
- Not verified end-to-end from this sandbox (no live browser/device here) — needs a real device test after the secrets are in place.

### Batch 15 — retention % + reviews/day in Profile (product review item #17b, 2 of 3 remaining)
- New `ReviewAccuracy` component in `Profile.jsx`, rendered as its own panel right after the existing 6-month `StudyCalendar` heatmap (which already covered item #17's other half). Queries `review_logs` scoped to the current track (`vocabulary!inner(language, system)` filter, same pattern as `src/data.js`'s `getTrackCards`) and computes: retention % (grade 0 = "Again"/forgotten counts against it, grades 1–3 all count as recalled) and a 30-day reviews-per-day bar chart.
- Empty state (not a misleading "0%") when `review_logs` has no rows yet for the track — expected for any account predating Batch 6, which is when review-log writes started.

### Batch 14 — real story audio via TTS (product review item #12, 1 of 3 remaining)
- New `stories.has_audio` column (migration `20260702200000_add_story_audio.sql`, apply in SQL editor) — set true by `generate-story-audio.mjs` ONLY once every line for that story synthesizes successfully, so the reader can trust it without a per-line network probe.
- New `generate-story-audio.mjs` — same voice map as `generate-audio.mjs`, speaks each line as written (kanji included; Google's sentence-level Japanese voice handles context fine, unlike single vocab words), strips speaker labels the same way the reader's `splitSpeaker` does. Uploads to `stories/{story_id}/{line_index}.mp3` in the `audio` bucket. New Action tasks: `story-audio-hsk1`, `story-audio-hsk2`, `story-audio-jlpt1`, `story-audio-jlpt2`, `story-audio-n4`, `story-audio-russian`.
- `StoryReaderImmersive.jsx`: `speakFrom` now tries real bucket narration first when `story.has_audio` (via `playAudioEl`, same iOS-safe fallback used everywhere else), falling back per-line to `speechSynthesis` only if that line's file is missing/broken — stories without any generated audio yet behave exactly as before, zero added latency. Play bar subtitle reads "Listen" (vs. "Listen (text-to-speech)") once real narration exists.
- Still to run: dispatch `story-audio-*` for each level once this merges (not yet run this batch).

### Batch 13 — in-app feedback widget (user request)
- New `feedback` table (migration `20260702180000_add_feedback.sql`, apply in SQL editor): `user_id`, `email` (snapshot at submit time), `category` (bug|idea|other), `message`, `page` (current view), `language`, `created_at`. RLS: users insert/read their own rows only; append-only (no update/delete policy). No in-app admin view yet — read submissions via the Supabase dashboard Table Editor or SQL editor (`select * from feedback order by created_at desc`).
- New `src/Feedback.jsx` — a small floating button (bottom-right, sage, sits above the mobile nav bar) present on every signed-in screen, opening a modal: pick a category (Bug / Idea / Something else), write a message, send. No `<form>` tag (plain controlled textarea + button per project rules). Success shows a toast; auto-captures the current view and active language for context. Mounted once in App.jsx alongside `<Toasts />`.

### Batch 12 — flashcard audio still broken on iOS after v4 (user-reported, follow-up)
- User confirmed on Chrome-for-iOS (WebKit media engine, same as Safari) the "No audio" badge was showing on every card — a real, detected failure, not the earlier SW-cache poisoning (already fixed and merged in Batch 9/v4; the SW now bypasses Range requests entirely, so on iOS — which ranges every request — audio goes straight to network every time and the SW isn't in the loop at all).
- **Root cause (best fit, can't reproduce live from this sandbox — network to prod is blocked):** WebKit's progressive `<audio>`/`Audio()` load is stricter about Range-request byte-serving than Chromium; some CDN/edge paths in front of Supabase Storage don't answer Range the way WebKit expects, so the direct load errors out even though the MP3 itself (plain Google-TTS `audio/mpeg`, generated in `generate-audio.mjs`) is fine.
- **Fix:** new `playAudioEl(el, url, onFail)` in `utils.js` — plays the direct URL first (unchanged, fast path for every other browser); if that errors (`onerror` or a `play()` rejection other than `NotAllowedError`/`AbortError`), it retries once by `fetch()`-ing the whole file as a blob and playing from an object URL, which sidesteps Range entirely. `onFail` only fires if both attempts fail. Wired into all four playback sites: Study.jsx (flashcards — feeds the "No audio" badge), Listen.jsx, Tones.jsx, StoryReaderImmersive.jsx (word-tap audio).
- Not yet confirmed fixed on-device (sandbox can't reach prod) — ask the user to retest on Chrome/Safari iOS after this deploys.

### Product-review fix batch (branch `claude/product-design-review-kfwlx2` — NOT yet on main)
A full product/design/code review was performed, then its Phase-1 fixes were implemented on this branch:
- **Study.jsx:** double-grade race guard (`gradingRef` around `handleGrade`); **`review_logs` now written on every grade** (best-effort insert — enables future FSRS tuning/retention stats); desktop **keyboard shortcuts** (Space/Enter reveal, 1–4 grade, R replay, hint row under the buttons); queue pills use translucent accent tints (dark-mode correct).
- **Auth:** full **password-reset flow** — "Forgot password?" → `resetPasswordForEmail`; new `src/PasswordReset.jsx` set-new-password screen rendered by App on the `PASSWORD_RECOVERY` auth event. Success messages green (were error-red), Enter submits.
- **Stories.jsx:** `CATEGORIES_RUSSIAN` added (Russian no longer sees "HSK 1" copy); tier map keyed by language; progress denominator computed from the real level deck size (was hardcoded 300/400).
- **Level gating:** Onboarding + LanguageSwitcher disable levels with no seeded vocabulary ("Coming soon") — no more empty-queue dead ends; Onboarding also nudges beginners to level 1.
- **Drill fixes:** SentenceBuilder accepts any tile order that reproduces the sentence (duplicate tokens) and no longer penalizes "Show answer" via `markWordDue`; FillBlank blanks **every** occurrence of the word (`parts` array replaces before/after); Tones `toneOf` parses numeric pinyin (`pin1`) and excludes tone-indeterminate words instead of mislabeling neutral; YouTube gets shorts/embed URL parsing, theme-aware loading glyph (was 学 for all languages), 1-col mobile grid.
- **A11y:** Sidebar NavItem + theme toggle and Home FlowStep are real `<button>`s (aria-current on active); global `:focus-visible` outline in index.css; `outline:none` overrides removed from inputs.
- **Perf:** backgrounds converted to WebP (`bg-*.webp`, 1.2–1.8 MB PNGs → 9–50 KB; imports updated in Background/Auth/Onboarding — PNG originals kept in assets but unbundled); Google Fonts moved from CSS `@import` to preconnect+`<link>` in index.html.
- **Misc:** unused Vite-template `src/App.css` deleted; `og:image` is now an absolute GH-Pages URL (scrapers don't resolve relative paths).
- Verified: `npm run build` ✓, `npx vitest run` 45/45 ✓, `npm run lint` at the pre-existing baseline (no new errors).

### Batch 11 — user's 13-item feedback list (2026-07-02)
- **Leniency (items 1/8):** `lenientPinyin` in testLogic (tone marks + tone NUMBERS + punctuation/space/ü-v insensitive) now backs both Study typed mode and Writing; Writing's Japanese path runs the INPUT through toRomaji so kana↔romaji↔katakana all match. Tests added.
- **Word list (item 2):** new `src/Words.jsx` (view `words`, Practice-hub card "Word list") — every current-level word with live status (New/Learning/Learned/Mastered), count chips, search.
- **Fluency (item 3):** card is now titled "{Language} fluency" — the score was already language-scoped since the data-layer change; the label made it look global.
- **XP (items 4/5):** curve steepened — `spanForLevel = 250 + (level-1)*170` (was 150/+110); tests updated. New rank ladder in xp.js (`levelTitle`/`nextTitle`: Novice→Student(3)→Adept(6)→Wanderer(10)→Scholar(15)→Master(20)→Sensei(30)) shown on the Home pill, in the Study level-up recap (with next-rank preview), and in the awardXp toast.
- **Item 6:** `comprehension-prune` (chinese) dispatched via the Action. Also ran `clean-meanings` (both) and `deactivate-awkward` — both succeeded.
- **Sentence builder (item 7):** sentences now scored by their HARDEST word (max in-level sort_order; off-list tokens cost 400 each) instead of just the target word; token window tightened to 3–8.
- **Stories (item 12):** `generate-stories.mjs` prompt reworked — per-tier line ranges (14–20 / 16–24 / 20–28), story-arc requirement, 90%-list rule with a few extra common words allowed, max_tokens 2560. New `chinese|hsk_3|1` config; workflow gained `stories-hsk1-replace` / `stories-hsk2-replace` tasks (they DELETE + regenerate).
- **Grammar (item 10):** full overhaul. Data (`grammarGuides.js`) doubled to CN 14 / JP 14 / RU 12 topics; new optional topic fields: `pattern` (formula chip), `find` (substrings matched against real story lines), `check` (two 4-option self-check MCQs), and Japanese examples can carry `segs` (`[[text, reading|null], ...]`) for per-kanji `<ruby>` furigana. `Grammar.jsx` renders it all: pattern chip, ruby segs (fallback: reading ABOVE when kanji present, nothing for kana-only; CN/RU keep reading below), "In your stories" block (up to 3 current-level published story lines containing a `find` substring, deduped, with story title), and a "Check yourself" block — instant right/wrong per option, answers lock once correct, solving both pays +6 XP via `awardXp` once per topic per visit. App.jsx now passes `session`/`onUpdate` to Grammar.
- **Kana (item 13):** rebuilt Kana!-style — gojūon ROW picker grid (hira+kata labels, dakuten rows), session-miss dots per row (drillMemory), Basics/All/None quick-selects, answer mode toggle: Tap choices or TYPE romaji (Hepburn/kunrei variants accepted: shi/si, tsu/tu, fu/hu, ji/zi), Enter-driven typed flow.
- Item 11 (replay): root-caused earlier — the poisoned audio cache; fixed by SW v4 (needs one hard refresh). Item 9 (Russian bg): generated via Higgsfield — see assets if the CDN allowed download.

### Batch 10 — polish: count-ups, persisted audio speed, tone pairs
- **`CountUp`** in `ui.jsx` (rAF ease-out, ~650ms; reduced-motion renders the final value instantly). Used on the Study recap tiles + XP badge and Home's fluency score.
- **`audio_speed` preference** — migration `20260702150000_add_audio_speed.sql` (apply in SQL editor); Study's speed cycler now persists (best-effort) and seeds from the profile; Settings gained an Audio speed segmented control (1×/0.75×/0.5×).
- **Tone pairs (Tones.jsx):** mode picker (Single syllables / Tone pairs). Pairs = two-hanzi words whose reading splits into two space-separated syllables with determinable tones (`pairTones` → "3·1"); 4 pattern options drawn from the level's real patterns, topped up randomly. Modes hide when their pool has <4 words. Question shape unified: `{ kind, answer: string, options? }` — single-tone answers are strings now.
- Vite chunk warning: main chunk is 501.9kB (1.9kB over the 500k warn line) — benign, noted.

### Batch 9 — flashcard audio bug fix (user-reported: "sound doesn't work")
- **Root cause (verified with a Playwright + local-storage-mimic harness):** the SW served **ranged** media requests from a cached *full* response (breaks Safari/iOS playback) and could cache an **opaque partial** response (its 206 status is invisible to the SW), permanently poisoning that file's cache. Chromium worked in testing only because its first fetch carries no Range header.
- **`sw.js` → `v4`:** audio requests with a `Range` header now bypass the cache entirely (straight to network); only full un-ranged responses are cached. The version bump wipes any already-poisoned production caches. Harness confirmed: play ✓, ranged → 206 from network ✓, no partials cached ✓.
- **Study.jsx:** `playAudio` no longer fails silently — `onerror`/non-autoplay `play()` rejections set `audioBroken`, and the Replay button becomes a muted **"No audio"** chip (VolumeX), reset on every card change/undo. Makes missing content (e.g. levels whose TTS generation hasn't run) visible instead of mute.
- Note: sandbox network policy blocks supabase.co, so production storage couldn't be probed directly — if sound is still dead on a specific level after v4 deploys, check the "No audio" chip: it now distinguishes *file missing* from *playback broken*.

### Batch 8 — engagement polish (PR after story tracking)
- **`src/drillMemory.js`** — session-scoped miss memory (module state; localStorage is banned here). `recordMiss`/`weightedSample`: Kana + Cyrillic now sample missed items with up to 7× tickets (cap 3 misses), so today's slips get extra practice today. Tested (`drillMemory.test.js`, suite now **52 passing**).
- **YouTube:** cards play **inline** via a `youtube-nocookie.com` embed panel (autoplay, fullscreen, "Open on YouTube ↗" link, Close) instead of kicking users out of the app.
- **Onboarding step 4** — "Here's your daily loop": icon strip (Flashcards → Stories → Videos → Writing), the 15-minutes framing, and a note that the first session introduces `goal` new words and reviews return right before forgetting. "Start Learning" moved here (error display too); step 3 now just continues.

### Batch 7 — story completion tracking (PR after the UI kit)
- **Migration `20260702120000_add_story_reads.sql`** (apply in SQL editor): `story_reads` table (user_id+story_id PK, select/insert RLS) + the progress-reset RPC replaced to also clear story reads per language.
- **Reader:** "Finish story · +10 XP" `PrimaryButton` at the end (before Next story) → upserts `story_reads`, awards `STORY_FINISH_XP = 10` via `awardXp` (once — button becomes a green "Story finished" chip via the `isRead` prop; state lives in Stories' `readIds` Set, no local reader state).
- **Stories list:** read stories get a green `CheckCircle2` icon + "Read" pill; tier cards show "N of M read" and a check when a tier is complete.
- Defensive pre-migration: `story_reads` reads/writes fail silently into the old behavior (no checkmarks, button just doesn't stick).

### Batch 6 — shared UI kit (branch restarted from main after PR #4 merged)
- **`src/ui.jsx`** — shared `Centered` / `PrimaryButton` (sage, full-width, `disabled` support) / `SecondaryButton` primitives. The six drill files (Kana, Cyrillic, Listen, FillBlank, Tones, SentenceBuilder) each carried identical copies; all migrated (−295 net lines).
- **`src/utils.js`** — gained `shuffle` (Fisher–Yates; replaces six per-file copies AND Test.jsx's biased `sort(() => Math.random() - 0.5)` idiom) and `getAudioUrl` (was defined in Study, Listen, and Tones separately).
- New primitives go in `ui.jsx`; new shuffling/audio-URL needs come from `utils.js` — don't re-inline them.

### Batch 5 — toasts + SW update flow (same branch, PR #4)
- **Toast system:** `src/toast.js` (fires an `hd-toast` CustomEvent — usable from plain modules, no prop drilling) + `src/Toasts.jsx` (top-right stack, seal/level/freeze icons, 4.6s auto-dismiss, `hd-toast-in` keyframe with reduced-motion fallback) mounted in the App shell.
- **Level-up moments in drills:** `awardXp` toasts "Level N reached" (+freeze line) — all six drills get it for free. Study keeps its recap card instead (no double celebration).
- **Achievement seals toast at session end:** Study snapshots `{learned, mastered, daysStudied, streak, level}` at queue load (2 cheap queries — cross-language like Profile), re-fetches at recap, and toasts any newly earned seals via `evaluateAchievements` diff.
- **SW update pill:** `main.jsx` listens for `controllerchange` (guarded so first-install doesn't prompt) and shows a vanilla-DOM "Update ready — tap to refresh" pill — **the hard-refresh-after-deploy ritual is no longer needed** for users with the page open; a plain reload always got fresh HTML already.
- **SW cache caps:** `sw.js` bumped to `v3`; `ASSET_CACHE` capped at 80 entries, `AUDIO_CACHE` at 400 (oldest-first eviction after each put) — hashed bundles from old deploys no longer accumulate forever.

### Batch 4 — public landing page (same branch, PR #4)
- **`src/Landing.jsx`** — signed-out visitors now get a marketing page instead of a bare login card: top bar (logo + wordmark + "Log in"), hero ("Learn Chinese, Japanese, and Russian the way that actually works." + FSRS/stories positioning + free-forever chip), language chips from `languageList()`, **two stylized product mocks built in JSX** (flashcard with grade buttons + FSRS intervals; story reader with the % known bar and underlined new/learning words), three method cards (Real spaced repetition / Stories you can read / Honest progression), the daily-loop strip, bottom CTA, and the donations-never-paywall mission line. "Log in"/"Start learning free" switch to the existing `<Auth />` (untouched) with a fixed Back chip. `App.jsx` renders `<Landing />` when `!session`.
- Verified visually via `vite preview` + Playwright screenshots at 1400px and 390px (mobile loop strip tightened to fit one row).

### Batch 3 (same branch, PR #4)
- **Undo last grade (Study.jsx):** every grade snapshots the pre-grade card row, queue, session tallies, XP/freeze balances, and daily-activity counts; a floating "Undo last grade" chip (6s, or `U` key) restores all of it. Undoing a brand-new card's first grade deletes the row that grade created (explicit user request — the card returns as new). The undone grade's `review_logs` entry is deleted too — **apply migration `20260702090000_allow_review_log_delete.sql`** (review_logs previously had no delete policy, so the cleanup silently no-ops until it's applied). The streak is deliberately not reverted. No undo on the session-completing grade (recap already snapshotted).
- **Suggested grade + Enter:** typed mode highlights Good/Again from the check result (2px accent border on the `GradeButton`); Enter grades it. Flip mode: Enter = Good (Anki convention). Hint row shows the mapping.
- **Test.jsx:** `window.confirm` replaced with an inline two-step End-quiz confirm (`confirmingEnd` state).
- **StoryReaderImmersive.jsx:** story segmentation (`parsed`/`speakerColors`) and coverage stats are now `useMemo`'d — previously every toggle/sheet interaction re-ran `Intl.Segmenter` over the whole story.

### Phase 2 (same branch, PR #4)
- **`src/data.js`** — `getTrackCards(userId, track, { level, columns })`: cards scoped **server-side** via a `vocabulary!inner` join (language/system/level filters in PostgREST). Migrated: `Study.loadQueue` + `loadForecast`, `homeCounts` (which also dropped its now-redundant language-vocab query), `testLogic.getTestStatus`. Screens no longer pull the user's whole cross-language cards table. Rows carry a nested `vocabulary: {id, level}` — harmless, never written back. Profile.jsx intentionally NOT migrated (achievements legitimately need lifetime cross-language cards).
- **Navigation refetch diet** — `App.navigate()` reloads profile/track/counts only when landing on `home` (was: every view switch = ~5 queries). Study/practice screens already patch the in-memory profile via `onUpdate`/`onStreakUpdate`.
- **`src/xpService.js`** — one XP rulebook: pure `computeAward(prevXp, gain, prevFreezes)` (level-up → capped streak-freeze grant, `MAX_FREEZES=5` moved here) + `awardXp(session, profile, gain, onUpdate)` (persists, patches). All six drills (Listen/FillBlank/Tones/Kana/Cyrillic/SentenceBuilder) now call `awardXp` — **drill level-ups now grant freezes** (previously only Study did). Study uses `computeAward` against its running session refs. Tests in `xpService.test.js` (supabase stubbed like streak.test) → suite is now **49 passing**.

---

## 0b. PREVIOUS SESSION (2026-07-01)

Most recent round of work, so a fresh chat has current context. Everything below is **shipped to `main`** (Vercel production auto-deploys from `main`; hard-refresh to clear the service-worker cache after a deploy). The dev branch `claude/language-app-analysis-jl41s4` is kept in sync with `main`. Where this section conflicts with older text below, **this section wins.**

### Branding — now "Hanzi Dojo" (no hyphen)
- Visible product name is **"Hanzi Dojo"** everywhere (was "Hanzi-dojo"). The **repo name, directories, storage paths, DB `system`/`language` values are unchanged** — only the displayed wordmark changed.
- `src/brand.js` is the single source: `BRAND_NAME`, `wordmarkStyle()` (Poppins — small, in the Sidebar), `heroWordmarkStyle()` (**Nanum Brush Script**, brand-red `#B83A24` — large, on Auth + Onboarding, to echo the ensō brush logo). Fonts imported in `src/index.css`.
- The ensō logo (`src/assets/Hanzi-logo.png`) is unchanged. (A brush-text wordmark PNG was generated via Higgsfield but NOT used — the CDN is blocked by the sandbox network policy, and scalable live text is the better call anyway.)

### New files this session
- `src/brand.js` — brand name + wordmark styles.
- `src/Grammar.jsx` + `src/grammarGuides.js` — **grammar guides** (App view `grammar`, a card in the Practice hub). Accordion of ~7–8 beginner topics per language (CN/JP/RU) with examples; pure static data.
- `src/ErrorBoundary.jsx` — top-level React error boundary (wraps `<App>` in `main.jsx`) → calm reload screen instead of a white page.
- `llm.mjs` — **central LLM client for all `generate-*.mjs`** (see "Content pipeline" below).

### App changes shipped (a 19-item polish batch)
Flashcards: labelled **Replay** + **speed toggle** (1×/0.75×/0.5×) on the answer. Streak: freeze mechanic made **visible** (`streakStatus()` in `streak.js` → Home shows "Study today to keep it" / "❄️ Freeze protecting your streak"). Stories: **tier 1 unlocked from day one** (`minWords: 0`), **read-along line highlight** during TTS, **TTS speed** cycle, and learned words **dimmed** under the "Known" toggle. Dark mode: theme-aware feedback tokens (`--success`/`--success-bg`/`--success-border`/`--danger`/… in `index.css`) replace pale hardcoded greens/reds across all quiz/typing screens. Answer leniency (`Writing.jsx`): strips a leading `to/a/an/the` and splits meanings on ` or `. **Fluency score scoped to the active language** (`homeCounts.js` — previously summed all languages). **XP curve steepened** (`xp.js`: `150 + (level-1)*110`) and **level-ups grant a streak freeze** (capped `MAX_FREEZES=5`, shown in the Study recap). **Default theme is now light** (`App.jsx` `initialTheme`). Sentence builder biased toward common words (lowest `sort_order`). Public-readiness: error boundary + updated manifest/meta. Tests updated → `npx vitest run` = **45 passing**.

### Content pipeline — MIGRATED from Groq to Google Gemini
- Every `generate-*.mjs` now imports **`llm.mjs`** instead of building its own Groq client. `llm.mjs` prefers **`GEMINI_API_KEY`** (Gemini OpenAI-compatible endpoint `https://generativelanguage.googleapis.com/v1beta/openai/`, default model **`gemini-2.5-flash-lite`**) and **falls back to `GROQ_API_KEY`** (`llama-3.3-70b-versatile`). Overridable via env `LLM_MODEL` / `LLM_BASE_URL`. Client has a **60s timeout + maxRetries 2** so a stalled call fails fast into the script's own backoff.
- Workflow `regen-content.yml` now passes `GEMINI_API_KEY` (repo secret — user added it), `GROQ_API_KEY` (fallback), and optional `LLM_MODEL` (repo *variable*). New task **`comprehension-prune`** (delete trivial questions, then regenerate).
- Generator quality fixes: **comprehension** rejects trivial/self-answering questions (the "What is Xiao Hua's name?" bug) via `isTrivial()` + retry, plus a `--prune` mode; **examples** has a stronger natural-Japanese prompt and drops any example whose sentence lacks the target word.

### Content generation — CURRENT STATE (important)
- ✅ **Comprehension regenerated**: pruned 7 trivial-question Chinese stories, generated fresh non-trivial MCQs — **17 Chinese stories** now good (1 left intentionally question-less; the filter kept rejecting weak questions). Confirmed working on Gemini.
- ⚠️ **Gemini's FREE tier can't do the story/bulk workload reliably.** Small outputs (comprehension, examples) work; **large story generations get hard-429'd** — an N4-stories run produced only ~1–2 of 15. After several runs/day the free quota throttles even examples.
- ⏳ **Pending / partial:** **N4 stories** (~1–2 inserted, rest 429'd), **Russian stories** (not done), **Russian examples** (was throttling; re-run fills gaps — idempotent), **N4 Japanese examples** (never generated → N4 has no example sentences, so no N4 Fill-blank/Sentence-builder). Full Japanese-examples *regen* was **skipped per the user**.
- **To finish reliably: add a paid key** — Gemini pay-as-you-go on the same `GEMINI_API_KEY`, or enable Groq **Dev tier** (the `GROQ_API_KEY` fallback still works). Volume is pennies. On the free tier: spread small runs across days, skip stories.
- **⚠️ Story re-run caveat:** `generate-stories.mjs` **inserts** (doesn't skip existing), so a story re-run must pass **`--replace`** or it duplicates the ~1–2 N4 stories already inserted. The `stories-*` workflow tasks do NOT pass `--replace` yet — add it before re-triggering stories.

---

## 1. Project purpose and philosophy

Hanzi-dojo is a free language learning web app built around the two methods that actually work: **SRS flashcards** and **immersion** (reading and listening in the target language). It currently supports Chinese (HSK 3.0), Japanese (JLPT), and Russian (CEFR).

**Adding a language is data-driven.** Per-language identity (accent color, font, native name, background, level system, whether the script is CJK) lives in `src/languageTheme.js`. Adding a language means: add an entry there, add its background asset, run the CHECK-constraint migration (see the `20260701120000_add_russian_language.sql` template), and seed content. Screens read the config instead of branching on `active_language === 'japanese'`.

**Why it exists:** Most language apps don't teach the language. Duolingo wastes time on gamified loops; immersion works but finding content at your level is hard. Hanzi-dojo combines SRS with level-matched immersion content so the user never has to hunt for comprehensible material — the right-level stories come to them.

**The daily learning loop (the UX should reinforce this order):**
1. Flashcards — daily SRS review and new cards
2. Stories — reading immersion matched to learned vocabulary
3. YouTube — curated listening immersion for the level
4. Writing practice — active recall and output

**Core philosophy:**
- **No shortcuts.** Progression is gated on genuine mastery (FSRS stability), not self-graded buttons.
- **Mastery before progression.** The level test requires 100% correct. Stories unlock on a lower "learned" bar to encourage early immersion.
- **Calm, not pressured.** No dark patterns, no guilt, no fake urgency. Streaks gently encourage consistency.
- **Frequency-first vocabulary.** Most useful words first, ordered by real-world frequency.
- **Community mission.** Stay free. If monetisation is ever needed, prefer donations or letting YouTubers pay a small fee for featured placement — never paywalls on core features.

**Long-term vision:** Expand to Spanish and more languages. Build a content engine that produces level-matched stories from the user's known words (the "immersion differentiator"). Architecture must stay language-agnostic.

---

## 2. Current state — what is built and working

- **Auth:** Email/password sign-up and log-in, Google OAuth. Full-page bg-login.png background at 0.35 opacity, white card with logo + "Hanzi-dojo" wordmark. Tab toggle (Log in / Sign up) with vermillion underline. "Free forever. No credit card." tagline below the card.
- **Onboarding:** 3-step flow: language selection (cards rendered from the shared language config — Chinese/Japanese/Russian) → level selection (grid of level buttons, Continue disabled until selection) → daily goal (5/10/15 new cards/day). Creates profiles row and language_tracks row.
- **FSRS flashcards:** Study screen with New/Learn/Due queue pills, 86px character display, furigana toggle for Japanese (ruby text), four grade buttons (Again/Hard/Good/Easy) with FSRS-previewed interval labels, audio autoplay on flip, example sentence on card back (sentence + reading/pinyin line + translation, with inline furigana on the target word for Japanese), word highlighted in accent color. **Recall mode** is a per-user preference (`profiles.recall_mode`): `flip` (reveal-then-grade) or `typed` (type the reading → checked against reading/pinyin/romaji via `checkTyped`, shows a correct/incorrect banner, then grade). **Audio autoplay** and **furigana default** are also prefs. Awards **account XP** per graded card (`src/xp.js` `xpForGrade`), persisted best-effort to `profiles.total_xp`.
- **Session recap:** End-of-session card (Study.jsx) showing cards studied / new learned / graduated to review / accuracy, a `+N XP` badge, and a next-day forecast (reviews + new waiting). Snapshotted to state at completion (`recap`), forecast loaded via `loadForecast()`.
- **Stroke-order explorer (both languages):** `src/Writer.jsx` (App view `strokes`, Home "Stroke order" button). Uses the `hanzi-writer` package: a grid of the level's CJK characters (kanji only for Japanese — kana filtered out); tap one for animated stroke order on a guide grid, with Animate (replay), Practice (draw-to-quiz), and a guide-outline toggle. Single-character vocab also show reading + meaning. Stroke data loads from the hanzi-writer-data CDN at runtime (so it needs a connection; gracefully shows "stroke data unavailable" on failure).
- **Sentence builder (both languages):** `src/SentenceBuilder.jsx` (nav "Builder", App view `builder`). Tokenises a short `example_sentence` with `Intl.Segmenter` (char-split fallback), scrambles the word tiles, and the user taps them back into order against the English translation. Check / Show answer, correct/incorrect feedback (reveals the full sentence), recap with accuracy + XP. Uses sentences with 3–8 content tokens.
- **Leech detection (Profile):** When the current track has cards with `lapses >= 4`, a "Words that keep slipping" panel lists the top offenders (word, reading, meaning, lapse count) with a button into the weak-words drill (`onNavigate('weak')`). Scoped to the active language/system/level.
- **Fill-in-the-blank (both languages):** `src/FillBlank.jsx` (nav "Sentences", App view `fillblank`). Blanks the target word out of its `example_sentence`, shows the English translation as a hint, and asks the user to pick the missing word from 4 same-level options. Reveals the full word/reading/meaning on answer; recap with accuracy + XP. Reuses the generated example-sentence data; context-based recall for both languages.
- **Kana drill (Japanese):** `src/Kana.jsx` (App view `kana`, Home "Practice kana" button shown only for Japanese). Embedded gojūon + dakuten/handakuten for both scripts (no DB). Pick Hiragana / Katakana / Both, then see a kana and choose its romaji from 4 options; immediate feedback, progress, recap with accuracy + XP. Chinese users see a "switch to Japanese" state. The Japanese parallel to the tone drill — a true-beginner on-ramp the app previously assumed.
- **Cyrillic alphabet drill (Russian):** `src/Cyrillic.jsx` (App view `cyrillic`). The Russian parallel to Kana/Tones — a true-beginner on-ramp for the alphabet. Pick Vowels / Consonants / All, see a Cyrillic letter, choose its sound (approximate Latin romanization) from 4 options; immediate feedback, progress bar, recap with accuracy + XP. Non-Russian users see a "switch to Russian" state. Alphabet is embedded (no DB).
- **Tone drill (Chinese):** `src/Tones.jsx` (App view `tones`, Home "Practice tones" button shown only for Chinese). Shows a single-character word, plays its audio, and asks which of the 4 tones (or neutral) it is — tone extracted from the pinyin tone mark (`toneOf`). Single hanzi = one syllable, the clean drill unit. Immediate feedback (pinyin + meaning), progress bar, recap with accuracy + XP (`correct × 4`). Japanese users see a "switch to Chinese" empty state. Closes the gap that flashcards/writing accept tone-insensitive answers, so tones were never tested.
- **Monthly report (Profile):** A "{Month} so far" panel summarising the current month from `daily_activity` — active days (exact), reviews (approx, summed `studied_cards`), day streak, and lifetime words mastered — with a **Share** button (Web Share API → clipboard fallback, "Copied" confirmation).
- **Fluency score (Home):** A single composite number (`src/fluency.js`) from lifetime vocabulary command across all levels — mastered words (stability ≥ 21d) worth 5, learned-not-mastered worth 2. Shown on Home with a rank label (Getting started → Beginner → Elementary → Intermediate → Advanced → Fluent) and a progress bar to the next rank. `homeCounts.js` exposes `lifetimeLearned`/`lifetimeMastered`.
- **Achievements (Profile):** A restrained "seal" grid (`src/achievements.js` + `Badge` in Profile.jsx) derived **live** from existing stats — no achievements table. Tiers across Consistency (streak), Vocabulary (lifetime learned), Mastery (lifetime FSRS-mastered), Progress (account level), and Dedication (distinct study days). Earned badges use the language accent; locked ones are greyed. Profile computes lifetime learned/mastered across all levels (not just the current one).
- **Story comprehension + new-words recap (story reader):** At the end of a story, a **"New words in this story"** card lists the not-yet-started vocab as chips with an **"Add N to deck"** bulk-insert button (updates `userCards` live). If `story_questions` exist for the story, a **"Check your understanding"** card shows English multiple-choice questions with immediate correct/incorrect feedback and a running score. Questions are loaded per `story.id`; the block is absent until content is generated.
- **Adaptive reading (story reader):** `StoryReaderImmersive.jsx` shows a **"% known"** coverage bar per story (unique in-story vocab split into known = review/mastered, learning, new — via `wordStatus`/`userCards`), plus a **"Known" toggle** that spotlights the learning frontier: new words get an accent underline + tint, learning words an amber underline, known words stay plain. Tapping any highlighted word still opens the add-to-deck sheet.
- **Flip animation + grade feedback:** Flashcard faces turn in on the Y axis (`hd-flip-in` keyframe, card has `perspective`); grading fires a per-grade colored ring pulse (`hd-grade-flash`, color via inline `--flash`). Reduced-motion users get a fade instead of rotation.
- **Listening quiz:** `src/Listen.jsx` (nav `Listening`, App view `listen`). Plays a word's audio and asks the user to pick the matching word from 4 same-level options; autoplay + replay, immediate correct/incorrect feedback with reading + meaning, progress bar, end recap with accuracy and XP earned (`+correct × 4` XP, persisted best-effort to `total_xp`). Pure practice — does not touch FSRS. Needs ≥4 audio-backed words at the level or it shows an empty state.
- **Practice → SRS connection (`src/practiceSignal.js`):** A wrong answer in Listening, Fill-in-the-blank, Tones, or Sentence builder calls `markWordDue(session, vocabId)` — which mirrors Writing (clear `is_easy`, set `due_at = now`) so a missed *started* word resurfaces in the next review (and, if it stays hard there, feeds weak-word/leech detection). Intentionally light, not a full FSRS "Again" (practice is low-stakes); a no-op for words with no card yet. Kana is excluded (no vocab card).
- **Weak-words drill:** Study.jsx with `mode="weak"` (App view `weak`) — a focused queue of the level's most-lapsed, not-yet-mastered cards (`lapses >= 2 && stability < 21`, top 30), regardless of due date. Entry point is a Home button shown when `counts.weakCount > 0`.
- **Level test:** 30 multiple-choice questions, mix of E→target and target→E. Unlocks at 90% mastery (FSRS stability ≥ 21 days). 100% required to pass. 3 attempts per day, tracked via `test_attempts` table with `attempt_date` column. Wrong answers apply FSRS Again grade. Passing inserts a `level_unlocks` row and advances `language_tracks.current_level`. "End quiz" button ends active quiz early (unanswered = wrong). Japanese options show reading below the word.
- **Stories:** 3 tiers (First Steps / Growing / Fluent), unlocked by learnedCount, separate category lists per language (CATEGORIES_CHINESE / CATEGORIES_JAPANESE). Category list → story list → reader. Reader is an interactive dialogue layout: StoryLine renders each line with a per-speaker color avatar and a per-line "play" button (Web Speech API TTS); clicking a word opens a VocabularyPopup (furigana on kanji, status badge, "Add to deck" for unstarted words). CharacterGuide shows named characters with reading pills (Chinese only — CHARACTER_READINGS.japanese is empty). Sticky sidebar has StoryProgressCard and ReviewWordsCard (responsive: moves below the story on screens <860px). End-of-story StoryCompletionCard links to the next story. Vocabulary for word-clickability is loaded across all levels (not just the current level), so every word in a story is underlined. A translation toggle swaps the interactive reader for an English prose view (EnglishStoryLine) using the `english_content` column — only shown when populated.
- **Writing practice:** Active recall for words already studied in flashcards. Round sizes 10/15/20/30. Three modes: Mixed / English→target / target→English. Accepts: hanzi, pinyin (tone-insensitive), hiragana, kanji, romaji (via wanakana) for Japanese. XP system (0–100 XP per word, Lv 1–5), correct-streak multiplier (up to 3×). Stats screen shows best/weakest words. Wrong answers set `is_easy = false` and make the card due immediately.
- **YouTube recommendations:** Grid of video cards with thumbnails (from YouTube API URL pattern), channel name, notes. Loads for current language/system/level.
- **Profile:** Stats (streak, freezes, learned count, mastered count + mastery % progress bar), daily goal editor (5/10/15 options), last-studied date, reset progress button (two-step confirm → calls RPC), sign out.
- **Language switcher:** Shows both languages with track progress. Active language has level-replay grid (click any level to jump back). Not-started languages show dashed "Start" card → level picker → creates track. Level replay and language switch both call `profiles.update({ active_language })`.
- **Settings:** Functional preferences page (`profiles` columns). Controls: theme (light/dark), flashcard recall mode (flip/typed), audio-on-flip toggle, and Japanese furigana default toggle. Persists best-effort and updates the in-memory profile live (App passes `session` + `onUpdate`). Daily goal and reset still live in Profile.
- **Home extras:** A daily new-card **goal ring** (`newDoneToday`/`daily_new_cards`, with complete state), an account **Lv N** pill (`levelInfo` from `src/xp.js`), a **reviews-waiting-tomorrow** line (`counts.dueTomorrow`), and a **Practice** button (with a weak-word count nudge).
- **Guided "Next up" (Home):** The primary CTA is recommendation-driven, not static — if the flashcard queue has cards (`newCount+learnCount+dueCount > 0`) it says "Review & learn (N waiting)" → study; once the queue is clear it says "Read a story" → stories (the immersion step). A "Next up" eyebrow + reason line explains why, and the matching step in the "Your daily loop" row is highlighted. Turns Home from a menu into a coach.
- **Practice hub:** `src/Practice.jsx` (App view `practice`, nav "Practice", Home "Practice" button). A calm card grid that gathers every drill/activity in one place — Weak words (with a count badge), Listening, Writing, Fill-in-the-blank, Sentence builder, a language-appropriate script drill (Tones for Chinese, Kana for Japanese, Cyrillic alphabet for Russian), Stroke order (CJK only — hidden for Russian), and Videos — so the top-level nav stays focused on the daily loop. Each card routes to the existing mode's view.
- **Navigation:** A single source of truth in `src/navConfig.js` (PRIMARY_NAV / BOTTOM_NAV / MOBILE_PRIMARY / MOBILE_MORE) consumed by both `Sidebar.jsx` and `MobileNav.jsx` (no duplicated arrays).
- **Sidebar:** Persistent left nav. Primary items: Home, Flashcards, Stories, Practice, Test. Bottom items: Profile, Settings, Language, Log out. Collapses to 64px icon-only rail with hover tooltips; expanded width 232px. Active item uses sage green pill (#E7EDE4 bg, #4F6047 text). Semi-transparent frosted glass (rgba(255,255,255,0.85) + blur(6px)).
- **MobileNav:** Bottom bar with 4 tabs (Home, Cards, Stories, Practice) + a "More" sheet (Test, Profile, Language, Settings, Log out). All study/practice modes are reached through the Practice tab.
- **Themed backgrounds:** Background.jsx — fixed full-page image at opacity 0.4, crossfades between bg-chinese.png and bg-japanese.png on language change, z-index 0 behind everything.
- **Mastery system:** Two tiers — "learned" (card has ever reached review/relearning state, `learned` column = true) and "mastered" (FSRS stability ≥ 21 days). Constants in src/mastery.js.
- **Streak system:** Updates on first grade of the day. Gap of 1 day = streak increment. Gap > 1 day = consumes one freeze per missed day, else resets to 1. The displayed streak uses `liveStreak(profile)` (computed from days since last study + freezes) so a broken streak shows 0 immediately rather than the stale stored value, which only changes on the next study. Streak freezes given back on progress reset.
- **InfoTip:** Reusable `?` tooltip component used next to "Mastery" labels in Home, Test locked screen, and Profile. Shows explanatory text in a floating panel on click, closes on outside click.
- **Home screen:** Language header (native script + level badge + streak pill), Today card (New/Learning/Due counts + mastery progress bar + InfoTip), "Start studying" sage green CTA, "Keep the flow going" row of 4 flow steps (Flashcards → Stories → Videos → Writing).

---

## 3. Stack

| Tool | Version / Notes |
|------|----------------|
| React | 19.x |
| Vite | 8.x (OXC parser — strict, no complex regex in JSX) |
| react-router-dom | 7.x — BrowserRouter; App derives `view` from the URL path (each top-level screen is `/<key>`, home is `/`) |
| Supabase JS | ^2.107 |
| ts-fsrs | ^5.4.1 — FSRS v5 scheduling |
| wanakana | ^5.3.1 — Japanese romaji conversion in Writing.jsx |
| hanzi-writer | ^3.7.3 — animated stroke order in Writer.jsx (loads char data from the hanzi-writer-data CDN at runtime) |
| vitest | ^4.x (dev) — unit tests for the pure logic modules; `npm test`, config in `vitest.config.js`, specs are `src/*.test.js` |
| lucide-react | ^1.17 — all UI icons |
| openai | used by content scripts (generate-examples/stories/translations) to call Groq's OpenAI-compatible API — not in app bundle |
| Tailwind CSS | installed but **not used** in JSX; all styling is inline style objects |
| Node | 24 |
| Language | Plain JSX, no TypeScript |

**Supabase project:**
- Project ID: `bvqvturqupbggxaeihvi`
- URL: `https://bvqvturqupbggxaeihvi.supabase.co`
- Storage bucket: `audio` (public) — all TTS MP3 files

---

## 4. All source files — what each one does

```
src/App.jsx
  Root component. Manages auth session, profile, track, counts state. Renders
  Auth or Onboarding when unauthenticated/unconfigured, otherwise renders the
  app shell (Background + Sidebar + current view). All view switching goes
  through the navigate() function, which also refreshes counts.

src/Auth.jsx
  Login/signup screen. Email+password and Google OAuth via Supabase. Tab toggle
  between Log in and Sign up. Uses bg-login.png background and Hanzi-logo.png.
  No form tag — submit via button onClick. Google sign-in passes
  redirectTo = window.location.origin + import.meta.env.BASE_URL so OAuth returns
  to whichever host the user is on (see section 19 Deployment).

src/Onboarding.jsx
  3-step flow: language → level → daily goal. The language cards and the level
  grid are rendered from the shared config (languageList() + getLevels), so a
  new language appears automatically. Creates profiles and language_tracks rows
  on finish. Continue button disabled until selection made.

src/Study.jsx
  Flashcard session. Builds a queue (due-learning first, then new up to daily
  limit, then due-review). Flip card to reveal reading, meaning, and example
  sentence. Four FSRS grade buttons (Again/Hard/Good/Easy) with interval
  previews. Audio autoplay on flip. Furigana toggle for Japanese (ruby element);
  the example sentence also shows inline furigana on the target word for
  Japanese cards. Saves full FSRS state to cards table on every grade.

src/Test.jsx
  Level test. Generates 30 mixed E↔target multiple-choice questions. Unlocks at
  90% mastery. 3 attempts/day. 100% required to pass. Wrong answers apply FSRS
  Again grade. Passing inserts level_unlocks row and advances language_tracks.
  "End quiz" ends early (unanswered = wrong). Shows reading below Japanese options.

src/Stories.jsx
  Story immersion. Three-tier category screen (CATEGORIES_CHINESE /
  CATEGORIES_JAPANESE) → story list → story reader. Text is segmented with
  greedy longest-match (segmentText) against a vocab map loaded across all
  levels. StoryLine renders each line with a per-speaker avatar/color
  (splitSpeakerLine) and a per-line Web Speech API "play" button; clicking a
  word opens VocabularyPopup (furigana, status, add-to-deck). CharacterGuide +
  CHARACTER_READINGS shows named characters with reading pills (Chinese only).
  StoryProgressCard and ReviewWordsCard form a sticky sidebar that moves below
  the story on narrow screens. StoryCompletionCard ends the story with a
  next-story link. A translation toggle renders EnglishStoryLine from the
  `english_content` column instead of the interactive reader.

src/StoryReaderImmersive.jsx
  HSKStory-style reader used for BOTH languages (Stories.jsx routes all stories
  here; the old in-file StoryReader is now unused dead code). Light theme.
  Language is derived from track.language: Intl.Segmenter('zh'|'ja') for
  whole-word tapping, vermillion/indigo accent, pinyin/furigana toggle, zh-CN/
  ja-JP audio, 读书/読書 watermarks. Furigana is okurigana-aware (only over
  kanji). Dialogue lines get per-speaker color labels (splitSpeaker). Tapping a
  word opens a bottom sheet (reading, meaning, status dot, level badge,
  add-to-deck, audio, "Translate sentence"). Chinese personal names (not vocab)
  are detected and shown with a "Name" popup. Greedy-vocab-first segmentation
  keeps known words tappable as whole units.

src/Writing.jsx
  Writing practice. Active recall for words the user has studied. Round sizes
  10/15/20/30. Three question modes (mixed, E→target, target→E). Accepts hanzi,
  pinyin (tone-insensitive), hiragana, kanji, or romaji for Japanese.
  XP system (0–100 per word), streak multiplier (1–3×). Stats screen with
  best/weakest word breakdown.

src/Profile.jsx
  User stats page. Shows streak, freezes, learned count, mastered count, mastery
  progress bar. Daily goal editor (5/10/15). Last studied date. Reset progress
  button (two-step confirm → calls reset_current_language_progress RPC). Sign out.
  StudyCalendar: a GitHub-style contribution heatmap of studied days (last
  17 weeks mobile / 24 desktop) from daily_activity, with intensity by
  studied_cards, month labels, a today outline, and a Less→More legend.

src/Home.jsx
  Dashboard. Language identity header (native script + level + streak pill).
  Today card with New/Learning/Due counts and mastery progress bar + InfoTip.
  "Start studying" sage green CTA. "Keep the flow going" row of feature shortcuts.

src/YouTube.jsx
  Curated video grid for current language/system/level. Loads from
  youtube_recommendations table. Thumbnail from YouTube video ID. Opens in new tab.

src/Listen.jsx
  Listening quiz. Loads the current level's audio-backed vocabulary, builds up to
  12 questions (correct word + 3 same-level distractors), plays the audio and asks
  the user to pick the word they heard. Autoplay + replay, immediate feedback,
  progress bar, end recap (accuracy + XP). Awards XP to profiles.total_xp; does not
  touch FSRS.

src/LanguageSwitcher.jsx
  Language management. Shows every configured language (Chinese, Japanese,
  Russian — built from languageList()). Active language shows level-replay grid.
  Not-started shows dashed "Start" card. Supports switching active language,
  replaying a level, starting a new language.

src/Sidebar.jsx
  Persistent left navigation. Collapses to 64px icon-only rail with hover tooltips.
  Expanded at 232px. Active state: sage green pill (#E7EDE4 bg, #4F6047 text).
  Semi-transparent frosted glass (rgba(255,255,255,0.85) + blur).

src/MobileNav.jsx
  Fixed bottom navigation bar shown below 768px (instead of Sidebar). 5 primary
  tabs (Home, Cards, Stories, Writing, More); "More" opens a bottom sheet with
  Test, YouTube, Profile, Language, Settings, Log out. Respects iOS safe-area inset.

src/useIsMobile.js
  useIsMobile() hook + MOBILE_BREAKPOINT (768). window.innerWidth + resize
  listener; App.jsx uses it to pick Sidebar vs MobileNav and to pad content
  above the bottom bar.

src/Background.jsx
  Fixed full-page background image at opacity 0.4. Crossfades between the
  per-language backgrounds (bg-chinese/bg-japanese/bg-russian, keyed by the
  theme's backgroundKey) on language change (500ms fade). z-index 0,
  pointer-events none, aria-hidden.

src/Settings.jsx
  Placeholder settings page. Shows three preview panels (Appearance, Reminders,
  Account safety) with no real functionality. Actual settings live in Profile.

src/InfoTip.jsx
  Reusable "?" tooltip button. Shows a fixed-position panel on click with
  explanatory text. Closes on outside click. Used next to mastery labels.

src/srs.js
  FSRS v5 scheduling via ts-fsrs. Exports schedule(card, grade) → {updates, stay,
  gap} and previewLabels(card) → {0,1,2,3: string}. Grades 0-3 map to
  Again/Hard/Good/Easy. State stored as text (new/learning/review/relearning).
  is_easy = true only on grade 3. learning_step column repurposed for FSRS
  learning_steps index.

src/mastery.js
  Mastery constants and helpers. MASTERY_STABILITY_DAYS = 21, TEST_UNLOCK_MASTERY_PCT
  = 0.9. Exports isLearned(card), isMastered(card), countMastery(cards, total).

src/xp.js
  Account XP / level helpers. xpForGrade(grade) → 2/6/10 XP. levelInfo(totalXp) →
  { level, intoLevel, levelSpan, pct } using a 100 + (level-1)*50 per-level curve.
  Used by Study (award), Home (Lv pill), Profile (account-level panel).

src/homeCounts.js
  getHomeCounts(userId, track, dailyNewCards) — loads vocabulary and cards for the
  current level, computes newCount/learnCount/dueCount/easyCount/totalWords/
  learnedCount/masteredCount/masteredPct. Called by App.jsx on every navigate().

src/testLogic.js
  getTestStatus(userId, track) — returns masteredCount/totalWords/masteredPct/
  testUnlocked/levelPassed. getAttemptsToday(userId, track) — returns count and
  passed. normalizePinyin(str) — strips tone marks for comparison. checkAnswer() —
  accepts exact character match, reading_plain match, or normalized pinyin.

src/streak.js
  updateStreak(profile) — on first study of the day: +1 if consecutive, else
  consumes one freeze PER missed day (resets to 1 if not enough freezes).
  liveStreak(profile) — the streak to DISPLAY: computed from days since
  last_studied_on (+ freezes) so a broken streak shows 0 immediately instead of
  the stale stored value. Home and Profile use liveStreak. todayStr() exported.

src/utils.js
  getLevelLabel(language, system, level) — returns 'HSK N', 'N5 · Part 1', or a
  Russian CEFR band ('A1'…'C2'). getSystemLabel(system) — 'HSK 3.0' / 'JLPT' /
  'CEFR'. getLevelRange(language, system) and getLevels(language, system) — the
  numeric level range / list for a language. getNextLevel(language, system, level).
  normalizeRecallInput(value) — strips punctuation/spaces/CJK punctuation for
  recall matching. isRecallMatch().

src/languageTheme.js
  Single source of truth for per-language identity/theme. languageTheme(language)
  → { key, system, languageName, nativeName, flag, accentHex, accentHexDark,
  accentVar, font, backgroundKey, cjk, script }, falling back to the default for
  unknown values. languageList() (ordered configs for pickers), isCjk(language).
  Adding a language = add an entry here. Replaces the old duplicated
  getLanguageDetails helpers and active_language ternaries across the app.

src/Cyrillic.jsx
  Russian alphabet drill (App view 'cyrillic'). The parallel to Kana (Japanese)
  and Tones (Chinese): pick Vowels / Consonants / All, see a Cyrillic letter,
  choose its sound (approximate Latin romanization) from 4 options; XP + recap.
  No DB — the alphabet is embedded. Non-Russian users see a switch-language state.

src/cleanMeaning.js
  cleanMeaning(raw) — DISPLAY-ONLY tidy for vocabulary `meaning` strings:
  normalises separators, strips stray trailing periods, dedupes senses, caps to
  4. Used in the story reader popup and the flashcard back. Never used for answer
  matching, and cannot fix a gloss that is semantically wrong (that needs
  regenerating the meaning data).

src/characterNames.js
  CHARACTER_READINGS: curated map of PROPER NAMES (Chinese) → reading, used by
  StoryReaderCN to detect personal names (李明/小明/林雨晴…) and show a "Name"
  popup instead of translating them character-by-character. Role nouns
  (妈妈/服务员/姐姐…) are deliberately excluded — they're normal vocab.

src/ThemeContext.jsx
  React context for light/dark theme. App owns the theme state, applies it via
  document.documentElement[data-theme], and persists to profiles.theme. Consumers
  use useTheme() → { theme, toggleTheme, setTheme }. The Settings "Appearance"
  card and a Sidebar toggle switch it. Initial theme follows the OS preference
  until a saved profile theme loads.

src/supabase.js
  Exports the Supabase client created from VITE_SUPABASE_URL and
  VITE_SUPABASE_ANON_KEY environment variables. If either is missing at build
  time, it renders a visible "Site can't start" card into #root and throws,
  instead of letting createClient crash to a blank page. This is the fast signal
  that a host is missing its env vars (see section 19).

src/main.jsx
  React 19 root. Mounts App into #root.

src/index.css
  Global reset (box-sizing, margin, padding). Imports Google Fonts (Noto Sans SC,
  Noto Sans JP, Inter). Tailwind base/components/utilities directives (Tailwind
  is installed but not used in JSX). Defines CSS variables:
  --chinese-accent, --chinese-accent-dark, --japanese-accent, --japanese-accent-dark.

src/App.css
  Empty / minimal (not currently used).
```

**Assets:**
```
src/assets/Hanzi-logo.png    — enso brushstroke circle, vermillion; used in sidebar and auth/onboarding
src/assets/bg-chinese.png    — ink-wash mountain background for Chinese mode
src/assets/bg-japanese.png   — Mt Fuji / cherry blossom background for Japanese mode
src/assets/bg-login.png      — background for auth and onboarding screens (opacity 0.35)
src/assets/logo.svg          — placeholder SVG (not used, replaced by Hanzi-logo.png)
src/assets/hero.png          — unused asset
```

---

## 5. Database schema

```sql
profiles
  id uuid PRIMARY KEY (= auth.users.id)
  active_language text          -- 'chinese' | 'japanese' | 'russian'
  daily_new_cards int           -- default 10
  streak int                    -- consecutive study days
  streak_freezes int            -- available freeze tokens
  last_studied_on date
  display_name text
  theme text                    -- 'light' | 'dark' (migration 20260628190000); default 'light'
  total_xp int                  -- lifetime account XP from flashcard reviews (migration 20260630000000); default 0
  recall_mode text              -- flashcard recall: 'flip' | 'typed'; default 'flip'
  audio_autoplay boolean        -- play card audio on flip; default true
  furigana_default boolean      -- show furigana over kanji by default (Japanese); default true

language_tracks
  id uuid PRIMARY KEY
  user_id uuid REFERENCES profiles
  language text                 -- 'chinese' | 'japanese' | 'russian'
  system text                   -- 'hsk_3' | 'jlpt' | 'russian'
  current_level int
  is_active boolean

vocabulary
  id uuid PRIMARY KEY
  language text
  system text
  level int
  sort_order int                -- frequency rank within level
  word text                     -- the target-language word/character
  reading text                  -- pinyin with tones (Chinese) or hiragana (Japanese)
  reading_plain text            -- pinyin without tones (Chinese); unused for Japanese
  meaning text                  -- English meaning, may include comma/slash variants
  audio_path text               -- path within the 'audio' storage bucket
  is_active boolean
  example_sentence text         -- example sentence in target language
  example_reading text          -- reading/pinyin for the example sentence
                                   (pinyin with tones for Chinese, hiragana for Japanese)
  example_translation text      -- English translation of example sentence

cards
  id uuid PRIMARY KEY
  user_id uuid REFERENCES profiles
  vocab_id uuid REFERENCES vocabulary
  state text CHECK IN ('new','learning','review','relearning')
  is_easy boolean               -- set true only on Easy grade; no longer gates anything
  learned boolean               -- true once card first reaches review/relearning state
  due_at timestamptz
  -- FSRS columns (from 20260606120000_add_fsrs_columns.sql):
  stability real                -- FSRS stability (days until 90% recall)
  difficulty real               -- FSRS difficulty
  reps int
  lapses int
  last_review timestamptz
  scheduled_days int
  elapsed_days int
  learning_step int             -- repurposed: FSRS learning_steps index (step within learning phase)
  -- Legacy SM-2 columns (unused, kept in place):
  ease_factor real
  created_at timestamptz

review_logs
  id uuid PRIMARY KEY
  user_id uuid REFERENCES profiles
  vocab_id uuid REFERENCES vocabulary
  grade int
  reviewed_at timestamptz

daily_activity
  user_id uuid                   -- PRIMARY KEY (user_id, activity_date)
  activity_date date
  studied_cards int              -- written by Study.jsx on each grade (upsert);
  new_cards int                     drives the Profile "Study activity" calendar
  learning_cards int
  review_cards int               -- (counts are this-session running totals; presence is exact)

test_attempts
  id uuid PRIMARY KEY
  user_id uuid REFERENCES profiles
  language text
  system text
  level int
  score real
  total_questions int
  correct_count int
  passed boolean
  attempt_date date             -- used by getAttemptsToday() for daily attempt limit

test_answers
  id uuid PRIMARY KEY
  user_id uuid REFERENCES profiles
  attempt_id uuid REFERENCES test_attempts
  vocab_id uuid REFERENCES vocabulary
  user_answer text
  correct_answer text
  was_correct boolean

level_unlocks
  user_id uuid REFERENCES profiles
  language text
  system text
  level int
  PRIMARY KEY (user_id, language, system, level)

stories
  id uuid PRIMARY KEY
  language text
  system text
  level int
  tier int                      -- 1, 2, or 3
  tier_min_words int            -- minimum learned words to unlock this tier
  story_number int
  title text
  english_summary text
  content text                  -- plain text; newline-separated lines; speaker lines use '：' or ':'
  english_content text          -- line-aligned English translation of content (same line count);
                                   nullable — translation toggle only shows when populated
  is_published boolean

story_vocab
  story_id uuid REFERENCES stories
  vocab_id uuid REFERENCES vocabulary

story_questions                  -- migration 20260630010000; end-of-story comprehension
  id uuid PRIMARY KEY
  story_id uuid REFERENCES stories ON DELETE CASCADE
  question_number int
  question text                  -- English comprehension question
  options text[]                 -- 4 English answer choices
  correct_index int              -- 0-3, the correct option
  UNIQUE (story_id, question_number)
  -- RLS: authenticated users can read; generator writes via the service key.

youtube_recommendations
  id uuid PRIMARY KEY
  language text
  system text
  level int
  sort_order int
  title text
  channel_name text
  video_url text
  notes text
  is_published boolean

writing_stats
  user_id uuid REFERENCES profiles    -- PRIMARY KEY (user_id, vocab_id)
  vocab_id uuid REFERENCES vocabulary
  xp int CHECK (0..100)
  attempts int
  correct_count int
  missed_count int
  correct_streak int
  last_practiced_at timestamptz
  created_at timestamptz
  updated_at timestamptz
```

**Supabase RPC:**
```
reset_current_language_progress(p_language, p_system, p_reset_streak=true)
  Deletes cards, review_logs, writing_stats, test_attempts, level_unlocks for the
  language. If p_reset_streak=true, also deletes daily_activity and resets
  profiles.streak=0, streak_freezes=1, last_studied_on=null. Security definer,
  callable only by authenticated users on their own data.
```

---

## 6. Language and level system

**Chinese:** `language='chinese'`, `system='hsk_3'`, levels 1–9, displayed as 'HSK 1' through 'HSK 9'.

**Russian:** `language='russian'`, `system='russian'`, levels 1–6, displayed as CEFR bands:

| DB level | Display (getLevelLabel) |
|----------|------------------------|
| 1 | A1 |
| 2 | A2 |
| 3 | B1 |
| 4 | B2 |
| 5 | C1 |
| 6 | C2 |

`getSystemLabel('russian')` returns `'CEFR'`. Russian is written in Cyrillic; `word` is the Cyrillic word, `reading` is a Latin transliteration (used for display and as the audio-filename slug — audio itself speaks the Cyrillic `word`). Russian is **not** a CJK script, so the CJK-only modes (tones, kana, stroke order, furigana) are gated off and a **Cyrillic alphabet drill** (`src/Cyrillic.jsx`) is offered instead.

**Japanese:** `language='japanese'`, `system='jlpt'`, levels 1–6:

| DB level | Display (getLevelLabel) |
|----------|------------------------|
| 1 | N5 · Part 1 |
| 2 | N5 · Part 2 |
| 3 | N4 |
| 4 | N3 |
| 5 | N2 |
| 6 | N1 |

JLPT advances: 1 → 2 → 3 → 4 → 5 → 6. Always use `getLevelLabel(language, system, level)` from utils.js for display. Never hardcode labels.

`getSystemLabel('hsk_3')` returns `'HSK 3.0'`. `getSystemLabel('jlpt')` returns `'JLPT'`.

---

## 7. Content seeded

**Chinese HSK 3.0 Level 1:**
- 300 words, frequency-ordered (sort_order 1–300), all with audio at `chinese/hsk_3/level_1/`
- Example sentences on all 300 words (example_sentence, example_reading, example_translation columns), regenerated with the quality/anti-tautology prompt via the one-click Action
- 23 stories published across 3 tiers (7 / 8 / 8), all with `english_content` translations
- 3 YouTube recommendations
- Audio voice: `cmn-CN-Chirp3-HD-Aoede`, languageCode `cmn-CN`

**Chinese HSK 3.0 Level 2:**
- 198 words (frequency-ordered, from the New HSK Level 2 list → `data/hsk2.json`), sort_order 1–198
- Audio: all 198 clips generated (`chinese/hsk_3/level_2/NNN_<reading>.mp3`, `cmn-CN-Chirp3-HD-Aoede`)
- Example sentences: filled (via `examples-fill`)
- Stories: 15 published across 3 tiers (`stories-hsk2`), characters 李明/小红/小明/妈妈, with `english_content`
- Comprehension questions: generated for the level-2 stories (via `comprehension`)
- No YouTube recommendations yet
- **All eight study modes work for HSK 2** (flashcards, test, listening, tones, fill-in-the-blank, sentence builder, stories, comprehension)

**Japanese JLPT:**
- Level 1 (N5 Part 1): 400 words with audio at `japanese/jlpt/level_1/`
- Level 2 (N5 Part 2): 402 words with audio at `japanese/jlpt/level_2/`
- Audio voice: `ja-JP-Neural2-B`, languageCode `ja-JP`, TTS input = `v.reading` (hiragana — never v.word)
- Example sentences: 798/800 words populated (run `generate-examples.mjs --japanese` to fill the remaining 2)
- 15 stories published across 3 tiers (5 / 5 / 5) for level 1, all with `english_content` translations.
  Generated by `generate-stories.mjs` across 15 distinct scenes (park, supermarket, station, etc.) with
  characters たかし/はな/おかあさん/みせのひと
- **Level 3 (N4): 636 words seeded** (from `data/n4.json`, sourced from the open-anki-jlpt Genki-aligned deck; word/reading/meaning, deck-order not strict frequency, 28 `～`-suffix entries excluded). Audio / example sentences / stories / comprehension generated via the `seed-n4` / `audio-n4` / `examples-fill` / `stories-n4` / `comprehension` Action tasks. Readings validated (0 kanji-in-reading); spot-check recommended.
- No YouTube recommendations yet

**Russian CEFR:**
- Starter deck: 147 verified A1 words at `data/russian-a1.json` (frequency-ordered; Cyrillic `word` + Latin transliteration `reading` + English `meaning`). Seed with `seed-vocab.mjs --language russian --system russian --level 1 --apply`, then the full pipeline (audio → examples → stories). **Not yet seeded to the DB** (needs a runner with Supabase access, like HSK 2).
- Audio voice: `ru-RU-Wavenet-C`, languageCode `ru-RU`, TTS input = `v.word` (the Cyrillic word).
- No example sentences / stories / YouTube yet (run the respective generators after seeding).

**Story tier structure (per language, defined in Stories.jsx CATEGORIES_CHINESE / CATEGORIES_JAPANESE):**

| Tier | Label | Unlocks at (learnedCount) | Chinese vocab used | Japanese vocab used |
|------|-------|--------------------------|---------------------|----------------------|
| 1 | First Steps | 30 learned words | First 100 HSK 1 words | First 100 N5 Part 1 words |
| 2 | Growing | 100 learned words | First 200 HSK 1 words | First 200 N5 Part 1 words |
| 3 | Fluent | 200 learned words | All 300 HSK 1 words | All 400 N5 Part 1 words |

Character names used in stories (known to CharacterGuide via CHARACTER_READINGS — Chinese only,
CHARACTER_READINGS.japanese is empty since Japanese names are already written in hiragana):
李明 (Lǐ Míng), 小花 (Xiǎo Huā), 大力 (Dà Lì), 小明 (Xiǎo Míng), 小红 (Xiǎo Hóng),
妈妈 (Māma), 路人 (Lù rén), 大毛 (Dà Máo), 服务员 (Fúwùyuán), 收银员 (Shōuyínyuán), 店员 (Diànyuán)

---

## 8. Mastery system

Defined in `src/mastery.js`:

```js
MASTERY_STABILITY_DAYS = 21   // stability threshold for "mastered"
TEST_UNLOCK_MASTERY_PCT = 0.9  // test unlocks at 90% mastered
```

| Tier | Definition | Used for |
|------|-----------|---------|
| **Learned** | `learned` column = true, OR state is 'review' or 'relearning' | Story tier unlocks (lower bar = early immersion) |
| **Mastered** | FSRS `stability >= 21 days` | Test unlock and mastery progress display |

`is_easy` is kept (set on Easy grade) but no longer gates anything. Stability is the gate.

Wrong test answers apply FSRS Again grade, dropping stability below 21 and making the word due for review again. This is intentional.

---

## 9. SRS / FSRS (src/srs.js)

Uses **ts-fsrs v5**. Configuration: `request_retention: 0.9`, `enable_fuzz: true`.

**Grade mapping:**
- 0 = Again (Rating.Again)
- 1 = Hard (Rating.Hard)
- 2 = Good (Rating.Good)
- 3 = Easy (Rating.Easy) — also sets `is_easy = true`

**Card fields persisted to DB:**
`state`, `stability`, `difficulty`, `reps`, `lapses`, `last_review`, `scheduled_days`, `elapsed_days`, `learning_step` (= FSRS learning_steps index), `due_at`, `is_easy`, `learned`

**State values:** `'new'` / `'learning'` / `'review'` / `'relearning'` (text strings in DB)

**Scheduling behavior:**
- Learning/relearning cards: `due_at = now()` (always appears immediately on next load); re-inserted into session queue at position `gap` (2–20 minutes expressed as queue position)
- Review cards: `due_at` = real FSRS computed future date

**`learned` column:** Set to `true` when card first reaches review or relearning state. Never set false.

**Legacy columns** `ease_factor` and the old SM-2 `learning_step` semantics are kept in the DB but not written to by the new FSRS code. `learning_step` is repurposed to store FSRS `learning_steps` (the step index within the learning phase sequence).

---

## 10. Design system

**Color palette:**
```
Background:       #FAFAF8
Cards:            #FFFFFF
Border:           #E7E5E4
Primary text:     #18181B
Muted text:       #71717A
Chinese accent:   #B83A24   (vermillion)
Japanese accent:  #2E3A6E   (indigo)
Russian accent:   #2563C9   (royal blue)
Success:          #2F9E6D
Warning:          #D97706
Error:            #DC2626
Sage (nav active bg):   #E7EDE4
Sage (nav active text): #4F6047
Sage (CTA button):      #6E8466
Sage dark (CTA hover):  #5C7155
```

**CSS variables** (defined in index.css):
`--chinese-accent: #B83A24`, `--chinese-accent-dark: #922E1C`, `--japanese-accent: #2E3A6E`, `--japanese-accent-dark: #1E2750`, `--russian-accent: #2563C9`, `--russian-accent-dark: #1D4EA0`

**Theming (light/dark) — use these tokens for all neutral colors:**
Semantic tokens in index.css drive light/dark via `:root` and `:root[data-theme="dark"]`:
`--bg`, `--surface`, `--surface-2`, `--surface-glass`, `--border`, `--text`, `--text-muted`, `--text-faint`, `--reader-watermark`.
- **New code MUST use these tokens** (e.g. `background: 'var(--surface)'`, `color: 'var(--text)'`) instead of hardcoded neutral hexes, or it won't theme.
- Accent colors (chinese/japanese), status colors (success/warn/error), sage nav colors, and **white text on accent buttons** (`color: '#fff'`) stay hardcoded — they read on both themes.
- Fixed dark popovers/tooltips (e.g. Sidebar collapsed tooltip) use a literal dark (`#27272A`), not `var(--text)`, so they don't invert.
- Known minor: the Home New/Learning/Due tiles and streak pill use pale pastel accent-tint backgrounds that stay light in dark mode (look like colored chips; acceptable, could be refined).

**Fonts:** Inter (UI), Noto Sans SC (Chinese), Noto Sans JP (Japanese) — loaded from Google Fonts in index.css. **Russian uses Inter**, which already ships full Cyrillic coverage, so no extra web font is needed.

**Card interaction:** `translateY(-2px)`, stronger shadow, accent border on hover, ~180ms transition.

**Per-language accent:** The whole UI shifts accent color when the active language changes. Components derive `accentHex` (and font, native name, background) from `languageTheme(profile.active_language)` in `src/languageTheme.js` — never hardcode the ternary.

**Background images:** Fixed full-page at opacity **0.4** (Background.jsx `TARGET_OPACITY = 0.4`). Auth/Onboarding use bg-login.png at opacity 0.35.

**Sidebar:** Semi-transparent frosted glass `rgba(255,255,255,0.85)` + `backdropFilter: blur(6px)`. Expanded 232px, collapsed 64px. Collapse state is session-only (useState — not persisted).

**Navigation active state:** Sage green pill background (`#E7EDE4`) and text (`#4F6047`) — neutral, not accent-colored. Icons at 19px, strokeWidth 1.85.

**lucide-react icons:** All functional UI icons. Content emoji (🇨🇳 🇯🇵 flags) are fine as content. Never use emoji as icons.

---

## 11. Assets

```
src/assets/Hanzi-logo.png   enso brushstroke circle, vermillion on white
src/assets/bg-chinese.png   ink-wash mountain landscape (Chinese mode background)
src/assets/bg-japanese.png  Mt Fuji / cherry blossom (Japanese mode background)
src/assets/bg-russian.png   soft winter scene with onion-dome cathedral (Russian mode)
src/assets/bg-login.png     background for auth and onboarding screens
src/assets/logo.svg         placeholder SVG (not used)
src/assets/hero.png         unused
```

---

## 12. Coding rules (mandatory — OXC parser is strict)

1. **No TypeScript.** No type annotations anywhere.
2. **No complex regex literals** — OXC breaks on them. Use `string.indexOf()`, `string.split()`, `string.includes()` instead.
3. **All styling is inline style objects.** No Tailwind classes in JSX. Tailwind is installed but only used via directives in index.css.
4. **No template literals inside JSX style props** where string concatenation works. (`'url(' + src + ')'` not `` `url(${src})` `` in style values.)
5. **No localStorage or sessionStorage** — they don't work in this environment.
6. **No `<form>` tags** — use `onClick`/`onChange` handlers on inputs and buttons.
7. **Keep components flat and simple.** Extract subcomponents only when they are clearly reused or the file would be unreadable.
8. **`npm run build` must pass before any commit.** The build is the source of truth.
9. **Prefer full file replacements** for large changes when the user applies changes by hand.

---

## 13. Supabase safety rules

1. **Never delete vocabulary rows** — set `is_active = false` instead.
2. **Never delete cards** without explicit user request. Reset goes through the `reset_current_language_progress` RPC only.
3. **Never set `is_easy = true`** outside the SRS grading flow (`srs.js` + `Study.jsx`). Other features may set it `false` (Writing.jsx does this on wrong answer), never `true`.
4. **RLS is enabled** — all frontend queries run as the authenticated user. Never put the service key in frontend code.
5. **`level_unlocks` is append-only** except during a full progress reset via the RPC.
6. **Progress reset must go through the RPC** — never raw-delete across tables from the frontend.
7. **The audio bucket is public** — never store user data there.

---

## 14. Environment

For local dev these live in files; in production they come from each host's
settings (see section 19 Deployment).

```
.env            Vite app vars (VITE_ prefix). Gitignored.
                Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_TTS_KEY

.env.script     Server-side vars for generate-audio.mjs, generate-examples.mjs,
                generate-stories.mjs, and generate-story-translations.mjs. Gitignored.
                Required: SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_TTS_KEY, and an LLM key —
                GEMINI_API_KEY (preferred; llm.mjs → gemini-2.5-flash-lite) OR GROQ_API_KEY (fallback).
                Optional overrides: LLM_MODEL, LLM_BASE_URL.
```

> **LLM provider note (2026-07-01):** All the `generate-*.mjs` LLM scripts now go through **`llm.mjs`**, which selects the provider/model at runtime — **Gemini by default** (`GEMINI_API_KEY` → `gemini-2.5-flash-lite`), Groq as fallback (`GROQ_API_KEY` → `llama-3.3-70b-versatile`). The per-script descriptions below that say "Uses Groq / llama-3.3-70b" describe the *legacy* default; the model is now whatever `llm.mjs` resolves. See Section 0 → "Content pipeline".

### generate-audio.mjs

Script for generating TTS audio and uploading to Supabase storage. Not in app bundle.

**Run with:**
```bash
node --env-file=.env.script generate-audio.mjs
```

**Current state:** Configurable via `--language <chinese|japanese> --system <hsk_3|jlpt> [--level <n>]`. Chinese speaks `v.word` with `cmn-CN-Chirp3-HD-Aoede`; Japanese speaks `v.reading` (hiragana — never the kanji) with `ja-JP-Neural2-B`. Scopes to a level with `--level` so you don't re-synthesize a level that already has audio. Uploads each MP3 (upsert) to the path in `v.audio_path`. In the Action: `task=audio-hsk2` (runs `--language chinese --system hsk_3 --level 2`), which now has `GOOGLE_TTS_KEY` mapped from the `VITE_GOOGLE_TTS_KEY` repo secret.

**Voice config:**
- Japanese: `languageCode: 'ja-JP'`, `name: 'ja-JP-Neural2-B'`, input = `v.reading` (hiragana — NEVER `v.word`)
- Chinese (to reconfigure): `languageCode: 'cmn-CN'`, `name: 'cmn-CN-Chirp3-HD-Aoede'`, input = `v.word`
- Russian: `languageCode: 'ru-RU'`, `name: 'ru-RU-Wavenet-C'`, input = `v.word` (the Cyrillic word)

To regenerate without skipping existing files: delete the storage folder in Supabase first, then run the script (`upsert: true` is set but storage skips existing paths by default in some configurations).

### generate-story-audio.mjs

Script for generating per-line TTS narration for published stories (product review item #12). Not in app bundle.

**Run with:**
```bash
node --env-file=.env.script generate-story-audio.mjs --language chinese --system hsk_3 --level 1
node --env-file=.env.script generate-story-audio.mjs --language japanese --system jlpt --level 1 --story-id <uuid>  # single story
```

**Current state:** Same voice map as `generate-audio.mjs`, but speaks each line AS WRITTEN (kanji included — Google's sentence-level Japanese voice handles context fine, unlike single vocab words). Strips a leading `Speaker：`/`Speaker:` label the same way `StoryReaderImmersive.jsx`'s `splitSpeaker` does. Uploads each line to `stories/{story_id}/{line_index}.mp3` in the `audio` bucket; sets `stories.has_audio = true` ONLY if every line for that story succeeded — a partial failure leaves it `false` so the reader keeps using speechSynthesis for that story rather than serving a story with silent gaps. Action tasks: `story-audio-hsk1`, `story-audio-hsk2`, `story-audio-jlpt1`, `story-audio-jlpt2`, `story-audio-n4`, `story-audio-russian`.

### generate-serial-stories.mjs — the CURRENT story generator

The replacement for `generate-stories.mjs` (which is now legacy — kept for reference, don't dispatch its tasks for new content). Each tier becomes one continuing storyline ("season") of 4–6 chapters with recurring characters, produced by a multi-pass pipeline instead of a one-shot prompt:

1. **PLAN** (1 call, English): season premise + per-chapter outlines with chapter-ending hooks, woven around code-assigned focus words (the tier's newest vocabulary, chunked per chapter — i+1 by construction).
2. **DRAFT** (per chapter, target language) from the outline, with the focus words + the allowed pool.
3. **VALIDATE in code, not vibes**: greedy longest-match segmentation computes REAL vocabulary coverage against the full pool (Japanese: unmatched hiragana counts as allowed grammar; readings are indexed alongside words; Russian: token-level with a 4-letter prefix allowance for inflection + a function-word allowlist); dialogue speakers checked against the character bible; line counts checked.
4. **REVISE targeted** (max 3 rounds): the model is told exactly which out-of-pool words to replace, not asked to regenerate blind.
5. **CRITIQUE**: rubric-scored 1–10 (naturalness / actual-story / character voice / level fit); below 7 → one quality revision, then re-validate + re-critique.
6. **TRANSLATE**: separate line-aligned pass, count-checked, one retry.

Chapters passing every gate insert with `is_published=true`; failures insert `is_published=false` (review in the dashboard, fix, flip). Character bibles live in the script; Chinese names MUST stay within `src/characterNames.js`'s `CHARACTER_READINGS` map (name-tap detection) — currently 李明, 小红, 小明, 大毛 (妈妈 is a role noun and deliberately not in that map). Uses the **premium LLM tier** — `premiumLlm()` in `llm.mjs`, which picks Anthropic when `ANTHROPIC_API_KEY` is set (repo secret; `LLM_MODEL_PREMIUM` variable overrides the model) and falls back to the standard Gemini/Groq client otherwise. ~100 calls per level ≈ a dollar or two on a premium model. Bulk tasks (examples/meanings) never use the premium tier. Action tasks (all `--replace`: they DELETE the level's existing stories first): `serial-hsk1`, `serial-hsk2`, `serial-jlpt1`, `serial-n4`, `serial-russian`. After a run, dispatch the matching `story-audio-*` task to regenerate narration.

### generate-examples.mjs

Script for generating AI example sentences and uploading to Supabase vocabulary rows. Not in app bundle. Uses Groq (`llama-3.3-70b-versatile` via `openai` SDK pointed at `https://api.groq.com/openai/v1`).

**Run with:**
```bash
node --env-file=.env.script generate-examples.mjs --japanese          # fill missing (Japanese)
node --env-file=.env.script generate-examples.mjs --japanese --regen  # REGENERATE all (replace bad ones)
node --env-file=.env.script generate-examples.mjs --chinese           # Chinese
node --env-file=.env.script generate-examples.mjs --russian           # Russian (Cyrillic + Latin transliteration reading)
node --env-file=.env.script generate-examples.mjs                     # all languages, fill missing
```

**Behavior:** Batches vocab (10/batch), calls Groq **`llama-3.3-70b-versatile`** with a quality-focused prompt (meaningful sentences, realistic human subjects, counter/suffix handling, few-shot good/bad examples), then updates `example_sentence`/`example_reading`/`example_translation`. By default only fills `example_sentence IS NULL`; **`--regen`** regenerates ALL active words to replace low-quality sentences. Retries with backoff on rate limits.

The prompt explicitly **bans tautologies / math identities** — sentences whose only point is to restate the word's meaning (e.g. 半 → "one yuan is twice half a yuan"). It carries a 半 good-example (现在八点半 — "it's half past eight") and that exact math sentence as a labeled bad-example, alongside the Japanese 今日は12さい bad-example.

**Output per word:**
- `example_sentence` — target-language sentence containing the word (Chinese: ≤10 chars; Japanese: ≤15 chars)
- `example_reading` — full sentence in phonetic form (pinyin with tones for Chinese; hiragana for Japanese)
- `example_translation` — natural English translation

### generate-meanings.mjs

Regenerates the vocabulary `meaning` column with concise, accurate English glosses via `llama-3.3-70b-versatile` (fixes wrong/messy meanings). `--chinese`/`--japanese`; `--dry-run` prints before→after without writing. Rewrites ALL active words.

### seed-vocab.mjs — adding a new level (the content on-ramp)

Inserts a level's vocabulary from a JSON word list. **This is how new levels (HSK 2, JLPT N4, …) get added.** Input is an array of `{ word, reading, meaning, reading_plain? }` (frequency-ordered — list order becomes `sort_order`). It derives `reading_plain` (strips pinyin tones) when absent, builds `audio_path` as `<lang>/<system>/level_<n>/<NNN>_<reading>.mp3`, sets `is_active=true`, and inserts. **Idempotent** (skips words already present at that level) and **dry-run by default** — never deletes/overwrites.

```bash
# 1. Put a verified, frequency-ordered list at data/hsk2.json (see data/hsk2.sample.json for the shape)
node --env-file=.env.script seed-vocab.mjs --file data/hsk2.json --language chinese --system hsk_3 --level 2            # preview
node --env-file=.env.script seed-vocab.mjs --file data/hsk2.json --language chinese --system hsk_3 --level 2 --apply    # write

# Russian A1 starter deck (data/russian-a1.json — 24 verified words):
node --env-file=.env.script seed-vocab.mjs --file data/russian-a1.json --language russian --system russian --level 1 --apply
```
seed-vocab is language-agnostic — it works for Russian unchanged (for Russian, `reading` is the Latin transliteration and `reading_plain`/audio slug derive from it).

**Full "add a level" pipeline (in order):** `seed-vocab` → `generate-audio` (reconfigure for the level) → `generate-examples` (`--chinese --regen`) → `generate-stories` → `generate-comprehension`. For HSK 2 specifically, the Action has a one-click `task=seed-hsk2` that runs the seed against `data/hsk2.json` (commit the verified list there first). The word data itself must come from a canonical HSK 3.0 source — the meanings can be tidied afterward with `generate-meanings`/`clean-meanings`, but pinyin and level membership should be correct at seed time.

### No-Node alternative: ChatGPT + Supabase SQL (for meanings & sentences)

When running Node scripts isn't convenient, the same fixes can be done entirely in the **Supabase SQL Editor + ChatGPT** (no keys, no CLI):
1. **Export a batch** as JSON: `select json_agg(t) from (select id, word, reading[, meaning] from vocabulary where language='japanese' and is_active order by sort_order limit 100 offset 0) t;`
2. **Paste into ChatGPT** with a prompt asking for accurate meanings / meaningful sentences, returning a raw JSON array keyed by `id` (copy id verbatim).
3. **Apply** by pasting ChatGPT's JSON into a dollar-quoted upsert (no escaping needed). Read `id` as **text** (not uuid) and join on `v.id::text = x.id` so an occasional ChatGPT-mangled UUID is skipped instead of aborting the whole batch:
   ```sql
   update vocabulary v set meaning = x.meaning
   from json_to_recordset($json$ <PASTE JSON> $json$) as x(id text, meaning text)
   where v.id::text = x.id;
   ```
   (For sentences: `x(id text, example_sentence text, example_reading text, example_translation text)` updating those three columns.)
   The "rows updated" count vs the batch size tells you how many (if any) were skipped due to a bad id.
Batch ~100 words (meanings) / ~60 (sentences) via `offset`. Use dollar-quoting (`$json$…$json$`) so apostrophes don't break the SQL.

### One-click regeneration (GitHub Action) — `.github/workflows/regen-content.yml`

The fully hands-off way to regenerate content: a **manual `workflow_dispatch`** job that runs the `generate-*.mjs` scripts on GitHub's runners (which can reach Supabase + Groq — the local sandbox cannot). Trigger from the repo **Actions tab → "Regenerate vocabulary content" → Run workflow**.

- **Inputs:** `task` (meanings / examples / **examples-fill** / both / **comprehension** / **clean-meanings** / **deactivate-awkward** / per-level content tasks **seed-hsk2** / **audio-hsk2** / **stories-hsk2** / **seed-n4** / **audio-n4** / **stories-n4** / **seed-russian** / **audio-russian** / **examples-russian** / **stories-russian**) and `language`. The per-level `seed-*`/`audio-*`/`stories-*` tasks are self-contained (they carry their own `--language/--system/--level`) and ignore the `language` input. `examples-fill` runs `generate-examples.mjs` WITHOUT `--regen` — fills only words missing a sentence (safe for a newly-seeded level; won't touch existing good sentences). (both / japanese / chinese). For examples it always runs with `--regen` (replaces existing sentences, not just NULLs). `comprehension` runs `generate-comprehension.mjs` (fills stories with no questions). `clean-meanings` runs `clean-meanings.mjs --apply` (deterministic, no AI). `deactivate-awkward` runs `deactivate-awkward-vocab.mjs --apply` (sets `is_active=false` on counter-suffix + duplicate-reading entries; reversible).
- **Secrets used:** `VITE_SUPABASE_URL` (→ `SUPABASE_URL`), `SUPABASE_SERVICE_KEY`, `VITE_GOOGLE_TTS_KEY` (→ `GOOGLE_TTS_KEY`), **`GEMINI_API_KEY`** (preferred LLM key), `GROQ_API_KEY` (fallback), and the optional repo **variable** `LLM_MODEL`. `llm.mjs` picks Gemini when `GEMINI_API_KEY` is present.
- **New task `comprehension-prune`:** deletes existing trivial/self-answering questions (whole-story) then regenerates them — run this once to purge the old "What is X's name?" questions, then `comprehension` fills the rest.
- **Node 22 is required** (`setup-node` pins `node-version: 22`). `@supabase/supabase-js` v2 needs a **global `WebSocket`** at `createClient` time (RealtimeClient init); Node 20 has none and `createClient` throws immediately. Do not drop below 22.
- **Concurrency** is serialized (`group: regen-content`, no cancel) so two runs can't fight over the same rows. `timeout-minutes: 180`.
- **Rate limits (now Gemini):** small-output tasks (examples, comprehension) run fine on Gemini's free tier; **story generation gets hard-429'd** on the free tier and mostly fails (see Section 0 → "Content generation — current state"). A paid key removes the caps. Runs are idempotent/resumable — re-run to fill whatever is still missing (except stories, which need `--replace`).

### generate-stories.mjs

Generates level-matched stories via Groq (`llama-3.3-70b-versatile`) and inserts them into the `stories` table. Not in app bundle. **Config-driven** per `--language/--system/--level` (the `CONFIGS` map, keyed `language|system|level`).

**Run with:**
```bash
node --env-file=.env.script generate-stories.mjs --language japanese --system jlpt --level 1
node --env-file=.env.script generate-stories.mjs --language chinese --system hsk_3 --level 2
node --env-file=.env.script generate-stories.mjs --language russian --system russian --level 1
# add --replace to delete that level's existing stories first
```

**Behavior:** Configured targets are Japanese JLPT N5 (level 1) + N4 (level 3), **Chinese HSK 2**, and **Russian CEFR A1** (level 1). For each of 3 tiers (First Steps / Growing / Fluent), generates N stories from one of 15 scene templates; the vocab pool = an optional prerequisite level (e.g. Chinese HSK 2 pulls the 150 most-frequent HSK 1 words) + the current level up to the tier's sort_order cap. Characters: Japanese たかし/はな/おかあさん (hiragana); Chinese 李明/小红/小明/妈妈 (hanzi); Russian Иван/Аня/мама/продавец (Cyrillic). Dialogue uses the full-width colon `：` for CJK and a regular `:` for Russian (per-config `colon`). Each story has `content` + line-aligned `english_content`. Adding a language/level = add a `CONFIGS` entry. Actions: `task=stories-hsk2` / `stories-n4` / `stories-russian`.

### generate-story-translations.mjs

Backfills `english_content` for existing published stories where it is `NULL`. Not in app bundle. Uses Groq (`llama-3.1-8b-instant` — chosen for its higher daily token quota over the 70b model).

**Run with:**
```bash
node --env-file=.env.script generate-story-translations.mjs
```

**Behavior:** For each story, sends a numbered list of its content lines and requires the response's `english_content` to have the exact same line count, in the same order (dialogue lines keep `speaker：English text` format). Retries up to twice on a line-count mismatch. If a Groq daily token limit (TPD) error is detected, stops cleanly with a "resume later" message — safe to re-run, picks up where it left off.

---

## 15. Slash commands available

These exist as `.claude/commands/*.md` and are invoked as Claude Code skills:

| Command | File | What it does |
|---------|------|-------------|
| `/unlock` | commands/unlock.md | Marks all cards for the current testing level as Easy so the full unlocked state can be previewed |
| `/reset` | commands/reset.md | Resets language progress back to level 1 to test the fresh-start experience |
| `/ship` | commands/ship.md | Runs `npm run build` then commits and pushes to GitHub |
| `/audio` | commands/audio.md | Regenerates TTS audio for a vocabulary level |

---

## 16. Known issues

> **Content-generation status is in Section 0 (authoritative, 2026-07-01).** Summary: comprehension regenerated + de-trivialised (17 CN stories); pipeline moved to Gemini via `llm.mjs`; **N4 stories, Russian stories, Russian examples, and N4 Japanese examples are still pending/partial** because Gemini's free tier throttles bulk/story generation — finish with a paid key. Some bullets below predate that and are marked where stale.

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

---

## 17. Roadmap

**Status:** The app is **live** on GitHub Pages + Vercel (section 19). The most recent arc focused on the **first-run activation funnel** and the **story reader**; with analytics now instrumented (0a), the next priorities shift toward **acting on that data** (a dashboard, FSRS tuning) and **content breadth**.

### Immediate action items (one-time setup — nothing collects until these are done)
- ⚠️ **Apply the analytics migration** `supabase/migrations/20260713120000_add_analytics_events.sql` in the Supabase SQL editor. Until applied, every analytics insert fails silently (by design) and **no events are recorded**.
- **Admin analytics dashboard (new):** Apply `supabase/migrations/20260715000000_add_admin_analytics.sql`, then set your account admin (`/make-admin` slash command → `update profiles set is_admin = true`). Visit `/dashboard` (visible only to admins). Develop/demo with `node --env-file=.env.script seed-analytics.mjs --apply` (purge with `--purge --apply`). Reads via `admin_*` security-definer RPCs; no raw events leave the DB.
- **Push-reminder VAPID secrets** (item #16) — still required before daily reminders send: `VAPID_PRIVATE_KEY` + `VITE_VAPID_PUBLIC_KEY` GitHub secrets, `VITE_VAPID_PUBLIC_KEY` Vercel env var, optional `VAPID_SUBJECT` variable (section 19).

### Done (recent)
- ~~**Premium story-reader redesign**~~ — furigana modes, Learning Lens, sentence focus, redesigned lookup sheet with context chips, persisted prefs, typography + animation polish (0a, PR #43).
- ~~**Privacy-friendly analytics**~~ — single `analytics.js` service + append-only `analytics_events` table capturing the activation funnel + session metrics, offline via the existing outbox (0a, PR #43). *(still needs the migration applied — see action items above)*
- ~~**First Mission interactive onboarding**~~ + **first-run activation funnel** (first-session cap, "First Story Unlocked" recap + deep-link, seeded review-first queue, reader today-words thread) (0a, PRs #39/#42).
- ~~**Unified story readability**~~ — one canonical `calculateStoryReadability` shared by reader + recap (0a, PR #39).
- ~~**Build/version stamp**~~ (`BUILD_SHA` in Settings + console) and ~~**ESLint baseline eliminated**~~ (0 errors *at the time*; current baseline is in §16) (0a, PRs #40/#41).
- ~~**Study.jsx refactor**~~ — pure logic extracted into tested modules (0a, PR #39).
- ~~**Offline support**~~ — service worker + durable write outbox (background-sync queue), offline study/reading, iOS audio blobs (this replaces the old "follow-up: offline grading" item, now done).
- ~~Deploy to web, mobile nav + padding, installable PWA, furigana on flashcards, LanguageSwitcher mastery count, Japanese example sentences + stories~~ (older sessions).

### Priority order (most impactful first)
1. **Analytics dashboard — BUILT** (`src/Dashboard.jsx`, admin-only `/dashboard`): activation funnel (Landing→Signup→Onboarding→First Mission→First Story→return), DAU/WAU, story-completion, **retention by signup cohort** (D1/D7/D30 via `admin_retention`, with immature cohorts shown as "—"), and a **per-language story breakdown with a language filter**, backed by `admin_*` security-definer RPCs (migration `20260715000000_add_admin_analytics.sql`). Pure transforms + tests in `dashboardMetrics.js`. Note: the funnel/DAU/overview RPCs take no language param (top-of-funnel stages precede language choice), so the language filter scopes only the language-bearing story metrics. *(still depends on the migration being applied + real traffic before it shows data)*
2. **FSRS parameter tuning:** `review_logs` + analytics now give real data — optimize scheduler parameters beyond library defaults.
3. **Real-device verification pass** (can't be done from the sandbox): offline grade-replay + XP-delta reconcile, iOS/Safari flashcard + reader audio, and push reminders end-to-end. All were built and unit-tested but never exercised on a live device/browser.
4. **Content breadth:**
   - **Japanese YouTube recommendations** for JLPT N5 *(needs video URLs)*.
   - **HSK 2 vocabulary + audio + stories** — next Chinese level *(needs vocab data + API keys)*.
   - **Story yield:** regenerate the held/weaker tier-2/3 rows on `gemini-2.5-pro` (the `is_published=false` rows are invisible to users meanwhile).
   - **Russian (CEFR):** frontend + migration + A1 starter deck are in place; seed + generate more content to deepen it.
5. **Reader follow-ups** (nice-to-have): a first-time hint for sentence-focus (currently discovered by tapping), an optional serif reading font, per-story furigana overrides.

New languages (Spanish, …) stay mostly **data + content** thanks to the language-agnostic `src/languageTheme.js` refactor. (Practice mode is intentionally *not* on the roadmap — Writing.jsx already serves as the low-stakes practice/active-recall page.)

---

## 18. Verification and GitHub workflow

Before committing:
```bash
npm run build
npm test      # vitest — pure logic modules (srs, xp, fluency, mastery, streak, testLogic)
```

**Tests:** `npm test` runs the vitest suite (`src/*.test.js`). It covers the pure, high-risk logic — FSRS `schedule`/`previewLabels` invariants (fuzz-safe: asserts structure/flags, not exact intervals), XP curve, fluency score/rank, mastery thresholds, streak/freeze logic, and pinyin normalization. Modules that import `./supabase` mock it (`vi.mock('./supabase', …)`). Add a spec when you touch scheduling/scoring/progression.

If build passes:
```bash
git add .
git commit -m "Short specific message"
git push
```

Use `/ship` skill to automate this. Commit before and after every meaningful session. Update this CLAUDE.md when features are added or known issues are resolved.

**Pushing to `main` auto-deploys both hosts** (see section 19). Always `npm run build` first — a broken build ships a broken site to real users now.

---

## 19. Deployment & hosting

The app is **live** and deployed to two static hosts, both building from `main`. It is a pure client-side SPA (no server) talking directly to Supabase.

### GitHub Pages (primary)
- **URL:** https://fabrykjoh12.github.io/Hanzi-dojo/ (served under the `/Hanzi-dojo/` subpath — the repo name).
- **How:** `.github/workflows/deploy.yml` builds and deploys on every push to `main` using the official `actions/upload-pages-artifact` + `actions/deploy-pages`.
- **Pages Source MUST be "GitHub Actions"** (repo → Settings → Pages → Build and deployment → Source). If it is ever set to "Deploy from a branch", Pages serves the unbuilt source `index.html` (which references `/src/main.jsx`) and the site is a blank page with 404s. This was the original "I can't see the website" bug.
- **Env vars:** GitHub **repository secrets** (Settings → Secrets and variables → Actions → Repository secrets): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_TTS_KEY`. Secrets are read at build time; changing them requires a re-run of the workflow.

### Vercel (secondary)
- **URL:** https://hanzi-dojo-jet.vercel.app/ (served from root `/`).
- **How:** Vercel project `hanzi-dojo` auto-deploys; the **Production** environment tracks the `main` branch. Framework preset = Vite, build `npm run build`, output `dist`.
- **Env vars:** set per-environment under Settings → Environments → Production: the same three `VITE_` vars, plus **`VITE_VAPID_PUBLIC_KEY`** (push reminders, item #16 — see below). Vercel bakes them in at build time and only applies them to **new** builds — after adding/changing, redeploy (Deployments → ⋯ → Redeploy, uncheck build cache).

### Push reminders (item #16) — one-time secret setup
`send-review-reminders.mjs` runs hourly via `.github/workflows/send-reminders.yml` and needs its own secrets, separate from the `regen-content` ones:
- **GitHub repository secrets:** `VAPID_PRIVATE_KEY` (keep this one secret — never in the frontend), `VITE_VAPID_PUBLIC_KEY` (same value as the Vercel one below — the workflow reads it as `VAPID_PUBLIC_KEY`).
- **GitHub repository variable** (Settings → Secrets and variables → Actions → Variables): `VAPID_SUBJECT`, a `mailto:` contact address some push services require — defaults to a placeholder if unset.
- **Vercel env var:** `VITE_VAPID_PUBLIC_KEY` — same public key as above; the frontend needs it to call `pushManager.subscribe()`.
- The keypair itself is generated once with `web-push`'s `generateVAPIDKeys()` — it isn't regenerated by any script in this repo, so store both halves somewhere safe (rotating them invalidates every existing subscription, requiring users to re-enable reminders).

### Routing (react-router BrowserRouter)
- `main.jsx` wraps `<App>` in `<BrowserRouter basename=…>` (basename = `BASE_URL` minus the trailing slash, so it matches each host's base path). `App.jsx` derives `view` from `useLocation().pathname` (`pathToView`) and `navigate(key)` calls `useNavigate()` with `viewToPath(key)`. Each top-level screen is its own URL (`/study`, `/profile`, …); home is `/`. Browser back/forward and refresh-keeps-place now work. (Stories' internal list↔reader is still local state, not routed.)
- **Deep-link fallback (required for refresh on a deep route):**
  - GitHub Pages: the build copies `dist/index.html` → `dist/404.html` (`"build": "vite build && cp …"`), so Pages serves the SPA shell for any unknown path (correct content; 404 status is invisible to the app).
  - Vercel: `vercel.json` rewrites `/(.*)` → `/index.html`.
  - OAuth is unaffected: `redirectTo` is the base path (`/` or `/Hanzi-dojo/`), which always resolves to a real `index.html`, and Supabase's hash tokens don't collide with BrowserRouter (which uses the path, not the hash).

### Base path logic (vite.config.js) — do not hardcode
The two hosts need different base paths, resolved automatically:
- GitHub Pages production build → `base: '/Hanzi-dojo/'`
- Vercel build → `base: '/'` (Vercel sets the `VERCEL` env var during build; the config keys off it)
- Local dev (`command === 'serve'`) → `base: '/'`

Changing `base` to a fixed value will break one of the two hosts (assets 404 → white page).

### OAuth redirect (Supabase)
- `Auth.jsx` passes `redirectTo: window.location.origin + import.meta.env.BASE_URL`, so Google login returns to whichever host the user came from.
- Supabase only honors a `redirectTo` that is allow-listed. In Supabase → Authentication → URL Configuration → **Redirect URLs**, keep all three:
  - `https://fabrykjoh12.github.io/Hanzi-dojo/**`
  - `https://hanzi-dojo-jet.vercel.app/**`
  - `http://localhost:5173/**`
- The **Site URL** is set to the GitHub Pages URL. Adding a new host = add its URL to the Redirect URLs allow-list.

### Failure-mode cheat sheet
| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page, console 404 on `/src/main.jsx` | Pages Source on "Deploy from a branch" | Set Source = GitHub Actions |
| Blank/white page, 404 on `/Hanzi-dojo/assets/*` at a root host | base path wrong for that host | check vite.config.js VERCEL detection |
| "Site can't start" card | build ran without the `VITE_SUPABASE_*` env vars | add host env vars, then **rebuild/redeploy** |
| Google login bounces to localhost | host URL not in Supabase Redirect URLs | add `https://<host>/**` to the allow-list |

### PWA / installable + offline
- **Offline service worker** (`public/sw.js`, registered in `main.jsx` in production only). Runtime caching: navigations are network-first with a cached-shell fallback; same-origin assets and Google Fonts are cache-first; the Supabase **audio** bucket is cache-first (offline pronunciation replay); Supabase **REST/auth** is never cached (no stale user data). Versioned caches cleaned on `activate`; `skipWaiting`+`clientsClaim` apply updates on next load. Scope follows `BASE_URL`, so it works on both the Pages subpath and the Vercel root. **Not yet done:** offline flashcard *grading* (would need a background-sync queue) and caching Supabase data for full offline study — reads work from cache once loaded, but saving a grade still needs the network.
- `public/manifest.webmanifest` + icons (`icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`) make the app installable ("Add to Home Screen", standalone display). Icons were generated from `src/assets/Hanzi-logo.png` (the vermillion enso) composited onto white.
- `index.html` references the manifest/icons via Vite's `%BASE_URL%` so paths are correct on both hosts. This also fixed the old absolute `/favicon.svg` that 404'd on the GitHub Pages subpath. The manifest's internal paths (`start_url`, icon `src`) are **relative**, so they resolve under either base.
- To regenerate icons: `npm install --no-save sharp`, then a short sharp script compositing the logo onto a white background at 192/512/180. (Note: the browser-tab favicon is still the separate purple mark in `public/favicon.svg` — replace it with an enso-derived icon if full brand consistency is wanted.)

### Secrets / keys
- The `VITE_SUPABASE_ANON_KEY` is **public by design** (it ships in the client bundle); data is protected by RLS, not by hiding the key. Never put the Supabase **service key** in any `VITE_` var or frontend code — it belongs only in `.env.script` for the content scripts.

## Typed-answer acceptance (PR #66, 2026-07-15)

`src/typedAnswer.js` is deliberately lenient about how vocab is STORED, not about what the learner knows:

- **`JA_ALT_READINGS`** (exported from typedAnswer.js): curated table of Japanese words with more than one standard reading — 何 なん/なに, 水 みず/すい (the N5 pool literally has TWO 水 cards, one per reading), 四 よん/し, 七 なな/しち, 九 きゅう/く, 日/月/時/人/国/車/山/中/外/上/下/前, 明日 あした/あす, 今日/昨日, weekday kanji 木/金/火/土. Any listed reading (kana or romaji) is accepted for the card. Extend this table when users report a rejected-but-valid reading.
- **Decoration stripping**: stored N5 forms carry decorations (trailing 。 on phrases, ～ placeholders, parenthesized options like 後(で)) — every stored word/reading is expanded through `normalizeVocabForm` + `expandParenVariants` (both from storyReading.js, the same helpers the story matcher uses), so "sumimasen", "kono", "ato"/"atode" all pass. Typed trailing punctuation is ignored too.
- Chinese path (lenientPinyin over reading/reading_plain) is unchanged.
- Regression tests in `src/typedAnswer.test.js` include the exact user-reported cases (nani for 何, sui/mizu cross-acceptance).

## Russian story matching (PR — 2026-07-15)

Russian is the first **space-delimited, inflected** language in the reader, and needed a different matching model from CJK (which scans characters greedily). Added to `src/storyReading.js`:

- **Whole-token matching** (`matchRussianAt`): reads the entire whitespace/punctuation-delimited word and only starts at a boundary. This fixed the "highlights a single letter" bug — one-letter vocab words (в, с, к, и, а, о, у, я) were matching *inside* longer words (the в of вода). Now в only matches when it's a standalone token.
- **Inflection resolution**: nouns/verbs/adjectives appear declined/conjugated in text (воду, книги, читает, столе) but vocab stores the dictionary form. `ruInflects` matches a token to a vocab form when they share a stem (common prefix ≥ 3) and the leftover on each side is a real inflectional ending (`RU_INFLECTION` set) — so книги→книга, читает→читать, школу→школа, but derivations like столица→стол and домашний→дом are rejected (their suffix isn't inflectional).
- **Normalization** (`normalizeRussian`): lowercase + strip stress accents + ё→е, applied to both vocab and text, so sentence-initial capitals match (this replaced the old case-sensitive behavior the reader shipped with).
- Hard suppletive irregulars (люблю, идёт) fall through unmatched — the `ru` Intl.Segmenter still tokenizes them as whole tappable words (hear / sentence translation), never letter fragments.
- Only Russian routes through this path (`matcher.isRussian`); Chinese/Japanese matching is unchanged. Tests in `storyReading.test.js` (describe: "matchVocabAt — Russian whole-token + inflection").

## Writing practice fixes (PR #68, 2026-07-15)

`src/Writing.jsx` is the typing practice drill (Practice → words). Three fixes from user feedback; the pure matcher moved to `src/writingMatch.js` so Writing.jsx stays a components-only file (react-refresh):

- **Punctuation-tolerant answers**: `normalizeRomaji` now strips sentence punctuation, so a phrase stored as いただきます。 (romaji "itadakimasu.") matches a typed "Itadakimasu". Previously the trailing period made every phrase-card an automatic miss.
- **A miss no longer auto-adds to the SRS deck**: the old code silently did `cards.update({ is_easy:false, due_at:now })` on every miss. Removed — after a miss an explicit **"Add to due list"** button appears; the card is only un-mastered and made due when the learner presses it.
- **"I don't know" button**: reveals the answer without typing (counts as a miss for the practice multiplier, does not touch the SRS card).
- Tests: `src/writingMatch.test.js`.

## Recap next-step, chat scroll, unknown-word highlight (PR #70, 2026-07-15)

- **`SessionRecap.jsx`** — ends with a direct **"Recommended next"** CTA naming the single best action (read the just-unlocked story with today's words → use them in a chat → re-read), instead of a menu. "Back home" demotes to a secondary link when a recommendation exists.
- **`ChatMission.jsx`** — fixed the conversation not scrolling: the `flex:1` scroll areas in the fixed-height flex column lacked `min-height:0`, so they grew to fit content (flexbox `min-height:auto`) and the overflow was clipped by the shell. Added `min-height:0` to the chat/questions/reply/result scroll containers. **General rule for this codebase: any `flex:1` scroll area inside a `position:fixed`/fixed-height flex column needs `min-height:0`.**
- **`StoryReaderImmersive.jsx`** — new vocab (not_started) words now always get a light dotted underline so unknown words stand out even with the Learning Lens off; the Lens still upgrades to a full box and fades known words.

## Russian track status (2026-07-15)

- A1 is the only Russian level: `data/russian-a1.json` (147 words — function words, ~25 common verbs, family, food, places, time, numbers 1–10, adjectives). 6 pipeline-generated stories exist at `russian/russian/level 1` with covers.
- The reader matcher now handles Russian well (PR #69). The remaining "beyond this level's list" taps come from the existing stories using vocabulary **outside** the 147-word A1 pool. Two future paths: author new stories strictly in-pool (authored-stories.mjs is language-agnostic — insert `{language:'russian', system:'russian', level:1}`; a Russian validation block + `data/russian-a1` snapshot would enforce in-pool coverage the way `authoredStories.test.js` does for Japanese), or expand the A1 vocab to cover what the stories already use. **Not yet done.**
