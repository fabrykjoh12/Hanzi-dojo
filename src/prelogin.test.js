import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  initialLandingMode, landingEntry, tutorialStage,
  savePreloginPrefs, readPreloginPrefs, clearPreloginPrefs, mergePreloginPrefs,
  readTutorialProgress, saveTutorialPosition, markTutorialDone, isTutorialDone,
} from './prelogin'

// What a visitor carries from before they have an account to after they have
// one. It used to be nine keys, four of which nothing ever read — which is how
// a learner ended up answering the same two questions twice. It is two now.

describe('where a signed-out visitor lands', () => {
  it('shows the app its own welcome and the web its marketing page', () => {
    expect(initialLandingMode(true)).toBe('welcome')
    expect(initialLandingMode(false)).toBe('landing')
    expect(initialLandingMode(undefined)).toBe('landing')
  })
})

describe('where a returning signed-out visitor resumes', () => {
  it('is the account form once the tutorial has been finished', () => {
    // They spent ninety seconds on it and then closed the app before signing
    // up. Showing the welcome again would read as the app having forgotten.
    expect(landingEntry({ native: true, tutorialDone: true })).toBe('auth')
    expect(landingEntry({ native: false, tutorialDone: true })).toBe('auth')
  })

  it('is the ordinary first screen otherwise', () => {
    expect(landingEntry({ native: true, tutorialDone: false })).toBe('welcome')
    expect(landingEntry({ native: false, tutorialDone: false })).toBe('landing')
    expect(landingEntry({})).toBe('landing')
  })

  it('lets a failed auth link speak first', () => {
    expect(landingEntry({ native: true, tutorialDone: false, authNotice: 'expired' })).toBe('auth')
  })
})

describe('the store', () => {
  beforeEach(() => {
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    })
  })

  it('round-trips what it was given', () => {
    savePreloginPrefs({ language: 'chinese', level: 3 })
    expect(readPreloginPrefs()).toEqual({ language: 'chinese', level: 3 })
    clearPreloginPrefs()
    expect(readPreloginPrefs()).toBe(null)
  })

  it('merges rather than replaces', () => {
    // The reading test's level and the tutorial's position are written by
    // different screens at different times. One must not erase the other.
    savePreloginPrefs({ language: 'chinese', level: 3 })
    mergePreloginPrefs({ tutorial: { done: true } })
    expect(readPreloginPrefs()).toEqual({ language: 'chinese', level: 3, tutorial: { done: true } })
  })

  it('survives a blocked or broken store without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    })
    expect(() => savePreloginPrefs({ level: 1 })).not.toThrow()
    expect(readPreloginPrefs()).toBe(null)
    expect(() => clearPreloginPrefs()).not.toThrow()
    expect(isTutorialDone()).toBe(false)
  })

  it('treats unreadable stored json as nothing at all', () => {
    localStorage.setItem('prelogin:prefs', '{not json')
    expect(readPreloginPrefs()).toBe(null)
  })
})

describe('the tutorial position', () => {
  beforeEach(() => {
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    })
  })

  it('is nothing until the tutorial has been started', () => {
    expect(readTutorialProgress()).toBe(null)
    expect(isTutorialDone()).toBe(false)
  })

  it('remembers where the learner got to', () => {
    saveTutorialPosition({ phase: 'card', cardIndex: 1, revealed: true, storyPanel: 0, grades: ['good'] })
    expect(readTutorialProgress().state.cardIndex).toBe(1)
    expect(isTutorialDone()).toBe(false)
  })

  it('keeps the position when it is marked done, and the done flag when it moves', () => {
    saveTutorialPosition({ phase: 'card', cardIndex: 1, revealed: false, storyPanel: 0, grades: [] })
    markTutorialDone()
    expect(isTutorialDone()).toBe(true)
    expect(readTutorialProgress().state.cardIndex).toBe(1)

    saveTutorialPosition({ phase: 'recap', cardIndex: 2, revealed: false, storyPanel: 0, grades: [] })
    expect(isTutorialDone()).toBe(true)
  })

  it('does not disturb the reading test\'s estimate', () => {
    savePreloginPrefs({ language: 'chinese', level: 4 })
    saveTutorialPosition({ phase: 'welcome', cardIndex: 0, revealed: false, storyPanel: 0, grades: [] })
    markTutorialDone()
    expect(readPreloginPrefs().level).toBe(4)
  })

  it('ignores a stored value of the wrong shape', () => {
    savePreloginPrefs({ tutorial: 'yes' })
    expect(readTutorialProgress()).toBe(null)
    expect(isTutorialDone()).toBe(false)
  })

  it('has three stages, all derived — never a fourth thing to keep in sync', () => {
    expect(tutorialStage()).toBe('not-started')

    saveTutorialPosition({ phase: 'card', cardIndex: 0, revealed: true, storyPanel: 0 })
    expect(tutorialStage()).toBe('in-progress')

    markTutorialDone()
    expect(tutorialStage()).toBe('complete')

    // Setup finishing is what ends the transitional state entirely.
    clearPreloginPrefs()
    expect(tutorialStage()).toBe('not-started')
  })
})
