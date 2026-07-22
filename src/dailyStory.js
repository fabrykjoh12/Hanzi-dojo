// "A fresh story every day" — a calm daily ritual: surface one story a day,
// picked from the stories the learner can actually read (unlocked tiers),
// preferring ones they haven't finished yet. Deterministic per calendar day so
// it's stable across reloads and never feels random within a day.
//
// The shelf is cumulative (every level up to the learner's current one), so a
// story is gated by the tiers of ITS OWN level. Callers pass `tiersFor(level)`
// and `learnedFor(level)` to express that; omitting them falls back to the flat
// `categories` + `learnedCount` pair, which is still correct for a single-level
// pool.
//
// Pure and side-effect-free (the date is passed in), so it's easy to test.

// A tiny stable string hash (djb2-ish). Deterministic — no Date/Math.random, so
// the same day + same pool always yields the same pick.
function hashStr(s) {
  let h = 0
  for (let i = 0; i < (s || '').length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// Stories in tiers the learner has unlocked (learned words ≥ the tier's
// minWords, both resolved for the story's own level).
export function unlockedStories(stories, categories, learnedCount, opts = {}) {
  const tiersFor = typeof opts.tiersFor === 'function' ? opts.tiersFor : null
  const learnedFor = typeof opts.learnedFor === 'function' ? opts.learnedFor : null
  return (stories || []).filter(s => {
    const cats = tiersFor ? tiersFor(s.level) : categories
    const cat = (cats || []).find(c => c.tier === s.tier)
    if (!cat) return false
    const learned = learnedFor ? learnedFor(s.level) : learnedCount
    return (learned || 0) >= cat.minWords
  })
}

// The story of the day, or null when nothing is unlocked yet. Prefers unread
// stories; once every unlocked story is read, it rotates through them for a
// gentle re-read. The pick is stable for a given dateStr.
export function pickDailyStory({ stories, categories, learnedCount, readIds, dateStr, tiersFor, learnedFor }) {
  const pool = unlockedStories(stories, categories, learnedCount, { tiersFor, learnedFor })
  if (pool.length === 0) return null
  const readSet = readIds instanceof Set ? readIds : new Set(readIds || [])
  const unread = pool.filter(s => !readSet.has(s.id))
  const bucket = unread.length > 0 ? unread : pool
  // Sort by id so the index is deterministic regardless of input ordering.
  const ordered = [...bucket].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const idx = hashStr(dateStr || '') % ordered.length
  return ordered[idx]
}
