// "A fresh story every day" — a calm daily ritual: surface one story a day,
// picked from the stories the learner can actually read (unlocked tiers),
// preferring ones they haven't finished yet. Deterministic per calendar day so
// it's stable across reloads and never feels random within a day.
//
// Pure and side-effect-free (the date is passed in), so it's easy to test.

// A tiny stable string hash (djb2-ish). Deterministic — no Date/Math.random, so
// the same day + same pool always yields the same pick.
function hashStr(s) {
  let h = 0
  for (let i = 0; i < (s || '').length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// Stories in tiers the learner has unlocked (learnedCount ≥ the tier's minWords).
export function unlockedStories(stories, categories, learnedCount) {
  const minByTier = {}
  for (const c of (categories || [])) minByTier[c.tier] = c.minWords
  return (stories || []).filter(s => {
    const min = minByTier[s.tier]
    return min != null && (learnedCount || 0) >= min
  })
}

// The story of the day, or null when nothing is unlocked yet. Prefers unread
// stories; once every unlocked story is read, it rotates through them for a
// gentle re-read. The pick is stable for a given dateStr.
export function pickDailyStory({ stories, categories, learnedCount, readIds, dateStr }) {
  const pool = unlockedStories(stories, categories, learnedCount)
  if (pool.length === 0) return null
  const readSet = readIds instanceof Set ? readIds : new Set(readIds || [])
  const unread = pool.filter(s => !readSet.has(s.id))
  const bucket = unread.length > 0 ? unread : pool
  // Sort by id so the index is deterministic regardless of input ordering.
  const ordered = [...bucket].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const idx = hashStr(dateStr || '') % ordered.length
  return ordered[idx]
}
