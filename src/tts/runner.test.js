import { describe, it, expect } from 'vitest'
import { planUnits, generateOne, runPlans, runBatchWithJobs, estimateBatch } from './runner.js'
import { vocabularyUnits, utteranceUnits, readingOverride } from './sources.js'
import { REASON, classify, shouldGenerate, plannedVariants, nextJobStatus, jobResultPatch } from './records.js'
import { MockTTSProvider } from './providers/mock.js'
import { TtsProviderError, TtsStorageError, TTS_ERROR_CODES } from './errors.js'
import { AUDIO_STATUS, JOB_STATUS } from './constants.js'

const LOCALE = 'zh-CN'
const VOICES = {
  flashcard: 'zh-CN-XiaoxiaoNeural',
  story: 'zh-CN-XiaoxiaoMultilingualNeural',
  male: 'zh-CN-YunxiNeural',
}
const CONFIG = { maxRetries: 2, concurrency: 2, locale: LOCALE, voices: VOICES }
const NOW = () => new Date('2026-07-22T21:00:00.000Z')

const VOCAB = {
  id: '11111111-1111-1111-1111-111111111111',
  language: 'chinese', system: 'hsk_3', level: 1,
  word: '银行', reading: 'yínháng', example_sentence: '我今天去银行。',
}

// --- in-memory doubles -------------------------------------------------------

function fakeStorage({ failUpload = false } = {}) {
  const objects = new Map()
  const removed = []
  return {
    objects, removed,
    async upload(path, bytes) {
      if (failUpload) throw new TtsStorageError('disk on fire')
      if (objects.has(path)) return { path, deduped: true }
      objects.set(path, bytes)
      return { path, deduped: false }
    },
    async removeSuperseded({ keepPath }) {
      let count = 0
      const keepDir = keepPath.slice(0, keepPath.lastIndexOf('/'))
      for (const key of Array.from(objects.keys())) {
        const sameDir = key.slice(0, key.lastIndexOf('/')) === keepDir
        if (sameDir && key !== keepPath) { objects.delete(key); removed.push(key); count += 1 }
      }
      return { removed: count }
    },
  }
}

function fakeRepository({ seedAudio = [] } = {}) {
  const audio = new Map()
  for (const row of seedAudio) audio.set(row.source_type + '|' + row.source_id + '|' + row.variant, row)
  const jobs = []
  let nextId = 1

  return {
    audio, jobs,
    async loadAudioFor(sourceType, ids, locale) {
      const map = {}
      for (const [, row] of audio) {
        if (row.source_type === sourceType && row.locale === locale && ids.indexOf(row.source_id) !== -1) {
          map[row.source_id + '|' + row.variant] = row
        }
      }
      return map
    },
    async upsertAudio(record) {
      const key = record.source_type + '|' + record.source_id + '|' + record.variant
      // Merge, mirroring PostgREST's merge-duplicates: absent columns are kept.
      const merged = { ...(audio.get(key) || {}), ...record }
      audio.set(key, merged)
      return merged
    },
    async insertJobs(list) {
      const inserted = []
      for (const job of list) {
        const live = jobs.find(j => j.source_type === job.source_type && j.source_id === job.source_id
          && j.variant === job.variant && j.locale === job.locale
          && (j.status === JOB_STATUS.PENDING || j.status === JOB_STATUS.PROCESSING))
        if (live) continue // the partial unique index rejects a second live job
        const row = { id: 'job-' + nextId, attempts: 0, ...job }
        nextId += 1
        jobs.push(row)
        inserted.push(row)
      }
      return inserted
    },
    async claimJobs({ batchId, worker, limit }) {
      const claimed = jobs
        .filter(j => j.batch_id === batchId && j.status === JOB_STATUS.PENDING && j.attempts < j.max_attempts)
        .slice(0, limit)
      for (const job of claimed) {
        job.status = JOB_STATUS.PROCESSING
        job.claimed_by = worker
        job.attempts += 1
      }
      // Snapshot: the RPC returns rows as they were at claim time.
      return claimed.map(j => ({ ...j }))
    },
    async patchJob(id, patch) {
      const job = jobs.find(j => j.id === id)
      if (job) Object.assign(job, patch)
    },
  }
}

function planFor(rows, { existingAudio = {}, filters = {}, overrides = [] } = {}) {
  const units = rows.flatMap(r => vocabularyUnits(r, { locale: LOCALE, voices: VOICES, overrides }))
  return planUnits(units, { existingAudio, providerName: 'mock', filters })
}

