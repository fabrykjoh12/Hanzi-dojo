# "How much can you read?" — public reading assessment

**Date:** 2026-07-18
**Status:** Design approved, ready for planning
**Builds on:** public story links (`PublicStory.jsx`, `public_story` RPC pattern), `PlacementTest` MCQ engine, `calculateStoryReadability`, `shareCard.js`

## Purpose

A signed-out visitor takes a ~60-second quiz on a public page and gets a single,
shareable result — *"You can read ~X% of everyday Chinese — around HSK 2"* — that
they can share, pulling new visitors into a signup loop. It is a **growth /
top-of-funnel** feature, not a study tool.

Success = a stranger with no account can (1) finish in ~60s, (2) get a result that
feels honest and matches the in-app "% known" meaning, (3) share it as a branded
card, and (4) convert to signup with their language + starting level pre-selected.

## Scope

**v1 ships Chinese only**, built data-driven so Japanese/Russian are a config flip
later (gated to seeded languages, like onboarding already is).

**Deferred (YAGNI):**
- True adaptive / item-response-theory scoring — a fixed banded quiz is enough.
- Multi-passage comprehension testing.
- Returning the visitor to a specific spot after signup (standard onboarding after).

## User flow

Public route **`/how-much-can-you-read`** (no app shell, lazy-loaded, mirrors
`PublicStory`):

1. **Intro** — one line + "Start" ("How much Chinese can you read? Find out in 60
   seconds."). Language pick shown only when >1 language is enabled (v1: Chinese,
   so this step is skipped/defaulted).
2. **Quiz** — ~12 multiple-choice questions, one at a time, drawn across difficulty
   bands. Immediate lightweight advance (no per-question right/wrong drama — this is
   an estimate, not a graded test). A slim progress bar.
3. **Result** — animated reveal of one number ("~X%") + a level label + a one-line
   interpretation, and a **shareable card**.
4. **CTA / gate** — "Sign up free to learn the words you're missing" → onboarding,
   pre-selecting language + a sensible starting level derived from the score.

## Architecture

### Components / files
- **`src/HowMuchCanYouRead.jsx`** (new) — the lazy public page (intro → quiz →
  result state machine). No app shell, like `PublicStory.jsx`. Renders via
  `App.jsx` route branch before the Landing gate; a signed-in visitor may still
  take it (result just links home instead of signup).
- **`src/assessment.js`** (new, pure, unit-tested) — all correctness-critical
  logic: band construction, question selection, scoring → estimated known-vocab
  set, and the readability estimate. No React, no network.
- **`src/assessment.test.js`** (new) — node-env tests for `assessment.js`.
- **Reuse** `buildQuestions`-style MCQ construction (extract the reusable core from
  `PlacementTest.jsx` into a shared helper if needed, so the two can't drift),
  `calculateStoryReadability` (`storyReading.js`), `shareCard.js`, `cleanMeaning`.
- **`src/routes.js`** — add a route matcher (mirror `readStoryId`).
- **`src/Landing.jsx`** — entry-point CTA linking to `/how-much-can-you-read`.

### Data access
- **New anon RPC `public_assessment_vocab(p_language text)`** — security-definer,
  anon-callable, returns ONLY active vocabulary rows for that language
  (`word, reading, meaning, level, sort_order`) — no user data, mirroring the
  `public_story` data-minimization pattern. RLS on `vocabulary` stays
  authenticated-only; this is the single anon door. Migration in
  `supabase/migrations/`, plus `notify pgrst, 'reload schema'`.
- **Reference corpus** — a small bundled file `data/assessment-corpus.chinese.json`
  (~10 short everyday sentences authored from in-level vocab). The result % is
  computed over this fixed corpus so the number is stable, explainable, and means
  the *same thing* as the app's in-story "% known."

### The estimate (correctness-critical)

1. **Bands** — partition the language's active vocab into difficulty bands by
   `(level, sort_order)`. With Chinese levels 1–2 today, use ~4 bands
   (L1-frequent, L1-rest, L2-frequent, L2-rest). Bands are derived, not hardcoded,
   so more levels extend them automatically.
2. **Question selection** — sample ~3 questions per band (12 total), each a
   4-option MCQ (meaning↔word, three same-band distractors), from
   `public_assessment_vocab`.
3. **Scoring → known set** — compute per-band accuracy; find the **known frontier**
   (highest band the user still answers reliably, e.g. ≥⅔ correct, with a
   monotonic/decay rule so one lucky high-band guess doesn't inflate). The
   estimated known-vocab set = all vocab at/below the frontier → synthesized as
   `{ [vocabId]: { state: 'review' } }` cards (same shape `assumedKnownCards`
   already produces).
4. **% + label** — `% = calculateStoryReadability(knownCards)` over the reference
   corpus; the level label maps from the frontier band ("Just starting" / "around
   HSK 1" / "around HSK 2"). Exact thresholds finalized in the plan with a couple
   of hand-checked fixtures.

### Analytics
Anon funnel events mirroring the public-story events, feeding the existing
dashboard: `assessment_started`, `assessment_completed` (with score bucket),
`assessment_signup_clicked`.

## Error handling
- RPC failure / empty vocab → friendly "couldn't load the test, try again" state
  (never a blank screen); `console.error` for diagnosis, matching `PublicStory`.
- Too few usable words in a band → fall back to fewer questions rather than
  erroring (the estimate degrades gracefully; `buildQuestions` already guards
  `< 4` usable words).
- Signed-in visitor → result CTA links home instead of the signup gate.

## Testing
- **`assessment.test.js`** — band construction; question selection shape/count;
  scoring edge cases (all right, all wrong, one lucky high guess, sparse bands);
  the frontier→known-set mapping; a fixtured end-to-end score→% check.
- Reuse existing `storyReading` / readability tests for the % engine (unchanged).
- An e2e happy-path (intro → answer 12 → see a result) added to the Playwright
  suite with a mock `public_assessment_vocab`, mirroring `reader.spec.js` fixtures.

## Deploy notes
- Apply the `public_assessment_vocab` migration (Supabase) before the page works;
  until then the page shows the friendly error state (no crash).
- Author `data/assessment-corpus.chinese.json` before launch.
