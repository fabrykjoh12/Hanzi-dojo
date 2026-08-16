import { describe, expect, it } from 'vitest'
import { HOME_MOTION, homeDailyStage, homeProgressPct, homeQueueSummary, storyReadStateForDate } from './homePresentation'

describe('Home presentation data', () => {
  it('combines reviews and new cards into the hero count', () => {
    expect(homeQueueSummary({ dueCount: 127, learnCount: 0, newCount: 10 })).toEqual({
      totalReady: 137,
      reviewCount: 127,
      newCount: 10,
      clear: false,
      failed: false,
    })
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
