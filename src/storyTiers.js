// Story tier definitions (unlock thresholds + labels), shared by the Stories
// screen and the post-study recap's story matcher. Kept in its own tiny module
// so importing the config doesn't drag the heavy Stories/reader chunk into
// other screens.
//
// Tier 1 is unlocked from day one (minWords 0) so a brand-new learner can start
// reading immediately — every word is tappable and addable to their deck, which
// is itself a gentle way to learn. Later tiers gate on learned-word count.

export const CATEGORIES_CHINESE = [
  { tier: 1, minWords: 0,   label: 'First Steps', wordRange: '1–100', description: 'Stories using the first 100 most common HSK 1 words' },
  { tier: 2, minWords: 100, label: 'Growing',     wordRange: '1–200', description: 'Stories using the first 200 most common HSK 1 words' },
  { tier: 3, minWords: 200, label: 'Fluent',      wordRange: '1–300', description: 'All 300 HSK 1 words in use' },
]

export const CATEGORIES_JAPANESE = [
  { tier: 1, minWords: 0,   label: 'First Steps', wordRange: '1–100', description: 'Stories using the first 100 most common JLPT N5 words' },
  { tier: 2, minWords: 100, label: 'Growing',     wordRange: '1–200', description: 'Stories using the first 200 most common JLPT N5 words' },
  { tier: 3, minWords: 200, label: 'Fluent',      wordRange: '1–400', description: 'All 400 N5 Part 1 words in use' },
]

export const CATEGORIES_RUSSIAN = [
  { tier: 1, minWords: 0,   label: 'First Steps', wordRange: '1–50',  description: 'Stories using the first 50 most common A1 words' },
  { tier: 2, minWords: 50,  label: 'Growing',     wordRange: '1–100', description: 'Stories using the first 100 most common A1 words' },
  { tier: 3, minWords: 100, label: 'Fluent',      wordRange: 'all',   description: 'The full A1 starter deck in use' },
]

export const CATEGORIES_BY_LANGUAGE = {
  chinese: CATEGORIES_CHINESE,
  japanese: CATEGORIES_JAPANESE,
  russian: CATEGORIES_RUSSIAN,
}
