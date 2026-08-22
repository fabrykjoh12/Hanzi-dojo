import { describe, it, expect } from 'vitest'
import {
  evaluateDraftQuality,
  assessRepairability,
  preRepairDecision,
  DRAFT_QUALITY,
  REPAIRABLE_LIMITS,
} from './storyDraftQuality.mjs'
import { parseJudgment, judgePrompt } from './storyJudge.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

const manifest = (over = {}) => buildManifest({
  batchId: 'q', seq: 1, level: 3,
  targets: ['护照', '邻居', '打算'],
  defaults: { lines: [6, 20] },
  ...over,
})

const critique = (over = {}) => ({
  scores: { natural: 7, coherence: 7, integration: 6, level: 7, human: 6, interest: 6 },
  overall: 7, mechanical: false, contradiction: false, strengths: 's', weaknesses: 'w',
  ...over,
})

// The real repair-3 draft: deterministically repairable, semantically not
// worth the four operations it cost.
const REPAIR_3 = {
  scores: { natural: 3, coherence: 3, integration: 2, level: 6, human: 4, interest: 4 },
  overall: 3, mechanical: true, contradiction: false,
  weaknesses: 'The plot is nonsensical and the dialogue is painfully wooden',
}

describe('evaluateDraftQuality — is this story worth repairing at all?', () => {
  it('passes a draft that clears every pilot threshold', () => {
    const r = evaluateDraftQuality(critique())
    expect(r.ok).toBe(true)
    expect(r.code).toBeNull()
    expect(r.reasons).toEqual([])
    expect(r.overall).toBe(7)
  })

  it('rejects the repair-3 draft before a single repair call', () => {
    const r = evaluateDraftQuality(REPAIR_3)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('DRAFT_QUALITY_FAILED')
    expect(r.reasons).toEqual([
      'overall 3 < 6',
      'natural 3 < 5',
      'coherence 3 < 5',
      'integration 2 < 5',
      'human 4 < 5',
    ])
    expect(r.scores).toEqual(REPAIR_3.scores)          // the raw scores travel with the verdict
  })

  it('a single dimension below its floor is enough, however good the average', () => {
    expect(evaluateDraftQuality(critique({ scores: { ...critique().scores, coherence: 4 } })).reasons)
      .toEqual(['coherence 4 < 5'])
    expect(evaluateDraftQuality(critique({ overall: 5 })).reasons).toEqual(['overall 5 < 6'])
    expect(evaluateDraftQuality(critique({ scores: { ...critique().scores, human: 4 } })).ok).toBe(false)
    expect(evaluateDraftQuality(critique({ scores: { ...critique().scores, integration: 4 } })).ok).toBe(false)
  })

  it('a reported contradiction rejects a draft that otherwise passes', () => {
    const r = evaluateDraftQuality(critique({ contradiction: true, contradictionDetail: 'the cat is in two places at once' }))
    expect(r.ok).toBe(false)
    expect(r.code).toBe('DRAFT_QUALITY_FAILED')
    expect(r.reasons[0]).toContain('two places at once')
  })

  it('mechanical is recorded but does not by itself reject a good story', () => {
    const r = evaluateDraftQuality(critique({ mechanical: true }))
    expect(r.ok).toBe(true)
    expect(r.mechanical).toBe(true)
  })

  it('an unreadable critique refuses to authorise repair rather than assuming the best', () => {
    for (const bad of [null, undefined, {}, { scores: {} }]) {
      const r = evaluateDraftQuality(bad)
      expect(r.ok).toBe(false)
      expect(r.code).toBe('DRAFT_QUALITY_UNKNOWN')
    }
  })

  it('scores a missing dimension as a failure, not as a pass', () => {
    const r = evaluateDraftQuality(critique({ scores: { natural: 7, coherence: 7, level: 7, human: 6 } }))
    expect(r.reasons).toEqual(['integration was not scored'])
  })
})

