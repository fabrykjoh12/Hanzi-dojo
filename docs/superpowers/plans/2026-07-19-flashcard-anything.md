# "Flashcard Anything" — Deck Integration Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner save ANY reference-dictionary word to their FSRS deck from the Pleco-style entry view — including words that belong to no HSK level — without polluting level tests or curriculum flows.

**Architecture:** Non-curriculum words are registered as **dictionary-sourced `vocabulary` rows** carrying the track's `language`/`system` but a **NULL `level`** (the sentinel that means "not part of any graded level"). A security-definer RPC (`dict_add_to_deck`) does the privileged insert (curriculum-match or new dictionary row) plus the card insert atomically. Level tests are already NULL-safe (they filter `.eq('level', N)`); the one place that must change to *include* these words is the **review deck** fetch, which currently filters them out via `.lte('vocabulary.level', maxLevel)`.

**Tech Stack:** React 19, Vite 8, Supabase (Postgres, RLS, security-definer RPC), Vitest, Playwright. Builds directly on Plan 1 (the reference dictionary), which is merged/branch-complete.

## Global Constraints

- **Chinese only** in practice (the reference dictionary is Chinese), but the mechanism is language-agnostic: a dictionary-sourced word always takes the **active track's** `language` + `system`.
- **Sentinel = NULL `level`.** Dictionary-sourced `vocabulary` rows have `level IS NULL`. Curriculum words are always `level` 1–9, so `level IS NULL` uniquely identifies dictionary-sourced words. Do NOT use `level = 0` (violates the existing check) and do NOT assign a real level (pollutes that level's test).
- **Invariant — dictionary-sourced words must be EXCLUDED from every level-scoped surface:** level tests (`getTestStatus`), placement, level unlock, "% of level mastered", Known-Word Map, Words list, home counts, `studyFloorLevel`/`inCumulativeScope`. These already exclude NULL via `.eq('level', N)` / `.gte/.lte` / `level != null` guards — Task 4 proves it with tests and a documented audit; do not weaken any of those filters.
- **Invariant — dictionary-sourced words must be INCLUDED in the review deck** so they actually get reviewed. This requires the Task 2 change; without it the feature silently fails.
- **Privileged insert only via RPC.** `vocabulary` has no INSERT RLS policy; never attempt a client-side `vocabulary` insert. `cards` DOES have a user INSERT policy, but the RPC does both inserts atomically as `security definer`.
- **Idempotent add-to-deck:** adding a word already in the deck is a no-op (no duplicate card, no duplicate vocab row).
- **Migration naming/conventions:** `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`, `security definer`, `set search_path = public`, `revoke all … from public` + `grant execute … to authenticated`, trailing `notify pgrst, 'reload schema';` (mirror `20260718150000_add_public_assessment_vocab.sql`).
- **Additive:** no change to FSRS math, scheduling, or the existing curriculum add-to-deck path.

---

## File Structure

**Create:**
- `supabase/migrations/20260719130000_flashcard_anything.sql` — relax `vocabulary.level` to nullable; `dict_add_to_deck` RPC.
- `src/data.test.js` — unit tests for the new `getTrackCards({ includeUnleveled })` query-building branch.

**Modify:**
- `src/data.js` — add `includeUnleveled` option to `getTrackCards` (adds NULL-level cards to the `maxLevel` deck).
- `src/Study.jsx` — pass `includeUnleveled: true` on the two review/forecast fetches.
- `src/dictSearch.js` — add `addDictEntryToDeck(supabase, dictEntryId, language, system)` (calls the RPC).
- `src/dictSearch.test.js` — cover the new wrapper.
- `src/DictEntryView.jsx` — enable the Add-to-deck button (`canAddToDeck` true when an `onAddToDeck` is provided); reflect in-deck state.
- `src/Dictionary.jsx` — pass `onAddToDeck` + `canAddToDeck` for full-scope entries; track which dict entries are in the deck.
- `tests/fixtures/mockSupabase.js` — mock `dict_add_to_deck`; add a NULL-level dictionary card to the deck fixture for the review-inclusion e2e.
- `tests/e2e/dictionary.spec.js` — e2e: add a reference word to the deck; assert in-deck state.
- `docs/superpowers/plans/2026-07-19-flashcard-anything.md` — this plan (already created).

**Do NOT modify:** `testLogic.js`, `homeCounts.js`, `levelScope.js`, `prefetch.js`, `PlacementTest.jsx`, `Words.jsx`, `Profile.jsx` — Task 4 proves they're already correct; changing them risks regressions.

---

## Task 1: Migration — nullable level + `dict_add_to_deck` RPC

**Files:**
- Create: `supabase/migrations/20260719130000_flashcard_anything.sql`

**Interfaces:**
- Produces RPC `dict_add_to_deck(p_dict_entry_id uuid, p_language text, p_system text) returns jsonb` where the result is `{ "vocab_id": uuid, "source": "curriculum"|"dictionary", "already_in_deck": boolean }`.

Apply-and-verify (no live DB in the dev sandbox — apply is an operator step).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260719130000_flashcard_anything.sql
-- "Flashcard anything": let a learner save any reference-dictionary word to their
-- FSRS deck. Non-curriculum words become dictionary-sourced vocabulary rows with
-- a NULL level (the sentinel meaning "not part of any graded level"), so they
-- enter spaced repetition but are excluded from level tests / curriculum flows
-- (which all filter on a concrete level). The privileged inserts run in a
-- security-definer RPC because `vocabulary` has no INSERT policy.

-- 1) Allow NULL level for dictionary-sourced words; keep 1..9 valid otherwise.
alter table public.vocabulary alter column level drop not null;
alter table public.vocabulary drop constraint if exists vocabulary_level_check;
alter table public.vocabulary add constraint vocabulary_level_check
  check (level is null or level between 1 and 9);

