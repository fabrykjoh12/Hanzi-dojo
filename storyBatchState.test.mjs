import { describe, it, expect } from 'vitest'
import {
  planBatch, nextAction, diagnosticSignature, repairBrief, candidateFile,
  candidateRecord, summarizeBatch, ACTION, DEFAULT_MAX_ATTEMPTS, BATCH_VERSION,
} from './storyBatchState.mjs'
import { DIAGNOSTIC } from './storyCandidateValidation.mjs'

const v = (diagnostics = []) => ({
  version: 'fab10-candidate@1',
  manifest: 'hsk3-01',
  accepted: diagnostics.length === 0,
  diagnostics,
  summary: {},
})
const d = (code, extra = {}) => ({ code, detail: code, repairable: code !== DIAGNOSTIC.DUPLICATE
  && code !== DIAGNOSTIC.MALFORMED && code !== DIAGNOSTIC.BAND_MISMATCH, ...extra })

describe('resume does not redo accepted work', () => {
  const manifests = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('generates everything on a fresh batch', () => {
    const { todo, done } = planBatch({ manifests })
    expect(todo.map(t => t.manifest.id)).toEqual(['a', 'b', 'c'])
    expect(done).toEqual([])
  })

  it('skips a manifest whose candidate was already accepted', () => {
    const existing = { b: { accepted: true, manifest: { id: 'b' }, attempts: 1 } }
    const { todo, done } = planBatch({ manifests, existing })
    expect(todo.map(t => t.manifest.id)).toEqual(['a', 'c'])
    expect(done.map(r => r.manifest.id)).toEqual(['b'])
  })

  it('resuming twice still produces exactly one record per manifest', () => {
    const existing = { a: { accepted: true, manifest: { id: 'a' } }, b: { accepted: true, manifest: { id: 'b' } } }
    const first = planBatch({ manifests, existing })
    const second = planBatch({ manifests, existing })
    const ids = [...first.done, ...first.todo.map(t => t.manifest)].map(x => x.id || x.manifest.id)
    expect(new Set(ids).size).toBe(3)
    expect(second.todo.map(t => t.manifest.id)).toEqual(first.todo.map(t => t.manifest.id))
  })

  it('carries the attempt count forward, so resuming cannot reset the bound', () => {
    const existing = { a: { accepted: false, manifest: { id: 'a' }, attempts: 2, diagnostics: [] } }
    const { todo } = planBatch({ manifests, existing })
    expect(todo.find(t => t.manifest.id === 'a').attemptsUsed).toBe(2)
  })

  it('writes one file per manifest id, so a rerun overwrites instead of appending', () => {
    expect(candidateFile('hsk3-01')).toBe('hsk3-01.json')
    expect(candidateFile('hsk3-01')).toBe(candidateFile('hsk3-01'))
  })
})

