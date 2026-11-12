import { describe, it, expect } from 'vitest'
import { homeCard, minutesLine, progressLine } from './homeCard'
import { GENTLE_REVIEW_CAP } from './gentleReturn'

const ready = { dueCount: 10, learnCount: 3, newCount: 10 }

describe('minutesLine', () => {
  it('says nothing for an empty estimate', () => {
    expect(minutesLine(0)).toBe('')
    expect(minutesLine(undefined)).toBe('')
  })
  it('does not fake precision for a one-minute session', () => {
    expect(minutesLine(1)).toBe('About a minute')
  })
  it('writes the minutes out in a sentence', () => {
    expect(minutesLine(12)).toBe('About 12 minutes')
  })
})

describe('progressLine', () => {
  it('names the next level', () => {
    expect(progressLine({ learned: 5, totalWords: 44, nextLevelLabel: 'HSK 3' })).toBe('5 of 44 words to HSK 3')
  })
  it('says nothing when the level has no words to count', () => {
    expect(progressLine({ learned: 0, totalWords: 0, nextLevelLabel: 'HSK 3' })).toBe('')
  })
  it('singular for a one-word level', () => {
    expect(progressLine({ learned: 1, totalWords: 1, nextLevelLabel: 'HSK 3' })).toBe('1 of 1 word to HSK 3')
  })
  it('stays a sentence when there is no next level label', () => {
    expect(progressLine({ learned: 3, totalWords: 9 })).toBe('3 of 9 words')
  })
})

describe('homeCard — ready', () => {
  const card = homeCard({ counts: ready, learned: 5, totalWords: 44, nextLevelLabel: 'HSK 3' })

  it('leads with the count as a sentence, not a hero metric', () => {
    expect(card.state).toBe('ready')
    expect(card.title).toBe('23 cards to review')
  })
  it('opens Study', () => {
    expect(card.go).toBe('study')
  })
  it('gives the session length in plain words', () => {
    expect(card.detail).toMatch(/^About \d+ minutes?$|^About a minute$/)
  })
  it('carries level progress and its percentage', () => {
    expect(card.progress).toBe('5 of 44 words to HSK 3')
    expect(card.pct).toBeGreaterThan(0)
    expect(card.pct).toBeLessThan(100)
  })
  it('announces the action and the whole state to a screen reader', () => {
    expect(card.ariaLabel).toMatch(/^Start reviewing\. 23 cards to review\./)
    expect(card.ariaLabel).toContain('5 of 44 words to HSK 3')
  })
  it('singular for one card', () => {
    expect(homeCard({ counts: { dueCount: 1 } }).title).toBe('1 card to review')
  })
  it('counts calibration checks — they are work the session serves', () => {
    expect(homeCard({ counts: { calibrationCount: 4 } }).title).toBe('4 cards to review')
  })
  it('never uses dot-joined meta strings or abbreviations', () => {
    for (const s of [card.title, card.detail, card.progress]) {
      expect(s).not.toContain('·')
      expect(s).not.toMatch(/~|\bmin\b/)
    }
  })
})

describe('homeCard — back after a break', () => {
  const backlog = { dueCount: 60, learnCount: 0, newCount: 5 }

  it('promises the capped handful the session will actually serve', () => {
    const card = homeCard({ counts: backlog, returning: true })
    expect(card.title).toBe((GENTLE_REVIEW_CAP + 5) + ' cards to review')
    expect(card.detail).toBe('Welcome back. The rest return over the next few days.')
  })
  it('is a normal day when the backlog is within the cap', () => {
    const card = homeCard({ counts: { dueCount: 3 }, returning: true })
    expect(card.title).toBe('3 cards to review')
    expect(card.detail).toMatch(/^About/)
  })
  it('a returning flag alone changes nothing for a learner who has not been away', () => {
    expect(homeCard({ counts: backlog }).title).toBe('65 cards to review')
  })
})

describe('homeCard — all caught up', () => {
  it('turns the card into the way to a story', () => {
    const card = homeCard({ counts: {} })
    expect(card.state).toBe('clear')
    expect(card.go).toBe('stories')
    expect(card.title).toBe('All caught up')
    expect(card.detail).toBe('Read a story.')
  })
  it('mentions tomorrow only when tomorrow holds something', () => {
    expect(homeCard({ counts: { dueTomorrow: 7 } }).detail).toBe('7 cards tomorrow. Read a story until then.')
    expect(homeCard({ counts: { dueTomorrow: 1 } }).detail).toBe('1 card tomorrow. Read a story until then.')
  })
})

describe('homeCard — counts failed to load', () => {
  it('never claims "all caught up" for a day that did not load', () => {
    const card = homeCard({ counts: { failed: true } })
    expect(card.state).toBe('failed')
    expect(card.title).not.toMatch(/caught up/i)
    expect(card.go).toBe('study')
    expect(card.detail).toBe('Try again')
  })
  it('tolerates null counts', () => {
    expect(homeCard({ counts: null }).state).toBe('clear')
  })
})
