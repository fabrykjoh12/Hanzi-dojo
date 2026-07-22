# 📋 PM Board — milestone, tasks, parallel execution

**Internal. Not synced to Discord.** (`roadmap-live-sync.yml` only mirrors
`ROADMAP.md` → `#roadmap` and `docs/BACKLOG.md` → `#backlog`. This file is the
task board: ownership, branches, acceptance criteria, merge order. Keeping it
out of the sync path is deliberate — Discord stays a product view, not a
sprint board.)

Companion docs: [`ROADMAP.md`](../ROADMAP.md) (what users see) ·
[`docs/BACKLOG.md`](BACKLOG.md) (engineering backlog) · [`TASKS.md`](../TASKS.md)
(the owner's personal wishlist, maintained externally — product signal, not a
work queue) · [`Claude.md`](../Claude.md) (architecture + conventions, read first).

_Baseline for this board: `origin/main` @ `2645ca8`. Unit suite **665 passing
across 67 files**._

---

## Product Vision

A calm, free language app built on the two methods that actually work: **FSRS
spaced repetition** and **level-matched immersion**. No streaks, no leagues, no
guilt — the streak and XP systems were deliberately removed because they cut
against that promise. The learner never hunts for comprehensible material:
stories at their level come to them, every word tappable and addable to the
deck. Chinese (HSK 3.0), Japanese (JLPT), Russian (CEFR) today; the architecture
is language-agnostic by design.

## Current Product State

**Strong and shipping fast.** 665 unit tests across 67 files, all green;
Playwright e2e covers the main screens. Recently landed: the streak/XP removal,
a calmer Home and session recap, the pre-signup "wow moment" onboarding (read a
real Chinese sentence before signing up), a 123k-entry Pleco-style reference
dictionary with 77k Tatoeba examples, flashcard-anything, and **HSK 3–6
vocabulary — ~1,870 more Chinese words with example sentences and audio.**

### 🔴 The live problem this milestone fixes

HSK 3–6 **vocabulary is seeded and live**, so learners can advance into levels
3, 4, 5 and 6 today. HSK 3–6 **stories do not exist** — `docs/BACKLOG.md` records
that `serial-hsk3-6` runs but the "plan season" call hits the Gemini free-tier
**429 on every level → `Published 0`**.

And `src/Stories.jsx` still loads stories with:

```js
.eq('level', track.current_level).eq('is_published', true)
```

So **the moment a learner advances past HSK 2, the Stories screen — the app's
core differentiator — goes completely empty, with no route back to the 38-odd
HSK 1–2 stories they can still read.** Review cards are already cumulative
(`levelScope.studyFloorLevel`); reading is not. This is in production now, and
it lands on the most motivated learners: the ones who just passed a level test.

Compounding it, `src/storyTiers.js` holds one Chinese tier table applied to
*every* Chinese level, describing "the first 100 most common **HSK 1** words" —
so even at HSK 2 the tier copy is already wrong. The backlog flags this as
"cosmetic"; with levels 3–6 now reachable it is not.

**Blocked and not fixable by a coding session:** generating HSK 3–6 stories
needs an LLM quota the project doesn't have. That is an owner action — see
*Owner actions* below. TASK-001 is deliberately designed so the product stops
dead-ending **whether or not** that unblocks.

---

## Current Milestone

### M1 — No reading dead-end: a cumulative, level-aware story shelf

**Objective:**
Reading becomes cumulative, the way review already is. A learner at any level
sees every story from every level they have reached — so advancing a level adds
to the shelf instead of emptying it — and each story is gated and described by
its own level's tiers, never HSK 1's.

**Why this is the right next milestone:** it is the only candidate that is
simultaneously (a) a live, in-production dead-end on the flagship feature,
(b) fixable entirely in-repo with no external dependency, and (c) worth ~38
immediately readable stories to every HSK 2+ learner without writing a single
new one. Every other roadmap item is additive polish, blocked on quota, or
architectural work that should follow, not precede, a working core loop.

**Success criteria:**

- [ ] A learner at level N sees published stories from levels 1…N, grouped and clearly labelled, current level first.
- [ ] Each story is gated by its own level's tier thresholds, with copy naming that level.
- [ ] No learner loses access to a story they can read today.
- [ ] Advancing to a level with no stories of its own still shows a full shelf plus an honest note about that level's stories.
- [ ] The no-LLM authored-story lane is usable for HSK 3 (so content is not hostage to Gemini quota).
- [ ] Unit suite green (≥665) and the story e2e spec passes.
- [ ] `ROADMAP.md` and `docs/BACKLOG.md` reflect the shipped state.

**Out of scope for M1:** generating HSK 3–6 stories (owner action, quota);
authoring the story content itself (follows TASK-002); HSK 7–9; Japanese N3+ /
Russian A2+; the global word-status model.

---

## Parallel Execution Plan

### Ready now
- **TASK-001** — cumulative + level-aware story shelf (frontend / pure logic)
- **TASK-002** — unblock the no-LLM authored-story lane for Chinese HSK 3 (content ops / scripts)

These two share **zero files**. 001 owns app screens and `src/storyTiers.js`;
002 owns `.github/workflows/`, `src/authoredStories.test.js`, and docs.

### Waiting
- **TASK-003** — integration + QA verification. Starts only after 001 and 002 are both merged.

### Shared ownership risks
- **Semantic coupling, not file conflict:** `storyTiers.js` (001) and the
  `CONFIGS` tier caps in `generate-serial-stories.mjs` (002 does **not** edit it)
  describe the same thresholds. Resolved by the **pinned contract** below, so
  neither session needs to coordinate with the other.
- `docs/BACKLOG.md` and `ROADMAP.md`: **only TASK-003** edits these. 001 and 002
  update only their own section of *this* file.
- `src/Stories.jsx` is touched by 001 only. `.github/workflows/regen-content.yml`
  by 002 only.

