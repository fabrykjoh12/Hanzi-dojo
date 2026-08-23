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

const beat = (id, what, over = {}) => ({ id, when: 'that afternoon', where: 'the street', what, because: 'it follows', targets: [], lines: 5, ...over })
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
    expect(r.risk).toBe(RISK.LOW)
    expect(r.coreMissing).toEqual([])
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

  // Without this, "really", "about" and "patiently" all look like lexical gaps
  // and every beat scores HIGH.
  it('a word the dictionary has nowhere is not a gap — it is not a lexical concept', () => {
    const full = buildFullGlossIndex(vocabMap)
    expect(conceptSupport('really', index, full).support).toBe('supported')       // 真
    expect(conceptSupport('quantum', index, full).support).toBe('notLexical')
    // whereas a word the dictionary has, above the reader's level, IS a gap
    expect(conceptSupport('chain', index, full).support).toBe('none')
    expect(conceptSupport('chain', index, full).words).toContain('链子')
    expect(conceptSupport('wheel', index, full).support).toBe('none')
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
    expect(r.risk).toBe(RISK.LOW)
    expect(r.blocking).toEqual([])
  })
})
