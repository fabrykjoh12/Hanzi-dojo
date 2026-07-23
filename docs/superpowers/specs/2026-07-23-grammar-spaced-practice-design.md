# Grammar as Spaced Practice — Design

**Date:** 2026-07-23
**Roadmap item:** "Grammar as spaced practice — turn the grammar guides into quick
fill-in-the-blank reviews, scheduled by the same memory engine."

## Goal

Let a learner keep a grammar pattern sharp the same way they keep vocabulary
sharp: opt a topic into spaced review, and its fill-in-the-blank drills come
back on an FSRS schedule. Calm and opt-in — no forced firehose, no streak
pressure, consistent with the app's ethos.

## Key decisions (settled during brainstorming)

1. **Scheduling substrate:** a new `grammar_reviews` Supabase table. Grammar has
   no `vocabulary` row, so it can't ride the existing `cards` table (which FKs
   `vocab_id`). A real table means cross-device, survives cache clears, and can
   surface in due counts — honestly "the same memory engine."
2. **Item format:** fill-in-the-blank generated from a topic's own example
   sentence (blank the grammar word, pick from confusable distractors).
3. **Item source:** hand-authored `drill` arrays in `grammarGuides.js` (curated
   confusable distractors, testable data, guides remain the single source of
   truth). Not derived from the `pattern` chip (too fragile).
4. **Enrollment:** explicit "Practice this pattern" button per topic. Opt-in.
5. **Surfacing:** a dedicated "Grammar review" drill in the Practice hub with a
   due-count badge, plus a small "N grammar due" nudge on Home. Grammar items are
   MCQs, not flip-cards, so they do **not** interleave into the flashcard Study
   queue (keeps the core Study flow untouched).

## Architecture

The scheduling unit is the **topic** — one `grammar_reviews` row per
(user × language × system × topic). A topic's multiple authored drill sentences
are just item variety for the same concept; the row schedules the concept, and
each time it's due we render one of its drill items.

`srs.js schedule(card, grade)` is already vocab-agnostic (it takes any
FSRS-shaped object and returns an `updates` bag). Grammar review reuses it
verbatim; a thin data module maps the `updates` bag onto the table's columns.

## Data — authored drills (`src/grammarGuides.js`)

Each topic gains an optional `drill` array:

```js
drill: [
  { sentence: '她__高。', blank: '很', reading: 'tā hěn gāo', en: 'She is tall.', options: ['是','很','的','了'] },
]
```

- `sentence` contains the blank marker `__` (two underscores) where `blank` goes.
- `blank` MUST be one of `options`.
- `options` are confusable grammar tokens (e.g. 是/很/的/了), hand-picked.
- Only topics that have a non-empty `drill` are enrollable; abstract topics
  (e.g. pure word-order) may have no `drill` and simply aren't offered for review.

**Invariants** (enforced by a unit test across all languages):
`blank ∈ options`, `sentence.includes('__')`, `options.length >= 2`,
`options` contains no duplicates.

## Database — `grammar_reviews` (new migration)

```
grammar_reviews
  user_id uuid            references profiles(id) on delete cascade
  language text
  system text
  topic_id text
  state text             check in ('new','learning','review','relearning')  default 'new'
  due_at timestamptz
  stability real
  difficulty real
  reps int               default 0
  lapses int             default 0
  last_review timestamptz
  scheduled_days int
  elapsed_days int
  learning_step int
  primary key (user_id, language, system, topic_id)
```

- RLS enabled. Policies: a user may `select`/`insert`/`update`/`delete` only rows
  where `auth.uid() = user_id` (mirrors the `cards` policies).
- No `is_easy` / `learned` columns — grammar review has no notion of "learned"
  gating or Easy grades; the mapper drops those keys from the `updates` bag.
- Mirror the migration into `supabase/schema.sql`.

**Enroll = idempotent upsert** with `ignoreDuplicates: true` on the PK, so a
re-tap, a double-tap, or a re-visit can never reset an in-progress row. This is
the single most important safety property (same one prior-knowledge relied on).
Do not replace it with read-then-insert.

## Scheduling & grading

- **Binary grade** — a fill-in-the-blank is self-grading:
  correct → FSRS **Good (2)**, wrong → FSRS **Again (0)**. No grade buttons.
