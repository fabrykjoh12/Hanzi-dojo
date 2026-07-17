# Interactive Chat Stories (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive chat stories — a `presentation:'chat'` story the learner replies inside, choosing the right response (retry-until-right) to keep a linear conversation going.

**Architecture:** A new `InteractiveChatReader` consumes the shared `useStoryReaderCore` and a newly-extracted shared `ChatThread` (also used by the Phase 2 observer `ChatReader`, so the two never drift). Reply options come from a pure `buildReplyOptions` helper; the correct answer is the beat's own `content` text, and distractors live in a new nullable `stories.interactions` JSONB column. The dispatcher routes a chat story with `interactions` to the interactive reader.

**Tech Stack:** React 19 (function components, hooks, inline styles keyed off `src/index.css` CSS variables), Vitest (node env, pure logic only), Playwright e2e over the mock Supabase backend, Supabase SQL migration, Vite 8.

## Global Constraints

- No new `presentation` value — interactive = a `presentation:'chat'` story that carries `interactions`. `resolvePresentation` is unchanged.
- The `ChatThread` extraction MUST preserve the observer `ChatReader` behavior exactly (its Phase 2 e2e is the safety net): speaker-sided bubbles, centered narration, per-word tap lookup, `typing…` shimmer, auto-scroll (honoring `prefers-reduced-motion`).
- Reply flow is **retry-until-right**: a wrong pick gives a hint and lets the learner try again; the correct pick becomes their bubble and the chat continues. Linear only — no branching.
- The `you` speaker's bubbles render on the **right**; everyone else on the left.
- Reuse the shared `ReaderLaunch`, `WordLookupSheet`, `FinishOverlay`. `FinishOverlay` gains one OPTIONAL `note` prop; paced/chat/scene pass nothing and are unchanged.
- Inline styles only; the chat readers use the fixed `chatStyleFor(language)` skin (intentionally not theme-token-based, matching Phase 2). Commit after every green step. DRY, YAGNI, TDD.

---

## File Structure

- **Create** `src/interactiveChat.js` — pure `buildReplyOptions(correctText, correctPinyin, distractors, seed)`.
- **Create** `src/interactiveChat.test.js` — unit tests.
- **Create** `src/ChatThread.jsx` — shared bubble-thread (extracted from `ChatReader`).
- **Modify** `src/ChatReader.jsx` — consume `ChatThread` (behavior unchanged).
- **Create** `src/InteractiveChatReader.jsx` — the interactive reader.
- **Modify** `src/StoryReader.jsx` — route chat stories with `interactions`.
- **Modify** `src/FinishOverlay.jsx` — optional `note` line.
- **Create** `supabase/migrations/20260717130000_story_interactions.sql` — the column.
- **Modify** `src/Stories.jsx` — `🗨️ Reply` badge.
- **Modify** `tests/fixtures/mockSupabase.js` — an interactive chat fixture.
- **Modify** `tests/e2e/reader.spec.js` — interactive e2e.
- **Modify** `data/authored-stories.json` — ~2 authored interactive stories.
- **Modify** `authored-stories.mjs` — pass `interactions` through on insert.
- **Modify** `src/authoredStories.test.js` — validate authored `interactions`.
- **Modify** `ROADMAP.md` — ship the feature.

---

## Task 1: `buildReplyOptions` pure helper

**Files:**
- Create: `src/interactiveChat.js`
- Test: `src/interactiveChat.test.js`

**Interfaces:**
- Produces: `buildReplyOptions(correctText: string, correctPinyin: string, distractors: Array<{text,pinyin}>, seed: number) → { options: Array<{text, pinyin, correct: boolean}>, correctIndex: number }` — merges the correct reply with its distractors into a stable, seed-shuffled list; `correctIndex` is where the correct one landed.

- [ ] **Step 1: Write the failing test**

