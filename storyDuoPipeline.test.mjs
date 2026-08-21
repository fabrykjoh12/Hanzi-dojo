import { describe, it, expect } from 'vitest'
import {
  generateDuoCandidate,
  serializableDuoCandidate,
  microRepairable,
  selfCondensable,
  applyLinePatch,
  DUO_GENERATOR_VERSION,
} from './storyDuoPipeline.mjs'
import { parseLinePatch, microRepairPrompt, selfCondensePrompt } from './storyGenPrompts.mjs'
import { simplifyPrompt } from './storyGenPrompts.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

// Same controlled pool as the other pipeline specs.
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
  batchId: 'duo', seq: 1, level: 3,
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
// NARROW failure: two targets one occurrence short — micro-repair territory.
const NARROW_TEXT = 'TITLE: 去旅行\n' + GOOD_LINES.join('\n')
  .replace('李明打算和妈妈去旅行。', '李明和妈妈去旅行。')
  .replace('他们打算明天买东西。', '他们明天买东西。')
// BROAD failure: an unknown speaker on top — simplification territory.
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

const gen = (opts) => generateDuoCandidate({ sleep: async () => {}, manifest: manifest(), pool, vocabMap, ...opts })

describe('generateDuoCandidate — write → simplify/micro-repair → validate', () => {
  it('a passing draft never reaches the editor; the writer critiques it', async () => {
    const writer = scripted({ draft: [GOOD_TEXT], critique: [JUDGE_OK] })
    const editor = scripted({ translate: [EN8] })
    const r = await gen({ writer: writer, editor })
    expect(r.status).toBe('accepted')
    expect(r.stages.map(s => s.stage)).toEqual(['draft'])
    expect(editor.seen.map(s => s.kind)).toEqual(['translate'])
    expect(r.critique.overall).toBe(7)
    expect(r.generatorVersion).toBe(DUO_GENERATOR_VERSION)
  })

  it('BROAD failures go to WRITER SELF-CONDENSE by default; a faithful condense is adopted', async () => {
    const writer = scripted({ draft: [BROAD_TEXT], 'self-condense': [GOOD_TEXT], critique: [JUDGE_OK] })
    const editor = scripted({ translate: [EN8] })
    const r = await gen({ writer, editor })
    expect(r.status).toBe('accepted')
    expect(r.stages.map(s => `${s.stage}:${s.validation.verdict}`)).toEqual(['draft:FAIL', 'self-condense:PASS'])
    expect(r.stages[1].role).toBe('writer')
    const req = writer.seen.find(s => s.kind === 'self-condense')
    expect(req.prompt).toContain('not a new story generation task')
    expect(req.prompt).toContain('王老师')                              // the exact failures travel
    expect(req.prompt).toContain('Keep the title EXACTLY: 去旅行')
    expect(editor.seen.map(s => s.kind)).toEqual(['translate'])         // gpt-oss never authors
    expect(r.stages[1].validation.metrics.edit.containment).toBeGreaterThan(0.5)
  })

  it('the editor-simplify path stays available behind broadStage: editor', async () => {
    const writer = scripted({ draft: [BROAD_TEXT], critique: [JUDGE_OK] })
    const editor = scripted({ simplify: [GOOD_TEXT], translate: [EN8] })
    const r = await gen({ writer, editor, broadStage: 'editor' })
    expect(r.status).toBe('accepted')
    expect(r.stages.map(s => s.stage)).toEqual(['draft', 'simplify'])
    expect(r.stages[1].role).toBe('editor')
  })

  it('NARROW failures skip simplification and get a deterministic line patch', async () => {
    const writer = scripted({ draft: [NARROW_TEXT], critique: [JUDGE_OK] })
    const editor = scripted({
      'micro-repair': ['LINE 1: 李明打算和妈妈去旅行。\nLINE 6: 他们打算明天买东西。'],
      translate: [EN8],
    })
    const r = await gen({ writer, editor })
    expect(r.status).toBe('accepted')
    expect(r.stages.map(s => s.stage)).toEqual(['draft', 'micro-repair'])
    expect(editor.seen.map(s => s.kind)).toEqual(['micro-repair', 'translate'])   // no simplify call
    expect(r.stages[1].patch.length).toBe(2)
    // every unpatched line is byte-for-byte the draft's
    const draftLines = r.stages[0].content.split('\n')
    const finalLines = r.content.split('\n')
    for (let i = 0; i < finalLines.length; i += 1) {
      if (i !== 0 && i !== 5) expect(finalLines[i]).toBe(draftLines[i])
    }
  })

  it('a plot rewrite is recorded but NEVER adopted, whatever it scores', async () => {
    const rewrite = 'TITLE: 去旅行\n' + [
      '今天学校有运动会。', '李明：我们要跑步。', '小红：我很紧张。', '小明：加油！',
      '妈妈：孩子们真努力。', '大家一起跑步。', '李明跑得很快。', '大家都很高兴。',
    ].join('\n')
    const writer = scripted({ draft: [BROAD_TEXT], 'self-condense': [rewrite] })
    const editor = scripted({})
    const r = await gen({ writer, editor })
    expect(r.status).toBe('rejected')
    const stage = r.stages.find(s => s.stage === 'self-condense')
    expect(stage.validation.failures.map(f => f.code)).toContain('rewrite_detected')
    expect(r.content).toContain('王老师')          // the draft stayed the best candidate
  })

  it('the validator has the last word: a stubbornly broken flow ends rejected, evolution kept', async () => {
    const writer = scripted({ draft: [BROAD_TEXT], 'self-condense': [BROAD_TEXT] })   // "condense" fixes nothing
    const editor = scripted({})
    const r = await gen({ writer, editor })
    expect(r.status).toBe('rejected')
    expect(r.stages.length).toBeGreaterThanOrEqual(2)
    expect(r.critique).toBeNull()
    expect(r.englishContent).toBeNull()
    expect(writer.seen.filter(s => s.kind === 'critique').length).toBe(0)
  })

  it('an unusable patch (bad line numbers / too many changes) is simply not applied', async () => {
    const writer = scripted({ draft: [NARROW_TEXT] })
    const editor = scripted({ 'micro-repair': ['LINE 99: 不存在的行。', 'garbage', 'also garbage'] })
    const r = await gen({ writer, editor })
    expect(r.status).toBe('rejected')
    expect(r.content).toBe(NARROW_TEXT.split('\n').slice(1).join('\n'))   // draft untouched
  })

  it('a dead writer yields no_candidate without ever calling the editor', async () => {
    const writer = scripted({})
    const editor = scripted({})
    const r = await gen({ writer, editor })
    expect(r.status).toBe('rejected')
    expect(r.validation.failures[0].code).toBe('no_candidate')
    expect(editor.seen.length).toBe(0)
  })

  it('critique or translation failures never sink an accepted candidate', async () => {
    const writer = scripted({ draft: [GOOD_TEXT] })
    const editor = scripted({})
    const r = await gen({ writer, editor })
    expect(r.status).toBe('accepted')
    expect(r.critique).toBeNull()
    expect(r.englishContent).toBeNull()
  })

  it('serializableDuoCandidate is JSON-safe with stages intact', async () => {
    const writer = scripted({ draft: [GOOD_TEXT], critique: [JUDGE_OK] })
    const editor = scripted({ translate: [EN8] })
    const r = await gen({ writer, editor })
    const s = serializableDuoCandidate(r)
    expect(() => JSON.stringify(s)).not.toThrow()
    expect(s.validation.metrics.counts).toBeUndefined()
  })
})

