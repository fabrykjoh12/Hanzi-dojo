import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  validateCandidate, formatValidation, similarity, nearestDuplicate,
  DIAGNOSTIC, REPAIRABLE, VALIDATION_VERSION,
} from './storyCandidateValidation.mjs'
import { buildManifest, COHORT } from './storyTargetManifest.mjs'

// A fixture vocabulary small enough to reason about and large enough that a
// real sentence resolves completely. Levels are what make the band boundary
// testable: everything is HSK 1-3 except the four HSK 5 words.
const mk = (o) => Object.fromEntries(Object.entries(o).map(([w, [level, meaning]], i) =>
  [w, { id: i + 1, word: w, level, meaning, reading: '' }]))

const vocabMap = mk({
  我: [1, 'I'], 你: [1, 'you'], 你们: [1, 'you (plural)'], 的: [1, 'of'], 是: [1, 'to be'],
  很: [1, 'very'], 好: [1, 'good'], 书: [1, 'book'], 车: [1, 'car'], 汽车: [3, 'automobile'],
  说: [1, 'to say'], 看: [1, 'to look'], 今天: [1, 'today'], 学校: [1, 'school'], 去: [1, 'to go'],
  了: [1, 'particle'], 有: [1, 'to have'], 不: [1, 'not'], 在: [1, 'at'], 吃: [1, 'to eat'],
  饭: [1, 'meal'], 朋友: [1, 'friend'], 高兴: [2, 'happy'], 一起: [2, 'together'],
  老师: [1, 'teacher'], 问: [2, 'to ask'], 想: [1, 'to want'], 也: [1, 'also'], 和: [1, 'and'],
  我们: [1, 'we'], 他: [1, 'he'], 她: [1, 'she'], 都: [1, 'all'], 吗: [1, 'question particle'],
  经济: [5, 'economy'], 政治: [5, 'politics'], 哲学: [5, 'philosophy'], 环境: [5, 'environment'],
})

const target = (word, cohort = COHORT.UNDER_COVERED, min = 2) => ({
  word,
  level: vocabMap[word] ? vocabMap[word].level : 1,
  cohort,
  why: 'fixture',
  minOccurrences: min,
})

const manifestFor = (targets, over = {}) => buildManifest({
  id: 'hsk3-01',
  level: 3,
  targets,
  poolSize: Object.keys(vocabMap).length,
  format: { lines: [6, 10], maxLineChars: 20, speakers: ['老师', '朋友', '李明'], titleChars: [1, 12] },
  ...over,
})

// Every token resolves through the Reader, both targets appear twice, and the
// text is well inside every limit. Verified by running the canonical engine
// over it, not by eye.
const GOOD_LINES = [
  '今天我和朋友去学校。',
  '老师：你们好。',
  '我们一起看书。',
  '朋友：你想吃饭吗？',
  '我们去吃饭了。',
  '学校很好，朋友也很好。',
  '我很高兴。',
  '我想我们都很好。',
]
const good = (over = {}) => ({ title: '学校', content: GOOD_LINES.join('\n'), ...over })
const check = (candidate, manifest, opts = {}) =>
  validateCandidate(candidate, { manifest, vocabMap, ...opts })
const codes = (v) => v.diagnostics.map(d => d.code)

describe('a candidate that meets its manifest is accepted', () => {
  it('accepts, with no diagnostics', () => {
    const v = check(good(), manifestFor([target('朋友'), target('学校')]))
    expect(v.diagnostics).toEqual([])
    expect(v.accepted).toBe(true)
    expect(v.version).toBe(VALIDATION_VERSION)
  })

  it('reports what it measured, so the acceptance is auditable', () => {
    const v = check(good(), manifestFor([target('朋友'), target('学校')]))
    expect(v.summary.lines).toBe(8)
    expect(v.summary.targets).toEqual([
      { word: '朋友', cohort: COHORT.UNDER_COVERED, occurrences: 2, required: 2 },
      { word: '学校', cohort: COHORT.UNDER_COVERED, occurrences: 2, required: 2 },
    ])
    expect(v.summary.outOfBandDistinct).toBe(0)
    expect(v.summary.untappableOccurrences).toBe(0)
  })

  it('never mutates the candidate, the manifest or the vocabulary', () => {
    const candidate = good()
    const manifest = manifestFor([target('朋友'), target('学校')])
    const before = JSON.stringify({ candidate, manifest, vocabMap })
    check(candidate, manifest)
    expect(JSON.stringify({ candidate, manifest, vocabMap })).toBe(before)
  })
})

