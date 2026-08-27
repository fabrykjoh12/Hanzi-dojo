import { describe, it, expect } from 'vitest'
import {
  buildLexicalScaffold,
  applyScaffold,
  shapeChanges,
  checkTitle,
  checkSketchCast,
  fragmentOf,
  frozenTokens,
  ANCHOR_BOUNDS,
  SCAFFOLD_VERSION,
} from './storyLexicalScaffold.mjs'
import { validateBlueprint, checkAnchor } from './storyBlueprint.mjs'
import {
  storyShapePrompt,
  titlePrompt, parseTitle,
  targetSketchPrompt, parseSketch,
  beatAnchorsPrompt, parseAnchors,
} from './storyGenPrompts.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

const POOL = [
  ['我', 1], ['你', 1], ['他', 1], ['的', 1], ['了', 1], ['去', 1], ['有', 1], ['在', 1],
  ['看', 1], ['说', 1], ['想', 1], ['要', 1], ['好', 1], ['家', 1], ['妈妈', 1], ['问', 1],
  ['找', 1], ['很', 1], ['也', 1], ['和', 1], ['都', 1], ['这', 1], ['那', 1], ['里', 1],
  ['来', 1], ['我们', 1], ['他们', 1], ['哪里', 1], ['东西', 1], ['谢谢', 1], ['给', 1],
  ['吧', 1], ['吗', 1], ['个', 1], ['故事', 3],
  ['放', 3], ['护照', 3], ['邻居', 3], ['打算', 3], ['帮助', 3], ['需要', 3],
  ['旅行', 4], ['森林', 4], ['重', 4], ['扳手', 6],
]
const vocabMap = Object.fromEntries(POOL.map(([word, level]) => [word, { word, level }]))
const pool = POOL.filter(([, l]) => l <= 3).map(([word, level]) => ({ word, level }))

const manifest = () => buildManifest({
  batchId: 'a3', seq: 1, level: 3,
  targets: ['护照', '邻居'],
  defaults: { lines: [14, 38] },
})

// The shape the planner produces: English only, no Chinese anywhere.
const shape = () => ({
  title: 'The lost passport',
  setting: 'A flat, one afternoon',
  cast: ['李明', '小红'],
  problem: 'The passport is missing the day before a trip',
  incitingEvent: 'Li Ming cannot find his passport',
  resolution: 'The neighbour had kept it safe',
  beats: [
    { id: 1, when: 'afternoon', where: '李明家', what: 'he cannot find the passport', because: 'the story opens', targets: ['护照'], lines: 6 },
    { id: 2, when: 'later', where: '李明家', what: 'they decide to ask next door', because: 'they have looked everywhere', targets: ['邻居'], lines: 6 },
    { id: 3, when: 'minutes later', where: '邻居家', what: 'the neighbour opens the door', because: 'they knocked', arrivedHow: 'they walk next door', targets: [], lines: 6 },
    { id: 4, when: 'right after', where: '邻居家', what: 'she has the passport, kept safe', because: 'she found it in the hall', targets: [], lines: 5 },
    { id: 5, when: 'that evening', where: '李明家', what: 'the trip is on again', because: 'the passport is back', arrivedHow: 'they go home', targets: [], lines: 5 },
  ],
  targetPlan: [
    { word: '护照', beat: 1, why: 'the document is what he is looking for', speaker: '李明', refersTo: 'the passport', intent: 'ask where it is' },
    { word: '邻居', beat: 2, why: 'the neighbour is who they ask', speaker: '小红', refersTo: 'the neighbour', intent: 'suggest asking them' },
  ],
})

const gen = (name, replies) => { const seen = []; return { name, seen, send: async ({ prompt, kind }) => { seen.push({ prompt, kind }); return replies.shift() } } }
const J = (o) => JSON.stringify(o)
const run = (writer, over = {}) => buildLexicalScaffold({
  blueprint: shape(), manifest: manifest(), vocabMap, pool, writer,
  buildTitlePrompt: titlePrompt, parseTitle,
  buildSketchPrompt: targetSketchPrompt, parseSketch,
  buildAnchorsPrompt: beatAnchorsPrompt, parseAnchors,
  ...over,
})

