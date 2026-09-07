import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizePinyin, lenientPinyin } from './src/testLogic.js'
import { checkTypedAnswer } from './src/typedAnswer.js'
import { isWritingMatch } from './src/writingMatch.js'

// FAB-36 — the ten stale `reading_plain` values, and the migration that fixes
// them.
//
// READ THIS FIRST: there is no Postgres in this repository's test environment,
// so nothing here executes the SQL. What these CAN do — and the reason they are
// worth writing — is hold the migration to the facts that would make it wrong,
// each of which is checkable here:
//
//   1. the tone fold in the SQL and the tone fold in src/testLogic.js have to
//      agree, or the answer KEY and the answer CHECKER disagree about what
//      "tone-stripped" means — and the SQL states that fold THREE times, so all
//      three have to be the same fold;
//   2. the comparison has to ignore space, apostrophe and case on both sides
//      and nothing else, or it rewrites rows that are not broken (the first
//      draft did, to eleven of them);
//   3. the two guards that keep it from writing a bad key — non-null `reading`,
//      and a fold that came out fully ASCII — have to be present;
//   4. the mis-grading it claims has to be real, in the functions the app
//      actually calls.
//
// The live measurement (exactly ten rows change, all active) is on FAB-36 and
// in the migration header. A staging apply is still required.

const MIGRATION = 'supabase/migrations/20260907030000_repair_reading_plain_drift.sql'
const sql = readFileSync(MIGRATION, 'utf8')
// Assertions run over CODE. The header quotes the very identifiers and values
// being asserted about, at length and on purpose.
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

// EVERY translate() in the statement, not just the first. The SET clause and
// the two WHERE clauses each state the fold; a truncated map in the WHERE would
// make the predicate fire on rows that are already correct, and a first-match
// regex would never see it.
const folds = [...code.matchAll(/translate\(\s*normalize\(v\.reading,\s*nfc\),\s*'([^']+)',\s*'([^']+)'\)/g)]
  .map(m => ({ from: [...m[1]], to: [...m[2]] }))

