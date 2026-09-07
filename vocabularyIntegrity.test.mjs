import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizePinyin } from './src/testLogic.js'
import {
  HARD_CHECKS, DIRECTIONAL_CHECKS, CHECK_CONTRACT, stripTones, answerKeyForm, syllableCount,
  runChecks, baselineFrom, compareToBaseline, formatComparison, BaselineContractError,
} from './vocabularyIntegrity.mjs'

// FAB-36 — the vocabulary integrity gate.
//
// The checks are pure so they can be driven from here without a database. What
// these specs are for is the two ways a gate like this fails silently:
//
//   * a check that cannot fire (its predicate is wrong, or it was quietly
//     narrowed), so a clean report means nothing;
//   * a baseline comparison that lets debt grow, or that treats an unmeasured
//     check as a pass.
//
// So every check is driven twice — a row that must fire it, and a row that must
// not — and the comparison is driven through all four verdicts.

const byId = (checks, id) => checks.find(c => c.id === id)
const row = (over) => ({
  id: 'v1', word: '好', reading: 'hǎo', reading_plain: 'hao', meaning: 'good',
  level: 1, audio_path: 'chinese/hsk_3/level_1/001_hao.mp3', ...over,
})

describe('the tone fold agrees with the one the app grades against', () => {
  it('folds every character src/testLogic.js folds', () => {
    // reading_plain is an answer key: typedAnswer.js and writingMatch.js both
    // accept it through normalizePinyin. A checker that disagreed about what
    // "tone-stripped" means would report drift on correct rows, or miss it on
    // wrong ones.
    for (const ch of 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ') {
      expect(stripTones(ch).toLowerCase(), 'the checker and the app disagree about ' + ch)
        .toBe(normalizePinyin(ch))
    }
  })

  it('ignores space, apostrophe and case when comparing answer keys — and nothing else', () => {
    expect(answerKeyForm("nǚ'ér")).toBe(answerKeyForm('nu er'))
    expect(answerKeyForm('Zhōngguó')).toBe(answerKeyForm('zhongguo'))
    // `:` is NOT ignored, deliberately: `hulu:e` is the ASCII transliteration a
    // 2026-07 migration removed from `reading` and left in `reading_plain`, and
    // folding `:` here would hide exactly those rows.
    expect(answerKeyForm('hulu:e')).not.toBe(answerKeyForm('hulüe'))
  })

  it('counts one syllable per vowel run', () => {
    expect(syllableCount('hǎo')).toBe(1)
    expect(syllableCount('nǐ hǎo')).toBe(2)
    expect(syllableCount('')).toBe(0)
  })
})