describe('the shape planner writes no Chinese', () => {
  it('asks for a plan in English and never for prose, anchors, sketches or a title', () => {
    const p = storyShapePrompt({ manifest: manifest(), totalLines: 28, targets: ['护照'] })
    expect(p).toContain('Write NO Chinese sentences')
    expect(p).toContain('because → therefore')
    expect(p).not.toContain('chineseTitle')
    expect(p).not.toContain('chineseLexicalAnchors')
    expect(p).not.toContain('usageSketch')
    // the shape still owns why a word belongs where it does
    expect(p).toContain('"speaker"')
    expect(p).toContain('"intent"')
  })

  // Three of four shapes across a32-fresh-1 and -2 invented a person the
  // story did not have: Husband, The Neighbor (Woman), Li Ming (internal
  // thought). The cast was in the preamble; it needed to be in the contract.
  it('states the cast as a closed set, with the traps named', () => {
    const p = storyShapePrompt({ manifest: manifest(), totalLines: 28, targets: ['护照'] })
    expect(p).toContain('CAST IS CLOSED')
    for (const name of manifest().speakers) expect(p).toContain(name)
    for (const trap of ['Husband', 'Neighbor', 'Courier', 'The Woman', 'role label']) {
      expect(p, trap).toContain(trap)
    }
    expect(p).toContain('unnamed or implied person')
    expect(p).toContain('Internal thought does not make a new speaker')
    expect(p).toContain('choose a different story idea')
  })

  it('a shape validates structurally without a vocabulary, and is not asked for Chinese', () => {
    const r = validateBlueprint(shape(), { manifest: manifest(), requiredTargets: ['护照', '邻居'] })
    expect(r.ok).toBe(true)
    expect(r.failures).toEqual([])
  })
})

