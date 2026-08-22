import { describe, it, expect } from 'vitest'
import {
  validateBeat,
  realizeByBeat,
  acceptableBeat,
  BEAT_LIMITS,
  BEAT_QUALITY,
  BEAT_DIMENSIONS,
} from './storyBeats.mjs'
import { checkAnchor, checkUsageSketch, hasLatin, validateBlueprint } from './storyBlueprint.mjs'
import { beatPrompt, parseBeat, beatJudgePrompt, parseBeatJudgment } from './storyGenPrompts.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

const POOL = [
  ['我', 1], ['你', 1], ['他', 1], ['是', 1], ['的', 1], ['了', 1], ['去', 1], ['有', 1],
  ['看', 1], ['说', 1], ['想', 1], ['要', 1], ['买', 1], ['好', 1], ['家', 1], ['妈妈', 1],
  ['朋友', 1], ['今天', 1], ['明天', 1], ['商店', 1], ['东西', 1], ['高兴', 1], ['一起', 1],
  ['问', 1], ['找', 1], ['谢谢', 1], ['没有', 1], ['吃', 1], ['很', 1], ['也', 1], ['和', 1],
  ['都', 1], ['什么', 1], ['这', 1], ['那', 1], ['个', 1], ['在', 1], ['里', 1], ['来', 1],
  ['我们', 1], ['他们', 1], ['大家', 1], ['哪里', 1], ['比赛', 3], ['觉得', 1], ['回家', 1],
  ['快', 1], ['吧', 1], ['忙', 3], ['生活', 3], ['这样', 2],
  ['放', 3], ['地图', 3], ['护照', 3], ['邻居', 3], ['打算', 3], ['铅笔', 3], ['结束', 3],
  ['旅行', 4], ['签证', 4], ['森林', 4], ['警察', 4], ['扳手', 6],
]
const vocabMap = Object.fromEntries(POOL.map(([word, level]) => [word, { word, level }]))

const manifest = (over = {}) => buildManifest({
  batchId: 'be', seq: 1, level: 3,
  targets: ['护照', '邻居', '结束'],
  defaults: { lines: [14, 38] },
  ...over,
})

const beat = (over = {}) => ({
  id: 2, when: 'that afternoon', where: '李明家', what: 'they look for the passport',
  because: 'it follows', targets: ['护照'], chineseLexicalAnchors: ['护照', '找', '家', '妈妈'], lines: 4, ...over,
})

