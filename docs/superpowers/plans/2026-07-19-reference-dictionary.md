# Reference Dictionary (Read-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Dictionary screen into a professional, Pleco-style Chinese reference dictionary backed by ~120k CC-CEDICT entries with Tatoeba example sentences, rich entries, and fast Postgres search.

**Architecture:** Two new Supabase tables (`dict_entries`, `dict_examples`) hold the reference data, decoupled from the curriculum `vocabulary` table. A one-time Node seed script (`seed-dict.mjs`) parses CC-CEDICT + Tatoeba and bulk-inserts. The client searches via a security-definer Postgres RPC (`dict_search`) and renders a "Refined" entry view — tone-colored headword + character cards, neutral everything-else, with `Meaning · Chars · Examples` tabs.

**Tech Stack:** React 19, Vite 8, Supabase (Postgres + `pg_trgm`), Vitest for unit tests, Playwright for e2e. Pure logic lives in small tested modules (`src/cedict.js`, `src/toneColor.js`, `src/dictSearch.js`); the migration + RPC are apply-and-verify.

## Global Constraints

- **Scope:** Chinese only (`language = 'chinese'`, `system = 'hsk_3'`). No Japanese/Russian changes.
- **Read-only:** This plan adds NO write path to the deck. "Flashcard anything" (add-to-deck for non-curriculum words) is Plan 2. Add-to-deck in the entry view stays enabled ONLY for entries that already map to a curriculum `vocabulary` row (Task 8); otherwise the button is hidden.
- **Additive & reversible:** No changes to FSRS, level tests, or existing reader behavior. The one schema change to an existing table (`vocabulary.level` nullability) is deferred to Plan 2 — this plan does NOT touch `vocabulary`.
- **Fonts/UI tokens:** reuse existing CSS variables (`--surface`, `--border`, `--text`, `--text-muted`, `--text-faint`) and the Chinese accent from `languageTheme('chinese').accentHex` = `#B83A24`. Chinese font token: `'Noto Sans SC'`.
- **Search folding:** reuse `foldForSearch`/`foldIncludes` from `src/searchFold.js` for toneless pinyin — never reimplement diacritic folding.
- **Tone palette (light / dark):** tone 1 `#C0392B` / `#E56A5A`; tone 2 `#1E9E57` / `#43C27E`; tone 3 `#2C6BD6` / `#5E9BFF`; tone 4 `#8E44AD` / `#C084E8`; tone 5 (neutral) `var(--text-muted)`.
- **Migration naming:** `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`, snake_case, following the `notify pgrst, 'reload schema';` + `security definer` + `set search_path = public` conventions in `20260718150000_add_public_assessment_vocab.sql`.
- **Commits:** frequent, one per task minimum. Author/committer identity is handled by the environment.

---

## File Structure

**Create:**
- `src/cedict.js` — pure CC-CEDICT line parser + numbered→tone-marked pinyin. One responsibility: turn raw dictionary text into structured entries.
- `src/cedict.test.js`
- `src/toneColor.js` — pure tone detection + per-character tone splitting + color-var mapping. One responsibility: tone→color.
- `src/toneColor.test.js`
- `src/dictSearch.js` — query classification + the `searchDict`/`getDictEntry` Supabase RPC wrappers. One responsibility: talk to the search backend.
- `src/dictSearch.test.js`
- `src/DictEntryView.jsx` — the Refined entry (hero, tabs, senses, breakdown, words-containing, examples). One responsibility: render one entry.
- `supabase/migrations/20260719120000_add_reference_dictionary.sql` — tables, indexes, RLS, RPCs.
- `seed-dict.mjs` — the CC-CEDICT + Tatoeba ingest CLI (root, mirroring `seed-vocab.mjs`).
- `data/cedict.sample.u8` — a tiny CC-CEDICT fixture (10 lines) for the seed dry-run + parser tests.

**Modify:**
- `src/Dictionary.jsx` — switch the data source from the `vocabulary` table to `dict_entries` via `dictSearch`; full-dictionary default with a syllabus scope toggle; open `DictEntryView`.
- `tests/e2e/dictionary.spec.js` — extend/adjust for the new data source and entry view.

**Do NOT modify in this plan:** `src/WordLookupSheet.jsx` (readers keep their simple sheet), `src/data.js`, `vocabulary` table, FSRS/test logic.

---

## Task 1: CC-CEDICT parser (`src/cedict.js`)

**Files:**
- Create: `src/cedict.js`
- Test: `src/cedict.test.js`

**Interfaces:**
- Produces:
  - `numberedPinyinToMarks(numbered: string): string` — `"zhong1 wen2"` → `"zhōng wén"`.
  - `parseCedictLine(line: string): { traditional, simplified, pinyin, pinyinPlain, definitions: string[] } | null` — returns `null` for comment (`#…`) or blank lines.

CC-CEDICT line format (verbatim): `傳統 传统 [chuan2 tong3] /tradition/traditional/` — fields are `TRAD SIMP [pinyin] /def/def/`. Comments start with `#`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/cedict.test.js
import { describe, it, expect } from 'vitest'
import { numberedPinyinToMarks, parseCedictLine } from './cedict'

describe('numberedPinyinToMarks', () => {
  it('places the tone mark by vowel priority', () => {
    expect(numberedPinyinToMarks('zhong1 wen2')).toBe('zhōng wén')
    expect(numberedPinyinToMarks('ni3 hao3')).toBe('nǐ hǎo')
    expect(numberedPinyinToMarks('lu:4')).toBe('lǜ')       // u: → ü
    expect(numberedPinyinToMarks('peng2 you5')).toBe('péng you') // 5 = neutral, no mark
    expect(numberedPinyinToMarks('xiu1')).toBe('xiū')      // iu → mark on u
    expect(numberedPinyinToMarks('gui4')).toBe('guì')      // ui → mark on i
  })
})

