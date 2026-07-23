# Word-by-word Read-Along Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a story reads aloud, the word being spoken is spotlit and follows the narration; tapping a word while it plays seeks the audio there; and the four shared story readers gain the speed control they currently lack.

**Architecture:** A new pure module `src/readAlong.js` turns a line's tokens plus the clip's real duration into per-token time spans (Mandarin is ~one character per syllable, and `segmentLine` tokens tile a line exactly). `useStoryReaderCore` owns the `<audio>` element, builds a timeline on `loadedmetadata`, and drives an `activeToken` index from a `requestAnimationFrame` ticker. The four readers receive `activeToken` as a prop and apply one shared style helper. No schema change, no server work, no TTS spend.

**Tech Stack:** React 19, plain JSX (no TypeScript), Vite 8 (OXC parser), vitest, Playwright, IndexedDB via `src/offline.js`.

**Spec:** `docs/superpowers/specs/2026-07-23-word-read-along-design.md`

## Global Constraints

- **No TypeScript.** No type annotations anywhere.
- **No complex regex literals** — the OXC parser breaks on them. Use `indexOf()`, `split()`, `includes()`, and code-point comparisons instead. `src/readAlong.js` must contain **zero** regex literals.
- **All styling is inline style objects.** No Tailwind classes in JSX.
- **No template literals inside JSX style props** where string concatenation works (`'inset 0 -2px 0 ' + accent` not `` `inset 0 -2px 0 ${accent}` ``).
- **No `localStorage` / `sessionStorage`.** Durable prefs go through `prefsGet` / `prefsSet` in `src/offline.js`.
- **No `<form>` tags.** Use `onClick` / `onChange` handlers.
- **`.jsx` files may only export React components** — the repo lints `react-refresh/only-export-components`. Non-component helpers belong in a `.js` module. This is why `spotlightStyle` lives in `readAlong.js`, not `ReadingScaffold.jsx`.
- **Neutral colors use CSS variables** (`var(--text)`, `var(--surface)`, `var(--border)`, `var(--text-muted)`). Accent hex values and `#fff` on accent buttons stay literal.
- **`npm run build` must pass before any commit.**
- **`npx eslint src` must not gain new errors.** The baseline is **2 pre-existing errors** (`Dashboard.jsx` set-state-in-effect, `HowMuchCanYouRead.jsx` unused `useMemo`) — both out of scope, leave them.
- **Branch:** all work happens on `feature/word-read-along`, never directly on `main`.

---

### Task 1: The pure timing module

**Files:**
- Create: `src/readAlong.js`
- Test: `src/readAlong.test.js`

**Interfaces:**
- Consumes: nothing (leaf module, no imports).
- Produces:
  - `buildTimeline(tokens, { durationMs })` → `{ spans: [{start, end}], durationMs, leadInMs }` or `null`
  - `tokenAtTime(timeline, ms)` → token index, or `-1`
  - `startOfToken(timeline, i)` → milliseconds, or `null`
  - `tokenWeight(text)` → `{ syllables, pause }`
  - `spotlightStyle(isActive, hasActive, reduceMotion)` → style object
  - Constants: `LEAD_IN_MS` (60), `TAIL_OUT_MS` (90), `SPEED_RATES` (`[0.6, 0.8, 1]`), `DEFAULT_RATE` (1), `SPOTLIGHT_DIM` (0.45)

`tokens` is the array `segmentLine` returns: `[{ text: '今天', vocab: {...} }, { text: '，', vocab: null }, ...]`. Only `text` is read here.

- [ ] **Step 1: Create the branch and record the test baseline**

```bash
git checkout -b feature/word-read-along
npx vitest run 2>&1 | tail -5
```

Write the passing count down — every later step must keep it at or above that number.

- [ ] **Step 2: Write the failing test**

