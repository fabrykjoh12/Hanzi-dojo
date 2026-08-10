/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState, useEffect, useRef } from 'react'
import { render, act, cleanup, within, fireEvent } from '@testing-library/react'
import TabHost from './TabHost'
import { initialNavState, selectTab } from './navStack'
import SessionPaused from './SessionPaused'
import { useStudyAudio } from './useStudyAudio'
import { stopAllAudio } from './audioPlayback'

// Found on a physical iPhone, build 30:
//
//   an unfinished session → leave Cards → come back → the "Continue session"
//   screen appears → and the pronunciation of the card that had been open
//   plays, out loud, behind it.
//
// The card was not being presented. Nothing on screen belonged to it. The
// Cards root is persistent, so returning to the tab re-attaches Study's
// effects — and an autoplay written as "when `flipped` changes" fired, because
// `flipped` was still true from before the learner left.
//
// These specs put the real hook inside the real tab lifecycle and count sound.

vi.mock('./supabase', () => ({
  supabase: { from: () => ({ update: () => ({ eq: () => ({ then: () => {} }) }) }) },
}))
vi.mock('./audioCache', () => ({ ensureAudio: vi.fn(), readyUrl: () => null }))
vi.mock('./ttsAudio', () => ({
  flashcardAudio: (v) => ({ word: 'https://example.test/' + v.id + '.mp3', word_slow: null }),
}))

const built = []
class FakeAudio {
  constructor() {
    this.paused = true
    this.playCount = 0
    this.readyState = 0
    this.error = null
    this.onerror = null
    this.src = ''
    built.push(this)
  }
  play() { this.playCount += 1; this.paused = false; return Promise.resolve() }
  pause() { this.paused = true }
}

// Every word spoken since the test began, across every element the hook built.
const played = () => built.reduce((n, el) => n + el.playCount, 0)

const QUEUE = [
  { id: 'c1', vocab: { id: 'v1', word: '学校' } },
  { id: 'c2', vocab: { id: 'v2', word: '老师' } },
]

// Study's session lifecycle around the REAL audio hook. The flashcard itself is
// two elements — what is under test is which state the audio is allowed to fire
// in, not how a card renders.
function SessionProbe({ autoplay = true }) {
  const [queue, setQueue] = useState(QUEUE)
  const [flipped, setFlipped] = useState(false)
  const [paused, setPaused] = useState(false)
  const [awaitingContinue, setAwaitingContinue] = useState(false)

  const cardPresented = !paused && !awaitingContinue && queue.length > 0
  const { playAudio } = useStudyAudio({
    queue,
    flipped,
    presenting: cardPresented,
    profile: { audio_speed: 1, audio_autoplay: autoplay },
    session: { user: { id: 'u1' } },
    onProfileUpdate: () => {},
  })

  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => () => {
    if (pausedRef.current) { setPaused(false); setAwaitingContinue(true) }
  }, [])

  if (!cardPresented) {
    const resume = () => { setPaused(false); setAwaitingContinue(false) }
    return (
      <SessionPaused
        variant={paused ? 'paused' : 'continue'}
        studied={1}
        remaining={queue.length}
        accentHex="#B83A24"
        onResume={resume}
        onFinish={resume}
      />
    )
  }
  return (
    <div>
      <div data-testid="word">{queue[0].vocab.word}</div>
      {!flipped && <button onClick={() => setFlipped(true)}>Reveal</button>}
      <button onClick={playAudio}>Replay</button>
      <button onClick={() => { setFlipped(false); setQueue(q => q.slice(1)) }}>Good</button>
      <button aria-label="Close study session" onClick={() => setPaused(true)}>X</button>
    </div>
  )
}

function Shell({ nav, autoplay }) {
  return (
    <TabHost
      nav={nav}
      mounted={new Set(['home', 'study'])}
      render={(tab) => (tab === 'study' ? <SessionProbe autoplay={autoplay} /> : <span>{tab}</span>)}
      scrollFor={() => 0}
      onScrollCapture={() => {}}
    />
  )
}

const pane = (view) => view.container.querySelector('[data-tab-root="study"]')
const tap = (view, name) => fireEvent.click(within(pane(view)).getByRole('button', { name }))

let nav
beforeEach(() => {
  built.length = 0
  stopAllAudio()
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })
  nav = selectTab(initialNavState(), 'study')
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); stopAllAudio() })