-- 2) Atomic add-to-deck. Matches the dict entry to an existing curriculum word
-- (same language/system/word) if one exists; otherwise inserts a dictionary-
-- sourced row (level NULL). Then inserts the card if absent. Idempotent.
create or replace function public.dict_add_to_deck(
  p_dict_entry_id uuid,
  p_language text,
  p_system text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.dict_entries;
  v_vocab_id uuid;
  v_source text;
  v_meaning text;
  v_already boolean := false;
  v_has_track boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must own an active track for this language/system.
  select exists (
    select 1 from public.language_tracks
    where user_id = v_user_id and language = p_language
      and system = p_system and is_active = true
  ) into v_has_track;
  if not v_has_track then
    raise exception 'Language track not found';
  end if;

  select * into v_entry from public.dict_entries where id = p_dict_entry_id;
  if not found then
    raise exception 'Dictionary entry not found';
  end if;

  -- Existing curriculum word for this simplified form?
  select id into v_vocab_id
  from public.vocabulary
  where language = p_language and system = p_system
    and word = v_entry.simplified and is_active = true
  order by level nulls last
  limit 1;

  if v_vocab_id is not null then
    v_source := 'curriculum';
  else
    -- New dictionary-sourced row (NULL level). meaning is required NOT NULL.
    v_meaning := coalesce(
      (select string_agg(value::text, '; ')
         from jsonb_array_elements_text(v_entry.definitions) as t(value)),
      v_entry.simplified);
    insert into public.vocabulary
      (language, system, level, sort_order, word, reading, reading_plain, meaning, is_active)
    values
      (p_language, p_system, null, 0, v_entry.simplified, v_entry.pinyin, v_entry.pinyin_plain, v_meaning, true)
    returning id into v_vocab_id;
    v_source := 'dictionary';
  end if;

  -- Insert the card if the user doesn't already have one for this vocab.
  if exists (select 1 from public.cards where user_id = v_user_id and vocab_id = v_vocab_id) then
    v_already := true;
  else
    insert into public.cards (user_id, vocab_id, state, ease_factor, learning_step, due_at)
    values (v_user_id, v_vocab_id, 'new', 2.5, 0, now());
  end if;

  return jsonb_build_object('vocab_id', v_vocab_id, 'source', v_source, 'already_in_deck', v_already);
end;
$$;

revoke all on function public.dict_add_to_deck(uuid, text, text) from public;
grant execute on function public.dict_add_to_deck(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: By-eye checks (no live DB)**

Confirm: `alter column level drop not null` + new check constraint; the RPC is `security definer` / `set search_path = public`; it validates `auth.uid()` and track ownership; inserts `vocabulary` with `level = null, sort_order = 0`; card insert guarded by an existence check (idempotent); `revoke`/`grant`; trailing `notify`. Compare style against `20260718150000_add_public_assessment_vocab.sql` and the `reset_current_language_progress` function (both in the repo) for the track-ownership pattern.

- [ ] **Step 3: Apply + smoke (operator, when a DB is available)**

Apply to a branch DB; then, as an authenticated user with a chinese/hsk_3 track:
```sql
select public.dict_add_to_deck('<a dict_entries.id>', 'chinese', 'hsk_3');   -- expect {"source":"dictionary",...} first time
select public.dict_add_to_deck('<same id>', 'chinese', 'hsk_3');             -- expect already_in_deck=true
select level from public.vocabulary where id = (…);                          -- expect NULL for a non-curriculum word
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260719130000_flashcard_anything.sql
git commit -m "feat: nullable vocabulary level + dict_add_to_deck RPC"
```

---

## Task 2: Include unleveled cards in the review deck (`getTrackCards`)

**Files:**
- Modify: `src/data.js`
- Create: `src/data.test.js`

**Interfaces:**
- Consumes: `supabase` (mocked in the test).
- Produces: `getTrackCards(userId, track, { level, maxLevel, columns, includeUnleveled })`. When `includeUnleveled` is true AND `maxLevel` is set, the vocabulary filter becomes `(level <= maxLevel OR level IS NULL)` instead of `level <= maxLevel`. All other behavior unchanged. `includeUnleveled` has no effect with `level` (exact-level) scope — exact-level queries must stay NULL-free.

- [ ] **Step 1: Write the failing test**

```javascript
// src/data.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// A chainable query-builder spy that records the filter calls and resolves to data.
function makeSupabase(rows = []) {
  const calls = []
  const builder = {}
  for (const m of ['select', 'eq', 'lte', 'or']) {
    builder[m] = vi.fn((...args) => { calls.push([m, ...args]); return builder })
  }
  builder.then = (resolve) => resolve({ data: rows, error: null })
  const supabase = { from: vi.fn(() => builder) }
  return { supabase, builder, calls }
}

vi.mock('./offline', () => ({ cacheGet: vi.fn(async () => null), cacheSet: vi.fn() }))

let getTrackCards
beforeEach(async () => { ({ getTrackCards } = await import('./data')) })

const track = { language: 'chinese', system: 'hsk_3' }

describe('getTrackCards includeUnleveled', () => {
  it('uses lte only when includeUnleveled is false (default)', async () => {
    const { supabase, calls } = makeSupabase()
    await getTrackCards.__setSupabase?.(supabase) // if DI is used; otherwise see Step 3
    await getTrackCards('u1', track, { maxLevel: 3 }, supabase)
    expect(calls.some(c => c[0] === 'lte' && c[1] === 'vocabulary.level' && c[2] === 3)).toBe(true)
    expect(calls.some(c => c[0] === 'or')).toBe(false)
  })

  it('uses an OR (level<=max OR level IS NULL) when includeUnleveled is true', async () => {
    const { supabase, calls } = makeSupabase()
    await getTrackCards('u1', track, { maxLevel: 3, includeUnleveled: true }, supabase)
    const or = calls.find(c => c[0] === 'or')
    expect(or).toBeTruthy()
    expect(or[1]).toBe('level.lte.3,level.is.null')
    expect(or[2]).toEqual({ referencedTable: 'vocabulary' })
    expect(calls.some(c => c[0] === 'lte' && c[1] === 'vocabulary.level')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data.test.js`
Expected: FAIL — `includeUnleveled` not handled / `or` never called (and the injected-supabase param not supported yet).

- [ ] **Step 3: Implement — add the option and make `supabase` injectable for testing**

In `src/data.js`, add an optional 4th arg so the test can inject a fake client without a network. Keep the default to the real `supabase` import (all existing callers pass three args and are unaffected).

```javascript
// signature change:
export async function getTrackCards(userId, track, { level, maxLevel, columns = '*', includeUnleveled = false } = {}, client = supabase) {
  const scope = level != null ? String(level) : (maxLevel != null ? 'lte' + maxLevel + (includeUnleveled ? '+u' : '') : 'all')
  const key = 'cards:' + userId + ':' + track.language + ':' + track.system + ':' + scope + ':' + columns
  try {
    let query = client
      .from('cards')
      .select(columns + ', vocabulary!inner(id, level)')
      .eq('user_id', userId)
      .eq('vocabulary.language', track.language)
      .eq('vocabulary.system', track.system)
    if (level != null) {
      query = query.eq('vocabulary.level', level)
    } else if (maxLevel != null) {
      if (includeUnleveled) {
        // dictionary-sourced words (level IS NULL) belong to the review deck too.
        query = query.or('level.lte.' + maxLevel + ',level.is.null', { referencedTable: 'vocabulary' })
      } else {
        query = query.lte('vocabulary.level', maxLevel)
      }
    }
    const { data, error } = await query
    if (error || !data) {
      const cached = await cacheGet(key)
      return cached || data || []
    }
    cacheSet(key, data)
    return data
  } catch {
    const cached = await cacheGet(key)
    return cached || []
  }
}
```

Note the cache key includes `+u` when `includeUnleveled`, so the unleveled and non-unleveled decks never collide in IndexedDB.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data.test.js`
Expected: PASS.

- [ ] **Step 5: Wire Study to include unleveled cards in the review deck**

In `src/Study.jsx`, the two review/forecast fetches (currently `getTrackCards(session.user.id, track, { maxLevel: track.current_level, ... })` at ~line 268 and ~line 453) add `includeUnleveled: true`:

```javascript
// line ~268
const cards = await getTrackCards(session.user.id, track, { maxLevel: track.current_level, includeUnleveled: true })
// line ~453
const cards = await getTrackCards(session.user.id, track, {
  maxLevel: track.current_level,
  columns: 'vocab_id, state, due_at',
  includeUnleveled: true,
})
```

Do NOT add `includeUnleveled` anywhere that uses exact `level` scope (level tests / per-level views).

- [ ] **Step 6: Full unit run + lint**

Run: `npx vitest run && npx eslint src/data.js src/Study.jsx`
Expected: all pass; eslint clean.

- [ ] **Step 7: Commit**

```bash
git add src/data.js src/data.test.js src/Study.jsx
git commit -m "feat: include dictionary-sourced (unleveled) cards in the review deck"
```

---

## Task 3: Client add-to-deck wiring

**Files:**
- Modify: `src/dictSearch.js`, `src/dictSearch.test.js`, `src/DictEntryView.jsx`, `src/Dictionary.jsx`

**Interfaces:**
- Produces: `addDictEntryToDeck(supabase, dictEntryId, language, system): Promise<{ vocab_id, source, already_in_deck }>` — calls RPC `dict_add_to_deck`.
- `DictEntryView` renders the Add button when `canAddToDeck` is truthy (already gated in Plan 1); `onAddToDeck(entry)` is invoked on tap. `Dictionary` supplies both for full-scope entries and tracks in-deck ids so the button reflects state.

- [ ] **Step 1: Write the failing test for the wrapper**

Add to `src/dictSearch.test.js`:

```javascript
describe('addDictEntryToDeck', () => {
  it('calls dict_add_to_deck with entry id, language, system', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { vocab_id: 'v1', source: 'dictionary', already_in_deck: false }, error: null })
    const res = await addDictEntryToDeck({ rpc }, 'd1', 'chinese', 'hsk_3')
    expect(rpc).toHaveBeenCalledWith('dict_add_to_deck', { p_dict_entry_id: 'd1', p_language: 'chinese', p_system: 'hsk_3' })
    expect(res).toEqual({ vocab_id: 'v1', source: 'dictionary', already_in_deck: false })
  })
  it('throws on RPC error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('nope') })
    await expect(addDictEntryToDeck({ rpc }, 'd1', 'chinese', 'hsk_3')).rejects.toThrow('nope')
  })
})
```

Add `addDictEntryToDeck` to the import line at the top of the test file.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/dictSearch.test.js`
Expected: FAIL — `addDictEntryToDeck is not a function`.

