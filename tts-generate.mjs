#!/usr/bin/env node
//
// Generate speech for flashcards and stories - the ONLY place in this repo that
// spends money on synthesis.
//
// Two safety properties are deliberate and load-bearing:
//   1. It is a DRY RUN unless you pass --confirm. Planning is identical in both
//      modes, so the numbers a dry run prints are the numbers a real run bills.
//   2. It processes at most 20 source records unless you raise --limit, and it
//      refuses a limit above the hard maximum without --override-max. There is
//      no "generate everything" flag.
//
// Credentials are read here and nowhere else: everything under src/tts/ takes
// its configuration as an argument, so no library module can reach a key.
//
//   node --env-file=.env.script tts-generate.mjs --help
//   npm run tts:dry-run
//   npm run tts:generate -- --limit 20 --confirm
//
// See docs/TTS.md for the full runbook.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

import { validateTtsEnv, describeConfig } from './src/tts/config.js'
import { createProvider } from './src/tts/providers/index.js'
import { createTtsRepository } from './src/tts/repository.js'
import { createTtsStorage } from './src/tts/storage.js'
import { createLogger, secretsFromConfig } from './src/tts/log.js'
import { unitsFor } from './src/tts/sources.js'
import { planUnits, runBatchWithJobs, estimateBatch } from './src/tts/runner.js'
import { VARIANT_KEYS } from './src/tts/constants.js'

// --- guard rails -------------------------------------------------------------

// Source RECORDS, not clips: one vocabulary row is up to four clips, so 20
// records is up to 80 requests. Small enough that a mistake is cheap.
const DEFAULT_LIMIT = 20
// Raising past this needs --override-max as well, so a slipped zero in --limit
// cannot turn a 20-record run into a 2000-record one.
const HARD_MAX_LIMIT = 200

// --- argument parsing --------------------------------------------------------

const argv = process.argv.slice(2)
function flag(name) { return argv.indexOf('--' + name) !== -1 }
function opt(name, fallback = null) {
  const i = argv.indexOf('--' + name)
  return i !== -1 && argv[i + 1] && argv[i + 1].indexOf('--') !== 0 ? argv[i + 1] : fallback
}
function list(name) {
  const raw = opt(name, null)
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
}

const HELP = `
Generate Chinese speech for flashcards and stories.

  MODES
    (default)              Dry run: plan and report, spend nothing.
    --confirm              Actually generate. Required for any paid request.
    --retry-failed         Requeue failed jobs and run them again.

  WHAT TO VOICE
    --flashcards           Vocabulary words and example sentences (default).
    --stories              Story utterances.
    --id <uuid,uuid>       Only these source rows.
    --story-id <uuid>      Only the utterances of this story.
    --variant <a,b>        Only these variants (${VARIANT_KEYS.join(', ')}).
    --language <name>      Vocabulary language filter (default: chinese).
    --system <name>        Vocabulary system filter (default: hsk_3).
    --level <n>            Vocabulary level filter.

  WHAT TO SKIP
    --missing-only         Only clips that have never been generated.
    --stale-only           Only clips whose inputs changed.
    --include-rejected     Also regenerate clips a reviewer rejected.

  HOW
    --limit <n>            Source records to process (default ${DEFAULT_LIMIT}, max ${HARD_MAX_LIMIT}).
    --override-max         Allow a limit above ${HARD_MAX_LIMIT}.
    --concurrency <n>      Parallel requests (default from TTS_CONCURRENCY).
    --locale <tag>         Default zh-CN.
    --voice <name>         Override the voice for every clip in this run.
    --provider <name>      azure (default) or mock (free, for rehearsal).
    --json                 Print a machine-readable summary line.
    --quiet                Errors only.
    --help                 This message.
`

if (flag('help')) {
  process.stdout.write(HELP + '\n')
  process.exit(0)
}

const apply = flag('confirm')
const wantsJson = flag('json')
const retryFailed = flag('retry-failed')
const sourceType = (flag('stories') || opt('story-id')) ? 'story_utterance' : 'vocabulary'

// --- environment -------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  process.stderr.write('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. Run with: node --env-file=.env.script tts-generate.mjs\n')
  process.exit(1)
}

let config
try {
  const overrides = {}
  if (opt('provider')) overrides.TTS_DEFAULT_PROVIDER = opt('provider')
  if (opt('locale')) overrides.TTS_DEFAULT_LOCALE = opt('locale')
  if (opt('concurrency')) overrides.TTS_CONCURRENCY = opt('concurrency')
  // A dry run must work on a machine with no credentials at all.
  config = validateTtsEnv({ ...process.env, ...overrides }, { requireCredentials: apply })
} catch (err) {
  process.stderr.write(err.message + '\n')
  process.exit(1)
}