describe('each hard check fires on the defect and only on the defect', () => {
  const fires = (id, data) => byId(HARD_CHECKS, id).collect(data).length

  it('blank-field catches an empty or untrimmed core field', () => {
    expect(fires('blank-field', { vocabulary: [row({ meaning: '   ' })] })).toBe(1)
    expect(fires('blank-field', { vocabulary: [row({ word: '好 ' })] })).toBe(1)
    expect(fires('blank-field', { vocabulary: [row()] })).toBe(0)
  })

  it('placeholder-meaning catches a stub gloss and a gloss that just repeats the word', () => {
    expect(fires('placeholder-meaning', { vocabulary: [row({ meaning: 'TODO' })] })).toBe(1)
    expect(fires('placeholder-meaning', { vocabulary: [row({ meaning: '好' })] })).toBe(1)
    expect(fires('placeholder-meaning', { vocabulary: [row({ meaning: 'hǎo' })] })).toBe(1)
    expect(fires('placeholder-meaning', { vocabulary: [row()] })).toBe(0)
    // A real gloss that happens to contain the word is fine.
    expect(fires('placeholder-meaning', { vocabulary: [row({ meaning: 'good, well' })] })).toBe(0)
  })

  it('duplicate-word catches a second row for the same word, once', () => {
    const dupes = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]
    expect(fires('duplicate-word', { vocabulary: dupes })).toBe(2)
    expect(fires('duplicate-word', { vocabulary: [row({ id: 'a' }), row({ id: 'b', word: '你' })] })).toBe(0)
  })

  it('level-range catches a level outside HSK 1-9 but not a null one', () => {
    expect(fires('level-range', { vocabulary: [row({ level: 0 })] })).toBe(1)
    expect(fires('level-range', { vocabulary: [row({ level: 10 })] })).toBe(1)
    expect(fires('level-range', { vocabulary: [row({ level: 9 })] })).toBe(0)
    // A null level is real debt, but it is the directional check's business —
    // firing here too would make one defect fail two ways.
    expect(fires('level-range', { vocabulary: [row({ level: null })] })).toBe(0)
  })

  it('reading-ascii-umlaut catches the transliteration that should never come back', () => {
    expect(fires('reading-ascii-umlaut', { vocabulary: [row({ reading: 'hūlu:è' })] })).toBe(1)
    expect(fires('reading-ascii-umlaut', { vocabulary: [row({ reading: 'lve' })] })).toBe(1)
    expect(fires('reading-ascii-umlaut', { vocabulary: [row({ reading: 'hūlüè' })] })).toBe(0)
  })

  it('syllable-count catches a reading that cannot belong to the word', () => {
    expect(fires('syllable-count', { vocabulary: [row({ word: '朋友', reading: 'péng' })] })).toBe(1)
    expect(fires('syllable-count', { vocabulary: [row({ word: '朋友', reading: 'péngyǒu' })] })).toBe(0)
    // Erhua fuses onto the previous syllable, so one fewer is correct.
    expect(fires('syllable-count', { vocabulary: [row({ word: '花儿', reading: 'huār' })] })).toBe(0)
    // A row with no Han character (a Latin-script track) is not this check's
    // business and must not be counted as a violation.
    expect(fires('syllable-count', { vocabulary: [row({ word: 'privet', reading: 'privet' })] })).toBe(0)
  })

  it('card-orphan catches a card pointing at no vocabulary row at all', () => {
    const ids = new Set(['live', 'japanese-row'])
    expect(fires('card-orphan', { vocabularyIds: ids, cards: [{ id: 'c1', vocab_id: 'gone' }] })).toBe(1)
    expect(fires('card-orphan', { vocabularyIds: ids, cards: [{ id: 'c1', vocab_id: 'live' }] })).toBe(0)
    // A card on another language's word is not an orphan. This check reads
    // every vocabulary id, not the slice the other checks measure — scoping it
    // to chinese/hsk_3 would report every learner's other-track cards as broken
    // references, which is both false and unfixable.
    expect(fires('card-orphan', { vocabularyIds: ids, cards: [{ id: 'c1', vocab_id: 'japanese-row' }] })).toBe(0)
  })

  it('ready-audio-has-path catches a clip marked ready with nothing behind it', () => {
    expect(fires('ready-audio-has-path', { ttsAudio: [{ id: 't1', status: 'ready', storage_path: null }] })).toBe(1)
    expect(fires('ready-audio-has-path', { ttsAudio: [{ id: 't1', status: 'ready', storage_path: 'a/b.mp3' }] })).toBe(0)
    expect(fires('ready-audio-has-path', { ttsAudio: [{ id: 't1', status: 'pending', storage_path: null }] })).toBe(0)
  })
})