describe('parseCedictLine', () => {
  it('parses a standard entry', () => {
    const r = parseCedictLine('傳統 传统 [chuan2 tong3] /tradition/traditional/')
    expect(r).toEqual({
      traditional: '傳統',
      simplified: '传统',
      pinyin: 'chuán tǒng',
      pinyinPlain: 'chuan tong',
      definitions: ['tradition', 'traditional'],
    })
  })
  it('returns null for comments and blanks', () => {
    expect(parseCedictLine('# CC-CEDICT')).toBeNull()
    expect(parseCedictLine('   ')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cedict.test.js`
Expected: FAIL — `parseCedictLine is not a function`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/cedict.js
// Pure CC-CEDICT parsing. CC-CEDICT lines look like:
//   傳統 传统 [chuan2 tong3] /tradition/traditional/
// Comments start with '#'. Pinyin is space-separated syllables with a trailing
// tone digit 1-5 (5 = neutral). We convert to tone marks for display and derive
// a toneless form for search (via the shared searchFold).
import { foldForSearch } from './searchFold'

const VOWELS = 'aeiouü'
// Tone marks indexed [tone-1] per vowel.
const MARKS = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

// Which vowel in a syllable carries the mark:
//   - 'a' or 'e' if present; else 'ou' → 'o'; else the LAST vowel.
function markTarget(letters) {
  const lower = letters.toLowerCase()
  if (lower.includes('a')) return lower.indexOf('a')
  if (lower.includes('e')) return lower.indexOf('e')
  if (lower.includes('ou')) return lower.indexOf('o')
  for (let i = lower.length - 1; i >= 0; i--) {
    if (VOWELS.includes(lower[i])) return i
  }
  return -1
}

function syllableToMarks(syl) {
  // Normalise u: / v → ü first.
  let s = syl.replace(/u:/g, 'ü').replace(/v/g, 'ü')
  const m = s.match(/^([a-zü]+)([1-5])$/i)
  if (!m) return s // r5 erhua or punctuation — leave as-is
  const [, letters, toneStr] = m
  const tone = Number(toneStr)
  if (tone === 5) return letters // neutral tone, no mark
  const idx = markTarget(letters)
  if (idx < 0) return letters
  const v = letters[idx].toLowerCase()
  const marked = (MARKS[v] || [])[tone - 1]
  if (!marked) return letters
  return letters.slice(0, idx) + marked + letters.slice(idx + 1)
}

export function numberedPinyinToMarks(numbered) {
  return (numbered || '')
    .trim()
    .split(/\s+/)
    .map(syllableToMarks)
    .join(' ')
    .trim()
}

const LINE_RE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/

export function parseCedictLine(line) {
  const raw = (line || '').trim()
  if (!raw || raw.startsWith('#')) return null
  const m = raw.match(LINE_RE)
  if (!m) return null
  const [, traditional, simplified, pinyinRaw, defsRaw] = m
  const pinyin = numberedPinyinToMarks(pinyinRaw)
  const definitions = defsRaw.split('/').map(d => d.trim()).filter(Boolean)
  return {
    traditional,
    simplified,
    pinyin,
    pinyinPlain: foldForSearch(pinyin),
    definitions,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cedict.test.js`
Expected: PASS (both suites).

- [ ] **Step 5: Commit**

```bash
git add src/cedict.js src/cedict.test.js
git commit -m "feat: CC-CEDICT line parser + numbered→tone-marked pinyin"
```

---

## Task 2: Tone-color utilities (`src/toneColor.js`)

**Files:**
- Create: `src/toneColor.js`
- Test: `src/toneColor.test.js`

**Interfaces:**
- Produces:
  - `toneOf(syllable: string): 1|2|3|4|5` — tone of a tone-marked pinyin syllable (5 = neutral/unknown).
  - `splitHanziWithTones(hanzi: string, pinyin: string): Array<{ char: string, tone: number }>` — pairs each headword character with the tone of the aligned pinyin syllable.
  - `TONE_CLASS[tone]: string` — CSS class name (`'tone-1'…'tone-5'`) used by `DictEntryView` and the stylesheet.

- [ ] **Step 1: Write the failing test**

```javascript
// src/toneColor.test.js
import { describe, it, expect } from 'vitest'
import { toneOf, splitHanziWithTones, TONE_CLASS } from './toneColor'

describe('toneOf', () => {
  it('reads the tone off a marked syllable', () => {
    expect(toneOf('zhōng')).toBe(1)
    expect(toneOf('wén')).toBe(2)
    expect(toneOf('nǐ')).toBe(3)
    expect(toneOf('guì')).toBe(4)
    expect(toneOf('you')).toBe(5) // no mark = neutral
  })
})

describe('splitHanziWithTones', () => {
  it('aligns each character with its syllable tone', () => {
    expect(splitHanziWithTones('中文', 'zhōng wén')).toEqual([
      { char: '中', tone: 1 },
      { char: '文', tone: 2 },
    ])
  })
  it('falls back to neutral when counts mismatch', () => {
    expect(splitHanziWithTones('你好呀', 'nǐ hǎo')).toEqual([
      { char: '你', tone: 3 },
      { char: '好', tone: 3 },
      { char: '呀', tone: 5 },
    ])
  })
})

describe('TONE_CLASS', () => {
  it('maps tones to class names', () => {
    expect(TONE_CLASS[1]).toBe('tone-1')
    expect(TONE_CLASS[5]).toBe('tone-5')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/toneColor.test.js`
Expected: FAIL — `toneOf is not a function`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/toneColor.js
// Tone → color, applied with restraint (see the "Refined" design direction):
// only the headword characters and the character-breakdown cards get colored.
// Pure and unit-tested. The class names map to CSS defined once in the entry
// view; the palette lives there so light/dark are handled by CSS variables.

// Combining tone marks (NFD) → tone number.
const MARK_TONE = {
  '̄': 1, // macron  ̄
  '́': 2, // acute   ́
  '̌': 3, // caron   ̌
  '̀': 4, // grave   ̀
}

export function toneOf(syllable) {
  const decomposed = (syllable || '').normalize('NFD')
  for (const ch of decomposed) {
    if (MARK_TONE[ch]) return MARK_TONE[ch]
  }
  return 5
}

// Pair each hanzi character with the tone of the aligned pinyin syllable. When
// the syllable count doesn't match the character count (rare: erhua, proper
// nouns), extra characters fall back to neutral rather than misaligning.
export function splitHanziWithTones(hanzi, pinyin) {
  const chars = [...(hanzi || '')]
  const sylls = (pinyin || '').trim().split(/\s+/).filter(Boolean)
  return chars.map((char, i) => ({
    char,
    tone: i < sylls.length ? toneOf(sylls[i]) : 5,
  }))
}

export const TONE_CLASS = { 1: 'tone-1', 2: 'tone-2', 3: 'tone-3', 4: 'tone-4', 5: 'tone-5' }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/toneColor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/toneColor.js src/toneColor.test.js
git commit -m "feat: tone-color utilities for the dictionary entry"
```

---

## Task 3: Migration — tables, indexes, RLS, search RPCs

**Files:**
- Create: `supabase/migrations/20260719120000_add_reference_dictionary.sql`

**Interfaces:**
- Produces three RPCs the client calls (Task 5):
  - `dict_search(p_query text, p_limit int) → setof dict_entries-shaped rows`
  - `dict_entry(p_id uuid) → one entry row`
  - `dict_examples_for(p_word text, p_limit int) → setof {hanzi, pinyin, english}`
  - `dict_words_containing(p_word text, p_id uuid, p_limit int) → setof {id, simplified, pinyin, definitions}`

This task has no unit test (pure SQL). It is **apply-and-verify**: apply to a Supabase branch, then run the verification queries in Step 3.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260719120000_add_reference_dictionary.sql
-- Pleco-style reference dictionary (Chinese). Two read-only reference tables,
-- decoupled from the curriculum `vocabulary` table, plus security-definer search
-- RPCs. Mirrors the data-minimization + RLS conventions of
-- 20260718150000_add_public_assessment_vocab.sql.

create extension if not exists pg_trgm;

-- ~120k CC-CEDICT headwords.
create table if not exists public.dict_entries (
  id uuid primary key default gen_random_uuid(),
  language text not null default 'chinese' check (language in ('chinese')),
  simplified text not null,
  traditional text not null,
  pinyin text not null,             -- tone-marked, e.g. 'zhōng wén'
  pinyin_plain text not null,       -- toneless, lowercased, for search
  definitions jsonb not null,       -- array of sense strings
  hsk_level int,                    -- denormalized convenience; source of truth stays vocabulary
  created_at timestamptz not null default now()
);

-- Tatoeba Chinese↔English sentence pairs.
create table if not exists public.dict_examples (
  id uuid primary key default gen_random_uuid(),
  language text not null default 'chinese' check (language in ('chinese')),
  hanzi text not null,
  pinyin text,
  english text not null,
  created_at timestamptz not null default now()
);

-- Search indexes.
create index if not exists dict_entries_simp_trgm on public.dict_entries using gin (simplified gin_trgm_ops);
create index if not exists dict_entries_trad_trgm on public.dict_entries using gin (traditional gin_trgm_ops);
create index if not exists dict_entries_pinyin_trgm on public.dict_entries using gin (pinyin_plain gin_trgm_ops);
create index if not exists dict_entries_defs_trgm on public.dict_entries using gin ((definitions::text) gin_trgm_ops);
create index if not exists dict_entries_simp_eq on public.dict_entries (simplified);
create index if not exists dict_examples_hanzi_trgm on public.dict_examples using gin (hanzi gin_trgm_ops);

-- RLS: authenticated read-only, matching the vocabulary policy stance.
alter table public.dict_entries enable row level security;
alter table public.dict_examples enable row level security;
create policy "authenticated can read dict_entries" on public.dict_entries for select to authenticated using (true);
create policy "authenticated can read dict_examples" on public.dict_examples for select to authenticated using (true);

-- Ranked search: exact simplified/traditional > prefix > pinyin_plain prefix >
-- contains (hanzi / pinyin / english). Case/tone folding for pinyin & english is
-- done on the client (lower + strip marks) before the call; we lower() here too
-- for english so the two meet.
create or replace function public.dict_search(p_query text, p_limit int default 60)
returns setof public.dict_entries
language sql
stable
security definer
set search_path = public
as $$
  select e.*
  from public.dict_entries e
  where p_query <> '' and (
    e.simplified ilike '%' || p_query || '%'
    or e.traditional ilike '%' || p_query || '%'
    or e.pinyin_plain ilike '%' || p_query || '%'
    or (definitions::text) ilike '%' || p_query || '%'
  )
  order by
    (e.simplified = p_query or e.traditional = p_query) desc,             -- exact hanzi
    (e.pinyin_plain = p_query) desc,                                      -- exact toneless pinyin
    (e.simplified ilike p_query || '%' or e.pinyin_plain ilike p_query || '%') desc, -- prefix
    char_length(e.simplified) asc,                                        -- shorter first
    e.simplified asc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.dict_entry(p_id uuid)
returns public.dict_entries
language sql
stable
security definer
set search_path = public
as $$
  select * from public.dict_entries where id = p_id;
$$;

create or replace function public.dict_examples_for(p_word text, p_limit int default 4)
returns table (hanzi text, pinyin text, english text)
language sql
stable
security definer
set search_path = public
as $$
  select x.hanzi, x.pinyin, x.english
  from public.dict_examples x
  where p_word <> '' and x.hanzi like '%' || p_word || '%'
  order by char_length(x.hanzi) asc
  limit greatest(1, least(p_limit, 10));
$$;

create or replace function public.dict_words_containing(p_word text, p_id uuid, p_limit int default 12)
returns table (id uuid, simplified text, pinyin text, definitions jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.simplified, e.pinyin, e.definitions
  from public.dict_entries e
  where p_word <> ''
    and e.simplified like '%' || p_word || '%'
    and e.id <> p_id
  order by char_length(e.simplified) asc, e.simplified asc
  limit greatest(1, least(p_limit, 30));
$$;

revoke all on function public.dict_search(text, int) from public;
revoke all on function public.dict_entry(uuid) from public;
revoke all on function public.dict_examples_for(text, int) from public;
revoke all on function public.dict_words_containing(text, uuid, int) from public;
grant execute on function public.dict_search(text, int) to authenticated;
grant execute on function public.dict_entry(uuid) to authenticated;
grant execute on function public.dict_examples_for(text, int) to authenticated;
grant execute on function public.dict_words_containing(text, uuid, int) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply to a Supabase branch**

Apply the migration to a dev/branch database (never straight to prod). With the Supabase CLI: `supabase db push` against the branch, or apply via the Supabase MCP `apply_migration` tool onto a development branch.

- [ ] **Step 3: Verify with seed-free smoke SQL**

Run in the SQL editor:

```sql
insert into public.dict_entries (simplified, traditional, pinyin, pinyin_plain, definitions)
values ('中文','中文','zhōng wén','zhong wen','["Chinese language"]'::jsonb);
select simplified, pinyin from public.dict_search('zhong', 10);   -- expect 中文
select simplified from public.dict_words_containing('中', '00000000-0000-0000-0000-000000000000', 5); -- expect 中文
delete from public.dict_entries where simplified = '中文';
```

Expected: `dict_search('zhong')` returns the 中文 row; `dict_words_containing('中', …)` returns it too.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260719120000_add_reference_dictionary.sql
git commit -m "feat: reference dictionary tables + search RPCs migration"
```

---

## Task 4: Seed pipeline (`seed-dict.mjs` + fixture)

**Files:**
- Create: `seed-dict.mjs`
- Create: `data/cedict.sample.u8`

**Interfaces:**
- Consumes: `parseCedictLine` from `src/cedict.js` (Task 1).
- CLI: `node --env-file=.env.script seed-dict.mjs --cedict <file> [--tatoeba-sentences <file> --tatoeba-links <file>] [--apply]`. Dry-run by default; idempotent (skips existing `simplified+pinyin`).

- [ ] **Step 1: Create the sample fixture**

```
# CC-CEDICT sample (fixture for tests + dry-run)
中文 中文 [zhong1 wen2] /Chinese language/
中國 中国 [zhong1 guo2] /China/
你好 你好 [ni3 hao3] /hello/hi/
朋友 朋友 [peng2 you5] /friend/
謝謝 谢谢 [xie4 xie5] /to thank/thanks/
```

Save as `data/cedict.sample.u8`.

- [ ] **Step 2: Write the seed script**

```javascript
// seed-dict.mjs
// One-time ingest of the reference dictionary. Parses CC-CEDICT into
// public.dict_entries and (optionally) Tatoeba pairs into public.dict_examples.
// Dry-run by default; --apply writes. Idempotent: skips entries whose
// (simplified, pinyin) already exist. Never deletes/overwrites. Mirrors the
// conventions of seed-vocab.mjs.
//
//   node --env-file=.env.script seed-dict.mjs --cedict data/cedict.u8
//   node --env-file=.env.script seed-dict.mjs --cedict data/cedict.u8 --apply
//
// CC-CEDICT: https://www.mdbg.net/chinese/dictionary?page=cc-cedict (CC BY-SA)
// Tatoeba:   https://tatoeba.org/downloads (CC BY) — cmn sentences + eng links.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { parseCedictLine } from './src/cedict.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script seed-dict.mjs ...')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf('--' + name)
  return i !== -1 && args[i + 1] ? args[i + 1] : def
}
const apply = args.includes('--apply')
const cedictFile = arg('cedict', null)
if (!cedictFile) {
  console.error('Required: --cedict <path>')
  process.exit(1)
}

const BATCH = 500

async function seedEntries() {
  const lines = readFileSync(cedictFile, 'utf8').split('\n')
  const rows = []
  for (const line of lines) {
    const e = parseCedictLine(line)
    if (!e) continue
    rows.push({
      simplified: e.simplified,
      traditional: e.traditional,
      pinyin: e.pinyin,
      pinyin_plain: e.pinyinPlain,
      definitions: e.definitions,
    })
  }
  console.log(`Parsed ${rows.length} entries from ${cedictFile}.`)
  if (!apply) {
    console.log('DRY RUN — first 3:', JSON.stringify(rows.slice(0, 3), null, 2))
    console.log('Re-run with --apply to insert.')
    return
  }
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    // Idempotency: skip (simplified,pinyin) already present.
    const { data: existing } = await supabase
      .from('dict_entries')
      .select('simplified, pinyin')
      .in('simplified', batch.map(r => r.simplified))
    const seen = new Set((existing || []).map(r => r.simplified + '|' + r.pinyin))
    const fresh = batch.filter(r => !seen.has(r.simplified + '|' + r.pinyin))
    if (fresh.length) {
      const { error } = await supabase.from('dict_entries').insert(fresh)
      if (error) { console.error('Insert error:', error.message); process.exit(1) }
      inserted += fresh.length
    }
    process.stdout.write(`\r  inserted ${inserted}…`)
  }
  console.log(`\nDone. Inserted ${inserted} new entries.`)
}

seedEntries()
```

- [ ] **Step 3: Verify the dry-run parses the fixture**

Run: `node seed-dict.mjs --cedict data/cedict.sample.u8`
Expected: prints `Parsed 5 entries from data/cedict.sample.u8.` and a JSON preview whose first entry is `中文 / zhōng wén / ["Chinese language"]`. (No DB write — no env needed for the parse count; it will error on the missing env vars BEFORE parsing, so for a pure dry-run without credentials, run with dummy env: `SUPABASE_URL=x SUPABASE_SERVICE_KEY=x node seed-dict.mjs --cedict data/cedict.sample.u8`.)

- [ ] **Step 4: Commit**

```bash
git add seed-dict.mjs data/cedict.sample.u8
git commit -m "feat: seed-dict.mjs CC-CEDICT ingest pipeline + fixture"
```

- [ ] **Step 5 (manual, out-of-band): load real data**

Download the full CC-CEDICT (`cedict_ts.u8`) and run `node --env-file=.env.script seed-dict.mjs --cedict cedict_ts.u8 --apply` against the target database. This is a one-time operator step, not part of CI. Tatoeba example ingest is a follow-up extension of this script (parse `cmn_sentences.tsv` + `links.csv`, insert `dict_examples`); tracked but not required for the read-only entry view to function (examples degrade gracefully — Task 6 Step 3).

---

## Task 5: Search wrapper (`src/dictSearch.js`)

**Files:**
- Create: `src/dictSearch.js`
- Test: `src/dictSearch.test.js`

**Interfaces:**
- Consumes: `foldForSearch` from `src/searchFold.js`; a Supabase client (`supabase`).
- Produces:
  - `normalizeQuery(raw: string): string` — trims + folds pinyin/english to toneless-lowercase for the RPC; leaves hanzi intact (folding is a no-op on hanzi).
  - `searchDict(supabase, query, limit?): Promise<Entry[]>` — calls `dict_search`; returns `[]` for empty query.
  - `getExamples(supabase, word, limit?): Promise<Example[]>`
  - `getWordsContaining(supabase, word, id, limit?): Promise<Entry[]>`

- [ ] **Step 1: Write the failing test**

```javascript
// src/dictSearch.test.js
import { describe, it, expect, vi } from 'vitest'
import { normalizeQuery, searchDict } from './dictSearch'

describe('normalizeQuery', () => {
  it('folds pinyin tones and lowercases', () => {
    expect(normalizeQuery('  Zhōng ')).toBe('zhong')
    expect(normalizeQuery('HELLO')).toBe('hello')
  })
  it('leaves hanzi untouched', () => {
    expect(normalizeQuery('中文')).toBe('中文')
  })
})

describe('searchDict', () => {
  it('returns [] for an empty query without calling the RPC', async () => {
    const rpc = vi.fn()
    const supabase = { rpc }
    expect(await searchDict(supabase, '   ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
  it('calls dict_search with the normalized query', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: '1', simplified: '中文' }], error: null })
    const supabase = { rpc }
    const rows = await searchDict(supabase, 'Zhōng', 20)
    expect(rpc).toHaveBeenCalledWith('dict_search', { p_query: 'zhong', p_limit: 20 })
    expect(rows).toEqual([{ id: '1', simplified: '中文' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/dictSearch.test.js`
Expected: FAIL — `normalizeQuery is not a function`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/dictSearch.js
// Thin wrapper over the reference-dictionary RPCs. Query normalization matches
// what the SQL expects: pinyin/english folded to toneless-lowercase (so 'Zhōng'
// meets 'pinyin_plain'), hanzi passed through unchanged.
import { foldForSearch } from './searchFold'

export function normalizeQuery(raw) {
  const t = (raw || '').trim()
  if (!t) return ''
  return foldForSearch(t)
}

export async function searchDict(supabase, query, limit = 60) {
  const p_query = normalizeQuery(query)
  if (!p_query) return []
  const { data, error } = await supabase.rpc('dict_search', { p_query, p_limit: limit })
  if (error) throw error
  return data || []
}

export async function getExamples(supabase, word, limit = 4) {
  if (!word) return []
  const { data, error } = await supabase.rpc('dict_examples_for', { p_word: word, p_limit: limit })
  if (error) throw error
  return data || []
}

export async function getWordsContaining(supabase, word, id, limit = 12) {
  if (!word) return []
  const { data, error } = await supabase.rpc('dict_words_containing', { p_word: word, p_id: id, p_limit: limit })
  if (error) throw error
  return data || []
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/dictSearch.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dictSearch.js src/dictSearch.test.js
git commit -m "feat: dictSearch RPC wrappers + query normalization"
```

---

## Task 6: Refined entry view (`src/DictEntryView.jsx`)

**Files:**
- Create: `src/DictEntryView.jsx`

**Interfaces:**
- Consumes: `splitHanziWithTones`, `TONE_CLASS` (Task 2); `getExamples`, `getWordsContaining` (Task 5); `cleanMeaning` from `src/cleanMeaning.js`; `supabase` from `src/supabase.js`; icons from `lucide-react`.
- Produces: default export `DictEntryView({ entry, accentHex, langFont, ttsLang, onOpenEntry, onAddToDeck, canAddToDeck })` where `entry` is a `dict_entries` row (`{ id, simplified, traditional, pinyin, definitions, hsk_level }`). `onOpenEntry(idOrWord)` drives the character-breakdown drill-down (parent owns the entry stack). `onAddToDeck` + `canAddToDeck` are passed through but `canAddToDeck` is `false` in this plan (Plan 2 enables it).

- [ ] **Step 1: Write the component**

```jsx
// src/DictEntryView.jsx
import { useState, useEffect } from 'react'
import { splitHanziWithTones, TONE_CLASS } from './toneColor'
import { getExamples, getWordsContaining } from './dictSearch'
import { supabase } from './supabase'
import { Volume2, Bookmark, PenLine } from 'lucide-react'

// The "Refined" entry: tone-colored headword + character cards, everything else
// neutral. Three tabs (Meaning · Chars · Examples) keep the sheet short.
const TABS = [
  { key: 'meaning', label: 'Meaning' },
  { key: 'chars', label: 'Chars' },
  { key: 'examples', label: 'Examples' },
]

export default function DictEntryView({ entry, accentHex, langFont, ttsLang, onOpenEntry, onAddToDeck, canAddToDeck }) {
  const [tab, setTab] = useState('meaning')
  const [examples, setExamples] = useState([])
  const [contains, setContains] = useState([])

  useEffect(() => {
    setTab('meaning')
    if (!entry) return
    let cancelled = false
    ;(async () => {
      const [ex, ct] = await Promise.all([
        getExamples(supabase, entry.simplified).catch(() => []),
        getWordsContaining(supabase, entry.simplified, entry.id).catch(() => []),
      ])
      if (cancelled) return
      setExamples(ex)
      setContains(ct)
    })()
    return () => { cancelled = true }
  }, [entry])

  if (!entry) return null
  const chars = splitHanziWithTones(entry.simplified, entry.pinyin)
  const defs = Array.isArray(entry.definitions) ? entry.definitions : []
  const speak = (text) => {
    if (!text) return
    try { const u = new SpeechSynthesisUtterance(text); u.lang = ttsLang; u.rate = 0.85; window.speechSynthesis.speak(u) } catch { /* noop */ }
  }

  return (
    <div className="dict-entry" style={{ '--accent': accentHex }}>
      {/* hero */}
      <div style={{ textAlign: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: langFont + ', sans-serif', fontSize: '52px', fontWeight: 750, lineHeight: 1, letterSpacing: '4px' }}>
          {chars.map((c, i) => <span key={i} className={TONE_CLASS[c.tone]}>{c.char}</span>)}
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '10px', color: 'var(--text)' }}>{entry.pinyin}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          {entry.hsk_level != null && <span className="dict-pill dict-pill-accent">HSK {entry.hsk_level}</span>}
          {entry.traditional && entry.traditional !== entry.simplified && (
            <span className="dict-pill" style={{ fontFamily: langFont + ', sans-serif' }}>trad. {entry.traditional}</span>
          )}
        </div>
      </div>

      {/* action bar */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '22px', margin: '14px 0 4px' }}>
        <button className="dict-act" onClick={() => speak(entry.simplified)} aria-label="Play audio"><Volume2 size={19} /><span>Audio</span></button>
        <button className="dict-act" aria-label="Stroke order"><PenLine size={19} /><span>Strokes</span></button>
        {canAddToDeck && (
          <button className="dict-act" onClick={() => onAddToDeck && onAddToDeck(entry)} aria-label="Add to deck"><Bookmark size={19} /><span>Add</span></button>
        )}
      </div>

      {/* tabs */}
      <div role="tablist" className="dict-tabs">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'meaning' && (
        <ol className="dict-senses">
          {defs.map((d, i) => <li key={i}><span className="i">{i + 1}</span>{d}</li>)}
        </ol>
      )}

      {tab === 'chars' && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
          {chars.map((c, i) => (
            <button key={i} className="dict-charcard" onClick={() => onOpenEntry && onOpenEntry(c.char)}>
              <span className={TONE_CLASS[c.tone]} style={{ fontFamily: langFont + ', sans-serif', fontSize: '30px', fontWeight: 750 }}>{c.char}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'examples' && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {examples.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No example sentences yet.</div>}
          {examples.map((ex, i) => (
            <div key={i} className="dict-ex">
              <div style={{ fontFamily: langFont + ', sans-serif', fontSize: '16px', lineHeight: 1.55 }}>{ex.hanzi}</div>
              {ex.pinyin && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{ex.pinyin}</div>}
              <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '2px' }}>{ex.english}</div>
            </div>
          ))}
        </div>
      )}

      {contains.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          <div className="dict-label">Words containing {entry.simplified}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {contains.map(w => (
              <button key={w.id} className="dict-chip" onClick={() => onOpenEntry && onOpenEntry(w.id)}>
                <span style={{ fontFamily: langFont + ', sans-serif', fontWeight: 700 }}>{w.simplified}</span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{Array.isArray(w.definitions) ? w.definitions[0] : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add the entry styles + tone palette (once, in `src/index.css`)**

Append to `src/index.css` (theme-aware via existing variable pattern):

```css
/* Reference dictionary entry — tone palette + Refined layout */
.dict-entry .tone-1 { color: #C0392B; }
.dict-entry .tone-2 { color: #1E9E57; }
.dict-entry .tone-3 { color: #2C6BD6; }
.dict-entry .tone-4 { color: #8E44AD; }
.dict-entry .tone-5 { color: var(--text-muted); }
:root[data-theme="dark"] .dict-entry .tone-1 { color: #E56A5A; }
:root[data-theme="dark"] .dict-entry .tone-2 { color: #43C27E; }
:root[data-theme="dark"] .dict-entry .tone-3 { color: #5E9BFF; }
:root[data-theme="dark"] .dict-entry .tone-4 { color: #C084E8; }
.dict-pill { font-size: 10.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; background: var(--surface-2, var(--surface)); border: 1px solid var(--border); color: var(--text-muted); }
.dict-pill-accent { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.dict-act { display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 11px; font-weight: 700; font-family: Inter, sans-serif; }
.dict-tabs { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); padding: 4px; border-radius: 11px; margin: 16px 0 6px; }
.dict-tabs button { flex: 1; padding: 7px 0; border: none; border-radius: 8px; background: none; color: var(--text-muted); font-size: 12.5px; font-weight: 700; font-family: Inter, sans-serif; cursor: pointer; }
.dict-tabs button.on { background: var(--bg, var(--surface)); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.dict-senses { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.dict-senses li { display: flex; gap: 11px; font-size: 15px; color: var(--text); }
.dict-senses .i { color: var(--accent); font-weight: 800; }
.dict-charcard { flex: 1; padding: 13px 8px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; }
.dict-chip { display: flex; align-items: baseline; gap: 7px; padding: 8px 12px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; }
.dict-ex { padding: 12px 13px; border-radius: 13px; background: var(--surface); border: 1px solid var(--border); }
.dict-label { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 10px; }
```

(If `src/index.css` doesn't define `--surface-2`/`--bg`, the fallbacks above resolve to existing tokens — verify the variable names against `src/index.css` before committing and adjust the fallbacks to whatever the file actually defines.)

- [ ] **Step 3: Manual smoke (Storybook-free)**

There is no unit test for JSX rendering in this repo's convention; verify by wiring into Dictionary (Task 7) and exercising via e2e (Task 8). The pure logic it depends on (`splitHanziWithTones`, `normalizeQuery`) is already tested.

- [ ] **Step 4: Commit**

```bash
git add src/DictEntryView.jsx src/index.css
git commit -m "feat: Refined dictionary entry view + tone palette"
```

---

## Task 7: Wire the Dictionary screen to the reference dictionary

**Files:**
- Modify: `src/Dictionary.jsx`

**Interfaces:**
- Consumes: `searchDict`, `getExamples` (Task 5); `DictEntryView` (Task 6); existing `recentLookups`, `languageTheme`, `useIsMobile`.
- Behavior: default scope = **full dictionary** (search `dict_entries` via `searchDict`, debounced). A `Full dictionary | My syllabus` toggle; "My syllabus" restores the current curriculum-vocab list + status/level filters (existing code path, unchanged). Opening a row shows `DictEntryView` in the bottom sheet with a drill-down stack for character breakdown.

- [ ] **Step 1: Add scope state + debounced dictionary search**

Replace the data-loading and matching logic in `src/Dictionary.jsx`. Keep the existing curriculum path for the `syllabus` scope; add the `full` path. Concretely, add near the top of the component (after existing `useState`s):

```jsx
const [scope, setScope] = useState('full')          // 'full' | 'syllabus'
const [dictRows, setDictRows] = useState([])
const [dictLoading, setDictLoading] = useState(false)
const [entryStack, setEntryStack] = useState([])    // drill-down stack of dict entries

// Debounced full-dictionary search.
useEffect(() => {
  if (scope !== 'full') return
  const term = query.trim()
  if (!term) { setDictRows([]); return }
  let cancelled = false
  setDictLoading(true)
  const t = setTimeout(async () => {
    try {
      const rows = await searchDict(supabase, term, 60)
      if (!cancelled) setDictRows(rows)
    } finally {
      if (!cancelled) setDictLoading(false)
    }
  }, 180)
  return () => { cancelled = true; clearTimeout(t) }
}, [query, scope])
```

Add imports at the top:

```jsx
import { searchDict, getExamples } from './dictSearch'
import { getDictEntryById } from './dictSearch'   // add this helper in Task 5 module if drill-down by id is needed
import DictEntryView from './DictEntryView'
```

- [ ] **Step 2: Add `getDictEntryById` to `src/dictSearch.js`**

The character/word drill-down opens an entry by id or by hanzi. Add to `src/dictSearch.js` and re-run its tests:

```javascript
export async function getDictEntryById(supabase, id) {
  const { data, error } = await supabase.rpc('dict_entry', { p_id: id })
  if (error) throw error
  return data || null
}

// Open the best entry for a bare character/word (breakdown taps pass a hanzi).
export async function getDictEntryByWord(supabase, word) {
  const rows = await searchDict(supabase, word, 1)
  return rows[0] || null
}
```

- [ ] **Step 3: Render the scope toggle + full-dictionary rows**

Add the toggle above the existing status filters, and branch the list. Scope toggle markup:

```jsx
<div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
  {['full', 'syllabus'].map(s => (
    <button
      key={s}
      onClick={() => setScope(s)}
      aria-pressed={scope === s}
      style={{
        flex: 1, minHeight: '36px', borderRadius: '10px', cursor: 'pointer',
        border: '1px solid ' + (scope === s ? accentHex : 'var(--border)'),
        background: scope === s ? accentHex + '12' : 'var(--surface)',
        color: scope === s ? accentHex : 'var(--text-muted)',
        fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
      }}
    >
      {s === 'full' ? 'Full dictionary' : 'My syllabus'}
    </button>
  ))}
</div>
```

Render a `dict_entries` row (full scope) — reuse the existing `renderRow` visual language but from a dict entry:

```jsx
const renderDictRow = (e) => (
  <button key={e.id} onClick={() => setEntryStack([e])} style={{
    display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', width: '100%',
    padding: '13px 16px', borderRadius: '14px', cursor: 'pointer',
    background: 'var(--surface)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif',
  }}>
    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: langFont + ', Inter, sans-serif', flexShrink: 0 }}>{e.simplified}</span>
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
      <span style={{ fontSize: '12.5px', color: accentHex, fontWeight: 600 }}>{e.pinyin}</span>
      <span style={{ fontSize: '13px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {Array.isArray(e.definitions) ? e.definitions.join('; ') : ''}
      </span>
    </span>
  </button>
)
```

In the render body, when `scope === 'full'`, show `dictLoading ? 'Loading…'` else `dictRows.map(renderDictRow)` (with the existing "no match" empty state). When `scope === 'syllabus'`, keep the entire existing curriculum block (rows, filters, recent) unchanged.

- [ ] **Step 4: Swap the bottom sheet to the drill-down entry**

Replace the single `WordLookupSheet` usage with a sheet driven by `entryStack` for the full scope. Keep `WordLookupSheet` for the syllabus scope (curriculum rows still open the simple sheet, unchanged). For the full scope, render a portal sheet containing `DictEntryView`:

```jsx
{entryStack.length > 0 && (
  <div onClick={() => setEntryStack([])} className="app-overlay-viewport"
       style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.14)' }}>
    <div onClick={e => e.stopPropagation()}
         style={{ width: '100%', maxWidth: '560px', maxHeight: '92%', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '16px 18px 26px' }}>
      {entryStack.length > 1 && (
        <button onClick={() => setEntryStack(s => s.slice(0, -1))} style={ghostBtn}>← Back</button>
      )}
      <DictEntryView
        entry={entryStack[entryStack.length - 1]}
        accentHex={accentHex}
        langFont={langFont}
        ttsLang={ttsLang}
        canAddToDeck={false}
        onOpenEntry={async (idOrWord) => {
          const next = idOrWord && idOrWord.length <= 2 && /\p{Script=Han}/u.test(idOrWord)
            ? await getDictEntryByWord(supabase, idOrWord)
            : await getDictEntryById(supabase, idOrWord)
          if (next) { recordRecent(track.language, { id: next.id, word: next.simplified, reading: next.pinyin, meaning: (next.definitions || [])[0] }); setEntryStack(s => [...s, next]) }
        }}
      />
    </div>
  </div>
)}
```

Add `getDictEntryByWord` to the import line from `./dictSearch`.

- [ ] **Step 5: Run the unit suite + lint**

Run: `npx vitest run && npx eslint src/Dictionary.jsx src/DictEntryView.jsx src/dictSearch.js`
Expected: unit tests PASS; eslint clean.

- [ ] **Step 6: Commit**

```bash
git add src/Dictionary.jsx src/dictSearch.js src/dictSearch.test.js
git commit -m "feat: Dictionary searches full reference dictionary with syllabus toggle"
```

---

## Task 8: End-to-end coverage + build verification

**Files:**
- Modify: `tests/e2e/dictionary.spec.js`

**Interfaces:**
- Consumes: the seeded dev database (Task 3/4) — e2e runs against a database with at least the smoke rows.

- [ ] **Step 1: Read the existing e2e to match auth/setup helpers**

Run: open `tests/e2e/dictionary.spec.js` and note how it signs in and navigates to Practice → Dictionary. Reuse those exact helpers.

- [ ] **Step 2: Add a full-dictionary search test**

Add a test that: navigates to the Dictionary, ensures the `Full dictionary` toggle is active by default, types `zhong`, and asserts a row with `中` appears; then opens it and asserts the entry hero + a `Meaning` tab are visible.

```javascript
test('full dictionary search shows a reference entry', async ({ page }) => {
  await gotoDictionary(page)                       // reuse existing helper
  await expect(page.getByRole('button', { name: 'Full dictionary' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('textbox', { name: /search/i }).fill('zhong')
  const row = page.getByRole('button').filter({ hasText: '中' }).first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByRole('tab', { name: 'Meaning' })).toBeVisible()
})
```

- [ ] **Step 3: Run e2e**

Run: `npm run e2e -- dictionary`
Expected: the new test PASSES (requires the dev DB to contain reference rows; if empty, seed the smoke rows from Task 3 Step 3 first).

- [ ] **Step 4: Full build + unit gate**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/dictionary.spec.js
git commit -m "test: e2e for full reference-dictionary search + entry"
```

---

## Self-Review

**Spec coverage:**
- Chinese-only reference dictionary from CC-CEDICT → Tasks 1, 3, 4. ✓
- Supabase + Postgres search (trigram, toneless pinyin, English) → Task 3 (`dict_search`, `pg_trgm`), Task 5 (normalize). ✓
- Entry: traditional + colored pinyin, senses, character breakdown, words-containing, examples, audio/strokes → Task 6. (Stroke-order button is present but wiring `hanzi-writer` into the sheet is a small follow-up; audio works.) ✓ with noted follow-up.
- Tatoeba examples → Task 3 (`dict_examples`, `dict_examples_for`), Task 4 Step 5 (ingest is the operator follow-up; UI degrades gracefully). ✓ with noted follow-up.
- Default to full dictionary, syllabus as optional filter → Task 7. ✓
- Seed pipeline mirroring seed-vocab.mjs → Task 4. ✓
- Refined visual direction (scoped tone color, tabs, hero) → Task 6. ✓
- **Deferred to Plan 2 (explicitly out of scope here):** "flashcard anything" write path, `vocabulary.level` nullability migration, and the level-test safety audit. `canAddToDeck={false}` in Task 7 keeps this plan read-only. ✓

**Placeholder scan:** No TBD/TODO in code steps; the two "operator follow-up" items (real-data load, Tatoeba ingest) are genuinely out-of-band data operations, not code placeholders, and are called out with exact commands.

**Type consistency:** `entry` shape (`{ id, simplified, traditional, pinyin, definitions, hsk_level }`) is consistent across `dict_search` (Task 3), `searchDict` (Task 5), `renderDictRow` and `DictEntryView` (Tasks 6–7). RPC arg names (`p_query`, `p_limit`, `p_word`, `p_id`) match between the SQL (Task 3) and the wrappers (Task 5). `splitHanziWithTones`/`TONE_CLASS` names match between Task 2 and Task 6.

**Follow-ups captured for Plan 2:** deck write path + `vocabulary.level` nullable migration + security-definer `dict_add_to_deck` RPC + level-test exclusion audit with tests + Tatoeba ingest + stroke-order wiring.
