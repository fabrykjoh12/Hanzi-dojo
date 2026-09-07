import { describe, it, expect } from 'vitest'
import {
  selectTargets, classifyNeed, buildManifest, validateManifest, manifestId,
  outputBudgetFor, COHORT, COHORT_PRIORITY, MANIFEST_SCHEMA, ManifestError,
  DEFAULT_MIN_OCCURRENCES,
} from './storyTargetManifest.mjs'

// Shaped like storyCoverage.buildCoverageReport(...).words — the canonical
// exposure measurement. `avail` is availableByLevel.stories: how many stories
// the learner can already READ contain this word.
const w = (word, level, avail) => ({
  word, level, availableByLevel: { stories: avail, occurrences: avail * 2 },
})

const WORDS = [
  w('朋友', 1, 9),      // well covered — not a target
  w('学校', 1, 3),      // under-covered
  w('汽车', 3, 0),      // coverage gap
  w('经济', 5, 0),      // above the band — never selectable for HSK 3
  w('哲学', 3, 0),      // coverage gap
  w('高兴', 2, 1),      // under-covered, barely
  w('一起', 3, 0),      // newly taught at the band, no coverage
]

describe('why a word is chosen is recorded, not inferred', () => {
  it('names a coverage gap when nothing available reinforces it', () => {
    expect(classifyNeed(w('哲学', 3, 0), { level: 6 })).toEqual({ cohort: COHORT.COVERAGE_GAP, exposure: 0 })
  })

  it('names under-coverage between one and four available stories', () => {
    expect(classifyNeed(w('学校', 1, 3), { level: 6 }).cohort).toBe(COHORT.UNDER_COVERED)
    expect(classifyNeed(w('学校', 1, 4), { level: 6 }).cohort).toBe(COHORT.UNDER_COVERED)
  })

  it('names newly-taught for a word of the band being written for', () => {
    expect(classifyNeed(w('一起', 3, 0), { level: 3, newlyTaughtLevel: 3 }).cohort).toBe(COHORT.NEWLY_TAUGHT)
  })

  it('returns nothing for a well-covered word — a story would add little', () => {
    expect(classifyNeed(w('朋友', 1, 9), { level: 6 })).toBeNull()
  })
})