describe('each directional check fires on the defect and only on the defect', () => {
  const fires = (id, data) => byId(DIRECTIONAL_CHECKS, id).collect(data).length

  it('reading-plain-drift catches a stale answer key, not a spaced one', () => {
    expect(fires('reading-plain-drift', { vocabulary: [row({ word: '厂', reading: 'chǎng', reading_plain: 'han' })] })).toBe(1)
    // The hand-curated HSK 1 rows keep spaces, capitals and an apostrophe. They
    // are correct answer keys, and a check that flagged them would be asking for
    // eleven rows to be broken.
    expect(fires('reading-plain-drift', { vocabulary: [row({ word: '你好', reading: 'nǐ hǎo', reading_plain: 'ni hao' })] })).toBe(0)
    expect(fires('reading-plain-drift', { vocabulary: [row({ word: '中国', reading: 'Zhōngguó', reading_plain: 'Zhongguo' })] })).toBe(0)
    expect(fires('reading-plain-drift', { vocabulary: [row({ word: '女儿', reading: "nǚ'ér", reading_plain: "nu'er" })] })).toBe(0)
  })

  it('no-audio counts a word with neither a ready clip nor a stored file', () => {
    const v = [row({ id: 'a' })]
    expect(fires('no-audio', { vocabulary: v, ttsAudio: [], audioObjects: new Set() })).toBe(1)
    // A stored file at the row's own path counts.
    expect(fires('no-audio', { vocabulary: v, ttsAudio: [], audioObjects: new Set([row().audio_path]) })).toBe(0)
    // So does a ready tts_audio row.
    expect(fires('no-audio', {
      vocabulary: v, audioObjects: new Set(),
      ttsAudio: [{ id: 't', source_type: 'vocabulary', source_id: 'a', status: 'ready' }],
    })).toBe(0)
    // A clip that is not ready does not.
    expect(fires('no-audio', {
      vocabulary: v, audioObjects: new Set(),
      ttsAudio: [{ id: 't', source_type: 'vocabulary', source_id: 'a', status: 'pending' }],
    })).toBe(1)
    // audio_path is set at seed time for every row, so a path with no FILE
    // behind it is exactly the gap this counts.
    expect(fires('no-audio', { vocabulary: v, ttsAudio: [], audioObjects: new Set(['some/other/file.mp3']) })).toBe(1)
  })

  it('tts-orphan counts a clip whose word is gone, and ignores story clips', () => {
    const vocabulary = [row({ id: 'live' })]
    expect(fires('tts-orphan', { vocabulary, ttsAudio: [{ id: 't', source_type: 'vocabulary', source_id: 'gone' }] })).toBe(1)
    expect(fires('tts-orphan', { vocabulary, ttsAudio: [{ id: 't', source_type: 'vocabulary', source_id: 'live' }] })).toBe(0)
    expect(fires('tts-orphan', { vocabulary, ttsAudio: [{ id: 't', source_type: 'story_utterance', source_id: 'gone' }] })).toBe(0)
  })

  it('truncated-cross-reference catches a gloss carrying a lone Han character', () => {
    expect(fires('truncated-cross-reference', { vocabulary: [row({ meaning: 'Canada (abbr. for 大)' })] })).toBe(1)
    expect(fires('truncated-cross-reference', { vocabulary: [row({ meaning: 'good, well' })] })).toBe(0)
    // A gloss quoting a real multi-character word is not the truncation defect.
    expect(fires('truncated-cross-reference', { vocabulary: [row({ meaning: 'short for 加拿大' })] })).toBe(0)
  })

  it('reading-has-digit catches a numeric tone in a tone-marked column', () => {
    expect(fires('reading-has-digit', { vocabulary: [row({ reading: 'hao3' })] })).toBe(1)
    expect(fires('reading-has-digit', { vocabulary: [row()] })).toBe(0)
  })

  it('level-null catches a row no level query can reach', () => {
    expect(fires('level-null', { vocabulary: [row({ level: null })] })).toBe(1)
    expect(fires('level-null', { vocabulary: [row({ level: 3 })] })).toBe(0)
  })
})

