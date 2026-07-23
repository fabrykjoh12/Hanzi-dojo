// Stuck-word help: a word that keeps lapsing is "stuck" and gets a coach sheet
// (a fresh angle) instead of the same flashcard again. Pure helpers, unit-tested.

import { toneOf } from './toneColor'

// A card counts as stuck at the same lapse threshold the Profile "keeps
// slipping" (leech) panel already uses, so the two are one set.
export const STUCK_LAPSES = 4

export function isStuck(card) {
  return !!(card && (card.lapses || 0) >= STUCK_LAPSES)
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
