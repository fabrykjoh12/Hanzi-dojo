// Planner-only bakeoff (FAB-9, 2026-08-23).
//
// Five fresh-shape runs produced fourteen candidates and not one cleared both
// the structural validator and the plan-quality judge in the same attempt:
// the shapes that pass structure score 2-5 on coherence, and the shape that
// scored 9 failed structure. Before spending more calls on scaffolding and
// beat realization, measure which planner can actually clear both bars.
//
// Planner only: no scaffold, no lexical generation, no beat realization, no
// replans. Same manifest and same target set for both models, same prompt,
// same validator, same thresholds — the only variable is the model.
//
// Candidates from both models are pooled and anonymised before judging, in
// mixed batches, so the judge never sees a single-model batch and cannot
// prefer a house style.
//
// No Supabase. Nothing staged or published.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { publishedChineseStories, buildCoverageReport } from './storyCoverage.mjs'
import { buildCoveragePlan, pendingTargets, useTargets } from './storyCoveragePlanner.mjs'
import { composeSemanticManifests, manifestDefaults } from './storyManifestPlanner.mjs'
import { storyShapePrompt, parseBlueprint, blueprintJudgePrompt, parseBlueprintJudgment } from './storyGenPrompts.mjs'
import {
  validateBlueprint, renderBlueprint, anonymiseBlueprints, acceptableBlueprint,
  BLUEPRINT_DIMENSIONS, BLUEPRINT_QUALITY,
} from './storyBlueprint.mjs'
import { adaptShape, adapterLostSomething, SHAPE_CONTRACT_VERSION } from './storySemanticShape.mjs'
import { directProvider } from './llmDirect.mjs'
import { levelConfig } from './storyLevels.mjs'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] != null ? args[i + 1] : def }

const inputPath = arg('input', null)
const level = parseInt(arg('level', '3'), 10)
const totalLines = parseInt(arg('lines', '28'), 10)
const perModel = parseInt(arg('per-model', '6'), 10)
const judgeSpec = arg('judge', null)
const outDir = arg('out', null)
const modelSpecs = String(arg('models', '')).split(',').map(s => s.trim()).filter(Boolean)
// Re-judge the plans a previous bakeoff already generated: judging is three
// calls, generation is twelve, and a judging failure should not cost the
// whole sample again.
const rejudgePath = arg('rejudge', null)

if (!inputPath || !outDir || (modelSpecs.length < 1 && !rejudgePath)) {
  console.error('Required: --input <dump> --out <dir> --models <p:m[:effort],…> [--judge <p:m>] [--per-model 6]')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))
const stories = publishedChineseStories(raw.stories)
const vocab = raw.vocab || []
const meanings = Object.fromEntries(vocab.filter(v => v.meaning).map(v => [v.word, v.meaning]))

const provider = (spec) => {
  const bits = spec.split(':')
  const name = bits[0]
  const effort = bits.length > 2 ? bits[bits.length - 1] : null
  const model = bits.slice(1, bits.length > 2 ? -1 : undefined).join(':')
  const p = directProvider(name, model, process.env, { reasoningEffort: effort })
  return { label: spec, send: p.send, usage: p.usage }
}
const planners = modelSpecs.map(provider)
const judge = judgeSpec ? provider(judgeSpec) : null

// ONE manifest, used by every model.
const report = buildCoverageReport({ stories, vocab })
const plan0 = buildCoveragePlan({ words: report.words, level, goal: 2, batchCap: 2 })
const composed = composeSemanticManifests({
  batchId: 'bakeoff', level, plan: plan0, pending: pendingTargets, use: useTargets, meanings, count: 1,
  defaults: manifestDefaults(level),
})
const manifest = composed.manifests[0]
const required = ((manifest.composition && manifest.composition.hard) || manifest.targets.filter(t => t.min >= 2)).map(t => t.word)
console.log('Manifest ' + manifest.id + ' — targets ' + manifest.targets.map(t => t.word).join('、'))
console.log('  required: ' + required.join('、'))
console.log('  cast: ' + manifest.speakers.join('、') + '\n')

