# Scene-format Stories (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth story presentation — an emoji **picture-book / "scene"** reader that reveals a big illustration + one short line per tap, reusing the shared reader engine.

**Architecture:** A new `SceneReader.jsx` consumes the existing `useStoryReaderCore` hook exactly as `ChatReader` does. A pure `splitScene` helper pulls a leading emoji off each content line; the core gains a per-beat `emoji` (populated only when `story.presentation === 'scene'`) and computes readability over emoji-stripped content, so the emoji never becomes a fake vocab token. The dispatcher routes `presentation === 'scene'` to the new renderer. No DB change — `presentation = 'scene'` already exists.

**Tech Stack:** React 19 (function components, hooks, inline styles keyed off `src/index.css` CSS variables), Vitest (node env, pure logic only), Playwright e2e over the mock Supabase backend, Vite 8.

## Global Constraints

- No new DB columns — `presentation = 'scene'` already exists in the schema and in `readerMode.js`'s known-set.
- No image pipeline — the only "illustration" is a single leading emoji per content line (Unicode text).
- The per-beat `emoji` addition to `useStoryReaderCore` MUST be a no-op for non-scene stories (Paced + Chat behavior identical to today; their e2e suites are the safety net).
- Emoji must never count as vocabulary or affect `% known` / `calculateStoryReadability`.
- Inline styles only, keyed off `var(--bg)`, `var(--text)`, `var(--surface)`, `var(--border)`, `var(--text-muted)`; per-language accent via `c.theme.accentHex` / `c.theme.font`. Scene reader is theme-aware (light/dark), unlike chat's fixed skin.
- Reuse the shared `ReaderLaunch`, `WordLookupSheet`, `FinishOverlay` — do not fork them.
- Commit after every green step. DRY, YAGNI, TDD.

---

## File Structure

- **Create** `src/sceneReading.js` — pure helpers: `splitScene(line)` and `stripSceneEmoji(content)`.
- **Create** `src/sceneReading.test.js` — unit tests for both helpers, incl. a readability-parity test.
- **Modify** `src/useStoryReaderCore.js` — add `emoji` to each beat and strip scene emoji before readability, both gated on `story.presentation === 'scene'`.
- **Create** `src/SceneReader.jsx` — the picture-book renderer (consumes `useStoryReaderCore`).
- **Modify** `src/StoryReader.jsx` — dispatch `mode === 'scene'` to `SceneReader`.
- **Modify** `src/Stories.jsx` — `🎬 Scene` badge on the story card.
- **Modify** `tests/fixtures/mockSupabase.js` — add one `presentation:'scene'` fixture story.
- **Modify** `tests/e2e/reader.spec.js` — scene reader e2e.
- **Modify** `data/authored-stories.json` — 3 authored Chinese scene stories.
- **Modify** `src/authoredStories.test.js` — scene author-intent guard + emoji-aware readable-line check.
- **Modify** `ROADMAP.md` — move Illustrated scene stories to ✅ Shipped.

---

## Task 1: `splitScene` + `stripSceneEmoji` pure helpers

**Files:**
- Create: `src/sceneReading.js`
- Test: `src/sceneReading.test.js`

**Interfaces:**
- Produces: `splitScene(line: string) → { emoji: string, text: string }` — pulls a single leading emoji grapheme (plus the one following space) off `line`; `emoji` is `''` when the line does not start with an emoji, and `text` is then the line unchanged. Emoji anywhere but the very front is left in `text`.
- Produces: `stripSceneEmoji(content: string) → string` — applies `splitScene` per line and re-joins, so a whole `content` blob loses its leading per-line emoji (used to keep readability emoji-neutral).

- [ ] **Step 1: Write the failing tests**

