import { describe, expect, it } from 'vitest'
import { HOME_MOTION, homeDailyStage, homeProgressPct, homeQueueSummary, storyReadStateForDate, waitingBadgeCount } from './homePresentation'

describe('Home presentation data', () => {
  it('combines reviews and new cards into the hero count', () => {
    expect(homeQueueSummary({ dueCount: 127, learnCount: 0, newCount: 10 })).toEqual({
      totalReady: 137,
      reviewCount: 127,
      newCount: 10,
      calibrationCount: 0,
      clear: false,
      failed: false,
    })
  })

  // FAB-28 blocker 2. Calibration checks ride in the review pool of a session
  // (sessionPrep.js) but were counted nowhere in Home, so a learner with no due
  // reviews and hundreds of ready checks was told "all caught up" — and
  // calibration is the ONLY path by which a claimed word can ever be observed,
  // so those claims could never be worked off.
  it('counts calibration checks as part of the review pool, not beside it', () => {
    expect(homeQueueSummary({ dueCount: 15, learnCount: 0, newCount: 0, calibrationCount: 20 }))
      .toEqual({
        totalReady: 35,
        reviewCount: 35,
        newCount: 0,
        calibrationCount: 20,
        clear: false,
        failed: false,
      })
  })

  it('is NOT clear while calibration checks are waiting and nothing else is', () => {
    // The exact production shape: 0 due, 0 learning, 0 new, and claims ready — 270 of them in production, which getHomeCounts caps to CALIBRATION_SESSION_CAP before it reaches here, hence 20.
    // Before this, `clear` went true here — which also flipped Home's primary
    // action from studying to "Read a story".
    const summary = homeQueueSummary({ dueCount: 0, learnCount: 0, newCount: 0, calibrationCount: 20 })
    expect(summary.clear).toBe(false)
    expect(summary.totalReady).toBe(20)
  })

  it('still reports clear when there is genuinely nothing, calibration included', () => {
    // The other direction, so the fix cannot be "never clear".
    expect(homeQueueSummary({ dueCount: 0, learnCount: 0, newCount: 0, calibrationCount: 0 }).clear).toBe(true)
    expect(homeQueueSummary({}).clear).toBe(true)
  })

  it('keeps the learner on cards while only calibration is waiting', () => {
    // homeDailyStage reads the same `clear` flag, so the undercount reached the
    // stage machine too: with a completed daily story it returned 'complete'
    // while hundreds of checks waited.
    expect(homeDailyStage({ counts: { calibrationCount: 20 }, daily: { completedToday: true } }))
      .toBe('cards')
  })

  it('does not present failed zeroes as a completed queue', () => {
    expect(homeQueueSummary({ dueCount: 0, learnCount: 0, newCount: 0, failed: true }).clear).toBe(false)
  })

  it('derives level progress from learned and active words', () => {
    expect(homeProgressPct(256, 300)).toBeCloseTo(85.333, 2)
    expect(homeProgressPct(0, 0)).toBe(0)
  })

  it('derives every daily stage from real queue, story, and grammar state', () => {
    expect(homeDailyStage({ counts: { dueCount: 1 }, daily: null })).toBe('cards')
    expect(homeDailyStage({ counts: {}, daily: { completedToday: false } })).toBe('story')
    expect(homeDailyStage({ counts: { grammarDueCount: 2 }, daily: { completedToday: true } })).toBe('practice')
    expect(homeDailyStage({ counts: { grammarDueCount: 0 }, daily: { completedToday: true } })).toBe('complete')
    expect(homeDailyStage({ counts: {}, daily: undefined })).toBe('story')
    expect(homeDailyStage({ counts: {}, daily: null })).toBe('caught-up')
    expect(homeDailyStage({ counts: { failed: true }, daily: { completedToday: true } })).toBe('cards')
  })

  it('pins today’s completed story while excluding earlier reads from the daily pool', () => {
    const reads = [
      { story_id: 'today', read_at: new Date(2026, 7, 15, 12).toISOString() },
      { story_id: 'earlier', read_at: new Date(2026, 7, 14, 12).toISOString() },
    ]
    const state = storyReadStateForDate(reads, '2026-08-15')
    expect([...state.readTodayIds]).toEqual(['today'])
    expect([...state.readBeforeTodayIds]).toEqual(['earlier'])
  })

  it('locks the approved motion timings', () => {
    expect(HOME_MOTION).toEqual({ press: 160, nav: 260, page: 460, reduced: 130 })
  })
})

describe('waitingBadgeCount', () => {
  // The desktop rail's Cards badge. It exists as a function because the rail
  // used to add its own three terms: calibration became a term in the hero and
  // not in that sum, so with only claims ready the hero said "20 cards waiting"
  // while the badge hid at zero — the same "all caught up" lie, one component
  // over, on the same screen.
  it('is the hero total, term for term', () => {
    const counts = { dueCount: 3, learnCount: 2, newCount: 4, calibrationCount: 6 }
    expect(waitingBadgeCount(counts)).toBe(homeQueueSummary(counts).totalReady)
    expect(waitingBadgeCount(counts)).toBe(15)
  })

  it('sees a queue made of nothing but calibration checks', () => {
    // The production shape, and the one the old sum reported as zero.
    expect(waitingBadgeCount({ dueCount: 0, learnCount: 0, newCount: 0, calibrationCount: 20 })).toBe(20)
  })

  it('survives the counts being null, not merely absent', () => {
    // A default parameter covers undefined and NOT null, and App holds these
    // counts in state that is null before the first load — so the rail, which
    // renders on that first paint, would have taken the whole desktop shell
    // down with it. The rail passes them straight through.
    expect(waitingBadgeCount(null)).toBe(0)
    expect(waitingBadgeCount(undefined)).toBe(0)
    expect(homeQueueSummary(null).clear).toBe(true)
  })

  it('is zero only when the queue really is empty', () => {
    expect(waitingBadgeCount({})).toBe(0)
    expect(waitingBadgeCount({ dueCount: 0, learnCount: 0, newCount: 0, calibrationCount: 0 })).toBe(0)
  })
})
