import { supabase } from './supabase'

// Normalize pinyin so "nǐ", "ni", "NI " all match.
// Strips tones, spaces, apostrophes; lowercases; maps ü→u (and v→u).
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
    .replace(/['’\s]/g, '')
}

// Check if the user's answer matches the word (accepts characters OR pinyin)
export function checkAnswer(userInput, vocab) {
  const input = (userInput || '').trim()
  if (!input) return false
  // Exact character match
  if (input === vocab.word) return true
  // Pinyin match (tone-insensitive)
  if (normalizePinyin(input) === normalizePinyin(vocab.pinyin)) return true
  return false
}

// Returns { unlocked, totalWords, easyWords } for the test gate
export async function getTestStatus(session, profile) {
  const language = profile.active_language
  const level = language === 'chinese' ? profile.chinese_level : profile.japanese_level

  const { data: vocab } = await supabase
    .from('vocabulary')
    .select('id')
    .eq('language', language)
    .eq('level', level)

  const { data: cards } = await supabase
    .from('cards')
    .select('vocab_id, is_easy')
    .eq('user_id', session.user.id)

  const vocabIds = new Set((vocab || []).map(v => v.id))
  const easyCards = (cards || []).filter(c => vocabIds.has(c.vocab_id) && c.is_easy)

  const totalWords = vocabIds.size
  const easyWords = easyCards.length

  return {
    unlocked: totalWords > 0 && easyWords === totalWords,
    totalWords,
    easyWords,
  }
}

// Count today's test attempts
export async function getAttemptsToday(session, profile) {
  const language = profile.active_language
  const level = language === 'chinese' ? profile.chinese_level : profile.japanese_level
  const today = new Date().toISOString().slice(0, 10)

  const { data } = await supabase
    .from('test_attempts')
    .select('id, passed')
    .eq('user_id', session.user.id)
    .eq('language', language)
    .eq('level', level)
    .eq('attempt_date', today)

  return {
    count: (data || []).length,
    passed: (data || []).some(a => a.passed),
  }
}