describe('selectTargets', () => {
  it('supports all four cohorts', () => {
    const picked = selectTargets({ words: WORDS, level: 6, count: 10, requested: ['朋友'] })
    const seen = new Set(picked.map(p => p.cohort))
    expect(seen.has(COHORT.REQUESTED)).toBe(true)
    expect(seen.has(COHORT.COVERAGE_GAP)).toBe(true)
    expect(seen.has(COHORT.UNDER_COVERED)).toBe(true)
    const atBand = selectTargets({ words: WORDS, level: 3, count: 10 })
    expect(atBand.some(p => p.cohort === COHORT.NEWLY_TAUGHT)).toBe(true)
  })

  it('records the evidence for each choice', () => {
    const [gap] = selectTargets({ words: [w('哲学', 3, 0)], level: 6, count: 1 })
    expect(gap.why).toMatch(/no published story at or below HSK 3/)
    const [weak] = selectTargets({ words: [w('学校', 1, 3)], level: 6, count: 1 })
    expect(weak.why).toMatch(/3 available-by-level stories/)
  })

  it('a band word with no coverage is NEWLY_TAUGHT, not a gap', () => {
    // Both descriptions are true; the specific one is more useful to a writer
    // targeting that band, and it is the one recorded. Pinned because it is a
    // choice, not an accident of ordering.
    const [t] = selectTargets({ words: [w('哲学', 3, 0)], level: 3, count: 1 })
    expect(t.cohort).toBe(COHORT.NEWLY_TAUGHT)
    const [u] = selectTargets({ words: [w('哲学', 3, 0)], level: 6, count: 1 })
    expect(u.cohort).toBe(COHORT.COVERAGE_GAP)
  })

  it('never selects a word above the target band', () => {
    const picked = selectTargets({ words: WORDS, level: 3, count: 20 })
    expect(picked.every(p => p.level <= 3)).toBe(true)
    expect(picked.map(p => p.word)).not.toContain('经济')
  })

  it('is deterministic — same inputs, same order', () => {
    const a = selectTargets({ words: WORDS, level: 6, count: 4 })
    const b = selectTargets({ words: [...WORDS].reverse(), level: 6, count: 4 })
    expect(a.map(p => p.word)).toEqual(b.map(p => p.word))
  })

  it('ranks by NEED first — fewest reinforcing stories, whatever the label', () => {
    // The bug this pins: ordering by cohort first put a word with four
    // reinforcing stories ahead of one with none, because of how each happened
    // to be labelled. Exposure is the need; the cohort only breaks ties.
    const picked = selectTargets({ words: WORDS, level: 6, count: 6 })
    const exposures = picked.map(p => p.exposure)
    expect(exposures).toEqual([...exposures].sort((x, y) => x - y))
  })

  it('a request leads regardless of how well covered it is', () => {
    const picked = selectTargets({ words: WORDS, level: 6, count: 5, requested: ['朋友'] })
    expect(picked[0].word).toBe('朋友')      // 9 stories, and still first
    expect(picked[0].cohort).toBe(COHORT.REQUESTED)
  })

  it('breaks an exposure tie by cohort, band word first', () => {
    const tied = [w('哲学', 3, 0), w('汽车', 1, 0)]
    const picked = selectTargets({ words: tied, level: 3, count: 2 })
    expect(picked.map(p => p.cohort)).toEqual([COHORT.NEWLY_TAUGHT, COHORT.COVERAGE_GAP])
    expect(COHORT_PRIORITY.indexOf(picked[0].cohort))
      .toBeLessThan(COHORT_PRIORITY.indexOf(picked[1].cohort))
  })

  it('breaks a need tie by frequency when the caller supplies it', () => {
    // Hundreds of words tie at zero exposure. Falling back to character order
    // there would target 一共/一块儿/一般 before 被/中/如果 — the product's rule
    // is most useful words first.
    const freq = [
      { ...w('一共', 3, 0), sortOrder: 300 },
      { ...w('被', 3, 0), sortOrder: 4 },
      { ...w('如果', 3, 0), sortOrder: 20 },
    ]
    expect(selectTargets({ words: freq, level: 3, count: 3 }).map(p => p.word))
      .toEqual(['被', '如果', '一共'])
  })

  it('a word with no frequency rank sorts after one that has it', () => {
    const mixed = [w('一共', 3, 0), { ...w('被', 3, 0), sortOrder: 4 }]
    expect(selectTargets({ words: mixed, level: 3, count: 2 })[0].word).toBe('被')
  })

  it('honours a cohort filter', () => {
    const picked = selectTargets({ words: WORDS, level: 6, count: 10, cohorts: [COHORT.COVERAGE_GAP] })
    expect(picked.every(p => p.cohort === COHORT.COVERAGE_GAP)).toBe(true)
  })

  it('excludes words already targeted by another manifest in the batch', () => {
    const first = selectTargets({ words: WORDS, level: 6, count: 2 })
    const second = selectTargets({ words: WORDS, level: 6, count: 2, exclude: first.map(p => p.word) })
    expect(second.map(p => p.word).some(x => first.map(p => p.word).includes(x))).toBe(false)
  })

  it('REFUSES a requested word the vocabulary does not carry', () => {
    // Generating a story for a word the learner can never tap is worse than
    // saying no — and silently dropping it is worse still.
    expect(() => selectTargets({ words: WORDS, level: 6, count: 3, requested: ['缸'] }))
      .toThrow(/not in the vocabulary: 缸/)
  })

  it('REFUSES a requested word above the target band', () => {
    expect(() => selectTargets({ words: WORDS, level: 3, count: 3, requested: ['经济'] }))
      .toThrow(/above the target band/)
  })

  it('never returns the same word twice', () => {
    const picked = selectTargets({ words: WORDS, level: 6, count: 10, requested: ['学校'] })
    expect(new Set(picked.map(p => p.word)).size).toBe(picked.length)
  })
})

