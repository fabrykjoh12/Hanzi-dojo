// Writer bakeoff — the same plan, several writers, blind (FAB-9, 2026-08-27).
//
// Everything before this point has been measured on PLANS. A plan cannot tell
// us whether the Mandarin is natural, whether the assisted words actually
// collide in a sentence a learner reads, or whether story quality survives the
// lexical constraints. So: freeze a plan, hand the identical plan, manifest,
// vocabulary and brief to every writer, and compare what comes back.
//
// Three rules make the comparison worth anything:
//
//   1. No writer sees another writer's output. Each realization is an
//      independent run from the same frozen input.
//   2. Outputs are relabelled W1..Wn by a shuffle keyed on the plan, so the
//      order in the artifact carries no information about which model wrote
//      what. The mapping is stored, not printed next to the stories.
//   3. The judge is a different model from the writer it is scoring, and it
//      never sees the model names. A writer scoring its own work is not
//      evidence.
//
// Deterministic facts (target coverage, level compliance, per-line taps,
// validator failures, line count) are computed in code and are the primary
// result. The blind judge is secondary and reports separately.
//
// Nothing here stages or publishes. No supabase-js import.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { publishedChineseStories } from './storyCoverage.mjs'
import { allocateLines } from './storyBlueprint.mjs'
import { adaptShape } from './storySemanticShape.mjs'
import { buildLexicalScaffold, applyScaffold, SCAFFOLD_VERSION } from './storyLexicalScaffold.mjs'
import { realizeByBeat, BEAT_VERSION, BEAT_LIMITS, BEAT_QUALITY } from './storyBeats.mjs'
import {
  titlePrompt, parseTitle, targetSketchPrompt, parseSketch,
  beatAnchorsPrompt, parseAnchors, beatPrompt, parseBeat,
  beatJudgePrompt, parseBeatJudgment,
} from './storyGenPrompts.mjs'
import { validateCandidate, formatValidation } from './storyCandidateValidation.mjs'
import { realizedDensity, REALIZED_VERSION } from './storyRealizedDensity.mjs'
import { assessShapeRisk, buildLexicalIndexes, ASSISTED_POLICY } from './storyLexicalRisk.mjs'
import { directProvider } from './llmDirect.mjs'
import { storyJudgePrompt, parseStoryJudgment, STORY_JUDGE_DIMENSIONS } from './storyWriterJudge.mjs'

const args = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

const inputPath = arg('input', null)
const shapeFrom = arg('shape-from', null)
const labels = String(arg('labels', '') || '').split(',').map(s => s.trim()).filter(Boolean)
const writerSpecs = String(arg('writers', '') || '').split(',').map(s => s.trim()).filter(Boolean)
const judgeSpec = arg('judge', null)
const outDir = arg('out', null)
const totalLines = parseInt(arg('lines', '26'), 10)
// A reasoning model spends its thinking against the same max_tokens ceiling, so
// the 400 the scaffold defaults to is a budget for one model and a gag for
// another. writer-bake-1 lost all eight realizations to it.
const scaffoldTokens = parseInt(arg('scaffold-tokens', '900'), 10)
// Explicit and IDENTICAL for every writer. Without this each provider applies
// its own default and the comparison measures two sampling configurations as
// though they were two models.
const temperature = arg('temperature', null) == null ? null : Number(arg('temperature'))
const topP = arg('top-p', null) == null ? null : Number(arg('top-p'))
const sampling = (Number.isFinite(temperature) || Number.isFinite(topP))
  ? { temperature: Number.isFinite(temperature) ? temperature : undefined, topP: Number.isFinite(topP) ? topP : undefined }
  : null
// Successful realizations are cached by (plan, writer, config). A rerun after a
// quota wall reuses what already worked instead of spending the budget again on
// it — five runs of this bakeoff produced zero paired stories partly because
// every attempt started from nothing.
const cacheDir = arg('cache', 'data/story-candidates/_writer-cache')
const noCache = args.includes('--no-cache')

