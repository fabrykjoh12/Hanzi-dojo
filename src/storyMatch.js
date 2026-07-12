// Story matching for the post-study recap — "First Story Unlocked".
//
// Given the words a user studied this session and the current story library,
// pick the story that best turns those words into reading, and compute how much
// of it the user can already read. Pure and dependency-free so it can be unit
// tested without a browser or Supabase.
//
// The "% known" and word-status rules deliberately MIRROR the story reader
// (StoryReaderImmersive): a word counts as "known" when its card is easy
// (mastered) or has reached the review state; anything with a card but not yet
// there is "learning"; a word with no card is "new". Keeping the two in sync
// means the recap's "you can read 76%" matches what the reader then shows.

const EMPTY_SET = new Set()

// Card → coarse reading status. Mirrors the reader's wordStatus buckets
// collapsed to the three the recap cares about.
export function wordKnownStatus(card) {
  if (!card) return 'new'
  if (card.is_easy || card.state === 'review') return 'known'
  return 'learning'
}

// Greedy longest-match scan for the distinct vocabulary WORDS that appear in a
// story's text. This is the reader's `segmentLine` vocab-matching pass without
// the Intl.Segmenter step (we only need which vocab words occur, not the runs
// between them). Single-character particles are excluded to match the reader.
export function findStoryVocab(content, vocabMap, particles = EMPTY_SET, maxLen = 6) {
  const text = content || ''
  const isVocab = (cand) => Boolean(vocabMap[cand]) && !(cand.length === 1 && particles.has(cand))
  const found = new Set()
  let i = 0
  while (i < text.length) {
    let matched = null
    const max = Math.min(maxLen, text.length - i)
    for (let len = max; len >= 1; len -= 1) {
      const cand = text.slice(i, i + len)
      if (isVocab(cand)) { matched = cand; break }
    }
    if (matched) { found.add(matched); i += matched.length }
    else i += 1
  }
  return found
}

// Readability of one story for one user: how many of its vocab words are known
// / learning / new, and the known percentage. `words` maps each found vocab
// word → its status so callers can intersect with today's session words.
export function storyReadability(content, vocabMap, userCards, particles = EMPTY_SET) {
  const words = findStoryVocab(content, vocabMap, particles)
  const byWord = new Map()
  let known = 0, learning = 0, fresh = 0
  words.forEach(w => {
    const v = vocabMap[w]
    const st = wordKnownStatus(userCards[v.id])
    byWord.set(w, st)
    if (st === 'known') known += 1
    else if (st === 'learning') learning += 1
    else fresh += 1
  })
  const total = words.size
  return {
    total,
    known,
    learning,
    new: fresh,
    knownPct: total ? Math.round((known / total) * 100) : 0,
    words: byWord,
  }
}

// Pick the story to surface in the recap, and compute the fallback nudge.
//
// Ranking among tier-unlocked, published stories: unread first, then the story
// containing the most of today's words, then the most readable (highest known
// %). This favors a story the user can both read AND meet today's words in.
//
// Returns a stable shape whether or not a story is available:
//   { story, knownPct, total, sessionWordsInStory, isRead,
//     wordsToUnlock, nextTierLabel }
// `story` is null when no unlocked story exists; `wordsToUnlock`/`nextTierLabel`
// describe the nearest locked tier that has stories (the "learn N more" nudge).
export function pickRecapStory({
  stories = [],
  vocabMap = {},
  userCards = {},
  sessionWords = [],
  readIds = new Set(),
  learnedCount = 0,
  categories = [],
  particles = EMPTY_SET,
} = {}) {
  const minWordsByTier = {}
  categories.forEach(c => { minWordsByTier[c.tier] = c.minWords })
  const sessionSet = new Set(sessionWords)

  const scored = stories
    .filter(s => learnedCount >= (minWordsByTier[s.tier] ?? 0))
    .map(s => {
      const r = storyReadability(s.content, vocabMap, userCards, particles)
      const hits = []
      r.words.forEach((_st, w) => { if (sessionSet.has(w)) hits.push(w) })
      return {
        story: s,
        knownPct: r.knownPct,
        total: r.total,
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
