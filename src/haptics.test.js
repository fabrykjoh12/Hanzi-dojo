import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tapFeedback, successFeedback, resetHapticsPlugin } from './haptics'

// The suite runs in the node environment (vitest.config.js), so `window` and
// `navigator` are faked on globalThis exactly where the module looks for them —
// the same pattern as nativeShell.test.js.
//
// `navigator` needs defineProperty rather than assignment: Node 22 ships its
// own getter-only global, so `globalThis.navigator = {}` throws and `delete`
// silently does nothing. The original descriptor is put back afterwards so no
// other spec inherits the fake.
const REAL_NAVIGATOR = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

function fakeNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
}

afterEach(() => {
  delete globalThis.window
  if (REAL_NAVIGATOR) Object.defineProperty(globalThis, 'navigator', REAL_NAVIGATOR)
  else delete globalThis.navigator
  resetHapticsPlugin()
})

// The web path is the one testable without a device: no Capacitor global means
// isNativeApp() is false, so both haptics fall through to navigator.vibrate
// exactly as they did before the plugin was added.
describe('haptics on the web', () => {
  let vibrate

  beforeEach(() => {
    resetHapticsPlugin()
    globalThis.window = {}
    vibrate = vi.fn()
    fakeNavigator({ vibrate })
  })

  it('taps with a single short pulse', () => {
    tapFeedback()
    expect(vibrate).toHaveBeenCalledWith(10)
  })

  it('confirms with a double pulse', () => {
    successFeedback()
    expect(vibrate).toHaveBeenCalledWith([14, 60, 14])
  })

  it('is silent rather than broken where the API does not exist', () => {
    fakeNavigator({})
    expect(() => tapFeedback()).not.toThrow()
    expect(() => successFeedback()).not.toThrow()
  })

  it('survives an API that throws', () => {
    fakeNavigator({ vibrate: () => { throw new Error('denied') } })
    expect(() => tapFeedback()).not.toThrow()
  })

  it('never reaches for the native plugin on the web', () => {
    // The web path must stay synchronous and dependency-free: importing the
    // plugin in a browser would be a wasted request on every graded card.
    tapFeedback()
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})

describe('haptics inside the native shell', () => {
  beforeEach(() => {
    resetHapticsPlugin()
    globalThis.window = { Capacitor: { isNativePlatform: () => true } }
    fakeNavigator({ vibrate: vi.fn() })
  })

  it('swallows a plugin call that fails asynchronously', async () => {
    // The plugin resolves here (it is a real dependency) and its web fallback
    // rejects on a platform with no Vibration API. An unhandled rejection would
    // be picked up by errorMonitor.js and filed as a client error — the app
    // reporting a bug because a phone declined to buzz.
    expect(() => tapFeedback()).not.toThrow()
    expect(() => successFeedback()).not.toThrow()
    // Drain the microtask queue so any unhandled rejection surfaces in this
    // test rather than in whichever one runs next.
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  })

  it('returns synchronously — a grade must never wait on the taptic engine', () => {
    const before = Date.now()
    tapFeedback()
    expect(Date.now() - before).toBeLessThan(50)
  })
})
