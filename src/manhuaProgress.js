// Where the learner is inside a manhua episode, so closing the tab mid-episode
// costs nothing.
//
// This deliberately does NOT invent a progress system. Completion is still the
// existing one — `story_reads`, written by useStoryReaderCore.finish(), synced
// through the outbox when offline. What lives here is only the *position*
// inside an episode, which no other reader needed because no other reader has
// choices to remember: which panel to scroll back to, which option was picked
// at each gate, and which words have been tapped (for the completion screen's
// word list).
//
// It rides on `prefs` (offline.js) — durable IndexedDB, survives "Clear
// downloads", works signed-out, degrades to a no-op when IndexedDB is missing.
// Same store the reading mode/font/rate already use.
//
// The pure half (sanitise / merge / resume) is tested; the two IO functions are
// a few lines of prefsGet/prefsMerge over it, plus the legacy-key read below.

import { prefsGet, prefsMerge } from './offline'
import { revealLimit } from './manhuaLayout'

export const MANHUA_PROGRESS_PREFIX = 'manhua:'

// The format was called "manga" for its first two days, and positions saved in
// that window live under the old prefix. Reads fall back to it once; writes only
// ever go to the new key, so a resumed episode quietly migrates itself. Delete
// this and the fallback in loadManhuaProgress when the old keys stop mattering.
export const LEGACY_PROGRESS_PREFIX = 'manga:'

export function progressKey(storyId) {
  return MANHUA_PROGRESS_PREFIX + (storyId || 'unknown')
}

export function legacyProgressKey(storyId) {
  return LEGACY_PROGRESS_PREFIX + (storyId || 'unknown')
}

export const EMPTY_PROGRESS = { panel: 0, choices: {}, tapped: [], completed: false }

// Anything stored can be anything by the time it is read back — an older shape,
// a half-written record, a panel index from an episode that has since been
// re-cut. Everything that isn't obviously valid becomes the empty default for
// that field, so a corrupt record costs the learner their position and nothing
// else.
export function sanitizeProgress(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PROGRESS }
  const choices = {}
  if (raw.choices && typeof raw.choices === 'object') {
    for (const key of Object.keys(raw.choices)) {
      if (Number.isInteger(raw.choices[key])) choices[key] = raw.choices[key]
    }
  }
  const tapped = Array.isArray(raw.tapped)
    ? raw.tapped.filter(w => typeof w === 'string' && w).slice(0, 200)
    : []
  return {
    panel: Number.isInteger(raw.panel) && raw.panel >= 0 ? raw.panel : 0,
    choices,
    tapped,
    completed: raw.completed === true,
  }
}

// Fold a patch over the stored record. `tapped` unions (a word tapped twice is
// still one word); `choices` merges by panel id; everything else replaces.
export function mergeProgress(prev, patch) {
  const base = sanitizeProgress(prev)
  const next = patch && typeof patch === 'object' ? patch : {}
  const merged = { ...base }
  if (Number.isInteger(next.panel) && next.panel >= 0) merged.panel = next.panel
  if (next.completed === true) merged.completed = true
  if (next.choices && typeof next.choices === 'object') {
    merged.choices = { ...base.choices }
    for (const key of Object.keys(next.choices)) {
      if (Number.isInteger(next.choices[key])) merged.choices[key] = next.choices[key]
    }
  }
  if (Array.isArray(next.tapped)) {
    const seen = new Set(base.tapped)
    const out = base.tapped.slice()
    for (const w of next.tapped) {
      if (typeof w !== 'string' || !w || seen.has(w)) continue
      seen.add(w)
      out.push(w)
    }
    merged.tapped = out.slice(0, 200)
  }
  return merged
}

// The panel to open on. Never past a gate the learner hasn't answered (the
// episode would resume showing a branch they never picked) and never past the
// end of an episode that has since lost panels.
export function resumePanel(progress, panels) {
  const p = sanitizeProgress(progress)
  const list = Array.isArray(panels) ? panels : []
  if (list.length === 0) return 0
  return Math.max(0, Math.min(p.panel, revealLimit(list, p.choices), list.length - 1))
}

export function loadManhuaProgress(storyId) {
  return prefsGet(progressKey(storyId))
    .then(rec => (rec ? rec : prefsGet(legacyProgressKey(storyId))))
    .then(sanitizeProgress)
    .catch(() => ({ ...EMPTY_PROGRESS }))
}

// One write chain per story. The save below is a read-modify-write, and the
// reader fires them from more than one place (scroll position, an answered
// choice) — two in flight at once would both read the same `prev`, and the
// second merge would silently drop the first's accumulation. Chaining makes the
// sequence atomic in practice without a lock.
const writeChains = new Map()

// Read-modify-write rather than a blind merge: `tapped` and `choices` are
// accumulating collections, and prefsMerge would replace them wholesale.
export function saveManhuaProgress(storyId, patch) {
  const key = progressKey(storyId)
  const next = (writeChains.get(key) || Promise.resolve())
    .then(() => prefsGet(key))
    .then(prev => prefsMerge(key, mergeProgress(prev, patch)))
    .catch(() => undefined)
  writeChains.set(key, next)
  return next
}
