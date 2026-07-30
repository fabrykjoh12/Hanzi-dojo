// The Stories *library*: which shelf you are looking at, how it is ordered, and
// how each story is described before you open it.
//
// The screen used to navigate by tier — three tabs (First Steps / Growing /
// Fluent) over a cumulative pile of every level at once. That answered "what has
// the app unlocked for me" but never "what do I want to read tonight". This
// module models the other shape: you pick an HSK level, and everything on that
// shelf is ordered by how much of it you can already read.
//
// Everything here is pure so the ordering rules — the part a learner actually
// feels — are tested without mounting the (large) Stories screen.

import { calculateStoryReadability, buildVocabMatcher } from './storyReading'

// ─── READABILITY ───────────────────────────────────────────────────────────

// Score a whole shelf in one pass.
//
// `calculateStoryReadability` builds a vocab matcher on every call, and that
// index is over the WHOLE vocabulary (1,600+ rows for a filled-in Chinese
// track). Doing it per story turned a 200-story shelf into 200 rebuilds of the
// same index. The matcher depends only on (vocabMap, language), so it is built
// once here and handed to each story.
//
// Returns Map(story.id → { knownPct, totalUnique, newCount, length }). Stories
// with no `content` (the locked-level previews, which are fetched without it)
// are simply absent from the map — the caller shows no meter for them rather
// than a fake 0%.
export function scoreStories({ stories = [], vocabMap = {}, cards = {}, language } = {}) {
  const out = new Map()
  const list = Array.isArray(stories) ? stories : []
  if (list.length === 0) return out
  const matcher = buildVocabMatcher(vocabMap, language)
  for (const s of list) {
    if (!s || s.id == null || !s.content) continue
    const r = calculateStoryReadability({ content: s.content, vocabMap, cards, language, matcher })
    out.set(s.id, {
      knownPct: r.knownPct,
      totalUnique: r.totalUnique,
      newCount: r.newCount,
      length: storyLength(s),
    })
  }
  return out
}

// How long a story reads, in characters of actual text. Used by the "Shortest
// first" sort — the one a tired learner reaches for.
export function storyLength(story) {
  if (!story || !story.content) return 0
  return String(story.content).split('\n').join('').length
}

// How a "% known" reads as a feeling. Deliberately calm: a hard story is
// described, not warned about, and the tone gets QUIETER as it gets harder
// rather than louder (no red "too hard for you" on a story someone wants).
export function comfortBand(pct) {
  if (pct == null || Number.isNaN(pct)) return { key: 'unknown', label: 'New ground' }
  if (pct >= 95) return { key: 'comfortable', label: 'Comfortable' }
  if (pct >= 85) return { key: 'steady', label: 'Steady' }
  if (pct >= 70) return { key: 'stretch', label: 'A stretch' }
  return { key: 'hard', label: 'New ground' }
}

// ─── SEARCH ────────────────────────────────────────────────────────────────

function haystack(s) {
  return [s.title, s.english_summary, s.english_content, s.content]
    .filter(Boolean).join(' \n ').toLowerCase()
}

// Match on the Chinese title, the English summary/translation, and the story
// text — so both "noodle" and 面条 find the same story.
export function searchStories(stories, query) {
  const list = Array.isArray(stories) ? stories : []
  const q = String(query || '').trim().toLowerCase()
  if (!q) return list.slice()
  return list.filter(s => s && haystack(s).indexOf(q) !== -1)
}

// ─── ORDERING ──────────────────────────────────────────────────────────────

export const SORT_OPTIONS = [
  { key: 'match', label: 'For you' },
  { key: 'easiest', label: 'Easiest' },
  { key: 'hardest', label: 'Hardest' },
  { key: 'shortest', label: 'Shortest' },
  { key: 'order', label: 'In order' },
]

export const DEFAULT_SORT = 'match'

// The library's own order: newest level on top, then tier, then story number —
// the order the shelf was written in. Every other sort falls back to it, so ties
// are never arbitrary and the grid never reshuffles between renders.
function shelfOrder(a, b) {
  if (a.level !== b.level) return b.level - a.level
  if (a.tier !== b.tier) return a.tier - b.tier
  if (a.storyNumber !== b.storyNumber) return a.storyNumber - b.storyNumber
  return String(a.id).localeCompare(String(b.id))
}

// An entry with no score sorts as if it were the hardest thing on the shelf, so
// an unscored row can never jump the queue in "Easiest first".
function pctOf(e) { return typeof e.knownPct === 'number' ? e.knownPct : -1 }

