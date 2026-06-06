# CLAUDE.md — Hanzi-dojo

Read this entire file before making any change. It describes not just *what* the project is, but *why* it exists and *how* it should feel. When a decision isn't covered here, choose the option that best serves the vision and learning philosophy below.

---

## 1. What this project is

Hanzi-dojo is a free language learning web app built around two things that actually work: **SRS flashcards** and **immersion** (reading and listening in the target language). It currently supports Chinese (HSK 3.0) and Japanese (JLPT), with the goal of expanding to many more languages over time.

It is being built by a solo non-coder directing AI assistants. Code must therefore be simple, readable, and safe to change.

---

## 2. Why it exists (the motivation)

Most language apps don't actually teach you the language. The creator has tried learning many languages and hit the same wall every time:

- **Duolingo and similar apps waste your time** — you spend hours on useless words and gamified loops that don't make the language stick.
- **The methods that actually work are SRS flashcards (like Anki) and immersion** — reading and listening to real content in the target language.
- **But immersion has a hard problem: finding content at your level.** Beginners can't read native material, and hunting for "comprehensible input" is tedious and discouraging.

Hanzi-dojo solves this by combining both proven methods in one place, and by **giving the user stories matched to how many words they actually know** — so they never have to go looking for content they can understand. The app brings the right-level content to them.

The mission: build a genuinely useful, free language app that the community can rely on — not another gamified time-sink.

---

## 3. The two core features (everything serves these)

1. **SRS flashcards** — spaced repetition to build a vocabulary base efficiently.
2. **Immersion** — reading stories, listening to audio, watching curated videos, and writing practice, all matched to the user's current level.

Every feature decision should strengthen one of these two pillars. If a proposed feature doesn't make flashcards or immersion better, question whether it belongs.

---

## 4. Who it's for

Everyone. Complete beginners through to people who already study and want better tools. The app should never assume prior knowledge or technical skill. It is for the global language-learning community, and it should stay accessible to all.

---

## 5. The intended daily learning loop

This is the experience the app should guide the user through, in this order:

1. **Daily flashcards** — review due cards and learn the day's new words (SRS).
2. **Read stories** — immersion with content matched to the words they now know.
3. **Watch YouTube videos** — curated listening immersion for their level.
4. **Writing exercises** — active recall and output practice.

Flashcards come first (they build the base); immersion follows (it makes the words stick in context). The home screen and navigation should gently reinforce this flow without forcing it.

---

## 6. Learning philosophy (this shapes every UX decision)

- **No shortcuts.** The user should never be able to fake progress just to advance. Progression is gated on genuine mastery. Example: the level test requires **100% to pass**, and stories/tests unlock based on words actually marked **Easy**, not just seen.
- **Mastery before progression.** A user moves to the next level because they've learned the current one, not because they clicked through it.
- **Calm, not pressured.** The design should make the user feel calm and focused, never anxious or manipulated. No dark patterns, no guilt, no fake urgency. Streaks exist to gently encourage consistency, not to punish.
- **Frequency-first vocabulary.** Words are ordered by real-world frequency and usefulness. Learn the most useful words first.
- **HSK/JLPT as a base, not the point.** The app suits exam prep, but its primary purpose is **general learning and real fluency**. The official word lists are simply a sensible, well-researched order in which to learn vocabulary first.

When unsure about a feature, ask: *does this help the user genuinely learn, while keeping them calm and free of shortcuts?*

---

## 7. Design system & feel

