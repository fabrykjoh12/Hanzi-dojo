import { describe, it, expect } from 'vitest'
import {
  AUTO_EXPAND_LIMIT,
  buildReviewGroups,
  selectAll,
  toggleSelection,
  setSelected,
  groupState,
  idsOf,
  claimIdsFor,
  initialOpenLevels,
  toggleLevelOpen,
} from './knownWordsReview'

// Curriculum order: level, then frequency (sort_order) — the order the screen
// loads vocabulary in.
const VOCAB = [
  { id: 'a1', word: '你好', reading: 'nǐ hǎo', meaning: 'hello', level: 1 },
  { id: 'a2', word: '谢谢', reading: 'xièxie', meaning: 'thanks', level: 1 },
  { id: 'a3', word: '再见', reading: 'zàijiàn', meaning: 'goodbye', level: 1 },
  { id: 'b1', word: '中国', reading: 'Zhōngguó', meaning: 'China', level: 2 },
  { id: 'b2', word: '朋友', reading: 'péngyou', meaning: 'friend', level: 2 },
  { id: 'c1', word: '经济', reading: 'jīngjì', meaning: 'economy', level: 3 },
]

describe('buildReviewGroups', () => {
  it('groups matched words by level, in curriculum order', () => {
    const review = buildReviewGroups(VOCAB, ['b2', 'a3', 'a1', 'c1'], [])
    expect(review.groups.map(g => g.level)).toEqual([1, 2, 3])
    expect(review.groups[0].words.map(w => w.id)).toEqual(['a1', 'a3'])
    expect(review.groups[1].words.map(w => w.id)).toEqual(['b2'])
    expect(review.orderedIds).toEqual(['a1', 'a3', 'b2', 'c1'])
    expect(review.total).toBe(4)
  })

  it('carries the word, reading, meaning and level through for display', () => {
    const review = buildReviewGroups(VOCAB, ['b1'], [])
    expect(review.groups[0].words[0]).toMatchObject({
      word: '中国', reading: 'Zhōngguó', meaning: 'China', level: 2,
    })
  })

  it('never offers a word that already has a card, and counts it separately', () => {
    const review = buildReviewGroups(VOCAB, ['a1', 'a2', 'b1'], ['a2'])
    expect(review.orderedIds).toEqual(['a1', 'b1'])
    expect(review.groups[0].words.map(w => w.id)).toEqual(['a1'])
    expect(review.alreadyKnown).toBe(1)
    expect(review.matched).toBe(3)
    expect(review.total).toBe(2)
  })

  it('drops a level group entirely when all of it is already carded', () => {
    const review = buildReviewGroups(VOCAB, ['a1', 'a2', 'a3', 'b1'], ['a1', 'a2', 'a3'])
    expect(review.groups.map(g => g.level)).toEqual([2])
    expect(review.alreadyKnown).toBe(3)
  })

  it('ignores matched ids that are not in the curriculum', () => {
    const review = buildReviewGroups(VOCAB, ['a1', 'ghost'], [])
    expect(review.orderedIds).toEqual(['a1'])
  })

  it('accepts Sets as well as arrays', () => {
    const review = buildReviewGroups(VOCAB, new Set(['a1', 'b1']), new Set(['b1']))
    expect(review.orderedIds).toEqual(['a1'])
    expect(review.alreadyKnown).toBe(1)
  })

  it('is empty for an empty match', () => {
    const review = buildReviewGroups(VOCAB, [], [])
    expect(review).toEqual({ groups: [], orderedIds: [], matched: 0, alreadyKnown: 0, total: 0 })
  })

  it('survives missing input', () => {
    expect(buildReviewGroups(null, null, null).total).toBe(0)
    expect(buildReviewGroups([null], ['a1'], []).total).toBe(0)
  })
})