describe('lexical feasibility — a plan must be writable at this level', () => {
  const opts = { manifest: manifest(), vocabMap, cast: ['李明', '小红'] }

  it('accepts in-level words, target words and character names', () => {
    expect(checkAnchor('商店', opts).ok).toBe(true)
    expect(checkAnchor('护照', opts).ok).toBe(true)      // a target
    expect(checkAnchor('李明', opts).ok).toBe(true)      // a name
  })

  // blueprint-3 rejected every plan it saw, largely for words like these:
  // ordinary compounds that are not their own dictionary headwords. The
  // question is whether a reader at this level can read it, which is what the
  // canonical engine answers — not whether the string is an entry.
  it('accepts readable compounds that are not dictionary entries', () => {
    for (const w of ['回家', '找东西', '看家']) {
      const r = checkAnchor(w, opts)
      expect(r.ok, w + ' → ' + r.reason).toBe(true)
    }
    // and still refuses what the reader genuinely cannot read
    expect(checkAnchor('扳手', opts).ok).toBe(false)
    expect(checkAnchor('森林', opts).reason).toContain('above the story level')
  })

  it('rejects the words blueprint-2 quietly required', () => {
    expect(checkAnchor('扳手', opts)).toMatchObject({ ok: false })       // HSK 6 wrench
    expect(checkAnchor('扳手', opts).reason).toContain('above the story level')
    expect(checkAnchor('冰淇淋', opts).reason).toContain('not standard vocabulary')
    expect(checkAnchor('reckless', opts).reason).toContain('Latin')
    expect(checkAnchor('', opts).ok).toBe(false)
  })

  it('a usage sketch has to be a real, writable utterance using the word', () => {
    expect(checkUsageSketch('比赛快结束了', { word: '结束', manifest: manifest(), vocabMap }).ok).toBe(true)
    // the blueprint-2 failure: a sketch that does not use the word at all
    expect(checkUsageSketch('今天很好', { word: '结束', manifest: manifest(), vocabMap }).problems[0]).toContain('does not actually use')
    expect(checkUsageSketch('比赛在森林结束了', { word: '结束', manifest: manifest(), vocabMap }).problems.join(' ')).toContain('above-level')
    expect(checkUsageSketch('比赛结束 now', { word: '结束', manifest: manifest(), vocabMap }).problems.join(' ')).toContain('Latin')
    expect(checkUsageSketch('结束', { word: '结束', manifest: manifest(), vocabMap }).problems.join(' ')).toContain('too short')
  })

  it('the blueprint validator applies both when a vocabulary is supplied', () => {
    const bp = {
      title: 'The missing passport', chineseTitle: '找护照', setting: 'A flat, one afternoon', problem: 'The passport is missing',
      incitingEvent: 'Li Ming cannot find it', resolution: 'The neighbour has it',
      cast: ['李明', '小红'],
      beats: [1, 2, 3, 4, 5].map(id => beat({ id, targets: [], because: id === 1 ? 'opens' : 'follows' })),
      targetPlan: [
        { word: '护照', beat: 1, why: 'they are looking for the passport itself', speaker: '李明', refersTo: 'the passport', intent: 'ask where it is', usageSketch: '我的护照在哪里' },
        { word: '邻居', beat: 2, why: 'the neighbour is who they ask for help', speaker: '小红', refersTo: 'the neighbour', intent: 'suggest asking them', usageSketch: '我们问问邻居吧' },
        { word: '结束', beat: 3, why: 'the search is finally over and they say so', speaker: '李明', refersTo: 'the search', intent: 'say it is over', usageSketch: '今天的比赛结束了' },
      ],
    }
    expect(validateBlueprint(bp, { manifest: manifest(), vocabMap }).ok).toBe(true)

    const bad = JSON.parse(JSON.stringify(bp))
    bad.beats[2].chineseLexicalAnchors = ['扳手', '找', '家', '妈妈']
    bad.targetPlan[2].usageSketch = '这是今天忙碌生活的结束'
    const r = validateBlueprint(bad, { manifest: manifest(), vocabMap })
    expect(r.failures.map(f => f.code)).toContain('anchor_unusable')
    expect(r.failures.map(f => f.code)).toContain('target_sketch_unusable')

    const noSpeaker = JSON.parse(JSON.stringify(bp))
    delete noSpeaker.targetPlan[0].speaker
    expect(validateBlueprint(noSpeaker, { manifest: manifest(), vocabMap }).failures.map(f => f.code)).toContain('target_no_speaker')
  })

  it('hasLatin has an empty whitelist, by design', () => {
    expect(hasLatin('李明不想和 reckless 的人打球')).toBe(true)
    expect(hasLatin('李明不想和这样的人打球')).toBe(false)
  })
})

