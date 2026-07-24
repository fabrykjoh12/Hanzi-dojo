import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fsrs, generatorParameters, Rating, State } from 'ts-fsrs'
import {
  schedule, previewLabels, isCardDue, endOfLocalDay,
  normalizeTargetRetention, presetForRetention, getTargetRetention,
  setTargetRetention, resetTargetRetention,
  DEFAULT_TARGET_RETENTION, RETENTION_PRESETS,
} from './srs'

const STATES = ['new', 'learning', 'review', 'relearning']
const newCard = () => ({ id: null, state: 'new' })

// A settled review card, so the retention dial has a real interval to move.
// Dates are relative to now, because schedule() always grades "now".
const DAY = 86400000
const reviewCard = () => ({
  id: 'c1',
  state: 'review',
  due_at: new Date(Date.now() - 2 * DAY).toISOString(),
  stability: 12.3,
  difficulty: 5.4,
  elapsed_days: 10,
  scheduled_days: 12,
  reps: 8,
  lapses: 1,
  learning_step: 0,
  last_review: new Date(Date.now() - 10 * DAY).toISOString(),
})
const daysFor = (opts) => [0, 1, 2, 3].map(g => schedule(reviewCard(), g, opts).updates.scheduled_days)

describe('schedule', () => {
  it('returns a well-formed update for every grade', () => {
    for (let grade = 0; grade <= 3; grade += 1) {
      const res = schedule(newCard(), grade)
      expect(STATES).toContain(res.updates.state)
      expect(typeof res.updates.stability).toBe('number')
      expect(typeof res.updates.difficulty).toBe('number')
      expect(typeof res.updates.due_at).toBe('string')
      expect(typeof res.stay).toBe('boolean')
    }
  })

  it('sets is_easy only on the Easy grade', () => {
    expect(schedule(newCard(), 0).updates.is_easy).toBe(false)
    expect(schedule(newCard(), 1).updates.is_easy).toBe(false)
    expect(schedule(newCard(), 2).updates.is_easy).toBe(false)
    expect(schedule(newCard(), 3).updates.is_easy).toBe(true)
  })

  it('keeps an Again-graded new card in the session (stay=true, learning)', () => {
    const res = schedule(newCard(), 0)
    expect(res.stay).toBe(true)
    expect(['learning', 'relearning']).toContain(res.updates.state)
    expect(res.gap).toBeGreaterThanOrEqual(2)
  })

  it('marks a graduated card as learned', () => {
    // An Easy grade on a new card should push it toward review and set learned.
    const res = schedule(newCard(), 3)
    if (res.updates.state === 'review') expect(res.updates.learned).toBe(true)
  })
})

