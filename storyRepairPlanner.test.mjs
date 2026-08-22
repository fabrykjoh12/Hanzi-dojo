import { describe, it, expect } from 'vitest'
import {
  planRepair,
  validateReplacementLine,
  executeRepairPlan,
  lineFacts,
  shareCeilingOf,
  REPAIR_PLANNER_VERSION,
} from './storyRepairPlanner.mjs'
import { lineRewritePrompt, parseSingleLine } from './storyGenPrompts.mjs'
import { validateCandidate } from './storyCandidateValidation.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

const POOL = [
  ['我', 1], ['你', 1], ['他', 1], ['是', 1], ['的', 1], ['了', 1], ['去', 1], ['有', 1],
  ['看', 1], ['说', 1], ['想', 1], ['要', 1], ['买', 1], ['好', 1], ['大', 1], ['小', 1],
  ['家', 1], ['妈妈', 1], ['朋友', 1], ['今天', 1], ['明天', 1], ['商店', 1], ['东西', 1],
  ['高兴', 1], ['一起', 1], ['现在', 1], ['天气', 1], ['冷', 1], ['到', 1], ['给', 1],
  ['问', 1], ['找', 1], ['请', 1], ['谢谢', 1], ['时间', 1], ['没有', 1], ['坐', 1],
  ['吃', 1], ['饭', 1], ['很', 1], ['也', 1], ['和', 1], ['都', 1], ['什么', 1],
  ['这', 1], ['那', 1], ['个', 1], ['在', 1], ['上', 1], ['下', 1], ['里', 1], ['来', 1],
  ['我们', 1], ['他们', 1], ['大家', 1], ['哪里', 1],
  ['放', 3], ['地图', 3], ['护照', 3], ['邻居', 3], ['打算', 3], ['铅笔', 3],
  ['旅行', 4], ['签证', 4], ['森林', 4], ['警察', 4],
]
const vocabMap = Object.fromEntries(POOL.map(([word, level]) => [word, { word, level }]))

// 10 lines against a ceiling of 8 (two must go), three unknown runs against a
// cap of two, and a target that is entirely missing.
const LINES = [
  '李明打算和妈妈去旅行。',
  '妈妈：我们的护照在哪里？',
  '李明去问邻居。',
  '邻居说，护照要放好。',
  '小红也想一起去看墨镜。',
  '他们打算明天买东西。',
  '邻居给他们看地图。',
  '桌上有咖喱和乌龟。',
  '森林里有警察。',
  '大家都很高兴。',
]
const story = { title: '去旅行', content: LINES.join('\n') }

const manifest = (over = {}) => buildManifest({
  batchId: 'rep', seq: 1, level: 3,
  targets: ['护照', '邻居', '打算', { word: '铅笔', min: 1, max: 2 }],
  defaults: { lines: [6, 8] },
  ...over,
})

const planFor = (over = {}, budget = 6) => {
  const m = manifest(over)
  const validation = validateCandidate(story, { manifest: m, vocabMap })
  return { manifest: m, validation, plan: planRepair({ candidate: story, validation, manifest: m, vocabMap, budget }) }
}