Create `src/readAlong.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  buildTimeline, tokenAtTime, startOfToken, tokenWeight, spotlightStyle,
  LEAD_IN_MS, TAIL_OUT_MS, SPEED_RATES, SPOTLIGHT_DIM,
} from './readAlong'

const toks = (...texts) => texts.map(t => ({ text: t, vocab: null }))

describe('tokenWeight', () => {
  it('counts one syllable per Han character', () => {
    expect(tokenWeight('今天').syllables).toBe(2)
    expect(tokenWeight('我').syllables).toBe(1)
  })
  it('counts one syllable per kana, but small kana ride the previous mora', () => {
    expect(tokenWeight('たかし').syllables).toBe(3)
    expect(tokenWeight('きょう').syllables).toBe(2)
  })
  it('gives punctuation a pause and no width', () => {
    expect(tokenWeight('，')).toEqual({ syllables: 0, pause: 0.5 })
    expect(tokenWeight('。')).toEqual({ syllables: 0, pause: 1 })
  })
  it('counts one syllable per vowel run for latin and Cyrillic', () => {
    expect(tokenWeight('книга').syllables).toBe(2)
    expect(tokenWeight('hello').syllables).toBe(2)
    expect(tokenWeight('queue').syllables).toBe(2)
  })
  it('never gives a vowel-less alphabetic token zero width', () => {
    expect(tokenWeight('gym').syllables).toBe(1)
  })
})

describe('buildTimeline', () => {
  it('spans lead-in to duration minus tail-out, with no gaps', () => {
    const tl = buildTimeline(toks('今', '天'), { durationMs: 1060 })
    expect(tl.spans).toHaveLength(2)
    expect(tl.spans[0].start).toBe(LEAD_IN_MS)
    expect(tl.spans[1].end).toBeCloseTo(1060 - TAIL_OUT_MS, 6)
    expect(tl.spans[1].start).toBeCloseTo(tl.spans[0].end, 6)
  })
  it('produces strictly increasing, non-overlapping spans', () => {
    const tl = buildTimeline(toks('今天', '，', '我', '很', '好', '。'), { durationMs: 3000 })
    for (let i = 0; i < tl.spans.length; i += 1) {
      expect(tl.spans[i].end).toBeGreaterThan(tl.spans[i].start)
      if (i > 0) expect(tl.spans[i].start).toBeCloseTo(tl.spans[i - 1].end, 6)
    }
  })
  it('gives a punctuation token real width from its pause', () => {
    const tl = buildTimeline(toks('好', '。'), { durationMs: 2000 })
    expect(tl.spans[1].end - tl.spans[1].start).toBeGreaterThan(0)
  })
  it('returns null for input it cannot time', () => {
    expect(buildTimeline([], { durationMs: 2000 })).toBe(null)
    expect(buildTimeline(null, { durationMs: 2000 })).toBe(null)
    expect(buildTimeline(toks('今'), { durationMs: 0 })).toBe(null)
    expect(buildTimeline(toks('今'), { durationMs: NaN })).toBe(null)
    expect(buildTimeline(toks('今'), { durationMs: Infinity })).toBe(null)
    expect(buildTimeline(toks('今'), { durationMs: LEAD_IN_MS + TAIL_OUT_MS })).toBe(null)
  })
  it('returns null when nothing in the line carries time', () => {
    expect(buildTimeline(toks('   '), { durationMs: 2000 })).toBe(null)
  })
})

describe('tokenAtTime', () => {
  const tl = buildTimeline(toks('今', '天', '好'), { durationMs: 3150 })

  it('is -1 during the lead-in silence', () => {
    expect(tokenAtTime(tl, 0)).toBe(-1)
    expect(tokenAtTime(tl, LEAD_IN_MS - 1)).toBe(-1)
  })
  it('lights the token whose span contains the time', () => {
    expect(tokenAtTime(tl, LEAD_IN_MS)).toBe(0)
    expect(tokenAtTime(tl, tl.spans[1].start + 1)).toBe(1)
    expect(tokenAtTime(tl, tl.spans[2].start + 1)).toBe(2)
  })
  it('treats a span boundary as belonging to the later token', () => {
    expect(tokenAtTime(tl, tl.spans[0].end)).toBe(1)
  })
  it('holds the last token lit through the tail-out silence', () => {
    expect(tokenAtTime(tl, 3149)).toBe(2)
    expect(tokenAtTime(tl, 99999)).toBe(2)
  })
  it('is -1 for a missing timeline or a nonsense time', () => {
    expect(tokenAtTime(null, 100)).toBe(-1)
    expect(tokenAtTime(tl, NaN)).toBe(-1)
  })
})

describe('startOfToken', () => {
  const tl = buildTimeline(toks('今', '天'), { durationMs: 2000 })
  it('returns the span start', () => {
    expect(startOfToken(tl, 0)).toBe(LEAD_IN_MS)
    expect(startOfToken(tl, 1)).toBeCloseTo(tl.spans[1].start, 6)
  })
  it('returns null out of range or without a timeline', () => {
    expect(startOfToken(tl, 9)).toBe(null)
    expect(startOfToken(tl, -1)).toBe(null)
    expect(startOfToken(null, 0)).toBe(null)
  })
})

describe('spotlightStyle', () => {
  it('is empty when no token is lit, so a failed timeline never dims a line', () => {
    expect(spotlightStyle(false, false, false)).toEqual({})
    expect(spotlightStyle(true, false, false)).toEqual({})
  })
  it('keeps the spoken word full and quiets the rest', () => {
    expect(spotlightStyle(true, true, false).opacity).toBe(1)
    expect(spotlightStyle(true, true, false).fontWeight).toBe(700)
    expect(spotlightStyle(false, true, false).opacity).toBe(SPOTLIGHT_DIM)
  })
  it('drops the transition under reduced motion', () => {
    expect(spotlightStyle(true, true, true).transition).toBe('none')
  })
})

describe('SPEED_RATES', () => {
  it('offers 1x and defaults to it', () => {
    expect(SPEED_RATES).toContain(1)
    expect(SPEED_RATES[SPEED_RATES.length - 1]).toBe(1)
  })
})

describe('a real HSK story line', () => {
  it('times every token of 今天天气很好，我们去公园。', () => {
    const line = toks('今天', '天气', '很', '好', '，', '我们', '去', '公园', '。')
    const tl = buildTimeline(line, { durationMs: 4000 })
    expect(tl.spans).toHaveLength(line.length)
    // 今天 is two characters, 很 is one — the wider token gets the longer span.
    const w = (i) => tl.spans[i].end - tl.spans[i].start
    expect(w(0)).toBeGreaterThan(w(2))
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/readAlong.test.js`
Expected: FAIL — `Failed to resolve import "./readAlong"`.

- [ ] **Step 4: Write the implementation**

Create `src/readAlong.js`:

```js
// Word-by-word read-along timing.
//
// Story narration is one clip per line, with no word-boundary data. This module
// estimates where each word falls inside that clip, which works because of two
// facts: segmentLine's tokens TILE the line exactly (every character belongs to
// exactly one token, in order), and Mandarin is close to one character per
// syllable. Story lines are short, so accumulated drift stays under a syllable.
//
// Deliberately regex-free: the OXC parser this repo builds with is strict about
// regex literals, so character classification is done with code-point maths.
//
// If exact timings ever arrive (Azure's batch-synthesis API can return word
// boundaries), buildTimeline's return shape is the seam — replace the estimate
// and no reader changes.

// Azure leaves a little silence at each edge of a clip. Absorbing it keeps the
// first word from lighting before it is spoken.
export const LEAD_IN_MS = 60
export const TAIL_OUT_MS = 90

// Offered in the reader settings panel. 1x is last and is the default, so no
// existing learner's audio silently slows.
export const SPEED_RATES = [0.6, 0.8, 1]
export const DEFAULT_RATE = 1

// How far the un-spoken part of the line recedes.
export const SPOTLIGHT_DIM = 0.45

// Punctuation takes time without taking width. Values are in syllables.
const PAUSE_WEIGHTS = {
  '，': 0.5, '、': 0.5, ',': 0.5,
  '：': 0.5, ':': 0.5, '；': 0.5, ';': 0.5,
  '。': 1, '！': 1, '？': 1, '.': 1, '!': 1, '?': 1, '…': 1, '—': 0.5,
}

// Small kana ride on the previous mora rather than adding one of their own.
const SMALL_KANA = 'ぁぃぅぇぉゃゅょっゎァィゥェォャュョッヮ'

const VOWELS = 'aeiouyаеёиоуыэюя'

// One character, one syllable: CJK ideographs (incl. extension A) and kana.
function isSyllabic(ch) {
  const c = ch.codePointAt(0)
  if (c >= 0x3400 && c <= 0x9fff) return true
  if (c >= 0x3040 && c <= 0x30ff) return true
  return false
}

// A regex-free alphabetic test that covers latin and Cyrillic: only letters
// have a different lower and upper case.
function isAlpha(ch) {
  return ch.toLowerCase() !== ch.toUpperCase()
}

function isVowel(ch) {
  return VOWELS.indexOf(ch.toLowerCase()) !== -1
}

// The time one token takes, split into syllables (width) and pause (silence).
// Both are in "syllable units"; buildTimeline converts units to milliseconds.
export function tokenWeight(text) {
  let syllables = 0
  let pause = 0
  let inVowelRun = false
  let sawAlpha = false
  const chars = String(text || '')
  for (const ch of chars) {
    if (isSyllabic(ch)) { syllables += 1; inVowelRun = false; continue }
    if (SMALL_KANA.indexOf(ch) !== -1) { inVowelRun = false; continue }
    const p = PAUSE_WEIGHTS[ch]
    if (p != null) { pause += p; inVowelRun = false; continue }
    if (isAlpha(ch)) {
      sawAlpha = true
      // One syllable per RUN of vowels, so "queue" is two, not four.
      if (isVowel(ch)) {
        if (!inVowelRun) { syllables += 1; inVowelRun = true }
      } else {
        inVowelRun = false
      }
      continue
    }
    inVowelRun = false
  }
  // A vowel-less alphabetic token still takes time to say.
  if (sawAlpha && syllables === 0) syllables = 1
  return { syllables, pause }
}

// tokens → per-token time spans, or null when no honest timeline exists.
// Returning null rather than throwing IS the degradation story: no timeline
// means no highlight, and the reader behaves exactly as it did before.
export function buildTimeline(tokens, { durationMs } = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return null
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null
  const usable = durationMs - LEAD_IN_MS - TAIL_OUT_MS
  if (usable <= 0) return null

  const parts = tokens.map(t => tokenWeight(t && t.text))
  let units = 0
  parts.forEach(p => { units += p.syllables + p.pause })
  if (units <= 0) return null

  const perUnit = usable / units
  const spans = []
  let at = LEAD_IN_MS
  parts.forEach(p => {
    const width = (p.syllables + p.pause) * perUnit
    spans.push({ start: at, end: at + width })
    at += width
  })
  return { spans, durationMs, leadInMs: LEAD_IN_MS }
}

// Which token is sounding at `ms`. -1 during the lead-in; the last token is
// held lit through the tail-out silence, which reads calmer than blinking off
// a beat before the next line starts.
export function tokenAtTime(timeline, ms) {
  if (!timeline || !timeline.spans || timeline.spans.length === 0) return -1
  if (!Number.isFinite(ms)) return -1
  const spans = timeline.spans
  if (ms < spans[0].start) return -1
  for (let i = 0; i < spans.length; i += 1) {
    if (ms < spans[i].end) return i
  }
  return spans.length - 1
}

// Where to seek to start reading from a given word.
export function startOfToken(timeline, i) {
  if (!timeline || !timeline.spans) return null
  const span = timeline.spans[i]
  if (!span) return null
  return span.start
}

// The spotlight: the spoken word stays full and gains weight, the rest of the
// line recedes. Colour is deliberately untouched — the line already spends its
// colour channel on word status (accent = not started, amber = learning), and a
// third colour would turn a calm line into a traffic light.
//
// `hasActive` false returns an EMPTY object, so a line whose timeline could not
// be built is never left greyed out.
export function spotlightStyle(isActive, hasActive, reduceMotion) {
  if (!hasActive) return {}
  return {
    opacity: isActive ? 1 : SPOTLIGHT_DIM,
    fontWeight: isActive ? 700 : undefined,
    transition: reduceMotion ? 'none' : 'opacity .18s ease',
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/readAlong.test.js`
Expected: PASS, all cases green.

- [ ] **Step 6: Verify nothing else broke**

```bash
npx vitest run 2>&1 | tail -5
npx eslint src/readAlong.js src/readAlong.test.js
npm run build
```
Expected: total passing count is the Step 1 baseline plus the new tests; eslint clean; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/readAlong.js src/readAlong.test.js
git commit -m "feat(read-along): pure word-timing module

Estimates per-token time spans from a clip's real duration. segmentLine
tokens tile a line exactly and Mandarin is ~one character per syllable, so
proportional timing lands within a syllable on short story lines. Returns
null whenever no honest timeline exists, which is the whole degradation
story for the readers.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Prefs merge helper

**Files:**
- Modify: `src/offline.js` (add two exports after `prefsGet`, around line 107)
- Test: `src/offline.test.js` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `mergePrefs(saved, patch)` → plain object (pure)
  - `prefsMerge(key, patch)` → `Promise` — read-modify-write into the prefs store

**Why:** `useStoryReaderCore` and `StoryReaderImmersive` both hand-roll `prefsGet(key).then(saved => prefsSet(key, {...saved, field}))`. Task 3 adds a second field to that write. Doing it once, tested, prevents the field-clobbering bug the existing comment in `useStoryReaderCore.js:250-253` warns about.

- [ ] **Step 1: Write the failing test**