- [ ] **Step 3: Implement the wrapper in `src/dictSearch.js`**

```javascript
export async function addDictEntryToDeck(supabase, dictEntryId, language, system) {
  const { data, error } = await supabase.rpc('dict_add_to_deck', {
    p_dict_entry_id: dictEntryId, p_language: language, p_system: system,
  })
  if (error) throw error
  return data
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/dictSearch.test.js`
Expected: PASS.

- [ ] **Step 5: Wire `Dictionary.jsx` (full-scope entries)**

Add an in-deck set for dictionary entries and an add handler, then pass them to `DictEntryView`. Near the other state in `src/Dictionary.jsx`:

```javascript
const [dictInDeck, setDictInDeck] = useState(() => new Set())

const addDictToDeck = async (entry) => {
  if (!entry || dictInDeck.has(entry.id)) return
  try {
    const res = await addDictEntryToDeck(supabase, entry.id, track.language, track.system)
    if (res) setDictInDeck(prev => new Set(prev).add(entry.id))
  } catch { /* surfaced by the disabled→enabled state; no crash */ }
}
```

Import: `import { addDictEntryToDeck } from './dictSearch'` (extend the existing import from `./dictSearch`).

In the full-scope drill-down sheet (Plan 1 Task 7), pass to `DictEntryView`:

