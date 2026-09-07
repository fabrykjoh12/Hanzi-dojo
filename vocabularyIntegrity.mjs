// The vocabulary integrity checks, as pure functions over fetched rows.
//
// FAB-36. The audit that produced these measured a corpus that is clean at
// HSK 1–2 and broken above it, and the split below is that finding turned into
// a gate: a check that FAILS today is a finding, not a check, so it goes behind
// a directional baseline instead of turning the run red for everybody.
//
//   HARD        — zero violations today. Any violation fails the run.
//   DIRECTIONAL — violations today. Compared against a committed baseline:
//                 existing debt may shrink freely, new debt fails.
//
// The same shape check-content-integrity.mjs uses for story debt, for the same
// reason: a gate nobody can pass gets switched off, and a gate that rewrites
// its own expectations checks nothing.
//
// Pure on purpose. Every predicate here takes rows and returns violations, so
// the logic is testable without a database — the script does the fetching.

export const CHECK_CONTRACT = 'fab36-vocab-integrity@1'

// ── Small shared helpers ────────────────────────────────────────────────────

const TONE_MARKED = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ'
const TONE_PLAIN = 'aaaaeeeeiiiioooouuuuuuuuuAAAAEEEEIIIIOOOOUUUUUUUUU'

// The same fold src/testLogic.js's normalizePinyin performs, and the same one
// the pending reading_plain repair writes into SQL — that migration is on the
// claude/fab-36-reading-plain-drift branch, not in this change, so do not go
// looking for it under supabase/migrations/ here. Three copies of one rule is
// two too many, but they live in three languages; a spec holds this one to the
// app's.
//
// COMPOSED FIRST, which is not decoration. normalizePinyin decomposes to NFD
// and drops every combining mark, so it folds a decomposed `ǎ` (a + U+030C) as
// happily as a precomposed one; a table lookup does not. The app added that
// handling because rows really were stored decomposed. normalize('NFC') is what
// makes the table see the character the table knows, and it is the same thing
// `normalize(v.reading, nfc)` does in the SQL. Production holds no non-NFC
// reading today (measured), so this changes no count.
//
// WHERE THE TWO STILL DIFFER, since "the same fold" would otherwise be too
// strong a word: normalizePinyin drops EVERY combining mark, so it also folds
// marks this table does not carry — `ǹ`→`n`, `ḿ`→`m`. This map covers the
// tone-marked vowels and nothing else. The difference can only make
// reading-plain-drift over-report (a correct row read `ǹg` with a plain form
// `ng` is counted as drift), never under-report, and that check is directional
// so an over-report cannot fail a run. It would keep the count from reaching
// zero, which is worth knowing before anyone tries to drive it there.
export function stripTones(reading) {
  let out = ''
  for (const ch of String(reading == null ? '' : reading).normalize('NFC')) {
    const i = TONE_MARKED.indexOf(ch)
    out += i === -1 ? ch : TONE_PLAIN[i]
  }
  return out
}