Create `src/offline.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { mergePrefs } from './offline'

describe('mergePrefs', () => {
  it('keeps every field it was not asked to change', () => {
    const saved = { furiganaMode: 'always', lens: true, serif: true, showEnglish: true, seenFocusHint: true }
    expect(mergePrefs(saved, { playbackRate: 0.8 })).toEqual({
      furiganaMode: 'always', lens: true, serif: true, showEnglish: true, seenFocusHint: true,
      playbackRate: 0.8,
    })
  })
  it('overwrites only the patched fields', () => {
    expect(mergePrefs({ furiganaMode: 'always', lens: true }, { furiganaMode: 'hidden' }))
      .toEqual({ furiganaMode: 'hidden', lens: true })
  })
  it('treats a missing or non-object saved value as empty', () => {
    expect(mergePrefs(null, { playbackRate: 1 })).toEqual({ playbackRate: 1 })
    expect(mergePrefs(undefined, { playbackRate: 1 })).toEqual({ playbackRate: 1 })
    expect(mergePrefs('nonsense', { playbackRate: 1 })).toEqual({ playbackRate: 1 })
  })
  it('does not mutate the saved object', () => {
    const saved = { lens: true }
    mergePrefs(saved, { playbackRate: 0.6 })
    expect(saved).toEqual({ lens: true })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/offline.test.js`
Expected: FAIL — `mergePrefs is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/offline.js`, immediately after the existing `prefsGet` function (line 104-107), add:

```js
// Patch a prefs object without disturbing fields we were not asked to change.
// Pure and separately tested: the readers share one prefs object, so a careless
// whole-object write is how one reader's setting silently erases another's.
export function mergePrefs(saved, patch) {
  const base = (saved && typeof saved === 'object') ? saved : {}
  return { ...base, ...patch }
}

// Read-modify-write a prefs object. Degrades like every other helper here: if
// IndexedDB is missing, prefsGet resolves null and prefsSet is a no-op.
export function prefsMerge(key, patch) {
  return prefsGet(key).then(saved => prefsSet(key, mergePrefs(saved, patch)))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/offline.test.js`
Expected: PASS, 4 cases.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run 2>&1 | tail -5
npx eslint src/offline.js src/offline.test.js
npm run build
git add src/offline.js src/offline.test.js
git commit -m "feat(offline): tested prefsMerge helper for the shared reader prefs

The readers share one reader:prefs object, so a whole-object write is how
one reader's setting erases another's. Doing the read-modify-write once,
tested, before a second field joins it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: The read-along engine in the core hook

**Files:**
- Modify: `src/useStoryReaderCore.js`

**Interfaces:**
- Consumes: `buildTimeline`, `tokenAtTime`, `startOfToken`, `DEFAULT_RATE`, `SPEED_RATES` from `src/readAlong.js` (Task 1); `prefsMerge` from `src/offline.js` (Task 2).
- Produces, added to the hook's return object:
  - `activeToken` — number, index into `beats[cur].tokens`, `-1` when nothing is lit
  - `seekToToken(i)` → `boolean` — `true` if the audio actually seeked, `false` if there was no timeline. **The readers rely on the false case** to fall back to opening the lookup sheet.
  - `rate` — number, one of `SPEED_RATES`
  - `setRate(r)` — applies immediately to the live element and persists

This task has no unit test of its own: the hook is not currently unit-tested (there is no `useStoryReaderCore.test.js`), and all its new logic is already covered in `readAlong.test.js`. It is verified by the full suite staying green, the build, and the manual pass in Step 8.

- [ ] **Step 1: Add the imports**

In `src/useStoryReaderCore.js`, change line 6 and add a new import after it:

```js
import { prefsGet, prefsSet, prefsMerge } from './offline'
import { buildTimeline, tokenAtTime, startOfToken, DEFAULT_RATE, SPEED_RATES } from './readAlong'
```

- [ ] **Step 2: Add the state and refs**

After the existing `const advanceBlockedRef = useRef(false)` (line 47), add:

```js
  // Read-along: which token of the sounding line is being spoken, and the
  // timeline that decides it. The timeline lives in a ref, not state — it is
  // rebuilt per line from audio metadata and must never trigger a render.
  const [activeToken, setActiveToken] = useState(-1)
  const timelineRef = useRef(null)
  const [rate, setRateState] = useState(DEFAULT_RATE)
  const rateRef = useRef(DEFAULT_RATE)
```

- [ ] **Step 3: Clear the highlight when playback stops**

Replace the existing `stopPlay` callback (lines 73-81) with:

```js
  const stopPlay = useCallback(() => {
    runRef.current += 1
    setPlaying(false)
    // Silences both channels (element and speech synthesis) and clears the
    // shared "who is speaking" registry, so leaving the reader mid-line cannot
    // leave a voice running under the next screen.
    stopAllAudio()
    if (audioElRef.current) audioElRef.current.pause()
    // Drop the spotlight with the sound. Clearing the timeline too means a stale
    // one can never light a word on the next line before its metadata arrives.
    timelineRef.current = null
    setActiveToken(-1)
  }, [])
```

- [ ] **Step 4: Build a timeline for each line as it starts**

In `speakFrom` (lines 116-143), replace the `if (url) { ... }` block with:

```js
    const url = audioForBeat(index)
    if (url) {
      if (!audioElRef.current) audioElRef.current = new Audio()
      const el = audioElRef.current
      // Take the floor before playing: a word lookup or a flashcard clip must
      // not keep speaking underneath the story.
      claimPlayback(el)
      el.onended = nextBeat

      // A new line starts with no timeline — nothing is lit until this clip's
      // own metadata says how long it is.
      timelineRef.current = null
      setActiveToken(-1)
      // playbackRate resets to defaultPlaybackRate whenever a src loads, so
      // both are set.
      el.defaultPlaybackRate = rateRef.current
      el.playbackRate = rateRef.current

      const buildFromEl = () => {
        // Keyed to the run id: a metadata event from a load we have already
        // moved past must not repaint the line now showing.
        if (runId !== runRef.current) return
        el.playbackRate = rateRef.current
        const seconds = el.duration
        if (!Number.isFinite(seconds) || seconds <= 0) return
        timelineRef.current = buildTimeline(beats[index].tokens, { durationMs: seconds * 1000 })
      }
      el.onloadedmetadata = buildFromEl
      el.ondurationchange = buildFromEl
      // A cached blob replayed in place is already loaded, so neither event
      // will fire again — read what is there now.
      buildFromEl()

      playAudioEl(el, url, viaSynth)
      // Warm the next line while this one plays, so read-along does not stutter
      // between beats.
      const upcoming = audioForBeat(index + 1)
      if (upcoming) ensureAudio(upcoming)
    } else viaSynth()
```