Create `src/interactiveChat.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildReplyOptions } from './interactiveChat'

const distractors = [{ text: '我不是学生。', pinyin: 'a' }, { text: '再见。', pinyin: 'b' }]

describe('buildReplyOptions', () => {
  it('includes the correct option flagged, plus every distractor', () => {
    const { options, correctIndex } = buildReplyOptions('好，一起去吧！', 'Hǎo', distractors, 3)
    expect(options).toHaveLength(3)
    expect(options.filter(o => o.correct)).toHaveLength(1)
    expect(options[correctIndex]).toMatchObject({ text: '好，一起去吧！', correct: true })
    expect(options.map(o => o.text).sort()).toEqual(['再见。', '好，一起去吧！', '我不是学生。'].sort())
  })
  it('is a stable shuffle for a given seed and varies across seeds', () => {
    const a = buildReplyOptions('好', 'h', distractors, 3).options.map(o => o.text)
    const b = buildReplyOptions('好', 'h', distractors, 3).options.map(o => o.text)
    const c = buildReplyOptions('好', 'h', distractors, 4).options.map(o => o.text)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)   // seed 3 vs 4 orders differently for this set
  })
  it('carries pinyin through and handles no distractors', () => {
    const { options, correctIndex } = buildReplyOptions('好', 'Hǎo', [], 1)
    expect(options).toEqual([{ text: '好', pinyin: 'Hǎo', correct: true }])
    expect(correctIndex).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/interactiveChat.test.js`
Expected: FAIL — `Failed to resolve import './interactiveChat'`.

- [ ] **Step 3: Write the implementation**

Create `src/interactiveChat.js`:

```js
// Reply options for an interactive chat turn: the correct reply (the beat's own
// content text) plus its distractors, in a deterministic seed-shuffle so a
// re-render never reshuffles mid-attempt. Pure — unit-tested.
//
// Stable shuffle: a small LCG seeded by `seed` drives a Fisher–Yates pass, so
// the order is fixed per (option-set, seed) and Math.random is never used.
function shuffleStable(arr, seed) {
  const out = arr.slice()
  let s = (seed * 2654435761) >>> 0 || 1
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) >>> 0
    const j = s % (i + 1)
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp
  }
  return out
}

export function buildReplyOptions(correctText, correctPinyin, distractors, seed) {
  const all = [
    { text: correctText, pinyin: correctPinyin || '', correct: true },
    ...(distractors || []).map(d => ({ text: d.text, pinyin: d.pinyin || '', correct: false })),
  ]
  const options = shuffleStable(all, seed)
  return { options, correctIndex: options.findIndex(o => o.correct) }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/interactiveChat.test.js`
Expected: PASS (3 tests). If the seed-3-vs-4 ordering assertion is flaky for the chosen constants, keep the constants above — they produce different orders for a 3-element set at seeds 3 and 4.

- [ ] **Step 5: Commit**

```bash
git add src/interactiveChat.js src/interactiveChat.test.js
git commit -m "feat(reader): buildReplyOptions pure helper for interactive chat replies"
```

---

## Task 2: Extract the shared `ChatThread`

**Files:**
- Create: `src/ChatThread.jsx`
- Modify: `src/ChatReader.jsx`

**Interfaces:**
- Produces: `ChatThread({ revealed, sides, skin, theme, accent, userCards, showPy, activeIndex, typingBeat, reduceMotion, onSelectWord })` — renders the revealed beats as speaker-sided bubbles + centered narration, an optional `typingBeat` shimmer bubble, and auto-scrolls to the end. `sides` maps `speaker → { side, color }`. `activeIndex` gets the highlight outline. `onSelectWord(vocab, status)` fires on a word tap.
- Consumes (in ChatReader): unchanged `useStoryReaderCore` API.

- [ ] **Step 1: Write the ChatThread component**

Create `src/ChatThread.jsx`:

```jsx
import { useRef, useEffect } from 'react'
import { wordStatus } from './storyReading'

// Shared bubble-thread for the chat readers (observer + interactive). The caller
// decides which beats are revealed, each speaker's side/color, the active
// (outlined) index, and whether a "typing…" bubble trails the thread — so the two
// readers render an identical thread without duplicating it.
export default function ChatThread({ revealed, sides, skin, theme, accent, userCards, showPy, activeIndex, typingBeat, reduceMotion, onSelectWord }) {
  const endRef = useRef(null)
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' })
  }, [revealed.length, typingBeat, reduceMotion])

  const bubble = (b, key, muted) => {
    const meta = sides[b.speaker] || { side: 'left', color: accent }
    return (
      <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: meta.side === 'right' ? 'flex-end' : 'flex-start' }}>
        <div style={{ fontSize: '11.5px', fontWeight: 700, color: meta.color, margin: '0 8px 3px', fontFamily: theme.font }}>{b.speaker}</div>
        <div style={{ maxWidth: '82%', background: meta.side === 'right' ? skin.myBubble : skin.theirBubble, color: meta.side === 'right' ? skin.myText : (muted ? '#888' : '#111'), border: meta.side === 'right' ? 'none' : '1px solid rgba(0,0,0,0.06)', borderRadius: '16px', padding: '9px 13px', boxShadow: '0 1px 2px rgba(0,0,0,0.07)', outline: (!muted && key === activeIndex) ? '2px solid ' + meta.color + '44' : 'none' }}>
          {muted ? <div style={{ fontSize: '14px' }}>typing…</div> : (
            <>
              {showPy && <div style={{ fontSize: '11.5px', opacity: 0.6, marginBottom: '3px', lineHeight: 1.4 }}>{b.tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ')}</div>}
              <div style={{ fontSize: '19px', lineHeight: 1.55, fontFamily: theme.font }}>
                {b.tokens.map((t, k) => {
                  if (!t.vocab) return <span key={k}>{t.text}</span>
                  const status = wordStatus(t.vocab.id, userCards)
                  return (
                    <span key={k} onClick={(e) => { e.stopPropagation(); onSelectWord(t.vocab, status) }}
                      style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px', background: status === 'not_started' ? accent + '22' : (status === 'learning' ? '#CA8A0426' : 'transparent') }}>{t.text}</span>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '620px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {revealed.map((b, i) => (
        b.speaker
          ? bubble(b, i, false)
          : <div key={i} style={{ textAlign: 'center', fontSize: '12.5px', color: '#5a5a5a', fontStyle: 'italic', margin: '6px 0', fontFamily: theme.font }}>{b.text}</div>
      ))}
      {typingBeat && bubble(typingBeat, 'typing', true)}
      <div ref={endRef} />
    </div>
  )
}
```

- [ ] **Step 2: Refactor ChatReader to consume ChatThread**

Replace `src/ChatReader.jsx` in full with (imports drop `useRef`/`useEffect`/`wordStatus`; the inner thread markup becomes `<ChatThread>`; the auto-scroll effect moves into ChatThread):

```jsx
import { useMemo, useLayoutEffect, useState } from 'react'
import { getLevelLabel } from './utils'
import { chatStyleFor } from './chatMissions'
import { useStoryReaderCore } from './useStoryReaderCore'
import { assignSpeakerSides } from './chatReading'
import ChatThread from './ChatThread'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }

// Chat-format reader (observer): reads a conversation as tap-to-reveal bubbles,
// no "you" replies. Shares the bubble thread with InteractiveChatReader via
// ChatThread and all behavior via useStoryReaderCore.
export default function ChatReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const skin = chatStyleFor(track.language)
  const sides = useMemo(() => assignSpeakerSides(c.beats), [c.beats])
  const levelLabel = getLevelLabel(track.language, track.system, story.level)

  const [typing, setTyping] = useState(false)

  // Hold a character bubble behind a brief "typing…" shimmer (~500ms) so it
  // reveals after the indicator. Skipped for the first beat, narration, during
  // Play, and under reduced-motion. useLayoutEffect avoids a one-frame flash; the
  // reset stops a fast tap-through from stranding the indicator.
  useLayoutEffect(() => {
    const b = c.beats[c.cur]
    const shouldType = c.started && !c.playing && !c.reduceMotion && !!b && !!b.speaker && c.cur > 0
    if (!shouldType) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTyping(false)
      return undefined
    }
    setTyping(true)
    const t = setTimeout(() => setTyping(false), 500)
    return () => clearTimeout(t)
  }, [c.cur, c.started, c.playing, c.reduceMotion, c.beats])

  if (!c.started) {
    return <ReaderLaunch story={story} isRead={isRead} levelLabel={levelLabel} accent={accent} theme={c.theme} readability={c.readability} onStart={c.start} onBack={onBack} />
  }

  const pending = c.beats[c.cur]
  const revealed = c.beats.slice(0, typing ? c.cur : c.cur + 1)

  return (
    <div style={{ minHeight: '100vh', background: skin.bg, color: '#111', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px', background: skin.bg }}>
        <button onClick={c.backToStart} aria-label="Back to start" style={ghost}><ArrowLeft size={18} color="#4a4a4a" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#333', fontFamily: c.theme.font }}>{story.title}</div>
        <div style={{ fontSize: '12px', color: '#666', minWidth: '34px', textAlign: 'right' }}>{c.cur + 1}/{c.total}</div>
      </div>

      <div onClick={() => { c.stopPlay(); c.advance() }} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <ChatThread revealed={revealed} sides={sides} skin={skin} theme={c.theme} accent={accent} userCards={userCards} showPy={c.showPy} activeIndex={c.cur} typingBeat={typing ? pending : null} reduceMotion={c.reduceMotion} onSelectWord={c.selectWord} />
      </div>
      <div aria-live="polite" style={srOnly}>{revealed.length ? revealed[revealed.length - 1].text : ''}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(0,0,0,0.08)', background: skin.bg, padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ width: '48px', height: '48px', borderRadius: '50%', border: 'none', background: accent, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
        <span style={{ fontSize: '12.5px', color: '#555' }}>{c.cur >= c.total - 1 ? 'Tap to finish' : 'Tap anywhere to continue'}</span>
      </div>

      <WordLookupSheet selected={c.selected} theme={c.theme} accent={accent} userCards={userCards} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} />}
    </div>
  )
}

const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
```