The app should feel **premium, minimal, and calm** — like a quiet, well-made study space. Never childish, gamified, or cluttered.

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
```

- Fonts: Inter (UI), Noto Sans SC (Chinese), Noto Sans JP (Japanese)
- Each language has its own accent color; the whole UI shifts accent when the active language changes
- Card hover: `translateY(-2px)`, stronger shadow, accent border, 180ms transition
- Subtle faint background character (学 / 読) at ~0.035 opacity on key screens for atmosphere
- CSS variables in index.css: `--chinese-accent`, `--japanese-accent`
- Generous spacing, clear hierarchy, restraint over decoration

---

## 8. Roadmap & future direction

**Languages:** Start with Chinese and Japanese. Expand to Spanish next, then more over time. Architecture should stay language-agnostic — anything hardcoded to Chinese/Japanese is a future problem. Always store and branch on `language` + `system`, and route display through `getLevelLabel`.

**Monetisation (future, kept minimal):** The app should stay as free as possible. If monetisation becomes necessary, prefer community-friendly models: community funding/donations, or letting YouTubers pay a small fee to be featured in the curated video section. Never compromise the learning experience with ads or paywalls on core features.

**Immersion content engine:** The long-term differentiator is content matched to the user's known words. Currently stories are hand-written per level. The future direction is a system that produces/curates level-appropriate stories so users always have understandable content. Keep this in mind when touching the stories system.

---

## 9. Stack

- React 19 + Vite (OXC parser — strict syntax, see Coding rules)
- Supabase (Postgres + auth + storage)
- Tailwind installed but mostly unused — styling is inline style objects
- Node 24, plain JSX, no TypeScript
- GitHub: fabrykjoh12/Hanzi-dojo (private)
- Google Cloud TTS for audio generation

---

## 10. Supabase project

- Project ID: bvqvturqupbggxaeihvi
- URL: https://bvqvturqupbggxaeihvi.supabase.co
- Storage bucket: `audio` (public) — all TTS audio
- Auth: email/password + Google OAuth

---

## 11. Important files

```
src/App.jsx              Main router. Loads profile + track. Renders all views.
src/Auth.jsx             Login and signup (email + Google OAuth).
src/Onboarding.jsx       3-step onboarding: language → level → daily goal.
src/Study.jsx            Flashcard screen. SM-2 scheduling. Audio. Japanese controls.
src/Test.jsx             Multiple choice level test. E→C and C→E mix. End quiz button.
src/Stories.jsx          Story categories → list → reader with word tooltips + sidebar.
src/Writing.jsx          Writing practice. Typed recall mode.
src/Profile.jsx          User stats, daily goal editor, reset progress.
src/YouTube.jsx          Curated video cards per level.
src/LanguageSwitcher.jsx Switch languages. Start new language. Level replay.
src/srs.js               SM-2 spaced repetition scheduler (FSRS upgrade planned).
src/streak.js            Daily streak logic.
src/testLogic.js         getTestStatus, getAttemptsToday, checkAnswer.
src/homeCounts.js        getHomeCounts — new/learn/due/easy card counts.
src/utils.js             getLevelLabel(language, system, level), getSystemLabel(system).
src/supabase.js          Supabase client.
generate-audio.mjs       TTS audio generation script (not in app bundle).
```

---

## 12. Database schema

```sql
profiles           id, active_language, daily_new_cards, streak, streak_freezes,
                   last_studied_on, display_name

language_tracks    user_id, language, system, current_level, is_active

vocabulary         id, language, system, level, sort_order, word, reading,
                   reading_plain, meaning, audio_path, is_active

cards              user_id, vocab_id, state, is_easy, learned, ease_factor,
                   interval_days, due_at, learning_step

review_logs        user_id, vocab_id, grade, reviewed_at

daily_activity     user_id, date, cards_reviewed, new_cards_introduced

test_attempts      user_id, language, system, level, score, total_questions,
                   correct_count, passed

test_answers       user_id, attempt_id, vocab_id, user_answer, correct_answer,
                   was_correct

level_unlocks      user_id, language, system, level

stories            id, language, system, level, tier, tier_min_words,
                   story_number, title, english_summary, content, is_published

story_vocab        story_id, vocab_id

youtube_recommendations  id, language, system, level, sort_order, title,
                         channel_name, video_url, notes, is_published
