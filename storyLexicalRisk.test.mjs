import { describe, it, expect } from 'vitest'
import {
  assessShapeRisk, assessBeatRisk, conceptsFromBeat, buildGlossIndex, buildFullGlossIndex,
  conceptSupport, buildSenseSynonyms, buildInLevelWords, componentHead,
  validateGlossCorpus, GlossCorpusError, glossSenses, senseCompatible, beatConceptPos,
  assessShapeRisk as assessShape, classifyConcept, assistCost, withPolicy, assistKey,
  suffixClass, inflectionCompatible, ASSIST, FEASIBILITY, ASSISTED_POLICY,
  RISK, RISK_VERSION,
} from './storyLexicalRisk.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

// A slice of the real in-level dictionary, glosses exactly as stored.
const VOCAB = [
  ['帮', 2, 'to help'], ['帮忙', 2, 'to help'], ['帮助', 3, 'assistance; aid; to help; to assist'],
  ['看', 1, 'to see, to look'], ['看见', 1, 'to see'], ['找', 1, 'to look for'], ['说', 1, 'to speak, to say'],
  ['说话', 1, 'to talk'], ['问', 1, 'to ask'], ['回答', 3, 'to reply; to answer; reply; answer'],
  ['一起', 2, 'together'], ['朋友', 1, 'friend'], ['邻居', 3, 'neighbor; next door'],
  ['自行车', 3, 'bicycle; bike'], ['车', 1, 'vehicle, car'], ['坏', 2, 'bad, broken'],
  ['箱子', 3, 'suitcase; chest'], ['拿', 2, 'to take, to hold'], ['放', 3, 'to put; to place'],
  ['重要', 3, 'important; significant'], ['难', 3, 'difficult (to...); problem'],
  ['晚上', 1, 'evening'], ['晚', 1, 'late'], ['天', 1, 'day'], ['时间', 1, 'time'],
  ['学校', 1, 'school'], ['作业', 3, 'school assignment; homework'], ['同学', 1, 'classmate'],
  ['吃', 1, 'to eat'], ['饭', 1, 'cooked rice, meal'], ['家', 1, 'home, family'], ['门', 2, 'door, gate'],
  ['楼梯', 3, 'stair; staircase'], ['书', 1, 'book'], ['笔', 2, 'pen, (measure word for writing tools)'],
  ['雨', 1, 'rain'], ['伞', 3, 'umbrella; parasol'], ['走', 2, 'to walk'], ['等', 2, 'to wait, (and so on, until)'],
  ['真', 1, 'really, true'], ['关于', 3, 'pertaining to; concerning'], ['后面', 2, 'behind, back'],
  ['住', 1, 'to live, to reside'], ['生活', 3, 'to live; life'], ['能', 1, 'can, be able to'],
  ['高兴', 1, 'happy, glad'], ['人', 1, 'person'], ['敲', 4, 'to knock'],
  // above level — present in the dictionary, absent from the reader
  ['链子', 5, 'chain'], ['轮子', 4, 'wheel'], ['黑', 5, 'black; dark'], ['梯子', 5, 'ladder'],
  ['金属', 6, 'metal'], ['修理', 4, 'to repair'], ['耐心', 4, 'patient; patience'],
]
const vocabMap = Object.fromEntries(VOCAB.map(([word, level, meaning]) => [word, { word, level, meaning }]))
const manifest = () => buildManifest({ batchId: 'k', seq: 1, level: 3, targets: ['帮助', '关系'], defaults: { lines: [14, 38] } })

// `because` carries real content in a real plan; filler here would show up as
// a gap of its own. MEDIUM and LOW both proceed — only HIGH blocks — so the
// boundary between them is descriptive, not a decision.
const beat = (id, what, over = {}) => ({ id, when: 'that afternoon', where: 'the street', what, because: 'they walk to school every day', targets: [], lines: 5, ...over })
const risk = (what, over = {}) => assessBeatRisk({ beat: beat(1, what, over), manifest: manifest(), vocabMap, names: ['李明', '小红', 'Li Ming', 'Xiao Hong', 'Xiao Ming'] })

