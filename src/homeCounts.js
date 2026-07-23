import { supabase } from './supabase'
import { getTrackCards } from './data'
import { countMastery } from './mastery'
import { studyFloorLevel } from './levelScope'
import { isCardDue, endOfLocalDay } from './srs'
import { reviewForecast } from './reviewForecast'
import { studyRhythm, dateKey } from './studyRhythm'
import { countDueGrammar } from './grammarReview'

export async function getHomeCounts(userId, track, dailyNewCards) {
  // Cards scoped server-side to the ACTIVE language (every level): the level
  // counts filter further below, and the fluency score wants exactly this scope
  // so studying a second language never inflates the first.
  const cards = await getTrackCards(userId, track, {
    columns: 'vocab_id, state, due_at, created_at, is_easy, learned, stability, lapses',
  })

  // Cumulative deck: every level from the study floor up to the current level,
  // so advancing a level keeps the earlier levels' words in the counts.
  const floorLevel = studyFloorLevel(cards, track.current_level)
  const { data: vocab } = await supabase
    .from('vocabulary')
    .select('id')
    .eq('language', track.language)
    .eq('system', track.system)
    .gte('level', floorLevel)
    .lte('level', track.current_level)
    .eq('is_active', true)

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
    .filter(c => (c.state === 'learning' || c.state === 'relearning') && isCardDue(c, now)).length
  // Review cards are due for the whole day, so all of today's reviews are
  // available from the 00:00 rollover (matching how new cards refresh).
  const dueCount = levelCards
    .filter(c => c.state === 'review' && isCardDue(c, now)).length
  const easyCount = levelCards.filter(c => c.is_easy).length
  const totalWords = vocabIds.size

  // Daily-goal progress: how many new cards the user has already started today,
  // measured against their daily_new_cards goal.
  const newDoneToday = introducedToday

  // Review forecast: reviews that become due AFTER today and by end of tomorrow
  // (drives the "waiting tomorrow" nudge). Reviews due today are already counted
  // in dueCount above, so the lower bound is the end of today — not `now` — to
  // avoid double-counting today's not-yet-cleared reviews as "tomorrow".
  const eod = endOfLocalDay(now)
  const endOfTomorrow = new Date(); endOfTomorrow.setHours(23, 59, 59, 999)
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1)
  const dueTomorrow = levelCards.filter(c => {
    if (c.state !== 'review') return false
    const d = new Date(c.due_at)
    return d > eod && d <= endOfTomorrow
  }).length

  // A calm 7-day outlook: scheduled reviews bucketed by day (index 0 = today).
  // Learning cards are excluded (they can't be honestly forecast), so this is an
  // approximation the UI presents as "~N a day", never a hard promise.
  const forecast7 = reviewForecast(levelCards, now, 7)

  // Study rhythm (last 7 days) — which days had any study, from daily_activity
  // (per user, all languages). Defensive: any failure just yields an empty
  // rhythm so the home load never breaks on it. Not track-scoped: a study day
  // is a study day. Lower-bounded to the window to keep the query small.
  let studiedDates = []
  try {
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 6)
    const { data: acts } = await supabase
      .from('daily_activity')
      .select('activity_date, studied_cards')
      .eq('user_id', userId)
      .gte('activity_date', dateKey(weekAgo))
    studiedDates = (acts || []).filter(a => a.studied_cards > 0).map(a => a.activity_date)
  } catch { /* offline / query failure — leave rhythm empty */ }
  const rhythm7 = studyRhythm(studiedDates, now, 7)

  // Weak words: cards the user has lapsed on at least twice and that aren't yet
  // mastered — the cleanup-drill pool.
  const weakCount = levelCards.filter(c => (c.lapses || 0) >= 2 && (c.stability || 0) < 21).length

  // Grammar spaced practice: how many opted-in patterns are due. Defensive
  // (returns 0 offline or before the table is migrated), never blocks the load.
  const grammarDueCount = await countDueGrammar({ userId, track, now })

  const { learnedCount, masteredCount, masteredPct } = countMastery(levelCards, totalWords)

  // Fluency counts: every level of the ACTIVE language only (not other
  // languages the user also studies) — which is exactly the scope of the
  // server-side fetch above. Named "lifetime" for continuity.
  const lifetimeLearned = (cards || []).filter(c => c.learned).length
  const lifetimeMastered = (cards || []).filter(c => (c.stability || 0) >= 21).length

  return {
    newCount, learnCount, dueCount, easyCount, totalWords,
    learnedCount, masteredCount, masteredPct,
    newDoneToday, dueTomorrow, weakCount, forecast7, rhythm7,
    lifetimeLearned, lifetimeMastered, grammarDueCount,
  }
}
