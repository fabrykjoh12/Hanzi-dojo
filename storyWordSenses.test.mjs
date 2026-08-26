import { describe, it, expect } from 'vitest'
import { wordSenses, roleFromUsage, renderSenses, SENSES_VERSION } from './storyWordSenses.mjs'

// Rows verbatim from the vocabulary table, including the gaps: part_of_speech
// is null for most of these, and 被 is glossed only as a quilt.
const vocabMap = {
  被: { word: '被', level: 3, meaning: 'quilt; to cover (with)', part_of_speech: null, example_sentence: '折被子。', example_translation: 'Fold the quilt.' },
  叫: { word: '叫', level: 1, meaning: 'to call; to be called' },
  拿: { word: '拿', level: 2, meaning: 'to take, to hold' },
  老师: { word: '老师', level: 1, meaning: 'teacher' },
  箱子: { word: '箱子', level: 3, meaning: 'suitcase; chest', part_of_speech: 'noun', example_sentence: '这是箱子。', example_translation: 'This is a suitcase.' },
  女人: { word: '女人', level: 3, meaning: 'woman', example_sentence: '那个女人。', example_translation: 'That woman.' },
  生活: { word: '生活', level: 3, meaning: 'to live; life' },
}
const corpusLines = [
  '他被老师叫到办公室。',
  '书被拿走了。',
  '小红拿着箱子。',
  '那个女人很累。',
]

describe('a word is more than its first gloss', () => {
  it('被: keeps both senses AND reports the role the corpus shows', () => {
    const e = wordSenses('被', { vocabMap, corpusLines })
    // the dataset's own senses survive, in order, neither collapsed nor dropped
    expect(e.senses.map(s => s.text)).toEqual(['quilt', 'cover'])
    expect(e.senses[1].verb).toBe(true)
    // and the passive role is recovered from usage, not from a special case
    expect(e.role).toMatchObject({ role: 'grammatical' })
    expect(e.role.detail).toContain('between a noun and a verb')
    expect(e.corpusExamples[0]).toContain('被')
    expect(renderSenses(e)).toContain('OBSERVED ROLE')
  })

  it('the same rule finds no grammatical role for an ordinary noun', () => {
    const e = wordSenses('箱子', { vocabMap, corpusLines })
    expect(e.role).toBeNull()
    expect(e.pos).toBe('noun')          // used where the dataset has it
    expect(e.senses.map(s => s.text)).toEqual(['suitcase', 'chest'])
  })

  it('a true noun sense is preserved alongside a verbal one', () => {
    const e = wordSenses('生活', { vocabMap, corpusLines })
    expect(e.senses).toEqual([
      { text: 'live', verb: true, tokens: expect.any(Array) },
      { text: 'life', verb: false, tokens: expect.any(Array) },
    ])
  })

  it('an ordinary single-sense word is unchanged', () => {
    const e = wordSenses('女人', { vocabMap, corpusLines })
    expect(e.senses.map(s => s.text)).toEqual(['woman'])
    expect(e.role).toBeNull()
    expect(e.senseCount).toBe(1)
    expect(renderSenses(e)).toContain('woman')
    expect(renderSenses(e)).not.toContain('OBSERVED ROLE')
  })

  it('one sighting is not a role', () => {
    expect(roleFromUsage('被', ['他被老师叫到办公室。'], vocabMap)).toBeNull()
    expect(roleFromUsage('被', ['他被老师叫到办公室。', '书被拿走了。'], vocabMap)).not.toBeNull()
    expect(SENSES_VERSION).toBe('fab9-senses@1')
  })

  it('a word absent from the corpus simply has no observed role', () => {
    const e = wordSenses('老师', { vocabMap, corpusLines: [] })
    expect(e.corpusExamples).toEqual([])
    expect(e.role).toBeNull()
  })
})
