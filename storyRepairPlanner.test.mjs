import { describe, it, expect } from 'vitest'
import {
  planRepair,
  validateReplacementLine,
  executeRepairPlan,
  lineFacts,
  shareCeilingOf,
  anonymise,
  acceptableLine,
  LINE_QUALITY,
  REPAIR_PLANNER_VERSION,
} from './storyRepairPlanner.mjs'
import {
  lineRewritePrompt,
  parseSingleLine,
  hostRankPrompt,
  parseHostRanking,
  lineJudgePrompt,
  parseLineJudgment,
} from './storyGenPrompts.mjs'
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

  it('offers a CANDIDATE SET for each missing target — the choice among them is semantic, not the planner\'s', () => {
    const { plan } = planFor()
    const host = plan.targetHosts.find(h => h.word === '铅笔')
    expect(host).toBeTruthy()
    expect(host.candidates.length).toBeGreaterThan(1)
    expect(host.candidates.length).toBeLessThanOrEqual(5)
    expect(host.deterministicPick).toBe(host.candidates[0].line)
    // every candidate is mechanically able to host it
    for (const c of host.candidates) {
      expect(c.line).not.toBe(1)
      expect(c.line).not.toBe(LINES.length)
      expect(plan.deletes.map(d => d.line)).not.toContain(c.line)
      expect(LINES[c.line - 1]).not.toContain('铅笔')
    }
    expect(plan.projected.ops).toBeGreaterThanOrEqual(plan.deletes.length + plan.replaces.length)
    expect(plan.projected.lines).toBe(LINES.length - plan.deletes.length)
    // deleting only above-average lines cannot raise the share
    expect(plan.projected.share).toBeLessThanOrEqual(plan.metrics.share)
    expect(plan.feasible).toBe(true)
  })

  it('returns deterministic IMPOSSIBLE — with the arithmetic — when the plan will not fit the budget', () => {
    const { plan } = planFor({}, 2)
    expect(plan.feasible).toBe(false)
    expect(plan.impossible).toContain('budget of 2')
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
    expect(r.unresolved).toEqual([{ line: 5, reasons: task.reasons, code: 'LINE_REPAIR_FAILED', detail: 'no candidate passed the deterministic gate' }])
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

// ── The two semantic decision points (fab9-repair-plan@2) ────────────────────
// repair-1 was deterministically clean and read badly: the host line for 结束
// was picked by above-level-character count, and the adopted replacement was
// the first mechanically valid one. Both choices are semantic; both are now
// asked as CLOSED questions, and neither can overrule the deterministic gate.
describe('semantic host selection', () => {
  const m = manifest()
  const plan = {
    deletes: [{ line: 8 }],
    replaces: [],
    budget: 6,
    targetHosts: [{
      word: '铅笔',
      candidates: [
        { line: 3, text: '李明去问邻居。', speaker: null, cjkChars: 6, outChars: 0, free: false },
        { line: 6, text: '他们打算明天买东西。', speaker: null, cjkChars: 9, outChars: 0, free: false },
        { line: 7, text: '邻居给他们看地图。', speaker: null, cjkChars: 8, outChars: 0, free: false },
      ],
      deterministicPick: 3,
    }],
  }
  const gen = (name, replies) => { const seen = []; return { name, seen, send: async ({ prompt }) => { seen.push(prompt); return replies.shift() } } }
  const run = (over) => executeRepairPlan({
    plan, manifest: m, vocabMap,
    buildPrompt: lineRewritePrompt, parseLine: parseSingleLine,
    buildHostPrompt: hostRankPrompt, parseHostRanking,
    ...over,
  })

  it('the ranker reorders the planner\'s candidates and the winner becomes the host', async () => {
    const ranker = gen('Q', ['LINE 6 — buying things is where a pencil belongs\nLINE 7 — possible\nLINE 3 — unrelated'])
    const writer = gen('W', ['他们打算明天买铅笔。'])
    const r = await run({ hostRanker: ranker, generators: [writer], candidatesPerGenerator: 1, attemptsPerGenerator: 1 })
    expect(r.hostSelections[0].chosen).toBe(6)                  // NOT the deterministic pick (3)
    expect(r.hostSelections[0].source).toContain('semantic ranking by Q')
    expect(r.hostSelections[0].ranking[0].reason).toContain('pencil')
    expect(r.ops.find(o => o.op === 'replace').line).toBe(6)
    // the ranker was given a closed question: candidates only, no writing
    expect(ranker.seen[0]).toContain('LINE 3')
    expect(ranker.seen[0]).toContain('Do not propose a new line')
  })

  it('a line the planner never offered cannot be chosen, and a broken answer falls back', async () => {
    const rogue = gen('Q', ['LINE 99 — a line I invented\nLINE 7 — second choice'])
    const writer = gen('W', ['邻居给他们看铅笔。'])
    const r = await run({ hostRanker: rogue, generators: [writer], candidatesPerGenerator: 1, attemptsPerGenerator: 1 })
    expect(r.hostSelections[0].chosen).toBe(7)                  // 99 dropped, 7 survives

    const junk = gen('Q', ['I think none of them work, sorry.'])
    const w2 = gen('W', ['李明去问邻居要铅笔。'])
    const back = await run({ hostRanker: junk, generators: [w2], candidatesPerGenerator: 1, attemptsPerGenerator: 1 })
    expect(back.hostSelections[0].chosen).toBe(3)               // deterministic pick
    expect(back.hostSelections[0].source).toContain('unusable')
  })

  it('two targets never land on the same line, and the budget survives the ranking', async () => {
    const twoTargets = {
      deletes: [{ line: 8 }],
      replaces: [],
      budget: 6,
      targetHosts: [
        { word: '铅笔', candidates: plan.targetHosts[0].candidates, deterministicPick: 3 },
        { word: '地图', candidates: plan.targetHosts[0].candidates, deterministicPick: 3 },
      ],
    }
    const ranker = gen('Q', ['LINE 6 — best\nLINE 3 — ok\nLINE 7 — ok', 'LINE 6 — taken\nLINE 7 — free\nLINE 3 — ok'])
    const writer = gen('W', ['他们打算明天买铅笔。', '邻居给他们看地图。'])
    const r = await executeRepairPlan({
      plan: twoTargets, manifest: m, vocabMap,
      buildPrompt: lineRewritePrompt, parseLine: parseSingleLine,
      buildHostPrompt: hostRankPrompt, parseHostRanking,
      hostRanker: ranker, generators: [writer], candidatesPerGenerator: 1, attemptsPerGenerator: 1,
    })
    const chosen = r.hostSelections.map(h => h.chosen)
    expect(new Set(chosen).size).toBe(2)                       // 6 for the first, 7 for the second
    expect(chosen[0]).toBe(6)
    expect(r.hostSelections[1].candidates.map(c => c.line)).not.toContain(6)
  })

  it('a ranker that throws never blocks the repair', async () => {
    const boom = { name: 'Q', send: async () => { throw new Error('HTTP 500') } }
    const writer = gen('W', ['李明去问邻居要铅笔。'])
    const r = await run({ hostRanker: boom, generators: [writer], candidatesPerGenerator: 1, attemptsPerGenerator: 1 })
    expect(r.hostSelections[0].chosen).toBe(3)
    expect(r.hostSelections[0].source).toContain('ranker failed')
  })
})

describe('contextual naturalness ranking', () => {
  const m = manifest()
  const task = { line: 5, text: '小红也想一起去看墨镜。', speaker: null, cjkChars: 10, addTargets: ['铅笔'], removeTargets: [], removeRuns: ['墨镜'], reasons: ['add target 铅笔'] }
  const plan = { deletes: [], replaces: [task], targetHosts: [], budget: 6 }
  const gen = (name, replies) => { const seen = []; return { name, seen, send: async ({ prompt }) => { seen.push(prompt); return replies.shift() } } }
  const run = (over) => executeRepairPlan({
    plan, manifest: m, vocabMap,
    buildPrompt: lineRewritePrompt, parseLine: parseSingleLine,
    buildJudgePrompt: lineJudgePrompt, parseLineJudgment,
    candidatesPerGenerator: 2,
    contextFor: () => ({ before: ['4: 邻居说，护照要放好。'], after: ['6: 他们打算明天买东西。'] }),
    ...over,
  })

  it('judges every gate survivor in context, anonymised, and adopts the best', async () => {
    const a = gen('A-model', ['小红也想一起去买铅笔。', '小红也想去商店买铅笔。'])
    const b = gen('B-model', ['小红也想一起去买铅笔和东西。', '小红买铅笔。'])   // second is too short → gate rejects
    const judge = gen('J', ['A: GRAMMAR 8 CONTINUITY 8 ROLE 8 INTEGRATION 8 VOICE 7 MECHANICAL no OVERALL 8 — natural\nB: GRAMMAR 6 CONTINUITY 6 ROLE 6 INTEGRATION 5 VOICE 6 MECHANICAL no OVERALL 6 — flat\nC: GRAMMAR 5 CONTINUITY 4 ROLE 5 INTEGRATION 4 VOICE 5 MECHANICAL yes OVERALL 4 — wedged'])
    const r = await run({ generators: [a, b], judge })
    const j = r.judgments[0]
    expect(j.candidates.length).toBe(3)                       // one of B's four was gate-rejected
    expect(j.candidates.map(c => c.label)).toEqual(['A', 'B', 'C'])
    // the judge never learns who wrote what
    expect(judge.seen[0]).not.toContain('A-model')
    expect(judge.seen[0]).not.toContain('B-model')
    expect(judge.seen[0]).toContain('邻居说，护照要放好。')     // context, not an isolated sentence
    expect(judge.seen[0]).toContain('THE LINE BEING REPLACED')
    const winner = j.candidates.find(c => c.score.overall === 8)
    expect(r.ops.find(o => o.op === 'replace').text).toBe(winner.text)
    expect(r.unresolved).toEqual([])
  })

  it('LINE_REPAIR_FAILED when nothing clears the threshold — no bad Chinese is inserted', async () => {
    const a = gen('A-model', ['小红也想一起去买铅笔。', '小红也想去商店买铅笔。'])
    const judge = gen('J', ['A: GRAMMAR 4 CONTINUITY 4 ROLE 4 INTEGRATION 3 VOICE 4 MECHANICAL yes OVERALL 4 — clumsy\nB: GRAMMAR 5 CONTINUITY 5 ROLE 5 INTEGRATION 4 VOICE 5 MECHANICAL no OVERALL 5 — flat'])
    const r = await run({ generators: [a], judge })
    expect(r.ops.find(o => o.op === 'replace')).toBeUndefined()
    expect(r.unresolved[0].code).toBe('LINE_REPAIR_FAILED')
    expect(r.unresolved[0].detail).toContain('threshold')
  })

  it('a mechanically-constructed line is refused even with a high overall score', () => {
    expect(acceptableLine({ overall: 9, grammar: 9, mechanical: true })).toBe(false)
    expect(acceptableLine({ overall: 9, grammar: 5, mechanical: false })).toBe(false)
    expect(acceptableLine({ overall: 5, grammar: 9, mechanical: false })).toBe(false)
    expect(acceptableLine({ overall: 6, grammar: 6, mechanical: false })).toBe(true)
    expect(acceptableLine(null)).toBe(false)
    expect(LINE_QUALITY.overall).toBe(6)
  })

  it('the judge can never rescue a line the deterministic gate rejected', async () => {
    const a = gen('A-model', ['小红也想一起去森林买铅笔。', '小红也想一起去森林买铅笔。'])   // above-level 森林
    const judge = gen('J', ['A: GRAMMAR 10 CONTINUITY 10 ROLE 10 INTEGRATION 10 VOICE 10 MECHANICAL no OVERALL 10 — perfect'])
    const r = await run({ generators: [a], judge })
    expect(r.ops.length).toBe(0)
    expect(r.unresolved[0].detail).toContain('deterministic gate')
    expect(judge.seen.length).toBe(0)                          // nothing to judge
  })

  it('anonymise is deterministic and source-independent', () => {
    const one = anonymise([{ generator: 'x', text: '第一句。' }, { generator: 'y', text: '第二句。' }])
    const two = anonymise([{ generator: 'y', text: '第二句。' }, { generator: 'x', text: '第一句。' }])
    expect(one.map(c => c.label + c.text)).toEqual(two.map(c => c.label + c.text))
  })
})

