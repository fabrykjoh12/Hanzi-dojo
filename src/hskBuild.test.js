import { describe, it, expect } from 'vitest'
import { cleanHskMeaning, hskEntryToRow, buildLevelRows } from './hskBuild'

const entry = (simplified, level, frequency, pinyin, meanings) => ({
  simplified, level, frequency, forms: [{ transcriptions: { pinyin }, meanings }],
})

describe('cleanHskMeaning', () => {
  it('keeps the first two senses, trimmed', () => {
    expect(cleanHskMeaning([' to eat ', 'to have a meal', 'to live off'])).toBe('to eat; to have a meal')
    expect(cleanHskMeaning([])).toBe('')
    expect(cleanHskMeaning(undefined)).toBe('')
  })
})

describe('hskEntryToRow', () => {
  it('maps a usable entry', () => {
    expect(hskEntryToRow(entry('吃', ['new-1'], 500, 'chī', ['to eat', 'to consume']))).toEqual({
      word: '吃', reading: 'chī', meaning: 'to eat; to consume',
    })
  })
  it('returns null when word / reading / meaning is missing', () => {
    expect(hskEntryToRow(entry('', ['new-1'], 1, 'x', ['y']))).toBeNull()
    expect(hskEntryToRow(entry('好', ['new-1'], 1, '', ['y']))).toBeNull()
    expect(hskEntryToRow(entry('好', ['new-1'], 1, 'hǎo', []))).toBeNull()
  })
})

describe('buildLevelRows', () => {
  const dataset = [
    entry('丁', ['new-4'], 9000, 'dīng', ['rare word']),
    entry('阿姨', ['new-4'], 4355, 'ā yí', ['maternal aunt', 'nursemaid']),
    entry('中文', ['new-3'], 200, 'zhōng wén', ['Chinese language']),   // wrong level → excluded
    entry('医生', ['new-4'], 800, 'yī shēng', ['doctor']),
  ]

  it('selects only the target level, ordered by frequency (most common first)', () => {
    const rows = buildLevelRows(dataset, 4)
    expect(rows.map(r => r.word)).toEqual(['医生', '阿姨', '丁']) // 800 < 4355 < 9000; 中文 (new-3) excluded
  })
  it('caps the count', () => {
    expect(buildLevelRows(dataset, 4, { cap: 2 }).map(r => r.word)).toEqual(['医生', '阿姨'])
  })
  it('excludes words already in the deck (no cross-level duplicates)', () => {
    const rows = buildLevelRows(dataset, 4, { exclude: new Set(['医生']) })
    expect(rows.map(r => r.word)).toEqual(['阿姨', '丁'])
  })
})
