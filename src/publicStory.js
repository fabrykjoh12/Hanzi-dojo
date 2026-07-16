// Pure logic for the public (signed-out) story page. Kept separate from the
// PublicStory component so the percentage math — the one correctness-critical
// part — is unit-tested in the node test environment.
//
// The percentage is computed by the app's canonical calculateStoryReadability
// (storyReading.js). That function reads a "cards" map (vocabId → card) and
// treats state:'review' as a known word. For a signed-out visitor we don't
// have real cards, so we synthesize one from the level chip they pick.

export const BEGINNER_WORD_CAP = 50

// Displayed in order. `key` drives assumedKnownCards; `label` is the chip text.
export const LEVEL_CHOICES = [
  { key: 'beginner', label: 'Just starting' },
  { key: 'some', label: 'Some' },
  { key: 'lots', label: 'Quite a bit' },
]

// Mirror the reader's vocab map: word → full vocab row (storyReading matches
// against words, and each match carries the row's id for status lookup).
export function buildVocabMap(vocabPool) {
  const map = {}
  ;(vocabPool || []).forEach(v => { map[v.word] = v })
  return map
}

// Synthesize the "known" deck for an assumed level. Every returned entry reads
// back as a known ('review') word via storyReading's wordStatus:
//   beginner — the most frequent ~50 words of level 1 (a true first-timer)
//   some     — all of level 1
//   lots     — everything at or below the story's own level (cumulative model)
export function assumedKnownCards(vocabPool, choice, storyLevel) {
  const cards = {}
  ;(vocabPool || []).forEach(v => {
    let known = false
    if (choice === 'lots') known = v.level <= storyLevel
    else if (choice === 'some') known = v.level === 1
    else known = v.level === 1 && v.sort_order <= BEGINNER_WORD_CAP
    if (known) cards[v.id] = { state: 'review' }
  })
  return cards
}

// The first n non-empty lines — the taste rendered before the signup gate.
export function teaserLines(content, n = 4) {
  return (content || '').split('\n').filter(Boolean).slice(0, n)
}