### Contract — Chinese story tier thresholds (pinned, both sessions obey)

Gating is done **entirely by `src/storyTiers.js`** — `stories.tier_min_words` is
written by the generator but never read for gating, so the app table is
authoritative. The caps below mirror `generate-serial-stories.mjs` `CONFIGS`
(the word ranges stories were actually written against).

| Level | Tier 1 minWords / cap | Tier 2 | Tier 3 |
|-------|----------------------|--------|--------|
| HSK 1 (level 1, 300 words) | 0 / 100 | 100 / 200 | 200 / 300 |
| HSK 2 (level 2, 198 words) | 0 / 66 | 80 / 132 | 130 / 198 |
| HSK 3–6 (levels 3–6, ~500 words each) | 0 / 170 | 110 / 340 | 220 / 500 |

Rules that produced this table, and that any future level must follow:
1. **Tier 1 is always `minWords: 0`** — a learner entering a level can read
   immediately (the principle documented at the top of `storyTiers.js`). The
   generator's `CONFIGS` use 30–40 here; the app overrides to 0 on purpose.
2. Tiers 2 and 3 adopt the generator's per-level `minWords` (HSK 2: 80/130;
   HSK 3–6: 110/220) and its `cap` values for the word-range copy.
3. **No threshold may increase for a level that has published stories today**
   (levels 1 and 2). HSK 2 moves 100→80 and 200→130: strictly more generous, so
   nobody loses a story. HSK 1 is unchanged. Levels 3–6 have no stories yet, so
   their thresholds are new gates over content that does not exist — the
   monotonicity rule does not bind there.
4. Verify levels 4–6 in `CONFIGS` match level 3's shape before relying on the
   merged row; if one differs, give it its own row rather than bending the table.

### Recommended session count
**2 implementation sessions now, 1 integration/QA session after both merge.**
A third parallel implementer would have to touch `Stories.jsx` or the workflow
file and would only create conflicts — not worth it for this milestone.

