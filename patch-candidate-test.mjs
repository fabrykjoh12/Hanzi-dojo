// Bounded structural patch test (FAB-9): take ONE stored draft, hand the
// patcher ONLY its exact deterministic failures plus derived line hints, get
// back line operations (REPLACE/DELETE/INSERT, hard budget), apply them
// deterministically, and re-run the full FAB-10 validator. The patcher is
// structurally incapable of rewriting: full-story output does not parse.
//
// If the patched story PASSes, the critic model scores semantic quality.
// Everything — numbered original, exact ops, before/after of every touched
// line, metrics before and after — lands in one artifact.
//
// No Supabase, like every generation-side tool.
//
//   node patch-candidate-test.mjs --input reports/story-corpus-dump.json \
//     --candidate data/story-candidates/select-1/duo-2-L3-002.json --stage draft-1 \
//     --patcher groq:openai/gpt-oss-120b --patcher-effort low \
//     --critic groq:qwen/qwen3.6-27b --critic-effort none \
//     --out data/story-candidates/patch-test-1

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { publishedChineseStories } from './storyCoverage.mjs'
import { validateCandidate, validateEdit, formatValidation, serializableValidation } from './storyCandidateValidation.mjs'
import { structuralPatchPrompt, parseStructuralPatch, isImpossiblePatch, PROMPT_VERSION } from './storyGenPrompts.mjs'
import { MANIFEST_DEFAULTS } from './storyManifestPlanner.mjs'
import { applyStructuralPatch, structurallyPatchable } from './storySelectPipeline.mjs'
import { analyzeStory } from './storyCorpusCalibration.mjs'
import { judgePrompt, parseJudgment, JUDGE_VERSION } from './storyJudge.mjs'
import { directProvider } from './llmDirect.mjs'
import { CANDIDATE_FILE_SCHEMA } from './storyStaging.mjs'
import { levelConfig } from './storyLevels.mjs'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] != null ? args[i + 1] : def }

const inputPath = arg('input', null)
const candidatePath = arg('candidate', null)
const stageName = arg('stage', 'draft-1')
const patcherSpec = arg('patcher', null)
const patcherEffort = arg('patcher-effort', null)
const criticSpec = arg('critic', null)
const criticEffort = arg('critic-effort', null)
const outDir = arg('out', null)
const maxTouched = parseInt(arg('max-touched', '6'), 10)

if (!inputPath || !candidatePath || !patcherSpec || !outDir) {
  console.error('Required: --input <dump> --candidate <file> --patcher <p:m> --out <dir>  [--stage draft-1] [--critic <p:m>] [--max-touched 6]')
  process.exit(1)
}

const stored = JSON.parse(readFileSync(candidatePath, 'utf8'))
const manifest = stored.manifest

