import { describe, it, expect } from 'vitest'
import { generateDuoCandidate, serializableDuoCandidate, DUO_GENERATOR_VERSION } from './storyDuoPipeline.mjs'
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
// A draft with the flavour of a real Qwen failure: targets underused.
const BAD_TEXT = 'TITLE: 去旅行\n' + GOOD_LINES.join('\n')
  .replace('李明打算和妈妈去旅行。', '李明和妈妈去旅行。')
  .replace('他们打算明天买东西。', '他们明天买东西。')
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

describe('generateDuoCandidate — the write→simplify division of labour', () => {
  it('a passing draft never reaches the editor; the writer critiques it', async () => {
    const writer = scripted({ draft: [GOOD_TEXT], critique: [JUDGE_OK] })
    const editor = scripted({ translate: [EN8] })
    const r = await gen({ writer: writer, editor })
    expect(r.status).toBe('accepted')
    expect(r.stages.map(s => s.stage)).toEqual(['draft'])
    expect(editor.seen.map(s => s.kind)).toEqual(['translate'])   // no simplify, no repair
    expect(r.critique.overall).toBe(7)
    expect(r.critique.role).toBe('writer')
    expect(r.generatorVersion).toBe(DUO_GENERATOR_VERSION)
  })

  it('a failing draft goes to the editor with the machine failures; the edit is revalidated', async () => {
    const writer = scripted({ draft: [BAD_TEXT], critique: [JUDGE_OK] })
    const editor = scripted({ simplify: [GOOD_TEXT], translate: [EN8] })
    const r = await gen({ writer, editor })
    expect(r.status).toBe('accepted')
    expect(r.stages.map(s => `${s.stage}:${s.validation.verdict}`)).toEqual(['draft:FAIL', 'simplify:PASS'])
    const simplifyReq = editor.seen.find(s => s.kind === 'simplify')
    expect(simplifyReq.prompt).toContain('missing target: 打算')
    expect(simplifyReq.prompt).toContain('you are not the author')
    expect(r.content).toBe(GOOD_LINES.join('\n'))
  })

  it('one targeted repair after a failed simplification — and only one', async () => {
    const writer = scripted({ draft: [BAD_TEXT], critique: [JUDGE_OK] })
    const editor = scripted({ simplify: [BAD_TEXT], repair: [GOOD_TEXT], translate: [EN8] })
    const r = await gen({ writer, editor })
    expect(r.status).toBe('accepted')
    expect(r.stages.map(s => s.stage)).toEqual(['draft', 'simplify', 'repair'])
    expect(editor.seen.filter(s => s.kind === 'repair').length).toBe(1)
  })

  it('the validator has the last word: edits that stay broken end rejected, with the full evolution kept', async () => {
    const writer = scripted({ draft: [BAD_TEXT] })
    const editor = scripted({ simplify: [BAD_TEXT], repair: [BAD_TEXT] })
    const r = await gen({ writer, editor })
    expect(r.status).toBe('rejected')
    expect(r.validation.failures.map(f => f.code)).toContain('missing_target')
    expect(r.stages.length).toBe(3)
    // no critique, no translation for a FAIL — an LLM never sees a deterministic failure
    expect(r.critique).toBeNull()
    expect(r.englishContent).toBeNull()
    expect(writer.seen.filter(s => s.kind === 'critique').length).toBe(0)
  })

  it('an editor edit that makes things WORSE is not adopted', async () => {
    const broken = 'TITLE: 坏\n坏。\n坏。\n坏。'
    const writer = scripted({ draft: [BAD_TEXT] })
    const editor = scripted({ simplify: [broken], repair: [broken] })
    const r = await gen({ writer, editor })
    expect(r.status).toBe('rejected')
    expect(r.content).toContain('护照')          // the draft, not the wreck
  })

  it('a dead writer yields no_candidate without ever calling the editor', async () => {
    const writer = scripted({})                   // throws on any call
    const editor = scripted({})
    const r = await gen({ writer, editor })
    expect(r.status).toBe('rejected')
    expect(r.validation.failures[0].code).toBe('no_candidate')
    expect(editor.seen.length).toBe(0)
  })

  it('critique or translation failures never sink an accepted candidate', async () => {
    const writer = scripted({ draft: [GOOD_TEXT] })   // no critique scripted → throws
    const editor = scripted({})                        // no translate scripted → throws
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
    expect(s.stages.length).toBe(1)
    expect(s.validation.metrics.counts).toBeUndefined()
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
