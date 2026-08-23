import { describe, it, expect } from 'vitest'
import {
  assessShapeRisk, assessBeatRisk, conceptsFromBeat, buildGlossIndex, buildFullGlossIndex,
  conceptSupport, RISK, RISK_VERSION,
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
