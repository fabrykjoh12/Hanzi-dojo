import { describe, it, expect } from 'vitest'
import { buildMcqQuestions } from './mcq'

const vocab = Array.from({ length: 12 }, (_, i) => ({
  id: `v${i}`, word: `词${i}`, reading: `r${i}`, meaning: `meaning ${i}`,
  level: 1, sort_order: i,
}))

describe('buildMcqQuestions', () => {
  it('returns `count` questions, each with 4 options including the correct one', () => {
    const qs = buildMcqQuestions(vocab, 'chinese', 6)
    expect(qs.length).toBe(6)
    for (const q of qs) {
      expect(q.options.length).toBe(4)
      expect(q.options).toContain(q.correct)
    }
  })

  it('returns [] when there are fewer than 4 usable words', () => {
    expect(buildMcqQuestions(vocab.slice(0, 3), 'chinese', 6)).toEqual([])
  })
})
