# Prior knowledge — design

**Date:** 2026-07-23
**Status:** Approved, ready for planning

## Problem

A learner who already knows HSK 1–3 has no way to tell us. Today the only path is
the placement test (`src/tiers.js`, `src/PlacementTest.jsx`): pass 9 of 12 and we
start you at that level, treating everything below as known.

"Treating as known" means *ignoring*. `studyFloorLevel` (`src/levelScope.js`)
derives the study floor from the user's existing **cards**, so a learner placed at
HSK 3 has no cards below level 3 and never will. Those 498 words (HSK 1: 300,
HSK 2: 198 — for Japanese N4 it is 802) are never scheduled, never reviewed, and
never checked. The app's whole value proposition is that it catches a word right
before you forget it, and for a placed learner it silently declines to do that for
most of what they know.

**The goal is retention, not statistics.** Prior knowledge must live in the
schedule, decaying and resurfacing like everything else.

## Design

One concept: **a claim is a set of vocab ids you say you already know.** Three
sources produce claims; one seeder turns a claim into cards.

```
placement tier ─┐
paste import   ─┼─→ claim (vocab ids, frequency-ordered) ─→ spread ─→ bulk upsert into cards
checklist      ─┘                                          (N/day)    state=review, learned=true,
                                                                      stability=21, due=now+k days
```

After the upsert there is no feature left running. No new table, no new card
state, no background job, no changes to Study, Home, Stories, or the level test.
The seeded rows are ordinary review cards; the "check-up" the learner experiences
is just their due date arriving.

### Why claims count immediately

A claimed word is seeded at `stability = MASTERY_STABILITY_DAYS` (21), so it counts
as mastered from day one — toward story `% known`, story tier unlocks, the
Known-Word Map, mastery %, and level-test eligibility.

This is a deliberate decision. The alternative (claims count for nothing until
verified) leaves an HSK 3 importer staring at "12% known" on every story with tiers
locked for two months — punishing exactly the learner we are onboarding. The
no-shortcuts rule survives because the **level test itself is untouched**: it still
requires 30 questions at 100%, three attempts a day. Early eligibility only lets
someone attempt it; it cannot be passed by claiming.

The cost, accepted: an over-claimer's mastery % will **dip** as check-ups reveal
words they do not actually know. That is not a new mechanic — it is exactly what
already happens when you forget a word you had mastered.

### Why a claim is a card, not a queue

An earlier draft had a separate "audit queue" that dripped unverified words out for
testing and only created a card once verified. Because claims count immediately,
that collapses: a claimed word *is* a review card, and the audit drip *is* the
due-date spread on those cards. A failed check-up is an ordinary lapse — FSRS drops
the card to relearning and teaches it properly.

Trade-off accepted: a first-time miss is recorded as a lapse, so `lapses` runs
slightly high for imported words and they can reach leech detection sooner. This is
arguably correct — a word you claimed and then blanked on *is* a word that keeps
slipping.

## Modules

### `src/priorKnowledge.js` (new, pure, unit-tested)

- `spreadDueDates(ids, perDay, now)` → `[{ vocabId, dueAt, dayOffset }]`. **`ids`
  must already be in frequency order** — the function preserves the order it is
  given and does not sort; callers get that ordering from their query
  (`order('sort_order')` on `vocabulary`), because only the caller knows the level
  span involved. Assigns `perDay` ids to each successive calendar day starting at
  `dayOffset = 0` (**today**), so the first check-ups land in the first session.
- `seedCardRows(userId, spread, now)` → card rows ready for insert:
  `state: 'review'`, `learned: true`, `stability: 21`, `difficulty: 5`, `reps: 0`,
  `lapses: 0`, `is_easy: false`, `last_review: now`,
  `scheduled_days: dayOffset`, `due_at: dueAt`.

  Setting `scheduled_days` to the day offset rather than to `stability` means the
  first check-up is an *early* review relative to a 21-day stability. FSRS handles
  that correctly and conservatively (an early success grants less stability than a
  due one), which is the right bias for a claim we have not yet verified.
- `PACING` → `[{ key: 'relaxed', perDay: 8 }, { key: 'steady', perDay: 15 }, { key: 'fast', perDay: 30 }]`
- `estimateDays(count, perDay)` → for the "~33 days" label on the pacing picker.