- [ ] **Step 3: Verify no regression**

Run: `npx vitest run` → PASS (all existing).
Run: `npm run build` → `✓ built`.
Run: `npx playwright test tests/e2e/reader.spec.js` → all reader e2e PASS (the observer chat test proves the extraction preserved behavior).
Run: `npx eslint src/ChatReader.jsx src/ChatThread.jsx` → no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ChatThread.jsx src/ChatReader.jsx
git commit -m "refactor(reader): extract shared ChatThread; ChatReader consumes it (no behavior change)"
```

---

## Task 3: `stories.interactions` migration

**Files:**
- Create: `supabase/migrations/20260717130000_story_interactions.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260717130000_story_interactions.sql`:

```sql
-- Interactive chat stories: reply data for a presentation='chat' story the
-- learner replies inside. Null for every existing story (observer chat + all
-- other formats stay unchanged). Shape:
--   { "you": "<speaker name>",
--     "distractors": { "<beat index>": [ { "text": "...", "pinyin": "..." } ] } }
-- The correct reply at each interactive beat is that beat's own content text;
-- only the distractors are stored here.
alter table public.stories
  add column if not exists interactions jsonb;
```

- [ ] **Step 2: Verify it is valid SQL (syntax review)**

Run: `grep -c "add column if not exists interactions jsonb" supabase/migrations/20260717130000_story_interactions.sql`
Expected: `1`. (The migration applies to production via the project's normal migration flow, like `20260717120000_story_presentation.sql`.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260717130000_story_interactions.sql
git commit -m "feat(db): add nullable stories.interactions for interactive chat stories"
```

---

## Task 4: `InteractiveChatReader` + dispatcher + finish note + e2e

**Files:**
- Create: `src/InteractiveChatReader.jsx`
- Modify: `src/StoryReader.jsx`
- Modify: `src/FinishOverlay.jsx`
- Modify: `tests/fixtures/mockSupabase.js`
- Modify: `tests/e2e/reader.spec.js`

**Interfaces:**
- Consumes: `useStoryReaderCore`, `ChatThread`, `buildReplyOptions`, `chatStyleFor`, shared `ReaderLaunch`/`WordLookupSheet`/`FinishOverlay`. Reads `story.interactions = { you, distractors }`.
- Produces: `export default function InteractiveChatReader(props)` — rendered by `StoryReader` when a chat story has `interactions`.

- [ ] **Step 1: Add the optional `note` line to FinishOverlay**

In `src/FinishOverlay.jsx`, change the signature and add the note under the subtitle:

```jsx
export default function FinishOverlay({ story, accent, onBack, note }) {
```

and directly after the existing `<p>…Nice — you read all of…</p>` paragraph, add:

```jsx
      {note && <p style={{ fontSize: '13px', fontWeight: 700, color: accent, marginTop: '2px' }}>{note}</p>}
```

(Paced/chat/scene readers pass no `note`, so they are unchanged.)

- [ ] **Step 2: Write the InteractiveChatReader**