describe('lexical risk — what a beat IS versus what it mentions', () => {
  // The exact beat that scaffolded fine once the writer dropped the clause.
  it('MEDIUM when only an incidental detail lacks vocabulary', () => {
    const r = risk('Xiao Ming says he really needs help because it is getting dark. Li Ming says they can look together.')
    expect(r.risk).toBe(RISK.MEDIUM)
    expect(r.coreMissing).toEqual([])
    expect(r.incidentalMissing).toContain('dark')
    // Wording changed with the assisted-vocabulary model; the substance is the
    // same — the beat itself is sayable and only decoration is out of level.
    expect(r.reason).toContain('the beat does not need it')
  })

  // The exact beat that ran out of words after two attempts.
  it('HIGH when the beat\'s own action and objects are missing', () => {
    const r = risk('Li Ming and Xiao Hong help Xiao Ming put the chain back on. Xiao Hong holds the wheel, Li Ming fixes the metal links.')
    expect(r.risk).toBe(RISK.HIGH)
    expect(r.coreMissing).toContain('chain')
    // "links" is not in the dictionary at any level, so it is not counted as a
    // gap; 轮子 and 金属 are, and they are what makes this beat untellable
    expect([...r.supportingMissing]).toEqual(expect.arrayContaining(['wheel', 'metal']))
  })

  it('LOW for an everyday scene the reader has words for', () => {
    const r = risk('Li Ming asks his classmate about the homework. They walk to school together.')
    expect([RISK.LOW, RISK.MEDIUM]).toContain(r.risk)
    expect(r.coreMissing).toEqual([])
    expect(r.supportingMissing).toEqual([])
  })

  it('MEDIUM, not HIGH, when one central concept is missing but the rest is sayable', () => {
    const r = risk('Xiao Hong opens her umbrella and they wait by the door.')
    expect([RISK.LOW, RISK.MEDIUM]).toContain(r.risk)
  })

  it('character names are not concepts', () => {
    const c = conceptsFromBeat(beat(1, 'Li Ming and Xiao Hong talk about the book.'), [], { names: ['李明', 'Li Ming', 'Xiao Hong'] })
    expect(c.core).not.toContain('li')
    expect(c.core).not.toContain('ming')
    expect(c.core).toContain('book')
  })

  it('the first sentence is core; later sentences support; subordinate clauses are incidental', () => {
    const c = conceptsFromBeat(
      beat(1, 'She carries the suitcase upstairs because the elevator is broken. He waits at the door.'),
      [], { names: [] })
    expect(c.core).toContain('suitcase')
    expect(c.incidental).toContain('elevator')      // after "because"
    expect(c.supporting).toContain('waits')
  })
})

describe('gloss index and support', () => {
  const index = buildGlossIndex(vocabMap, 3)

  it('a concept is supported when an in-level gloss uses it, and names the words', () => {
    expect(conceptSupport('help', index).support).toBe('supported')
    expect(conceptSupport('help', index).words).toEqual(expect.arrayContaining(['帮']))
    expect(conceptSupport('bicycle', index).support).toBe('supported')
    expect(conceptSupport('evening', index).support).toBe('supported')
  })

  it('a concept with no in-level gloss is none — however common it sounds', () => {
    for (const missing of ['chain', 'wheel', 'ladder', 'kite']) {
      expect(conceptSupport(missing, index).support, missing).toBe('none')
    }
  })

  it('the index only ever contains in-level words', () => {
    expect(conceptSupport('dark', index).support).toBe('none')
    expect(index.get('dark')).toBeUndefined()
  })

  // The dataset is a learner vocabulary list, not a dictionary of the
  // language: chain, wheel and thud are absent from it entirely. Absent is a
  // gap — treating it as "not a lexical concept" discarded exactly the words
  // that make a beat untellable.
  it('a word the reader does not have is a gap, whether or not the list has it above level', () => {
    const full = buildFullGlossIndex(vocabMap)
    expect(conceptSupport('really', index, full).support).toBe('supported')       // 真, in level
    expect(conceptSupport('chain', index, full).support).toBe('none')
    expect(conceptSupport('chain', index, full).words).toContain('链子')           // evidence, above level
    expect(conceptSupport('wheel', index, full).support).toBe('none')
    expect(conceptSupport('thud', index, full).support).toBe('none')              // absent everywhere
    expect(conceptSupport('thud', index, full).words).toEqual([])
  })

  // a32-fresh-1 rejected a good shape on "cannot", "someone", "alone" and
  // "living" — three are function words and the fourth is 住 (to live).
  it('function words are not lexical gaps, and inflections reach their word', () => {
    const full = buildFullGlossIndex(vocabMap)
    const c = conceptsFromBeat(
      { what: 'Someone knocks and he cannot carry it alone to the living room. Each of them waits.' }, [], { names: [] })
    for (const functional of ['someone', 'cannot', 'alone', 'each']) {
      expect([...c.core, ...c.supporting, ...c.incidental], functional).not.toContain(functional)
    }
    // and an inflected form finds its own word
    expect(conceptSupport('living', index, full).support).toBe('supported')      // 住 / 生活
    expect(conceptSupport('walking', index, full).support).toBe('supported')     // 走
    // while a real gap stays a gap
    expect(conceptSupport('knocks', index, full).support).toBe('none')
  })

  it('the cast is not vocabulary, however the English plan spells it', () => {
    const c = conceptsFromBeat(
      { what: 'Li Ming and Xiao Hong help Xiao Ming put the chain back on.' }, [], { names: ['李明', '小红'] })
    for (const name of ['li', 'ming', 'xiao', 'hong']) expect(c.core, name).not.toContain(name)
    expect(c.core).toContain('chain')
  })
})

describe('assessShapeRisk', () => {
  const shape = (beats) => ({ cast: ['李明', '小红'], beats, targetPlan: [] })

  it('one HIGH beat makes the shape HIGH, and names what to avoid', () => {
    const r = assessShapeRisk({
      blueprint: shape([
        beat(1, 'Li Ming walks to school with his classmate.'),
        beat(2, 'They put the chain back on the wheel and fix the metal links.'),
      ]),
      manifest: manifest(), vocabMap,
    })
    expect(r.risk).toBe(RISK.HIGH)
    expect(r.highBeats).toEqual([2])
    expect(r.blocking).toEqual(expect.arrayContaining(['chain']))
    expect(r.version).toBe(RISK_VERSION)
  })

  it('a shape of everyday beats is LOW and blocks nothing', () => {
    const r = assessShapeRisk({
      blueprint: shape([
        beat(1, 'Li Ming asks his classmate for help with the homework.'),
        beat(2, 'They eat a meal at home and talk about school.'),
      ]),
      manifest: manifest(), vocabMap,
    })
    expect(r.risk).not.toBe(RISK.HIGH)
    expect(r.blocking).toEqual([])
    expect(r.beats.every(b => b.coreMissing.length === 0)).toBe(true)
  })
})

