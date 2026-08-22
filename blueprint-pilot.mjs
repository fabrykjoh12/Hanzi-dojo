// Blueprint-first pilot (FAB-9, 2026-08-22).
//
//   manifest → 2 blueprints per planner (structure only, no Chinese)
//            → deterministic blueprint validation
//            → anonymised semantic ranking, best acceptable plan wins
//            → deterministic line allocation (exactly N lines)
//            → Qwen realizes the plan, structured output, one bounded retry
//            → deterministic validation
//            → pre-repair quality gate (unchanged)
//            → narrow repair only when deserved (unchanged)
//
// A manifest whose plans are all rejected costs no prose call at all.
// No Supabase. Nothing staged or published.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { publishedChineseStories, buildCoverageReport } from './storyCoverage.mjs'
import { buildCoveragePlan, pendingTargets, useTargets } from './storyCoveragePlanner.mjs'
import { composeSemanticManifests, manifestDefaults, validateManifest } from './storyManifestPlanner.mjs'
import { validateCandidate, validateEdit, formatValidation, serializableValidation } from './storyCandidateValidation.mjs'
import {
  blueprintPrompt, parseBlueprint,
  blueprintJudgePrompt, parseBlueprintJudgment,
  beatPrompt, parseBeat, beatJudgePrompt, parseBeatJudgment,
  lineRewritePrompt, parseSingleLine,
  hostRankPrompt, parseHostRanking,
  lineJudgePrompt, parseLineJudgment,
  PROMPT_VERSION,
} from './storyGenPrompts.mjs'
import {
  validateBlueprint, allocateLines, anonymiseBlueprints, renderBlueprint,
  acceptableBlueprint, hasLatin, BLUEPRINT_DIMENSIONS, BLUEPRINT_QUALITY, BLUEPRINT_VERSION,
} from './storyBlueprint.mjs'
import { realizeByBeat, BEAT_LIMITS, BEAT_QUALITY, BEAT_VERSION } from './storyBeats.mjs'
import { judgePrompt, parseJudgment, JUDGE_VERSION } from './storyJudge.mjs'
import { preRepairDecision, DRAFT_QUALITY } from './storyDraftQuality.mjs'
import { planRepair, executeRepairPlan, LINE_QUALITY, REPAIR_PLANNER_VERSION } from './storyRepairPlanner.mjs'
import { applyStructuralPatch, patchRegressions } from './storySelectPipeline.mjs'
import { CANDIDATE_FILE_SCHEMA } from './storyStaging.mjs'
import { directProvider } from './llmDirect.mjs'
import { levelConfig } from './storyLevels.mjs'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] != null ? args[i + 1] : def }

const inputPath = arg('input', null)
const level = parseInt(arg('level', '3'), 10)
const count = parseInt(arg('count', '3'), 10)
const totalLines = parseInt(arg('lines', '28'), 10)
const batchId = arg('batch', 'blueprint-1')
const outDir = arg('out', null)
const writerSpec = arg('writer', null)            // Chinese realization + judging (Qwen)
const writerEffort = arg('writer-effort', 'none')
const plannerBSpec = arg('planner-b', null)       // line-repair fallback only (gpt-oss)
const plannerBEffort = arg('planner-b-effort', 'low')
const perPlanner = parseInt(arg('plans-per-planner', '2'), 10)
const budget = parseInt(arg('budget', '6'), 10)

if (!inputPath || !outDir || !writerSpec) {
  console.error('Required: --input <dump> --out <dir> --writer <p:m>  [--planner-b <p:m>] [--count 3] [--lines 28]')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))
const stories = publishedChineseStories(raw.stories)
const vocab = raw.vocab || []
const vocabMap = {}
for (const v of vocab) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v
const meanings = Object.fromEntries(vocab.filter(v => v.meaning).map(v => [v.word, v.meaning]))
const pool = vocab.filter(v => v.level <= level)
const pct = (x) => (x * 100).toFixed(1) + '%'

const provider = (spec, effort) => {
  const i = spec.indexOf(':')
  const p = directProvider(spec.slice(0, i), spec.slice(i + 1), process.env, { reasoningEffort: effort })
  return { name: spec + (effort ? '/' + effort : ''), send: p.send, usage: p.usage, model: p.model, providerName: p.name }
}
const writer = provider(writerSpec, writerEffort)
const plannerB = plannerBSpec ? provider(plannerBSpec, plannerBEffort) : null