Create `src/InteractiveChatReader.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { getLevelLabel } from './utils'
import { chatStyleFor } from './chatMissions'
import { useStoryReaderCore } from './useStoryReaderCore'
import { buildReplyOptions } from './interactiveChat'
import ChatThread from './ChatThread'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const PALETTE = ['#2E6FB8', '#2F9E6D', '#C2680E', '#7C5CD0', '#B83A7A']
function pinyinOf(beat) { return beat.tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ') }

// Interactive chat reader: the learner replies at their own turns by picking the
// correct response (retry-until-right); a correct pick becomes their bubble and
// the chat continues. Shares the thread (ChatThread) + engine (useStoryReaderCore)
// with the observer reader; only the reply panel is bespoke.
export default function InteractiveChatReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const skin = chatStyleFor(track.language)
  const levelLabel = getLevelLabel(track.language, track.system, story.level)
  const interactions = story.interactions || {}
  const youSpeaker = interactions.you
  const distractors = interactions.distractors || {}

  // Fixed sides: the learner ("you") is on the right; everyone else on the left,
  // each other speaker keeping a stable color.
  const sides = useMemo(() => {
    const map = {}
    let n = 0
    for (const b of c.beats) {
      if (!b.speaker || map[b.speaker]) continue
      map[b.speaker] = b.speaker === youSpeaker
        ? { side: 'right', color: accent }
        : { side: 'left', color: PALETTE[n++ % PALETTE.length] }
    }
    return map
  }, [c.beats, youSpeaker, accent])

  const [answered, setAnswered] = useState({})   // beatIndex -> true once solved
  const [missed, setMissed] = useState({})       // beatIndex -> true if ever wrong
  const [wrongPick, setWrongPick] = useState(null)

  // Is the NEXT beat a reply gate (a "you" beat with distractors, not yet solved)?
  const gateIndex = c.cur + 1
  const gateBeat = c.beats[gateIndex]
  const isGate = !!gateBeat && gateBeat.speaker === youSpeaker && !!distractors[gateIndex] && !answered[gateIndex]

  const options = useMemo(() => (
    isGate ? buildReplyOptions(gateBeat.text, pinyinOf(gateBeat), distractors[gateIndex], gateIndex).options : []
  ), [isGate, gateBeat, distractors, gateIndex])

  const advance = () => { if (!isGate) { c.stopPlay(); c.advance() } }
  const pick = (opt) => {
    if (opt.correct) {
      setAnswered(a => ({ ...a, [gateIndex]: true }))
      setWrongPick(null)
      c.advance()   // reveal the "you" bubble (or finish if it was the last beat)
    } else {
      setWrongPick(opt.text)
      setMissed(m => ({ ...m, [gateIndex]: true }))
    }
  }

  if (!c.started) {
    return <ReaderLaunch story={story} isRead={isRead} levelLabel={levelLabel} accent={accent} theme={c.theme} readability={c.readability} onStart={c.start} onBack={onBack} />
  }

  const revealed = c.beats.slice(0, c.cur + 1)
  const gateCount = Object.keys(distractors).length
  const firstTry = Object.keys(answered).filter(i => !missed[i]).length

  return (
    <div style={{ minHeight: '100vh', background: skin.bg, color: '#111', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px', background: skin.bg }}>
        <button onClick={c.backToStart} aria-label="Back to start" style={ghost}><ArrowLeft size={18} color="#4a4a4a" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#333', fontFamily: c.theme.font }}>{story.title}</div>
        <div style={{ fontSize: '12px', color: '#666', minWidth: '34px', textAlign: 'right' }}>{c.cur + 1}/{c.total}</div>
      </div>

      <div onClick={advance} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px', cursor: isGate ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <ChatThread revealed={revealed} sides={sides} skin={skin} theme={c.theme} accent={accent} userCards={userCards} showPy={c.showPy} activeIndex={c.cur} typingBeat={null} reduceMotion={c.reduceMotion} onSelectWord={c.selectWord} />
      </div>
      <div aria-live="polite" style={srOnly}>{isGate ? 'Your turn to reply' : (revealed.length ? revealed[revealed.length - 1].text : '')}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(0,0,0,0.08)', background: skin.bg, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))' }}>
        {isGate ? (
          <div role="group" aria-label="Choose your reply">
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#555', marginBottom: '8px', textAlign: 'center' }}>Your reply — tap the right one</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '620px', margin: '0 auto' }}>
              {options.map((opt, oi) => {
                const isWrong = wrongPick === opt.text
                return (
                  <button key={oi} onClick={() => pick(opt)}
                    style={{ textAlign: 'left', border: '1px solid ' + (isWrong ? '#DC2626' : 'rgba(0,0,0,0.12)'), background: isWrong ? '#FEECEC' : '#fff', opacity: isWrong ? 0.6 : 1, borderRadius: '14px', padding: '10px 14px', cursor: 'pointer', fontFamily: c.theme.font, animation: (isWrong && !c.reduceMotion) ? 'hdShake 0.3s' : 'none' }}>
                    <div style={{ fontSize: '17px', color: '#111' }}>{opt.text}</div>
                    {c.showPy && opt.pinyin && <div style={{ fontSize: '11.5px', color: '#888', marginTop: '2px' }}>{opt.pinyin}</div>}
                  </button>
                )
              })}
            </div>
            {wrongPick && <div style={{ fontSize: '12.5px', color: '#DC2626', textAlign: 'center', marginTop: '8px' }}>Not quite — try another reply.</div>}
          </div>
        ) : (
          <div style={{ textAlign: 'center', fontSize: '12.5px', color: '#555' }}>{c.cur >= c.total - 1 ? 'Tap to finish' : 'Tap anywhere to continue'}</div>
        )}
      </div>

      <WordLookupSheet selected={c.selected} theme={c.theme} accent={accent} userCards={userCards} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} note={gateCount ? `You replied ${firstTry}/${gateCount} on the first try` : null} />}
    </div>
  )
}

const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
```