// ── The a3-final-1 false-negative class ─────────────────────────────────────
// Every gloss below is verbatim from the canonical vocabulary table. The bug:
// a concept was called unsupported whenever the gloss happened to use a
// different English word for it.
describe('conceptSupport — different wording is not a lexical gap', () => {
  const ROWS = [
    ['大', 1, 'big'],
    ['拿', 2, 'to take, to hold'],
    ['花', 2, 'to spend (money or time), flower, (colorful)'],
    ['提高', 3, 'to raise; to increase'],
    ['起', 3, 'to rise; to raise'],
    ['搬', 3, 'to move (i.e. relocate oneself); to move (sth relatively heavy or bulky)'],
    ['抬', 4, 'to lift; to raise'],
    ['抱', 4, 'to hold; to carry (in one\'s arms)'],
    ['掉', 4, 'to fall; to drop'],
    ['大型', 5, 'large; large-scale'],
    ['奋斗', 5, 'to strive; to struggle'],
    ['汗水', 5, 'sweat; perspiration'],
    ['轮子', 6, 'wheel; (derog.) Falun Gong practitioner'],
  ]
  const vocabMap = Object.fromEntries(ROWS.map(([word, level, meaning]) => [word, { level, meaning }]))
  const LEVEL = 3
  const index = buildGlossIndex(vocabMap, LEVEL)
  const fullIndex = buildFullGlossIndex(vocabMap)
  const synonyms = buildSenseSynonyms(vocabMap)
  const inLevelWords = buildInLevelWords(vocabMap, LEVEL)
  const support = (concept) => conceptSupport(concept, index, fullIndex, { synonyms, inLevelWords })

  it('synonym wording: "large" is sayable because 大 is', () => {
    // 大 is glossed "big", so exact overlap never found it.
    expect(support('big').support).toBe('supported')
    const large = support('large')
    expect(large.support).toBe('supported')
    expect(large.via).toBe('component')
    expect(large.words).toContain('大')
  })

  it('compatible action wording: "carry" and "lift" are sayable', () => {
    const carry = support('carry')
    const lift = support('lift')
    expect(carry.support).toBe('supported')
    expect(lift.support).toBe('supported')
    // Both arrive through a synonym the dataset itself declares —
    // 抱 "to hold; to carry", 抬 "to lift; to raise".
    expect([carry.via, lift.via]).toEqual(['synonym', 'synonym'])
    expect(carry.synonym).toBe('hold')
    expect(lift.synonym).toBe('raise')
  })

  it('morphology: inflected forms reach the same evidence', () => {
    expect(support('carrying').support).toBe('supported')
    expect(support('lifted').support).toBe('supported')
    expect(support('raises').support).toBe('supported')
  })

  it('a genuine gap stays a gap, with the evidence for it', () => {
    // The language has these words; the reader does not have them.
    for (const concept of ['wheel', 'struggle', 'sweat', 'fall']) {
      const r = support(concept)
      expect(r.support, concept + ' must stay unsupported').toBe('none')
      expect(r.via, concept).toBe('above-level')
    }
    expect(support('wheel').words).toContain('轮子')
  })

  it('the component bridge needs the HEAD, not any shared character', () => {
    // 轮子 is wheel; even with 子 in level, 轮 is not a word the reader has.
    const withSuffix = buildInLevelWords({ ...vocabMap, 子: { level: 1, meaning: 'child' } }, LEVEL)
    expect(componentHead('轮子', withSuffix)).toBeNull()
    expect(componentHead('大型', inLevelWords)).toBe('大')
  })

  it('senses of different parts of speech are not synonyms', () => {
    // 花 is "to spend (money or time), flower": spending is not flowering,
    // and one being in level must not make the other sayable.
    expect([...(synonyms.get('spend') || [])]).not.toContain('flower')
    expect([...(synonyms.get('flower') || [])]).not.toContain('spend')
  })

  it('a concept the dictionary has never heard of is still not supported', () => {
    const r = support('thud')
    expect(r.support).toBe('none')
    expect(r.via).toBe('absent')
  })
})

describe('corpus integrity — a gate without evidence must refuse', () => {
  const beat = { id: 1, what: 'Li Ming carries a large box up the stairs.', because: 'the story opens' }
  const manifest = buildManifest({ id: 'x', level: 3, language: 'chinese', targets: [{ word: '帮助', min: 2, max: 4 }], speakers: ['李明'] })

  it('rejects a dump whose glosses are all "undefined"', () => {
    // Exactly the stale local dump that rated five of six beats HIGH.
    const stale = Object.fromEntries(['大', '拿', '搬', '门'].map(w => [w, { level: 2, meaning: 'undefined' }]))
    const v = validateGlossCorpus(stale)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/gloss/i)
    expect(() => assessShapeRisk({ blueprint: { beats: [beat], cast: ['李明'] }, manifest, vocabMap: stale }))
      .toThrow(GlossCorpusError)
  })

  it('rejects an empty vocabulary rather than calling everything impossible', () => {
    expect(validateGlossCorpus({}).ok).toBe(false)
    expect(() => assessShapeRisk({ blueprint: { beats: [beat], cast: ['李明'] }, manifest, vocabMap: {} }))
      .toThrow(GlossCorpusError)
  })

  it('accepts a corpus that actually carries glosses', () => {
    const good = { 大: { level: 1, meaning: 'big' }, 拿: { level: 2, meaning: 'to take, to hold' } }
    expect(validateGlossCorpus(good)).toMatchObject({ ok: true, glossed: 2, total: 2 })
  })
})

