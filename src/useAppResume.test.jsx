/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useAppResume } from './useAppResume'
import { resetCache, setCacheScope, writeCache, readCache } from './dataCache'
import { HOME_COUNTS, HOME_HANDOFF } from './cacheEvents'
import { HOME_COUNTS_STALE_MS } from './appResume'

// The listener half. What matters here is not the arithmetic — appResume.test.js
// owns that — but that exactly one platform's events are listened to, that the
// listener is removed, and that a resume nothing made stale costs nothing.

// Hoisted, because vi.mock's factory is lifted above every `let` in the file.
// Only isNativeApp is replaced — the rest of nativeShell is real, and
// supabase.js reads it at import time.
const shell = vi.hoisted(() => ({ native: false }))
vi.mock('./nativeShell', async (importOriginal) => ({
  ...(await importOriginal()),
  isNativeApp: () => shell.native,
}))

const capacitor = vi.hoisted(() => ({ listeners: [], removed: 0 }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (name, fn) => {
      capacitor.listeners.push({ name, fn })
      return Promise.resolve({ remove: () => { capacitor.removed += 1 } })
    },
  },
}))

let resumes = []

function Harness() {
  useAppResume((info) => { resumes.push(info) })
  return null
}

// jsdom's visibilityState is read-only; this is the documented way to drive it.
function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

function invalidated(key) {
  const entry = readCache(key)
  return Boolean(entry && entry.invalidated)
}

beforeEach(() => {
  resetCache()
  setCacheScope({ userId: 'u1', language: 'chinese' })
  writeCache(HOME_COUNTS, { dueCount: 3 })
  writeCache(HOME_HANDOFF, { reward: null, daily: null })
  writeCache('stories:shelf', true)
  resumes = []
  capacitor.listeners = []
  capacitor.removed = 0
  shell.native = false
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 9, 10, 0, 0))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('on the web', () => {
  it('does no work when the app comes back after a few seconds', () => {
    render(<Harness />)
    act(() => { setVisibility('hidden') })
    act(() => { vi.setSystemTime(new Date(2026, 7, 9, 10, 0, 20)) })
    act(() => { setVisibility('visible') })

    expect(invalidated(HOME_COUNTS)).toBe(false)
    // The callback still runs — it reads the cache and finds nothing to do.
    expect(resumes).toEqual([{ keys: [] }])
  })

  it('marks the counts after a long background period', () => {
    render(<Harness />)
    act(() => { setVisibility('hidden') })
    act(() => { vi.setSystemTime(Date.now() + HOME_COUNTS_STALE_MS + 1000) })
    act(() => { setVisibility('visible') })

    expect(invalidated(HOME_COUNTS)).toBe(true)
    expect(invalidated(HOME_HANDOFF)).toBe(false)
    expect(invalidated('stories:shelf')).toBe(false)
  })

  it('marks the hand-off too when the app was open across midnight', () => {
    render(<Harness />)
    act(() => { vi.setSystemTime(new Date(2026, 7, 9, 23, 58, 0)) })
    act(() => { setVisibility('hidden') })
    act(() => { vi.setSystemTime(new Date(2026, 7, 10, 0, 2, 0)) })
    act(() => { setVisibility('visible') })

    expect(invalidated(HOME_COUNTS)).toBe(true)
    expect(invalidated(HOME_HANDOFF)).toBe(true)
    // Never the shelf.
    expect(invalidated('stories:shelf')).toBe(false)
  })

  it('registers no Capacitor listener at all', () => {
    render(<Harness />)
    expect(capacitor.listeners.length).toBe(0)
  })

  it('removes its listener when the shell goes away', () => {
    const view = render(<Harness />)
    view.unmount()
    act(() => { setVisibility('hidden') })
    act(() => { vi.setSystemTime(Date.now() + HOME_COUNTS_STALE_MS + 1000) })
    act(() => { setVisibility('visible') })
    expect(invalidated(HOME_COUNTS)).toBe(false)
    expect(resumes).toEqual([])
  })
})

describe('on the native shell', () => {
  beforeEach(() => { shell.native = true })

  it('listens to appStateChange and NOT to visibilitychange', async () => {
    render(<Harness />)
    await act(async () => { await Promise.resolve() })
    expect(capacitor.listeners.map(l => l.name)).toEqual(['appStateChange'])

    // A WKWebView fires visibilitychange too. If both were wired, this pair
    // would run the whole resume path a second time.
    act(() => { setVisibility('hidden') })
    act(() => { vi.setSystemTime(Date.now() + HOME_COUNTS_STALE_MS + 1000) })
    act(() => { setVisibility('visible') })
    expect(resumes).toEqual([])
    expect(invalidated(HOME_COUNTS)).toBe(false)
  })

  it('invalidates once per resume, through the plugin', async () => {
    render(<Harness />)
    await act(async () => { await Promise.resolve() })
    const fire = capacitor.listeners[0].fn

    act(() => { fire({ isActive: false }) })
    act(() => { vi.setSystemTime(Date.now() + HOME_COUNTS_STALE_MS + 1000) })
    act(() => { fire({ isActive: true }) })

    expect(resumes.length).toBe(1)
    expect(resumes[0].keys).toEqual([HOME_COUNTS])
  })

  it('removes the plugin listener on teardown', async () => {
    const view = render(<Harness />)
    await act(async () => { await Promise.resolve() })
    view.unmount()
    expect(capacitor.removed).toBe(1)
  })
})
