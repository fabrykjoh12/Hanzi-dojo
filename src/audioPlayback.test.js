import { describe, it, expect, vi, beforeEach } from 'vitest'
import { claimPlayback, releasePlayback, stopAllAudio, currentPlayback, cancelSpeech } from './audioPlayback.js'

// A stand-in for an <audio> element: only pause() matters to this module.
function fakeAudio() {
  return { paused: true, pause: vi.fn(function pause() { this.paused = true }) }
}

const cancel = vi.fn()

beforeEach(() => {
  cancel.mockClear()
  globalThis.window = { speechSynthesis: { cancel } }
  stopAllAudio()
  cancel.mockClear()
})

describe('claimPlayback', () => {
  it('stops whatever was already speaking', () => {
    const first = fakeAudio()
    const second = fakeAudio()
    claimPlayback(first)
    claimPlayback(second)
    expect(first.pause).toHaveBeenCalled()
    expect(currentPlayback()).toBe(second)
  })

  it('does not stop the element re-claiming itself', () => {
    const el = fakeAudio()
    claimPlayback(el)
    claimPlayback(el)
    expect(el.pause).not.toHaveBeenCalled()
  })

  it('also silences browser speech synthesis, which is a separate channel', () => {
    claimPlayback(fakeAudio())
    expect(cancel).toHaveBeenCalled()
  })

  it('survives an element that throws on pause', () => {
    const broken = { pause: () => { throw new Error('detached') } }
    claimPlayback(broken)
    expect(() => claimPlayback(fakeAudio())).not.toThrow()
  })
})

describe('stopAllAudio', () => {
  it('silences the current element and clears it', () => {
    const el = fakeAudio()
    claimPlayback(el)
    stopAllAudio()
    expect(el.pause).toHaveBeenCalled()
    expect(currentPlayback()).toBe(null)
  })

  it('is safe when nothing is playing', () => {
    expect(() => stopAllAudio()).not.toThrow()
  })
})

describe('releasePlayback', () => {
  it('stops and clears the element it owns', () => {
    const el = fakeAudio()
    claimPlayback(el)
    releasePlayback(el)
    expect(el.pause).toHaveBeenCalled()
    expect(currentPlayback()).toBe(null)
  })

  it('leaves the new owner alone when an old element unmounts late', () => {
    const outgoing = fakeAudio()
    const incoming = fakeAudio()
    claimPlayback(outgoing)
    claimPlayback(incoming)
    incoming.pause.mockClear()

    releasePlayback(outgoing)
    expect(incoming.pause).not.toHaveBeenCalled()
    expect(currentPlayback()).toBe(incoming)
  })
})

describe('cancelSpeech', () => {
  it('is a no-op where speech synthesis is unavailable', () => {
    globalThis.window = {}
    expect(() => cancelSpeech()).not.toThrow()
  })
})
