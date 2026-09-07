import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizePinyin, lenientPinyin, checkAnswer } from './src/testLogic.js'

// FAB-36 — the ten stale `reading_plain` values, and the migration that fixes
// them.
//
// READ THIS FIRST: there is no Postgres in this repository's test environment,
// so nothing here executes the SQL. What these CAN do — and the reason they are
// worth writing — is hold the migration to the two facts that would make it
// wrong, both of which are checkable here:
//
//   1. the tone fold in the SQL and the tone fold in src/testLogic.js have to
//      agree, or the answer KEY and the answer CHECKER disagree about what
//      "tone-stripped" means;
//   2. the comparison has to ignore exactly what lenientPinyin ignores, or it
//      rewrites rows that are not broken — which the first draft did, to eleven
//      of them.
//
// The live measurement (exactly ten rows change) is on FAB-36. A staging apply
// is still required.

const MIGRATION = 'supabase/migrations/20260907030000_repair_reading_plain_drift.sql'
const sql = readFileSync(MIGRATION, 'utf8')
// Assertions run over CODE. The header quotes the very identifiers and values
// being asserted about, at length and on purpose.
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

// The two arguments of the SQL translate() — the fold, as the database sees it.
const fold = (() => {
  const m = code.match(/translate\(\s*v\.reading,\s*'([^']+)',\s*'([^']+)'\)/)
  return m ? { from: [...m[1]], to: [...m[2]] } : null
})()

describe('the fold the database applies is the one the app applies', () => {
  it('parses out of the migration at all', () => {
    expect(fold, 'could not read the translate() map out of the migration').toBeTruthy()
    expect(fold.from.length, 'the two translate() arguments are different lengths — Postgres would silently drop the tail')
      .toBe(fold.to.length)
  })

  it('folds every character the same way normalizePinyin does', () => {
    // The drift that matters: add a tone-marked vowel to one side only and the
    // key stops matching what the checker will accept. Driven character by
    // character through the REAL predicate, not restated.
    for (let i = 0; i < fold.from.length; i += 1) {
      const source = fold.from[i]
      const target = fold.to[i]
      expect(normalizePinyin(source), 'SQL folds ' + source + ' to ' + target + ', normalizePinyin disagrees')
        .toBe(target.toLowerCase())
    }
  })

  it('covers every tone-marked vowel pinyin can carry', () => {
    // A fold that misses one leaves a tone mark in the answer key, which
    // lenientPinyin then strips from the learner's input and not from the key.
    const marked = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü'
    for (const ch of marked) {
      expect(fold.from, 'the fold does not cover ' + ch).toContain(ch)
    }
  })
})

describe('the comparison ignores exactly what the answer checker ignores', () => {
  const stripped = code.match(/regexp_replace\([^,]+,\s*'\[([^\]]+)\]'/)

  it('ignores space, apostrophe and case — and nothing else', () => {
    expect(stripped, 'the comparison no longer normalises before comparing').toBeTruthy()
    const chars = stripped[1]
    expect(chars).toContain(' ')
    expect(chars).toContain("'")
    expect(chars).toContain('’')
    // BOTH sides, counted. One `lower(` would leave the comparison
    // case-sensitive in one direction, which is how 中国 "Zhongguo" would come
    // back into scope — and a single toMatch passes with either half present.
    expect((code.match(/lower\(regexp_replace/g) || []).length,
      'the comparison lowercases only one side, so case differences count again')
      .toBe(2)
  })

  it('leaves the hand-curated HSK 1 rows alone, because they are not wrong', () => {
    // The eleven rows the first draft would have rewritten. They keep spaces,
    // capitals or an apostrophe, and every one is a correct answer key —
    // lenientPinyin strips all three from both sides before comparing. A
    // migration that "normalised" them would change working data for nothing.
    const spaced = [
      ['ni hao', 'nǐ hǎo'], ['xia yu', 'xià yǔ'], ['da dianhua', 'dǎ diànhuà'],
      ['mei guanxi', 'méi guānxi'], ['bu keqi', 'bú kèqi'], ['zuo fan', 'zuò fàn'],
      ['Zhongguo', 'Zhōngguó'], ['Zhongwen', 'Zhōngwén'], ['Hanzi', 'Hànzì'],
      ['Hanyu', 'Hànyǔ'], ["nu'er", "nǚ'ér"],
    ]
    for (const [plain, reading] of spaced) {
      expect(lenientPinyin(plain), plain + ' is not equivalent to ' + reading)
        .toBe(lenientPinyin(reading))
    }
  })
})

describe('what the eight mis-graded rows do to the level test today', () => {
  // The reason this is worth a migration rather than a backlog line: the level
  // test requires 100% and unlocks the next level, and checkAnswer accepts
  // reading_plain. These drive the REAL checkAnswer over the real shapes.
  const before = { word: '厂', reading: 'chǎng', reading_plain: 'han' }
  const after = { word: '厂', reading: 'chǎng', reading_plain: 'chang' }

  it('accepts the wrong pinyin while the stale value is there', () => {
    expect(checkAnswer('han', before), 'the premise of this migration is false').toBe(true)
  })

  it('stops accepting it once the value is repaired, and still accepts the right one', () => {
    expect(checkAnswer('han', after)).toBe(false)
    expect(checkAnswer('chang', after)).toBe(true)
    expect(checkAnswer('chǎng', after)).toBe(true)
    expect(checkAnswer('chang3', after)).toBe(true)
  })

  it('the two ü rows do NOT mis-grade — they are hygiene, not a gate hole', () => {
    // Worth stating rather than letting the migration imply otherwise. 忽略 and
    // 策略 carry `hulu:e` / `celu:e`, the ASCII transliteration 20260803 was
    // written to remove — but lenientPinyin strips `:` along with the rest of
    // its punctuation set, so the stale value and the correct one accept
    // exactly the same inputs. Repairing them is consistency and a clean
    // integrity check, not a grading fix.
    //
    // So of the ten rows, EIGHT are the progression-gate defect and two are
    // not. A comment that lumped all ten together would be the kind of small
    // overstatement that makes the rest of the file less trustworthy.
    const stale = { word: '忽略', reading: 'hūlüè', reading_plain: 'hulu:e' }
    const fixed = { word: '忽略', reading: 'hūlüè', reading_plain: 'hulue' }
    for (const typed of ['hulue', 'hulüe', 'hūlüè', 'hulve', 'hulu:e']) {
      expect(checkAnswer(typed, stale), typed + ' vs the stale value').toBe(true)
      expect(checkAnswer(typed, fixed), typed + ' vs the repaired value').toBe(true)
    }
    // And a genuinely wrong answer is refused either way.
    expect(checkAnswer('hulve2', fixed)).toBe(true)   // numeric tone, still fine
    expect(checkAnswer('huluo', fixed)).toBe(false)
  })
})
