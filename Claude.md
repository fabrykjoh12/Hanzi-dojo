# CLAUDE.md — Hanzi-dojo

Read this entire file before making any change. It describes not just *what* the project is, but *why* it exists and *how* it should feel. When a decision isn't covered here, choose the option that best serves the vision and learning philosophy below.

---

## 1. Project purpose and philosophy

Hanzi-dojo is a free language learning web app built around the two methods that actually work: **SRS flashcards** and **immersion** (reading and listening in the target language). It currently supports Chinese (HSK 3.0) and Japanese (JLPT).

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
- **Onboarding:** 3-step flow: language selection (side-by-side Chinese/Japanese cards) → level selection (grid of level buttons, Continue disabled until selection) → daily goal (5/10/15 new cards/day). Creates profiles row and language_tracks row.
- **FSRS flashcards:** Study screen with New/Learn/Due queue pills, 86px character display, furigana toggle for Japanese (ruby text), four grade buttons (Again/Hard/Good/Easy) with FSRS-previewed interval labels, audio autoplay on flip, example sentence on card back (sentence + reading/pinyin line + translation, with inline furigana on the target word for Japanese), word highlighted in accent color. **Recall mode** is a per-user preference (`profiles.recall_mode`): `flip` (reveal-then-grade) or `typed` (type the reading → checked against reading/pinyin/romaji via `checkTyped`, shows a correct/incorrect banner, then grade). **Audio autoplay** and **furigana default** are also prefs. Awards **account XP** per graded card (`src/xp.js` `xpForGrade`), persisted best-effort to `profiles.total_xp`.
- **Session recap:** End-of-session card (Study.jsx) showing cards studied / new learned / graduated to review / accuracy, a `+N XP` badge, and a next-day forecast (reviews + new waiting). Snapshotted to state at completion (`recap`), forecast loaded via `loadForecast()`.
- **Achievements (Profile):** A restrained "seal" grid (`src/achievements.js` + `Badge` in Profile.jsx) derived **live** from existing stats — no achievements table. Tiers across Consistency (streak), Vocabulary (lifetime learned), Mastery (lifetime FSRS-mastered), Progress (account level), and Dedication (distinct study days). Earned badges use the language accent; locked ones are greyed. Profile computes lifetime learned/mastered across all levels (not just the current one).
- **Story comprehension + new-words recap (story reader):** At the end of a story, a **"New words in this story"** card lists the not-yet-started vocab as chips with an **"Add N to deck"** bulk-insert button (updates `userCards` live). If `story_questions` exist for the story, a **"Check your understanding"** card shows English multiple-choice questions with immediate correct/incorrect feedback and a running score. Questions are loaded per `story.id`; the block is absent until content is generated.
- **Adaptive reading (story reader):** `StoryReaderImmersive.jsx` shows a **"% known"** coverage bar per story (unique in-story vocab split into known = review/mastered, learning, new — via `wordStatus`/`userCards`), plus a **"Known" toggle** that spotlights the learning frontier: new words get an accent underline + tint, learning words an amber underline, known words stay plain. Tapping any highlighted word still opens the add-to-deck sheet.
- **Flip animation + grade feedback:** Flashcard faces turn in on the Y axis (`hd-flip-in` keyframe, card has `perspective`); grading fires a per-grade colored ring pulse (`hd-grade-flash`, color via inline `--flash`). Reduced-motion users get a fade instead of rotation.
- **Listening quiz:** `src/Listen.jsx` (nav `Listening`, App view `listen`). Plays a word's audio and asks the user to pick the matching word from 4 same-level options; autoplay + replay, immediate correct/incorrect feedback with reading + meaning, progress bar, end recap with accuracy and XP earned (`+correct × 4` XP, persisted best-effort to `total_xp`). Pure practice — does not touch FSRS. Needs ≥4 audio-backed words at the level or it shows an empty state.
- **Weak-words drill:** Study.jsx with `mode="weak"` (App view `weak`) — a focused queue of the level's most-lapsed, not-yet-mastered cards (`lapses >= 2 && stability < 21`, top 30), regardless of due date. Entry point is a Home button shown when `counts.weakCount > 0`.
- **Level test:** 30 multiple-choice questions, mix of E→target and target→E. Unlocks at 90% mastery (FSRS stability ≥ 21 days). 100% required to pass. 3 attempts per day, tracked via `test_attempts` table with `attempt_date` column. Wrong answers apply FSRS Again grade. Passing inserts a `level_unlocks` row and advances `language_tracks.current_level`. "End quiz" button ends active quiz early (unanswered = wrong). Japanese options show reading below the word.
- **Stories:** 3 tiers (First Steps / Growing / Fluent), unlocked by learnedCount, separate category lists per language (CATEGORIES_CHINESE / CATEGORIES_JAPANESE). Category list → story list → reader. Reader is an interactive dialogue layout: StoryLine renders each line with a per-speaker color avatar and a per-line "play" button (Web Speech API TTS); clicking a word opens a VocabularyPopup (furigana on kanji, status badge, "Add to deck" for unstarted words). CharacterGuide shows named characters with reading pills (Chinese only — CHARACTER_READINGS.japanese is empty). Sticky sidebar has StoryProgressCard and ReviewWordsCard (responsive: moves below the story on screens <860px). End-of-story StoryCompletionCard links to the next story. Vocabulary for word-clickability is loaded across all levels (not just the current level), so every word in a story is underlined. A translation toggle swaps the interactive reader for an English prose view (EnglishStoryLine) using the `english_content` column — only shown when populated.
- **Writing practice:** Active recall for words already studied in flashcards. Round sizes 10/15/20/30. Three modes: Mixed / English→target / target→English. Accepts: hanzi, pinyin (tone-insensitive), hiragana, kanji, romaji (via wanakana) for Japanese. XP system (0–100 XP per word, Lv 1–5), correct-streak multiplier (up to 3×). Stats screen shows best/weakest words. Wrong answers set `is_easy = false` and make the card due immediately.
- **YouTube recommendations:** Grid of video cards with thumbnails (from YouTube API URL pattern), channel name, notes. Loads for current language/system/level.
- **Profile:** Stats (streak, freezes, learned count, mastered count + mastery % progress bar), daily goal editor (5/10/15 options), last-studied date, reset progress button (two-step confirm → calls RPC), sign out.
- **Language switcher:** Shows both languages with track progress. Active language has level-replay grid (click any level to jump back). Not-started languages show dashed "Start" card → level picker → creates track. Level replay and language switch both call `profiles.update({ active_language })`.
- **Settings:** Functional preferences page (`profiles` columns). Controls: theme (light/dark), flashcard recall mode (flip/typed), audio-on-flip toggle, and Japanese furigana default toggle. Persists best-effort and updates the in-memory profile live (App passes `session` + `onUpdate`). Daily goal and reset still live in Profile.
- **Home extras:** A daily new-card **goal ring** (`newDoneToday`/`daily_new_cards`, with complete state), an account **Lv N** pill (`levelInfo` from `src/xp.js`), a **reviews-waiting-tomorrow** line (`counts.dueTomorrow`), and a **weak-word cleanup** button (`counts.weakCount`).
- **Sidebar:** Persistent left nav. Main items: Home, Flashcards, Test, Writing, Stories, YouTube. Bottom items: Profile, Settings, Language, Log out. Collapses to 64px icon-only rail with hover tooltips; expanded width 232px. Active item uses sage green pill (#E7EDE4 bg, #4F6047 text). Semi-transparent frosted glass (rgba(255,255,255,0.85) + blur(6px)).
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
| react-router-dom | 7.x (not currently used for routing — App.jsx uses view state) |
| Supabase JS | ^2.107 |
| ts-fsrs | ^5.4.1 — FSRS v5 scheduling |
| wanakana | ^5.3.1 — Japanese romaji conversion in Writing.jsx |
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
  3-step flow: language → level → daily goal. Creates profiles and
  language_tracks rows on finish. Continue button disabled until selection made.

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
  Language management. Shows both languages (Chinese + Japanese). Active language
  shows level-replay grid. Not-started shows dashed "Start" card. Supports
  switching active language, replaying a level, starting a new language.

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
  Fixed full-page background image at opacity 0.4. Crossfades between
  bg-chinese.png and bg-japanese.png on language change (500ms fade).
  z-index 0, pointer-events none, aria-hidden.

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
  getLevelLabel(language, system, level) — returns 'HSK N' or 'N5 · Part 1' etc.
  getSystemLabel(system) — 'HSK 3.0' or 'JLPT'. getLevelRange(language, system).
  getNextLevel(language, system, level). normalizeRecallInput(value) — strips
  punctuation/spaces/CJK punctuation for recall matching. isRecallMatch().

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
  active_language text          -- 'chinese' | 'japanese'
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
  language text                 -- 'chinese' | 'japanese'
  system text                   -- 'hsk_3' | 'jlpt'
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

**Japanese JLPT:**
- Level 1 (N5 Part 1): 400 words with audio at `japanese/jlpt/level_1/`
- Level 2 (N5 Part 2): 402 words with audio at `japanese/jlpt/level_2/`
- Audio voice: `ja-JP-Neural2-B`, languageCode `ja-JP`, TTS input = `v.reading` (hiragana — never v.word)
- Example sentences: 798/800 words populated (run `generate-examples.mjs --japanese` to fill the remaining 2)
- 15 stories published across 3 tiers (5 / 5 / 5) for level 1, all with `english_content` translations.
  Generated by `generate-stories.mjs` across 15 distinct scenes (park, supermarket, station, etc.) with
  characters たかし/はな/おかあさん/みせのひと
- No YouTube recommendations yet

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
Success:          #2F9E6D
Warning:          #D97706
Error:            #DC2626
Sage (nav active bg):   #E7EDE4
Sage (nav active text): #4F6047
Sage (CTA button):      #6E8466
Sage dark (CTA hover):  #5C7155
```

**CSS variables** (defined in index.css):
`--chinese-accent: #B83A24`, `--chinese-accent-dark: #922E1C`, `--japanese-accent: #2E3A6E`, `--japanese-accent-dark: #1E2750`

**Theming (light/dark) — use these tokens for all neutral colors:**
Semantic tokens in index.css drive light/dark via `:root` and `:root[data-theme="dark"]`:
`--bg`, `--surface`, `--surface-2`, `--surface-glass`, `--border`, `--text`, `--text-muted`, `--text-faint`, `--reader-watermark`.
- **New code MUST use these tokens** (e.g. `background: 'var(--surface)'`, `color: 'var(--text)'`) instead of hardcoded neutral hexes, or it won't theme.
- Accent colors (chinese/japanese), status colors (success/warn/error), sage nav colors, and **white text on accent buttons** (`color: '#fff'`) stay hardcoded — they read on both themes.
- Fixed dark popovers/tooltips (e.g. Sidebar collapsed tooltip) use a literal dark (`#27272A`), not `var(--text)`, so they don't invert.
- Known minor: the Home New/Learning/Due tiles and streak pill use pale pastel accent-tint backgrounds that stay light in dark mode (look like colored chips; acceptable, could be refined).

**Fonts:** Inter (UI), Noto Sans SC (Chinese), Noto Sans JP (Japanese) — loaded from Google Fonts in index.css.

**Card interaction:** `translateY(-2px)`, stronger shadow, accent border on hover, ~180ms transition.

**Per-language accent:** The whole UI shifts accent color when the active language changes. Components derive `accentHex` from `profile.active_language`.

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
                Required: SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_TTS_KEY, GROQ_API_KEY
```

### generate-audio.mjs

Script for generating TTS audio and uploading to Supabase storage. Not in app bundle.

**Run with:**
```bash
node --env-file=.env.script generate-audio.mjs
```

**Current state:** Hardcoded for Japanese JLPT (queries `language='japanese'`, `system='jlpt'`). Iterates all JLPT vocabulary, calls Google TTS with `v.reading` (hiragana) as input, uploads MP3 to the path stored in `v.audio_path`.

**Voice config:**
- Japanese: `languageCode: 'ja-JP'`, `name: 'ja-JP-Neural2-B'`, input = `v.reading` (hiragana — NEVER `v.word`)
- Chinese (to reconfigure): `languageCode: 'cmn-CN'`, `name: 'cmn-CN-Chirp3-HD-Aoede'`, input = `v.word`

To regenerate without skipping existing files: delete the storage folder in Supabase first, then run the script (`upsert: true` is set but storage skips existing paths by default in some configurations).

### generate-examples.mjs

Script for generating AI example sentences and uploading to Supabase vocabulary rows. Not in app bundle. Uses Groq (`llama-3.3-70b-versatile` via `openai` SDK pointed at `https://api.groq.com/openai/v1`).

**Run with:**
```bash
node --env-file=.env.script generate-examples.mjs --japanese          # fill missing (Japanese)
node --env-file=.env.script generate-examples.mjs --japanese --regen  # REGENERATE all (replace bad ones)
node --env-file=.env.script generate-examples.mjs --chinese           # Chinese
node --env-file=.env.script generate-examples.mjs                     # both, fill missing
```

**Behavior:** Batches vocab (10/batch), calls Groq **`llama-3.3-70b-versatile`** with a quality-focused prompt (meaningful sentences, realistic human subjects, counter/suffix handling, few-shot good/bad examples), then updates `example_sentence`/`example_reading`/`example_translation`. By default only fills `example_sentence IS NULL`; **`--regen`** regenerates ALL active words to replace low-quality sentences. Retries with backoff on rate limits.

The prompt explicitly **bans tautologies / math identities** — sentences whose only point is to restate the word's meaning (e.g. 半 → "one yuan is twice half a yuan"). It carries a 半 good-example (现在八点半 — "it's half past eight") and that exact math sentence as a labeled bad-example, alongside the Japanese 今日は12さい bad-example.

**Output per word:**
- `example_sentence` — target-language sentence containing the word (Chinese: ≤10 chars; Japanese: ≤15 chars)
- `example_reading` — full sentence in phonetic form (pinyin with tones for Chinese; hiragana for Japanese)
- `example_translation` — natural English translation

### generate-meanings.mjs

Regenerates the vocabulary `meaning` column with concise, accurate English glosses via `llama-3.3-70b-versatile` (fixes wrong/messy meanings). `--chinese`/`--japanese`; `--dry-run` prints before→after without writing. Rewrites ALL active words.

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

- **Inputs:** `task` (meanings / examples / both / **comprehension** / **clean-meanings**) and `language` (both / japanese / chinese). For examples it always runs with `--regen` (replaces existing sentences, not just NULLs). `comprehension` runs `generate-comprehension.mjs` (fills stories with no questions). `clean-meanings` runs `clean-meanings.mjs --apply` (deterministic, no AI).
- **Secrets used:** `VITE_SUPABASE_URL` (mapped to `SUPABASE_URL`), `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY` — the same Actions repository secrets as the deploy workflow, plus the service key.
- **Node 22 is required** (`setup-node` pins `node-version: 22`). `@supabase/supabase-js` v2 needs a **global `WebSocket`** at `createClient` time (RealtimeClient init); Node 20 has none and `createClient` throws immediately. Do not drop below 22.
- **Concurrency** is serialized (`group: regen-content`, no cancel) so two runs can't fight over the same rows. `timeout-minutes: 180`.
- A full Chinese-examples pass (300 words, 30 batches) takes ~4–5 min. If Groq's free-tier **daily token cap** is hit mid-run, batches start failing near the end — just re-run the workflow the next day; it re-fills whatever is still bad.

### generate-stories.mjs

Generates new Japanese JLPT N5 (level 1) stories via Groq (`llama-3.3-70b-versatile`) and inserts them into the `stories` table. Not in app bundle.

**Run with:**
```bash
node --env-file=.env.script generate-stories.mjs            # append new stories
node --env-file=.env.script generate-stories.mjs --replace  # delete existing level-1 JP stories first, then regenerate
```

**Behavior:** For each of 3 tiers (First Steps / Growing / Fluent, vocab pools sort_order ≤100/≤200/≤400), generates 5 stories using one of 15 distinct scenes (park, supermarket, station, restaurant, etc.) so stories don't default to a school setting. Characters are restricted to たかし/はな/おかあさん/みせのひと, written in hiragana. Each story includes `content` and a line-aligned `english_content` translation. Inserts with `is_published: true` and incrementing `story_number`.

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

**In progress:**
- **Apply migration `20260630000000_add_xp_and_prefs.sql`** in the Supabase SQL Editor to enable persistence of account XP and study prefs (`total_xp`, `recall_mode`, `audio_autoplay`, `furigana_default`). The app is defensive — it runs without it (defaults applied in code), but XP/prefs won't save across reloads until the columns exist.
- **Apply migration `20260630010000_add_story_questions.sql`**, then generate questions (Action `task=comprehension`, or `node --env-file=.env.script generate-comprehension.mjs`). The end-of-story comprehension card only appears once questions exist; the "new words" recap works without it.
- **Japanese example sentences (N5 Part 1 + Part 2):** 798/800 words populated. Run `node --env-file=.env.script generate-examples.mjs --japanese` to fill the remaining 2.

**Missing content:**
- **Japanese YouTube recommendations:** None published. Chinese HSK 1 has 3.
- **HSK 2 vocabulary:** Not seeded. HSK 1 is complete.
- **HSK 3–9 and JLPT N4–N1:** No vocabulary seeded. Level selection exists but shows empty study queues.

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
- **Duplicate kanji in Japanese vocab** (何 = なん/なに, 私 = わたし/わたくし) create identical-looking test options. Plan: deactivate less-common duplicates and/or show reading in test options (reading is already shown in Test.jsx Japanese options).
- **A few JLPT N5 level-2 entries are counter suffixes** (～グラム, ～たち) — more grammar than vocab. Review and optionally deactivate.
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
4. **Offline support:** Service worker (post-launch).
5. **Spanish:** Third language after Chinese and Japanese content is solid.

(Practice mode is intentionally *not* on the roadmap — Writing.jsx already serves as the low-stakes practice/active-recall page.)

---

## 18. Verification and GitHub workflow

Before committing:
```bash
npm run build
```

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

### PWA / installable
- `public/manifest.webmanifest` + icons (`icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`) make the app installable ("Add to Home Screen", standalone display). Icons were generated from `src/assets/Hanzi-logo.png` (the vermillion enso) composited onto white.
- `index.html` references the manifest/icons via Vite's `%BASE_URL%` so paths are correct on both hosts. This also fixed the old absolute `/favicon.svg` that 404'd on the GitHub Pages subpath. The manifest's internal paths (`start_url`, icon `src`) are **relative**, so they resolve under either base.
- To regenerate icons: `npm install --no-save sharp`, then a short sharp script compositing the logo onto a white background at 192/512/180. (Note: the browser-tab favicon is still the separate purple mark in `public/favicon.svg` — replace it with an enso-derived icon if full brand consistency is wanted.)

### Secrets / keys
- The `VITE_SUPABASE_ANON_KEY` is **public by design** (it ships in the client bundle); data is protected by RLS, not by hiding the key. Never put the Supabase **service key** in any `VITE_` var or frontend code — it belongs only in `.env.script` for the content scripts.