describe('target retention (the retention dial)', () => {
  // FSRS's interval fuzz is seeded from the clock, so two calls a millisecond
  // apart can land on different day counts. Freeze time and the comparisons
  // below measure exactly what they mean to: the effect of the dial, nothing else.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T09:00:00Z'))
    resetTargetRetention()
  })
  afterEach(() => vi.useRealTimers())

  it('defaults to 0.9, the value the app has always scheduled with', () => {
    expect(DEFAULT_TARGET_RETENTION).toBe(0.9)
    expect(getTargetRetention()).toBe(0.9)
  })

  // The pin: with no dial set, scheduling must be byte-for-byte what a plain
  // ts-fsrs at the library default produces. If this fails, default scheduling
  // changed — fix the code, not the test.
  it('reproduces the pre-dial schedule exactly when nothing is set', () => {
    const f = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }))
    const card = reviewCard()
    const ratings = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]
    const expected = ratings.map(r => f.repeat({
      due: new Date(card.due_at),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsed_days,
      scheduled_days: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
      learning_steps: card.learning_step,
      state: State.Review,
      last_review: new Date(card.last_review),
    }, new Date())[r].card.scheduled_days)
    expect(daysFor()).toEqual(expected)
  })

  it('an explicit default is indistinguishable from passing nothing', () => {
    expect(daysFor({ targetRetention: 0.9 })).toEqual(daysFor())
  })

  it('higher retention schedules sooner, lower schedules later', () => {
    const relaxed = daysFor({ targetRetention: 0.85 })
    const balanced = daysFor({ targetRetention: 0.9 })
    const thorough = daysFor({ targetRetention: 0.95 })
    // Compare the Good grade, the one nearly every review takes.
    expect(relaxed[2]).toBeGreaterThan(balanced[2])
    expect(thorough[2]).toBeLessThan(balanced[2])
  })

  it('falls back to the default for junk instead of scheduling badly', () => {
    for (const bad of [null, undefined, NaN, Infinity, '0.85', {}, [], true, 0, 0.5, 0.79, 0.96, 1, 42, -1]) {
      expect(normalizeTargetRetention(bad)).toBe(DEFAULT_TARGET_RETENTION)
    }
    // …and a junk option produces the default schedule, not a broken one.
    expect(daysFor({ targetRetention: 'nonsense' })).toEqual(daysFor())
    expect(daysFor({ targetRetention: 0.4 })).toEqual(daysFor())
    expect(daysFor({ targetRetention: null })).toEqual(daysFor())
  })

  it('accepts every value inside the sane band', () => {
    for (const ok of [0.8, 0.85, 0.9, 0.95]) expect(normalizeTargetRetention(ok)).toBe(ok)
  })

  it('remembers the pick for later scheduling on this device', () => {
    const balanced = daysFor()
    setTargetRetention(0.85)
    expect(getTargetRetention()).toBe(0.85)
    expect(daysFor()[2]).toBeGreaterThan(balanced[2])
    // An explicit option still wins over the remembered preference.
    expect(daysFor({ targetRetention: 0.9 })).toEqual(balanced)
  })

  it('refuses to remember an out-of-range value', () => {
    setTargetRetention(0.2)
    expect(getTargetRetention()).toBe(DEFAULT_TARGET_RETENTION)
  })

  it('offers three named presets spanning the band', () => {
    expect(RETENTION_PRESETS).toHaveLength(3)
    for (const p of RETENTION_PRESETS) {
      expect(normalizeTargetRetention(p.value)).toBe(p.value)
      expect(typeof p.label).toBe('string')
      expect(p.blurb.length).toBeGreaterThan(0)
    }
    expect(RETENTION_PRESETS.map(p => p.value)).toEqual([0.85, 0.9, 0.95])
  })

  it('snaps a stored value onto a named preset, defaulting when unreadable', () => {
    expect(presetForRetention(0.95).key).toBe('thorough')
    expect(presetForRetention(0.86).key).toBe('relaxed')
    expect(presetForRetention(undefined).key).toBe('balanced')
    expect(presetForRetention(NaN).key).toBe('balanced')
    expect(presetForRetention(0.4).key).toBe('balanced')
  })

  it('previewLabels follows the same dial as schedule', () => {
    const card = reviewCard()
    expect(previewLabels(card, { targetRetention: 0.9 })).toEqual(previewLabels(card))
    expect(previewLabels(card, { targetRetention: 0.85 })[2])
      .not.toBe(previewLabels(card, { targetRetention: 0.95 })[2])
  })
})

describe('isCardDue (day-based review availability)', () => {
  // Local-time constructor so end-of-day math is timezone-agnostic.
  const at = (h, day = 10) => new Date(2026, 0, day, h, 0, 0)
  const review = (dueDate) => ({ state: 'review', due_at: dueDate.toISOString() })

  it('endOfLocalDay is 23:59:59.999 on the same local day', () => {
    const eod = endOfLocalDay(at(9))
    expect(eod.getHours()).toBe(23)
    expect(eod.getMinutes()).toBe(59)
    expect(eod.getDate()).toBe(10)
  })

  it('serves a review due LATER today during a morning session (the bug)', () => {
    // Reviewed yesterday evening → due today at 20:00. A 06:00 session must
    // still see it, instead of it trickling in only at 20:00.
    expect(isCardDue(review(at(20)), at(6))).toBe(true)
  })

  it('serves reviews due earlier today and overdue reviews', () => {
    expect(isCardDue(review(at(3)), at(9))).toBe(true)          // earlier today
    expect(isCardDue(review(at(15, 9)), at(9, 10))).toBe(true)  // yesterday (overdue)
  })

  it('does NOT serve a review scheduled for tomorrow', () => {
    expect(isCardDue(review(at(9, 11)), at(9, 10))).toBe(false)
  })

  it('learning/relearning stay intraday (exact now comparison)', () => {
    const now = at(9)
    expect(isCardDue({ state: 'learning', due_at: at(9).toISOString() }, now)).toBe(true)
    // A learning step 1 minute out is not due yet.
    const oneMinOut = new Date(2026, 0, 10, 9, 1, 0)
    expect(isCardDue({ state: 'learning', due_at: oneMinOut.toISOString() }, now)).toBe(false)
    // But a relearning card later today is NOT pulled in early (unlike review).
    expect(isCardDue({ state: 'relearning', due_at: at(20).toISOString() }, at(6))).toBe(false)
  })

  it('never reports a new card as due', () => {
    expect(isCardDue({ state: 'new', due_at: at(1).toISOString() }, at(9))).toBe(false)
  })
})

describe('previewLabels', () => {
  it('returns a human label for each of the four grades', () => {
    const labels = previewLabels(newCard())
    for (let grade = 0; grade <= 3; grade += 1) {
      expect(typeof labels[grade]).toBe('string')
      expect(labels[grade].length).toBeGreaterThan(0)
    }
  })
})
