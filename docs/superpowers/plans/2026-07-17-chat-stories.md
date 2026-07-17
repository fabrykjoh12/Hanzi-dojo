# Chat-format Stories (Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `ChatReader` that presents a story as a tap-to-reveal messaging conversation (observer, bubbles), reusing the Phase 1 reader engine, plus a few authored Chinese chat stories.

**Architecture:** Extract the non-visual reader behavior out of `PacedReader` into a shared `useStoryReaderCore` hook (+ small shared `ReaderLaunch`, `WordLookupSheet`, `FinishOverlay` components); `PacedReader` and the new `ChatReader` both consume them. The existing `StoryReader` dispatcher routes `presentation === 'chat'` to `ChatReader`.

**Tech Stack:** React 19 (function components, hooks, inline styles + `src/index.css` tokens), Vite 8, Supabase, Vitest (node env, pure logic), Playwright (e2e over mock backend).

## Global Constraints

- **Language:** JavaScript + JSX only. No TypeScript. No new dependencies.
- **Styling:** inline styles off the CSS variables in `src/index.css` + per-language accent via `languageTheme(track.language).accentHex`; chat bubble colors from `chatStyleFor(track.language)` in `src/chatMissions.js`.
- **Behavior parity:** the shared core must preserve `PacedReader`'s exact current behavior (its Phase 1 e2e suite `tests/e2e/reader.spec.js` is the regression gate; it must stay green after the extraction).
- **Finish semantics (verbatim from current `PacedReader.finish`):** once-guarded via a ref; only when `!isRead`; online → `supabase.from('story_reads').upsert({ user_id, story_id })` then `awardXp(session, profile, STORY_FINISH_XP)` + `onMarkRead`; offline → `enqueueStoryRead({ userId, storyId, xpDelta: STORY_FINISH_XP })` + `onMarkRead`; then `trackEvent(EVENTS.STORY_COMPLETED, { tier, known_pct })` and, when `firstMission`, `trackOnce(EVENTS.FIRST_STORY_COMPLETED, { known_pct })`. `STORY_FINISH_XP = 10`.
- **Observer only:** no "you" bubbles, no reply choices, no comprehension questions (that's a future roadmap item).
- **Accessibility:** keyboard advance, `aria-live` for the newest line, honor `prefers-reduced-motion` (skip typing shimmer + transitions), visible focus.
- **Unit tests** at `src/**/*.test.js` (node env, pure logic only); **UI via Playwright** over the mock in `tests/fixtures/mockSupabase.js` (returns a table fixture wholesale, ignores query filters).
- **Roadmap:** the roadmap already lists "Chat-format stories" under 🔜 Next; when this ships, move it to ✅ Shipped in the same change (auto-syncs to Discord via `roadmap-live-sync.yml`).

---

## File Structure

- `src/useStoryReaderCore.js` — **create**: the shared reader-behavior hook (beats, readability, progression, audio read-along, finish/mark-read, word-lookup, add-to-deck, keyboard).
- `src/ReaderLaunch.jsx` — **create**: shared launch screen (cover kicker + title, % known, Start, classic-scroll link).
- `src/WordLookupSheet.jsx` — **create**: shared bottom-sheet lookup (reading, meaning, add-to-deck, hear-word, close).
- `src/FinishOverlay.jsx` — **create**: shared "You read it" overlay.
- `src/PacedReader.jsx` — **modify**: refactor to consume the hook + shared components (no behavior change).
- `src/chatReading.js` — **create**: pure `assignSpeakerSides(beats)`.
- `src/chatReading.test.js` — **create**: unit tests.
- `src/ChatReader.jsx` — **create**: the bubble-thread renderer.
- `src/StoryReader.jsx` — **modify**: route `'chat'` → `ChatReader`.
- `src/Stories.jsx` — **modify**: "💬 Chat" badge on chat story cards.
- `authored-stories.mjs` — **modify**: pass `presentation` through on insert.
- `data/authored-stories.json` — **modify**: add authored Chinese chat stories.
- `tests/fixtures/mockSupabase.js` — **modify**: add one `presentation:'chat'` story fixture.
- `tests/e2e/reader.spec.js` — **modify**: chat-story e2e.

---

## Task 1: Extract the shared reader core + refactor PacedReader

Pull `PacedReader`'s non-visual behavior into a hook and three small shared UI components, then rewire `PacedReader` to use them. Behavior must be identical — the Phase 1 reader e2e is the safety net.

**Files:**
- Create: `src/useStoryReaderCore.js`, `src/ReaderLaunch.jsx`, `src/WordLookupSheet.jsx`, `src/FinishOverlay.jsx`
- Modify: `src/PacedReader.jsx`

**Interfaces:**
- Produces:
  - `useStoryReaderCore(props) → { theme, reduceMotion, beats, readability, total, ttsLang, started, cur, done, playing, selected, showPy, showEn, setShowPy, setShowEn, setSelected, go, advance, finish, stopPlay, togglePlay, speakWord, selectWord, addToDeck, start, backToStart }` where `props = { story, vocabMap, userCards, setUserCards, track, isRead, session, profile, onMarkRead, firstMission }`. `beats` is `[{ speaker, text, tokens }]`; `selectWord(vocab, status)`; `selected` is `{ word, vocab, status } | null`.
  - `export const STORY_FINISH_XP = 10`.
  - `<ReaderLaunch story track isRead levelLabel accent theme readability onStart onReadClassic />`
  - `<WordLookupSheet selected theme accent userCards onAddToDeck onSpeak onClose />`
  - `<FinishOverlay story accent onBack />`

- [ ] **Step 1: Create the hook** — `src/useStoryReaderCore.js`:

```jsx
import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { languageTheme } from './languageTheme'
import { getAudioUrl, playAudioEl } from './utils'
import { calculateStoryReadability, buildVocabMatcher, segmentLine, namesFor, particlesFor, splitSpeaker } from './storyReading'
import { supabase } from './supabase'
import { awardXp } from './xpService'
import { isOnline } from './useOnline'
import { enqueueStoryRead } from './syncQueue'
import { track as trackEvent, trackOnce, EVENTS } from './analytics'

// One-time XP for finishing a story — same amount/name as the classic reader.
export const STORY_FINISH_XP = 10

// Shared, presentation-independent reader behavior for the paced + chat readers:
// beat parsing, % known, tap-to-reveal progression, per-line audio read-along,
// finish/mark-read (online/offline parity with the classic reader), word lookup,
// add-to-deck, and keyboard control. Each renderer draws the beats however it
// likes; this hook owns everything else.
export function useStoryReaderCore({ story, vocabMap, userCards, setUserCards, track, isRead, session, profile, onMarkRead, firstMission = false }) {
  const theme = languageTheme(track.language)
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [started, setStarted] = useState(false)
  const [cur, setCur] = useState(0)
  const [showPy, setShowPy] = useState(true)
  const [showEn, setShowEn] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState(null)
  const [done, setDone] = useState(false)
  const finishedRef = useRef(false)
  const runRef = useRef(0)
  const audioElRef = useRef(null)

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
  const total = beats.length
  const ttsLang = track.language === 'japanese' ? 'ja-JP' : track.language === 'chinese' ? 'zh-CN' : 'ru-RU'

  const go = useCallback((i) => setCur(c => Math.max(0, Math.min(total - 1, i ?? c))), [total])

  const stopPlay = useCallback(() => {
    runRef.current += 1
    setPlaying(false)
    try { window.speechSynthesis.cancel() } catch { /* noop */ }
    if (audioElRef.current) audioElRef.current.pause()
  }, [])

  const finish = useCallback(async () => {
    stopPlay()
    setDone(true)
    if (finishedRef.current) return
    finishedRef.current = true
    if (!isRead) {
      if (isOnline()) {
        const { error } = await supabase.from('story_reads').upsert({ user_id: session.user.id, story_id: story.id })
        if (!error) { if (profile) awardXp(session, profile, STORY_FINISH_XP); if (onMarkRead) onMarkRead(story.id) }
      } else {
        await enqueueStoryRead({ userId: session.user.id, storyId: story.id, xpDelta: STORY_FINISH_XP })
        if (onMarkRead) onMarkRead(story.id)
      }
      trackEvent(EVENTS.STORY_COMPLETED, { tier: story.tier, known_pct: readability.knownPct })
      if (firstMission) trackOnce(EVENTS.FIRST_STORY_COMPLETED, { known_pct: readability.knownPct })
    }
  }, [isRead, session, story.id, story.tier, profile, onMarkRead, stopPlay, firstMission, readability.knownPct])

  const advance = useCallback(() => { if (cur >= total - 1) finish(); else go(cur + 1) }, [cur, total, finish, go])

  const speakFrom = (index, runId) => {
    if (runId !== runRef.current) return
    if (index >= beats.length) { finish(); return }
    setCur(index)
    const nextBeat = () => { if (runId === runRef.current) speakFrom(index + 1, runId) }
    const viaSynth = () => {
      try {
        const u = new SpeechSynthesisUtterance(beats[index].text)
        u.lang = ttsLang; u.rate = 0.9
        u.onend = nextBeat
        window.speechSynthesis.speak(u)
      } catch { setPlaying(false) }
    }
    if (story.has_audio) {
      if (!audioElRef.current) audioElRef.current = new Audio()
      const el = audioElRef.current
      el.onended = nextBeat
      playAudioEl(el, getAudioUrl('stories/' + story.id + '/' + index + '.mp3'), viaSynth)
    } else viaSynth()
  }

  const togglePlay = () => {
    if (playing) { stopPlay(); return }
    runRef.current += 1
    setPlaying(true)
    speakFrom(cur >= beats.length - 1 ? 0 : cur, runRef.current)
  }

  const speakWord = (text) => {
    if (!text) return
    try { const u = new SpeechSynthesisUtterance(text); u.lang = ttsLang; u.rate = 0.85; window.speechSynthesis.speak(u) } catch { /* noop */ }
  }

  const selectWord = (vocab, status) => { stopPlay(); setSelected({ word: vocab.word, vocab, status }) }

  const addToDeck = async (vocab) => {
    if (!vocab || !vocab.id || (userCards && userCards[vocab.id])) return
    const { error } = await supabase.from('cards').insert({
      user_id: session.user.id, vocab_id: vocab.id,
      state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
    })
    if (!error && setUserCards) setUserCards(prev => ({ ...prev, [vocab.id]: { vocab_id: vocab.id, state: 'new' } }))
  }

  const start = () => { setCur(0); setStarted(true) }
  const backToStart = () => { stopPlay(); setStarted(false) }

  useEffect(() => {
    if (!started) return undefined
    const onKey = (e) => {
      if (selected && e.key === 'Escape') { setSelected(null); return }
      if (selected || done) return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); advance() }
      if (e.key === 'ArrowLeft') go(cur - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, cur, go, advance, selected, done])

  useEffect(() => () => { stopPlay() }, [stopPlay])

  return {
    theme, reduceMotion, beats, readability, total, ttsLang,
    started, cur, done, playing, selected, showPy, showEn,
    setShowPy, setShowEn, setSelected,
    go, advance, finish, stopPlay, togglePlay, speakWord, selectWord, addToDeck,
    start, backToStart,
  }
}
```

- [ ] **Step 2: Create `src/WordLookupSheet.jsx`** (extracted verbatim from PacedReader's sheet JSX):

```jsx
import { cleanMeaning } from './cleanMeaning'
import { X, Volume2, Bookmark } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }

// Bottom-sheet word lookup shared by the paced + chat readers. `selected` is
// { word, vocab, status } | null.
export default function WordLookupSheet({ selected, theme, accent, userCards, onAddToDeck, onSpeak, onClose }) {
  if (!selected) return null
  return (
    <div onClick={onClose} className="app-overlay-viewport" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.14)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '16px 18px 26px', boxShadow: '0 -10px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: accent, fontFamily: theme.font }}>{selected.word}</span>
            <span style={{ fontSize: '16px', color: '#B45309', fontWeight: 600 }}>{selected.vocab.reading}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button onClick={() => onAddToDeck(selected.vocab)} aria-label="Add to deck" style={ghost}>
              <Bookmark size={20} color={userCards[selected.vocab.id] ? accent : 'var(--text-muted)'} fill={userCards[selected.vocab.id] ? accent : 'none'} />
            </button>
            <button onClick={() => onSpeak(selected.word)} aria-label="Play audio" style={ghost}>
              <Volume2 size={20} color="var(--text-muted)" />
            </button>
            <button onClick={onClose} aria-label="Close" style={ghost}>
              <X size={20} color="var(--text-muted)" />
            </button>
          </div>
        </div>
        <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>{cleanMeaning(selected.vocab.meaning)}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/FinishOverlay.jsx`**:

```jsx
import { Check } from 'lucide-react'

const SAGE = '#6E8466'
const btn = { border: 'none', borderRadius: '16px', background: SAGE, color: '#fff', fontSize: '15.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', width: 'auto', padding: '12px 22px', marginTop: '14px' }

export default function FinishOverlay({ story, accent, onBack }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '34px', gap: '8px', zIndex: 6 }}>
      <div style={{ width: '58px', height: '58px', borderRadius: '18px', background: accent + '18', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}><Check size={28} color={accent} /></div>
      <h2 style={{ fontSize: '22px', fontWeight: 800 }}>You read it</h2>
      <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', maxWidth: '260px', lineHeight: 1.6 }}>Nice — you read all of &ldquo;{story.title}&rdquo;.</p>
      <button onClick={onBack} style={btn}>Back to library</button>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/ReaderLaunch.jsx`** (extracted verbatim from PacedReader's launch JSX):

```jsx
import { ArrowLeft, Play } from 'lucide-react'
import { prefsGet, prefsSet } from './offline'

const SAGE = '#6E8466'
const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const startBtn = { marginTop: '24px', width: '100%', border: 'none', borderRadius: '16px', background: SAGE, color: '#fff', fontSize: '15.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px' }
const classicLink = { marginTop: '14px', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', width: '100%' }
function pct(n, total) { return total ? Math.round((n / total) * 100) + '%' : '0%' }

// Shared launch screen for the paced + chat readers.
export default function ReaderLaunch({ story, isRead, levelLabel, accent, theme, readability, onStart, onBack }) {
  const { knownPct, knownCount, learningCount, newCount, totalUnique } = readability
  const readClassic = async () => { const p = (await prefsGet('reader:prefs')) || {}; await prefsSet('reader:prefs', { ...p, mode: 'classic' }); onBack() }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
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
          <div style={{ width: pct(knownCount, totalUnique), background: '#2F9E6D' }} />
          <div style={{ width: pct(learningCount, totalUnique), background: '#CA8A04' }} />
          <div style={{ width: pct(newCount, totalUnique), background: accent + '55' }} />
        </div>
        <button onClick={onStart} style={startBtn}><Play size={18} color="#fff" /> Start reading</button>
        <button onClick={readClassic} style={classicLink}>Prefer the whole page? <u>Read as classic scroll</u></button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Refactor `src/PacedReader.jsx`** to consume the hook + shared components. Replace the ENTIRE file with:

```jsx
import { useRef, useEffect, useCallback } from 'react'
import { getLevelLabel } from './utils'
import { wordStatus } from './storyReading'
import { useStoryReaderCore } from './useStoryReaderCore'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'

function beatStyle(distance, reduceMotion) {
  if (distance === 0) return { opacity: 1, filter: 'none' }
  if (distance < 0) return { opacity: 0.26, filter: 'none' }
  const blur = reduceMotion ? 0 : (distance === 1 ? 0.5 : distance === 2 ? 1.6 : 2.6)
  const opacity = distance === 1 ? 0.5 : distance === 2 ? 0.22 : 0.08
  return { opacity, filter: blur ? `blur(${blur}px)` : 'none' }
}
function pinyinLine(tokens) { return tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ') }

export default function PacedReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const levelLabel = getLevelLabel(track.language, track.system, story.level)

  const stageRef = useRef(null)
  const trackRef = useRef(null)
  const beatEls = useRef([])

  const layout = useCallback(() => {
    const stage = stageRef.current, trk = trackRef.current, el = beatEls.current[c.cur]
    if (!stage || !trk || !el) return
    const y = stage.clientHeight * 0.42 - (el.offsetTop + el.offsetHeight / 2)
    trk.style.transform = `translateY(${y}px)`
  }, [c.cur])
  useEffect(() => { if (c.started) layout() }, [c.started, c.cur, c.showPy, c.showEn, layout])
  useEffect(() => {
    const onResize = () => { if (c.started) layout() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [c.started, layout])

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

      <div ref={stageRef} onClick={() => { c.stopPlay(); c.advance() }}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'pointer', WebkitMaskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)', maskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)' }}>
        <div ref={trackRef} style={{ position: 'absolute', left: 0, right: 0, padding: '0 28px', maxWidth: '680px', margin: '0 auto', transition: c.reduceMotion ? 'none' : 'transform .55s cubic-bezier(.33,1,.68,1)' }}>
          {c.beats.map((b, i) => {
            const st = beatStyle(i - c.cur, c.reduceMotion)
            return (
              <div key={i} ref={el => { beatEls.current[i] = el }} aria-hidden={i !== c.cur}
                style={{ padding: '26px 0', transition: c.reduceMotion ? 'none' : 'opacity .45s ease, filter .45s ease', ...st }}>
                {b.speaker && <div style={{ fontSize: '12.5px', fontWeight: 800, color: accent, marginBottom: '9px' }}>{b.speaker}</div>}
                {c.showPy && i === c.cur && <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>{pinyinLine(b.tokens)}</div>}
                <div style={{ fontFamily: c.theme.font, fontSize: '30px', lineHeight: 1.62, fontWeight: 500 }}>
                  {b.tokens.map((t, k) => {
                    if (!t.vocab) return <span key={k}>{t.text}</span>
                    const status = wordStatus(t.vocab.id, userCards)
                    const decorate = i === c.cur
                    return (
                      <span key={k}
                        onClick={i === c.cur ? (e) => { e.stopPropagation(); c.selectWord(t.vocab, status) } : undefined}
                        style={{
                          cursor: i === c.cur ? 'pointer' : 'inherit', borderRadius: '4px', padding: '0 1px',
                          background: decorate && status === 'not_started' ? accent + '1f' : (decorate && status === 'learning' ? '#CA8A0422' : 'transparent'),
                          boxShadow: decorate && status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none',
                        }}>{t.text}</span>
                    )
                  })}
                </div>
                {c.showEn && i === c.cur && story.english_content && <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '12px' }}>{story.english_content}</div>}
              </div>
            )
          })}
        </div>
      </div>
      <div aria-live="polite" style={srOnly}>{c.beats[c.cur] ? c.beats[c.cur].text : ''}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <Chip on={c.showPy} onClick={() => c.setShowPy(v => !v)} label={track.language === 'chinese' ? 'Pinyin' : 'Reading'} accent={accent} />
          <Chip on={c.showEn} onClick={() => c.setShowEn(v => !v)} label="English" accent={accent} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => { c.stopPlay(); c.go(c.cur - 1) }} disabled={c.cur === 0} aria-label="Previous line" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none', color: '#fff' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
          <button onClick={() => { c.stopPlay(); c.advance() }} aria-label="Next line" style={navBtn}><ChevronRight size={18} /></button>
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

