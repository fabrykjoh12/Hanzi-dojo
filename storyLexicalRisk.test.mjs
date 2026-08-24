import { describe, it, expect } from 'vitest'
import {
  assessShapeRisk, assessBeatRisk, conceptsFromBeat, buildGlossIndex, buildFullGlossIndex,
  conceptSupport, buildSenseSynonyms, buildInLevelWords, componentHead,
  validateGlossCorpus, GlossCorpusError, RISK, RISK_VERSION,
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
    expect(r.reason).toContain('the beat\'s own event can be told')
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
