// Environment validation for the TTS pipeline.
//
// Takes the environment as an ARGUMENT rather than reading the process
// environment itself. That is the security boundary: nothing under src/ can
// reach a credential on its own, so no amount of accidental importing can pull
// a key into the browser bundle. Only the root CLI reads the environment and
// passes it in - a rule enforced by serverOnly.test.js, which fails if any file
// under src/ so much as names the process environment object.
//
// Fails fast and loudly on a bad configuration - the alternative is discovering
// a typo after a few hundred paid requests have been rejected.

import { TtsConfigError } from './errors.js'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, DEFAULT_VOICES, KNOWN_VOICES } from './constants.js'

export const PROVIDERS = ['azure', 'mock']

export const DEFAULT_TIMEOUT_MS = 20000
export const DEFAULT_MAX_RETRIES = 3
export const DEFAULT_CONCURRENCY = 3
// A ceiling rather than a preference: Azure throttles per-region, and a wide
// fan-out just converts throughput into 429s and wasted retries.
export const MAX_CONCURRENCY = 8

function requireString(env, name) {
  const v = env[name]
  if (typeof v !== 'string' || !v.trim()) {
    throw new TtsConfigError('Missing required environment variable ' + name)
  }
  return v.trim()
}

// Azure regions are lowercase alphanumerics ("westeurope", "eastus2"). Checked
// because the region is interpolated into the endpoint host, so a stray
// character there produces a confusing DNS failure instead of a clear message.
function validRegion(region) {
  for (const ch of region) {
    const ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')
    if (!ok) return false
  }
  return region.length > 0
}

function pickVoice(env, name, fallback, locale) {
  const raw = env[name]
  const voice = (typeof raw === 'string' && raw.trim()) ? raw.trim() : fallback
  const known = KNOWN_VOICES[locale] || []
  if (known.length && known.indexOf(voice) === -1) {
    throw new TtsConfigError(
      'Voice "' + voice + '" (' + name + ') is not a known ' + locale + ' voice. Known voices: ' + known.join(', ')
    )
  }
  return voice
}

function positiveInt(env, name, fallback, { max = null } = {}) {
  const raw = env[name]
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
    throw new TtsConfigError(name + ' must be a positive whole number, got "' + raw + '"')
  }
  if (max != null && n > max) {
    throw new TtsConfigError(name + ' must be at most ' + max + ', got ' + n)
  }
  return n
}

// Resolve and validate the whole TTS configuration.
//
// `requireCredentials: false` is for dry runs and tests: everything is checked
// except the Azure key, so an operator can plan a batch on a machine that has
// no credentials at all.
export function validateTtsEnv(env = {}, { requireCredentials = true } = {}) {
  const provider = (env.TTS_DEFAULT_PROVIDER || 'azure').trim()
  if (PROVIDERS.indexOf(provider) === -1) {
    throw new TtsConfigError('TTS_DEFAULT_PROVIDER must be one of ' + PROVIDERS.join(', ') + ', got "' + provider + '"')
  }

  const locale = (env.TTS_DEFAULT_LOCALE || DEFAULT_LOCALE).trim()
  if (SUPPORTED_LOCALES.indexOf(locale) === -1) {
    throw new TtsConfigError('TTS_DEFAULT_LOCALE "' + locale + '" is not supported. Supported: ' + SUPPORTED_LOCALES.join(', '))
  }

  const voices = {
    flashcard: pickVoice(env, 'TTS_FLASHCARD_VOICE', DEFAULT_VOICES.flashcard, locale),
    story: pickVoice(env, 'TTS_STORY_VOICE', DEFAULT_VOICES.story, locale),
    male: pickVoice(env, 'TTS_MALE_VOICE', DEFAULT_VOICES.male, locale),
  }

  let azure = null
  if (provider === 'azure') {
    const region = (env.AZURE_SPEECH_REGION || '').trim()
    if (requireCredentials || region) {
      if (!region) throw new TtsConfigError('Missing required environment variable AZURE_SPEECH_REGION')
      if (!validRegion(region)) {
        throw new TtsConfigError('AZURE_SPEECH_REGION must be lowercase alphanumeric (e.g. "westeurope")')
      }
    }
    const key = requireCredentials ? requireString(env, 'AZURE_SPEECH_KEY') : (env.AZURE_SPEECH_KEY || '').trim()
    azure = { key: key || null, region: region || null }
  }

  return Object.freeze({
    provider,
    locale,
    voices: Object.freeze(voices),
    azure: azure ? Object.freeze(azure) : null,
    timeoutMs: positiveInt(env, 'TTS_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    maxRetries: positiveInt(env, 'TTS_MAX_RETRIES', DEFAULT_MAX_RETRIES, { max: 10 }),
    concurrency: positiveInt(env, 'TTS_CONCURRENCY', DEFAULT_CONCURRENCY, { max: MAX_CONCURRENCY }),
  })
}

// A configuration summary safe to print in CI logs and operator output. The
// credential is reduced to its presence and length - enough to diagnose "the
// secret is empty" or "the secret has a trailing newline", and useless to
// anyone reading the log.
export function describeConfig(config) {
  const keyLen = config && config.azure && config.azure.key ? String(config.azure.key).length : 0
  return {
    provider: config.provider,
    locale: config.locale,
    voices: { ...config.voices },
    azureRegion: config.azure ? config.azure.region : null,
    azureKey: keyLen ? 'set (' + keyLen + ' chars)' : 'missing',
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    concurrency: config.concurrency,
  }
}
