# CLAUDE.md — Hanzi-dojo

Read this entire file before making any change. It describes not just *what* the project is, but *why* it exists and *how* it should feel. When a decision isn't covered here, choose the option that best serves the vision and learning philosophy below.

---

## 0. LATEST SESSION — read first (2026-07-02)

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
- **Existing ESLint hook-dependency warnings** in some files — don't add new ones.
- **Legacy DB columns** `ease_factor` and old SM-2 `learning_step` semantics are kept in the cards table but unused. Do not write to `ease_factor`.

---

## 17. Roadmap

**Status:** The app is now **live** on GitHub Pages + Vercel (section 19), so real users can reach it. That raises the priority of mobile layout and content breadth.

Done:
- ~~**Fix example_reading column reference in Study.jsx**~~
- ~~**Japanese example sentences**~~ (798/800 words; 2 stragglers remain).
- ~~**Japanese stories**~~ — 15 stories across 3 tiers for JLPT N5 level 1, with English translations.
- ~~**Deploy to the web**~~ — GitHub Pages + Vercel, auto-deploy from `main`, graceful missing-config screen, OAuth redirect handling.
- ~~**Mobile navigation**~~ — bottom tab bar (MobileNav.jsx) replaces the sidebar below 768px.
- ~~**Mobile per-screen padding**~~ — every top-level screen tightens horizontal padding on mobile via useIsMobile().
- ~~**Furigana on Japanese flashcard main word**~~ — showFurigana defaults true; showRuby shows the reading above kanji on front (by default) and back. Furigana is okurigana-aware (Study.jsx `furiganaParts`): the reading sits only over the kanji core, with leading/trailing kana left bare, and pure hiragana/katakana words (incl. katakana loanwords) get no furigana at all. Applies to both the big card word and the example-sentence target word.
- ~~**LanguageSwitcher mastery count**~~ — progress display now uses mastery (FSRS stability) instead of the old `is_easy` count, consistent with the rest of the app.
- ~~**Installable PWA**~~ — web manifest + icons, real page title/description, theme-color, and social-share (og) tags; fixed the favicon 404 on the Pages subpath (section 19).

Priority order (most impactful first):

1. **Japanese YouTube recommendations:** At least a few curated videos for JLPT N5. *(content task — needs video URLs)*
2. **HSK 2 vocabulary + audio + stories:** Next Chinese level content. *(content task — needs vocab data + API keys)*
3. **FSRS parameter tuning:** Once real user data exists, optimize parameters beyond library defaults.
4. ~~**Offline support:** Service worker~~ — done (`public/sw.js`, runtime caching). Follow-up: offline grading via a background-sync queue.
5. **Russian (CEFR):** Added as the third language — frontend + DB migration + A1 starter deck are in place; **seed + generate content** to make it live (see Known issues → Russian). The language-agnostic `src/languageTheme.js` refactor makes further languages (Spanish, …) mostly data + content.

(Practice mode is intentionally *not* on the roadmap — Writing.jsx already serves as the low-stakes practice/active-recall page.)

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
- **Env vars:** set per-environment under Settings → Environments → Production: the same three `VITE_` vars. Vercel bakes them in at build time and only applies them to **new** builds — after adding/changing, redeploy (Deployments → ⋯ → Redeploy, uncheck build cache).

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
