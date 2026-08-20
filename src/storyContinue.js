// The Stories page's Continue-reading card — the one object at the top of the
// library when the learner is mid-series. This module only RESOLVES what the
// card shows; rendering belongs to the screen. Pure — no React, no Supabase.
//
// The card rides the existing reward machine (storyReward.rewardStateFor) and
// active-series resolution untouched; this is a presentation model over them:
//
//   { kind: 'continue' }        — the next unread chapter is open: read it
//   { kind: 'session-locked' }  — the next chapter waits behind today's
//                                 flashcard session (reward 'locked'/'banked');
//                                 the card's action goes to Study
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

import { chapterInfo, readingMinutes } from './storyChapters'

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
//   rewardState,   from rewardStateFor (or null while loading)
//   activeUnit,    from resolveActiveSeries (or null)
//   units,         every unit on the shelf (reward units), for lookups
//   stories,       published rows, to resolve unlocked-today's storyId
//   readIds,       Set of finished story ids
//   featured,      the daily featured pick (pickDailyStory), or null
//   knownPctFor,   (story) => 0-100 | null — caller memoizes readability
// }) → card model | null
export function continueCard({
  rewardState, activeUnit, units, stories, readIds, featured, knownPctFor,
}) {
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  const pctOf = typeof knownPctFor === 'function' ? knownPctFor : () => null
  const state = rewardState && rewardState.state

  if ((state === 'locked' || state === 'banked') && activeUnit && rewardState.chapter) {
    // No readability on a locked chapter — the requirement is the message.
    return model({
      kind: 'session-locked', unit: activeUnit, chapter: rewardState.chapter,
      readIds: reads, knownPct: null, action: 'study',
    })
  }

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

  if (state === 'all-unlocked' && activeUnit && rewardState.chapter) {
    return model({
      kind: 'continue', unit: activeUnit, chapter: rewardState.chapter,
      readIds: reads, knownPct: pctOf(rewardState.chapter), action: 'read',
    })
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
