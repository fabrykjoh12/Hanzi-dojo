// Chapter-level unlock model for the story library.
//
// A series is an ordered list of chapters (unit.parts, from storyShelf.js).
// Which of them a learner can open follows three rules, in this order:
//
//   1. Chapter 1 is always open — the learner gets invested before being asked
//      to study for the next one. A single-chapter unit is therefore fully open.
//   2. A chapter they have read stays open forever (re-reading is free).
//   3. Any other chapter needs an unlock row (story_unlocks) — earned one per
//      qualifying flashcard session, or seeded for progress that predates the
//      unlock system.
//
// Pure module — no React, no Supabase. Spec'd in storyChapters.test.js.

import { leadingChapterNumber, stripLeadingNumber } from './storyArcs'

function panelMeta(story) {
  const panels = story && story.panels
  if (!panels || typeof panels !== 'object') return {}
  const meta = panels.meta
  return meta && typeof meta === 'object' ? meta : {}
}

// Reading pace the "N min" labels are computed from. Learners read a story at
// their level slowly and look words up along the way — much closer to 90
// characters a minute than a native's several hundred.
export const READING_CHARS_PER_MINUTE = 90

// Estimated minutes to read a story: the authored estimate when one exists
// (standalone manhua carry panels.meta.estimated_minutes), otherwise derived
// from the content length. Null when there is nothing to estimate from (e.g.
// a next-level teaser row fetched without content).
export function readingMinutes(story) {
  const meta = panelMeta(story)
  if (Number.isInteger(meta.estimated_minutes) && meta.estimated_minutes > 0) {
    return meta.estimated_minutes
  }
  const chars = String((story && story.content) || '').replace(/\s+/g, '').length
  if (chars === 0) return null
  return Math.max(1, Math.round(chars / READING_CHARS_PER_MINUTE))
}

// Display identity of one chapter: its number (from the title marker or its
// position), a title with the leading marker stripped, and the native episode
// label a manhua carries ("第一话"). `index` is the chapter's position in
// reading order, the fallback when the title carries no number.
export function chapterInfo(story, index = 0) {
  const meta = panelMeta(story)
  const fromTitle = leadingChapterNumber(story && story.title)
  const stripped = stripLeadingNumber(story && story.title)
  return {
    number: fromTitle != null ? fromTitle : index + 1,
    title: meta.episode_title || stripped || (story && story.title) || '',
    nativeLabel: typeof meta.episode_label === 'string' && meta.episode_label.trim()
      ? meta.episode_label.trim()
      : null,
  }
}

// The set of chapter ids the learner can open in this unit. `unlockIds` is the
// learner's story_unlocks; `readIds` their story_reads.
export function unlockedChapterIds({ parts, readIds, unlockIds }) {
  const list = Array.isArray(parts) ? parts : []
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  const unlocks = unlockIds instanceof Set ? unlockIds : new Set(unlockIds || [])
  const open = new Set()
  list.forEach((p, i) => {
    if (!p) return
    if (i === 0 || list.length === 1) { open.add(p.id); return }
    if (reads.has(p.id) || unlocks.has(p.id)) open.add(p.id)
  })
  return open
}

// One row per chapter, ready to render: identity + read/unlocked/current state.
// `current` marks the chapter the learner would read next (first unread that is
// open) — at most one row carries it.
export function chapterRows({ parts, readIds, unlockIds }) {
  const list = Array.isArray(parts) ? parts : []
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  const open = unlockedChapterIds({ parts: list, readIds: reads, unlockIds })
  let currentFound = false
  return list.map((story, i) => {
    const read = reads.has(story.id)
    const unlocked = open.has(story.id)
    const current = !currentFound && !read && unlocked
    if (current) currentFound = true
    return {
      story,
      ...chapterInfo(story, i),
      minutes: readingMinutes(story),
      read,
      unlocked,
      current,
    }
  })
}

// The primary call to action for a series:
//   start    — nothing read yet → chapter 1
//   continue — mid-series and the next unread chapter is open
//   locked   — mid-series but the next unread chapter needs a flashcard session
//   reread   — every chapter read → back to chapter 1
export function seriesCta({ parts, readIds, unlockIds }) {
  const rows = chapterRows({ parts, readIds, unlockIds })
  if (rows.length === 0) return null
  const unread = rows.filter(r => !r.read)
  if (unread.length === 0) {
    return { kind: 'reread', chapter: rows[0].story, chapterNumber: rows[0].number }
  }
  const next = unread[0]
  const anyRead = rows.some(r => r.read)
  if (!anyRead) return { kind: 'start', chapter: next.story, chapterNumber: next.number }
  if (next.unlocked) return { kind: 'continue', chapter: next.story, chapterNumber: next.number }
  return { kind: 'locked', chapter: next.story, chapterNumber: next.number }
}

// The chapter a session reward would unlock: the first chapter that is neither
// open nor read. Null when everything is already reachable.
export function nextRewardChapter({ parts, readIds, unlockIds }) {
  const list = Array.isArray(parts) ? parts : []
  const open = unlockedChapterIds({ parts: list, readIds, unlockIds })
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  return list.find(p => p && !open.has(p.id) && !reads.has(p.id)) || null
}

// What the reader's finish state should point at after reading `storyId`:
//   { kind: 'unlocked' | 'locked', story, number, title, nativeLabel }
//   { kind: 'series-complete', total }
// or null when the story isn't part of this unit / the unit is a single story.
// "Next" is the following chapter; past the end it falls back to the first
// unread chapter (a re-read shouldn't dead-end), and only reads as complete
// when every chapter is genuinely read.
export function nextChapterInfo({ parts, storyId, readIds, unlockIds }) {
  const list = Array.isArray(parts) ? parts : []
  if (list.length < 2) return null
  const idx = list.findIndex(p => p && p.id === storyId)
  if (idx === -1) return null
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  const open = unlockedChapterIds({ parts: list, readIds: reads, unlockIds })

  let target = idx < list.length - 1 ? list[idx + 1] : null
  if (!target || reads.has(target.id)) {
    target = list.find(p => p && !reads.has(p.id) && p.id !== storyId) || null
  }
  if (!target) return { kind: 'series-complete', total: list.length }
  const info = chapterInfo(target, list.indexOf(target))
  return {
    kind: open.has(target.id) ? 'unlocked' : 'locked',
    story: target,
    ...info,
  }
}

// Grandfathering: unlock rows to seed for a learner whose reading predates the
// chapter system. For every multi-chapter unit they had started, everything up
// to (and one past) their furthest read chapter stays reachable — exactly what
// they could open the day before the system shipped. Read chapters are skipped
// (rule 2 already covers them); returns story ids for a one-time batch insert.
export function seedUnlockIds(units, readIds) {
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  const out = []
  for (const unit of units || []) {
    const parts = (unit && unit.parts) || []
    if (parts.length < 2) continue
    let lastRead = -1
    parts.forEach((p, i) => { if (p && reads.has(p.id)) lastRead = i })
    if (lastRead === -1) continue
    const upto = Math.min(lastRead + 1, parts.length - 1)
    for (let i = 1; i <= upto; i += 1) {
      const p = parts[i]
      if (p && !reads.has(p.id)) out.push(p.id)
    }
  }
  return out
}