- [ ] **Step 6: Verify no regression + build/lint**

Run: `npx playwright test reader --project=chromium` → all reader tests PASS (paced launch, advance, play/pause, word lookup, finish all unchanged).
Then `npm run build` (succeeds), `npx eslint src/PacedReader.jsx src/useStoryReaderCore.js src/ReaderLaunch.jsx src/WordLookupSheet.jsx src/FinishOverlay.jsx` (exit 0), `npx vitest run` (395, unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/useStoryReaderCore.js src/ReaderLaunch.jsx src/WordLookupSheet.jsx src/FinishOverlay.jsx src/PacedReader.jsx
git commit -m "refactor(reader): extract useStoryReaderCore + shared launch/sheet/finish; PacedReader consumes them"
```

---

## Task 2: `assignSpeakerSides` (pure, chat bubble layout)

**Files:**
- Create: `src/chatReading.js`, `src/chatReading.test.js`

**Interfaces:**
- Produces: `assignSpeakerSides(beats) → { [speaker]: { side: 'left'|'right', color: string } }` — distinct non-narration speakers in first-seen order; even index → left, odd → right; color cycles a fixed palette. Narration (no speaker) is not keyed.

- [ ] **Step 1: Write the failing test** — `src/chatReading.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { assignSpeakerSides } from './chatReading'

const beats = [
  { speaker: null, text: '旁白' },
  { speaker: '小明', text: '你好' },
  { speaker: '朋友', text: '嗨' },
  { speaker: '小明', text: '再见' },
]

describe('assignSpeakerSides', () => {
  it('assigns first speaker left, second right, stable per speaker', () => {
    const m = assignSpeakerSides(beats)
    expect(m['小明'].side).toBe('left')
    expect(m['朋友'].side).toBe('right')
    expect(Object.keys(m).sort()).toEqual(['小明', '朋友'].sort())
  })
  it('gives each speaker a distinct color', () => {
    const m = assignSpeakerSides(beats)
    expect(m['小明'].color).not.toBe(m['朋友'].color)
    expect(typeof m['小明'].color).toBe('string')
  })
  it('ignores narration lines', () => {
    expect(assignSpeakerSides([{ speaker: null, text: 'x' }])).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/chatReading.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/chatReading.js`:

```js
// Bubble layout for chat-format stories: assign each distinct speaker a stable
// side (first speaker left, second right, alternating after) and a color from a
// fixed palette. Narration lines (no speaker) render as centered system text and
// are not keyed here. Pure — unit-tested.
const PALETTE = ['#B83A24', '#2E6FB8', '#2F9E6D', '#C2680E', '#7C5CD0', '#B83A7A']

export function assignSpeakerSides(beats) {
  const map = {}
  let n = 0
  for (const b of beats || []) {
    if (!b.speaker || map[b.speaker]) continue
    map[b.speaker] = { side: n % 2 === 0 ? 'left' : 'right', color: PALETTE[n % PALETTE.length] }
    n += 1
  }
  return map
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/chatReading.test.js` → PASS (3). Then `npx vitest run` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/chatReading.js src/chatReading.test.js
git commit -m "feat(reader): assignSpeakerSides pure helper for chat bubbles"
```

---

## Task 3: ChatReader + dispatcher wiring + e2e

**Files:**
- Create: `src/ChatReader.jsx`
- Modify: `src/StoryReader.jsx`, `tests/fixtures/mockSupabase.js`, `tests/e2e/reader.spec.js`

**Interfaces:**
- Consumes: `useStoryReaderCore` (Task 1), `ReaderLaunch`/`WordLookupSheet`/`FinishOverlay` (Task 1), `assignSpeakerSides` (Task 2), `chatStyleFor` from `./chatMissions`, `wordStatus` from `./storyReading`, `getLevelLabel` from `./utils`.

- [ ] **Step 1: Create `src/ChatReader.jsx`**:

```jsx
import { useMemo, useRef, useEffect, useState } from 'react'
import { getLevelLabel } from './utils'
import { wordStatus } from './storyReading'
import { chatStyleFor } from './chatMissions'
import { useStoryReaderCore } from './useStoryReaderCore'
import { assignSpeakerSides } from './chatReading'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }

// Chat-format reader: reads a conversation as tap-to-reveal bubbles. Observer
// only (no "you" bubbles). Shares all behavior with the paced reader via
// useStoryReaderCore; only the presentation (bubble thread) is bespoke.
export default function ChatReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const skin = chatStyleFor(track.language)
  const sides = useMemo(() => assignSpeakerSides(c.beats), [c.beats])
  const levelLabel = getLevelLabel(track.language, track.system, story.level)

  const endRef = useRef(null)
  const [typing, setTyping] = useState(false)

  // Auto-scroll to the newest revealed bubble.
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: c.reduceMotion ? 'auto' : 'smooth', block: 'end' }) }, [c.cur, typing, c.reduceMotion])

  // Brief "typing…" shimmer before a *character* bubble reveals (not during Play,
  // not under reduced-motion). Purely cosmetic; the beat is already advanced.
  useEffect(() => {
    if (!c.started || c.playing || c.reduceMotion) return undefined
    const b = c.beats[c.cur]
    if (!b || !b.speaker || c.cur === 0) return undefined
    setTyping(true)
    const t = setTimeout(() => setTyping(false), 500)
    return () => clearTimeout(t)
  }, [c.cur, c.started, c.playing, c.reduceMotion, c.beats])

  if (!c.started) {
    return <ReaderLaunch story={story} isRead={isRead} levelLabel={levelLabel} accent={accent} theme={c.theme} readability={c.readability} onStart={c.start} onBack={onBack} />
  }

  const revealed = c.beats.slice(0, c.cur + 1)

  return (
    <div style={{ minHeight: '100vh', background: skin.bg, color: '#111', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px', background: skin.bg }}>
        <button onClick={c.backToStart} aria-label="Back to start" style={ghost}><ArrowLeft size={18} color="#4a4a4a" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#333', fontFamily: c.theme.font }}>{story.title}</div>
        <div style={{ fontSize: '12px', color: '#666', minWidth: '34px', textAlign: 'right' }}>{c.cur + 1}/{c.total}</div>
      </div>

      <div onClick={() => { c.stopPlay(); c.advance() }} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ maxWidth: '620px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {revealed.map((b, i) => {
            if (!b.speaker) {
              return <div key={i} style={{ textAlign: 'center', fontSize: '12.5px', color: '#5a5a5a', fontStyle: 'italic', margin: '6px 0', fontFamily: c.theme.font }}>{b.text}</div>
            }
            const meta = sides[b.speaker] || { side: 'left', color: accent }
            const isLast = i === c.cur
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: meta.side === 'right' ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: meta.color, margin: '0 8px 3px', fontFamily: c.theme.font }}>{b.speaker}</div>
                <div style={{ maxWidth: '82%', background: meta.side === 'right' ? skin.myBubble : skin.theirBubble, color: meta.side === 'right' ? skin.myText : '#111', border: meta.side === 'right' ? 'none' : '1px solid rgba(0,0,0,0.06)', borderRadius: '16px', padding: '9px 13px', boxShadow: '0 1px 2px rgba(0,0,0,0.07)', outline: isLast ? '2px solid ' + meta.color + '44' : 'none' }}>
                  {c.showPy && <div style={{ fontSize: '11.5px', opacity: 0.6, marginBottom: '3px', lineHeight: 1.4 }}>{b.tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ')}</div>}
                  <div style={{ fontSize: '19px', lineHeight: 1.55, fontFamily: c.theme.font }}>
                    {b.tokens.map((t, k) => {
                      if (!t.vocab) return <span key={k}>{t.text}</span>
                      const status = wordStatus(t.vocab.id, userCards)
                      return (
                        <span key={k} onClick={(e) => { e.stopPropagation(); c.selectWord(t.vocab, status) }}
                          style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px', background: status === 'not_started' ? accent + '22' : (status === 'learning' ? '#CA8A0426' : 'transparent') }}>{t.text}</span>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
          {typing && <div style={{ alignSelf: 'flex-start', background: skin.theirBubble, borderRadius: '16px', padding: '10px 14px', fontSize: '14px', color: '#888' }}>typing…</div>}
          <div ref={endRef} />
        </div>
      </div>
      <div aria-live="polite" style={srOnly}>{c.beats[c.cur] ? c.beats[c.cur].text : ''}</div>

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

- [ ] **Step 2: Route `'chat'` in `src/StoryReader.jsx`.** Add `import ChatReader from './ChatReader'` and add a branch before the paced/classic returns:

```jsx
  if (mode === 'chat') return <ChatReader {...props} />
  if (mode === 'paced') return <PacedReader {...props} />
  return <StoryReaderImmersive {...props} />
```

- [ ] **Step 3: Add a chat story to the mock.** In `tests/fixtures/mockSupabase.js`, change the `STORIES` array to include a second story with `presentation:'chat'` (keep the existing paced one):

```js
const STORIES = [{
  id: 'st1', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 1,
  title: '公园里的下午', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An afternoon at the park.',
  content: ['今天天气很好。', '小明：我们去公园吧！', '朋友：你看，花很好！'].join('\n'),
}, {
  id: 'st2', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 2,
  title: '朋友的问题', is_published: true, presentation: 'chat', has_audio: false,
  image_path: null, english_content: 'Two friends chat.',
  content: ['小明：你今天好吗？', '朋友：我很好！', '小明：我们去公园。'].join('\n'),
}];
```

- [ ] **Step 4: Add chat-story e2e.** Append to `tests/e2e/reader.spec.js`:

```js
test('chat reveal: opens a chat story and reveals bubbles on tap', async ({ page }) => {
  const reader = new ReaderPage(page);
  await reader.gotoStories();
  // Open the chat story by title (walk the category → list like openFirstStory).
  const title = page.getByText('朋友的问题').first();
  for (let i = 0; i < 3; i++) {
    if (await title.isVisible().catch(() => false)) break;
    const card = page.getByRole('button').filter({ hasText: /HSK|First|words|Tier/i }).first();
    if (await card.isVisible().catch(() => false)) await card.click();
    await page.waitForTimeout(200);
  }
  await title.click();

  await page.getByRole('button', { name: /Start reading/i }).click();
  await expect(page.getByText('1/3')).toBeVisible();
  await expect(page.getByText('你今天好吗', { exact: false })).toBeVisible();
  // Tap the thread to reveal the next bubble.
  await page.getByText(/Tap anywhere to continue/i).click();
  await expect(page.getByText('2/3')).toBeVisible();
  await expect(page.getByText('我很好', { exact: false })).toBeVisible();
});
```

If `ReaderPage` needs a helper to open a story by title, add `openStoryByTitle(title)` to `tests/pages/ReaderPage.js` mirroring `openFirstStory`'s category-walk, and use it here.

- [ ] **Step 5: Run e2e + build + lint**

Run: `npx playwright test reader --project=chromium` → PASS (paced + chat tests). `npm run build` succeeds; `npx eslint src/ChatReader.jsx src/StoryReader.jsx` exit 0; `npx vitest run` unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/ChatReader.jsx src/StoryReader.jsx tests/fixtures/mockSupabase.js tests/e2e/reader.spec.js tests/pages/ReaderPage.js
git commit -m "feat(reader): ChatReader bubble thread (tap-to-reveal) + dispatcher wiring + e2e"
```

---

## Task 4: "💬 Chat" badge on chat story cards

**Files:**
- Modify: `src/Stories.jsx`

- [ ] **Step 1: Locate the story card.** In `src/Stories.jsx`, find `StoryListCard` (~line 179) — the button that renders a story in the list.

- [ ] **Step 2: Add the badge.** Where the card renders the story title, add a small inline badge when `story.presentation === 'chat'`. Add next to the title text:

```jsx
{story.presentation === 'chat' && (
  <span style={{ marginLeft: '7px', fontSize: '10.5px', fontWeight: 800, color: '#2E6FB8', background: '#2E6FB815', border: '1px solid #2E6FB833', borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap' }}>💬 Chat</span>
)}
```

(Match the existing title element's flex/layout so the badge sits inline; read the surrounding JSX and place it in the title row.)

- [ ] **Step 3: Verify + commit**

Run: `npx playwright test reader --project=chromium` (still green — the badge doesn't break navigation); `npm run build`; `npx eslint src/Stories.jsx`.

```bash
git add src/Stories.jsx
git commit -m "feat(stories): show a Chat badge on chat-format story cards"
```

---

## Task 5: Author chat stories + `presentation` passthrough

**Files:**
- Modify: `authored-stories.mjs`, `data/authored-stories.json`

**Interfaces:**
- Consumes: the `presentation` column (Phase 1 migration).

- [ ] **Step 1: Pass `presentation` through on insert.** In `authored-stories.mjs`, find the object built for each story insert (the `.insert({...})` / row mapping — search for `title`, `content`, `tier`). Add `presentation: entry.presentation || 'paced'` to the inserted row so authored chat entries land as `'chat'` (and existing entries default to `'paced'`).

- [ ] **Step 2: Add authored Chinese chat stories.** Append these entries to the array in `data/authored-stories.json` (two speakers, HSK 1–2 vocabulary, natural short exchanges):

```json
{
  "language": "chinese", "system": "hsk_3", "level": 1, "tier": 1, "tier_min_words": 0,
  "presentation": "chat",
  "title": "放学以后",
  "english_summary": "Two classmates make an after-school plan over text.",
  "content": "小明：你好！你现在忙吗？\n朋友：不忙，怎么了？\n小明：放学以后，我们一起去公园吧。\n朋友：好啊！我也想去。\n小明：我们几点去？\n朋友：四点，好吗？\n小明：好，四点在学校门口见。\n朋友：没问题，一会儿见！"
},
{
  "language": "chinese", "system": "hsk_3", "level": 1, "tier": 1, "tier_min_words": 0,
  "presentation": "chat",
  "title": "今天吃什么",
  "english_summary": "A quick chat about what to eat for dinner.",
  "content": "妈妈：你今天想吃什么？\n小明：我想吃面条。\n妈妈：家里没有面条了。\n小明：那我们吃米饭和鸡蛋，好吗？\n妈妈：好。你饿了吗？\n小明：有一点饿。\n妈妈：那我现在做饭。\n小明：谢谢妈妈！"
},
{
  "language": "chinese", "system": "hsk_3", "level": 2, "tier": 1, "tier_min_words": 0,
  "presentation": "chat",
  "title": "周末做什么",
  "english_summary": "Two friends compare weekend plans.",
  "content": "朋友：这个周末你有空吗？\n小明：有空。你想做什么？\n朋友：我想去看电影。\n小明：好主意！看什么电影？\n朋友：一个新的中国电影，听说很好看。\n小明：几点的？\n朋友：星期六下午三点。\n小明：太好了，我们一起去！"
}
```

(These reuse common HSK 1–2 words. The exact vocabulary rows must exist in the DB for `% known`/tapping; that's true of all authored stories and is handled by the vocab seed, not this plan.)

- [ ] **Step 3: Verify JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/authored-stories.json','utf8')); console.log('ok')"` → `ok`.
(The authored stories are seeded into the DB by the user via the existing authored-stories pipeline with their keys — not run here. The e2e mock fixture from Task 3 covers the renderer.)

- [ ] **Step 4: Commit**

```bash
git add authored-stories.mjs data/authored-stories.json
git commit -m "feat(content): authored Chinese chat stories + presentation passthrough"
```

---

## Task 6: Visual verification + ship roadmap

- [ ] **Step 1: Visual check** — via the throwaway-harness pattern (mount `ChatReader` with a 2-speaker sample story + vocab, `npm run dev:e2e`, screenshot launch → Start → tap-reveal bubbles → typing shimmer → word sheet → finish, light + dark). Confirm bubble sides/colors, narration centering, typing indicator, auto-scroll. Delete the harness after.

- [ ] **Step 2: Full sweep** — `npx vitest run` (all pass) and `npx playwright test --project=chromium` (all pass).

- [ ] **Step 3: Roadmap → Shipped.** In `ROADMAP.md`, move the "Chat-format stories" line from 🔜 Next to ✅ Shipped:

```md
- [x] **Chat-format stories** — read a story as a messaging conversation that unfolds one bubble at a time
```

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): ship chat-format stories"
```

---

## Self-Review notes

- **Spec coverage:** ChatReader/dispatcher (T3), shared-core extraction (T1), bubble side/color (T2), typing shimmer + auto-scroll + observer bubbles (T3), word-lookup/audio/%known/finish parity via the hook (T1 reused by T3), chat badge (T4), authored content + `presentation` passthrough (T5), visual + roadmap (T6). Observer-only / no reply choices honored.
- **Interfaces:** `useStoryReaderCore(props)` return shape, `assignSpeakerSides(beats)`, and the shared component props are defined in T1/T2 and consumed identically in T3. `STORY_FINISH_XP` moves to the hook (single source).
- **Regression guard:** the Phase 1 reader e2e must stay green after the T1 extraction — it's called out in T1 Step 6.
- **Read at execution time:** `src/Stories.jsx` `StoryListCard` (T4 placement), `authored-stories.mjs` insert row (T5 Step 1), `tests/pages/ReaderPage.js` (T3 Step 4 helper).
