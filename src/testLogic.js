import { supabase } from './supabase'
import { getTrackCards } from './data'
import { isMastered, TEST_UNLOCK_MASTERY_PCT } from './mastery'

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

// Returns { masteredCount, totalWords, masteredPct, testUnlocked, levelPassed }
export async function getTestStatus(userId, track) {
  const [vocabResult, levelCards, unlockResult] = await Promise.all([
    supabase
      .from('vocabulary')
      .select('id')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true),
    getTrackCards(userId, track, {
      level: track.current_level,
      columns: 'vocab_id, stability',
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

  const vocab = vocabResult.data
  const vocabIds = new Set((vocab || []).map(v => v.id))

  const totalWords = vocabIds.size
  const masteredCount = levelCards.filter(c => isMastered(c)).length
  const masteredPct = totalWords > 0 ? masteredCount / totalWords : 0
  const levelPassed = Boolean(unlockResult.data)

  return {
    masteredCount,
    totalWords,
    masteredPct,
    levelPassed,
    testUnlocked: levelPassed || masteredPct >= TEST_UNLOCK_MASTERY_PCT,
  }
}

// Count today's attempts and check if any passed
export async function getAttemptsToday(userId, track) {
  const today = new Date().toISOString().slice(0, 10)

  const { data } = await supabase
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
  }
}
