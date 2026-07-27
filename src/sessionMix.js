// What a study session is actually made of, right now.
//
// The old header measured one flat thing — "1 of 26" over a grey rail that is
// empty on the first card and so reads as dead space. A session isn't flat:
// it's new words, cards still in learning, and reviews that came due. Those
// three feel completely different to study, and Home already names them in
// exactly that order (New / Learning / Due), so the study header names them the
// same way instead of averaging them into one number.
//
// Pure: takes the live queue (remaining cards) plus how many have been graded,
// and returns the counts and the rail geometry. No React, no Supabase.

// Legend order — matches Home's queue breakdown.
export const MIX_KEYS = ['new', 'learning', 'due']

export const MIX_LABELS = { new: 'New', learning: 'Learning', due: 'Due' }

// Which band a card belongs to. Anything that isn't new or mid-learning is a
// review that came due — including the `is_easy` / no-state rows older code
// wrote, which must land somewhere rather than vanish from the total.
export function mixKey(card) {
  const state = card && card.state
  if (state === 'new') return 'new'
  if (state === 'learning' || state === 'relearning') return 'learning'
  return 'due'
}

// The card's own status colours — the 3px line drawn across the top of the
// flashcard. The rail reuses them so a band and the card it will become are
// the same colour, rather than two unrelated vocabularies for one fact. These
// live here, not in Study.jsx, so there is one definition of them.
export const TONE_NEW = '#7FA0B5'
export const TONE_DUE = '#E4DCCB'
// The card marker has no learning colour of its own — a learning card wears the
// review marker, because the front of a card must never hint that a word is one
// you keep failing. The rail is a session summary, not a hint about the card in
// front of you, so it can name learning: the midpoint of the walk from
// first-time to review, which is exactly what a learning card is.
export const TONE_LEARNING = 'color-mix(in srgb, ' + TONE_NEW + ' 50%, ' + TONE_DUE + ')'

const TONES = { new: TONE_NEW, learning: TONE_LEARNING, due: TONE_DUE }

// Completed work is the one band that isn't a card state, so it keeps the
// language accent: the strongest mark on the rail, and the edge where it meets
// the muted card tones is the progress frontier you read at a glance.
export function bandTone(accentHex, key) {
  if (key === 'done') return accentHex
  return TONES[key] || TONES.due
}

// counts = what is LEFT (the queue), done = what has been graded this session.
// The denominator is done + remaining rather than a fixed estimate, so an
// Again-graded card re-entering the queue widens the rail honestly instead of
// silently overflowing it.
export function sessionMix(queue, studied) {
  const counts = { new: 0, learning: 0, due: 0 }
  for (const card of queue || []) counts[mixKey(card)] += 1

  const remaining = counts.new + counts.learning + counts.due
  const done = Math.max(0, studied || 0)
  const total = done + remaining
  const share = n => (total > 0 ? (n / total) * 100 : 0)

  return {
    counts,
    remaining,
    done,
    total,
    // Left to right: work finished, then what remains, grouped by kind. Zero
    // segments are kept in the list (callers drop them) so the shape is stable.
    segments: [
      { key: 'done', count: done, pct: share(done) },
      { key: 'new', count: counts.new, pct: share(counts.new) },
      { key: 'learning', count: counts.learning, pct: share(counts.learning) },
      { key: 'due', count: counts.due, pct: share(counts.due) },
    ],
  }
}
