/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, render, act, cleanup } from '@testing-library/react'
import { Activity, useEffect } from 'react'
import { useStudyAudio } from './useStudyAudio'
import { currentPlayback, stopAllAudio } from './audioPlayback'

// The Cards tab is about to become a persistent root, so hiding it runs this
// hook's cleanup instead of unmounting the component. These specs are the proof
// that a word stops speaking when the learner leaves the tab, and that doing it
// repeatedly does not pile up elements.

vi.mock('./supabase', () => ({
  supabase: { from: () => ({ update: () => ({ eq: () => ({ then: () => {} }) }) }) },
}))
vi.mock('./audioCache', () => ({ ensureAudio: vi.fn(), readyUrl: () => null }))
vi.mock('./ttsAudio', () => ({
  flashcardAudio: () => ({ word: 'https://example.test/word.mp3', word_slow: null }),
}))

// jsdom has no media stack, so a fake stands in for <audio>. It records every
// instance ever built, which is exactly what "no duplicates accumulate" needs.
const built = []
class FakeAudio {
  constructor() {
    this.paused = true
    this.playCount = 0
    this.pauseCount = 0
    this.readyState = 0
    this.error = null
    this.onerror = null
    this.src = ''
    built.push(this)
  }
  play() { this.playCount += 1; this.paused = false; return Promise.resolve() }
  pause() { this.pauseCount += 1; this.paused = true }
}

const CARD = { id: 'c1', vocab: { id: 'v1', word: '学校' } }
const PROPS = {
  queue: [CARD],
  flipped: false,
  profile: { audio_speed: 1, audio_autoplay: false },
  session: { user: { id: 'u1' } },
  onProfileUpdate: () => {},
}

afterEach(cleanup)

beforeEach(() => {
  built.length = 0
  stopAllAudio()
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })
})

afterEach(() => {
  vi.unstubAllGlobals()
  stopAllAudio()
})

describe('useStudyAudio teardown', () => {
  it('pauses the element when the hook goes away', () => {
    const { result, unmount } = renderHook(() => useStudyAudio(PROPS))
    act(() => { result.current.playAudio() })
    expect(built).toHaveLength(1)
    expect(built[0].paused).toBe(false)

    unmount()
    expect(built[0].paused).toBe(true)
    expect(built[0].pauseCount).toBeGreaterThan(0)
  })

  it('hands the element back to the one-voice registry', () => {
    const { result, unmount } = renderHook(() => useStudyAudio(PROPS))
    act(() => { result.current.playAudio() })
    expect(currentPlayback()).toBe(built[0])
    unmount()
    // Leaving a dead element registered means the next thing that speaks
    // silences something nobody can hear.
    expect(currentPlayback()).toBe(null)
  })

  it('invalidates any fallback fetch still in the air', () => {
    const { result, unmount } = renderHook(() => useStudyAudio(PROPS))
    act(() => { result.current.playAudio() })
    const el = built[0]
    unmount()
    // playAudioEl's blob fallback checks this marker before it plays; -1 can
    // never equal a real attempt number, so a late fetch cannot start audio.
    expect(el.__hdAttempt).toBe(-1)
  })

  it('revokes the fallback blob url rather than leaking one per cycle', () => {
    const { result, unmount } = renderHook(() => useStudyAudio(PROPS))
    act(() => { result.current.playAudio() })
    built[0].__hdBlobUrl = 'blob:fake'
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('does not throw when nothing ever played', () => {
    const { unmount } = renderHook(() => useStudyAudio(PROPS))
    expect(() => unmount()).not.toThrow()
    expect(built).toHaveLength(0)
  })
})

// The shape the shell actually produces: an <Activity> flipping between
// visible and hidden, which tears effects down and builds them back up while
// keeping the component mounted.
function Harness({ mode }) {
  return (
    <Activity mode={mode}>
      <Speaker />
    </Activity>
  )
}

let speaker = null
function Speaker() {
  const api = useStudyAudio(PROPS)
  // Published from an effect rather than during render: assigning to a module
  // variable while rendering is a side effect, and the linter is right to say so.
  useEffect(() => { speaker = api })
  return null
}

describe('hiding and showing the Cards tab', () => {
  it('stops a word that is playing when the tab is hidden', () => {
    const view = render(<Harness mode="visible" />)
    act(() => { speaker.playAudio() })
    expect(built[0].paused).toBe(false)

    // Cards → Stories.
    act(() => { view.rerender(<Harness mode="hidden" />) })
    expect(built[0].paused).toBe(true)
    view.unmount()
  })

  it('does not accumulate elements or leave any playing over repeated cycles', () => {
    const view = render(<Harness mode="visible" />)

    for (let i = 0; i < 5; i += 1) {
      act(() => { speaker.playAudio() })          // Cards: play a word
      act(() => { view.rerender(<Harness mode="hidden" />) })   // → Stories
      act(() => { view.rerender(<Harness mode="visible" />) })  // → Cards
    }

    // One element per visible period, never two alive at once…
    expect(built).toHaveLength(5)
    // …every element from a previous cycle is stopped…
    built.slice(0, -1).forEach((el) => expect(el.paused).toBe(true))
    // …and nothing is left holding the one-voice registry.
    expect(currentPlayback()).toBe(null)
    view.unmount()
  })

  it('plays again cleanly after coming back', () => {
    const view = render(<Harness mode="visible" />)
    act(() => { speaker.playAudio() })
    act(() => { view.rerender(<Harness mode="hidden" />) })
    act(() => { view.rerender(<Harness mode="visible" />) })
    act(() => { speaker.playAudio() })

    const latest = built[built.length - 1]
    expect(latest.paused).toBe(false)
    expect(currentPlayback()).toBe(latest)
    view.unmount()
  })
})