// The three differences that are NEVER drift: space, apostrophe, case.
//
// Deliberately NARROWER than the app's own comparison. lenientPinyin
// (src/testLogic.js) also ignores digits 1-5, `v`/`ü` and a punctuation set
// that includes `:` — so `hulu:e` and `hulüe` are the same answer to the app,
// and folding `:` here would hide the two rows still carrying the ASCII
// transliteration a 2026-07 migration removed from `reading`. Being stricter
// than the grader can only over-report drift, never miss it, and what it
// over-reports is exactly what an integrity check should see.
export function answerKeyForm(value) {
  return stripTones(value).toLowerCase().replace(/[ '’]/g, '')
}

const CJK = /[\u4e00-\u9fff]/
// A vowel run is one syllable. Crude, and it says so twice over: it cannot tell
// whether a syllable is the RIGHT one, only how many there are — and where two
// syllables meet vowel-to-vowel with no separator (`youeryuan` for 幼儿园) it
// counts them as one. The corpus stores those spaced or apostrophed, which is
// why the hard check is at zero; a future squashed row of that shape would be a
// false positive, and the erhua exemption below is the only allowance made.
export function syllableCount(reading) {
  const plain = stripTones(reading).toLowerCase()
  return (plain.match(/[aeiou]+/g) || []).length
}

const blank = (v) => v == null || String(v).trim() === ''

// ── The checks ──────────────────────────────────────────────────────────────
//
// `collect(data)` returns an array of violations, each `{ id, detail }`.
// `data` is `{ vocabulary, cards, ttsAudio, audioObjects }` — every array may
// be absent, and a check whose input is missing returns [] rather than
// pretending to have looked. That is deliberate: a checker that reports "clean"
// because it fetched nothing is the failure mode these exist to prevent, so the
// script asserts it fetched something before trusting any of this.

export const HARD_CHECKS = [
  {
    id: 'blank-field',
    describe: 'every active row has a non-blank, trimmed word, reading, reading_plain and meaning',
    collect: ({ vocabulary = [] }) => vocabulary.flatMap((row) => {
      const bad = ['word', 'reading', 'reading_plain', 'meaning']
        .filter(f => blank(row[f]) || String(row[f]) !== String(row[f]).trim())
      return bad.length ? [{ id: row.id, detail: row.word + ': ' + bad.join(', ') }] : []
    }),
  },
  {
    id: 'placeholder-meaning',
    describe: 'no meaning is a placeholder or a bare repeat of the word itself',
    // The reading is NOT compared, on purpose. A proper noun's gloss legitimately
    // is its reading — 上海 "Shanghai", and the band contains such rows — so an
    // echo test against `reading` or `reading_plain` would hard-fail the run on a
    // correct gloss. The word itself is different: a Chinese headword repeated as
    // its own English meaning is never a gloss.
    collect: ({ vocabulary = [] }) => vocabulary.flatMap((row) => {
      const m = String(row.meaning || '').trim().toLowerCase()
      const placeholder = ['todo', 'tbd', 'n/a', 'na', '???', 'fixme', '-'].includes(m)
      const echo = m && m === String(row.word || '').toLowerCase()
      return placeholder || echo ? [{ id: row.id, detail: row.word + ': ' + row.meaning }] : []
    }),
  },
  {
    id: 'duplicate-word',
    describe: 'no two active rows share a word',
    collect: ({ vocabulary = [] }) => {
      const seen = new Map()
      const out = []
      for (const row of vocabulary) {
        const prior = seen.get(row.word)
        if (prior) out.push({ id: row.id, detail: row.word + ' also at ' + prior })
        else seen.set(row.word, row.id)
      }
      return out
    },
  },
  {
    id: 'level-range',
    describe: 'a level, when present, is between 1 and 9',
    collect: ({ vocabulary = [] }) => vocabulary
      .filter(row => row.level != null && (row.level < 1 || row.level > 9))
      .map(row => ({ id: row.id, detail: row.word + ': level ' + row.level })),
  },
  {
    id: 'reading-ascii-umlaut',
    describe: 'no reading carries `u:` or `v` where ü belongs',
    // The ASCII transliteration 20260724120000_fix_hsk3_6_readings.sql removed
    // from `reading`. Pinyin has no letter v at all — it only ever appears as a
    // stand-in for ü — so any v is this defect.
    //
    // `reading` ONLY, deliberately. Two rows still carry `u:` in reading_plain
    // (忽略, 策略); they are counted by reading-plain-drift below and repaired by
    // a pending migration. Making this hard check read that column too would
    // fail the gate on debt already measured somewhere else.
    collect: ({ vocabulary = [] }) => vocabulary
      .filter(row => /u:/.test(row.reading || '') || /v/i.test(row.reading || ''))
      .map(row => ({ id: row.id, detail: row.word + ': ' + row.reading })),
  },
  {
    id: 'syllable-count',
    describe: 'the reading has one syllable per character, allowing erhua',
    collect: ({ vocabulary = [] }) => vocabulary.flatMap((row) => {
      const letters = [...String(row.word || '')]
      const chars = letters.filter(c => CJK.test(c)).length
      // Only an all-CJK headword can be counted this way. A mixed-script entry
      // (T恤, X光, AA制) has Latin letters that carry vowels of their own, so the
      // count is meaningless rather than wrong — and this is a HARD check, which
      // means a meaningless count would fail the run for everybody.
      if (!chars || chars !== letters.length) return []
      const syllables = syllableCount(row.reading)
      // A reading with no vowel run at all (the interjection 嗯 as `ǹg`) cannot
      // be counted either. Skipped for the same reason.
      if (!syllables) return []
      // 儿 in erhua fuses onto the previous syllable, so one fewer is expected.
      // Two things have to be true, and getting either wrong opens a hole in a
      // HARD check:
      //
      //   * the 儿 is a SUFFIX. `includes` let the exemption cover 儿-initial
      //     words (儿子, 儿童, 儿女, 儿科, 幼儿园), where 儿 carries its own
      //     syllable, so a reading of `ér` for 儿子 passed.
      //   * the reading actually SHOWS the fusion — it ends in `r`, optionally
      //     followed by a tone digit. `endsWith('儿')` alone still covered the
      //     22 儿-final rows where 儿 is a full syllable (女儿 nǚ'ér, 婴儿 yīng ér,
      //     少儿 shào ér), so a reading of `yīng` for 婴儿 passed.
      //
      // The digit matters: 小偷儿 is stored `xiǎotōur5` and 没法儿 `méifǎr5`, so a
      // bare /r$/ would call both of them violations. Measured over the
      // curriculum with both conditions: zero.
      const fold = stripTones(row.reading || '').toLowerCase()
      const erhua = String(row.word || '').endsWith('儿') && /r\d?\s*$/.test(fold)
      if (syllables === chars || (erhua && syllables === chars - 1)) return []
      return [{ id: row.id, detail: row.word + ' (' + chars + ' chars) / ' + row.reading + ' (' + syllables + ' syllables)' }]
    }),
  },
  {
    id: 'card-orphan',
    describe: 'every card points at a vocabulary row that exists',
    // Against ALL vocabulary ids, not the chinese/hsk_3 slice the rest of these
    // measure — a learner's Japanese card is not an orphan, and a check that
    // called it one would be unfixable. Deactivated is not orphaned either:
    // CLAUDE.md §7.1 deactivates rather than deletes, precisely so the cards
    // that point at them keep working.
    //
    // WORTH KNOWING: `cards.vocab_id` carries a foreign key, so this check
    // cannot fire while that constraint holds, and a green result here is
    // evidence about the constraint rather than about the data. It stays
    // because a floor that depends on a constraint should notice the
    // constraint going away. The reference check with real teeth is
    // `tts-orphan` below — `tts_audio.source_id` has no FK by design, because
    // it points at either a vocabulary row or a story utterance, and 7,416 of
    // them are dangling today.
    collect: ({ vocabularyIds, cards }) => {
      if (!vocabularyIds || !cards) return []
      // A NULL vocab_id is not a reference to a missing row — it is a row with
      // no reference, which is a different defect and not this check's. Without
      // this it would fail a HARD check and print "missing vocab null".
      return cards.filter(c => c.vocab_id != null && !vocabularyIds.has(c.vocab_id))
        .map(c => ({ id: c.id, detail: 'card ' + c.id + ' → missing vocab ' + c.vocab_id }))
    },
  },
  {
    id: 'level-null-is-learner-added',
    describe: 'every row without a level is a dictionary save, not a curriculum row that lost one',
    // The corpus this gate measures is the CURRICULUM — rows with a level. A
    // row without one is a learner tapping "save to deck": dict_add_to_deck
    // (20260719130000) inserts `level null, sort_order 0` and three shipped
    // screens call it. Those rows are not curriculum debt and must not be
    // measured as such; see the corpus note in check-vocabulary-integrity.mjs.
    //
    // What that would otherwise hide is a curriculum row that LOST its level,
    // which would silently drop out of every other check. Curriculum rows carry
    // sort_order >= 1 (measured: the minimum is 1, and no level-null row has a
    // non-zero one), so the shape is the discriminator.
    collect: ({ learnerAdded }) => (learnerAdded || [])
      .filter(row => row.sort_order !== 0)
      .map(row => ({ id: row.id, detail: row.word + ' has no level but sort_order ' + row.sort_order
        + ' — a curriculum row that lost its level, not a dictionary save' })),
  },
  {
    id: 'ready-audio-has-path',
    describe: 'every vocabulary tts_audio row marked ready has a storage path',
    // "vocabulary", because that is what the script fetches — story-utterance
    // clips are never inspected here and this check says nothing about them.
    // It also checks a PATH, not a file: whether an object exists at that path
    // is the no-audio check's question, and only for vocabulary rows.
    collect: ({ ttsAudio }) => (ttsAudio || [])
      .filter(t => t.source_type === 'vocabulary' && t.status === 'ready' && blank(t.storage_path))
      .map(t => ({ id: t.id, detail: 'tts_audio ' + t.id + ' ready with no storage_path' })),
  },
]

export const DIRECTIONAL_CHECKS = [
  {
    id: 'reading-plain-drift',
    describe: 'reading_plain is reading with the tones taken off',
    // An ANSWER KEY, not a display field: checkAnswer accepts it, so a stale
    // value marks wrong pinyin correct on a test that requires 100%.
    collect: ({ vocabulary = [] }) => vocabulary
      .filter(row => answerKeyForm(row.reading_plain) !== answerKeyForm(row.reading))
      .map(row => ({ id: row.id, detail: row.word + ': ' + row.reading + ' vs ' + row.reading_plain })),
  },
  {
    id: 'no-audio',
    describe: 'every active row has a playable clip — a stored file or a ready tts_audio row',
    collect: ({ vocabulary, ttsAudio, audioObjects }) => {
      if (!vocabulary || !ttsAudio || !audioObjects) return []
      const ready = new Set(ttsAudio.filter(t => t.status === 'ready' && t.source_type === 'vocabulary').map(t => t.source_id))
      const files = new Set(audioObjects)
      return vocabulary
        .filter(row => !ready.has(row.id) && !(row.audio_path && files.has(row.audio_path)))
        .map(row => ({ id: row.id, detail: 'L' + row.level + ' ' + row.word }))
    },
  },
  {
    id: 'tts-orphan',
    describe: 'every vocabulary tts_audio row points at a vocabulary row that exists',
    // Against EVERY vocabulary id, for the same reason card-orphan is: §7.1
    // deactivates rather than deletes, so a clip on a retired row is not a
    // broken reference — and scoping this to the active chinese/hsk_3 slice
    // would make the sanctioned repair (is_active = false) GROW the count and
    // red the gate. Measured both ways against production on 2026-09-07: 7,416
    // either way, so this is a correctness fix with no baseline churn.
    collect: ({ vocabularyIds, ttsAudio }) => {
      if (!vocabularyIds || !ttsAudio) return []
      return ttsAudio.filter(t => t.source_type === 'vocabulary' && !vocabularyIds.has(t.source_id))
        .map(t => ({ id: t.id, detail: 'tts_audio ' + t.id + ' → missing vocab ' + t.source_id }))
    },
  },
  {
    id: 'truncated-cross-reference',
    describe: 'no meaning carries a lone Han character where a word belongs',
    // "Canada (abbr. for 大)" — 加拿大 reduced to its last character upstream.
    collect: ({ vocabulary = [] }) => vocabulary
      .filter(row => /(^|[^\u4e00-\u9fff])[\u4e00-\u9fff]([^\u4e00-\u9fff]|$)/.test(row.meaning || ''))
      .map(row => ({ id: row.id, detail: row.word + ': ' + String(row.meaning).slice(0, 60) })),
  },
  {
    id: 'reading-has-digit',
    describe: 'a tone-marked reading carries no numeric tone',
    collect: ({ vocabulary = [] }) => vocabulary
      .filter(row => /\d/.test(row.reading || ''))
      .map(row => ({ id: row.id, detail: row.word + ': ' + row.reading })),
  },
]

// ── Running them ────────────────────────────────────────────────────────────

// Which of the checker's inputs came back empty.
//
// A pure function rather than a block inside the script, because it is one of
// the two properties the contract cares about most — "must not report clean
// without having inspected anything" — and a guard asserted only by grepping
// the script's own source would pass on a guard that is present and
// unreachable. Every count here is a non-zero production number, so an empty
// one is a failed fetch, not a state the corpus can reach.
export function emptyInputs({ vocabulary, vocabularyIds, cards, ttsAudio, audioObjects }) {
  const size = (v) => (v && typeof v.size === 'number' ? v.size : (v || []).length)
  return [
    ['vocabulary', size(vocabulary)],
    ['vocabulary ids', size(vocabularyIds)],
    ['cards', size(cards)],
    ['tts_audio', size(ttsAudio)],
    ['stored clips', size(audioObjects)],
  ].filter(([, n]) => n === 0).map(([name]) => name)
}

// Whether --update-baseline may write, and why not when it may not.
//
// A pure decision rather than a branch inside the script, so a spec can drive
// it: the source-text assertion it replaces would have passed unchanged if the
// failures had been computed from result.directional instead of result.hard,
// which is the exact regression the refusal exists to prevent. The baseline's
// existence is what says the hard tier was clean when it was generated; that
// only means something if this cannot be bypassed.
export function baselineWriteRefusal(result) {
  const hardFailures = (result.hard || []).filter(c => c.violations.length > 0)
  if (!hardFailures.length) return null
  return {
    hardFailures,
    reason: 'a HARD check is failing (' + hardFailures.map(c => c.id).join(', ')
      + '). The directional baseline accepts measured debt; it cannot accept a violation'
      + ' of something that is meant to be zero.',
  }
}

export function runChecks(data) {
  const count = (checks) => checks.map(c => ({
    id: c.id, describe: c.describe, violations: c.collect(data),
  }))
  return { contract: CHECK_CONTRACT, hard: count(HARD_CHECKS), directional: count(DIRECTIONAL_CHECKS) }
}

// The baseline holds counts only, not ids. Ids churn — the vocabulary table has
// been rebuilt at least once — and a baseline that churns is a baseline nobody
// re-reads. What must not move is the NUMBER.
export function baselineFrom(result) {
  const counts = {}
  for (const c of result.directional) counts[c.id] = c.violations.length
  return { contract: result.contract, counts }
}

export class BaselineContractError extends Error {}

export function compareToBaseline(result, baseline) {
  if (!baseline || baseline.contract !== result.contract) {
    throw new BaselineContractError('baseline is ' + (baseline && baseline.contract)
      + ', these checks are ' + result.contract)
  }
  // A baseline carrying the right contract string and no counts is unusable in
  // the same way and belongs on the same path — otherwise it fails as a
  // TypeError from the row map below, which reaches the operator as a stack
  // trace instead of "BASELINE UNUSABLE".
  if (!baseline.counts || typeof baseline.counts !== 'object') {
    throw new BaselineContractError('baseline ' + result.contract + ' carries no counts')
  }
  const rows = result.directional.map((c) => {
    const was = baseline.counts[c.id]
    const now = c.violations.length
    return {
      id: c.id,
      was: was == null ? null : was,
      now,
      // An unbaselined check is NOT a pass. A check added without a baseline
      // entry would otherwise be invisible until somebody regenerated the file.
      verdict: was == null ? 'unbaselined' : now > was ? 'grew' : now < was ? 'shrank' : 'held',
    }
  })
  // A baseline entry no check answers to any more. Deleting a directional check
  // would otherwise leave its debt counted by nobody and reported by nothing —
  // the same silence an unbaselined check would produce, in the other
  // direction. Iterating the RESULT alone cannot see it, so the baseline's own
  // keys are walked too.
  const measured = new Set(result.directional.map(c => c.id))
  const orphaned = Object.keys(baseline.counts).filter(id => !measured.has(id))
  const hardFailures = result.hard.filter(c => c.violations.length > 0)
  return {
    rows,
    orphaned,
    hardFailures,
    ok: hardFailures.length === 0 && orphaned.length === 0
      && rows.every(r => r.verdict !== 'grew' && r.verdict !== 'unbaselined'),
  }
}

export function formatComparison(cmp) {
  const lines = []
  for (const id of cmp.orphaned || []) {
    lines.push('GONE  ' + id.padEnd(26) + '     ?  the baseline counts a check that no longer exists')
  }
  for (const c of cmp.hardFailures) {
    lines.push('FAIL  ' + c.id.padEnd(26) + String(c.violations.length).padStart(6) + '  ' + c.describe)
    for (const v of c.violations.slice(0, 5)) lines.push('        ' + v.detail)
    if (c.violations.length > 5) lines.push('        …and ' + (c.violations.length - 5) + ' more')
  }
  for (const r of cmp.rows) {
    const mark = r.verdict === 'grew' ? 'GREW' : r.verdict === 'unbaselined' ? 'NEW ' : r.verdict === 'shrank' ? 'down' : 'held'
    lines.push(mark.padEnd(6) + r.id.padEnd(26) + String(r.now).padStart(6)
      + (r.was == null ? '   (no baseline)' : '   was ' + r.was))
  }
  return lines.join('\n')
}