describe('the repair loop is bounded and knows its two moves', () => {
  it('ACCEPTs a clean validation', () => {
    expect(nextAction({ validation: v(), attemptsUsed: 0 }).action).toBe(ACTION.ACCEPT)
  })

  it('REPAIRs when every diagnostic is repairable', () => {
    const r = nextAction({ validation: v([d(DIAGNOSTIC.TARGET_MISSING, { word: '车' })]), attemptsUsed: 0 })
    expect(r.action).toBe(ACTION.REPAIR)
  })

  it('succeeds on the retry after a repairable first candidate', () => {
    // The loop as the runner drives it: fail → REPAIR → pass → ACCEPT.
    const first = v([d(DIAGNOSTIC.TARGET_UNDER_USED, { word: '学校' })])
    const step1 = nextAction({ validation: first, attemptsUsed: 1, history: [] })
    expect(step1.action).toBe(ACTION.REPAIR)
    const step2 = nextAction({ validation: v(), attemptsUsed: 2, history: [diagnosticSignature(first)] })
    expect(step2.action).toBe(ACTION.ACCEPT)
  })

  it('REGENERATEs rather than repairing what a repair cannot fix', () => {
    for (const code of [DIAGNOSTIC.DUPLICATE, DIAGNOSTIC.MALFORMED, DIAGNOSTIC.BAND_MISMATCH]) {
      const r = nextAction({ validation: v([d(code)]), attemptsUsed: 1 })
      expect(r.action, code).toBe(ACTION.REGENERATE)
      expect(r.reason).toContain(code)
    }
  })

  it('REGENERATEs when the last repair changed nothing', () => {
    const stuck = v([d(DIAGNOSTIC.TARGET_MISSING, { word: '车' })])
    const r = nextAction({ validation: stuck, attemptsUsed: 1, history: [diagnosticSignature(stuck)] })
    expect(r.action).toBe(ACTION.REGENERATE)
    expect(r.reason).toMatch(/changed nothing/)
  })

  it('STOPS at the attempt limit instead of looping', () => {
    const r = nextAction({
      validation: v([d(DIAGNOSTIC.TARGET_MISSING, { word: '车' })]),
      attemptsUsed: DEFAULT_MAX_ATTEMPTS,
    })
    expect(r.action).toBe(ACTION.GIVE_UP)
    expect(r.reason).toMatch(/attempt limit reached \(3\)/)
  })

  it('gives up on a failing candidate rather than accepting it', () => {
    const failing = v([d(DIAGNOSTIC.TARGET_MISSING, { word: '车' })])
    const r = nextAction({ validation: failing, attemptsUsed: 99 })
    expect(r.action).toBe(ACTION.GIVE_UP)
    expect(r.action).not.toBe(ACTION.ACCEPT)
  })

  it('respects a lower limit when one is set', () => {
    expect(nextAction({ validation: v([d(DIAGNOSTIC.LINE_COUNT)]), attemptsUsed: 1, maxAttempts: 1 }).action)
      .toBe(ACTION.GIVE_UP)
  })

  it('terminates: every path from any state reaches ACCEPT or GIVE_UP', () => {
    // Drive the loop with a candidate that never improves; it must stop.
    const stuck = v([d(DIAGNOSTIC.TARGET_MISSING, { word: '车' })])
    let attempts = 0
    const history = []
    let action
    for (let i = 0; i < 50; i += 1) {
      const r = nextAction({ validation: stuck, attemptsUsed: attempts, history })
      action = r.action
      if (action === ACTION.ACCEPT || action === ACTION.GIVE_UP) break
      history.push(diagnosticSignature(stuck))
      attempts += 1
    }
    expect(action).toBe(ACTION.GIVE_UP)
    expect(attempts).toBeLessThanOrEqual(DEFAULT_MAX_ATTEMPTS)
  })
})

describe('the signature distinguishes progress from repetition', () => {
  it('is stable and order-independent', () => {
    const a = v([d(DIAGNOSTIC.TARGET_MISSING, { word: '车' }), d(DIAGNOSTIC.LINE_COUNT)])
    const b = v([d(DIAGNOSTIC.LINE_COUNT), d(DIAGNOSTIC.TARGET_MISSING, { word: '车' })])
    expect(diagnosticSignature(a)).toBe(diagnosticSignature(b))
  })

  it('changes when a different word is at fault', () => {
    expect(diagnosticSignature(v([d(DIAGNOSTIC.TARGET_MISSING, { word: '车' })])))
      .not.toBe(diagnosticSignature(v([d(DIAGNOSTIC.TARGET_MISSING, { word: '书' })])))
  })

  it('is empty for a clean validation', () => {
    expect(diagnosticSignature(v())).toBe('')
  })
})

