// Data plumbing for the flashcards → chapter reward loop. The DECISIONS live
// in storyReward.js / storyChapters.js (pure, tested); this module only
// fetches the inputs, calls the claim RPC, and shapes the result for the
// screens (Study's recap, the Stories hero, Home's session teaser).
//
// Everything here is best-effort: a failed query or an unapplied migration
// leaves the reward surfaces hidden — it must never block grading or reading.

import { supabase } from './supabase'
import { todayStr } from './streak'
import { isMissingRpc, enqueueStoryClaim } from './syncQueue'
import { buildSeriesUnits, resolveActiveSeries, rewardStateFor } from './storyReward'
import { nextRewardChapter, chapterInfo } from './storyChapters'

// The reward context for one track: series units (from published stories the
// learner can reach), their reads/unlocks, today's claim, and the active
// series pointer read fresh (the prop copy can be stale after Stories updates
// it). Returns null when the fetch fails — callers hide their reward surface.
export async function fetchRewardContext(userId, track) {
  try {
    const today = todayStr()
    const [sres, rres, ures, cres, tres] = await Promise.all([
      supabase.from('stories')
        .select('id, title, level, tier, story_number, presentation, panels, image_path, english_summary')
        .eq('language', track.language).eq('system', track.system)
        .lte('level', track.current_level).eq('is_published', true)
        .order('level', { ascending: true })
        .order('tier', { ascending: true })
        .order('story_number', { ascending: true }),
      supabase.from('story_reads').select('story_id, read_at').eq('user_id', userId),
      supabase.from('story_unlocks').select('story_id').eq('user_id', userId),
      supabase.from('story_reward_claims').select('claim_date, story_id')
        .eq('user_id', userId).eq('language', track.language)
        .eq('system', track.system).eq('claim_date', today).maybeSingle(),
      supabase.from('language_tracks').select('active_series')
        .eq('user_id', userId).eq('language', track.language)
        .eq('system', track.system).maybeSingle(),
    ])
    if (sres.error) return null
    const stories = sres.data || []
    const reads = rres.data || []
    const readIds = new Set(reads.map(r => r.story_id))
    // An error here (e.g. migration not applied yet) degrades to "nothing
    // unlocked", which the chapter rules turn into chapter-1-only — honest.
    const unlockIds = new Set((ures.data || []).map(u => u.story_id))
    const claim = cres.error ? null : (cres.data || null)
    const activeSeriesKey = (tres.data && tres.data.active_series) || null

    const units = buildSeriesUnits(stories)
    const activeUnit = resolveActiveSeries({ units, activeSeriesKey, recentReads: reads })
    return { stories, units, activeUnit, activeSeriesKey, reads, readIds, unlockIds, claim, today }
  } catch {
    return null
  }
}

// A story's cover, or its series' first chapter's, or nothing.
export function coverPathFor(story, unit) {
  if (story && story.image_path) return story.image_path
  const first = unit && unit.parts && unit.parts[0]
  return (first && first.image_path) || null
}

// Claim today's reward, unlocking `storyId` when one is given. Online it goes
// through the idempotent RPC; offline (or with the RPC missing) the claim is
// queued in the outbox so the day's reward survives the network. Returns the
// claim's resulting state, or null when nothing could be recorded.
export async function claimStoryReward({ userId, track, storyId = null, claimDate = todayStr() }) {
  const payload = {
    p_language: track.language,
    p_system: track.system,
    p_claim_date: claimDate,
    p_story_id: storyId,
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueueStoryClaim({ userId, language: track.language, system: track.system, claimDate, storyId })
    return { queued: true, story_id: storyId, redeemed: Boolean(storyId) }
  }
  try {
    const { data, error } = await supabase.rpc('claim_story_reward', payload)
    if (error) {
      if (isMissingRpc(error)) return null
      await enqueueStoryClaim({ userId, language: track.language, system: track.system, claimDate, storyId })
      return { queued: true, story_id: storyId, redeemed: Boolean(storyId) }
    }
    return data || null
  } catch {
    await enqueueStoryClaim({ userId, language: track.language, system: track.system, claimDate, storyId })
    return { queued: true, story_id: storyId, redeemed: Boolean(storyId) }
  }
}

// The whole end-of-session move, for Study's completion effect: work out what
// today's session unlocks in the active series, claim it, and shape the recap
// card. Returns:
//   { state: 'unlocked', chapter, unit }  — a chapter opened just now
//   { state: 'already',  storyId }        — today's reward was claimed earlier
//   { state: 'banked' }                   — claim recorded; nothing to unlock yet
//   null                                  — reward system unavailable
export async function claimSessionReward(userId, track) {
  const ctx = await fetchRewardContext(userId, track)
  if (!ctx) {
    // Offline with no context: bank the claim so the completed session still
    // counts once the network returns.
    const res = await claimStoryReward({ userId, track })
    return res ? { state: 'banked' } : null
  }
  if (ctx.claim && ctx.claim.story_id) return { state: 'already', storyId: ctx.claim.story_id }

  const target = ctx.activeUnit
    ? nextRewardChapter({ parts: ctx.activeUnit.parts, readIds: ctx.readIds, unlockIds: ctx.unlockIds })
    : null
  const res = await claimStoryReward({ userId, track, storyId: target ? target.id : null })
  if (!res) return null
  if (target && res.redeemed && res.story_id === target.id) {
    const idx = ctx.activeUnit.parts.indexOf(target)
    return {
      state: 'unlocked',
      chapter: { story: target, ...chapterInfo(target, idx) },
      unit: ctx.activeUnit,
    }
  }
  if (res.redeemed && res.story_id) return { state: 'already', storyId: res.story_id }
  return { state: 'banked' }
}

// Compact reward teaser for Home's session card: what completing today's
// session will unlock (or that it's already unlocked). Null when there is no
// active series or the data isn't reachable.
export async function getSessionRewardTeaser(userId, track) {
  const ctx = await fetchRewardContext(userId, track)
  if (!ctx) return null
  const state = rewardStateFor({
    unit: ctx.activeUnit, readIds: ctx.readIds, unlockIds: ctx.unlockIds, claim: ctx.claim,
  })
  if (state.state === 'locked' || state.state === 'banked') {
    const idx = ctx.activeUnit.parts.indexOf(state.chapter)
    return {
      state: state.state,
      seriesTitle: ctx.activeUnit.title,
      chapter: chapterInfo(state.chapter, idx),
      // The artwork Home anchors the hand-off on (P10-C2). A chapter without its
      // own illustration borrows the series' first, the same fallback the shelf
      // uses; null is fine — StoryCover has its own accent wash.
      coverPath: coverPathFor(state.chapter, ctx.activeUnit),
    }
  }
  if (state.state === 'unlocked-today') {
    const story = ctx.stories.find(s => s.id === state.storyId) || null
    const unit = story ? ctx.units.find(u => u.parts.some(p => p.id === story.id)) : null
    return story ? {
      state: 'unlocked-today',
      storyId: story.id,
      seriesTitle: unit ? unit.title : story.title,
      chapter: chapterInfo(story, unit ? unit.parts.findIndex(p => p.id === story.id) : 0),
      coverPath: coverPathFor(story, unit),
    } : null
  }
  return null
}