Create `src/sceneReading.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { splitScene, stripSceneEmoji } from './sceneReading'
import { calculateStoryReadability } from './storyReading'

describe('splitScene', () => {
  it('strips a leading emoji and the following space', () => {
    expect(splitScene('🌧️ 今天下雨。')).toEqual({ emoji: '🌧️', text: '今天下雨。' })
  })
  it('treats a multi-codepoint ZWJ emoji as one unit', () => {
    expect(splitScene('👨‍👩‍👧 一家人。')).toEqual({ emoji: '👨‍👩‍👧', text: '一家人。' })
  })
  it('treats a skin-tone emoji as one unit', () => {
    expect(splitScene('👋🏽 你好！')).toEqual({ emoji: '👋🏽', text: '你好！' })
  })
  it('returns the line unchanged when it has no leading emoji', () => {
    expect(splitScene('今天下雨。')).toEqual({ emoji: '', text: '今天下雨。' })
  })
  it('does not strip an emoji that is not at the front', () => {
    expect(splitScene('今天🌧️下雨。')).toEqual({ emoji: '', text: '今天🌧️下雨。' })
  })
  it('handles a line that is only an emoji', () => {
    expect(splitScene('🌸')).toEqual({ emoji: '🌸', text: '' })
  })
  it('is safe on empty / nullish input', () => {
    expect(splitScene('')).toEqual({ emoji: '', text: '' })
    expect(splitScene(undefined)).toEqual({ emoji: '', text: '' })
  })
})

describe('stripSceneEmoji', () => {
  it('removes the leading emoji from every line', () => {
    expect(stripSceneEmoji('🌧️ 今天下雨。\n☀️ 明天晴天。')).toBe('今天下雨。\n明天晴天。')
  })
  it('makes emoji prefixes readability-neutral', () => {
    const vocabMap = {
      v1: { id: 'v1', word: '今天', reading: 'jīntiān', meaning: 'today' },
      v2: { id: 'v2', word: '花', reading: 'huā', meaning: 'flower' },
    }
    const withEmoji = '🌧️ 今天。\n🌸 花。'
    const plain = '今天。\n花。'
    const a = calculateStoryReadability({ content: stripSceneEmoji(withEmoji), vocabMap, cards: {}, language: 'chinese' })
    const b = calculateStoryReadability({ content: plain, vocabMap, cards: {}, language: 'chinese' })
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sceneReading.test.js`
Expected: FAIL — `Failed to resolve import './sceneReading'`.

- [ ] **Step 3: Write the implementation**

Create `src/sceneReading.js`:

```js
// Scene-format helpers. A scene story's content lines start with a single emoji
// "illustration" (e.g. "🌧️ 今天下雨。"). splitScene pulls that leading emoji off
// so it can be rendered big and separate, and stripped before tokenization so it
// never counts as vocabulary. Pure — unit-tested.
//
// "Leading emoji" = the first grapheme cluster, if it contains an Extended
// Pictographic codepoint. Grapheme segmentation (Intl.Segmenter) keeps ZWJ
// sequences (👨‍👩‍👧), skin-tone modifiers (👋🏽) and variation selectors (🌧️) as
// one unit. Regional-indicator flags and digit keycaps are not treated as scene
// emoji (not needed for authored content).
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function splitScene(line) {
  if (!line) return { emoji: '', text: line || '' }
  const first = graphemes.segment(line)[Symbol.iterator]().next().value
  const g = first ? first.segment : ''
  if (g && /\p{Extended_Pictographic}/u.test(g)) {
    return { emoji: g, text: line.slice(g.length).replace(/^\s/, '') }
  }
  return { emoji: '', text: line }
}

export function stripSceneEmoji(content) {
  return (content || '').split('\n').map(l => splitScene(l).text).join('\n')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sceneReading.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sceneReading.js src/sceneReading.test.js
git commit -m "feat(reader): splitScene + stripSceneEmoji pure helpers for scene stories"
```

---

## Task 2: Per-beat `emoji` on the shared reader core

**Files:**
- Modify: `src/useStoryReaderCore.js:38-44`
- (Verification only — no new unit test file; the hook is exercised by e2e in Task 3, and Task 1 already proved the emoji-stripping math.)

