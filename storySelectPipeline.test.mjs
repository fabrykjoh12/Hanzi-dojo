import { describe, it, expect } from 'vitest'
import {
  generateSelectCandidate,
  serializableSelectCandidate,
  compareDrafts,
  draftBreakdown,
  SELECT_GENERATOR_VERSION,
} from './storySelectPipeline.mjs'
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
const pool = POOL.map(([word, level]) => ({ word, level }))

const manifest = () => buildManifest({
  batchId: 'sel', seq: 1, level: 3,
  targets: ['护照', '邻居', '打算'],
  defaults: { lines: [6, 20] },
})

const GOOD_LINES = [
  '李明打算和妈妈去旅行。',
  '妈妈：我们的护照在哪里？',
  '李明去问邻居。',
  '邻居说，护照要放好。',
  '小红也想一起去。',
  '他们打算明天买东西。',
  '邻居给他们看地图。',
  '大家都很高兴。',
]
const GOOD_TEXT = 'TITLE: 去旅行\n' + GOOD_LINES.join('\n')
const NARROW_TEXT = 'TITLE: 去旅行\n' + GOOD_LINES.join('\n')
  .replace('李明打算和妈妈去旅行。', '李明和妈妈去旅行。')
  .replace('他们打算明天买东西。', '他们明天买东西。')
const BROAD_TEXT = NARROW_TEXT + '\n王老师：你们要小心。'
const EN8 = GOOD_LINES.map((_, i) => 'line ' + i).join('\n')
const JUDGE_OK = 'NATURAL: 8\nCOHERENCE: 7\nINTEGRATION: 7\nLEVEL: 8\nHUMAN: 7\nINTEREST: 7\nOVERALL: 7\nSTRENGTHS: warm\nWEAKNESSES: thin\nMECHANICAL: no'

function scripted(responses) {
  const seen = []
  const provider = async ({ kind, prompt }) => {
    seen.push({ kind, prompt })
    const q = responses[kind]
    if (!q || q.length === 0) throw new Error('no scripted response for ' + kind)
    return q.shift()
  }
  provider.seen = seen
  return provider
}

const gen = (opts) => generateSelectCandidate({ sleep: async () => {}, manifest: manifest(), pool, vocabMap, ...opts })

describe('generateSelectCandidate — K independent drafts, deterministic selection', () => {
  it('a PASS among the drafts wins, is NOT repaired, and gets the critique', async () => {
    const writer = scripted({ draft: [BROAD_TEXT, GOOD_TEXT, NARROW_TEXT], critique: [JUDGE_OK] })
    const patcher = scripted({ translate: [EN8] })
    const r = await gen({ writer, patcher, K: 3 })
    expect(r.status).toBe('accepted')
    expect(r.selectedFrom).toBe('draft-2')
    expect(r.ranking[0].draft).toBe('draft-2')
    expect(r.ranking[0].verdict).toBe('PASS')
    expect(patcher.seen.map(s => s.kind)).toEqual(['translate'])   // no micro-repair on a PASS
    expect(r.critique.overall).toBe(7)
    expect(r.generatorVersion).toBe(SELECT_GENERATOR_VERSION)
  })

  it('drafts are independent: the same prompt every time, no draft fed into another', async () => {
    const writer = scripted({ draft: [BROAD_TEXT, GOOD_TEXT, NARROW_TEXT], critique: [JUDGE_OK] })
    const patcher = scripted({ translate: [EN8] })
    await gen({ writer, patcher, K: 3 })
    const draftPrompts = writer.seen.filter(s => s.kind === 'draft').map(s => s.prompt)
    expect(draftPrompts.length).toBe(3)
    expect(new Set(draftPrompts).size).toBe(1)                      // identical prompt
    expect(draftPrompts[0]).not.toContain('王老师')                  // no earlier output leaked in
  })

  it('a narrow winner gets ONE patch-based micro-repair; the patcher never writes a story', async () => {
    const writer = scripted({ draft: [BROAD_TEXT, NARROW_TEXT, BROAD_TEXT], critique: [JUDGE_OK] })
    const patcher = scripted({
      'micro-repair': ['LINE 1: 李明打算和妈妈去旅行。\nLINE 6: 他们打算明天买东西。'],
      translate: [EN8],
    })
    const r = await gen({ writer, patcher, K: 3 })
    expect(r.status).toBe('accepted')
    expect(r.selectedFrom).toBe('micro-repair')
    expect(r.ranking[0].draft).toBe('draft-2')                      // the narrow draft won selection
    expect(patcher.seen.map(s => s.kind)).toEqual(['micro-repair', 'translate'])
    const patchStage = r.stages.find(s => s.stage === 'micro-repair')
    expect(patchStage.patch.length).toBe(2)
    // unpatched lines byte-for-byte identical to the winning draft
    const draftLines = r.stages[1].content.split('\n')
    const finalLines = r.content.split('\n')
    for (let i = 0; i < finalLines.length; i += 1) {
      if (i !== 0 && i !== 5) expect(finalLines[i]).toBe(draftLines[i])
    }
  })

  it('all drafts broadly failing → no repair, no critique, rejected with full ranking', async () => {
    const writer = scripted({ draft: [BROAD_TEXT, BROAD_TEXT, BROAD_TEXT] })
    const patcher = scripted({})
    const r = await gen({ writer, patcher, K: 3 })
    expect(r.status).toBe('rejected')
    expect(patcher.seen.length).toBe(0)
    expect(r.critique).toBeNull()
    expect(r.ranking.length).toBe(3)
    expect(r.stages.filter(s => s.stage.startsWith('draft-')).length).toBe(3)
  })

  it('a dead draft slot is recorded and the others still compete', async () => {
    const writer = scripted({ draft: ['garbage', GOOD_TEXT, 'garbage', 'garbage', 'garbage', 'garbage', 'garbage'], critique: [JUDGE_OK] })
    const patcher = scripted({ translate: [EN8] })
    const r = await gen({ writer, patcher, K: 3 })
    // slot 1 burns its parse retries on garbage; a later slot lands the good text
    expect(r.status).toBe('accepted')
    expect(r.ranking.length).toBeLessThanOrEqual(3)
  })

  it('serializable and JSON-safe with ranking intact', async () => {
    const writer = scripted({ draft: [GOOD_TEXT, GOOD_TEXT, GOOD_TEXT], critique: [JUDGE_OK] })
    const patcher = scripted({ translate: [EN8] })
    const r = await gen({ writer, patcher, K: 3 })
    const s = serializableSelectCandidate(r)
    expect(() => JSON.stringify(s)).not.toThrow()
    expect(s.ranking.length).toBe(3)
    expect(s.validation.metrics.counts).toBeUndefined()
  })
})

