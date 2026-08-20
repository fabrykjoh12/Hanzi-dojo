// The Stories page's Continue-reading card — the one object at the top of the
// library when the learner is mid-series. This module only RESOLVES what the
// card shows; rendering belongs to the screen. Pure — no React, no Supabase.
//
// The card rides the existing reward machine (storyReward.rewardStateFor) and
// active-series resolution untouched; this is a presentation model over them:
//
//   { kind: 'continue' }        — the next unread chapter is open: read it
//   { kind: 'session-locked' }  — the next unread chapter waits behind today's
//                                 flashcard session; the action goes to Study
//   { kind: 'unlocked-today' }  — today's reward chapter is claimed and unread
//   { kind: 'start-here' }      — nothing is mid-flight; feature the best
//                                 unstarted pick (the daily featured story)
//   null                        — nothing to point at (everything read, or an
//                                 empty library); the card does not render
//
// Every kind carries the same shape, so the card renders one layout:
//   kind, unit (null for a unit-less standalone), seriesTitle, chapter,
//   chapterNumber, chapterTitle, nativeLabel, total, progress ({ readCount,
//   total } for a started multi-chapter unit), knownPct, minutes, action
//   ('read' | 'study').

import { chapterInfo, readingMinutes, seriesCta } from './storyChapters'

function partIndex(unit, story) {
  if (!unit || !story) return 0
  const i = (unit.parts || []).findIndex(p => p && p.id === story.id)
  return i === -1 ? 0 : i
}

function unitOf(units, story) {
  if (!story) return null
  return (units || []).find(u => (u.parts || []).some(p => p && p.id === story.id)) || null
}

function model({ kind, unit, chapter, readIds, knownPct, action }) {
  const parts = (unit && unit.parts) || [chapter]
  const info = chapterInfo(chapter, partIndex(unit, chapter))
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  const readCount = parts.filter(p => p && reads.has(p.id)).length
  const multi = parts.length > 1
  return {
    kind,
    unit,
    seriesTitle: (unit && unit.title) || (chapter && chapter.title) || '',
    chapter,
    chapterNumber: info.number,
    chapterTitle: info.title,
    nativeLabel: info.nativeLabel,
    total: parts.length,
    progress: multi && readCount > 0 ? { readCount, total: parts.length } : null,
    knownPct,
    minutes: readingMinutes(chapter),
    action,
  }
}

// continueCard({
//   rewardState,   from rewardStateFor (or null while loading) — only its
//                  'unlocked-today' claim takes precedence here
//   activeUnit,    from resolveActiveSeries (or null)
//   unlockIds,     the learner's story_unlocks (chapter gate input)
//   units,         every unit on the shelf (reward units), for lookups
//   stories,       published rows, to resolve unlocked-today's storyId
//   readIds,       Set of finished story ids
//   featured,      the daily featured pick (pickDailyStory), or null
//   knownPctFor,   (story) => 0-100 | null — caller memoizes readability
// }) → card model | null
//
// Reading comes first: inside the active series the card points at the next
// unread chapter — open means read it NOW, even when a later chapter could
// also be unlocked by a session; only when that next chapter is itself locked
// does the card become the session hand-off. (The reward machine still governs
// what a session unlocks — this only decides what the card leads with.)
export function continueCard({
  rewardState, activeUnit, unlockIds, units, stories, readIds, featured, knownPctFor,
}) {
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  const pctOf = typeof knownPctFor === 'function' ? knownPctFor : () => null
  const state = rewardState && rewardState.state

  if (state === 'unlocked-today') {
    const story = (stories || []).find(s => s && s.id === rewardState.storyId)
    if (story && !reads.has(story.id)) {
      return model({
        kind: 'unlocked-today', unit: unitOf(units, story), chapter: story,
        readIds: reads, knownPct: pctOf(story), action: 'read',
      })
    }
    // Already read today's unlock — fall through to whatever is next.
  }

  if (activeUnit) {
    const cta = seriesCta({ parts: activeUnit.parts || [], readIds: reads, unlockIds })
    if (cta && cta.kind === 'locked') {
      // No readability on a locked chapter — the requirement is the message.
      return model({
        kind: 'session-locked', unit: activeUnit, chapter: cta.chapter,
        readIds: reads, knownPct: null, action: 'study',
      })
    }
    if (cta && cta.kind === 'continue') {
      return model({
        kind: 'continue', unit: activeUnit, chapter: cta.chapter,
        readIds: reads, knownPct: pctOf(cta.chapter), action: 'read',
      })
    }
    if (cta && cta.kind === 'start') {
      return model({
        kind: 'start-here', unit: activeUnit, chapter: cta.chapter,
        readIds: reads, knownPct: pctOf(cta.chapter), action: 'read',
      })
    }
    // 'reread' (series finished) falls through to the featured pick.
  }

  // Nothing mid-flight ('no-series', 'series-complete', or the fall-through
  // above): feature the best unstarted pick. An already-read featured story
  // means the learner is ahead of the picker — show nothing over showing noise.
  if (featured && !reads.has(featured.id)) {
    const unit = unitOf(units, featured)
    const first = unit ? (unit.parts.find(p => p && !reads.has(p.id)) || unit.parts[0]) : featured
    return model({
      kind: 'start-here', unit, chapter: first,
      readIds: reads, knownPct: pctOf(first), action: 'read',
    })
  }

  return null
}
