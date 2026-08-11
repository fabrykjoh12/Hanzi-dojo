import { describe, it, expect } from 'vitest'
import { buildPracticePlan, levelTestEntry, drillCountLabel, DRILL_KEYS, isDrillKey } from './practicePlan'
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

  it('agrees its verbs and pronouns with the count', () => {
    // "1 pattern are due. Ten quiet minutes keeps them." was live copy until
    // P11-1. Pluralising the noun is only half of it.
    expect(buildPracticePlan({ ...CHINESE, weakCount: 1 }).primary.reason)
      .toBe('1 word keeps slipping. A short pass puts it back in the queue.')
    expect(buildPracticePlan({ ...CHINESE, weakCount: 5 }).primary.reason)
      .toBe('5 words keep slipping. A short pass puts them back in the queue.')
    expect(buildPracticePlan({ ...CHINESE, grammarDueCount: 1 }).primary.reason)
      .toBe('1 pattern is due. Ten quiet minutes keeps it.')
    expect(buildPracticePlan({ ...CHINESE, grammarDueCount: 5 }).primary.reason)
      .toBe('5 patterns are due. Ten quiet minutes keeps them.')
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

// ── P11-1, amendment 1: descriptions are UNEVEN on purpose ────────────────
//
// The grid this replaced gave all eight drills `icon + title + one line`, which
// is the pattern that made the screen read as generated. The fix is not shorter
// lines, it is fewer of them: a hint goes to a row whose name genuinely is not
// enough, and nowhere else. So these specs assert the *absence* of a hint as
// hard as its presence — a well-meant "add a description to every row" patch
// has to fail here.
describe('buildPracticePlan — hints, and where they are missing', () => {
  const hintOf = (plan, key) => plan.drills.find(d => d.key === key)

  it('explains the drills whose name is not self-evident', () => {
    const plan = buildPracticePlan(CHINESE)
    expect(hintOf(plan, 'fillblank').hint).toBe('Complete the sentence')
    expect(hintOf(plan, 'builder').hint).toBe('Reorder the words')
  })

  it('leaves the self-evident ones bare', () => {
    // "Writing", "Speaking", "Tones", "Stroke order" — a gloss under these is
    // filler, and filler on every row is the template.
    const plan = buildPracticePlan(CHINESE)
    for (const key of ['writing', 'speak', 'tones', 'strokes']) {
      expect(hintOf(plan, key).hint, key + ' should carry no hint').toBeNull()
    }
  })

  it('keeps the list uneven in every state — never all rows, never none', () => {
    // Deliberately not a ratio. The share moves with the data (an idle Weak
    // words row carries a hint, a busy one does not) and on the store apps it
    // is 4 of 7 rather than 4 of 8, because Speaking — a bare row — is absent
    // there. Pinning a fraction would fail for a reason nobody should have to
    // debug. What must hold is that a hint is earned: some rows have one, some
    // never do, and `leaves the self-evident ones bare` above names which.
    for (const c of [{}, { weakCount: 6 }, { grammarDueCount: 4 }, { weakCount: 6, grammarDueCount: 4 }, { speech: false }]) {
      const plan = buildPracticePlan({ ...CHINESE, ...c })
      const hinted = plan.drills.filter(d => d.hint).length
      expect(hinted, JSON.stringify(c)).toBeGreaterThan(0)
      expect(hinted, JSON.stringify(c)).toBeLessThan(plan.drills.length)
      // And at least three rows are bare, so the block of hinted rows can never
      // become the whole list by accretion.
      expect(plan.drills.length - hinted, JSON.stringify(c)).toBeGreaterThanOrEqual(3)
    }
  })

  it('drops the hint the moment a row has a count to show instead', () => {
    // The count IS the explanation; printing both says one thing twice.
    const quiet = buildPracticePlan(CHINESE)
    expect(hintOf(quiet, 'weak').hint).toBe('Clean up the words that trip you')
    expect(hintOf(quiet, 'grammarpractice').hint).toBe('Patterns you have met, on a schedule')

    const busy = buildPracticePlan({ ...CHINESE, weakCount: 6, grammarDueCount: 2 })
    // Weak took the hero, so grammar is the counted row left in the list.
    expect(hintOf(busy, 'grammarpractice').hint).toBeNull()
    expect(hintOf(busy, 'grammarpractice').badge).toBe(2)
  })

  it('always gives `hint` a value the renderer can test — null, never undefined', () => {
    // `{item.hint && …}` is the whole render branch; an undefined would work by
    // luck and a stray '' would draw an empty line at row height.
    for (const c of [{}, { weakCount: 3 }, { grammarDueCount: 3 }, { speech: false }]) {
      for (const d of buildPracticePlan({ ...CHINESE, ...c }).drills) {
        expect(d.hint === null || (typeof d.hint === 'string' && d.hint.length > 0),
          d.key + ' has a hint of ' + JSON.stringify(d.hint)).toBe(true)
      }
    }
  })
})

// ── P11-1, amendment 2: a count is typography, not a pill ─────────────────
//
// The number renders as amber text beside the title, which leaves "6" with no
// noun for anyone listening to the screen instead of looking at it.
describe('drillCountLabel', () => {
  it('names what the number counts', () => {
    expect(drillCountLabel({ key: 'weak', badge: 6 })).toBe('6 words keep slipping')
    expect(drillCountLabel({ key: 'grammarpractice', badge: 3 })).toBe('3 patterns are due')
  })

  it('says one word, one pattern', () => {
    expect(drillCountLabel({ key: 'weak', badge: 1 })).toBe('1 word keeps slipping')
    expect(drillCountLabel({ key: 'grammarpractice', badge: 1 })).toBe('1 pattern is due')
  })

  it('is empty for a row with nothing waiting, so nothing is announced', () => {
    expect(drillCountLabel({ key: 'weak', badge: null })).toBe('')
    expect(drillCountLabel(null)).toBe('')
    expect(drillCountLabel(undefined)).toBe('')
  })

  it('falls back to the bare number for a drill that grows a count later', () => {
    expect(drillCountLabel({ key: 'listen', badge: 4 })).toBe('4')
  })

  it('has a label for every counted row the plan can actually emit', () => {
    for (const c of [{ weakCount: 5 }, { grammarDueCount: 5 }, { weakCount: 5, grammarDueCount: 5 }]) {
      for (const d of buildPracticePlan({ ...CHINESE, ...c }).drills.filter(x => x.badge != null)) {
        expect(drillCountLabel(d).length, d.key + ' announces nothing').toBeGreaterThan(3)
      }
    }
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

// P11-0 — the instrumentation contract.
//
// `practice_drill_started` keys on DRILL_KEYS. A drill added to the plan without
// being added there is a hole in the data that nothing else would notice, so this
// walks every combination the plan can produce.
describe('DRILL_KEYS covers every drill the plan can offer', () => {
  const SCRIPTS = [undefined, 'hanzi', 'kana', 'cyrillic', 'nonsense']
  const BOOLS = [false, true]

  it('names every key, in every script/CJK/speech combination', () => {
    const seen = new Set()
    for (const script of SCRIPTS) {
      for (const cjk of BOOLS) {
        for (const speech of BOOLS) {
          for (const weakCount of [0, 4]) {
            for (const grammarDueCount of [0, 3]) {
              const plan = buildPracticePlan({ script, cjk, speech, weakCount, grammarDueCount })
              seen.add(plan.primary.key)
              for (const d of plan.drills) seen.add(d.key)
            }
          }
        }
      }
    }
    for (const key of seen) {
      expect(isDrillKey(key), key + ' is missing from DRILL_KEYS').toBe(true)
    }
    // And the set is not padded with keys the plan can never emit.
    expect(seen.size).toBeGreaterThanOrEqual(9)
  })

  it('lists each key once', () => {
    expect(new Set(DRILL_KEYS).size).toBe(DRILL_KEYS.length)
  })

  it('counts neither the level test nor the lookup tools as drills', () => {
    // A dictionary lookup is not practice, and counting it as such would make the
    // numbers useless for the question they exist to answer.
    const plan = buildPracticePlan({ script: 'hanzi', cjk: true })
    expect(isDrillKey(plan.levelTest.key)).toBe(false)
    for (const tool of plan.tools) {
      expect(isDrillKey(tool.key), tool.key + ' is a tool, not a drill').toBe(false)
    }
  })

  it('rejects nonsense rather than guessing', () => {
    for (const bad of [null, undefined, '', 'nope', 0, {}]) {
      expect(isDrillKey(bad)).toBe(false)
    }
  })
})

