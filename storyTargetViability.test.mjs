import { describe, it, expect } from 'vitest'
import {
  targetViabilityPrompt, parseTargetViability, assessTargetPlacements, effectiveTargets,
  DISPOSITION, VIABILITY_VERSION,
} from './storyTargetViability.mjs'
import { beatPrompt, targetSketchPrompt, beatAnchorsPrompt } from './storyGenPrompts.mjs'
import { validateCandidate } from './storyCandidateValidation.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

const manifest = () => buildManifest({ batchId: 'v', seq: 1, level: 3, targets: ['男人', '女人', '需要'], defaults: { lines: [14, 38] } })

// Plan C's shape, frozen — the placement that cost a3-final-11.
const blueprint = {
  cast: ['李明', '小红'],
  beats: [
    { id: 1, where: 'lobby', what: 'Xiao Hong stands with a large box. She looks tired.', because: 'the story opens' },
    { id: 2, where: 'lobby', what: 'Li Ming walks into the lobby and sees the woman with the box.', because: 'he is coming home' },
    { id: 3, where: 'lobby', what: 'Li Ming asks if she needs help with the box.', because: 'he has seen her struggling' },
  ],
  targetPlan: [
    { word: '女人', beat: 1, speaker: 'narrator', refersTo: 'Xiao Hong', intent: 'Description' },
    { word: '男人', beat: 2, speaker: 'narrator', refersTo: 'Li Ming', intent: 'Description' },
    { word: '需要', beat: 3, speaker: '李明', refersTo: 'the act of helping', intent: 'Offering help' },
  ],
}

describe('the prompt asks about discourse, not about any story', () => {
  const p = targetViabilityPrompt({ manifest: manifest(), blueprint, levelName: 'HSK 3' })

  it('states the general failure criteria', () => {
    expect(p).toContain('already obvious')
    expect(p).toContain('purely so the word can appear')
    expect(p).toContain('would simply be cut if the word were not required')
    expect(p).toContain('invent a contrast')
    expect(p).toContain('"Description"')
  })

  it('names no word, character or story of its own', () => {
    // Everything concrete in the prompt comes from the plan it was given.
    const scaffolding = p.split('THE STORY, beat by beat:')[0]
    for (const s of ['男人', '女人', '李明', '小红', 'gender', 'Li Ming']) expect(scaffolding).not.toContain(s)
  })

  it('asks for one independent verdict per placement', () => {
    expect(p).toContain('one verdict each, independently')
    expect(p).toContain('Do not let a good placement excuse a bad one')
    expect(p).toContain('男人 — beat 2')
  })
})

describe('parsing the verdicts', () => {
  const out = [
    '女人: PASS | Xiao Hong | introduces an unnamed person the reader has not met | The reader meets her here, so naming her as a woman carries real information.',
    '男人: FAIL | Li Ming | none — restates a known fact | The reader already knows who he is; the only sentence available would exist to hold the word.',
    '需要: PASS | asking whether help is wanted | the offer that starts the exchange | It is the question the beat turns on.',
  ].join('\n')

  it('reads verdict, referent, function and reason', () => {
    const v = parseTargetViability(out, ['女人', '男人', '需要'])
    expect(v).toHaveLength(3)
    expect(v[1]).toMatchObject({ word: '男人', verdict: 'FAIL', referent: 'Li Ming' })
    expect(v[1].reason).toContain('exist to hold the word')
    expect(v[0].function).toContain('unnamed person')
  })

  it('survives bullets, numbering and bold', () => {
    const messy = '1. **女人**: PASS | x | y | z\n- 男人 ： FAIL | a | b | c'
    const v = parseTargetViability(messy, ['女人', '男人'])
    expect(v.map(x => x.verdict)).toEqual(['PASS', 'FAIL'])
  })

  it('returns null when nothing usable came back', () => {
    expect(parseTargetViability('I think the plan is fine overall.', ['女人'])).toBeNull()
    expect(parseTargetViability('', ['女人'])).toBeNull()
  })
})

