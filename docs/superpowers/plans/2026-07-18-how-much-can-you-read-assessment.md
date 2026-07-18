# "How much can you read?" Assessment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a signed-out `/how-much-can-you-read` page: a ~12-question banded word quiz that estimates a visitor's reading ability, shows one shareable "% of everyday Chinese" result + level label, and funnels to signup.

**Architecture:** A lazy public React page (no app shell, mirroring `PublicStory.jsx`) drives an intro→quiz→result state machine. All correctness-critical math lives in a pure, unit-tested `src/assessment.js`. Quiz vocab comes from a new anon security-definer RPC `public_assessment_vocab`. The result % reuses the canonical `calculateStoryReadability` over a small bundled reference corpus, so the number means the same thing as the app's in-story "% known."

**Tech Stack:** React (Vite), Supabase (Postgres RPC + RLS), Vitest (node + jsdom), Playwright e2e, Google-free pure JS.

## Global Constraints

- **v1 = Chinese only**, but all logic derives bands/labels from data (no hardcoded level list) so Japanese/Russian are a later config flip.
- **No user data through the anon door:** the new RPC returns only active `vocabulary` columns (`id, word, reading, meaning, level, sort_order`); RLS on `vocabulary` stays authenticated-only. Mirror `public_story`.
- **Pure logic is testable in node:** `src/assessment.js` imports no React and does no network; randomness is injectable (accept an optional `rng`/pre-shuffled input) so tests are deterministic.
- **Reuse, don't duplicate:** MCQ construction reuses the `PlacementTest` approach (extract a shared `buildMcqQuestions` helper); the % engine is `calculateStoryReadability` from `storyReading.js`; the share image is `shareCard.js`.
- Copy tone: calm, encouraging, honest (match existing app voice). Brand accent `#B83A24`.

---

### Task 1: Anon RPC `public_assessment_vocab`

**Files:**
- Create: `supabase/migrations/20260718150000_add_public_assessment_vocab.sql`

**Interfaces:**
- Produces: RPC `public_assessment_vocab(p_language text) returns jsonb` — a JSON array of `{id, word, reading, meaning, level, sort_order}` for the language's active vocab, anon-callable.

- [ ] **Step 1: Write the migration**

```sql
-- Public reading assessment: an anon-callable, security-definer read of ONE
-- language's active vocabulary (no user data), for building the signed-out quiz.
-- RLS on vocabulary stays authenticated-only; this is the only anon door and it
-- can only ever return active dictionary rows. Mirrors public_story.
create or replace function public.public_assessment_vocab(p_language text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'word', v.word, 'reading', v.reading,
    'meaning', v.meaning, 'level', v.level, 'sort_order', v.sort_order
  ) order by v.level, v.sort_order), '[]'::jsonb)
  from public.vocabulary v
  where v.language = p_language and v.is_active = true;
$$;

revoke all on function public.public_assessment_vocab(text) from public;
grant execute on function public.public_assessment_vocab(text) to anon, authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260718150000_add_public_assessment_vocab.sql
git commit -m "feat(db): anon public_assessment_vocab RPC for the reading assessment"
```

*(Deploy note: apply in Supabase before the page works; until then the page shows its friendly error state.)*

---

### Task 2: Reference corpus

**Files:**
- Create: `data/assessment-corpus.chinese.json`

**Interfaces:**
- Produces: a JSON array of ~10 short everyday Chinese sentences (strings), authored from HSK level 1–2 vocabulary, used as the fixed text the result % is computed over.

- [ ] **Step 1: Author the corpus** (in-pool everyday sentences; keep each ≤ ~12 chars, natural)

```json
[
  "我今天早上喝了一杯茶。",
  "他坐火车去北京看朋友。",
  "这个商店的东西很便宜。",
  "我们下午一起去公园吧。",
  "老师说明天有一个考试。",
  "妈妈在家做饭，我看电视。",
  "外边下雨了，别忘了带伞。",
  "我想买一点儿水果和面包。",
  "他每天都学习中文两个小时。",
  "医院离这儿不远，走路十分钟。"
]
```

