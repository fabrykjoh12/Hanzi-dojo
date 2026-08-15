import { supabase } from './supabase'
import { getTrackCards } from './data'
import { countMastery } from './mastery'
import { studyFloorLevel } from './levelScope'
import { endOfLocalDay } from './srs'
import { dueLearningCards, dueReviewCards, weakCards } from './studyAvailability'
import { reviewForecast } from './reviewForecast'
import { studyRhythm, dateKey } from './studyRhythm'
import { countDueGrammar } from './grammarReview'

export async function getHomeCounts(userId, track, dailyNewCards) {
  const now = new Date()

  // Three independent fetches, so they cost ONE round trip instead of three.
  // Only `vocab` below genuinely depends on a result (it needs the study floor,
  // which is derived from the cards), so everything else goes out together —
  // on a phone each avoided round trip is a visible chunk of the Home load.
  //
  //   cards    — scoped server-side to the ACTIVE language (every level): the
  //              level filter happens below, and the fluency score wants
  //              exactly this scope so a second language never inflates the
  //              first.
  //   acts     — study rhythm for the last 7 days, per user across all
  //              languages (a study day is a study day). Defensive: any
  //              failure just yields an empty rhythm.
  //   grammar  — how many opted-in grammar patterns are due (returns 0 offline
  //              or before its migration).
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 6)
  const [cards, actsResult, grammarDueCount] = await Promise.all([
    getTrackCards(userId, track, {
      columns: 'vocab_id, state, due_at, created_at, is_easy, learned, stability, lapses',
    }),
    supabase
      .from('daily_activity')
      .select('activity_date, studied_cards')
      .eq('user_id', userId)
      .gte('activity_date', dateKey(weekAgo))
      .then(r => r, () => ({ data: null })),
    countDueGrammar({ userId, track, now }),
  ])

  // Cumulative deck: every level from the study floor up to the current level,
  // so advancing a level keeps the earlier levels' words in the counts.
  const floorLevel = studyFloorLevel(cards, track.current_level)
  const { data: vocab, error: vocabError } = await supabase
    .from('vocabulary')
    .select('id')
    .eq('language', track.language)
    .eq('system', track.system)
    .gte('level', floorLevel)
    .lte('level', track.current_level)
    .eq('is_active', true)

  // A failed vocabulary fetch must not masquerade as an empty queue: every
  // count below would come out zero and the UI would show "all caught up" for
  // a day that never loaded. The shape below stays intact (callers keep every
  // field); `failed` just tells the UI the numbers can't be trusted.
  const failed = Boolean(vocabError) || !vocab

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

  // Two scopes, deliberately different, because they answer different questions:
  //
  //   deckCards  — every card started in this track, every level. This is the
  //                deck a study session serves (Study.jsx uses exactly this),
  //                so it is what the "waiting for you" counts must run over.
  //                A word saved from a story or the dictionary sits outside the
  //                level window but is still due, and Home used to hide it.
  //   levelCards — only the current level window. Level progress (learned /
  //                mastered / totalWords) is a statement ABOUT the level, so it
  //                keeps the narrow scope.
  const deckCards = (cards || [])
  const levelCards = deckCards.filter(c => vocabIds.has(c.vocab_id))

  // Availability comes from studyAvailability.js — the same functions Study
  // builds its queue from, so the promise and the delivery cannot drift.
  const learnCount = dueLearningCards(deckCards, now).length
  const dueCount = dueReviewCards(deckCards, now).length
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
  const dueTomorrow = deckCards.filter(c => {
    if (c.state !== 'review') return false
    const d = new Date(c.due_at)
    return d > eod && d <= endOfTomorrow
  }).length

  // A calm 7-day outlook: scheduled reviews bucketed by day (index 0 = today).
  // Learning cards are excluded (they can't be honestly forecast), so this is an
  // approximation the UI presents as "~N a day", never a hard promise.
  const forecast7 = reviewForecast(deckCards, now, 7)

  // Study rhythm (last 7 days), from the activity rows fetched above.
  const studiedDates = ((actsResult && actsResult.data) || [])
    .filter(a => a.studied_cards > 0).map(a => a.activity_date)
  const rhythm7 = studyRhythm(studiedDates, now, 7)

  // Weak words: the cleanup-drill pool. Over the deck, because that is the pool
  // Study's weak drill actually builds from.
  const weakCount = weakCards(deckCards).length

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
    failed,
  }
}