describe('buildManifest', () => {
  const targets = selectTargets({ words: WORDS, level: 3, count: 3 })
  const build = (over = {}) => buildManifest({
    id: 'hsk3-01', level: 3, targets, poolSize: 400,
    format: { lines: [18, 26], maxLineChars: 34, speakers: ['李明', '小红'] },
    ...over,
  })

  it('carries band, requirements, boundary, expectations and format', () => {
    const m = build()
    expect(m.schema).toBe(MANIFEST_SCHEMA)
    expect(m.level).toBe(3)
    expect(m.levelName).toBe('HSK 3')
    expect(m.required.length).toBe(3)
    expect(m.required[0]).toHaveProperty('cohort')
    expect(m.required[0]).toHaveProperty('why')
    expect(m.required[0].minOccurrences).toBe(DEFAULT_MIN_OCCURRENCES)
    expect(m.allowedVocabulary).toMatchObject({ maxLevel: 3, size: 400 })
    expect(m.limits.lines).toEqual([18, 26])
    expect(m.format.speakers).toEqual(['李明', '小红'])
  })

  it('derives an output budget from the shape asked for', () => {
    // Fixed budgets are what made every draft fail on an 8000-token/minute
    // tier: prompt plus budget exceeded the window before a character was
    // written.
    expect(build().outputBudget).toBe(outputBudgetFor({ lines: [18, 26], maxLineChars: 34 }))
    expect(outputBudgetFor({ lines: [30, 42], maxLineChars: 34 }))
      .toBeGreaterThan(outputBudgetFor({ lines: [18, 26], maxLineChars: 34 }))
  })

  it('refuses a manifest that targets nothing', () => {
    expect(() => build({ targets: [] })).toThrow(ManifestError)
  })

  it('refuses encounter bounds that cannot both hold', () => {
    expect(() => build({ minOccurrences: 6, maxOccurrences: 4 }))
      .toThrow(/no candidate could satisfy both/)
  })
})

describe('validateManifest fails closed', () => {
  const good = () => buildManifest({
    id: 'hsk3-01', level: 3, poolSize: 10,
    targets: [{ word: '学校', level: 1, cohort: COHORT.UNDER_COVERED, why: 'fixture' }],
    format: { lines: [6, 10], maxLineChars: 20, speakers: [] },
  })

  const broken = [
    ['not an object', null],
    ['an array', []],
    ['wrong schema', { ...good(), schema: 'fab9-story-target@2' }],
    ['no id', { ...good(), id: '' }],
    ['no requirements', { ...good(), required: [] }],
    ['a duplicate requirement', { ...good(), required: [
      { word: '学校', level: 1, cohort: COHORT.UNDER_COVERED, why: 'x', minOccurrences: 2 },
      { word: '学校', level: 1, cohort: COHORT.UNDER_COVERED, why: 'x', minOccurrences: 2 }] }],
    ['an unknown cohort', { ...good(), required: [
      { word: '学校', level: 1, cohort: 'BECAUSE', why: 'x', minOccurrences: 2 }] }],
    ['a requirement with no reason', { ...good(), required: [
      { word: '学校', level: 1, cohort: COHORT.UNDER_COVERED, why: '  ', minOccurrences: 2 }] }],
    ['a requirement above the band', { ...good(), required: [
      { word: '经济', level: 5, cohort: COHORT.UNDER_COVERED, why: 'x', minOccurrences: 2 }] }],
    ['inverted line bounds', { ...good(), limits: { ...good().limits, lines: [10, 6] } }],
    ['a coverage bound outside (0,1]', { ...good(), limits: { ...good().limits, minCoverage: 1.5 } }],
    ['a negative out-of-band budget', { ...good(), limits: { ...good().limits, maxOutOfBandDistinct: -1 } }],
    ['an allowed band below the target band', { ...good(), allowedVocabulary: { maxLevel: 2, size: 1 } }],
  ]
  for (const [name, m] of broken) {
    it('refuses: ' + name, () => {
      expect(() => validateManifest(m)).toThrow(ManifestError)
    })
  }

  it('accepts a well-formed manifest', () => {
    expect(() => validateManifest(good())).not.toThrow()
  })

  it('names the source so the failure is actionable', () => {
    expect(() => validateManifest(null, { source: 'batch-1/hsk3-01.json' }))
      .toThrow(/^batch-1\/hsk3-01\.json: /)
  })
})

describe('manifestId', () => {
  it('is stable for the same batch position and targets', () => {
    const id = manifestId({ level: 3, index: 1, targets: ['汽车', '哲学'] })
    expect(id).toBe(manifestId({ level: 3, index: 1, targets: ['汽车', '哲学'] }))
    expect(id).toMatch(/^hsk3-01/)
  })

  it('distinguishes positions within a batch', () => {
    expect(manifestId({ level: 3, index: 1, targets: [] }))
      .not.toBe(manifestId({ level: 3, index: 2, targets: [] }))
  })
})