```

---

## 13. Language & level system

**Chinese:** language='chinese', system='hsk_3', levels 1–9

**Japanese:** language='japanese', system='jlpt', levels 1–6:

| DB level | Display |
|----------|---------|
| 1 | N5 · Part 1 |
| 2 | N5 · Part 2 |
| 3 | N4 |
| 4 | N3 |
| 5 | N2 |
| 6 | N1 |

JLPT advances 1 → 2 → 3 → 4 → 5 → 6 (N5-1 → N5-2 → N4 → N3 → N2 → N1).
Always use `getLevelLabel(language, system, level)` for display. Never hardcode labels.

---

## 14. Content currently seeded

- **Chinese HSK 3.0 Level 1:** 300 words, frequency-ordered, with audio at `chinese/hsk_3/level_1/`
- **Japanese JLPT N5:** 802 words total — 400 in level 1 (most frequent), 402 in level 2 — with audio at `japanese/jlpt/level_1/` and `japanese/jlpt/level_2/`
- **Stories:** 1 story for Chinese HSK Level 1
- **YouTube:** 3 recommendations for Chinese HSK Level 1
- Audio voices: Chinese `cmn-CN-Chirp3-HD-Aoede`, Japanese `ja-JP-Neural2-B` (use hiragana `reading` as TTS input)

---

## 15. SRS rules (src/srs.js)

SM-2 based (FSRS upgrade planned; srs.js is isolated so it's safe to swap).

- Learning steps: [1, 10] minutes
- Hard = 5 min, Graduating = 1 day, Easy = 4 days, Review again = 10 min
- `is_easy = true` is set **only** on the Easy grade
- `is_easy` gates story unlocks and test unlock — never set it true anywhere else

---

## 16. Test rules

- 30 multiple choice questions, mix of E→C and C→E
- **100% required to pass** (no shortcuts — this is intentional, see philosophy)
- 3 attempts per day
- Wrong answers: card loses `is_easy`, becomes due again
- Passing inserts a `level_unlocks` row and advances the track
- Test unlock is **permanent** once passed — it does not re-lock if cards later become due

---

## 17. Story unlock thresholds

Unlock based on `easyCount` (cards with `is_easy = true`) for the current level:

| Tier | Unlock at |
|------|-----------|
| 1 — First Steps | 20 words |
| 2 — Growing | 50 words |
| 3 — Comfortable | 100 words |
| 4 — Confident | 200 words |
| 5 — Complete | 300 words |

---

## 18. Coding rules (mandatory — OXC parser is strict)

1. No TypeScript. No type annotations.
2. No complex regex literals — they break the OXC parser. Use string methods.
3. All styling is inline style objects. No Tailwind classes in JSX.
4. No template literals inside JSX style props where concatenation works.
5. No localStorage or sessionStorage — they don't work in this environment.
6. No `<form>` tags — use onClick/onChange handlers.
7. Keep components flat and simple.
8. Always run `npm run build` before committing. The build is the source of truth.
9. Prefer full file replacements over find-and-replace fragments when the user applies changes by hand.

---

## 19. Supabase safety rules

1. Never delete vocabulary rows — set `is_active = false` instead.
2. Never delete cards without explicit user request — reset goes through the RPC only.
3. Never set `is_easy = true` outside the SRS grading flow (srs.js + Study.jsx). Other features may set it false, never true.
4. RLS is enabled — all queries run as the authenticated user. Never put the service key in frontend code.
5. `level_unlocks` is effectively append-only except in a full progress reset.
6. Progress reset must go through the `reset_current_language_progress` RPC — never raw-delete across tables from the frontend.
7. The audio bucket is public — never store user data there.

---

## 20. Environment files

```
.env          Vite app vars (VITE_ prefix). Gitignored.
.env.script   Server-side vars for generate-audio.mjs. Gitignored.
```

`.env` requires: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_TTS_KEY
`.env.script` requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_TTS_KEY

---

## 21. Verification & GitHub workflow

Before committing:
```bash
npm run build
```
If it passes, commit:
```bash
git add .
git commit -m "Short specific message"
git push
```
Commit before and after every meaningful session. Update this file when features are added or known issues resolved.

---

## 22. Known issues

- Some Japanese audio mispronounces kanji. Fix: send `v.reading` (hiragana) to TTS, voice `ja-JP-Neural2-B`. Delete the storage folder before regenerating so files aren't skipped.
- Duplicate kanji in Japanese vocab (何 = なん/なに, 私 = わたし/わたくし) create identical-looking test options. Plan: deactivate less-common duplicates and/or show reading in test options.
- A few JLPT N5 level-2 entries are counter suffixes (～グラム, ～たち) — more grammar than vocab. Review and optionally deactivate.
- Existing ESLint hook-dependency warnings in some files — don't add new ones.

---

## 23. Recently changed (Codex session — review before building on top)

These were added by another AI session and should be verified:
- Reset progress (Profile.jsx + RPC migration — migration must be run in Supabase)
- Level replay in LanguageSwitcher.jsx
- Permanent test unlock via level_unlocks; removed auto-advance from App.jsx
- Fixed JLPT progression order
- Fixed home page new-card count (homeCounts.js — now current-level only)
- Writing practice (Writing.jsx)
- Japanese flashcard controls (Study.jsx — Word first / Kana first / Furigana toggle)

---

## 24. Roadmap (not yet built)

- FSRS algorithm upgrade
- More HSK 1 stories; HSK 2 vocabulary + audio
- Japanese N5 stories; Japanese YouTube recommendations
- Practice test mode (unlimited, no progression impact, no card state changes)
- Example sentences on flashcards
- Furigana above kanji on Japanese cards
- Spanish (third language)
- Level-matched story content engine (the long-term immersion differentiator)
- Offline support (post-launch)