# Paced Reveal Reader — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a beat-by-beat "Paced Reveal" reading experience for stories — one line at a time with a one-tap start — as the default presentation for the existing library, behind a classic-scroll fallback.

**Architecture:** Introduce a `presentation` field on stories and a thin `StoryReader` dispatcher that renders either the existing reader (`StoryReaderImmersive` = "classic") or the new `PacedReader`, both consuming the same props and the same pure helpers in `src/storyReading.js`. Paced Reveal reuses the existing per-line story audio, word-status coloring, `% known`, and mark-read/XP paths; it does not fork them.

**Tech Stack:** React 19 (function components, inline styles + `src/index.css` tokens), Vite 8, Supabase (SQL migration), Vitest (node env, pure logic), Playwright (e2e over the mock Supabase backend in `tests/fixtures/mockSupabase.js`).

## Global Constraints

- **Language:** JavaScript + JSX only. No TypeScript, no type annotations.
- **No new dependencies.** Use what's in `package.json`.
- **Styling:** inline styles keyed off the CSS variables in `src/index.css` (`var(--text)`, `var(--surface)`, `var(--border)`, `var(--text-muted)`, etc.); per-language accent via `languageTheme(track.language).accentHex`. Match the existing reader's conventions.
- **Unit tests** live at `src/**/*.test.js`, run in the node env (no DOM) — so only pure logic is unit-tested (`vitest.config.js` includes `src/**/*.test.js`). Run with `npx vitest run <file>`.
- **UI is verified with Playwright e2e** (`tests/e2e/*.spec.js`) against the mock backend; the mock returns a table fixture wholesale and ignores query filters.
- **Accessibility:** keyboard-operable, visible focus, honor `prefers-reduced-motion`, announce the active line to screen readers.
- **Reader prefs** persist through `prefsGet`/`prefsSet` from `src/offline.js` (already used by the reader).
- **Commit** after each task with the message shown in its final step.
- **Keep the roadmap live:** this feature is already listed under 🚧 Now in `ROADMAP.md`; when Phase 1 ships, move it to ✅ Shipped in the same change (auto-syncs to Discord via `roadmap-live-sync.yml`).

---

## File Structure

- `supabase/migrations/<timestamp>_story_presentation.sql` — **create**: add `stories.presentation`.
- `src/storyReading.js` — **modify**: export `namesFor`, `particlesFor`, and a new pure `segmentLine(text, matcher, names, particles)` that returns renderable tokens.
- `src/storyReading.test.js` — **create**: unit tests for `segmentLine`.
- `src/readerMode.js` — **create**: pure `resolvePresentation(story, modePref)`.
- `src/readerMode.test.js` — **create**: unit tests.
- `src/StoryReader.jsx` — **create**: the dispatcher (classic vs paced).
- `src/PacedReader.jsx` — **create**: the Paced Reveal presentation.
- `src/Stories.jsx` — **modify**: render `<StoryReader>` instead of `<StoryReaderImmersive>` directly.
- `tests/fixtures/mockSupabase.js` — **modify**: add a `stories` fixture (one `paced` story) + real vocab fields so the reader is reachable in e2e.
- `tests/pages/ReaderPage.js` — **create**: page object for the reader.
- `tests/e2e/reader.spec.js` — **create**: e2e for open → launch → advance → word lookup → finish → classic fallback.

`StoryReaderImmersive.jsx` is intentionally **not** gutted in Phase 1. It stays as the "classic" renderer; the dispatcher chooses between it and `PacedReader`. A future refactor can hoist their shared lookup-sheet UI, but that is out of scope here (YAGNI).

---

## Task 1: Make the reader reachable in e2e (stories fixture)

Today the mock backend returns `[]` for `stories`, so the Stories screen is empty and no reader can be opened in tests. Add a fixture first so every later task has a test path.

**Files:**
- Modify: `tests/fixtures/mockSupabase.js`
- Create: `tests/pages/ReaderPage.js`
- Create: `tests/e2e/reader.spec.js`

**Interfaces:**
- Produces: a published Chinese story with `id:'st1'`, `presentation:'paced'`, `tier:1`, `level:2`, real `content` (newline-separated lines, one with a `小明：` speaker), and a `vocabulary` fixture carrying `word/reading/meaning`. `ReaderPage` with `openFirstStory()`.

- [ ] **Step 1: Add the stories fixture + real vocab fields to the mock**

In `tests/fixtures/mockSupabase.js`, replace the minimal `VOCAB` and add `STORIES`. Find:

```js
const VOCAB = Array.from({ length: 30 }, (_, i) => ({ id: `v${i + 1}`, level: (i % 2) + 1 }));
```

Replace with:

```js
// Word-keyed vocab the reader looks up (word/reading/meaning matter now).
const VOCAB = [
  { id: 'v1', word: '今天', reading: 'jīntiān', meaning: 'today', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v2', word: '天气', reading: 'tiānqì', meaning: 'weather', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v3', word: '很', reading: 'hěn', meaning: 'very', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v4', word: '好', reading: 'hǎo', meaning: 'good', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v5', word: '公园', reading: 'gōngyuán', meaning: 'park', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v6', word: '朋友', reading: 'péngyou', meaning: 'friend', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v7', word: '花', reading: 'huā', meaning: 'flower', level: 2, system: 'hsk', language: 'chinese', is_active: true },
];

// One published, Paced-Reveal story. Its lines reuse the vocab above.
const STORIES = [{
  id: 'st1', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 1,
  title: '公园里的下午', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An afternoon at the park.',
  content: ['今天天气很好。', '小明：我们去公园吧！', '朋友：你看，花很好！'].join('\n'),
}];
```

