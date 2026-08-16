import { describe, expect, it } from 'vitest'
import {
  formatSealCount, hanziDisplaySize, heroModel, homeDateEyebrow,
  pickDeckPreview, practiceStatus, storyEyebrow, storyStatus,
} from './homeModel'

describe('homeDateEyebrow', () => {
  it('prints weekday, month and day', () => {
    expect(homeDateEyebrow(new Date(2026, 7, 16))).toBe('Sunday · August 16')
    expect(homeDateEyebrow(new Date(2026, 0, 1))).toBe('Thursday · January 1')
  })
})

describe('formatSealCount', () => {
  it('caps at 99+', () => {
    expect(formatSealCount(1)).toBe('1')
    expect(formatSealCount(99)).toBe('99')
    expect(formatSealCount(100)).toBe('99+')
  })
})

describe('hanziDisplaySize', () => {
  it('steps down with character count so the word always fits one line', () => {
    expect(hanziDisplaySize('花')).toBe(64)
    expect(hanziDisplaySize('你好')).toBe(64)
    expect(hanziDisplaySize('一点儿')).toBe(52)
    expect(hanziDisplaySize('没关系吗')).toBe(42)
    expect(hanziDisplaySize('不好意思了')).toBe(34)
  })
})

describe('heroModel', () => {
  it('summarizes a waiting queue with the count sealed and the CTA live', () => {
    const hero = heroModel({
      counts: { dueCount: 13, learnCount: 0, newCount: 10 },
      stage: 'cards',
      estimate: '~9 min',
    })
    expect(hero.seal).toBe('23')
    expect(hero.sub).toBe('13 reviews · 10 new · ~9 min')
    expect(hero.cta).toEqual({ label: 'Start cards', enabled: true })
    expect(hero.showWord).toBe(true)
  })

  it('uses the singular for one review and hides a missing estimate', () => {
    const hero = heroModel({ counts: { dueCount: 1, newCount: 2 }, stage: 'cards', estimate: '' })
    expect(hero.sub).toBe('1 review · 2 new')
  })

  it('marks a cleared queue complete and disables the CTA', () => {
    const hero = heroModel({ counts: {}, stage: 'story' })
    expect(hero.seal).toBe('✓')
    expect(hero.sub).toBe('Nothing due right now')
    expect(hero.cta).toEqual({ label: 'Cards complete', enabled: false })
    expect(hero.showWord).toBe(false)
    expect(hero.clear).toBe(true)
  })

  it('keeps the CTA live when counts failed, so starting is the retry', () => {
    const hero = heroModel({ counts: { failed: true }, stage: 'cards' })
    expect(hero.seal).toBe('—')
    expect(hero.cta.enabled).toBe(true)
    expect(hero.showWord).toBe(false)
  })
})

describe('pickDeckPreview', () => {
  const past = '2020-01-01T00:00:00.000Z'
  const card = (vocabId, state, extra = {}) => ({
    vocab_id: vocabId, state, due_at: past, created_at: past,
    stability: 5, lapses: 0, ...extra,
  })

  it('opens on a learning card when one is due, matching the study queue', () => {
    const cards = [card('v1', 'review'), card('v2', 'learning'), card('v3', 'review')]
    expect(pickDeckPreview({ cards, seed: 's', now: new Date() })).toBe('v2')
  })

  it('falls back to a due review when nothing is learning', () => {
    const cards = [card('v1', 'review'), card('v2', 'review')]
    const picked = pickDeckPreview({ cards, seed: 's', now: new Date() })
    expect(['v1', 'v2']).toContain(picked)
  })

  it('is stable for the same seed and inputs', () => {
    const cards = [card('v1', 'review'), card('v2', 'review'), card('v3', 'review')]
    const a = pickDeckPreview({ cards, seed: 'seed-a', now: new Date(2026, 7, 16) })
    const b = pickDeckPreview({ cards, seed: 'seed-a', now: new Date(2026, 7, 16) })
    expect(a).toBe(b)
  })

  it('returns null when nothing is due (a new-cards-only day)', () => {
    const future = '2099-01-01T00:00:00.000Z'
    const cards = [card('v1', 'review', { due_at: future })]
    expect(pickDeckPreview({ cards, seed: 's', now: new Date() })).toBe(null)
  })

  it('caps the review pool on a gentle return, like Study does', () => {
    // 30 due reviews, returning: only the 20 oldest-due survive the cap, so a
    // card due later than the cap window can never be the opener.
    const cards = []
    for (let i = 0; i < 30; i += 1) {
      const due = new Date(Date.UTC(2020, 0, 1 + i)).toISOString()
      cards.push(card('v' + i, 'review', { due_at: due }))
    }
    const picked = pickDeckPreview({ cards, seed: 's', now: new Date(), returning: true })
    const idx = Number(picked.slice(1))
    expect(idx).toBeLessThan(20)
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
    expect(storyEyebrow({ levelLabel: 'HSK 1', knownPct: 87 })).toBe('HSK 1 · 87% readable')
    expect(storyEyebrow({ levelLabel: 'HSK 1', knownPct: null })).toBe('HSK 1')
    expect(storyEyebrow({ levelLabel: 'HSK 1', knownPct: 0 })).toBe('HSK 1')
    expect(storyEyebrow({})).toBe('')
  })
})
