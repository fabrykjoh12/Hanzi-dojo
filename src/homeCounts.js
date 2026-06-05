import { supabase } from './supabase'

export async function getHomeCounts(userId, track, dailyNewCards) {
  const { data: vocab } = await supabase
    .from('vocabulary')
    .select('id')
    .eq('language', track.language)
    .eq('system', track.system)
    .eq('level', track.current_level)
    .eq('is_active', true)

  const { data: cards } = await supabase
    .from('cards')
    .select('vocab_id, state, due_at, created_at, is_easy')
    .eq('user_id', userId)

  const vocabIds = new Set((vocab || []).map(v => v.id))

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const introducedToday = (cards || [])
    .filter(c => new Date(c.created_at) >= startOfToday && vocabIds.has(c.vocab_id)).length
  const remainingNew = Math.max(0, dailyNewCards - introducedToday)

  const startedVocabIds = new Set((cards || []).map(c => c.vocab_id))
  const newCount = Math.min(
    (vocab || []).filter(v => !startedVocabIds.has(v.id)).length,
    remainingNew
  )

  const now = new Date()
  const levelCards = (cards || []).filter(c => vocabIds.has(c.vocab_id))
  const learnCount = levelCards
    .filter(c => c.state === 'learning' && new Date(c.due_at) <= now).length
  const dueCount = levelCards
    .filter(c => c.state === 'review' && new Date(c.due_at) <= now).length
  const easyCount = levelCards.filter(c => c.is_easy).length
  const totalWords = vocabIds.size

  return { newCount, learnCount, dueCount, easyCount, totalWords }
}