if (!inputPath || !shapeFrom || !labels.length || !writerSpecs.length || !outDir) {
  console.error('Required: --input <dump> --shape-from <bakeoff.json> --labels A,B --writers p:m[:effort],... --out <dir> [--judge p:m]')
  process.exit(1)
}

function provider(spec) {
  const parts = spec.split(':')
  const effort = parts.length > 2 ? parts.pop() : null
  const p = directProvider(parts[0], parts.slice(1).join(':'), process.env, { reasoningEffort: effort, sampling })
  p.spec = spec
  return p
}

const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 16)

// A 429 is the provider saying "come back later". It is never evidence that a
// writer is worse, so it must never be recorded as a writer failure.
const isQuota = (text) => /HTTP 429|rate limit|quota/i.test(String(text || ''))

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))
const stories = publishedChineseStories(raw.stories)
const vocab = raw.vocab || []
const vocabMap = {}
for (const v of vocab) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v
const meanings = Object.fromEntries(vocab.filter(v => v.meaning).map(v => [v.word, v.meaning]))

const bake = JSON.parse(readFileSync(shapeFrom, 'utf8'))
const manifest = bake.manifest
const level = manifest.level
const pool = vocab.filter(v => v.level <= level)
const indexes = buildLexicalIndexes(vocabMap, level)

