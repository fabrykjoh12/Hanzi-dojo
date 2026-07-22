// The decision layer: what needs generating, and what a row looks like after.
//
// Kept pure and separate from the database on purpose - "should we spend money
// on this clip?" is the single most important question in the system, and it
// deserves to be testable without a network, a service key, or a live table.

import {
  AUDIO_STATUS, JOB_STATUS, SOURCE_TYPES, VARIANTS,
  DEFAULT_OUTPUT_FORMAT, SYNTHESIS_CONFIG_VERSION,
} from './constants.js'
import { isStale } from './contentHash.js'

// Why a clip does or does not need work. These strings appear in the CLI's
// summary output, so an operator can see exactly what a run intends to do.
export const REASON = {
  CACHE_HIT: 'cache_hit',     // identical audio already stored - never re-synthesize
  MISSING: 'missing',         // nothing generated yet
  STALE: 'stale',             // stored, but an input changed
  FAILED: 'failed',           // a previous attempt failed
  PENDING: 'pending',         // a row exists but was never completed
  REJECTED: 'rejected',       // a reviewer rejected it; leave it alone unless asked
}

// Classify one (entity, variant) against what is stored.
export function classify(existing, expectedHash) {
  if (!existing) return REASON.MISSING
  if (existing.status === AUDIO_STATUS.REJECTED) return REASON.REJECTED
  if (isStale(existing, expectedHash)) return REASON.STALE
  if (existing.status === AUDIO_STATUS.READY && existing.storage_path) return REASON.CACHE_HIT
  if (existing.status === AUDIO_STATUS.FAILED) return REASON.FAILED
  return REASON.PENDING
}

// Should this classification be generated under the operator's filters?
//
// A cache hit is NEVER generated - that is the whole point of the hash. A
// rejected clip is only touched when explicitly asked for, so a reviewer's
// decision is not silently undone by the next batch run.
export function shouldGenerate(reason, { missingOnly = false, staleOnly = false, includeRejected = false } = {}) {
  if (reason === REASON.CACHE_HIT) return false
  if (reason === REASON.REJECTED) return includeRejected
  if (staleOnly) return reason === REASON.STALE
  if (missingOnly) return reason === REASON.MISSING || reason === REASON.FAILED || reason === REASON.PENDING
  return true
}

// Which variants a source entity should have. A vocabulary row with no example
// sentence gets word audio only - planning sentence clips for it would queue
// work that can never succeed.
export function plannedVariants(sourceType, { hasSentence = true } = {}) {
  const def = SOURCE_TYPES[sourceType]
  if (!def) return []
  return def.variants.filter(v => {
    if (hasSentence) return true
    return v.indexOf('sentence') === -1
  })
}

// The row written after a successful synthesis. `status: ready` plus a storage
// path is what makes the clip visible to learners (see the RLS policy).
export function buildAudioRecord({
  sourceType, sourceId, variant, request, contentHash, storagePath, result, now = new Date(),
}) {
  return {
    source_type: sourceType,
    source_id: sourceId,
    variant,
    source_text: request.sourceText,
    normalized_text: request.normalizedText,
    locale: request.locale,
    provider: result.provider,
    provider_version: result.providerVersion || null,
    voice: request.voice,
    speaking_rate: request.speakingRate,
    pronunciation_override_version: request.overrideVersion,
    output_format: request.outputFormat || DEFAULT_OUTPUT_FORMAT,
    synthesis_config_version: request.synthesisConfigVersion || SYNTHESIS_CONFIG_VERSION,
    content_hash: contentHash,
    status: AUDIO_STATUS.READY,
    storage_path: storagePath,
    duration_ms: result.durationMs == null ? null : result.durationMs,
    byte_length: result.byteLength == null ? null : result.byteLength,
    character_count: request.characterCount,
    request_count: result.requestCount || 1,
    error_code: null,
    error_message: null,
    generated_at: now.toISOString(),
  }
}

