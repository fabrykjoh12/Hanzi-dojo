// Targeted story generation — the FAB-9 batch runner.
//
//   coverage report → coverage plan → manifests → generate → validate →
//   repair → candidate files + batch report
//
// HARD BOUNDARY (FAB-10 safety): this tool has NO Supabase capability of any
// kind — no client import, no insert, no update, no delete, not even a read.
// Everything it knows comes from `--input`, a corpus dump file; everything it
// produces is files under data/story-candidates/<batch>/. Moving an accepted
// candidate into the database is a different tool (stage-story-candidates.mjs)
// with its own gate. Keep it that way: a supabase-js import appearing in this
// file is a bug by definition.
//
//   node generate-targeted-stories.mjs --input reports/story-corpus-dump.json \
//     --level 3 --count 3 --batch b0821 [--provider fake --responses r.json]
//
//   --input      { stories, vocab } dump (audit-story-coverage.mjs shape).
//                Refresh it before a real batch: the audit's fetch, or the
//                hash-verified assembly documented in docs/ARCHITECTURE.md.
//   --level      HSK level to target (required)
//   --count      manifests to compose (default 3)
//   --batch      batch id, names the output directory (required)
//   --out        base output dir (default data/story-candidates)
//   --goal       target available-story exposure per word (default 2)
//   --batch-cap  max manifests per word per batch (default 2)
//   --targets    targets per story (default: calibrated per-level)
//   --meanings   optional word→meaning JSON, enriches prompts
//   --provider   'fake' (default; needs --responses) or 'premium'
//                (llm.mjs premium tier — Anthropic/Gemini/Groq by env keys)
//   --responses  fake provider script: { "<manifestId>"|"*": { draft: [..],
//                repair: [..], critique: [..], revise: [..], translate: [..] } }
//   --dry-run    compose and write manifests + plan only; zero provider calls
//
// The batch report includes a PROJECTED coverage delta: the FAB-5 report
// recomputed with the accepted candidates appended — an estimate of what
// staging + publishing this batch would do to the level's zero/single buckets.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { publishedChineseStories, buildCoverageReport } from './storyCoverage.mjs'
import { buildCoveragePlan, selectTargets, recordAcceptedCandidate, planSummary } from './storyCoveragePlanner.mjs'
import { composeManifests, manifestDefaults } from './storyManifestPlanner.mjs'
import { generateCandidate, serializableCandidate, GENERATOR_VERSION } from './storyGenPipeline.mjs'
import { PROMPT_VERSION } from './storyGenPrompts.mjs'
import { CANDIDATE_FILE_SCHEMA } from './storyStaging.mjs'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] != null ? args[i + 1] : def }
const has = (name) => args.includes('--' + name)

const inputPath = arg('input', null)
const level = parseInt(arg('level', ''), 10)
const count = parseInt(arg('count', '3'), 10)
const batchId = arg('batch', null)
const outBase = arg('out', 'data/story-candidates')
const goal = parseInt(arg('goal', '2'), 10)
const batchCap = parseInt(arg('batch-cap', '2'), 10)
const targetsPerStory = arg('targets', null) ? parseInt(arg('targets', null), 10) : null
const meaningsPath = arg('meanings', null)
const providerName = arg('provider', 'fake')
const responsesPath = arg('responses', null)
const dryRun = has('dry-run')

if (!inputPath || !Number.isFinite(level) || !batchId) {
  console.error('Required: --input <dump.json> --level <n> --batch <id>  [--count n] [--dry-run] [--provider fake|premium] [--responses <file>]')
  process.exit(1)
}

// ── Providers ────────────────────────────────────────────────────────────────

// Scripted fake: per-manifest (or "*") FIFO queues, for pipeline verification
// without a vendor. Runs out of script → the pipeline's own retry/rejection
// handling takes over, exactly like a misbehaving real model.
function fakeProvider(responses, manifestId) {
  const scripts = responses[manifestId] || responses['*'] || {}
  const queues = Object.fromEntries(Object.entries(scripts).map(([k, v]) => [k, [...v]]))
  return async ({ kind }) => {
    const q = queues[kind]
    if (!q || q.length === 0) throw new Error('fake provider: no scripted "' + kind + '" response for ' + manifestId)
    return q.shift()
  }
}