- [ ] **Step 2: Commit**

```bash
git add data/assessment-corpus.chinese.json
git commit -m "content: everyday-Chinese reference corpus for the reading assessment"
```

---

### Task 3: Pure assessment logic (`src/assessment.js`)

**Files:**
- Create: `src/assessment.js`
- Test: `src/assessment.test.js`

**Interfaces:**
- Consumes: vocab rows `{id, word, reading, meaning, level, sort_order}`; `calculateStoryReadability(text, vocabMap, cards, language)` from `storyReading.js`; `buildVocabMatcher` (already used by readability).
- Produces:
  - `buildBands(vocab)` → array of bands, easy→hard: `[{ key, level, tier, vocab: [...] }]` (each level split into two frequency tiers by median `sort_order`; a band with `<4` words merges into its neighbor).
  - `pickAssessmentQuestions(vocab, { perBand=3, rng })` → `[{ prompt, options, correct, bandKey, ... }]` (reuses shared MCQ builder; `rng` optional for determinism).
  - `estimateKnownFrontier(answers, bands)` → `{ frontierIndex, knownVocabIds: Set }` where `answers=[{bandKey, correct:boolean}]`; frontier = highest band with rolling accuracy ≥ 0.67, never skipping a failed lower band (monotone).
  - `estimateReadingPercent(knownVocabIds, vocab, corpusSentences, language)` → integer 0–100 via `calculateStoryReadability` over the joined corpus with synthesized `{[id]:{state:'review'}}` cards.
  - `levelLabelForFrontier(frontierIndex, bands)` → string ("Just starting" / "around HSK 1" / "around HSK 2").
  - `startingLevelForFrontier(frontierIndex, bands)` → integer level to pre-select at signup.

- [ ] **Step 1: Write failing tests** (`src/assessment.test.js`)

```js
import { describe, it, expect } from 'vitest'
import {
  buildBands, pickAssessmentQuestions, estimateKnownFrontier,
  estimateReadingPercent, levelLabelForFrontier, startingLevelForFrontier,
} from './assessment'

const vocab = []
let so = 0
for (const level of [1, 2]) {
  for (let i = 0; i < 20; i++) {
    vocab.push({ id: `${level}-${i}`, word: `词${level}${i}`, reading: `r${i}`,
      meaning: `mean ${level} ${i}`, level, sort_order: so++ })
  }
}

describe('buildBands', () => {
  it('splits each level into two frequency tiers, ordered easy→hard', () => {
    const bands = buildBands(vocab)
    expect(bands.length).toBe(4)
    expect(bands[0].level).toBe(1)
    expect(bands[bands.length - 1].level).toBe(2)
    expect(bands.reduce((n, b) => n + b.vocab.length, 0)).toBe(40)
  })
})

describe('pickAssessmentQuestions', () => {
  it('produces 4-option MCQs across bands with a correct answer present', () => {
    const qs = pickAssessmentQuestions(vocab, { perBand: 3 })
    expect(qs.length).toBe(12)
    for (const q of qs) {
      expect(q.options.length).toBe(4)
      expect(q.options).toContain(q.correct)
      expect(q.bandKey).toBeTruthy()
    }
  })
})

describe('estimateKnownFrontier', () => {
  it('advances the frontier through bands answered correctly', () => {
    const bands = buildBands(vocab)
    const answers = bands.flatMap(b => [0,1,2].map(() => ({ bandKey: b.key, correct: true })))
    const { frontierIndex, knownVocabIds } = estimateKnownFrontier(answers, bands)
    expect(frontierIndex).toBe(bands.length - 1)
    expect(knownVocabIds.size).toBe(40)
  })

  it('stops at the last reliably-answered band (one lucky high guess ignored)', () => {
    const bands = buildBands(vocab)
    const answers = [
      ...[0,1,2].map(() => ({ bandKey: bands[0].key, correct: true })),
      ...[0,1,2].map((i) => ({ bandKey: bands[1].key, correct: i === 0 })), // 1/3
      ...[0,1,2].map((i) => ({ bandKey: bands[3].key, correct: i === 0 })), // lucky
    ]
    const { frontierIndex } = estimateKnownFrontier(answers, bands)
    expect(frontierIndex).toBe(0)
  })

  it('returns frontier -1 and empty set when band 0 is failed', () => {
    const bands = buildBands(vocab)
    const answers = [0,1,2].map(() => ({ bandKey: bands[0].key, correct: false }))
    const { frontierIndex, knownVocabIds } = estimateKnownFrontier(answers, bands)
    expect(frontierIndex).toBe(-1)
    expect(knownVocabIds.size).toBe(0)
  })
})

describe('estimateReadingPercent', () => {
  it('is 0 with no known words and higher when more are known', () => {
    const corpus = ['我今天喝了一杯茶。']
    const none = estimateReadingPercent(new Set(), vocab, corpus, 'chinese')
    const all = estimateReadingPercent(new Set(vocab.map(v => v.id)), vocab, corpus, 'chinese')
    expect(none).toBe(0)
    expect(all).toBeGreaterThanOrEqual(none)
    expect(all).toBeLessThanOrEqual(100)
  })
})

describe('labels', () => {
  it('maps frontier to a human label and a starting level', () => {
    const bands = buildBands(vocab)
    expect(levelLabelForFrontier(-1, bands)).toMatch(/starting/i)
    expect(levelLabelForFrontier(bands.length - 1, bands)).toMatch(/HSK 2/i)
    expect(startingLevelForFrontier(-1, bands)).toBe(1)
    expect(startingLevelForFrontier(bands.length - 1, bands)).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/assessment.test.js`
