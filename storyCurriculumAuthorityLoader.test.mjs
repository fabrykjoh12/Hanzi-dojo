import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  validateAuthority, curriculumWords, CurriculumAuthorityError,
  AUTHORITY_SCHEMA, MIN_BAND, MAX_BAND,
} from './storyCurriculumAuthority.mjs'
import { collectDebt, compareToBaseline } from './storyContentDebt.mjs'
import { DEFECT } from './storyVocabAudit.mjs'

// Isolated fixtures, one defect each — a validator tested only against the real
// file proves nothing about what it rejects.
const good = () => ({
  schema: AUTHORITY_SCHEMA,
  purpose: 'x',
  source: { project: 'p', license: 'MIT' },
  words: 3,
  bands: { 船: 3, 纸: 3, 缸: 7 },
})

describe('the curriculum authority is loaded fail-closed', () => {
  it('accepts the real committed authority', () => {
    const doc = JSON.parse(readFileSync('data/hsk-curriculum-bands.json', 'utf8'))
    expect(() => validateAuthority(doc)).not.toThrow()
    expect(doc.words).toBe(Object.keys(doc.bands).length)
  })

  it('accepts a well-formed fixture', () => {
    expect(() => validateAuthority(good())).not.toThrow()
  })

  // Each of these degraded to an empty curriculum under `.bands || {}`.
  const rejects = [
    ['root is null', null, /root is not an object/],
    ['root is an array', [], /root is not an object/],
    ['root is a string', 'nope', /root is not an object/],
    ['no schema', { ...good(), schema: undefined }, /schema is/],
    ['wrong schema', { ...good(), schema: 'hsk-curriculum-bands@2' }, /schema is/],
    ['bands missing', { ...good(), bands: undefined }, /"bands" is not an object/],
    ['bands is an array', { ...good(), bands: [] }, /"bands" is not an object/],
    ['bands is empty', { ...good(), words: 0, bands: {} }, /"bands" is empty/],
    ['empty word key', { ...good(), bands: { '': 3, 船: 3, 纸: 3 } }, /empty word key/],
    ['band is a string', { ...good(), bands: { 船: '3', 纸: 3, 缸: 7 } }, /expected an integer/],
    ['band is fractional', { ...good(), bands: { 船: 3.5, 纸: 3, 缸: 7 } }, /expected an integer/],
    ['band is null', { ...good(), bands: { 船: null, 纸: 3, 缸: 7 } }, /expected an integer/],
    ['band below range', { ...good(), bands: { 船: 0, 纸: 3, 缸: 7 } }, /outside HSK/],
    ['band above range', { ...good(), bands: { 船: 10, 纸: 3, 缸: 7 } }, /outside HSK/],
    ['words missing', { ...good(), words: undefined }, /"words" is/],
    ['words not an integer', { ...good(), words: '3' }, /"words" is/],
    ['words disagrees with bands', { ...good(), words: 99 }, /declares 99 words but/],
  ]
  for (const [name, doc, message] of rejects) {
    it('refuses: ' + name, () => {
      expect(() => validateAuthority(doc)).toThrow(CurriculumAuthorityError)
      expect(() => validateAuthority(doc)).toThrow(message)
    })
  }

  it('names the file in the error, so the failure is actionable', () => {
    expect(() => validateAuthority(null, { source: 'data/x.json' })).toThrow(/^data\/x\.json: /)
  })
})

describe('curriculumWords narrows to the taught bands', () => {
  it('returns only words at or below maxLevel', () => {
    const words = curriculumWords(good(), { maxLevel: 6 })
    expect([...words].sort()).toEqual(['纸', '船'].sort())
    expect(words.has('缸')).toBe(false)   // band 7 is outside the course
  })

  it('validates before narrowing — a bad authority never yields a partial set', () => {
    expect(() => curriculumWords({ ...good(), bands: {} , words: 0 }, { maxLevel: 6 }))
      .toThrow(CurriculumAuthorityError)
  })

  it('refuses a maxLevel outside the band range', () => {
    for (const bad of [0, MAX_BAND + 1, 2.5, '6', null]) {
      expect(() => curriculumWords(good(), { maxLevel: bad })).toThrow(/maxLevel/)
    }
    // A valid in-range maxLevel is accepted (using a fixture that has a
    // band-1 word, since "nothing survives" is its own refusal, tested below).
    const withBand1 = { ...good(), words: 4, bands: { ...good().bands, 我: 1 } }
    expect(() => curriculumWords(withBand1, { maxLevel: MIN_BAND })).not.toThrow()
  })

  it('refuses when nothing survives the narrowing', () => {
    const allHigh = { ...good(), words: 1, bands: { 缸: 7 } }
    expect(() => curriculumWords(allHigh, { maxLevel: 6 })).toThrow(/no words at or below band 6/)
  })

  it('does not hardcode a corpus size — a deliberate change stays reviewable', () => {
    const grown = { ...good(), words: 4, bands: { ...good().bands, 新: 3 } }
    expect(() => validateAuthority(grown)).not.toThrow()
    expect(curriculumWords(grown, { maxLevel: 6 }).size).toBe(3)
  })
})

// The interlock. A broken authority reclassifies every lost row without moving
// a single occurrence count, so the count-only comparison would have gone green
// while asserting the opposite of the truth.
describe('a broken authority cannot produce a green comparison', () => {
  const vocabMap = {
    我: { word: '我', level: 1, meaning: 'I' },
    的: { word: '的', level: 1, meaning: 'of' },
    书: { word: '书', level: 1, meaning: 'book' },
    很: { word: '很', level: 1, meaning: 'very' },
    好: { word: '好', level: 1, meaning: 'good' },
  }
  // 船 is not in vocabMap. With a good authority it is a lost curriculum row;
  // with an empty one it looks like a word the course never taught.
  const stories = [{ id: 's1', title: 't', level: 3, content: '我的船很好。' }]
  const authority = new Set(['船'])

  it('classifies correctly with the authority present', () => {
    const d = collectDebt({ stories, vocabMap, curriculum: authority })
    expect(d.entries[0]).toMatchObject({ form: '船', defect: DEFECT.CURRICULUM_ROW_MISSING })
  })

  it('reclassifies to OUT_OF_CURRICULUM when the authority is empty', () => {
    const d = collectDebt({ stories, vocabMap, curriculum: new Set() })
    expect(d.entries[0]).toMatchObject({ form: '船', defect: DEFECT.OUT_OF_CURRICULUM })
    expect(d.occurrences).toBe(1)          // the count is IDENTICAL
  })

  it('and that reclassification FAILS the comparison', () => {
    const baseline = collectDebt({ stories, vocabMap, curriculum: authority })
    const degraded = collectDebt({ stories, vocabMap, curriculum: new Set() })
    expect(degraded.occurrences).toBe(baseline.occurrences)
    const cmp = compareToBaseline(degraded, baseline)
    expect(cmp.ok).toBe(false)
    expect(cmp.added).toEqual([])
    expect(cmp.worsened).toEqual([])
    expect(cmp.reclassified[0]).toMatchObject({
      form: '船',
      wasDefect: DEFECT.CURRICULUM_ROW_MISSING,
      defect: DEFECT.OUT_OF_CURRICULUM,
    })
  })
})
