import { describe, it, expect } from 'vitest'
import {
  readingMinutes, READING_CHARS_PER_MINUTE, chapterInfo, unlockedChapterIds,
  chapterRows, seriesCta, nextRewardChapter, nextChapterInfo, seedUnlockIds,
} from './storyChapters'

const ch = (id, title, extra = {}) => ({ id, title, content: '今天天气很好。'.repeat(10), ...extra })

// A five-chapter series in reading order.
const PARTS = [
  ch('c1', '1. 陌生人'),
  ch('c2', '2. 一封信'),
  ch('c3', '3. 山上的秘密'),
  ch('c4', '4. 村子'),
  ch('c5', '5. 夜市'),
]

describe('readingMinutes', () => {
  it('uses the authored estimate when present', () => {
    const s = ch('a', 'T', { panels: { meta: { estimated_minutes: 8 } } })
    expect(readingMinutes(s)).toBe(8)
  })
  it('derives from content length otherwise, minimum one minute', () => {
    expect(readingMinutes(ch('a', 'T', { content: '好' }))).toBe(1)
    const long = ch('a', 'T', { content: '好'.repeat(READING_CHARS_PER_MINUTE * 3) })
    expect(readingMinutes(long)).toBe(3)
  })
  it('is null with no content at all (a teaser row)', () => {
    expect(readingMinutes({ id: 'a', title: 'T' })).toBeNull()
  })
  it('ignores whitespace and newlines when counting', () => {
    const s = ch('a', 'T', { content: ('好'.repeat(READING_CHARS_PER_MINUTE) + '\n  ').repeat(2) })
    expect(readingMinutes(s)).toBe(2)
  })
})

describe('chapterInfo', () => {
  it('reads the number and strips it from the title', () => {
    expect(chapterInfo(PARTS[1], 1)).toMatchObject({ number: 2, title: '一封信' })
  })
  it('reads 第N话 titles and keeps the native label from manhua meta', () => {
    const s = ch('m1', '第一话 · 我是新学生', {
      panels: { meta: { episode_label: '第一话', episode_title: '我是新学生' } },
    })
    expect(chapterInfo(s, 0)).toEqual({ number: 1, title: '我是新学生', nativeLabel: '第一话' })
  })
  it('falls back to position for unnumbered titles', () => {
    expect(chapterInfo(ch('x', '春天'), 3)).toMatchObject({ number: 4, title: '春天', nativeLabel: null })
  })
})

describe('unlockedChapterIds', () => {
  it('always opens chapter 1', () => {
    const open = unlockedChapterIds({ parts: PARTS, readIds: new Set(), unlockIds: new Set() })
    expect(open.has('c1')).toBe(true)
    expect(open.size).toBe(1)
  })
  it('opens read chapters and explicitly unlocked chapters', () => {
    const open = unlockedChapterIds({
      parts: PARTS, readIds: new Set(['c2']), unlockIds: new Set(['c3']),
    })
    expect([...open].sort()).toEqual(['c1', 'c2', 'c3'])
  })
  it('a single-chapter unit is fully open', () => {
    const open = unlockedChapterIds({ parts: [PARTS[4]], readIds: new Set(), unlockIds: new Set() })
    expect(open.has('c5')).toBe(true)
  })
  it('accepts arrays for the id sets', () => {
    const open = unlockedChapterIds({ parts: PARTS, readIds: ['c2'], unlockIds: ['c3'] })
    expect(open.has('c3')).toBe(true)
  })
})

describe('chapterRows', () => {
  it('marks exactly one current chapter — the first unread open one', () => {
    const rows = chapterRows({
      parts: PARTS, readIds: new Set(['c1', 'c2']), unlockIds: new Set(['c2', 'c3']),
    })
    expect(rows.map(r => r.current)).toEqual([false, false, true, false, false])
    expect(rows[2]).toMatchObject({ number: 3, read: false, unlocked: true })
    expect(rows[3]).toMatchObject({ unlocked: false })
  })
  it('nothing current when the next unread chapter is locked', () => {
    const rows = chapterRows({ parts: PARTS, readIds: new Set(['c1']), unlockIds: new Set() })
    expect(rows.every(r => !r.current)).toBe(true)
  })
})