// ── a3-H-2: a noun answered by a verb of the same spelling ──────────────────
describe('direct gloss support agrees on part of speech', () => {
  // Glosses verbatim from the canonical table.
  const ROWS = [
    ['累', 2, 'tired, to tire'],
    ['自行车', 3, 'bicycle; bike'],
    ['车', 1, 'vehicle, car'],
    ['帮助', 3, 'assistance; aid; to help; to assist'],
    ['站', 3, 'to stand; station'],
    ['工作', 3, 'work; job; to work'],
    ['大', 1, 'big'],
  ]
  const vm = Object.fromEntries(ROWS.map(([word, level, meaning]) => [word, { word, level, meaning }]))
  const index = buildGlossIndex(vm, 3)
  const full = buildFullGlossIndex(vm)
  const opts = (pos) => ({ synonyms: buildSenseSynonyms(vm), inLevelWords: buildInLevelWords(vm, 3), pos })
  const support = (concept, pos) => conceptSupport(concept, index, full, opts(pos))

  it('the bug: a bicycle tire is not supported by 累 "tired, to tire"', () => {
    expect(support('tire', 'noun')).toMatchObject({ support: 'none', via: 'absent' })
    // and the plan's own sentence is what marks it a noun
    expect(beatConceptPos('李明 sees the flat tire and realizes he needs help').get('tire')).toBe('noun')
  })

  it('the same entry still answers the state it really means', () => {
    expect(support('tired', null).words).toContain('累')
    expect(support('tire', 'verb').words).toContain('累')
  })

  it('a multi-POS entry answers BOTH of its senses', () => {
    // 站 is "to stand; station" — a verb and a noun, and each is available.
    expect(support('stand', 'verb').words).toContain('站')
    expect(support('station', 'noun').words).toContain('站')
    expect(support('work', 'noun').words).toContain('工作')
    expect(support('work', 'verb').words).toContain('工作')
  })

  it('a verb is not answered by a noun-only sense', () => {
    expect(support('bike', 'noun').words).toContain('自行车')
    expect(support('bike', 'verb')).toMatchObject({ support: 'none' })
  })

  it('a trailing -s is a plural, not a verb', () => {
    // census-4 charged 邻居 (HSK 3) and 谢谢 (HSK 1) against the assisted budget
    // because "neighbors" and "thanks" end in -s and were read as verbs.
    const pos = beatConceptPos('They chat about how friendly neighbors are and he thanks her.')
    expect(pos.get('neighbors')).toBeUndefined()
    expect(pos.get('thanks')).toBeUndefined()
    // -ing and -ed still mark a verb
    const p2 = beatConceptPos('He is carrying the box and dropped it.')
    expect(p2.get('carrying')).toBe('verb')
    expect(p2.get('dropped')).toBe('verb')
  })

  it('an unmarked concept is not blocked — "he needs help" still reaches 帮助', () => {
    expect(beatConceptPos('李明 realizes he needs help').get('help')).toBeUndefined()
    expect(support('help', null).words).toContain('帮助')
  })

  it('reads senses and their part of speech once, for everyone', () => {
    expect(glossSenses('tired, to tire')).toEqual([
      { text: 'tired', verb: false, tokens: expect.any(Array) },
      { text: 'tire', verb: true, tokens: expect.any(Array) },
    ])
    expect(senseCompatible('noun', { verb: true })).toBe(false)
    expect(senseCompatible('verb', { verb: true })).toBe(true)
    expect(senseCompatible('unknown', { verb: true })).toBe(true)
    expect(senseCompatible(null, { verb: false })).toBe(true)
  })

  it('a word the story TEACHES is available to it, whatever the gloss marks', () => {
    // C beat 4 reads "Xiao Hong accepts the help and thanks him". 帮助 is
    // glossed "assistance; aid; to help; to assist", so the noun matched only
    // its verbal sense — and 帮助 is this story's own target word.
    const asTarget = { ...opts('noun'), targets: new Set(['帮助']) }
    expect(conceptSupport('help', index, full, asTarget).words).toContain('帮助')
    // and the exemption does not rescue the tire: 累 is nobody's target
    expect(conceptSupport('tire', index, full, asTarget)).toMatchObject({ support: 'none' })
  })

  it('the beat that started this treats the tire as ASSISTED, not in level', () => {
    const beat = { id: 1, what: '李明 sees the flat tire and realizes he needs help', because: 'the story opens' }
    const r = assessBeatRisk({
      beat, manifest: buildManifest({ batchId: 'h', seq: 1, level: 3, targets: ['帮助'], defaults: { lines: [14, 38] } }),
      vocabMap: vm, index, fullIndex: full, names: ['李明'],
    })
    const tire = r.core.find(c => c.concept === 'tire')
    expect(tire.assist.kind).toBe('ASSISTED_OOL')
    expect(tire.assist.word).toBeNull()          // 轮胎 is not in the learner list
    // and one natural central noun does not make the beat unwritable
    expect(r.risk).not.toBe(RISK.HIGH)
  })
})