### Recommended merge order
1. **TASK-002** first (workflow + test-fixture wiring; no app-behavior change, so
   it cannot disturb 001's review).
2. **TASK-001** second (app behavior).
3. **TASK-003** integration/QA on the merged result.

Order is a preference, not a hard dependency — either may land first.

---

## Active Tasks

### TASK-001 — Cumulative, level-aware story shelf

**Status:** Complete (merged to main in PR #113, 2026-07-22)
**Priority:** Critical
**Owner:** Unassigned
**Branch:** `claude/cumulative-story-shelf`
**Dependencies:** None
**Conflict risk:** Low (no file overlap with TASK-002)
**Estimated scope:** Medium

#### Objective

A learner at HSK 3 sees the HSK 1 and HSK 2 stories they can still read, each
gated by its own level's tiers and described in its own level's words — so
advancing a level never empties the Stories screen, today or after HSK 3–6
stories exist.

#### User value

Right now, advancing past HSK 2 turns the app's flagship feature into an empty
panel with nothing to tap — at the exact moment a learner has just passed a
level test and is most invested. This fix restores ~38 readable stories to every
affected learner, enables re-reading (one of the most effective immersion
practices), and makes the shelf grow monotonically as a learner progresses.

#### Scope

- Rework `src/storyTiers.js` so tier tables are keyed by **language + level**,
  not language alone. Export a resolver (e.g. `tiersFor(language, level)`)
  returning the tier list for a level, falling back to the language's existing
  table for any level with no explicit entry.
- Populate the Chinese table from the **pinned contract** above (levels 1–6).
  Japanese and Russian keep their current tables as their fallback — no
  behavior change for those languages in this task.
- Tier `description`/`wordRange` copy must name the level it belongs to
  ("the first 170 most common HSK 3 words"), never hardcoded to HSK 1.
- `src/Stories.jsx`: load published stories for **every level ≤ `track.current_level`**
  (replace `.eq('level', ...)` with `.lte(...)` at line ~311) and present them
  grouped by level, current level first, lower levels labelled via
  `getLevelLabel`. Preserve the offline snapshot caching — the cache key embeds
  `current_level`, which stays correct since the cumulative set is a function
  of it.
- Gate each story by the tiers of **its own level**, not the learner's current level.
- Update the tier-list consumers so they respect per-level tiers:
  `src/dailyStory.js` (today's pick may now come from any reached level),
  `src/readingLadder.js`, `src/storyMatch.js`, and the post-study recap's story
  recommendation.
- Keep the "no stories at all" empty state, and add an honest note when the
  *current* level has none but lower levels do (e.g. "HSK 3 stories are on the
  way — here's everything else you can read").

#### Out of scope

- `generate-serial-stories.mjs`, `data/`, `.github/workflows/` (TASK-002 territory).
- Japanese/Russian per-level tables beyond the existing fallback.
- New story content or generation; reader-format changes.
- `src/levelScope.js` or the review/card queue.

#### Ownership boundaries

May modify: `src/storyTiers.js`, `src/storyTiers.test.js`, `src/Stories.jsx`,
`src/dailyStory.js`, `src/readingLadder.js`, `src/storyMatch.js`, their `.test.js`
siblings, the recap component that recommends a story, and `tests/e2e/` +
`tests/fixtures/mockSupabase.js` where needed for coverage.

Must NOT modify: `data/**`, root `*.mjs`, `.github/workflows/**`, `ROADMAP.md`,
`docs/BACKLOG.md`, any migration, or `src/levelScope.js`.

#### Expected files and systems

`src/storyTiers.js` (resolver), `src/Stories.jsx` (query + grouped list UI),
`src/dailyStory.js` / `src/storyMatch.js` / `src/readingLadder.js` (consumers),
plus tests. Supabase table: `stories` (read only).

#### Dependencies and contracts

Thresholds come from the pinned contract table — do not invent numbers.
`nextLockedTier(categories, learnedCount, tiersWithStories)` keeps its current
signature; only what is passed as `categories` changes.

#### Acceptance criteria

- [ ] `tiersFor(language, level)` returns the pinned thresholds for Chinese levels 1–6 and falls back sensibly for other levels/languages, covered by unit tests.
- [ ] Tier 1 is `minWords: 0` for every level.
- [ ] A test asserts no Chinese tier threshold for **levels 1 and 2** exceeds today's 0/100/200.
- [ ] Stories screen at `current_level = N` lists published stories from levels 1…N, grouped, current level first, each group labelled via `getLevelLabel`.
- [ ] A story from a lower level is gated by that lower level's tier thresholds.
- [ ] Today's-story pick, the reading ladder, and the post-study story recommendation all still work and can draw on the cumulative set.
- [ ] The "no stories" empty state still renders when there genuinely are none; when the current level has none but lower levels do, the shelf shows those plus an honest note.
- [ ] Offline story snapshot caching still works.
- [ ] `npx vitest run` green with new tests for the resolver, the monotonicity guard, and cumulative selection.
- [ ] The story e2e spec passes; extend `tests/fixtures/mockSupabase.js` so a second level's stories exist and the track sits at level 2+.

#### Required states

- [ ] Loading
- [ ] Empty (no stories anywhere)
- [ ] Empty-at-current-level-but-not-below
- [ ] Error
- [ ] Success
- [ ] Mobile / tablet / desktop
- [ ] Keyboard accessibility (group headings and story cards reachable; real `<button>`s)
- [ ] Offline (cached snapshot)

#### Validation

- [ ] `npx eslint src` — no new errors (baseline is 0)
- [ ] `npx vitest run`
- [ ] Playwright story spec
- [ ] `npm run build`
- [ ] Manual mobile + desktop pass over Stories at a multi-level track

#### Completion notes

Branch `claude/cumulative-story-shelf`, 5 commits. Unit **696 passing across
67 files** (baseline 665 → +31 new). Playwright **51/51 green** (baseline 44 →
+7 new). `npm run build` green.

**What shipped**

- **`src/storyTiers.js` rewritten around a (language, level) key.** New
  `tiersFor(language, level)` builds the tier list with copy that names the
  level ("Short stories from the first 170 most common HSK 3 words"), falling
  back to the language's default table for any level with no explicit entry
  and to Chinese for an unknown language. Chinese levels 1–6 populated exactly
  from the pinned contract. Results are memoized per (language, level) and are
  shared instances — callers copy before tagging (see `categoryForStory`),
  never mutate.
- **Three new pure helpers** so the Stories screen and the recap gate
  identically: `learnedByLevel(vocabRows, cards)`, `storyLevels(stories,
  currentLevel)` (current level first, then descending; rows above the current
  level dropped), and `readingGateCount({level, currentLevel, learnedAtLevel,
  tiers})`.
- **`readingGateCount` — the one judgement call not spelled out in the task.**
  A level *below* `current_level` counts as complete, so all its tiers open.
  Rationale: to be past a level you either passed its test (100% correct at 90%
  mastery) or were placed above it, and in the placed case your real learned
  count at that level is 0 forever — gating on it would permanently lock HSK 1
  stories for exactly the learners this milestone is meant to help. The current
  level still gates on real progress. Tested both ways.
- **`src/Stories.jsx`:** query is now `.lte('level', current_level)` ordered
  level-desc; the category screen renders one `<section>`/`<h2>` group per
  level with a "Your level" pill and a per-level read count; a shelf is one
  tier *at* one level, so gating, copy, the story list, "next story" and the
  tier-unlock nudge all resolve from the story's own level. Two refinements
  beyond the brief: empty tiers are hidden for levels the learner has already
  finished (noise below, motivation at the current level), and the level
  heading is omitted when there is only one group and it is the current level
  (every level-1 learner) so the common case gains no chrome.
- **Consumers:** `dailyStory` (`unlockedStories`/`pickDailyStory`) and
  `storyMatch.pickRecapStory` gained optional `tiersFor(level)` /
  `learnedFor(level)` resolvers; omitting them preserves the old flat
  `categories`/`learnedCount` behaviour byte-for-byte, so no other caller
  changed. `readingLadder` needed no API change — it is a pure function of a
  tier list, and the screen now hands it the current level's.

**Scope note:** the story recommendation the task assigns ("the post-study
recap component that recommends a story") is *computed* in `src/Study.jsx`
`loadStoryUnlock`, not in `SessionRecap.jsx` which only renders it. That
function was edited (query `.eq` → `.lte`, per-level gating via the shared
helpers); `SessionRecap.jsx` was not touched. No other part of `Study.jsx`
changed apart from dropping a now-unused `isLearned` import.

**Regression check — no story became unreachable.** HSK 1 thresholds are
byte-identical (0/100/200). HSK 2 moves 100/200 → 80/130, strictly more
generous. Everything previously visible is still visible, and every HSK 2+
learner gains the lower levels' shelves. The offline snapshot key
(`storiesdata:<lang>:<system>:<current_level>`) still matches the query
exactly, because the cumulative set is a pure function of `current_level`.

**CONFIGS check (read-only, as instructed):** `generate-serial-stories.mjs`
levels 4, 5 and 6 have identical `minWords` (40/110/220) and `cap`
(170/340/500) to level 3 — only `minCov`/`maxMisses` differ, which the app
never reads. The merged HSK 3–6 row in the contract table is therefore correct
as written; no extra row needed.

**Test fixture:** `tests/fixtures/mockSupabase.js` gained `st5` at level 1
(the track was already at `current_level` 2). It is deliberately tier 3, not
tier 1 — the mock ignores query filters, so a second tier-1 story would make
"First Steps" ambiguous and break every existing reader spec's locator. Being
tier 3 also makes it a live assertion of per-level gating: that threshold is
open at HSK 1 (passed) while still locked at HSK 2.

**Known limitations / not done (deliberate)**

- `pickRecapStory`'s fallback nudge ("learn N more to unlock X") still reads
  the flat `categories`/`learnedCount` pair. It only renders when *nothing* is
  unlocked anywhere, which on a cumulative shelf means the learner is at level
  1 — where cumulative and current-level are the same thing. Left alone rather
  than adding a parameter for an unreachable case.
- `npx eslint src` reports **2 errors / 6 warnings**, unchanged from the base
  branch (`HowMuchCanYouRead.jsx` unused `useMemo`; `Dashboard.jsx`
  set-state-in-effect). The task brief states a 0-error baseline; the actual
  baseline on `origin/worktree-pm-hsk3-milestone` is 2, verified by stashing.
  **No new errors were introduced** — both pre-date this branch and are outside
  its scope.
- Real-device / live-Supabase verification not possible from this sandbox
  (screenshot pass done at 1280px and 390px against the mock).

---

### TASK-002 — Unblock the no-LLM authored-story lane for Chinese HSK 3

**Status:** Complete (merged to main in PR #112, 2026-07-22)
**Priority:** High
**Owner:** Unassigned
**Branch:** `claude/authored-lane-hsk3`
**Dependencies:** None
**Conflict risk:** Low (no file overlap with TASK-001)
**Estimated scope:** Small–Medium

#### Objective

Make it possible to write HSK 3 stories **by hand, with no LLM and no quota** —
the path `Claude.md` already calls the preferred quality lane — by adding the
vocabulary-dump workflow tasks and extending the authored-story validator to
cover Chinese levels, so a future session can author a season that is guaranteed
tappable.

#### User value

HSK 3–6 stories are currently hostage to a Gemini free-tier 429. The authored
lane needs no LLM at all, but today it is wired only for `japanese|jlpt|1`: the
validator has one snapshot (`data/jlpt1-vocab-snapshot.json`) and
`regen-content.yml` has no `authored-vocab-hsk3` dump task. This task removes
that blocker so content can proceed regardless of quota.

#### Scope

- Add `authored-vocab-hsk3` (and `-hsk4`, `-hsk5`, `-hsk6`) tasks to
  `.github/workflows/regen-content.yml`, mirroring the existing
  `authored-vocab-hsk1` / `authored-vocab-hsk2` blocks exactly (same script,
  same flags, level changed). Add each new value to the `task` input `options`.
- Extend `src/authoredStories.test.js` so its `SNAPSHOTS` map accepts a Chinese
  entry keyed `chinese|hsk_3|3` pointing at `data/hsk3-vocab-snapshot.json`,
  **loaded only if the file exists** — the suite must stay green before the
  owner runs the dump (the existing code already does structural-only checks
  when a snapshot is absent; follow that pattern).
- Confirm the Chinese character-bible / known-speaker checks in that test apply
  correctly to a Chinese lane, and that Chinese names used by authored stories
  must exist in `src/characterNames.js` (`CHARACTER_READINGS`) so name-tap
  detection works. Document this requirement.
- Document the end-to-end authored flow for HSK 3 in the *Owner actions* section
  below: dump the pool → commit the snapshot → author into
  `data/authored-stories.json` → validate via `vitest` → dispatch
  `authored-insert`.
- Delete the stale `data/hsk3_level1.csv` (10 rows of HSK **1** sample data under
  a misleading name) **only if** nothing references it — grep first; if anything
  does, leave it and note why.

#### Out of scope

- Authoring the actual story content (a follow-up task, once the owner has run
  the dump and committed a snapshot).
- `generate-serial-stories.mjs` and the LLM path — untouched.
- Any `src/` app-screen change or anything TASK-001 owns.
- Running the dump (owner action; needs the Supabase service key).

#### Ownership boundaries

May modify: `.github/workflows/regen-content.yml`, `src/authoredStories.test.js`,
`data/hsk3_level1.csv` (delete, conditionally), and this file's TASK-002 +
*Owner actions* sections.

Must NOT modify: `src/Stories.jsx`, `src/storyTiers.js`, `src/dailyStory.js`,
`src/storyMatch.js`, `src/readingLadder.js`, any other app screen,
`generate-serial-stories.mjs`, `ROADMAP.md`, `docs/BACKLOG.md`, or any migration.

#### Expected files and systems

`.github/workflows/regen-content.yml` (new dump tasks),
`src/authoredStories.test.js` (snapshot map + Chinese lane),
`data/hsk3-vocab-snapshot.json` (**not** created here — produced by the owner's
dump run and committed later).

#### Dependencies and contracts

The snapshot file must be shaped exactly like `data/jlpt1-vocab-snapshot.json`
so `buildVocabMatcher` consumes it unchanged. The validator must degrade to
structural-only checks when a snapshot is missing — never fail the suite for an
absent file.

#### Acceptance criteria

- [ ] `authored-vocab-hsk3`…`hsk6` appear in the `task` input `options` and have matching run blocks that mirror the `authored-vocab-hsk2` block.
- [ ] Workflow YAML parses; new task names spelled identically in `options` and the run blocks.
- [ ] `src/authoredStories.test.js` has a Chinese snapshot entry that is optional-by-existence; `npx vitest run` is green **without** the snapshot present.
- [ ] A short comment or doc note states that Chinese authored stories must use names present in `src/characterNames.js`.
- [ ] The *Owner actions* section documents the full authored-lane flow for HSK 3 with exact task names.
- [ ] `data/hsk3_level1.csv` removed, or its retention justified in the completion notes after a grep.
- [x] `npx eslint .` — no new errors. `npm run build` passes.

#### Required states

Not a UI task. Instead:

- [x] Suite green with the snapshot absent (the state at merge time).
- [x] Suite green with a synthetic snapshot present (verify locally with a small fixture, then remove it).

#### Validation

- [x] `npx vitest run` (both with and without a temporary snapshot fixture)
- [x] `npx eslint .`
- [x] `npm run build`
- [x] Workflow YAML parse check

#### Completion notes

**Branch:** `claude/authored-lane-hsk3`. Files changed:
`.github/workflows/regen-content.yml`, `src/authoredStories.test.js`, this file.

**Workflow.** Added `authored-vocab-hsk3` / `-hsk4` / `-hsk5` / `-hsk6`, each a
verbatim mirror of the `authored-vocab-hsk2` block with only the `--level`
changed (`node authored-stories.mjs --list-vocab --language chinese --system
hsk_3 --level N`). All four are in the `task` input `options` list. Verified by
parsing the YAML and cross-checking every `options` value against every
`if [ "…" = "<task>" ]` run block: **no run block lacks an option, and no new
option lacks a run block.** (`meanings` and `examples` legitimately have no
`if`-block of their own — they are handled by the earlier `both` branch. That is
pre-existing.)

**Validator.** `SNAPSHOTS` is now built from a declarative `SNAPSHOT_FILES` map
filtered through `existsSync`, so an entry whose file is not committed is simply
dropped and that level falls back to structural-only checks. Added
`'chinese|hsk_3|3' → data/hsk3-vocab-snapshot.json`. **The snapshot file itself
was deliberately NOT created** — it is the owner's dump output.

Two supporting fixes were needed for the Chinese lane to actually validate:
- The `Intl.Segmenter` was hardcoded to `'ja'`. It is now chosen per language
  (`zh` for Chinese), matching the reader. Without this a Chinese story's
  unmatched runs would be tokenized with Japanese word-breaking.
- `KNOWN_SPEAKERS` gained a `chinese` bible **derived from
  `CHARACTER_READINGS.chinese`** plus a small role-noun allowlist
  (`妈妈/爸爸/朋友/老师/服务员/店员/医生/大家`). This makes the "Chinese authored
  stories must use names present in `src/characterNames.js`" rule *executable*,
  not just documented — a new personal name has to be added to
  `characterNames.js` or the suite fails. The rationale is spelled out in a
  comment above the constant.

The `unexplained kana reach words` test was renamed to `unexplained reach words`
since for Chinese it catches stray latin/digit runs rather than kana.

**Verification.** Baseline **665 passing / 67 files** was preserved exactly with
the snapshot absent. With a temporary synthetic Chinese pool wired in for
`chinese|hsk_3|1` (the 8 existing Chinese authored stories), the suite ran
**85 passing** in that file with the Chinese vocabulary checks active — and
truncating the pool made it fail with
`unmatched kanji/katakana: 没 | 问题 | 会 | 儿 | 见`, confirming the check is real
and that the `zh` segmenter produces proper word units (`问题`, not per-character).
Both temporary fixtures were deleted before committing; `git status` is clean of
them.

**`data/hsk3_level1.csv` was NOT deleted — it is still referenced.**
`grep -rn "hsk3_level1"` returns `src/pinyin.test.js:71`, which reads it as the
fixture for the "real HSK level-1 coverage" guard (`readingToPhonemes` must
convert every shipped reading with no fallback). The name is misleading (it is
HSK **1** data seeded under the `hsk_3` *system*, which is the DB's actual
`system` value for all Chinese levels — so the name is arguably correct and only
reads as "HSK 3"), but deleting it would break that test. Left in place. A
rename to `data/hsk3-system-level1.csv` plus a one-line update in
`pinyin.test.js` would be a safe follow-up if the ambiguity keeps costing time.

**Not done, deliberately:** no snapshot file created, no story content authored,
no `generate-serial-stories.mjs` change, no app-screen change (TASK-001 owns
those), no `ROADMAP.md` / `docs/BACKLOG.md` edit (TASK-003 owns those).

---

### TASK-003 — Integration + QA verification of M1

**Status:** Ready (TASK-001 and TASK-002 are merged; automated verification already done — see below)
**Priority:** High
**Owner:** Unassigned
**Branch:** `claude/m1-integration-qa`
**Dependencies:** TASK-001, TASK-002
**Conflict risk:** Medium (the only session that edits `ROADMAP.md` / `docs/BACKLOG.md`)
**Estimated scope:** Small

#### Objective

Prove M1 works on the merged tree, then record it: full suite + e2e + build
green, the cumulative Stories shelf verified by hand at several levels, and the
roadmap/backlog updated to match reality.

#### Scope

- Run the full unit suite, the full Playwright suite, `eslint`, and `npm run build` on merged `main`.
- Manually verify the Stories screen at `current_level` 1, 2 and 3: grouping, labels, per-level tier gating, both empty states, mobile width.
- Confirm no HSK 1 or HSK 2 learner lost access to any story (before/after threshold table).
- Confirm the new `authored-vocab-hsk3`…`hsk6` tasks appear in the Actions UI dropdown after merge.
- Update `ROADMAP.md`: move the shipped items from 🚧 Now into ✅ Shipped, in user-facing language, using `:`/`()` separators so the Discord renderer keeps the full line.
- Update `docs/BACKLOG.md`: amend the "HSK 3-6 stories — BLOCKED on LLM quota" entry to note the authored lane is now available as the no-quota path, and drop the "cosmetic" framing of the tier-label issue (now fixed).
- Update this file: set TASK-001/002/003 to Complete with completion notes, move M1 to a Completed section.

#### Out of scope

- New features or behavior changes. Report defects as follow-up tasks rather than fixing inline, unless trivial and clearly in-milestone.
- Running any content generation or dumps (owner actions).

#### Acceptance criteria

- [ ] Full `npx vitest run` green; full Playwright suite green (note any pre-existing failures explicitly).
- [ ] `npm run build` and `npx eslint .` clean.
- [ ] Manual Stories verification at three `current_level` values, findings written down.
- [ ] Threshold-regression check documented (before/after table).
- [ ] `ROADMAP.md`, `docs/BACKLOG.md`, and this board reflect the shipped state.

#### Already done by the PM session (2026-07-22, do not repeat)

Both PRs were verified independently before and after merge — do not re-run these
as if they were open questions; re-run them only as a regression check.

- Both branches merged locally first: `git merge-tree` clean, then the combined
  tree ran green. Merged with **merge commits, not squash**, deliberately: both
  PRs branched off the PM-board branch and both edited `docs/PM-BOARD.md`, so a
  squash of the first would have destroyed the shared ancestor and forced a
  whole-file conflict on the second.
- On merged `main` @ `89391e7`: `npx vitest run` → **696 passed / 67 files**;
  `npx playwright test` → **51 passed**; `npm run build` → clean.
- Scope audited on both PRs: no forbidden file touched.
- `ROADMAP.md`, `docs/BACKLOG.md` and this board updated to the shipped state.

#### What genuinely remains

1. **Manual multi-level pass on the Stories screen** — `current_level` 1, 2 and 3:
   grouping, level headings, per-level tier gating, both empty states, mobile
   width. This is the one thing automation did not cover.
2. **ESLint hygiene** (found by both sessions, confirmed by the PM session): the
   "0-error baseline" in `Claude.md` is stale. `npx eslint src` reports **2 real
   errors** — `Dashboard.jsx` (set-state-in-effect) and `HowMuchCanYouRead.jsx`
   (unused `useMemo`). `npx eslint .` reports **24** because it also lints
   `.claude/skills/**` tooling scripts that should be ignored outright. Fix the 2,
   add an ignore for `.claude/`, and correct the claim in `Claude.md`.
3. **Rename `data/hsk3_level1.csv`** (optional) — it is HSK *level 1* data, not
   HSK 3. `src/pinyin.test.js:71` depends on it, so a rename is a two-line change,
   not a deletion.

#### Completion notes

_Automated verification and doc updates done by the PM session (above). The
manual pass and the lint cleanup are still open._

---

## Owner actions (not session work)

These need credentials or billing that no coding session has.

### 🔴 Unblock HSK 3–6 story generation (the content blocker)
`serial-hsk3-6` currently returns `Published 0` — the "plan season" call hits a
Gemini free-tier 429 on every level. Either:
- enable **billing on the existing `GEMINI_API_KEY`** (cheap; large RPM increase), or
- set **`ANTHROPIC_API_KEY`** + optionally `LLM_MODEL_PREMIUM` as GitHub repo
  secrets — `llm.mjs`'s `premiumLlm()` prefers Anthropic when present.

Then re-run `serial-hsk3-6`, ideally with `story_tier: 1` first as a taste test.
⚠️ Never run it while another serial or `authored-insert` run is in flight
(`story_number` collision — `Claude.md` §0.00). Afterwards run `comprehension`
(chinese) and the matching `story-audio-*` task.

### The no-LLM alternative: the authored lane (wired up by TASK-002)

No LLM, no quota, no API spend — the path `Claude.md` §0.00 already calls the
preferred quality lane. Five steps, in order:

**1. Dump the pool.** Actions → *Regenerate vocabulary content* → Run workflow →
`task: authored-vocab-hsk3`. (Also available: `authored-vocab-hsk4`,
`authored-vocab-hsk5`, `authored-vocab-hsk6`, and the pre-existing
`authored-vocab-hsk1` / `authored-vocab-hsk2` / `authored-vocab-jlpt1` /
`authored-vocab-n4` / `authored-vocab-russian`.) The `language` input is ignored —
each task carries its own `--language/--system/--level`. The run prints the pool
between `---VOCAB-JSON-START---` / `---VOCAB-JSON-END---` markers in the log.

**2. Commit the snapshot as `data/hsk3-vocab-snapshot.json`.** ⚠️ The dump prints
rows of `{word, reading, meaning, sort_order}`; the snapshot file must be the
**reduced `[[word, reading], …]` pair array**, exactly like
`data/jlpt1-vocab-snapshot.json`, so `buildVocabMatcher` consumes it unchanged.
Reduce with:

```
node -e "const r=require('./raw.json');require('fs').writeFileSync('data/hsk3-vocab-snapshot.json',JSON.stringify(r.map(v=>[v.word,v.reading])))"
```

Until this file exists, `src/authoredStories.test.js` runs **structural-only**
checks for `chinese|hsk_3|3` (line length, speakers, English parallelism) — it
never fails for an absent snapshot. The filename and key are already wired.

**3. A session authors a season into `data/authored-stories.json`.** Each entry:
`{language:'chinese', system:'hsk_3', level:3, tier, tier_min_words, title,
english_summary, content, english_content, is_published}`. Dialogue uses the
**fullwidth colon `：`**. ⚠️ Every **personal name** must exist in
`src/characterNames.js` → `CHARACTER_READINGS.chinese`, or the reader translates
it character-by-character instead of showing the "Name" popup — the validator
enforces this for speakers via a bible derived from that map. Role nouns
(妈妈/朋友/老师…) are ordinary vocabulary and belong in the test's
`CN_ROLE_SPEAKERS` allowlist, **not** in `CHARACTER_READINGS`.

**4. Validate with `npx vitest run`.** With the snapshot committed, every chapter
is checked against the real pool using the **production matcher** — each hanzi run
must resolve to vocabulary or a known name, so the story is tappable by
construction. No LLM involved.

**5. Dispatch `authored-insert`.** It reads `data/authored-stories.json` and
assigns `story_number` as (current max for that language/system/level) + 1.
⚠️ **Never run it while a `serial-*` run is in flight** — serial runs read their
number counter once at start, so a concurrent authored insert grabs the same
range (`Claude.md` §0.00; repair with `publish-stories.mjs --fix-collisions`).
Afterwards, optionally run `comprehension` (chinese) and `story-audio-*` for
narration, and `story-images-list` → author covers → `story-images-apply`.

### Other outstanding one-time setup (unchanged by M1)
- **Public story links migration** — apply
  `supabase/migrations/20260716000000_add_public_story.sql` in the Supabase SQL
  editor; until then `/read/:id` shows "story not found".
- **Brevo/SMTP live send test**, **Supabase Auth URL allowlist**
  (`https://hanzi-dojo.com/**`), and **retiring the old GitHub Pages site** — see
  `docs/BACKLOG.md`.
- **Chinese TTS polyphone spot-check** on a real device (`TASKS.md`, high priority).
- **Reconcile the local checkout** — the working copy at
  `C:\Users\fabry\Documents\Koding\Projekt\Hanzi-dojo` was **36 commits behind
  `origin/main`** when this board was written, with untracked build artifacts
  (`complete.json`, `cedict_ts.u8`, `cmn-eng-pairs.tsv`, `data/hsk3-6.json`) in
  the root. Those artifacts are already superseded — the HSK 3–6 vocab they
  produced is seeded and live. Pull `main`, and delete or gitignore the leftovers
  rather than committing 26 MB of re-downloadable dumps.

---

## Next Milestone

### M2 — Read deeper, grade safely

**Objective:** the readers people actually use stop showing pinyin as an
all-or-nothing crutch, and the core grading write stops being able to leave
partial state behind.

**Why now:** M1 removed the reading dead-end but changed nothing about the
reading *experience*. Audit finding: `readingVisibleFor` (per-word,
status-driven reading display) is wired ONLY into `StoryReaderImmersive` — the
classic scroll reader. `PacedReader`, `ChatReader` and `SceneReader` render a
whole pinyin line behind one `showPy` boolean. Paced is the DEFAULT
presentation, so most learners get the crude behavior and the roadmap item
"Pinyin only when you need it" is effectively unimplemented. It is also the
owner's own stated want in `TASKS.md` ("add better story reader").

**Not in M2:** word-by-word read-along. It needs word-level audio timings, which
means regenerating story narration with Google TTS SSML `<mark>` timepoints plus
a storage format for them — an owner-run pipeline change with real TTS cost. It
deserves its own milestone; do not let a session start it casually.

### TASK-004 — Graduated per-word reading in the paced, chat and scene readers

**Status:** In Review · **Priority:** High · **Branch:** `claude/graduated-pinyin-readers`
**Dependencies:** None · **Conflict risk:** Low (readers only)

Bring the classic reader's per-word logic to the three fixed-format readers:
reading shown per word by status (Always / Learning / Unknown / Off) via
`readingVisibleFor`, not one line behind a boolean. Reserve the reading's
vertical space so revealing it never shifts the baseline (`reserveRuby` already
does this in the classic reader). Persist the mode in the existing `reader:prefs`
IndexedDB object alongside the current flags. Japanese must keep its kana-only
guard (`hasKanjiChar`) so furigana never renders over kana-only words.

**Owns:** `src/PacedReader.jsx`, `src/ChatReader.jsx`, `src/SceneReader.jsx`,
`src/InteractiveChatReader.jsx`, `src/useStoryReaderCore.js`,
`src/storyReading.js` (+ tests), reader e2e specs.
**Must not touch:** `src/Study.jsx`, `src/Stories.jsx`, `src/storyTiers.js`,
migrations, `.github/workflows/**`, `ROADMAP.md`, `docs/BACKLOG.md`.

**Completion notes (In Review):**
- The per-word rule is now one tested function, `tokenReading()` in
  `src/storyReading.js`: `readingVisibleFor` + "has a reading at all" + the
  Japanese `hasKanjiChar` kana guard. All four fixed-format readers call it; the
  classic reader keeps composing the same `readingVisibleFor` inline.
  `furiganaSplit()` (okurigana-aware kanji-core split) and
  `normalizeReadingMode()` / `DEFAULT_READING_MODE` were lifted there too.
- New shared component `src/ReadingScaffold.jsx`: `TokenBody` (ruby / bare text /
  reserved row) and `ReadingSettings` (the quiet control). One implementation
  drawn by `PacedReader`, `SceneReader` and `ChatThread` (which both chat readers
  share) — no per-reader copies.
- Baseline holds via an NBSP `<rt>` reserved on **every** token, including plain
  runs and punctuation, so switching modes or advancing a beat never re-measures.
- Mode persists to the existing `reader:prefs` IndexedDB object as `furiganaMode`
  — read-modify-write merged, so the classic reader's `lens` / `serif` /
  `showEnglish` / `seenFocusHint` flags survive. Default `unknown`, matching the
  classic reader. No second storage mechanism; no localStorage.
- Controls follow the quiet-controls pattern: the always-on Pinyin/English chip
  row in paced/scene is replaced by one "Reader" button opening a popover
  (desktop) / bottom sheet (mobile); the chat readers gained the same control as
  a compact header button — they previously had no reading control at all.
  Escape closes and restores focus; keyboard advance is suspended while open.
- Verification: unit **710 passed / 67 files** (was 696/67; +14 new).
  `npx eslint src` → 2 errors, both pre-existing and owned by TASK-006.
  `npm run build` green. Playwright **52 passed** (was 51; +1 new reader test
  asserting per-word behavior, the mode control and Escape focus return).
- Judgement call for the reviewer: `src/ReadingScaffold.jsx` is a new file, not
  on the task's "Owns" list. `StoryReaderImmersive.jsx` was out of scope, so its
  private `furiganaParts`/`rubyFor` copy still exists and is now a duplicate of
  `furiganaSplit`. Collapsing it is a clean, behavior-preserving follow-up.

### TASK-005 — Transactional grading (single RPC)

**Status:** Ready · **Priority:** High · **Branch:** `claude/transactional-grading`
**Dependencies:** None · **Conflict risk:** Low (no reader files)

Collapse the separate grade-path writes (card update, `review_logs` insert,
`daily_activity` upsert) into one security-definer Supabase RPC so a mid-write
failure cannot leave partial state. Keep the offline path working: `syncQueue`
must replay through the same RPC, and idempotency must hold on replay. The
migration must be additive and the client must degrade safely if the RPC is
absent (the repo's established pattern for unapplied migrations).

**Owns:** a new `supabase/migrations/*.sql`, `src/Study.jsx` (grading path only),
`src/syncQueue.js`, `supabase/schema.sql` (+ tests).
**Must not touch:** any reader file, `src/Stories.jsx`, `src/storyTiers.js`,
`ROADMAP.md`, `docs/BACKLOG.md`.

### TASK-006 — Lint + docs hygiene (small, optional)

**Status:** Ready · **Priority:** Low · **Branch:** `claude/lint-hygiene`

Fix the 2 real ESLint errors (`Dashboard.jsx` set-state-in-effect,
`HowMuchCanYouRead.jsx` unused `useMemo`), stop linting `.claude/**`, and correct
the stale "0-error baseline" claim in `Claude.md`. Owns only those files plus the
eslint config. Cheap; fold into another change if you prefer.

### Parallel plan
TASK-004 and TASK-005 share no files — run both now. TASK-006 is independent of
both but small enough to skip or bundle. Merge order: 005, then 004, then 006.

## Backlog

Prioritized, but **not** started — do not open sessions for these without a new
milestone decision. Full detail lives in [`docs/BACKLOG.md`](BACKLOG.md).

1. **Author an HSK 3 story season** — the natural follow-up to TASK-002 once the owner has committed a pool snapshot. No LLM, no quota.
2. **Global word-status model** — one FSRS-driven status per word powering "% known" across stories, pasted text, and (later) video. Architectural; deserves its own milestone.
3. **Transactional grading RPC** — collapse the multi-write grade path into one Supabase transaction (data safety).
4. **Real-device verification pass** — offline replay, iOS audio, push reminders, plus the Chinese TTS polyphone spot-check in `TASKS.md`.
5. **Graded YouTube** — the flagship video idea; large, needs its own milestone. (`TASKS.md` also lists "rework the youtube tab" — same area.)
6. **FSRS parameter tuning** — waiting on enough real `review_logs` volume.

## Architectural Decisions

- **AD-1 — Reading becomes cumulative, matching review.** Cards are already
  cumulative via `levelScope.studyFloorLevel`; stories were not
  (`.eq('level', current_level)`), which turned every level-up into a Stories
  dead-end. Stories now load `level <= current_level`, grouped by level.
  *Rationale:* re-reading is valuable, the content already exists, and it fixes
  the dead-end without writing a single story — and without waiting on LLM quota.
- **AD-2 — Story tiers are keyed by level; the generator's per-level thresholds
  win, with two guardrails.** One Chinese tier table was applied to every Chinese
  level while `generate-serial-stories.mjs` had *different* per-level thresholds.
  The app now keys tiers by (language, level) and adopts the generator's values,
  except: tier 1 is always `minWords: 0`, and no threshold may rise for a level
  that already has published stories. *Rationale:* the gate should match the
  content the stories were written against, and no existing learner may lose
  access.
- **AD-3 — The PM task board lives in `docs/PM-BOARD.md`, not `ROADMAP.md`.**
  `roadmap-live-sync.yml` mirrors `ROADMAP.md` to the community `#roadmap`
  channel; task IDs, branches and acceptance checklists would turn a product view
  into a sprint board. `ROADMAP.md` stays user-facing, `docs/BACKLOG.md`
  engineering-facing, this file syncs nowhere.
- **AD-4 — The authored lane is the content path of record when quota is
  uncertain.** `Claude.md` already calls hand-authored seasons the preferred
  quality path; TASK-002 makes it usable for Chinese so content is never hostage
  to a third-party free tier.

## Product Decisions

- **PD-1 — A live dead-end outranks everything additive.** Reaching a level whose
  Stories screen is empty is the worst moment in the product and it lands on the
  most motivated learners. It takes priority over every polish item on the
  roadmap.
- **PD-2 — Fix the shelf before making more content.** Cumulative reading is
  worth ~38 immediately readable stories per affected learner and costs no
  generation at all. Content volume follows.
- **PD-3 — Don't let a free-tier quota own the roadmap.** Where a no-LLM path
  exists (authored stories, Tatoeba examples), wire it up rather than waiting.

## Known Risks and Technical Debt

- **HSK 3–6 level tests are ~500-word walls.** `Test.jsx` unlocks at 90% mastery
  of the level; ~500 words is 2.5× HSK 2's 198. Nothing breaks, but the levels may
  feel unreachable. Splitting a band into two parts (as JLPT N5 already is) is the
  obvious remedy. Not in M1.
- **Levels 3–6 have vocabulary but no stories.** TASK-001 makes this survivable
  rather than fatal; it does not make those levels feel complete. The honest
  empty-state copy matters.
- **Serial-story yield on `gemini-2.5-flash`.** Even once quota unblocks, tier-2/3
  chapters have historically scored low and been held unpublished. Expect fewer
  stories than the tiers imply.
- **Pre-existing:** Cloudflare "Workers Builds" checks fail on every PR (deploy
  infra, ignorable — only a red `playwright` blocks). GITHUB_TOKEN pushes do not
  fire the PR `synchronize` event, so `playwright` runs only on a PR's first
  commit; later pushes are locally verified.

## Release Readiness

The app is live on Vercel (`hanzi-dojo.com`) and auto-deploys from `main`, so M1
ships to real users on merge. Current gates: unit **665/665 green**, Playwright
green at last full run, `eslint` at a 0-error baseline, `npm run build` passing.
No open release blockers. Outstanding one-time owner setup is listed under
*Owner actions* above.
