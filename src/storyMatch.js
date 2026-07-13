// Story matching for the post-study recap — "First Story Unlocked".
//
// Given the words a user studied this session and the current story library,
// pick the story that best turns those words into reading, and compute how much
// of it the user can already read. Pure and dependency-free so it can be unit
// tested without a browser or Supabase.
//
// Readability ("% known", which words are present, their status) comes from the
// single canonical calculateStoryReadability (storyReading.js) — the SAME
// computation the reader shows — so the recap's "you can read 76%" matches the
// reader exactly for the same user, story, cards, and language.

import { calculateStoryReadability } from './storyReading'

// Pick the story to surface in the recap, and compute the fallback nudge.
//
// Ranking among tier-unlocked, published stories: unread first, then the story
// containing the most of today's words, then the most readable (highest known
// %). This favors a story the user can both read AND meet today's words in.
//
// `language` selects the canonical readability's name/particle handling (Chinese
// proper names, Japanese particles) so the ranking uses the reader's true
// numbers. Returns a stable shape whether or not a story is available:
//   { story, knownPct, total, sessionWordsInStory, isRead,
//     wordsToUnlock, nextTierLabel }
export function pickRecapStory({
  stories = [],
  vocabMap = {},
  userCards = {},
  sessionWords = [],
  readIds = new Set(),
  learnedCount = 0,
  categories = [],
  language,
} = {}) {
  const minWordsByTier = {}
  categories.forEach(c => { minWordsByTier[c.tier] = c.minWords })
  const sessionSet = new Set(sessionWords)

  const scored = stories
    .filter(s => learnedCount >= (minWordsByTier[s.tier] ?? 0))
    .map(s => {
      const r = calculateStoryReadability({ content: s.content, vocabMap, cards: userCards, language })
      const hits = r.storyWords.filter(w => sessionSet.has(w))
      return {
        story: s,
        knownPct: r.knownPct,
        total: r.totalUnique,
        sessionWordsInStory: hits,
        isRead: readIds.has(s.id),
      }
    })

  scored.sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1
    if (b.sessionWordsInStory.length !== a.sessionWordsInStory.length) {
      return b.sessionWordsInStory.length - a.sessionWordsInStory.length
    }
    return b.knownPct - a.knownPct
  })

  const best = scored[0] || null

  // Fallback nudge: the nearest locked tier that actually has stories.
  const nextTier = categories
    .filter(c => learnedCount < c.minWords && stories.some(s => s.tier === c.tier))
    .sort((a, b) => a.minWords - b.minWords)[0] || null

  return {
    story: best ? best.story : null,
    knownPct: best ? best.knownPct : 0,
    total: best ? best.total : 0,
    sessionWordsInStory: best ? best.sessionWordsInStory : [],
    isRead: best ? best.isRead : false,
    wordsToUnlock: nextTier ? Math.max(0, nextTier.minWords - learnedCount) : null,
    nextTierLabel: nextTier ? nextTier.label : null,
  }
}
