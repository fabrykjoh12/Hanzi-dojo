import { describe, it, expect } from 'vitest'
import { computeStudyTally } from './studyTally'

const V = { word: '水', id: 'v1' }
const run = (grade, previousState, nextState, vocab = V) =>
  computeStudyTally({ grade, previousState, nextState, vocab })

// Grades: 0 Again, 1 Hard, 2 Good, 3 Easy.

describe('computeStudyTally — new cards', () => {
  it('new + Again → learning: counts new, counts again, marks weak', () => {
    const { tally, sessionWord } = run(0, 'new', 'learning')
    expect(tally).toEqual({ graded: 1, newLearned: 1, again: 1, graduated: 0, reviewedTotal: 0, reviewedRight: 0 })
    expect(sessionWord).toEqual({ word: '水', weak: true, review: false })
  })
  it('new + Hard → learning: counts new, not again, not weak', () => {
    const { tally, sessionWord } = run(1, 'new', 'learning')
    expect(tally).toEqual({ graded: 1, newLearned: 1, again: 0, graduated: 0, reviewedTotal: 0, reviewedRight: 0 })
    expect(sessionWord).toEqual({ word: '水', weak: false, review: false })
  })
  it('new + Good → learning: counts new only', () => {
    const { tally } = run(2, 'new', 'learning')
    expect(tally).toEqual({ graded: 1, newLearned: 1, again: 0, graduated: 0, reviewedTotal: 0, reviewedRight: 0 })
  })
  it('new + Easy → review: counts new AND graduated', () => {
    const { tally } = run(3, 'new', 'review')
    expect(tally).toEqual({ graded: 1, newLearned: 1, again: 0, graduated: 1, reviewedTotal: 0, reviewedRight: 0 })
  })
})

describe('computeStudyTally — review cards', () => {
  it('review + Again → relearning: reviewedTotal but not right, weak, not graduated', () => {
    const { tally, sessionWord } = run(0, 'review', 'relearning')
    expect(tally).toEqual({ graded: 1, newLearned: 0, again: 1, graduated: 0, reviewedTotal: 1, reviewedRight: 0 })
    expect(sessionWord).toEqual({ word: '水', weak: true, review: true })
  })
  it('review + Hard → review: reviewed correctly', () => {
    const { tally } = run(1, 'review', 'review')
    expect(tally).toEqual({ graded: 1, newLearned: 0, again: 0, graduated: 0, reviewedTotal: 1, reviewedRight: 1 })
  })
  it('review + Good → review: reviewed correctly', () => {
    const { tally, sessionWord } = run(2, 'review', 'review')
    expect(tally.reviewedRight).toBe(1)
    expect(tally.graduated).toBe(0)   // already a review card — not a fresh graduation
    expect(sessionWord.review).toBe(true)
  })
  it('review + Easy → review: reviewed correctly', () => {
    const { tally } = run(3, 'review', 'review')
    expect(tally.reviewedTotal).toBe(1)
    expect(tally.reviewedRight).toBe(1)
  })
})

describe('computeStudyTally — graduation transition', () => {
  it('learning + Good → review: graduated, but not newLearned or reviewed', () => {
    const { tally, sessionWord } = run(2, 'learning', 'review')
    expect(tally).toEqual({ graded: 1, newLearned: 0, again: 0, graduated: 1, reviewedTotal: 0, reviewedRight: 0 })
    expect(sessionWord.review).toBe(false)   // wasn't a review card yet
  })
  it('relearning + Good → review: graduated, not counted as review recall', () => {
    const { tally } = run(2, 'relearning', 'review')
    expect(tally.graduated).toBe(1)
    expect(tally.reviewedTotal).toBe(0)
  })
  it('learning + Again → learning: no graduation', () => {
    const { tally } = run(0, 'learning', 'learning')
    expect(tally.graduated).toBe(0)
    expect(tally.again).toBe(1)
  })
})

describe('computeStudyTally — sessionWord / missing data', () => {
  it('returns null sessionWord when vocab is missing or has no word', () => {
    // Call directly so an explicit `undefined` isn't swallowed by run()'s default.
    expect(computeStudyTally({ grade: 2, previousState: 'new', nextState: 'learning' }).sessionWord).toBeNull()
    expect(run(2, 'new', 'learning', {}).sessionWord).toBeNull()
    expect(run(2, 'new', 'learning', { id: 'x' }).sessionWord).toBeNull()
  })
  it('still returns a full tally even when vocab is missing (no crash)', () => {
    const { tally } = computeStudyTally({ grade: 0, previousState: 'review', nextState: 'relearning' })
    expect(tally).toEqual({ graded: 1, newLearned: 0, again: 1, graduated: 0, reviewedTotal: 1, reviewedRight: 0 })
  })
  it('output shape is stable (always tally + sessionWord keys)', () => {
    const out = run(2, 'new', 'learning')
    expect(Object.keys(out).sort()).toEqual(['sessionWord', 'tally'])
    expect(Object.keys(out.tally).sort()).toEqual(
      ['again', 'graded', 'graduated', 'newLearned', 'reviewedRight', 'reviewedTotal']
    )
  })
})
