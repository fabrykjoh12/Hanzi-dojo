# Architecture reference

Deep reference for the database schema, the level/mastery/SRS systems, the
design system, and the content-generation pipeline. **Read
[`CLAUDE.md`](../CLAUDE.md) first** — it holds the rules and the short version.
This file is what you open when you need the detail.

Companion docs: [`docs/DEPLOY.md`](DEPLOY.md) (hosting + env) ·
[`docs/CHANGELOG.md`](CHANGELOG.md) (session history).

---

## Database schema

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

-- Dojo HQ (internal collaboration board at /hq, admin-only).
-- Migration: 20260727140000_add_dojo_hq.sql. NOT learner data: every policy on
-- these three tables requires profiles.is_admin, so a regular learner can
-- neither read nor write a row. One shared board — there is no workspace or
-- invite system; workspace_id is a constant ('admin-hq') kept as a column so the
-- UI's queries and realtime filters have something to key on.

dojo_items
  id uuid PRIMARY KEY
  workspace_id text                 -- always 'admin-hq' today
  created_by uuid REFERENCES auth.users
  assigned_to uuid REFERENCES auth.users
  title text
  description text
  item_type text CHECK IN ('idea','plan','implement','test','fix','bug')
  status text CHECK IN ('inbox','planned','progress','review','done')
  priority text CHECK IN ('low','medium','high','urgent')
  tags text[]
  due_date date
  milestone_id uuid                 -- HQ2 control room (worker-side), no FK here
  depends_on uuid[]                 -- other dojo_items ids
  github_branch text
  github_pr_url text
  ci_status text CHECK IN ('none','pending','passing','failing')
  blocked_reason text
  created_at timestamptz
  updated_at timestamptz            -- maintained by trigger; the board sorts on it

dojo_comments
  id uuid PRIMARY KEY
  workspace_id text
  item_id uuid REFERENCES dojo_items ON DELETE CASCADE
  author_id uuid REFERENCES auth.users   -- insert policy requires author_id = auth.uid()
  body text
  created_at timestamptz

dojo_attachments
  id uuid PRIMARY KEY
  workspace_id text
  item_id uuid REFERENCES dojo_items ON DELETE CASCADE
  created_by uuid REFERENCES auth.users
  storage_path text                 -- private 'dojo-attachments' bucket
  file_name text
  mime_type text
  size_bytes bigint
  created_at timestamptz
```

**Supabase RPC:**
```
reset_current_language_progress(p_language, p_system, p_reset_streak=true)
  Deletes cards, review_logs, writing_stats, test_attempts, level_unlocks for the
  language. If p_reset_streak=true, also deletes daily_activity and resets
  profiles.streak=0, streak_freezes=1, last_studied_on=null. Security definer,
  callable only by authenticated users on their own data.

dojo_hq_members()
  Returns (user_id, display_name, role) for every account with is_admin. Security
  definer so Dojo HQ can name and assign work to the other admin WITHOUT a broad
  SELECT policy on profiles; raises for non-admins via assert_admin(). Falls back
  to the local part of the email (never the full address) when an admin has no
  display_name. Consumed by src/dojoSupabaseClient.js, which fakes the board's
  `dojo_workspace_members` query from it.
```


---

## Language and level system

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

## Content seeded

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

## Mastery system

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

## SRS / FSRS (`src/srs.js`)

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

## Design system

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
Sage (CTA button):      #6E8466
Sage dark (CTA hover):  #5C7155
Sage ink (Home "Due"):  #4F6047
Amber ink (Home "Learning"): #C2803B
```

**Nav active state is the LANGUAGE ACCENT, not sage** (changed in the Home/nav
polish pass). Sidebar + MobileNav take a `language` prop from `App.jsx` and
derive the accent from `languageTheme()`, so the whole shell shifts colour with
the active track. A single sliding ink bar marks the active row (Sidebar rows
are a fixed `ROW_HEIGHT`/`ROW_GAP` so the bar positions from an index — no
measurement). The retired flat sage pill (`#E7EDE4`/`#4F6047`) is gone.

**CSS variables** (defined in index.css):
`--chinese-accent: #B83A24`, `--chinese-accent-dark: #922E1C`, `--japanese-accent: #2E3A6E`, `--japanese-accent-dark: #1E2750`, `--russian-accent: #2563C9`, `--russian-accent-dark: #1D4EA0`

**Theming (light/dark) — use these tokens for all neutral colors:**
Semantic tokens in index.css drive light/dark via `:root` and `:root[data-theme="dark"]`:
`--bg`, `--surface`, `--surface-2`, `--surface-glass`, `--border`, `--text`, `--text-muted`, `--text-faint`, `--reader-watermark`.
- **New code MUST use these tokens** (e.g. `background: 'var(--surface)'`, `color: 'var(--text)'`) instead of hardcoded neutral hexes, or it won't theme.
- Accent colors (chinese/japanese), status colors (success/warn/error), sage nav colors, and **white text on accent buttons** (`color: '#fff'`) stay hardcoded — they read on both themes.
- Fixed dark popovers/tooltips (e.g. Sidebar collapsed tooltip) use a literal dark (`#27272A`), not `var(--text)`, so they don't invert.
- **Tints must mix into the themed surface**, not float on it: use
  `color-mix(in srgb, <accent> 11%, var(--surface))` rather than an `<accent>+'14'`
  alpha hex, or the chip stays light in dark mode. (This was the long-standing
  "pale pastel chips" known-minor; fixed in the Home/nav polish pass.)
