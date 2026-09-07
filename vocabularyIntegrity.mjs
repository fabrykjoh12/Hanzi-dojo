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
// 20260907030000 writes into SQL. Three copies of one rule is two too many, but
// they live in three languages; a spec holds this one to the app's.
export function stripTones(reading) {
  let out = ''
  for (const ch of String(reading || '')) {
    const i = TONE_MARKED.indexOf(ch)
    out += i === -1 ? ch : TONE_PLAIN[i]
  }
  return out
}

// What checkAnswer ignores when it compares: space, apostrophe, case. Two
// values that differ only in those are the same answer key.
export function answerKeyForm(value) {
  return stripTones(value).toLowerCase().replace(/[ '’]/g, '')
}

const CJK = /[\u4e00-\u9fff]/
// A vowel run is one syllable. Crude, and it says so: it cannot tell whether a
// syllable is the RIGHT one, only how many there are.
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
    describe: 'no meaning is a placeholder, or a bare repeat of the word or its reading',
    collect: ({ vocabulary = [] }) => vocabulary.flatMap((row) => {
      const m = String(row.meaning || '').trim().toLowerCase()
      const placeholder = ['todo', 'tbd', 'n/a', 'na', '???', 'fixme', '-'].includes(m)
      const echo = m && (m === String(row.word || '').toLowerCase()
        || m === String(row.reading || '').toLowerCase()
        || m === String(row.reading_plain || '').toLowerCase())
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
      const chars = [...String(row.word || '')].filter(c => CJK.test(c)).length
      if (!chars) return []
      const syllables = syllableCount(row.reading)
      // 儿 in erhua fuses onto the previous syllable, so one fewer is expected.
      const erhua = String(row.word || '').includes('儿')
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
    collect: ({ vocabularyIds, cards }) => {
      if (!vocabularyIds || !cards) return []
      return cards.filter(c => !vocabularyIds.has(c.vocab_id))
        .map(c => ({ id: c.id, detail: 'card ' + c.id + ' → missing vocab ' + c.vocab_id }))
    },
  },
  {
    id: 'ready-audio-has-path',
    describe: 'a tts_audio row marked ready has a storage path',
    collect: ({ ttsAudio }) => (ttsAudio || [])
      .filter(t => t.status === 'ready' && blank(t.storage_path))
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
    collect: ({ vocabulary, ttsAudio }) => {
      if (!vocabulary || !ttsAudio) return []
      const live = new Set(vocabulary.map(v => v.id))
      return ttsAudio.filter(t => t.source_type === 'vocabulary' && !live.has(t.source_id))
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
  {
    id: 'level-null',
    describe: 'every active row has a level, so a learner can reach it',
    collect: ({ vocabulary = [] }) => vocabulary
      .filter(row => row.level == null)
      .map(row => ({ id: row.id, detail: row.word + ' has no level and no query loads it' })),
  },
]

// ── Running them ────────────────────────────────────────────────────────────

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
  const hardFailures = result.hard.filter(c => c.violations.length > 0)
  return {
    rows,
    hardFailures,
    ok: hardFailures.length === 0 && rows.every(r => r.verdict !== 'grew' && r.verdict !== 'unbaselined'),
  }
}

export function formatComparison(cmp) {
  const lines = []
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