describe('planRepair — the plan is code, not a model', () => {
  it('reads the work off the validator: line reduction, missing targets, unknown runs', () => {
    const { plan } = planFor()
    expect(plan.plannerVersion).toBe(REPAIR_PLANNER_VERSION)
    expect(plan.required.lineReduction).toBe(2)
    expect(plan.required.missingTargets.map(t => t.word)).toEqual(['铅笔'])
    // the canonical engine's own segmentation decides what "a run" is —
    // 咖喱 is not one token to it, and 桌上 is a run of its own
    expect(plan.required.unknownDistinct).toBe(5)
    expect(plan.required.unknownExcess).toBe(3)
    expect(Object.keys(plan.required.unknownRuns).sort()).toEqual(['乌龟', '咖', '喱', '墨镜', '桌上'])
  })

  it('deletes the heaviest redundant lines — the unknown-run line first, never the opening or closing line', () => {
    const { plan } = planFor()
    const at = plan.deletes.map(d => d.line)
    expect(at.length).toBe(2)
    expect(at).toContain(8)                                 // 咖喱 + 乌龟 die with it
    expect(at).not.toContain(1)
    expect(at).not.toContain(LINES.length)
    expect(plan.deletes.find(d => d.line === 8).removesRuns.sort()).toEqual(['乌龟', '咖', '喱', '桌上'])
    // a deletion earns its place either by difficulty or by the unknown
    // vocabulary it takes with it — never by being the easiest line around,
    // which is what raises the share of everything left
    for (const d of plan.deletes) {
      expect(d.density >= plan.metrics.averageDensity || d.removesRuns.length > 0).toBe(true)
      expect(d.reason).toMatch(/density|unknown/)
    }
    expect(plan.deletes.find(d => d.line === 9).density).toBeGreaterThan(plan.metrics.averageDensity)
  })

  it('never deletes a line carrying a required target occurrence, or a speaker\'s last line', () => {
    const { plan } = planFor()
    // 护照 needs 2 and appears exactly twice (lines 2, 4); 邻居 three times
    expect(plan.deletes.map(d => d.line)).not.toContain(2)
    expect(plan.deletes.map(d => d.line)).not.toContain(4)
    // 妈妈 speaks once, on line 2 — protected above; no speaker disappears
    const speakersLeft = new Set(LINES.filter((_, i) => !plan.deletes.some(d => d.line === i + 1))
      .map(l => (l.includes('：') ? l.split('：')[0] : null)).filter(Boolean))
    expect(speakersLeft.has('妈妈')).toBe(true)
  })

  it('assigns a replacement line to each missing target and projects the deletions exactly', () => {
    const { plan } = planFor()
    const hosts = plan.replaces.filter(t => t.addTargets.includes('铅笔'))
    expect(hosts.length).toBe(1)
    expect(hosts[0].line).not.toBe(1)
    expect(plan.deletes.map(d => d.line)).not.toContain(hosts[0].line)
    expect(plan.projected.ops).toBe(plan.deletes.length + plan.replaces.length)
    expect(plan.projected.lines).toBe(LINES.length - plan.deletes.length)
    // deleting only above-average lines cannot raise the share
    expect(plan.projected.share).toBeLessThanOrEqual(plan.metrics.share)
    expect(plan.feasible).toBe(true)
  })

  it('returns deterministic IMPOSSIBLE — with the arithmetic — when the plan will not fit the budget', () => {
    const { plan } = planFor({}, 2)
    expect(plan.feasible).toBe(false)
    expect(plan.impossible).toContain('budget is 2')
  })

  it('is deterministic: the same story plans identically every time', () => {
    expect(JSON.stringify(planFor().plan)).toBe(JSON.stringify(planFor().plan))
  })

  it('lineFacts sums to the whole-story metrics, and the ceiling honours the review band', () => {
    const m = manifest()
    const facts = lineFacts(story.content, { level: 3, vocabMap })
    const v = validateCandidate(story, { manifest: m, vocabMap })
    expect(facts.reduce((n, f) => n + f.cjkChars, 0)).toBe(v.metrics.cjkChars)
    expect(shareCeilingOf(m)).toBe(0.105)                   // HSK 3 pilot band ceiling
    expect(shareCeilingOf({ difficulty: { maxOutOfLevelCharShare: 0.02 } })).toBe(0.02)
  })
})

describe('validateReplacementLine — the per-line gate, before anything is applied', () => {
  const m = manifest()
  const task = { line: 5, text: '小红也想一起去看墨镜。', speaker: null, cjkChars: 10, addTargets: ['铅笔'], removeTargets: [], removeRuns: ['墨镜'] }
  const check = (replacement, over = {}) => validateReplacementLine({ original: task.text, replacement, task: { ...task, ...over }, manifest: m, vocabMap })

  it('accepts a line that meets the whole contract', () => {
    const r = check('小红也想一起去买铅笔。')
    expect(r.ok).toBe(true)
    expect(r.metrics.unknownRuns).toEqual([])
  })

  it('rejects a missing required target, a kept unknown run and a brand-new unknown run', () => {
    expect(check('小红也想一起去买东西。').failures.map(f => f.code)).toContain('target_missing')
    expect(check('小红也想一起去买铅笔和墨镜。').failures.map(f => f.code)).toContain('unknown_run_kept')
    expect(check('小红也想一起去买铅笔和乌龟。').failures.map(f => f.code)).toContain('unknown_run_added')
  })

  it('rejects newly introduced above-level vocabulary — the patch-test-2 failure mode', () => {
    const r = check('小红也想一起去森林买铅笔。')
    expect(r.ok).toBe(false)
    expect(r.failures.map(f => f.code)).toContain('above_level_added')
    expect(r.failures.find(f => f.code === 'above_level_added').message).toContain('森林')
    // an above-level word the ORIGINAL line already had is not "introduced"
    const keep = validateReplacementLine({
      original: '李明打算和妈妈去旅行。', replacement: '李明打算和妈妈一起去旅行。',
      task: { addTargets: [], removeTargets: [], removeRuns: [], speaker: null }, manifest: m, vocabMap,
    })
    expect(keep.ok).toBe(true)
  })

  it('holds the speaker contract in both directions', () => {
    const dialogue = { ...task, text: '妈妈：我们的护照在哪里？', speaker: '妈妈', addTargets: [], removeRuns: [] }
    const asNarration = validateReplacementLine({ original: dialogue.text, replacement: '妈妈问护照在哪里。', task: dialogue, manifest: m, vocabMap })
    expect(asNarration.failures.map(f => f.code)).toContain('speaker_changed')
    const narration = { ...task, addTargets: [], removeRuns: [] }
    expect(check('李明：我也想去买东西。', { addTargets: [], removeRuns: [] }).failures.map(f => f.code)).toContain('speaker_added')
    expect(validateReplacementLine({ original: narration.text, replacement: '王老师：你们好。', task: narration, manifest: m, vocabMap })
      .failures.map(f => f.code)).toContain('unknown_speaker')
  })

  it('rejects a line that collapses or balloons, and anything that is not one line', () => {
    expect(check('买铅笔。').failures.map(f => f.code)).toContain('length_out_of_range')
    expect(check('小红也想一起去买铅笔，然后他们去商店买东西，妈妈也来了，大家都很高兴，今天天气很好。').failures.map(f => f.code)).toContain('length_out_of_range')
    expect(check('小红买铅笔。\n第二行。').failures.map(f => f.code)).toContain('multiline')
    expect(check('   ').failures.map(f => f.code)).toContain('empty')
  })
})

