import { describe, expect, it } from 'vitest'
import {
  overviewProgressLabel, overviewStepIsCurrent, overviewStepStatus, overviewSteps,
  storyEyebrow, todayCardChip, todayCardSub, todayDateLabel, todayDoneSummary,
  todayEnvironment, todayTomorrowLine, todayWordSize,
} from './todayModel'

describe('todayDateLabel', () => {
  it('prints weekday, month and day', () => {
    expect(todayDateLabel(new Date(2026, 7, 16))).toBe('Sunday, August 16')
    expect(todayDateLabel(new Date(2026, 0, 1))).toBe('Thursday, January 1')
  })
})

describe('todayWordSize', () => {
  it('steps down with character count so the word always fits one line', () => {
    expect(todayWordSize('花')).toBe(76)
    expect(todayWordSize('你好')).toBe(76)
    expect(todayWordSize('一点儿')).toBe(60)
    expect(todayWordSize('没关系吗')).toBe(48)
    expect(todayWordSize('不好意思了')).toBe(38)
  })
})

describe('storyEyebrow', () => {
  it('joins level and readability when both are known', () => {
    expect(storyEyebrow({ levelLabel: 'HSK 1', knownPct: 67 })).toBe('HSK 1 · 67% readable')
    expect(storyEyebrow({ levelLabel: 'HSK 1', knownPct: null })).toBe('HSK 1')
    expect(storyEyebrow({ levelLabel: 'HSK 1', knownPct: 0 })).toBe('HSK 1')
    expect(storyEyebrow({})).toBe('')
  })
})

describe('todayEnvironment', () => {
  it('maps each daily stage to the object Today rests on', () => {
    expect(todayEnvironment('cards')).toBe('cards')
    expect(todayEnvironment('story')).toBe('story')
    expect(todayEnvironment('practice')).toBe('practice')
    expect(todayEnvironment('complete')).toBe('done')
  })

  it('falls back to the shelf when nothing is scheduled', () => {
    expect(todayEnvironment('caught-up')).toBe('shelf')
    expect(todayEnvironment(undefined)).toBe('shelf')
  })
})

describe('todayCardChip', () => {
  it('places the card in the session once the queue length is known', () => {
    expect(todayCardChip({ total: 23, state: 'review' })).toBe('1 OF 23 · REVIEW')
    expect(todayCardChip({ total: 5, state: 'new' })).toBe('1 OF 5 · FIRST TIME')
  })

  it('never guesses a position it does not have', () => {
    expect(todayCardChip({ state: 'review' })).toBe('REVIEW')
    expect(todayCardChip({ total: 0, state: 'new' })).toBe('FIRST TIME')
  })

  it('uses the same two state words as the study card marker', () => {
    // cardMarker.js prints FIRST TIME for new cards and REVIEW for everything
    // else — learning and relearning included.
    expect(todayCardChip({ total: 2, state: 'learning' })).toBe('1 OF 2 · REVIEW')
    expect(todayCardChip({ total: 2, state: 'relearning' })).toBe('1 OF 2 · REVIEW')
  })
})

describe('todayCardSub', () => {
  it('reports what the session contains', () => {
    expect(todayCardSub({ counts: { dueCount: 10, learnCount: 3, newCount: 10 }, estimate: '~9 min' }))
      .toBe('13 reviews · 10 new · ~9 min')
  })

  it('singularises a lone review and drops a missing estimate', () => {
    expect(todayCardSub({ counts: { dueCount: 1, learnCount: 0, newCount: 0 } }))
      .toBe('1 review · 0 new')
  })

  it('says so when the counts could not be trusted', () => {
    expect(todayCardSub({ counts: { failed: true, dueCount: 0, newCount: 0 } }))
      .toBe('Queue unavailable — starting will retry')
  })
})

describe('todayDoneSummary', () => {
  it('counts only what actually happened today', () => {
    expect(todayDoneSummary({ studiedToday: 23, storyRead: true })).toBe('23 cards · 1 story')
    expect(todayDoneSummary({ studiedToday: 23, storyRead: false })).toBe('23 cards')
    expect(todayDoneSummary({ studiedToday: 0, storyRead: true })).toBe('1 story')
  })

  it('singularises one card', () => {
    expect(todayDoneSummary({ studiedToday: 1 })).toBe('1 card')
  })

  it('prints nothing rather than a zero when the day has no record', () => {
    expect(todayDoneSummary({})).toBe('')
    expect(todayDoneSummary({ studiedToday: 0, storyRead: false })).toBe('')
  })
})

