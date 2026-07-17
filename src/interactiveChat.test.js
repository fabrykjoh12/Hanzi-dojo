import { describe, it, expect } from 'vitest'
import { buildReplyOptions } from './interactiveChat'

const distractors = [{ text: '我不是学生。', pinyin: 'a' }, { text: '再见。', pinyin: 'b' }]

describe('buildReplyOptions', () => {
  it('includes the correct option flagged, plus every distractor', () => {
    const { options, correctIndex } = buildReplyOptions('好，一起去吧！', 'Hǎo', distractors, 3)
    expect(options).toHaveLength(3)
    expect(options.filter(o => o.correct)).toHaveLength(1)
    expect(options[correctIndex]).toMatchObject({ text: '好，一起去吧！', correct: true })
    expect(options.map(o => o.text).sort()).toEqual(['再见。', '好，一起去吧！', '我不是学生。'].sort())
  })
  it('is a stable shuffle for a given seed and varies across seeds', () => {
    const a = buildReplyOptions('好', 'h', distractors, 3).options.map(o => o.text)
    const b = buildReplyOptions('好', 'h', distractors, 3).options.map(o => o.text)
    const c = buildReplyOptions('好', 'h', distractors, 4).options.map(o => o.text)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)   // seed 3 vs 4 orders differently for this set
  })
  it('carries pinyin through and handles no distractors', () => {
    const { options, correctIndex } = buildReplyOptions('好', 'Hǎo', [], 1)
    expect(options).toEqual([{ text: '好', pinyin: 'Hǎo', correct: true }])
    expect(correctIndex).toBe(0)
  })
})