Expected: FAIL (module `./assessment` not found).

- [ ] **Step 3: Implement `src/assessment.js`**

Implement the six exported functions per the Interfaces block. Key points:
- `buildBands`: group active vocab by `level`; within each level sort by `sort_order`, split at the median into `frequent`/`rest` tiers; drop/merge any tier with `<4` words into the adjacent tier; return ordered easy→hard with stable `key = ` `` `L${level}-${tier}` ``.
- `pickAssessmentQuestions`: extract the MCQ core shared with `PlacementTest` into `buildMcqQuestions(vocab, language, count, rng)` (new export in a shared spot — see Task 3b) and call it per band; tag each question with `bandKey`.
- `estimateKnownFrontier`: walk bands low→high; per band accuracy = correct/asked; advance frontier while accuracy ≥ 0.67; stop at first band below threshold (do not resume for a higher lucky band). `knownVocabIds` = union of vocab in bands `0..frontierIndex`.
- `estimateReadingPercent`: build vocabMap from `vocab`, synthesize cards `{[id]:{state:'review'}}` for `knownVocabIds`, run `calculateStoryReadability(corpus.join('\n'), vocabMap, cards, language)`, return its rounded known-percentage.
- `levelLabelForFrontier` / `startingLevelForFrontier`: map from the band at `frontierIndex` (or "Just starting" / level 1 when `-1`).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/assessment.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/assessment.js src/assessment.test.js
git commit -m "feat(assessment): pure banded-quiz scoring + reading-% estimate"
```

---

### Task 3b: Extract shared MCQ builder

**Files:**
- Modify: `src/PlacementTest.jsx` (replace its local `buildQuestions` internals with a call to the shared helper)
- Create/Modify: `src/mcq.js` (new home for `buildMcqQuestions`)
- Test: `src/mcq.test.js`

**Interfaces:**
- Produces: `buildMcqQuestions(vocab, language, count, rng=Math.random)` → the MCQ array `PlacementTest` already builds (`{prompt, promptReading, promptLabel, answerLabel, options, correct, optionReadings, big}`), extracted verbatim so behavior is unchanged.

- [ ] **Step 1: Write a test** asserting `buildMcqQuestions` returns `count` items each with 4 options incl. the correct one, for a Chinese vocab fixture.
- [ ] **Step 2: Run — FAIL** (`npx vitest run src/mcq.test.js`).
- [ ] **Step 3: Move the `buildQuestions` body into `src/mcq.js` as `buildMcqQuestions`**, keeping the exact option/prompt logic; import `cleanMeaning` + `shuffle` there.
- [ ] **Step 4: Point `PlacementTest.jsx` at it** (`import { buildMcqQuestions } from './mcq'`), delete the duplicated local function.
- [ ] **Step 5: Run full suite — PASS** (`npx vitest run` — PlacementTest behavior unchanged; assessment reuses it).
- [ ] **Step 6: Commit** `refactor(mcq): extract shared buildMcqQuestions from PlacementTest`.

---

### Task 4: Analytics events

**Files:**
- Modify: `src/analytics.js` (add to the `EVENTS` enum, near the public-story block)

**Interfaces:**
- Produces: `EVENTS.ASSESSMENT_STARTED='assessment_started'`, `EVENTS.ASSESSMENT_COMPLETED='assessment_completed'`, `EVENTS.ASSESSMENT_SIGNUP_CLICKED='assessment_signup_clicked'`.

- [ ] **Step 1:** Add the three constants under a `// Public reading assessment (pre-auth funnel)` comment.
- [ ] **Step 2:** Commit `feat(analytics): assessment funnel events`.

