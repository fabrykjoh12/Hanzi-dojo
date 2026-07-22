// Text normalization for synthesis.
//
// Two jobs, and it is important they are the same function: what we HASH must
// be exactly what we SEND, or the cache lies (a trailing space would produce a
// new hash and a new paid request for identical audio). So callers normalize
// once, then hash and synthesize the same string.
//
// Pure - no I/O, no environment. Safe in the browser bundle.

import { MAX_TEXT_CHARS } from './constants.js'
import { TtsRequestError, TTS_ERROR_CODES } from './errors.js'

// Zero-width and bidi control characters. They are invisible, carry no sound,
// and silently change a hash if they survive a copy-paste from a source file.
const INVISIBLE = [
  '​', '‌', '‍', '‎', '‏',
  '‪', '‫', '‬', '‭', '‮',
  '﻿',
]

// Whitespace that should collapse to a single ASCII space. Includes the
// ideographic space U+3000, which appears in pasted Chinese text.
const SPACEY = ['\t', '\n', '\r', ' ', '　', ' ', ' ']

// A leading "Speaker:" / "Speaker：" label, exactly as the readers strip it, so
// narration speaks the line and not the character's name. Mirrors splitSpeaker
// in storyReading.js: only counts when the colon is within the first 6
// characters, so a mid-sentence colon is left alone.
export function stripSpeakerLabel(line) {
  const s = String(line || '')
  const full = s.indexOf('：')
  const ascii = s.indexOf(':')
  let idx = -1
  if (full > 0) idx = full
  if (idx < 0 && ascii > 0) idx = ascii
  if (idx > 0 && idx <= 6) return s.slice(idx + 1).trim()
  return s
}

// Canonical form of a string about to be spoken. Unicode-normalized (so text
// typed with compatibility codepoints hashes the same as the canonical form),
// invisible characters removed, all whitespace runs collapsed to one space,
// trimmed. Punctuation is deliberately KEPT - it is what gives a question its
// rising intonation and a comma its pause.
export function normalizeTtsText(raw) {
  let s = String(raw == null ? '' : raw)
  s = s.normalize('NFC')
  for (const ch of INVISIBLE) s = s.split(ch).join('')
  for (const ch of SPACEY) s = s.split(ch).join(' ')
  // Collapse runs of spaces with string ops rather than a regex - this repo's
  // OXC parser is strict about regex literals in app code.
  while (s.indexOf('  ') !== -1) s = s.split('  ').join(' ')
  return s.trim()
}

// True when a normalized string has nothing a voice could say. Chinese text has
// no spaces, so "has at least one non-punctuation character" is the useful test.
const PUNCT = '，。！？；：、,.!?;:…—-《》“”‘’"\'()（）[]【】'
export function isSpeakable(normalized) {
  const s = String(normalized || '')
  if (!s) return false
  for (const ch of s) {
    if (ch !== ' ' && PUNCT.indexOf(ch) === -1) return true
  }
  return false
}

// Characters billed by the provider. Azure meters the text content, so this is
// the number that belongs in a cost estimate and in the audit trail.
export function characterCount(normalized) {
  return Array.from(String(normalized || '')).length
}

// Throw a typed error rather than sending something we know will be rejected or
// will cost more than it should. Oversized text means content was not split.
export function assertSpeakableText(normalized) {
  if (!isSpeakable(normalized)) {
    throw new TtsRequestError('Nothing to speak: the text is empty or punctuation only')
  }
  const n = characterCount(normalized)
  if (n > MAX_TEXT_CHARS) {
    throw new TtsRequestError(
      'Text is ' + n + ' characters, over the ' + MAX_TEXT_CHARS + '-character limit for one request',
      TTS_ERROR_CODES.TEXT_TOO_LONG
    )
  }
  return normalized
}
