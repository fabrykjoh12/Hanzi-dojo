# Pleco-style Reference Dictionary (Chinese) — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan
**Scope:** Chinese only (flagship). Japanese/Russian are explicit non-goals for v1.

## Problem

Today's "Dictionary" (`src/Dictionary.jsx`) searches only the app's **curriculum
vocabulary** — a few thousand HSK words, each tied to a level. It is effectively a
"search your syllabus" screen, not a reference dictionary.

The goal is a **professional, Pleco-style reference dictionary**: a much larger,
curriculum-independent dataset (~120k entries) with rich entries, fast search, and
tight integration with the existing study loop. "Add as many words as possible."

## Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Languages | **Chinese only** for v1 (CC-CEDICT). JP/RU later. |
| Storage & search | **Supabase + Postgres** full-text/trigram search (not bundled offline). |
| Entry richness | Traditional + colored pinyin, character breakdown, words-containing, stroke order + audio, numbered senses. |
| Example sentences | **Tatoeba** open sentence bank (imported), not LLM-generated. |
| Deck integration | **Flashcard anything** — any entry can be added to the FSRS deck. |
| Default scope | Dictionary **defaults to the full reference dictionary**; syllabus is an optional filter. |

## Data model

Two new Supabase tables, Chinese-only for now.

### `dict_entries` (from CC-CEDICT, ~120k rows)
- `id` (pk)
- `simplified` text
- `traditional` text
- `pinyin` text — tone-marked (e.g. `zhōng guó`)
- `pinyin_plain` text — toneless, lowercased, for search (e.g. `zhongguo`)
- `definitions` jsonb — array of sense strings (CC-CEDICT splits senses on `/`)
- `hsk_level` int null — populated where the headword matches a curriculum word (denormalized convenience; source of truth stays `vocabulary`)
- generated/normalized search columns (see Search)

### `dict_examples` (from Tatoeba)
- `id` (pk)
- `hanzi` text — the Chinese sentence
- `pinyin` text — optional, derived if feasible
- `english` text — the aligned translation
- `contains` — mechanism to fetch sentences using a given headword (e.g. a
  trigram/`LIKE` match on `hanzi`, or a normalized token index). Exact mechanism
  decided in the plan; must be fast enough for a per-entry lookup capped at a few
  sentences.

### Licensing / attribution
- CC-CEDICT: **CC-BY-SA 4.0** — requires attribution + share-alike.
- Tatoeba: **CC-BY 2.0 FR** — requires attribution.
- A small **"Sources"** credit line appears in the dictionary UI (footer of the
  dictionary screen and/or the entry sheet).

## Search

Server-side in Postgres; the client sends a query string and a scope flag.

- **Hanzi**: `pg_trgm` trigram index on `simplified` and `traditional` for exact +
  fuzzy substring matching.
- **Toneless pinyin**: reuse the existing `src/searchFold.js` fold (NFD + strip
  combining marks) on the client to normalize input; match against `pinyin_plain`.
- **English**: match against `definitions` text (full-text or trigram; decided in
  plan).
- **Ranking**: exact headword > prefix > contains. Results capped at `MAX_ROWS`
  (as today) with the existing "keep typing to narrow it down" affordance.
- Query runs against `dict_entries` by default (**full dictionary**). The
  syllabus/status/level filters (see Integration) narrow to curriculum words.

## Entry view

`src/WordLookupSheet.jsx` grows from a thin gloss into a fuller entry. It stays the
same shared bottom-sheet used by the readers and analyzer (portal to `<body>`), so
the richer entry benefits every surface, not just the Dictionary screen.

