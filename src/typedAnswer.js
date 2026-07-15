import { lenientPinyin } from './testLogic'
import { toRomaji } from 'wanakana'
import { normalizeVocabForm, expandParenVariants } from './storyReading'

// Common Japanese words with more than one everyday reading. The stored card
// carries a single reading (何 → なん), but a learner typing the other standard
// reading (なに) is not wrong — all listed forms are accepted. Keys are the
// stored word after normalizeVocabForm; missing entries just mean "stored
// reading only".
export const JA_ALT_READINGS = {
  '何': ['なん', 'なに'],
  '水': ['みず', 'すい'],
  '四': ['よん', 'し'],
  '七': ['なな', 'しち'],
  '九': ['きゅう', 'く'],
  '日': ['にち', 'ひ'],
  '一日': ['いちにち', 'ついたち'],
  '月': ['つき', 'がつ', 'げつ'],
  '時': ['とき', 'じ'],
  '人': ['ひと', 'にん', 'じん'],
  '国': ['くに', 'こく'],
  '車': ['くるま', 'しゃ'],
  '山': ['やま', 'さん'],
  '中': ['なか', 'ちゅう'],
  '外': ['そと', 'がい'],
  '上': ['うえ', 'じょう'],
  '下': ['した', 'か'],
  '前': ['まえ', 'ぜん'],
  '明日': ['あした', 'あす'],
  '昨日': ['きのう', 'さくじつ'],
  '今日': ['きょう', 'こんにち'],
  '木': ['き', 'もく'],
  '金': ['かね', 'きん'],
  '火': ['ひ', 'か'],
  '土': ['つち', 'ど'],
}

// Does the typed input match the card's reading (or the word itself)?
// Japanese accepts romaji or kana; Chinese accepts tone-insensitive pinyin.
//
// Acceptance is deliberately lenient about how vocab is STORED, not about what
// the learner knows: stored forms carry decorations the learner shouldn't have
// to type — trailing 。 on phrases (すみません。), ～ placeholders (この～),
// optional parts in parens (後(で)) — so every stored form is expanded into its
// plain variants (後で and 後 both pass). Japanese words with several standard
// readings (何 = なん/なに, 水 = みず/すい) accept any of them via JA_ALT_READINGS.
export function checkTypedAnswer(input, v, isJapanese) {
  const t = (input || '').trim().toLowerCase()
  if (!t) return false

  // Every spelling this card accepts: stored word + reading, their
  // decoration-free variants, and any alternate readings.
  const accepted = new Set()
  const addForms = (s) => {
    if (!s) return
    accepted.add(String(s))
    expandParenVariants(normalizeVocabForm(s)).forEach(f => { if (f) accepted.add(f) })
  }
  addForms(v.word)
  addForms(v.reading)
  if (isJapanese) {
    (JA_ALT_READINGS[normalizeVocabForm(v.word || '')] || []).forEach(addForms)
  }

  // Exact (case-insensitive) match against any accepted form, with the typed
  // input's own trailing punctuation ignored too.
  const typedPlain = normalizeVocabForm(input).toLowerCase()
  for (const a of accepted) {
    const al = a.toLowerCase()
    if (t === al || typedPlain === al) return true
  }

  if (isJapanese) {
    // Romaji comparison: kana→romaji both sides, spaces dropped.
    const norm = s => (toRomaji(s || '') || '').toLowerCase().split(' ').join('')
    const typed = norm(normalizeVocabForm(input))
    if (!typed) return false
    return [...accepted].some(a => {
      const target = norm(a)
      return target !== '' && typed === target
    })
  }

  // Chinese: tone-mark AND tone-number insensitive, punctuation/space tolerant —
  // "hai", "hǎi", "hai3" are all the same answer. Both stored forms accepted.
  const typed = lenientPinyin(input)
  if (!typed) return false
  return [v.reading_plain, v.reading]
    .filter(Boolean)
    .some(r => lenientPinyin(r) === typed)
}
