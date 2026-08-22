import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  CALIBRATION_GRADE, CALIBRATION_SESSION_CAP,
  isCalibrationReady, pickCalibrationChecks, pendingCalibrationCount, calibrationUpdates,
} from './calibration'
import { priorKnownCardRow, isPriorKnown, isVerified, isMastered, isLearned, MASTERY_STABILITY_DAYS } from './knowledgeState'
import { schedule } from './srs'

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0)
const iso = (d) => new Date(NOW + d * 86400000).toISOString()

const claim = (vocabId, { level = 1, sortOrder = 0, readyAt = null } = {}) => ({
  ...priorKnownCardRow('u1', vocabId, 'placement', NOW, readyAt),
  vocab: { id: vocabId, level, sort_order: sortOrder },
})

afterEach(() => vi.useRealTimers())

describe('the check is binary and maps onto canonical grades', () => {
  it('knew it is Easy, did not know is Again', () => {
    expect(CALIBRATION_GRADE.KNEW).toBe(3)
    expect(CALIBRATION_GRADE.DIDNT_KNOW).toBe(0)
  })
})

describe('isCalibrationReady', () => {
  const now = new Date(NOW)

  it('is true for a claim whose ready date has arrived', () => {
    expect(isCalibrationReady(claim('a', { readyAt: iso(0) }), now)).toBe(true)
    expect(isCalibrationReady(claim('a', { readyAt: iso(-3) }), now)).toBe(true)
  })

  it('is false for a claim scheduled for a later day', () => {
    expect(isCalibrationReady(claim('a', { readyAt: iso(2) }), now)).toBe(false)
  })

  it('is ready anywhere within the local day, like reviews', () => {
    const laterToday = new Date(NOW); laterToday.setHours(23, 0, 0, 0)
    expect(isCalibrationReady(claim('a', { readyAt: laterToday.toISOString() }), now)).toBe(true)
  })

  it('is false for anything that is not an unverified claim', () => {
    expect(isCalibrationReady({ reps: 3, state: 'review', due_at: iso(-1) }, now)).toBe(false)
    expect(isCalibrationReady(null, now)).toBe(false)
    // A claim already checked is no longer a claim.
    const verified = { ...claim('a', { readyAt: iso(-1) }), reps: 1, verified_at: iso(0) }
    expect(isCalibrationReady(verified, now)).toBe(false)
  })
})

describe('pickCalibrationChecks', () => {
  const now = new Date(NOW)

  it('serves the most frequent words first', () => {
    const deck = [
      claim('c', { level: 2, sortOrder: 5, readyAt: iso(0) }),
      claim('a', { level: 1, sortOrder: 9, readyAt: iso(0) }),
      claim('b', { level: 1, sortOrder: 1, readyAt: iso(0) }),
    ]
    expect(pickCalibrationChecks(deck, { now }).map(c => c.vocab_id)).toEqual(['b', 'a', 'c'])
  })

  it('respects the session cap', () => {
    const deck = Array.from({ length: 50 }, (_, i) => claim('v' + i, { sortOrder: i, readyAt: iso(0) }))
    expect(pickCalibrationChecks(deck, { now })).toHaveLength(CALIBRATION_SESSION_CAP)
    expect(pickCalibrationChecks(deck, { now, cap: 5 })).toHaveLength(5)
    expect(pickCalibrationChecks(deck, { now, cap: 0 })).toEqual([])
  })

  it('never serves a claim before its ready date', () => {
    const deck = [claim('a', { readyAt: iso(0) }), claim('b', { readyAt: iso(5) })]
    expect(pickCalibrationChecks(deck, { now }).map(c => c.vocab_id)).toEqual(['a'])
  })

  it('never serves genuine cards, and skips claims with no resolved vocab', () => {
    const deck = [
      { vocab_id: 'real', reps: 4, state: 'review', due_at: iso(-1), vocab: { level: 1, sort_order: 0 } },
      { ...priorKnownCardRow('u1', 'novocab', 'paste', NOW, iso(0)) },   // no .vocab
      claim('ok', { readyAt: iso(0) }),
    ]
    expect(pickCalibrationChecks(deck, { now }).map(c => c.vocab_id)).toEqual(['ok'])
  })

  it('is empty for an empty or missing deck', () => {
    expect(pickCalibrationChecks([], { now })).toEqual([])
    expect(pickCalibrationChecks(null, { now })).toEqual([])
  })
})

