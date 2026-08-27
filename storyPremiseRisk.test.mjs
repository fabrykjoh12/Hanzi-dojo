import { describe, it, expect } from 'vitest'
import { assessPremise, choosePremise, PREMISE, PREMISE_VERSION, PREMISE_POLICY } from './storyPremiseRisk.mjs'
import { buildLexicalIndexes } from './storyLexicalRisk.mjs'

// Real HSK rows. The point of the fixture is that the three TARGET words of the
// frozen bundle are all in level — so any cost a premise carries comes from the
// premise, never from the words the story exists to teach.
const ROWS = [
  ['如果', 3, 'if; in case'],
  ['需要', 3, 'to need; to want; to demand; to require; needs'],
  ['认为', 3, 'to believe; to think; to consider; to feel'],
  ['问', 1, 'to ask'],
  ['朋友', 1, 'friend'],
  ['下雨', 1, 'to rain'],
  ['雨', 1, 'rain'],
  ['伞', 3, 'umbrella; parasol'],
  ['家', 1, 'home, family'],
  ['自行车', 3, 'bicycle; bike'],
  ['坏', 2, 'bad, broken'],
  ['学校', 1, 'school'],
  ['岗位', 6, 'a post; a job'],
  ['是否', 4, 'whether (or not); if; is or isn\'t'],
  ['未来', 4, 'future'],
]
const vocabMap = Object.fromEntries(ROWS.map(([word, level, meaning]) => [word, { level, meaning }]))
const LEVEL = 3
const indexes = buildLexicalIndexes(vocabMap, LEVEL)
const score = (text) => assessPremise(text, { vocabMap, level: LEVEL, indexes })

describe('assessPremise — a situation is scored before it becomes a theme', () => {
  it('the premise that produced the six infeasible plans is caught here', () => {
    // This exact string is manifest.theme in bundle-plans-1. Every one of the
    // six candidates paid for it, and none of the cost came from 如果/需要/认为.
    const r = score('A friend asking for advice on a conditional life choice, such as whether to accept a new job.')
    expect(r.verdict).toBe(PREMISE.UNSAYABLE)
    expect(r.unsayable).toEqual(expect.arrayContaining(['advice', 'conditional', 'choice']))
    expect(r.cost).toBeGreaterThan(PREMISE_POLICY.costMax)
  })

  it('the SAME target words in a concrete situation cost nothing', () => {
    for (const text of [
      'It is raining and one of them needs an umbrella to go home.',
      'A bicycle is broken and they think about how to get to school.',
    ]) {
      const r = score(text)
      expect(r.verdict, text).toBe(PREMISE.OK)
      expect(r.cost, text).toBe(0)
    }
  })

  it('a target word never counts against the premise that uses it', () => {
    // need and think are the glosses of 需要 and 认为. A gate that charged the
    // story for its own targets would reject every premise that used them.
    const r = score('A friend needs help and they think about what to do.')
    expect(r.assisted.map(a => a.concept)).not.toContain('need')
    expect(r.assisted.map(a => a.concept)).not.toContain('think')
  })

  it('a gerund after a noun is a participle, not a noun', () => {
    // "A friend ASKING for advice" — the determiner belongs to "friend", and
    // reading "asking" as a noun put 问 out of reach and billed the premise
    // for a word the reader has.
    const r = score('A friend asking for help.')
    expect(r.assisted.map(a => a.concept)).not.toContain('asking')
  })

  it('names what is unsayable without banning a topic', () => {
    const r = score('They weigh the pros and cons of a decision about the future.')
    expect(r.verdict).not.toBe(PREMISE.OK)
    expect(r.unsayable).toEqual(expect.arrayContaining(['pros', 'cons']))
    // 未来 exists at HSK 4, so "future" is assisted, not unsayable — the gate
    // distinguishes "the language lacks this" from "the reader taps it".
    expect(r.assisted.find(a => a.concept === 'future').offList).toBe(false)
  })

  it('COSTLY separates a sayable-but-expensive premise from an unsayable one', () => {
    const r = score('They talk about whether the job is in their future.')
    expect(r.offListWords).toBeLessThanOrEqual(PREMISE_POLICY.offListMax)
    expect(r.verdict).toBe(PREMISE.COSTLY)
  })

  it('choosePremise takes the first that clears, and keeps every verdict', () => {
    const r = choosePremise([
      'A friend asking for advice on a conditional life choice.',
      'It is raining and one of them needs an umbrella to go home.',
    ], { vocabMap, level: LEVEL, indexes })
    expect(r.chosen.verdict).toBe(PREMISE.OK)
    expect(r.chosen.text).toMatch(/umbrella/)
    expect(r.scored).toHaveLength(2)
  })

  it('with nothing sayable it returns the cheapest and refuses to choose', () => {
    const r = choosePremise(['They weigh the pros and cons of a career choice.'], { vocabMap, level: LEVEL, indexes })
    expect(r.chosen).toBeNull()
    expect(r.cheapest).toBeTruthy()
  })

  it('a premise this gate cannot read is UNSCORED, never a cheap pass', () => {
    // bundle-concrete-2 answered in Chinese. There was no English to score, so
    // the gate found cost 0 and called it OK — a false pass.
    const r = score('下雨时，张明发现自己没有带伞。')
    expect(r.verdict).toBe(PREMISE.UNSCORED)
    expect(r.cost).toBeNull()
    expect(r.reason).toMatch(/not in English/)
  })

  it('never chooses an unscored premise over a scored one', () => {
    const r = choosePremise(['下雨时，张明没有带伞。', 'They weigh the pros and cons of a career choice.'],
      { vocabMap, level: LEVEL, indexes })
    expect(r.chosen).toBeNull()
    expect(r.cheapest.verdict).not.toBe(PREMISE.UNSCORED)
  })

  it('is versioned', () => {
    expect(PREMISE_VERSION).toBe('fab9-premise@2')
    expect(score('It is raining.').version).toBe(PREMISE_VERSION)
  })
})
