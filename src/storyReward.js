// The flashcards → chapter-unlock reward loop, as pure decisions.
//
// One qualifying flashcard session a day unlocks the next chapter of the
// learner's ACTIVE series. The claim itself is a story_reward_claims row
// (at most one per track per local day, enforced by its primary key); this
// module decides what that row plus the learner's reading state MEANS:
// which series is active, which chapter today's session unlocks, and what
// the "Today's story reward" surface should say.
//
// Pure module — no React, no Supabase. Spec'd in storyReward.test.js.

import { organizeNarrativeStories } from './storyShelf'
import { isPracticeFormat } from './storyFormat'
import { nextRewardChapter, unlockedChapterIds } from './storyChapters'

// A qualifying session is the day's scheduled review session, completed with
// at least one card actually graded. The scheduler decides the session's size,
// so there is nothing to game — and the daily claim row means completing the
// leftovers of the same day's queue again can never mint a second chapter.
// Weak-word drills are extra practice the learner starts at will; they don't
// carry the reward.
export function qualifiesForReward({ mode, graded }) {
  return mode === 'review' && (graded || 0) > 0
}

// Multi-chapter series units from published story rows: practice formats out,
// then the same explicit-series / title-numbering derivation the shelf uses.
// Level-scoped grouping (matching the shelf) so a serial that continues at a
// higher level never counts its unreachable chapters.
export function buildSeriesUnits(stories) {
  const list = (Array.isArray(stories) ? stories : []).filter(s => s && !isPracticeFormat(s))
  const byLevel = new Map()
  for (const s of list) {
    const lvl = s.level == null ? 0 : s.level
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl).push(s)
  }
  const units = []
  for (const [level, levelStories] of byLevel) {
    const { seriesArcs } = organizeNarrativeStories(levelStories)
    for (const arc of seriesArcs) {
      if (arc.parts.length < 2) continue
      units.push({ kind: 'series', key: arc.key, title: arc.title, level, parts: arc.parts })
    }
  }
  return units
}

// Which series the learner's session rewards apply to.
//   1. The explicitly chosen one (language_tracks.active_series), if it still
//      exists and isn't finished.
//   2. Otherwise the series they most recently read a chapter of that still
//      has chapters left (recentReads: story_reads rows with read_at).
//   3. Otherwise null — they haven't started a series yet.
export function resolveActiveSeries({ units, activeSeriesKey, recentReads }) {
  const list = Array.isArray(units) ? units : []
  const reads = Array.isArray(recentReads) ? recentReads : []
  const readIds = new Set(reads.map(r => r.story_id))
  const unfinished = (unit) => unit.parts.some(p => !readIds.has(p.id))

  if (activeSeriesKey) {
    const chosen = list.find(u => u.key === activeSeriesKey)
    if (chosen && unfinished(chosen)) return chosen
  }

  const byRecency = [...reads].sort((a, b) =>
    String(b.read_at || '').localeCompare(String(a.read_at || '')))
  for (const read of byRecency) {
    const unit = list.find(u => u.parts.some(p => p.id === read.story_id))
    if (unit && unfinished(unit)) return unit
  }
  return null
}

// What the "Today's story reward" surface should show.
//
//   { state: 'no-series' }                     — nothing started; invite to pick a story
//   { state: 'locked', chapter }               — session not done; chapter waits behind it
//   { state: 'banked', chapter }               — session done before a chapter existed to
//                                                unlock; redeemable right now
//   { state: 'unlocked-today', storyId }       — today's reward is claimed; read it
//   { state: 'all-unlocked', chapter }         — nothing left to unlock, chapters left to read
//   { state: 'series-complete' }               — the active series is finished
//
// `claim` is today's story_reward_claims row (or null). A redeemed claim wins
// regardless of series, so switching series after claiming never re-arms the day.
export function rewardStateFor({ unit, readIds, unlockIds, claim }) {
  if (claim && claim.story_id) return { state: 'unlocked-today', storyId: claim.story_id }
  if (!unit) return { state: 'no-series' }

  const parts = unit.parts || []
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  const nextLocked = nextRewardChapter({ parts, readIds: reads, unlockIds })

  if (nextLocked) {
    return { state: claim ? 'banked' : 'locked', chapter: nextLocked }
  }
  const open = unlockedChapterIds({ parts, readIds: reads, unlockIds })
  const nextUnread = parts.find(p => p && !reads.has(p.id) && open.has(p.id)) || null
  if (nextUnread) return { state: 'all-unlocked', chapter: nextUnread }
  return { state: 'series-complete' }
}

// "Words you'll recognize": the handful of recently studied words that appear
// in the chapter the learner is about to read. `storyWords` come from
// calculateStoryReadability (story order, already matched against the
// vocabulary); `recentVocabIds` are the vocab ids reviewed in the last few
// sessions. Capped small on purpose — a preview, not a word list.
export function recentWordsInStory({ storyWords, recentVocabIds, max = 5 }) {
  const recent = recentVocabIds instanceof Set ? recentVocabIds : new Set(recentVocabIds || [])
  const seen = new Set()
  const out = []
  for (const w of storyWords || []) {
    if (!w || !recent.has(w.id) || seen.has(w.id)) continue
    seen.add(w.id)
    out.push(w)
    if (out.length >= max) break
  }
  return out
}

// Did the learner read a story TODAY?
//
// P14-5C needs this so Home's guide can tick step 2 instead of guessing, and it
// is deliberately an additive derivation: `story_reads` rows with their `read_at`
// are already fetched by both of Home's story paths, so this costs no query and
// invents no tracking system.
//
// "A story", not "this story", on purpose — the question the guide asks is
// whether today's reading happened, and a learner who read a different chapter
// has read. Rows without a usable timestamp are ignored rather than assumed
// (`read_at` was added after the table, so old rows can be null).
export function hasReadToday(reads, now = new Date()) {
  const key = localDayKey(now)
  return (reads || []).some((r) => {
    const at = r && r.read_at
    if (!at) return false
    const d = new Date(at)
    return !Number.isNaN(d.getTime()) && localDayKey(d) === key
  })
}

// Local YYYY-MM-DD. Local rather than UTC because the whole app's day boundary
// is local midnight — that is when new cards and due reviews roll over (srs.js),
// and a reading day that ends at 01:00 UTC would be a different day from the
// session that unlocked it.
function localDayKey(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0')
}