function storedRow(variant, contentHash, patch = {}) {
  return {
    [VOCAB.id + '|' + variant]: {
      source_type: 'vocabulary', source_id: VOCAB.id, variant, locale: LOCALE,
      content_hash: contentHash, status: AUDIO_STATUS.READY, storage_path: 'tts/x.mp3', ...patch,
    },
  }
}

// --- source units ------------------------------------------------------------

describe('vocabularyUnits', () => {
  it('produces the four flashcard clips', () => {
    const units = vocabularyUnits(VOCAB, { locale: LOCALE, voices: VOICES })
    expect(units.map(u => u.variant)).toEqual(['word', 'word_slow', 'sentence', 'sentence_slow'])
  })

  it('speaks the word for word variants and the example for sentence variants', () => {
    const units = vocabularyUnits(VOCAB, { locale: LOCALE, voices: VOICES })
    expect(units[0].text).toBe('银行')
    expect(units[2].text).toBe('我今天去银行。')
  })

  it('plans no sentence clips for a word with no example, so no job can be unfulfillable', () => {
    const units = vocabularyUnits({ ...VOCAB, example_sentence: null }, { locale: LOCALE, voices: VOICES })
    expect(units.map(u => u.variant)).toEqual(['word', 'word_slow'])
  })

  it('skips a row with nothing to say', () => {
    expect(vocabularyUnits({ ...VOCAB, word: '  ' }, { locale: LOCALE, voices: VOICES })).toEqual([])
  })

  it('pins the word to the curriculum reading, so 银行 is not read as yín xíng', () => {
    const units = vocabularyUnits(VOCAB, { locale: LOCALE, voices: VOICES })
    expect(units[0].pronunciationOverrides[0].pinyin).toBe('yínháng')
    expect(units[0].pronunciationOverrides[0].matched_text).toBe('银行')
  })

  it('labels a derived reading as inferred, never as human-verified', () => {
    expect(readingOverride(VOCAB, { locale: LOCALE })[0].verification).toBe('inferred')
  })

  it('uses the flashcard voice', () => {
    expect(vocabularyUnits(VOCAB, { locale: LOCALE, voices: VOICES })[0].voice).toBe(VOICES.flashcard)
  })
})

describe('utteranceUnits', () => {
  const utterance = {
    id: '22222222-2222-2222-2222-222222222222',
    story_id: '33333333-3333-3333-3333-333333333333',
    scene_index: 0, utterance_index: 2,
    speaker_id: 'narrator', hanzi: '一天晚上，小明在森林里。',
  }

  it('produces a normal and a slow clip', () => {
    expect(utteranceUnits(utterance, { locale: LOCALE, voices: VOICES }).map(u => u.variant))
      .toEqual(['utterance', 'utterance_slow'])
  })

  it('narrates with the story voice by default', () => {
    expect(utteranceUnits(utterance, { locale: LOCALE, voices: VOICES })[0].voice).toBe(VOICES.story)
  })

  it("honours a character's own voice", () => {
    const line = { ...utterance, speaker_id: '小明', voice: VOICES.male }
    const units = utteranceUnits(line, { locale: LOCALE, voices: VOICES })
    expect(units[0].voice).toBe(VOICES.male)
    expect(units[0].contentType).toBe('story')
    expect(units[0].context).toBe('dialogue')
  })

  it('strips the speaker label so narration does not read the name aloud', () => {
    const line = { ...utterance, speaker_id: '小明', hanzi: '小明：你好' }
    expect(utteranceUnits(line, { locale: LOCALE, voices: VOICES })[0].text).toBe('你好')
  })
})

// --- planning ----------------------------------------------------------------

