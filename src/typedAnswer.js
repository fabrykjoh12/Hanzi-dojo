import { lenientPinyin } from './testLogic'
import { toRomaji } from 'wanakana'

// Does the typed input match the card's reading (or the word itself)?
// Japanese accepts romaji or kana; Chinese accepts tone-insensitive pinyin.
//
// Lifted verbatim from Study.jsx (was `checkTyped`) so the matching rules are
// isolated and testable. Signature is unchanged — (input, vocab, isJapanese) —
// to keep the behavior byte-for-byte identical at the call site.
export function checkTypedAnswer(input, v, isJapanese) {
  const t = (input || '').trim().toLowerCase()
  if (!t) return false
  if (t === (v.word || '').toLowerCase()) return true
  const reading = v.reading || ''
  if (t === reading.toLowerCase()) return true
  if (isJapanese) {
    const norm = s => (toRomaji(s || '') || '').toLowerCase().split(' ').join('')
    const target = norm(reading)
    return target !== '' && norm(input) === target
  }
  // Chinese: tone-mark AND tone-number insensitive, punctuation/space tolerant —
  // "hai", "hǎi", "hai3" are all the same answer. Both stored forms accepted.
  const typed = lenientPinyin(input)
  if (!typed) return false
  return [v.reading_plain, reading]
    .filter(Boolean)
    .some(r => lenientPinyin(r) === typed)
}