describe('micro-repair machinery', () => {
  it('microRepairable admits only the narrow failure shapes', () => {
    const f = (code) => ({ code, message: code })
    expect(microRepairable([f('target_below_min')])).toBe(true)
    expect(microRepairable([f('target_below_min'), f('missing_target')])).toBe(true)
    expect(microRepairable([f('target_below_min'), f('target_above_max'), f('line_too_long')])).toBe(true)
    expect(microRepairable([f('target_below_min'), f('target_below_min'), f('missing_target')])).toBe(false)  // 3 below-min
    expect(microRepairable([f('too_long')])).toBe(false)
    expect(microRepairable([f('target_below_min'), f('out_of_level_share')])).toBe(false)
    expect(microRepairable([])).toBe(false)
  })

  it('parseLinePatch enforces range, uniqueness and the change cap', () => {
    expect(parseLinePatch('LINE 2: 新的一行。', 8)).toEqual([{ line: 2, text: '新的一行。' }])
    expect(parseLinePatch('noise\nLINE 3: 好。\nmore noise', 8)).toEqual([{ line: 3, text: '好。' }])
    expect(parseLinePatch('LINE 9: 超出。', 8)).toBeNull()
    expect(parseLinePatch('LINE 2: 一。\nLINE 2: 二。', 8)).toBeNull()
    expect(parseLinePatch('LINE 1: a\nLINE 2: b\nLINE 3: c\nLINE 4: d', 8)).toBeNull()   // > cap 3
    expect(parseLinePatch('nothing here', 8)).toBeNull()
  })

  it('applyLinePatch touches exactly the named lines', () => {
    const content = '一。\n二。\n三。'
    expect(applyLinePatch(content, [{ line: 2, text: '换了。' }])).toBe('一。\n换了。\n三。')
  })

  it('microRepairPrompt numbers the lines and demands patch-only output', () => {
    const m = manifest()
    const p = microRepairPrompt({ manifest: m, candidate: { title: 'T', content: '一。\n二。' }, failures: [{ code: 'x', message: '中 appears 1× (need 2-4)' }] })
    expect(p).toContain('1: 一。')
    expect(p).toContain('2: 二。')
    expect(p).toContain('LINE <number>:')
    expect(p).toContain('中 appears 1×')
    expect(p).toContain('Do not repeat unchanged lines')
  })
})

