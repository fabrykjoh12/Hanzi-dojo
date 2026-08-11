# P11 — the Practice hub

*2026-08-11. Audit and three proposals. **Nothing here is implemented.** Measured
on `5c358f7` (TestFlight build 39) at 390×844, both themes, with the e2e mock
account; usage figures come from the live database.*

Home, Stories, Profile, navigation and Study are frozen as of build 39. Practice
is the one screen still carrying the app's most repetitive pattern.

---

## 1 · What is on the screen today

Twelve major surfaces, 1.88 viewports at 390. Every visible action, classified —
and, where it can be measured, what learners actually do with it.

### The one recommendation

| Action | Class | Destination | Notes |
|---|---|---|---|
| Hero — Weak words / Grammar review / **Listening** | **primary / recommended** | `weak`, `grammarpractice`, `listen` | `pickPrimary()` promotes whatever has a real count; with nothing waiting it is always Listening. Lit accent panel, ~230px. |

### The progression gate

| Action | Class | Destination | Notes |
|---|---|---|---|
| `HSK 2 test` row | **level / progression** | `test` | One wide row under the hero, with a mastery bar and "Unlocks at 40 mastered words". Always openable; `Test.jsx` owns the real rule. |

### The eight drill tiles — 2-column grid, all identical, 173×~122

| # | Tile | Class | Persists? | Measured use |
|---|---|---|---|---|
| 1 | Weak words | **core** | `cards.lapses` | 6 stuck cards across **2** learners — the drill's own input barely exists yet |
| 2 | Grammar review | secondary | `grammar_reviews` | **1 row, 1 user, ever** |
| 3 | Listening | **core** | — | unmeasurable (no persistence, no event) |
| 4 | Speaking | secondary | — | **not shown in the store apps at all** — `speechRecognitionSupported()` is false in a webview, so iOS/Android see 7 tiles, not 8 |
| 5 | Writing | secondary | `writing_stats` | **18 rows, 2 users, ever** |
| 6 | Fill in the blank | secondary | — | unmeasurable |
| 7 | Sentence builder | secondary | — | unmeasurable |
| 8 | Tones (script drill) | secondary | — | unmeasurable |
| 9 | Stroke order (CJK only) | secondary | — | unmeasurable |

### Six tool rows — one panel, hairline-separated

| Tool | Class | Destination | Notes |
|---|---|---|---|
| Word list | lookup | `words` | |
| Words you already know | lookup | `known` | |
| Dictionary | lookup | `dictionary` | |
| Analyze text | lookup | `analyzer` | `text_analyzed`: 4 events, 1 user |
| Grammar guide | lookup | `grammar` | |
| Videos | lookup | `youtube` | **3 curated rows exist in the whole database** |

### What the data says, and what it cannot

For scale: the live project has 27 card-owning accounts, 2,956 review logs and 52
story reads — a tester pool, not a consumer base. Within it:

- **The core loop is the only thing with real traction.** `study_session_started`
  511 across 25 users; `story_opened` 184 across 7.
- **Of the three drills that write anything down, all three are near-zero.**
  Writing 2 users, Grammar review 1 user, Analyze text 1 user.
- **Nobody has ever finished a level test.** `test_attempts` is empty and
  `level_unlocks` has 0 rows — the row is inserted on *finish*, so this is not a
  reporting gap. Four Chinese tracks sit past level 1, which is the prior-knowledge
  claim at signup, not a passed test. Mastery needs FSRS stability ≥ 21 days on
  90% of a level; a tester pool weeks old cannot reach it. **Prominence will not
  fix that, and the redesign should not pretend otherwise.**
- **Five of the eight drills cannot be measured at all.** No drill screen calls
  `trackEvent` — there is no `practice_drill_started` event anywhere. So "which
  drills deserve weight" is, today, unanswerable by evidence for most of the grid.

**Recommendation before any layout is chosen: instrument the drills.** One event
(`practice_drill_started`, `{ key }`) on entry to each drill, which is a ~10-line
change in `analytics.js` plus one call per drill screen. Then the next iteration of
this screen is a measurement rather than a debate. It is proposed separately
because it touches drill screens, which this pass is not supposed to redesign.

### Do all eight deserve equal visual weight?

**No** — and the current layout is the only thing claiming they do. Structurally
they are three different kinds of thing:

1. **SRS-adjacent cleanup** — Weak words, Grammar review. These have *counts*.
   They are the only tiles that can ever say "something is waiting", and the hero
   already promotes them when they do.
2. **Comprehension and production practice** — Listening, Fill in the blank,
   Sentence builder, Speaking. Optional, repeatable, no state.
3. **Script and form** — Tones, Stroke order, Writing. Reference-ish drilling,
   opened deliberately and rarely.

An 8-cell grid of identical cards flattens all of that into "here are eight
equally important things", which is both false and the exact template look the
audit set out to remove.

---

## 2 · Three layouts

