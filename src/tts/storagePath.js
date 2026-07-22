// Where a generated clip lives in the audio bucket.
//
// Content-addressed: the file name IS the content hash, so identical inputs
// resolve to the same object and re-uploading is a no-op rather than a
// duplicate. Regenerating after a text edit writes a NEW path and leaves the
// old file untouched until an explicit cleanup, which means a deploy can never
// catch a learner mid-play with a half-replaced file.
//
// Pure and client-safe - the browser builds the same path to fetch audio.

import { OUTPUT_FORMAT_EXTENSION } from './constants.js'

// Anything that could escape the intended prefix or produce an unusable object
// key. Storage keys come from our own enums and a hex hash, so this is a
// belt-and-braces guard against a future caller passing user input.
function safeSegment(value, label) {
  const s = String(value == null ? '' : value).trim()
  if (!s) throw new Error('Storage path segment "' + label + '" is empty')
  for (const ch of s) {
    const ok = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
      || (ch >= '0' && ch <= '9') || ch === '-' || ch === '_'
    if (!ok) throw new Error('Storage path segment "' + label + '" has an unsafe character: ' + ch)
  }
  return s
}

// tts/{locale}/{sourceType}/{sourceId}/{variant}/{contentHash}.mp3
export function ttsStoragePath({ locale, sourceType, sourceId, variant, contentHash }) {
  return [
    'tts',
    safeSegment(locale, 'locale'),
    safeSegment(sourceType, 'sourceType'),
    safeSegment(sourceId, 'sourceId'),
    safeSegment(variant, 'variant'),
    safeSegment(contentHash, 'contentHash') + '.' + OUTPUT_FORMAT_EXTENSION,
  ].join('/')
}

// The prefix holding every generation of one variant. Cleanup lists this and
// deletes everything that is not the current hash.
export function ttsVariantPrefix({ locale, sourceType, sourceId, variant }) {
  return [
    'tts',
    safeSegment(locale, 'locale'),
    safeSegment(sourceType, 'sourceType'),
    safeSegment(sourceId, 'sourceId'),
    safeSegment(variant, 'variant'),
  ].join('/')
}
