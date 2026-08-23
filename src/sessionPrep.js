// One study session, prepared once, consumed by two screens.
//
// Home shows the top of today's deck; Study deals it. If each derives its own
// queue, the two can disagree and Study has to open on a loading screen. So
// the queue is built HERE — the exact logic Study.loadQueue used to inline —
// and cached as a one-shot handoff:
//
//   Home    prepareStudySession(...)  — starts (or refreshes) the build while
//           the learner is still reading the Home screen, and renders the
//           first card of the resulting queue as the desk object.
//   Study   takePreparedSession(...)  — claims the prepared session on mount.
//           When it resolved in time, the first REAL card is on screen at
//           Study's first paint: there is no loading composition at all.
//           When nothing was prepared (deep link, expired, other mode), Study
//           calls buildStudySession itself — the same code, just later.
//
// The cache is a single slot (one learner, one track, one day) and every read
// is a *take*: a claimed session is never served twice, so a queue can never
// outlive the grades that invalidate it. Home re-prepares whenever its counts
// change.

import { supabase } from './supabase'
import { getTrackCards } from './data'
import { cacheGet, cacheSet } from './offline'
import { fetchPaged, fetchChunkedIn } from './supabasePaging'
import { hasGenuineObservation, isPriorKnown } from './knowledgeState'
import { pickCalibrationChecks, pendingCalibrationCount } from './calibration'
import { studyFloorLevel } from './levelScope'
import { missingVocabIds, mergeVocab } from './deckVocab'
import { dueLearningCards, dueReviewCards } from './studyAvailability'
import { buildStudyQueue, queueSeed } from './studyQueue'
import { isFirstRunSession, firstRunNewTarget } from './firstRun'
import { isReturningFromBreak, gentleReviewTarget } from './gentleReturn'
import { loadTtsAudio } from './ttsAudio'
import { todayStr } from './streak'

// A prepared session older than this is stale: due dates roll at midnight and
// a learner can grade on another device. Ten minutes keeps the common flow
// (open app → glance at Home → start) instant without trusting old data.
export const PREP_MAX_AGE_MS = 10 * 60 * 1000

export function prepKey({ userId, track, day = todayStr() }) {
  return [userId, track.language, track.system, track.current_level, day].join('|')
}