`is_easy` is written as `false` only, never `true` — per the Supabase safety rules,
`is_easy: true` belongs to the SRS grading flow alone.

### `src/priorKnowledgeImport.js` (new, pure, unit-tested)

`matchPastedText(text, vocab, language)` → `{ matchedIds, matchedCount, unmatchedLines }`.

Routes through the **existing `buildVocabMatcher` / `matchVocabAt` from
`src/storyReading.js`** — the same matcher that decides what is tappable in the
reader. That inherits Chinese greedy longest-match, Japanese ます-form / reading /
kanji-stem resolution, and Russian whole-token inflection for free, and gives a
clean guarantee: *if the reader would highlight it, the import will find it.*

Because it scans for known words rather than parsing structure, an Anki CSV export,
a Pleco list, and a bare column of hanzi all work identically with no
column-mapping step.

### `src/KnownWords.jsx` (new view, `known`)

"Words you already know", two panels:

- **Paste a list** — a textarea, then a result line ("found 412 of your words; 86
  we don't have yet") and the pacing picker.
- **Browse & check** — frequency-ordered grid across *all* levels of the active
  language, tap to claim, "claim all" per level block. Words that already have a
  card render locked with their current status, so the screen can never be used to
  overwrite real progress.

Both paths end at the same pacing picker and the same seeder.

Reached from **Settings** and from a header link in `src/Words.jsx` (the natural
place to think "I know all of these").

### Onboarding

After a passed placement test, one new step: *"You said you're HSK 3. Bring your
earlier words into review?"* with the three pacing options and a skip. Claims every
active word below the start level.

## Data flow and safety

Seeding is a chunked `upsert` into `cards` with
`{ onConflict: 'user_id,vocab_id', ignoreDuplicates: true }`, in batches of 500.

The `cards` table has `unique (user_id, vocab_id)` and a user INSERT policy
(`supabase/schema.sql`), so this is race-safe and **idempotent by construction**: a
re-import, a double-tap, or an overlapping claim from two sources can never modify
an existing card. Re-importing the same list inserts nothing.

**No migration is required.**

### The study floor moves

`studyFloorLevel` derives the floor from existing cards, so seeding HSK 1–2 cards
drops a placed learner's floor from 3 to 1. Words they did *not* claim at those
levels stop being invisible and start arriving as new cards.

- For the **placement** source this is a non-issue: it claims every active word
  below the start level, so nothing is left over.
- For a **paste import** matching 412 of 498, the other 86 become teachable. That
  is correct — the learner genuinely does not know them — and the rate is already
  capped by their daily new-card goal.

This is an intended behavior change and needs a `levelScope` test covering the
seeded-floor case.

## Testing

- `src/priorKnowledge.test.js` — spread boundaries (day-0 inclusion, exact multiples
  of `perDay`, remainder day), card-row shape, `is_easy` never true, empty claim,
  `estimateDays` rounding.
- `src/priorKnowledgeImport.test.js` — Anki CSV with quoted fields and HTML in
  notes, a bare hanzi column, mixed junk lines, Japanese conjugated forms resolving
  to their stored dictionary entry, duplicates collapsing, zero matches.
- `src/levelScope.test.js` — floor drops to the seeded level; unclaimed words at
  that level become new cards.
- Idempotency — re-running the seeder over an existing claim inserts no rows and
  modifies no card.

## Out of scope

- `.apkg` parsing. Anki's own scheduling data would be ignored anyway (we verify via
  the spread regardless), and reading modern zstd-compressed collections needs
  `sql.js` WASM plus a decoder — roughly 1 MB of bundle to replace a textarea.
  Revisit only if a real user asks.
- Claiming words that are not in our `vocabulary` table. Unmatched lines are counted
  and reported, not stored.
- Adjusting the spread after the fact. Pacing is chosen once per claim. Claiming
  again is safe (idempotency) but will not re-spread cards that already exist. If
  this becomes a real complaint, a re-spread over undue seeded cards is the
  follow-up.

## Analytics

`prior_knowledge_claimed` with `{ source, count, perDay }` where `source` is
`placement | paste | checklist`.
