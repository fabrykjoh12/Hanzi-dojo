# Public Story Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-out visitor open a shared story URL (`/read/:storyId`), pick their rough level, see "you'd understand ~X%" of that story, read a short taste, and hit a "sign up free to read the rest" gate.

**Architecture:** A new anon-callable `security-definer` RPC (`public_story`) returns one published story plus its language's vocab pool. A new no-shell page (`PublicStory.jsx`) computes the percentage client-side with the existing `calculateStoryReadability` (the app's single source of truth) against a synthetic "assumed-known" deck derived from the level chip. `App.jsx` renders this page for `/read/:id` before the `!session → Landing` gate; signed-in visitors are redirected into the normal in-app reader. All testable logic lives in pure modules (`routes.js`, `publicStory.js`) with node-env unit tests; the component is verified via build + Playwright, matching how `Dashboard.jsx` is handled.

**Tech Stack:** React 19, react-router-dom 7, Supabase JS, Vitest (node environment — no jsdom/RTL), Postgres (security-definer function).

## Global Constraints

- **No TypeScript.** Plain JSX, no type annotations. (CLAUDE.md §12.1)
- **No complex regex literals** — use `indexOf`/`split`/`includes`. (CLAUDE.md §12.2)
- **All styling is inline style objects.** No Tailwind classes in JSX. (CLAUDE.md §12.3)
- **No template literals inside JSX style props** where concatenation works (`'url(' + src + ')'`). (CLAUDE.md §12.4)
- **No `localStorage`/`sessionStorage`.** (CLAUDE.md §12.5)
- **No `<form>` tags** — use `onClick`/`onChange`. (CLAUDE.md §12.6)
- **`npm run build` must pass before any commit.** (CLAUDE.md §12.8)
- **Neutral colors via CSS tokens** (`var(--surface)`, `var(--text)`, `var(--border)`, `var(--text-muted)`); accent/white-on-accent stay hardcoded. (CLAUDE.md §10)
- **Never delete vocabulary/cards; RLS stays enabled; never put the service key in frontend code.** (CLAUDE.md §13)
- **Vitest is node-environment only** — put logic in pure modules and test those; do NOT add jsdom/RTL. (`vitest.config.js`)

---

### Task 1: Public-route helper in `routes.js`

Add a pure helper that recognizes `/read/:storyId` and extracts the id, so `App.jsx` can branch on it and it stays unit-tested alongside the other route mapping.

**Files:**
- Modify: `src/routes.js`
- Test: `src/routes.test.js`

**Interfaces:**
- Produces: `readStoryId(pathname: string) => string | null` — returns the story id for a `/read/<id>` path, else `null`.

- [ ] **Step 1: Write the failing test**

Add to `src/routes.test.js` (import `readStoryId` in the existing import line from `./routes`):

```js
import { describe, it, expect } from 'vitest'
import { readStoryId } from './routes'

describe('readStoryId', () => {
  it('extracts the id from a /read/<id> path', () => {
    expect(readStoryId('/read/abc-123')).toBe('abc-123')
  })
  it('ignores trailing segments', () => {
    expect(readStoryId('/read/abc-123/extra')).toBe('abc-123')
  })
  it('returns null for /read with no id', () => {
    expect(readStoryId('/read')).toBe(null)
    expect(readStoryId('/read/')).toBe(null)
  })
  it('returns null for unrelated paths', () => {
    expect(readStoryId('/stories')).toBe(null)
    expect(readStoryId('/')).toBe(null)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/routes.test.js`
Expected: FAIL — `readStoryId is not a function` / not exported.

- [ ] **Step 3: Add the implementation**

Append to `src/routes.js`:

```js
// Recognize the public story route (/read/<id>), which works signed-out.
// Returns the story id, or null for any other path. Kept here (not in App)
// so it's covered by the same route-mapping tests.
export function readStoryId(pathname) {
  let p = pathname || '/'
  if (p.startsWith('/')) p = p.slice(1)
  const segs = p.split('/')
  if (segs[0] === 'read' && segs[1]) return segs[1]
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/routes.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/routes.js src/routes.test.js
git commit -m "Public story links: /read/:id route helper"
```

