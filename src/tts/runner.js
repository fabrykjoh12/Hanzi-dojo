// The generation runner: plan, then execute.
//
// Planning is separate from execution and completely side-effect free, which is
// what makes `--dry-run` trustworthy: the dry run performs the EXACT same
// planning the real run does, so the counts an operator confirms are the counts
// they will be billed for.
//
// Every dependency (provider, storage, repository, clock) is injected, so the
// whole pipeline runs in tests with a mock provider and an in-memory database.

import { buildTtsRequest } from './request.js'
import { contentHashFor } from './contentHash.js'
import { ttsStoragePath } from './storagePath.js'
import {
  classify, shouldGenerate, buildAudioRecord, buildFailureRecord,
  buildJob, jobResultPatch, estimateBatch,
} from './records.js'
import { withRetry } from './retry.js'
import { mapWithConcurrency } from './concurrency.js'
import { TtsCancelledError } from './errors.js'

export const REASON_INVALID = 'invalid'

// Turn units into plans: what we would synthesize, what it would hash to, and
// whether it needs doing at all. No network, no writes.
export function planUnits(units, { existingAudio = {}, providerName = 'azure', filters = {} } = {}) {
  return (units || []).map(unit => {
    let request = null
    let contentHash = null
    let error = null
    try {
      request = buildTtsRequest({
        text: unit.text,
        locale: unit.locale,
        voice: unit.voice,
        speakingRate: unit.speakingRate,
        contentType: unit.contentType,
        pronunciationOverrides: unit.pronunciationOverrides || [],
        context: unit.context,
        style: unit.style,
        provider: providerName,
      })
      contentHash = contentHashFor({
        normalizedText: request.normalizedText,
        locale: request.locale,
        provider: providerName,
        voice: request.voice,
        speakingRate: request.speakingRate,
        overrideVersion: request.overrideVersion,
        outputFormat: request.outputFormat,
        contentType: request.contentType,
        synthesisConfigVersion: request.synthesisConfigVersion,
      })
    } catch (err) {
      error = err
    }

    const existing = existingAudio[unit.sourceId + '|' + unit.variant] || null
    const reason = error ? REASON_INVALID : classify(existing, contentHash)
    return {
      ...unit,
      request,
      contentHash,
      existing,
      reason,
      // Something we cannot even build a request for is never "generatable" -
      // it is a content bug to fix, not work to queue.
      willGenerate: !error && shouldGenerate(reason, filters),
      characterCount: request ? request.characterCount : 0,
      error,
    }
  })
}

// The cost of a plan, for the confirmation prompt and the summary.
export { estimateBatch }

// Synthesize one clip and persist it.
//
// Order matters: upload first, write the row second, delete superseded files
// last. That way a crash can leave an unreferenced file (harmless, cleanable)
// but never a database row pointing at audio that does not exist.
export async function generateOne(plan, {
  provider, storage, repository, config, logger, signal = null, now = () => new Date(),
}) {
  const storagePath = ttsStoragePath({
    locale: plan.locale,
    sourceType: plan.sourceType,
    sourceId: plan.sourceId,
    variant: plan.variant,
    contentHash: plan.contentHash,
  })

  let result
  try {
    result = await withRetry(() => provider.synthesize(plan.request, { signal }), {
      retries: config.maxRetries,
      signal,
      onRetry: ({ attempt, delay, error }) => {
        if (logger) logger.warn('retry', plan.label || plan.sourceId, 'attempt', attempt + 1, 'in', delay + 'ms', '-', error.message)
      },
    })
  } catch (error) {
    // Record the failure so it is visible and retryable. A cancelled run is not
    // a content failure, so it leaves no failed row behind.
    if (!(error instanceof TtsCancelledError)) {
      await repository.upsertAudio(buildFailureRecord({
        sourceType: plan.sourceType, sourceId: plan.sourceId, variant: plan.variant,
        request: plan.request, contentHash: plan.contentHash, error, now: now(),
      }))
    }
    throw error
  }

  const { deduped } = await storage.upload(storagePath, result.audio, { contentType: result.contentType })

  await repository.upsertAudio(buildAudioRecord({
    sourceType: plan.sourceType, sourceId: plan.sourceId, variant: plan.variant,
    request: plan.request, contentHash: plan.contentHash, storagePath, result, now: now(),
  }))

  // Best-effort: leftover files cost a little storage, a failed delete must
  // never fail a clip that is already live.
  try {
    await storage.removeSuperseded({
      locale: plan.locale, sourceType: plan.sourceType, sourceId: plan.sourceId,
      variant: plan.variant, keepPath: storagePath,
    })
  } catch (err) {
    if (logger) logger.warn('could not clean up superseded audio for', plan.label || plan.sourceId, '-', err.message)
  }

  return {
    storagePath,
    deduped,
    requestCount: result.requestCount || 1,
    characterCount: plan.request.characterCount,
    durationMs: result.durationMs,
  }
}

