// Story tier definitions (unlock thresholds + labels), shared by the Stories
// screen and the post-study recap's story matcher. Kept in its own tiny module
// so importing the config doesn't drag the heavy Stories/reader chunk into
// other screens.
//
// Tier 1 is unlocked from day one (minWords 0) so a brand-new learner can start
// reading immediately — every word is tappable and addable to their deck, which
// is itself a gentle way to learn. Later tiers gate on learned-word count.

export const CATEGORIES_CHINESE = [
  { tier: 1, minWords: 0,   label: 'First Steps', wordRange: '1–100', description: 'Short stories from the most common words at your level.' },
  { tier: 2, minWords: 100, label: 'Growing',     wordRange: '1–200', description: 'Stories that bring in more of your level’s vocabulary.' },
  { tier: 3, minWords: 200, label: 'Fluent',      wordRange: '1–300', description: 'Stories that use your level’s full word list.' },
]

export const CATEGORIES_JAPANESE = [
  { tier: 1, minWords: 0,   label: 'First Steps', wordRange: '1–100', description: 'Short stories from the most common words at your level.' },
  { tier: 2, minWords: 100, label: 'Growing',     wordRange: '1–200', description: 'Stories that bring in more of your level’s vocabulary.' },
  { tier: 3, minWords: 200, label: 'Fluent',      wordRange: '1–400', description: 'Stories that use your level’s full word list.' },
]

export const CATEGORIES_RUSSIAN = [
  { tier: 1, minWords: 0,   label: 'First Steps', wordRange: '1–50',  description: 'Short stories from the most common words at your level.' },
  { tier: 2, minWords: 50,  label: 'Growing',     wordRange: '1–100', description: 'Stories that bring in more of your level’s vocabulary.' },
  { tier: 3, minWords: 100, label: 'Fluent',      wordRange: 'all',   description: 'Stories that use your level’s full word list.' },
]

export const CATEGORIES_BY_LANGUAGE = {
  chinese: CATEGORIES_CHINESE,
  japanese: CATEGORIES_JAPANESE,
  russian: CATEGORIES_RUSSIAN,
}

// The next tier the learner hasn't unlocked yet that actually has stories
// waiting, plus how many more learned words unlock it. Pure and tested — the
// reader uses it to turn "you've read everything you can" into a concrete
// "learn N more to unlock the next story" nudge instead of a dead end.
//
// `tiersWithStories` is the set of tier numbers that have published stories, so
// a locked-but-empty tier never becomes a nudge that leads nowhere. Returns null
// when every tier that has stories is already unlocked (nothing left to aim at).
export function nextLockedTier(categories, learnedCount, tiersWithStories) {
  if (!Array.isArray(categories)) return null
  const has = tiersWithStories instanceof Set ? tiersWithStories : new Set(tiersWithStories || [])
  const learned = Math.max(0, learnedCount || 0)
  const locked = categories
    .filter(c => learned < c.minWords && has.has(c.tier))
    .sort((a, b) => a.minWords - b.minWords)
  if (locked.length === 0) return null
  const t = locked[0]
  return {
    tier: t.tier,
    label: t.label,
    wordRange: t.wordRange,
    remaining: Math.max(1, t.minWords - learned),
  }
}