// Fresh manifests
const report = buildCoverageReport({ stories, vocab })
let plan0 = buildCoveragePlan({ words: report.words, level, goal: 2, batchCap: 2 })
const composed = composeSemanticManifests({
  batchId, level, plan: plan0, pending: pendingTargets, use: useTargets, meanings, count,
  defaults: manifestDefaults(level),
})
console.log('Composed ' + composed.manifests.length + ' manifest(s) at HSK ' + level + ', fixed length ' + totalLines + ' lines\n')

const results = []

for (const manifest of composed.manifests) {
  // The exact length is enforced beat by beat (each beat returns exactly its
  // allocated lines or is rejected) — NOT by narrowing the manifest. blueprint-2 set
  // minLines = maxLines = 28 and every draft came back "invalid_manifest",
  // because validateManifest requires a real range: the deterministic
  // validator then refused to look at any of the three stories.
  const mCheck = validateManifest(manifest)
  if (!mCheck.ok) { console.error('manifest ' + manifest.id + ' is invalid: ' + mCheck.problems.join('; ')); continue }
  const required = ((manifest.composition && manifest.composition.hard) || manifest.targets.filter(t => t.min >= 2))
    .map(t => t.word)

  console.log('\n' + '='.repeat(72))
  console.log('MANIFEST ' + manifest.id)
  console.log('  targets: ' + manifest.targets.map(t => t.word + ' ' + t.min + '-' + t.max + (required.includes(t.word) ? '*' : '')).join(', ') + '   (* = must be placed)')
  console.log('  cast: ' + manifest.speakers.join('、') + ' | exactly ' + totalLines + ' lines')
  console.log('='.repeat(72))

  const record = { manifestId: manifest.id, manifest, required, blueprints: [], selection: null, draft: null, validation: null, preRepairCritique: null, decision: null, repair: null, after: null, finalCritique: null, final: null }

  // ── 1. Blueprints: planning only ──────────────────────────────────────────
  // Qwen plans. gpt-oss was benchmarked over two pilots (4/6 valid vs 1/6, and
  // Qwen won all three selections) and keeps its narrow fallback roles; there
  // is nothing left to learn by paying for it to plan again.
  const raws = []
  for (let k = 1; k <= perPlanner; k += 1) {
    let bp = null
    let error = null
    let rawText = null
    let feedback = null
    let check = null
    // One bounded lexical repair: a plan whose only problem is that it needs
    // words the reader does not have gets told exactly which ones, once.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        rawText = await writer.send({ prompt: blueprintPrompt({ manifest, meanings, totalLines, targets: required, feedback }), maxTokens: 3000 })
        bp = parseBlueprint(rawText)
      } catch (err) { error = String(err.message || err).slice(0, 160); bp = null }
      check = bp
        ? validateBlueprint(bp, { manifest, vocabMap, requiredTargets: required })
        : { ok: false, failures: [{ code: error ? 'provider_error' : 'unparseable', message: error || 'no JSON plan in the response' }] }
      if (check.ok) break
      feedback = check.failures.map(f => f.message)
      raws.push({ planner: writer.name, attempt: k, repairAttempt: attempt, blueprint: bp, check, raw: bp ? null : String(rawText || '').slice(0, 1200), superseded: true })
    }
    raws.push({ planner: writer.name, attempt: k, repairAttempt: check.ok ? 'accepted' : 'final', blueprint: bp, check, raw: bp ? null : String(rawText || '').slice(0, 1200) })
  }
  const valid = raws.filter(r => r.check.ok)
  console.log('\nBLUEPRINTS: ' + raws.length + ' attempt(s), ' + valid.length + ' structurally + lexically valid')
  for (const r of raws) {
    if (r.check.ok) continue
    console.log('  rejected [' + r.planner + ' #' + r.attempt + ']: ' + r.check.failures.map(f => f.code + ' — ' + f.message).join('; '))
  }

  if (!valid.length) {
    console.log('\nNO USABLE PLAN — manifest rejected before any prose call.')
    record.blueprints = raws.map(r => ({ planner: r.planner, attempt: r.attempt, blueprint: r.blueprint, check: r.check }))
    record.selection = { code: 'NO_VALID_BLUEPRINT' }
    results.push(record)
    continue
  }

  // ── 2. Anonymised ranking ─────────────────────────────────────────────────
  const labelled = anonymiseBlueprints(valid.map(r => ({ ...r, rendered: renderBlueprint(r.blueprint) })))
  let scores = null
  let judgeRaw = null
  try {
    const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
    judgeRaw = await writer.send({
      prompt: blueprintJudgePrompt({
        manifest,
        levelName: (cfg && cfg.levelName) || ('HSK ' + manifest.level),
        candidates: labelled.map(c => ({ label: c.label, rendered: c.rendered })),
        dimensions: BLUEPRINT_DIMENSIONS,
      }),
      maxTokens: 2000,
    })
    scores = parseBlueprintJudgment(judgeRaw, labelled.map(c => c.label), BLUEPRINT_DIMENSIONS)
    if (!scores) console.error('blueprint judgment did not parse. Raw:\n' + String(judgeRaw).slice(0, 600))
  } catch (err) { console.error('blueprint judging failed: ' + (err.message || err)) }

  const scored = labelled.map(c => ({ ...c, score: (scores || []).find(s => s.label === c.label) || null }))
  console.log('\nANONYMISED PLAN RANKING (thresholds ' + JSON.stringify(BLUEPRINT_QUALITY) + ')')
  for (const c of scored) {
    console.log('  PLAN ' + c.label + ' [' + c.planner + ' #' + c.attempt + ']')
    console.log('    ' + c.rendered.split('\n').join('\n    '))
    const s = c.score
    console.log('    → ' + (s
      ? BLUEPRINT_DIMENSIONS.map(([k]) => k + ' ' + s[k]).join(' ') + ' contradiction ' + s.contradiction + ' OVERALL ' + s.overall
        + ' | ' + (acceptableBlueprint(s) ? 'ACCEPTABLE' : 'below threshold') + (s.reason ? ' — ' + s.reason : '')
      : '(not scored)'))
  }
  record.blueprints = scored.map(c => ({ label: c.label, planner: c.planner, attempt: c.attempt, blueprint: c.blueprint, rendered: c.rendered, check: c.check, score: c.score, acceptable: acceptableBlueprint(c.score) }))
  record.blueprints.push(...raws.filter(r => !r.check.ok).map(r => ({ label: null, planner: r.planner, attempt: r.attempt, blueprint: r.blueprint, check: r.check, score: null, acceptable: false })))

  const acceptable = scored.filter(c => acceptableBlueprint(c.score))
  acceptable.sort((a, b) => (b.score.overall - a.score.overall) || (b.score.causal - a.score.causal) || (a.label < b.label ? -1 : 1))
  const chosen = acceptable[0]
  if (!chosen) {
    console.log('\nNO ACCEPTABLE PLAN — manifest rejected before any prose call.')
    record.judgeRaw = String(judgeRaw || '').slice(0, 2000)
    record.selection = { code: 'BLUEPRINT_QUALITY_FAILED', reason: scores ? 'no plan met the plan thresholds' : 'the judge returned nothing usable' }
    results.push(record)
    continue
  }
  const allocation = allocateLines(chosen.blueprint.beats, totalLines)
  if (!allocation) {
    record.selection = { code: 'ALLOCATION_IMPOSSIBLE' }
    results.push(record)
    continue
  }
  console.log('\nSELECTED PLAN ' + chosen.label + ' — written by ' + chosen.planner + ' (revealed only now)')
  console.log('  line allocation: ' + allocation.map(a => 'beat ' + a.beat + ' → ' + a.from + '-' + a.to).join(' | '))
  console.log('  target → beat: ' + (chosen.blueprint.targetPlan || []).map(t => t.word + '→' + t.beat).join(', '))
  record.judgeRaw = String(judgeRaw || '').slice(0, 2000)
  record.selection = { code: null, label: chosen.label, planner: chosen.planner, attempt: chosen.attempt, allocation, targetPlan: chosen.blueprint.targetPlan }

  // ── 3. Realization: beat by beat, each gated before the next ─────────────
  console.log('\nBEAT REALIZATION (' + BEAT_VERSION + ') — local limits ' + JSON.stringify(BEAT_LIMITS) + ', thresholds ' + JSON.stringify(BEAT_QUALITY))
  const realized = await realizeByBeat({
    blueprint: chosen.blueprint,
    allocation,
    manifest,
    vocabMap,
    meanings,
    writer,
    judge: writer,
    buildBeatPrompt: beatPrompt,
    parseBeat,
    buildBeatJudgePrompt: beatJudgePrompt,
    parseBeatJudgment,
    maxTokens: 1800,
  })
  for (const a of realized.attempts) {
    console.log('  beat ' + a.beat + ' attempt ' + a.attempt + ' — ' + a.requested + ' lines requested → '
      + (a.accepted ? 'ACCEPTED' : 'rejected'))
    for (const l of (a.lines || ['(nothing usable)'])) console.log('      ' + l)
    if (!a.deterministic.ok) for (const f of a.deterministic.failures) console.log('      ✗ ' + f.code + ': ' + f.message)
    else console.log('      deterministic ok — ' + JSON.stringify(a.deterministic.metrics))
    if (a.score) console.log('      judged: natural ' + a.score.natural + ' continuity ' + a.score.continuity + ' event ' + a.score.event
      + ' integration ' + a.score.integration + ' stuffed ' + a.score.stuffed + ' → OVERALL ' + a.score.overall
      + (a.score.reason ? ' — ' + a.score.reason : ''))
  }
  record.beats = { version: BEAT_VERSION, limits: BEAT_LIMITS, thresholds: BEAT_QUALITY, attempts: realized.attempts, accepted: realized.accepted, ok: realized.ok, code: realized.code, failedBeat: realized.failedBeat || null }

  if (!realized.ok) {
    console.log('\n' + realized.code + ': ' + realized.detail)
    results.push(record)
    continue
  }
  const lines = realized.lines
  if (lines.length !== totalLines) {
    console.log('\nASSEMBLY MISMATCH: ' + lines.length + ' lines, expected ' + totalLines)
    record.beats.code = 'ASSEMBLY_MISMATCH'
    results.push(record)
    continue
  }
  const latin = lines.filter(hasLatin)
  if (latin.length) {
    console.log('\nLATIN_IN_STORY: ' + latin.join(' | '))
    record.beats.code = 'LATIN_IN_STORY'
    results.push(record)
    continue
  }
  const draft = { title: String(chosen.blueprint.chineseTitle || '').trim(), content: lines.join('\n') }
  console.log('\nDRAFT — TITLE: ' + draft.title)
  lines.forEach((l, i) => console.log(String(i + 1).padStart(2) + ': ' + l))
  record.draft = { title: draft.title, content: draft.content, lines: lines.length, attempts: realized.attempts.length }

  // ── 4. Deterministic validation ───────────────────────────────────────────
  const before = validateCandidate(draft, { manifest, vocabMap, corpus: stories })
  console.log('\nDETERMINISTIC: ' + formatValidation(before))
  console.log('  ' + before.metrics.lines + ' lines | out-of-level ' + pct(before.metrics.outOfLevelCharShare)
    + ' | unknown ' + before.metrics.unknownDistinct + ' [' + (before.metrics.unknownRuns || []).join('、') + ']'
    + ' | targets ' + JSON.stringify(before.metrics.targetCounts))
  record.validation = serializableValidation(before)

  // ── 5. Pre-repair quality gate (unchanged) ────────────────────────────────
  let critique = null
  try {
    const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
    const text = await writer.send({ prompt: judgePrompt({ candidate: draft, manifest, levelName: (cfg && cfg.levelName) || ('HSK ' + manifest.level), preRepair: true }), maxTokens: 1500 })
    critique = parseJudgment(text)
  } catch (err) { console.error('pre-repair critique failed: ' + (err.message || err)) }
  const decision = preRepairDecision({ critique, validation: before, manifest })
  console.log('\nPRE-REPAIR QUALITY GATE')
  if (critique) {
    console.log('  ' + Object.entries(critique.scores).map(([k, v]) => k + ' ' + v).join(', ') + ' → OVERALL ' + critique.overall
      + ' | mechanical ' + critique.mechanical + ' | contradiction ' + critique.contradiction + (critique.contradictionDetail ? ' (' + critique.contradictionDetail + ')' : ''))
    console.log('  strengths: ' + critique.strengths)
    console.log('  weaknesses: ' + critique.weaknesses)
  }
  console.log('  → ' + (decision.ok ? 'DRAFT QUALITY PASSED' : decision.code + ': ' + decision.reason))
  if (decision.repairability) console.log('  repairability: ' + (decision.repairability.repairable ? 'narrow' : 'BROAD — ' + decision.repairability.reasons.join('; ')) + ' ' + JSON.stringify(decision.repairability.magnitudes))
  record.preRepairCritique = critique
  record.decision = { ok: decision.ok, code: decision.code, reason: decision.reason, quality: decision.quality, repairability: decision.repairability }

  if (!decision.ok) { console.log('\nNO REPAIR ATTEMPTED.'); results.push(record); continue }
  if (!before.failures.length) {
    console.log('\nNOTHING TO REPAIR.')
    record.after = serializableValidation(before)
    record.final = { title: draft.title, content: draft.content }
    results.push(record)
    continue
  }

  // ── 6. Repair, unchanged ──────────────────────────────────────────────────
  const rplan = planRepair({ candidate: draft, validation: before, manifest, vocabMap, budget })
  console.log('\nREPAIR PLAN: ' + (rplan.feasible ? rplan.projected.ops + '/' + budget + ' operations' : 'IMPOSSIBLE — ' + rplan.impossible))
  for (const d of rplan.deletes) console.log('  DELETE ' + d.line + ' — ' + d.reason)
  for (const t of rplan.replaces) console.log('  REPLACE ' + t.line + ' — ' + t.reasons.join('; '))
  for (const h of (rplan.targetHosts || [])) console.log('  HOSTS for ' + h.word + ': ' + h.candidates.map(c => c.line).join(', '))
  if (!rplan.feasible) { record.repair = { plan: rplan, executed: null }; results.push(record); continue }

  const surviving = (line) => lines.map((l, i) => ({ n: i + 1, l })).filter(x => !rplan.deletes.some(d => d.line === x.n) && x.n !== line)
  const executed = await executeRepairPlan({
    plan: rplan, manifest, vocabMap, meanings,
    generators: [writer, ...(plannerB ? [plannerB] : [])],
    buildPrompt: lineRewritePrompt, parseLine: parseSingleLine,
    hostRanker: writer, buildHostPrompt: hostRankPrompt, parseHostRanking,
    judge: writer, buildJudgePrompt: lineJudgePrompt, parseLineJudgment,
    contextFor: (line) => ({
      before: surviving(line).filter(x => x.n < line).slice(-2).map(x => x.n + ': ' + x.l),
      after: surviving(line).filter(x => x.n > line).slice(0, 2).map(x => x.n + ': ' + x.l),
    }),
    candidatesPerGenerator: 2, maxTokens: 2500,
  })
  for (const h of executed.hostSelections) {
    console.log('  HOST ' + h.target + ' [' + h.source + ']: ' + h.tried.map(t => t.line + (t.accepted ? ' ACCEPTED' : ' rejected')).join(', ') + ' → ' + h.chosen)
  }
  for (const a of executed.attempts) console.log('  line ' + a.line + ' ' + a.generator + ' (' + a.role + ') c' + a.attempt + ' → ' + (a.ok ? 'gate PASS: ' + a.output : 'gate REJECT: ' + a.failures.map(f => f.code).join(',')))
  for (const j of executed.judgments) for (const c of j.candidates) {
    console.log('  judge line ' + j.line + ' ' + c.label + ': ' + (c.score ? 'overall ' + c.score.overall + ' → eff ' + c.effectiveOverall + (c.accepted ? ' ELIGIBLE' : '') : 'unscored') + ' — ' + c.text)
  }
  for (const u of executed.unresolved) console.log('  ' + u.code + ' — ' + (u.target ? 'target ' + u.target : 'line ' + u.line) + ': ' + u.detail)

  const patched = { title: draft.title, content: applyStructuralPatch(draft.content, executed.ops) }
  const edit = validateEdit(draft, patched, { allowNewSpeakers: false })
  const v = validateCandidate(patched, { manifest, vocabMap, corpus: stories })
  const regressions = patchRegressions(before, v)
  const after = {
    ...v,
    verdict: (edit.ok && regressions.length === 0 && executed.unresolved.length === 0) ? v.verdict : 'FAIL',
    failures: [...v.failures, ...edit.failures,
      ...regressions.map(code => ({ code: 'regression_' + code, message: 'gate ' + code + ' regressed' })),
      ...executed.unresolved.map(u => ({ code: 'line_unresolved', message: u.detail }))],
    warnings: [...v.warnings, ...edit.warnings],
    metrics: { ...v.metrics, edit: edit.metrics },
  }
  console.log('\nAFTER REPAIR: ' + formatValidation(after))
  record.repair = { plan: rplan, executed }
  record.after = serializableValidation(after)

  if (after.verdict === 'PASS' || after.verdict === 'REVIEW_REQUIRED') {
    try {
      const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
      const text = await writer.send({ prompt: judgePrompt({ candidate: patched, manifest, levelName: (cfg && cfg.levelName) || ('HSK ' + manifest.level) }), maxTokens: 1500 })
      record.finalCritique = parseJudgment(text)
    } catch (err) { console.error('final critique failed: ' + (err.message || err)) }
    if (record.finalCritique) console.log('FINAL CRITIQUE: overall ' + record.finalCritique.overall + ' | ' + Object.entries(record.finalCritique.scores).map(([k, x]) => k + ' ' + x).join(', '))
    record.final = { title: patched.title, content: patched.content }
    console.log('\nFINAL STORY — TITLE: ' + patched.title)
    patched.content.split('\n').forEach((l, i) => console.log(String(i + 1).padStart(2) + ': ' + l))
  }
  results.push(record)
}