---

### Task 2: Pure public-story logic in `publicStory.js`

The level-chip → assumed-known-deck mapping, the vocab-map builder, and teaser-line selection. This is the core correctness surface (the % depends on it), so it's isolated and fully tested.

**Files:**
- Create: `src/publicStory.js`
- Test: `src/publicStory.test.js`

**Interfaces:**
- Consumes: vocab-pool rows shaped `{ id, word, reading, meaning, level, sort_order }` (from the `public_story` RPC in Task 3).
- Produces:
  - `LEVEL_CHOICES` — array of `{ key, label }` in display order: `beginner` "Just starting", `some` "Some", `lots` "Quite a bit".
  - `BEGINNER_WORD_CAP = 50`.
  - `buildVocabMap(vocabPool: array) => { [word]: vocabRow }` — mirrors the reader's `map[v.word] = v`.
  - `assumedKnownCards(vocabPool: array, choice: 'beginner'|'some'|'lots', storyLevel: number) => { [vocabId]: { state: 'review' } }` — a synthetic cards map where every "known" word reads back as `review` via `wordStatus`.
  - `teaserLines(content: string, n = 4) => string[]` — the first `n` non-empty lines.

- [ ] **Step 1: Write the failing test**

Create `src/publicStory.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildVocabMap, assumedKnownCards, teaserLines, LEVEL_CHOICES, BEGINNER_WORD_CAP } from './publicStory'

const pool = [
  { id: 'a', word: '你', reading: 'nǐ', meaning: 'you', level: 1, sort_order: 1 },
  { id: 'b', word: '好', reading: 'hǎo', meaning: 'good', level: 1, sort_order: 60 },
  { id: 'c', word: '朋友', reading: 'péngyou', meaning: 'friend', level: 2, sort_order: 5 },
  { id: 'd', word: '经济', reading: 'jīngjì', meaning: 'economy', level: 3, sort_order: 5 },
]

describe('LEVEL_CHOICES', () => {
  it('offers three choices in order beginner→some→lots', () => {
    expect(LEVEL_CHOICES.map(c => c.key)).toEqual(['beginner', 'some', 'lots'])
    expect(LEVEL_CHOICES.every(c => typeof c.label === 'string' && c.label.length)).toBe(true)
  })
})

describe('buildVocabMap', () => {
  it('keys rows by word', () => {
    const m = buildVocabMap(pool)
    expect(m['你'].id).toBe('a')
    expect(Object.keys(m)).toHaveLength(4)
  })
  it('tolerates null', () => {
    expect(buildVocabMap(null)).toEqual({})
  })
})

describe('assumedKnownCards', () => {
  it('beginner: only level-1 words within the frequency cap', () => {
    const cards = assumedKnownCards(pool, 'beginner', 3)
    expect(Object.keys(cards)).toEqual(['a']) // 好 sort_order 60 > 50 excluded
    expect(cards['a']).toEqual({ state: 'review' })
    expect(BEGINNER_WORD_CAP).toBe(50)
  })
  it('some: all of level 1 regardless of frequency', () => {
    const cards = assumedKnownCards(pool, 'some', 3)
    expect(Object.keys(cards).sort()).toEqual(['a', 'b'])
  })
  it('lots: everything at or below the story level', () => {
    const cards = assumedKnownCards(pool, 'lots', 2)
    expect(Object.keys(cards).sort()).toEqual(['a', 'b', 'c']) // level 3 excluded
  })
  it('tolerates null pool', () => {
    expect(assumedKnownCards(null, 'lots', 3)).toEqual({})
  })
})

describe('teaserLines', () => {
  it('returns the first n non-empty lines', () => {
    expect(teaserLines('one\n\ntwo\nthree\nfour\nfive', 4)).toEqual(['one', 'two', 'three', 'four'])
  })
  it('defaults to 4 and tolerates empty', () => {
    expect(teaserLines('')).toEqual([])
    expect(teaserLines(null)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/publicStory.test.js`