describe('planUnits', () => {
  it('plans everything for a word with no audio yet', () => {
    const plans = planFor([VOCAB])
    expect(plans).toHaveLength(4)
    expect(plans.every(p => p.willGenerate)).toBe(true)
    expect(plans.every(p => p.reason === REASON.MISSING)).toBe(true)
  })

  it('gives each variant its own content hash', () => {
    const hashes = planFor([VOCAB]).map(p => p.contentHash)
    expect(new Set(hashes).size).toBe(4)
  })

  it('skips a clip whose stored audio already matches - the cache hit', () => {
    const first = planFor([VOCAB])[0]
    const plans = planFor([VOCAB], { existingAudio: storedRow('word', first.contentHash) })
    expect(plans[0].reason).toBe(REASON.CACHE_HIT)
    expect(plans[0].willGenerate).toBe(false)
    expect(plans.filter(p => p.willGenerate)).toHaveLength(3)
  })

  it('marks a clip stale once its text changes', () => {
    const first = planFor([VOCAB])[0]
    const plans = planFor([{ ...VOCAB, word: '银行卡' }], { existingAudio: storedRow('word', first.contentHash) })
    expect(plans[0].reason).toBe(REASON.STALE)
    expect(plans[0].willGenerate).toBe(true)
  })

  // On zh-CN a changed reading cannot change the audio, because Azure rejects
  // <phoneme> for Mandarin - so it must NOT mark the clip stale. Spending a
  // request to re-render an identical sound is exactly what the hash exists to
  // prevent. (A changed reading on a pinnable locale does invalidate; that is
  // covered in ssml.test.js.)
  it('does not mark a clip stale when only the reading changed, since zh-CN cannot pin it', () => {
    const before = planFor([VOCAB])[0]
    const after = planFor([{ ...VOCAB, reading: 'yínxíng' }], { existingAudio: storedRow('word', before.contentHash) })
    expect(after[0].reason).toBe(REASON.CACHE_HIT)
    expect(after[0].willGenerate).toBe(false)
  })

  it('honours --missing-only by leaving stale audio alone', () => {
    const first = planFor([VOCAB])[0]
    const plans = planFor([{ ...VOCAB, word: '银行卡' }], {
      existingAudio: storedRow('word', first.contentHash), filters: { missingOnly: true },
    })
    expect(plans[0].willGenerate).toBe(false)
  })

  it('honours --stale-only by leaving missing audio alone', () => {
    const plans = planFor([VOCAB], { filters: { staleOnly: true } })
    expect(plans.every(p => !p.willGenerate)).toBe(true)
  })

  it('never silently regenerates audio a reviewer rejected', () => {
    const rejected = storedRow('word', 'whatever', { status: AUDIO_STATUS.REJECTED })
    expect(planFor([VOCAB], { existingAudio: rejected })[0].willGenerate).toBe(false)
    expect(planFor([VOCAB], { existingAudio: rejected, filters: { includeRejected: true } })[0].willGenerate).toBe(true)
  })

  it('retries a previously failed clip', () => {
    const first = planFor([VOCAB])[0]
    const failed = storedRow('word', first.contentHash, { status: AUDIO_STATUS.FAILED, storage_path: null })
    const plans = planFor([VOCAB], { existingAudio: failed })
    expect(plans[0].reason).toBe(REASON.FAILED)
    expect(plans[0].willGenerate).toBe(true)
  })

  it('flags unsynthesizable content instead of queueing it', () => {
    const units = [{
      sourceType: 'vocabulary', sourceId: VOCAB.id, variant: 'word', text: '好'.repeat(2000),
      locale: LOCALE, voice: VOICES.flashcard, speakingRate: 1, contentType: 'word',
    }]
    const plans = planUnits(units, { providerName: 'mock' })
    expect(plans[0].willGenerate).toBe(false)
    expect(plans[0].reason).toBe('invalid')
    expect(plans[0].error).toBeTruthy()
  })
})

describe('estimateBatch', () => {
  it('counts only the work that will actually be billed', () => {
    const estimate = estimateBatch(planFor([VOCAB]))
    expect(estimate.clips).toBe(4)
    expect(estimate.requests).toBe(4)
    expect(estimate.sourceRecords).toBe(1)
    expect(estimate.characters).toBeGreaterThan(0)
    expect(estimate.byVariant.word).toBe(1)
  })

  it('counts nothing when everything is a cache hit', () => {
    const estimate = estimateBatch(planFor([VOCAB]).map(p => ({ ...p, willGenerate: false })))
    expect(estimate.clips).toBe(0)
    expect(estimate.characters).toBe(0)
  })
})

// --- execution ---------------------------------------------------------------