// ── Artifacts ────────────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true })
for (const r of results) {
  const status = !r.after ? 'rejected'
    : r.after.verdict === 'PASS' ? 'accepted'
    : r.after.verdict === 'REVIEW_REQUIRED' ? 'review_required' : 'rejected'
  writeFileSync(join(outDir, r.manifestId + '-blueprint.json'), JSON.stringify({
    schema: CANDIDATE_FILE_SCHEMA,
    batchId,
    generatedAt: new Date().toISOString(),
    provider: { name: writer.providerName, model: writer.model, reasoningEffort: writerEffort },
    manifest: r.manifest,
    blueprintRun: {
      version: BLUEPRINT_VERSION,
      totalLines,
      required: r.required,
      thresholds: { blueprint: BLUEPRINT_QUALITY, draft: DRAFT_QUALITY, line: LINE_QUALITY },
      blueprints: r.blueprints,
      judgeRaw: r.judgeRaw || null,
      selection: r.selection,
      draft: r.draft,
      before: r.validation,
      preRepairCritique: r.preRepairCritique,
      decision: r.decision,
      repair: r.repair,
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
      calls: null,
      generatorVersion: 'fab9-blueprint-first@1',
      promptVersion: PROMPT_VERSION,
      judgeVersion: JUDGE_VERSION,
      plannerVersion: REPAIR_PLANNER_VERSION,
      usage: null,
    },
    staged: null,
  }, null, 2) + '\n')
}

console.log('\n\n' + '='.repeat(72) + '\nSUMMARY')
for (const r of results) {
  const q = r.decision && r.decision.quality
  console.log('  ' + r.manifestId
    + ' | plans ' + r.blueprints.filter(b => b.check && b.check.ok).length + '/' + r.blueprints.length + ' valid'
    + ' | selected ' + (r.selection && r.selection.label ? r.selection.label + ' (' + r.selection.planner + ')' : (r.selection ? r.selection.code : 'none'))
    + ' | draft ' + (r.draft ? r.draft.lines + ' lines' : 'none')
    + ' | deterministic ' + (r.validation ? r.validation.verdict : '-')
    + ' | quality ' + (q && q.overall != null ? q.overall : '-')
    + ' → ' + (r.decision ? (r.decision.ok ? 'REPAIR' : r.decision.code) : '-')
    + (r.after ? ' | after ' + r.after.verdict : ''))
}
console.log('\nwriter usage: ' + JSON.stringify(writer.usage))
if (plannerB) console.log('planner-B usage: ' + JSON.stringify(plannerB.usage))