**Interfaces:**
- Consumes: `splitScene`, `stripSceneEmoji` from `./sceneReading` (Task 1).
- Produces: each entry of the hook's returned `beats` array now also has an `emoji: string` field (`''` for non-scene stories). `readability` is computed over emoji-stripped content for scene stories. No other returned value changes.

- [ ] **Step 1: Add the import**

In `src/useStoryReaderCore.js`, add to the imports near the top (after the `storyReading` import on line 4):

```js
import { splitScene, stripSceneEmoji } from './sceneReading'
```

- [ ] **Step 2: Populate `emoji` on each beat**

Replace the `beats` memo (lines 38-41):

```js
  const beats = useMemo(() => (story.content || '').split('\n').filter(Boolean).map(line => {
    const { speaker, text } = splitSpeaker(line)
    return { speaker, text, tokens: segmentLine(text, matcher, names, particles) }
  }), [story.content, matcher, names, particles])
```

with (adds emoji extraction gated on scene presentation; non-scene stories get `emoji: ''` and identical `text`):

```js
  const isScene = story.presentation === 'scene'
  const beats = useMemo(() => (story.content || '').split('\n').filter(Boolean).map(line => {
    const { emoji, text: body } = isScene ? splitScene(line) : { emoji: '', text: line }
    const { speaker, text } = splitSpeaker(body)
    return { speaker, text, emoji, tokens: segmentLine(text, matcher, names, particles) }
  }), [story.content, isScene, matcher, names, particles])
```

- [ ] **Step 3: Keep readability emoji-neutral**

Replace the `readability` memo (lines 42-44):

```js
  const readability = useMemo(
    () => calculateStoryReadability({ content: story.content, vocabMap, cards: userCards, language: track.language }),
    [story.content, vocabMap, userCards, track.language])
```

with (strips scene emoji before measuring; non-scene content is unchanged):

```js
  const readContent = useMemo(() => (isScene ? stripSceneEmoji(story.content) : story.content), [isScene, story.content])
  const readability = useMemo(
    () => calculateStoryReadability({ content: readContent, vocabMap, cards: userCards, language: track.language }),
    [readContent, vocabMap, userCards, track.language])
```

- [ ] **Step 4: Verify no regression**

Run: `npx vitest run`
Expected: PASS (all existing tests, incl. `src/sceneReading.test.js` from Task 1).

Run: `npm run build`
Expected: `✓ built` with no errors.

Run: `npx playwright test tests/e2e/reader.spec.js`
Expected: all existing reader e2e PASS (paced + chat unaffected by the core change).

- [ ] **Step 5: Commit**

```bash
git add src/useStoryReaderCore.js
git commit -m "feat(reader): per-beat emoji on the shared core (scene stories only), readability stays emoji-neutral"
```

---

## Task 3: `SceneReader` renderer + dispatcher + e2e

**Files:**
- Create: `src/SceneReader.jsx`
- Modify: `src/StoryReader.jsx:4,22`
- Modify: `tests/fixtures/mockSupabase.js` (STORIES array, after `st2`)
- Modify: `tests/e2e/reader.spec.js` (new test at the end of the describe block)

**Interfaces:**
- Consumes: `useStoryReaderCore` (returns `beats` with `.emoji`, `cur`, `total`, `started`, `done`, `playing`, `selected`, `showPy`, `showEn`, `theme`, `reduceMotion`, `readability`, and handlers `start`, `backToStart`, `advance`, `go`, `stopPlay`, `togglePlay`, `selectWord`, `addToDeck`, `speakWord`, `setShowPy`, `setShowEn`, `setSelected`); shared `ReaderLaunch`, `WordLookupSheet`, `FinishOverlay`; `wordStatus` from `./storyReading`; `getLevelLabel` from `./utils`.
- Produces: `export default function SceneReader(props)` — rendered by `StoryReader` when `resolvePresentation(...) === 'scene'`.

