import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  initialLandingMode, landingEntry, tutorialStage,
  savePreloginPrefs, readPreloginPrefs, clearPreloginPrefs, mergePreloginPrefs,
  readTutorialProgress, saveTutorialPosition, markTutorialDone, isTutorialDone,
  authEntryTab, preloginBackAction,
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

// ── Which tab the account screen opens on ────────────────────────────────────
// This used to be inferred from `Boolean(intro)` — a prop only the deleted
// pre-signup wizard ever passed — so the tutorial's "Create account" button
// opened the LOG IN form and a brand-new learner signed in to an account that
// did not exist. The decision is explicit now, and these specs are the ones
// that would have caught it.

describe('authEntryTab', () => {
  it('opens signup for the tutorial hand-off — "Create account" must create one', () => {
    expect(authEntryTab({ fromTutorial: true })).toBe('signup')
  })

  it('opens login by default — an unexplained arrival is a returning learner', () => {
    expect(authEntryTab()).toBe('login')
    expect(authEntryTab({})).toBe('login')
    expect(authEntryTab({ fromTutorial: false })).toBe('login')
  })

  it('lets an auth notice win — they came to fix a password, not to sign up', () => {
    expect(authEntryTab({ fromTutorial: true, notice: 'That link expired.' })).toBe('login')
  })

  it('never lets the TEXT of a notice decide anything', () => {
    // Presence, not content: a notice that happens to contain the word
    // "signup" is still a notice about a broken link.
    expect(authEntryTab({ notice: 'signup again' })).toBe('login')
  })
})

// ── Android hardware Back, before login ──────────────────────────────────────
// The whole pre-login flow lives at `/`, so the bridge's path fallback used to
// see one root screen and exit the app from the middle of a flashcard.

describe('preloginBackAction', () => {
  it('exits only from the genuine first screens', () => {
    expect(preloginBackAction({ mode: 'welcome', native: true })).toBe('exit')
    expect(preloginBackAction({ mode: 'landing', native: false })).toBe('exit')
  })

  it('steps the tutorial backwards rather than leaving it', () => {
    expect(preloginBackAction({ mode: 'tutorial', native: true })).toBe('retreat')
    expect(preloginBackAction({ mode: 'tutorial', native: false })).toBe('retreat')
  })

  it('walks the auth screen back to wherever it was entered from', () => {
    // The tutorial's hand-off: Back returns into the tutorial.
    expect(preloginBackAction({ mode: 'auth', native: true, authArrival: 'tutorial' })).toBe('tutorial')
    // An explicit Log in tap from the first screen: Back returns there.
    expect(preloginBackAction({ mode: 'auth', native: true, authArrival: 'screen' })).toBe('welcome')
    expect(preloginBackAction({ mode: 'auth', native: false, authArrival: 'screen' })).toBe('landing')
  })

  it('exits from auth only when auth WAS the launch screen', () => {
    // A finished tutorial or an expired link lands the launch on the form;
    // there is nothing behind it, so Back means leave.
    expect(preloginBackAction({ mode: 'auth', native: true, authArrival: 'entry' })).toBe('exit')
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
  })
})

// ── The teaching record outlives the handoff ─────────────────────────────────
// The done flag used to live inside prelogin:prefs, and Onboarding rightly
// clears that whole key once setup completes — which erased the flag before
// Home could read it, so the "the tutorial already taught this" suppression of
// the coach-mark tour could never fire (P12 audit §3.2). These specs pin the
// two lifetimes apart.

describe('the tutorial-done record vs the transitional prefs', () => {
  beforeEach(() => {
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    })
  })

  it('SURVIVES setup clearing the prelogin prefs — the fix itself', () => {
    saveTutorialPosition({ phase: 'loop', cardIndex: 2, revealed: false, storyPanel: 1 })
    markTutorialDone()
    // What Onboarding.finish() does once a profile and a track exist.
    clearPreloginPrefs()
    expect(isTutorialDone()).toBe(true)
    expect(tutorialStage()).toBe('complete')
    // …while the transitional position really is gone.
    expect(readTutorialProgress()).toBe(null)
  })

  it('still clears the transitional state — that behaviour exists for a reason', () => {
    savePreloginPrefs({ language: 'chinese', level: 4 })
    markTutorialDone()
    clearPreloginPrefs()
    expect(readPreloginPrefs()).toBe(null)
  })

  it('honours a done flag written by an older build, before setup clears it', () => {
    // The old shape: `tutorial.done` inside prelogin:prefs.
    savePreloginPrefs({ tutorial: { done: true, state: { phase: 'loop' } } })
    expect(isTutorialDone()).toBe(true)
  })

  it('migrates the old flag on read, so setup clearing the old key cannot lose it', () => {
    savePreloginPrefs({ tutorial: { done: true } })
    // Any read migrates…
    expect(isTutorialDone()).toBe(true)
    // …so the clear that follows setup no longer takes the record with it.
    clearPreloginPrefs()
    expect(isTutorialDone()).toBe(true)
  })

  it('an unfinished tutorial is still unfinished after setup', () => {
    saveTutorialPosition({ phase: 'card', cardIndex: 1, revealed: false, storyPanel: 0 })
    clearPreloginPrefs()
    expect(isTutorialDone()).toBe(false)
    expect(tutorialStage()).toBe('not-started')
  })
})