describe('the repair brief is an instruction, not a code dump', () => {
  it('tells the writer what to change, per diagnostic', () => {
    const brief = repairBrief(v([
      d(DIAGNOSTIC.TARGET_MISSING, { word: '车', required: 2, insideOnly: ['汽车'] }),
      d(DIAGNOSTIC.TARGET_UNDER_USED, { word: '学校', occurrences: 1, required: 2 }),
      d(DIAGNOSTIC.UNKNOWN_SPEAKER, { speaker: '小明', line: 4 }),
      d(DIAGNOSTIC.LINE_COUNT, { lines: 3, min: 6, max: 10 }),
    ]))
    expect(brief[0]).toMatch(/only inside 汽车/)
    expect(brief[1]).toMatch(/学校 2 times/)
    expect(brief[2]).toMatch(/小明.*not in the cast/)
    expect(brief[3]).toMatch(/too short/)
  })

  it('is deterministic', () => {
    const val = v([d(DIAGNOSTIC.TARGET_MISSING, { word: '车', required: 2 })])
    expect(repairBrief(val)).toEqual(repairBrief(val))
  })

  it('falls back to the diagnostic detail for anything it has no phrasing for', () => {
    expect(repairBrief(v([{ code: 'SOMETHING_NEW', detail: 'a new problem', repairable: true }])))
      .toEqual(['a new problem'])
  })
})

describe('the batch report says plainly what happened', () => {
  const rec = (id, accepted, diagnostics = []) => candidateRecord({
    manifest: { id },
    candidate: { title: 't', content: 'x' },
    validation: { accepted, diagnostics },
    attempts: accepted ? 1 : 3,
    outcome: accepted ? ACTION.ACCEPT : ACTION.GIVE_UP,
  })

  it('counts accepted and rejected, and never conflates them', () => {
    const s = summarizeBatch([
      rec('a', true), rec('b', false, [d(DIAGNOSTIC.TARGET_MISSING, { word: '车' })]),
      rec('c', false, [d(DIAGNOSTIC.TARGET_MISSING, { word: '书' }), d(DIAGNOSTIC.LINE_COUNT)]),
    ])
    expect(s.version).toBe(BATCH_VERSION)
    expect(s).toMatchObject({ total: 3, accepted: 1, rejected: 2 })
    expect(s.acceptedIds).toEqual(['a'])
    expect(s.rejectedIds).toEqual(['b', 'c'])
    expect(s.failureCodes[0]).toEqual({ code: DIAGNOSTIC.TARGET_MISSING, count: 2 })
  })

  it('states that nothing was published', () => {
    expect(summarizeBatch([rec('a', true)]).publication).toMatch(/^none —/)
  })

  it('separates a story that failed from one that was never written', () => {
    // The first real pilot hit this: the provider was unreachable, so two
    // manifests were "rejected" with no diagnostics at all — a report that
    // could not say why. Infrastructure and content are counted apart.
    const unreachable = candidateRecord({
      manifest: { id: 'z' }, candidate: null, validation: null,
      attempts: 0, outcome: ACTION.GIVE_UP, error: 'draft: 404 model does not exist',
    })
    expect(unreachable.error).toBe('draft: 404 model does not exist')
    const s = summarizeBatch([rec('a', true), unreachable])
    expect(s.generationFailures).toBe(1)
    expect(s.generationErrors).toEqual([{ error: 'draft: 404 model does not exist', count: 1 }])
    expect(s.failureCodes).toEqual([])     // nothing was written to judge
  })

  it('groups identical provider errors instead of listing them once each', () => {
    const boom = (id) => candidateRecord({
      manifest: { id }, candidate: null, validation: null,
      attempts: 0, outcome: ACTION.GIVE_UP, error: '429 rate limited',
    })
    const s = summarizeBatch([boom('a'), boom('b')])
    expect(s.generationErrors).toEqual([{ error: '429 rate limited', count: 2 }])
  })

  it('records no error when the model answered and the story was simply wrong', () => {
    const r = rec('b', false, [d(DIAGNOSTIC.TARGET_MISSING, { word: '车' })])
    expect(r.error).toBeNull()
    expect(summarizeBatch([r]).generationFailures).toBe(0)
  })

  it('a record is accepted only when its validation is', () => {
    expect(rec('a', true).accepted).toBe(true)
    expect(rec('b', false, [d(DIAGNOSTIC.LINE_COUNT)]).accepted).toBe(false)
    expect(candidateRecord({ manifest: { id: 'x' }, validation: null, attempts: 1, outcome: ACTION.GIVE_UP }).accepted)
      .toBe(false)
  })
})