// ── The build itself (moved verbatim from Study.loadQueue) ──────────────────
// Returns everything Study needs to run a session:
//   queue      — the ordered session (review mode)
//   levelCards — every owned card joined to its vocab row (weak mode pool)
//   vocabList  — the cumulative vocabulary incl. off-level merged rows
//   knownWords — words the learner has any card for
//   firstRun   — brand-new-learner detection (gentle first session)
//   calibrationPending — how many prior-knowledge claims are still unchecked
export async function buildStudySession({ userId, profile, track, mode = 'review' }) {
  // Cumulative deck: the user's cards first (they set the study floor), then
  // every level's vocabulary from that floor up. A card exists because the
  // learner chose to study that word, so it belongs in the queue even when the
  // word sits above their current level or carries no level at all.
  const cards = await getTrackCards(userId, track, { includeUnleveled: true })
  const floorLevel = studyFloorLevel(cards, track.current_level)

  const vocabKey = 'vocab:' + track.language + ':' + track.system + ':' + floorLevel + '-' + track.current_level
  let vocab = null
  try {
    // Paged: the cumulative window outgrows PostgREST's 1000-row cap at
    // HSK 4 (1,879 words) — an unpaged read silently dropped the tail levels
    // from the session. The trailing `id` sort keeps (level, sort_order) ties
    // from letting pages overlap.
    vocab = await fetchPaged(() => supabase
      .from('vocabulary')
      .select('*')
      .eq('language', track.language)
      .eq('system', track.system)
      .gte('level', floorLevel)
      .lte('level', track.current_level)
      .eq('is_active', true)
      .order('level', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }))
  } catch { /* offline — fall back to the cached vocabulary below */ }
  if (vocab && vocab.length) cacheSet(vocabKey, vocab)
  else { const cached = await cacheGet(vocabKey); if (cached) vocab = cached }

  let vocabById = {}
  ;(vocab || []).forEach(v => { vocabById[v.id] = v })
  let vocabList = vocab || []

  // A card whose vocabulary the level-scoped load didn't return (a saved
  // dictionary word, a reach word from a story) — fetch exactly the missing
  // rows and merge them in, so no owned card is silently dropped.
  const missingIds = missingVocabIds(cards, vocabById)
  if (missingIds.length) {
    try {
      // Chunked: every id rides in the request URL, so a long list must be
      // split — see fetchChunkedIn.
      const extra = await fetchChunkedIn(missingIds, (chunk) => supabase
        .from('vocabulary').select('*').in('id', chunk))
      if (extra.length) {
        vocabById = mergeVocab(vocabById, extra)
        vocabList = [...vocabList, ...extra]
      }
    } catch { /* offline — those cards stay out of this session, as before */ }
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  // Prior-knowledge claims are excluded: a placement claim writes hundreds of
  // rows in one moment, and counting them as "words introduced today" zeroed
  // the learner's entire daily new-card allowance on the day they signed up.
  const introducedToday = (cards || [])
    .filter(c => !isPriorKnown(c) && new Date(c.created_at) >= startOfToday && vocabById[c.vocab_id]).length
  const remainingNew = Math.max(0, profile.daily_new_cards - introducedToday)

  const now = new Date()
  const startedVocab = new Set()
  const levelCards = (cards || [])
    .map(c => ({ ...c, vocab: vocabById[c.vocab_id] }))
    .filter(c => c.vocab)
  levelCards.forEach(c => startedVocab.add(c.vocab_id))
  const knownWords = levelCards.map(c => c.vocab.word)

  const dueLearning = dueLearningCards(levelCards, now)
  let dueReview = dueReviewCards(levelCards, now)

  // Gentle return: after a multi-day break, cap the overdue wall to a calm
  // handful — oldest-due first. Deferred cards stay due and simply resurface.
  const returning = mode === 'review' && isReturningFromBreak(profile)
  if (returning) {
    const cap = gentleReviewTarget({ returning, dueReviewCount: dueReview.length })
    if (cap < dueReview.length) {
      dueReview = [...dueReview]
        .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
        .slice(0, cap)
    }
  }

  // First-run detection: a brand-new learner (no cards anywhere on the
  // account) gets a gentle, capped first session. Only queried when this
  // level is empty; any failure falls back to a normal session.
  // Genuine study only: a learner whose very first act was a placement claim
  // has still never studied a card, and must still get the gentle first session.
  let firstRun = false
  if (!(cards || []).some(hasGenuineObservation)) {
    try {
      const { count } = await supabase
        .from('cards').select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('reps', 1)
      firstRun = isFirstRunSession({ mode, accountCardCount: count || 0 })
    } catch { /* offline / error — treat as a normal session (no cap) */ }
  }
  const newTarget = firstRunNewTarget(firstRun, remainingNew)

  const newItems = (vocab || [])
    .filter(v => !startedVocab.has(v.id))
    .slice(0, newTarget)
    .map(v => ({
      id: null, vocab_id: v.id, vocab: v,
      state: 'new', ease_factor: 2.5, interval_days: 0, learning_step: 0,
    }))

  // Prior-knowledge checks. A claim is inert — never due, and never offered as
  // a new card because its row already exists — so this is the ONLY way a
  // claimed word can ever be observed. Weak mode stays a pure drill on real
  // lapses, so it takes no checks.
  const calibrationChecks = mode === 'review'
    ? pickCalibrationChecks(levelCards, { now }).map(c => ({ ...c, isCalibration: true }))
    : []
  const calibrationPending = pendingCalibrationCount(levelCards)

  // Seeded order: learning leads, reviews are the backbone, new cards woven
  // through. Stable per user/level/day.
  const seed = queueSeed({
    userId,
    language: track.language,
    system: track.system,
    level: track.current_level,
    day: todayStr(),
  })
  // Checks ride in the review pool: they are the same act — recall a word, say
  // how it went — and they belong among the reviews rather than bunched at one
  // end of the session.
  const queue = buildStudyQueue({
    dueLearning,
    dueReview: [...dueReview, ...calibrationChecks],
    newItems,
    seed,
  })

  // Prime the generated TTS clips for the session's cards before they render,
  // so the speaker buttons appear in their final state. Best-effort: offline
  // (or pre-migration) just means the legacy audio path is used.
  const ttsIds = queue.map(c => c.vocab && c.vocab.id).filter(Boolean)
  if (ttsIds.length) { try { await loadTtsAudio('vocabulary', ttsIds) } catch { /* legacy audio still plays */ } }

  return { queue, levelCards, vocabList, knownWords, firstRun, calibrationPending }
}

// ── The one-shot handoff slot ───────────────────────────────────────────────
let slot = null

// Start (or refresh) the prepared session for this learner/track/today.
// Failures resolve to null — Home degrades quietly and Study simply builds
// for itself. `builder`/`now` are injectable for tests.
export function prepareStudySession({ userId, profile, track }, builder = buildStudySession, now = Date.now) {
  const key = prepKey({ userId, track })
  const record = { key, startedAt: now(), value: undefined, promise: null }
  record.promise = builder({ userId, profile, track, mode: 'review' })
    .then(data => {
      record.value = data
      return data
    })
    .catch(() => {
      record.value = null
      return null
    })
  slot = record
  return record.promise
}

// Read the prepared session WITHOUT claiming it — Home's desk card renders
// from this. Returns the resolved data (null while pending/absent).
export function peekPreparedSession({ userId, track }, now = Date.now) {
  if (!slot || slot.key !== prepKey({ userId, track })) return null
  if (now() - slot.startedAt > PREP_MAX_AGE_MS) return null
  return slot.value || null
}

// Claim the prepared session for a real study run. One-shot: the slot is
// cleared so a graded-through queue can never be served twice. Returns the
// resolved data when the build already finished (Study's first paint is the
// first card), a promise while it is still in flight, or null.
export function takePreparedSession({ userId, track }, now = Date.now) {
  if (!slot || slot.key !== prepKey({ userId, track })) return null
  if (now() - slot.startedAt > PREP_MAX_AGE_MS) { slot = null; return null }
  const record = slot
  slot = null
  if (record.value !== undefined) return record.value
  return record.promise
}

// Test/logout hook.
export function clearPreparedSession() {
  slot = null
}
