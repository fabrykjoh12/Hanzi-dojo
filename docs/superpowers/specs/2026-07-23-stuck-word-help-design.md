# Stuck-Word Help — Design

**Date:** 2026-07-23
**Roadmap item:** "Stuck-word help — a word that keeps slipping gets flagged and
taught a different way, instead of endlessly re-appearing."

## Goal

When a word keeps lapsing, meet it from a fresh angle instead of showing the same
bare flashcard again. A calm "coach" sheet recombines data we already have so the
word is seen in context, not just re-tested.

## Key decisions (settled during brainstorming)

1. **"Stuck" = `lapses >= 4`** — the same threshold the Profile leech panel
   already uses, so "keeps slipping" and "stuck" are one set (`STUCK_LAPSES = 4`).
2. **Intervention = a multi-angle coach sheet** (not a switched drill, not
   mnemonics — mnemonics are a separate roadmap item).
3. **Entry points:** inline in Study on a repeat lapse, and the Profile
   "keeps slipping" panel. (No Practice-hub card.)
4. **Coach sections:** anchor + slow audio, the word in an example sentence, and
   a Chinese character breakdown. (No story-line fetch.)
5. **No migration, no new content** — recombines `cards.lapses`, the `vocabulary`
   row, seeded `dict_entries`, and existing `tts_audio` clips.

## Components

### `src/stuckWord.js` (pure, unit-tested)
- `STUCK_LAPSES = 4`.
- `isStuck(card)` → `(card.lapses || 0) >= STUCK_LAPSES`.
- `charBreakdown(word, reading)` → `[{ char, pinyin, tone }]` pairing each hanzi
  with its pinyin syllable via `toneColor.splitHanziWithTones` (no regex, per repo
  rules). Non-hanzi / mismatched input degrades to chars with empty pinyin.

### `src/StuckWordCoach.jsx`
A bottom-sheet **portaled to `document.body`** (like `WordLookupSheet`, to escape
the mobile stacking context). Props: `{ vocab, onClose }` (+ whatever it needs to
load audio). Sections:

1. **Anchor** — the word large, tone-colored per character for Chinese
   (`splitHanziWithTones` + `TONE_CLASS` from `toneColor.js` + the palette already
   in `index.css`); reading and `cleanMeaning(meaning)`; a **slow-audio** button:
   `flashcardAudio(vocab).word_slow`, falling back to `.word` (slow is Chinese-only
   today). Audio is loaded on open via `loadTtsAudio('vocabulary', [vocab.id])`,
   then `flashcardAudio(vocab)`; `AudioButton` takes the resolved `url`.
2. **In context** — `example_sentence`, `example_reading`, `example_translation`
   (already on the row) with a play button (`flashcardAudio(vocab).sentence`).
   Section hidden when the row has no example sentence.
3. **Character breakdown (Chinese only)** — each character tone-colored with its
   pinyin (from `charBreakdown`) and a short gloss fetched per unique character
   from the reference dictionary (`getDictEntryByWord(supabase, char)` from
   `dictSearch.js`, one lookup per unique char on open, results cached in local
   state). Omitted entirely when `language !== 'chinese'` or the word is a single
   character.

The sheet is presentational + a small on-open data load; identical from both
entry points. Reduced-motion-aware slide-up (reuse the existing `hd-sheet-up`
keyframe).

## Entry points

### Study (inline, on repeat lapse)
In `Study.jsx`, when the learner grades **Again** (grade 0) on a card that
`isStuck` (using the card's lapse count), surface a calm secondary control —
*"Struggling? See it a different way"* — that opens `StuckWordCoach` for the
current card's vocab. The grade flow and queue are unchanged; the coach is an
optional side panel over the session. Closing it returns to the session as-is.

### Profile ("keeps slipping" panel)
Each leech row gains a **"Learn this differently"** button that opens the coach.
The leech query (`Profile.jsx`) currently selects
`vocabulary(word, reading, meaning, language, system, level)`; extend it to also
select `id, example_sentence, example_reading, example_translation` so the coach
has everything it needs without a second fetch.

## Testing

- `src/stuckWord.test.js` — `isStuck` at/around the threshold; `charBreakdown`
  pairing (multi-char word, single char, non-hanzi input, length mismatch).
- The dict fetch + sheet render are verified manually in the running app (the
  data module is `dictSearch.js`, already covered elsewhere).

## Scope guard (YAGNI — explicitly out)

- No Practice-hub card.
- No story-line fetch.
- No mnemonics (separate roadmap item).
- No new "stuck" state, column, or table; no change to FSRS grading.
- No cross-language slow audio beyond what `tts_audio` already has (falls back to
  the normal word clip).

## Files

**New (3):** `src/stuckWord.js` (+ test), `src/StuckWordCoach.jsx`.

**Edited (2):** `src/Study.jsx` (inline offer on repeat lapse + render the coach),
`src/Profile.jsx` (leech query fields + "Learn this differently" button + render
the coach).

## Not live until

Nothing — no migration, no new content. Ships with the merge.