// Run a set of plans with bounded concurrency, reporting progress and never
// letting one failure stop the rest.
export async function runPlans(plans, {
  provider, storage, repository, config, logger, signal = null,
  concurrency = null, onProgress = null, now = () => new Date(),
}) {
  const todo = (plans || []).filter(p => p.willGenerate)
  const results = await mapWithConcurrency(
    todo,
    concurrency || config.concurrency,
    (plan) => generateOne(plan, { provider, storage, repository, config, logger, signal, now }),
    { signal, onProgress }
  )

  const summary = {
    attempted: todo.length,
    generated: 0,
    deduped: 0,
    failed: 0,
    requests: 0,
    characters: 0,
    failures: [],
  }
  results.forEach((r, i) => {
    const plan = todo[i]
    if (r.ok) {
      summary.generated += 1
      if (r.value.deduped) summary.deduped += 1
      summary.requests += r.value.requestCount
      summary.characters += r.value.characterCount
    } else {
      summary.failed += 1
      summary.failures.push({
        sourceType: plan.sourceType,
        sourceId: plan.sourceId,
        variant: plan.variant,
        label: plan.label,
        code: r.error && r.error.code ? r.error.code : 'unknown',
        message: r.error ? r.error.message : 'unknown failure',
      })
    }
  })
  return { summary, results, plans: todo }
}

// The durable path: queue the work, then claim and execute it.
//
// Claiming goes through the security-definer RPC (FOR UPDATE SKIP LOCKED), so a
// second concurrent run cannot pick up the same clip, and a run killed halfway
// leaves claimable jobs rather than lost work.
export async function runBatchWithJobs(plans, {
  batchId, worker, provider, storage, repository, config, logger,
  signal = null, concurrency = null, now = () => new Date(),
}) {
  const todo = (plans || []).filter(p => p.willGenerate)
  const byKey = {}
  for (const plan of todo) byKey[plan.sourceType + '|' + plan.sourceId + '|' + plan.variant] = plan

  await repository.insertJobs(todo.map(plan => buildJob({
    batchId,
    sourceType: plan.sourceType,
    sourceId: plan.sourceId,
    variant: plan.variant,
    locale: plan.locale,
    contentHash: plan.contentHash,
    maxAttempts: config.maxRetries,
  })))

  const summary = {
    attempted: 0, generated: 0, deduped: 0, failed: 0, skipped: 0,
    requests: 0, characters: 0, failures: [],
  }

  // Loop because a retryable failure returns its job to `pending`, and because
  // another worker may release jobs while we are running.
  for (;;) {
    if (signal && signal.aborted) break
    const jobs = await repository.claimJobs({ batchId, worker, limit: todo.length || 1 })
    if (!jobs.length) break

    const results = await mapWithConcurrency(jobs, concurrency || config.concurrency, async (job) => {
      const plan = byKey[job.source_type + '|' + job.source_id + '|' + job.variant]
      if (!plan) {
        // The job exists but this run has no plan for it (its content changed
        // between planning and claiming). Skipping is right: generating from a
        // stale plan would store audio for text that no longer exists.
        await repository.patchJob(job.id, jobResultPatch({
          ok: false, skipped: true, attempts: job.attempts, maxAttempts: job.max_attempts, now: now(),
        }))
        return { skipped: true }
      }
      try {
        const outcome = await generateOne(plan, { provider, storage, repository, config, logger, signal, now })
        await repository.patchJob(job.id, jobResultPatch({
          ok: true, attempts: job.attempts, maxAttempts: job.max_attempts,
          requestCount: outcome.requestCount, characterCount: outcome.characterCount, now: now(),
        }))
        return outcome
      } catch (error) {
        await repository.patchJob(job.id, jobResultPatch({
          ok: false, error, attempts: job.attempts, maxAttempts: job.max_attempts,
          requestCount: 0, characterCount: 0, now: now(),
        }))
        throw error
      }
    }, { signal })

    let progressed = false
    results.forEach((r, i) => {
      const job = jobs[i]
      summary.attempted += 1
      if (r.ok && r.value && r.value.skipped) {
        summary.skipped += 1
        progressed = true
        return
      }
      if (r.ok) {
        progressed = true
        summary.generated += 1
        if (r.value.deduped) summary.deduped += 1
        summary.requests += r.value.requestCount
        summary.characters += r.value.characterCount
        return
      }
      const terminal = !(r.error && r.error.retryable) || job.attempts >= job.max_attempts
      if (terminal) {
        progressed = true
        summary.failed += 1
        summary.failures.push({
          jobId: job.id,
          sourceType: job.source_type,
          sourceId: job.source_id,
          variant: job.variant,
          code: r.error && r.error.code ? r.error.code : 'unknown',
          message: r.error ? r.error.message : 'unknown failure',
        })
      }
    })

    // Nothing terminal and nothing succeeded means every job went back to
    // pending - looping again would spin. Stop and let an explicit retry
    // command pick them up.
    if (!progressed) break
  }

  return summary
}