- [ ] **Step 1: Write the SceneReader component**

Create `src/SceneReader.jsx`:

```jsx
import { getLevelLabel } from './utils'
import { wordStatus } from './storyReading'
import { useStoryReaderCore } from './useStoryReaderCore'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'

function pinyinLine(tokens) { return tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ') }
function englishLineFor(story, i) { return (story.english_content || '').split('\n').filter(Boolean)[i] || '' }

// Scene-format reader: a picture-book. Each beat is a big centered emoji
// "illustration" above one short line, revealed a tap at a time. Narrative
// (not dialogue); theme-aware. Shares all behavior with the paced/chat readers
// via useStoryReaderCore — only the single-scene stage is bespoke.
export default function SceneReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const levelLabel = getLevelLabel(track.language, track.system, story.level)
  const beat = c.beats[c.cur]

  if (!c.started) {
    return <ReaderLaunch story={story} isRead={isRead} levelLabel={levelLabel} accent={accent} theme={c.theme} readability={c.readability} onStart={c.start} onBack={onBack} />
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px' }}>
        <button onClick={c.backToStart} aria-label="Back to start" style={ghost}><ArrowLeft size={18} color="var(--text-muted)" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{c.cur + 1} / {c.total}</div>
        <div style={{ width: '34px' }} />
      </div>
      <div style={{ height: '4px', background: 'var(--border)', margin: '0 16px', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: accent, width: `${((c.cur + 1) / (c.total || 1)) * 100}%`, transition: c.reduceMotion ? 'none' : 'width .4s ease' }} />
      </div>

      <div onClick={() => { c.stopPlay(); c.advance() }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer', padding: '24px 28px' }}>
        <div style={{ maxWidth: '620px', width: '100%' }}>
          {beat && beat.emoji && (
            <div aria-hidden="true" style={{ fontSize: '72px', lineHeight: 1, marginBottom: '26px' }}>{beat.emoji}</div>
          )}
          {beat && beat.speaker && <div style={{ fontSize: '12.5px', fontWeight: 800, color: accent, marginBottom: '10px' }}>{beat.speaker}</div>}
          {c.showPy && beat && <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>{pinyinLine(beat.tokens)}</div>}
          <div style={{ fontFamily: c.theme.font, fontSize: '30px', lineHeight: 1.6, fontWeight: 500 }}>
            {beat && beat.tokens.map((t, k) => {
              if (!t.vocab) return <span key={k}>{t.text}</span>
              const status = wordStatus(t.vocab.id, userCards)
              return (
                <span key={k} onClick={(e) => { e.stopPropagation(); c.selectWord(t.vocab, status) }}
                  style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px',
                    background: status === 'not_started' ? accent + '1f' : (status === 'learning' ? '#CA8A0422' : 'transparent'),
                    boxShadow: status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none' }}>{t.text}</span>
              )
            })}
          </div>
          {c.showEn && beat && story.english_content && <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '16px' }}>{englishLineFor(story, c.cur)}</div>}
        </div>
      </div>
      <div aria-live="polite" style={srOnly}>{beat ? beat.text : ''}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <Chip on={c.showPy} onClick={() => c.setShowPy(v => !v)} label={track.language === 'chinese' ? 'Pinyin' : 'Reading'} accent={accent} />
          <Chip on={c.showEn} onClick={() => c.setShowEn(v => !v)} label="English" accent={accent} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => { c.stopPlay(); c.go(c.cur - 1) }} disabled={c.cur === 0} aria-label="Previous scene" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
          <button onClick={() => { c.stopPlay(); c.advance() }} aria-label="Next scene" style={navBtn}><ChevronRight size={18} /></button>
        </div>
      </div>

      <WordLookupSheet selected={c.selected} theme={c.theme} accent={accent} userCards={userCards} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} />}
    </div>
  )
}

function Chip({ on, onClick, label, accent }) {
  return (
    <button onClick={onClick} style={{ fontSize: '12px', fontWeight: 700, padding: '7px 13px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid ' + (on ? accent + '73' : 'var(--border)'), background: on ? accent + '14' : 'var(--surface)', color: on ? accent : 'var(--text-muted)' }}>{label}</button>
  )
}
const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const navBtn = { width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
```