- New card handling: enrollment writes a row in state `'new'` with `due_at = now`
  so the first practice is immediately available. `schedule()` treats
  `state === 'new'` as an empty card and advances it on first grade.

### Pure module — `src/grammarDrill.js` (unit-tested)

- `pickDrillItem(topic, seed)` — deterministically choose one of a topic's
  `drill` items (seed = e.g. reps count, so repeats rotate rather than repeat).
- `gradeFor(correct)` — `correct ? 2 : 0`.
- `buildBlankParts(sentence)` — split a `sentence` on `__` into
  `{ before, after }` for rendering (no regex; `indexOf`/`slice`, per repo rules).

### Data module — `src/grammarReview.js` (mocks `supabase` in tests)

- `enrollTopic(session, track, topicId)` — idempotent upsert of a `new` row,
  `due_at = now`.
- `getEnrolledTopics(session, track)` — returns the user's rows for the active
  track (to show enrolled state + build the due queue).
- `getDueGrammar(session, track, now)` — rows filtered by `isCardDue`.
- `gradeGrammar(session, track, topicId, row, correct)` — runs
  `schedule(row, gradeFor(correct))`, maps `updates` → the table's columns
  (dropping `is_easy`/`learned`/`interval_days`), writes the row.
- `countDueGrammar(session, track, now)` — count for the badge/nudge.

## UI

- **Enroll** (`src/Grammar.jsx`): a "Practice this pattern" button per topic,
  shown only when the topic has a `drill`. Reflects enrolled / not-enrolled
  state (fetch the user's enrolled topic ids on mount). Tapping enrolls and
  confirms ("Added to review").
- **Drill screen** (`src/GrammarPractice.jsx`, new; view key `grammarpractice`,
  added to `KNOWN_VIEWS` in `routes.js` and rendered in `App.jsx`): builds a
  queue from `getDueGrammar`, shows the blanked sentence + reading + English +
  option buttons, gives immediate ✓/✗ feedback, advances, and ends on a small
  recap (items done / accuracy). Mirrors `FillBlank.jsx`'s structure and the
  shared `ui.jsx` primitives.
- **Surfacing:**
  - `src/homeCounts.js` gains `grammarDueCount` (via `countDueGrammar`).
  - `src/Practice.jsx` gains a `Grammar review` card (icon `GraduationCap`
    already imported; distinguish from the existing `Grammar guide` card by
    title/desc) with a `badge` when `grammarDueCount > 0`, routing to
    `grammarpractice`.
  - `src/Home.jsx` shows a small "N grammar due" nudge when
    `counts.grammarDueCount > 0` (calm, optional to tap).

## Testing

- `src/grammarDrill.test.js` — `pickDrillItem` determinism + rotation,
  `gradeFor`, `buildBlankParts`.
- Drill-data validation test (in `grammarDrill.test.js` or a dedicated
  `grammarGuides.test.js`): every authored `drill` across chinese/japanese/
  russian satisfies the invariants.
- `src/grammarReview.test.js` — enroll idempotency, due filtering, grade →
  correct `updates` mapping (mocks `supabase`, like `xpService.test`/`streak.test`).
- No live-Supabase / e2e required for the logic; a manual pass in the running
  app confirms the screen + enroll flow.

## Scope guard (YAGNI — explicitly out)

- No 4-button grade UI (binary is correct for fill-in-the-blank).
- No interleaving into the flashcard Study queue.
- No auto-enrollment (opt-in only).
- No cross-language sharing of `topic_id`s (keyed by language + system + topic).
- No `is_easy` / `learned` semantics for grammar.

## Files

**New (4):** `supabase/migrations/<ts>_add_grammar_reviews.sql`,
`src/grammarDrill.js` (+ test), `src/grammarReview.js` (+ test),
`src/GrammarPractice.jsx`.

**Edited (~7):** `src/grammarGuides.js` (authored `drill` arrays),
`src/Grammar.jsx` (enroll button), `src/Practice.jsx` (drill card + badge),
`src/homeCounts.js` (`grammarDueCount`), `src/Home.jsx` (nudge),
`src/routes.js` (`KNOWN_VIEWS`), `src/App.jsx` (render the view),
`supabase/schema.sql` (mirror the table).

## Not live until

The migration is applied in Supabase (until then enroll/read fail silently and
the drill shows an empty queue — defensive, no error).