// Every line of output passes through the redactor, so even an accidental
// interpolation of the key cannot reach a terminal or a CI log.
const logger = createLogger({
  level: flag('quiet') ? 'error' : 'info',
  secrets: secretsFromConfig(config),
})

// --- limits ------------------------------------------------------------------

const limitArg = opt('limit')
let limit = limitArg == null ? DEFAULT_LIMIT : Number(limitArg)
if (!Number.isFinite(limit) || limit <= 0 || Math.floor(limit) !== limit) {
  logger.error('--limit must be a positive whole number')
  process.exit(1)
}
if (limit > HARD_MAX_LIMIT && !flag('override-max')) {
  logger.error('--limit ' + limit + ' exceeds the hard maximum of ' + HARD_MAX_LIMIT + ' source records.')
  logger.error('Re-run with --override-max if that is genuinely what you want.')
  process.exit(1)
}

const filters = {
  missingOnly: flag('missing-only'),
  staleOnly: flag('stale-only'),
  includeRejected: flag('include-rejected'),
}
if (filters.missingOnly && filters.staleOnly) {
  logger.error('--missing-only and --stale-only are mutually exclusive')
  process.exit(1)
}

const variantFilter = list('variant')
for (const v of variantFilter) {
  if (VARIANT_KEYS.indexOf(v) === -1) {
    logger.error('Unknown variant "' + v + '". Known variants: ' + VARIANT_KEYS.join(', '))
    process.exit(1)
  }
}
const voiceOverride = opt('voice')

// --- wiring ------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const repository = createTtsRepository(supabase)
const storage = createTtsStorage(supabase)
const worker = hostname() + ':' + process.pid

// Ctrl-C cancels in flight rather than killing mid-upload: claimed jobs are
// released by their stale-claim timeout and the next run picks them up.
const controller = new AbortController()
process.on('SIGINT', () => {
  logger.warn('\nCancelling - finishing the requests already in flight...')
  controller.abort()
})

function pct(n, total) {
  return total === 0 ? '0%' : Math.round((n / total) * 100) + '%'
}

async function loadSourceRows() {
  if (retryFailed) {
    const jobs = await repository.loadFailedJobs({ limit })
    if (jobs.length === 0) return { rows: [], jobs: [] }
    const ids = Array.from(new Set(jobs.map(j => j.source_id)))
    const rows = jobs[0].source_type === 'vocabulary'
      ? await repository.loadVocabulary({ ids })
      : await repository.loadUtterances({ ids })
    return { rows, jobs }
  }
  if (sourceType === 'story_utterance') {
    return { rows: await repository.loadUtterances({ storyId: opt('story-id'), ids: list('id'), limit }), jobs: [] }
  }
  const ids = list('id')
  const level = opt('level') == null ? null : Number(opt('level'))
  return {
    rows: await repository.loadVocabulary({
      language: opt('language', 'chinese'),
      system: opt('system', 'hsk_3'),
      level,
      ids: ids.length ? ids : null,
      limit,
    }),
    jobs: [],
  }
}

