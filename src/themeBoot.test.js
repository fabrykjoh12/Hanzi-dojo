import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  bootTheme, isTheme, readStoredTheme, rememberTheme, prefersDarkScheme,
  initialTheme,
} from './themeBoot'

// The suite runs in the node environment (vitest.config.js), so localStorage is
// faked on globalThis exactly where themeBoot.js looks for it — the same
// pattern as dojoLocalClient.test.js and nativeShell.test.js.
const store = new Map()

function installStorage(overrides = {}) {
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
    ...overrides,
  }
}

describe('isTheme', () => {
  it('accepts only the two real themes', () => {
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('light')).toBe(true)
    expect(isTheme('DARK')).toBe(false)
    expect(isTheme('')).toBe(false)
    expect(isTheme(null)).toBe(false)
    expect(isTheme(undefined)).toBe(false)
  })
})

describe('bootTheme', () => {
  it('honours a remembered choice over the OS setting', () => {
    expect(bootTheme({ stored: 'light', prefersDark: true })).toBe('light')
    expect(bootTheme({ stored: 'dark', prefersDark: false })).toBe('dark')
  })

  it('falls back to the OS setting when nothing was chosen', () => {
    expect(bootTheme({ stored: null, prefersDark: true })).toBe('dark')
    expect(bootTheme({ stored: null, prefersDark: false })).toBe('light')
  })

  it('ignores a corrupted stored value rather than trusting it', () => {
    expect(bootTheme({ stored: 'purple', prefersDark: true })).toBe('dark')
    expect(bootTheme({ stored: '{}', prefersDark: false })).toBe('light')
  })

  it('defaults to light with no information at all', () => {
    expect(bootTheme()).toBe('light')
    expect(bootTheme({})).toBe('light')
  })
})

describe('readStoredTheme / rememberTheme', () => {
  beforeEach(() => {
    store.clear()
    installStorage()
  })

  afterEach(() => {
    delete globalThis.localStorage
  })

  it('round-trips a real theme', () => {
    rememberTheme('dark')
    expect(readStoredTheme()).toBe('dark')
    rememberTheme('light')
    expect(readStoredTheme()).toBe('light')
  })

  it('refuses to store a value that is not a theme', () => {
    rememberTheme('dark')
    rememberTheme('rainbow')
    expect(readStoredTheme()).toBe('dark')
  })

  it('reads null when nothing was ever stored', () => {
    expect(readStoredTheme()).toBe(null)
  })

  it('ignores a stored value that is not a theme', () => {
    store.set('hd:theme', 'aubergine')
    expect(readStoredTheme()).toBe(null)
  })

  it('survives storage throwing on read', () => {
    installStorage({ getItem: () => { throw new Error('blocked') } })
    expect(readStoredTheme()).toBe(null)
  })

  it('survives storage throwing on write', () => {
    installStorage({ setItem: () => { throw new Error('quota') } })
    expect(() => rememberTheme('dark')).not.toThrow()
  })

  it('survives storage being absent entirely', () => {
    delete globalThis.localStorage
    expect(readStoredTheme()).toBe(null)
    expect(() => rememberTheme('dark')).not.toThrow()
  })
})

describe('prefersDarkScheme', () => {
  it('reads the media query', () => {
    expect(prefersDarkScheme({ matchMedia: () => ({ matches: true }) })).toBe(true)
    expect(prefersDarkScheme({ matchMedia: () => ({ matches: false }) })).toBe(false)
  })

  it('is false where matchMedia is missing or throws', () => {
    expect(prefersDarkScheme({})).toBe(false)
    expect(prefersDarkScheme(null)).toBe(false)
    expect(prefersDarkScheme({ matchMedia: () => { throw new Error('nope') } })).toBe(false)
  })
})

describe('initialTheme', () => {
  beforeEach(() => {
    store.clear()
    installStorage()
  })

  afterEach(() => {
    delete globalThis.localStorage
  })

  it('prefers the remembered choice', () => {
    rememberTheme('light')
    expect(initialTheme({ matchMedia: () => ({ matches: true }) })).toBe('light')
  })

  it('uses the OS setting when nothing is remembered', () => {
    expect(initialTheme({ matchMedia: () => ({ matches: true }) })).toBe('dark')
    expect(initialTheme({ matchMedia: () => ({ matches: false }) })).toBe('light')
  })
})
