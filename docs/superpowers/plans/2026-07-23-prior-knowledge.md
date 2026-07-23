# Prior Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner who already knows vocabulary (from a placement test, another app, or memory) put those words straight into review, so knowledge built elsewhere stops silently decaying.

**Architecture:** Three claim sources (placement tier, pasted word list, browsable checklist) all produce the same artifact — a frequency-ordered array of vocab ids. One pure module spreads those ids across calendar days; one data module upserts them into `cards` as `review`-state rows. No migration, no new table, no new card state, no background job.

**Tech Stack:** React 19, Vite, plain JSX (no TypeScript), Supabase JS v2, vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-prior-knowledge-design.md`

## Global Constraints

Copied verbatim from `CLAUDE.md` §12/§13 — every task's requirements implicitly include these:

- **No TypeScript.** No type annotations anywhere.
- **No complex regex literals** — the OXC parser breaks on them. Use `indexOf` / `split` / `includes`.
- **All styling is inline style objects.** No Tailwind classes in JSX.
- **No `localStorage` / `sessionStorage`.** IndexedDB via `src/offline.js` is the sanctioned store.
- **No `<form>` tags** — use `onClick` / `onChange` handlers.
- Use theme tokens (`var(--surface)`, `var(--text)`, `var(--border)`, `var(--text-muted)`) for all neutral colors, never hardcoded neutral hexes. White text on accent buttons (`color: '#fff'`) stays hardcoded.
- **`npm run build` must pass before any commit.**
- **Never set `is_easy = true`** outside the SRS grading flow in `srs.js` / `Study.jsx`.
- **Zero ESLint errors in `src/`.** Keep it that way (`npx eslint src/`).
- Test command is `npx vitest run`. Specs are `src/*.test.js`.

---

### Task 1: The spread and card-row builder

The pure core: turn an ordered list of vocab ids into dated card rows.

**Files:**
- Create: `src/priorKnowledge.js`
- Test: `src/priorKnowledge.test.js`

**Interfaces:**
- Consumes: `MASTERY_STABILITY_DAYS` from `src/mastery.js` (value `21`).
- Produces:
  - `PACING` → `[{ key, label, perDay }]`
  - `estimateDays(count, perDay)` → number
  - `spreadDueDates(ids, perDay, now)` → `[{ vocabId, dayOffset, dueAt }]` where `dueAt` is an ISO string
  - `seedCardRows(userId, spread, now)` → array of card row objects

- [ ] **Step 1: Write the failing test**

Create `src/priorKnowledge.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { PACING, estimateDays, spreadDueDates, seedCardRows } from './priorKnowledge'

const NOW = new Date('2026-07-23T09:00:00.000Z').getTime()
const dayOf = (iso) => iso.slice(0, 10)

describe('PACING', () => {
  it('offers relaxed, steady and fast', () => {
    expect(PACING.map(p => p.key)).toEqual(['relaxed', 'steady', 'fast'])
    expect(PACING.map(p => p.perDay)).toEqual([8, 15, 30])
    PACING.forEach(p => expect(typeof p.label).toBe('string'))
  })
})

describe('estimateDays', () => {
  it('rounds up a partial final day', () => {
    expect(estimateDays(498, 15)).toBe(34)
    expect(estimateDays(30, 15)).toBe(2)
    expect(estimateDays(1, 15)).toBe(1)
  })

  it('is 0 for an empty claim and guards a bad rate', () => {
    expect(estimateDays(0, 15)).toBe(0)
    expect(estimateDays(10, 0)).toBe(0)
  })
})

describe('spreadDueDates', () => {
  it('puts the first perDay ids on today', () => {
    const out = spreadDueDates(['a', 'b', 'c'], 2, NOW)
    expect(out.map(e => e.dayOffset)).toEqual([0, 0, 1])
    expect(dayOf(out[0].dueAt)).toBe('2026-07-23')
    expect(dayOf(out[2].dueAt)).toBe('2026-07-24')
  })

  it('preserves the caller ordering and does not sort', () => {
    const out = spreadDueDates(['z', 'a', 'm'], 1, NOW)
    expect(out.map(e => e.vocabId)).toEqual(['z', 'a', 'm'])
  })

  it('fills exact multiples without an empty trailing day', () => {
    const out = spreadDueDates(['a', 'b', 'c', 'd'], 2, NOW)
    expect(out.map(e => e.dayOffset)).toEqual([0, 0, 1, 1])
  })

  it('returns an empty array for no ids or a bad rate', () => {
    expect(spreadDueDates([], 8, NOW)).toEqual([])
    expect(spreadDueDates(null, 8, NOW)).toEqual([])
    expect(spreadDueDates(['a'], 0, NOW)).toEqual([])
  })
})

describe('seedCardRows', () => {
  const spread = spreadDueDates(['v1', 'v2'], 1, NOW)
  const rows = seedCardRows('user-1', spread, NOW)

  it('creates one review-state row per claimed word', () => {
    expect(rows).toHaveLength(2)
    rows.forEach(r => {
      expect(r.user_id).toBe('user-1')
      expect(r.state).toBe('review')
      expect(r.learned).toBe(true)
      expect(r.stability).toBe(21)
      expect(r.difficulty).toBe(5)
      expect(r.reps).toBe(0)
      expect(r.lapses).toBe(0)
    })
    expect(rows.map(r => r.vocab_id)).toEqual(['v1', 'v2'])
  })

  it('never marks a seeded card easy', () => {
    rows.forEach(r => expect(r.is_easy).toBe(false))
  })

  it('schedules each row to its own spread day', () => {
    expect(rows[0].scheduled_days).toBe(0)
    expect(rows[1].scheduled_days).toBe(1)
    expect(dayOf(rows[1].due_at)).toBe('2026-07-24')
    rows.forEach(r => expect(r.last_review).toBe(new Date(NOW).toISOString()))
  })

  it('returns nothing for an empty spread', () => {
    expect(seedCardRows('user-1', [], NOW)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/priorKnowledge.test.js`
Expected: FAIL — `Failed to resolve import "./priorKnowledge"`

- [ ] **Step 3: Write minimal implementation**

Create `src/priorKnowledge.js`:

```js
// Prior knowledge — pure and testable.
//
// A "claim" is a set of vocab ids the learner says they already know, from a
// placement tier, a pasted word list, or the browsable checklist. This module
// turns a claim into ordinary FSRS review cards whose due dates are spread over
// the coming days, so the claim is verified a few words at a time instead of
// dumping hundreds of reviews on the learner at once.
//
// Nothing here talks to the network — see priorKnowledgeSeed.js for the write.

import { MASTERY_STABILITY_DAYS } from './mastery'

const DAY_MS = 24 * 60 * 60 * 1000

// How fast the claimed words come back to be checked. The learner picks one of
// these at claim time; the number is nothing more than the due-date spread.
export const PACING = [
  { key: 'relaxed', label: 'Relaxed', perDay: 8 },
  { key: 'steady', label: 'Steady', perDay: 15 },
  { key: 'fast', label: 'Fast', perDay: 30 },
]

// How many days a claim of `count` words takes to check at `perDay` a day.
export function estimateDays(count, perDay) {
  if (!count || !perDay || perDay <= 0) return 0
  return Math.ceil(count / perDay)
}

// spreadDueDates(ids, perDay, now) → [{ vocabId, dayOffset, dueAt }]
//
// `ids` MUST already be in frequency order — this preserves the order it is
// given and never sorts, because only the caller knows which levels are in play
// (they get the ordering from `order('sort_order')` on the vocabulary query).
// The first `perDay` ids land on day 0 (today), so the first check-ups appear in
// the learner's very next session.
export function spreadDueDates(ids, perDay, now = Date.now()) {
  if (!ids || !ids.length || !perDay || perDay <= 0) return []
  return ids.map((vocabId, i) => {
    const dayOffset = Math.floor(i / perDay)
    return {
      vocabId,
      dayOffset,
      dueAt: new Date(now + dayOffset * DAY_MS).toISOString(),
    }
  })
}

// seedCardRows(userId, spread, now) → rows ready to upsert into `cards`.
//
// Stability sits exactly at the mastery threshold, so a claimed word counts as
// known everywhere from day one. `scheduled_days` is the spread offset rather
// than the stability, which makes the first check-up an EARLY review relative to
// a 21-day stability — FSRS then grants less stability on success, which is the
// right conservative bias for a claim we have not verified yet.
export function seedCardRows(userId, spread, now = Date.now()) {
  const lastReview = new Date(now).toISOString()
  return (spread || []).map(entry => ({
    user_id: userId,
    vocab_id: entry.vocabId,
    state: 'review',
    learned: true,
    stability: MASTERY_STABILITY_DAYS,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    // Never true outside the SRS grading flow (CLAUDE.md §13.3).
    is_easy: false,
    last_review: lastReview,
    scheduled_days: entry.dayOffset,
    elapsed_days: 0,
    due_at: entry.dueAt,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/priorKnowledge.test.js`
Expected: PASS — 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/priorKnowledge.js src/priorKnowledge.test.js
git commit -m "feat(prior-knowledge): spread claimed words into dated review cards"
```

---

### Task 2: Matching a pasted word list

**Files:**
- Create: `src/priorKnowledgeImport.js`
- Test: `src/priorKnowledgeImport.test.js`

**Interfaces:**
- Consumes: `buildVocabMatcher(vocabMap, language)`, `segmentLine(text, matcher, names, particles)`, `namesFor(language)`, `particlesFor(language)` — all exported from `src/storyReading.js`. `vocabMap` is **word-keyed**: `{ '你好': { id, word, level, ... } }`. `segmentLine` returns `[{ text, vocab }]` where `vocab` is the matched vocabulary object or `null`.
- Produces: `matchPastedText(text, vocabMap, language)` → `{ matchedIds, matchedCount, unmatchedLines }`

- [ ] **Step 1: Write the failing test**

Create `src/priorKnowledgeImport.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { matchPastedText } from './priorKnowledgeImport'

const ZH = {
  '你好': { id: 'v-nihao', word: '你好', level: 1, sort_order: 1 },
  '谢谢': { id: 'v-xiexie', word: '谢谢', level: 1, sort_order: 2 },
  '中国': { id: 'v-zhongguo', word: '中国', level: 2, sort_order: 3 },
}

describe('matchPastedText — Chinese', () => {
  it('finds words in a bare column', () => {
    const out = matchPastedText('你好\n谢谢\n', ZH, 'chinese')
    expect(out.matchedIds).toEqual(['v-nihao', 'v-xiexie'])
    expect(out.matchedCount).toBe(2)
  })

  it('ignores structure — an Anki CSV row works the same', () => {
    const csv = '你好,"nǐ hǎo","hello, hi"\n中国,"Zhōngguó","China"'
    const out = matchPastedText(csv, ZH, 'chinese')
    expect(out.matchedIds).toEqual(['v-nihao', 'v-zhongguo'])
  })

  it('collapses duplicates, keeping first-seen order', () => {
    const out = matchPastedText('谢谢\n你好\n谢谢', ZH, 'chinese')
    expect(out.matchedIds).toEqual(['v-xiexie', 'v-nihao'])
    expect(out.matchedCount).toBe(2)
  })

  it('counts lines that contributed nothing', () => {
    const out = matchPastedText('你好\n# my deck\n\nzzz', ZH, 'chinese')
    expect(out.matchedIds).toEqual(['v-nihao'])
    expect(out.unmatchedLines).toBe(2)
  })

  it('returns empty for blank input', () => {
    expect(matchPastedText('', ZH, 'chinese')).toEqual({
      matchedIds: [], matchedCount: 0, unmatchedLines: 0,
    })
    expect(matchPastedText('   \n\n', ZH, 'chinese').matchedCount).toBe(0)
  })
})

describe('matchPastedText — Japanese', () => {
  const JA = {
    '食べます': { id: 'v-taberu', word: '食べます', reading: 'たべます', level: 1 },
    'こうえん': { id: 'v-kouen', word: 'こうえん', reading: 'こうえん', level: 1 },
  }

  it('resolves a conjugated form to its stored entry', () => {
    const out = matchPastedText('食べた', JA, 'japanese')
    expect(out.matchedIds).toEqual(['v-taberu'])
  })

  it('matches a kana word stored in kana', () => {
    const out = matchPastedText('こうえん', JA, 'japanese')
    expect(out.matchedIds).toEqual(['v-kouen'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/priorKnowledgeImport.test.js`
Expected: FAIL — `Failed to resolve import "./priorKnowledgeImport"`

- [ ] **Step 3: Write minimal implementation**

Create `src/priorKnowledgeImport.js`:

```js
// Turn pasted text into a claim.
//
// The learner pastes whatever they have — an Anki CSV export, a Pleco list, a
// bare column of hanzi — and we scan it for words we already know. Because we
// look for known words rather than parsing structure, every source format works
// with no column-mapping step.
//
// The scan runs through the SAME matcher the story reader uses to decide what is
// tappable, so the guarantee is simple: if the reader would highlight it, the
// import will find it. That inherits Chinese greedy longest-match, Japanese
// ます-form / reading / kanji-stem resolution, and Russian inflection for free.

import { buildVocabMatcher, segmentLine, namesFor, particlesFor } from './storyReading'

// matchPastedText(text, vocabMap, language)
//   → { matchedIds, matchedCount, unmatchedLines }
//
// `vocabMap` is word-keyed (word → vocab object), the same shape the reader and
// calculateStoryReadability already build. Ids come back in first-seen order,
// deduped. `unmatchedLines` counts non-blank lines that yielded no word, so the
// UI can say how much of the paste we did not recognise.
export function matchPastedText(text, vocabMap = {}, language) {
  const matchedIds = []
  const seen = new Set()
  let unmatchedLines = 0

  const lines = (text || '').split('\n')
  const matcher = buildVocabMatcher(vocabMap, language)
  const names = namesFor(language)
  const particles = particlesFor(language)

  lines.forEach(line => {
    if (!line.trim()) return
    let found = 0
    segmentLine(line, matcher, names, particles).forEach(token => {
      if (!token.vocab) return
      found += 1
      if (seen.has(token.vocab.id)) return
      seen.add(token.vocab.id)
      matchedIds.push(token.vocab.id)
    })
    if (!found) unmatchedLines += 1
  })

  return { matchedIds, matchedCount: matchedIds.length, unmatchedLines }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/priorKnowledgeImport.test.js`
Expected: PASS — 7 tests

If the two Japanese assertions fail, do **not** loosen them by hand-rolling a second matcher. Read `buildVocabMatcher` in `src/storyReading.js:349` and confirm the fixture's stored shape matches what the real N5 pool uses (ます-form verbs, kana-only nouns — see `CLAUDE.md` §0.00). Adjust the fixture to a real stored shape, not the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/priorKnowledgeImport.js src/priorKnowledgeImport.test.js
git commit -m "feat(prior-knowledge): match pasted word lists with the reader's matcher"
```

---

### Task 3: Writing the claim to the database

**Files:**
- Create: `src/priorKnowledgeSeed.js`
- Test: `src/priorKnowledgeSeed.test.js`
- Modify: `src/analytics.js` (add one event name to the `EVENTS` object, which begins at line 21)

**Interfaces:**
- Consumes: `spreadDueDates`, `seedCardRows` from Task 1; the `supabase` client from `src/supabase.js`; `track` and `EVENTS` from `src/analytics.js`.
- Produces: `seedClaim({ userId, vocabIds, perDay, source, now })` → `{ inserted, batches }`, and `SEED_BATCH_SIZE`.

**Why an upsert with `ignoreDuplicates`:** `cards` has `unique (user_id, vocab_id)` and a user INSERT policy (`supabase/schema.sql:157`, `:482`). `ignoreDuplicates: true` makes the write idempotent by construction — a re-import, a double-tap, or two claims that overlap can never modify an existing card. This is the single most important safety property of the feature; do not replace it with a read-then-insert.

- [ ] **Step 1: Write the failing test**

Create `src/priorKnowledgeSeed.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn(() => Promise.resolve({ error: null }))
vi.mock('./supabase', () => ({
  supabase: { from: vi.fn(() => ({ upsert })) },
}))
vi.mock('./analytics', () => ({
  EVENTS: { PRIOR_KNOWLEDGE_CLAIMED: 'prior_knowledge_claimed' },
  track: vi.fn(),
}))

import { seedClaim, SEED_BATCH_SIZE } from './priorKnowledgeSeed'
import { supabase } from './supabase'
import { track, EVENTS } from './analytics'

const NOW = new Date('2026-07-23T09:00:00.000Z').getTime()

describe('seedClaim', () => {
  beforeEach(() => { upsert.mockClear(); supabase.from.mockClear(); track.mockClear() })

  it('writes review cards and reports how many', async () => {
    const out = await seedClaim({
      userId: 'u1', vocabIds: ['a', 'b'], perDay: 15, source: 'paste', now: NOW,
    })
    expect(out).toEqual({ inserted: 2, batches: 1 })
    expect(supabase.from).toHaveBeenCalledWith('cards')

    const [rows, options] = upsert.mock.calls[0]
    expect(rows).toHaveLength(2)
    expect(rows[0].state).toBe('review')
    expect(options).toEqual({ onConflict: 'user_id,vocab_id', ignoreDuplicates: true })
  })

  it('chunks a large claim', async () => {
    const ids = Array.from({ length: SEED_BATCH_SIZE + 1 }, (_, i) => 'v' + i)
    const out = await seedClaim({ userId: 'u1', vocabIds: ids, perDay: 15, source: 'placement', now: NOW })
    expect(out.batches).toBe(2)
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[0][0]).toHaveLength(SEED_BATCH_SIZE)
    expect(upsert.mock.calls[1][0]).toHaveLength(1)
  })

  it('records the claim in analytics', async () => {
    await seedClaim({ userId: 'u1', vocabIds: ['a'], perDay: 8, source: 'checklist', now: NOW })
    expect(track).toHaveBeenCalledWith(EVENTS.PRIOR_KNOWLEDGE_CLAIMED, {
      source: 'checklist', count: 1, perDay: 8,
    })
  })

  it('does nothing at all for an empty claim', async () => {
    const out = await seedClaim({ userId: 'u1', vocabIds: [], perDay: 15, source: 'paste', now: NOW })
    expect(out).toEqual({ inserted: 0, batches: 0 })
    expect(upsert).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
  })

  it('surfaces a write failure instead of silently succeeding', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'nope' } })
    await expect(seedClaim({
      userId: 'u1', vocabIds: ['a'], perDay: 15, source: 'paste', now: NOW,
    })).rejects.toThrow('nope')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/priorKnowledgeSeed.test.js`
Expected: FAIL — `Failed to resolve import "./priorKnowledgeSeed"`

- [ ] **Step 3: Add the analytics event**

In `src/analytics.js`, inside the `EVENTS` object (which begins at line 21), add the new name next to the other onboarding-funnel events:

```js
  PRIOR_KNOWLEDGE_CLAIMED: 'prior_knowledge_claimed',
```

- [ ] **Step 4: Write minimal implementation**

Create `src/priorKnowledgeSeed.js`:

```js
// Write a claim to the database.
//
// Seeding is a chunked upsert with ignoreDuplicates, which makes it idempotent
// by construction: `cards` carries unique (user_id, vocab_id), so re-importing
// the same list, double-tapping the button, or claiming the same word from two
// sources can never modify an existing card. Real progress is untouchable here.

import { supabase } from './supabase'
import { track, EVENTS } from './analytics'
import { spreadDueDates, seedCardRows } from './priorKnowledge'

// PostgREST would accept far more, but a few hundred rows per request keeps the
// payload small enough to retry cheaply on a flaky mobile connection.
export const SEED_BATCH_SIZE = 500

// seedClaim({ userId, vocabIds, perDay, source, now }) → { inserted, batches }
//
// `vocabIds` must already be in frequency order (see spreadDueDates). `source`
// is 'placement' | 'paste' | 'checklist', recorded for analytics only.
export async function seedClaim({ userId, vocabIds, perDay, source, now = Date.now() }) {
  const spread = spreadDueDates(vocabIds, perDay, now)
  if (!spread.length) return { inserted: 0, batches: 0 }

  const rows = seedCardRows(userId, spread, now)
  let batches = 0
  for (let i = 0; i < rows.length; i += SEED_BATCH_SIZE) {
    const chunk = rows.slice(i, i + SEED_BATCH_SIZE)
    const { error } = await supabase
      .from('cards')
      .upsert(chunk, { onConflict: 'user_id,vocab_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
    batches += 1
  }

  track(EVENTS.PRIOR_KNOWLEDGE_CLAIMED, { source, count: rows.length, perDay })
  return { inserted: rows.length, batches }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/priorKnowledgeSeed.test.js`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add src/priorKnowledgeSeed.js src/priorKnowledgeSeed.test.js src/analytics.js
git commit -m "feat(prior-knowledge): idempotent claim seeding"
```

---

### Task 4: The "Words you already know" screen

**Files:**
- Create: `src/KnownWords.jsx`
- Modify: `src/routes.js:8-16` (add `'known'` to `KNOWN_VIEWS`)
- Modify: `src/App.jsx` (render the view — follow the existing lazy-import + `view === '...'` pattern used for `dictionary`)
- Modify: `src/Settings.jsx` (add a card linking to the view)
- Modify: `src/Words.jsx` (add a header link)
- Test: `src/routes.test.js` (extend the existing known-view assertions)

**Interfaces:**
- Consumes: `matchPastedText` (Task 2), `seedClaim` (Task 3), `PACING` / `estimateDays` (Task 1); `supabase` for the vocabulary query; `languageTheme` from `src/languageTheme.js`; `getLevelLabel` from `src/utils.js`; `toast` from `src/toast.js`.
- Produces: default-exported `<KnownWords session={} profile={} track={} onNavigate={} />`.

**Data query.** Both panels need the same thing — every active word for the track's language/system, ordered so a claim is frequency-ordered by construction:

```js
supabase.from('vocabulary')
  .select('id, word, reading, meaning, level, sort_order')
  .eq('language', track.language)
  .eq('system', track.system)
  .eq('is_active', true)
  .not('level', 'is', null)
  .order('level').order('sort_order')
```

`.not('level', 'is', null)` is **required**: dictionary-sourced words carry `level = NULL` and `vocabulary` is globally shared, so omitting it leaks other users' saved words into this screen (`CLAUDE.md` §0.1).

PostgREST caps a response at 1000 rows, so page with `.range()` until a short page comes back — HSK alone is ~2,370 words. A single unpaged query silently returns less than half the library.

- [ ] **Step 1: Write the failing route test**

In `src/routes.test.js`, add inside the existing describe block that covers known views:

```js
  it('knows the prior-knowledge screen', () => {
    expect(isKnownView('known')).toBe(true)
    expect(viewToPath('known')).toBe('/known')
    expect(pathToView('/known')).toBe('known')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes.test.js`
Expected: FAIL — `expected false to be true` on `isKnownView('known')`

- [ ] **Step 3: Register the route**

In `src/routes.js`, add `'known'` to the `KNOWN_VIEWS` array, next to `'words'`:

```js
  'practice', 'words', 'known', 'dictionary', 'grammar', 'strokes', 'builder', 'fillblank', 'speak',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes.test.js`
Expected: PASS

- [ ] **Step 5: Build the screen**

Create `src/KnownWords.jsx`. It holds one `mode` state (`'paste' | 'browse'`), one `claim` state (the array of selected vocab ids), and one `pacing` state, then calls `seedClaim` and routes home.

Requirements, all load-bearing:

1. **Load the vocabulary once on mount**, paged as described above. Also load the user's existing card vocab ids (`supabase.from('cards').select('vocab_id')` — RLS scopes it to this user) so already-carded words can be shown locked.
2. **Paste panel:** a controlled `<textarea>` (no `<form>` tag), a "Check this list" button calling `matchPastedText(text, vocabMap, track.language)` where `vocabMap` is built as `{ [v.word]: v }`, then a result line — `found N of your words · M lines we didn't recognise`. Words that already have a card are filtered out of the claim before the pacing step.
3. **Browse panel:** the vocabulary grouped by level (heading = `getLevelLabel(track.language, track.system, level)`), each word a toggle button, plus a "Claim all" button per level block. Already-carded words render disabled with their status and are never selectable.
4. **Pacing step (shared):** the three `PACING` options, each labelled with `estimateDays(claim.length, perDay)` — e.g. `Steady · 15 a day · about 34 days`. The confirm button calls `seedClaim({ userId: session.user.id, vocabIds: claim, perDay, source })` with `source` of `'paste'` or `'checklist'`.
5. **After a successful seed:** `toast()` the count and `onNavigate('home')`. On a thrown error, show inline error text — never a silent failure.
6. **Order the final claim by the loaded vocabulary order** before passing it to `seedClaim` (the browse panel's selection order is tap order, not frequency order), and filter it to ids present in the loaded vocabulary.

Follow `src/Dictionary.jsx` for the screen shell, spacing, and mobile padding (`useIsMobile`).

- [ ] **Step 6: Add the two entry points**

In `src/Settings.jsx`, add a card in the same style as the existing preference cards, with a button calling `onNavigate('known')`:

> **Words you already know** — Learning Chinese before you found us? Import a list or tick off what you know, and those words go straight into review.

In `src/Words.jsx`, add a header button next to the search control reading `I already know some of these →`, calling `onNavigate('known')`.

Both screens already receive `onNavigate` from `App.jsx`; if `Words.jsx` does not, thread it the same way `Practice.jsx` does.

- [ ] **Step 7: Verify the build and lint**

Run: `npm run build`
Expected: build succeeds.

Run: `npx eslint src/KnownWords.jsx src/Words.jsx src/Settings.jsx src/routes.js`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/KnownWords.jsx src/routes.js src/routes.test.js src/App.jsx src/Settings.jsx src/Words.jsx
git commit -m "feat(prior-knowledge): 'words you already know' screen with paste and checklist"
```

---

### Task 5: The placement claim in onboarding

**Files:**
- Modify: `src/Onboarding.jsx` — the `finish()` handler (profile upsert at line ~106, `language_tracks` upsert at line ~112) and step 4's render block (line ~464)

**Interfaces:**
- Consumes: `seedClaim` (Task 3), `PACING` (Task 1), plus the `tiers` array, `level`, `language`, `selectedTheme`, `accentHex` and `session` values already present in the component.

**Placement in the flow.** Step 4 ("Here's your daily loop") is the last screen and its button calls `finish()`. Add the pacing block to step 4 rather than inserting a new step — a new step would mean renumbering, and the claim has to run *after* `finish()` anyway, because `cards.user_id` references `profiles(id)` and that row does not exist until the profile upsert lands.

- [ ] **Step 1: Add the claim state**

Near the existing `useState` declarations (around line 37):

```js
  const [claimPacing, setClaimPacing] = useState('steady')
  const [claimEarlier, setClaimEarlier] = useState(true)
```

Add the imports:

```js
import { PACING } from './priorKnowledge'
import { seedClaim } from './priorKnowledgeSeed'
```

- [ ] **Step 2: Render the offer on step 4**

Inside the `{step === 4 && (` block, above the "Start Learning" button, render this **only when the learner placed above the lowest tier**:

```jsx
{tiers.length > 0 && level > tiers[0].level && (
  <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px', background: 'var(--surface)' }}>
    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
      Bring your earlier words into review?
    </div>
    <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '14px' }}>
      You placed at {getLevelLabel(language, selectedTheme.system, level)}, so we treat the earlier
      words as known. We can check a few each day so they stay sharp instead of quietly fading.
    </p>
    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
      {PACING.map(p => (
        <button
          key={p.key}
          onClick={() => { setClaimEarlier(true); setClaimPacing(p.key) }}
          style={{
            flex: 1, padding: '10px 8px', borderRadius: '10px', cursor: 'pointer',
            border: '2px solid ' + (claimEarlier && claimPacing === p.key ? accentHex : 'var(--border)'),
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: '13px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
          }}
        >
          {p.label}
          <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', marginTop: '2px' }}>
            {p.perDay} a day
          </span>
        </button>
      ))}
    </div>
    <button
      onClick={() => setClaimEarlier(false)}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '12px', color: claimEarlier ? 'var(--text-muted)' : accentHex, fontFamily: 'Inter, sans-serif' }}
    >
      {claimEarlier ? 'No thanks, skip this' : 'Skipped — tap to turn back on'}
    </button>
  </div>
)}
```

- [ ] **Step 3: Seed after the track upsert**

In `finish()`, immediately after the `language_tracks` upsert succeeds (line ~118) and before navigating on, add:

```js
      // Claim the levels below the placed level. Best-effort: a learner must
      // never be blocked out of onboarding because a seed write failed.
      if (claimEarlier && level > 1) {
        try {
          const perDay = (PACING.find(p => p.key === claimPacing) || PACING[1]).perDay
          const { data: earlier } = await supabase
            .from('vocabulary')
            .select('id')
            .eq('language', language)
            .eq('system', system)
            .eq('is_active', true)
            .lt('level', level)
            .not('level', 'is', null)
            .order('level').order('sort_order')
          const ids = (earlier || []).map(v => v.id)
          if (ids.length) {
            await seedClaim({ userId: session.user.id, vocabIds: ids, perDay, source: 'placement' })
          }
        } catch (e) {
          console.error('prior-knowledge seed failed', e)
        }
      }
```

Note `.lt('level', level)` — strictly below the placed level, never the level itself, which the learner is here to study. Note also the 1000-row cap: for a Japanese N4 placement this returns ~802 rows, under the cap; if a future language exceeds it, page with `.range()` as in Task 4.

- [ ] **Step 4: Verify the build and lint**

Run: `npm run build && npx eslint src/Onboarding.jsx`
Expected: build succeeds, 0 lint errors.

- [ ] **Step 5: Manually verify the offer only appears when placed**

Run `npm run dev`, sign up a fresh account, choose Beginner, and confirm step 4 shows **no** claim block. Repeat choosing a higher tier and passing the placement test; confirm the block appears and names the right level.

- [ ] **Step 6: Commit**

```bash
git add src/Onboarding.jsx
git commit -m "feat(prior-knowledge): offer to claim earlier levels after placement"
```

---

### Task 6: Lock in the study-floor behavior change

Seeding cards below the placed level drops the learner's study floor, which changes what `Study` introduces as new. That is intended, and it needs a test so nobody "fixes" it later.

**Files:**
- Modify: `src/levelScope.test.js`

**Interfaces:**
- Consumes: `studyFloorLevel(cards, currentLevel)` from `src/levelScope.js` — a card's level is read from `card.vocabulary.level` or `card.vocab.level`.

- [ ] **Step 1: Write the test**

Add to `src/levelScope.test.js`:

```js
describe('studyFloorLevel — after a prior-knowledge claim', () => {
  it('drops to the claimed level so earlier words are studied again', () => {
    // Placed at 3, then claimed HSK 1-2: the seeded cards are real cards, so the
    // floor follows them down and unclaimed words at 1-2 become teachable.
    const cards = [
      { vocabulary: { level: 1 } },
      { vocabulary: { level: 2 } },
      { vocabulary: { level: 3 } },
    ]
    expect(studyFloorLevel(cards, 3)).toBe(1)
  })

  it('is unchanged for a placed learner who declined the claim', () => {
    const cards = [{ vocabulary: { level: 3 } }]
    expect(studyFloorLevel(cards, 3)).toBe(3)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/levelScope.test.js`
Expected: PASS immediately — `studyFloorLevel` already behaves this way. The test documents that the claim depends on it, so a future change to `levelScope.js` breaks loudly instead of silently stranding claimed words.

- [ ] **Step 3: Run the whole suite, build and lint**

Run: `npx vitest run`
Expected: all tests pass, with the new files adding roughly 25 tests.

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/`
Expected: 0 errors.

- [ ] **Step 4: Update the roadmap and commit**

Move the prior-knowledge line in `ROADMAP.md` from **🚧 Now — in progress** into the **Just shipped** list, keeping the `:` and `,` separators (the Discord renderer strips ` — ` and everything after it, so an em dash would truncate the line).

```bash
git add src/levelScope.test.js ROADMAP.md
git commit -m "test(prior-knowledge): lock in the study-floor drop after a claim"
```

---

## Manual verification before merge

The unit tests cover the pure logic and the write shape, but three things can only be checked against real data:

1. **Import a real deck.** Export a Chinese deck from Anki as "Notes in Plain Text", paste it, and confirm the match count is plausible. A near-zero count means the matcher is being fed a badly shaped `vocabMap` — check it is word-keyed, not id-keyed.
2. **Claim, then study.** Claim ~40 words at Fast, open Study, and confirm ~30 arrive as ordinary reviews on day one with no visual difference from any other review, and that grading Again drops one to relearning.
3. **Re-claim is inert.** Run the same claim twice and confirm the second run inserts nothing and does not reset a card you graded in between.
