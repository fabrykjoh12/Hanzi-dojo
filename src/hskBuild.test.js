import { describe, it, expect } from 'vitest'
import { cleanHskMeaning, hskEntryToRow, buildLevelRows, isDegenerateMeaning, TAG_SETS } from './hskBuild'

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

describe('isDegenerateMeaning', () => {
  it('flags cross-references, surnames, and pure sounds', () => {
    expect(isDegenerateMeaning('variant of 欤')).toBe(true)
    expect(isDegenerateMeaning('old variant of 因')).toBe(true)
    expect(isDegenerateMeaning('surname Yu')).toBe(true)
    expect(isDegenerateMeaning('(onom.) sound of singing')).toBe(true)
    expect(isDegenerateMeaning('')).toBe(true)
  })
  it('keeps real meanings', () => {
    expect(isDegenerateMeaning('to organize; organization')).toBe(false)
    expect(isDegenerateMeaning('to see')).toBe(false) // not a "see 某" cross-ref
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
  it('returns null for a degenerate-only meaning', () => {
    expect(hskEntryToRow(entry('与', ['new-6'], 100, 'yú', ['variant of 欤']))).toBeNull()
  })
})

describe('buildLevelRows', () => {
  // Entries carry every band assignment the real dataset does. 中文 is level 4
  // under the 2021 draft but level 3 under the 2025 syllabus — exactly the kind
  // of word that moves between frameworks, and the reason the tag set has to be
  // chosen deliberately rather than defaulted into.
  const dataset = [
    entry('丁', ['newest-4', 'new-4'], 9000, 'dīng', ['rare word']),
    entry('阿姨', ['newest-4', 'new-4'], 4355, 'ā yí', ['maternal aunt', 'nursemaid']),
    entry('中文', ['newest-3', 'new-4'], 200, 'zhōng wén', ['Chinese language']),
    entry('医生', ['newest-4', 'new-4'], 800, 'yī shēng', ['doctor']),
  ]

  it('selects only the target level, ordered by frequency (most common first)', () => {
    const rows = buildLevelRows(dataset, 4)
    expect(rows.map(r => r.word)).toEqual(['医生', '阿姨', '丁']) // 800 < 4355 < 9000; 中文 is newest-3, so excluded
  })
  it('caps the count', () => {
    expect(buildLevelRows(dataset, 4, { cap: 2 }).map(r => r.word)).toEqual(['医生', '阿姨'])
  })
  it('excludes words already in the deck (no cross-level duplicates)', () => {
    const rows = buildLevelRows(dataset, 4, { exclude: new Set(['医生']) })
    expect(rows.map(r => r.word)).toEqual(['阿姨', '丁'])
  })
  it('defaults to the 2025 official syllabus, not the 2021 draft', () => {
    // Building against the draft pulls 中文 into level 4; the syllabus does not.
    expect(buildLevelRows(dataset, 4).map(r => r.word)).not.toContain('中文')
    const draft = buildLevelRows(dataset, 4, { tagPrefix: TAG_SETS.draft2021 })
    expect(draft.map(r => r.word)).toContain('中文')
  })
  it('can still build an earlier framework on request', () => {
    expect(buildLevelRows(dataset, 3, { tagPrefix: TAG_SETS.draft2021 })).toEqual([])
    expect(buildLevelRows(dataset, 3).map(r => r.word)).toEqual(['中文'])
  })
})