Then add both to `TABLE_FIXTURES`. Find:

```js
const TABLE_FIXTURES = { profiles: PROFILE, language_tracks: TRACK, vocabulary: VOCAB, cards: CARDS };
```

Replace with:

```js
const TABLE_FIXTURES = { profiles: PROFILE, language_tracks: TRACK, vocabulary: VOCAB, cards: CARDS, stories: STORIES, story_reads: [] };
```

- [ ] **Step 2: Add the ReaderPage page object**

Create `tests/pages/ReaderPage.js`:

```js
// Page Object for the story reader (list → category → story → reader).
export class ReaderPage {
  constructor(page) {
    this.page = page;
  }
  async gotoStories() {
    await this.page.goto('/stories');
  }
  // Opens the first available story into the reader, clicking through the
  // category grid + list if present.
  async openFirstStory() {
    await this.gotoStories();
    // The library groups stories by tier/category; click the first tier card,
    // then the first story card. Both are buttons containing the story/category.
    const firstCategory = this.page.getByText('公园里的下午').first();
    // Walk down: click category if the title isn't directly clickable yet.
    for (let i = 0; i < 3; i++) {
      if (await firstCategory.isVisible().catch(() => false)) break;
      const anyCard = this.page.getByRole('button').filter({ hasText: /HSK|Story|Tier|words/i }).first();
      if (await anyCard.isVisible().catch(() => false)) { await anyCard.click(); }
      await this.page.waitForTimeout(200);
    }
    await firstCategory.click();
  }
}
```

- [ ] **Step 3: Write the failing e2e — story opens into a reader**

Create `tests/e2e/reader.spec.js`:

```js
import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { ReaderPage } from '../pages/ReaderPage.js';

test.describe('Story reader', () => {
  test('opens a story from the library', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    // The story title appears in the reader.
    await expect(page.getByText('公园里的下午').first()).toBeVisible();
  });
});
```

- [ ] **Step 4: Run it — expect it to reveal the real navigation**

Run: `npx playwright test reader --project=chromium`
Expected: it may need the category/list click path adjusted. If it fails to find a clickable card, open `src/Stories.jsx` (the `view === 'grid'`/`'list'` renders around lines 413–500) and update `openFirstStory()` selectors to match the actual category/story card text/roles. Iterate `openFirstStory()` until this test passes. Do NOT change app code in this task — only the page object/selectors.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/mockSupabase.js tests/pages/ReaderPage.js tests/e2e/reader.spec.js
git commit -m "test: seed a paced story in the mock so the reader is reachable in e2e"
```

---

## Task 2: `segmentLine` + name/particle helpers (pure, shared)

`PacedReader` needs to turn a line into renderable, tappable tokens. `storyReading.js` already has all the matching logic but only exposes it via the count path (`scanLineVocab`, which discards non-vocab text). Add a pure `segmentLine` that keeps the text, plus export the small `namesFor`/`particlesFor` helpers.

**Files:**
- Modify: `src/storyReading.js`
- Create: `src/storyReading.test.js`

**Interfaces:**
- Produces:
  - `export function namesFor(language): object`
  - `export function particlesFor(language): Set`
  - `export function segmentLine(text, matcher, names, particles): Array<{ text: string, vocab: object|null }>` — consecutive non-vocab characters are grouped into one `{text, vocab:null}` run; each vocab match is its own `{text, vocab}` token. `matcher` is the result of `buildVocabMatcher(vocabMap, language)`.

- [ ] **Step 1: Write the failing test**

Create `src/storyReading.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildVocabMatcher, segmentLine, namesFor, particlesFor } from './storyReading'

const vocabMap = {
  '今天': { id: 'v1', word: '今天', reading: 'jīntiān', meaning: 'today' },
  '天气': { id: 'v2', word: '天气', reading: 'tiānqì', meaning: 'weather' },
  '很': { id: 'v3', word: '很', reading: 'hěn', meaning: 'very' },
  '好': { id: 'v4', word: '好', reading: 'hǎo', meaning: 'good' },
}