describe('todayTomorrowLine', () => {
  it('states what is scheduled, without nagging', () => {
    expect(todayTomorrowLine({ dueTomorrow: 12 })).toBe('Tomorrow — 12 reviews due')
    expect(todayTomorrowLine({ dueTomorrow: 1 })).toBe('Tomorrow — 1 review due')
  })

  it('stays silent when nothing is due', () => {
    expect(todayTomorrowLine({ dueTomorrow: 0 })).toBe('')
    expect(todayTomorrowLine({})).toBe('')
  })
})

describe('overviewStepStatus', () => {
  it('marks the live step and reports the rest', () => {
    expect(overviewStepStatus({ key: 'cards', stage: 'cards' })).toBe('Up now')
    expect(overviewStepStatus({ key: 'cards', stage: 'story' })).toBe('Done')
    expect(overviewStepStatus({ key: 'story', stage: 'cards' })).toBe('After cards')
    expect(overviewStepStatus({ key: 'story', stage: 'story', daily: {} })).toBe('Up now')
    expect(overviewStepStatus({ key: 'story', stage: 'practice', daily: {} })).toBe('Read')
    expect(overviewStepStatus({ key: 'practice', stage: 'practice' })).toBe('Up now')
    expect(overviewStepStatus({ key: 'practice', stage: 'story' })).toBe('After your story')
    expect(overviewStepStatus({ key: 'practice', stage: 'complete' })).toBe('Done')
  })

  it('distinguishes a story still loading from no story at all', () => {
    expect(overviewStepStatus({ key: 'story', stage: 'story', daily: undefined })).toBe('Finding today’s story')
    expect(overviewStepStatus({ key: 'story', stage: 'caught-up', daily: null })).toBe('Nothing new')
  })
})

describe('overviewStepIsCurrent', () => {
  it('is true only for the step Today is resting on', () => {
    expect(overviewStepIsCurrent({ key: 'cards', stage: 'cards' })).toBe(true)
    expect(overviewStepIsCurrent({ key: 'story', stage: 'cards' })).toBe(false)
    expect(overviewStepIsCurrent({ key: 'practice', stage: 'practice' })).toBe(true)
  })
})

describe('overviewSteps', () => {
  it('lists the daily loop with one current step', () => {
    const steps = overviewSteps({
      stage: 'cards',
      counts: { dueCount: 10, learnCount: 3, newCount: 10, grammarDueCount: 4 },
      daily: { completedToday: false },
    })
    expect(steps.map(s => s.key)).toEqual(['cards', 'story', 'practice'])
    expect(steps.filter(s => s.current)).toHaveLength(1)
    expect(steps[0].sub).toBe('13 reviews · 10 new')
    expect(steps[0].status).toBe('Up now')
    expect(steps[2].sub).toBe('4 patterns due')
  })

  it('reports cards as done once the queue is clear', () => {
    const steps = overviewSteps({ stage: 'story', counts: { grammarDueCount: 1 }, daily: {} })
    expect(steps[0].sub).toBe('Nothing due right now')
    expect(steps[0].status).toBe('Done')
    expect(steps[2].sub).toBe('1 pattern due')
  })

  it('carries a failed queue through to the sheet', () => {
    const steps = overviewSteps({ stage: 'cards', counts: { failed: true }, daily: undefined })
    expect(steps[0].sub).toBe('Queue unavailable — starting will retry')
  })
})

describe('overviewProgressLabel', () => {
  it('reads as level then progress', () => {
    expect(overviewProgressLabel({ levelLabel: 'HSK 2', learned: 28, totalWords: 44 }))
      .toBe('HSK 2 · 28 of 44 words')
  })

  it('degrades to the level alone when the deck size is unknown', () => {
    expect(overviewProgressLabel({ levelLabel: 'HSK 2', learned: 0, totalWords: 0 })).toBe('HSK 2')
    expect(overviewProgressLabel({})).toBe('')
  })
})
