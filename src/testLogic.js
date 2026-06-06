import { supabase } from './supabase'
import { isMastered, TEST_UNLOCK_MASTERY_PCT } from './mastery'

// Normalize for tone-insensitive comparison
export function normalizePinyin(str) {
  if (!str) return ''
  const toneMap = {
    'ā':'a','á':'a','ǎ':'a','à':'a',
    'ē':'e','é':'e','ě':'e','è':'e',
    'ī':'i','í':'i','ǐ':'i','ì':'i',
    'ō':'o','ó':'o','ǒ':'o','ò':'o',
    'ū':'u','ú':'u','ǔ':'u','ù':'u',
    'ǖ':'u','ǘ':'u','ǚ':'u','ǜ':'u','ü':'u',
  }
  return str
    .toLowerCase()
    .split('')
    .map(ch => toneMap[ch] || ch)
    .join('')
    .replace(/v/g, 'u')
    .replace(/[''\s]/g, '')
}

// Accept: exact character match OR reading_plain match OR normalized reading match
export function checkAnswer(userInput, vocab) {
  const input = (userInput || '').trim()
  if (!input) return false
  if (input === vocab.word) return true
  if (vocab.reading_plain && input.toLowerCase().replace(/\s/g, '') === vocab.reading_plain.toLowerCase().replace(/\s/g, '')) return true
  if (normalizePinyin(input) === normalizePinyin(vocab.reading)) return true
  return false
}

// Returns { masteredCount, totalWords, masteredPct, testUnlocked, levelPassed }
export async function getTestStatus(userId, track) {
  const [vocabResult, cardsResult, unlockResult] = await Promise.all([
    supabase
      .from('vocabulary')
      .select('id')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true),
    supabase
      .from('cards')
      .select('vocab_id, stability')
      .eq('user_id', userId),
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
  const cards = cardsResult.data
  const vocabIds = new Set((vocab || []).map(v => v.id))
  const levelCards = (cards || []).filter(c => vocabIds.has(c.vocab_id))

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