async function main() {
  logger.info('Hanzi Dojo speech generation')
  logger.info('  config:', JSON.stringify(describeConfig(config)))
  logger.info('  mode:  ', apply ? 'GENERATE (paid requests will be made)' : 'DRY RUN (nothing will be generated)')
  logger.info('  source:', sourceType, retryFailed ? '(retrying failed jobs)' : '')
  logger.info('  limit: ', limit, 'source records')

  const overrides = await repository.loadOverrides(config.locale)
  logger.info('  pronunciation overrides loaded:', overrides.length)

  const { rows, jobs } = await loadSourceRows()
  if (rows.length === 0) {
    logger.info('\nNothing to do - no matching source records.')
    if (wantsJson) logger.json({ ok: true, dryRun: !apply, records: 0, clips: 0, requests: 0, characters: 0 })
    return
  }
  logger.info('  source records:', rows.length)

  const voices = voiceOverride
    ? { flashcard: voiceOverride, story: voiceOverride, male: voiceOverride }
    : config.voices

  let units = unitsFor(sourceType, rows, { locale: config.locale, voices, overrides })
  if (variantFilter.length) units = units.filter(u => variantFilter.indexOf(u.variant) !== -1)

  const existingAudio = await repository.loadAudioFor(sourceType, rows.map(r => r.id), config.locale)
  const plans = planUnits(units, { existingAudio, providerName: config.provider, filters })

  const invalid = plans.filter(p => p.error)
  for (const bad of invalid) {
    logger.warn('  ! skipping', bad.label || bad.sourceId, '-', bad.error.message)
  }

  const estimate = estimateBatch(plans)
  const cached = plans.filter(p => p.reason === 'cache_hit').length
  logger.info('\nPlan')
  logger.info('  clips considered: ', plans.length)
  logger.info('  already generated:', cached, '(' + pct(cached, plans.length) + ' - no request, no cost)')
  logger.info('  to generate:      ', estimate.clips, 'clips across', estimate.sourceRecords, 'records')
  logger.info('  by reason:        ', JSON.stringify(estimate.byReason))
  logger.info('  by variant:       ', JSON.stringify(estimate.byVariant))
  logger.info('  estimated requests:  ', estimate.requests)
  logger.info('  estimated characters:', estimate.characters)

  if (!apply) {
    logger.info('\nDRY RUN - nothing was generated and nothing was billed.')
    logger.info('Re-run with --confirm to generate these ' + estimate.clips + ' clips.')
    if (wantsJson) {
      logger.json({
        ok: true, dryRun: true, records: estimate.sourceRecords, clips: estimate.clips,
        requests: estimate.requests, characters: estimate.characters,
        byReason: estimate.byReason, byVariant: estimate.byVariant, invalid: invalid.length,
      })
    }
    return
  }

  if (estimate.clips === 0) {
    logger.info('\nEverything is already generated and current. No requests made.')
    if (wantsJson) logger.json({ ok: true, dryRun: false, clips: 0, requests: 0, characters: 0 })
    return
  }

  const provider = createProvider(config)
  const batchId = randomUUID()

  if (retryFailed && jobs.length) {
    await repository.requeueJobs(jobs.map(j => j.id), batchId)
    logger.info('\nRequeued', jobs.length, 'failed jobs into batch', batchId)
  }

  logger.info('\nGenerating', estimate.clips, 'clips (batch ' + batchId + ', concurrency ' + config.concurrency + ')...')
  const startedAt = Date.now()
  const summary = await runBatchWithJobs(plans, {
    batchId, worker, provider, storage, repository, config, logger,
    signal: controller.signal,
  })
  const seconds = Math.round((Date.now() - startedAt) / 1000)

  logger.info('\nDone in ' + seconds + 's')
  logger.info('  generated: ', summary.generated)
  logger.info('  reused:    ', summary.deduped, '(identical audio was already stored)')
  logger.info('  skipped:   ', summary.skipped)
  logger.info('  failed:    ', summary.failed)
  logger.info('  requests:  ', summary.requests)
  logger.info('  characters:', summary.characters)
  for (const failure of summary.failures) {
    logger.error('  x', failure.variant, failure.sourceId, '-', failure.code, failure.message)
  }
  if (summary.failed > 0) {
    logger.info('\nRetry the failures with: npm run tts:retry-failed -- --limit ' + limit + ' --confirm')
  }

  if (wantsJson) {
    logger.json({
      ok: summary.failed === 0, dryRun: false, batchId,
      generated: summary.generated, deduped: summary.deduped, skipped: summary.skipped,
      failed: summary.failed, requests: summary.requests, characters: summary.characters,
      seconds, failures: summary.failures,
    })
  }
  if (summary.failed > 0) process.exitCode = 1
}

main().catch(err => {
  // The logger redacts, so this is safe even if a message picked something up.
  const message = String(err.message || err)
  logger.error('Generation run failed:', message)
  // By far the most likely first-run failure, and the raw PostgREST wording
  // ("could not find the table in the schema cache") does not say what to do.
  if (message.indexOf('tts_audio') !== -1
    || message.indexOf('tts_jobs') !== -1
    || message.indexOf('tts_pronunciation_overrides') !== -1
    || message.indexOf('story_utterances') !== -1) {
    logger.error('')
    logger.error('The speech tables are missing. Apply these migrations first:')
    logger.error('  supabase/migrations/20260722140000_add_tts_audio.sql')
    logger.error('  supabase/migrations/20260722150000_add_story_utterances.sql')
    logger.error('(Supabase SQL editor, or the GitHub integration on merge.) See docs/TTS.md.')
  }
  process.exit(1)
})