// ── Comprehensibility, not purity (2026-08-26) ──────────────────────────────
describe('assisted vocabulary — a tapped word is not a defect', () => {
  const ROWS = [
    ['自行车', 3, 'bicycle; bike'], ['车', 1, 'vehicle, car'], ['坏', 2, 'bad, broken'],
    ['帮助', 3, 'assistance; aid; to help; to assist'], ['修理', 4, 'to repair; to fix'],
    ['工具', 4, 'tool'], ['楼下', 3, 'downstairs'], ['轮子', 6, 'wheel'],
    ['朋友', 1, 'friend'], ['看', 1, 'to see, to look'], ['大', 1, 'big'],
  ]
  const vm = Object.fromEntries(ROWS.map(([word, level, meaning]) => [word, { word, level, meaning }]))
  const manifest = () => buildManifest({ batchId: 'x', seq: 1, level: 3, targets: ['帮助'], defaults: { lines: [14, 38] } })
  const shape = (beats) => ({ cast: ['李明'], beats, targetPlan: [] })

  it('classifies a word above the level as assisted, with its distance', () => {
    const r = classifyConcept({ support: 'none', via: 'above-level', words: ['修理'] }, { vocabMap: vm, level: 3 })
    expect(r).toMatchObject({ kind: ASSIST.ASSISTED, word: '修理', wordLevel: 4, distance: 1, offList: false, cost: 1 })
    const far = classifyConcept({ support: 'none', via: 'above-level', words: ['轮子'] }, { vocabMap: vm, level: 3 })
    expect(far).toMatchObject({ distance: 3, cost: 4 })
  })

  it('charges distance: HSK+1 costs less than HSK+3', () => {
    expect(assistCost({ kind: ASSIST.ASSISTED, distance: 1 })).toBeLessThan(assistCost({ kind: ASSIST.ASSISTED, distance: 3 }))
    expect(assistCost({ kind: ASSIST.IN_LEVEL })).toBe(0)
  })

  it('a word the learner list does not carry at all is assisted, and charged like the far end', () => {
    // 轮胎 is not in HSK at any level; the language still has the word.
    const r = classifyConcept({ support: 'none', via: 'absent', words: [] }, { vocabMap: vm, level: 3 })
    expect(r).toMatchObject({ kind: ASSIST.ASSISTED, offList: true, word: null, cost: ASSISTED_POLICY.offListCost })
  })

  it('a substring coincidence never counts as in level', () => {
    // census-5 called "downstairs" in-level because 楼梯 is glossed
    // "stair; staircase" and the strings overlap.
    const near = { 楼梯: { word: '楼梯', level: 3, meaning: 'stair; staircase' } }
    const idx = buildGlossIndex(near, 3)
    const support = conceptSupport('downstairs', idx, buildFullGlossIndex(near), {
      synonyms: buildSenseSynonyms(near), inLevelWords: buildInLevelWords(near, 3),
    })
    expect(support.support).toBe('weak')
    const r = classifyConcept(support, { vocabMap: near, level: 3 })
    expect(r.kind).toBe(ASSIST.ASSISTED)
    expect(r.offList).toBe(true)
    expect(r.source).toBe('weak-match')
    expect(r.nearest).toBe('楼梯')
    expect(r.cost).toBe(ASSISTED_POLICY.offListCost)
  })

  it('one natural central noun above the level keeps the plan usable', () => {
    const r = assessShape({
      blueprint: shape([{ id: 1, what: '李明 sees the broken bike and needs help', because: 'the story opens' }]),
      manifest: manifest(), vocabMap: vm,
    })
    expect(r.classification).not.toBe(FEASIBILITY.UNSAFE)
    expect(r.risk).not.toBe(RISK.HIGH)
  })

  it('too many assisted words in ONE beat is unsafe, however cheap they are', () => {
    const r = assessShape({
      blueprint: shape([{ id: 1, what: 'He repairs the wheel with a tool and a wrench and a pump', because: 'the story opens' }]),
      manifest: manifest(), vocabMap: vm,
    })
    expect(r.classification).toBe(FEASIBILITY.UNSAFE)
    expect(r.budget.breaches.join(' ')).toMatch(/assisted words/)
  })

  it('the whole-story cost budget is what stops a too-advanced story', () => {
    // Five beats, each with one off-list concept: within the per-beat rule,
    // over the cost budget.
    const beats = ['thud', 'sweat', 'grip', 'ladder', 'wrench'].map((w, i) => ({
      id: i + 1, what: 'Li Ming notices the ' + w, because: i ? 'it follows' : 'the story opens',
    }))
    const r = assessShape({ blueprint: shape(beats), manifest: manifest(), vocabMap: vm })
    expect(r.classification).toBe(FEASIBILITY.UNSAFE)
    expect(r.budget.cost).toBeGreaterThan(ASSISTED_POLICY.costBudget)
  })

  it('the policy is configurable, not carved in', () => {
    const beats = ['thud', 'sweat', 'grip', 'ladder', 'wrench'].map((w, i) => ({
      id: i + 1, what: 'Li Ming notices the ' + w, because: i ? 'it follows' : 'the story opens',
    }))
    const generous = { ...ASSISTED_POLICY, costBudget: 40, assistedWordsMax: 20, offListMax: 20 }
    const r = assessShape({ blueprint: shape(beats), manifest: manifest(), vocabMap: vm, policy: generous })
    expect(r.classification).toBe(FEASIBILITY.ASSISTED)
    expect(r.policy.costBudget).toBe(40)
  })

  it('gratuitous difficulty costs MORE than a word the story turns on', () => {
    // Free was a hole — one relative clause could carry a whole story's
    // advanced vocabulary. Cheap was wrong too: an advanced word the story
    // does not need is precisely what should not be rewarded.
    const decorative = assessShape({
      blueprint: shape([{ id: 1, what: '李明 looks at the bike', because: 'it is dark and the wrench is heavy' }]),
      manifest: manifest(), vocabMap: vm,
    })
    const central = assessShape({
      blueprint: shape([{ id: 1, what: '李明 looks at the dark wrench', because: 'the story opens' }]),
      manifest: manifest(), vocabMap: vm,
    })
    expect(decorative.budget.cost).toBeGreaterThan(central.budget.cost)
    for (const a of central.assisted) expect(a.necessity).toBe('CENTRAL_NECESSARY')
  })

  it('records every assisted word for the artifact and the UI', () => {
    const r = assessShape({
      blueprint: shape([{ id: 1, what: '李明 needs a tool to repair the bike', because: 'the story opens' }]),
      manifest: manifest(), vocabMap: vm,
    })
    expect(r.budget.nominalLevel).toBe(3)
    expect(r.budget.inLevelShareTarget).toBe(ASSISTED_POLICY.inLevelShareTarget)
    const tool = r.assisted.find(a => a.concept === 'tool')
    expect(tool).toMatchObject({ word: '工具', hsk: 4, distance: 1, source: 'above-level' })
    expect(tool.beats).toEqual([1])
  })

  it('an assisted word never becomes a learning target', () => {
    const m = manifest()
    const r = assessShape({
      blueprint: shape([{ id: 1, what: '李明 needs a tool to repair the bike', because: 'the story opens' }]),
      manifest: m, vocabMap: vm,
    })
    expect(r.assisted.length).toBeGreaterThan(0)
    // the manifest is untouched, and no assisted word appears among its targets
    expect(m.targets.map(t => t.word)).toEqual(['帮助'])
    for (const a of r.assisted) expect(m.targets.map(t => t.word)).not.toContain(a.word)
  })

  it('an in-level concept is never assisted — no advanced synonym for a simple word', () => {
    const r = assessShape({
      blueprint: shape([{ id: 1, what: '李明 looks at his friend', because: 'the story opens' }]),
      manifest: manifest(), vocabMap: vm,
    })
    expect(r.assisted).toEqual([])
    expect(r.classification).toBe(FEASIBILITY.IN_LEVEL)
  })

  it('the plan’s own boilerplate is not charged as vocabulary', () => {
    // Every beat 1 says "the story opens"; charging incidental material made
    // that phantom word cost every plan in the census.
    const r = assessShape({
      blueprint: shape([{ id: 1, what: '李明 looks at his friend', because: 'the story opens' }]),
      manifest: manifest(), vocabMap: vm,
    })
    expect(r.assisted.map(a => a.concept)).not.toContain('story')
    expect(r.budget.cost).toBe(0)
  })
})