---

### Task 5: Route matcher

**Files:**
- Modify: `src/routes.js` (add `isAssessmentPath`)
- Test: `src/routes.test.js` (existing — add cases)

**Interfaces:**
- Produces: `isAssessmentPath(pathname)` → boolean, true for `/how-much-can-you-read` (with/without trailing slash).

- [ ] **Step 1: Add failing tests** in `src/routes.test.js`:

```js
import { isAssessmentPath } from './routes'
it('recognizes the assessment route', () => {
  expect(isAssessmentPath('/how-much-can-you-read')).toBe(true)
  expect(isAssessmentPath('/how-much-can-you-read/')).toBe(true)
  expect(isAssessmentPath('/read/abc')).toBe(false)
  expect(isAssessmentPath('/')).toBe(false)
})
```

- [ ] **Step 2: Run — FAIL** (`npx vitest run src/routes.test.js`).
- [ ] **Step 3: Implement**:

```js
// Recognize the public reading-assessment route (works signed-out).
export function isAssessmentPath(pathname) {
  let p = pathname || '/'
  if (p.startsWith('/')) p = p.slice(1)
  return p.replace(/\/$/, '') === 'how-much-can-you-read'
}
```

- [ ] **Step 4: Run — PASS**. **Step 5: Commit** `feat(routes): assessment route matcher`.

---

### Task 6: The page (`src/HowMuchCanYouRead.jsx`)

**Files:**
- Create: `src/HowMuchCanYouRead.jsx`

**Interfaces:**
- Consumes: `supabase.rpc('public_assessment_vocab', { p_language })`; everything from `src/assessment.js`; `track` + `EVENTS`; `shareReadingCard` from `shareCard.js`; corpus via `import corpus from '../data/assessment-corpus.chinese.json'`.
- Produces: default-exported React component (no props), a self-contained page (no app shell).

