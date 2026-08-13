// Home's data lifecycle: what it fetches, when it is allowed to fetch it, and
// what it must never fetch twice.
//
// Measured before this existed: one Home revisit cost 25 Supabase requests, and
// it cost them again every single time the Home tab became visible, because the
// data lived in mount effects and <Activity> re-runs those on every show. Of
// those 25:
//
//   9  were a verbatim duplicate issued a second after the first, because
//      `loadProfile` replaced `track` with a freshly-fetched object and Home's
//      effect depended on that object's IDENTITY.
//   4  were fetched, parsed and thrown away — the daily-story card is rendered
//      only as `!rewardTeaser && daily`, so for any learner with a series going
//      it can never be shown, and one of its queries pulls every story's full
//      text at or below their level.
//   7  were the profile + track + counts reload that `shouldRefreshHome` fired
//      on arrival, decided by which ROUTE the learner came from rather than by
//      whether anything had actually changed.
//
// This module holds the two decisions that fixes, both pure and both tested.
// The cache itself is dataCache.js and the invalidation table is cacheEvents.js.

import { getSessionRewardTeaser } from './storyRewardData'
import { getDailyStoryCard } from './homeStory'

// Counts are the one Home key with a real time dimension: cards fall due while
// the app sits open, and no event fires when they do. This is the surviving
// half of homeRefresh.js — the honest half.
export const HOME_COUNTS_STALE_MS = 10 * 60 * 1000

function dayKey(ms) {
  const d = new Date(ms)
  return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()
}

// `now` defaults to the clock (house style — cf. isCardDue in srs.js); the
// specs pass it explicitly, which is what keeps this testable.
export function countsExpired(fetchedAt, now = Date.now()) {
  if (!fetchedAt) return true
  // Local midnight is when new cards and the day's reviews roll over, so a
  // value from "yesterday" is stale however recent it looks.
  if (dayKey(now) !== dayKey(fetchedAt)) return true
  return now - fetchedAt >= HOME_COUNTS_STALE_MS
}

// The story hand-off beneath the hero. Home renders EITHER the session reward
// teaser or the daily story card, never both, and the teaser wins:
//
//   Home.jsx    {rewardTeaser && …}
//               {!rewardTeaser && daily && …}
//
// So the daily card's four queries are only worth making when the teaser comes
// back empty, and that is a genuine data dependency, not a waterfall for its
// own sake (§6): the second fetch's NECESSITY is the first fetch's result.
//
// The trade, stated plainly: a learner with no active series — a new account,
// mostly — pays one extra round trip on a cold load instead of two concurrent
// ones. A learner with a series, which is everyone after their first week,
// stops paying four wasted requests including a full-text story fetch, on every
// single visit to Home. The cache means either price is paid once per change,
// not once per glance.
// `readToday` is lifted to the top of the result because it is a fact about the
// DAY, not about whichever story path answered — Home's guide asks "has today's
// reading happened", and both paths can answer it from rows they already fetch.
export async function fetchHandoff(userId, track, learnedCount) {
  if (!userId || !track) return { reward: null, daily: null, readToday: false }
  const reward = await getSessionRewardTeaser(userId, track)
  if (reward) return { reward, daily: null, readToday: Boolean(reward.readToday) }
  const daily = await getDailyStoryCard(userId, track, learnedCount)
  return { reward: null, daily, readToday: Boolean(daily && daily.readToday) }
}

// Home's effect must not re-run because `track` arrived as a new object with
// identical contents — that alone was 9 of the 25 requests. These three fields
// are everything the fetches above actually read from it.
export function trackSignature(track) {
  if (!track) return ''
  return [track.language, track.system, track.current_level].join('|')
}

// Has this learner never actually started?
//
// Home's one first-use nudge hangs off this, and it is derived from the
// account's own data — cards, or the absence of them — rather than from a flag
// that has to be set correctly and cleared correctly. The moment a first card is
// graded there is a card, and the nudge is gone on the next refresh with nothing
// to remember. Unloaded or failed counts say nothing: silence beats a wrong
// greeting on an established account.
export function firstSessionPending(counts) {
  if (!counts || !counts.loaded || counts.failed) return false
  if (!Number.isInteger(counts.cardCount)) return false
  return counts.cardCount === 0 && (counts.newCount || 0) > 0
}
