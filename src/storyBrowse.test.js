import { describe, it, expect } from 'vitest'
import { buildBrowseModel, posterMeta, readableLabel, EARLIER_PREVIEW, AHEAD_PREVIEW } from './storyBrowse'

const ch = (id, title, content = '今天我看朋友。朋友很好。') => ({ id, title, content })

const seriesUnit = (key, over = {}) => ({
  kind: 'series', key, title: key,
  parts: [ch(key + '-1', '1. ' + key), ch(key + '-2', '2. ' + key), ch(key + '-3', '3. ' + key)],
  next: null, readCount: 0, total: 3, allRead: false,
  locked: false, remaining: 0, knownPct: 90,
  ...over,
})
const storyUnit = (key, over = {}) => {
  const part = ch(key, key)
  return {
    kind: 'story', key, title: key, parts: [part], next: part,
    readCount: 0, total: 1, allRead: false, locked: false, remaining: 0, knownPct: 88,
    ...over,
  }
}

describe('buildBrowseModel', () => {
  const A = seriesUnit('A')
  const B = seriesUnit('B')
  const solo = storyUnit('《一块钱》')
  const practice = { id: 'p1', title: '下雨天', presentation: 'scene' }
  const sections = [
    { level: 2, isCurrent: true, readCount: 3, total: 12, units: [A, B, solo], practice: [practice] },
    { level: 1, isCurrent: false, readCount: 10, total: 17, units: [seriesUnit('C'), seriesUnit('D'), seriesUnit('E'), storyUnit('F')], practice: [] },
  ]

  it('splits the current level into series, shorts and practice — series first', () => {
    const m = buildBrowseModel({ sections, aheadSection: null })
    expect(m.current.level).toBe(2)
    expect(m.current.series).toEqual([A, B])
    expect(m.current.shorts).toEqual([solo])
    expect(m.current.practice).toEqual([practice])
    expect(m.current.readCount).toBe(3)
    expect(m.current.total).toBe(12)
  })

  it('collapses earlier levels to a preview with the rest behind See all', () => {
    const m = buildBrowseModel({ sections, aheadSection: null })
    expect(m.earlier).toHaveLength(1)
    const lvl1 = m.earlier[0]
    expect(lvl1.level).toBe(1)
    expect(lvl1.preview).toHaveLength(EARLIER_PREVIEW)
    expect(lvl1.preview.map(u => u.key)).toEqual(['C', 'D'])
    expect(lvl1.rest.map(u => u.key)).toEqual(['E', 'F'])
    expect(lvl1.unitCount).toBe(4)
  })

  it('teases the next level with a bounded preview and the real count', () => {
    const ahead = { level: 3, units: [seriesUnit('X'), seriesUnit('Y'), storyUnit('Z'), storyUnit('W')] }
    const m = buildBrowseModel({ sections, aheadSection: ahead })
    expect(m.comingUp.level).toBe(3)
    expect(m.comingUp.preview).toHaveLength(AHEAD_PREVIEW)
    expect(m.comingUp.count).toBe(4)
  })

  it('handles a missing current section and an empty shelf', () => {
    const m = buildBrowseModel({ sections: [sections[1]], aheadSection: null })
    expect(m.current).toBeNull()
    expect(m.earlier).toHaveLength(1)
    expect(buildBrowseModel({ sections: [], aheadSection: null })).toEqual({ current: null, earlier: [], comingUp: null })
  })
})

describe('posterMeta', () => {
  it('fresh series: chapter count with readability', () => {
    const u = seriesUnit('A', { next: null, knownPct: 92 })
    expect(posterMeta(u)).toBe('3 chapters · 92% readable')
  })

  it('started series: honest position, next chapter first', () => {
    const u = seriesUnit('A')
    u.readCount = 2
    u.next = u.parts[2]
    u.knownPct = 94
    expect(posterMeta(u)).toBe('Chapter 3 of 3 · 94% readable')
  })

  it('finished series and read single both say Read', () => {
    expect(posterMeta(seriesUnit('A', { allRead: true, readCount: 3 }))).toBe('Read')
    expect(posterMeta(storyUnit('S', { allRead: true, readCount: 1 }))).toBe('Read')
  })

  it('single story: minutes with readability, no level or format prefix', () => {
    const u = storyUnit('S', { knownPct: 88 })
    const meta = posterMeta(u)
    expect(meta).toMatch(/^\d+ min · 88% readable$/)
    expect(meta).not.toContain('HSK')
  })

  it('tier lock states the real requirement', () => {
    expect(posterMeta(seriesUnit('A', { locked: true, remaining: 40 }))).toBe('Learn 40 more words')
    expect(posterMeta(seriesUnit('A', { locked: true, remaining: 1 }))).toBe('Learn 1 more word')
  })

  it('level lock names the gate', () => {
    const u = seriesUnit('A', { locked: true, levelLocked: true, remaining: null })
    expect(posterMeta(u, { levelLabel: 'HSK 3' })).toBe('Unlocks at HSK 3')
  })

  it('readableLabel formats once, null-safe', () => {
    expect(readableLabel(92)).toBe('92% readable')
    expect(readableLabel(null)).toBeNull()
  })
})
