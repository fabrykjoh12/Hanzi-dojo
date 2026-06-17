# CLAUDE.md — Hanzi-dojo

Read this entire file before making any change. It describes not just *what* the project is, but *why* it exists and *how* it should feel. When a decision isn't covered here, choose the option that best serves the vision and learning philosophy below.

> **⚠️ ALWAYS KEEP THIS FILE UP TO DATE.** Claude **must** update CLAUDE.md after **every** change and at the end of **every** conversation. Whenever you add or change a feature, fix a known issue, alter the database schema, add content, or make any other meaningful change, update the relevant sections here in the **same** session — before you finish. Treat an out-of-date CLAUDE.md as a bug. Specifically: move resolved items out of "Known issues" (§16) and "Roadmap" (§17), update "Current state" (§2) and the file descriptions (§4), and reflect schema changes in §5. This is mandatory, not optional.

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
- **FSRS flashcards:** Study screen with New/Learn/Due queue pills, 86px character display, furigana toggle for Japanese (ruby text), four grade buttons (Again/Hard/Good/Easy) with FSRS-previewed interval labels, audio autoplay on flip, example sentence on card back (sentence + reading/pinyin line + translation, with inline furigana on the target word for Japanese), word highlighted in accent color.
- **Level test:** 30 multiple-choice questions, mix of E→target and target→E. Unlocks at 90% mastery (FSRS stability ≥ 21 days). 100% required to pass. 3 attempts per day, tracked via `test_attempts` table with `attempt_date` column. Wrong answers apply FSRS Again grade. Passing inserts a `level_unlocks` row and advances `language_tracks.current_level`. "End quiz" button ends active quiz early (unanswered = wrong). Japanese options show reading below the word.
- **Stories:** 3 tiers (First Steps / Growing / Fluent), unlocked by learnedCount, separate category lists per language (CATEGORIES_CHINESE / CATEGORIES_JAPANESE). Category list → story list → reader. Reader is an interactive dialogue layout: StoryLine renders each line with a per-speaker color avatar and a per-line "play" button (Web Speech API TTS); clicking a word opens a VocabularyPopup (furigana on kanji, status badge, "Add to deck" for unstarted words). CharacterGuide shows named characters with reading pills (Chinese only — CHARACTER_READINGS.japanese is empty). Sticky sidebar has StoryProgressCard and ReviewWordsCard (responsive: moves below the story on screens <860px). End-of-story StoryCompletionCard links to the next story. Vocabulary for word-clickability is loaded across all levels (not just the current level), so every word in a story is underlined. A translation toggle swaps the interactive reader for an English prose view (EnglishStoryLine) using the `english_content` column — only shown when populated.
- **Writing practice:** Active recall for words already studied in flashcards. Round sizes 10/15/20/30. Three modes: Mixed / English→target / target→English. Accepts: hanzi, pinyin (tone-insensitive), hiragana, kanji, romaji (via wanakana) for Japanese. XP system (0–100 XP per word, Lv 1–5), correct-streak multiplier (up to 3×). Stats screen shows best/weakest words. Wrong answers set `is_easy = false` and make the card due immediately.
- **YouTube recommendations:** Grid of video cards with thumbnails (from YouTube API URL pattern), channel name, notes. Loads for current language/system/level.
- **Profile:** Stats (streak, freezes, learned count, mastered count + mastery % progress bar), daily goal editor (5/10/15 options), last-studied date, reset progress button (two-step confirm → calls RPC), sign out.
- **Language switcher:** Shows both languages with track progress. Active language has level-replay grid (click any level to jump back). Not-started languages show dashed "Start" card → level picker → creates track. Level replay and language switch both call `profiles.update({ active_language })`.
- **Settings:** Functional preferences page. **Appearance:** "Furigana on Japanese cards" toggle — a device-local default (localStorage via `src/prefs.js`) that seeds the per-session furigana state in Study.jsx. **Account:** edit display name (writes `profiles.display_name`, propagates via `onUpdate`), read-only email, and change password (`supabase.auth.updateUser`). **Reminders:** honest "not available yet" note (no fake controls). Sign out at the bottom. Daily goal and reset still live in Profile.
- **Sidebar:** Persistent left nav. Main items: Home, Flashcards, Test, Writing, Stories, YouTube. Bottom items: Profile, Settings, Language, Log out. Collapses to 64px icon-only rail with hover tooltips; expanded width 232px. Active item uses sage green pill (#E7EDE4 bg, #4F6047 text). Semi-transparent frosted glass (rgba(255,255,255,0.85) + blur(6px)). **Mobile (≤768px):** the rail is replaced by a fixed frosted bottom navigation bar with four primary destinations (Home, Flashcards, Stories, Writing) plus a "More" button that opens a slide-up sheet for Test, YouTube, Profile, Settings, Language, Log out. Breakpoint via `useIsMobile()` hook; content area gets bottom padding (incl. iOS `env(safe-area-inset-bottom)`, with `viewport-fit=cover` in index.html).
- **Themed backgrounds:** Background.jsx — fixed full-page image at opacity 0.4, crossfades between bg-chinese.png and bg-japanese.png on language change, z-index 0 behind everything.
- **Mastery system:** Two tiers — "learned" (card has ever reached review/relearning state, `learned` column = true) and "mastered" (FSRS stability ≥ 21 days). Constants in src/mastery.js.
- **Streak system:** Updates on first grade of the day. Gap of 1 day = streak increment. Gap > 1 day = uses a freeze if available, else resets to 1. Streak freezes given back on progress reset.
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
  No form tag — submit via button onClick.

src/Onboarding.jsx
  3-step flow: language → level → daily goal. Creates profiles and
  language_tracks rows on finish. Continue button disabled until selection made.

src/Study.jsx
  Flashcard session. Builds a queue (due-learning first, then new up to daily
  limit, then due-review). Flip card to reveal reading, meaning, and example
  sentence. Four FSRS grade buttons (Again/Hard/Good/Easy) with interval
  previews. Audio autoplay on flip. Furigana toggle for Japanese (ruby element),
  initialised from the device-local default in prefs.js (set in Settings);
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

src/Home.jsx
  Dashboard. Language identity header (native script + level + streak pill).
  Today card with New/Learning/Due counts and mastery progress bar + InfoTip.
  "Start studying" sage green CTA. "Keep the flow going" row of feature shortcuts.

src/YouTube.jsx
  Curated video grid for current language/system/level. Loads from
  youtube_recommendations table. Thumbnail from YouTube video ID. Opens in new tab.

src/LanguageSwitcher.jsx
  Language management. Shows both languages (Chinese + Japanese). Active language
  shows level-replay grid. Not-started shows dashed "Start" card. Supports
  switching active language, replaying a level, starting a new language.
  Progress (per-level bar + grid sub-labels) is mastery-based (isMastered /
  card stability), consistent with Home and Profile — not the legacy is_easy count.

src/Sidebar.jsx
  Persistent left navigation. Collapses to 64px icon-only rail with hover tooltips.
  Expanded at 232px. Active state: sage green pill (#E7EDE4 bg, #4F6047 text).
  Semi-transparent frosted glass (rgba(255,255,255,0.85) + blur). On mobile
  (useIsMobile, ≤768px) renders MobileNav instead: a fixed bottom bar (Home,
  Flashcards, Stories, Writing + More) where "More" opens a slide-up sheet with
  the remaining destinations. MOBILE_BAR_KEYS / MOBILE_MORE_KEYS control the split.

src/useIsMobile.js
  Responsive hook. Exports MOBILE_BREAKPOINT (768) and a default useIsMobile()
  that returns true at ≤768px via matchMedia + useSyncExternalStore (no
  setState-in-effect). Used by App.jsx (content bottom padding) and Sidebar.jsx.

src/Background.jsx
  Fixed full-page background image at opacity 0.4. Crossfades between
  bg-chinese.png and bg-japanese.png on language change (500ms fade).
  z-index 0, pointer-events none, aria-hidden.

src/Settings.jsx
  Functional settings page. Appearance: furigana-default toggle (device-local via
  prefs.js). Account: display-name edit (profiles.display_name + onUpdate),
  read-only email, change password (supabase.auth.updateUser). Reminders: honest
  "not available yet" note. Sign out. Receives session + onUpdate from App.jsx.
  Self-contained Section/Row/Toggle/Input/Button helpers. Daily goal + reset
  still live in Profile.

src/prefs.js
  Device-local UI preferences in localStorage (defensive try/catch — never throws
  on disabled storage). getFuriganaDefault()/setFuriganaDefault(bool). Shared by
  Settings.jsx (the control) and Study.jsx (initial furigana state).

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
  updateStreak(profile) — increments streak on first study of the day, uses a
  freeze if gap > 1 day, resets to 1 if no freeze available. Persists to profiles.

src/utils.js
  getLevelLabel(language, system, level) — returns 'HSK N' or 'N5 · Part 1' etc.
  getSystemLabel(system) — 'HSK 3.0' or 'JLPT'. getLevelRange(language, system).
  getNextLevel(language, system, level). normalizeRecallInput(value) — strips
  punctuation/spaces/CJK punctuation for recall matching. isRecallMatch().

src/supabase.js
  Exports the Supabase client created from VITE_SUPABASE_URL and
  VITE_SUPABASE_ANON_KEY environment variables.

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
  user_id uuid
  date date
  cards_reviewed int
  new_cards_introduced int

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
- Example sentences on all 300 words (example_sentence, example_reading, example_translation columns)
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

Script for generating AI example sentences and uploading to Supabase vocabulary rows. Not in app bundle. Uses Groq (`llama-3.1-8b-instant` via `openai` SDK pointed at `https://api.groq.com/openai/v1`).

**Run with:**
```bash
node --env-file=.env.script generate-examples.mjs --japanese   # Japanese only
node --env-file=.env.script generate-examples.mjs --chinese    # Chinese only
node --env-file=.env.script generate-examples.mjs              # Both
```

**Behavior:** Queries all vocabulary rows where `example_sentence IS NULL`, batches in groups of 20, calls Groq with a language-appropriate prompt, then updates `example_sentence`, `example_reading`, and `example_translation` columns. Safe to re-run — skips words already populated. Retries with backoff on rate limits.

**Output per word:**
- `example_sentence` — target-language sentence containing the word (Chinese: ≤10 chars; Japanese: ≤15 chars)
- `example_reading` — full sentence in phonetic form (pinyin with tones for Chinese; hiragana for Japanese)
- `example_translation` — natural English translation

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
- **Japanese example sentences (N5 Part 1 + Part 2):** 798/800 words populated. Run `node --env-file=.env.script generate-examples.mjs --japanese` to fill the remaining 2.

**Missing content:**
- **Japanese YouTube recommendations:** None published. Chinese HSK 1 has 3.
- **HSK 2 vocabulary:** Not seeded. HSK 1 is complete.
- **HSK 3–9 and JLPT N4–N1:** No vocabulary seeded. Level selection exists but shows empty study queues.

**Technical debt:**
- **Some Japanese audio mispronounces kanji.** Fix: generate-audio.mjs already uses `v.reading` (hiragana). Delete the storage folder for the level before regenerating so files are not skipped.
- **Duplicate kanji in Japanese vocab** (何 = なん/なに, 私 = わたし/わたくし) create identical-looking test options. Plan: deactivate less-common duplicates and/or show reading in test options (reading is already shown in Test.jsx Japanese options).
- **A few JLPT N5 level-2 entries are counter suffixes** (～グラム, ～たち) — more grammar than vocab. Review and optionally deactivate.
- **Existing ESLint hook-dependency warnings** in some files — don't add new ones.
- **Legacy DB columns** `ease_factor` and old SM-2 `learning_step` semantics are kept in the cards table but unused. Do not write to `ease_factor`.

---

## 17. Roadmap

Priority order (most impactful first):

1. ~~**Fix example_reading column reference in Study.jsx**~~ — **Done.**
2. ~~**Japanese example sentences**~~ — **Done** (798/800 words; 2 stragglers remain).
3. ~~**Japanese stories**~~ — **Done.** 15 stories across 3 tiers for JLPT N5 level 1, with English translations.
4. **Japanese YouTube recommendations:** At least a few curated videos for JLPT N5.
5. **HSK 2 vocabulary + audio + stories:** Next Chinese level content.
6. **Furigana on Japanese flashcard main word:** Show reading above kanji as ruby text by default (furigana toggle already exists for Study.jsx — add it to card back when word has kanji).
7. ~~**Mobile layout:** Sidebar → bottom navigation bar at ~768px breakpoint.~~ — **Done.** Fixed bottom bar (Home/Flashcards/Stories/Writing + More sheet) below 768px via `useIsMobile`.
8. **FSRS parameter tuning:** Once real user data exists, optimize parameters beyond library defaults.
9. **Practice test mode:** Unlimited questions, no progression impact, no card state changes.
10. **Offline support:** Service worker (post-launch).
11. **Spanish:** Third language after Chinese and Japanese content is solid.

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

Use `/ship` skill to automate this. Commit before and after every meaningful session.

**Updating CLAUDE.md is mandatory (see the rule at the top of this file).** After every change and at the end of every conversation, update CLAUDE.md so it always reflects the current state of the project:
- Add or revise the relevant entry in §2 (Current state) and §4 (source-file descriptions) when behaviour changes.
- Move finished items out of §16 (Known issues) and §17 (Roadmap); add any new issues you discover.
- Update §5 (Database schema) for any schema change and §7 (Content seeded) for new content.
- Do this in the same session as the change — never leave CLAUDE.md stale. Treat an out-of-date CLAUDE.md as a bug.