describe('validateBeat — the local deterministic gate', () => {
  const base = { beat: beat(), manifest: manifest(), vocabMap, expectedLines: 3, cast: ['李明', '小红'] }

  it('accepts a clean beat and reports its local metrics', () => {
    const r = validateBeat(['李明：我的护照在哪里？', '妈妈说不知道。', '他们一起找东西。'], { ...base, cast: ['李明', '小红', '妈妈'] })
    expect(r.ok).toBe(true)
    expect(r.metrics.targetCounts).toEqual({ 护照: 1 })
    expect(r.metrics.lines).toBe(3)
  })

  it('holds the exact line count for the beat', () => {
    expect(validateBeat(['李明：我的护照在哪里？', '他找东西。'], base).failures[0].code).toBe('line_count')
    expect(validateBeat(['一。', '二。', '三。', '四。'], base).failures[0].code).toBe('line_count')
  })

  it('rejects Latin text, an outside speaker, and narrated dialogue', () => {
    expect(validateBeat(['李明：我的护照在哪里？', 'This is English.', '他们找东西。'], base).failures.map(f => f.code)).toContain('latin_text')
    expect(validateBeat(['王老师：你好。', '李明：我的护照呢？', '他们找东西。'], base).failures.map(f => f.code)).toContain('unknown_speaker')
    // blueprint-2's writer slipped into 小明说：“…” the moment it wrote scenes
    expect(validateBeat(['小红说：“我的护照在哪里？”', '他们找东西。', '妈妈来了。'], base).failures.map(f => f.code)).toContain('narrated_speaker')
  })

  it('requires the beat\'s assigned target, and refuses it stuffed', () => {
    expect(validateBeat(['李明：东西在哪里？', '他们找东西。', '妈妈来了。'], base).failures.map(f => f.code)).toContain('target_missing')
    const stuffed = ['李明：护照，护照，护照。', '小红：护照护照护照。', '护照护照护照护照。']
    expect(validateBeat(stuffed, base).failures.map(f => f.code)).toContain('target_stuffed')
  })

  it('applies LOCAL vocabulary limits, stricter than the whole-story band', () => {
    const r = validateBeat(['李明：我的护照在森林里。', '小红：警察在那里。', '他们打算去签证。'], base)
    const codes = r.failures.map(f => f.code)
    expect(codes.some(c => c === 'out_of_level' || c === 'unknown_words')).toBe(true)
    expect(BEAT_LIMITS.outOfLevelCharShare).toBeLessThan(0.105)      // tighter than the review ceiling
    expect(BEAT_LIMITS.unknownDistinct).toBe(1)
  })

  it('acceptableBeat needs every axis, and refuses a stuffed target outright', () => {
    const ok = { overall: 7, natural: 7, continuity: 6, integration: 6, stuffed: false }
    expect(acceptableBeat(ok)).toBe(true)
    expect(acceptableBeat({ ...ok, stuffed: true })).toBe(false)
    expect(acceptableBeat({ ...ok, natural: 5 })).toBe(false)
    expect(acceptableBeat({ ...ok, integration: 4 })).toBe(false)
    expect(acceptableBeat({ ...ok, overall: 5 })).toBe(false)
    expect(acceptableBeat(null)).toBe(false)
    expect(BEAT_QUALITY.integration).toBe(5)
  })
})

