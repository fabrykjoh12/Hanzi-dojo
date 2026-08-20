import { describe, it, expect } from 'vitest'
import { continueCard } from './storyContinue'

const ch = (id, title, content = '今天我看朋友。朋友很好。') => ({ id, title, content })

const SERIES = {
  kind: 'series', key: 'moon', title: '月下的朋友',
  parts: [ch('m1', '1. 月下的朋友'), ch('m2', '2. 学校的晚上'), ch('m3', '3. 新的名字')],
}
const MANHUA = {
  kind: 'series', key: 'ink', title: 'Hanzi Dojo: The Inkbound',
  parts: [{ id: 'ink1', title: '第一话 · 我是新学生', content: '我来学校了。', panels: { meta: { episode_label: '第一话', episode_title: '我是新学生' } } }],
}
const STANDALONE = ch('solo', '《一块钱》')

const base = {
  units: [SERIES, MANHUA],
  stories: [...SERIES.parts, ...MANHUA.parts, STANDALONE],
  readIds: new Set(),
  featured: null,
  knownPctFor: () => 92,
}

describe('continueCard', () => {
  it('session-locked: the next chapter waits behind today’s flashcards, action goes to Study', () => {
    const card = continueCard({
      ...base,
      readIds: new Set(['m1']),
      rewardState: { state: 'locked', chapter: SERIES.parts[1] },
      activeUnit: SERIES,
    })
    expect(card.kind).toBe('session-locked')
    expect(card.action).toBe('study')
    expect(card.seriesTitle).toBe('月下的朋友')
    expect(card.chapterNumber).toBe(2)
    expect(card.total).toBe(3)
    expect(card.progress).toEqual({ readCount: 1, total: 3 })
    // A locked chapter advertises its requirement, not its readability.
    expect(card.knownPct).toBeNull()
  })

  it('banked behaves like session-locked (parity with the reward hero)', () => {
    const card = continueCard({
      ...base,
      readIds: new Set(['m1']),
      rewardState: { state: 'banked', chapter: SERIES.parts[1] },
      activeUnit: SERIES,
    })
    expect(card.kind).toBe('session-locked')
    expect(card.action).toBe('study')
  })

  it('unlocked-today: the claimed chapter reads now, with readability and minutes', () => {
    const card = continueCard({
      ...base,
      readIds: new Set(['m1']),
      rewardState: { state: 'unlocked-today', storyId: 'm2' },
      activeUnit: SERIES,
    })
    expect(card.kind).toBe('unlocked-today')
    expect(card.action).toBe('read')
    expect(card.chapter.id).toBe('m2')
    expect(card.chapterTitle).toBe('学校的晚上')
    expect(card.knownPct).toBe(92)
    expect(card.minutes).toBeGreaterThan(0)
  })

  it('unlocked-today already read falls through to the featured pick', () => {
    const card = continueCard({
      ...base,
      readIds: new Set(['m1', 'm2']),
      rewardState: { state: 'unlocked-today', storyId: 'm2' },
      activeUnit: SERIES,
      featured: STANDALONE,
    })
    expect(card.kind).toBe('start-here')
    expect(card.chapter.id).toBe('solo')
  })

  it('continue: everything reachable is open, next unread chapter leads', () => {
    const card = continueCard({
      ...base,
      readIds: new Set(['m1', 'm2']),
      rewardState: { state: 'all-unlocked', chapter: SERIES.parts[2] },
      activeUnit: SERIES,
    })
    expect(card.kind).toBe('continue')
    expect(card.chapterNumber).toBe(3)
    expect(card.progress).toEqual({ readCount: 2, total: 3 })
    expect(card.knownPct).toBe(92)
  })

  it('start-here: no active series features the daily pick through its unit', () => {
    const card = continueCard({
      ...base,
      rewardState: { state: 'no-series' },
      activeUnit: null,
      featured: SERIES.parts[0],
    })
    expect(card.kind).toBe('start-here')
    expect(card.unit).toBe(SERIES)
    expect(card.chapter.id).toBe('m1')
    expect(card.total).toBe(3)
    expect(card.progress).toBeNull()
  })

  it('start-here on a unit-less standalone still yields a complete card', () => {
    const card = continueCard({
      ...base,
      rewardState: { state: 'no-series' },
      activeUnit: null,
      featured: STANDALONE,
    })
    expect(card.unit).toBeNull()
    expect(card.seriesTitle).toBe('《一块钱》')
    expect(card.total).toBe(1)
  })

  it('carries manhua native episode labels', () => {
    const card = continueCard({
      ...base,
      rewardState: { state: 'no-series' },
      activeUnit: null,
      featured: MANHUA.parts[0],
    })
    expect(card.nativeLabel).toBe('第一话')
    expect(card.chapterTitle).toBe('我是新学生')
  })

  it('renders nothing when there is nothing to point at', () => {
    expect(continueCard({ ...base, rewardState: { state: 'series-complete' }, activeUnit: SERIES })).toBeNull()
    expect(continueCard({ ...base, rewardState: null, activeUnit: null })).toBeNull()
    // A featured story the learner already read is noise, not a card.
    expect(continueCard({
      ...base, readIds: new Set(['solo']),
      rewardState: { state: 'no-series' }, activeUnit: null, featured: STANDALONE,
    })).toBeNull()
  })
})