- [ ] **Step 2: Wire the dispatcher**

In `src/StoryReader.jsx`, add the import after the `ChatReader` import (line 4):

```js
import SceneReader from './SceneReader'
```

and add the scene branch before the chat branch (line 22 area) so it reads:

```js
  const mode = resolvePresentation(props.story, modePref)
  if (mode === 'scene') return <SceneReader {...props} />
  if (mode === 'chat') return <ChatReader {...props} />
  if (mode === 'paced') return <PacedReader {...props} />
  return <StoryReaderImmersive {...props} />
```

- [ ] **Step 3: Add the e2e fixture**

In `tests/fixtures/mockSupabase.js`, the `STORIES` array ends with `st2` then `}];`. Change the close of `st2` from `}];` to `}, {` and append the scene story, keeping the `}];` terminator:

```js
}, {
  id: 'st3', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 3,
  title: '下雨天', is_published: true, presentation: 'scene', has_audio: false,
  image_path: null,
  english_content: ['The weather is not good today.', 'There are flowers in the park.', 'Friends are very good.'].join('\n'),
  content: ['🌧️ 今天天气不好。', '🌸 公园里有花。', '😊 朋友很好。'].join('\n'),
}];
```

(Vocab `今天`/`天气`/`公园`/`花`/`朋友`/`很`/`好` all resolve against the existing `VOCAB` fixture, so words are tappable.)

- [ ] **Step 4: Write the e2e test**

In `tests/e2e/reader.spec.js`, add this test as the last test inside the `test.describe('Story reader', ...)` block (after the chat test, before the closing `});`):

```js
  test('scene reveal: shows an emoji scene, advances, looks up a word, and finishes', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openStoryByTitle('下雨天');

    await page.getByRole('button', { name: /Start reading/i }).click();
    await expect(page.getByText('1 / 3')).toBeVisible();
    await expect(page.getByText('🌧️')).toBeVisible();                       // emoji illustration
    await expect(page.getByText('今天', { exact: false }).first()).toBeVisible();

    // Tap a vocab word → shared lookup sheet shows its meaning (word span stops
    // propagation, so this does NOT advance the scene).
    await page.getByText('今天', { exact: true }).first().click();
    await expect(page.getByText('today')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('1 / 3')).toBeVisible();

    // Advance to the end with the Next control → shared finish overlay.
    await page.getByRole('button', { name: /Next scene/i }).click();
    await expect(page.getByText('2 / 3')).toBeVisible();
    await page.getByRole('button', { name: /Next scene/i }).click();
    await expect(page.getByText('3 / 3')).toBeVisible();
    await page.getByRole('button', { name: /Next scene/i }).click();
    await expect(page.getByText('You read it')).toBeVisible();
  });
```

- [ ] **Step 5: Run the e2e**

Run: `npm run build && npx playwright test tests/e2e/reader.spec.js`
Expected: all reader e2e PASS, including `scene reveal: …`.

- [ ] **Step 6: Commit**

```bash
git add src/SceneReader.jsx src/StoryReader.jsx tests/fixtures/mockSupabase.js tests/e2e/reader.spec.js
git commit -m "feat(reader): SceneReader picture-book renderer + dispatcher wiring + e2e"
```

---

## Task 4: `🎬 Scene` story-card badge

**Files:**
- Modify: `src/Stories.jsx:164-166`

**Interfaces:**
- Consumes: `story.presentation` on the story-card model (already present).

- [ ] **Step 1: Add the badge**

In `src/Stories.jsx`, immediately after the existing chat badge block (the `{story.presentation === 'chat' && (…)}` at lines 164-166), add:

