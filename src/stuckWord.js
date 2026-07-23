// Stuck-word help: a word that keeps lapsing is "stuck" and gets a coach sheet
// (a fresh angle) instead of the same flashcard again. Pure helpers, unit-tested.

import { toneOf } from './toneColor'

// A card counts as stuck once it has lapsed this many times. Drives both the
// Study "see it a different way" offer and the Profile "keeps slipping" panel
// (which imports this constant), so the two stay one set. Set to 3 so help
// surfaces while a word is still slipping, not only after it's badly stuck.
export const STUCK_LAPSES = 3

export function isStuck(card) {
  return !!(card && (card.lapses || 0) >= STUCK_LAPSES)
}

// How many times a learner can press Again on the SAME card within one study
// session before we offer the coach. FSRS `lapses` only climbs when a graduated
// (review) card is forgotten — it stays 0 while a new word is still in learning,
// no matter how many times Again is pressed. This in-session signal catches
// "I keep failing this right now", which is what a learner actually feels.
export const SESSION_AGAIN_LIMIT = 3

// Offer the coach when the card is historically stuck (lapses) OR the learner
// has pressed Again on it enough times this session. Called on an Again grade.
export function shouldOfferCoach(card, sessionAgainCount) {
  return isStuck(card) || (sessionAgainCount || 0) >= SESSION_AGAIN_LIMIT
}

// Pair each character of a Chinese word with its pinyin syllable + tone, for the
// coach's per-character breakdown. Like toneColor.splitHanziWithTones but keeps
// the syllable text too. When the syllable count doesn't match the character
// count (rare: erhua, proper nouns), extra characters get an empty pinyin and
// neutral tone rather than misaligning.
export function charBreakdown(word, reading) {
  const chars = [...(word || '')]
  const sylls = (reading || '').trim().split(/\s+/).filter(Boolean)
  return chars.map((char, i) => {
    const pinyin = i < sylls.length ? sylls[i] : ''
    return { char, pinyin, tone: pinyin ? toneOf(pinyin) : 5 }
  })
}