describe('assessRepairability — are the mechanical problems actually small?', () => {
  const validation = (failures, metrics = {}) => ({
    verdict: failures.length ? 'FAIL' : 'PASS',
    failures,
    warnings: [],
    metrics: { lines: 20, targetCounts: { 护照: 2, 邻居: 2, 打算: 2 }, unknownDistinct: 2, ...metrics },
  })

  it('accepts the narrow classes: a missing occurrence, a few unknown words, a small overage', () => {
    const r = assessRepairability({
      manifest: manifest(),
      validation: validation(
        [{ code: 'too_long' }, { code: 'target_below_min' }, { code: 'unknown_words' }],
        { lines: 22, targetCounts: { 护照: 1, 邻居: 2, 打算: 2 }, unknownDistinct: 4 }),
    })
    expect(r.repairable).toBe(true)
    expect(r.magnitudes).toEqual({ lineExcess: 2, missingOccurrences: 1, excessOccurrences: 0, unknownExcess: 2, longLines: 0, badSpeakers: 0 })
  })

  it('refuses a broken plot\'s symptoms: a story under length, a duplicate, whole-text repetition', () => {
    for (const [code, fragment] of [
      ['too_short', 'writing, not repair'],
      ['duplicate_of_existing', 'duplicates a published story'],
      ['repetition_excess', 'runs through the whole story'],
      ['invalid_content', 'no usable content'],
    ]) {
      const r = assessRepairability({ manifest: manifest(), validation: validation([{ code }]) })
      expect(r.repairable).toBe(false)
      expect(r.reasons.join(' ')).toContain(fragment)
    }
  })

  it('refuses a wholesale difficulty mismatch — that is a rewrite, not surgery', () => {
    const r = assessRepairability({ manifest: manifest(), validation: validation([{ code: 'out_of_level_share' }]) })
    expect(r.repairable).toBe(false)
    expect(r.reasons[0]).toContain('difficulty mismatch')
  })

  it('refuses large-format damage even in a repairable class', () => {
    const tooLong = assessRepairability({
      manifest: manifest(),
      validation: validation([{ code: 'too_long' }], { lines: 30 }),      // 10 over a ceiling of 20
    })
    expect(tooLong.repairable).toBe(false)
    expect(tooLong.reasons[0]).toContain('large format failure')

    const tooManyMissing = assessRepairability({
      manifest: manifest({ targets: ['护照', '邻居', '打算', '铅笔', '地图'] }),
      validation: validation([{ code: 'missing_target' }], { targetCounts: {} }),
    })
    expect(tooManyMissing.repairable).toBe(false)
    expect(tooManyMissing.reasons[0]).toContain('target occurrences missing')

    const tooManyUnknown = assessRepairability({
      manifest: manifest(),
      validation: validation([{ code: 'unknown_words' }], { unknownDistinct: 9 }),
    })
    expect(tooManyUnknown.repairable).toBe(false)
    expect(tooManyUnknown.reasons[0]).toContain('unknown words over the cap')
  })

  it('a clean validation is trivially repairable (there is nothing to repair)', () => {
    const r = assessRepairability({ manifest: manifest(), validation: validation([]) })
    expect(r.repairable).toBe(true)
    expect(r.trivial).toBe(true)
  })

  it('the limits are pilot values, stated once', () => {
    expect(REPAIRABLE_LIMITS.lineExcess).toBe(4)
    expect(DRAFT_QUALITY).toEqual({ overall: 6, natural: 5, coherence: 5, integration: 5, human: 5 })
  })
})

describe('preRepairDecision — quality first, then repairability', () => {
  const narrow = {
    verdict: 'FAIL',
    failures: [{ code: 'target_below_min' }],
    warnings: [],
    metrics: { lines: 20, targetCounts: { 护照: 1, 邻居: 2, 打算: 2 }, unknownDistinct: 1 },
  }

  it('authorises repair only when both halves agree', () => {
    const d = preRepairDecision({ critique: critique(), validation: narrow, manifest: manifest() })
    expect(d.ok).toBe(true)
    expect(d.quality.ok).toBe(true)
    expect(d.repairability.repairable).toBe(true)
  })

  it('a poor story is refused before repairability is even considered', () => {
    const d = preRepairDecision({ critique: REPAIR_3, validation: narrow, manifest: manifest() })
    expect(d.ok).toBe(false)
    expect(d.code).toBe('DRAFT_QUALITY_FAILED')
    expect(d.repairability).toBeNull()                 // not computed — the story is gone already
    expect(d.reason).toContain('overall 3 < 6')
  })

  it('a good story with broad damage is refused as NOT_REPAIRABLE', () => {
    const broad = { ...narrow, failures: [{ code: 'too_short' }] }
    const d = preRepairDecision({ critique: critique(), validation: broad, manifest: manifest() })
    expect(d.ok).toBe(false)
    expect(d.code).toBe('NOT_REPAIRABLE')
    expect(d.quality.ok).toBe(true)
  })

  it('the gate never touches the deterministic verdict — it only decides whether to try', () => {
    const d = preRepairDecision({ critique: critique({ overall: 10 }), validation: narrow, manifest: manifest() })
    expect(d.ok).toBe(true)
    expect(narrow.verdict).toBe('FAIL')                // unchanged, and still FAIL
    expect(d.quality.overall).toBe(10)
  })
})

describe('the critique carries what the gate needs', () => {
  it('parses a contradiction report and keeps its detail', () => {
    const j = parseJudgment('NATURAL: 3\nCOHERENCE: 3\nINTEGRATION: 2\nLEVEL: 6\nHUMAN: 4\nINTEREST: 4\nOVERALL: 3\n'
      + 'STRENGTHS: formatting\nWEAKNESSES: wooden\nMECHANICAL: yes\nCONTRADICTION: yes — the cat is in two places')
    expect(j.contradiction).toBe(true)
    expect(j.contradictionDetail).toBe('the cat is in two places')
    expect(evaluateDraftQuality(j).code).toBe('DRAFT_QUALITY_FAILED')
    expect(parseJudgment('OVERALL: 7\nCONTRADICTION: no').contradiction).toBe(false)
  })

  it('the pre-repair prompt tells the judge to ignore mechanical problems, not that there are none', () => {
    const args = { candidate: { content: '一句话。' }, manifest: manifest(), levelName: 'HSK 3' }
    const pre = judgePrompt({ ...args, preRepair: true })
    expect(pre).toContain('unedited first draft')
    expect(pre).toContain('IGNORE all of that completely')
    expect(pre).not.toContain('ALREADY passed every mechanical check')
    expect(pre).toContain('CONTRADICTION:')
    // the post-repair framing is untouched
    expect(judgePrompt(args)).toContain('ALREADY passed every mechanical check')
  })
})