describe('the gate — one fatal placement is fatal', () => {
  const verdicts = [
    { word: '女人', verdict: 'PASS', referent: 'Xiao Hong', function: 'introduces her', reason: 'ok' },
    { word: '男人', verdict: 'FAIL', referent: 'Li Ming', function: 'none', reason: 'restates a known fact' },
    { word: '需要', verdict: 'PASS', referent: 'the offer', function: 'the question', reason: 'ok' },
  ]

  it('fails the plan even when everything else passes', () => {
    const r = assessTargetPlacements(verdicts, { blueprint, required: ['男人', '女人', '需要'] })
    expect(r.ok).toBe(false)
    expect(r.failures.map(f => f.word)).toEqual(['男人'])
    expect(r.rows).toHaveLength(3)
    expect(r.rows.find(x => x.word === '男人').beat).toBe(2)
  })

  it('passes only when every required placement passes', () => {
    const allGood = verdicts.map(v => ({ ...v, verdict: 'PASS' }))
    expect(assessTargetPlacements(allGood, { blueprint, required: ['男人', '女人', '需要'] }).ok).toBe(true)
  })

  it('an unanswered placement is not a pass', () => {
    const missing = verdicts.filter(v => v.word !== '男人')
    const r = assessTargetPlacements(missing, { blueprint, required: ['男人', '女人', '需要'] })
    expect(r.ok).toBe(false)
    expect(r.failures[0]).toMatchObject({ word: '男人', verdict: 'UNJUDGED' })
  })

  it('ignores a failure on a placement this manifest does not require', () => {
    const r = assessTargetPlacements(verdicts, { blueprint, required: ['女人', '需要'] })
    expect(r.ok).toBe(true)
    expect(r.rows.find(x => x.word === '男人').verdict).toBe('FAIL')
    expect(VIABILITY_VERSION).toBe('fab9-target-viability@1')
  })
})

