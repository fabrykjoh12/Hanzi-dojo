import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fsrs, generatorParameters, Rating, State } from 'ts-fsrs'
import {
  schedule, previewLabels, isCardDue, endOfLocalDay,
  localGridShiftMs, toLocalGrid, fromLocalGrid,
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

// ---------------------------------------------------------------------------
// FAB-28 finding 1: elapsed days are LOCAL calendar days, not UTC ones.
// ---------------------------------------------------------------------------
// ts-fsrs counts elapsed days on the UTC calendar (`dateDiffInDays` compares
// Date.UTC(...) of each timestamp). This app serves reviews on the LOCAL day
// boundary (`endOfLocalDay`). Before this suite existed, nothing here ran under
// a timezone other than the container's, so the mismatch was invisible.
//
// These specs pick the wall-clock instants deliberately, which is why
// schedule() takes a `now` test seam: the defect is entirely about which days
// two instants fall between.
describe('elapsed days follow the LOCAL day grid', () => {
  // vi.stubEnv rather than touching process.env directly: `process` is not a
  // defined global for src/** under this repo's ESLint config, and
  // unstubAllEnvs restores the container's own zone even if a spec throws.
  afterEach(() => { vi.unstubAllEnvs() })

  // A settled review card at a low stability, where one elapsed day changes the
  // answer by a lot. Fuzz is on in production, so assertions are on
  // elapsed_days and on ordering rather than on an exact stability.
  const settled = (lastReviewIso) => ({
    id: 'c1',
    state: 'review',
    due_at: lastReviewIso,
    stability: 1.0,
    difficulty: 5.0,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 3,
    lapses: 0,
    learning_step: 0,
    last_review: lastReviewIso,
  })

  it('counts an overnight review west of UTC as one day, not zero', () => {
    // The everyday case this fixes. Los Angeles, last studied 20:00, back at
    // 09:00 the next morning — 13 hours later, and the morning the app offers
    // the card. Both instants are the SAME UTC day (03:00Z and 16:00Z), so the
    // UTC grid scored this as no time passed at all: stability 1.0 -> 1.051
    // instead of 4.233, on every single overnight review.
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const res = schedule(
      settled('2026-09-07T20:00:00-07:00'), 2,
      { now: '2026-09-08T09:00:00-07:00', targetRetention: 0.9 },
    )
    expect(res.updates.elapsed_days).toBe(1)
    expect(res.updates.stability).toBeGreaterThan(3)
  })

  it('counts a few hours on ONE local day east of UTC as zero days, not one', () => {
    // The mirror, and the reason this is not fixed by "just add a day". In
    // Auckland 09:00 and 14:00 on the same local day straddle UTC midnight
    // (21:00Z and 02:00Z), so the UTC grid credited five hours as a full day
    // and inflated stability instead of suppressing it.
    vi.stubEnv('TZ', 'Pacific/Auckland')
    const res = schedule(
      settled('2026-09-07T09:00:00+12:00'), 2,
      { now: '2026-09-07T14:00:00+12:00', targetRetention: 0.9 },
    )
    expect(res.updates.elapsed_days).toBe(0)
  })

  it('is unchanged where the offset is zero', () => {
    // UTC and Europe/London-in-winter shift by nothing, so this change must be
    // a no-op there. The elapsed_days assertion alone did NOT prove that — it
    // holds on the unfixed code and under a -7h shift too — so the shift itself
    // is asserted to be zero, which is the actual claim.
    vi.stubEnv('TZ', 'UTC')
    expect(localGridShiftMs(new Date('2026-09-08T09:00:00Z'))).toBe(0)
    const res = schedule(
      settled('2026-09-07T20:00:00Z'), 2,
      { now: '2026-09-08T09:00:00Z', targetRetention: 0.9 },
    )
    expect(res.updates.elapsed_days).toBe(1)
  })

  it('the grid helpers round-trip exactly, in both hemispheres', () => {
    // They are exported and were asserted only indirectly. The inverse being
    // exact is what keeps a shifted instant from reaching the database.
    for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC', 'Asia/Kolkata']) {
      vi.stubEnv('TZ', tz)
      for (const iso of ['2026-09-07T10:00:00Z', '2026-01-15T23:59:00Z', '2026-11-01T08:30:00Z']) {
        const d = new Date(iso)
        const shift = localGridShiftMs(d)
        expect(fromLocalGrid(toLocalGrid(d), shift).toISOString(), tz + ' ' + iso)
          .toBe(d.toISOString())
      }
    }
  })

  it('refuses an unusable now rather than scheduling NaN', () => {
    // The seam is unvalidated input on a production function. An unparsable
    // value would otherwise make every downstream number NaN and write NaN
    // stability onto the card — found much later, and much harder.
    expect(() => schedule(settled('2026-09-07T20:00:00Z'), 2, { now: 'not a date' }))
      .toThrow(/not a valid date/)
    // The epoch is a legitimate instant, and a truthiness check would have
    // silently swapped the real clock in for it. Asserted as the VALUE, not as
    // "does not throw": with `!options.now` the call falls through to the real
    // clock and still returns normally, so the weaker form passed under the
    // mutation it names.
    const epoch = schedule(settled('1969-12-31T00:00:00Z'), 2, { now: 0 })
    expect(new Date(epoch.updates.last_review).getTime(), 'now: 0 fell through to the real clock')
      .toBe(0)
  })

  it('counts local days across a DST boundary, where the two offsets differ', () => {
    // US DST ended 2026-11-01. Each timestamp must be shifted by ITS OWN
    // offset, not by one offset for both.
    //
    // The instants are chosen to DISCRIMINATE that. An earlier version of this
    // spec used Oct 31 20:00 PDT -> Nov 1 09:00 PST, which gives 1 either way,
    // so it passed for a single-offset implementation too and proved nothing.
    // Here last_review sits 30 minutes past local midnight on Nov 1, inside the
    // one-hour offset delta:
    //
    //   own offsets   -> Nov 1 00:30 and Nov 1 09:00  -> 0 days   (correct)
    //   now's offset  -> Oct 31 23:30 and Nov 1 09:00 -> 1 day    (wrong)
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const res = schedule(
      settled('2026-11-01T00:30:00-07:00'), 2,
      { now: '2026-11-01T09:00:00-08:00', targetRetention: 0.9 },
    )
    expect(res.updates.elapsed_days).toBe(0)
  })

  it('survives a last_review in the future instead of throwing', () => {
    // ts-fsrs throws on negative elapsed days rather than degrading, and
    // schedule() is unguarded at its call site, so a negative would fail the
    // whole due queue. last_review is written from the device clock, so a
    // backwards clock change — manual, or an NTP correction after a forward
    // drift — leaves a card carrying a last_review ahead of now.
    //
    // Note what this is NOT: it is not about travel. getTimezoneOffset() is
    // evaluated under the CURRENT zone for both instants, so a device that
    // moves shifts both by the same offset. A sweep of ten zones across 2026 at
    // 15-minute resolution found no timezone or DST combination that produces a
    // negative, which is why this spec uses a future last_review instead.
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const res = schedule(
      settled('2026-09-09T12:00:00-07:00'), 2,
      { now: '2026-09-07T09:00:00-07:00', targetRetention: 0.9 },
    )
    expect(res.updates.elapsed_days).toBe(0)
  })

  it('the same future last_review throws WITHOUT the clamp', () => {
    // Proof the clamp is load-bearing rather than decoration: the raw library
    // call, on the same instants, is the failure the clamp prevents.
    const raw = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }))
    const future = new Date('2026-09-09T12:00:00Z')
    const now = new Date('2026-09-07T09:00:00Z')
    expect(() => raw.repeat({
      due: future, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1,
      reps: 3, lapses: 0, learning_steps: 0, state: State.Review, last_review: future,
    }, now)).toThrow(/delta_t/)
  })

  it('leaks no grid timestamp into the row it writes', () => {
    // The shift is an internal device. If either direction were dropped, the
    // stored last_review would be off by the UTC offset — hours wrong in the
    // database, and wrong again on the next grading.
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const now = '2026-09-08T09:00:00-07:00'
    const res = schedule(settled('2026-09-07T20:00:00-07:00'), 2, { now })
    expect(new Date(res.updates.last_review).toISOString()).toBe(new Date(now).toISOString())
  })

  it('preserves the interval exactly: due_at is now plus scheduled_days', () => {
    // The safety property that makes the shift legitimate. ts-fsrs computes the
    // next due as exact millisecond addition from the review time, so moving
    // the grid must move nothing else.
    //
    // Fuzz is ON (schedulerFor sets enable_fuzz: true unconditionally — an
    // earlier version of this comment claimed a fixed retention disabled it,
    // which was simply wrong), so the interval is not predictable and an exact
    // comparison would fight it. What IS exact, and what this asserts, is the
    // round trip: whatever interval was chosen, due_at lands that many days
    // after the REAL now — not the shifted one, which would be seven hours off.
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const now = new Date('2026-09-08T09:00:00-07:00')
    const res = schedule(settled('2026-09-07T20:00:00-07:00'), 2, { now: now.toISOString() })
    const actualMs = new Date(res.updates.due_at) - now
    expect(actualMs).toBe(res.updates.scheduled_days * 86400000)
  })

  it('previewLabels and schedule agree about the same review', () => {
    // The buttons must not promise an interval grading will not honour. Scoring
    // the preview on the UTC grid while grading on the local one would diverge
    // by a whole elapsed day on exactly the overnight case above.
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const card = settled('2026-09-07T20:00:00-07:00')
    const now = '2026-09-08T09:00:00-07:00'
    const labels = previewLabels(card, { now, targetRetention: 0.9 })
    const good = schedule(card, 2, { now, targetRetention: 0.9 })
    const days = good.updates.scheduled_days
    expect(labels[2]).toBe(days === 1 ? '1 day' : days + ' days')
  })

  it('the Again label is a real minute count, not the grid offset', () => {
    // THE ONLY STRING THIS CHANGE CAN VISIBLY BREAK, and it was the one the
    // suite did not read. previewLabels scores on the grid and must convert
    // each preview `due` back off it before formatting. Delete that
    // fromLocalGrid call and every other assertion here still passes, because
    // Good on a review card is a whole-day label and formatLabel returns
    // scheduled_days for anything >= 1440 minutes — a seven-hour error in
    // `due` changes nothing it prints.
    //
    // Again is sub-day, so it reads `due` directly. Correct is a single-digit
    // step; the mutation adds the zone's whole offset to it.
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const card = settled('2026-09-07T20:00:00-07:00')
    const now = '2026-09-08T09:00:00-07:00'
    const label = previewLabels(card, { now, targetRetention: 0.9 })[0]
    expect(label).toMatch(/^\d+ min$/)
    expect(Number(label.split(' ')[0]), 'the Again label carries the grid offset')
      .toBeLessThan(60)
  })

  it('gives the same Again label in two zones with different offsets', () => {
    // The property the minute bound above only approximates, and the one a
    // vacuous spec cannot fake: the label is a scheduler interval, so it must
    // not depend on where the learner is. Under the mutation Los Angeles adds
    // 420 minutes and Tokyo subtracts 540, so the two disagree by sixteen
    // hours. Same wall-clock story in both, expressed in each zone's own
    // offset, so only the grid conversion differs.
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const la = previewLabels(settled('2026-09-07T20:00:00-07:00'),
      { now: '2026-09-08T09:00:00-07:00', targetRetention: 0.9 })[0]
    vi.stubEnv('TZ', 'Asia/Tokyo')
    const tokyo = previewLabels(settled('2026-09-07T20:00:00+09:00'),
      { now: '2026-09-08T09:00:00+09:00', targetRetention: 0.9 })[0]
    expect(la).toBe(tokyo)
  })
})