// ── Generate ────────────────────────────────────────────────────────────────
const prompt = storyShapePrompt({ manifest, meanings, totalLines, targets: required })
const candidates = []
const stored = rejudgePath ? JSON.parse(readFileSync(rejudgePath, 'utf8')) : null
if (stored) {
  for (const c of stored.candidates) candidates.push({ ...c, score: null, label: null })
  console.log('Re-judging ' + candidates.length + ' stored candidate(s) from ' + rejudgePath + '\n')
}
for (const p of (stored ? [] : planners)) {
  for (let k = 1; k <= perModel; k += 1) {
    const before = { prompt: p.usage.promptTokens, completion: p.usage.completionTokens }
    const startedAt = Date.now()
    let raw = null
    let plan = null
    let error = null
    try {
      raw = await p.send({ kind: 'shape', prompt, maxTokens: 2600 })
      plan = parseBlueprint(raw)
    } catch (err) { error = String(err.message || err).slice(0, 160) }
    const latencyMs = Date.now() - startedAt
    // The planner writes `location` and `transition_from_previous`; the
    // adapter renames them into the strict schema and decides nothing. A
    // contract violation is the PLANNER failing to plan a movement, and is
    // reported as such rather than repaired.
    const { blueprint: bp, mapped, contract } = adaptShape(plan)
    const base = bp
      ? validateBlueprint(bp, { manifest, requiredTargets: required })
      : { ok: false, failures: [{ code: error ? 'provider_error' : 'unparseable', message: error || 'no JSON plan' }] }
    const failures = [...base.failures, ...(contract.violations || [])]
    const structural = { ok: failures.length === 0, failures }
    // If a plan kept the contract and the validator still says someone
    // teleported, the ADAPTER dropped it. That is this harness's bug, not the
    // model's, and it must not be counted against the model.
    const lost = bp ? adapterLostSomething(contract, base.failures) : null
    if (lost) console.error('  ADAPTER LOSS on ' + p.label + ' #' + k + ': ' + lost)
    candidates.push({
      model: p.label,
      attempt: k,
      blueprint: bp,
      plan,
      structural: { ok: structural.ok, failures: structural.failures },
      transitions: { stated: contract.stated, required: contract.required, violations: contract.violations, warnings: contract.warnings, mapped, adapterLoss: lost },
      raw: bp ? null : String(raw || '').slice(0, 1500),
      latencyMs,
      tokens: { prompt: p.usage.promptTokens - before.prompt, completion: p.usage.completionTokens - before.completion },
      score: null,
    })
    console.log('  ' + p.label + ' #' + k + ' → ' + (structural.ok ? 'structural PASS' : 'structural FAIL: ' + structural.failures.map(f => f.code).join(','))
      + '  | transitions ' + contract.stated + '/' + contract.required + ' stated'
      + '  (' + latencyMs + 'ms)')
  }
}

// ── Judge, pooled and anonymised, in mixed batches ──────────────────────────
// A stored run keeps its own manifest, so the judge sees the plans as they
// were written.
const activeManifest = stored ? stored.manifest : manifest
const judgeable = candidates.filter(c => c.blueprint)
const judgeLog = []
const labelled = anonymiseBlueprints(judgeable.map(c => ({ ...c, rendered: renderBlueprint(c.blueprint) })))
const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
const levelName = (cfg && cfg.levelName) || ('HSK ' + manifest.level)
const BATCH = 4
console.log('\nJudging ' + labelled.length + ' plan(s), anonymised, in batches of ' + BATCH)
for (let i = 0; i < labelled.length && judge; i += BATCH) {
  const batch = labelled.slice(i, i + BATCH)
  let scores = null
  let rawText = null
  let error = null
  try {
    rawText = await judge.send({
      kind: 'judge',
      prompt: blueprintJudgePrompt({
        manifest: activeManifest, levelName,
        candidates: batch.map(c => ({ label: c.label, rendered: c.rendered })),
        dimensions: BLUEPRINT_DIMENSIONS,
      }),
      maxTokens: 1400,
    })
    scores = parseBlueprintJudgment(rawText, batch.map(c => c.label), BLUEPRINT_DIMENSIONS)
    if (!scores) error = 'the judgment did not parse'
  } catch (err) { error = String((err && err.message) || err).slice(0, 300) }
  // Without this the bakeoff cannot say whether "no scores" means the judge
  // refused, errored, or answered in a shape the parser missed.
  judgeLog.push({ labels: batch.map(c => c.label), ok: Boolean(scores), error, raw: String(rawText || '').slice(0, 1200) })
  if (error) console.error('  batch ' + batch.map(c => c.label).join('') + ': ' + error)
  for (const c of batch) {
    const s = (scores || []).find(x => x.label === c.label) || null
    const target = candidates.find(x => x.model === c.model && x.attempt === c.attempt)
    target.score = s
    target.label = c.label
    console.log('  ' + c.label + ' [' + c.model + ' #' + c.attempt + '] → '
      + (s ? BLUEPRINT_DIMENSIONS.map(([k]) => k + ' ' + s[k]).join(' ') + ' contra ' + s.contradiction + ' OVERALL ' + s.overall : 'not scored'))
  }
}

