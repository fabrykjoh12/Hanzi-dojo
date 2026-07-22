// Typed synthesis requests.
//
// One place where a request is normalized, validated and turned into markup, so
// what gets hashed is provably what gets sent. Everything downstream - the
// provider, the storage path, the database row - is derived from the object
// this module returns.

import {
  VARIANTS,
  CONTENT_TYPES,
  DEFAULT_OUTPUT_FORMAT,
  MIN_SPEAKING_RATE,
  MAX_SPEAKING_RATE,
  SUPPORTED_LOCALES,
  KNOWN_VOICES,
  SYNTHESIS_CONFIG_VERSION,
} from './constants.js'
import { normalizeTtsText, assertSpeakableText, characterCount } from './normalize.js'
import { buildSsml } from './ssml.js'
import { TtsRequestError, TTS_ERROR_CODES } from './errors.js'

// Build and validate a request. Returns a frozen object carrying both the
// provider payload (`ssml`) and the hash inputs (`normalizedText`,
// `overrideVersion`, ...), because separating them is how they drift apart.
export function buildTtsRequest({
  text,
  locale,
  voice,
  speakingRate = 1,
  contentType,
  pronunciationOverrides = [],
  outputFormat = DEFAULT_OUTPUT_FORMAT,
  context = null,
  style = null,
  provider = 'azure',
}) {
  if (SUPPORTED_LOCALES.indexOf(locale) === -1) {
    throw new TtsRequestError('Unsupported locale "' + locale + '"', TTS_ERROR_CODES.UNSUPPORTED_LOCALE)
  }
  const known = KNOWN_VOICES[locale] || []
  if (!voice || (known.length && known.indexOf(voice) === -1)) {
    throw new TtsRequestError('Unsupported voice "' + voice + '" for ' + locale, TTS_ERROR_CODES.UNSUPPORTED_VOICE)
  }
  if (CONTENT_TYPES.indexOf(contentType) === -1) {
    throw new TtsRequestError('Unknown contentType "' + contentType + '"')
  }
  const rate = Number(speakingRate)
  if (!Number.isFinite(rate) || rate < MIN_SPEAKING_RATE || rate > MAX_SPEAKING_RATE) {
    throw new TtsRequestError(
      'speakingRate must be between ' + MIN_SPEAKING_RATE + ' and ' + MAX_SPEAKING_RATE + ', got ' + speakingRate
    )
  }

  const normalizedText = assertSpeakableText(normalizeTtsText(text))
  const { ssml, overrideVersion } = buildSsml({
    text: normalizedText, locale, voice, speakingRate: rate,
    overrides: pronunciationOverrides, context, style,
  })

  return Object.freeze({
    text: normalizedText,
    sourceText: String(text == null ? '' : text),
    normalizedText,
    locale,
    voice,
    speakingRate: rate,
    contentType,
    outputFormat,
    provider,
    style,
    context,
    ssml,
    overrideVersion,
    characterCount: characterCount(normalizedText),
    synthesisConfigVersion: SYNTHESIS_CONFIG_VERSION,
  })
}

// Same thing, addressed by the app's variant names instead of raw rate +
// contentType, so callers cannot pair "slow" with the wrong rate.
export function buildVariantRequest(variantKey, params) {
  const variant = VARIANTS[variantKey]
  if (!variant) throw new TtsRequestError('Unknown audio variant "' + variantKey + '"')
  return buildTtsRequest({
    ...params,
    contentType: params.contentType || variant.contentType,
    speakingRate: params.speakingRate == null ? variant.rate : params.speakingRate,
  })
}