describe('required targets', () => {
  it('FAILS when a required word is absent entirely', () => {
    const v = check(good(), manifestFor([target('汽车')]))
    expect(v.accepted).toBe(false)
    expect(codes(v)).toContain(DIAGNOSTIC.TARGET_MISSING)
    const d = v.diagnostics.find(x => x.code === DIAGNOSTIC.TARGET_MISSING)
    expect(d.word).toBe('汽车')
    expect(d.occurrences).toBe(0)
  })

  it('FAILS when the target appears ONLY inside a longer word', () => {
    // The Reader renders 汽车 as one token, so a learner targeting 车 never
    // meets it. A substring search would have called this a pass.
    const candidate = { title: '车', content: [
      '今天我和朋友看汽车。',
      '老师：你们好。',
      '我们一起看汽车。',
      '朋友：你想去学校吗？',
      '我们去学校了。',
      '我很高兴。',
    ].join('\n') }
    const v = check(candidate, manifestFor([target('车')]))
    const d = v.diagnostics.find(x => x.code === DIAGNOSTIC.TARGET_MISSING)
    expect(d.word).toBe('车')
    expect(d.insideOnly).toEqual(['汽车'])
    expect(d.detail).toMatch(/only inside 汽车/)
  })

  it('FAILS when a target is present but under-used', () => {
    const v = check(good(), manifestFor([target('高兴')]))   // appears once
    const d = v.diagnostics.find(x => x.code === DIAGNOSTIC.TARGET_UNDER_USED)
    expect(d).toMatchObject({ word: '高兴', occurrences: 1, required: 2 })
  })

  it('FAILS when a target is stuffed past the ceiling', () => {
    const v = check(good(), manifestFor([target('很')], { maxOccurrences: 3 }))
    const d = v.diagnostics.find(x => x.code === DIAGNOSTIC.TARGET_STUFFED)
    expect(d).toMatchObject({ word: '很', occurrences: 4, ceiling: 3 })
  })

  it('FAILS when the required words dominate the text', () => {
    // Presence is not the goal. A text that is a quarter target words reads as
    // a drill however grammatical each sentence is.
    const v = check(good(), manifestFor(
      [target('很'), target('好'), target('我们'), target('我')],
      { maxTargetShare: 0.2, maxOccurrences: 20 }))
    expect(codes(v)).toContain(DIAGNOSTIC.TARGET_DENSITY)
  })

  it('counts a target the same way the Reader would highlight it', () => {
    const v = check(good(), manifestFor([target('学校')]))
    expect(v.summary.targets[0].occurrences).toBe(2)
  })
})

describe('the band boundary', () => {
  const overBand = (over = {}) => ({ title: '课', content: [
    '今天我和朋友去学校。',
    '老师：经济很难。',
    '朋友：政治也很难。',
    '我们一起看书。',
    '我想哲学不好。',
    '环境很好。',
    '我很高兴。',
    '我们都很好。',
  ].join('\n'), ...over })

  it('FAILS when too many distinct above-band words appear', () => {
    const v = check(overBand(), manifestFor([target('朋友'), target('学校')], { maxOutOfBandDistinct: 3 }))
    const d = v.diagnostics.find(x => x.code === DIAGNOSTIC.OUT_OF_BAND_VOCAB)
    expect(d.distinct).toBe(4)
    expect(d.words.map(w => w.word).sort()).toEqual(['哲学', '政治', '环境', '经济'].sort())
  })

  it('allows a small, budgeted reach above the band', () => {
    const v = check(overBand(), manifestFor([target('朋友'), target('学校')],
      { maxOutOfBandDistinct: 5, maxOutOfBandOccurrences: 10 }))
    expect(codes(v)).not.toContain(DIAGNOSTIC.OUT_OF_BAND_VOCAB)
  })

  it('FAILS a candidate that declares the wrong HSK band', () => {
    const v = check(good({ level: 5 }), manifestFor([target('朋友'), target('学校')]))
    const d = v.diagnostics.find(x => x.code === DIAGNOSTIC.BAND_MISMATCH)
    expect(d).toMatchObject({ declared: 5, expected: 3 })
    expect(d.repairable).toBe(false)
  })
})

