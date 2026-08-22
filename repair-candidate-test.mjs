// Deterministic repair test (FAB-9): plan the repair of ONE stored draft in
// code, print the plan BEFORE any model is called, then ask a model for the
// individual replacement lines the plan asked for — one line per call, each
// gated before it may touch the story — and run the complete FAB-10 validator
// on the result.
//
// The model never chooses an operation. If the plan does not fit the operation
// budget, no call is made at all.
//
// No Supabase, like every generation-side tool.
//
//   node repair-candidate-test.mjs --input reports/story-corpus-dump.json \
//     --candidate data/story-candidates/select-1/duo-2-L3-002.json --stage draft-1 \
//     --writers groq:openai/gpt-oss-120b:low,groq:qwen/qwen3.6-27b:none \
//     --critic groq:qwen/qwen3.6-27b --critic-effort none \
//     --out data/story-candidates/repair-1

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { publishedChineseStories } from './storyCoverage.mjs'
import { validateCandidate, validateEdit, formatValidation, serializableValidation } from './storyCandidateValidation.mjs'
import { lineRewritePrompt, parseSingleLine, PROMPT_VERSION } from './storyGenPrompts.mjs'
import { MANIFEST_DEFAULTS } from './storyManifestPlanner.mjs'
import { applyStructuralPatch, patchRegressions } from './storySelectPipeline.mjs'
import { planRepair, executeRepairPlan, REPAIR_PLANNER_VERSION } from './storyRepairPlanner.mjs'
import { judgePrompt, parseJudgment, JUDGE_VERSION } from './storyJudge.mjs'
import { directProvider } from './llmDirect.mjs'
import { CANDIDATE_FILE_SCHEMA } from './storyStaging.mjs'
import { levelConfig } from './storyLevels.mjs'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] != null ? args[i + 1] : def }

const inputPath = arg('input', null)
const candidatePath = arg('candidate', null)
const stageName = arg('stage', 'draft-1')
const writerSpecs = String(arg('writers', '')).split(',').map(s => s.trim()).filter(Boolean)
const criticSpec = arg('critic', null)
const criticEffort = arg('critic-effort', null)
const outDir = arg('out', null)
const budget = parseInt(arg('budget', '6'), 10)

if (!inputPath || !candidatePath || !writerSpecs.length || !outDir) {
  console.error('Required: --input <dump> --candidate <file> --writers <p:m[:effort],…> --out <dir>  [--stage draft-1] [--critic <p:m>] [--budget 6]')
  process.exit(1)
}

const stored = JSON.parse(readFileSync(candidatePath, 'utf8'))
const manifest = stored.manifest
const levelDefaults = MANIFEST_DEFAULTS[manifest && manifest.level] || {}
if (manifest && manifest.difficulty && manifest.difficulty.reviewMaxOutOfLevelCharShare == null
  && levelDefaults.reviewMaxOutOfLevelCharShare != null) {
  manifest.difficulty = { ...manifest.difficulty, reviewMaxOutOfLevelCharShare: levelDefaults.reviewMaxOutOfLevelCharShare }
}
const stage = (stored.candidate.stages || []).find(s => s.stage === stageName)
if (!manifest || !stage || !stage.content) { console.error('Stage ' + stageName + ' not found in ' + candidatePath); process.exit(1) }
const original = { title: stage.title, content: stage.content }
const originalLines = original.content.split('\n').map(l => l.trim()).filter(Boolean)

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))
const stories = publishedChineseStories(raw.stories)
const vocab = raw.vocab || []
const vocabMap = {}
for (const v of vocab) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v
const meanings = Object.fromEntries(vocab.filter(v => v.meaning).map(v => [v.word, v.meaning]))

// ── 1. Fresh validation, then the deterministic plan — before any model ──────
const before = validateCandidate(original, { manifest, vocabMap, corpus: stories })
const plan = planRepair({ candidate: original, validation: before, manifest, vocabMap, budget })