// ── What the adversarial review found (2026-08-26) ──────────────────────────
describe('defects the review reproduced', () => {
  const ROWS = [
    ['累', 2, 'tired, to tire'], ['站', 3, 'to stand; station'],
    ['轮子', 6, 'wheel'], ['工具', 5, 'tool'],
    ['修', 9, 'to repair'], ['修理', 4, 'to repair; to fix'],
  ]
  const vm = Object.fromEntries(ROWS.map(([word, level, meaning]) => [word, { word, level, meaning }]))
  const manifest = () => buildManifest({ batchId: 'r', seq: 1, level: 3, targets: ['帮助'], defaults: { lines: [14, 38] } })
  const shape = (beats) => ({ cast: ['李明'], beats, targetPlan: [] })
  const index = buildGlossIndex(vm, 3)
  const full = buildFullGlossIndex(vm)
  const support = (c, pos) => conceptSupport(c, index, full, {
    synonyms: buildSenseSynonyms(vm), inLevelWords: buildInLevelWords(vm, 3), pos,
  })

  it('a stem collision no longer reopens the tire bug on the plural', () => {
    // "tired" and "tires" both stem to "tir", so the plural reached 累 through
    // the ADJECTIVE sense while the verb sense was correctly blocked.
    expect(support('tire', 'noun')).toMatchObject({ support: 'none' })
    expect(support('tires', 'noun')).toMatchObject({ support: 'none' })
    // and the real readings still work
    expect(support('tired', null).words).toContain('累')
    expect(support('stands', 'verb').words).toContain('站')
    expect(support('standing', 'verb').words).toContain('站')
  })

  it('inflections only meet across a participle through a verbal sense', () => {
    expect(suffixClass('tires')).toBe('s')
    expect(suffixClass('tired')).toBe('ed')
    expect(inflectionCompatible('tires', 'tire', { verb: false })).toBe(true)   // base ↔ -s
    expect(inflectionCompatible('tires', 'tired', { verb: false })).toBe(false) // -s ↔ -ed, no verb
    expect(inflectionCompatible('carrying', 'carry', { verb: true })).toBe(true)
  })

  it('charges the NEAREST word, not whichever the corpus listed first', () => {
    const r = classifyConcept(support('repair', null), { vocabMap: vm, level: 3 })
    expect(r.word).toBe('修理')      // HSK 4, not 修 at HSK 9
    expect(r.cost).toBe(1)
  })

  it('one tapped word is charged once, however the English spells it', () => {
    const r = assessShape({
      blueprint: shape([
        { id: 1, what: 'He looks at the wheel', because: 'the story opens' },
        { id: 2, what: 'He turns the wheels', because: 'it follows' },
      ]),
      manifest: manifest(), vocabMap: vm,
    })
    const row = r.assisted.find(a => a.word === '轮子')
    expect(row.concepts).toEqual(expect.arrayContaining(['wheel', 'wheels']))
    expect(r.assisted.filter(a => a.word === '轮子')).toHaveLength(1)
    expect(assistKey({ word: '轮子' })).toBe(assistKey({ word: '轮子', concept: 'wheels' }))
  })

  it('a subordinate clause is not a free channel for the budget', () => {
    // "he holds the wheel while he puts the chain back on" — the chain is the
    // point of the beat and used to cost nothing.
    const r = assessShape({
      blueprint: shape([{ id: 1, what: 'He holds it while he puts the wheel back on.', because: 'the story opens' }]),
      manifest: manifest(), vocabMap: vm,
    })
    expect(r.budget.cost).toBeGreaterThan(0)
  })

  it('an UNSAFE verdict always names words for the one replan', () => {
    const beats = ['candle', 'mushroom', 'whale', 'butterfly'].map((w, i) => ({
      id: i + 1, what: 'He sees the ' + w, because: i ? 'it follows' : 'the story opens',
    }))
    const r = assessShape({ blueprint: shape(beats), manifest: manifest(), vocabMap: vm })
    expect(r.classification).toBe(FEASIBILITY.UNSAFE)
    expect(r.highBeats).toEqual([])          // no single beat is crowded
    expect(r.blocking.length).toBeGreaterThan(0)
    expect(r.blocking).toEqual(expect.arrayContaining(['candle', 'whale']))
  })

  it('caps the words the learner list does not carry, because the validator will not', () => {
    const beats = ['candle', 'mushroom', 'whale'].map((w, i) => ({
      id: i + 1, what: 'He sees the ' + w, because: i ? 'it follows' : 'the story opens',
    }))
    const r = assessShape({ blueprint: shape(beats), manifest: manifest(), vocabMap: vm })
    expect(r.budget.offListWords).toBeGreaterThan(r.budget.offListMax)
    expect(r.budget.breaches.join(' ')).toContain('UNKNOWN words')
  })

  it('a partial policy override does not crash', () => {
    expect(assistCost({ kind: ASSIST.ASSISTED, distance: 2 }, { costBudget: 40 })).toBe(2)
    expect(withPolicy({ costBudget: 40 }).distanceCost[3]).toBe(ASSISTED_POLICY.distanceCost[3])
    const r = assessShape({
      blueprint: shape([{ id: 1, what: 'He needs a tool', because: 'the story opens' }]),
      manifest: manifest(), vocabMap: vm, policy: { costBudget: 40 },
    })
    expect(r.policy.costBudget).toBe(40)
  })
})