describe('simplifyPrompt', () => {
  it('frames the editor as an editor, with the failures and the do-not-rewrite rule', () => {
    const p = simplifyPrompt({
      manifest: manifest(),
      candidate: { title: 'T', content: '我们去。' },
      failures: [{ code: 'too_long', message: '81 lines (need 14-38)' }],
      pool,
    })
    expect(p).toContain('You are the EDITOR')
    expect(p).toContain('DO NOT invent a new story')
    expect(p).toContain('81 lines (need 14-38)')
    expect(p).toContain('CUT — merge thin lines')
    expect(p).toContain('护照')
  })
})

describe('selfCondensable', () => {
  const f = (code) => ({ code, message: code })
  it('admits fixable broad failures with a length/format/difficulty driver', () => {
    expect(selfCondensable([f('too_long'), f('unknown_speaker')])).toBe(true)
    expect(selfCondensable([f('out_of_level_share'), f('missing_target')])).toBe(true)
    expect(selfCondensable([f('unknown_words'), f('target_below_min')])).toBe(true)
  })
  it('refuses what condensing cannot fix', () => {
    expect(selfCondensable([f('too_short')])).toBe(false)             // condensing a short story is absurd
    expect(selfCondensable([f('duplicate_of_existing'), f('too_long')])).toBe(false)
    expect(selfCondensable([f('invalid_title'), f('too_long')])).toBe(false)
    expect(selfCondensable([f('missing_target')])).toBe(false)        // no condense driver
    expect(selfCondensable([])).toBe(false)
  })
})

describe('selfCondensePrompt', () => {
  it('carries everything the spec requires and frames the task as self-editing', () => {
    const m = manifest()
    const p = selfCondensePrompt({
      manifest: m,
      candidate: { title: '去旅行', content: '第一行。\n第二行。' },
      failures: [{ code: 'too_long', message: '51 lines (need 14-38)' }],
      meanings: { 护照: 'passport' },
    })
    expect(p).toContain('This is an EDIT of your existing story, not a new story generation task')
    expect(p).toContain('Keep the title EXACTLY: 去旅行')
    expect(p).toContain('51 lines (need 14-38)')                         // exact failures
    expect(p).toContain('李明, 小红, 小明, 妈妈')                          // allowed speakers
    expect(p).toContain('护照 (passport) — use 2-4 times')               // targets with ranges
    expect(p).toContain('NO new characters, locations or plot events')
    expect(p).toContain('CUTTING redundant dialogue')
    // target line range comes from draftLines (clamped [6,20] fixture → falls back inside bounds)
    expect(p).toMatch(/Reduce to \d+-\d+ lines/)
  })
})