// ── Plan H: an optional placement the gate refused ──────────────────────────
describe('effective targets — a failed optional never reaches the writer', () => {
  // H's shape, with 必须 optional and judged unwritable.
  const hPlan = {
    cast: ['李明', '小红', '妈妈'],
    beats: [
      { id: 1, where: 'kitchen', what: 'Li Ming sees the flat tire and realizes he needs help', targets: ['需要', '帮助'], lines: 6 },
      { id: 3, where: 'hallway', what: 'they go downstairs to find a tool box', targets: ['必须', '需要'], lines: 6 },
      { id: 5, where: 'kitchen', what: 'they fix the bike together', targets: ['关系'], lines: 6 },
    ],
    targetPlan: [
      { word: '需要', beat: 1, speaker: '李明', refersTo: 'help', intent: 'ask for help' },
      { word: '帮助', beat: 1, speaker: '李明', refersTo: 'the repair', intent: 'ask for help' },
      { word: '必须', beat: 3, speaker: '李明', refersTo: 'a tool', intent: 'state necessity' },
      { word: '关系', beat: 5, speaker: '小红', refersTo: 'their friendship', intent: 'close the story' },
    ],
  }
  const REQUIRED = ['需要', '帮助', '关系']
  const verdicts = [
    { word: '需要', verdict: 'PASS', referent: 'help', function: 'the problem', reason: 'ok' },
    { word: '帮助', verdict: 'PASS', referent: 'the repair', function: 'the request', reason: 'ok' },
    { word: '必须', verdict: 'FAIL', referent: 'a tool', function: 'forced emphasis', reason: 'the reader already knows they need tools' },
    { word: '关系', verdict: 'PASS', referent: 'their friendship', function: 'the ending', reason: 'ok' },
  ]
  const hManifest = buildManifest({
    batchId: 'h', seq: 1, level: 3,
    targets: ['需要', '帮助', '关系', '必须'],
    defaults: { lines: [14, 38] },
  })
  const assessed = () => assessTargetPlacements(verdicts, { blueprint: hPlan, required: REQUIRED })
  const derive = () => effectiveTargets(hPlan, assessed(), { manifest: hManifest, required: REQUIRED })

  it('an optional FAIL does not make the candidate ineligible', () => {
    expect(assessed().ok).toBe(true)
  })

  it('a required FAIL still does', () => {
    const bad = verdicts.map(v => (v.word === '关系' ? { ...v, verdict: 'FAIL' } : v))
    expect(assessTargetPlacements(bad, { blueprint: hPlan, required: REQUIRED }).ok).toBe(false)
  })

  it('the failed optional is gone from beat.targets and the target plan', () => {
    const { blueprint } = derive()
    expect(blueprint.beats[1].targets).toEqual(['需要'])
    expect(blueprint.targetPlan.map(t => t.word)).toEqual(['需要', '帮助', '关系'])
    for (const b of blueprint.beats) expect(b.targets).not.toContain('必须')
  })

  it('and is nowhere in the scaffold prompts', () => {
    const { blueprint } = derive()
    const beat = blueprint.beats[1]
    const sketches = blueprint.targetPlan.filter(t => Number(t.beat) === 3)
    const anchors = beatAnchorsPrompt({ manifest: hManifest, beat, sketches, pool: null, candidates: [] })
    expect(anchors).not.toContain('必须')
    for (const s of sketches) {
      expect(targetSketchPrompt({ manifest: hManifest, word: s.word, meaning: null, beat, entry: s })).not.toContain('必须')
    }
  })

  it('and nowhere in the beat-realization prompt', () => {
    const { blueprint } = derive()
    const beat = blueprint.beats[1]
    const p = beatPrompt({
      manifest: hManifest, blueprint, beat, alloc: { lines: 6 }, cast: blueprint.cast,
      sketches: blueprint.targetPlan.filter(t => Number(t.beat) === 3),
    })
    expect(p).not.toContain('必须')
    // and the beat still carries its surviving target
    expect(beat.targets).toEqual(['需要'])
  })

  it('target-presence validation stops requiring it', () => {
    const { manifest } = derive()
    expect(manifest.targets.map(t => t.word)).not.toContain('必须')
    // A finished story with no 必须 in it passes on that word.
    const story = { title: '修车', content: Array.from({ length: 6 }, () => '李明需要帮助，小红来帮助他，他们的关系很好。').join('\n') }
    const vocabMap = { 李明: { level: 1 }, 需要: { level: 3 }, 帮助: { level: 3 }, 小红: { level: 1 }, 来: { level: 1 }, 他: { level: 1 }, 他们: { level: 1 }, 的: { level: 1 }, 关系: { level: 3 }, 很: { level: 1 }, 好: { level: 1 }, 修车: { level: 3 } }
    const codes = validateCandidate(story, { manifest, vocabMap, corpus: [] }).failures.map(f => f.code + ':' + f.message)
    expect(codes.join(' ')).not.toContain('必须')
  })

  it('the frozen plan is untouched', () => {
    const before = JSON.stringify(hPlan)
    const { blueprint } = derive()
    expect(JSON.stringify(hPlan)).toBe(before)
    expect(hPlan.beats[1].targets).toEqual(['必须', '需要'])
    expect(blueprint).not.toBe(hPlan)
  })

  it('records why each placement did or did not survive', () => {
    const { dispositions, dropped } = derive()
    expect(dropped).toEqual(['必须'])
    expect(dispositions.find(d => d.word === '必须')).toMatchObject({
      disposition: DISPOSITION.optionalDropped, verdict: 'FAIL', beat: 3, required: false,
    })
    expect(dispositions.find(d => d.word === '需要').disposition).toBe(DISPOSITION.requiredKept)
  })

  it('keeps an optional placement that passed', () => {
    const allPass = verdicts.map(v => ({ ...v, verdict: 'PASS' }))
    const r = effectiveTargets(hPlan, assessTargetPlacements(allPass, { blueprint: hPlan, required: REQUIRED }), { manifest: hManifest, required: REQUIRED })
    expect(r.dropped).toEqual([])
    expect(r.dispositions.find(d => d.word === '必须').disposition).toBe(DISPOSITION.optionalKept)
    expect(r.blueprint.beats[1].targets).toEqual(['必须', '需要'])
  })
})