```jsx
<DictEntryView
  entry={entryStack[entryStack.length - 1]}
  accentHex={accentHex}
  langFont={langFont}
  ttsLang={ttsLang}
  canAddToDeck={true}
  inDeck={dictInDeck.has(entryStack[entryStack.length - 1].id)}
  onAddToDeck={addDictToDeck}
  onOpenEntry={/* unchanged from Plan 1 */}
/>
```

- [ ] **Step 6: Reflect in-deck state in `DictEntryView.jsx`**

Add an `inDeck` prop; when true, the bookmark icon is filled/accent and the label reads "In deck". The button stays enabled (adding again is a harmless no-op server-side, but prefer a guard):

```jsx
// signature: add `inDeck` to props
{canAddToDeck && (
  <button className="dict-act" onClick={() => !inDeck && onAddToDeck && onAddToDeck(entry)} aria-label={inDeck ? 'In your deck' : 'Add to deck'} aria-pressed={inDeck}>
    <Bookmark size={19} color={inDeck ? accentHex : 'currentColor'} fill={inDeck ? accentHex : 'none'} />
    <span>{inDeck ? 'In deck' : 'Add'}</span>
  </button>
)}
```

(`Bookmark` is already imported in `DictEntryView`.)

- [ ] **Step 7: Unit run + lint + build**

