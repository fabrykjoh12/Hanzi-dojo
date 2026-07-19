import { describe, it, expect } from 'vitest'
import { studyFloorLevel, inCumulativeScope } from './levelScope'

describe('studyFloorLevel', () => {
  it('is the current level when the user has no cards yet', () => {
    expect(studyFloorLevel([], 3)).toBe(3)
    expect(studyFloorLevel(null, 1)).toBe(1)
  })

  it('is 1 for a natural learner who started at level 1', () => {
    const cards = [
      { vocabulary: { level: 1 } },
      { vocabulary: { level: 2 } },
      { vocabulary: { level: 3 } },
    ]
    expect(studyFloorLevel(cards, 3)).toBe(1)
  })

  it('stays at the start level for a learner who placed higher', () => {
    // Placed at level 4, studied only levels 4 and 5 — levels 1..3 were assumed
    // known and never introduced, so they must never resurface as new cards.
    const cards = [
      { vocabulary: { level: 4 } },
      { vocabulary: { level: 5 } },
    ]
    expect(studyFloorLevel(cards, 5)).toBe(4)
  })

  it('reads the level off a resolved vocab object too', () => {
    const cards = [{ vocab: { level: 2 } }, { vocab: { level: 4 } }]
    expect(studyFloorLevel(cards, 4)).toBe(2)
  })

  it('never exceeds the current level even if a stray higher card exists', () => {
    const cards = [{ vocabulary: { level: 5 } }]
    expect(studyFloorLevel(cards, 3)).toBe(3)
  })

  it('ignores cards with no resolvable level', () => {
    const cards = [{ foo: 1 }, { vocabulary: { level: 2 } }]
    expect(studyFloorLevel(cards, 4)).toBe(2)
  })
})

describe('inCumulativeScope', () => {
  it('includes levels from floor to current inclusive', () => {
    expect(inCumulativeScope(1, 1, 3)).toBe(true)
    expect(inCumulativeScope(3, 1, 3)).toBe(true)
    expect(inCumulativeScope(4, 1, 3)).toBe(false)
    expect(inCumulativeScope(2, 3, 5)).toBe(false)
  })
})

// Regression lock: dictionary-sourced words (vocabulary.level = NULL, added via
// the reference-dictionary "add to deck" flow) belong ONLY in the review deck
// (getTrackCards({ includeUnleveled: true }), covered elsewhere) and must never
// leak into a level-scoped surface — the study floor, the cumulative range
// check, level tests, or mastery %. These two guards are what make that true.
describe('levelScope excludes NULL-level (dictionary-sourced) cards', () => {
  it('studyFloorLevel ignores cards whose vocabulary.level is null', () => {
    const cards = [
      { vocabulary: { level: 3 } },
      { vocabulary: { level: null } }, // dictionary-sourced
    ]
    expect(studyFloorLevel(cards, 5)).toBe(3) // null card does not drag the floor
  })
  it('inCumulativeScope is false for a null level', () => {
    expect(inCumulativeScope(null, 1, 9)).toBe(false)
  })
})
