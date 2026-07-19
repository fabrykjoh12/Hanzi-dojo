// Recent dictionary lookups — a small, self-contained convenience for the
// Dictionary screen: the last few words you opened, shown at the top when the
// search box is empty so you can jump back into them. Per-language, capped, and
// stored in localStorage. The `addRecent` core is pure and unit-tested; the
// storage wrappers degrade quietly if localStorage is unavailable (parity with
// prelogin.js).

export const RECENT_CAP = 8

// Pure core: return a new list with `entry` moved to the front, de-duplicated by
// id (a re-lookup bumps it up rather than adding a copy), and capped to `cap`.
// Entries without an id are ignored. Only the display fields are kept, so the
// stored blob stays tiny and serializable.
export function addRecent(list, entry, cap = RECENT_CAP) {
  const base = Array.isArray(list) ? list : []
  if (!entry || entry.id == null) return base.slice(0, Math.max(0, cap))
  const slim = {
    id: entry.id,
    word: entry.word || '',
    reading: entry.reading || '',
    meaning: entry.meaning || '',
    level: entry.level,
  }
  const deduped = base.filter(e => e && e.id !== slim.id)
  return [slim, ...deduped].slice(0, Math.max(0, cap))
}

function keyFor(language) {
  return 'dict:recent:' + (language || 'unknown')
}

export function readRecent(language) {
  try {
    const s = localStorage.getItem(keyFor(language))
    const parsed = s ? JSON.parse(s) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function saveRecent(language, list) {
  try { localStorage.setItem(keyFor(language), JSON.stringify(Array.isArray(list) ? list : [])) } catch { /* ignore */ }
}

export function clearRecent(language) {
  try { localStorage.removeItem(keyFor(language)) } catch { /* ignore */ }
}

// Convenience: read → addRecent → save, returning the new list so the caller can
// update state in one step.
export function recordRecent(language, entry, cap = RECENT_CAP) {
  const next = addRecent(readRecent(language), entry, cap)
  saveRecent(language, next)
  return next
}
