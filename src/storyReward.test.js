import { describe, it, expect } from 'vitest'
import {
  qualifiesForReward, buildSeriesUnits, resolveActiveSeries, rewardStateFor,
  recentWordsInStory,
} from './storyReward'

const story = (id, title, level = 1, extra = {}) => ({
  id, title, level, presentation: 'paced', content: '今天很好。', ...extra,
})
const serial = (id, title, level, name) => story(id, title, level, {
  panels: { meta: { series: name } },
})

// Two series (A: 3 chapters, B: 2 chapters) and a standalone.
const STORIES = [
  serial('a1', '第一话 · 开始', 1, 'Series A'),
  serial('a2', '第二话 · 路上', 1, 'Series A'),
  serial('a3', '第三话 · 到了', 1, 'Series A'),
  serial('b1', '1. 新家', 2, 'Series B'),
  serial('b2', '2. 邻居', 2, 'Series B'),
  story('solo', '一个人', 1),
]

const unitsOf = () => buildSeriesUnits(STORIES)
const unitA = () => unitsOf().find(u => u.title === 'Series A')

describe('qualifiesForReward', () => {
  it('the scheduled review session with graded cards qualifies', () => {
    expect(qualifiesForReward({ mode: 'review', graded: 12 })).toBe(true)
  })
  it('an empty session or a weak-words drill does not', () => {
    expect(qualifiesForReward({ mode: 'review', graded: 0 })).toBe(false)
    expect(qualifiesForReward({ mode: 'weak', graded: 30 })).toBe(false)
  })
})

describe('buildSeriesUnits', () => {
  it('groups multi-chapter series per level and skips standalones', () => {
    const units = unitsOf()
    expect(units.map(u => u.title).sort()).toEqual(['Series A', 'Series B'])
    expect(unitA().parts.map(p => p.id)).toEqual(['a1', 'a2', 'a3'])
    expect(units.find(u => u.title === 'Series B').level).toBe(2)
  })
  it('a same-named serial at two levels is two units with distinct keys', () => {
    const cross = [
      serial('x1', '第一话', 1, 'Inkbound'),
      serial('x2', '第二话', 1, 'Inkbound'),
      serial('y1', '第三话', 3, 'Inkbound'),
      serial('y2', '第四话', 3, 'Inkbound'),
    ]
    const units = buildSeriesUnits(cross)
    expect(units).toHaveLength(2)
    expect(new Set(units.map(u => u.key)).size).toBe(2)
  })
})

describe('resolveActiveSeries', () => {
  it('honors the explicit choice while it has chapters left', () => {
    const unit = resolveActiveSeries({
      units: unitsOf(), activeSeriesKey: unitA().key, recentReads: [],
    })
    expect(unit.title).toBe('Series A')
  })
  it('falls back to the most recently read unfinished series', () => {
    const unit = resolveActiveSeries({
      units: unitsOf(),
      activeSeriesKey: null,
      recentReads: [
        { story_id: 'a1', read_at: '2026-08-01T10:00:00Z' },
        { story_id: 'b1', read_at: '2026-08-05T10:00:00Z' },
      ],
    })
    expect(unit.title).toBe('Series B')
  })
  it('a finished explicit choice falls through to the fallback', () => {
    const unit = resolveActiveSeries({
      units: unitsOf(),
      activeSeriesKey: unitsOf().find(u => u.title === 'Series B').key,
      recentReads: [
        { story_id: 'b1', read_at: '2026-08-05T10:00:00Z' },
        { story_id: 'b2', read_at: '2026-08-06T10:00:00Z' },
        { story_id: 'a1', read_at: '2026-08-01T10:00:00Z' },
      ],
    })
    expect(unit.title).toBe('Series A')
  })
  it('null when nothing was ever started', () => {
    expect(resolveActiveSeries({ units: unitsOf(), activeSeriesKey: null, recentReads: [] })).toBeNull()
  })
})

describe('rewardStateFor', () => {
  it('no series → invite to pick a story', () => {
    expect(rewardStateFor({ unit: null, readIds: new Set(), unlockIds: new Set(), claim: null }))
      .toEqual({ state: 'no-series' })
  })
  it('locked before the session, banked after an unredeemed claim', () => {
    const args = { unit: unitA(), readIds: new Set(['a1']), unlockIds: new Set() }
    expect(rewardStateFor({ ...args, claim: null }))
      .toMatchObject({ state: 'locked', chapter: { id: 'a2' } })
    expect(rewardStateFor({ ...args, claim: { claim_date: '2026-08-08', story_id: null } }))
      .toMatchObject({ state: 'banked', chapter: { id: 'a2' } })
  })
  it('a redeemed claim wins even after switching series', () => {
    const other = unitsOf().find(u => u.title === 'Series B')
    expect(rewardStateFor({
      unit: other, readIds: new Set(), unlockIds: new Set(),
      claim: { claim_date: '2026-08-08', story_id: 'a2' },
    })).toEqual({ state: 'unlocked-today', storyId: 'a2' })
  })
  it('all chapters reachable but unread → all-unlocked with the next read', () => {
    expect(rewardStateFor({
      unit: unitA(), readIds: new Set(['a1']), unlockIds: new Set(['a2', 'a3']), claim: null,
    })).toMatchObject({ state: 'all-unlocked', chapter: { id: 'a2' } })
  })
  it('everything read → series complete', () => {
    expect(rewardStateFor({
      unit: unitA(), readIds: new Set(['a1', 'a2', 'a3']), unlockIds: new Set(), claim: null,
    })).toEqual({ state: 'series-complete' })
  })
})

describe('recentWordsInStory', () => {
  const w = (id, word) => ({ id, word })
  it('keeps story order, dedupes, and caps the preview', () => {
    const storyWords = [w('v1', '市场'), w('v2', '晚上'), w('v1', '市场'), w('v3', '朋友'), w('v4', '买')]
    const out = recentWordsInStory({
      storyWords, recentVocabIds: ['v1', 'v3', 'v4'], max: 2,
    })
    expect(out.map(x => x.word)).toEqual(['市场', '朋友'])
  })
  it('empty when nothing recent appears', () => {
    expect(recentWordsInStory({ storyWords: [w('v1', 'a')], recentVocabIds: [] })).toEqual([])
  })
})
