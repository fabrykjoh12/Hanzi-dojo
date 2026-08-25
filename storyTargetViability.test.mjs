import { describe, it, expect } from 'vitest'
import {
  targetViabilityPrompt, parseTargetViability, assessTargetPlacements, VIABILITY_VERSION,
} from './storyTargetViability.mjs'
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
