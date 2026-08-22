// Pre-repair quality gate pilot (FAB-9, 2026-08-22).
//
// The pipeline this runs, end to end, on fresh Qwen drafts:
//
//   writer draft → deterministic validation → PRE-REPAIR quality gate
//     → (only if the story is worth keeping AND its failures are narrow)
//        deterministic repair plan → one line at a time → revalidation
//     → final semantic critique
//
// The gate never overrides the validator. It only decides whether repair is
// attempted at all — repair-3 spent 22 model calls making a 3/10 story
// compliant, which is the waste this exists to stop.
//
// Two modes:
//   --candidate <file> --stage draft-1   gate ONE stored draft (no generation)
//   --count 3                            compose fresh manifests and write drafts
//
// No Supabase, like every generation-side tool. Nothing is staged or published.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { publishedChineseStories, buildCoverageReport } from './storyCoverage.mjs'
import { buildCoveragePlan, pendingTargets, useTargets } from './storyCoveragePlanner.mjs'
import { composeSemanticManifests, manifestDefaults, MANIFEST_DEFAULTS } from './storyManifestPlanner.mjs'
import { validateCandidate, validateEdit, formatValidation, serializableValidation } from './storyCandidateValidation.mjs'
import {
  draftPrompt, parseChapter,
  lineRewritePrompt, parseSingleLine,
  hostRankPrompt, parseHostRanking,
  lineJudgePrompt, parseLineJudgment,
  PROMPT_VERSION,
} from './storyGenPrompts.mjs'
import { judgePrompt, parseJudgment, JUDGE_VERSION } from './storyJudge.mjs'
import { preRepairDecision, DRAFT_QUALITY, REPAIRABLE_LIMITS } from './storyDraftQuality.mjs'
import { planRepair, executeRepairPlan, LINE_QUALITY, REPAIR_PLANNER_VERSION } from './storyRepairPlanner.mjs'
import { applyStructuralPatch, patchRegressions } from './storySelectPipeline.mjs'
import { outputBudget } from './storyGenPipeline.mjs'
import { CANDIDATE_FILE_SCHEMA } from './storyStaging.mjs'
import { directProvider } from './llmDirect.mjs'
import { levelConfig } from './storyLevels.mjs'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] != null ? args[i + 1] : def }

const inputPath = arg('input', null)
const candidatePath = arg('candidate', null)
const stageName = arg('stage', 'draft-1')
const level = parseInt(arg('level', '3'), 10)
const count = parseInt(arg('count', '3'), 10)
const batchId = arg('batch', 'quality-1')
const outDir = arg('out', null)
const writerSpec = arg('writer', null)          // primary: draft author + line repair + critique
const writerEffort = arg('writer-effort', 'none')
const fallbackSpec = arg('fallback', null)      // line repair only, when the primary cannot comply
const fallbackEffort = arg('fallback-effort', null)
const budget = parseInt(arg('budget', '6'), 10)