const pct = (x) => (x * 100).toFixed(1) + '%'
console.log('=== BEFORE ===\n' + formatValidation(before))
console.log('\n=== DETERMINISTIC REPAIR PLAN (' + REPAIR_PLANNER_VERSION + ', no model involved) ===')
console.log('story: ' + plan.metrics.lines + ' lines (max ' + plan.metrics.maxLines + '), '
  + plan.metrics.outChars + '/' + plan.metrics.cjkChars + ' characters above level = ' + pct(plan.metrics.share)
  + ' (ceiling ' + pct(plan.metrics.ceiling) + ')')
console.log('required: reduce ' + plan.required.lineReduction + ' line(s); '
  + 'missing targets ' + (plan.required.missingTargets.map(t => t.word + ' ' + t.have + '→' + t.min).join(', ') || 'none') + '; '
  + 'unknown runs ' + plan.required.unknownDistinct + ' (cap ' + plan.required.unknownCap + ')')
for (const [run, at] of Object.entries(plan.required.unknownRuns)) console.log('  unknown ' + run + ' on line ' + at.join(', '))
console.log('\nDELETE (' + plan.deletes.length + '):')
for (const d of plan.deletes) {
  console.log('  line ' + d.line + ' — ' + d.reason)
  console.log('    ' + d.text)
}
console.log('\nREPLACE (' + plan.replaces.length + '):')
for (const t of plan.replaces) {
  console.log('  line ' + t.line + ' — ' + t.reasons.join('; ') + (t.speaker ? ' [speaker ' + t.speaker + ']' : ' [narration]'))
  console.log('    ' + t.text)
}
console.log('\nprojected from the deterministic deletions alone: ' + plan.projected.ops + '/' + budget + ' operations, '
  + plan.projected.lines + ' lines, out-of-level ' + pct(plan.metrics.share) + ' → ' + pct(plan.projected.share)
  + ' (' + (plan.projected.shareDelta >= 0 ? '+' : '') + (plan.projected.shareDelta * 100).toFixed(1) + ' points), '
  + 'unknown runs left: ' + (plan.projected.unknownRunsRemaining.join('、') || 'none'))

let executed = null
let patched = null
let after = null
let editCheck = null
let regressions = []

if (!plan.feasible) {
  console.log('\nIMPOSSIBLE (deterministic, no model called): ' + plan.impossible)
} else {
  // ── 2. One tiny generation task per planned replacement ───────────────────
  const generators = writerSpecs.map(spec => {
    const [provider, ...rest] = spec.split(':')
    const model = rest.slice(0, rest.length > 1 ? -1 : rest.length).join(':')
    const effort = rest.length > 1 ? rest[rest.length - 1] : null
    const p = directProvider(provider, model, process.env, { reasoningEffort: effort })
    return { name: provider + ':' + model + (effort ? '/' + effort : ''), send: p.send, usage: p.usage }
  })
  console.log('\n=== LINE GENERATION (' + plan.replaces.length + ' task(s) × ' + generators.length + ' model(s)) ===')

  executed = await executeRepairPlan({
    plan,
    manifest,
    vocabMap,
    meanings,
    generators,
    buildPrompt: ({ manifest: m, task, meanings: mn, feedback }) => lineRewritePrompt({
      manifest: m,
      task,
      meanings: mn,
      feedback,
      context: {
        before: originalLines.slice(Math.max(0, task.line - 3), task.line - 1).map((l, i) => (task.line - Math.min(2, task.line - 1) + i) + ': ' + l),
        after: originalLines.slice(task.line, task.line + 2).map((l, i) => (task.line + 1 + i) + ': ' + l),
      },
    }),
    parseLine: parseSingleLine,
    attemptsPerGenerator: 2,
    maxTokens: 2500,
  })

  for (const a of executed.attempts) {
    console.log('  line ' + a.line + ' · ' + a.generator + ' · try ' + a.attempt + ' → ' + (a.ok ? 'PASS' : 'REJECT'))
    console.log('    ' + (a.output || '(nothing usable)'))
    if (!a.ok) for (const f of a.failures) console.log('      ✗ ' + f.code + ': ' + f.message)
  }
  console.log('  compliance: ' + Object.entries(executed.compliance).map(([n, c]) => n + ' ' + c.passed + '/' + c.attempts + ' passed, ' + c.adopted + ' adopted').join(' | '))

  // ── 3. Apply the whole plan, then the complete validator ──────────────────
  if (executed.unresolved.length) {
    console.log('\nUNRESOLVED line(s): ' + executed.unresolved.map(u => u.line).join(', ') + ' — the plan cannot be applied in full')
  }
  patched = { title: original.title, content: applyStructuralPatch(original.content, executed.ops) }
  editCheck = validateEdit(original, patched, { allowNewSpeakers: false })
  const v = validateCandidate(patched, { manifest, vocabMap, corpus: stories })
  regressions = patchRegressions(before, v)
  after = {
    ...v,
    verdict: (editCheck.ok && regressions.length === 0 && executed.unresolved.length === 0) ? v.verdict : 'FAIL',
    failures: [
      ...v.failures,
      ...editCheck.failures,
      ...regressions.map(code => ({ code: 'regression_' + code, message: 'gate ' + code + ' was satisfied before the repair and is not after' })),
      ...executed.unresolved.map(u => ({ code: 'line_unresolved', message: 'no compliant replacement for line ' + u.line })),
    ],
    warnings: [...v.warnings, ...editCheck.warnings],
    metrics: { ...v.metrics, edit: editCheck.metrics },
  }
  console.log('\n=== AFTER ===\n' + formatValidation(after))
}

