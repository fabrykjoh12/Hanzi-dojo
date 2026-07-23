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

// matchPastedText(text, vocabMap, language)
//   → { matchedIds, matchedCount, unmatchedLines }
//
// `vocabMap` is word-keyed (word → vocab object), the same shape the reader and
// calculateStoryReadability already build. Ids come back in first-seen order,
// deduped. `unmatchedLines` counts non-blank lines that yielded no word, so the
// UI can say how much of the paste we did not recognise.
export function matchPastedText(text, vocabMap = {}, language) {
  const matchedIds = []
  const seen = new Set()
  let unmatchedLines = 0

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
    if (!found) unmatchedLines += 1
  })

  return { matchedIds, matchedCount: matchedIds.length, unmatchedLines }
}