// ── What the first post-review census exposed ───────────────────────────────
describe('noise the budget must not bill as vocabulary', () => {
  const vm = {
    听见: { word: '听见', level: 1, meaning: 'to hear' },
    楼梯: { word: '楼梯', level: 3, meaning: 'stair; staircase' },
    性别: { word: '性别', level: 4, meaning: 'gender' },
  }
  const manifest = () => buildManifest({ batchId: 'n', seq: 1, level: 3, targets: ['帮助'], defaults: { lines: [14, 38] } })
  const index = buildGlossIndex(vm, 3)
  const full = buildFullGlossIndex(vm)
  const support = (c) => conceptSupport(c, index, full, { synonyms: buildSenseSynonyms(vm), inLevelWords: buildInLevelWords(vm, 3) })

  it('an inflection the stemmer missed is support; a compound ending is not', () => {
    // English inflects at the end, so a real variant shares the prefix.
    // Which bridge carries it is not the point — the lemma now gets there
    // first — but it must be supported, and 楼梯 must still not be downstairs.
    expect(support('heard').support).toBe('supported')
    expect(support('heard').words).toContain('听见')
    expect(support('downstairs')).toMatchObject({ support: 'weak' })
  })

  it('a target’s stated intent is a note about the plan, not story vocabulary', () => {
    // census-7 billed "Description", "Social bonding" and "Gender comparison"
    // as words the story has to say.
    const c = conceptsFromBeat({ what: 'They fix it together', because: 'it follows' }, [{ intent: 'Gender comparison' }])
    expect(c.meta).toContain('gender')
    expect(c.incidental).not.toContain('gender')
    const r = assessShape({
      blueprint: { cast: ['李明'], beats: [{ id: 1, what: 'They fix it together', because: 'the story opens' }], targetPlan: [{ word: '帮助', beat: 1, intent: 'Gender comparison' }] },
      manifest: manifest(), vocabMap: vm,
    })
    // "fix" is a real concept of the beat and may well be assisted; the point
    // is that nothing from the INTENT reaches the budget.
    const billed = r.assisted.flatMap(a => a.concepts || [a.concept])
    expect(billed).not.toContain('gender')
    expect(billed).not.toContain('comparison')
  })

  it('a contraction fragment is not a concept', () => {
    const c = conceptsFromBeat({ what: "It isn't working", because: 'the story opens' }, [])
    expect([...c.core, ...c.supporting, ...c.incidental]).not.toContain('isn')
  })
})