describe('buildLexicalScaffold — smallest pieces, each gated', () => {
  it('builds a title, then each beat\'s sketches and anchors, in order', async () => {
    const writer = gen('W', [
      J({ title: '找护照' }),
      J({ sentence: '我的护照在哪里？' }),
      J({ anchors: ['找', '护照', '家'] }),
      J({ sentence: '我们去问邻居吧。' }),
      J({ anchors: ['问', '邻居', '去'] }),
      J({ anchors: ['邻居', '家', '看'] }),
      J({ anchors: ['护照', '给', '谢谢'] }),
      J({ anchors: ['我们', '去', '故事'] }),
    ])
    const r = await run(writer)
    expect(r.ok).toBe(true)
    expect(r.title).toBe('找护照')
    expect(r.beats.map(b => b.beat)).toEqual([1, 2, 3, 4, 5])
    expect(r.beats[0].sketches).toEqual([{ word: '护照', usageSketch: '我的护照在哪里？' }])
    expect(r.beats[1].anchors).toEqual(['问', '邻居', '去'])
    // one call per piece, in order, and nothing generated for beat 2 before beat 1 was valid
    expect(writer.seen.map(s => s.kind)).toEqual(['title', 'sketch', 'anchors', 'sketch', 'anchors', 'anchors', 'anchors', 'anchors'])
    // each sketch call is about ONE word: the other target's moment, speaker
    // and intent are not in it (the vocabulary sample may of course list any
    // word the reader knows)
    expect(writer.seen[1].prompt).toContain('护照')
    expect(writer.seen[1].prompt).toContain('ask where it is')
    expect(writer.seen[1].prompt).not.toContain('suggest asking them')
    expect(writer.seen[1].prompt).not.toContain('they decide to ask next door')
  })

  it('retries a rejected piece ONCE with the exact violating words', async () => {
    const writer = gen('W', [
      J({ title: '重的护照' }),                       // 重 is HSK 4
      J({ title: '找护照' }),
      // The retry is a REPAIR now: this one deletes the offending modifier and
      // changes nothing else. (It used to answer with a different sentence
      // entirely, which the drift check no longer allows.)
      J({ sentence: '我的森林护照在哪里？' }),          // 森林 is HSK 4
      J({ sentence: '我的护照在哪里？' }),
      J({ anchors: ['找', '护照', '家'] }),
      J({ sentence: '我们去问邻居吧。' }),
      J({ anchors: ['问', '邻居', '去'] }),
      J({ anchors: ['邻居', '家', '看'] }),
      J({ anchors: ['护照', '给', '谢谢'] }),
      J({ anchors: ['我们', '去', '故事'] }),
    ])
    const r = await run(writer)
    expect(r.ok).toBe(true)
    expect(r.log.filter(x => x.piece === 'title').length).toBe(2)
    expect(writer.seen[1].prompt).toContain('YOUR PREVIOUS TITLE WAS REJECTED')
    expect(writer.seen[1].prompt).toContain('重')
    expect(writer.seen[3].prompt).toContain('森林')
    expect(writer.seen[3].prompt).toContain('REPAIR YOUR OWN SENTENCE')
  })

  it('TARGET_SCAFFOLD_FAILED after the second attempt — and no later target is attempted', async () => {
    const writer = gen('W', [
      J({ title: '找护照' }),
      J({ sentence: '我的护照在森林里。' }),
      J({ sentence: '我的护照在森林里面。' }),
    ])
    const r = await run(writer)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('TARGET_SCAFFOLD_FAILED')
    expect(r.failedAt).toEqual({ beat: 1, word: '护照' })
    expect(writer.seen.filter(s => s.kind === 'anchors').length).toBe(0)
  })

  it('BEAT_LEXICAL_SCAFFOLD_FAILED when a beat has no writable vocabulary', async () => {
    const writer = gen('W', [
      J({ title: '找护照' }),
      J({ sentence: '我的护照在哪里？' }),
      J({ anchors: ['扳手', '找', '家'] }),          // HSK 6
      J({ anchors: ['扳手', '找', '家'] }),
    ])
    const r = await run(writer)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('BEAT_LEXICAL_SCAFFOLD_FAILED')
    expect(r.failedAt).toEqual({ beat: 1 })
    expect(r.log.filter(x => x.piece === 'anchors').every(x => x.problems.join(' ').includes('扳手'))).toBe(true)
  })

  it('TITLE_SCAFFOLD_FAILED stops before any beat is touched', async () => {
    const writer = gen('W', [J({ title: 'Passport' }), J({ title: '重重重' })])
    const r = await run(writer)
    expect(r.code).toBe('TITLE_SCAFFOLD_FAILED')
    expect(writer.seen.length).toBe(2)
  })

  it('a provider error is a failed attempt, not a crash', async () => {
    const boom = { name: 'X', send: async () => { throw new Error('HTTP 500') } }
    const r = await run(boom)
    expect(r.code).toBe('TITLE_SCAFFOLD_FAILED')
    expect(r.log.every(x => !x.ok)).toBe(true)
  })
})

