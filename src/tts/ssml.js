// SSML construction for Azure Speech (and any future provider that speaks SSML).
//
// Everything that reaches the markup is escaped, including the pronunciation
// strings from the override table - overrides are operator-entered data, so
// they are treated as untrusted input exactly like story text is.
//
// Chinese pronunciation is pinned with Azure's SAPI phone set, which spells
// Mandarin as tone-numbered pinyin ("yin2 hang2"). We already produce that
// shape for Google's pinyin alphabet in src/pinyin.js; the only difference is
// the vowel u-umlaut, written "u:" for Google and "v" for Azure.

import { applyOverrides, overrideVersion } from './overrides.js'
import { supportsPhoneme } from './constants.js'
import { readingToPhonemes } from '../pinyin.js'

// XML escaping via string ops (this repo's parser is strict about regex
// literals). Applied to every value that lands in markup, attribute or text.
export function escapeSsml(value) {
  return String(value == null ? '' : value)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&apos;')
}

// Google's pinyin alphabet writes u-umlaut as "u:"; Azure's SAPI set writes it
// as "v" (lv4, nv3). Same syllables otherwise.
export function toAzurePinyin(phonemes) {
  if (!phonemes) return null
  return String(phonemes).split('u:').join('v')
}

// The phone string for one override. An explicit `provider_representation` wins
// (an operator has written exactly what the provider should receive); otherwise
// the tone-marked pinyin is converted. Returns null when neither is usable, and
// the caller then speaks the characters plainly rather than emitting broken
// markup - a slightly-wrong reading beats a rejected request.
export function overridePhones(override) {
  if (!override) return null
  if (override.provider_representation) return String(override.provider_representation).trim() || null
  const converted = readingToPhonemes(override.pinyin)
  return converted ? toAzurePinyin(converted) : null
}

// Azure's prosody rate accepts a signed percentage relative to the voice's
// default. 1.0 means "no change" and emits no prosody element at all, which
// keeps the common case's markup (and therefore its hash input) minimal.
export function ratePercent(speakingRate) {
  const pct = Math.round((Number(speakingRate) - 1) * 100)
  return (pct >= 0 ? '+' : '') + pct + '%'
}

// Build the inner body: text with each overridden span wrapped in a phoneme
// element. Returns { body, version } so the caller can hash exactly the set of
// overrides that actually applied.
export function buildSsmlBody(text, overrides, opts = {}) {
  // Where the provider rejects <phoneme> for this locale, no override can reach
  // the audio - so none is applied, and the reported version is 'none'. That
  // keeps the content hash honest: editing a pronunciation that cannot be
  // expressed must not mark audio stale and buy a re-render of the same sound.
  const canPin = opts.locale ? supportsPhoneme(opts.locale) : true
  const segments = canPin
    ? applyOverrides(text, overrides, opts)
    : [{ kind: 'text', text: String(text || '') }]
  const body = segments.map(seg => {
    if (seg.kind !== 'phoneme') return escapeSsml(seg.text)
    const ph = overridePhones(seg.override)
    if (!ph) return escapeSsml(seg.text)
    return '<phoneme alphabet="sapi" ph="' + escapeSsml(ph) + '">' + escapeSsml(seg.text) + '</phoneme>'
  }).join('')
  return { body, version: overrideVersion(segments) }
}

// The full document. `style` (Azure's mstts express-as) is optional and only
// emitted when asked for, so ordinary narration produces plain, portable SSML.
export function buildSsml({
  text,
  locale,
  voice,
  speakingRate = 1,
  overrides = [],
  context = null,
  style = null,
}) {
  const { body, version } = buildSsmlBody(text, overrides, { locale, context })

  let inner = body
  if (style) {
    inner = '<mstts:express-as style="' + escapeSsml(style) + '">' + inner + '</mstts:express-as>'
  }
  if (Number(speakingRate) !== 1) {
    inner = '<prosody rate="' + escapeSsml(ratePercent(speakingRate)) + '">' + inner + '</prosody>'
  }

  const ssml =
    '<speak version="1.0"'
    + ' xmlns="http://www.w3.org/2001/10/synthesis"'
    + ' xmlns:mstts="https://www.w3.org/2001/mstts"'
    + ' xml:lang="' + escapeSsml(locale) + '">'
    + '<voice name="' + escapeSsml(voice) + '">'
    + inner
    + '</voice>'
    + '</speak>'

  return { ssml, overrideVersion: version }
}
