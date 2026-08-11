import { describe, it, expect } from 'vitest'
import { buildPracticePlan, levelTestEntry } from './practicePlan'
import { TEST_UNLOCK_MASTERY_PCT } from './mastery'
import { MOBILE_MORE } from './navConfig'
import { resolveTestStatus } from './testLogic'

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

describe('speech availability', () => {
  it('offers the Speaking drill by default (a normal browser)', () => {
    const plan = buildPracticePlan({ script: 'hanzi', cjk: true })
    expect(plan.drills.map(d => d.key)).toContain('speak')
  })

  it('hides Speaking where recognition is unusable, rather than advertising a dead end', () => {
    const plan = buildPracticePlan({ script: 'hanzi', cjk: true, speech: false })
    expect(plan.drills.map(d => d.key)).not.toContain('speak')
  })

  it('drops only Speaking — every other drill survives', () => {
    const withSpeech = buildPracticePlan({ script: 'hanzi', cjk: true }).drills.map(d => d.key)
    const without = buildPracticePlan({ script: 'hanzi', cjk: true, speech: false }).drills.map(d => d.key)
    expect(without).toEqual(withSpeech.filter(k => k !== 'speak'))
  })
})

// ── The level test's place on this screen ─────────────────────────────────
//
// It had none. `test` is owned by the Practice tab, the desktop rail gives it a
// slot beside Practice, and no screen in the app linked to it — so on a phone
// the gate on progression was reachable only from the "More" sheet, filed
// between Profile and Log out.

describe('the level test on the Practice screen', () => {
  it('is part of the plan, always — locked is a state, not an absence', () => {
    const plan = buildPracticePlan({ ...CHINESE, masteredCount: 0, totalWords: 50 })
    expect(plan.levelTest.key).toBe('test')
    expect(plan.levelTest.unlocked).toBe(false)
  })

  it('opens at the mastery threshold the test itself uses', () => {
    const pct = TEST_UNLOCK_MASTERY_PCT
    expect(levelTestEntry({ masteredCount: 44, totalWords: 50 }).unlocked).toBe(false)
    expect(levelTestEntry({ masteredCount: 45, totalWords: 50 }).unlocked).toBe(true)
    expect(levelTestEntry({ masteredCount: 50, totalWords: 50 }).unlocked).toBe(true)
    expect(45 / 50).toBeGreaterThanOrEqual(pct)
    expect(44 / 50).toBeLessThan(pct)
  })

  it('agrees with Test.jsx about whether the test is open', () => {
    // Two screens, one rule. The Practice row derives it from the Home counts
    // and Test derives it from its own queries; if these ever disagree, one of
    // them is lying to the learner about what they have to do.
    for (const [mastered, total] of [[0, 10], [8, 10], [9, 10], [10, 10], [26, 30], [27, 30], [0, 0]]) {
      const cards = Array.from({ length: mastered }, () => ({ stability: 30 }))
        .concat(Array.from({ length: total - mastered }, () => ({ stability: 1 })))
      const status = resolveTestStatus(
        { data: Array.from({ length: total }, (_, i) => ({ id: 'v' + i })) },
        cards,
        { data: null },
      )
      expect(levelTestEntry({ masteredCount: mastered, totalWords: total }).unlocked)
        .toBe(status.testUnlocked)
    }
  })

  it('says how many words are still needed, not just that it is locked', () => {
    const e = levelTestEntry({ masteredCount: 12, totalWords: 41 })
    expect(e.needed).toBe(37)      // ceil(41 × 0.9)
    expect(e.remaining).toBe(25)
    expect(e.pct).toBe(29)
  })

  it('never reports a negative remainder or a bar past full', () => {
    const e = levelTestEntry({ masteredCount: 60, totalWords: 50 })
    expect(e.remaining).toBe(0)
    expect(e.pct).toBe(100)
  })

  it('survives a level with no vocabulary, and stays locked', () => {
    for (const e of [levelTestEntry(), levelTestEntry({ totalWords: 0, masteredCount: 0 })]) {
      expect(e.unlocked).toBe(false)
      expect(e.pct).toBe(0)
      expect(e.needed).toBe(0)
    }
  })

  it('is gone from the "More" sheet, so it lives in exactly one place', () => {
    expect(MOBILE_MORE.map(i => i.key)).not.toContain('test')
    // …and what remains there really is the account drawer.
    // (Language left this list in P10-C0 — staff-only now, see navConfig.test.js.)
    expect(MOBILE_MORE.map(i => i.key)).toEqual(['profile', 'settings', 'logout'])
  })
})