// The real tier reuses llm.mjs (premiumLlm: Anthropic when ANTHROPIC_API_KEY
// is set, else the Gemini/Groq chain) — imported lazily so the fake path
// never demands an API key.
async function premiumProvider() {
  const { premiumLlm } = await import('./llm.mjs')
  const { client, model, provider } = premiumLlm()
  console.log('[generate-targeted] provider=' + provider + ' model=' + model)
  const usage = { promptTokens: 0, completionTokens: 0, requests: 0 }
  const send = async ({ prompt, maxTokens }) => {
    const response = await client.chat.completions.create({
      model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }],
    })
    usage.requests += 1
    if (response && response.usage) {
      usage.promptTokens += response.usage.prompt_tokens || 0
      usage.completionTokens += response.usage.completion_tokens || 0
    }
    const choice = response && response.choices && response.choices[0]
    let text = choice && choice.message && choice.message.content
    if (Array.isArray(text)) text = text.map(p => (typeof p === 'string' ? p : (p && p.text) || '')).join('')
    return typeof text === 'string' ? text : ''
  }
  return { send, name: provider, model, usage }
}

// ── Load the world ───────────────────────────────────────────────────────────

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))
const stories = publishedChineseStories(raw.stories)
const vocab = raw.vocab || []
const meanings = meaningsPath ? JSON.parse(readFileSync(meaningsPath, 'utf8')) : {}

const vocabMap = {}
for (const v of vocab) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v
// Prompt pool: everything at or below the level, frequency-ordered, meanings attached.
const pool = vocab
  .filter(v => Number.isFinite(v.level) && v.level <= level)
  .sort((a, b) => (a.level - b.level) || ((a.sort_order || 0) - (b.sort_order || 0)))
  .map(v => ({ word: v.word, level: v.level, meaning: meanings[v.word] || v.meaning || null }))

console.log('Coverage audit over ' + stories.length + ' stories, ' + vocab.length + ' vocabulary items...')
const report = buildCoverageReport({ stories, vocab })

let plan = buildCoveragePlan({ words: report.words, level, goal, batchCap })
const before = planSummary(plan)
console.log('HSK ' + level + ' plan: ' + before.totalTargets + ' under-covered words (goal ' + goal + ' stories each).')

const defaults = targetsPerStory ? { targetsPerStory } : undefined
const composed = await composeManifests({ batchId, level, plan, select: selectTargets, count, defaults })
plan = composed.plan
const manifests = composed.manifests
console.log('Composed ' + manifests.length + ' manifest(s), ' + (manifestDefaults(level).targetsPerStory) + ' targets/story default.')

const outDir = join(outBase, batchId)
mkdirSync(outDir, { recursive: true })
const write = (name, data) => {
  const p = join(outDir, name)
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
  console.log('wrote ' + p)
}

if (dryRun) {
  write('manifests.json', { batchId, level, generatedAt: new Date().toISOString(), manifests, plan: planSummary(plan) })
  console.log('\nDry run — no generation performed.')
  process.exit(0)
}

// ── Generate ─────────────────────────────────────────────────────────────────

let providerInfo
let responses = null
if (providerName === 'fake') {
  if (!responsesPath) { console.error('--provider fake needs --responses <file>'); process.exit(1) }
  responses = JSON.parse(readFileSync(responsesPath, 'utf8'))
  providerInfo = { name: 'fake', model: 'scripted:' + responsesPath }
} else if (providerName === 'premium') {
  const p = await premiumProvider()
  providerInfo = { name: p.name, model: p.model, send: p.send, usage: p.usage }
} else {
  console.error('Unknown --provider "' + providerName + '" (fake | premium)')
  process.exit(1)
}

