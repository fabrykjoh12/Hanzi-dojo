import { supabase } from './supabase'

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

// Returns { allEasy, totalWords, easyWords }
export async function getTestStatus(userId, track) {
  const { data: vocab } = await supabase
    .from('vocabulary')
    .select('id')
    .eq('language', track.language)
    .eq('system', track.system)
    .eq('level', track.current_level)
    .eq('is_active', true)

  const { data: cards } = await supabase
    .from('cards')
    .select('vocab_id, is_easy')
    .eq('user_id', userId)

  const vocabIds = new Set((vocab || []).map(v => v.id))
  const easyCards = (cards || []).filter(c => vocabIds.has(c.vocab_id) && c.is_easy)

  const totalWords = vocabIds.size
  const easyWords = easyCards.length

  return {
    allEasy: totalWords > 0 && easyWords === totalWords,
    totalWords,
    easyWords,
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