// ── 4. Critique + the finished story, on PASS or REVIEW_REQUIRED ─────────────
let critique = null
let criticUsage = null
if (after && (after.verdict === 'PASS' || after.verdict === 'REVIEW_REQUIRED') && criticSpec) {
  const critic = directProvider(criticSpec.slice(0, criticSpec.indexOf(':')), criticSpec.slice(criticSpec.indexOf(':') + 1), process.env, { reasoningEffort: criticEffort })
  try {
    const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
    const text = await critic.send({ prompt: judgePrompt({ candidate: patched, manifest, levelName: (cfg && cfg.levelName) || ('HSK ' + manifest.level) }), maxTokens: 1500 })
    const parsed = parseJudgment(text)
    if (parsed) critique = { judgeVersion: JUDGE_VERSION, judge: { provider: critic.name, model: critic.model }, ...parsed }
  } catch (err) { console.error('critique failed: ' + (err.message || err)) }
  criticUsage = critic.usage
}
if (after && (after.verdict === 'PASS' || after.verdict === 'REVIEW_REQUIRED')) {
  console.log('\n=== FINAL STORY ===\nTITLE: ' + patched.title + '\n' + patched.content)
  if (critique) console.log('\nCRITIQUE overall ' + critique.overall + '/10')
}

// ── Artifact ─────────────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true })
const status = !after ? 'rejected'
  : after.verdict === 'PASS' ? 'accepted'
  : after.verdict === 'REVIEW_REQUIRED' ? 'review_required'
  : 'rejected'
const file = {
  schema: CANDIDATE_FILE_SCHEMA,
  batchId: 'repair-test',
  generatedAt: new Date().toISOString(),
  provider: { name: 'multi', model: writerSpecs.join(','), reasoningEffort: null },
  manifest,
  repairExperiment: {
    source: { candidate: candidatePath, stage: stageName },
    numberedOriginal: originalLines.map((l, i) => (i + 1) + ': ' + l),
    plan,
    execution: executed ? { ops: executed.ops, attempts: executed.attempts, unresolved: executed.unresolved, compliance: executed.compliance } : null,
    regressions,
    before: serializableValidation(before),
    after: after ? serializableValidation(after) : null,
  },
  candidate: {
    manifestId: manifest.id,
    status,
    title: (patched || original).title,
    content: (patched || original).content,
    englishContent: null,
    validation: serializableValidation(after || before),
    critique,
    attempts: executed ? executed.attempts.length : 0,
    calls: (executed ? executed.attempts.length : 0) + (critique ? 1 : 0),
    generatorVersion: 'fab9-deterministic-repair@1',
    promptVersion: PROMPT_VERSION,
    plannerVersion: REPAIR_PLANNER_VERSION,
    usage: { critic: criticUsage, wallMs: null },
  },
  staged: null,
}
const outPath = join(outDir, manifest.id + '-' + stageName + '-repaired.json')
writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n')
console.log('\nwrote ' + outPath)