- [ ] **Step 1: Build the state machine** — phases `intro | loading | quiz | result | error`. On mount: `track(ASSESSMENT_STARTED)`, call the RPC; on success build questions with `pickAssessmentQuestions`; on RPC error or empty vocab → `error` phase (friendly retry, `console.error`).
- [ ] **Step 2: Quiz UI** — one question at a time, 4 tappable options, slim progress bar; record `{bandKey, correct}` per answer; no harsh right/wrong feedback (this is an estimate). After the last question compute `estimateKnownFrontier` → `estimateReadingPercent` → `levelLabelForFrontier`; `track(ASSESSMENT_COMPLETED, { pct, label })`; go to `result`.
- [ ] **Step 3: Result UI** — animated `~X%` + level label + one encouraging line; a **Share** button (`shareReadingCard({ knownPct, languageName:'Chinese', storyTitle:null, ... })`, reusing the existing card) and a primary **"Sign up free to learn the words you're missing"** button → `track(ASSESSMENT_SIGNUP_CLICKED)` then navigate to `/` (onboarding). Signed-in visitors: swap the CTA for "Back to app" → `/`.
- [ ] **Step 4: Style** to match `PublicStory` (no shell, brand accent, light/dark aware, mobile-first). Reuse its layout scaffolding where practical.
- [ ] **Step 5: Manual smoke** (see Task 8 verification) and **Commit** `feat(assessment): signed-out How-much-can-you-read page`.

---

### Task 7: Wire the route in `App.jsx`

**Files:**
- Modify: `src/App.jsx` (add lazy import + a render branch before the Landing gate)

**Interfaces:**
- Consumes: `isAssessmentPath` from `./routes`; `HowMuchCanYouRead` lazy component.

- [ ] **Step 1:** Add `const HowMuchCanYouRead = lazy(() => import('./HowMuchCanYouRead'))` beside the other lazies, and `import { ..., isAssessmentPath } from './routes'`.
- [ ] **Step 2:** Compute `const assessment = isAssessmentPath(location.pathname)` next to `publicStoryId`.
- [ ] **Step 3:** Add a render branch **before** `if (!session) return <Landing/>` (assessment works for everyone, signed-in or out):

```jsx
if (assessment) {
  return (
    <Suspense fallback={<ViewFallback />}>
      <HowMuchCanYouRead />
    </Suspense>
  )
}
```

- [ ] **Step 4:** `npm run build` to confirm the bundle/lazy split compiles. **Commit** `feat(app): route /how-much-can-you-read to the assessment page`.

---

### Task 8: Landing entry point

**Files:**
- Modify: `src/Landing.jsx`

- [ ] **Step 1:** Add a secondary CTA near the hero — "How much Chinese can you read? Take the 60-second test →" linking to `/how-much-can-you-read` (an `<a href>` is fine; it's a full route). Match existing Landing button styling.
- [ ] **Step 2:** `npm run build`. **Commit** `feat(landing): CTA to the reading assessment`.

---

### Task 9: e2e happy path

**Files:**
- Modify: `tests/e2e/mockSupabase.js` (add a `public_assessment_vocab` RPC fixture returning a small Chinese vocab set)
- Create: `tests/e2e/assessment.spec.js`

- [ ] **Step 1:** Add the RPC mock (mirror how `public_story` is mocked): return ~20 rows across levels 1–2 with `word/reading/meaning/level/sort_order`.
- [ ] **Step 2:** Write the spec: visit `/how-much-can-you-read`, click Start, answer all questions (click the first option each time), assert a result with a `%` and a Sign-up CTA appears.
- [ ] **Step 3:** Run `npx playwright test tests/e2e/assessment.spec.js`. Expected: PASS.
- [ ] **Step 4: Commit** `test(e2e): assessment happy path`.

---

## Deploy checklist (post-merge, needs owner's Supabase)
- Apply `20260718150000_add_public_assessment_vocab.sql` (Supabase GitHub integration on merge, or SQL editor).
- Verify `data/assessment-corpus.chinese.json` shipped.
- Smoke-test `/how-much-can-you-read` live; spot-check the % feels right at "all correct" vs "all wrong".

## Self-review notes
- Spec coverage: mechanic (T3/T3b), result+corpus (T2/T3), flow/page (T6), RPC (T1), analytics (T4), route (T5/T7), landing (T8), tests (T3/T5/T9) — all covered.
- The one correctness-critical unit (`assessment.js`) is fully TDD'd with fixtures incl. the "lucky high guess" and "fail band 0" edges.
- Chinese-only enforced via the corpus + Landing copy; band/label logic is data-derived so JP/RU need only a corpus + enabling the language.
