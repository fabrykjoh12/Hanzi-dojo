import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map()
vi.mock('./offline', () => ({
  prefsGet: key => Promise.resolve(store.get(key)),
  prefsMerge: (key, patch) => {
    const saved = store.get(key)
    const base = saved && typeof saved === 'object' ? saved : {}
    const next = { ...base, ...patch }
    store.set(key, next)
    return Promise.resolve(next)
  },
}))

import {
  TOURS, TOUR_SEEN_KEY, TOUR_NEW_ACCOUNT_DAYS,
  normalizeSeen, isTourSeen, seenPatch, replayPatch,
  accountAgeDays, shouldRunTour, visibleSteps, nextStepIndex, cardPlacement,
  loadTourSeen, maybeStartTour, markTourSeen, resetTourSeen,
} from './tour'

const NOW = Date.parse('2026-08-09T12:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString()

beforeEach(() => store.clear())

describe('TOURS step definitions', () => {
  it('has a home tour and a stories tour, nothing for study mid-session', () => {
    expect(Object.keys(TOURS).sort()).toEqual(['home', 'stories'])
    // Three since P14-5C: the week the fourth pointed at no longer exists, and a
    // coach mark for a thing that is not on the screen is a step that silently
    // skips itself forever.
    expect(TOURS.home.length).toBe(3)
    expect(TOURS.home.map(s => s.id)).toEqual(['home-queue', 'home-then-read', 'home-nav'])
    expect(TOURS.stories.length).toBe(2)
  })

  it('no longer explains the reward the tutorial already delivered', () => {
    // The onboarding tutorial ends with a session completing, a story
    // unlocking, and two lines of Chinese read out of it. A coach mark on the
    // shelf saying the same thing would be its third telling.
    expect(TOURS.stories.map(s => s.id)).toEqual(['stories-shelf', 'stories-ahead'])
  })

  it('every step carries id, anchor, title and a short body', () => {
    for (const steps of Object.values(TOURS)) {
      for (const step of steps) {
        expect(step.id).toBeTruthy()
        expect(step.anchor).toBeTruthy()
        expect(step.title).toBeTruthy()
        expect(typeof step.body).toBe('string')
        expect(step.body.length).toBeGreaterThan(20)
      }
    }
  })

  it('step ids are unique within a tour', () => {
    for (const steps of Object.values(TOURS)) {
      const ids = steps.map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('copy stays calm — no guilt or urgency words', () => {
    const all = Object.values(TOURS).flat().map(s => s.title + ' ' + s.body).join(' ')
    for (const banned of [/streak(?!s to protect)/i, /don.t lose/i, /hurry/i, /now or/i, /!{2}/]) {
      expect(all).not.toMatch(banned)
    }
  })
})

describe('normalizeSeen / isTourSeen', () => {
  it('guards garbage back to an empty record', () => {
    for (const bad of [null, undefined, 'x', 7, [], true]) {
      expect(normalizeSeen(bad)).toEqual({})
    }
    const good = { home: 'completed' }
    expect(normalizeSeen(good)).toBe(good)
  })

  it('both outcomes count as seen; null (after replay reset) does not', () => {
    expect(isTourSeen({ home: 'completed' }, 'home')).toBe(true)
    expect(isTourSeen({ home: 'skipped' }, 'home')).toBe(true)
    expect(isTourSeen({ home: null }, 'home')).toBe(false)
    expect(isTourSeen({}, 'home')).toBe(false)
    expect(isTourSeen(null, 'home')).toBe(false)
  })
})

describe('seenPatch / replayPatch', () => {
  it('records the outcome per screen', () => {
    expect(seenPatch('home', 'skipped')).toEqual({ home: 'skipped' })
    expect(seenPatch('stories', 'completed')).toEqual({ stories: 'completed' })
    // Anything unexpected lands on completed — never an unreadable state.
    expect(seenPatch('home', 'whatever')).toEqual({ home: 'completed' })
  })

  it('replay clears both screens and raises the flag', () => {
    expect(replayPatch()).toEqual({ home: null, stories: null, replay: true })
  })
})

describe('accountAgeDays', () => {
  it('measures fractional days and tolerates junk', () => {
    expect(accountAgeDays(daysAgo(3), NOW)).toBeCloseTo(3)
    expect(accountAgeDays(null, NOW)).toBe(null)
    expect(accountAgeDays('not a date', NOW)).toBe(null)
    expect(accountAgeDays(undefined, NOW)).toBe(null)
  })
})

describe('shouldRunTour — the trigger rules', () => {
  const fresh = { screen: 'home', seen: {}, profileCreatedAt: daysAgo(0.01), now: NOW }

  it('runs for a new account that has not seen it', () => {
    expect(shouldRunTour(fresh)).toBe(true)
    expect(shouldRunTour({ ...fresh, screen: 'stories' })).toBe(true)
  })

  it('never runs twice — skip and complete both end it', () => {
    expect(shouldRunTour({ ...fresh, seen: { home: 'skipped' } })).toBe(false)
    expect(shouldRunTour({ ...fresh, seen: { home: 'completed' } })).toBe(false)
    // …but one screen's record does not block the other screen's tour.
    expect(shouldRunTour({ ...fresh, screen: 'stories', seen: { home: 'completed' } })).toBe(true)
  })

  it('never runs while a guided flow owns the screen', () => {
    expect(shouldRunTour({ ...fresh, suppressed: true })).toBe(false)
  })

  it('has no tour for unknown screens (reader, study, …)', () => {
    for (const screen of ['reader', 'study', 'settings', '', null, undefined]) {
      expect(shouldRunTour({ ...fresh, screen })).toBe(false)
    }
  })

  it('does not surprise an established account', () => {
    expect(shouldRunTour({ ...fresh, profileCreatedAt: daysAgo(TOUR_NEW_ACCOUNT_DAYS + 1) })).toBe(false)
    expect(shouldRunTour({ ...fresh, profileCreatedAt: daysAgo(TOUR_NEW_ACCOUNT_DAYS - 1) })).toBe(true)
  })

  it('is conservative when the account age is unknowable', () => {
    expect(shouldRunTour({ ...fresh, profileCreatedAt: null })).toBe(false)
    expect(shouldRunTour({ ...fresh, profileCreatedAt: 'garbage' })).toBe(false)
  })

  it('an explicit replay request bypasses the age gate', () => {
    const old = daysAgo(300)
    expect(shouldRunTour({ screen: 'home', seen: { home: null, replay: true }, profileCreatedAt: old, now: NOW })).toBe(true)
    // …but a tour re-seen after the replay stays ended.
    expect(shouldRunTour({ screen: 'home', seen: { home: 'completed', replay: true }, profileCreatedAt: old, now: NOW })).toBe(false)
  })
})

describe('visibleSteps / nextStepIndex — missing anchors skip silently', () => {
  const steps = TOURS.home
  it('filters to steps whose anchor exists, preserving order', () => {
    const present = new Set(['home-queue', 'nav'])
    const out = visibleSteps(steps, s => present.has(s.anchor))
    expect(out.map(s => s.id)).toEqual(['home-queue', 'home-nav'])
  })

  it('an exploding predicate drops the step instead of the tour', () => {
    const out = visibleSteps(steps, () => { throw new Error('DOM went away') })
    expect(out).toEqual([])
    expect(visibleSteps(null, () => true)).toEqual([])
  })

  it('nextStepIndex finds the next surviving step, or -1 at the end', () => {
    const present = new Set(['home-then-read', 'nav'])
    expect(nextStepIndex(steps, 0, s => present.has(s.anchor))).toBe(1)
    expect(nextStepIndex(steps, 2, s => present.has(s.anchor))).toBe(2)
    expect(nextStepIndex(steps, 3, s => present.has(s.anchor))).toBe(-1)
    expect(nextStepIndex(steps, 0, () => false)).toBe(-1)
  })
})

describe('cardPlacement — the card never leaves the viewport', () => {
  const phone = { width: 360, height: 640 }

  it('sits below the anchor when there is room, clamped to the phone width', () => {
    const pos = cardPlacement({ rect: { top: 60, left: 16, width: 328, height: 120 }, viewport: phone })
    expect(pos.top).toBe(192)
    expect(pos.width).toBe(336) // 360 - 2 × 12 margin
    expect(pos.left).toBe(12)
    expect(pos.left + pos.width).toBeLessThanOrEqual(phone.width - 12 + 1)
  })

  it('flips above a low anchor (the bottom nav)', () => {
    const pos = cardPlacement({ rect: { top: 578, left: 0, width: 360, height: 62 }, viewport: phone })
    expect(pos.bottom).toBe(640 - 578 + 12)
    expect(pos.top).toBeUndefined()
  })

  it('sits beside a full-height anchor (the desktop sidebar)', () => {
    const pos = cardPlacement({ rect: { top: 0, left: 0, width: 236, height: 800 }, viewport: { width: 1280, height: 800 } })
    expect(pos.left).toBe(236 + 12)
    expect(pos.top).toBeGreaterThan(0)
  })

  it('falls back to pinned-bottom when nothing fits on a phone', () => {
    const pos = cardPlacement({ rect: { top: 0, left: 0, width: 360, height: 640 }, viewport: phone })
    expect(pos.bottom).toBe(12)
    expect(pos.left).toBe(12)
    expect(pos.maxHeight).toBeLessThanOrEqual(phone.height - 24)
  })
})

describe('persistence through the prefs store (mocked offline.js)', () => {
  it('runs once, then skip ends it for good — under one key', async () => {
    const args = { screen: 'home', profileCreatedAt: daysAgo(0.1), now: NOW }
    expect(await maybeStartTour(args)).toBe(TOURS.home)
    await markTourSeen('home', 'skipped')
    expect(store.get(TOUR_SEEN_KEY)).toEqual({ home: 'skipped' })
    expect(await maybeStartTour(args)).toBe(null)
    // The stories tour is untouched by home's record.
    expect(await maybeStartTour({ ...args, screen: 'stories' })).toBe(TOURS.stories)
  })

  it('completing persists the same way as skipping', async () => {
    await markTourSeen('stories', 'completed')
    expect(await loadTourSeen()).toEqual({ stories: 'completed' })
    expect(await maybeStartTour({ screen: 'stories', profileCreatedAt: daysAgo(1), now: NOW })).toBe(null)
  })

  it('Settings replay makes both tours run again, even for an old account', async () => {
    await markTourSeen('home', 'completed')
    await markTourSeen('stories', 'skipped')
    const oldArgs = { profileCreatedAt: daysAgo(200), now: NOW }
    expect(await maybeStartTour({ screen: 'home', ...oldArgs })).toBe(null)
    await resetTourSeen()
    expect(await maybeStartTour({ screen: 'home', ...oldArgs })).toBe(TOURS.home)
    expect(await maybeStartTour({ screen: 'stories', ...oldArgs })).toBe(TOURS.stories)
  })
})
