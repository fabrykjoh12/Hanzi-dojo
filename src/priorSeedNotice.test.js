import { describe, it, expect, beforeEach, vi } from 'vitest'

const store = vi.hoisted(() => ({ prefs: new Map(), fail: false }))
vi.mock('./offline', () => ({
  prefsSet: async (k, v) => { if (store.fail) throw new Error('no storage'); store.prefs.set(k, v) },
  prefsGet: async (k) => { if (store.fail) throw new Error('no storage'); return store.prefs.has(k) ? store.prefs.get(k) : null },
}))

import {
  shouldAnnouncePriorSeedFailure, priorSeedNoticeToast,
  recordPriorSeedFailure, takePriorSeedFailure, PRIOR_SEED_NOTICE_KEY,
} from './priorSeedNotice'

beforeEach(() => { store.prefs = new Map(); store.fail = false })

describe('shouldAnnouncePriorSeedFailure', () => {
  const up = { flagged: true, justOnboarded: false, profile: {}, track: {} }

  it('waits for the shell, because that is where <Toasts /> is mounted', () => {
    // The whole reason this is a decision and not a toast() in a catch: during
    // onboarding and on the welcome screen nothing is listening, and Toasts
    // keeps no queue, so an announcement made there is lost.
    expect(shouldAnnouncePriorSeedFailure(up)).toBe(true)
    expect(shouldAnnouncePriorSeedFailure({ ...up, justOnboarded: true })).toBe(false)
    expect(shouldAnnouncePriorSeedFailure({ ...up, profile: null })).toBe(false)
    expect(shouldAnnouncePriorSeedFailure({ ...up, track: null })).toBe(false)
  })

  it('says nothing when nothing failed', () => {
    expect(shouldAnnouncePriorSeedFailure({ ...up, flagged: false })).toBe(false)
    expect(shouldAnnouncePriorSeedFailure()).toBe(false)
  })
})

describe('the notice survives a reload, and is shown once', () => {
  it('is still there on the next boot', async () => {
    // The case an in-memory flag loses, and the likely one: the network
    // flakiness that makes the seed fail is what makes a mobile session
    // unstable. "Onboarding → welcome screen → app killed → reopened" used to
    // drop the notice permanently and silently.
    await recordPriorSeedFailure()
    expect(store.prefs.get(PRIOR_SEED_NOTICE_KEY)).toBe(true)
    expect(await takePriorSeedFailure()).toBe(true)
  })

  it('is taken exactly once', async () => {
    await recordPriorSeedFailure()
    expect(await takePriorSeedFailure()).toBe(true)
    expect(await takePriorSeedFailure()).toBe(false)
  })

  it('reports nothing when nothing was recorded', async () => {
    expect(await takePriorSeedFailure()).toBe(false)
  })

  it('never throws when the device has no storage', async () => {
    // Onboarding must not fail because the notice could not be recorded — that
    // would turn a best-effort seed into a blocking one.
    store.fail = true
    await expect(recordPriorSeedFailure()).resolves.toBeUndefined()
    expect(await takePriorSeedFailure()).toBe(false)
  })
})

describe('priorSeedNoticeToast', () => {
  it('is a warning, not a seal', () => {
    // Toasts falls back to the achievement medal for an unmapped kind, so an
    // apology arrives looking like a prize (CLAUDE.md §1).
    expect(priorSeedNoticeToast().kind).toBe('warn')
  })

  it('names the screen that can still do it by hand', () => {
    // Without this the notice is only bad news: the same set of words can be
    // claimed from "Words you already know".
    expect(priorSeedNoticeToast().body).toContain('Words you already know')
  })
})
