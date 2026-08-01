import { describe, it, expect } from 'vitest'
import { buildFlatShelf, buildNextLevelSection } from './storyShelfFlat'

// Minimal story rows. Tier 1 unlocks at 0 words, tier 2 at 100 (like the real
// tables); learnedFor is stubbed per test.
const TIERS = [
  { tier: 1, minWords: 0, label: 'First Steps' },
  { tier: 2, minWords: 100, label: 'Growing' },
]

const story = (id, { title, level = 1, tier = 1, number = 1, presentation = null } = {}) => ({
  id, title: title || id, level, tier, story_number: number, presentation, panels: null, content: '',
})

const shelf = (overrides = {}) => buildFlatShelf({
  stories: [],
  currentLevel: 2,
  tiersFor: () => TIERS,
  learnedFor: () => 500,
  readIds: new Set(),
  knownPctFor: () => 90,
  ...overrides,
})

describe('buildFlatShelf sections', () => {
  it('orders sections current level first, then lower levels descending', () => {
    const stories = [
      story('a', { level: 1, title: 'A' }),
      story('b', { level: 2, title: 'B' }),
      story('c', { level: 3, title: 'C' }),
    ]
    const sections = shelf({ stories, currentLevel: 3 })
    expect(sections.map(s => s.level)).toEqual([3, 2, 1])
    expect(sections[0].isCurrent).toBe(true)
  })

  it('reports unfiltered read counts per level, stable across filters', () => {
    const stories = [story('a', { title: 'A' }), story('b', { title: 'B' })]
    const readIds = new Set(['a'])
    const all = shelf({ stories, currentLevel: 1, readIds })
    const unreadOnly = shelf({ stories, currentLevel: 1, readIds, filters: { status: 'unread' } })
    expect(all[0].readCount).toBe(1)
    expect(all[0].total).toBe(2)
    expect(unreadOnly[0].readCount).toBe(1)     // header math untouched by filters
    expect(unreadOnly[0].units.map(u => u.key)).toEqual(['b'])
  })
})

describe('units', () => {
  it('groups a numbered season into ONE series unit with chapter progress', () => {
    const stories = [
      story('c1', { title: '1. 今天唱歌', number: 7 }),
      story('c2', { title: '2. 上班和上学', number: 8 }),
      story('c3', { title: '3. 商店寻宝记', number: 9 }),
    ]
    const [section] = shelf({ stories, currentLevel: 1, readIds: new Set(['c1']) })
    expect(section.units).toHaveLength(1)
    const unit = section.units[0]
    expect(unit.kind).toBe('series')
    expect(unit.total).toBe(3)
    expect(unit.readCount).toBe(1)
    expect(unit.next.id).toBe('c2')             // resume where you are
  })

  it('computes % known from the NEXT unread chapter, not chapter one', () => {
    const stories = [
      story('c1', { title: '1. Season', number: 1 }),
      story('c2', { title: '2. Season', number: 2 }),
    ]
    const seen = []
    shelf({
      stories, currentLevel: 1, readIds: new Set(['c1']),
      knownPctFor: (s) => { seen.push(s.id); return 80 },
    })
    expect(seen).toEqual(['c2'])
  })

  it('sorts unlocked units most-readable first, locked units last by remaining', () => {
    const stories = [
      story('lo', { title: 'Low', tier: 1 }),
      story('hi', { title: 'High', tier: 1 }),
      story('locked', { title: 'Locked', tier: 2 }),
    ]
    const pct = { lo: 60, hi: 95, locked: 99 }
    const [section] = shelf({
      stories, currentLevel: 1,
      learnedFor: () => 40,                      // tier 2 (100) still locked
      knownPctFor: (s) => pct[s.id],
    })
    expect(section.units.map(u => u.key)).toEqual(['hi', 'lo', 'locked'])
    const locked = section.units[2]
    expect(locked.locked).toBe(true)
    expect(locked.remaining).toBe(60)
    expect(locked.knownPct).toBe(null)           // no % on a locked card
  })

  it('unit status filter keeps a half-read series intact under "unread"', () => {
    const stories = [
      story('c1', { title: '1. Season', number: 1 }),
      story('c2', { title: '2. Season', number: 2 }),
    ]
    const [section] = shelf({ stories, currentLevel: 1, readIds: new Set(['c1']), filters: { status: 'unread' } })
    expect(section.units).toHaveLength(1)
    expect(section.units[0].total).toBe(2)       // whole series, correct progress
    const readView = shelf({ stories, currentLevel: 1, readIds: new Set(['c1']), filters: { status: 'read' } })
    expect(readView[0].units).toHaveLength(1)    // started counts as "read"
  })
})

describe('practice + gates', () => {
  it('splits practice formats out and hides tier-locked practice', () => {
    const stories = [
      story('s', { title: 'Story', tier: 1 }),
      story('p1', { title: 'Chat', tier: 1, presentation: 'chat' }),
      story('p2', { title: 'LockedChat', tier: 2, presentation: 'chat' }),
    ]
    const [section] = shelf({ stories, currentLevel: 1, learnedFor: () => 40 })
    expect(section.units.map(u => u.key)).toEqual(['s'])
    expect(section.practice.map(s => s.id)).toEqual(['p1'])
  })

  it('drops a section with nothing visible', () => {
    const stories = [story('a', { title: 'A' })]
    const sections = shelf({ stories, currentLevel: 1, readIds: new Set(['a']), filters: { status: 'unread' } })
    expect(sections).toEqual([])
  })
})

describe('buildNextLevelSection (the road ahead)', () => {
  it('builds a fully locked section with grouped units and no % known', () => {
    const stories = [
      story('n1', { title: '1. Ahead', level: 3, number: 1 }),
      story('n2', { title: '2. Ahead', level: 3, number: 2 }),
      story('n3', { title: 'Alone', level: 3 }),
      story('np', { title: 'Chat', level: 3, presentation: 'chat' }),   // practice: excluded
    ]
    const section = buildNextLevelSection({ level: 3, stories })
    expect(section.levelLocked).toBe(true)
    expect(section.units).toHaveLength(2)
    expect(section.units.every(u => u.locked && u.knownPct === null)).toBe(true)
  })

  it('is null when empty, under the read filter, or under practice format', () => {
    expect(buildNextLevelSection({ level: 3, stories: [] })).toBe(null)
    const stories = [story('n1', { title: 'A', level: 3 })]
    expect(buildNextLevelSection({ level: 3, stories, filters: { status: 'read' } })).toBe(null)
    expect(buildNextLevelSection({ level: 3, stories, filters: { format: 'practice' } })).toBe(null)
  })
})