// Deterministic shuffle: the same plan always produces the same anonymous
// order, and that order does not follow the order writers were listed in.
function anonOrder(planLabel, n) {
  let h = 0
  for (const ch of String(planLabel)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const idx = [...Array(n).keys()]
  for (let i = n - 1; i > 0; i -= 1) {
    h = (h * 1103515245 + 12345) >>> 0
    const j = h % (i + 1)
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}

const plans = labels.map(l => {
  const c = bake.candidates.find(x => (x.label || '-') === l)
  if (!c) { console.error('no candidate labelled ' + l + ' in ' + shapeFrom); process.exit(2) }
  const bp = c.blueprint || (c.plan ? adaptShape(c.plan).blueprint : null)
  if (!bp) { console.error('candidate ' + l + ' has no usable blueprint'); process.exit(2) }
  const risk = assessShapeRisk({ blueprint: bp, manifest, vocabMap, indexes })
  return { label: l, blueprint: bp, planner: c.model, quality: c.score ? c.score.overall : null, risk }
})

console.log('WRITER BAKEOFF — ' + manifest.id + '  scaffold ' + SCAFFOLD_VERSION + '  beats ' + BEAT_VERSION)
console.log('plans:   ' + plans.map(p => p.label + (p.risk.classification === 'LEXICALLY_UNSAFE' ? '(infeasible)' : '(feasible)')).join(', '))
console.log('writers: ' + writerSpecs.length + ' (identities withheld from the report below)')
console.log('judge:   ' + (judgeSpec || '(none)') + '\n')

const runs = []
for (const plan of plans) {
  const allocation = allocateLines(plan.blueprint.beats, totalLines)
  for (const spec of writerSpecs) {
    // The identity of this attempt: the same plan, writer and generation
    // contract must produce the same cache key on every rerun.
    const configHash = sha({
      plan: plan.label,
      blueprint: sha(plan.blueprint),
      manifest: manifest.id,
      writer: spec,
      sampling, totalLines, scaffoldTokens,
      versions: { scaffold: SCAFFOLD_VERSION, beats: BEAT_VERSION, realized: REALIZED_VERSION },
    })
    const cachePath = join(cacheDir, configHash + '.json')
    if (!noCache && existsSync(cachePath)) {
      try {
        const hit = JSON.parse(readFileSync(cachePath, 'utf8'))
        if (hit && hit.ok) {
          runs.push({ ...hit, reused: true })
          console.log('  plan ' + plan.label + ' × writer#' + (writerSpecs.indexOf(spec) + 1)
            + ' → reused a cached realization (' + hit.lineCount + ' lines)')
          continue
        }
      } catch { /* a corrupt cache entry is simply a miss */ }
    }
    const writer = provider(spec)
    const started = Date.now()
    const before = { p: writer.usage.promptTokens, c: writer.usage.completionTokens }
    let record = { plan: plan.label, writerSpec: spec, ok: false, code: null, configHash }
    try {
      const scaffold = await buildLexicalScaffold({
        blueprint: plan.blueprint, manifest, vocabMap, meanings, pool, writer,
        buildTitlePrompt: titlePrompt, parseTitle,
        buildSketchPrompt: targetSketchPrompt, parseSketch,
        buildAnchorsPrompt: beatAnchorsPrompt, parseAnchors,
        maxTokens: scaffoldTokens,
      })
      // Stored whether it passed or not: a scaffold failure is a result about
      // the writer, and the reason is the only part worth having.
      record.scaffold = {
        ok: scaffold.ok,
        log: (scaffold.log || []).map(l => ({
          piece: l.piece, beat: l.beat || null, word: l.word || null,
          attempt: l.attempt, ok: l.ok,
          output: String(l.output || '').slice(0, 160),
          why: (l.problems || []).map(f => (f && f.message) || String(f)).join('; ').slice(0, 240),
        })),
      }
      if (!scaffold.ok) {
        record.code = 'SCAFFOLD_FAILED'
        const bad = (scaffold.log || []).filter(l => !l.ok)
        record.detail = bad.map(l => l.piece + (l.beat ? '/' + l.beat : '')).join(', ')
        const firstBad = record.scaffold.log.find(l => !l.ok)
        record.firstReason = firstBad ? (firstBad.piece + (firstBad.beat ? '/' + firstBad.beat : '') + ': ' + firstBad.why + '  [got: ' + firstBad.output + ']') : null
        record.scaffoldCode = scaffold.code || null
      } else {
        const withScaffold = applyScaffold(plan.blueprint, scaffold)
        const realized = await realizeByBeat({
          blueprint: withScaffold, allocation, manifest, vocabMap, meanings,
          writer, judge: writer,
          buildBeatPrompt: beatPrompt, parseBeat,
          buildBeatJudgePrompt: beatJudgePrompt, parseBeatJudgment,
          maxTokens: 1800,
        })
        // Every attempt, pass or fail: a beat the writer could not write is a
        // result about the writer, and the deterministic failures and the
        // judge's reason are what say which writer struggled with what.
        record.beatAttempts = (realized.attempts || []).map(a => ({
          beat: a.beat, attempt: a.attempt, accepted: a.accepted, requested: a.requested,
          lines: a.lines || [],
          failures: ((a.deterministic && a.deterministic.failures) || []).map(f => f.code + ': ' + f.message).slice(0, 4),
          score: a.score ? { overall: a.score.overall, reason: String(a.score.reason || '').slice(0, 160) } : null,
        }))
        if (!realized.ok) {
          record.code = realized.code || 'BEATS_FAILED'
          record.detail = realized.detail || ''
          record.failedBeat = realized.failedBeat || null
          const last = record.beatAttempts.filter(a => a.beat === realized.failedBeat).pop()
          record.firstReason = last ? ('beat ' + last.beat + ': ' + (last.failures.join(' | ') || (last.score ? 'judged ' + last.score.overall + ' — ' + last.score.reason : 'no reason recorded'))) : null
        } else {
          const content = realized.lines.join('\n')
          const draft = { title: String(withScaffold.chineseTitle || '').trim(), content }
          record = {
            ...record, ok: true,
            title: draft.title, content,
            lineCount: realized.lines.length,
            attempts: (realized.attempts || []).length,
            validation: validateCandidate(draft, { manifest, vocabMap, corpus: stories }),
            density: realizedDensity({ content, vocabMap, level }),
          }
        }
      }
    } catch (err) {
      record.code = 'ERROR'
      record.detail = String(err.message || err).slice(0, 200)
    }
    // Quota is infrastructure. Relabel it so nothing downstream can read a
    // rate limit as "this writer could not write the story".
    if (isQuota(record.detail) || isQuota(record.firstReason)) {
      record.quota = true
      record.code = 'INCOMPLETE_QUOTA'
    }
    record.latencyMs = Date.now() - started
    record.tokens = { prompt: writer.usage.promptTokens - before.p, completion: writer.usage.completionTokens - before.c }
    record.usage = { ...writer.usage }
    runs.push(record)
    if (record.ok && !noCache) {
      mkdirSync(cacheDir, { recursive: true })
      writeFileSync(cachePath, JSON.stringify(record, null, 1) + '\n')
    }
    console.log('  plan ' + plan.label + ' × writer#' + (writerSpecs.indexOf(spec) + 1) + ' → '
      + (record.ok ? record.lineCount + ' lines, ' + record.latencyMs + 'ms' : (record.code + ' ' + (record.detail || ''))))
  }
}

// ── Anonymous labelling ─────────────────────────────────────────────────────
const anon = new Map()
for (const plan of plans) {
  const order = anonOrder(plan.label, writerSpecs.length)
  order.forEach((writerIdx, slot) => anon.set(plan.label + '|' + writerSpecs[writerIdx], 'W' + (slot + 1)))
}
for (const r of runs) r.anon = anon.get(r.plan + '|' + r.writerSpec)

// ── Pair completeness: a model decision needs BOTH writers on the same plan ──
const complete = plans.filter(p => writerSpecs.every(w => runs.some(r => r.plan === p.label && r.writerSpec === w && r.ok)))
const quotaHit = runs.filter(r => r.quota).length
console.log('\nPAIRS: ' + complete.length + '/' + plans.length + ' plans have every writer realized'
  + (quotaHit ? '   (' + quotaHit + ' attempt(s) stopped on provider quota — infrastructure, not a writer result)' : ''))
if (complete.length < plans.length) {
  console.log('INCOMPLETE — rerun to resume; the ' + runs.filter(r => r.ok).length + ' realization(s) already produced are cached and will not be regenerated.')
}

// ── Deterministic results ───────────────────────────────────────────────────
console.log('\n' + '='.repeat(96))
console.log('DETERMINISTIC — computed in code, no model involved')
console.log('='.repeat(96))
console.log('plan  anon  lines  targets  valid  taps/worst-line  distinct-taps  failures')
for (const plan of plans) {
  for (const r of runs.filter(x => x.plan === plan.label).sort((a, b) => a.anon.localeCompare(b.anon))) {
    if (!r.ok) { console.log('  ' + plan.label.padEnd(6) + r.anon.padEnd(6) + '—  ' + r.code + ' ' + (r.detail || '')); continue }
    const v = r.validation
    const tgt = (v.targets || []).filter(t => t.ok).length + '/' + (v.targets || []).length
    console.log('  ' + plan.label.padEnd(6) + r.anon.padEnd(6) + String(r.lineCount).padStart(5)
      + '  ' + tgt.padEnd(9) + (v.ok ? 'PASS ' : 'FAIL ').padEnd(7)
      + String(r.density.maxPerLine).padStart(6) + '          ' + String(r.density.distinct).padStart(3)
      + '           ' + (v.failures || []).map(f => f.code).join(',').slice(0, 40))
  }
}

// ── Plan-time bound vs realized truth (FAB-9 §9) ────────────────────────────
console.log('\nPLAN-TIME BOUND vs REALIZED DENSITY (cap ' + ASSISTED_POLICY.assistedPerSentenceMax + ')')
console.log('plan  anon  plan minWorstSentence  realized maxPerLine  verdict')
const densityChecks = []
for (const r of runs.filter(x => x.ok)) {
  const plan = plans.find(p => p.label === r.plan)
  const planned = plan.risk.budget.minWorstSentence
  const cmp = { plan: r.plan, anon: r.anon, planned, realizedMax: r.density.maxPerLine, cap: ASSISTED_POLICY.assistedPerSentenceMax }
  cmp.verdict = (planned > cmp.cap) === (cmp.realizedMax > cmp.cap)
    ? (cmp.realizedMax > cmp.cap ? 'AGREE_REJECT' : 'AGREE_ACCEPT')
    : (planned > cmp.cap ? 'FALSE_POSITIVE' : 'FALSE_NEGATIVE')
  cmp.worstLines = r.density.lines.filter(l => l.taps > cmp.cap).map(l => ({ line: l.line, taps: l.taps, words: l.words }))
  densityChecks.push(cmp)
  console.log('  ' + r.plan.padEnd(6) + r.anon.padEnd(6) + String(planned).padStart(14)
    + String(cmp.realizedMax).padStart(21) + '  ' + cmp.verdict
    + (cmp.worstLines.length ? '  (lines ' + cmp.worstLines.map(w => w.line + ':' + w.words.join('/')).join(' ') + ')' : ''))
}

// ── Blind quality judging ───────────────────────────────────────────────────
let judgeLog = []
if (judgeSpec) {
  const judge = provider(judgeSpec)
  console.log('\nBLIND QUALITY JUDGE — ' + judgeSpec + ', shown anonymous stories only')
  for (const plan of plans) {
    const entries = runs.filter(r => r.plan === plan.label && r.ok).sort((a, b) => a.anon.localeCompare(b.anon))
    if (entries.length < 2) continue
    // A judge that is one of the writers must not score its own story.
    const conflict = entries.filter(e => e.writerSpec === judgeSpec).map(e => e.anon)
    const prompt = storyJudgePrompt({ manifest, stories: entries.map(e => ({ label: e.anon, title: e.title, content: e.content })) })
    let out = null
    let scores = null
    try {
      out = await judge.send({ kind: 'story-judge', prompt, maxTokens: 2200 })
      scores = parseStoryJudgment(out, entries.map(e => e.anon))
    } catch (err) { out = 'ERROR: ' + String(err.message || err) }
    judgeLog.push({ plan: plan.label, prompt, raw: String(out || '').slice(0, 4000), scores, conflict })
    if (!scores) { console.log('  plan ' + plan.label + ': the judgement did not parse'); continue }
    console.log('  plan ' + plan.label + '  ' + STORY_JUDGE_DIMENSIONS.join('  '))
    for (const s of scores) {
      console.log('    ' + s.label.padEnd(5)
        + STORY_JUDGE_DIMENSIONS.map(d => String(s[d] == null ? '-' : s[d]).padStart(d.length)).join('  ')
        + '   ' + (s.note || '').slice(0, 60)
        + (conflict.includes(s.label) ? '   [SELF — excluded]' : ''))
    }
  }
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'writer-bakeoff.json'), JSON.stringify({
  schema: 'writer-bakeoff@1',
  generatedAt: new Date().toISOString(),
  manifest, totalLines,
  scaffoldVersion: SCAFFOLD_VERSION, beatVersion: BEAT_VERSION, realizedVersion: REALIZED_VERSION,
  beatLimits: BEAT_LIMITS, beatQuality: BEAT_QUALITY, lexicalPolicy: ASSISTED_POLICY,
  writers: writerSpecs, judge: judgeSpec,
  sampling: sampling || 'provider default (nothing sent)',
  scaffoldTokens,
  pairs: { complete: complete.map(p => p.label), of: plans.map(p => p.label), quotaStops: quotaHit },
  status: complete.length === plans.length ? 'COMPLETE' : (quotaHit ? 'INCOMPLETE_QUOTA' : 'INCOMPLETE'),
  // The mapping lives here, in the artifact, not next to the stories above.
  anonMapping: [...anon.entries()].map(([k, v]) => ({ key: k, anon: v })),
  plans: plans.map(p => ({ label: p.label, planner: p.planner, quality: p.quality, problem: p.blueprint.problem, risk: { classification: p.risk.classification, budget: p.risk.budget } })),
  runs, densityChecks, judgeLog,
}, null, 2) + '\n')
console.log('\nwrote ' + join(outDir, 'writer-bakeoff.json'))
for (const w of writerSpecs) {
  const mine = runs.filter(r => r.writerSpec === w)
  console.log('  ' + w + ': ' + mine.filter(r => r.ok).length + '/' + mine.length + ' realized, '
    + Math.round(mine.reduce((n, r) => n + r.latencyMs, 0) / mine.length) + 'ms mean, '
    + mine.reduce((n, r) => n + r.tokens.completion, 0) + ' completion tokens')
}
