import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizePinyin } from './src/testLogic.js'
import {
  HARD_CHECKS, DIRECTIONAL_CHECKS, CHECK_CONTRACT, stripTones, answerKeyForm, syllableCount,
  runChecks, emptyInputs, baselineWriteRefusal, baselineFrom, compareToBaseline, formatComparison, BaselineContractError,
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
  it('folds a DECOMPOSED tone mark the way the app does', () => {
    // normalizePinyin decomposes and drops combining marks, so it handles both
    // spellings; a table lookup only handles the precomposed one. The app added
    // that because rows really were stored decomposed.
    const decomposed = 'ha' + String.fromCharCode(0x30c) + 'o'   // hǎo, a + caron
    expect(decomposed.normalize('NFC')).not.toBe(decomposed)
    expect(stripTones(decomposed).toLowerCase(), 'a decomposed tone mark survived the fold')
      .toBe(normalizePinyin(decomposed))
    expect(answerKeyForm(decomposed)).toBe('hao')
  })

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
    expect(fires('placeholder-meaning', { vocabulary: [row()] })).toBe(0)
    // A real gloss that happens to contain the word is fine.
    expect(fires('placeholder-meaning', { vocabulary: [row({ meaning: 'good, well' })] })).toBe(0)
    // A PROPER NOUN's gloss legitimately is its reading, and this is a hard
    // check — firing here would fail the run for everybody over a correct row.
    expect(fires('placeholder-meaning', {
      vocabulary: [row({ word: '上海', reading: 'Shànghǎi', reading_plain: 'Shanghai', meaning: 'Shanghai' })],
    }), 'a proper noun gloss was called a placeholder').toBe(0)
  })

  it('duplicate-word catches a second row for the same word, once', () => {
    const dupes = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]
    expect(fires('duplicate-word', { vocabulary: dupes })).toBe(2)
    expect(fires('duplicate-word', { vocabulary: [row({ id: 'a' }), row({ id: 'b', word: '你' })] })).toBe(0)
  })

  it('duplicate-across-corpus catches a dictionary save shadowing a curriculum row', () => {
    const curriculum = [row({ id: 'a', word: '白', level: 5 })]
    const save = [row({ id: 'b', word: '白', level: null, sort_order: 0 })]
    expect(fires('duplicate-across-corpus', { vocabulary: curriculum, learnerAdded: save })).toBe(1)
    // A save of a word the curriculum does not carry is the ordinary case and
    // must never fire — the whole point of splitting the corpus is that a
    // learner cannot turn this gate red.
    expect(fires('duplicate-across-corpus', {
      vocabulary: curriculum, learnerAdded: [row({ id: 'b', word: '黑', level: null, sort_order: 0 })],
    })).toBe(0)
    // Two saves of the same word are not this check's business either: they are
    // learner-reachable, and duplicate-word deliberately does not see them.
    expect(fires('duplicate-across-corpus', {
      vocabulary: [], learnerAdded: [row({ id: 'b', word: '黑', level: null }), row({ id: 'c', word: '黑', level: null })],
    })).toBe(0)
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
    // reading ONLY. Two production rows still carry `u:` in reading_plain, and
    // reading-plain-drift counts them; widening this HARD check to that column
    // would fail the run on debt already measured somewhere else. Asserted,
    // because the scoping is a decision and not an oversight.
    expect(fires('reading-ascii-umlaut', {
      vocabulary: [row({ word: '忽略', reading: 'hūlüè', reading_plain: 'hulu:e' })],
    }), 'the hard check reached reading_plain, which is directional debt').toBe(0)
  })

  it('syllable-count catches a reading that cannot belong to the word', () => {
    expect(fires('syllable-count', { vocabulary: [row({ word: '朋友', reading: 'péng' })] })).toBe(1)
    expect(fires('syllable-count', { vocabulary: [row({ word: '朋友', reading: 'péngyǒu' })] })).toBe(0)
    // Erhua fuses onto the previous syllable, so one fewer is correct.
    expect(fires('syllable-count', { vocabulary: [row({ word: '花儿', reading: 'huār' })] })).toBe(0)
    // But only as a SUFFIX. 儿 at the front carries its own syllable — 儿子,
    // 儿童, 儿女, 儿科, 幼儿园 are all in the corpus — and an `includes` test let
    // the exemption cover them, so a reading of `ér` for 儿子 passed a hard
    // check whose whole job is to catch a reading that cannot belong to its
    // word.
    expect(fires('syllable-count', { vocabulary: [row({ word: '儿子', reading: 'ér' })] }),
      'the erhua exemption covered a 儿-initial word').toBe(1)
    expect(fires('syllable-count', { vocabulary: [row({ word: '儿子', reading: 'érzi' })] })).toBe(0)
    // 儿-FINAL BUT SYLLABIC. The corpus has 22 rows ending in 儿, and in three
    // of them (女儿 nǚ'ér, 婴儿 yīng ér, 少儿 shào ér) the 儿 is a full syllable —
    // so `endsWith('儿')` alone let a reading one syllable short pass a HARD
    // check. The reading has to SHOW the fusion.
    expect(fires('syllable-count', { vocabulary: [row({ word: '婴儿', reading: 'yīng' })] }),
      'a 儿-final word with a syllabic 儿 was exempted').toBe(1)
    expect(fires('syllable-count', { vocabulary: [row({ word: '婴儿', reading: 'yīng ér' })] })).toBe(0)
    expect(fires('syllable-count', { vocabulary: [row({ word: '女儿', reading: "nǚ'ér" })] })).toBe(0)
    // And the two rows stored with a numeric tone after the r, which a bare
    // /r$/ would have called violations.
    expect(fires('syllable-count', { vocabulary: [row({ word: '小偷儿', reading: 'xiǎotōur5' })] })).toBe(0)
    expect(fires('syllable-count', { vocabulary: [row({ word: '没法儿', reading: 'méifǎr5' })] })).toBe(0)
    // As production stores it — spaced. Squashed, `yòuéryuán` folds to
    // `youeryuan`, whose o-u-e run spans a syllable boundary and counts 2, so
    // the check would fire on a correct row. It does not today (measured: zero
    // violations over the whole corpus), because a reading whose syllables meet
    // vowel-to-vowel is stored with the separator that makes it readable.
    expect(fires('syllable-count', { vocabulary: [row({ word: '幼儿园', reading: 'yòu ér yuán' })] })).toBe(0)
    // A row with no Han character (a Latin-script track) is not this check's
    // business and must not be counted as a violation.
    expect(fires('syllable-count', { vocabulary: [row({ word: 'privet', reading: 'privet' })] })).toBe(0)
    // Nor is a MIXED-script headword: the Latin letters carry vowels of their
    // own, so the count is meaningless rather than wrong — and a meaningless
    // count in a hard check fails the run for everybody.
    for (const [word, reading] of [['T恤', 'T xù'], ['X光', 'X guāng'], ['AA制', 'AA zhì']]) {
      expect(fires('syllable-count', { vocabulary: [row({ word, reading })] }), word).toBe(0)
    }
    // And a reading with no vowel run at all cannot be counted either.
    expect(fires('syllable-count', { vocabulary: [row({ word: '嗯', reading: 'ǹg' })] })).toBe(0)
  })

  it('does not call a card with no vocab_id an orphan', () => {
    // A NULL vocab_id is a row with no reference, not a reference to a missing
    // row. Counting it here would fail a HARD check and print "missing vocab
    // null", which names neither the defect nor its fix.
    expect(byId(HARD_CHECKS, 'card-orphan').collect({
      vocabularyIds: new Set(['live']), cards: [{ id: 'c1', vocab_id: null }],
    }).length, 'a NULL vocab_id was reported as a broken reference').toBe(0)
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

  it('level-null-row-shape catches a curriculum row that lost its level', () => {
    const fire = (learnerAdded) => byId(HARD_CHECKS, 'level-null-row-shape').collect({ learnerAdded })
    // The dictionary-save shape: level null, sort_order 0. Not a defect.
    expect(fire([row({ level: null, sort_order: 0 })]).length).toBe(0)
    // A curriculum row that lost its level keeps its sort_order, and would
    // otherwise drop out of every other check without anything noticing.
    expect(fire([row({ level: null, sort_order: 412 })]).length,
      'a curriculum row with no level passed as a dictionary save').toBe(1)
    expect(fire([]).length).toBe(0)
  })

  it('ready-audio-has-path catches a vocabulary clip marked ready with no path', () => {
    const clip = (over) => [{ id: 't1', source_type: 'vocabulary', status: 'ready', storage_path: null, ...over }]
    expect(fires('ready-audio-has-path', { ttsAudio: clip() })).toBe(1)
    expect(fires('ready-audio-has-path', { ttsAudio: clip({ storage_path: 'a/b.mp3' }) })).toBe(0)
    expect(fires('ready-audio-has-path', { ttsAudio: clip({ status: 'pending' }) })).toBe(0)
    // The scope belongs in the predicate, not in the caller's query. The script
    // fetches only source_type='vocabulary' today, so a story-utterance clip
    // never reaches this check — but a later widening of that fetch would
    // silently widen a HARD check onto debt nobody baselined, and the two
    // sibling checks already filter for themselves.
    expect(fires('ready-audio-has-path', { ttsAudio: clip({ source_type: 'story_utterance' }) }),
      'a story clip reached a check scoped to vocabulary').toBe(0)
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
    const vocabularyIds = new Set(['live', 'retired'])
    const clip = (source_id, source_type = 'vocabulary') => [{ id: 't', source_type, source_id }]
    expect(fires('tts-orphan', { vocabularyIds, ttsAudio: clip('gone') })).toBe(1)
    expect(fires('tts-orphan', { vocabularyIds, ttsAudio: clip('live') })).toBe(0)
    expect(fires('tts-orphan', { vocabularyIds, ttsAudio: clip('gone', 'story_utterance') })).toBe(0)
    // A clip on a DEACTIVATED row is not an orphan — §7.1 deactivates rather
    // than deletes, and scoping this to the active corpus would make that
    // sanctioned repair grow the count and red the gate.
    expect(fires('tts-orphan', { vocabularyIds, ttsAudio: clip('retired') }),
      'deactivating a word turned its clip into an orphan').toBe(0)
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

  it('is not asked to count level-null rows, because they are learner saves', () => {
    // dict_add_to_deck inserts `level null, sort_order 0` for any dictionary
    // word a learner taps to save, from three shipped screens. Counting those
    // as curriculum debt would grow a directional count on ordinary use and red
    // the gate — so the corpus is the curriculum and this check is gone.
    expect(DIRECTIONAL_CHECKS.map(c => c.id), 'level-null is measured as debt again')
      .not.toContain('level-null')
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

  it('fails when the baseline counts a check that no longer exists', () => {
    // The mirror of the unbaselined case: delete a directional check and its
    // debt is measured by nobody and reported by nothing. Iterating the result
    // alone cannot see it, so the baseline's own keys are walked too.
    const result = runChecks(drifted)
    const base = baselineFrom(result)
    base.counts['a-check-that-was-deleted'] = 5
    const cmp = compareToBaseline(result, base)
    expect(cmp.ok, 'an orphaned baseline entry passed silently').toBe(false)
    expect(cmp.orphaned).toContain('a-check-that-was-deleted')
    expect(formatComparison(cmp)).toContain('GONE')
  })

  it('refuses to compare across contracts instead of guessing', () => {
    const result = runChecks(clean)
    expect(() => compareToBaseline(result, { contract: 'something-else@9', counts: {} }))
      .toThrow(BaselineContractError)
    expect(() => compareToBaseline(result, null)).toThrow(BaselineContractError)
    // A baseline with the right contract and no counts is unusable the same
    // way, and belongs on the same path — otherwise it fails as a TypeError
    // from the row map and reaches the operator as a stack trace.
    expect(() => compareToBaseline(result, { contract: CHECK_CONTRACT }))
      .toThrow(BaselineContractError)
    expect(() => compareToBaseline(result, { contract: CHECK_CONTRACT, counts: null }))
      .toThrow(BaselineContractError)
    expect(baselineFrom(result).contract).toBe(CHECK_CONTRACT)
  })

  it('the accept path refuses to write a baseline while a hard check is red', () => {
    // Driven through the decision itself, not the script's text. The source
    // assertion this replaces would have passed unchanged if the failures were
    // computed from result.directional instead of result.hard — the exact
    // regression the refusal exists to prevent.
    const broken = { ...clean, vocabulary: [row({ meaning: '' })] }
    const refusal = baselineWriteRefusal(runChecks(broken))
    expect(refusal, 'a red hard tier was accepted').not.toBeNull()
    expect(refusal.hardFailures.map(c => c.id)).toContain('blank-field')
    expect(refusal.reason).toMatch(/blank-field/)
    // Directional debt is exactly what the baseline is FOR, so it must not
    // refuse: a run with drift and a clean hard tier writes.
    expect(baselineWriteRefusal(runChecks(drifted)), 'directional debt blocked the accept path').toBeNull()
    // And the script acts on it rather than printing it.
    const src = readFileSync('check-vocabulary-integrity.mjs', 'utf8')
    const acceptBlock = src.slice(src.indexOf('if (update) {'), src.indexOf('if (!existsSync(BASELINE))'))
    expect(acceptBlock, 'the accept path no longer consults the refusal').toContain('baselineWriteRefusal(result)')
    expect(acceptBlock.indexOf('process.exit(1)'), 'the write happens before the refusal')
      .toBeLessThan(acceptBlock.indexOf('writeFileSync'))
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

  it('names every input that came back empty, so a partial fetch cannot pass', () => {
    // Driven, not grepped. Every check whose input is missing returns [] —
    // right for the module, wrong for a run, because a fetch that came back
    // empty for the wrong reason would report those checks clean. card-orphan
    // is the contract's "broken references" check and reads `cards`.
    const full = {
      vocabulary: [row()], vocabularyIds: new Set(['v1']), cards: [{ id: 'c', vocab_id: 'v1' }],
      ttsAudio: [{ id: 't', source_type: 'vocabulary', source_id: 'v1', status: 'ready', storage_path: 'a.mp3' }],
      audioObjects: new Set([row().audio_path]),
    }
    expect(emptyInputs(full), 'a complete fetch was called partial').toEqual([])
    for (const key of Object.keys(full)) {
      const partial = { ...full, [key]: key === 'vocabularyIds' || key === 'audioObjects' ? new Set() : [] }
      expect(emptyInputs(partial).length, key + ' came back empty and nothing noticed').toBe(1)
    }
    // Absent entirely is the same failure as empty, not a pass.
    expect(emptyInputs({}).length).toBe(5)
    // And the script acts on it rather than logging it — and hands it every
    // input it fetched. A sixth fetch added without a matching key would be
    // unguarded and nothing else would notice.
    const src = readFileSync('check-vocabulary-integrity.mjs', 'utf8')
    // Structure, not a character budget. The previous form allowed 200
    // characters between the call and the exit and sat about one character
    // under it, so adding a word to the error message would have broken a spec
    // whose subject had not changed. What matters is that the result is bound,
    // tested, and exits — in that order, before anything else runs.
    const guard = src.slice(src.indexOf('const empty = emptyInputs('), src.indexOf('const result = runChecks('))
    expect(guard, 'the guard no longer binds emptyInputs').toContain('emptyInputs({')
    expect(guard, 'the guard no longer tests its result').toMatch(/if\s*\(empty\.length\)/)
    expect(guard, 'the partial-fetch guard no longer stops the run').toContain('process.exit(2)')
    const call = src.slice(src.indexOf('emptyInputs({'), src.indexOf('})', src.indexOf('emptyInputs({')))
    for (const key of Object.keys(full)) {
      expect(call, key + ' is fetched but not handed to the guard').toContain(key)
    }
  })

  it('pages the fetch in a stable order, so rows cannot be dropped or doubled', () => {
    // An unordered .range() scan has no stable ordering in PostgREST. An
    // overlap feeds duplicates into the duplicate-word HARD check and fails the
    // run for everybody; a skip shrinks a directional count and passes.
    const src = readFileSync('check-vocabulary-integrity.mjs', 'utf8')
    expect(src, 'the paged fetch is no longer ordered').toMatch(/\.order\('id',\s*\{\s*ascending:\s*true\s*\}\)/)
    // The storage listing is paged too, and its ordering was left to the
    // client's default until a review pointed out that the argument written
    // down for one loop had not been applied to the other. Pinned here so
    // dropping it again is not silent.
    expect(src, 'the storage listing is no longer ordered').toMatch(/sortBy:\s*\{\s*column:\s*'name',\s*order:\s*'asc'\s*\}/)
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
