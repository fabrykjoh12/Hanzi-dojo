import { supabase } from './supabase'
import { getTrackCards } from './data'
import { countMastery } from './mastery'
import { studyFloorLevel } from './levelScope'
import { isCardDue, endOfLocalDay } from './srs'
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

  // Study rhythm (last 7 days), from the activity rows fetched above.
  const activity = (actsResult && actsResult.data) || []
  const studiedDates = activity.filter(a => a.studied_cards > 0).map(a => a.activity_date)
  const rhythm7 = studyRhythm(studiedDates, now, 7)

  // Cards graded TODAY. The row is already in hand — the rhythm above throws
  // away everything but the dates — and it is the difference between Home's
  // completed Cards step saying "18 practiced today" and saying "You're caught
  // up". No extra query, no new column, and 0 is a real answer (a queue that was
  // already clear when the day started), so callers must not treat it as absent.
  const todayRow = activity.find(a => a.activity_date === dateKey(now))
  const studiedToday = (todayRow && todayRow.studied_cards) || 0

  // Weak words: cards the user has lapsed on at least twice and that aren't yet
  // mastered — the cleanup-drill pool.
  const weakCount = levelCards.filter(c => (c.lapses || 0) >= 2 && (c.stability || 0) < 21).length

  const { learnedCount, masteredCount, masteredPct } = countMastery(levelCards, totalWords)

  // Fluency counts: every level of the ACTIVE language only (not other
  // languages the user also studies) — which is exactly the scope of the
  // server-side fetch above. Named "lifetime" for continuity.
  const lifetimeLearned = (cards || []).filter(c => c.learned).length
  const lifetimeMastered = (cards || []).filter(c => (c.stability || 0) >= 21).length

  return {
    // How many cards this track has at all. Zero means the learner has never
    // graded anything here — the same data-derived signal firstRun.js uses to
    // cap a first session, rather than a second flag that can go stale.
    cardCount: cards.length,
    newCount, learnCount, dueCount, easyCount, totalWords,
    learnedCount, masteredCount, masteredPct,
    newDoneToday, dueTomorrow, weakCount, forecast7, rhythm7, studiedToday,
    lifetimeLearned, lifetimeMastered, grammarDueCount,
    failed,
  }
}