All three keep: the hero, the level test, all destinations, all tools, ≥44px
targets, the navigation model, and C1's chip removal. Heights are estimates from
the measured component heights of build 39 (hero 230, test row 110, a 52px row, a
122px tile, 26px section gaps, 64px page padding).

### Option A — Guided Practice

The screen answers *what should I practise right now?* once, then gets out of the
way. The eight tiles become one compact list.

```
Practice                              HSK 2

┌─────────────────────────────────────────┐
│ START HERE                          ⌾   │  lit · the recommendation
│ Listening                               │  230px, unchanged
│ Nothing is overdue. Hear a word and     │
│ pick it out — the fastest way to make   │
│ reading words into words you know.      │
│ [ Start listening → ]                   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ⚠ Weak words              6  ›          │  counts lead, and only
│ ──────────────────────────────          │  these two can carry one
│ ↻ Grammar review          3  ›          │
│ ──────────────────────────────          │
│ ✎ Writing                    ›          │  everything else, one
│ ──────────────────────────────          │  row each, no descriptions
│ ▤ Fill in the blank          ›          │
│ ──────────────────────────────          │
│ ⧉ Sentence builder           ›          │
│ ──────────────────────────────          │
│ ♪ Tones                      ›          │
│ ──────────────────────────────          │
│ ✏ Stroke order               ›          │
└─────────────────────────────────────────┘

HSK 2 test                    0 of 44 mastered
▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  ›
Unlocks at 40

Look things up
┌─────────────────────────────────────────┐
│ Word list · Dictionary · … (6 rows)     │
└─────────────────────────────────────────┘
```

- **Height at 390:** ~1,180px (**1.40 vp**) — down from 1,585.
- **Major surfaces:** 4 — hero, drill list, tools list, and the test row (which
  becomes an open row with a bar rather than a bordered card).
- **Drills immediately visible:** all 7 (native) / 8 (web) inside the first
  viewport — the list ends at ~770px.
- **Tappable:** hero, 7 drill rows, test row, 6 tool rows. Unchanged set.
- **Hierarchy:** lit hero → rows with counts → rows without → progression →
  reference. Four levels, each drawn differently.
- **Advantages:** the recommendation is unmistakable; the grid's template look is
  gone entirely; the whole screen fits in 1.4 viewports; drill descriptions
  ("Type words from memory") move into the drill screens where they belong, and
  their absence is what makes the list compact.
- **Disadvantages:** losing the one-line descriptions costs discoverability for a
  new learner who does not know what "Sentence builder" is; a list of 7 identical
  rows plus a list of 6 identical rows is *a new repetition risk* if the two are
  not visually differentiated; icons at row scale (18px, no chip) carry less
  personality than the tiles did.
- **Engineering:** moderate. New `DrillRow`; `practicePlan.js` unchanged except
  dropping `desc` from the rows it emits (or keeping it for a11y); the test row
  restyled; tiles deleted.

### Option B — Skill groups

```
Practice                              HSK 2
┌──────────── lit hero, as above ─────────┐

Recall
⚠ Weak words   6 ›   ↻ Grammar review 3 ›

Listening
♫ Listening      ›   ♪ Tones           ›

Writing
✎ Writing        ›   ✏ Stroke order    ›

Producing
▤ Fill in the blank › ⧉ Sentence builder ›

HSK 2 test …
Look things up …
```

- **Height at 390:** ~1,410px (**1.67 vp**).
- **Major surfaces:** 2 if the groups are open rows under headings (hero + tools);
  6 if each group gets a panel.
- **Drills immediately visible:** ~6 of 8 — the fourth group starts below the fold.
- **Tappable:** identical set.
- **Hierarchy:** hero → four named skill areas → progression → reference.
- **Advantages:** teaches the *shape* of the practice on offer; a learner looking
  for listening work knows where to look; groups make room to add drills later
  without the grid growing.
- **Disadvantages:** **the taxonomy is invented, and this repo has already learned
  that lesson twice.** `navConfig.js`: *"Five links do not need a taxonomy — the
  labels were inventing structure to look organised, which is the exact thing that
  makes an interface feel generated."* Nine drills across four headings averages
  2.2 items per group, so the headings cost more height than they organise. Weak
  words is SRS cleanup, not a skill, and fits none of the four honestly. Four
  headings is also four more type styles.
- **Engineering:** highest. A `group` field per drill in `practicePlan.js`, new
  grouping logic and tests, and a rule for where a new drill belongs.

### Option C — Compact drill library

Everything stays equally available; only the grid's *shape* changes.

```
Practice                              HSK 2
┌──────────── lit hero, as above ─────────┐

Drills
┌─────────────────────────────────────────┐
│ ⚠ Weak words          6 keep slipping ›│
│ ↻ Grammar review          3 due       ›│
│ ♫ Listening      Hear a word, pick it ›│
│ ✎ Writing     Type words from memory  ›│
│ ▤ Fill in the blank                   ›│
│ ⧉ Sentence builder                    ›│
│ ♪ Tones                               ›│
│ ✏ Stroke order                        ›│
└─────────────────────────────────────────┘
HSK 2 test …
Look things up …
```