describe('the fold the database applies is the one the app applies', () => {
  it('states the same fold everywhere it appears', () => {
    expect(folds.length, 'expected the fold in the SET clause and both WHERE clauses').toBe(3)
    expect((code.match(/translate\(/g) || []).length,
      'a translate() appears that is not the audited fold — it may not compose NFC first')
      .toBe(folds.length)
    for (const fold of folds) {
      expect(fold.from.length, 'the two translate() arguments are different lengths — Postgres would silently drop the tail')
        .toBe(fold.to.length)
      expect(fold.from.join(''), 'the three folds are not identical').toBe(folds[0].from.join(''))
      expect(fold.to.join(''), 'the three folds are not identical').toBe(folds[0].to.join(''))
    }
  })

  it('folds every character the same way normalizePinyin does', () => {
    // The drift that matters: add a tone-marked vowel to one side only and the
    // key stops matching what the checker will accept. Driven character by
    // character through the REAL predicate, not restated.
    for (const fold of folds) {
      for (let i = 0; i < fold.from.length; i += 1) {
        const source = fold.from[i]
        const target = fold.to[i]
        expect(normalizePinyin(source), 'SQL folds ' + source + ' to ' + target + ', normalizePinyin disagrees')
          .toBe(target.toLowerCase())
      }
    }
  })

  it('covers the tone-marked vowels this corpus uses', () => {
    // Deliberately NOT "every mark pinyin can carry": normalizePinyin drops any
    // combining mark after NFD, so it also folds ê̄/ế/ê̌/ề and ń/ň/ǹ/ḿ, several
    // of which are multi-codepoint and outside translate()'s reach. The next
    // test is what makes that gap safe.
    for (const ch of 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü') {
      expect(folds[0].from, 'the fold does not cover ' + ch).toContain(ch)
    }
  })

  it('refuses to write a value the fold did not fully flatten', () => {
    // The guard that makes an incomplete map safe instead of dangerous: a row
    // carrying a mark the map does not know is SKIPPED, not written back
    // half-folded. Without this the answer key could end up with a tone mark
    // in it — which lenientPinyin strips from the learner's input and, being
    // NFD-based, also from the key, but writingMatch's own path would not.
    expect(code, 'the migration no longer refuses non-ASCII folded output')
      .toMatch(/~\s*'\^\[\[:ascii:\]\]\*\$'/)
  })

  it('never derives a key from a NULL reading', () => {
    // translate(NULL) is NULL, and `is distinct from` is true against any
    // stored value — so without this guard a row with a NULL reading and a good
    // reading_plain has its answer key overwritten with NULL. The schema allows
    // both columns to be NULL, so this is not theoretical.
    expect(code, 'the NULL-reading guard is gone').toMatch(/v\.reading\s+is\s+not\s+null/)
  })
})

describe('the comparison ignores space, apostrophe and case — on both sides', () => {
  // Matched by the class and its trailing arguments rather than from
  // `regexp_replace(` forwards: the second call's first argument is itself a
  // nested translate(), which any `[^)]` scan stops short of.
  const classes = [...code.matchAll(/,\s*'\[([^\]]+)\]',\s*'',\s*'g'\)/g)].map(m => m[1])

  it('strips the same three characters everywhere it strips anything', () => {
    expect(classes.length, 'the comparison no longer normalises before comparing').toBe(2)
    for (const chars of classes) {
      expect(chars, 'a strip class dropped a character the other side still strips').toContain(' ')
      expect(chars).toContain("'")
      expect(chars).toContain('’')
      expect(chars, 'the two strip classes differ').toBe(classes[0])
    }
    // BOTH sides, counted. One `lower(` would leave the comparison
    // case-sensitive in one direction, which is how 中国 "Zhongguo" would come
    // back into scope — and a single toMatch passes with either half present.
    expect((code.match(/lower\(regexp_replace/g) || []).length,
      'the comparison lowercases only one side, so case differences count again')
      .toBe(2)
  })

  it('does not fold `:`, because that is what keeps the two ü rows in scope', () => {
    // The migration repairs `hulu:e` → `hulue`. lenientPinyin ignores `:`, so a
    // predicate that ignored it too would leave those two rows behind — the
    // difference from lenientPinyin is deliberate and load-bearing.
    for (const chars of classes) expect(chars).not.toContain(':')
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

describe('what the eight mis-graded rows do, in the code that actually grades', () => {
  // WHICH SCREENS. src/typedAnswer.js backs the flashcard's typed mode
  // (src/Study.jsx) and src/writingMatch.js backs the Writing screen. Both
  // accept [reading_plain, reading]. The level test does NOT — it is multiple
  // choice over word and meaning — and an earlier version of this migration
  // claimed otherwise, so the claim is pinned below rather than repeated.
  const before = { word: '厂', reading: 'chǎng', reading_plain: 'han' }
  const after = { word: '厂', reading: 'chǎng', reading_plain: 'chang' }

  it('typed mode accepts the wrong pinyin while the stale value is there', () => {
    expect(checkTypedAnswer('han', before, false), 'the premise of this migration is false').toBe(true)
  })

  it('typed mode stops accepting it once repaired, and still accepts the right one', () => {
    expect(checkTypedAnswer('han', after, false)).toBe(false)
    expect(checkTypedAnswer('chang', after, false)).toBe(true)
    expect(checkTypedAnswer('chǎng', after, false)).toBe(true)
    expect(checkTypedAnswer('chang3', after, false)).toBe(true)
  })

  it('the Writing screen grades it the same way, before and after', () => {
    expect(isWritingMatch('han', before, 'to_target', false), 'Writing accepted the stale key').toBe(true)
    expect(isWritingMatch('han', after, 'to_target', false)).toBe(false)
    expect(isWritingMatch('chang', after, 'to_target', false)).toBe(true)
  })

  it('the level test never consults reading_plain, so this is not a gate hole', () => {
    // Pinned because the first draft of this migration, its BACKLOG entry and
    // its ROADMAP line all said it was — and ROADMAP posts to Discord. The
    // level test builds four-option questions over word and meaning and grades
    // by string equality against the chosen option.
    const test = readFileSync('src/Test.jsx', 'utf8')
    expect(test, 'Test.jsx now reads reading_plain — the claim above needs rewriting, not deleting')
      .not.toContain('reading_plain')
    expect(test, 'Test.jsx now grades typed input — re-examine the blast radius')
      .not.toContain('checkAnswer')
  })

  it('the two ü rows do NOT mis-grade — they are hygiene, not a grading fix', () => {
    // Worth stating rather than letting the migration imply otherwise. 忽略 and
    // 策略 carry `hulu:e` / `celu:e`, the ASCII transliteration the 2026-07-24
    // reading fix was written to remove — but lenientPinyin strips `:` along
    // with the rest of its punctuation set, so the stale value and the correct
    // one accept exactly the same inputs.
    //
    // So of the ten rows, EIGHT are the mis-grading defect and two are not. A
    // comment that lumped all ten together would be the kind of small
    // overstatement that makes the rest of the file less trustworthy.
    const stale = { word: '忽略', reading: 'hūlüè', reading_plain: 'hulu:e' }
    const fixed = { word: '忽略', reading: 'hūlüè', reading_plain: 'hulue' }
    for (const typed of ['hulue', 'hulüe', 'hūlüè', 'hulve', 'hulu:e']) {
      expect(checkTypedAnswer(typed, stale, false), typed + ' vs the stale value').toBe(true)
      expect(checkTypedAnswer(typed, fixed, false), typed + ' vs the repaired value').toBe(true)
    }
    // And a genuinely wrong answer is refused either way.
    expect(checkTypedAnswer('hulve2', fixed, false)).toBe(true)   // numeric tone, still fine
    expect(checkTypedAnswer('huluo', fixed, false)).toBe(false)
  })
})
