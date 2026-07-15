import { isRecallMatch } from './utils'
import { lenientPinyin } from './testLogic'
import { toRomaji } from 'wanakana'

// Pure answer-matching helpers for the writing practice drill (Writing.jsx).
// Extracted into their own module so Writing.jsx can stay a components-only
// file (react-refresh) while these stay unit-testable.

function stripChars(value, chars) {
  let output = ''
  const source = value || ''
  for (let i = 0; i < source.length; i += 1) {
    if (!chars.includes(source[i])) output += source[i]
  }
  return output
}

// One lenient pinyin normalization shared with Study's typed mode (testLogic).
function normalizeChinesePinyin(value) {
  return lenientPinyin(value)
}

// Drop a leading article / infinitive marker so "to run", "a dog", "the sun"
// all match a bare "run" / "dog" / "sun". Word-boundary aware (needs the space).
function stripLead(value) {
  const leads = ['to ', 'a ', 'an ', 'the ']
  let s = value
  for (let i = 0; i < leads.length; i += 1) {
    if (s.startsWith(leads[i])) return s.slice(leads[i].length)
  }
  return s
}

function normalizeEnglish(value) {
  const lowered = stripLead((value || '').toLowerCase().trim())
  return stripChars(lowered, '。、「」，,.!?！？;:\'"()-_ ')
}

function stripParentheses(value) {
  const source = value || ''
  let output = ''
  let depth = 0
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '(') {
      depth += 1
    } else if (ch === ')') {
      if (depth > 0) depth -= 1
    } else if (depth === 0) {
      output += ch
    }
  }
  return output
}

function isMeaningMatch(input, meaning) {
  const normalizedInput = normalizeEnglish(input)
  if (!normalizedInput) return false

  const withoutParens = stripParentheses(meaning)

  const variants = withoutParens
    .split(',')
    .flatMap(part => part.split(';'))
    .flatMap(part => part.split('/'))
    .flatMap(part => part.split(' or '))
    .map(part => normalizeEnglish(part))
    .filter(Boolean)

  return normalizeEnglish(withoutParens) === normalizedInput || variants.includes(normalizedInput)
}

export function normalizeRomaji(value) {
  // Ignore the separators people sprinkle through romaji — spaces, the
  // syllable apostrophe (kon'nichiwa), and hyphens — plus any sentence
  // punctuation, so a stored phrase like いただきます。 (romaji "itadakimasu.")
  // still matches a typed "itadakimasu". wanakana emits none of these, so this
  // only ever accepts more.
  return stripChars((value || '').toLowerCase().trim(), ' \'’‘-.。、，,!！?？')
}

export function hasKanji(str) {
  const value = str || ''
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code >= 0x4e00 && code <= 0x9faf) return true
  }
  return false
}

export function isWritingMatch(input, vocab, direction, isJapanese) {
  if (direction === 'to_english') return isMeaningMatch(input, vocab.meaning)

  const word = (vocab.word || '').replace('。', '')
  if (isRecallMatch(input, word)) return true

  if (isJapanese) {
    if (isRecallMatch(input, vocab.reading)) return true
    const reading = vocab.reading || ''
    const expectedRomaji = normalizeRomaji(toRomaji(reading))
    // Convert the INPUT through toRomaji too, so typing katakana for a word
    // stored with a hiragana reading (or vice versa) also matches — romaji
    // passes through toRomaji unchanged.
    const inputRomaji = normalizeRomaji(toRomaji(input))
    return inputRomaji.length > 0 && inputRomaji === expectedRomaji
  }

  const normalizedInput = normalizeChinesePinyin(input)
  return [vocab.reading_plain, vocab.reading]
    .filter(Boolean)
    .some(reading => normalizedInput === normalizeChinesePinyin(reading))
}