function leaveAndReturn(view, autoplay) {
  act(() => { view.rerender(<Shell nav={selectTab(nav, 'home')} autoplay={autoplay} />) })
  act(() => { view.rerender(<Shell nav={nav} autoplay={autoplay} />) })
}

// A card open, revealed, spoken once — the state the device was left in.
function openAndReveal(autoplay) {
  const view = render(<Shell nav={nav} autoplay={autoplay} />)
  act(() => { tap(view, 'Reveal') })
  return view
}

describe('coming back to an unfinished session', () => {
  it('shows the Continue screen without a sound', () => {
    const view = openAndReveal()
    expect(played()).toBe(1)          // the reveal itself, before leaving

    act(() => { tap(view, 'Close study session') })
    leaveAndReturn(view)

    expect(within(pane(view)).getByText('Unfinished session')).toBeTruthy()
    // THE finding. Not one more word than the learner's own reveal.
    expect(played()).toBe(1)
  })

  it('keeps the exact card that was open', () => {
    const view = openAndReveal()
    act(() => { tap(view, 'Close study session') })
    leaveAndReturn(view)
    act(() => { tap(view, /Continue session/) })
    expect(within(pane(view)).getByTestId('word').textContent).toBe('学校')
  })

  it('reveals that card again on Continue', () => {
    const view = openAndReveal()
    act(() => { tap(view, 'Close study session') })
    leaveAndReturn(view)
    act(() => { tap(view, /Continue session/) })
    // Still revealed — Continue resumes the session, it does not restart the card.
    expect(within(pane(view)).queryByRole('button', { name: 'Reveal' })).toBe(null)
  })

  it('never speaks before Continue, however many times the tab is switched', () => {
    const view = openAndReveal()
    act(() => { tap(view, 'Close study session') })
    for (let i = 0; i < 5; i += 1) leaveAndReturn(view)
    expect(within(pane(view)).getByText('Unfinished session')).toBeTruthy()
    expect(played()).toBe(1)
  })

  it('does not re-announce the word the learner already heard, on Continue', () => {
    const view = openAndReveal()
    act(() => { tap(view, 'Close study session') })
    leaveAndReturn(view)
    act(() => { tap(view, /Continue session/) })
    // The card did not newly enter — it came back exactly as it was left.
    // Hearing it again is one tap away (below), never automatic.
    expect(played()).toBe(1)
  })

  it('still autoplays the next card after resuming', () => {
    const view = openAndReveal()
    act(() => { tap(view, 'Close study session') })
    leaveAndReturn(view)
    act(() => { tap(view, /Continue session/) })
    act(() => { tap(view, 'Good') })      // → next card, face down
    expect(played()).toBe(1)
    act(() => { tap(view, 'Reveal') })    // a genuine card entry
    expect(played()).toBe(2)
  })

  it('still lets the learner replay by hand after resuming', () => {
    const view = openAndReveal()
    act(() => { tap(view, 'Close study session') })
    leaveAndReturn(view)
    act(() => { tap(view, /Continue session/) })
    act(() => { tap(view, 'Replay') })
    expect(played()).toBe(2)
  })
})

describe('the card view itself', () => {
  it('speaks once when the card is revealed', () => {
    const view = openAndReveal()
    expect(played()).toBe(1)
    // A re-render is not a second reveal.
    act(() => { view.rerender(<Shell nav={nav} />) })
    expect(played()).toBe(1)
  })

  it('says nothing when the learner has autoplay off', () => {
    const view = openAndReveal(false)
    expect(played()).toBe(0)
    act(() => { tap(view, 'Replay') })   // …but the button still works
    expect(played()).toBe(1)
  })

  it('stops a word that is playing when the tab is hidden', () => {
    const view = openAndReveal()
    const speaking = built[built.length - 1]
    expect(speaking.paused).toBe(false)
    act(() => { view.rerender(<Shell nav={selectTab(nav, 'home')} />) })
    expect(speaking.paused).toBe(true)
  })

  it('does not speak on returning to a session that was never paused', () => {
    // Leaving Cards without pressing X (a deep link, hardware back) keeps the
    // card presented. Returning still must not replay it.
    const view = openAndReveal()
    leaveAndReturn(view)
    expect(within(pane(view)).getByTestId('word').textContent).toBe('学校')
    expect(played()).toBe(1)
  })
})
