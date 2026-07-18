import { describe, it, expect } from 'vitest'
import { scoreComprehension } from './comprehension'

const questions = [
  { id: 'q1', question: 'A?', options: ['a', 'b'], correct_index: 0 },
  { id: 'q2', question: 'B?', options: ['a', 'b'], correct_index: 1 },
  { id: 'q3', question: 'C?', options: ['a', 'b'], correct_index: 0 },
]

describe('scoreComprehension', () => {
  it('counts answered and correct against the total', () => {
    const r = scoreComprehension(questions, { q1: 0, q2: 0 }) // q1 right, q2 wrong
    expect(r).toEqual({ answered: 2, correct: 1, total: 3 })
  })

  it('is all-zero (answered) with no answers', () => {
    expect(scoreComprehension(questions, {})).toEqual({ answered: 0, correct: 0, total: 3 })
  })

  it('handles a perfect score', () => {
    expect(scoreComprehension(questions, { q1: 0, q2: 1, q3: 0 })).toEqual({ answered: 3, correct: 3, total: 3 })
  })

  it('tolerates null/empty inputs', () => {
    expect(scoreComprehension(null, null)).toEqual({ answered: 0, correct: 0, total: 0 })
    expect(scoreComprehension([], {})).toEqual({ answered: 0, correct: 0, total: 0 })
  })
})
