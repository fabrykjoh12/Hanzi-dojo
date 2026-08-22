import { supabase } from './supabase'
import { getTrackCards } from './data'
import { fetchPagedResult } from './supabasePaging'
import { isMastered, TEST_UNLOCK_MASTERY_PCT } from './mastery'
import { countsForReading, TEST_UNLOCK_COVERAGE_PCT } from './knowledgeState'

// Normalize for tone-insensitive comparison.
//
// Uses Unicode NFD so a tone mark is accepted whether it's stored precomposed
// (ǎ = U+01CE) OR decomposed (a + combining caron U+030C) — the latter silently
// broke matches like "hai" vs "hǎi" before, because a precomposed-only tone map
// never saw the base letter. After decomposing, every combining mark (U+0300–
// U+036F) is dropped, then ü/v → u and apostrophes/spaces are stripped.
export function normalizePinyin(str) {
  if (!str) return ''
  const decomposed = str.normalize('NFD').toLowerCase()
  let out = ''
  for (let i = 0; i < decomposed.length; i += 1) {
    const ch = decomposed[i]
    const code = ch.charCodeAt(0)
    if (code >= 0x300 && code <= 0x36f) continue           // combining diacritics (tones)
    if (ch === 'v' || ch === 'ü') { out += 'u'; continue }  // ü / v → u
    if (ch === '’' || ch === '‘' || ch === '\'' || ch === ' ' || ch === '\t') continue
    out += ch
  }
  return out
}

// The most lenient pinyin form we accept everywhere: tone marks stripped,
// numeric tones (hai3) stripped, spaces/apostrophes/punctuation removed,
// v treated as ü. "hǎi", "hai", "hai3", "HAI " all normalize identically.
export function lenientPinyin(value) {
  let out = ''
  const base = normalizePinyin(value)
  for (let i = 0; i < base.length; i += 1) {
    const ch = base[i]
    if (ch >= '1' && ch <= '5') continue
    if (' .,!?;:\'"()-_·'.indexOf(ch) !== -1) continue
    out += ch
  }
  return out
}

// Accept: exact character match, OR the reading in its most lenient form —
// tone marks (precomposed or decomposed), numeric tones (hao3), ü/v, and
// spacing all ignored, matched against reading_plain or reading.
export function checkAnswer(userInput, vocab) {
  const input = (userInput || '').trim()
  if (!input) return false
  if (input === vocab.word) return true
  const li = lenientPinyin(input)
  if (!li) return false
  if (vocab.reading_plain && li === lenientPinyin(vocab.reading_plain)) return true
  if (li === lenientPinyin(vocab.reading)) return true
  return false
}

// Pure: fold the three raw query results into the status object the Test
// screen renders. A failed vocabulary or unlock query surfaces as
// { error: true } so the screen can offer a retry — it must never be mistaken
// for a genuine "0 / 0 words mastered" locked state. A query that succeeds
// with no rows is NOT an error: an empty level really is locked at 0 / 0.
export function resolveTestStatus(vocabResult, levelCards, unlockResult) {
  if ((vocabResult && vocabResult.error) || (unlockResult && unlockResult.error)) {
    return {
      error: true,
      masteredCount: 0,
      totalWords: 0,
      masteredPct: 0,
      levelPassed: false,
      testUnlocked: false,
    }
  }

  const vocab = vocabResult && vocabResult.data
  const vocabIds = new Set((vocab || []).map(v => v.id))

  const totalWords = vocabIds.size
  const masteredCount = (levelCards || []).filter(c => isMastered(c)).length
  const masteredPct = totalWords > 0 ? masteredCount / totalWords : 0
  const levelPassed = Boolean(unlockResult && unlockResult.data)

  // The experienced-learner route. A learner who told us they already know this
  // level has masteredPct 0 by construction — a claim is not mastery — so
  // without this they could not even ATTEMPT the test, and their only way
  // forward would be calibrating hundreds of words one at a time.
  //
  // This gates who may SIT the test, never who has passed it. The test itself
  // is the aggregate proof: 30 questions drawn fresh each attempt, 100% correct
  // required, 3 attempts a day. A learner who genuinely knows ~90% of the level
  // passes in a few days; at 70% it takes ~700 days, and guessing 30 four-option
  // questions is a 1-in-10^18 event. Passing advances the level and writes NO
  // per-word FSRS state — the claims stay claims until calibration checks them.
  const coveredCount = (levelCards || []).filter(c => countsForReading(c)).length
  const coveragePct = totalWords > 0 ? coveredCount / totalWords : 0

  return {
    error: false,
    masteredCount,
    totalWords,
    masteredPct,
    coveredCount,
    coveragePct,
    levelPassed,
    // True when the learner reached the bar through genuine study, false when
    // they are here on the strength of a claim — the screen uses this to frame
    // the test as "prove it" rather than "you're ready".
    unlockedByMastery: masteredPct >= TEST_UNLOCK_MASTERY_PCT,
    testUnlocked: levelPassed
      || masteredPct >= TEST_UNLOCK_MASTERY_PCT
      || coveragePct >= TEST_UNLOCK_COVERAGE_PCT,
  }
}

// Pure: a test can only be generated from a non-empty vocab pool — starting
// with zero words would produce an empty question list and crash the quiz on
// the first question dereference.
export function canStartTest(vocabPool) {
  return Array.isArray(vocabPool) && vocabPool.length > 0
}

// Returns { error, masteredCount, totalWords, masteredPct, testUnlocked, levelPassed }
export async function getTestStatus(userId, track) {
  try {
    const [vocabResult, levelCards, unlockResult] = await Promise.all([
      // Paged: HSK 5 and 6 are 1,495 / 1,621 words — past PostgREST's
      // 1000-row cap — and a truncated denominator corrupts the 90% gate.
      fetchPagedResult(() => supabase
        .from('vocabulary')
        .select('id')
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('level', track.current_level)
        .eq('is_active', true)
        .order('id', { ascending: true })),
      getTrackCards(userId, track, {
        level: track.current_level,
        // reps and prior_known_at are what tell a genuine card from a claim:
        // isMastered needs reps, countsForReading needs prior_known_at.
        columns: 'vocab_id, stability, reps, learned, state, prior_known_at',
      }),
      supabase
        .from('level_unlocks')
        .select('level')
        .eq('user_id', userId)
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('level', track.current_level)
        .maybeSingle(),
    ])

    return resolveTestStatus(vocabResult, levelCards, unlockResult)
  } catch {
    return resolveTestStatus({ data: null, error: true }, [], { data: null, error: null })
  }
}

// Count today's attempts and check if any passed. A failed query surfaces as
// { error: true } — a fabricated count of 0 would silently hand out attempts.
export async function getAttemptsToday(userId, track) {
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('test_attempts')
    .select('id, passed')
    .eq('user_id', userId)
    .eq('language', track.language)
    .eq('system', track.system)
    .eq('level', track.current_level)
    .eq('attempt_date', today)

  return {
    count: (data || []).length,
    passed: (data || []).some(a => a.passed),
    error: Boolean(error),
  }
}
