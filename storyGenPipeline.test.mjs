import { describe, it, expect } from 'vitest'
import {
  generateCandidate,
  serializableCandidate,
  rankAttempt,
  GENERATOR_VERSION,
} from './storyGenPipeline.mjs'
import {
  draftPrompt,
  repairPrompt,
  parseChapter,
  parseCritique,
  parseTranslation,
  poolForPrompt,
  PROMPT_VERSION,
} from './storyGenPrompts.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

// Same controlled pool as the validator spec.
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

// All specs stub the backoff timer — throw-paths must not actually wait.
const gen = (opts) => generateCandidate({ sleep: async () => {}, ...opts })

const manifest = () => buildManifest({
  batchId: 'test', seq: 1, level: 3,
  targets: ['护照', '邻居', '打算'],
  defaults: { lines: [6, 20] },
  theme: 'a lost passport',
  forbidden: { words: ['警察'], topics: ['violence'] },
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
const EN8 = GOOD_LINES.map((_, i) => 'line ' + i).join('\n')
const CRIT_OK = 'SCORE: 9\nFEEDBACK: strong scene, natural dialogue'

// Scripted provider: per-kind FIFO queues; records every request it saw.
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

describe('prompt builders', () => {
  it('draft prompt carries targets with ranges, theme and forbidden constraints', () => {
    const p = draftPrompt({ manifest: manifest(), pool, meanings: { 护照: 'passport' } })
    expect(p).toContain('护照 (passport) — use 2-4 times')
    expect(p).toContain('a lost passport')
    expect(p).toContain('NEVER use these words: 警察')
    expect(p).toContain('Avoid these topics entirely: violence')
    expect(p).toContain('6-20 lines')
  })

  it('repair prompt quotes the validator failures verbatim', () => {
    const p = repairPrompt({
      manifest: manifest(),
      candidate: { title: 'T', content: '我们去。' },
      failures: [{ code: 'missing_target', message: 'missing target: 护照' }],
      pool,
    })
    expect(p).toContain('- missing target: 护照')
    expect(p).toContain('我们去。')
  })

  it('parsers round-trip the plain-text protocol', () => {
    expect(parseChapter(GOOD_TEXT)).toEqual({ title: '去旅行', content: GOOD_LINES.join('\n') })
    expect(parseChapter('no title here')).toBeNull()
    expect(parseCritique('SCORE: 7\nFEEDBACK: fine')).toEqual({ score: 7, feedback: 'fine' })
    expect(parseCritique('gibberish')).toBeNull()
    expect(parseCritique('SCORE: 8/10\nFEEDBACK: ok').score).toBe(8)   // not 81→10
    expect(parseCritique('SCORE: 7 out of 10\nFEEDBACK: ok').score).toBe(7)
    expect(parseTranslation('a\nb\nc', 3)).toBe('a\nb\nc')
    expect(parseTranslation('a\nb', 4)).toBe('a\nb\n\n')      // ±2 tolerance pads
    expect(parseTranslation('a', 5)).toBeNull()               // beyond tolerance
  })
})

describe('generateCandidate', () => {
  it('accepts a first-try pass and records provenance', async () => {
    const provider = scripted({ draft: [GOOD_TEXT], critique: [CRIT_OK], translate: [EN8] })
    const r = await gen({ manifest: manifest(), pool, vocabMap, provider })
    expect(r.status).toBe('accepted')
    expect(r.validation.verdict).toBe('PASS')
    expect(r.title).toBe('去旅行')
    expect(r.englishContent).toBe(EN8)
    expect(r.critique.score).toBe(9)
    expect(r.attempts).toBe(1)
    expect(r.calls).toBe(3)                       // draft + critique + translate
    expect(r.generatorVersion).toBe(GENERATOR_VERSION)
    expect(r.promptVersion).toBe(PROMPT_VERSION)
  })

  it('repairs a failing draft from the machine-readable failures', async () => {
    const missing = 'TITLE: 去旅行\n' + GOOD_LINES.join('\n')
      .replace('李明打算和妈妈去旅行。', '李明和妈妈去旅行。')
      .replace('他们打算明天买东西。', '他们明天买东西。')
    const provider = scripted({ draft: [missing], repair: [GOOD_TEXT], critique: [CRIT_OK], translate: [EN8] })
    const r = await gen({ manifest: manifest(), pool, vocabMap, provider })
    expect(r.status).toBe('accepted')
    const repairReq = provider.seen.find(s => s.kind === 'repair')
    expect(repairReq.prompt).toContain('missing target: 打算')
  })

  it('a repair that makes things worse is discarded', async () => {
    const missingOne = 'TITLE: 去旅行\n' + GOOD_LINES.join('\n')
      .replace('李明打算和妈妈去旅行。', '李明和妈妈去旅行。')
      .replace('他们打算明天买东西。', '他们明天买东西。')
    const worse = 'TITLE: 坏\n坏。\n坏。\n坏。'
    const provider = scripted({ draft: [missingOne], repair: [worse, worse] })
    const r = await gen({
      manifest: manifest(), pool, vocabMap, provider,
      critique: false, translate: false, limits: { attempts: 1 },
    })
    expect(r.status).toBe('rejected')
    expect(r.content).toContain('护照')            // kept the better (original) draft
    expect(r.validation.failures.map(f => f.code)).toContain('missing_target')
  })

  it('rejects with no_candidate when every draft is unparseable', async () => {
    const provider = scripted({ draft: ['garbage'] })
    const r = await gen({
      manifest: manifest(), pool, vocabMap, provider,
      critique: false, translate: false,
    })
    expect(r.status).toBe('rejected')
    expect(r.validation.failures[0].code).toBe('no_candidate')
    expect(r.content).toBeNull()
  })

  it('a transient provider error is retried within the per-call budget (pilot-1 regression)', async () => {
    let n = 0
    const provider = async ({ kind }) => {
      n += 1
      if (n === 1) throw new Error('429 rate limited')
      if (kind === 'draft') return GOOD_TEXT
      throw new Error('unexpected ' + kind)
    }
    const r = await gen({ manifest: manifest(), pool, vocabMap, provider, critique: false, translate: false })
    expect(r.status).toBe('accepted')
    expect(r.calls).toBe(2)                       // the failed call + the successful retry
  })

  it('a quality revision that improves the critique is kept', async () => {
    const revised = GOOD_TEXT.replace('大家都很高兴。', '他们都很高兴。')
    const provider = scripted({
      draft: [GOOD_TEXT],
      critique: ['SCORE: 6\nFEEDBACK: flat ending', 'SCORE: 8\nFEEDBACK: better'],
      revise: [revised],
      translate: [EN8],
    })
    const r = await gen({ manifest: manifest(), pool, vocabMap, provider })
    expect(r.status).toBe('accepted')
    expect(r.content).toContain('他们都很高兴。')
    expect(r.critique.score).toBe(8)
  })

  it('a quality revision that breaks deterministic validation is discarded', async () => {
    const broken = 'TITLE: 坏\n坏。\n坏。\n坏。'
    const provider = scripted({
      draft: [GOOD_TEXT],
      critique: ['SCORE: 6\nFEEDBACK: flat'],
      revise: [broken],
      translate: [EN8],
    })
    const r = await gen({ manifest: manifest(), pool, vocabMap, provider })
    expect(r.status).toBe('accepted')
    expect(r.content).toBe(GOOD_LINES.join('\n'))  // original kept
    expect(r.critique.score).toBe(6)
  })

  it('a failed translation never sinks an accepted candidate', async () => {
    const provider = scripted({ draft: [GOOD_TEXT], critique: [CRIT_OK], translate: ['one line only'] })
    const r = await gen({ manifest: manifest(), pool, vocabMap, provider })
    expect(r.status).toBe('accepted')
    expect(r.englishContent).toBeNull()
  })

  it('near-duplicates of the corpus are rejected end-to-end', async () => {
    const provider = scripted({ draft: [GOOD_TEXT, GOOD_TEXT], repair: [GOOD_TEXT, GOOD_TEXT, GOOD_TEXT, GOOD_TEXT] })
    const corpus = [{ title: '旧故事', level: 3, content: GOOD_LINES.join('\n') }]
    const r = await gen({
      manifest: manifest(), pool, vocabMap, corpus, provider,
      critique: false, translate: false,
    })
    expect(r.status).toBe('rejected')
    expect(r.validation.failures.map(f => f.code)).toContain('duplicate_of_existing')
  })

  it('refuses to run on an invalid manifest', async () => {
    const provider = scripted({})
    await expect(gen({ manifest: { schema: 'nope' }, pool, vocabMap, provider }))
      .rejects.toThrow(/invalid manifest/)
  })

  it('serializableCandidate is JSON-safe and keeps the verdict', () => {
    const fake = {
      manifestId: 'm', status: 'accepted',
      validation: { verdict: 'PASS', failures: [], warnings: [], metrics: { counts: new Map([['x', 1]]), targetCounts: { x: 1 } } },
    }
    const s = serializableCandidate(fake)
    expect(() => JSON.stringify(s)).not.toThrow()
    expect(s.validation.metrics.counts).toBeUndefined()
    expect(s.validation.verdict).toBe('PASS')
  })

  it('rankAttempt puts validity above any critique score', () => {
    const invalid = { validation: { verdict: 'FAIL', failures: [{}] }, critique: { score: 10 } }
    const valid = { validation: { verdict: 'PASS', failures: [] }, critique: { score: 5 } }
    expect(rankAttempt(valid)).toBeGreaterThan(rankAttempt(invalid))
  })
})

describe('provider error capture (bench-1 regression)', () => {
  it('records why calls failed, so a dead model is distinguishable from a bad one', async () => {
    const provider = async () => { throw new Error('groq/x HTTP 429: rate limit reached') }
    const r = await gen({
      manifest: manifest(), pool, vocabMap, provider,
      critique: false, translate: false, limits: { attempts: 1, parseRetries: 1 },
    })
    expect(r.status).toBe('rejected')
    expect(r.validation.failures[0].code).toBe('no_candidate')
    expect(r.providerErrors.length).toBeGreaterThan(0)
    expect(r.providerErrors[0].message).toContain('HTTP 429')
    expect(r.providerErrors[0].kind).toBe('draft')
  })

  it('records unparseable responses with a sample of what came back', async () => {
    const provider = async () => 'I cannot help with that request.'
    const r = await gen({
      manifest: manifest(), pool, vocabMap, provider,
      critique: false, translate: false, limits: { attempts: 1, parseRetries: 1 },
    })
    expect(r.providerErrors.some(e => e.message === 'unparseable response')).toBe(true)
    expect(r.providerErrors[0].sample).toContain('I cannot help')
  })
})

describe('poolForPrompt stratification (bench-1 defect)', () => {
  const bigPool = [
    ...Array.from({ length: 300 }, (_, i) => ({ word: 'a' + i, level: 1 })),
    ...Array.from({ length: 197 }, (_, i) => ({ word: 'b' + i, level: 2 })),
    ...Array.from({ length: 453 }, (_, i) => ({ word: 'c' + i, level: 3 })),
  ]

  it('shows every level, not just the first one (plain slice showed zero HSK 2/3)', () => {
    const listed = poolForPrompt(bigPool, 280).split(', ')
    const perLevel = { 1: 0, 2: 0, 3: 0 }
    for (const entry of listed) perLevel[entry[0] === 'a' ? 1 : entry[0] === 'b' ? 2 : 3] += 1
    expect(perLevel[1]).toBeGreaterThan(0)
    expect(perLevel[2]).toBeGreaterThan(0)
    expect(perLevel[3]).toBeGreaterThan(0)
    expect(listed.length).toBe(280)
  })

  it('gives the level being taught the largest share', () => {
    const listed = poolForPrompt(bigPool, 280).split(', ')
    const lvl3 = listed.filter(e => e.startsWith('c')).length
    const lvl1 = listed.filter(e => e.startsWith('a')).length
    expect(lvl3).toBeGreaterThan(lvl1)
  })

  it('keeps frequency order within each level and passes small pools through whole', () => {
    const listed = poolForPrompt(bigPool, 280).split(', ')
    expect(listed[0]).toBe('a0')
    const small = [{ word: 'x', level: 1, meaning: 'ex' }]
    expect(poolForPrompt(small, 280)).toBe('x (ex)')
  })
})