```jsx
          {story.presentation === 'scene' && (
            <span style={{ marginLeft: '7px', fontSize: '10.5px', fontWeight: 800, color: '#7C5CD0', background: '#7C5CD015', border: '1px solid #7C5CD033', borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap' }}>🎬 Scene</span>
          )}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build`
Expected: `✓ built`.

Run: `npx eslint src/Stories.jsx`
Expected: no NEW errors (a pre-existing `react-hooks/exhaustive-deps` warning at ~line 362 is unrelated).

- [ ] **Step 3: Commit**

```bash
git add src/Stories.jsx
git commit -m "feat(stories): show a Scene badge on scene-format story cards"
```

---

## Task 5: Authored Chinese scene stories + validator adjustments

**Files:**
- Modify: `data/authored-stories.json` (append 3 stories)
- Modify: `src/authoredStories.test.js` (emoji-aware readable-line check + scene author-intent guard)

**Interfaces:**
- Consumes: `splitScene` from `./sceneReading` (Task 1), inside the test file.

- [ ] **Step 1: Append the authored scene stories**

In `data/authored-stories.json`, the array currently ends with the last chat story object then `]`. Change that object's trailing `}` to `},` and append these three objects before the closing `]`. Each line is `emoji + space + text`; `english_content` is line-parallel (same number of lines, plain English):

```json
  {
    "language": "chinese", "system": "hsk_3", "level": 1, "tier": 1, "tier_min_words": 0,
    "presentation": "scene",
    "title": "下雨天",
    "english_summary": "A rainy-day walk in the park, told scene by scene.",
    "content": "🌧️ 今天下雨了。\n🌂 小明拿着雨伞。\n🌳 他去公园走路。\n🐦 树上有小鸟。\n🌸 雨里的花很美。\n😊 小明很开心。",
    "english_content": "It is raining today.\nXiaoming is holding an umbrella.\nHe goes to walk in the park.\nThere are little birds in the tree.\nThe flowers in the rain are beautiful.\nXiaoming is very happy."
  },
  {
    "language": "chinese", "system": "hsk_3", "level": 1, "tier": 1, "tier_min_words": 0,
    "presentation": "scene",
    "title": "我的早上",
    "english_summary": "One quiet morning, one scene at a time.",
    "content": "☀️ 早上七点了。\n🛏️ 小明起床了。\n🪥 他刷牙洗脸。\n🍞 他吃面包喝牛奶。\n🎒 他拿书包上学。\n🚌 他坐公共汽车。",
    "english_content": "It is seven in the morning.\nXiaoming gets out of bed.\nHe brushes his teeth and washes his face.\nHe eats bread and drinks milk.\nHe takes his backpack to school.\nHe rides the bus."
  },
  {
    "language": "chinese", "system": "hsk_3", "level": 2, "tier": 1, "tier_min_words": 0,
    "presentation": "scene",
    "title": "在动物园",
    "english_summary": "An afternoon at the zoo, animal by animal.",
    "content": "🦁 这是一只狮子。\n🐼 那是一只熊猫。\n🐒 猴子在树上玩。\n🐘 大象很大很高。\n🍦 我们吃了冰淇淋。\n📸 妈妈拍了照片。",
    "english_content": "This is a lion.\nThat is a panda.\nThe monkey is playing in the tree.\nThe elephant is very big and tall.\nWe ate ice cream.\nMom took a photo."
  }
```

- [ ] **Step 2: Add the test import**

In `src/authoredStories.test.js`, add `splitScene` to the imports. The existing first import line is:

```js
import { buildVocabMatcher, matchVocabAt, boundaryAfterSkip, splitSpeaker, matchName, JP_PARTICLES } from './storyReading'
```

Add a new import line directly below it:

```js
import { splitScene } from './sceneReading'
```

- [ ] **Step 3: Make the readable-line check emoji-aware**

