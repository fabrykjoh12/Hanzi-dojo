import { describe, it, expect } from 'vitest'
import { buildPracticePlan } from './practicePlan'

const CHINESE = { script: 'hanzi', cjk: true }
const JAPANESE = { script: 'kana', cjk: true }
const RUSSIAN = { script: 'cyrillic', cjk: false }

function keys(list) {
  return list.map(d => d.key)
}

describe('buildPracticePlan — the primary action', () => {
  it('opens on Listening when nothing is waiting', () => {
    const plan = buildPracticePlan(CHINESE)
    expect(plan.primary.key).toBe('listen')
    expect(plan.primary.eyebrow).toBe('Start here')
    expect(plan.primary.tone).toBe('accent')
  })

  it('promotes weak words the moment any are slipping', () => {
    const plan = buildPracticePlan({ ...CHINESE, weakCount: 7 })
    expect(plan.primary.key).toBe('weak')
    expect(plan.primary.reason).toContain('7 words')
    expect(plan.primary.tone).toBe('signal')
  })

  it('promotes grammar review when it is the only thing due', () => {
    const plan = buildPracticePlan({ ...CHINESE, grammarDueCount: 3 })
    expect(plan.primary.key).toBe('grammarpractice')
    expect(plan.primary.reason).toContain('3 patterns')
  })

  it('prefers weak words over grammar when both are waiting', () => {
    const plan = buildPracticePlan({ ...CHINESE, weakCount: 2, grammarDueCount: 9 })
    expect(plan.primary.key).toBe('weak')
  })

  it('says one word, one pattern — not "1 words"', () => {
    expect(buildPracticePlan({ ...CHINESE, weakCount: 1 }).primary.reason).toContain('1 word ')
    expect(buildPracticePlan({ ...CHINESE, grammarDueCount: 1 }).primary.reason).toContain('1 pattern ')
  })

  it('always offers a call to action', () => {
    const cases = [{}, { weakCount: 4 }, { grammarDueCount: 4 }]
    cases.forEach(c => {
      const plan = buildPracticePlan({ ...CHINESE, ...c })
      expect(typeof plan.primary.cta).toBe('string')
      expect(plan.primary.cta.length).toBeGreaterThan(0)
    })
  })
})

describe('buildPracticePlan — the drill grid', () => {
  it('never repeats the primary drill in the grid', () => {
    const cases = [{}, { weakCount: 5 }, { grammarDueCount: 5 }, { weakCount: 5, grammarDueCount: 5 }]
    cases.forEach(c => {
      const plan = buildPracticePlan({ ...CHINESE, ...c })
      expect(keys(plan.drills)).not.toContain(plan.primary.key)
    })
  })

  it('keeps every drill key unique', () => {
    const plan = buildPracticePlan({ ...CHINESE, weakCount: 3, grammarDueCount: 3 })
    expect(new Set(keys(plan.drills)).size).toBe(plan.drills.length)
  })

  it('leads with a drill that still carries a count', () => {
    // Weak words takes the hero; grammar is still due, so it heads the grid
    // rather than sitting wherever its fixed order put it.
    const plan = buildPracticePlan({ ...CHINESE, weakCount: 4, grammarDueCount: 6 })
    expect(plan.drills[0].key).toBe('grammarpractice')
    expect(plan.drills[0].badge).toBe(6)
    expect(plan.drills[0].tone).toBe('signal')
  })

  it('gives a drill no badge when nothing is behind it', () => {
    const plan = buildPracticePlan(CHINESE)
    plan.drills.forEach(d => {
      expect(d.badge).toBeNull()
      expect(d.tone).toBe('accent')
    })
  })

  it('offers the drill list at a stable length for a given language', () => {
    // Same language, different counts: the grid loses exactly the one drill the
    // hero took, so the screen never changes shape from data alone.
    const quiet = buildPracticePlan(CHINESE)
    const busy = buildPracticePlan({ ...CHINESE, weakCount: 9 })
    expect(busy.drills.length).toBe(quiet.drills.length)
  })
})

describe('buildPracticePlan — per-language drills', () => {
  it('gives Chinese the tone drill and stroke order', () => {
    const k = keys(buildPracticePlan(CHINESE).drills)
    expect(k).toContain('tones')
    expect(k).toContain('strokes')
    expect(k).not.toContain('kana')
  })

  it('gives Japanese the kana drill and stroke order', () => {
    const k = keys(buildPracticePlan(JAPANESE).drills)
    expect(k).toContain('kana')
    expect(k).toContain('strokes')
    expect(k).not.toContain('tones')
  })

  it('gives Russian an alphabet drill and no stroke order', () => {
    const k = keys(buildPracticePlan(RUSSIAN).drills)
    expect(k).toContain('cyrillic')
    expect(k).not.toContain('strokes')
    expect(k).not.toContain('tones')
  })

  it('drops the script drill entirely for an unknown script', () => {
    const k = keys(buildPracticePlan({ script: 'unknown', cjk: false }).drills)
    expect(k).not.toContain('tones')
    expect(k).not.toContain('kana')
    expect(k).not.toContain('cyrillic')
  })

  it('survives being called with nothing at all', () => {
    const plan = buildPracticePlan()
    expect(plan.primary.key).toBe('listen')
    expect(plan.drills.length).toBeGreaterThan(0)
    expect(plan.tools.length).toBeGreaterThan(0)
  })
})

describe('buildPracticePlan — tools', () => {
  it('lists the reference tools with a title and a description each', () => {
    const plan = buildPracticePlan(CHINESE)
    expect(keys(plan.tools)).toEqual(['words', 'known', 'dictionary', 'analyzer', 'grammar', 'youtube'])
    plan.tools.forEach(t => {
      expect(t.title.length).toBeGreaterThan(0)
      expect(t.desc.length).toBeGreaterThan(0)
    })
  })

  it('never mixes a tool into the drills', () => {
    const plan = buildPracticePlan({ ...CHINESE, weakCount: 2 })
    const toolKeys = new Set(keys(plan.tools))
    keys(plan.drills).forEach(k => expect(toolKeys.has(k)).toBe(false))
  })
})
