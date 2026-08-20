// Shaping the Stories page from the flat shelf's sections — series first.
//
// The library's data shape (2026-08, live): series are overwhelmingly the
// browsing object — every level is 4–10 series plus at most a couple of
// standalone pieces and a handful of practice scenarios. So the page leads
// with the current level's SERIES as a vertical poster grid, keeps short
// standalone reads as a smaller secondary section, and keeps practice last —
// clearly secondary. Earlier (passed) levels collapse to a two-poster preview
// with an expander; the next level stays a small locked teaser.
//
// This module only classifies and shapes buildFlatShelf's output — tier locks,
// ordering inside a group (most-readable first, locked sink) and the counts
// all come from storyShelfFlat untouched. Pure — no React, no Supabase.

import { chapterInfo, readingMinutes } from './storyChapters'
import { leadingChapterNumber } from './storyArcs'

// How many posters a collapsed earlier level shows before "See all".
export const EARLIER_PREVIEW = 2
// How many mini covers the locked next-level teaser shows.
export const AHEAD_PREVIEW = 3

const isSeriesUnit = (unit) => unit && unit.kind === 'series'

function splitSection(sec) {
  const units = (sec && sec.units) || []
  return {
    series: units.filter(isSeriesUnit),
    shorts: units.filter(u => !isSeriesUnit(u)),
  }
}

// buildBrowseModel({ sections, aheadSection }) → {
//   current: { level, readCount, total, series, shorts, practice } | null,
//   earlier: [{ level, readCount, total, unitCount, preview, rest, practice }],
//   comingUp: { level, preview, count } | null,
// }
// `sections` comes ordered from buildFlatShelf (current first, then passed
// levels closest-first); that order is preserved here.
export function buildBrowseModel({ sections, aheadSection }) {
  const list = Array.isArray(sections) ? sections : []
  const currentSec = list.find(sec => sec.isCurrent) || null

  let current = null
  if (currentSec) {
    const { series, shorts } = splitSection(currentSec)
    current = {
      level: currentSec.level,
      readCount: currentSec.readCount,
      total: currentSec.total,
      series,
      shorts,
      practice: currentSec.practice || [],
    }
  }

  const earlier = list.filter(sec => sec !== currentSec).map(sec => {
    const units = sec.units || []
    return {
      level: sec.level,
      readCount: sec.readCount,
      total: sec.total,
      unitCount: units.length,
      preview: units.slice(0, EARLIER_PREVIEW),
      rest: units.slice(EARLIER_PREVIEW),
      practice: sec.practice || [],
    }
  })

  const aheadUnits = (aheadSection && aheadSection.units) || []
  const comingUp = aheadUnits.length > 0
    ? { level: aheadSection.level, preview: aheadUnits.slice(0, AHEAD_PREVIEW), count: aheadUnits.length }
    : null

  return { current, earlier, comingUp }
}

// '92% readable' — the one phrasing for the readability figure, shared by the
// poster meta lines and the Continue card (matches Home's hand-off copy).
export function readableLabel(knownPct) {
  return knownPct == null ? null : knownPct + '% readable'
}

// The poster's single meta line. The artwork carries the card; this line says
// only what the cover can't: where the learner stands and whether it's open.
//
//   locked (tier)    'Learn 40 more words'
//   locked (level)   'Unlocks at HSK 3'      (levelLabel passed by the caller)
//   series done      'Read'
//   series started   'Chapter 3 of 5 · 92% readable'
//   series fresh     '5 chapters · 92% readable'
//   single read      'Read'
//   single fresh     '6 min · 92% readable'
//
// A cross-level saga's continuation (chapters 7–12 at this level) states its
// true chapter range — 'Chapters 7–12', 'Chapter 8 · …' — never a position
// like "8 of 6" that pretends the numbering starts here.
//
// No level prefix (the section header names the level) and no format word
// (the poster badge carries Manhua/Practice).
export function posterMeta(unit, { levelLabel = null } = {}) {
  if (!unit) return ''
  if (unit.levelLocked) return levelLabel ? 'Unlocks at ' + levelLabel : 'Locked'
  if (unit.locked) {
    const n = Math.max(1, unit.remaining || 1)
    return 'Learn ' + n + ' more word' + (n === 1 ? '' : 's')
  }
  if (unit.allRead) return 'Read'

  const readable = readableLabel(unit.knownPct)
  const parts = unit.parts || []
  if (parts.length > 1) {
    const started = unit.readCount > 0
    const firstNum = leadingChapterNumber(parts[0] && parts[0].title)
    const lastNum = leadingChapterNumber(parts[parts.length - 1] && parts[parts.length - 1].title)
    const continuation = firstNum != null && firstNum > 1
    let lead
    if (started) {
      const n = chapterInfo(unit.next, parts.indexOf(unit.next)).number
      lead = n > parts.length ? 'Chapter ' + n : 'Chapter ' + n + ' of ' + parts.length
    } else {
      lead = continuation && lastNum != null
        ? 'Chapters ' + firstNum + '–' + lastNum
        : parts.length + ' chapters'
    }
    return [lead, readable].filter(Boolean).join(' · ')
  }
  const minutes = readingMinutes(parts[0])
  return [minutes ? minutes + ' min' : null, readable].filter(Boolean).join(' · ') || 'Story'
}