Run: `npx vitest run && npx eslint src/dictSearch.js src/DictEntryView.jsx src/Dictionary.jsx && npm run build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/dictSearch.js src/dictSearch.test.js src/DictEntryView.jsx src/Dictionary.jsx
git commit -m "feat: add any reference word to the deck from the entry view"
```

---

## Task 4: Level-test safety audit (tests that lock the invariant)

**Files:**
- Modify: `src/testLogic.test.js` (add cases) — or create `src/levelScope.test.js` if none exists for the pure guards.

**Interfaces:** none new — this task adds tests that FAIL if a future change lets a NULL-level word leak into a level-scoped surface, and a written audit of every level-enumerating query.

- [ ] **Step 1: Audit (write findings into the plan/PR description, no code)**

Enumerate every query that selects vocabulary by level and confirm NULL exclusion. Expected result (verify each against current source):
- `testLogic.js:getTestStatus` — `.eq('level', current_level)` on vocabulary AND `getTrackCards({ level })` → both exclude NULL. ✅
- `homeCounts.js` — `.gte('level', floor).lte('level', current)` → NULL excluded (NULL fails comparisons). ✅
- `prefetch.js`, `Words.jsx`, `FillBlank.jsx`, `Listen.jsx`, `Tones.jsx`, `Writer.jsx`, `Writing.jsx`, `Speaking.jsx`, `SentenceBuilder.jsx`, `Grammar.jsx`, `YouTube.jsx`, `Test.jsx`, `PlacementTest.jsx`, `Profile.jsx`, `Stories.jsx` — all use `.eq('level', …)` or `.gte/.lte` → NULL excluded. ✅
- `levelScope.js:cardLevel/studyFloorLevel/inCumulativeScope` — explicit `level != null` guards → NULL treated as out-of-scope. ✅
- `Study.jsx` new-card introduction — introduces new words BY LEVEL; dictionary words already have a card (created by the RPC) so they are never "introduced", only reviewed. ✅

- [ ] **Step 2: Write tests that lock `levelScope` NULL-handling**

Create `src/levelScope.test.js` (if absent):

```javascript
import { describe, it, expect } from 'vitest'
import { studyFloorLevel, inCumulativeScope } from './levelScope'

describe('levelScope excludes NULL-level (dictionary-sourced) cards', () => {
  it('studyFloorLevel ignores cards whose vocabulary.level is null', () => {
    const cards = [
      { vocabulary: { level: 3 } },
      { vocabulary: { level: null } }, // dictionary-sourced
    ]
    expect(studyFloorLevel(cards, 5)).toBe(3) // null card does not drag the floor
  })
  it('inCumulativeScope is false for a null level', () => {
    expect(inCumulativeScope(null, 1, 9)).toBe(false)
  })
})
```

- [ ] **Step 3: Write a test that locks `getTestStatus` mastery math against a NULL-level card**

