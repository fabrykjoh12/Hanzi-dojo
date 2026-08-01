// The one-page story shelf (2026-08: replaces the tier TABS — the tier maths
// in storyTiers.js keeps gating unlocks; only the presentation is flat now).
//
// The page is a list of LEVEL SECTIONS — the learner's current level first,
// then earlier levels closest-first (still readable), with an optional teaser
// section for the next level (locked until the level test). Inside a section,
// stories and series are UNITS: a multi-chapter season is one unit with
// chapter progress; a standalone story is a unit of one. Units are sorted
// most-readable first ("% known" of the chapter you'd actually read next);
// tier-locked units sink to the end of their section, closest-to-unlocking
// first. Pure module — no React, no Supabase — spec'd in storyShelfFlat.test.js.
//
// Design decisions (owner, 2026-08-01, docs/superpowers/specs/…stories-flat-shelf…):
// one card per series · level sections with % known inside · locked visible
// with a calm lock, never hidden.

import { organizeNarrativeStories } from './storyShelf'
import { isPracticeFormat } from './storyFormat'

const levelOf = (story, currentLevel) => (story && story.level != null ? story.level : currentLevel)

// One unit from an ordered run of chapters (a series) or a single story.
function buildUnit({ kind, key, title, parts, readIds, tiers, learned, knownPctFor }) {
  const readCount = parts.filter(p => readIds.has(p.id)).length
  const next = parts.find(p => !readIds.has(p.id)) || parts[0]
  const spec = tiers.find(t => t.tier === next.tier) || null
  const locked = Boolean(spec) && learned < spec.minWords
  return {
    kind, key, title, parts, next,
    readCount,
    total: parts.length,
    allRead: parts.length > 0 && readCount === parts.length,
    locked,
    remaining: locked ? Math.max(1, spec.minWords - learned) : 0,
    // The % known of what you'd actually read next. Not computed for a locked
    // unit — the card shows the unlock requirement instead.
    knownPct: locked ? null : knownPctFor(next),
  }
}

// Unit-level status filter: 'unread' keeps anything with chapters left,
// 'read' keeps anything you've started. (Story-level filtering would shrink a
// half-read series to its unread chapters and misreport its progress.)
function matchesStatus(unit, status) {
  if (status === 'unread') return !unit.allRead
  if (status === 'read') return unit.readCount > 0
  return true
}

function sortUnits(units) {
  return [...units].sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? 1 : -1
    if (a.locked) return a.remaining - b.remaining
    const ap = a.knownPct == null ? -1 : a.knownPct
    const bp = b.knownPct == null ? -1 : b.knownPct
    if (bp !== ap) return bp - ap
    return String(a.title).localeCompare(String(b.title))
  })
}

// buildFlatShelf({
//   stories,       published rows for every reachable level
//   currentLevel,
//   tiersFor:      (level) => tier specs for that level (storyTiers.tiersFor)
//   learnedFor:    (level) => learned words counting toward that level's gates
//   readIds:       Set of finished story ids
//   filters:       { status, format } (storyList keys)
//   knownPctFor:   (story) => 0-100 (caller memoizes readability)
// }) → [{ level, isCurrent, readCount, total, units, practice }]
//
// Sections: current level first, then lower levels descending (closest first).
// `readCount`/`total` are the level's UNFILTERED story counts, so the header
// stays stable while filters change what the grid shows.
export function buildFlatShelf({ stories, currentLevel, tiersFor, learnedFor, readIds, filters = {}, knownPctFor }) {
  const list = Array.isArray(stories) ? stories : []
  const status = filters.status || 'all'
  const format = filters.format || 'all'

  const byLevel = new Map()
  for (const s of list) {
    const lvl = levelOf(s, currentLevel)
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl).push(s)
  }

  const levels = [...byLevel.keys()].sort((a, b) => {
    if (a === currentLevel) return -1
    if (b === currentLevel) return 1
    return b - a
  })

  const sections = []
  for (const level of levels) {
    const levelStories = byLevel.get(level)
    const tiers = tiersFor(level)
    const learned = learnedFor(level)

    const narrative = levelStories.filter(s => !isPracticeFormat(s))
    const practiceAll = levelStories.filter(s => isPracticeFormat(s))

    const { standaloneStories, seriesArcs, looseStories } = organizeNarrativeStories(narrative)
    let units = [
      ...seriesArcs.map(arc => buildUnit({
        kind: 'series', key: arc.key, title: arc.title, parts: arc.parts,
        readIds, tiers, learned, knownPctFor,
      })),
      ...[...standaloneStories, ...looseStories].map(story => buildUnit({
        kind: 'story', key: story.id, title: story.title, parts: [story],
        readIds, tiers, learned, knownPctFor,
      })),
    ]

    units = units.filter(u => matchesStatus(u, status))
    if (format === 'practice') units = []

    let practice = format === 'stories' ? [] : practiceAll.filter(s => {
      if (status === 'read') return readIds.has(s.id)
      if (status === 'unread') return !readIds.has(s.id)
      return true
    })
    // Practice scenarios sit behind the same tier gates as stories.
    practice = practice.filter(s => {
      const spec = tiers.find(t => t.tier === s.tier)
      return !spec || learned >= spec.minWords
    })

    if (units.length === 0 && practice.length === 0) continue

    sections.push({
      level,
      isCurrent: level === currentLevel,
      levelLocked: false,
      readCount: levelStories.filter(s => readIds.has(s.id)).length,
      total: levelStories.length,
      units: sortUnits(units),
      practice,
    })
  }
  return sections
}

// The "road ahead" teaser: the NEXT level's stories as one fully-locked section
// at the end of the shelf (levels beyond it stay over the horizon). These rows
// are fetched WITHOUT content, so no % known — every unit is locked and the
// card shows the level gate instead. Hidden under the 'read' status filter
// (nothing there can have been read) and the 'practice' format filter.
export function buildNextLevelSection({ level, stories, filters = {} }) {
  // Defensive level filter: the caller queries level=eq.N, but a mock or a
  // cached snapshot can hand back more — never render a teaser of the wrong level.
  const list = (Array.isArray(stories) ? stories : [])
    .filter(s => s && s.level === level && !isPracticeFormat(s))
  if (list.length === 0) return null
  if (filters.status === 'read' || filters.format === 'practice') return null

  const { standaloneStories, seriesArcs, looseStories } = organizeNarrativeStories(list)
  const asLocked = (kind, key, title, parts) => ({
    kind, key, title, parts, next: parts[0],
    readCount: 0, total: parts.length, allRead: false,
    locked: true, levelLocked: true, remaining: null, knownPct: null,
  })
  const units = [
    ...seriesArcs.map(arc => asLocked('series', arc.key, arc.title, arc.parts)),
    ...[...standaloneStories, ...looseStories].map(s => asLocked('story', s.id, s.title, [s])),
  ]
  return {
    level,
    isCurrent: false,
    levelLocked: true,
    readCount: 0,
    total: list.length,
    units,
    practice: [],
  }
}