describe('pendingCalibrationCount', () => {
  it('counts unverified claims only', () => {
    const deck = [
      claim('a'), claim('b'),
      { vocab_id: 'c', reps: 3, state: 'review' },
      { ...claim('d'), reps: 1, verified_at: iso(0) },
    ]
    expect(pendingCalibrationCount(deck)).toBe(2)
  })
})

// The heart of it: the first check must produce a legitimate FSRS state and
// nothing more. Values are asserted against the canonical scheduler's actual
// output, not against hardcoded numbers.
describe('the first check creates real FSRS state, never a fabricated history', () => {
  it('"I knew it" produces exactly what a fresh card graded Easy produces', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    const card = claim('a', { readyAt: iso(0) })
    const out = calibrationUpdates(card, true)
    const reference = schedule({ id: null, state: 'new' }, CALIBRATION_GRADE.KNEW)

    expect(out.grade).toBe(3)
    expect(out.updates.reps).toBe(reference.updates.reps)
    expect(out.updates.stability).toBe(reference.updates.stability)
    expect(out.updates.state).toBe(reference.updates.state)
    expect(out.updates.lapses).toBe(0)
  })

  it('"didn\'t know" produces exactly what a fresh card graded Again produces', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    const out = calibrationUpdates(claim('a', { readyAt: iso(0) }), false)
    const reference = schedule({ id: null, state: 'new' }, CALIBRATION_GRADE.DIDNT_KNOW)

    expect(out.grade).toBe(0)
    expect(out.updates.stability).toBe(reference.updates.stability)
    expect(out.updates.state).toBe(reference.updates.state)
    // The claim is refuted: an ordinary learning card, restudied from scratch.
    expect(out.stay).toBe(true)
  })

  it('records exactly one observation — never a back-dated history', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    const out = calibrationUpdates(claim('a', { readyAt: iso(0) }), true)
    expect(out.updates.reps).toBe(1)
    expect(out.updates.lapses).toBe(0)
    // last_review is the moment of the check, never earlier.
    expect(new Date(out.updates.last_review).getTime()).toBe(NOW)
    expect(out.updates.verified_at).toBe(new Date(NOW).toISOString())
  })

  it('does not inherit a seeded stability — the claim carried none', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    const out = calibrationUpdates(claim('a', { readyAt: iso(0) }), true)
    expect(out.updates.stability).not.toBe(MASTERY_STABILITY_DAYS)
    expect(out.updates.stability).toBeGreaterThan(0)
  })

  it('a single check never produces mastery', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    for (const knew of [true, false]) {
      const out = calibrationUpdates(claim('a', { readyAt: iso(0) }), knew)
      const after = { ...claim('a'), ...out.updates }
      expect(isMastered(after)).toBe(false)
      expect(isPriorKnown(after)).toBe(false)   // no longer a claim
      expect(isVerified(after)).toBe(true)      // but genuinely observed now
    }
  })

  it('"I knew it" graduates straight to review; "didn\'t know" does not', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    const knew = calibrationUpdates(claim('a', { readyAt: iso(0) }), true)
    const didnt = calibrationUpdates(claim('a', { readyAt: iso(0) }), false)
    expect(knew.updates.state).toBe('review')
    expect(isLearned({ ...claim('a'), ...knew.updates })).toBe(true)
    expect(didnt.updates.state).toBe('learning')
    expect(isLearned({ ...claim('a'), ...didnt.updates })).toBe(false)
  })

  // Two spaced genuine recalls is the honest price of converting a claim into
  // mastery — reachable, but never in one tap.
  it('mastery takes a second successful review, not the first', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    const first = calibrationUpdates(claim('a', { readyAt: iso(0) }), true)
    const afterFirst = { id: 'c1', ...claim('a'), ...first.updates }
    expect(isMastered(afterFirst)).toBe(false)

    // Come back when it is due and pass it again.
    vi.setSystemTime(new Date(first.updates.due_at))
    const second = schedule(afterFirst, 2)   // Good
    expect(isMastered({ ...afterFirst, ...second.updates })).toBe(true)
  })
})
