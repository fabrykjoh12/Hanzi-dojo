import { describe, expect, it } from 'vitest'
import {
  deskCardsSub, practiceStatus, storyEyebrow, storyStatus,
} from './homeModel'

describe('deskCardsSub', () => {
  it('summarizes the session contents with the estimate', () => {
    expect(deskCardsSub({ counts: { dueCount: 13, newCount: 10 }, estimate: '~9 min' }))
      .toBe('13 reviews · 10 new · ~9 min')
  })

  it('uses the singular for one review and hides a missing estimate', () => {
    expect(deskCardsSub({ counts: { dueCount: 1, newCount: 2 } })).toBe('1 review · 2 new')
  })

  it('says so when the counts failed, so starting reads as the retry', () => {
    expect(deskCardsSub({ counts: { failed: true } })).toBe('Queue unavailable — starting will retry')
  })
})

describe('storyStatus', () => {
  it('follows the daily stage', () => {
    expect(storyStatus({ stage: 'cards' })).toBe('Finish cards to unlock')
    expect(storyStatus({ stage: 'story', daily: { story: {} } })).toBe('Ready to read')
    expect(storyStatus({ stage: 'story', daily: undefined })).toBe('Finding today’s story')
    expect(storyStatus({ stage: 'caught-up', daily: null })).toBe('Caught up')
    expect(storyStatus({ stage: 'practice', daily: { completedToday: true } })).toBe('Story complete')
    expect(storyStatus({ stage: 'complete', daily: { completedToday: true } })).toBe('Story complete')
  })
})

describe('practiceStatus', () => {
  it('follows the daily stage', () => {
    expect(practiceStatus('practice')).toBe('Ready to practice')
    expect(practiceStatus('complete')).toBe('Complete for today')
    expect(practiceStatus('caught-up')).toBe('Nothing due')
    expect(practiceStatus('cards')).toBe('After your story')
    expect(practiceStatus('story')).toBe('After your story')
  })
})

describe('storyEyebrow', () => {
  it('joins level and readability when both are known', () => {
    expect(storyEyebrow({ levelLabel: 'HSK 1', knownPct: 92 })).toBe('HSK 1 · 92% readable')
    expect(storyEyebrow({ levelLabel: 'HSK 1', knownPct: null })).toBe('HSK 1')
    expect(storyEyebrow({ levelLabel: 'HSK 1', knownPct: 0 })).toBe('HSK 1')
    expect(storyEyebrow({})).toBe('')
  })
})