// ── The three matcher classes the sensitivity matrix exposed ────────────────
describe('matcher accuracy: inflection, derivation, parenthetical', () => {
  // Glosses verbatim from the vocabulary table.
  const ROWS = [
    ['给', 1, 'to give, for'], ['帮', 2, 'to help'], ['帮助', 3, 'assistance; aid; to help; to assist'],
    ['最好', 3, 'best; (you) had better (do what we suggest)'],
    ['养', 3, 'to raise (animals); to bring up (children)'],
    ['玉米', 3, 'corn'], ['教', 3, 'to teach'], ['听见', 1, 'to hear'],
    ['楼梯', 3, 'stair; staircase'], ['外卖', 3, '(of a restaurant) to provide a takeout or home delivery meal'],
  ]
  const vm = Object.fromEntries(ROWS.map(([word, level, meaning]) => [word, { word, level, meaning }]))
  const index = buildGlossIndex(vm, 3)
  const full = buildFullGlossIndex(vm)
  const support = (c, pos) => conceptSupport(c, index, full, {
    synonyms: buildSenseSynonyms(vm), inLevelWords: buildInLevelWords(vm, 3), pos,
  })

  it('1. an irregular past tense reaches its lemma', () => {
    expect(support('gave', null).words).toContain('给')
    expect(support('heard', null).words).toContain('听见')
    // and the class, not the case: several unrelated families
    expect(support('taught', null).words).toContain('教')
  })

  it('2. a derivation that changes part of speech is separate, weaker evidence', () => {
    const r = support('helpful', 'noun')
    expect(r).toMatchObject({ support: 'supported', via: 'derivation', derivedFrom: 'help', confidence: 'derivational' })
    expect(r.words).toContain('帮')
    const t = support('teacher', 'noun')
    expect(t).toMatchObject({ via: 'derivation', derivedFrom: 'teach' })
  })

  it('2b. a surface suffix collision gains nothing', () => {
    // corner does not derive from corn: an agentive -er needs a VERB base, and
    // 玉米 is a noun. It must not read as in level.
    const r = support('corner', 'noun')
    expect(r.support).not.toBe('supported')
    expect(r.via).not.toBe('derivation')
  })

  it('3. a parenthetical can rescue a match', () => {
    const r = support('suggested', 'verb')
    expect(r).toMatchObject({ support: 'supported', via: 'gloss-note', confidence: 'note' })
    expect(r.note).toContain('suggest')
    expect(r.words).toContain('最好')
  })

  it('3b. a parenthetical does not make an explanatory word a synonym', () => {
    // 养 is "to raise (animals); to bring up (children)" — it does not mean
    // animals or children, and a bare label is not a usage note.
    for (const c of ['animals', 'children']) {
      const r = support(c, 'noun')
      expect(r.support, c).not.toBe('supported')
    }
    // "(of a restaurant)" is a domain, not an action note
    expect(support('restaurant', 'noun').support).not.toBe('supported')
  })

  it('the earlier guards still hold after all three bridges', () => {
    expect(support('downstairs', null).support).not.toBe('supported')   // 楼梯 is not downstairs
    expect(support('tire', 'noun').support).toBe('none')                 // still not 累
  })
})

// ── The audit of the fixes found two more of the same class ─────────────────
describe('what the corrected matrix audit turned up', () => {
  const vm = {
    安静: { word: '安静', level: 3, meaning: 'quiet; peaceful' },
    玉米: { word: '玉米', level: 3, meaning: 'corn' },
    深: { word: '深', level: 4, meaning: 'deep' },
  }
  const index = buildGlossIndex(vm, 3)
  const full = buildFullGlossIndex(vm)
  const frame = beatConceptPos('The room is quieter now. He stands in the corner. The water looks deeper than before.')
  const support = (c) => conceptSupport(c, index, full, {
    synonyms: buildSenseSynonyms(vm), inLevelWords: buildInLevelWords(vm, 3), pos: frame.get(c) || null,
  })

  it('a comparative the sentence marks as one reaches its adjective', () => {
    expect(frame.get('quieter')).toBe('comparative')
    expect(support('quieter')).toMatchObject({ support: 'supported', via: 'comparative' })
  })

  it('and -er without that frame is still not an inflection', () => {
    // "He stands in the corner" — a determiner, not a comparative frame.
    expect(frame.get('corner')).toBe('noun')
    expect(support('corner').support).not.toBe('supported')
  })

  it('a comparative of an ABOVE-level adjective stays assisted', () => {
    // 深 is HSK 4: "deeper" is honestly out of level, not a matcher failure.
    expect(support('deeper').support).toBe('none')
  })

  it('the gloss may hold the derived form while the story says the base', () => {
    // 安静 is glossed "quiet; peaceful"; the plan says "peace".
    expect(support('peace')).toMatchObject({ support: 'supported', via: 'derivation', derivedFrom: 'peaceful' })
  })
})
