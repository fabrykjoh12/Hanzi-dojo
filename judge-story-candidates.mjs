// Semantic quality judging CLI (FAB-9/FAB-10) — reads a candidate batch,
// asks a judge model to score ONLY the writing quality of candidates the
// deterministic gate already passed, and writes the judgments back as
// additive metadata.
//
// It cannot change a verdict: judgeable() refuses anything that is not an
// accepted+PASS candidate, and applyJudgment only appends to a `judgments`
// array. `status` and `validation` are never written here.
//
// No Supabase — this touches candidate FILES only, like the generator.
//
//   node judge-story-candidates.mjs --batch data/story-candidates/bench-a \
//     --provider groq --model qwen/qwen3-32b [--level 3]

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { directProvider, usageDelta, newUsage } from './llmDirect.mjs'
import { judgePrompt, parseJudgment, applyJudgment, judgeable, JUDGE_VERSION } from './storyJudge.mjs'
import { CANDIDATE_FILE_SCHEMA } from './storyStaging.mjs'
import { levelConfig } from './storyLevels.mjs'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] != null ? args[i + 1] : def }

const batchDir = arg('batch', null)
const providerName = arg('provider', null)
const modelId = arg('model', null)
const retries = parseInt(arg('retries', '2'), 10)
const reasoningEffort = arg('reasoning-effort', null)

if (!batchDir || !providerName || !modelId) {
  console.error('Required: --batch <dir> --provider <groq|gemini> --model <id>')
  process.exit(1)
}

const provider = directProvider(providerName, modelId, process.env, { reasoningEffort })
console.log('[judge] ' + providerName + '/' + modelId + ' judging ' + batchDir)

const files = []
for (const name of readdirSync(batchDir).sort()) {
  if (!name.endsWith('.json') || name === 'batch-report.json' || name === 'manifests.json') continue
  const path = join(batchDir, name)
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    if (data && data.schema === CANDIDATE_FILE_SCHEMA) files.push({ path, data })
  } catch (err) {
    console.error('skipping unreadable ' + path + ': ' + err.message)
  }
}

let judged = 0
let skipped = 0
for (const f of files) {
  const id = (f.data.manifest && f.data.manifest.id) || f.path
  const check = judgeable(f.data)
  if (!check.ok) {
    console.log('SKIP   ' + id + ' — ' + check.reason)
    skipped += 1
    continue
  }
  const cfg = levelConfig(f.data.manifest.language, f.data.manifest.system, f.data.manifest.level)
  const prompt = judgePrompt({
    candidate: f.data.candidate,
    manifest: f.data.manifest,
    levelName: (cfg && cfg.levelName) || ('HSK ' + f.data.manifest.level),
  })

  const before = { ...provider.usage }
  const startedAt = Date.now()
  let parsed = null
  let lastError = null
  for (let attempt = 0; attempt <= retries && !parsed; attempt += 1) {
    try {
      parsed = parseJudgment(await provider.send({ prompt, maxTokens: 1200 }))
      if (!parsed) lastError = 'unparseable judgment'
    } catch (err) {
      lastError = String(err.message || err)
      if (attempt < retries) await new Promise(r => setTimeout(r, 4000 * Math.pow(2, attempt)))
    }
  }
  const spent = usageDelta(before, provider.usage)

  if (!parsed) {
    console.log('FAIL   ' + id + ' — judge did not answer: ' + lastError)
    continue
  }

  const judgment = {
    judgeVersion: JUDGE_VERSION,
    judge: { provider: providerName, model: modelId },
    judgedAt: new Date().toISOString(),
    generatedBy: f.data.provider || null,
    ...parsed,
    usage: { ...spent, wallMs: Date.now() - startedAt },
  }
  const updated = applyJudgment(f.data, judgment)
  writeFileSync(f.path, JSON.stringify(updated, null, 2) + '\n')
  judged += 1
  console.log('JUDGED ' + id + ' — overall ' + parsed.overall
    + ' (' + Object.entries(parsed.scores).map(([k, v]) => k + ' ' + v).join(', ') + ')'
    + (parsed.mechanical ? ' [reads mechanical]' : ''))
}

const u = provider.usage
console.log('\nJudged ' + judged + ', skipped ' + skipped + '. '
  + u.requests + ' request(s), ' + u.failures + ' failure(s), '
  + u.promptTokens + '/' + u.completionTokens + ' tokens, ' + u.latencyMsTotal + 'ms total.')