describe('compareDrafts — the specified priority order, exactly', () => {
  const base = {
    pass: false, failures: 3, targetsInRange: 1, outOfLevelShare: 0.1,
    unknownShare: 0.05, structureFailures: 1, lineDistance: 5, warnings: 2,
  }
  it('PASS dominates everything', () => {
    expect(compareDrafts({ ...base, pass: true, failures: 0, warnings: 9 }, { ...base, failures: 0, warnings: 0 })).toBeLessThan(0)
  })
  it('fewer hard failures beats better targets', () => {
    expect(compareDrafts({ ...base, failures: 2, targetsInRange: 0 }, { ...base, failures: 3, targetsInRange: 3 })).toBeLessThan(0)
  })
  it('more targets in range beats lower out-of-level share', () => {
    expect(compareDrafts({ ...base, targetsInRange: 2, outOfLevelShare: 0.2 }, { ...base, targetsInRange: 1, outOfLevelShare: 0.01 })).toBeLessThan(0)
  })
  it('then out-of-level, unknown, structure, line distance, warnings — in order', () => {
    expect(compareDrafts({ ...base, outOfLevelShare: 0.08 }, { ...base, outOfLevelShare: 0.12 })).toBeLessThan(0)
    expect(compareDrafts({ ...base, unknownShare: 0.01 }, { ...base, unknownShare: 0.06 })).toBeLessThan(0)
    expect(compareDrafts({ ...base, structureFailures: 0 }, { ...base, structureFailures: 2 })).toBeLessThan(0)
    expect(compareDrafts({ ...base, lineDistance: 0 }, { ...base, lineDistance: 9 })).toBeLessThan(0)
    expect(compareDrafts({ ...base, warnings: 0 }, { ...base, warnings: 5 })).toBeLessThan(0)
  })
})

describe('draftBreakdown', () => {
  it('counts in-range targets and distance from the draft line target', () => {
    const m = manifest()
    const v = {
      verdict: 'FAIL',
      failures: [{ code: 'unknown_speaker' }, { code: 'target_below_min' }],
      warnings: [{ code: 'out_of_level_words' }],
      metrics: { targetCounts: { 护照: 2, 邻居: 0, 打算: 3 }, lines: 25, outOfLevelCharShare: 0.05, unknownCharShare: 0.01 },
    }
    const b = draftBreakdown(v, m)
    expect(b.targetsInRange).toBe(2)
    expect(b.targetsTotal).toBe(3)
    expect(b.structureFailures).toBe(1)
    expect(b.lineDistance).toBe(5)       // fixture draftLines clamp to [6,20]; 25 is 5 over
    expect(b.warnings).toBe(1)
  })
})
