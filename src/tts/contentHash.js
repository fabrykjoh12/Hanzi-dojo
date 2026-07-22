// SERVER-ONLY. Imports node:crypto and must never be reached from browser code.
// Guarded by src/tts/serverOnly.test.js, which fails if a client module imports
// it (directly or through the client TTS helper).
//
// The content hash is the whole caching strategy in one value: if it matches,
// the stored audio is exactly what we would synthesize now, so we skip the paid
// request. That only holds if EVERY input that can change the audio is in the
// hash - miss one, and a voice change silently serves the old recording forever.

import { createHash } from 'node:crypto'
import { SYNTHESIS_CONFIG_VERSION } from './constants.js'

// The canonical pre-image. Written as ordered `key=value` lines rather than
// JSON so it is human-readable in a debug log and cannot change shape because a
// serializer reordered keys. Order and key names are part of the contract:
// changing either invalidates every existing hash, so bump
// SYNTHESIS_CONFIG_VERSION deliberately when you do.
export function buildHashInput({
  normalizedText,
  locale,
  provider,
  voice,
  speakingRate,
  overrideVersion,
  outputFormat,
  contentType,
  synthesisConfigVersion = SYNTHESIS_CONFIG_VERSION,
}) {
  const missing = []
  if (!normalizedText) missing.push('normalizedText')
  if (!locale) missing.push('locale')
  if (!provider) missing.push('provider')
  if (!voice) missing.push('voice')
  if (!outputFormat) missing.push('outputFormat')
  if (!contentType) missing.push('contentType')
  if (missing.length) {
    throw new Error('Cannot hash TTS content, missing: ' + missing.join(', '))
  }

  // Fixed 2-decimal rate so 0.8 and 0.80 are one cache entry, not two.
  const rate = Number(speakingRate).toFixed(2)

  return [
    'v=' + synthesisConfigVersion,
    'provider=' + provider,
    'locale=' + locale,
    'voice=' + voice,
    'contentType=' + contentType,
    'rate=' + rate,
    'format=' + outputFormat,
    'overrides=' + (overrideVersion || 'none'),
    'text=' + normalizedText,
  ].join('\n')
}

export function sha256Hex(input) {
  return createHash('sha256').update(String(input), 'utf8').digest('hex')
}

// Full hash for a synthesis request.
export function contentHashFor(parts) {
  return sha256Hex(buildHashInput(parts))
}

// Has anything that affects the audio changed since this row was generated?
// A row with no hash at all counts as stale, which is what makes legacy
// Google-generated audio eligible for regeneration without a data migration.
export function isStale(record, expectedHash) {
  if (!record) return true
  if (!record.content_hash) return true
  return record.content_hash !== expectedHash
}
