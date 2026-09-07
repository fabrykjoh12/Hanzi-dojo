// Turn pasted text into a claim.
//
// The learner pastes whatever they have — an Anki CSV export, a Pleco list, a
// bare column of hanzi — and we scan it for words we already know. Because we
// look for known words rather than parsing structure, every source format works
// with no column-mapping step.
//
// The scan runs through the SAME matcher the story reader uses to decide what is
// tappable, so the guarantee is simple: if the reader would highlight it, the
// import will find it. That inherits Chinese greedy longest-match, Japanese
// ます-form / reading / kanji-stem resolution, and Russian inflection for free.

import { buildVocabMatcher, segmentLine, namesFor, particlesFor } from './storyReading'

// How many unrecognised lines to keep for the UI. Enough to see the shape of
// the problem — a typo, a whole file in the wrong script, a header row — while
// bounding what a 50,000-line paste can put in React state.
export const UNMATCHED_SAMPLE_LIMIT = 12

// Long lines are usually an export's whole row, not a word. Trim for display
// only; nothing downstream reads these.
const SAMPLE_MAX_CHARS = 60

// matchPastedText(text, vocabMap, language)
//   → { matchedIds, matchedCount, unmatchedLines, unmatchedSamples }
//
// `vocabMap` is word-keyed (word → vocab object), the same shape the reader and
// calculateStoryReadability already build. Ids come back in first-seen order,
// deduped. `unmatchedLines` counts non-blank lines that yielded no word.
//
// `unmatchedSamples` is the first few of those lines, verbatim (trimmed), and
// it is the point: the count alone told the learner a number and nothing else,
// so a typo, a header row and a paste in the wrong script all looked the same.
// The script case is not hypothetical — the vocabulary carries simplified only,
// and more than half of the HSK words are written differently in traditional,
// so a Taiwan or Hong Kong deck matches almost nothing and the count was the
// only clue.
export function matchPastedText(text, vocabMap = {}, language) {
  const matchedIds = []
  const seen = new Set()
  let unmatchedLines = 0
  const unmatchedSamples = []

  const lines = (text || '').split('\n')
  const matcher = buildVocabMatcher(vocabMap, language)
  const names = namesFor(language)
  const particles = particlesFor(language)

  lines.forEach(line => {
    if (!line.trim()) return
    let found = 0
    segmentLine(line, matcher, names, particles).forEach(token => {
      if (!token.vocab) return
      found += 1
      if (seen.has(token.vocab.id)) return
      seen.add(token.vocab.id)
      matchedIds.push(token.vocab.id)
    })
    if (found) return
    unmatchedLines += 1
    if (unmatchedSamples.length < UNMATCHED_SAMPLE_LIMIT) {
      const trimmed = line.trim()
      unmatchedSamples.push(trimmed.length > SAMPLE_MAX_CHARS
        ? trimmed.slice(0, SAMPLE_MAX_CHARS) + '…'
        : trimmed)
    }
  })

  return { matchedIds, matchedCount: matchedIds.length, unmatchedLines, unmatchedSamples }
}