describe('generateOne', () => {
  it('uploads the clip, then records it as ready', async () => {
    const storage = fakeStorage()
    const repository = fakeRepository()
    const provider = new MockTTSProvider()
    const plan = planFor([VOCAB])[0]

    const outcome = await generateOne(plan, { provider, storage, repository, config: CONFIG, now: NOW })

    expect(outcome.storagePath).toBe('tts/zh-CN/vocabulary/' + VOCAB.id + '/word/' + plan.contentHash + '.mp3')
    expect(storage.objects.has(outcome.storagePath)).toBe(true)
    const row = repository.audio.get('vocabulary|' + VOCAB.id + '|word')
    expect(row.status).toBe(AUDIO_STATUS.READY)
    expect(row.storage_path).toBe(outcome.storagePath)
    expect(row.content_hash).toBe(plan.contentHash)
    expect(row.generated_at).toBe('2026-07-22T21:00:00.000Z')
    expect(row.request_count).toBe(1)
  })

  it('is idempotent: the same clip uploaded twice is one object', async () => {
    const storage = fakeStorage()
    const repository = fakeRepository()
    const provider = new MockTTSProvider()
    const plan = planFor([VOCAB])[0]

    await generateOne(plan, { provider, storage, repository, config: CONFIG, now: NOW })
    const second = await generateOne(plan, { provider, storage, repository, config: CONFIG, now: NOW })

    expect(second.deduped).toBe(true)
    expect(storage.objects.size).toBe(1)
  })

  it('deletes the superseded file only after the row points at the new one', async () => {
    const storage = fakeStorage()
    const repository = fakeRepository()
    const provider = new MockTTSProvider()

    const before = planFor([VOCAB])[0]
    await generateOne(before, { provider, storage, repository, config: CONFIG, now: NOW })
    const after = planFor([{ ...VOCAB, word: '银行卡' }])[0]
    await generateOne(after, { provider, storage, repository, config: CONFIG, now: NOW })

    expect(storage.removed).toHaveLength(1)
    const row = repository.audio.get('vocabulary|' + VOCAB.id + '|word')
    expect(storage.objects.has(row.storage_path)).toBe(true)
  })

  it('writes no metadata row when the upload fails, so no row points at missing audio', async () => {
    const storage = fakeStorage({ failUpload: true })
    const repository = fakeRepository()
    const provider = new MockTTSProvider()
    const plan = planFor([VOCAB])[0]

    await expect(generateOne(plan, { provider, storage, repository, config: CONFIG, now: NOW }))
      .rejects.toBeInstanceOf(TtsStorageError)
    expect(repository.audio.size).toBe(0)
  })

  it('records a permanent failure so it is visible and retryable', async () => {
    const storage = fakeStorage()
    const repository = fakeRepository()
    const provider = new MockTTSProvider({
      failFor: () => new TtsProviderError('Invalid voice name', { status: 400, retryable: false }),
    })
    const plan = planFor([VOCAB])[0]

    await expect(generateOne(plan, { provider, storage, repository, config: CONFIG, now: NOW })).rejects.toThrow()
    const row = repository.audio.get('vocabulary|' + VOCAB.id + '|word')
    expect(row.status).toBe(AUDIO_STATUS.FAILED)
    expect(row.error_code).toBe(TTS_ERROR_CODES.PROVIDER)
    expect(row.storage_path).toBeUndefined()
    expect(storage.objects.size).toBe(0)
  })

  it('keeps the previously good clip playable after a failed regeneration', async () => {
    const storage = fakeStorage()
    const repository = fakeRepository()
    const plan = planFor([VOCAB])[0]
    await generateOne(plan, { provider: new MockTTSProvider(), storage, repository, config: CONFIG, now: NOW })
    const goodPath = repository.audio.get('vocabulary|' + VOCAB.id + '|word').storage_path

    const failing = new MockTTSProvider({ failFor: () => new TtsProviderError('nope', { status: 400 }) })
    const changed = planFor([{ ...VOCAB, word: '银行卡' }])[0]
    await expect(generateOne(changed, { provider: failing, storage, repository, config: CONFIG, now: NOW })).rejects.toThrow()

    const row = repository.audio.get('vocabulary|' + VOCAB.id + '|word')
    expect(row.status).toBe(AUDIO_STATUS.FAILED)
    expect(row.storage_path).toBe(goodPath)
    expect(storage.objects.has(goodPath)).toBe(true)
  })

  it('retries a transient failure and then succeeds', async () => {
    const provider = new MockTTSProvider({
      failFor: (_req, i) => (i === 0
        ? new TtsProviderError('throttled', { status: 429, code: TTS_ERROR_CODES.RATE_LIMIT, retryable: true })
        : null),
    })
    const storage = fakeStorage()
    const repository = fakeRepository()
    const plan = planFor([VOCAB])[0]

    const outcome = await generateOne(plan, {
      provider, storage, repository,
      config: { ...CONFIG, maxRetries: 3 }, now: NOW,
    })
    expect(outcome.requestCount).toBe(1)
    expect(provider.requestCount).toBe(2)
  })
})