// sortEntries(entries, sortKey) → a NEW array, ordered.
//
// An entry is one card on the shelf — a single story or a whole series:
//   { id, kind, level, tier, storyNumber, knownPct, length, read, inProgress }
//
// "For you" is the default and the only opinionated one: what you are part-way
// through, then what you have not read, then the most readable of each. It is
// the shelf answering "what next" instead of making you decide.
export function sortEntries(entries, sortKey = DEFAULT_SORT) {
  const list = (Array.isArray(entries) ? entries : []).slice()
  const cmp = {
    match: (a, b) => {
      if (Boolean(a.inProgress) !== Boolean(b.inProgress)) return a.inProgress ? -1 : 1
      if (Boolean(a.read) !== Boolean(b.read)) return a.read ? 1 : -1
      if (pctOf(a) !== pctOf(b)) return pctOf(b) - pctOf(a)
      return shelfOrder(a, b)
    },
    easiest: (a, b) => (pctOf(a) !== pctOf(b) ? pctOf(b) - pctOf(a) : shelfOrder(a, b)),
    hardest: (a, b) => (pctOf(a) !== pctOf(b) ? pctOf(a) - pctOf(b) : shelfOrder(a, b)),
    shortest: (a, b) => ((a.length || 0) !== (b.length || 0) ? (a.length || 0) - (b.length || 0) : shelfOrder(a, b)),
    order: shelfOrder,
  }
  return list.sort(cmp[sortKey] || cmp[DEFAULT_SORT])
}

// ─── THE LEVEL RAIL ────────────────────────────────────────────────────────

export const ALL_LEVELS = 'all'

function readCountOf(stories, readIds) {
  const has = readIds instanceof Set
    ? (id) => readIds.has(id)
    : (id) => Boolean(readIds && readIds[id])
  return stories.filter(s => s && has(s.id)).length
}

// shelfLevels(...) → the rail: one entry per level worth showing, lowest first.
//
//   { level, count, readCount, locked }
//
// A level earns a place when it has published stories (readable OR still ahead
// of the learner) or when it is the level they are on — so a learner whose own
// level has nothing written for it yet still sees where they are standing,
// rather than a rail that skips them.
//
// `locked` levels are above `currentLevel`: their covers are shown, dimmed, as a
// preview of what the ladder leads to. Levels the learner has passed are never
// locked — the cumulative shelf keeps them open (see readingGateCount).
export function shelfLevels({ levels = [], stories = [], previewStories = [], currentLevel, readIds } = {}) {
  const open = Array.isArray(stories) ? stories : []
  const ahead = Array.isArray(previewStories) ? previewStories : []
  const out = []
  for (const level of levels) {
    if (level == null) continue
    const locked = currentLevel != null && level > currentLevel
    const pool = (locked ? ahead : open).filter(s => s && (s.level == null ? currentLevel : s.level) === level)
    if (pool.length === 0 && level !== currentLevel) continue
    out.push({
      level,
      count: pool.length,
      readCount: locked ? 0 : readCountOf(pool, readIds),
      locked,
    })
  }
  return out
}

// The level the shelf opens on: the learner's own level when it has something to
// read, otherwise the highest level below it that does, otherwise their level
// anyway (so the rail's selection always matches a chip that exists).
export function defaultShelfLevel(rail, currentLevel) {
  const list = Array.isArray(rail) ? rail : []
  const mine = list.find(r => r.level === currentLevel)
  if (mine && mine.count > 0) return mine.level
  const below = list.filter(r => !r.locked && r.count > 0 && r.level <= currentLevel)
  if (below.length > 0) return below[below.length - 1].level
  if (mine) return mine.level
  const anyOpen = list.filter(r => !r.locked && r.count > 0)
  if (anyOpen.length > 0) return anyOpen[anyOpen.length - 1].level
  return list.length > 0 ? list[0].level : currentLevel
}

// ─── SHELF SUMMARY ─────────────────────────────────────────────────────────

// One honest line about what is on screen: how much there is, how much of it you
// have read, and how much of its vocabulary is already yours.
//
// `avgKnownPct` is the mean over scored stories (unscored ones are ignored
// rather than counted as zero) and is null when nothing on the shelf is scored.
export function shelfSummary(stories, readIds, scores) {
  const list = (Array.isArray(stories) ? stories : []).filter(Boolean)
  let sum = 0
  let scored = 0
  for (const s of list) {
    const sc = scores && (scores instanceof Map ? scores.get(s.id) : scores[s.id])
    if (sc && typeof sc.knownPct === 'number') { sum += sc.knownPct; scored += 1 }
  }
  return {
    total: list.length,
    read: readCountOf(list, readIds),
    avgKnownPct: scored > 0 ? Math.round(sum / scored) : null,
  }
}