// The row written after a failure. It deliberately keeps `storage_path` out of
// the payload so a previously-good file is not orphaned by a failed retry: the
// old clip keeps playing until a new one genuinely succeeds.
export function buildFailureRecord({
  sourceType, sourceId, variant, request, contentHash, error, now = new Date(),
}) {
  const record = error && typeof error.toRecord === 'function'
    ? error.toRecord()
    : { code: 'tts_provider', message: String((error && error.message) || 'Unknown failure'), status: null }
  return {
    source_type: sourceType,
    source_id: sourceId,
    variant,
    source_text: request.sourceText,
    normalized_text: request.normalizedText,
    locale: request.locale,
    provider: request.provider,
    voice: request.voice,
    speaking_rate: request.speakingRate,
    pronunciation_override_version: request.overrideVersion,
    output_format: request.outputFormat || DEFAULT_OUTPUT_FORMAT,
    synthesis_config_version: request.synthesisConfigVersion || SYNTHESIS_CONFIG_VERSION,
    content_hash: contentHash,
    status: AUDIO_STATUS.FAILED,
    character_count: request.characterCount,
    error_code: record.code,
    // Truncated: an error column is for diagnosis, not for storing a provider's
    // entire HTML error page.
    error_message: String(record.message || '').slice(0, 500),
    generated_at: now.toISOString(),
  }
}

// A job row for the queue. `content_hash` is recorded at planning time so a
// worker can detect that the content changed between planning and execution.
export function buildJob({ batchId, sourceType, sourceId, variant, locale, contentHash, maxAttempts = 3 }) {
  return {
    batch_id: batchId,
    source_type: sourceType,
    source_id: sourceId,
    variant,
    locale,
    content_hash: contentHash,
    status: JOB_STATUS.PENDING,
    max_attempts: maxAttempts,
  }
}

// Where a job goes after an attempt. A retryable error with attempts left goes
// back to `pending` so the same batch can pick it up again; anything else is
// terminal for this run and needs an explicit retry command.
export function nextJobStatus({ ok, error, attempts, maxAttempts, skipped = false }) {
  if (skipped) return JOB_STATUS.SKIPPED
  if (ok) return JOB_STATUS.COMPLETED
  const retryable = Boolean(error && error.retryable)
  if (retryable && attempts < maxAttempts) return JOB_STATUS.PENDING
  return JOB_STATUS.FAILED
}

// The update payload for a finished job, including the cost it actually
// incurred - the audit trail for a paid run.
export function jobResultPatch({
  ok, error, attempts, maxAttempts, skipped = false,
  requestCount = 0, characterCount = 0, now = new Date(),
}) {
  const status = nextJobStatus({ ok, error, attempts, maxAttempts, skipped })
  const record = error && typeof error.toRecord === 'function' ? error.toRecord() : null
  return {
    status,
    request_count: requestCount,
    character_count: characterCount,
    error_code: record ? record.code : null,
    error_message: record ? String(record.message || '').slice(0, 500) : null,
    // A job going back to `pending` is not finished, so it keeps no finish time.
    finished_at: status === JOB_STATUS.PENDING ? null : now.toISOString(),
  }
}

// Cost estimate for a planned batch, shown before an operator confirms.
export function estimateBatch(plans) {
  const list = (plans || []).filter(p => p.willGenerate)
  return {
    sourceRecords: new Set(list.map(p => p.sourceType + ':' + p.sourceId)).size,
    clips: list.length,
    requests: list.length,
    characters: list.reduce((n, p) => n + (p.characterCount || 0), 0),
    byVariant: list.reduce((acc, p) => {
      acc[p.variant] = (acc[p.variant] || 0) + 1
      return acc
    }, {}),
    byReason: list.reduce((acc, p) => {
      acc[p.reason] = (acc[p.reason] || 0) + 1
      return acc
    }, {}),
  }
}

// Speaking rate for a variant, so nothing outside constants.js gets to invent one.
export function rateForVariant(variantKey) {
  const v = VARIANTS[variantKey]
  return v ? v.rate : 1
}