describe('selection', () => {
  it('starts with everything ticked', () => {
    const review = buildReviewGroups(VOCAB, ['a1', 'b1'], [])
    const sel = selectAll(review.orderedIds)
    expect([...sel].sort()).toEqual(['a1', 'b1'])
  })

  it('toggles one word without mutating the previous set', () => {
    const before = selectAll(['a1', 'a2'])
    const after = toggleSelection(before, 'a1')
    expect(after.has('a1')).toBe(false)
    expect(before.has('a1')).toBe(true)
    expect(toggleSelection(after, 'a1').has('a1')).toBe(true)
  })

  it('ticks and unticks a batch', () => {
    let sel = selectAll(['a1', 'a2', 'b1'])
    sel = setSelected(sel, ['a1', 'a2'], false)
    expect([...sel]).toEqual(['b1'])
    sel = setSelected(sel, ['a1'], true)
    expect([...sel].sort()).toEqual(['a1', 'b1'])
  })

  it('reports a group as all, none or partial', () => {
    const words = VOCAB.slice(0, 3)
    expect(groupState(words, selectAll(idsOf(words)))).toEqual({
      total: 3, selected: 3, all: true, none: false,
    })
    expect(groupState(words, new Set())).toEqual({
      total: 3, selected: 0, all: false, none: true,
    })
    const partial = groupState(words, new Set(['a1']))
    expect(partial).toMatchObject({ selected: 1, all: false, none: false })
  })

  it('idsOf pulls the ids for the batch helpers', () => {
    expect(idsOf(VOCAB.slice(0, 2))).toEqual(['a1', 'a2'])
    expect(idsOf(null)).toEqual([])
  })
})

describe('claimIdsFor — what actually gets seeded', () => {
  it('returns the ticked words in curriculum order', () => {
    const review = buildReviewGroups(VOCAB, ['a1', 'a2', 'b1', 'c1'], [])
    const sel = setSelected(selectAll(review.orderedIds), ['a2'], false)
    expect(claimIdsFor(review, sel)).toEqual(['a1', 'b1', 'c1'])
  })

  // The bug this whole screen exists to prevent: a matched word the learner
  // unticked must never be seeded as a card they already know.
  it('an unticked matched word never reaches the claim', () => {
    const review = buildReviewGroups(VOCAB, VOCAB.map(v => v.id), [])
    let sel = selectAll(review.orderedIds)
    sel = toggleSelection(sel, 'b2')
    sel = setSelected(sel, idsOf(review.groups[0].words), false)   // untick all of level 1

    const claim = claimIdsFor(review, sel)
    expect(claim).toEqual(['b1', 'c1'])
    expect(claim).not.toContain('b2')
    expect(claim.some(id => ['a1', 'a2', 'a3'].includes(id))).toBe(false)
  })

  it('a carded word cannot be smuggled in through a stale selection', () => {
    const review = buildReviewGroups(VOCAB, ['a1', 'a2'], ['a2'])
    const sel = new Set(['a1', 'a2', 'ghost'])
    expect(claimIdsFor(review, sel)).toEqual(['a1'])
  })

  it('is empty when nothing is ticked', () => {
    const review = buildReviewGroups(VOCAB, ['a1', 'b1'], [])
    expect(claimIdsFor(review, new Set())).toEqual([])
    expect(claimIdsFor(null, selectAll(['a1']))).toEqual([])
  })
})

describe('initialOpenLevels', () => {
  it('opens every level when the review is small', () => {
    const review = buildReviewGroups(VOCAB, VOCAB.map(v => v.id), [])
    expect([...initialOpenLevels(review.groups)].sort()).toEqual([1, 2, 3])
  })

  it('opens only the first level when the review is large', () => {
    const many = []
    for (let i = 0; i < 200; i += 1) {
      many.push({ id: 'x' + i, word: 'w' + i, reading: 'r', meaning: 'm', level: (i % 4) + 1 })
    }
    const review = buildReviewGroups(many, many.map(v => v.id), [])
    expect(review.total).toBeGreaterThan(AUTO_EXPAND_LIMIT)
    expect([...initialOpenLevels(review.groups)]).toEqual([1])
  })

  it('is empty with no groups', () => {
    expect(initialOpenLevels([]).size).toBe(0)
    expect(initialOpenLevels(null).size).toBe(0)
  })

  it('toggles a level open and shut without mutating', () => {
    const open = new Set([1])
    const shut = toggleLevelOpen(open, 1)
    expect(shut.has(1)).toBe(false)
    expect(open.has(1)).toBe(true)
    expect(toggleLevelOpen(shut, 2).has(2)).toBe(true)
  })
})
