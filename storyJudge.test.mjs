import { describe, it, expect } from 'vitest'
import {
  judgePrompt,
  parseJudgment,
  applyJudgment,
  judgeable,
  JUDGE_VERSION,
  JUDGE_DIMENSIONS,
} from './storyJudge.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

const manifest = buildManifest({
  batchId: 'b', seq: 1, level: 3, targets: ['护照', '邻居'], defaults: { lines: [6, 20] },
})

const passFile = () => ({
  schema: 'story-candidate@1',
  manifest,
  provider: { name: 'groq', model: 'model-a' },
  candidate: {
    status: 'accepted',
    title: '去旅行',
    content: '李明去问邻居。\n邻居说护照要放好。',
    validation: { verdict: 'PASS', failures: [], warnings: [], metrics: { targetCounts: { 护照: 2 } } },
  },
})

describe('judgePrompt', () => {
  it('scopes the judge to writing quality and names the targets', () => {
    const p = judgePrompt({ candidate: passFile().candidate, manifest, levelName: 'HSK 3' })
    expect(p).toContain('HSK 3')
    expect(p).toContain('护照、邻居')
    expect(p).toContain('ALREADY passed every mechanical check')
    expect(p).toContain('Do NOT re-check vocabulary counts')
    for (const [key] of JUDGE_DIMENSIONS) expect(p).toContain(key.toUpperCase())
  })
})

describe('parseJudgment', () => {
  it('reads a well-formed judgment', () => {
    const j = parseJudgment([
      'NATURAL: 7', 'COHERENCE: 8', 'INTEGRATION: 6', 'LEVEL: 9', 'HUMAN: 5', 'INTEREST: 6',
      'OVERALL: 7', 'STRENGTHS: clear arc', 'WEAKNESSES: flat ending', 'MECHANICAL: yes',
    ].join('\n'))
    expect(j.scores).toEqual({ natural: 7, coherence: 8, integration: 6, level: 9, human: 5, interest: 6 })
    expect(j.overall).toBe(7)
    expect(j.strengths).toBe('clear arc')
    expect(j.mechanical).toBe(true)
  })

  it('tolerates messy formatting and bullet noise', () => {
    const j = parseJudgment('- Natural: 8/10\n * coherence : 7\nOverall: 8\nMechanical: No')
    expect(j.scores.natural).toBe(8)
    expect(j.scores.coherence).toBe(7)
    expect(j.mechanical).toBe(false)
  })

  it('averages the dimensions when OVERALL is missing', () => {
    const j = parseJudgment('NATURAL: 6\nCOHERENCE: 8')
    expect(j.overall).toBe(7)
  })

  it('returns null when nothing is readable — a failed judgment, not a zero', () => {
    expect(parseJudgment('I cannot evaluate this.')).toBeNull()
    expect(parseJudgment('')).toBeNull()
  })

  it('clamps out-of-range scores', () => {
    const j = parseJudgment('NATURAL: 44\nOVERALL: 0')
    expect(j.scores.natural).toBe(10)
    expect(j.overall).toBe(1)
  })
})

describe('applyJudgment — additive only', () => {
  it('appends without touching status or validation', () => {
    const file = passFile()
    const snapshot = JSON.parse(JSON.stringify(file))
    const out = applyJudgment(file, { judgeVersion: JUDGE_VERSION, overall: 4, scores: {} })
    expect(out.judgments.length).toBe(1)
    expect(out.candidate.status).toBe('accepted')
    expect(out.candidate.validation).toEqual(snapshot.candidate.validation)
    expect(file).toEqual(snapshot)                    // input untouched
  })

  it('a scathing judgment cannot demote a deterministic PASS', () => {
    const out = applyJudgment(passFile(), { overall: 1, scores: { natural: 1 }, mechanical: true })
    expect(out.candidate.status).toBe('accepted')
    expect(out.candidate.validation.verdict).toBe('PASS')
  })

  it('accumulates judgments from several judges', () => {
    const one = applyJudgment(passFile(), { judge: { model: 'a' }, overall: 6 })
    const two = applyJudgment(one, { judge: { model: 'b' }, overall: 8 })
    expect(two.judgments.map(j => j.overall)).toEqual([6, 8])
  })
})

describe('judgeable — an LLM never sees a deterministic FAIL', () => {
  it('accepts an accepted+PASS candidate', () => {
    expect(judgeable(passFile()).ok).toBe(true)
  })

  it('refuses a rejected candidate, a FAIL verdict and empty content', () => {
    const rejected = passFile()
    rejected.candidate = { ...rejected.candidate, status: 'rejected' }
    expect(judgeable(rejected).ok).toBe(false)

    const failed = passFile()
    failed.candidate = { ...failed.candidate, validation: { verdict: 'FAIL', failures: [{ code: 'missing_target' }] } }
    expect(judgeable(failed).ok).toBe(false)
    expect(judgeable(failed).reason).toContain('FAIL')

    const empty = passFile()
    empty.candidate = { ...empty.candidate, content: '   ' }
    expect(judgeable(empty).ok).toBe(false)
  })
})
