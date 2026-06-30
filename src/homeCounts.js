import { supabase } from './supabase'
import { countMastery } from './mastery'

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
    .select('vocab_id, state, due_at, created_at, is_easy, learned, stability, lapses')
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
    .filter(c => (c.state === 'learning' || c.state === 'relearning') && new Date(c.due_at) <= now).length
  const dueCount = levelCards
    .filter(c => c.state === 'review' && new Date(c.due_at) <= now).length
  const easyCount = levelCards.filter(c => c.is_easy).length
  const totalWords = vocabIds.size

  // Daily-goal progress: how many new cards the user has already started today,
  // measured against their daily_new_cards goal.
  const newDoneToday = introducedToday

  // Review forecast: reviews that become due between now and the end of tomorrow
  // (drives the "waiting tomorrow" nudge). Learning/relearning cards are stored
  // with due_at = now, so this is dominated by scheduled review cards.
  const endOfTomorrow = new Date(); endOfTomorrow.setHours(23, 59, 59, 999)
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1)
  const dueTomorrow = levelCards.filter(c => {
    if (c.state !== 'review') return false
    const d = new Date(c.due_at)
    return d > now && d <= endOfTomorrow
  }).length

  // Weak words: cards the user has lapsed on at least twice and that aren't yet
  // mastered — the cleanup-drill pool.
  const weakCount = levelCards.filter(c => (c.lapses || 0) >= 2 && (c.stability || 0) < 21).length

  const { learnedCount, masteredCount, masteredPct } = countMastery(levelCards, totalWords)

  // Lifetime counts (all levels) for the fluency score.
  const lifetimeLearned = (cards || []).filter(c => c.learned).length
  const lifetimeMastered = (cards || []).filter(c => (c.stability || 0) >= 21).length

  return {
    newCount, learnCount, dueCount, easyCount, totalWords,
    learnedCount, masteredCount, masteredPct,
    newDoneToday, dueTomorrow, weakCount,
    lifetimeLearned, lifetimeMastered,
  }
}
