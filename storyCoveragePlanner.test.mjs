import { describe, it, expect } from 'vitest'
import {
  buildCoveragePlan,
  pendingTargets,
  selectTargets,
  recordAcceptedCandidate,
  planSummary,
} from './storyCoveragePlanner.mjs'

// Rows shaped like buildCoverageReport's `words` output (FAB-5), in frequency
// order — the planner's tie-break inside each priority band.
const WORDS = [
  { word: '护照', level: 3, classification: 'zero', availableByLevel: { stories: 0 } },
  { word: '邻居', level: 3, classification: 'single', availableByLevel: { stories: 1 } },
  { word: '公园', level: 3, classification: 'well', availableByLevel: { stories: 7 } },
  { word: '铅笔', level: 3, classification: 'zero', availableByLevel: { stories: 0 } },
  { word: '你好', level: 1, classification: 'zero', availableByLevel: { stories: 0 } },
  { word: '锻炼', level: 3, classification: 'weak', availableByLevel: { stories: 3 } },
]

describe('buildCoveragePlan', () => {
  it('keeps only the requested level, below goal', () => {
    const plan = buildCoveragePlan({ words: WORDS, level: 3, goal: 2 })
    const words = plan.targets.map(t => t.word)
    expect(words).not.toContain('你好')    // wrong level
    expect(words).not.toContain('公园')    // well covered
    expect(words).not.toContain('锻炼')    // weak (3) already >= goal (2)
    expect(words).toContain('护照')
    expect(words).toContain('邻居')
  })

  it('orders zero-exposure words first, frequency order within a band', () => {
    const plan = buildCoveragePlan({ words: WORDS, level: 3, goal: 2 })
    expect(plan.targets.map(t => t.word)).toEqual(['护照', '铅笔', '邻居'])
  })

  it('a higher goal pulls weak words back in', () => {
    const plan = buildCoveragePlan({ words: WORDS, level: 3, goal: 5 })
    expect(plan.targets.map(t => t.word)).toContain('锻炼')
  })
})

describe('selectTargets', () => {
  it('takes in priority order and spends a batch use', () => {
    const plan = buildCoveragePlan({ words: WORDS, level: 3, goal: 2, batchCap: 1 })
    const { plan: p2, selected } = selectTargets(plan, 2)
    expect(selected).toEqual(['护照', '铅笔'])
    // batchCap 1: both are now unschedulable, next selection moves on
    const { selected: next } = selectTargets(p2, 2)
    expect(next).toEqual(['邻居'])
  })

  it('does not mutate the input plan', () => {
    const plan = buildCoveragePlan({ words: WORDS, level: 3 })
    selectTargets(plan, 2)
    expect(plan.targets.every(t => t.batchUses === 0)).toBe(true)
  })
})

describe('recordAcceptedCandidate', () => {
  it('projects exposure for plan words present with enough occurrences', () => {
    const plan = buildCoveragePlan({ words: WORDS, level: 3, goal: 2 })
    const counts = new Map([['护照', 3], ['邻居', 1], ['公园', 4]])
    const p2 = recordAcceptedCandidate(plan, { counts, minOccurrences: 2 })
    const get = (p, w) => p.targets.find(t => t.word === w)
    expect(get(p2, '护照').planned).toBe(1)     // 3 occurrences >= 2
    expect(get(p2, '邻居').planned).toBe(1)     // started at 1, only 1 occurrence: unchanged
    expect(get(plan, '护照').planned).toBe(0)   // input untouched
  })

  it('a satisfied word stops being pending, so the batch retargets', () => {
    let plan = buildCoveragePlan({ words: WORDS, level: 3, goal: 1 })
    expect(pendingTargets(plan).map(t => t.word)).toEqual(['护照', '铅笔'])
    plan = recordAcceptedCandidate(plan, { counts: new Map([['护照', 2]]), minOccurrences: 2 })
    expect(pendingTargets(plan).map(t => t.word)).toEqual(['铅笔'])
  })

  it('accepts plain-object counts as well as Maps', () => {
    const plan = buildCoveragePlan({ words: WORDS, level: 3, goal: 2 })
    const p2 = recordAcceptedCandidate(plan, { counts: { 护照: 2 }, minOccurrences: 2 })
    expect(p2.targets.find(t => t.word === '护照').planned).toBe(1)
  })
})

describe('planSummary', () => {
  it('splits targets into satisfied / pending / capped', () => {
    let plan = buildCoveragePlan({ words: WORDS, level: 3, goal: 1, batchCap: 1 })
    plan = selectTargets(plan, 1).plan                                    // 护照 capped
    plan = recordAcceptedCandidate(plan, { counts: { 铅笔: 2 }, minOccurrences: 2 })  // 铅笔 satisfied
    const s = planSummary(plan)
    expect(s.totalTargets).toBe(2)
    expect(s.satisfied).toBe(1)
    expect(s.cappedThisBatch).toBe(1)
    expect(s.pending).toBe(0)
  })
})