describe('executeRepairPlan — one tiny task per line, compliance measured not assumed', () => {
  const m = manifest()
  const task = { line: 5, text: '小红也想一起去看墨镜。', speaker: null, cjkChars: 10, addTargets: ['铅笔'], removeTargets: [], removeRuns: ['墨镜'], reasons: ['remove unknown word 墨镜', 'add target 铅笔'] }
  const plan = { deletes: [{ line: 8 }], replaces: [task] }
  const run = (generators, over = {}) => executeRepairPlan({
    plan, manifest: m, vocabMap, generators,
    buildPrompt: lineRewritePrompt, parseLine: parseSingleLine, ...over,
  })
  const gen = (name, replies) => {
    const seen = []
    return { name, seen, send: async ({ prompt }) => { seen.push(prompt); return replies.shift() } }
  }

  it('adopts a passing line, keeps the deletions, and reports per-generator compliance', async () => {
    const a = gen('A', ['小红也想一起去买铅笔。'])
    const b = gen('B', ['小红也想一起去森林买铅笔。', '小红也想一起去森林买铅笔。'])
    const r = await run([a, b])
    expect(r.ops).toEqual([{ op: 'replace', line: 5, text: '小红也想一起去买铅笔。' }, { op: 'delete', line: 8 }])
    expect(r.unresolved).toEqual([])
    expect(r.compliance.A).toEqual({ attempts: 1, passed: 1, adopted: 1 })
    expect(r.compliance.B).toEqual({ attempts: 2, passed: 0, adopted: 0 })   // both tries rejected
    expect(r.attempts.filter(x => !x.ok).every(x => x.failures.length > 0)).toBe(true)
  })

  it('feeds the exact per-line failure back on the retry', async () => {
    const a = gen('A', ['小红也想一起去森林买铅笔。', '小红也想一起去买铅笔。'])
    const r = await run([a])
    expect(r.attempts.map(x => x.ok)).toEqual([false, true])
    expect(a.seen[1]).toContain('YOUR PREVIOUS LINE WAS REJECTED')
    expect(a.seen[1]).toContain('森林')
    expect(r.ops.find(o => o.op === 'replace').text).toBe('小红也想一起去买铅笔。')
  })

  it('never touches the story when every attempt fails — the line stays unresolved', async () => {
    const a = gen('A', ['小红也想一起去森林买铅笔。', '小红买铅笔。'])
    const r = await run([a])
    expect(r.ops).toEqual([{ op: 'delete', line: 8 }])
    expect(r.unresolved).toEqual([{ line: 5, reasons: task.reasons }])
    expect(r.compliance.A.passed).toBe(0)
  })

  it('a provider error is recorded as a failed attempt, not a crash', async () => {
    const boom = { name: 'X', send: async () => { throw new Error('HTTP 500') } }
    const r = await run([boom])
    expect(r.attempts.every(x => x.failures[0].code === 'provider_error')).toBe(true)
    expect(r.unresolved.length).toBe(1)
  })

  it('the tiny prompt carries the contract and nothing to plan', async () => {
    const a = gen('A', ['小红也想一起去买铅笔。'])
    await run([a], { context: { before: ['4: 邻居说，护照要放好。'], after: ['6: 他们打算明天买东西。'] }, meanings: { 铅笔: 'pencil' } })
    const p = a.seen[0]
    expect(p).toContain('Rewrite LINE 5')
    expect(p).toContain('小红也想一起去看墨镜。')
    expect(p).toContain('MUST contain 铅笔 (pencil)')
    expect(p).toContain('墨镜 must NOT appear')
    expect(p).toContain('It is narration')
    expect(p).toContain('ONLY vocabulary at or below HSK 3')
    expect(p).toContain('exactly ONE line')
    expect(p).not.toContain('DELETE LINE')        // no plan, no budget, no operations
    expect(p).not.toContain('operations total')
  })
})

describe('parseSingleLine', () => {
  it('digs one Chinese line out of a chatty response', () => {
    expect(parseSingleLine('Sure, here it is:\n34: 妈妈：这件事情以前也发生过。')).toBe('妈妈：这件事情以前也发生过。')
    expect(parseSingleLine('「小红买了铅笔。」')).toBe('小红买了铅笔。')
    expect(parseSingleLine('LINE 7: 他们去商店。')).toBe('他们去商店。')
    expect(parseSingleLine('no chinese at all')).toBeNull()
    expect(parseSingleLine('')).toBeNull()
  })
})