describe('seriesCta', () => {
  it('start → chapter 1 when nothing is read', () => {
    expect(seriesCta({ parts: PARTS, readIds: new Set(), unlockIds: new Set() }))
      .toMatchObject({ kind: 'start', chapterNumber: 1 })
  })
  it('continue → the next open unread chapter', () => {
    expect(seriesCta({ parts: PARTS, readIds: new Set(['c1']), unlockIds: new Set(['c2']) }))
      .toMatchObject({ kind: 'continue', chapterNumber: 2 })
  })
  it('locked → mid-series with the next chapter behind a session', () => {
    expect(seriesCta({ parts: PARTS, readIds: new Set(['c1']), unlockIds: new Set() }))
      .toMatchObject({ kind: 'locked', chapterNumber: 2 })
  })
  it('reread → everything read', () => {
    const all = new Set(PARTS.map(p => p.id))
    expect(seriesCta({ parts: PARTS, readIds: all, unlockIds: new Set() }))
      .toMatchObject({ kind: 'reread', chapterNumber: 1 })
  })
  it('null for an empty unit', () => {
    expect(seriesCta({ parts: [], readIds: new Set(), unlockIds: new Set() })).toBeNull()
  })
})

describe('nextRewardChapter', () => {
  it('targets the first chapter that is neither open nor read', () => {
    const next = nextRewardChapter({ parts: PARTS, readIds: new Set(['c1']), unlockIds: new Set(['c2']) })
    expect(next.id).toBe('c3')
  })
  it('null when every chapter is reachable', () => {
    const next = nextRewardChapter({
      parts: PARTS, readIds: new Set(['c2', 'c3', 'c4']), unlockIds: new Set(['c5']),
    })
    expect(next).toBeNull()
  })
  it('skips read chapters even when never explicitly unlocked (pre-launch reads)', () => {
    const next = nextRewardChapter({ parts: PARTS, readIds: new Set(['c1', 'c2', 'c3']), unlockIds: new Set() })
    expect(next.id).toBe('c4')
  })
})

describe('nextChapterInfo', () => {
  it('points at the following chapter with its lock state', () => {
    const locked = nextChapterInfo({ parts: PARTS, storyId: 'c1', readIds: new Set(['c1']), unlockIds: new Set() })
    expect(locked).toMatchObject({ kind: 'locked', number: 2, title: '一封信' })
    const open = nextChapterInfo({ parts: PARTS, storyId: 'c1', readIds: new Set(['c1']), unlockIds: new Set(['c2']) })
    expect(open).toMatchObject({ kind: 'unlocked', number: 2 })
  })
  it('series-complete only when every chapter is read', () => {
    const all = new Set(PARTS.map(p => p.id))
    expect(nextChapterInfo({ parts: PARTS, storyId: 'c5', readIds: all, unlockIds: new Set() }))
      .toEqual({ kind: 'series-complete', total: 5 })
  })
  it('the last chapter with earlier gaps points back at the first unread one', () => {
    const reads = new Set(['c1', 'c3', 'c4', 'c5'])
    expect(nextChapterInfo({ parts: PARTS, storyId: 'c5', readIds: reads, unlockIds: new Set(['c2']) }))
      .toMatchObject({ kind: 'unlocked', number: 2 })
  })
  it('a re-read skips the just-read next chapter to the first unread one', () => {
    const reads = new Set(['c1', 'c2'])
    expect(nextChapterInfo({ parts: PARTS, storyId: 'c1', readIds: reads, unlockIds: new Set() }))
      .toMatchObject({ kind: 'locked', number: 3 })
  })
  it('null for single-chapter units and unknown stories', () => {
    expect(nextChapterInfo({ parts: [PARTS[0]], storyId: 'c1', readIds: new Set(), unlockIds: new Set() })).toBeNull()
    expect(nextChapterInfo({ parts: PARTS, storyId: 'zz', readIds: new Set(), unlockIds: new Set() })).toBeNull()
  })
})

describe('seedUnlockIds', () => {
  const unit = (key, parts) => ({ kind: 'series', key, title: key, parts })
  it('keeps a started series reachable up to one past the furthest read', () => {
    const ids = seedUnlockIds([unit('a', PARTS)], new Set(['c1', 'c2']))
    expect(ids.sort()).toEqual(['c3'])
  })
  it('covers skipped-over chapters below the furthest read', () => {
    const ids = seedUnlockIds([unit('a', PARTS)], new Set(['c3']))
    expect(ids.sort()).toEqual(['c2', 'c4'])
  })
  it('never seeds an untouched series and never seeds past the end', () => {
    const all = new Set(PARTS.map(p => p.id))
    expect(seedUnlockIds([unit('a', PARTS)], new Set())).toEqual([])
    expect(seedUnlockIds([unit('a', PARTS)], all)).toEqual([])
  })
  it('ignores single-chapter units', () => {
    expect(seedUnlockIds([unit('a', [PARTS[0]])], new Set(['c1']))).toEqual([])
  })
})