Expected: FAIL — cannot import from `./publicStory` (file does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/publicStory.js`:

```js
// Pure logic for the public (signed-out) story page. Kept separate from the
// PublicStory component so the percentage math — the one correctness-critical
// part — is unit-tested in the node test environment.
//
// The percentage is computed by the app's canonical calculateStoryReadability
// (storyReading.js). That function reads a "cards" map (vocabId → card) and
// treats state:'review' as a known word. For a signed-out visitor we don't
// have real cards, so we synthesize one from the level chip they pick.

export const BEGINNER_WORD_CAP = 50

// Displayed in order. `key` drives assumedKnownCards; `label` is the chip text.
export const LEVEL_CHOICES = [
  { key: 'beginner', label: 'Just starting' },
  { key: 'some', label: 'Some' },
  { key: 'lots', label: 'Quite a bit' },
]

// Mirror the reader's vocab map: word → full vocab row (storyReading matches
// against words, and each match carries the row's id for status lookup).
export function buildVocabMap(vocabPool) {
  const map = {}
  ;(vocabPool || []).forEach(v => { map[v.word] = v })
  return map
}

// Synthesize the "known" deck for an assumed level. Every returned entry reads
// back as a known ('review') word via storyReading's wordStatus:
//   beginner — the most frequent ~50 words of level 1 (a true first-timer)
//   some     — all of level 1
//   lots     — everything at or below the story's own level (cumulative model)
export function assumedKnownCards(vocabPool, choice, storyLevel) {
  const cards = {}
  ;(vocabPool || []).forEach(v => {
    let known = false
    if (choice === 'lots') known = v.level <= storyLevel
    else if (choice === 'some') known = v.level === 1
    else known = v.level === 1 && v.sort_order <= BEGINNER_WORD_CAP
    if (known) cards[v.id] = { state: 'review' }
  })
  return cards
}

// The first n non-empty lines — the taste rendered before the signup gate.
export function teaserLines(content, n = 4) {
  return (content || '').split('\n').filter(Boolean).slice(0, n)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/publicStory.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/publicStory.js src/publicStory.test.js
git commit -m "Public story links: assumed-level deck + teaser logic"
```

---

### Task 3: `public_story` RPC migration

Anon-callable `security-definer` function returning one **published** story plus its language's active vocab pool. RLS on the tables stays untouched.

**Files:**
- Create: `supabase/migrations/20260716000000_add_public_story.sql`

**Interfaces:**
- Produces: `public.public_story(p_story_id uuid) => jsonb` (or SQL `null` when the story is missing/unpublished), shaped:
  `{ id, title, language, system, level, image_path, content, english_content, vocab_pool: [{ id, word, reading, meaning, level, sort_order }] }`.
- Consumed by: the `PublicStory` component (Task 4) via `supabase.rpc('public_story', { p_story_id })`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260716000000_add_public_story.sql`:

```sql
-- Public story links: an anon-callable, security-definer read of ONE published
-- story plus its language's active vocabulary pool. RLS on stories/vocabulary
-- stays locked to authenticated users; this function is the only anon door, and
-- it can only ever return published-story content (never user data, never an
-- unpublished row). Mirrors the admin-dashboard RPC pattern.

create or replace function public.public_story(p_story_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'language', s.language,
    'system', s.system,
    'level', s.level,
    'image_path', s.image_path,
    'content', s.content,
    'english_content', s.english_content,
    'vocab_pool', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'word', v.word,
        'reading', v.reading,
        'meaning', v.meaning,
        'level', v.level,
        'sort_order', v.sort_order
      ))
      from public.vocabulary v
      where v.language = s.language
        and v.system = s.system
        and v.is_active = true
    ), '[]'::jsonb)
  )
  from public.stories s
  where s.id = p_story_id
    and s.is_published = true;
$$;

-- Only the function runs as its owner; lock down who may call it.
revoke all on function public.public_story(uuid) from public;
grant execute on function public.public_story(uuid) to anon, authenticated;
```

- [ ] **Step 2: Static review of the SQL**

Confirm by reading the file:
- The `where` clause requires `s.is_published = true` — unpublished stories return no row (function returns SQL `null`).
- Only published-story columns and active vocab fields are selected — no `cards`, `profiles`, or other user data is reachable.
- `security definer` + `set search_path = public` + `revoke all from public` + explicit `grant execute to anon, authenticated`.

There is no node-env unit test for SQL; Task 3's deeper verification is the security-review pass at the end of the plan and the anon smoke test below.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260716000000_add_public_story.sql
git commit -m "Public story links: public_story security-definer RPC"
```

- [ ] **Step 4: Apply + smoke test (manual, requires Supabase access — record the result)**

Apply the migration in the Supabase SQL editor, then verify anon access with the anon key (a published story id):

```bash
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/public_story" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_story_id":"<PUBLISHED_STORY_UUID>"}' | head -c 400
```

Expected: a JSON object with `title` and a non-empty `vocab_pool`. Then repeat with an **unpublished** story id and confirm the response is `null`. (If you can't reach Supabase from here, leave this step unchecked and note it for the deploy step — the page degrades to "story not found" until the migration is applied.)

---

### Task 4: `PublicStory.jsx` page + analytics events

The no-shell public page: cover + title → level chips → % reveal + teaser → signup gate. Adds the three anon funnel events.

**Files:**
- Create: `src/PublicStory.jsx`
- Modify: `src/analytics.js` (add three `EVENTS` constants)
- Test: `src/analytics.test.js` (assert the new constants)

**Interfaces:**
- Consumes: `buildVocabMap`, `assumedKnownCards`, `teaserLines`, `LEVEL_CHOICES` from `./publicStory`; `calculateStoryReadability`, `buildVocabMatcher`, `matchVocabAt`, `wordStatus`, `splitSpeaker` from `./storyReading`; `getAudioUrl`, `getLevelLabel` from `./utils`; `languageTheme` from `./languageTheme`; `BRAND_NAME` from `./brand`; `track`, `EVENTS` from `./analytics`; `supabase` from `./supabase`.
- Produces: `export default function PublicStory({ storyId })` — a full-screen page. Its signup CTA navigates to `/` (the Landing/Auth screen) via `useNavigate`.

- [ ] **Step 1: Add the analytics event constants**

In `src/analytics.js`, inside the `EVENTS` object, add under the `// Top-of-funnel (pre-auth)` group:

```js
  // Public story links (pre-auth, anonymous funnel)
  PUBLIC_STORY_VIEWED: 'public_story_viewed',
  PUBLIC_STORY_LEVEL_PICKED: 'public_story_level_picked',
  PUBLIC_STORY_SIGNUP_CLICKED: 'public_story_signup_clicked',
```

- [ ] **Step 2: Extend the analytics test**

In `src/analytics.test.js`, add a check that the new events exist (follow the file's existing import/style — `EVENTS` is already imported there):

```js
it('defines the public-story funnel events', () => {
  expect(EVENTS.PUBLIC_STORY_VIEWED).toBe('public_story_viewed')
  expect(EVENTS.PUBLIC_STORY_LEVEL_PICKED).toBe('public_story_level_picked')
  expect(EVENTS.PUBLIC_STORY_SIGNUP_CLICKED).toBe('public_story_signup_clicked')
})
```

Run: `npx vitest run src/analytics.test.js`
Expected: PASS.

- [ ] **Step 3: Write the component**

Create `src/PublicStory.jsx`. This renders a signed-out landing surface (no sidebar/nav). It loads the story via the RPC, lets the visitor pick a level chip, computes the percentage with the canonical readability function against the synthetic deck, renders the teaser lines with known/new highlighting, and shows the signup gate.

```jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { buildVocabMap, assumedKnownCards, teaserLines, LEVEL_CHOICES } from './publicStory'
import { calculateStoryReadability, buildVocabMatcher, matchVocabAt, wordStatus, splitSpeaker } from './storyReading'
import { getAudioUrl, getLevelLabel } from './utils'
import { languageTheme } from './languageTheme'
import { BRAND_NAME } from './brand'
import { track, EVENTS } from './analytics'

// A signed-out visitor's first taste of a real story: how much can you read?
export default function PublicStory({ storyId }) {
  const navigate = useNavigate()
  const [story, setStory] = useState(null)       // RPC payload, or null
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'missing'
  const [choice, setChoice] = useState(null)       // 'beginner' | 'some' | 'lots'

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase.rpc('public_story', { p_story_id: storyId })
        if (!alive) return
        if (data && data.id) {
          setStory(data)
          setStatus('ready')
          track(EVENTS.PUBLIC_STORY_VIEWED, { language: data.language, level: data.level })
        } else {
          setStatus('missing')
        }
      } catch {
        if (alive) setStatus('missing')
      }
    })()
    return () => { alive = false }
  }, [storyId])

  const theme = languageTheme(story ? story.language : 'chinese')
  const accent = theme.accentHex
  const vocabMap = useMemo(() => buildVocabMap(story ? story.vocab_pool : []), [story])

  // Percentage against the synthetic "assumed-known" deck for the chosen level.
  const readability = useMemo(() => {
    if (!story || !choice) return null
    const cards = assumedKnownCards(story.vocab_pool, choice, story.level)
    return calculateStoryReadability({ content: story.content, vocabMap, cards, language: story.language })
  }, [story, choice, vocabMap])

  function pick(key) {
    setChoice(key)
    const cards = assumedKnownCards(story.vocab_pool, key, story.level)
    const r = calculateStoryReadability({ content: story.content, vocabMap, cards, language: story.language })
    track(EVENTS.PUBLIC_STORY_LEVEL_PICKED, { assumedLevel: key, knownPct: r.knownPct })
  }

  function goSignup() {
    track(EVENTS.PUBLIC_STORY_SIGNUP_CLICKED, { language: story ? story.language : null })
    navigate('/')
  }

  // Document title for link unfurls (best-effort; client-side only).
  useEffect(() => {
    if (story && story.title) document.title = story.title + ' · ' + BRAND_NAME
    return () => { document.title = BRAND_NAME }
  }, [story])

  const pageStyle = { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', justifyContent: 'center', padding: '32px 16px' }
  const cardStyle = { width: '100%', maxWidth: '640px' }

  if (status === 'loading') {
    return <div style={pageStyle}><div style={{ alignSelf: 'center', color: accent, fontSize: '32px' }}>読</div></div>
  }
  if (status === 'missing' || !story) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', alignSelf: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Story not found</div>
          <div style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>This story link isn’t available.</div>
          <button onClick={() => navigate('/')} style={ctaStyle(accent)}>Go to {BRAND_NAME}</button>
        </div>
      </div>
    )
  }

  const cover = story.image_path ? getAudioUrl(story.image_path) : null
  const levelLabel = getLevelLabel(story.language, story.system, story.level)
  const lines = teaserLines(story.content, 4)
  const knownCards = choice ? assumedKnownCards(story.vocab_pool, choice, story.level) : {}

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ color: accent, fontWeight: 700, fontFamily: 'Poppins, Inter, sans-serif', marginBottom: '18px' }}>{BRAND_NAME}</div>

        {cover ? (
          <img src={cover} alt="" style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', borderRadius: '16px', display: 'block', marginBottom: '16px' }} />
        ) : null}

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: accent, border: '1px solid ' + accent, borderRadius: '999px', padding: '2px 10px' }}>{theme.languageName} · {levelLabel}</span>
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 6px', fontFamily: theme.font + ', Inter, sans-serif' }}>{story.title}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 22px' }}>A real {theme.languageName} story. How much can you already read?</p>

        {/* Level pick */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>How much {theme.languageName} do you know?</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {LEVEL_CHOICES.map(c => {
              const on = choice === c.key
              return (
                <button key={c.key} onClick={() => pick(c.key)} style={{
                  padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 600,
                  border: '1px solid ' + (on ? accent : 'var(--border)'),
                  background: on ? accent : 'var(--surface)',
                  color: on ? '#fff' : 'var(--text)',
                }}>{c.label}</button>
              )
            })}
          </div>
        </div>

        {/* Reveal + gate */}
        {readability ? (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>You’d understand</div>
              <div style={{ color: accent, fontWeight: 800, fontSize: '64px', lineHeight: 1.1 }}>~{readability.knownPct}%</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{readability.knownCount} known · {readability.learningCount} learning · {readability.newCount} new</div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px', marginBottom: '18px', fontFamily: theme.font + ', Inter, sans-serif', fontSize: '20px', lineHeight: 2 }}>
              {lines.map((line, i) => (
                <TeaserLine key={i} line={line} vocabMap={vocabMap} language={story.language} knownCards={knownCards} accent={accent} />
              ))}
              <div style={{ color: 'var(--text-faint)', fontSize: '14px', fontStyle: 'italic', marginTop: '8px' }}>…</div>
            </div>

            <button onClick={goSignup} style={ctaStyle(accent)}>Sign up free to read the rest</button>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginTop: '10px' }}>Free forever. Start learning these words.</div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-faint)', fontSize: '14px' }}>Pick a level to see how much you can read.</div>
        )}
      </div>
    </div>
  )
}

function ctaStyle(accent) {
  return { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: accent, color: '#fff', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }
}

// One teaser line: greedy-match known/new words and underline the new ones, so a
// visitor sees exactly which words they'd be learning. Reuses the reader's
// matcher so highlighting matches the counted percentage.
function TeaserLine({ line, vocabMap, language, knownCards, accent }) {
  const matcher = useMemo(() => buildVocabMatcher(vocabMap, language), [vocabMap, language])
  const { speaker, text } = splitSpeaker(line)
  const parts = []
  let i = 0, key = 0
  while (i < text.length) {
    const m = matchVocabAt(text, i, matcher)
    if (m && m.vocab) {
      const st = wordStatus(m.vocab.id, knownCards)
      const known = st === 'review' || st === 'mastered'
      parts.push(
        <span key={key++} style={known ? null : { borderBottom: '2px solid ' + accent, color: 'var(--text)' }}>{m.text}</span>
      )
      i += m.length
    } else {
      parts.push(<span key={key++}>{text[i]}</span>)
      i += 1
    }
  }
  return (
    <div>
      {speaker ? <span style={{ color: 'var(--text-muted)', fontWeight: 700, marginRight: '6px' }}>{speaker}</span> : null}
      {parts}
    </div>
  )
}
```

> **Note for the implementer:** confirm the exact return shape of `matchVocabAt(text, index, matcher)` in `src/storyReading.js` before finishing — this plan assumes `{ text, length, vocab }`. If the real shape differs (e.g. `{ match, len, vocab }`), adjust the `TeaserLine` loop accordingly; the pure logic and everything else are unaffected. Likewise confirm `splitSpeaker` returns `{ speaker, text }` (it's used the same way in `StoryReaderImmersive.jsx`).

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds (no OXC/parse errors, no unresolved imports).

- [ ] **Step 5: Commit**

```bash
git add src/PublicStory.jsx src/analytics.js src/analytics.test.js
git commit -m "Public story links: PublicStory page + anon funnel events"
```

---

### Task 5: Route `PublicStory` in `App.jsx`

Render the public page for `/read/:id` when signed-out (before the Landing gate); redirect signed-in visitors into the in-app reader for that story.

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `readStoryId` (Task 1), `PublicStory` (Task 4), the existing `pendingStoryId` deep-link machinery (already wired: `App` passes `pendingStoryId` → `Stories` as `initialStoryId`).

- [ ] **Step 1: Add imports**

In `src/App.jsx`, add `readStoryId` to the existing `./routes` import and import the page:

```js
import { pathToView, viewToPath, isKnownView, readStoryId } from './routes'
import PublicStory from './PublicStory'
```

- [ ] **Step 2: Derive the public story id**

Just after `const view = pathToView(location.pathname)` (around line 91), add:

```js
  const publicStoryId = readStoryId(location.pathname)
```

- [ ] **Step 3: Redirect a signed-in visitor into the real reader**

Add an effect alongside the other effects (after the auth effect that sets `session`). A signed-in user who opens a `/read/:id` link should land in the normal reader, using the existing deep-link path:

```js
  // A signed-in user who opens a public /read/:id link goes to the in-app
  // reader for that story (the loading gate below guarantees session is known,
  // so this never flashes for a genuine anonymous visitor).
  useEffect(() => {
    if (!loading && session && publicStoryId) {
      setPendingStoryId(publicStoryId)
      routerNavigate(viewToPath('stories'), { replace: true })
    }
  }, [loading, session, publicStoryId])
```

- [ ] **Step 4: Render the public page for anonymous visitors**

Between the loading gate (`if (loading) { ... }`, ends ~line 197) and the `if (!session) return <Landing />` line, insert:

```js
  // Public story link — works signed-out. (Signed-in visitors are redirected
  // into the reader by the effect above.)
  if (publicStoryId && !session) {
    return <PublicStory storyId={publicStoryId} />
  }
```

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Confirm the route guard doesn't 404**

`readStoryId` short-circuits `/read/:id` before the `isKnownView` NotFound guard runs (the guard is only reached for signed-in users, who are redirected away). No change needed to `KNOWN_VIEWS`. Verify by reading the render order in `App.jsx`: `loading` → `publicStoryId && !session` → `!session` → … → the NotFound guard.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "Public story links: route /read/:id (anon page + signed-in redirect)"
```

---

### Task 6: Share the public link from the reader

Make the reader's share action point at `/read/:storyId` so the branded share image drives to the story.

**Files:**
- Modify: `src/StoryReaderImmersive.jsx`

**Interfaces:**
- Consumes: `BRAND_URL` from `./brand`, the existing `shareReadingCard({ ..., url })` from `./shareCard`.

- [ ] **Step 1: Locate the existing share call**

Run: `grep -n "shareReadingCard\|BRAND_URL\|from './brand'" src/StoryReaderImmersive.jsx`
Expected: find the `shareReadingCard(...)` call site (the "Share" action) and whether `BRAND_URL` is already imported.

- [ ] **Step 2: Ensure `BRAND_URL` is imported**

If the grep shows `BRAND_URL` is not imported, add it to the existing `./brand` import (or add the import):

```js
import { BRAND_URL } from './brand'
```

- [ ] **Step 3: Pass the story URL to the share call**

In the `shareReadingCard({ ... })` call, add a `url` argument built from the story id (string concatenation, not a template literal, per the style rules):

```js
      url: BRAND_URL + '/read/' + story.id,
```

(If `shareReadingCard` is called with an object that already spreads options, just add this one key. `shareCard.js` already accepts and threads `url` into both the caption and the image footer — no change needed there.)

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/StoryReaderImmersive.jsx
git commit -m "Public story links: reader share points at /read/:id"
```

---

## Final verification (after all tasks)

- [ ] **Full test suite:** `npx vitest run` — expect all green (existing suite + `routes`, `publicStory`, `analytics` additions).
- [ ] **Build:** `npm run build` — expect success.
- [ ] **Lint:** `npx eslint src/PublicStory.jsx src/publicStory.js src/routes.js src/App.jsx src/StoryReaderImmersive.jsx` — expect 0 new errors (repo baseline is 0 errors).
- [ ] **Security review** (REQUIRED — this feature opens an anon door): run `ecc:database-reviewer` and `ecc:security-reviewer` over `supabase/migrations/20260716000000_add_public_story.sql`. Confirm the RPC exposes only published-story content + active vocab, no user data, no unpublished rows, and the grants are `anon, authenticated` only.
- [ ] **End-to-end verify** (REQUIRED): use the `verify` skill / Playwright against a local `npm run build && npm run preview`. Signed-out, open `/read/<published-story-id>`: pick each level chip, confirm the % changes and teaser highlighting renders, confirm the signup CTA routes to Landing. Open `/read/<bad-id>`: confirm the "story not found" state. (Needs the migration applied to the target Supabase project.)
- [ ] **Docs:** move the roadmap item "Public story links" from **Now** to **✅ Shipped** in `ROADMAP.md`, and note the required migration in `docs/BACKLOG.md` (apply `20260716000000_add_public_story.sql`). Update `CLAUDE.md`'s latest-session section. Commit with a descriptive title (it becomes the Discord #roadmap/#announcements text).