describe('the baseline comparison', () => {
  const clean = {
    vocabulary: [row()], vocabularyIds: new Set(['v1']), cards: [],
    ttsAudio: [], audioObjects: new Set([row().audio_path]),
  }
  const drifted = {
    ...clean,
    vocabulary: [row({ word: '厂', reading: 'chǎng', reading_plain: 'han' })],
    audioObjects: new Set([row().audio_path]),
  }

  it('accepts a run that matches its baseline', () => {
    const result = runChecks(drifted)
    const cmp = compareToBaseline(result, baselineFrom(result))
    expect(cmp.ok).toBe(true)
    expect(cmp.rows.every(r => r.verdict === 'held')).toBe(true)
  })

  it('fails when debt grows, and says which check grew', () => {
    const base = baselineFrom(runChecks(clean))
    const cmp = compareToBaseline(runChecks(drifted), base)
    expect(cmp.ok, 'new debt passed the gate').toBe(false)
    expect(cmp.rows.find(r => r.id === 'reading-plain-drift').verdict).toBe('grew')
    expect(formatComparison(cmp)).toContain('GREW')
  })

  it('passes when debt shrinks, without anyone editing the baseline', () => {
    const base = baselineFrom(runChecks(drifted))
    const cmp = compareToBaseline(runChecks(clean), base)
    expect(cmp.ok, 'a repair failed the gate — nobody would repair anything').toBe(true)
    expect(cmp.rows.find(r => r.id === 'reading-plain-drift').verdict).toBe('shrank')
  })

  it('fails a hard check no matter what the baseline says', () => {
    const broken = { ...clean, vocabulary: [row({ meaning: '' })] }
    const cmp = compareToBaseline(runChecks(broken), baselineFrom(runChecks(broken)))
    expect(cmp.ok, 'a hard check was absorbed by the baseline').toBe(false)
    expect(cmp.hardFailures.map(c => c.id)).toContain('blank-field')
  })

  it('fails a check the baseline has never measured, rather than reporting it clean', () => {
    // The quiet failure this gate exists to avoid: add a check, forget the
    // baseline entry, and it reports nothing forever.
    const result = runChecks(drifted)
    const base = baselineFrom(result)
    delete base.counts['reading-plain-drift']
    const cmp = compareToBaseline(result, base)
    expect(cmp.ok, 'an unbaselined check passed silently').toBe(false)
    expect(cmp.rows.find(r => r.id === 'reading-plain-drift').verdict).toBe('unbaselined')
  })

  it('refuses to compare across contracts instead of guessing', () => {
    const result = runChecks(clean)
    expect(() => compareToBaseline(result, { contract: 'something-else@9', counts: {} }))
      .toThrow(BaselineContractError)
    expect(() => compareToBaseline(result, null)).toThrow(BaselineContractError)
    expect(baselineFrom(result).contract).toBe(CHECK_CONTRACT)
  })

  it('every directional check appears in a generated baseline', () => {
    const base = baselineFrom(runChecks(clean))
    for (const check of DIRECTIONAL_CHECKS) {
      expect(Object.keys(base.counts), check.id + ' would be unmeasurable').toContain(check.id)
    }
  })
})

describe('a check with nothing to read reports nothing, and never reports clean', () => {
  it('returns no violations when its input is absent', () => {
    // The script is what refuses to run on an empty fetch; these predicates are
    // deliberately quiet so a partial fetch cannot manufacture violations.
    for (const check of [...HARD_CHECKS, ...DIRECTIONAL_CHECKS]) {
      expect(check.collect({}), check.id + ' invented a violation from no data').toEqual([])
    }
  })

  it('the script refuses an empty corpus rather than reporting clean', () => {
    // Asserted against the script's source because the fetch is the part that
    // cannot be unit-tested: it needs the service key. What must never happen is
    // a run that fetched nothing and printed a pass.
    const src = readFileSync('check-vocabulary-integrity.mjs', 'utf8')
    expect(src, 'the empty-corpus guard is gone').toMatch(/vocabulary\.length === 0/)
    expect(src, 'the empty-corpus guard no longer stops the run').toMatch(/Refusing to report on an empty corpus/)
  })
})