describe('the shape is locked', () => {
  const scaffold = {
    title: '找护照',
    beats: [
      { beat: 1, anchors: ['找', '护照', '家'], sketches: [{ word: '护照', usageSketch: '我的护照在哪里？' }] },
      { beat: 2, anchors: ['问', '邻居', '去'], sketches: [{ word: '邻居', usageSketch: '我们去问邻居吧。' }] },
      { beat: 3, anchors: ['邻居', '家', '看'], sketches: [] },
      { beat: 4, anchors: ['护照', '给', '谢谢'], sketches: [] },
      { beat: 5, anchors: ['我们', '去', '故事'], sketches: [] },
    ],
  }

  it('applyScaffold adds only the three lexical fields, rebuilt from the original shape', () => {
    const before = shape()
    const after = applyScaffold(before, scaffold)
    expect(shapeChanges(before, after)).toEqual([])
    expect(after.chineseTitle).toBe('找护照')
    expect(after.beats[0].chineseLexicalAnchors).toEqual(['找', '护照', '家'])
    expect(after.targetPlan[0].usageSketch).toBe('我的护照在哪里？')
    // and the finished plan passes the full lexical validation
    expect(validateBlueprint(after, { manifest: manifest(), vocabMap, requiredTargets: ['护照', '邻居'] }).ok).toBe(true)
  })

  it('a lexical stage cannot move a beat, rename a character or re-assign a target', () => {
    const before = shape()
    const rogue = { ...scaffold, beats: scaffold.beats.slice().reverse() }
    const after = applyScaffold(before, rogue)
    expect(after.beats.map(b => b.id)).toEqual([1, 2, 3, 4, 5])         // order comes from the shape
    expect(after.beats[0].chineseLexicalAnchors).toEqual(['找', '护照', '家'])
    expect(shapeChanges(before, after)).toEqual([])
  })

  it('shapeChanges names exactly what moved', () => {
    const before = shape()
    const moved = applyScaffold(before, scaffold)
    moved.beats[1] = { ...moved.beats[1], where: '邻居家' }
    moved.cast = ['李明', '小明']
    expect(shapeChanges(before, moved).sort()).toEqual(['beat 2.where', 'cast'])
  })

  it('checkTitle applies the story\'s own vocabulary rules', () => {
    const m = manifest()
    expect(checkTitle('找护照', { manifest: m, vocabMap }).ok).toBe(true)
    expect(checkTitle('Passport', { manifest: m, vocabMap }).problems.join(' ')).toContain('Latin')
    expect(checkTitle('森林的故事', { manifest: m, vocabMap }).problems.join(' ')).toContain('above-level')
    // One character is a valid title — 岛 and 疼 are published — so the length
    // rule only catches an over-long one now.
    expect(checkTitle('找', { manifest: m, vocabMap }).ok).toBe(true)
    expect(checkTitle('找'.repeat(13), { manifest: m, vocabMap }).problems.join(' ')).toContain('characters')
    expect(SCAFFOLD_VERSION).toBe('fab9-scaffold@6')
  })
})

