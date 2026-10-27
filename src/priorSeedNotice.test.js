import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// `mode` mirrors how src/offline.js actually behaves, which matters because an
// earlier version of this file only ever tested a mock that threw:
//   'ok'      — IndexedDB is there.
//   'absent'  — no IndexedDB. tx() RESOLVES its fallback (offline.js:79, and
//               the .catch at the end of tx) and never rejects, so prefsGet
//               returns null and prefsSet resolves having stored nothing. This
//               is the real no-storage path.
//   'throws'  — not reachable through today's offline.js. Kept because this
//               module's guarantee is "onboarding must not fail because the
//               notice could not be recorded", and that guarantee should not
//               quietly depend on a helper two files away staying non-throwing.
const store = vi.hoisted(() => ({ prefs: new Map(), mode: 'ok' }))
vi.mock('./offline', () => ({
  prefsSet: async (k, v) => {
    if (store.mode === 'throws') throw new Error('no storage')
    if (store.mode === 'absent') return null
    store.prefs.set(k, v)
    return null
  },
  prefsGet: async (k) => {
    if (store.mode === 'throws') throw new Error('no storage')
    if (store.mode === 'absent') return null
    return store.prefs.has(k) ? store.prefs.get(k) : null
  },
}))

import {
  shouldAnnouncePriorSeedFailure, priorSeedNoticeToast,
  recordPriorSeedFailure, peekPriorSeedFailure, clearPriorSeedFailure,
  PRIOR_SEED_NOTICE_KEY,
} from './priorSeedNotice'

beforeEach(() => { store.prefs = new Map(); store.mode = 'ok' })

describe('shouldAnnouncePriorSeedFailure', () => {
  it('waits for a stack that is actually listening', () => {
    // Not "the shell is up", which is what this used to test. profile and track
    // are both loaded on /privacy, /support, /methodology, the public reading
    // assessment, a public story link and the password-recovery screen, and
    // App returns from every one of those without mounting <Toasts />. The
    // input is the one fact that decides whether the event reaches anything.
    expect(shouldAnnouncePriorSeedFailure({ flagged: true, listening: true })).toBe(true)
    expect(shouldAnnouncePriorSeedFailure({ flagged: true, listening: false })).toBe(false)
  })

  it('says nothing when nothing failed', () => {
    expect(shouldAnnouncePriorSeedFailure({ flagged: false, listening: true })).toBe(false)
    expect(shouldAnnouncePriorSeedFailure()).toBe(false)
  })
})

describe('the notice survives a reload, and is not spent before it is shown', () => {
  it('is still there on the next boot', async () => {
    // The case an in-memory flag loses, and the likely one: the network
    // flakiness that makes the seed fail is what makes a mobile session
    // unstable. "Onboarding → welcome screen → app killed → reopened" used to
    // drop the notice permanently and silently.
    await recordPriorSeedFailure()
    expect(store.prefs.get(PRIOR_SEED_NOTICE_KEY)).toBe(true)
    expect(await peekPriorSeedFailure()).toBe(true)
  })

  it('survives being read on a route that could not show it', async () => {
    // The bug this split exists for. A single take() clears on read, so a cold
    // load onto /support — profile and track loaded, no <Toasts /> — consumed
    // the flag and dispatched into nothing. Peeking must leave it behind.
    await recordPriorSeedFailure()
    expect(await peekPriorSeedFailure()).toBe(true)
    expect(await peekPriorSeedFailure()).toBe(true)
    expect(await peekPriorSeedFailure()).toBe(true)
  })

  it('is shown once, after it is cleared', async () => {
    await recordPriorSeedFailure()
    expect(await peekPriorSeedFailure()).toBe(true)
    await clearPriorSeedFailure()
    expect(await peekPriorSeedFailure()).toBe(false)
  })

  it('reports nothing when nothing was recorded', async () => {
    expect(await peekPriorSeedFailure()).toBe(false)
  })

  it('degrades to no notice on a device with no IndexedDB', async () => {
    // The real no-storage path: offline.js resolves its fallback rather than
    // throwing, so nothing is stored and nothing is read back. Losing the
    // notice is the accepted outcome — it is what happened before this module
    // existed — and it must never become an error.
    store.mode = 'absent'
    await expect(recordPriorSeedFailure()).resolves.toBeUndefined()
    expect(await peekPriorSeedFailure()).toBe(false)
    await expect(clearPriorSeedFailure()).resolves.toBeUndefined()
  })

  it('never throws even if the storage helper starts throwing', async () => {
    // Onboarding must not fail because the notice could not be recorded — that
    // would turn a best-effort seed into a blocking one.
    store.mode = 'throws'
    await expect(recordPriorSeedFailure()).resolves.toBeUndefined()
    expect(await peekPriorSeedFailure()).toBe(false)
    await expect(clearPriorSeedFailure()).resolves.toBeUndefined()
  })
})

describe('priorSeedNoticeToast', () => {
  it('is a warning, not a seal', () => {
    // Toasts falls back to the achievement medal for an unmapped kind, so an
    // apology arrives looking like a prize (CLAUDE.md §1).
    expect(priorSeedNoticeToast().kind).toBe('warn')
  })

  it('names the screen that can still do it by hand, as that screen is titled', () => {
    // Read out of practicePlan.js rather than typed here, so renaming the row
    // fails this instead of leaving the notice pointing at a screen that no
    // longer exists under that name.
    const plan = readFileSync('src/practicePlan.js', 'utf8')
    const row = plan.match(/\{\s*key: 'known',\s*title: '([^']+)'/)
    expect(row, "the 'known' tool row should exist in practicePlan.js").toBeTruthy()
    expect(priorSeedNoticeToast().body).toContain(row[1])
  })
})