if (!inputPath || !outDir || (!candidatePath && !writerSpec)) {
  console.error('Required: --input <dump> --out <dir> and either --candidate <file> or --writer <p:m[:effort]>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))
const stories = publishedChineseStories(raw.stories)
const vocab = raw.vocab || []
const vocabMap = {}
for (const v of vocab) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v
const meanings = Object.fromEntries(vocab.filter(v => v.meaning).map(v => [v.word, v.meaning]))
const pct = (x) => (x * 100).toFixed(1) + '%'

const provider = (spec, effort) => {
  if (!spec) return null
  const i = spec.indexOf(':')
  const p = directProvider(spec.slice(0, i), spec.slice(i + 1), process.env, { reasoningEffort: effort })
  return { name: spec + (effort ? '/' + effort : ''), send: p.send, usage: p.usage, model: p.model, providerName: p.name }
}
const writer = provider(writerSpec, writerEffort)
const fallback = provider(fallbackSpec, fallbackEffort)

// ── The manifests and drafts to examine ─────────────────────────────────────
const jobs = []
if (candidatePath) {
  const stored = JSON.parse(readFileSync(candidatePath, 'utf8'))
  const manifest = stored.manifest
  const defaults = MANIFEST_DEFAULTS[manifest.level] || {}
  if (manifest.difficulty.reviewMaxOutOfLevelCharShare == null && defaults.reviewMaxOutOfLevelCharShare != null) {
    manifest.difficulty = { ...manifest.difficulty, reviewMaxOutOfLevelCharShare: defaults.reviewMaxOutOfLevelCharShare }
  }
  const stage = (stored.candidate.stages || []).find(s => s.stage === stageName)
  if (!stage || !stage.content) { console.error('Stage ' + stageName + ' not found'); process.exit(1) }
  jobs.push({ manifest, draft: { title: stage.title, content: stage.content }, source: candidatePath + '#' + stageName })
} else {
  const report = buildCoverageReport({ stories, vocab })
  let plan = buildCoveragePlan({ words: report.words, level, goal: 2, batchCap: 2 })
  const composed = composeSemanticManifests({
    batchId, level, plan, pending: pendingTargets, use: useTargets, meanings, count,
    defaults: manifestDefaults(level),
  })
  for (const manifest of composed.manifests) jobs.push({ manifest, draft: null, source: 'fresh' })
  console.log('Composed ' + jobs.length + ' manifest(s) at HSK ' + level + '\n')
}

const pool = vocab.filter(v => v.level <= level)
const results = []

for (const job of jobs) {
  const { manifest } = job
  console.log('\n' + '='.repeat(72))
  console.log('MANIFEST ' + manifest.id + ' — targets: ' + manifest.targets.map(t => t.word + ' ' + t.min + '-' + t.max).join(', '))
  console.log('  speakers: ' + manifest.speakers.join('、') + ' | lines ' + manifest.length.minLines + '-' + manifest.length.maxLines
    + ' | out-of-level cap ' + pct(manifest.difficulty.maxOutOfLevelCharShare)
    + (manifest.difficulty.reviewMaxOutOfLevelCharShare ? ' (review band to ' + pct(manifest.difficulty.reviewMaxOutOfLevelCharShare) + ')' : ''))
  console.log('='.repeat(72))

  // ── 1. The draft ──────────────────────────────────────────────────────────
  let draft = job.draft
  const startedAt = Date.now()
  if (!draft) {
    try {
      const text = await writer.send({ prompt: draftPrompt({ manifest, pool, meanings }), maxTokens: outputBudget(manifest, 'draft') })
      draft = parseChapter(text)
    } catch (err) { console.error('draft failed: ' + (err.message || err)) }
    if (!draft) {
      results.push({ manifestId: manifest.id, manifest, source: job.source, draft: null, error: 'no parseable draft', validation: null, decision: null })
      console.log('NO DRAFT — the writer produced nothing usable.')
      continue
    }
  }
  const lines = draft.content.split('\n').map(l => l.trim()).filter(Boolean)
  console.log('\nDRAFT (' + lines.length + ' lines) — TITLE: ' + draft.title)
  lines.forEach((l, i) => console.log(String(i + 1).padStart(2) + ': ' + l))

  // ── 2. Deterministic validation ───────────────────────────────────────────
  const before = validateCandidate(draft, { manifest, vocabMap, corpus: stories })
  console.log('\nDETERMINISTIC: ' + formatValidation(before))
  console.log('  metrics: ' + before.metrics.lines + ' lines, out-of-level ' + pct(before.metrics.outOfLevelCharShare)
    + ' (' + before.metrics.outOfLevelDistinct + ' distinct), unknown ' + before.metrics.unknownDistinct
    + ' [' + (before.metrics.unknownRuns || []).join('、') + '], targets ' + JSON.stringify(before.metrics.targetCounts))

  // ── 3. PRE-REPAIR quality gate, on the untouched draft ────────────────────
  let critique = null
  try {
    const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
    const text = await writer.send({
      prompt: judgePrompt({ candidate: draft, manifest, levelName: (cfg && cfg.levelName) || ('HSK ' + manifest.level), preRepair: true }),
      maxTokens: 1500,
    })
    critique = parseJudgment(text)
  } catch (err) { console.error('pre-repair critique failed: ' + (err.message || err)) }

  const decision = preRepairDecision({ critique, validation: before, manifest })
  console.log('\nPRE-REPAIR QUALITY GATE (thresholds ' + JSON.stringify(DRAFT_QUALITY) + ')')
  if (critique) {
    console.log('  scores: ' + Object.entries(critique.scores).map(([k, v]) => k + ' ' + v).join(', ')
      + ' → OVERALL ' + critique.overall + ' | mechanical ' + critique.mechanical + ' | contradiction ' + critique.contradiction
      + (critique.contradictionDetail ? ' (' + critique.contradictionDetail + ')' : ''))
    console.log('  strengths: ' + critique.strengths)
    console.log('  weaknesses: ' + critique.weaknesses)
  } else {
    console.log('  (no usable critique)')
  }
  console.log('  → ' + (decision.ok ? 'DRAFT QUALITY PASSED' : decision.code + ': ' + decision.reason))
  if (decision.repairability) {
    console.log('  repairability: ' + (decision.repairability.repairable ? 'narrow — repair is appropriate' : 'BROAD — ' + decision.repairability.reasons.join('; ')))
    console.log('    magnitudes: ' + JSON.stringify(decision.repairability.magnitudes))
  }

  const record = {
    manifestId: manifest.id,
    manifest,
    source: job.source,
    draft: { title: draft.title, content: draft.content, lines: lines.length },
    validation: serializableValidation(before),
    preRepairCritique: critique,
    decision: { ok: decision.ok, code: decision.code, reason: decision.reason, quality: decision.quality, repairability: decision.repairability },
    repair: null,
    after: null,
    finalCritique: null,
  }

  if (!decision.ok) {
    console.log('\nNO REPAIR ATTEMPTED — 0 repair operations, 0 repair calls.')
    results.push(record)
    continue
  }
  if (before.failures.length === 0) {
    console.log('\nNOTHING TO REPAIR — the draft already satisfies every deterministic gate.')
    record.after = serializableValidation(before)
    results.push(record)
    continue
  }

  // ── 4. Repair: deterministic plan, then one line at a time ────────────────
  const plan = planRepair({ candidate: draft, validation: before, manifest, vocabMap, budget })
  console.log('\nREPAIR PLAN (' + REPAIR_PLANNER_VERSION + '): ' + (plan.feasible ? plan.projected.ops + '/' + budget + ' operations' : 'IMPOSSIBLE — ' + plan.impossible))
  for (const d of plan.deletes) console.log('  DELETE ' + d.line + ' — ' + d.reason + '\n     ' + d.text)
  for (const t of plan.replaces) console.log('  REPLACE ' + t.line + ' — ' + t.reasons.join('; ') + '\n     ' + t.text)
  for (const h of (plan.targetHosts || [])) console.log('  HOST CANDIDATES for ' + h.word + ': ' + h.candidates.map(c => c.line + (c.free ? '*' : '')).join(', '))
  if (!plan.feasible) {
    record.repair = { plan, executed: null }
    results.push(record)
    continue
  }

  const surviving = (line) => lines.map((l, i) => ({ n: i + 1, l }))
    .filter(x => !plan.deletes.some(d => d.line === x.n) && x.n !== line)
  const contextFor = (line) => ({
    before: surviving(line).filter(x => x.n < line).slice(-2).map(x => x.n + ': ' + x.l),
    after: surviving(line).filter(x => x.n > line).slice(0, 2).map(x => x.n + ': ' + x.l),
  })
  const generators = [writer, ...(fallback ? [fallback] : [])]
  const executed = await executeRepairPlan({
    plan, manifest, vocabMap, meanings, generators,
    buildPrompt: lineRewritePrompt, parseLine: parseSingleLine,
    hostRanker: writer, buildHostPrompt: hostRankPrompt, parseHostRanking,
    judge: writer, buildJudgePrompt: lineJudgePrompt, parseLineJudgment,
    contextFor, candidatesPerGenerator: 2, maxTokens: 2500,
  })

  for (const h of executed.hostSelections) {
    console.log('\n  HOST for ' + h.target + ' [' + h.source + ']')
    if (h.ranking) for (const r of h.ranking) console.log('    rank line ' + r.line + ' — ' + (r.reason || ''))
    for (const t of h.tried) console.log('    attempt ' + t.rank + ' line ' + t.line + (t.free ? ' (free)' : '') + ' → ' + (t.accepted ? 'ACCEPTED: ' + t.text : 'rejected: ' + t.why))
  }
  for (const a of executed.attempts) {
    console.log('  line ' + a.line + ' [' + a.for + '] ' + a.generator + ' (' + a.role + ') c' + a.attempt + ' → ' + (a.ok ? 'gate PASS' : 'gate REJECT'))
    console.log('    ' + (a.output || '(nothing usable)'))
    if (!a.ok) for (const f of a.failures) console.log('      ✗ ' + f.code + ': ' + f.message)
  }
  for (const j of executed.judgments) {
    console.log('  judging line ' + j.line + ' (' + j.round + ')')
    for (const c of j.candidates) {
      const s = c.score
      console.log('    ' + c.label + ' [' + c.generator + '] ' + c.text)
      console.log('      ' + (s ? 'gram ' + s.grammar + ' cont ' + s.continuity + ' role ' + s.role + ' integ ' + s.integration + ' voice ' + s.voice
        + ' mech ' + s.mechanical + ' overall ' + s.overall + ' → eff ' + c.effectiveOverall + ' | ' + (c.accepted ? 'ELIGIBLE' : 'below threshold') : '(not scored)'))
    }
  }
  for (const u of executed.unresolved) console.log('  ' + u.code + ' — ' + (u.target ? 'target ' + u.target : 'line ' + u.line) + ': ' + u.detail)

  const patched = { title: draft.title, content: applyStructuralPatch(draft.content, executed.ops) }
  const edit = validateEdit(draft, patched, { allowNewSpeakers: false })
  const v = validateCandidate(patched, { manifest, vocabMap, corpus: stories })
  const regressions = patchRegressions(before, v)
  const after = {
    ...v,
    verdict: (edit.ok && regressions.length === 0 && executed.unresolved.length === 0) ? v.verdict : 'FAIL',
    failures: [
      ...v.failures, ...edit.failures,
      ...regressions.map(code => ({ code: 'regression_' + code, message: 'gate ' + code + ' was satisfied before the repair and is not after' })),
      ...executed.unresolved.map(u => ({ code: 'line_unresolved', message: (u.target ? 'target ' + u.target : 'line ' + u.line) + ': ' + u.detail })),
    ],
    warnings: [...v.warnings, ...edit.warnings],
    metrics: { ...v.metrics, edit: edit.metrics },
  }
  console.log('\nAFTER REPAIR: ' + formatValidation(after))
  record.repair = { plan, executed }
  record.after = serializableValidation(after)

  if (after.verdict === 'PASS' || after.verdict === 'REVIEW_REQUIRED') {
    try {
      const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
      const text = await writer.send({ prompt: judgePrompt({ candidate: patched, manifest, levelName: (cfg && cfg.levelName) || ('HSK ' + manifest.level) }), maxTokens: 1500 })
      record.finalCritique = parseJudgment(text)
    } catch (err) { console.error('final critique failed: ' + (err.message || err)) }
    if (record.finalCritique) {
      console.log('FINAL CRITIQUE: overall ' + record.finalCritique.overall + ' | ' + Object.entries(record.finalCritique.scores).map(([k, v2]) => k + ' ' + v2).join(', '))
      console.log('  weaknesses: ' + record.finalCritique.weaknesses)
    }
    console.log('\nFINAL STORY — TITLE: ' + patched.title)
    patched.content.split('\n').forEach((l, i) => console.log(String(i + 1).padStart(2) + ': ' + l))
    record.final = { title: patched.title, content: patched.content }
  }
  record.wallMs = Date.now() - startedAt
  results.push(record)
}

// ── Artifacts ────────────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true })
for (const r of results) {
  const status = !r.after ? 'rejected'
    : r.after.verdict === 'PASS' ? 'accepted'
    : r.after.verdict === 'REVIEW_REQUIRED' ? 'review_required'
    : 'rejected'
  const file = {
    schema: CANDIDATE_FILE_SCHEMA,
    batchId,
    generatedAt: new Date().toISOString(),
    provider: { name: writer ? writer.providerName : 'stored', model: writer ? writer.model : null, reasoningEffort: writerEffort || null },
    manifest: r.manifest,
    qualityGate: {
      thresholds: DRAFT_QUALITY,
      repairableLimits: REPAIRABLE_LIMITS,
      lineQuality: LINE_QUALITY,
      source: r.source,
      draft: r.draft,
      preRepairCritique: r.preRepairCritique,
      decision: r.decision,
      repair: r.repair,
      before: r.validation,
      after: r.after,
    },
    candidate: {
      manifestId: r.manifestId,
      status,
      title: (r.final || r.draft || {}).title || null,
      content: (r.final || r.draft || {}).content || null,
      englishContent: null,
      validation: r.after || r.validation,
      critique: r.finalCritique,
      attempts: r.repair && r.repair.executed ? r.repair.executed.attempts.length : 0,
      calls: (r.repair && r.repair.executed ? r.repair.executed.attempts.length : 0) + (r.preRepairCritique ? 1 : 0) + (r.finalCritique ? 1 : 0),
      generatorVersion: 'fab9-quality-gate@1',
      promptVersion: PROMPT_VERSION,
      judgeVersion: JUDGE_VERSION,
      plannerVersion: REPAIR_PLANNER_VERSION,
      usage: null,
    },
    staged: null,
  }
  writeFileSync(join(outDir, r.manifestId + '-quality.json'), JSON.stringify(file, null, 2) + '\n')
}

console.log('\n\n' + '='.repeat(72))
console.log('SUMMARY')
for (const r of results) {
  const q = r.decision && r.decision.quality
  console.log('  ' + r.manifestId + ': draft ' + (r.draft ? r.draft.lines + ' lines' : 'none')
    + ' | deterministic ' + (r.validation ? r.validation.verdict : '?')
    + ' | quality ' + (q && q.overall != null ? q.overall : '?') + ' → ' + (r.decision && r.decision.ok ? 'REPAIR' : (r.decision ? r.decision.code : 'n/a'))
    + (r.after ? ' | after ' + r.after.verdict : '')
    + (r.repair && r.repair.executed ? ' | ops ' + r.repair.executed.ops.length : ''))
}
if (writer) console.log('\nwriter usage: ' + JSON.stringify(writer.usage))
if (fallback) console.log('fallback usage: ' + JSON.stringify(fallback.usage))
console.log('wrote ' + results.length + ' artifact(s) to ' + outDir)