describe('Reader resolvability is the merged content-integrity rule, not a copy', () => {
  it('FAILS on an ordinary word the learner cannot tap', () => {
    const v = check(good({ content: GOOD_LINES.concat('我的缸很好。').join('\n') }),
      manifestFor([target('朋友'), target('学校')]))
    const d = v.diagnostics.find(x => x.code === DIAGNOSTIC.UNTAPPABLE_TEXT)
    expect(d.word).toBe('缸')
    expect(d.defect).toBeTruthy()
  })

  it('does NOT excuse an ordinary unknown word as a proper noun', () => {
    const v = check(good({ content: GOOD_LINES.concat('我看那个缸。').join('\n') }),
      manifestFor([target('朋友'), target('学校')]))
    expect(v.diagnostics.some(d => d.code === DIAGNOSTIC.UNTAPPABLE_TEXT && d.word === '缸')).toBe(true)
    expect(v.accepted).toBe(false)
  })

  it('accepts a character introduced by a speaker label', () => {
    // collectStoryNames derives names from the story's own labels, so a cast
    // member costs no vocabulary row.
    const content = GOOD_LINES.slice(0, 7).concat('李明：我很好。').join('\n')
    const v = check({ title: '朋友', content }, manifestFor([target('朋友'), target('学校')]))
    expect(codes(v)).not.toContain(DIAGNOSTIC.UNTAPPABLE_TEXT)
    expect(v.accepted).toBe(true)
  })

  it('accepts a canonical character named only in narration', () => {
    const content = GOOD_LINES.slice(0, 7).concat('李明也很高兴。').join('\n')
    const v = check({ title: '朋友', content }, manifestFor([target('朋友'), target('学校')]))
    expect(codes(v)).not.toContain(DIAGNOSTIC.UNTAPPABLE_TEXT)
  })
})

describe('format', () => {
  it('FAILS on too few or too many lines', () => {
    const short = check({ title: '书', content: '我很好。\n我们去学校。' },
      manifestFor([target('学校', COHORT.REQUESTED, 1)]))
    const d = short.diagnostics.find(x => x.code === DIAGNOSTIC.LINE_COUNT)
    expect(d).toMatchObject({ lines: 2, min: 6, max: 10 })
  })

  it('FAILS on a line far past the length limit', () => {
    const long = GOOD_LINES.slice(0, 7).concat('今天我和朋友去学校看书，我们一起吃饭，我很高兴。').join('\n')
    const v = check({ title: '书', content: long }, manifestFor([target('朋友'), target('学校')]))
    expect(v.diagnostics.some(d => d.code === DIAGNOSTIC.LINE_TOO_LONG && d.line === 8)).toBe(true)
  })

  it('FAILS on a speaker outside the cast', () => {
    const content = GOOD_LINES.slice(0, 7).concat('小明：我也去。').join('\n')
    const v = check({ title: '书', content }, manifestFor([target('朋友'), target('学校')]))
    const d = v.diagnostics.find(x => x.code === DIAGNOSTIC.UNKNOWN_SPEAKER)
    expect(d).toMatchObject({ speaker: '小明', line: 8 })
  })

  it('FAILS on a missing or oversized title', () => {
    expect(codes(check(good({ title: '' }), manifestFor([target('朋友'), target('学校')]))))
      .toContain(DIAGNOSTIC.TITLE_INVALID)
    expect(codes(check(good({ title: '今天我和朋友一起去学校看书' }), manifestFor([target('朋友'), target('学校')]))))
      .toContain(DIAGNOSTIC.TITLE_INVALID)
  })
})

