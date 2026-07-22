// Database access for the TTS pipeline.
//
// Every method takes the injected Supabase client, so the runner can be tested
// against an in-memory fake and this file stays the only place that knows the
// table and column names.
//
// Runs with the SERVICE key (the CLI), which bypasses RLS - the tables carry no
// write policy at all, so no browser session can reach these paths.

import { normalizeOverride } from './overrides.js'
import { AUDIO_STATUS, JOB_STATUS } from './constants.js'

// PostgREST builds the filter into the URL, so a very wide `.in()` produces a
// request the gateway rejects with an opaque failure. The dictionary seeder hit
// exactly this; chunking is the fix.
const ID_CHUNK = 150

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function fail(context, error) {
  throw new Error(context + ': ' + (error.message || String(error)))
}

// PostgREST caps a response at 1000 rows regardless of .limit(), so a naive
// query silently truncates a library of 2,400 words to 1,000 - and a cost
// estimate built on that is wrong in the direction that matters. Page through
// with .range() instead.
//
// `build()` must return a FRESH query each call: Supabase query builders are
// single-use.
const PAGE = 1000

async function fetchAllPages(build, context, limit = null) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const want = limit == null ? PAGE : Math.min(PAGE, limit - rows.length)
    if (want <= 0) break
    const { data, error } = await build().range(from, from + want - 1)
    if (error) fail(context, error)
    rows.push(...(data || []))
    if (!data || data.length < want) break
  }
  return rows
}

export function createTtsRepository(client) {
  return {
    // --- pronunciation overrides -------------------------------------------
    async loadOverrides(locale) {
      const { data, error } = await client
        .from('tts_pronunciation_overrides')
        .select('*')
        .eq('locale', locale)
      if (error) fail('Could not load pronunciation overrides', error)
      return (data || []).map(normalizeOverride)
    },

    // --- source content -----------------------------------------------------
    async loadVocabulary({ language, system, level, ids = null, limit = null }) {
      const build = () => {
        let query = client
          .from('vocabulary')
          .select('id, language, system, level, word, reading, example_sentence')
          .eq('is_active', true)
          .order('level', { ascending: true })
          .order('sort_order', { ascending: true })
        if (language) query = query.eq('language', language)
        if (system) query = query.eq('system', system)
        if (level != null) query = query.eq('level', level)
        if (ids && ids.length) query = query.in('id', ids)
        return query
      }
      return fetchAllPages(build, 'Could not load vocabulary', limit)
    },

    async loadUtterances({ storyId = null, ids = null, limit = null }) {
      const build = () => {
        let query = client
          .from('story_utterances')
          .select('*')
          .order('story_id', { ascending: true })
          .order('scene_index', { ascending: true })
          .order('utterance_index', { ascending: true })
        if (storyId) query = query.eq('story_id', storyId)
        if (ids && ids.length) query = query.in('id', ids)
        return query
      }
      return fetchAllPages(build, 'Could not load story utterances', limit)
    },

    // --- generated audio ----------------------------------------------------
    // Returns a map keyed `sourceId|variant` so the planner can look up what
    // already exists in constant time.
    async loadAudioFor(sourceType, sourceIds, locale) {
      const map = {}
      for (const part of chunk(Array.from(new Set(sourceIds || [])), ID_CHUNK)) {
        if (!part.length) continue
        const { data, error } = await client
          .from('tts_audio')
          .select('*')
          .eq('source_type', sourceType)
          .eq('locale', locale)
          .in('source_id', part)
        if (error) fail('Could not load existing audio', error)
        for (const row of data || []) map[row.source_id + '|' + row.variant] = row
      }
      return map
    },

    // One row per (entity, variant, locale) - the unique constraint makes this
    // an idempotent write whether the row is new or a regeneration.
    async upsertAudio(record) {
      const { data, error } = await client
        .from('tts_audio')
        .upsert(record, { onConflict: 'source_type,source_id,variant,locale' })
        .select()
        .single()
      if (error) fail('Could not save audio metadata', error)
      return data
    },

    // Mark stored audio stale without touching the file: it keeps playing until
    // a regeneration replaces it.
    async markStale(ids) {
      if (!ids || !ids.length) return 0
      const { error } = await client
        .from('tts_audio')
        .update({ status: AUDIO_STATUS.STALE })
        .in('id', ids)
        .eq('status', AUDIO_STATUS.READY)
      if (error) fail('Could not mark audio stale', error)
      return ids.length
    },

    // --- jobs ---------------------------------------------------------------
    // The partial unique index rejects a second live job for the same clip, so a
    // concurrent run cannot double-queue (and therefore cannot double-bill).
    // Those conflicts are expected, not exceptional.
    async insertJobs(jobs) {
      const inserted = []
      for (const part of chunk(jobs || [], ID_CHUNK)) {
        if (!part.length) continue
        const { data, error } = await client.from('tts_jobs').insert(part).select()
        if (error) {
          if (String(error.message || '').indexOf('tts_jobs_active_unique') !== -1) continue
          fail('Could not queue generation jobs', error)
        }
        inserted.push(...(data || []))
      }
      return inserted
    },

    // Atomic claim via the security-definer RPC (FOR UPDATE SKIP LOCKED), which
    // is what makes two workers and a restarted run safe.
    async claimJobs({ batchId, worker, limit = 20 }) {
      const { data, error } = await client.rpc('tts_claim_jobs', {
        p_batch_id: batchId, p_worker: worker, p_limit: limit,
      })
      if (error) fail('Could not claim generation jobs', error)
      return data || []
    },

    async patchJob(id, patch) {
      const { error } = await client.from('tts_jobs').update(patch).eq('id', id)
      if (error) fail('Could not update job ' + id, error)
    },

    async loadFailedJobs({ limit = 20, batchId = null }) {
      let query = client
        .from('tts_jobs')
        .select('*')
        .eq('status', JOB_STATUS.FAILED)
        .order('updated_at', { ascending: true })
        .limit(limit)
      if (batchId) query = query.eq('batch_id', batchId)
      const { data, error } = await query
      if (error) fail('Could not load failed jobs', error)
      return data || []
    },

    // Requeue: reset the attempt counter so a fixed problem gets a full budget.
    async requeueJobs(ids, batchId) {
      if (!ids || !ids.length) return 0
      const { error } = await client
        .from('tts_jobs')
        .update({ status: JOB_STATUS.PENDING, attempts: 0, batch_id: batchId, error_code: null, error_message: null })
        .in('id', ids)
      if (error) fail('Could not requeue jobs', error)
      return ids.length
    },
  }
}