describe('segmentLine', () => {
  const matcher = buildVocabMatcher(vocabMap, 'chinese')
  const names = namesFor('chinese')
  const particles = particlesFor('chinese')

  it('splits a line into vocab tokens and non-vocab runs, in order', () => {
    const toks = segmentLine('今天天气很好。', matcher, names, particles)
    expect(toks.map(t => t.text)).toEqual(['今天', '天气', '很', '好', '。'])
    expect(toks.map(t => (t.vocab ? t.vocab.id : null))).toEqual(['v1', 'v2', 'v3', 'v4', null])
  })

  it('groups consecutive unknown characters into a single text run', () => {
    const toks = segmentLine('ABC很', matcher, names, particles)
    expect(toks[0]).toEqual({ text: 'ABC', vocab: null })
    expect(toks[1].vocab.id).toBe('v3')
  })

  it('reconstructs the original text exactly', () => {
    const line = '今天天气很好。'
    const toks = segmentLine(line, matcher, names, particles)
    expect(toks.map(t => t.text).join('')).toBe(line)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/storyReading.test.js`
Expected: FAIL — `segmentLine`, `namesFor`, `particlesFor` are not exported.

- [ ] **Step 3: Implement — export the helpers + `segmentLine`**

In `src/storyReading.js`, the private functions `namesFor`/`particlesFor` exist near line 93. Add `export` to both:

```js
export function namesFor(language) { return CHARACTER_READINGS[language] || {} }
export function particlesFor(language) { return language === 'japanese' ? JP_PARTICLES : NO_PARTICLES }
```

Then add `segmentLine` just after `scanLineVocab` (near line 509):

```js
// Segment one (speaker-stripped) line into renderable tokens: each vocab match
// is its own tappable token; consecutive non-vocab characters are grouped into
// a single plain-text run. Mirrors scanLineVocab's matching exactly, but keeps
// the text so the reader can render it. Pure — unit-tested.
export function segmentLine(text, matcher, names = {}, particles = NO_PARTICLES) {
  const tokens = []
  let run = ''
  const flush = () => { if (run) { tokens.push({ text: run, vocab: null }); run = '' } }
  let i = 0
  let boundary = true
  while (i < text.length) {
    const name = matchName(text, i, matcher.words, names)
    if (name) { flush(); tokens.push({ text: name, vocab: null }); i += name.length; boundary = true; continue }
    const m = matchVocabAt(text, i, matcher, particles, boundary)
    if (m) { flush(); tokens.push({ text: text.slice(i, i + m.len), vocab: m.vocab }); i += m.len; boundary = true; continue }
    run += text[i]
    boundary = boundaryAfterSkip(text[i], particles)
    i += 1
  }
  flush()
  return tokens
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/storyReading.test.js`
Expected: PASS (3 tests). Then `npx vitest run` — the full suite still passes.

- [ ] **Step 5: Commit**

```bash
git add src/storyReading.js src/storyReading.test.js
git commit -m "feat(reader): pure segmentLine + exported name/particle helpers"
```

---

## Task 3: `resolvePresentation` (pure mode resolver)

Decide which renderer a story uses, given its `presentation` and the user's mode preference.

**Files:**
- Create: `src/readerMode.js`
- Create: `src/readerMode.test.js`

**Interfaces:**
- Produces: `export function resolvePresentation(story, modePref): 'classic' | 'paced' | 'chat' | 'scene'`. Rules: unknown/missing `story.presentation` → treat as `'paced'`. If the resolved story mode is `'paced'` and `modePref === 'classic'`, return `'classic'` (user opted out of paced). `'chat'`/`'scene'` stories ignore `modePref`. Any story mode not in the known set → `'classic'` (safe fallback).

- [ ] **Step 1: Write the failing test**

Create `src/readerMode.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { resolvePresentation } from './readerMode'

describe('resolvePresentation', () => {
  it('defaults a story with no presentation to paced', () => {
    expect(resolvePresentation({}, 'paced')).toBe('paced')
    expect(resolvePresentation({ presentation: null }, 'paced')).toBe('paced')
  })
  it('honors a classic preference only for paced stories', () => {
    expect(resolvePresentation({ presentation: 'paced' }, 'classic')).toBe('classic')
    expect(resolvePresentation({ presentation: 'paced' }, 'paced')).toBe('paced')
  })
  it('ignores the preference for authored formats', () => {
    expect(resolvePresentation({ presentation: 'chat' }, 'classic')).toBe('chat')
    expect(resolvePresentation({ presentation: 'scene' }, 'classic')).toBe('scene')
  })
  it('falls back to classic for an unknown mode', () => {
    expect(resolvePresentation({ presentation: 'wizard' }, 'paced')).toBe('classic')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/readerMode.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/readerMode.js`:

```js
// Which presentation renders a story. Stories declare a `presentation`
// (default 'paced' for the whole existing library); the user can opt a paced
// story back to the classic continuous scroll. Authored formats (chat, scene)
// are fixed by the story and ignore the preference.
const KNOWN = new Set(['paced', 'chat', 'scene'])

export function resolvePresentation(story, modePref) {
  const raw = story && story.presentation
  const mode = KNOWN.has(raw) ? raw : (raw == null ? 'paced' : 'classic')
  if (mode === 'paced' && modePref === 'classic') return 'classic'
  return mode
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/readerMode.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/readerMode.js src/readerMode.test.js
git commit -m "feat(reader): resolvePresentation mode resolver"
```

---

## Task 4: Database migration for `stories.presentation`

**Files:**
- Create: `supabase/migrations/20260717120000_story_presentation.sql`

**Interfaces:**
- Produces: a `presentation text not null default 'paced'` column on `stories`; every existing row becomes `'paced'` with no backfill.

- [ ] **Step 1: Inspect the existing migration style**

Run: `ls supabase/migrations | tail -5` and open the most recent file to match its header/comment style and `alter table` conventions.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260717120000_story_presentation.sql`:

```sql
-- How a story is presented in the reader:
--   'paced' — beat-by-beat Paced Reveal (default for the whole existing library)
--   'chat'  — messaging-style conversation (future)
--   'scene' — illustrated visual-novel scenes (future)
-- Classic continuous-scroll is a per-user viewing preference, NOT a value here.
alter table public.stories
  add column if not exists presentation text not null default 'paced';

-- Constrain to the known set so a typo can't silently render as classic.
alter table public.stories
  drop constraint if exists stories_presentation_check;
alter table public.stories
  add constraint stories_presentation_check
  check (presentation in ('paced', 'chat', 'scene'));
```

- [ ] **Step 3: Verify it parses / matches conventions**

Run: `cat supabase/migrations/20260717120000_story_presentation.sql`
Expected: matches the style of neighboring migrations (schema-qualified table, idempotent guards). No app runtime depends on this in tests (the mock supplies `presentation` directly), so no test here.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260717120000_story_presentation.sql
git commit -m "feat(db): add stories.presentation (default paced)"
```

---

## Task 5: `StoryReader` dispatcher + wire into Stories (classic path unchanged)

Introduce the dispatcher and route through it, but keep rendering the classic reader for now (PacedReader arrives next task). This isolates the wiring change from the new UI.

**Files:**
- Create: `src/StoryReader.jsx`
- Modify: `src/Stories.jsx`

**Interfaces:**
- Consumes: `resolvePresentation` (Task 3), the reader-mode preference from `prefsGet('reader:prefs')` (the existing reader-prefs object; add a `mode` field, default `'paced'`).
- Produces: `export default function StoryReader(props)` accepting the exact same props `StoryReaderImmersive` takes today; renders `StoryReaderImmersive` for `'classic'` and (next task) `PacedReader` for `'paced'`.

- [ ] **Step 1: Create the dispatcher (paced temporarily falls back to classic)**

Create `src/StoryReader.jsx`:

```jsx
import { useEffect, useState } from 'react'
import StoryReaderImmersive from './StoryReaderImmersive'
import { resolvePresentation } from './readerMode'
import { prefsGet } from './offline'

const PREFS_KEY = 'reader:prefs'

// Chooses the presentation for a story and renders it. All modes receive the
// same props; today classic + paced both render the classic reader, so this
// task is a pure indirection with no visible change. PacedReader lands next.
export default function StoryReader(props) {
  const [modePref, setModePref] = useState('paced')
  useEffect(() => {
    let live = true
    prefsGet(PREFS_KEY).then(p => { if (live && p && typeof p.mode === 'string') setModePref(p.mode) })
    return () => { live = false }
  }, [])

  const mode = resolvePresentation(props.story, modePref)
  // 'paced' will switch to <PacedReader> in the next task.
  if (mode === 'classic' || mode === 'paced') return <StoryReaderImmersive {...props} />
  return <StoryReaderImmersive {...props} />
}
```

- [ ] **Step 2: Route Stories through the dispatcher**

In `src/Stories.jsx`, change the import (line ~9):

```jsx
import StoryReaderImmersive from './StoryReaderImmersive'
```

to:

```jsx
import StoryReader from './StoryReader'
```

Then in the `view === 'reader'` block (around line 379–411), rename the rendered element `<StoryReaderImmersive ... />` to `<StoryReader ... />` (props unchanged).

- [ ] **Step 3: Run the reader e2e — still green (classic behavior)**

Run: `npx playwright test reader --project=chromium`
Expected: PASS — the story still opens exactly as before (dispatcher renders classic).

- [ ] **Step 4: Build + lint**

Run: `npm run build` then `npx eslint src/StoryReader.jsx src/Stories.jsx`
Expected: build succeeds; eslint exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/StoryReader.jsx src/Stories.jsx
git commit -m "feat(reader): StoryReader dispatcher (classic path unchanged)"
```

---

## Task 6: PacedReader — launch screen + beat flow + advance

Build the new presentation: a launch screen that starts on one tap, then the beat-by-beat focus flow (spotlight/recede/blur, progress, advance via tap/keys/prev/next). No audio or word-lookup yet — those are the next tasks. Wire the dispatcher to render it for `'paced'`.

**Files:**
- Create: `src/PacedReader.jsx`
- Modify: `src/StoryReader.jsx`

**Interfaces:**
- Consumes: props `{ story, vocabMap, userCards, track, isRead, onBack }` (the same prop bag the classic reader gets — extra props are accepted and used in later tasks); `calculateStoryReadability`, `buildVocabMatcher`, `segmentLine`, `namesFor`, `particlesFor`, `splitSpeaker` from `./storyReading`; `getLevelLabel` from `./utils`; `languageTheme` from `./languageTheme`.
- Produces: `export default function PacedReader(props)`.

- [ ] **Step 1: Create PacedReader with launch + beat flow**

Create `src/PacedReader.jsx`:

```jsx
import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { languageTheme } from './languageTheme'
import { getLevelLabel } from './utils'
import {
  calculateStoryReadability, buildVocabMatcher, segmentLine,
  namesFor, particlesFor, splitSpeaker,
} from './storyReading'
import { ArrowLeft, Play, ChevronLeft, ChevronRight } from 'lucide-react'

const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'

// Distance-based emphasis for the focus flow: the active beat is lit; read
// beats recede (dim, crisp); unread beats fade + blur by distance.
function beatStyle(distance, reduceMotion) {
  if (distance === 0) return { opacity: 1, filter: 'none' }
  if (distance < 0) return { opacity: 0.26, filter: 'none' }
  const blur = reduceMotion ? 0 : (distance === 1 ? 0.5 : distance === 2 ? 1.6 : 2.6)
  const opacity = distance === 1 ? 0.5 : distance === 2 ? 0.22 : 0.08
  return { opacity, filter: blur ? `blur(${blur}px)` : 'none' }
}

export default function PacedReader({ story, vocabMap, userCards, track, isRead, onBack }) {
  const theme = languageTheme(track.language)
  const accent = theme.accentHex
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [started, setStarted] = useState(false)
  const [cur, setCur] = useState(0)
  const [showPy, setShowPy] = useState(true)
  const [showEn, setShowEn] = useState(false)

  const stageRef = useRef(null)
  const trackRef = useRef(null)
  const beatEls = useRef([])

  // Parse the story into beats once. Each beat = one line: { speaker, tokens }.
  const matcher = useMemo(() => buildVocabMatcher(vocabMap, track.language), [vocabMap, track.language])
  const names = useMemo(() => namesFor(track.language), [track.language])
  const particles = useMemo(() => particlesFor(track.language), [track.language])
  const beats = useMemo(() => (story.content || '').split('\n').filter(Boolean).map(line => {
    const { speaker, text } = splitSpeaker(line)
    return { speaker, text, tokens: segmentLine(text, matcher, names, particles) }
  }), [story.content, matcher, names, particles])

  const readability = useMemo(
    () => calculateStoryReadability({ content: story.content, vocabMap, cards: userCards, language: track.language }),
    [story.content, vocabMap, userCards, track.language])

  const levelLabel = getLevelLabel(track.language, track.system, story.level)
  const total = beats.length

  // Ease the active beat to ~42% of the stage height (teleprompter feel).
  const layout = useCallback(() => {
    const stage = stageRef.current, trk = trackRef.current, el = beatEls.current[cur]
    if (!stage || !trk || !el) return
    const y = stage.clientHeight * 0.42 - (el.offsetTop + el.offsetHeight / 2)
    trk.style.transform = `translateY(${y}px)`
  }, [cur])

  useEffect(() => { if (started) layout() }, [started, cur, showPy, showEn, layout])
  useEffect(() => {
    const onResize = () => { if (started) layout() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [started, layout])

  const go = useCallback((i) => setCur(c => Math.max(0, Math.min(total - 1, i ?? c))), [total])

  useEffect(() => {
    if (!started) return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(cur + 1) }
      if (e.key === 'ArrowLeft') go(cur - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, cur, go])

  const pageShell = { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }

  // ── Launch screen ──
  if (!started) {
    const { knownPct, knownCount, learningCount, newCount } = readability
    return (
      <div style={pageShell}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px' }}>
          <button onClick={onBack} aria-label="Back to library" style={ghost}><ArrowLeft size={18} color="var(--text-muted)" /></button>
        </div>
        <div style={{ flex: 1, maxWidth: '640px', width: '100%', margin: '0 auto', padding: '8px 24px 40px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, marginBottom: '8px' }}>{levelLabel}</div>
          <h1 style={{ fontFamily: theme.font, fontSize: '34px', fontWeight: 800, lineHeight: 1.15, textWrap: 'balance', marginBottom: '18px' }}>{story.title}</h1>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '9px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>{knownPct}% known{isRead ? ' · Finished' : ''}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{knownCount} known · {learningCount} learning · {newCount} new</span>
          </div>
          <div style={{ display: 'flex', height: '5px', borderRadius: '999px', overflow: 'hidden', background: 'var(--border)', marginBottom: 'auto' }}>
            <div style={{ width: pct(knownCount, readability.totalUnique), background: '#2F9E6D' }} />
            <div style={{ width: pct(learningCount, readability.totalUnique), background: '#CA8A04' }} />
            <div style={{ width: pct(newCount, readability.totalUnique), background: accent + '55' }} />
          </div>
          <button onClick={() => { setCur(0); setStarted(true) }} style={startBtn}>
            <Play size={18} color="#fff" /> Start reading
          </button>
          <button onClick={onBack} style={classicLink}>Prefer the whole page? <u>Read as classic scroll</u></button>
        </div>
      </div>
    )
  }

  // ── Reading stage ──
  return (
    <div style={pageShell}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px' }}>
        <button onClick={() => setStarted(false)} aria-label="Back to start" style={ghost}><ArrowLeft size={18} color="var(--text-muted)" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{cur + 1} / {total}</div>
        <div style={{ width: '34px' }} />
      </div>
      <div style={{ height: '4px', background: 'var(--border)', margin: '0 16px', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: accent, width: `${((cur + 1) / total) * 100}%`, transition: reduceMotion ? 'none' : 'width .4s ease' }} />
      </div>

      <div
        ref={stageRef}
        onClick={() => go(cur + 1)}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden', cursor: 'pointer',
          WebkitMaskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)',
          maskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)',
        }}
      >
        <div ref={trackRef} style={{ position: 'absolute', left: 0, right: 0, padding: '0 28px', maxWidth: '680px', margin: '0 auto', transition: reduceMotion ? 'none' : 'transform .55s cubic-bezier(.33,1,.68,1)' }}>
          {beats.map((b, i) => {
            const st = beatStyle(i - cur, reduceMotion)
            return (
              <div key={i} ref={el => { beatEls.current[i] = el }}
                aria-hidden={i !== cur}
                style={{ padding: '26px 0', transition: reduceMotion ? 'none' : 'opacity .45s ease, filter .45s ease', ...st }}>
                {b.speaker && <div style={{ fontSize: '12.5px', fontWeight: 800, color: accent, marginBottom: '9px' }}>{b.speaker}</div>}
                {showPy && i === cur && <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>{pinyinLine(b.tokens)}</div>}
                <div aria-live={i === cur ? 'polite' : undefined} style={{ fontFamily: theme.font, fontSize: '30px', lineHeight: 1.62, fontWeight: 500 }}>
                  {b.tokens.map((t, k) => t.vocab
                    ? <span key={k} style={{ borderRadius: '4px', padding: '0 1px', background: i === cur ? accent + '14' : 'transparent' }}>{t.text}</span>
                    : <span key={k}>{t.text}</span>)}
                </div>
                {showEn && i === cur && story.english_content && <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '12px' }}>{story.english_content}</div>}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <Chip on={showPy} onClick={() => setShowPy(v => !v)} label={track.language === 'chinese' ? 'Pinyin' : 'Reading'} accent={accent} />
          <Chip on={showEn} onClick={() => setShowEn(v => !v)} label="English" accent={accent} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="Previous line" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={() => go(cur + 1)} aria-label="Next line" style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none', color: '#fff' }}><ChevronRight size={20} color="#fff" /></button>
          <div style={{ width: '44px' }} />
        </div>
      </div>
    </div>
  )
}

function pct(n, total) { return total ? Math.round((n / total) * 100) + '%' : '0%' }
function pinyinLine(tokens) { return tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ') }

function Chip({ on, onClick, label, accent }) {
  return (
    <button onClick={onClick} style={{
      fontSize: '12px', fontWeight: 700, padding: '7px 13px', borderRadius: '999px', cursor: 'pointer',
      fontFamily: 'Inter, sans-serif',
      border: '1px solid ' + (on ? accent + '73' : 'var(--border)'),
      background: on ? accent + '14' : 'var(--surface)', color: on ? accent : 'var(--text-muted)',
    }}>{label}</button>
  )
}

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const navBtn = { width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const startBtn = { marginTop: '24px', width: '100%', border: 'none', borderRadius: '16px', background: SAGE, color: '#fff', fontSize: '15.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px' }
const classicLink = { marginTop: '14px', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', width: '100%' }
```

Note: `SAGE_DARK` is used by the hover state added in Task 8's polish; keep the import list as-is.

- [ ] **Step 2: Point the dispatcher at PacedReader for 'paced'**

In `src/StoryReader.jsx`, add the import and route `'paced'`:

```jsx
import PacedReader from './PacedReader'
```

Replace the render block:

```jsx
  const mode = resolvePresentation(props.story, modePref)
  if (mode === 'paced') return <PacedReader {...props} />
  return <StoryReaderImmersive {...props} />
```

- [ ] **Step 3: Extend the e2e — launch + advance**

Append to `tests/e2e/reader.spec.js`:

```js
test('paced reveal: starts on one tap and advances beat by beat', async ({ page }) => {
  const reader = new ReaderPage(page);
  await reader.openFirstStory();

  // Launch screen.
  const start = page.getByRole('button', { name: /Start reading/i });
  await expect(start).toBeVisible();
  await start.click();

  // First beat + progress counter.
  await expect(page.getByText('1 / 3')).toBeVisible();
  await expect(page.getByText('今天', { exact: false }).first()).toBeVisible();

  // Advance with the Next control.
  await page.getByRole('button', { name: /Next line/i }).click();
  await expect(page.getByText('2 / 3')).toBeVisible();
});
```

- [ ] **Step 4: Run e2e**

Run: `npx playwright test reader --project=chromium`
Expected: PASS (3 tests). If `openFirstStory` needs the launch screen (it now lands on PacedReader's launch), that's expected — the story title shows on the launch screen too, so the first test still passes.

- [ ] **Step 5: Build + lint + commit**

Run: `npm run build && npx eslint src/PacedReader.jsx src/StoryReader.jsx`
Expected: clean.

```bash
git add src/PacedReader.jsx src/StoryReader.jsx tests/e2e/reader.spec.js
git commit -m "feat(reader): PacedReader launch screen + beat-by-beat focus flow"
```

---

## Task 7: Play — auto-advance with per-line audio read-along

Add a Play control that reads the story aloud line by line and auto-advances, highlighting the active beat (read-along). Reuses the existing story-audio path (`stories/{id}/{index}.mp3` via `getAudioUrl` + `playAudioEl`) with a browser speech-synthesis fallback, mirroring `StoryReaderImmersive`'s `speakFrom`.

**Files:**
- Modify: `src/PacedReader.jsx`

**Interfaces:**
- Consumes: `getAudioUrl`, `playAudioEl` from `./utils`; `story.has_audio`, `story.id`.

- [ ] **Step 1: Add audio imports + play engine**

In `src/PacedReader.jsx`, extend the utils import:

```jsx
import { getLevelLabel, getAudioUrl, playAudioEl } from './utils'
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'
```

Add state + refs near the other `useState`s:

```jsx
  const [playing, setPlaying] = useState(false)
  const runRef = useRef(0)
  const audioElRef = useRef(null)
```

Add the play engine (mirrors StoryReaderImmersive.speakFrom) above the `return`:

```jsx
  const ttsLang = track.language === 'japanese' ? 'ja-JP' : track.language === 'chinese' ? 'zh-CN' : 'ru-RU'

  const stopPlay = useCallback(() => {
    runRef.current += 1
    setPlaying(false)
    try { window.speechSynthesis.cancel() } catch { /* noop */ }
    if (audioElRef.current) audioElRef.current.pause()
  }, [])

  const speakFrom = useCallback((index, runId) => {
    if (runId !== runRef.current) return
    if (index >= beats.length) { setPlaying(false); return }
    setCur(index)
    const advance = () => { if (runId === runRef.current) speakFrom(index + 1, runId) }
    const viaSynth = () => {
      try {
        const u = new SpeechSynthesisUtterance(beats[index].text)
        u.lang = ttsLang; u.rate = 0.9
        u.onend = advance
        window.speechSynthesis.speak(u)
      } catch { setPlaying(false) }
    }
    if (story.has_audio) {
      if (!audioElRef.current) audioElRef.current = new Audio()
      const el = audioElRef.current
      el.onended = advance
      playAudioEl(el, getAudioUrl('stories/' + story.id + '/' + index + '.mp3'), viaSynth)
    } else viaSynth()
  }, [beats, story.has_audio, story.id, ttsLang])

  const togglePlay = () => {
    if (playing) { stopPlay(); return }
    runRef.current += 1
    setPlaying(true)
    speakFrom(cur >= beats.length - 1 ? 0 : cur, runRef.current)
  }

  // Stop audio when leaving the reading view / unmounting.
  useEffect(() => () => { stopPlay() }, [stopPlay])
```

Also make manual navigation stop playback: change the stage `onClick` and the prev/next handlers to call `stopPlay()` first:

```jsx
        onClick={() => { stopPlay(); go(cur + 1) }}
```
```jsx
          <button onClick={() => { stopPlay(); go(cur - 1) }} disabled={cur === 0} aria-label="Previous line" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none', color: '#fff' }}>{playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
          <button onClick={() => { stopPlay(); go(cur + 1) }} aria-label="Next line" style={navBtn}><ChevronRight size={18} /></button>
```

(The middle transport button becomes Play/Pause; Next moves to the right slot — replacing the empty `<div style={{ width: '44px' }} />`.)

- [ ] **Step 2: Extend the e2e — Play toggles to Pause**

Append to `tests/e2e/reader.spec.js`:

```js
test('paced reveal: play control toggles', async ({ page }) => {
  const reader = new ReaderPage(page);
  await reader.openFirstStory();
  await page.getByRole('button', { name: /Start reading/i }).click();
  await page.getByRole('button', { name: /^Play$/i }).click();
  await expect(page.getByRole('button', { name: /^Pause$/i })).toBeVisible();
  await page.getByRole('button', { name: /^Pause$/i }).click();
  await expect(page.getByRole('button', { name: /^Play$/i })).toBeVisible();
});
```

- [ ] **Step 3: Run e2e**

Run: `npx playwright test reader --project=chromium`
Expected: PASS. (The mock story has `has_audio:false`, so playback uses speech-synthesis, which is a no-op in headless Chromium but the toggle/labels still work.)

- [ ] **Step 4: Build + lint + commit**

```bash
git add src/PacedReader.jsx tests/e2e/reader.spec.js
git commit -m "feat(reader): paced play/pause with per-line audio read-along"
```

---

## Task 8: Word lookup, finish, and classic-scroll preference

Make words in the active beat tappable (a compact lookup sheet with reading/meaning + add-to-deck), mark the story read at the end (XP + recap-style completion), and persist the "Read as classic scroll" choice so the dispatcher honors it next time.

**Files:**
- Modify: `src/PacedReader.jsx`
- Modify: `src/StoryReader.jsx` (already reads `prefs.mode`)

**Interfaces:**
- Consumes: `supabase` from `./supabase` (add-to-deck insert + optional card refetch), `awardXp` from `./xpService`, `enqueueStoryRead` from `./syncQueue`, `prefsGet`/`prefsSet` from `./offline`, `cleanMeaning` from `./cleanMeaning`, props `session`, `profile`, `onMarkRead`, `setUserCards`.
- Produces: the completed Paced reading loop.

- [ ] **Step 1: Add imports**

In `src/PacedReader.jsx`:

```jsx
import { supabase } from './supabase'
import { awardXp } from './xpService'
import { enqueueStoryRead } from './syncQueue'
import { prefsGet, prefsSet } from './offline'
import { cleanMeaning } from './cleanMeaning'
import { wordStatus } from './storyReading'
import { X, Volume2, Bookmark, Check } from 'lucide-react'
```

Add `session, profile, onMarkRead, setUserCards` to the destructured props.

- [ ] **Step 2: Word lookup sheet**

Add state:

```jsx
  const [selected, setSelected] = useState(null) // { word, vocab, status }
```

In the active beat's token render, make vocab tokens tappable (stop propagation so the stage tap doesn't also advance), and color by status:

```jsx
                  {b.tokens.map((t, k) => {
                    if (!t.vocab) return <span key={k}>{t.text}</span>
                    const status = wordStatus(t.vocab.id, userCards)
                    const decorate = i === cur
                    return (
                      <span key={k}
                        onClick={i === cur ? (e) => { e.stopPropagation(); stopPlay(); setSelected({ word: t.vocab.word, vocab: t.vocab, status }) } : undefined}
                        style={{
                          cursor: i === cur ? 'pointer' : 'inherit', borderRadius: '4px', padding: '0 1px',
                          background: decorate && status === 'not_started' ? accent + '1f' : (decorate && status === 'learning' ? '#CA8A0422' : 'transparent'),
                          boxShadow: decorate && status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none',
                        }}>{t.text}</span>
                    )
                  })}
```

Add the sheet just before the final closing `</div>` of the reading view:

```jsx
      {selected && (
        <div onClick={() => setSelected(null)} className="app-overlay-viewport" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.14)' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '16px 18px 26px', boxShadow: '0 -10px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 14px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: accent, fontFamily: theme.font }}>{selected.word}</span>
                <span style={{ fontSize: '16px', color: '#B45309', fontWeight: 600 }}>{selected.vocab.reading}</span>
              </div>
              <button onClick={() => addToDeck(selected.vocab)} aria-label="Add to deck" style={ghost}>
                <Bookmark size={20} color={userCards[selected.vocab.id] ? accent : 'var(--text-muted)'} fill={userCards[selected.vocab.id] ? accent : 'none'} />
              </button>
            </div>
            <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>{cleanMeaning(selected.vocab.meaning)}</div>
          </div>
        </div>
      )}
```

Add the `addToDeck` handler (mirrors the classic reader / ChatMission insert):

```jsx
  const addToDeck = async (vocab) => {
    if (!vocab || !vocab.id || (userCards && userCards[vocab.id])) return
    const { error } = await supabase.from('cards').insert({
      user_id: session.user.id, vocab_id: vocab.id,
      state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
    })
    if (!error && setUserCards) setUserCards(prev => ({ ...prev, [vocab.id]: { vocab_id: vocab.id, state: 'new' } }))
  }
```

- [ ] **Step 3: Finish on the last beat**

Change `go` so advancing past the last beat triggers finish, and add a finish overlay + handler:

```jsx
  const [done, setDone] = useState(false)
  const finishedRef = useRef(false)

  const finish = useCallback(() => {
    stopPlay()
    setDone(true)
    if (finishedRef.current) return
    finishedRef.current = true
    if (!isRead) {
      enqueueStoryRead({ userId: session.user.id, storyId: story.id })
      if (profile) awardXp(session, profile, 10)
      if (onMarkRead) onMarkRead(story.id)
    }
  }, [isRead, session, story.id, profile, onMarkRead, stopPlay])

  const advance = useCallback(() => { if (cur >= total - 1) finish(); else go(cur + 1) }, [cur, total, finish, go])
```

Replace the three `go(cur + 1)` advance call sites (stage `onClick`, keyboard `ArrowRight`/`Space`, Next button, and `speakFrom`'s end) with `advance()` — except `speakFrom` should call `finish()` when `index >= beats.length`. Update the stage/next handlers:

```jsx
        onClick={() => { stopPlay(); advance() }}
```
```jsx
          <button onClick={() => { stopPlay(); advance() }} aria-label="Next line" style={navBtn}><ChevronRight size={18} /></button>
```

And the finish overlay before the closing tag:

```jsx
      {done && (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '34px', gap: '8px', zIndex: 6 }}>
          <div style={{ width: '58px', height: '58px', borderRadius: '18px', background: accent + '18', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}><Check size={28} color={accent} /></div>
          <h2 style={{ fontSize: '22px', fontWeight: 800 }}>You read it</h2>
          <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', maxWidth: '260px', lineHeight: 1.6 }}>Nice — you read all of “{story.title}”.</p>
          <button onClick={onBack} style={{ ...startBtn, width: 'auto', padding: '12px 22px', marginTop: '14px' }}>Back to library</button>
        </div>
      )}
```

- [ ] **Step 4: Persist "Read as classic scroll"**

Change the launch-screen classic link handler to save the preference before leaving:

```jsx
          <button onClick={async () => { const p = (await prefsGet('reader:prefs')) || {}; await prefsSet('reader:prefs', { ...p, mode: 'classic' }); onBack() }} style={classicLink}>Prefer the whole page? <u>Read as classic scroll</u></button>
```

(The dispatcher already reads `prefs.mode`; after this, reopening a paced story renders the classic reader until the user clears the preference. Note in a code comment that a settings toggle to flip back lives in the classic reader's settings panel — a follow-up.)

- [ ] **Step 5: Extend the e2e — word lookup + finish**

Append to `tests/e2e/reader.spec.js`:

```js
test('paced reveal: tap a word to look it up, then finish', async ({ page }) => {
  const reader = new ReaderPage(page);
  await reader.openFirstStory();
  await page.getByRole('button', { name: /Start reading/i }).click();

  // Tap a known vocab word on the first beat.
  await page.getByText('今天', { exact: true }).first().click();
  await expect(page.getByText('today')).toBeVisible();           // meaning in the sheet
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(5, 5);                                  // dismiss sheet

  // Advance to the end → finish overlay.
  await page.getByRole('button', { name: /Next line/i }).click();
  await page.getByRole('button', { name: /Next line/i }).click();
  await page.getByRole('button', { name: /Next line/i }).click();
  await expect(page.getByText('You read it')).toBeVisible();
});
```

- [ ] **Step 6: Run e2e + unit + build + lint**

Run: `npx playwright test reader --project=chromium` (expect PASS), then `npx vitest run` (all pure tests pass), then `npm run build && npx eslint src/PacedReader.jsx`.
Expected: all green. If the word-tap test is flaky because the sheet overlaps the tapped word, dismiss via the overlay background click (already included) and adjust the tap target to `.first()`.

- [ ] **Step 7: Commit**

```bash
git add src/PacedReader.jsx tests/e2e/reader.spec.js
git commit -m "feat(reader): paced word lookup, finish + mark-read, classic-scroll preference"
```

---

## Task 9: Verify end-to-end in the real app + roadmap

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Drive the real reader visually**

Use the preview-harness pattern (a throwaway `src/reader_preview.jsx` mounting `PacedReader` with sample props, served by `npm run dev:e2e`, screenshotted with Playwright at 390×844 light + dark) to confirm: launch → start → spotlight/recede/blur → advance → pinyin toggle → word sheet → finish. Delete the harness after. (This is the same technique used for the reader-declutter change.)

- [ ] **Step 2: Full test sweep**

Run: `npx vitest run` then `npx playwright test --project=chromium`
Expected: all unit + e2e green.

- [ ] **Step 3: Move the roadmap item to Shipped**

In `ROADMAP.md`, cut the "A calmer, guided story reader — Paced Reveal…" line from **🚧 Now** and add under **✅ Shipped**:

```md
- [x] A calmer, guided story reader — stories now play one line at a time ("Paced Reveal") with a one-tap start and read-along audio, so a page of text never feels like a wall (classic scroll still available)
```

- [ ] **Step 4: Commit (auto-syncs the roadmap to Discord)**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): ship Paced Reveal reader (Phase 1)"
```

---

## Self-Review notes

- **Spec coverage:** launch screen (T6), beat focus-flow + advance (T6), Play/read-along audio (T7), word lookup + toggles (T6/T8), progress counter (T6), finish/mark-read (T8), `presentation` field + migration (T4), dispatcher (T5), classic-scroll preference + fallback (T5/T8), accessibility hooks — `aria-live`, keyboard, reduced-motion (T6) — all mapped. The full "extract a shared engine hook from the classic reader" from the spec is intentionally narrowed to "share the pure `storyReading.js` helpers + segmentLine" (T2) to avoid a risky rewrite; the classic reader is untouched. Chat/Scene remain future specs.
- **Interfaces:** `segmentLine(text, matcher, names, particles)`, `resolvePresentation(story, modePref)`, `PacedReader(props)`, `addToDeck(vocab)`, `speakFrom(index, runId)`, `advance()`/`finish()` are defined where first introduced and reused consistently.
- **Prereqs to read at execution time:** `src/Stories.jsx` reader-render block (for T1 selectors + T5 wiring), the most recent `supabase/migrations/*` (T4 style), and `StoryReaderImmersive.jsx` `speakFrom`/add-to-deck for parity (T7/T8).