describe('runPlans', () => {
  it('generates every planned clip and reports the cost', async () => {
    const storage = fakeStorage()
    const repository = fakeRepository()
    const provider = new MockTTSProvider()
    const { summary } = await runPlans(planFor([VOCAB]), { provider, storage, repository, config: CONFIG, now: NOW })

    expect(summary.attempted).toBe(4)
    expect(summary.generated).toBe(4)
    expect(summary.failed).toBe(0)
    expect(summary.requests).toBe(4)
    expect(summary.characters).toBe(2 + 2 + 7 + 7)
  })

  it('spends nothing when every clip is a cache hit', async () => {
    const provider = new MockTTSProvider()
    const plans = planFor([VOCAB]).map(p => ({ ...p, willGenerate: false }))
    const { summary } = await runPlans(plans, {
      provider, storage: fakeStorage(), repository: fakeRepository(), config: CONFIG, now: NOW,
    })
    expect(summary.attempted).toBe(0)
    expect(provider.requestCount).toBe(0)
  })

  it('keeps going after one clip fails and names the failure', async () => {
    const provider = new MockTTSProvider({
      failFor: (req) => (req.speakingRate === 0.8 ? new TtsProviderError('bad', { status: 400 }) : null),
    })
    const { summary } = await runPlans(planFor([VOCAB]), {
      provider, storage: fakeStorage(), repository: fakeRepository(), config: CONFIG, now: NOW,
    })
    expect(summary.generated).toBe(3)
    expect(summary.failed).toBe(1)
    expect(summary.failures[0].variant).toBe('word_slow')
  })

  it('reports progress so a long run is observable', async () => {
    const seen = []
    await runPlans(planFor([VOCAB]), {
      provider: new MockTTSProvider(), storage: fakeStorage(), repository: fakeRepository(),
      config: { ...CONFIG, concurrency: 1 }, now: NOW,
      onProgress: ({ completed, total }) => seen.push(completed + '/' + total),
    })
    expect(seen).toEqual(['1/4', '2/4', '3/4', '4/4'])
  })

  it('stops spending when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const provider = new MockTTSProvider()
    const { summary } = await runPlans(planFor([VOCAB]), {
      provider, storage: fakeStorage(), repository: fakeRepository(),
      config: CONFIG, signal: controller.signal, now: NOW,
    })
    expect(provider.requestCount).toBe(0)
    expect(summary.generated).toBe(0)
  })
})

// --- jobs --------------------------------------------------------------------