Sections:
1. **Header** — simplified + traditional forms; **tone-colored** characters
   (Pleco's signature); tone-marked pinyin; buttons: audio (existing TTS),
   stroke-order (existing `hanzi-writer`), bookmark / add-to-deck.
2. **Senses** — numbered list from `definitions`.
3. **Character breakdown** — each character in the headword is tappable and opens
   *its own* `dict_entries` entry. Implemented as a small in-sheet navigation
   stack (drill in, back out) so the sheet never loses the user's place.
4. **Words containing this** — a query for other `dict_entries` headwords that
   contain the current character/word (e.g. 中 → 中国, 中心, 中文). Capped list.
5. **Examples** — a few `dict_examples` sentences containing the word, each with
   pinyin + English + audio.

Rendering must stay resilient to entries that lack some fields (rare word with no
examples, single-character entry with no breakdown, etc.).

## Deck integration — "flashcard anything"

Cards FK to `vocabulary` (via `cards.vocab_id`), and `getTrackCards` joins
`cards → vocabulary!inner` filtered by `language` + `system` (+ optional `level`).
So for a reference word to enter FSRS reviews, a matching `vocabulary` row must
exist in the user's track.

**On add-to-deck for a non-curriculum entry:**
1. Ensure a **dictionary-sourced `vocabulary` row** exists for that headword:
   same `language` and `system` as the active track (so `getTrackCards` picks it
   up), `reading` = pinyin, `meaning` = first sense(s), and a **sentinel level**
   (0 or `NULL`) that marks it as *not part of any graded level*.
2. Insert the `cards` row as today.

**Invariant:** dictionary-sourced vocab must be **excluded from level tests and
level-based curriculum queries** (placement, level unlock, "% of level mastered",
Known-Word Map, etc.). The plan must audit every query that enumerates a level's
vocabulary and confirm a sentinel level (0/NULL) is filtered out — this is the one
place the design touches study-critical logic, so it gets explicit test coverage.

Words that already exist in the curriculum keep their current behavior: level
badge, status dot, and add-to-deck against their existing `vocabulary` row (no new
row created).

## Data pipeline

New `seed-dict.mjs`, mirroring the conventions of `seed-vocab.mjs`:
- Parses CC-CEDICT and Tatoeba source files into the two table shapes.
- Bulk-inserts in batches.
- **Idempotent** (skips existing rows; never deletes/overwrites) and **dry-run by
  default** (`--apply` to write), consistent with the existing seed scripts.
- Re-runnable to refresh when sources update.

## Integration & navigation

- The **Dictionary screen defaults to searching the full reference dictionary.**
- The existing curriculum filters — status chips (All / In deck / Learning /
  Mastered / Not started) and the **Level** picker — become an optional
  **"My syllabus"** scope: applying them narrows results to curriculum words.
  When the scope is "full dictionary," those chips are hidden or disabled (decided
  in plan; the point is they no longer make sense against 120k rows without a
  level join).
- **Recent lookups**, the shared `WordLookupSheet`, and reader/analyzer
  integration are untouched in behavior (they inherit the richer entry).

## What stays the same

- FSRS scheduling, level tests, curriculum flows — untouched except for the
  explicit sentinel-level exclusion above.
- The lookup sheet remains the single shared entry surface.
- No change to Japanese/Russian tracks.

## Non-goals (v1)

- Japanese (JMdict) and Russian (Wiktionary) reference dictionaries.
- Offline-bundled dictionary dataset (Supabase online search only; recent lookups
  still cached as today).
- Handwriting/OCR input, LLM-generated definitions, a separate "saved words" list
  surface.

## Risks / open questions for the plan

- **Level-test leakage**: the sentinel-level exclusion must be verified across all
  level-enumerating queries (highest-risk item).
- **`dict_examples` lookup performance**: choosing an index strategy that makes
  per-entry "sentences containing X" fast at Tatoeba scale.
- **Payload size**: `definitions`/examples must be trimmed/capped so entry loads
  stay light on mobile.
- **Pinyin for Tatoeba**: whether to precompute pinyin for example sentences or
  omit it in v1.

## Sources

- CC-CEDICT — https://www.mdbg.net/chinese/dictionary?page=cc-cedict (CC-BY-SA 4.0)
- Tatoeba — https://tatoeba.org (CC-BY 2.0 FR)