Add to `src/testLogic.test.js` a case proving a NULL-level card does not inflate `totalWords` or `masteredCount`. Follow the file's existing supabase-mock style; if `getTestStatus` is hard to mock there, assert the narrower guarantee via the vocab-id set logic: a card whose `vocab_id` is not in the level's vocab-id set is never counted. Reuse the file's existing mock pattern (read `src/testLogic.test.js` first and match it). The assertion: given level vocab `[a,b]` and cards `[a(mastered), z(mastered, null-level)]`, `masteredCount === 1` and `totalWords === 2` (z ignored).

- [ ] **Step 4: Run**

Run: `npx vitest run src/levelScope.test.js src/testLogic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/levelScope.test.js src/testLogic.test.js
git commit -m "test: lock dictionary-sourced (null-level) words out of level-scoped surfaces"
```

---

## Task 5: e2e — add to deck + review inclusion

**Files:**
- Modify: `tests/fixtures/mockSupabase.js`, `tests/e2e/dictionary.spec.js`

**Interfaces:** consumes the mocked backend. e2e is mock-based; Chromium is pre-installed; runnable in-sandbox.

- [ ] **Step 1: Mock `dict_add_to_deck` + add a NULL-level card fixture**

In `tests/fixtures/mockSupabase.js` rpc branch, add `dict_add_to_deck` → returns `{ vocab_id: 'ddeck1', source: 'dictionary', already_in_deck: false }`. Also add one card to `CARDS` whose joined `vocabulary.level` is `null` (dictionary-sourced), e.g. a `card(...)`-style row with `vocabulary: { id: 'dv1', level: null, word: '中文', reading: 'zhōng wén', meaning: 'Chinese language', language: 'chinese', system: 'hsk', is_active: true }`, `state: 'review'`, `due_at: dueNow` — so a review-deck assertion can see it. Keep it additive; don't disturb existing counts other tests assert on (prefer adding it in a dedicated test via `page.route` override rather than the global fixture if a global count would break another spec — check `study.spec.js` / `home.spec.js` expectations first).

- [ ] **Step 2: e2e — add a reference word to the deck**

Add to `tests/e2e/dictionary.spec.js`:

```javascript
test('adds a reference word to the deck from the entry', async ({ page }) => {
  await page.goto('/dictionary')
  await page.getByLabel('Search the dictionary').fill('zhong')
  await page.getByRole('button').filter({ hasText: '中文' }).first().click()
  const add = page.getByRole('button', { name: 'Add to deck' })
  await expect(add).toBeVisible()
  await add.click()
  await expect(page.getByRole('button', { name: 'In your deck' })).toBeVisible()
})
```

- [ ] **Step 3: Run the suite**

Run: `npm run e2e -- dictionary` then `npm run build` then `npx vitest run`
Expected: Dictionary e2e all pass (existing + new); build ok; unit green. Iterate on test/mock (never app source) until green.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/mockSupabase.js tests/e2e/dictionary.spec.js
git commit -m "test: e2e add-to-deck for reference words"
```

---

## Self-Review

**Spec coverage:**
- Flashcard-anything write path → Task 1 (RPC) + Task 3 (client). ✅
- NULL sentinel level, curriculum-match reuse → Task 1 RPC. ✅
- Excluded from level tests/curriculum → Task 4 (audit + tests); already NULL-safe, not weakened. ✅
- Included in review deck (the real gap) → Task 2. ✅
- Idempotent add → Task 1 (card existence guard) + Task 3 (in-deck set). ✅
- Privileged insert via security-definer RPC (no vocabulary INSERT policy) → Task 1. ✅

**Placeholder scan:** none — the operator apply/seed steps are genuine out-of-band DB actions with exact SQL given.

**Type consistency:** RPC name/params (`dict_add_to_deck`, `p_dict_entry_id/p_language/p_system`) match between Task 1 SQL and Task 3 wrapper. `{ vocab_id, source, already_in_deck }` shape consistent across RPC → `addDictEntryToDeck` → `addDictToDeck`. `getTrackCards` option name `includeUnleveled` consistent between Task 2 impl, its test, and the Study call sites.

**Risk notes:**
- The `getTrackCards` `.or(..., { referencedTable })` embedded-filter is verified at the unit level by asserting the builder call; the actual PostgREST semantics (`level<=max OR level IS NULL` on the inner join) is an **operator verification** step against a real DB — call it out in the PR so it's checked before enabling for users.
- If a global NULL-level fixture card would break `study.spec.js`/`home.spec.js` counts, Task 5 Step 1 uses a per-test `page.route` override instead — the implementer must check those specs first.