- [ ] **Step 5: Drive the highlight from a rAF ticker**

After the `speakWord` function (around line 167), add:

```js
  // The ticker. rAF rather than timeupdate: timeupdate fires roughly 4x a
  // second, which is visibly late on a one-syllable word. The functional
  // setState bails out when the index is unchanged, so 60Hz polling causes a
  // render only when the spotlight actually moves.
  useEffect(() => {
    if (!playing) return undefined
    let raf = 0
    const tick = () => {
      const el = audioElRef.current
      const tl = timelineRef.current
      if (el && tl) {
        const idx = tokenAtTime(tl, el.currentTime * 1000)
        setActiveToken(prev => (prev === idx ? prev : idx))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // Start reading from a given word of the line now sounding. Returns false
  // when there is no timeline (browser-speech fallback, or metadata not in
  // yet) so a caller can fall back to opening the lookup sheet instead.
  const seekToToken = useCallback((i) => {
    const el = audioElRef.current
    const tl = timelineRef.current
    if (!el || !tl) return false
    const start = startOfToken(tl, i)
    if (start == null) return false
    try { el.currentTime = start / 1000 } catch { return false }
    setActiveToken(i)
    return true
  }, [])

  const pickRate = useCallback((next) => {
    if (SPEED_RATES.indexOf(next) === -1) return
    rateRef.current = next
    setRateState(next)
    const el = audioElRef.current
    if (el) { el.defaultPlaybackRate = next; el.playbackRate = next }
  }, [])
```

- [ ] **Step 6: Load and persist the speed alongside the reading mode**

Replace the prefs load effect (lines 240-248) with:

```js
  useEffect(() => {
    let active = true
    prefsGet(READER_PREFS_KEY).then((saved) => {
      if (!active || pickedRef.current) return
      if (saved && saved.furiganaMode) setReadingMode(normalizeReadingMode(saved.furiganaMode))
      if (saved && SPEED_RATES.indexOf(saved.playbackRate) !== -1) {
        setRateState(saved.playbackRate)
        rateRef.current = saved.playbackRate
      }
    })
    return () => { active = false }
  }, [])
```

Replace the persist effect (lines 253-258) with:

```js
  useEffect(() => {
    if (firstSaveRef.current) { firstSaveRef.current = false; return }
    prefsMerge(READER_PREFS_KEY, { furiganaMode: readingMode, playbackRate: rate })
  }, [readingMode, rate])
```

`prefsSet` is now unused in this file if nothing else calls it — check with `grep -n "prefsSet" src/useStoryReaderCore.js` and drop it from the import on line 6 if there are no remaining uses, or eslint will flag it.

- [ ] **Step 7: Export the new API**

In the return object (lines 279-286), change the state line and the handlers line:

```js
    started, cur, done, playing, selected, readingMode, showEn, activeToken, rate,
    setReadingMode: pickReadingMode, setShowEn, setSelected, setRate: pickRate,
    go, advance, finish, stopPlay, togglePlay, speakWord, replayLine, selectWord, addToDeck,
    seekToToken,
```

- [ ] **Step 8: Verify**

```bash
npx vitest run 2>&1 | tail -5
npx eslint src/useStoryReaderCore.js
npm run build
```
Expected: suite still at the Task 2 count; eslint clean on this file; build green.

Then `npm run dev`, open a Chinese story in the paced reader and press Play. **Nothing visible changes yet** — no reader consumes `activeToken` until Task 5. Confirm only that audio still plays line to line exactly as before, and that the browser console is clean.

- [ ] **Step 9: Commit**