const results = []
const acceptedContents = []
for (const manifest of manifests) {
  process.stdout.write(manifest.id + ': ' + manifest.targets.map(t => t.word).join('、') + ' ... ')
  const provider = providerInfo.name === 'fake'
    ? fakeProvider(responses, manifest.id)
    : providerInfo.send
  // Dedup corpus: every published story plus this batch's own accepted candidates.
  const corpus = stories.concat(acceptedContents)
  let result
  try {
    result = await generateCandidate({ manifest, pool, vocabMap, corpus, meanings, provider })
  } catch (err) {
    result = {
      manifestId: manifest.id, status: 'rejected', title: null, content: null, englishContent: null,
      validation: { verdict: 'FAIL', failures: [{ code: 'pipeline_error', message: String(err.message || err) }], warnings: [], metrics: {} },
      critique: null, attempts: 0, calls: 0,
      generatorVersion: GENERATOR_VERSION, promptVersion: PROMPT_VERSION,
    }
  }
  console.log(result.status.toUpperCase()
    + (result.critique ? ' (score ' + result.critique.score + ')' : '')
    + (result.status === 'rejected' ? ' — ' + result.validation.failures.map(f => f.code).join(', ') : ''))

  if (result.status === 'accepted') {
    plan = recordAcceptedCandidate(plan, {
      counts: result.validation.metrics.counts,
      minOccurrences: 1,
    })
    acceptedContents.push({ title: result.title, level, content: result.content })
  }

  const fileData = {
    schema: CANDIDATE_FILE_SCHEMA,
    batchId,
    generatedAt: new Date().toISOString(),
    provider: { name: providerInfo.name, model: providerInfo.model },
    manifest,
    candidate: serializableCandidate(result),
    staged: null,
  }
  write(manifest.id + '.json', fileData)
  results.push({ manifest, result })
}

// ── Batch report ─────────────────────────────────────────────────────────────

const accepted = results.filter(r => r.result.status === 'accepted')
const failureHistogram = {}
for (const { result } of results) {
  for (const f of result.validation.failures) failureHistogram[f.code] = (failureHistogram[f.code] || 0) + 1
}

// Projected coverage: the audit re-run with accepted candidates appended.
const zeroSingle = (rep) => {
  const l = rep.byVocabLevel.find(x => x.vocabLevel === level)
  return l ? { zero: l.availableByLevel.zero, single: l.availableByLevel.single, pctZero: l.availableByLevel.pctZero } : null
}
const projectedStories = stories.concat(accepted.map(({ result }) => ({
  id: null, title: result.title, level, language: 'chinese', is_published: true, content: result.content,
})))
const projected = buildCoverageReport({ stories: projectedStories, vocab })

write('batch-report.json', {
  batchId,
  level,
  generatedAt: new Date().toISOString(),
  provider: { name: providerInfo.name, model: providerInfo.model },
  versions: { generator: GENERATOR_VERSION, prompts: PROMPT_VERSION },
  manifests: manifests.length,
  accepted: accepted.length,
  rejected: results.length - accepted.length,
  totalProviderCalls: results.reduce((s, r) => s + (r.result.calls || 0), 0),
  tokenUsage: providerInfo.usage || null,
  failureHistogram,
  plan: { before, after: planSummary(plan) },
  coverage: { current: zeroSingle(report), projectedIfPublished: zeroSingle(projected) },
  candidates: results.map(({ manifest, result }) => ({
    manifestId: manifest.id,
    status: result.status,
    title: result.title,
    critiqueScore: result.critique ? result.critique.score : null,
    failures: result.validation.failures.map(f => f.code),
    warnings: result.validation.warnings.map(w => w.code),
  })),
})

const cur = zeroSingle(report)
const proj = zeroSingle(projected)
console.log('\nBatch ' + batchId + ': ' + accepted.length + '/' + results.length + ' accepted.')
if (cur && proj) {
  console.log('HSK ' + level + ' zero-exposure words: ' + cur.zero + ' now → ' + proj.zero + ' if this batch is staged AND published (projection only — nothing was written to the database).')
}
console.log('Candidates live in ' + outDir + ' — review, then stage-story-candidates.mjs is the (separate) door into Supabase.')