describe('runBatchWithJobs', () => {
  const batchId = '44444444-4444-4444-4444-444444444444'

  it('queues, claims and completes a job per clip', async () => {
    const repository = fakeRepository()
    const summary = await runBatchWithJobs(planFor([VOCAB]), {
      batchId, worker: 'test-1', provider: new MockTTSProvider(),
      storage: fakeStorage(), repository, config: CONFIG, now: NOW,
    })

    expect(summary.generated).toBe(4)
    expect(repository.jobs).toHaveLength(4)
    expect(repository.jobs.every(j => j.status === JOB_STATUS.COMPLETED)).toBe(true)
    expect(repository.jobs.every(j => j.finished_at === '2026-07-22T21:00:00.000Z')).toBe(true)
  })

  it('records what each job actually cost', async () => {
    const repository = fakeRepository()
    await runBatchWithJobs(planFor([VOCAB]), {
      batchId, worker: 'test-1', provider: new MockTTSProvider(),
      storage: fakeStorage(), repository, config: CONFIG, now: NOW,
    })
    const wordJob = repository.jobs.find(j => j.variant === 'word')
    expect(wordJob.request_count).toBe(1)
    expect(wordJob.character_count).toBe(2)
  })

  it('never queues the same clip twice, so a concurrent run cannot double-bill', async () => {
    const repository = fakeRepository()
    const rows = planFor([VOCAB]).map(p => ({
      batch_id: batchId, source_type: p.sourceType, source_id: p.sourceId,
      variant: p.variant, locale: p.locale, status: JOB_STATUS.PENDING, max_attempts: 3,
    }))
    await repository.insertJobs(rows)
    await repository.insertJobs(rows)
    expect(repository.jobs).toHaveLength(4)
  })

  it('marks a job failed once its retries are exhausted', async () => {
    const repository = fakeRepository()
    const provider = new MockTTSProvider({
      failFor: () => new TtsProviderError('always throttled', { status: 429, code: TTS_ERROR_CODES.RATE_LIMIT, retryable: true }),
    })
    const summary = await runBatchWithJobs(planFor([VOCAB]).slice(0, 1), {
      batchId, worker: 'test-1', provider, storage: fakeStorage(), repository,
      config: { ...CONFIG, maxRetries: 1 }, now: NOW,
    })
    expect(summary.failed).toBe(1)
    expect(repository.jobs[0].status).toBe(JOB_STATUS.FAILED)
    expect(repository.jobs[0].error_code).toBe(TTS_ERROR_CODES.RATE_LIMIT)
  })

  it('skips a claimed job this run has no plan for, rather than voicing stale text', async () => {
    const repository = fakeRepository()
    await repository.insertJobs([{
      batch_id: batchId, source_type: 'vocabulary', source_id: '99999999-9999-9999-9999-999999999999',
      variant: 'word', locale: LOCALE, status: JOB_STATUS.PENDING, max_attempts: 3,
    }])
    const summary = await runBatchWithJobs(planFor([VOCAB]), {
      batchId, worker: 'test-1', provider: new MockTTSProvider(),
      storage: fakeStorage(), repository, config: CONFIG, now: NOW,
    })
    expect(summary.skipped).toBe(1)
    expect(repository.jobs.find(j => j.source_id.indexOf('9999') === 0).status).toBe(JOB_STATUS.SKIPPED)
  })

  it('queues nothing when every clip is already cached', async () => {
    const repository = fakeRepository()
    const provider = new MockTTSProvider()
    const plans = planFor([VOCAB]).map(p => ({ ...p, willGenerate: false }))
    const summary = await runBatchWithJobs(plans, {
      batchId, worker: 'test-1', provider, storage: fakeStorage(), repository, config: CONFIG, now: NOW,
    })
    expect(repository.jobs).toHaveLength(0)
    expect(summary.generated).toBe(0)
    expect(provider.requestCount).toBe(0)
  })

  it('stops claiming work once cancelled', async () => {
    const repository = fakeRepository()
    const controller = new AbortController()
    controller.abort()
    const provider = new MockTTSProvider()
    await runBatchWithJobs(planFor([VOCAB]), {
      batchId, worker: 'test-1', provider, storage: fakeStorage(), repository,
      config: CONFIG, signal: controller.signal, now: NOW,
    })
    expect(provider.requestCount).toBe(0)
  })
})

// --- status transitions ------------------------------------------------------

describe('job status transitions', () => {
  it('completes on success', () => {
    expect(nextJobStatus({ ok: true, attempts: 1, maxAttempts: 3 })).toBe(JOB_STATUS.COMPLETED)
  })

  it('returns a retryable failure to pending while attempts remain', () => {
    expect(nextJobStatus({ ok: false, error: { retryable: true }, attempts: 1, maxAttempts: 3 })).toBe(JOB_STATUS.PENDING)
  })

  it('fails a retryable error once the attempts are used up', () => {
    expect(nextJobStatus({ ok: false, error: { retryable: true }, attempts: 3, maxAttempts: 3 })).toBe(JOB_STATUS.FAILED)
  })

  it('fails a permanent error immediately', () => {
    expect(nextJobStatus({ ok: false, error: { retryable: false }, attempts: 1, maxAttempts: 3 })).toBe(JOB_STATUS.FAILED)
  })

  it('marks an explicit skip', () => {
    expect(nextJobStatus({ ok: false, skipped: true, attempts: 1, maxAttempts: 3 })).toBe(JOB_STATUS.SKIPPED)
  })

  it('leaves a requeued job with no finish time', () => {
    const patch = jobResultPatch({ ok: false, error: { retryable: true }, attempts: 1, maxAttempts: 3, now: NOW() })
    expect(patch.status).toBe(JOB_STATUS.PENDING)
    expect(patch.finished_at).toBe(null)
  })
})

describe('classification helpers', () => {
  it('never regenerates a cache hit under any filter', () => {
    for (const filters of [{}, { missingOnly: true }, { staleOnly: true }, { includeRejected: true }]) {
      expect(shouldGenerate(REASON.CACHE_HIT, filters)).toBe(false)
    }
  })

  it('treats legacy audio with no hash as stale', () => {
    expect(classify({ status: AUDIO_STATUS.READY, storage_path: 'legacy.mp3' }, 'abc')).toBe(REASON.STALE)
  })

  it('plans word-only variants when a vocabulary row has no sentence', () => {
    expect(plannedVariants('vocabulary', { hasSentence: false })).toEqual(['word', 'word_slow'])
  })

  it('returns nothing for an unknown source type', () => {
    expect(plannedVariants('podcast')).toEqual([])
  })
})
