// How one tier tab's shelf is assembled: which levels contribute to it, whether
// each is unlocked, what the tab should say, and how a level's stories divide
// into series / single stories / practice.
//
// This is the logic that used to live inside Stories.jsx — two closures over
// render scope plus a ~70-line IIFE in the middle of the JSX. It is pure, it
// decides what a learner can and cannot read, and CLAUDE.md §3 asks for exactly
// this: behaviour belongs in a plain module with a spec beside it, not in
// another branch inside a 900-line component.
//
// Nothing here changes what the screen does — it is the same rules, lifted out
// and tested.

import { storyLevels } from './storyTiers'
import { groupIntoArcs } from './storyArcs'
import { isPracticeFormat } from './storyFormat'

// A story row with no `level` is treated as belonging to the learner's current
// level (an old cached snapshot can look like that).
function levelOf(level, currentLevel) {
  return level == null ? currentLevel : level
}

// shelvesForTier(...) → the levels that contribute stories to one tier tab, the
// learner's current level first and the rest descending, each tagged with its
// own unlock state:
//
//   [{ level, spec, learned, unlocked, stories }]
//
// The shelf is CUMULATIVE — every level the learner has reached — and each level
// is gated by its own thresholds, so a tier that is still locked at HSK 2 can be
// open at HSK 1. A level with no stories in this tier is dropped, EXCEPT the
// current one: it is kept as an empty shelf so the tab can still say how many
// words open it.
//
// `tiersAt(level)` and `learnedAt(level)` are the per-level tier table and
// learned-word count (see storyTiers: tiersFor / readingGateCount).
export function shelvesForTier({ stories = [], tier, currentLevel, tiersAt, learnedAt } = {}) {
  const list = Array.isArray(stories) ? stories : []
  const out = []
  for (const level of storyLevels(list, currentLevel)) {
    const spec = (tiersAt(level) || []).find(t => t.tier === tier)
    if (!spec) continue
    const levelStories = list.filter(s => s && s.tier === tier && levelOf(s.level, currentLevel) === level)
    if (levelStories.length === 0 && level !== currentLevel) continue
    const learned = learnedAt(level)
    out.push({ level, spec, learned, unlocked: learned >= spec.minWords, stories: levelStories })
  }
  return out
}

// What one tier's tab says, from its shelves:
//
//   { locked, remaining, comingSoon, storyCount }
//
// Precedence matters, and it is deliberate:
//   1. Anything readable → the tab shows a story count, never a lock. One open
//      shelf is enough; a tier is not "locked" because a level above it is.
//   2. Nothing readable but stories waiting behind a gate → locked, quoting the
//      SMALLEST gap of the shelves that actually have stories, so the number is
//      one a learner can really close.
//   3. Nothing anywhere, and the current level's gate is shut → locked on that.
//   4. Otherwise → unlocked but empty: "coming soon", not a lie about a lock.
export function tierInfo(shelves, currentLevel) {
  const list = Array.isArray(shelves) ? shelves : []
  const readable = list.filter(sh => sh.unlocked && sh.stories.length > 0)
  if (readable.length > 0) {
    return {
      locked: false,
      comingSoon: false,
      storyCount: readable.reduce((n, sh) => n + sh.stories.length, 0),
    }
  }
  const lockedWithStories = list.filter(sh => !sh.unlocked && sh.stories.length > 0)
  if (lockedWithStories.length > 0) {
    const remaining = Math.min(...lockedWithStories.map(sh => sh.spec.minWords - sh.learned))
    return { locked: true, remaining: Math.max(1, remaining), comingSoon: false, storyCount: 0 }
  }
  const cur = list.find(sh => sh.level === currentLevel)
  if (cur && !cur.unlocked) {
    return { locked: true, remaining: Math.max(1, cur.spec.minWords - cur.learned), comingSoon: false, storyCount: 0 }
  }
  return { locked: false, comingSoon: true, storyCount: 0 }
}

// The tab to open when the learner hasn't picked one: the first tier with
// something actually readable, else the first tier. Never a locked or empty tab
// when a readable one exists — landing on a dead tab is what made the old
// screen look like it had nothing in it.
export function defaultTier(categories, infoOf) {
  const list = Array.isArray(categories) ? categories : []
  const open = list.find(c => {
    const info = infoOf(c.tier)
    return info && !info.locked && !info.comingSoon
  })
  return (open || list[0] || { tier: 1 }).tier
}

// splitShelf(stories) → { seriesArcs, looseStories, practice }.
//
// `stories` must be in reading order (story_number ascending) — groupIntoArcs
// derives a season from where its chapter numbers restart.
//
// A series earns a cover of its own only when it is genuinely a multi-chapter
// run. An unnumbered pile is not a series: collapsing it behind one cover would
// bury every story under a click for nothing, so those parts are handed back as
// single stories.
export function splitShelf(stories) {
  const list = (Array.isArray(stories) ? stories : []).filter(Boolean)
  const narrative = list.filter(s => !isPracticeFormat(s))
  const practice = list.filter(s => isPracticeFormat(s))
  const arcs = groupIntoArcs(narrative)
  const isSeries = (a) => a.numbered && a.parts.length > 1
  return {
    seriesArcs: arcs.filter(isSeries),
    looseStories: arcs.filter(a => !isSeries(a)).flatMap(a => a.parts),
    practice,
  }
}