- **Height at 390:** ~1,300px (**1.54 vp**).
- **Major surfaces:** 4 — hero, drill panel, test row, tools panel.
- **Drills immediately visible:** all 8, the list ending at ~820px.
- **Tappable:** identical set.
- **Hierarchy:** hero → one flat list of equals → progression → reference. Three
  levels; within the list, only the count differentiates.
- **Advantages:** smallest behavioural change; keeps the descriptions; no invented
  taxonomy; the densest option per pixel.
- **Disadvantages:** it does not answer *what should I practise now?* any better
  than today — the hero does all that work alone; **two 6–8 row lists of the same
  shape stacked is a fresh repetition risk**, the flat-list version of the same
  complaint; a learner still faces eight equal choices.
- **Engineering:** lowest — a `DrillRow` and the grid deleted.

---

## 3 · Recommendation — **Option A**

It is the only one of the three that changes what the screen *says*, not just how
it is drawn. Practice's job is to answer one question, and A answers it with a lit
recommendation and then makes everything else quiet and cheap to scan. It also
lands the shortest screen (1.40 vp) and the only layout where every drill is
reachable without scrolling.

Two amendments to A, from the evidence above:

1. **Keep a short description on the rows that need one.** Drop it from the
   self-evident rows (Listening, Writing, Tones, Stroke order) and keep it where
   the name genuinely is not enough (Fill in the blank, Sentence builder, Grammar
   review). Uneven by design — a description on every row is what makes a list
   look templated.
2. **The test row stays honest rather than loud.** Nobody has finished one; the
   requirement, not the button, is the obstacle. It keeps its mastery bar and its
   plain "Unlocks at 40", as an open row rather than a card.

Option B is the one to revisit *if* instrumentation later shows learners hunting
for a particular kind of practice. Option C is the fallback if A's compact rows
prove too anonymous on a device — it is a small delta from A, not a rethink.

---

## 4 · What would be touched

| File | Change |
|---|---|
| `src/Practice.jsx` | `DrillTile` → `DrillRow`; the grid becomes one panel of rows; `LevelTestRow` restyled to an open row; tools panel unchanged |
| `src/practicePlan.js` | `desc` becomes optional per drill (amendment 1). Ordering, primary pick, level-test entry all unchanged |
| `src/practicePlan.test.js` | Cases for which rows carry a description |
| `tests/e2e/practice.spec.js` | Locators move from tiles to rows; the More-sheet spec is untouched |
| `tests/e2e/practice-shape.spec.js` *(new)* | The shape contract, as Home and Profile have |

Not touched: every drill screen, `Test.jsx`, the tools, the navigation model,
`navConfig.js`, and the icon set.

---

## 5 · Risks

1. **Rows can read as anonymous** where tiles read as inviting. This is the real
   risk of A and the reason C exists as a fallback. A device round decides it.
2. **Two stacked row lists** (drills, then tools) could recreate the repetition in
   a new shape. Mitigation: the drill rows carry a 17px icon, a 14.5px/700 title
   and an optional count; the tool rows stay single-line, muted, 13.5px. If they
   still rhyme on a device, the tools panel becomes a disclosure ("Look things up
   ›") instead.
3. **Discoverability of unfamiliar drills** drops with the descriptions. Amendment
   1 is the mitigation; a first-run learner is also unlikely to arrive here before
   the tutorial has taught the loop.
4. **Speaking's absence in the app is invisible in the sandbox.** Any local render
   shows 8 rows where an iPhone shows 7. Every measurement in this document notes
   which it is.
5. **`counts.weakCount` / `grammarDueCount` are Home's counts.** They drive both
   the hero and the row badges; if they are stale the recommendation is stale. Not
   a new risk, but a redesign that leans harder on the recommendation inherits it.

---

## 6 · Testing strategy

- **Unit (`practicePlan.test.js`)** — extend the existing suite: the primary is
  never repeated in the list; counted drills lead; a drill without a description
  still renders a title; the script/CJK/speech gating is unchanged. All pure.
- **E2E (`practice.spec.js`)** — every existing assertion about destinations must
  survive: each drill row navigates where its tile did, the level test opens, the
  tools open, and the level test is still absent from the More sheet.
- **E2E (`practice-shape.spec.js`, new)** — the contract, in the shape Home and
  Profile now have: exactly one lit surface; no card inside a card; no decorative
  icon container (no bordered/tinted box under 60px around an icon); every row
  ≥44px at 320/390/430; no horizontal overflow; the type-style count.
- **Renders** — 320/390/430 in both themes, plus the three hero states (weak words
  waiting, grammar due, nothing overdue) since the hero's copy and colour change
  with them.
- **Instrumentation (proposed separately)** — `practice_drill_started` so the next
  pass measures instead of guessing.
