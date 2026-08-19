import { describe, expect, it } from 'vitest'
import {
  aheadLine, heroAriaLabel, homeAction, homeHeaderMeta, queueBreakdown,
  queueHeadline, storyHandoffSub, storyStatus, tomorrowLine, weekLine,
} from './homeModel'

describe('homeHeaderMeta', () => {
  it('prints the level and the weekday', () => {
    expect(homeHeaderMeta('HSK 1', new Date(2026, 7, 16))).toBe('HSK 1 · Sunday')
    expect(homeHeaderMeta('HSK 3', new Date(2026, 0, 1))).toBe('HSK 3 · Thursday')
  })
})

describe('homeAction', () => {
  it('starts reviewing while any cards wait', () => {
    expect(homeAction({ dueCount: 3 })).toEqual({ label: 'Start reviewing', go: 'study' })
    expect(homeAction({ newCount: 1 })).toEqual({ label: 'Start reviewing', go: 'study' })
    expect(homeAction({ learnCount: 2 })).toEqual({ label: 'Start reviewing', go: 'study' })
  })

  it('hands over to reading once the queue is clear', () => {
    expect(homeAction({ dueCount: 0, learnCount: 0, newCount: 0 }))
      .toEqual({ label: 'Read a story', go: 'stories' })
  })

  it('keeps the button on Study when the counts failed to load — it doubles as the retry', () => {
    expect(homeAction({ failed: true })).toEqual({ label: 'Start reviewing', go: 'study' })
  })
})

describe('queueHeadline', () => {
  it('shows the real total waiting with a plural caption', () => {
    expect(queueHeadline({ dueCount: 7, learnCount: 2, newCount: 3 }))
      .toEqual({ eyebrow: 'Ready to review', failed: false, value: '12', caption: 'cards waiting' })
  })

  it('uses the singular for one card', () => {
    expect(queueHeadline({ dueCount: 1 }).caption).toBe('card waiting')
  })

  it('shows the ✓ once the queue is clear', () => {
    expect(queueHeadline({})).toEqual({ eyebrow: 'Queue clear', failed: false, value: '✓', caption: 'all caught up' })
  })

  it('never shows a meaningless zero when the counts failed to load', () => {
    const headline = queueHeadline({ failed: true })
    expect(headline.failed).toBe(true)
    expect(headline.value).toBe('')
    expect(headline.caption).toBe('Couldn’t load today’s queue')
  })
})

describe('queueBreakdown', () => {
  it('labels the composition New / Learning / Review — never "Due"', () => {
    expect(queueBreakdown({ newCount: 3, learnCount: 2, dueCount: 7 })).toEqual([
      { label: 'New', value: 3 },
      { label: 'Learning', value: 2 },
      { label: 'Review', value: 7 },
    ])
  })

  it('defaults missing counts to zero', () => {
    expect(queueBreakdown({}).map(x => x.value)).toEqual([0, 0, 0])
  })
})

describe('heroAriaLabel', () => {
  it('names the action and the real queue size', () => {
    expect(heroAriaLabel({ counts: { dueCount: 11, newCount: 1 } }))
      .toBe('Start reviewing — 12 cards waiting')
    expect(heroAriaLabel({ counts: { dueCount: 1 } }))
      .toBe('Start reviewing — 1 card waiting')
  })

  it('switches to reading when the queue is clear', () => {
    expect(heroAriaLabel({ counts: {} })).toBe('Read a story — all caught up')
  })

  it('is honest about a failed load', () => {
    expect(heroAriaLabel({ counts: { failed: true } }))
      .toBe('Start reviewing — the queue couldn’t load, starting will retry')
  })
})

describe('storyStatus', () => {
  it('locks the story behind today’s cards', () => {
    expect(storyStatus({ stage: 'cards' })).toBe('Finish cards to unlock')
  })

  it('reports the search, the unlock, and completion', () => {
    expect(storyStatus({ stage: 'story', daily: undefined })).toBe('Finding today’s story')
    expect(storyStatus({ stage: 'story', daily: { completedToday: false } })).toBe('Ready to read')
    expect(storyStatus({ stage: 'caught-up', daily: null })).toBe('Caught up')
    expect(storyStatus({ stage: 'practice', daily: { completedToday: true } })).toBe('Story complete')
    expect(storyStatus({ stage: 'complete', daily: { completedToday: true } })).toBe('Story complete')
  })
})

describe('storyHandoffSub', () => {
  it('pairs the level with the readability, compactly', () => {
    expect(storyHandoffSub({ levelLabel: 'HSK 1', knownPct: 92 })).toBe('HSK 1 · 92% readable')
    expect(storyHandoffSub({ levelLabel: 'HSK 2', knownPct: 19 })).toBe('HSK 2 · 19% readable')
  })

  it('drops the readability when it is unknown or zero', () => {
    expect(storyHandoffSub({ levelLabel: 'HSK 1', knownPct: null })).toBe('HSK 1')
    expect(storyHandoffSub({ levelLabel: 'HSK 1', knownPct: 0 })).toBe('HSK 1')
  })

  it('survives a missing level label', () => {
    expect(storyHandoffSub({ levelLabel: '', knownPct: 40 })).toBe('40% readable')
  })
})

describe('weekLine', () => {
  it('summarizes the rhythm without guilt', () => {
    expect(weekLine([])).toBe('No sessions yet')
    expect(weekLine([
      { date: '2026-08-10', studied: true },
      { date: '2026-08-11', studied: false },
      { date: '2026-08-12', studied: true },
    ])).toBe('Studied 2 of the last 3 days')
  })
})

describe('tomorrowLine', () => {
  it('previews tomorrow’s load, or calls a free day a free day', () => {
    expect(tomorrowLine(25)).toBe('About 25 waiting tomorrow')
    expect(tomorrowLine(0)).toBe('Nothing due tomorrow — a free day')
    expect(tomorrowLine()).toBe('Nothing due tomorrow — a free day')
  })
})

describe('aheadLine', () => {
  it('previews tomorrow and the week’s average', () => {
    expect(aheadLine({ dueTomorrow: 25, forecastTotal: 70, perDay: 10 }))
      .toBe('About 25 waiting tomorrow · ~10/day this week')
  })

  it('calls a free day a free day', () => {
    expect(aheadLine({ dueTomorrow: 0, forecastTotal: 0, perDay: 0 }))
      .toBe('Nothing due tomorrow — a free day')
  })

  it('keeps the free day even when later days carry reviews', () => {
    expect(aheadLine({ dueTomorrow: 0, forecastTotal: 12, perDay: 2 }))
      .toBe('Nothing due tomorrow — a free day · ~2/day this week')
  })
})