describe('malformed output', () => {
  const m = () => manifestFor([target('朋友')])
  const cases = [
    ['null', null], ['a string', 'not a story'], ['an array', []],
    ['no content', { title: '书' }], ['empty content', { title: '书', content: '   ' }],
    ['content that is not a string', { title: '书', content: 42 }],
  ]
  for (const [name, candidate] of cases) {
    it('refuses ' + name, () => {
      const v = check(candidate, m())
      expect(v.accepted).toBe(false)
      expect(codes(v)).toContain(DIAGNOSTIC.MALFORMED)
      expect(v.diagnostics[0].repairable).toBe(false)
    })
  }

  it('stops at MALFORMED rather than reporting derived nonsense', () => {
    const v = check(null, m())
    expect(v.diagnostics).toHaveLength(1)
  })
})

describe('duplicate detection', () => {
  it('scores an identical text as identical, and unrelated text as low', () => {
    expect(similarity(GOOD_LINES.join('\n'), GOOD_LINES.join('\n'))).toBe(1)
    expect(similarity(GOOD_LINES.join('\n'), '经济和政治都很难。')).toBeLessThan(0.2)
  })

  it('FAILS a candidate that repeats an existing story', () => {
    const corpus = [{ id: 'existing-1', title: '学校', content: GOOD_LINES.join('\n') }]
    const v = check(good(), manifestFor([target('朋友'), target('学校')]), { corpus })
    const d = v.diagnostics.find(x => x.code === DIAGNOSTIC.DUPLICATE)
    expect(d).toMatchObject({ id: 'existing-1', score: 1 })
    expect(d.repairable).toBe(false)     // editing a duplicate makes another one
  })

  it('passes against an unrelated corpus', () => {
    const corpus = [{ id: 'other', title: '课', content: '经济和政治都很难。\n哲学也很难。' }]
    expect(check(good(), manifestFor([target('朋友'), target('学校')]), { corpus }).accepted).toBe(true)
  })

  it('nearestDuplicate reports nothing below the threshold', () => {
    expect(nearestDuplicate('我很好。', [{ id: 'x', content: '经济很难。' }], 0.5)).toBeNull()
  })
})

describe('the verdict cannot disagree with the diagnostics', () => {
  it('is accepted if and only if there are no diagnostics', () => {
    const m = manifestFor([target('朋友'), target('学校')])
    const samples = [
      good(), good({ title: '' }), good({ level: 5 }),
      { title: '书', content: '我很好。' }, null,
      good({ content: GOOD_LINES.concat('我的缸很好。').join('\n') }),
    ]
    for (const s of samples) {
      const v = check(s, m)
      expect(v.accepted).toBe(v.diagnostics.length === 0)
    }
  })

  it('every diagnostic carries a repairability verdict the retry loop can use', () => {
    const v = check(good({ title: '', level: 5 }), manifestFor([target('汽车')]))
    expect(v.diagnostics.length).toBeGreaterThan(0)
    for (const d of v.diagnostics) {
      expect(typeof d.repairable).toBe('boolean')
      expect(d.repairable).toBe(REPAIRABLE[d.code])
      expect(d.detail).toBeTruthy()
    }
  })

  it('formats a failure as codes and details, not just false', () => {
    const out = formatValidation(check(good(), manifestFor([target('汽车')])))
    expect(out).toMatch(/^FAILED: hsk3-01/)
    expect(out).toContain(DIAGNOSTIC.TARGET_MISSING)
    expect(out).toContain('汽车')
  })
})

describe('the validator has no way to publish anything', () => {
  it('imports no database, filesystem or network capability', () => {
    const code = readFileSync('storyCandidateValidation.mjs', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    for (const forbidden of ['supabase', 'node:fs', 'fetch(', 'http']) {
      expect(code.includes(forbidden), 'must not reference ' + forbidden).toBe(false)
    }
  })
})