// ── a3-final-2: the three demonstrated scaffold defects ─────────────────────
// Vocabulary and glosses verbatim from the canonical table.
describe('the lexical scaffold, after a3-final-2', () => {
  const ROWS = [
    ['后来', 3, 'afterwards; later'], ['门口', 3, 'doorway; gate'], ['女人', 3, 'woman'],
    ['男人', 3, 'a man; a male'], ['拿', 2, 'to take, to hold'], ['不用', 2, 'need not'],
    ['重', 4, 'to repeat; repetition'], ['人', 1, 'person; people'], ['大', 1, 'big'],
    ['搬', 3, 'to move (i.e. relocate oneself); to move (sth relatively heavy or bulky)'],
    ['那个', 1, 'that one'], ['来', 1, 'to come'], ['了', 1, '(completed action marker)'],
    ['爸爸', 1, 'father; dad'], ['楼', 3, 'building; floor'], ['箱子', 3, 'suitcase; chest'],
    ['帮助', 3, 'assistance; aid; to help; to assist'], ['需要', 3, 'to need; to require'],
    ['是', 1, 'to be'], ['的', 1, 'of'], ['很', 1, 'very'], ['累', 2, 'tired, to tire'],
    ['这个', 1, 'this one'], ['我', 1, 'I; me'], ['你', 1, 'you'], ['吗', 1, '(question particle)'],
  ]
  const vm = Object.fromEntries(ROWS.map(([word, level, meaning]) => [word, { word, level, meaning }]))
  const m = () => buildManifest({ batchId: 'c', seq: 1, level: 3, targets: ['女人', '男人'], defaults: { lines: [14, 38] } })
  // Plan C's own beats, frozen.
  const plan = () => ({
    title: 'A heavy box in the lobby', setting: 'An apartment building', cast: ['李明', '小红'],
    problem: 'the box is too heavy for one person', incitingEvent: 'she cannot lift it',
    resolution: 'they carry it up together',
    beats: [
      { id: 1, when: 'afternoon', where: 'lobby', what: 'Xiao Hong stands with a large green box. She looks tired.', because: 'the story opens', targets: ['女人'], lines: 14 },
      { id: 2, when: 'later', where: 'lobby', what: 'Li Ming walks into the lobby and sees the woman with the box.', because: 'he is coming home', targets: ['男人'], lines: 14 },
    ],
    targetPlan: [
      { word: '女人', beat: 1, why: 'she is the woman with the box', speaker: '李明', refersTo: 'Xiao Hong', intent: 'describe who is waiting' },
      { word: '男人', beat: 2, why: 'he is the man who arrives', speaker: '小红', refersTo: 'Li Ming', intent: 'describe who came' },
    ],
  })

  it('1. drops one invalid anchor and accepts the other five', () => {
    // The verbatim a3-final-2 set: 很重 is invalid because 重 is HSK 4.
    const frozen = frozenTokens({ blueprint: plan(), manifest: m() })
    const proposed = ['后来', '门口', '女人', '拿', '很重', '不用']
    const kept = proposed.filter(w => !fragmentOf(w, frozen)
      && checkAnchor(w, { manifest: m(), vocabMap: vm, cast: plan().cast }).ok)
    expect(kept).toEqual(['后来', '门口', '女人', '拿', '不用'])
    expect(kept.length).toBeGreaterThanOrEqual(ANCHOR_BOUNDS.min)
  })

  it('3. a piece of a cast name is not a word choice', () => {
    const frozen = frozenTokens({ blueprint: plan(), manifest: m() })
    expect(frozen).toContain('李明')
    expect(fragmentOf('李', frozen)).toBe('李明')
    expect(fragmentOf('明', frozen)).toBe('李明')
    expect(fragmentOf('李明', frozen)).toBeNull()
  })

  it('4. a piece of a target word is not a replacement for it', () => {
    const frozen = frozenTokens({ blueprint: plan(), manifest: m() })
    // 人 is a perfectly good HSK 1 word, and still not a substitute for 女人.
    expect(checkAnchor('人', { manifest: m(), vocabMap: vm, cast: plan().cast }).ok).toBe(true)
    expect(fragmentOf('人', frozen)).toBe('女人')
    expect(fragmentOf('女', frozen)).toBe('女人')
  })

  it('5. a sketch may not hire a new person', () => {
    // Verbatim from a3-final-2, and it passed every vocabulary rule.
    const r = checkSketchCast('李明的爸爸是大男人', { word: '男人', beat: plan().beats[1], blueprint: plan(), manifest: m(), vocabMap: vm })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('爸爸')
  })

  it('6. a sketch using only the people the plan has is fine', () => {
    const beat1 = plan().beats[0]
    expect(checkSketchCast('这个女人很累', { word: '女人', beat: beat1, blueprint: plan(), manifest: m(), vocabMap: vm }).ok).toBe(true)
    // A person word that is a target is allowed where the beat already has
    // that person — beat 2's text says "sees the woman" — and nowhere else.
    expect(checkSketchCast('女人需要帮助', { word: '需要', beat: plan().beats[1], blueprint: plan(), manifest: m(), vocabMap: vm }).ok).toBe(true)
    expect(checkSketchCast('女人需要帮助', { word: '需要', beat: { what: 'Li Ming opens his own door', because: 'he is home' }, blueprint: plan(), manifest: m(), vocabMap: vm }).ok).toBe(false)
  })

  const anchorRun = (writer) => buildLexicalScaffold({
    blueprint: plan(), manifest: m(), vocabMap: vm, pool: Object.values(vm).filter(v => v.level <= 3), writer,
    buildTitlePrompt: titlePrompt, parseTitle,
    buildSketchPrompt: targetSketchPrompt, parseSketch,
    buildAnchorsPrompt: beatAnchorsPrompt, parseAnchors,
  })

  it('1b. end to end: the five survivors become the beat’s anchors, with no retry', async () => {
    const w = gen('qwen', [
      J({ title: '搬箱子' }),
      J({ sentence: '这个女人很累' }),
      J({ anchors: ['后来', '门口', '女人', '拿', '很重', '不用'] }),
      J({ sentence: '那个男人来了' }),
      J({ anchors: ['楼', '箱子', '拿', '后来'] }),
    ])
    const r = await anchorRun(w)
    expect(r.ok).toBe(true)
    expect(r.beats[0].anchors).toEqual(['后来', '门口', '女人', '拿', '不用'])
    const attempts = r.log.filter(l => l.piece === 'anchors' && l.beat === 1)
    expect(attempts).toHaveLength(1)
    expect(attempts[0].dropped).toEqual([{ word: '很重', reason: expect.stringContaining('HSK 4') }])
  })

  it('2. fewer than three survivors still gets exactly one retry', async () => {
    const w = gen('qwen', [
      J({ title: '搬箱子' }),
      J({ sentence: '这个女人很累' }),
      // The a3-final-2 retry, verbatim: the cast name and the target, in pieces.
      J({ anchors: ['李', '明', '女', '人', '拿', '包'] }),
      J({ anchors: ['后来', '门口', '拿', '不用'] }),
      J({ sentence: '那个男人来了' }),
      J({ anchors: ['楼', '箱子', '拿', '后来'] }),
    ])
    const r = await anchorRun(w)
    expect(r.ok).toBe(true)
    const attempts = r.log.filter(l => l.piece === 'anchors' && l.beat === 1)
    expect(attempts).toHaveLength(2)
    expect(attempts[0].ok).toBe(false)
    expect(attempts[0].dropped.map(d => d.word)).toEqual(['李', '明', '女', '人', '包'])
    expect(attempts[0].dropped.find(d => d.word === '人').reason).toContain('女人')
    expect(r.beats[0].anchors).toEqual(['后来', '门口', '拿', '不用'])
  })

  it('an accepted anchor log carries the survivors, so a resume replays those', async () => {
    // The resume path reads the log: it must find the ACCEPTED set there, or
    // it puts the dropped words back and the resumed run dies on them.
    const w = gen('qwen', [
      J({ title: '搬箱子' }),
      J({ sentence: '这个女人很累' }),
      J({ anchors: ['后来', '门口', '女人', '拿', '很重', '不用'] }),
      J({ sentence: '那个男人来了' }),
      J({ anchors: ['楼', '箱子', '拿', '后来'] }),
    ])
    const r = await anchorRun(w)
    const entry = r.log.find(l => l.piece === 'anchors' && l.beat === 1 && l.ok)
    expect(entry.kept).toEqual(['后来', '门口', '女人', '拿', '不用'])
    expect(entry.output).toContain('很重')
    expect(entry.kept).not.toContain('很重')
    expect(r.beats[0].anchors).toEqual(entry.kept)
  })

  it('2b. and stops after that one retry, as before', async () => {
    const w = gen('qwen', [
      J({ title: '搬箱子' }),
      J({ sentence: '这个女人很累' }),
      J({ anchors: ['李', '明', '女', '人'] }),
      J({ anchors: ['李', '明'] }),
    ])
    const r = await anchorRun(w)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('BEAT_LEXICAL_SCAFFOLD_FAILED')
    expect(r.failedAt).toEqual({ beat: 1 })
  })
})

