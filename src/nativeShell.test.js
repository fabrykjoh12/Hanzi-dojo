import { describe, it, expect, afterEach } from 'vitest'
import {
  isNativeApp, routeFromDeepLink, backAction, APP_URL_SCHEME,
  consumeLaunchUrl, resetLaunchUrlConsumed,
} from './nativeShell'

// The suite runs in the node environment (vitest.config.js), so `window` is
// faked on globalThis exactly where nativeShell.js looks for it.
afterEach(() => {
  delete globalThis.window
})

describe('isNativeApp', () => {
  it('is false with no window at all (node, tests)', () => {
    expect(isNativeApp()).toBe(false)
  })

  it('is false in a plain browser (no Capacitor global)', () => {
    globalThis.window = {}
    expect(isNativeApp()).toBe(false)
  })

  it('is false on the Capacitor web platform', () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => false } }
    expect(isNativeApp()).toBe(false)
  })

  it('is true inside the native shell', () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => true } }
    expect(isNativeApp()).toBe(true)
  })

  it('never throws on a broken global', () => {
    globalThis.window = { Capacitor: { isNativePlatform: 'not a function' } }
    expect(isNativeApp()).toBe(false)
    globalThis.window = {
      Capacitor: {
        isNativePlatform() {
          throw new Error('boom')
        },
      },
    }
    expect(isNativeApp()).toBe(false)
  })
})

describe('routeFromDeepLink', () => {
  it('maps universal links on our hosts to in-app routes', () => {
    expect(routeFromDeepLink('https://hanzi-dojo.com/read/abc-123')).toBe('/read/abc-123')
    expect(routeFromDeepLink('https://www.hanzi-dojo.com/stories')).toBe('/stories')
    expect(routeFromDeepLink('https://hanzi-dojo.com/')).toBe('/')
  })

  it('keeps query and hash', () => {
    expect(routeFromDeepLink('https://hanzi-dojo.com/read/abc?level=2#top')).toBe('/read/abc?level=2#top')
  })

  it('rejects foreign hosts outright', () => {
    expect(routeFromDeepLink('https://evil.example.com/read/abc')).toBe(null)
    expect(routeFromDeepLink('https://hanzi-dojo.com.evil.example/read/abc')).toBe(null)
  })

  it('maps custom-scheme links, where the first segment parses as the host', () => {
    expect(routeFromDeepLink(APP_URL_SCHEME + '://read/abc-123')).toBe('/read/abc-123')
    expect(routeFromDeepLink(APP_URL_SCHEME + '://profile')).toBe('/profile')
    expect(routeFromDeepLink(APP_URL_SCHEME + '://auth-callback?code=xyz')).toBe('/auth-callback?code=xyz')
  })

  it('rejects other schemes and garbage without throwing', () => {
    expect(routeFromDeepLink('mailto:hi@hanzi-dojo.com')).toBe(null)
    expect(routeFromDeepLink('not a url')).toBe(null)
    expect(routeFromDeepLink('')).toBe(null)
    expect(routeFromDeepLink(undefined)).toBe(null)
    expect(routeFromDeepLink(42)).toBe(null)
  })
})

describe('consumeLaunchUrl', () => {
  // The regression this exists for: `App.getLaunchUrl()` returns the launching
  // URL for the whole app run, and react-router recreates `navigate` on every
  // navigation — so an effect keyed on it re-read that URL on every tab tap,
  // re-spent its one-time auth code, failed, and threw the learner back to
  // Home. Only a fresh launch (no URL) appeared to "fix" it.
  it('hands back the launch URL exactly once per app run', () => {
    resetLaunchUrlConsumed()
    expect(consumeLaunchUrl('com.hanzidojo.app://password-reset?code=abc'))
      .toBe('com.hanzidojo.app://password-reset?code=abc')
    expect(consumeLaunchUrl('com.hanzidojo.app://password-reset?code=abc')).toBe(null)
    expect(consumeLaunchUrl('com.hanzidojo.app://read/other')).toBe(null)
  })

  it('an ordinary launch (no URL) still burns the one shot', () => {
    resetLaunchUrlConsumed()
    expect(consumeLaunchUrl(undefined)).toBe(null)
    // Nothing may sneak in later claiming to be the launch URL.
    expect(consumeLaunchUrl('com.hanzidojo.app://password-reset?code=abc')).toBe(null)
  })
})

describe('backAction', () => {
  it('exits only from Home', () => {
    expect(backAction('/', true)).toBe('exit')
    expect(backAction('/', false)).toBe('exit')
    expect(backAction('', false)).toBe('exit')
  })

  it('goes back through history when it can', () => {
    expect(backAction('/study', true)).toBe('back')
    expect(backAction('/read/abc', true)).toBe('back')
  })

  it('falls back to Home when there is no history (cold deep link)', () => {
    expect(backAction('/study', false)).toBe('home')
  })
})
