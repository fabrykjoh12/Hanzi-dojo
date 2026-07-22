// Shared TTS vocabulary: the small set of names every other TTS module agrees
// on. Pure data — no I/O, no environment access — so it is safe to import from
// the browser bundle (the client needs VARIANTS and the storage-path shape) and
// from the server-only generation scripts alike.
//
// See docs/TTS.md for the architecture these names belong to.

// Bump when a change to HOW we synthesize should invalidate previously
// generated audio even though the source text is untouched: a different SSML
// shape, a different output format, a changed normalization rule. It is part of
// the content hash, so bumping it marks every existing row stale and eligible
// for regeneration (it never deletes anything on its own).
export const SYNTHESIS_CONFIG_VERSION = 1

// What kind of thing is being spoken. Providers may tune delivery per type.
export const CONTENT_TYPES = ['word', 'sentence', 'story', 'dialogue']

// The audio variants the app plays. `contentType` feeds the provider; `rate` is
// the default speaking rate (1 = the voice's natural pace). Slow variants are
// deliberately only slightly slow — 0.5x is unnaturally draggy and teaches a
// rhythm that does not exist in speech.
export const VARIANTS = {
  word: { key: 'word', contentType: 'word', rate: 1.0, label: 'Play word' },
  word_slow: { key: 'word_slow', contentType: 'word', rate: 0.8, label: 'Play word slowly' },
  sentence: { key: 'sentence', contentType: 'sentence', rate: 1.0, label: 'Play sentence' },
  sentence_slow: { key: 'sentence_slow', contentType: 'sentence', rate: 0.85, label: 'Play sentence slowly' },
  utterance: { key: 'utterance', contentType: 'story', rate: 1.0, label: 'Play line' },
  utterance_slow: { key: 'utterance_slow', contentType: 'story', rate: 0.85, label: 'Play line slowly' },
}

export const VARIANT_KEYS = Object.keys(VARIANTS)

// Which variants belong to which source entity, so the CLI and the client agree
// on what "complete" means for a row.
export const SOURCE_TYPES = {
  vocabulary: { key: 'vocabulary', variants: ['word', 'word_slow', 'sentence', 'sentence_slow'] },
  story_utterance: { key: 'story_utterance', variants: ['utterance', 'utterance_slow'] },
}

export const SOURCE_TYPE_KEYS = Object.keys(SOURCE_TYPES)

// Audio record lifecycle. `stale` means "a good file exists but its inputs
// changed" — it keeps playing until a regeneration replaces it, so a text edit
// never leaves a learner with silence.
export const AUDIO_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  FAILED: 'failed',
  STALE: 'stale',
  NEEDS_REVIEW: 'needs_review',
  REJECTED: 'rejected',
}

export const AUDIO_STATUSES = Object.values(AUDIO_STATUS)

// Generation-job lifecycle.
export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  STALE: 'stale',
  NEEDS_REVIEW: 'needs_review',
}

export const JOB_STATUSES = Object.values(JOB_STATUS)

// Human-verification states for a pronunciation override. `inferred` exists so
// a machine-derived reading can be stored and used without ever masquerading as
// something a person checked.
export const OVERRIDE_VERIFICATION = {
  UNREVIEWED: 'unreviewed',
  INFERRED: 'inferred',
  NEEDS_REVIEW: 'needs_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
}

export const OVERRIDE_VERIFICATIONS = Object.values(OVERRIDE_VERIFICATION)

// Only a human action may set these. Enforced in overrides.js.
export const HUMAN_ONLY_VERIFICATIONS = [OVERRIDE_VERIFICATION.VERIFIED, OVERRIDE_VERIFICATION.REJECTED]

// Output format. One format for the whole system keeps the cache coherent; it
// is part of the content hash, so changing it invalidates rather than silently
// mixing encodings.
export const DEFAULT_OUTPUT_FORMAT = 'mp3-24khz-48kbit-mono'
export const OUTPUT_FORMAT_CONTENT_TYPE = 'audio/mpeg'
export const OUTPUT_FORMAT_EXTENSION = 'mp3'

// Guard rails. MAX_TEXT_CHARS is well under Azure's own SSML limit — anything
// longer than this is a bug in how content was split, not a long sentence.
export const MAX_TEXT_CHARS = 800
export const MIN_SPEAKING_RATE = 0.5
export const MAX_SPEAKING_RATE = 2.0

// Supported locales. Adding a language means adding it here plus a voice.
export const SUPPORTED_LOCALES = ['zh-CN']
export const DEFAULT_LOCALE = 'zh-CN'

// Default voices per role. Overridable by environment (see config.js) so a
// deployment can change voices without a code change.
export const DEFAULT_VOICES = {
  flashcard: 'zh-CN-XiaoxiaoNeural',
  story: 'zh-CN-XiaoxiaoMultilingualNeural',
  male: 'zh-CN-YunxiNeural',
}

// Voices we know are valid for a locale. Kept as an allowlist so a typo in an
// environment variable fails fast at startup instead of after a paid request.
export const KNOWN_VOICES = {
  'zh-CN': [
    'zh-CN-XiaoxiaoNeural',
    'zh-CN-XiaoxiaoMultilingualNeural',
    'zh-CN-YunxiNeural',
    'zh-CN-YunjianNeural',
    'zh-CN-XiaoyiNeural',
    'zh-CN-YunyangNeural',
    'zh-CN-XiaochenNeural',
    'zh-CN-XiaohanNeural',
  ],
}