// writer-bake-2 lost a realization to "天要下雨，我需要一把伞。" — good HSK 3
// Chinese for "it's going to rain, I need an umbrella" — because 把 is glossed
// "to hold; to grasp; to hold a baby in position for defecation; classifier for
// objects with a handle", and testing the whole gloss for a person-word found
// "baby". The measure word in "一把伞" became an uninvited character.
describe('a word names a person only when a person IS one of its senses', () => {
  const mk = (o) => Object.fromEntries(Object.entries(o).map(([w, v]) => [w, { word: w, ...v }]))
  const vocabMap = mk({
    把: { level: 3, meaning: 'to hold; to grasp; to hold a baby in position for defecation; classifier for objects with a handle' },
    伞: { level: 3, meaning: 'umbrella; parasol' },
    我: { level: 1, meaning: 'I' }, 的: { level: 1, meaning: 'of' }, 一: { level: 1, meaning: 'one' },
    需要: { level: 3, meaning: 'to need' }, 天: { level: 1, meaning: 'day; sky' },
    要: { level: 1, meaning: 'to want' }, 下雨: { level: 1, meaning: 'to rain' },
    朋友: { level: 1, meaning: 'friend' }, 爸爸: { level: 1, meaning: 'dad; father' },
    同学: { level: 2, meaning: 'classmate; fellow student' },
  })
  const check = (text) => checkSketchCast(text, {
    word: '需要',
    beat: { what: 'Li Ming needs an umbrella', because: 'it is raining' },
    blueprint: { cast: ['李明', '小红'] },
    manifest: { level: 3 },
    vocabMap,
  })

  it('a person mentioned inside a long sense does not make the word a character', () => {
    const r = check('天要下雨，我需要一把伞。')
    expect(r.ok, JSON.stringify(r.intruders)).toBe(true)
  })

  it('a word whose sense IS a person is still caught', () => {
    for (const [text, who] of [['我的朋友需要伞。', '朋友'], ['我的爸爸需要伞。', '爸爸'], ['我的同学需要伞。', '同学']]) {
      const r = check(text)
      expect(r.ok, text).toBe(false)
      expect(r.intruders, text).toContain(who)
    }
  })

  it('a two-word person sense counts — "fellow student" is a person', () => {
    // 同学's second sense is two words; only a long sense is treated as
    // mentioning rather than meaning.
    expect(check('我的同学需要伞。').intruders).toContain('同学')
  })
})