// Stored manifests were frozen before validator@3's experimental review band
// existed; apply the current default for this level so re-evaluation runs
// under the pilot policy (out-of-level share above the cap but within the
// band → REVIEW_REQUIRED instead of FAIL — mandatory human review).
const levelDefaults = MANIFEST_DEFAULTS[manifest && manifest.level] || {}
if (manifest && manifest.difficulty && manifest.difficulty.reviewMaxOutOfLevelCharShare == null
  && levelDefaults.reviewMaxOutOfLevelCharShare != null) {
  manifest.difficulty = { ...manifest.difficulty, reviewMaxOutOfLevelCharShare: levelDefaults.reviewMaxOutOfLevelCharShare }
  console.log('[patch-test] pilot review band applied: out-of-level share '
    + (manifest.difficulty.maxOutOfLevelCharShare * 100).toFixed(1) + '%-'
    + (manifest.difficulty.reviewMaxOutOfLevelCharShare * 100).toFixed(1) + '% → REVIEW_REQUIRED')
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

// ── Fresh "before" validation ────────────────────────────────────────────────
const before = validateCandidate(original, { manifest, vocabMap, corpus: stories })
console.log('[patch-test] before: ' + before.verdict + ' — ' + before.failures.map(f => f.code).join(', ')
  + ((before.reviews || []).length ? ' | review: ' + before.reviews.map(r => r.code).join(', ') : ''))
if (before.failures.length === 0) { console.log('No hard failures to patch — verdict is ' + before.verdict + '.'); process.exit(0) }
if (!structurallyPatchable(before.failures)) {
  console.error('Failures are not structurally patchable: ' + before.failures.map(f => f.code).join(', '))
  process.exit(1)
}

// ── Deterministic line hints, derived from the failures ─────────────────────
const lineHints = []
const overage = originalLines.length - manifest.length.maxLines
if (overage > 0) lineHints.push('the story is ' + overage + ' line(s) over the ceiling — DELETE (or merge via REPLACE+DELETE) at least ' + overage)
for (const run of (before.metrics.unknownRuns || [])) {
  const at = originalLines.map((l, i) => (l.includes(run) ? i + 1 : 0)).filter(Boolean)
  if (at.length) lineHints.push('unknown word ' + run + ' appears on line ' + at.join(', '))
}
// Per-line out-of-level weight, worst first — where simplification buys the
// most. Only offered when out_of_level_share is actually among the HARD
// failures: the patcher's job is the listed failures and nothing else, so a
// share that merely sits in the review band earns no hint.
if (before.failures.some(f => f.code === 'out_of_level_share')) {
  const lineOut = originalLines.map((l, i) => {
    const a = analyzeStory({ title: 'x', level: manifest.level, content: l }, vocabMap)
    return { line: i + 1, chars: Math.round(a.outOfLevelCharShare * a.cjkChars) }
  }).filter(x => x.chars > 0).sort((a, b) => b.chars - a.chars).slice(0, 8)
  if (lineOut.length) {
    lineHints.push('most above-level characters sit on lines ' + lineOut.map(x => x.line + ' (' + x.chars + ' chars)').join(', ') + ' — simplify or delete there')
  }
}

// ── ONE bounded patch attempt ────────────────────────────────────────────────
const patcher = directProvider(patcherSpec.slice(0, patcherSpec.indexOf(':')), patcherSpec.slice(patcherSpec.indexOf(':') + 1), process.env, { reasoningEffort: patcherEffort })
console.log('[patch-test] patcher ' + patcher.name + '/' + patcher.model + (patcherEffort ? ' effort=' + patcherEffort : '') + ' — budget ' + maxTouched + ' ops')
const prompt = structuralPatchPrompt({ manifest, candidate: original, failures: before.failures, meanings, lineHints, maxTouched })

const startedAt = Date.now()
let ops = null
let patchError = null
let impossible = false
for (let attempt = 0; attempt <= 2 && !ops; attempt += 1) {
  try {
    const text = await patcher.send({ prompt, maxTokens: 1200 })
    // IMPOSSIBLE is a valid terminal answer, not a parse failure — it
    // short-circuits immediately and is never retried.
    if (isImpossiblePatch(text)) {
      impossible = true
      patchError = 'patcher declared IMPOSSIBLE (terminal — not retried)'
      break
    }
    ops = parseStructuralPatch(text, originalLines.length, maxTouched)
    if (!ops) patchError = 'unparseable or over-budget patch: ' + String(text).slice(0, 200)
  } catch (err) {
    patchError = String(err.message || err)
    if (/HTTP (400|401|403|404|413|422)\b/.test(patchError)) break
  }
}

let after = null
let patched = null
let editCheck = null
let touched = []
if (ops) {
  patched = { title: original.title, content: applyStructuralPatch(original.content, ops) }
  editCheck = validateEdit(original, patched, { allowNewSpeakers: false })
  const v = validateCandidate(patched, { manifest, vocabMap, corpus: stories })
  after = {
    ...v,
    // Preservation-gate failures demote any verdict to FAIL; otherwise the
    // validator's own verdict stands (PASS, or REVIEW_REQUIRED when only the
    // experimental out-of-level band is hit).
    verdict: editCheck.ok ? v.verdict : 'FAIL',
    failures: [...v.failures, ...editCheck.failures],
    warnings: [...v.warnings, ...editCheck.warnings],
    metrics: { ...v.metrics, edit: editCheck.metrics },
  }
  touched = ops.map(o => ({
    ...o,
    before: o.op === 'insert' ? null : originalLines[o.line - 1],
    after: o.op === 'delete' ? null : o.text,
  }))
}

// ── Critique on PASS or REVIEW_REQUIRED (the band continues through
// critique; it just can never be staged without a human) ─────────────────────
let critique = null
if (after && (after.verdict === 'PASS' || after.verdict === 'REVIEW_REQUIRED') && criticSpec) {
  const critic = directProvider(criticSpec.slice(0, criticSpec.indexOf(':')), criticSpec.slice(criticSpec.indexOf(':') + 1), process.env, { reasoningEffort: criticEffort })
  try {
    const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
    const text = await critic.send({ prompt: judgePrompt({ candidate: patched, manifest, levelName: (cfg && cfg.levelName) || ('HSK ' + manifest.level) }), maxTokens: 1200 })
    const parsed = parseJudgment(text)
    if (parsed) critique = { judgeVersion: JUDGE_VERSION, judge: { provider: critic.name, model: critic.model }, ...parsed }
  } catch (err) { console.error('critique failed: ' + (err.message || err)) }
  var criticUsage = critic.usage
}

// ── Artifact ─────────────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true })
const file = {
  schema: CANDIDATE_FILE_SCHEMA,
  batchId: 'patch-test',
  generatedAt: new Date().toISOString(),
  provider: { name: patcher.name, model: patcher.model, reasoningEffort: patcherEffort || null },
  manifest,
  patchExperiment: {
    source: { candidate: candidatePath, stage: stageName },
    numberedOriginal: originalLines.map((l, i) => (i + 1) + ': ' + l),
    lineHints,
    ops: ops || null,
    touched,
    impossible,
    patchError: ops ? null : patchError,
    before: serializableValidation(before),
    after: after ? serializableValidation(after) : null,
  },
  candidate: {
    manifestId: manifest.id,
    status: !after ? 'rejected'
      : after.verdict === 'PASS' ? 'accepted'
      : after.verdict === 'REVIEW_REQUIRED' ? 'review_required'
      : 'rejected',
    title: (patched || original).title,
    content: (patched || original).content,
    englishContent: null,
    validation: serializableValidation(after || before),
    critique,
    attempts: 1,
    calls: patcher.usage.requests + (typeof criticUsage !== 'undefined' ? criticUsage.requests : 0),
    generatorVersion: 'fab9-structural-patch@2',
    promptVersion: PROMPT_VERSION,
    usage: { patcher: patcher.usage, critic: typeof criticUsage !== 'undefined' ? criticUsage : null, wallMs: Date.now() - startedAt },
  },
  staged: null,
}
const outPath = join(outDir, manifest.id + '-' + stageName + '-patched.json')
writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n')
console.log('wrote ' + outPath)

console.log('\n=== BEFORE ===\n' + formatValidation(before))
if (ops) {
  console.log('\n=== OPS (' + ops.length + '/' + maxTouched + ') ===')
  for (const t of touched) console.log(t.op.toUpperCase() + ' ' + t.line + (t.before ? '\n  - ' + t.before : '') + (t.after ? '\n  + ' + t.after : ''))
  console.log('\n=== AFTER ===\n' + formatValidation(after))
  if (after.verdict === 'REVIEW_REQUIRED') console.log('\nREVIEW_REQUIRED: no hard failures remain, but the out-of-level share sits in the experimental band — mandatory human review, never auto-publishable.')
  if (critique) console.log('\nCRITIQUE overall ' + critique.overall + '/10')
} else {
  console.log('\nNo usable patch: ' + patchError)
}
