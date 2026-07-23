import { describe, it, expect } from 'vitest'
import { buildBlankParts, pickDrillItem, gradeFor, drillItemProblems } from './grammarDrill'
import { GRAMMAR_DRILLS, drillsFor, hasDrills } from './grammarDrills'

describe('buildBlankParts', () => {
  it('splits around the blank marker', () => {
    expect(buildBlankParts('她__高。')).toEqual({ before: '她', after: '高。' })
  })
  it('handles a marker at the start', () => {
    expect(buildBlankParts('__高。')).toEqual({ before: '', after: '高。' })
  })
  it('puts everything in before when there is no marker', () => {
    expect(buildBlankParts('她很高。')).toEqual({ before: '她很高。', after: '' })
  })
})

describe('pickDrillItem', () => {
  const items = [{ sentence: 'a__' }, { sentence: 'b__' }, { sentence: 'c__' }]
  it('is deterministic for a given seed', () => {
    expect(pickDrillItem(items, 0)).toBe(items[0])
    expect(pickDrillItem(items, 1)).toBe(items[1])
  })
  it('rotates through items as the seed grows', () => {
    expect(pickDrillItem(items, 3)).toBe(items[0])
    expect(pickDrillItem(items, 4)).toBe(items[1])
  })
  it('handles a negative seed without crashing', () => {
    expect(pickDrillItem(items, -1)).toBe(items[2])
  })
  it('returns null for an empty or missing list', () => {
    expect(pickDrillItem([], 0)).toBeNull()
    expect(pickDrillItem(undefined, 0)).toBeNull()
  })
})

describe('gradeFor', () => {
  it('maps correct → Good (2), wrong → Again (0)', () => {
    expect(gradeFor(true)).toBe(2)
    expect(gradeFor(false)).toBe(0)
  })
})

describe('drillItemProblems', () => {
  it('accepts a well-formed item', () => {
    expect(drillItemProblems({ sentence: '她__高。', blank: '很', options: ['是', '很', '的'] })).toEqual([])
  })
  it('flags a missing blank marker', () => {
    expect(drillItemProblems({ sentence: '她很高。', blank: '很', options: ['很', '是'] }))
      .toContain('sentence must contain the "__" blank marker')
  })
  it('flags a blank not in options', () => {
    expect(drillItemProblems({ sentence: '她__高。', blank: '很', options: ['是', '的'] }))
      .toContain('blank must be one of options')
  })
  it('flags duplicate options', () => {
    expect(drillItemProblems({ sentence: '她__高。', blank: '很', options: ['很', '很'] }))
      .toContain('options must be unique')
  })
})

describe('drillsFor / hasDrills', () => {
  it('returns items for an authored topic', () => {
    expect(drillsFor('chinese', 'shi-vs-adjectives').length).toBeGreaterThan(0)
    expect(hasDrills('chinese', 'shi-vs-adjectives')).toBe(true)
  })
  it('returns empty for an unknown language or topic', () => {
    expect(drillsFor('klingon', 'x')).toEqual([])
    expect(hasDrills('chinese', 'no-such-topic')).toBe(false)
  })
})

// Every authored drill across all languages must satisfy the invariants — a bad
// item would render an unanswerable or trivially-guessable question.
describe('authored grammar drills are all valid', () => {
  const langs = Object.keys(GRAMMAR_DRILLS)
  for (const lang of langs) {
    const byTopic = GRAMMAR_DRILLS[lang]
    for (const topicId of Object.keys(byTopic)) {
      byTopic[topicId].forEach((item, i) => {
        it(`${lang}/${topicId} drill[${i}] is valid`, () => {
          expect(drillItemProblems(item)).toEqual([])
        })
      })
    }
  }

  it('has at least one enrollable topic per language', () => {
    for (const lang of langs) {
      expect(Object.keys(GRAMMAR_DRILLS[lang]).length, `${lang} should have ≥1 topic`).toBeGreaterThan(0)
    }
  })
})