// writer-bake-4 rejected the title 李明和小红 with "1 characters (need 2-12)".
// analyzeStory skips name tokens — correctly, a name is not vocabulary — so
// cjkChars counted only 和. The bound is about how long the title is.
describe('title length is the length of the title', () => {
  const mk = (o) => Object.fromEntries(Object.entries(o).map(([w, v]) => [w, { word: w, ...v }]))
  const vocabMap = mk({
    和: { level: 1, meaning: 'and' }, 伞: { level: 3, meaning: 'umbrella' },
    的: { level: 1, meaning: 'of' }, 天: { level: 1, meaning: 'day' },
  })
  const manifest = { level: 3, targets: [], speakers: ['李明', '小红'] }

  it('counts the characters a reader sees, names included', () => {
    const r = checkTitle('李明和小红', { manifest, vocabMap })
    expect(r.problems.join(' ')).not.toMatch(/characters \(need/)
  })

  it('accepts a one-character title, because the corpus already ships them', () => {
    // 岛 ("island") and 疼 ("pain") are published story titles today. The
    // minimum of 2 was an accidental validator assumption, not a product rule,
    // and it discarded an otherwise valid story titled 伞 ("umbrella").
    expect(checkTitle('伞', { manifest, vocabMap }).problems.join(' ')).not.toMatch(/characters \(need/)
  })

  it('rejects an empty title', () => {
    expect(checkTitle('', { manifest, vocabMap }).problems).toContain('no title')
  })

  it('still rejects a title that is genuinely too long', () => {
    const long = '天'.repeat(20)
    expect(checkTitle(long, { manifest, vocabMap }).problems.join(' ')).toMatch(/20 characters/)
  })
})