// ── Taxonomy ────────────────────────────────────────────────────────────────
const BUCKET = {
  unexplained_move: 'unexplained movement',
  target_unplaced: 'target placement', target_beat: 'target placement', target_unknown: 'target placement',
  target_unjustified: 'target intent', target_no_intent: 'target intent', target_no_referent: 'target intent',
  cast_unknown: 'cast/speaker', cast_size: 'cast/speaker', target_no_speaker: 'cast/speaker',
  beat_count: 'other', beat_uncaused: 'implausible causality', beat_when: 'chronology', beat_where: 'other',
  beat_empty: 'other', beat_lines: 'other', beat_target_dump: 'target placement',
  unparseable: 'other', provider_error: 'other',
  // The explicit-transition contract: the planner moved people without
  // deciding how, or contradicted its own location.
  transition_missing: 'unplanned movement', transition_says_same_place: 'unplanned movement',
  transition_contradicts_location: 'unplanned movement', location_missing: 'other',
}
const taxonomy = (c) => {
  const out = new Set()
  for (const f of c.structural.failures) out.add(BUCKET[f.code] || 'other')
  const s = c.score
  if (s) {
    if (s.contradiction === true) out.add('contradiction')
    if ((s.plausibility || 10) < 6) out.add('implausible causality')
    if ((s.causal || 10) < 6) out.add('implausible causality')
    if ((s.simplicity || 10) < 6) out.add('overcomplicated premise')
    if ((s.chronology || 10) < 6) out.add('chronology')
  }
  return [...out]
}

for (const c of candidates) {
  c.qualityOk = acceptableBlueprint(c.score)
  c.jointOk = Boolean(c.structural.ok && c.qualityOk)
  c.buckets = taxonomy(c)
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(78))
console.log('PLANNER BAKEOFF — ' + manifest.id + ', ' + perModel + ' candidates per model')
console.log('='.repeat(78))
console.log('model                            #  struct  quality  JOINT  overall  latency  tokens')
for (const c of candidates) {
  console.log('  ' + c.model.padEnd(30) + ' ' + String(c.attempt).padStart(2)
    + '  ' + (c.structural.ok ? ' PASS ' : ' fail ')
    + '  ' + (c.qualityOk ? ' PASS  ' : ' fail  ')
    + '  ' + (c.jointOk ? ' YES ' : '  no ')
    + '  ' + String(c.score ? c.score.overall : '-').padStart(5)
    + '  ' + String(c.latencyMs).padStart(6) + 'ms'
    + '  ' + String(c.tokens.prompt + c.tokens.completion).padStart(6))
}
const byModel = {}
for (const c of candidates) {
  const m = byModel[c.model] || (byModel[c.model] = { n: 0, structural: 0, quality: 0, joint: 0, overall: [], buckets: {}, transitionsStated: 0, transitionsRequired: 0, contractViolations: 0, adapterLosses: 0 })
  m.n += 1
  if (c.structural.ok) m.structural += 1
  if (c.transitions) {
    m.transitionsStated += c.transitions.stated
    m.transitionsRequired += c.transitions.required
    m.contractViolations += (c.transitions.violations || []).length
    if (c.transitions.adapterLoss) m.adapterLosses += 1
  }
  if (c.qualityOk) m.quality += 1
  if (c.jointOk) m.joint += 1
  if (c.score && c.score.overall != null) m.overall.push(c.score.overall)
  for (const b of c.buckets) m.buckets[b] = (m.buckets[b] || 0) + 1
}
console.log('\nRATES (joint-pass is the ranking metric)')
console.log('contract ' + SHAPE_CONTRACT_VERSION + ': transitions the planner stated / moves it made, and whether the mapping was lossless')
for (const [model, m] of Object.entries(byModel)) {
  const pct = (x) => Math.round((x / m.n) * 100) + '%'
  const avg = m.overall.length ? (m.overall.reduce((a, b) => a + b, 0) / m.overall.length).toFixed(1) : '-'
  console.log('  ' + model)
  console.log('    JOINT ' + m.joint + '/' + m.n + ' (' + pct(m.joint) + ')  |  structural ' + m.structural + '/' + m.n + ' (' + pct(m.structural)
    + ')  |  quality ' + m.quality + '/' + m.n + ' (' + pct(m.quality) + ')  |  mean overall ' + avg)
  console.log('    transitions stated ' + m.transitionsStated + '/' + m.transitionsRequired
    + '  |  contract violations ' + m.contractViolations
    + '  |  adapter losses ' + m.adapterLosses + (m.adapterLosses ? '  ← HARNESS BUG, not the model' : ''))
  const sorted = Object.entries(m.buckets).sort((a, b) => b[1] - a[1])
  console.log('    failures: ' + (sorted.length ? sorted.map(([b, n]) => b + ' ×' + n).join(', ') : 'none'))
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'bakeoff.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  manifest: activeManifest,
  required: stored ? stored.required : required,
  perModel: stored ? stored.perModel : perModel,
  thresholds: BLUEPRINT_QUALITY,
  models: stored ? stored.models : modelSpecs,
  judge: judgeSpec,
  contract: SHAPE_CONTRACT_VERSION,
  rejudgedFrom: rejudgePath || null,
  judgeLog,
  rates: byModel,
  candidates,
}, null, 2) + '\n')
console.log('\nwrote ' + join(outDir, 'bakeoff.json'))
for (const p of planners) console.log(p.label + ' usage: ' + JSON.stringify(p.usage))
if (judge) console.log('judge usage: ' + JSON.stringify(judge.usage))
