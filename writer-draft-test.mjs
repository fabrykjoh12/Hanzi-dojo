// Controlled writer test (FAB-9): ONE draft from ONE model against a STORED
// manifest, validated, reported, written to a file. Nothing else — no editor,
// no simplification, no micro-repair, no retries of the generation itself
// (rate-limit waiting inside llmDirect is transport, not another generation).
//
// Exists to answer questions like "does reasoning_effort=low fix Qwen's
// length/format compliance?" with a single-variable experiment: same
// manifest, same validator, same prompt builder — only the model knob moves.
//
// No Supabase capability, like every generation-side tool.
//
//   node writer-draft-test.mjs --input reports/story-corpus-dump.json \
//     --manifest data/story-candidates/duo-2/duo-2-L3-002.json \
//     --provider groq --model qwen/qwen3.6-27b --reasoning-effort low \
//     --out data/story-candidates/writer-test-1

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { publishedChineseStories } from './storyCoverage.mjs'
import { validateCandidate, formatValidation, serializableValidation } from './storyCandidateValidation.mjs'
import { draftPrompt, parseChapter, PROMPT_VERSION } from './storyGenPrompts.mjs'
import { outputBudget } from './storyGenPipeline.mjs'
import { directProvider } from './llmDirect.mjs'
import { CANDIDATE_FILE_SCHEMA } from './storyStaging.mjs'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] != null ? args[i + 1] : def }

const inputPath = arg('input', null)
const manifestPath = arg('manifest', null)
const providerName = arg('provider', null)
const modelId = arg('model', null)
const reasoningEffort = arg('reasoning-effort', null)
const outDir = arg('out', null)

if (!inputPath || !manifestPath || !providerName || !modelId || !outDir) {
  console.error('Required: --input <dump> --manifest <candidate-or-manifest.json> --provider <p> --model <m> --out <dir>  [--reasoning-effort e]')
  process.exit(1)
}

// The manifest may arrive as a bare manifest or inside a candidate file.
const manifestRaw = JSON.parse(readFileSync(manifestPath, 'utf8'))
const manifest = manifestRaw.manifest || manifestRaw
if (!manifest || !manifest.schema) { console.error('No manifest found in ' + manifestPath); process.exit(1) }
console.log('[writer-test] manifest ' + manifest.id + ' — targets: ' + manifest.targets.map(t => t.word + '(' + t.min + '-' + t.max + ')').join(' '))

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))
const stories = publishedChineseStories(raw.stories)
const vocab = raw.vocab || []
const vocabMap = {}
for (const v of vocab) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v
const pool = vocab
  .filter(v => Number.isFinite(v.level) && v.level <= manifest.level)
  .sort((a, b) => (a.level - b.level) || ((a.sort_order || 0) - (b.sort_order || 0)))
  .map(v => ({ word: v.word, level: v.level, meaning: v.meaning || null }))
const meanings = Object.fromEntries(vocab.filter(v => v.meaning).map(v => [v.word, v.meaning]))

const p = directProvider(providerName, modelId, process.env, { reasoningEffort })
console.log('[writer-test] ' + p.name + '/' + p.model + (reasoningEffort ? ' reasoning_effort=' + reasoningEffort : ''))

const startedAt = Date.now()
const prompt = draftPrompt({ manifest, pool, meanings })
let text = null
let error = null
try {
  text = await p.send({ prompt, maxTokens: outputBudget(manifest, 'draft') })
} catch (err) {
  error = String(err.message || err)
}
const wallMs = Date.now() - startedAt

const candidate = text ? parseChapter(text) : null
const validation = candidate
  ? validateCandidate(candidate, { manifest, vocabMap, corpus: stories })
  : { validatorVersion: 'n/a', verdict: 'FAIL', failures: [{ code: error ? 'provider_error' : 'unparseable', message: error || 'draft was unparseable' }], warnings: [], metrics: {} }

mkdirSync(outDir, { recursive: true })
const file = {
  schema: CANDIDATE_FILE_SCHEMA,
  batchId: 'writer-test',
  generatedAt: new Date().toISOString(),
  provider: { name: p.name, model: p.model, reasoningEffort: reasoningEffort || null },
  manifest,
  candidate: {
    manifestId: manifest.id,
    status: validation.verdict === 'PASS' ? 'accepted' : 'rejected',
    title: candidate ? candidate.title : null,
    content: candidate ? candidate.content : null,
    englishContent: null,
    validation: serializableValidation(validation),
    critique: null,
    attempts: 1,
    calls: p.usage.requests,
    generatorVersion: 'fab9-writer-test@1',
    promptVersion: PROMPT_VERSION,
    usage: { ...p.usage, wallMs },
    rawSample: candidate ? null : String(text || '').slice(0, 400),
  },
  staged: null,
}
const outPath = join(outDir, manifest.id + '-' + (reasoningEffort || 'default') + '.json')
writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n')
console.log('wrote ' + outPath)

console.log('\n=== RESULT ===')
console.log(formatValidation(validation))
const met = validation.metrics || {}
if (met.lines) {
  console.log('lines: ' + met.lines + ' | targetCounts: ' + JSON.stringify(met.targetCounts))
  console.log('out-of-level: ' + met.outOfLevelDistinct + ' distinct / ' + (met.outOfLevelCharShare * 100).toFixed(1) + '%'
    + ' | unknown: ' + met.unknownDistinct + ' / ' + (met.unknownCharShare * 100).toFixed(1) + '%')
}
console.log('usage: ' + JSON.stringify({ ...p.usage, wallMs }))
if (candidate) {
  console.log('\nTITLE: ' + candidate.title)
  console.log(candidate.content)
}