In `src/authoredStories.test.js`, find the `keeps lines readable (≤ 40 chars)` test:

```js
      it('keeps lines readable (≤ 40 chars)', () => {
        for (const line of lines) {
          expect(splitSpeaker(line).text.length, 'long line: ' + line).toBeLessThanOrEqual(40)
        }
      })
```

Replace it with (strip a scene line's leading emoji before measuring the language text):

```js
      it('keeps lines readable (≤ 40 chars)', () => {
        for (const line of lines) {
          const body = s.presentation === 'scene' ? splitScene(line).text : line
          expect(splitSpeaker(body).text.length, 'long line: ' + line).toBeLessThanOrEqual(40)
        }
      })
```

- [ ] **Step 4: Add the scene author-intent guard**

In `src/authoredStories.test.js`, directly after the `keeps lines readable` test (still inside the `describe(s.title, …)` block), add:

```js
      it('scene stories carry a leading emoji on most lines', () => {
        if (s.presentation !== 'scene') return
        const withEmoji = lines.filter(l => splitScene(l).emoji).length
        expect(withEmoji / lines.length, 'scene lines missing a leading emoji').toBeGreaterThanOrEqual(0.8)
      })
```

- [ ] **Step 5: Run the unit suite**

Run: `npx vitest run`
Expected: PASS. The 3 new scene stories satisfy: line-parallel English (6 content lines = 6 english lines each), language-scoped speaker check (Chinese exempt — the stories are narration-only anyway), ≤40-char lines (emoji-stripped), and the ≥80% emoji-per-line guard (100% here).

- [ ] **Step 6: Commit**

```bash
git add data/authored-stories.json src/authoredStories.test.js
git commit -m "feat(content): authored Chinese scene stories + emoji-aware validators"
```

---

## Task 6: Final verification + roadmap

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Full green sweep**

Run: `npx vitest run`
Expected: all unit tests PASS.

Run: `npm run build`
Expected: `✓ built`.

Run: `npx playwright test`
Expected: all e2e PASS (paced, chat, scene, and the non-reader suites).

Run: `npx eslint src/SceneReader.jsx src/sceneReading.js src/useStoryReaderCore.js src/StoryReader.jsx src/Stories.jsx`
Expected: no errors.

- [ ] **Step 2: Move the roadmap item to Shipped**

In `ROADMAP.md`, remove the in-progress line:

```markdown
- [ ] **Illustrated scene stories** — a picture-led story format, building on the new Paced Reveal + chat readers (new stories authored for each).
```

and add, as the first entry under `## ✅ Shipped` (above the chat line):

```markdown
- [x] **Scene stories** — read a story as a picture-book: each beat is a big emoji illustration above one short line, revealed a tap at a time (with the same read-along audio and tap-a-word lookup as every story)
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): ship scene-format stories"
```

- [ ] **Step 4: Push + merge**

Push the branch, then merge to `main` (the roadmap change must reach `main` for the live Discord sync), matching the Phase 1/2 rollout. Final whole-branch review (opus) before merge.

---

## Self-Review Notes

- **Spec coverage:** dispatcher (T3) · SceneReader presentation incl. launch/words/audio/finish/toggles/a11y (T3) · per-beat emoji + readability-neutral (T2) · `splitScene` (T1) · story-card badge (T4) · authored scene stories with line-parallel English (T5) · e2e fixture + scene e2e (T3) · unit tests for splitScene incl. multi-codepoint (T1) · authoredStories validators (T5) · roadmap (T6). All spec sections map to a task.
- **Type consistency:** `splitScene(line) → { emoji, text }` and `stripSceneEmoji(content) → string` used identically in T1/T2/T5; beat shape `{ speaker, text, emoji, tokens }` consistent between T2 (producer) and T3 (consumer); `englishLineFor`/`pinyinLine` local to SceneReader.
- **No placeholders:** every code step shows complete code; every run step shows the command + expected result.