```bash
git add src/useStoryReaderCore.js
git commit -m "feat(read-along): timeline, rAF ticker and seek in the reader core

Builds a per-line timeline from the clip's real duration on loadedmetadata
(keyed to the run id so a stale load cannot repaint a newer line), drives an
activeToken index from requestAnimationFrame, and adds seekToToken plus a
persisted playback rate. No reader consumes these yet.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: The speed control in the reader settings panel

**Files:**
- Modify: `src/ReadingScaffold.jsx`

**Interfaces:**
- Consumes: `SPEED_RATES` from `src/readAlong.js` (Task 1).
- Produces: `ReadingSettings` accepts two new optional props, `rate` (number) and `setRate` (function). When `setRate` is absent the Speed row does not render, so any caller that has not been updated is unaffected.

- [ ] **Step 1: Import the rates**

In `src/ReadingScaffold.jsx`, add after line 2:

```js
import { SPEED_RATES } from './readAlong'
```

- [ ] **Step 2: Accept the new props**

Change the `ReadingSettings` signature (line 58) to:

```js
export function ReadingSettings({ mode, setMode, showEnglish, setShowEnglish, hasEnglish, language, accent, onOpenChange, compact = false, placement = 'top', tint, rate, setRate }) {
```

- [ ] **Step 3: Render the Speed row**

Inside `panel`, between the mode-hint `<div>` (which ends on line 131) and the `{hasEnglish && (` block (line 132), insert:

```js
      {setRate && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em', marginBottom: '8px' }}>Speed</div>
          <div role="group" aria-label="Playback speed" style={{ display: 'flex', gap: '6px' }}>
            {SPEED_RATES.map((value) => {
              const on = rate === value
              return (
                <button
                  key={value}
                  onClick={() => setRate(value)}
                  aria-pressed={on}
                  style={{
                    flex: '1 1 auto', fontSize: '12px', fontWeight: 700, padding: '8px 10px',
                    borderRadius: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    border: '1px solid ' + (on ? accent + '73' : 'var(--border)'),
                    background: on ? accent + '14' : 'var(--surface)',
                    color: on ? accent : 'var(--text-muted)',
                  }}
                >{value}×</button>
              )
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verify**

```bash
npx vitest run 2>&1 | tail -5
npx eslint src/ReadingScaffold.jsx
npm run build
```
Expected: suite unchanged; **eslint clean — in particular no `react-refresh/only-export-components` error**, because the only new import is a value used inside a component and nothing non-component is exported from this `.jsx` file.

- [ ] **Step 5: Commit**

```bash
git add src/ReadingScaffold.jsx
git commit -m "feat(read-along): speed control in the shared reader settings panel

0.6x / 0.8x / 1x, defaulting to 1x. Renders only when a caller passes
setRate, so an un-updated caller is unaffected.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire the paced and scene readers

**Files:**
- Modify: `src/PacedReader.jsx`
- Modify: `src/SceneReader.jsx`

**Interfaces:**
- Consumes: `spotlightStyle` from `src/readAlong.js` (Task 1); `activeToken`, `seekToToken`, `rate`, `setRate` from the core hook (Task 3); the `rate` / `setRate` props on `ReadingSettings` (Task 4).
- Produces: nothing consumed by later tasks.

Both readers show one beat at a time, so the spotlight always targets the current beat and the "earlier bubbles" question does not arise.

- [ ] **Step 1: PacedReader — import and derive**

In `src/PacedReader.jsx`, add after line 3:

```js
import { spotlightStyle } from './readAlong'
```

After `const reserve = c.readingMode !== 'hidden'` (line 32), add:

```js
  // The spotlight only engages while a line is actually sounding AND its
  // timeline resolved — otherwise every word stays at full opacity.
  const hasActive = c.playing && c.activeToken >= 0
```

- [ ] **Step 2: PacedReader — spotlight both plain runs and words**

Replace the plain-run branch (lines 83-85) with:

```js
                    if (!t.vocab) {
                      return (
                        <span key={k} style={i === c.cur ? spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion) : undefined}>
                          <TokenBody text={t.text} reading={null} mode={c.readingMode} status="not_started" language={track.language} reserve={reserve} />
                        </span>
                      )
                    }
```

Replace the vocab-word `<span>` (lines 89-98) with:

```js
                      <span key={k}
                        onClick={i === c.cur ? (e) => {
                          e.stopPropagation()
                          // While the line is sounding, a tap means "read from
                          // here". seekToToken reports false when there is no
                          // timeline, and then a tap means what it always did.
                          if (c.playing && c.seekToToken(k)) return
                          c.selectWord(t.vocab, status)
                        } : undefined}
                        style={{
                          cursor: i === c.cur ? 'pointer' : 'inherit', borderRadius: '4px', padding: '0 1px',
                          background: decorate && status === 'not_started' ? accent + '1f' : (decorate && status === 'learning' ? '#CA8A0422' : 'transparent'),
                          boxShadow: decorate && status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none',
                          ...(i === c.cur ? spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion) : null),
                        }}>
                        <TokenBody text={t.text} reading={t.vocab.reading} mode={c.readingMode} status={status} language={track.language} reserve={reserve} />
                      </span>
```

- [ ] **Step 3: PacedReader — pass the speed props**

Replace the `<ReadingSettings ... />` element (lines 111-116) with:

```js
          <ReadingSettings
            mode={c.readingMode} setMode={c.setReadingMode}
            showEnglish={c.showEn} setShowEnglish={c.setShowEn}
            hasEnglish={Boolean(story.english_content)}
            language={track.language} accent={accent} onOpenChange={onSettingsOpen}
            rate={c.rate} setRate={c.setRate}
          />
```

- [ ] **Step 4: SceneReader — the same three changes**

In `src/SceneReader.jsx`, add after line 3:

```js
import { spotlightStyle } from './readAlong'
```

After `const reserve = c.readingMode !== 'hidden'` (line 24), add:

```js
  const hasActive = c.playing && c.activeToken >= 0
```

Replace the plain-run branch (lines 59-61) with:

```js
              if (!t.vocab) {
                return (
                  <span key={k} style={spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion)}>
                    <TokenBody text={t.text} reading={null} mode={c.readingMode} status="not_started" language={track.language} reserve={reserve} />
                  </span>
                )
              }
```

Replace the vocab-word `<span>` (lines 64-69) with:

```js
                <span key={k} onClick={(e) => {
                  e.stopPropagation()
                  if (c.playing && c.seekToToken(k)) return
                  c.selectWord(t.vocab, status)
                }}
                  style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px',
                    background: status === 'not_started' ? accent + '1f' : (status === 'learning' ? '#CA8A0422' : 'transparent'),
                    boxShadow: status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none',
                    ...spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion) }}>
                  <TokenBody text={t.text} reading={t.vocab.reading} mode={c.readingMode} status={status} language={track.language} reserve={reserve} />
                </span>
```

Replace the `<ReadingSettings ... />` element (lines 80-85) with:

```js
          <ReadingSettings
            mode={c.readingMode} setMode={c.setReadingMode}
            showEnglish={c.showEn} setShowEnglish={c.setShowEn}
            hasEnglish={Boolean(story.english_content)}
            language={track.language} accent={accent} onOpenChange={onSettingsOpen}
            rate={c.rate} setRate={c.setRate}
          />
```

- [ ] **Step 5: Verify by hand — this is the first task with visible behaviour**

```bash
npx vitest run 2>&1 | tail -5
npx eslint src/PacedReader.jsx src/SceneReader.jsx
npm run build
npm run dev
```

Open a Chinese story with generated narration and check all six:
1. Press Play — the spoken word is lit and the rest of the line is quiet; the spotlight moves across the line roughly in time with the voice.
2. It advances to the next line and starts again from that line's first word.
3. Press Pause — every word returns to full opacity, nothing stays dim.
4. While playing, tap a word later in the line — the audio jumps there and keeps reading; the lookup sheet does **not** open.
5. While paused, tap a word — the lookup sheet opens, exactly as before.
6. Open Reader settings, pick 0.6× — the voice slows, the spotlight stays in step (it reads `currentTime`, so rate needs no timeline change). Reload the page, reopen the story: 0.6× is still selected.

Also open a story with **no** generated narration (browser-speech fallback) and confirm no word ever dims.

- [ ] **Step 6: Commit**

```bash
git add src/PacedReader.jsx src/SceneReader.jsx
git commit -m "feat(read-along): spotlight, tap-to-seek and speed in paced + scene

The spoken word stays full while the rest of the line recedes; tapping a
word while the line sounds seeks there, and still opens the lookup sheet
when paused or when no timeline resolved.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Wire the two chat readers

**Files:**
- Modify: `src/ChatThread.jsx`
- Modify: `src/ChatReader.jsx`
- Modify: `src/InteractiveChatReader.jsx`

**Interfaces:**
- Consumes: `spotlightStyle` from `src/readAlong.js` (Task 1); `activeToken`, `seekToToken`, `playing`, `rate`, `setRate` from the core hook (Task 3).
- Produces: `ChatThread` accepts three new props — `activeToken` (number), `onSeekToken` (function returning boolean), `playing` (boolean). All optional; omitting them is exactly today's behaviour.

The chat readers are the only ones that keep earlier beats on screen. Spotlight and seek apply **only to the bubble at `activeIndex`** — a tap on an earlier bubble stays a lookup, because there it unambiguously means "what does that mean".

- [ ] **Step 1: ChatThread — import and accept the props**

In `src/ChatThread.jsx`, add after line 3:

```js
import { spotlightStyle } from './readAlong'
```

Change the signature (line 9) to:

```js
export default function ChatThread({ revealed, sides, skin, theme, accent, userCards, readingMode, language, activeIndex, typingBeat, reduceMotion, onSelectWord, activeToken = -1, onSeekToken, playing = false }) {
```

- [ ] **Step 2: ChatThread — spotlight and seek inside the active bubble only**

Inside `bubble`, immediately after the `const rtColor = ...` line (line 22), add:

```js
    // Only the bubble now sounding takes the spotlight; earlier bubbles stay
    // fully legible so re-reading the conversation is never dimmed.
    const isSounding = playing && !muted && key === activeIndex && activeToken >= 0
```

Replace the plain-run branch (lines 33-35) with:

```js
                  if (!t.vocab) {
                    return (
                      <span key={k} style={spotlightStyle(k === activeToken, isSounding, reduceMotion)}>
                        <TokenBody text={t.text} reading={null} mode={readingMode} status="not_started" language={language} reserve={reserve} rtColor={rtColor} />
                      </span>
                    )
                  }
```

Replace the vocab-word `<span>` (lines 37-42) with:

```js
                    <span key={k} onClick={(e) => {
                      e.stopPropagation()
                      // Seek only inside the bubble being read; a tap on an
                      // earlier bubble is a lookup, never a rewind.
                      if (isSounding && onSeekToken && onSeekToken(k)) return
                      onSelectWord(t.vocab, status)
                    }}
                      style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px',
                        background: status === 'not_started' ? accent + '22' : (status === 'learning' ? '#CA8A0426' : 'transparent'),
                        ...spotlightStyle(k === activeToken, isSounding, reduceMotion) }}>
                      <TokenBody text={t.text} reading={t.vocab.reading} mode={readingMode} status={status} language={language} reserve={reserve} rtColor={rtColor} />
                    </span>
```

- [ ] **Step 3: ChatReader — pass the props through**

In `src/ChatReader.jsx`, replace the `<ChatThread ... />` element (line 78) with:

```js
        <ChatThread revealed={revealed} sides={sides} skin={skin} theme={c.theme} accent={accent} userCards={userCards} readingMode={c.readingMode} language={track.language} activeIndex={c.cur} typingBeat={typing ? pending : null} reduceMotion={c.reduceMotion} onSelectWord={c.selectWord} activeToken={c.activeToken} onSeekToken={c.seekToToken} playing={c.playing} />
```

Replace the `<ReadingSettings ... />` element (lines 68-73) with:

```js
        <ReadingSettings
          mode={c.readingMode} setMode={c.setReadingMode}
          showEnglish={false} setShowEnglish={null} hasEnglish={false}
          language={track.language} accent={accent} onOpenChange={onSettingsOpen}
          compact placement="bottom" tint={CHAT_TINT}
          rate={c.rate} setRate={c.setRate}
        />
```

- [ ] **Step 4: InteractiveChatReader — the same two changes**

In `src/InteractiveChatReader.jsx`, replace the `<ChatThread ... />` element (line 107) with:

```js
        <ChatThread revealed={revealed} sides={sides} skin={skin} theme={c.theme} accent={accent} userCards={userCards} readingMode={c.readingMode} language={track.language} activeIndex={c.cur} typingBeat={null} reduceMotion={c.reduceMotion} onSelectWord={c.selectWord} activeToken={c.activeToken} onSeekToken={c.seekToToken} playing={c.playing} />
```

Replace its `<ReadingSettings ... />` element (lines 97-102) with:

```js
        <ReadingSettings
          mode={c.readingMode} setMode={c.setReadingMode}
          showEnglish={false} setShowEnglish={null} hasEnglish={false}
          language={track.language} accent={accent} onOpenChange={onSettingsOpen}
          compact placement="bottom" tint={CHAT_TINT}
          rate={c.rate} setRate={c.setRate}
        />
```

- [ ] **Step 5: Verify**

```bash
npx vitest run 2>&1 | tail -5
npx eslint src/ChatThread.jsx src/ChatReader.jsx src/InteractiveChatReader.jsx
npm run build
npm run dev
```

Open a **chat-format** Chinese story (the `st2` fixture shape — `presentation: 'chat'`) and check:
1. Press Play — only the newest bubble spotlights; earlier bubbles stay at full opacity.
2. Tapping a word in an **earlier** bubble while playing opens the lookup sheet (it does not seek).
3. Tapping a word in the **sounding** bubble while playing seeks there.
4. The Reader button in the header now offers Speed, and the choice persists across a reload.

Then open an **interactive** chat story and confirm the reply gate still works unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/ChatThread.jsx src/ChatReader.jsx src/InteractiveChatReader.jsx
git commit -m "feat(read-along): spotlight, tap-to-seek and speed in both chat readers

Applied to the sounding bubble only — a tap on an earlier bubble stays a
lookup, since there it unambiguously means 'what does that mean'.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end coverage and final verification

**Files:**
- Modify: `tests/e2e/reader.spec.js`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: nothing.

- [ ] **Step 1: Decide the audio question before writing anything**

The e2e mock has no audio fixture, so a clip may never load under Playwright. Find out first:

```bash
grep -rn "audio\|\.mp3" tests/fixtures/mockSupabase.js | head -20
```

- If clips **do** load, write all three tests in Step 2.
- If they **do not**, write only tests A and B in Step 2 — neither needs audio — and add a comment in the spec file recording that the moving-highlight assertion stays at unit level. Do **not** fake an audio element to force the third through; the unit tests already prove the timing, and a fake would assert only that the fake works.

- [ ] **Step 2: Add the tests**

Append inside the existing `test.describe('Story reader', ...)` block in `tests/e2e/reader.spec.js`.

Test A — the speed control (no audio needed):

```js
  test('paced reveal: the reader settings panel offers a speed control', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();

    await page.getByRole('button', { name: /Reader settings/i }).click();
    const speeds = page.getByRole('group', { name: /Playback speed/i });
    await expect(speeds).toBeVisible();

    // 1x is the default so nobody's audio silently slows.
    await expect(speeds.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');

    await speeds.getByRole('button', { name: '0.6×' }).click();
    await expect(speeds.getByRole('button', { name: '0.6×' })).toHaveAttribute('aria-pressed', 'true');
    await expect(speeds.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'false');
  });
```

Test B — the paused tap is unchanged (no audio needed):

```js
  test('paced reveal: tapping a word while paused still opens the lookup sheet', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();

    // Not playing, so the tap must mean "what does that mean", unchanged.
    await page.getByText('今天', { exact: false }).first().click();
    await expect(page.getByRole('button', { name: /Add to deck/i })).toBeVisible();
  });
```

Test C — the moving spotlight (**only if Step 1 found that clips load**):

```js
  test('paced reveal: the spoken word is spotlit while reading', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();
    await page.getByRole('button', { name: /^Play$/i }).click();

    // Some word in the line recedes while another stays full.
    const dimmed = page.locator('[style*="opacity: 0.45"]');
    await expect(dimmed.first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /^Pause$/i }).click();
    await expect(dimmed).toHaveCount(0);
  });
```

The "Add to deck" locator matches `src/WordLookupSheet.jsx:28`, which renders `aria-label="Add to deck"` — verified, no adjustment needed.

- [ ] **Step 3: Run the reader spec**

Run: `npx playwright test tests/e2e/reader.spec.js`
Expected: PASS, including the pre-existing reader tests.

- [ ] **Step 4: Full verification**

```bash
npx vitest run 2>&1 | tail -5
npx playwright test 2>&1 | tail -5
npx eslint src 2>&1 | tail -5
npm run build
```
Expected: unit suite at the Task 1 baseline plus the new tests; the full Playwright suite green; `eslint src` at **exactly the 2 pre-existing errors**, no more; build clean.

- [ ] **Step 5: Move the roadmap item to Shipped**

In `ROADMAP.md`, delete this line from `## 🚧 Now — in progress`:

```
- [ ] Word-by-word read-along: each word lights up as it's spoken, tap any word while a story is reading to jump the audio there, plus a speed control (0.6x / 0.8x / 1x) in every guided story format
```

and add this as the first line under `## ✅ Shipped`:

```
- [x] **Word-by-word read-along** — the word being spoken lights up and the rest of the line quiets, so you never lose your place mid-sentence. Tap any word while a story is reading to jump the audio there, and pick a reading speed (0.6x / 0.8x / 1x) in every guided story format.
```

Use `:` and `()` separators inside the copy, never a second ` — `: the Discord renderer strips from ` — ` onward, so only the text before the first one survives.

- [ ] **Step 6: Commit and open the PR**

```bash
git add tests/e2e/reader.spec.js ROADMAP.md
git commit -m "test(read-along): e2e coverage + roadmap to Shipped

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push -u origin feature/word-read-along
```

Then open a PR titled **"Word-by-word read-along in the guided story readers"** — the title is posted to `#announcements` on merge, so it must read as a product change, not a task id.

---

## Manual acceptance (before merge)

The estimate's quality cannot be proved by a test — only by ear.

- [ ] A real Chinese story in the **paced** reader, on desktop: does the spotlight land on the word being said, or is it visibly ahead or behind by the end of a long line?
- [ ] The same story on a **phone**, where the tap target matters most.
- [ ] A **chat** story and a **scene** story.
- [ ] A story with **no generated narration** — confirm nothing dims and behaviour is unchanged.
- [ ] 0.6× on a long line — drift is most visible when slowed.

If drift is consistently in one direction, tune `LEAD_IN_MS` / `TAIL_OUT_MS` in `src/readAlong.js`; those constants exist for exactly this. If drift is erratic within a line, that is the signal that Phase 2 (real Azure word boundaries, documented in the spec) is needed rather than more tuning.
