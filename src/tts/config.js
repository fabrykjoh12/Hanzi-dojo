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
export const DEFAULT_MAX_RETRIES = 4
// Measured, not guessed: a real batch at 3 drew a steady stream of
// "Downstream Service Throttled" 429s from a standard Speech resource. Two is
// still faster than serial and leaves headroom under the per-minute quota;
// raise it with TTS_CONCURRENCY if your tier allows more.
export const DEFAULT_CONCURRENCY = 2
// A ceiling rather than a preference: Azure throttles per-region, and a wide
// fan-out just converts throughput into 429s and wasted retries.
export const MAX_CONCURRENCY = 8

// The Speech resource's pricing tier, recorded on every generated row.
//
// This is a LICENSING fact, not a performance one: Microsoft grants commercial
// usage rights for prebuilt neural voices to paid-tier customers only, so "which
// tier produced this clip" is the question a rights review actually asks. The
// project ran on F0 until 2026-08-15; audio generated then is being re-rendered
// under S0 precisely because the tier is what makes it licensed. Defaulting to
// S0 matches the resource in use — set AZURE_SPEECH_TIER explicitly if that ever
// stops being true, because a wrong value here is a false provenance record.
export const AZURE_TIERS = ['S0', 'F0']
export const DEFAULT_AZURE_TIER = 'S0'

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

// Absent means false. Only an explicit affirmative turns a flag on, so a stray
// empty string in a CI environment cannot silently change migration behaviour.
function boolFlag(env, name) {
  const raw = env[name]
  if (typeof raw !== 'string') return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
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
    const tier = (env.AZURE_SPEECH_TIER || DEFAULT_AZURE_TIER).trim().toUpperCase()
    if (AZURE_TIERS.indexOf(tier) === -1) {
      throw new TtsConfigError('AZURE_SPEECH_TIER must be one of ' + AZURE_TIERS.join(', ') + ', got "' + tier + '"')
    }
    azure = { key: key || null, region: region || null, tier }
  }

  return Object.freeze({
    provider,
    locale,
    voices: Object.freeze(voices),
    azure: azure ? Object.freeze(azure) : null,
    timeoutMs: positiveInt(env, 'TTS_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    maxRetries: positiveInt(env, 'TTS_MAX_RETRIES', DEFAULT_MAX_RETRIES, { max: 10 }),
    concurrency: positiveInt(env, 'TTS_CONCURRENCY', DEFAULT_CONCURRENCY, { max: MAX_CONCURRENCY }),
    retainSuperseded: boolFlag(env, 'TTS_RETAIN_SUPERSEDED'),
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
    azureTier: config.azure ? config.azure.tier : null,
    azureKey: keyLen ? 'set (' + keyLen + ' chars)' : 'missing',
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    concurrency: config.concurrency,
    retainSuperseded: !!config.retainSuperseded,
  }
}