describe('realizeByBeat — sequential, gated, never rewinds', () => {
  const blueprint = {
    cast: ['李明', '小红'],
    beats: [
      { id: 1, when: 'morning', where: '家', what: 'they notice it is missing', because: 'opens', targets: ['护照'], chineseLexicalAnchors: ['护照', '找'] },
      { id: 2, when: 'later', where: '家', what: 'they ask the neighbour', because: 'they cannot find it', targets: ['邻居'], chineseLexicalAnchors: ['邻居', '问'] },
    ],
    targetPlan: [
      { word: '护照', beat: 1, speaker: '李明', refersTo: 'the passport', intent: 'ask where it is', usageSketch: '我的护照在哪里' },
      { word: '邻居', beat: 2, speaker: '小红', refersTo: 'the neighbour', intent: 'suggest asking', usageSketch: '我们问问邻居吧' },
    ],
  }
  const allocation = [{ beat: 1, lines: 2, from: 1, to: 2 }, { beat: 2, lines: 2, from: 3, to: 4 }]
  const json = (lines) => JSON.stringify({ lines })
  const gen = (name, replies) => { const seen = []; return { name, seen, send: async ({ prompt }) => { seen.push(prompt); return replies.shift() } } }
  const good = ['NATURAL 8 CONTINUITY 8 EVENT 8 INTEGRATION 8 STUFFED no OVERALL 8 — fine']
  const run = (writer, judge, over = {}) => realizeByBeat({
    blueprint, allocation, manifest: manifest(), vocabMap, writer, judge,
    buildBeatPrompt: beatPrompt, parseBeat, buildBeatJudgePrompt: beatJudgePrompt, parseBeatJudgment,
    ...over,
  })

  it('writes beat by beat and assembles exactly the allocated lines', async () => {
    const writer = gen('W', [json(['李明：我的护照在哪里？', '他们一起找东西。']), json(['小红：我们问问邻居吧。', '他们去找邻居。'])])
    const judge = gen('J', [good[0], good[0]])
    const r = await run(writer, judge)
    expect(r.ok).toBe(true)
    expect(r.lines.length).toBe(4)
    expect(r.accepted.map(b => b.beat)).toEqual([1, 2])
    // the second beat was told what the first one ended on
    expect(writer.seen[1]).toContain('他们一起找东西。')
    expect(writer.seen[1]).toContain('EXACTLY 2 lines')
    expect(writer.seen[1]).not.toContain('do not repeat or rewrite it:\n  (this is the opening beat)')
  })

  it('retries a failed beat once, with its exact failures, and keeps earlier beats', async () => {
    const writer = gen('W', [
      json(['李明：我的东西在哪里？', '他们找东西。']),          // target missing
      json(['李明：我的护照在哪里？', '他们一起找东西。']),
      json(['小红：我们问问邻居吧。', '他们去找邻居。']),
    ])
    const judge = gen('J', [good[0], good[0]])
    const r = await run(writer, judge)
    expect(r.ok).toBe(true)
    expect(r.attempts.filter(a => a.beat === 1).length).toBe(2)
    expect(writer.seen[1]).toContain('YOUR PREVIOUS ATTEMPT AT THIS BEAT WAS REJECTED')
    expect(writer.seen[1]).toContain('护照')
    expect(r.attempts.filter(a => a.beat === 2).length).toBe(1)      // beat 1 never regenerated after acceptance
  })

  it('a semantic failure is fed back as feedback, not silently accepted', async () => {
    const writer = gen('W', [
      json(['李明：护照。', '他们找东西。']),
      json(['李明：我的护照在哪里？', '他们一起找东西。']),
      json(['小红：我们问问邻居吧。', '他们去找邻居。']),
    ])
    const judge = gen('J', ['NATURAL 3 CONTINUITY 4 EVENT 5 INTEGRATION 2 STUFFED yes OVERALL 3 — the word is wedged in', good[0], good[0]])
    const r = await run(writer, judge)
    expect(r.ok).toBe(true)
    expect(r.attempts[0].accepted).toBe(false)
    expect(writer.seen[1]).toContain('the writing was judged')
    expect(writer.seen[1]).toContain('wedged')
  })

  it('BEAT_REALIZATION_FAILED after the second attempt — no partial story', async () => {
    const writer = gen('W', [json(['李明：东西在哪里？', '他们找东西。']), json(['李明：东西在哪里？', '他们找东西。'])])
    const judge = gen('J', [])
    const r = await run(writer, judge)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('BEAT_REALIZATION_FAILED')
    expect(r.failedBeat).toBe(1)
    expect(r.lines).toBeUndefined()
    expect(r.accepted).toEqual([])
  })

  it('the beat prompt is a closed task: this beat only, nothing to invent', async () => {
    const writer = gen('W', [json(['李明：我的护照在哪里？', '他们一起找东西。']), json(['小红：我们问问邻居吧。', '他们去找邻居。'])])
    await run(writer, gen('J', [good[0], good[0]]))
    const p = writer.seen[0]
    expect(p).toContain('This beat only')
    expect(p).toContain('No new characters')
    expect(p).toContain('No Latin letters')
    expect(p).toContain('护照')
    expect(p).toContain('我的护照在哪里')             // the approved usage sketch
    expect(p).toContain('Do NOT bend a sentence around the word')
    expect(p).toContain('EXACTLY 2 lines')
  })
})