- **Accent as ink** — the accent hexes are tuned for white paper and sink into a
  dark surface. `ink(hex)` in `languageTheme.js` wraps a colour in
  `color-mix(in srgb, hex, var(--ink-lift) var(--ink-lift-pct))`: a no-op in
  light, a 30% lift toward white in dark. Use it wherever an accent is TEXT or a
  drawn mark; keep the raw hex for tints/borders that already mix into a surface.
- **Elevation tokens** — `--shadow-1` (resting) / `--shadow-2` (hover) are
  two-layer (tight contact + wide cast) and flip to near-black on dark;
  `--hairline` is the lit top edge, applied as `inset 0 1px 0 var(--hairline)`.
  Prefer these over one-off `box-shadow` values.

**Fonts:** Inter (UI), Noto Sans SC (Chinese), Noto Sans JP (Japanese) — loaded from Google Fonts in index.css. **Russian uses Inter**, which already ships full Cyrillic coverage, so no extra web font is needed.

**The "one lit panel" design language** (`src/designTokens.js` + `src/panels.jsx`):
- A screen gets **exactly one** `HeroPanel` — the thing it is actually about — on a deep ground made by darkening the *language accent* (`heroGround`), never a fixed colour. Everything else on that screen is a flat `Panel`.
- Atmosphere is **contained** to the hero and stays **under ~12% opacity**; past that it competes with the text.
- Atmosphere is **drawn, not photographic** — `src/inkWash.js` generates three seeded ridgelines in cream. A photo carries its own colours and fights the palette however far it is faded; ridges made from the accent cannot clash, cost no bytes, and stay crisp at any size. Seeded per language so a skyline is stable across renders.
- While any `HeroPanel` is mounted it sets `data-lit-hero` on the document, which drops `--bg-image-opacity` to 0.04. The rule travels with the component — a screen adopting the hero gets the flattening automatically.
- Screens using it: **Home** (the card queue), **Stories** (the day's story — it replaced the old tinted "Today's story" strip AND the plain page header), **Practice** (its title block).

**Card interaction:** `translateY(-2px)`, stronger shadow, accent border on hover, ~180ms transition.

**Per-language accent:** The whole UI shifts accent color when the active language changes. Components derive `accentHex` (and font, native name, background) from `languageTheme(profile.active_language)` in `src/languageTheme.js` — never hardcode the ternary.

**Background images:** Fixed full-page at opacity **0.4** (Background.jsx `TARGET_OPACITY = 0.4`). Auth/Onboarding use bg-login.png at opacity 0.35.

**Sidebar:** Semi-transparent frosted glass `rgba(255,255,255,0.85)` + `backdropFilter: blur(6px)`. Expanded 232px, collapsed 64px. Collapse state is session-only (useState — not persisted).

**Navigation active state:** Sage green pill background (`#E7EDE4`) and text (`#4F6047`) — neutral, not accent-colored. Icons at 19px, strokeWidth 1.85.

**lucide-react icons:** All functional UI icons. Content emoji (🇨🇳 🇯🇵 flags) are fine as content. Never use emoji as icons.


---

## Content pipeline — the generate-*.mjs scripts

> **LLM provider note (2026-07-01):** All the `generate-*.mjs` LLM scripts now go through **`llm.mjs`**, which selects the provider/model at runtime — **Gemini by default** (`GEMINI_API_KEY` → `gemini-2.5-flash-lite`), Groq as fallback (`GROQ_API_KEY` → `llama-3.3-70b-versatile`). The per-script descriptions below that say "Uses Groq / llama-3.3-70b" describe the *legacy* default; the model is now whatever `llm.mjs` resolves. See `docs/CHANGELOG.md` for how the pipeline reached this state.

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
- **Rate limits (now Gemini):** small-output tasks (examples, comprehension) run fine on Gemini's free tier; **story generation gets hard-429'd** on the free tier and mostly fails (see `docs/CHANGELOG.md` and `docs/BACKLOG.md` → Content). A paid key removes the caps. Runs are idempotent/resumable — re-run to fill whatever is still missing (except stories, which need `--replace`).

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

## Appendix — source file catalogue (snapshot, may be stale)

> ⚠️ **This catalogue is a point-in-time snapshot and is known to have drifted.**
> `src/` holds ~271 files; the list below covers roughly 40 of them, and several
> entries describe screens that have since been rewritten (Settings is no longer
> a placeholder; MobileNav's tab set changed; Home was redesigned around
> `HeroPanel`). Treat it as a starting point for orientation, never as truth.
> **The source is the truth** — grep for the symbol.
>
> Kept because the per-module *intent* notes are still useful. Do not extend it;
> if a module needs explaining, explain it in a comment at the top of that module
> where it cannot drift.

### The catalogue

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
  to whichever host the user is on (see `docs/DEPLOY.md`).

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
  that a host is missing its env vars (see `docs/DEPLOY.md`).

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
