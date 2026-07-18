import { describe, it, expect } from 'vitest'
import { buildFillBlankQuestions } from './fillBlank'

const pool = [
  { id: 'v1', word: '今天', example_sentence: '今天天气很好。' },
  { id: 'v2', word: '天气', example_sentence: '天气很好。' },
  { id: 'v3', word: '朋友', example_sentence: '他是我的朋友。' },
  { id: 'v4', word: '公园', example_sentence: '我们去公园。' },
  { id: 'v5', word: '喜欢', example_sentence: '我喜欢喝茶，喜欢看书。' }, // two occurrences
  { id: 'v6', word: '学校', example_sentence: '我去学校。' },
]

describe('buildFillBlankQuestions', () => {
  it('builds up to `count` questions, each with 4 options incl. the answer', () => {
    const qs = buildFillBlankQuestions(pool, 4)
    expect(qs.length).toBe(4)
    for (const q of qs) {
      expect(q.options.length).toBe(4)
      expect(q.options.some(o => o.id === q.vocab.id)).toBe(true)
    }
  })

  it('blanks every occurrence of the target word', () => {
    const qs = buildFillBlankQuestions([pool[4], pool[0], pool[1], pool[2]], 12)
    const twoBlank = qs.find(q => q.vocab.id === 'v5')
    expect(twoBlank).toBeTruthy()
    // "我喜欢喝茶，喜欢看书。" split on 喜欢 → 3 parts (2 blanks), and no part
    // still contains the answer.
    expect(twoBlank.parts.length).toBe(3)
    expect(twoBlank.parts.every(p => !p.includes('喜欢'))).toBe(true)
  })

  it('returns [] when fewer than 4 words have a usable example', () => {
    expect(buildFillBlankQuestions(pool.slice(0, 3))).toEqual([])
    expect(buildFillBlankQuestions([{ id: 'x', word: '猫', example_sentence: 'no target here' }])).toEqual([])
  })
})