Note: the `hdShake` keyframes already exist in `src/index.css` (used by ChatMission's tile-wrong feedback). Verify with `grep -n "hdShake" src/index.css`; if absent, add to `src/index.css`:

```css
@keyframes hdShake { 10%,90%{transform:translateX(-1px)} 30%,70%{transform:translateX(2px)} 50%{transform:translateX(-2px)} }
```

- [ ] **Step 3: Wire the dispatcher**

In `src/StoryReader.jsx`, add the import after the `ChatReader` import:

```js
import InteractiveChatReader from './InteractiveChatReader'
```

and change the chat branch so the interactive variant wins when `interactions` is present:

```js
  const mode = resolvePresentation(props.story, modePref)
  if (mode === 'scene') return <SceneReader {...props} />
  if (mode === 'chat' && props.story.interactions) return <InteractiveChatReader {...props} />
  if (mode === 'chat') return <ChatReader {...props} />
  if (mode === 'paced') return <PacedReader {...props} />
  return <StoryReaderImmersive {...props} />
```

- [ ] **Step 4: Add the e2e fixture**

In `tests/fixtures/mockSupabase.js`, append a fourth story to the `STORIES` array (change `st3`'s closing `}];` to `}, {` and add, keeping `}];`). Vocab 今天/好/公园/朋友 resolve against the existing `VOCAB` fixture:

```js
}, {
  id: 'st4', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 4,
  title: '一起去公园', is_published: true, presentation: 'chat', has_audio: false,
  image_path: null, english_content: 'A reply-along chat.',
  content: ['朋友：你今天好吗？', '小明：我很好！', '朋友：我们去公园吧。', '小明：好，一起去。'].join('\n'),
  interactions: { you: '小明', distractors: { '1': [{ text: '我不是学生。', pinyin: 'x' }], '3': [{ text: '再见。', pinyin: 'y' }] } },
}];
```

- [ ] **Step 5: Write the e2e test**

In `tests/e2e/reader.spec.js`, add as the last test inside the `describe`:

```js
  test('interactive chat: reply panel, wrong pick retries, correct advances, recap', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openStoryByTitle('一起去公园');
    await page.getByRole('button', { name: /Start reading/i }).click();

    // First bubble is a "them" turn; tap to reveal toward the first reply gate.
    await expect(page.getByText('1/4')).toBeVisible();
    await page.getByText('你今天好吗', { exact: false }).first().click();  // tap thread to advance

    // Reply gate: the panel offers the correct reply + a distractor.
    await expect(page.getByText('Your reply — tap the right one')).toBeVisible();
    await expect(page.getByText('我不是学生。')).toBeVisible();
    // Wrong pick → hint shows, does NOT advance past the gate.
    await page.getByRole('button', { name: /我不是学生/ }).click();
    await expect(page.getByText(/Not quite/)).toBeVisible();
    await expect(page.getByText('Your reply — tap the right one')).toBeVisible();
    // Correct pick → becomes the "you" bubble, chat continues.
    await page.getByRole('button', { name: /我很好/ }).click();
    await expect(page.getByText('2/4')).toBeVisible();

    // Advance to the second gate and answer correctly, then finish.
    await page.getByText('我们去公园', { exact: false }).first().click();
    await expect(page.getByText('Your reply — tap the right one')).toBeVisible();
    await page.getByRole('button', { name: /好，一起去/ }).click();
    await expect(page.getByText('You read it')).toBeVisible();
    await expect(page.getByText(/on the first try/)).toBeVisible();
  });
```

- [ ] **Step 6: Verify**

Run: `npx vitest run` → PASS.
Run: `npm run build` → `✓ built`.
Run: `npx playwright test tests/e2e/reader.spec.js` → all reader e2e PASS incl. the interactive test.
Run: `npx eslint src/InteractiveChatReader.jsx src/StoryReader.jsx src/FinishOverlay.jsx` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/InteractiveChatReader.jsx src/StoryReader.jsx src/FinishOverlay.jsx src/index.css tests/fixtures/mockSupabase.js tests/e2e/reader.spec.js
git commit -m "feat(reader): InteractiveChatReader (reply-along chat) + dispatcher + e2e"
```

---

## Task 5: `🗨️ Reply` story-card badge

**Files:**
- Modify: `src/Stories.jsx`

- [ ] **Step 1: Add the badge**

In `src/Stories.jsx`, immediately after the `{story.presentation === 'scene' && (…🎬 Scene…)}` block, add (an interactive chat story is `presentation:'chat'` with `interactions`, so key off `interactions`):

```jsx
          {story.interactions && (
            <span style={{ marginLeft: '7px', fontSize: '10.5px', fontWeight: 800, color: '#2F9E6D', background: '#2F9E6D15', border: '1px solid #2F9E6D33', borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap' }}>🗨️ Reply</span>
          )}
```

- [ ] **Step 2: Verify**

Run: `npm run build` → `✓ built`.
Run: `npx eslint src/Stories.jsx` → no NEW errors (pre-existing `exhaustive-deps` warning ~line 365 is unrelated).
Run: `npx vitest run` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/Stories.jsx
git commit -m "feat(stories): show a Reply badge on interactive chat-story cards"
```

---

## Task 6: Authored interactive stories + passthrough + validator

**Files:**
- Modify: `data/authored-stories.json`
- Modify: `authored-stories.mjs`
- Modify: `src/authoredStories.test.js`

- [ ] **Step 1: Pass `interactions` through on insert**

In `authored-stories.mjs`, find the `.insert({ ... presentation: s.presentation || 'paced' ... })` row (added in Phase 2) and add `interactions` alongside it:

```js
      presentation: s.presentation || 'paced',
      interactions: s.interactions || null,
```

- [ ] **Step 2: Append the authored interactive stories**

In `data/authored-stories.json`, change the last object's trailing `}` to `},` and append these two before the closing `]`. Each is `presentation:'chat'` with `interactions`; the correct reply at a gate is that beat's own `content` text:

```json
  {
    "language": "chinese", "system": "hsk_3", "level": 1, "tier": 1, "tier_min_words": 0,
    "presentation": "chat",
    "title": "放学以后聊天",
    "english_summary": "Reply inside a chat: make an after-school plan with a friend.",
    "content": "朋友：你今天去学校吗？\n小明：去，我现在在学校。\n朋友：放学以后你想做什么？\n小明：我想去公园。\n朋友：好啊，我们几点去？\n小明：四点，在学校门口见。",
    "interactions": {
      "you": "小明",
      "distractors": {
        "1": [{ "text": "我不去，我在家。", "pinyin": "Wǒ bú qù, wǒ zài jiā." }],
        "3": [{ "text": "我想吃面条。", "pinyin": "Wǒ xiǎng chī miàntiáo." }],
        "5": [{ "text": "我不知道。", "pinyin": "Wǒ bù zhīdào." }]
      }
    }
  },
  {
    "language": "chinese", "system": "hsk_3", "level": 2, "tier": 1, "tier_min_words": 0,
    "presentation": "chat",
    "title": "周末的电影",
    "english_summary": "Reply inside a chat: agree on a weekend movie.",
    "content": "朋友：这个周末你有空吗？\n小明：有空，你想做什么？\n朋友：我想去看电影。\n小明：好主意！看什么电影？\n朋友：一个新的中国电影。\n小明：太好了，几点的？",
    "interactions": {
      "you": "小明",
      "distractors": {
        "1": [{ "text": "我没有空。", "pinyin": "Wǒ méiyǒu kòng." }],
        "3": [{ "text": "我不喜欢电影。", "pinyin": "Wǒ bù xǐhuan diànyǐng." }],
        "5": [{ "text": "再见！", "pinyin": "Zàijiàn!" }]
      }
    }
  }
```

- [ ] **Step 3: Validate authored interactions**

In `src/authoredStories.test.js`, inside the `describe(s.title, …)` block (after the readable-lines test), add a check that each interactive story is well-formed — every distractor beat index is a real `you`-spoken line:

```js
      it('interactions reference valid you-spoken beats', () => {
        if (!s.interactions) return
        const { splitSpeaker } = require('./storyReading')   // already imported at top; see note
        const you = s.interactions.you
        expect(typeof you, 'interactions.you must be a speaker name').toBe('string')
        for (const idx of Object.keys(s.interactions.distractors || {})) {
          const line = lines[Number(idx)]
          expect(line, 'distractor beat ' + idx + ' out of range').toBeTruthy()
          expect(splitSpeaker(line).speaker, 'distractor beat ' + idx + ' is not spoken by ' + you).toBe(you)
        }
      })
```

Note: `splitSpeaker` is already imported at the top of `src/authoredStories.test.js` (`import { … splitSpeaker … } from './storyReading'`). Use that import directly rather than `require`; the final code is:

```js
      it('interactions reference valid you-spoken beats', () => {
        if (!s.interactions) return
        const you = s.interactions.you
        expect(typeof you, 'interactions.you must be a speaker name').toBe('string')
        for (const idx of Object.keys(s.interactions.distractors || {})) {
          const line = lines[Number(idx)]
          expect(line, 'distractor beat ' + idx + ' out of range').toBeTruthy()
          expect(splitSpeaker(line).speaker, 'distractor beat ' + idx + ' is not spoken by ' + you).toBe(you)
        }
      })
```

- [ ] **Step 4: Verify**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/authored-stories.json','utf8')); console.log('valid')"` → `valid`.
Run: `npx vitest run` → PASS (the two new stories satisfy the new interactions check + the existing chat-lane checks).
Run: `npx eslint src/authoredStories.test.js` → no errors.

- [ ] **Step 5: Commit**

```bash
git add data/authored-stories.json authored-stories.mjs src/authoredStories.test.js
git commit -m "feat(content): authored Chinese interactive chat stories + interactions passthrough + validator"
```

---

## Task 7: Final verification + roadmap

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Full green sweep**

Run: `npx vitest run` → all unit tests PASS.
Run: `npm run build` → `✓ built`.
Run: `npx playwright test` → all e2e PASS (paced, chat, scene, interactive, and non-reader suites).
Run: `npx eslint src/InteractiveChatReader.jsx src/ChatThread.jsx src/interactiveChat.js src/ChatReader.jsx src/StoryReader.jsx src/Stories.jsx src/FinishOverlay.jsx` → no errors.

- [ ] **Step 2: Move the roadmap item to Shipped**

In `ROADMAP.md`, remove the Next-section line:

```markdown
- [ ] **Interactive chat stories** — reply inside a chat story by choosing the right response to keep the conversation going (builds on chat-format stories + Word-to-World missions)
```

and add, as the first entry under `## ✅ Shipped`:

```markdown
- [x] **Interactive chat stories** — reply inside a chat story by picking the right response (retry until it clicks); your choice becomes your message and the conversation keeps going
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): ship interactive chat stories"
```

- [ ] **Step 4: Push + merge**

Push the branch, then merge to `main` (the roadmap change reaches `main` for the live Discord sync), matching the Phase 1/2/3 rollout. Final whole-branch review (opus) before merge.

---

## Self-Review Notes

- **Spec coverage:** `interactions` column (T3) · dispatch (T4) · `InteractiveChatReader` incl. reply panel/retry/correct-advances/recap accuracy (T4) · shared `ChatThread` extraction with observer preserved (T2) · `buildReplyOptions` (T1) · `you`-right side assignment (T4) · `🗨️ Reply` badge (T5) · authored stories + `authored-stories.mjs` passthrough (T6) · e2e fixture + interactive e2e (T4) · buildReplyOptions unit + authored-interactions validator (T1, T6) · roadmap (T7). All spec sections map to a task.
- **Type consistency:** `buildReplyOptions(correctText, correctPinyin, distractors, seed) → {options:[{text,pinyin,correct}], correctIndex}` used identically in T1/T4; `ChatThread` prop shape consistent T2 (producer) ↔ T2/T4 (consumers); `interactions = {you, distractors:{[idx]:[{text,pinyin}]}}` consistent across T3/T4/T6; `FinishOverlay` `note` optional prop added T4, passed only by InteractiveChatReader.
- **No placeholders:** every code step shows complete code; every run step shows the command + expected result.
- **Non-obvious dependency:** T4 depends on T1 (`buildReplyOptions`) and T2 (`ChatThread`); T3 (migration) is independent and can land anytime before T6's authored content is seeded.
```
