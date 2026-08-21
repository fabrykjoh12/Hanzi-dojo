// Best-of-K selection pipeline — the production targeted-story flow
// (FAB-9, fab9-select@1). Three experiment rounds established that full-story
// editing is unreliable on every viable model (gpt-oss rewrites Qwen's
// stories, Qwen rewrites its own; the preservation gate caught both), while
// Qwen's independent drafts vary widely — some land close to compliance. So
// the pipeline stops editing and starts SELECTING:
//
//   manifest → K INDEPENDENT writer drafts (same prompt, no cross-feeding,
//   never asked to revise a previous draft) → deterministic validation of
//   each → transparent deterministic ranking → best draft
//     → PASS: no repair; semantic critique + translation
//     → narrow FAIL: ONE patch-based micro-repair (patcher model returns only
//       changed lines, applied deterministically, story otherwise
//       byte-for-byte untouched) → revalidate
//     → broad FAIL: stop, reject, report
//
// No LLM chooses the winner. The ranking is code, ordered exactly as
// specified: PASS dominates; then fewer hard failures, target compliance,
// out-of-level share, unknown share, structure/speaker validity, distance
// from the draft line target — warnings only as a final tiebreak. Every
// draft's ranking breakdown is saved so "why did B beat A" is answerable
// from the artifact alone.
//
// The patcher (gpt-oss — demonstrably the stronger constraint-follower)
// never receives a full-story writing task: only line patches and
// translation.
//
// Pure: providers injected, no network/fs/Supabase here.

import { validateCandidate, serializableValidation } from './storyCandidateValidation.mjs'
import { validateManifest } from './storyManifestPlanner.mjs'
import {
  PROMPT_VERSION,
  draftPrompt,
  microRepairPrompt,
  parseLinePatch,
  translatePrompt,
  parseChapter,
  parseTranslation,
} from './storyGenPrompts.mjs'
import { judgePrompt, parseJudgment, JUDGE_VERSION } from './storyJudge.mjs'
import { outputBudget } from './storyGenPipeline.mjs'
import { microRepairable, applyLinePatch } from './storyDuoPipeline.mjs'
import { levelConfig } from './storyLevels.mjs'

export const SELECT_GENERATOR_VERSION = 'fab9-select@1'

export const SELECT_LIMITS = {
  parseRetries: 2,     // per logical call, unchanged
}

const STRUCTURE_CODES = new Set(['unknown_speaker', 'too_long', 'too_short', 'line_too_long', 'invalid_title', 'invalid_content'])

// The transparent per-draft breakdown the ranking is computed from.
export function draftBreakdown(validation, manifest) {
  const met = validation.metrics || {}
  const counts = met.targetCounts || {}
  let inRange = 0
  for (const t of manifest.targets) {
    const n = counts[t.word] || 0
    if (n >= t.min && n <= t.max) inRange += 1
  }
  const lines = met.lines || 0
  const dl = manifest.length.draftLines || [manifest.length.minLines, manifest.length.maxLines]
  const lineDistance = lines < dl[0] ? dl[0] - lines : lines > dl[1] ? lines - dl[1] : 0
  return {
    pass: validation.verdict === 'PASS',
    failures: validation.failures.length,
    targetsInRange: inRange,
    targetsTotal: manifest.targets.length,
    outOfLevelShare: met.outOfLevelCharShare != null ? met.outOfLevelCharShare : 1,
    unknownShare: met.unknownCharShare != null ? met.unknownCharShare : 1,
    structureFailures: validation.failures.filter(f => STRUCTURE_CODES.has(f.code)).length,
    lineDistance,
    warnings: validation.warnings.length,
  }
}

// Strict lexicographic comparison in the specified priority order.
// Negative → a ranks better than b.
export function compareDrafts(a, b) {
  if (a.pass !== b.pass) return a.pass ? -1 : 1
  if (a.failures !== b.failures) return a.failures - b.failures
  if (a.targetsInRange !== b.targetsInRange) return b.targetsInRange - a.targetsInRange
  if (a.outOfLevelShare !== b.outOfLevelShare) return a.outOfLevelShare - b.outOfLevelShare
  if (a.unknownShare !== b.unknownShare) return a.unknownShare - b.unknownShare
  if (a.structureFailures !== b.structureFailures) return a.structureFailures - b.structureFailures
  if (a.lineDistance !== b.lineDistance) return a.lineDistance - b.lineDistance
  return a.warnings - b.warnings
}

// Apply a structural patch deterministically: replacements substitute their
// line, deletes drop it, inserts append after their anchor. Every untouched
// line is byte-for-byte the original. The title is not a numbered line and
// therefore cannot be touched at all.
export function applyStructuralPatch(content, ops) {
  const lines = String(content || '').split('\n').map(l => l.trim()).filter(Boolean)
  const replaced = new Map()
  const deleted = new Set()
  const inserts = new Map()      // after-line-index (1-based, 0 = at start) → [texts]
  for (const o of ops) {
    if (o.op === 'replace') replaced.set(o.line, o.text)
    else if (o.op === 'delete') deleted.add(o.line)
    else if (o.op === 'insert') {
      if (!inserts.has(o.line)) inserts.set(o.line, [])
      inserts.get(o.line).push(o.text)
    }
  }
  const out = []
  if (inserts.has(0)) out.push(...inserts.get(0))
  for (let i = 1; i <= lines.length; i += 1) {
    if (!deleted.has(i)) out.push(replaced.has(i) ? replaced.get(i) : lines[i - 1])
    if (inserts.has(i)) out.push(...inserts.get(i))
  }
  return out.join('\n')
}

// Failure classes a bounded line patch can plausibly address. Everything
// else (too_short, invalid title/content, corpus duplicates) needs a new
// draft, not surgery.
const PATCHABLE_CODES = new Set([
  'too_long', 'line_too_long', 'unknown_speaker',
  'missing_target', 'target_below_min', 'target_above_max',
  'out_of_level_share', 'unknown_words', 'unknown_share',
  'repeated_line', 'repetition_excess',
])
export function structurallyPatchable(failures) {
  return Boolean(failures && failures.length) && failures.every(f => PATCHABLE_CODES.has(f.code))
}

async function call(provider, kind, prompt, maxTokens, parse, parseRetries, calls, sleep) {
  let lastErr = null
  for (let i = 0; i <= parseRetries; i += 1) {
    let text
    try {
      calls.count += 1
      text = await provider({ kind, prompt, maxTokens })
    } catch (err) {
      const message = String(err.message || err).slice(0, 300)
      calls.errors.push({ kind, attempt: i + 1, message })
      if (/HTTP (400|401|403|404|413|422)\b/.test(message)) break
      if (i < parseRetries) await sleep(Math.min(8000 * Math.pow(2, i), 30000))
      continue
    }
    const parsed = parse(text)
    if (parsed != null) return parsed
    lastErr = new Error(kind + ' response was unparseable')
    calls.errors.push({ kind, attempt: i + 1, message: 'unparseable response', sample: String(text).slice(0, 200) })
  }
  throw lastErr
}

export async function generateSelectCandidate({
  manifest,
  pool,
  vocabMap,
  corpus = [],
  meanings = {},
  writer,              // async ({kind, prompt, maxTokens}) => text — draft author + critic
  patcher,             // async (...) => text — line patches + translation ONLY
  K = 3,
  limits = {},
  critique: critiqueEnabled = true,
  translate: translateEnabled = true,
  usage = null,        // optional { writer, patcher } live usage objects, for per-draft attribution
  sleep = null,
} = {}) {
  const slp = sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)))
  const lim = { ...SELECT_LIMITS, ...limits }
  const mCheck = validateManifest(manifest)
  if (!mCheck.ok) throw new Error('refusing to generate from an invalid manifest (' + (manifest && manifest.id) + '): ' + mCheck.problems.join('; '))

  const calls = { count: 0, errors: [] }
  const validate = (candidate) => validateCandidate(candidate, { manifest, vocabMap, corpus })
  const snap = (u) => (u ? { promptTokens: u.promptTokens, completionTokens: u.completionTokens } : null)
  const delta = (before, u) => (before && u
    ? { promptTokens: u.promptTokens - before.promptTokens, completionTokens: u.completionTokens - before.completionTokens }
    : null)

  // ── K independent drafts — same prompt every time, nothing fed back ────────
  const prompt = draftPrompt({ manifest, pool, meanings })
  const stages = []
  const drafts = []
  for (let k = 1; k <= K; k += 1) {
    const before = snap(usage && usage.writer)
    const startedAt = Date.now()
    let cand = null
    try {
      cand = await call(writer, 'draft', prompt, outputBudget(manifest, 'draft'), parseChapter, lim.parseRetries, calls, slp)
    } catch { /* recorded in calls.errors; this slot simply yields no draft */ }
    const stage = {
      stage: 'draft-' + k,
      role: 'writer',
      title: cand ? cand.title : null,
      content: cand ? cand.content : null,
      validation: null,
      latencyMs: Date.now() - startedAt,
      usage: delta(before, usage && usage.writer),
    }
    if (cand) {
      const v = validate(cand)
      stage.validation = serializableValidation(v)
      drafts.push({ index: k, cand, validation: v, breakdown: draftBreakdown(v, manifest) })
    } else {
      stage.validation = { verdict: 'FAIL', failures: [{ code: 'no_draft', message: 'this draft slot produced no parseable story' }], warnings: [], metrics: {} }
    }
    stages.push(stage)
  }

  // ── Deterministic selection ────────────────────────────────────────────────
  drafts.sort((a, b) => compareDrafts(a.breakdown, b.breakdown))
  const ranking = drafts.map((d, position) => ({
    rank: position + 1,
    draft: 'draft-' + d.index,
    title: d.cand.title,
    verdict: d.validation.verdict,
    ...d.breakdown,
  }))

  if (drafts.length === 0) {
    return finish({ manifest, stages, ranking, best: null, calls, critique: null, english: null })
  }
  let best = { cand: drafts[0].cand, validation: drafts[0].validation, from: 'draft-' + drafts[0].index }

  // ── Micro-repair — only when the WINNER is already narrow ──────────────────
  if (best.validation.verdict === 'FAIL' && microRepairable(best.validation.failures)) {
    try {
      const input = best.cand
      const lineCount = input.content.split('\n').filter(l => l.trim()).length
      const patch = await call(patcher, 'micro-repair',
        microRepairPrompt({ manifest, candidate: input, failures: best.validation.failures, meanings }),
        800, (t) => parseLinePatch(t, lineCount), lim.parseRetries, calls, slp)
      const patched = { title: input.title, content: applyLinePatch(input.content, patch) }
      const v = validate(patched)
      stages.push({ stage: 'micro-repair', role: 'patcher', title: patched.title, content: patched.content, validation: serializableValidation(v), patch })
      if (compareDrafts(draftBreakdown(v, manifest), draftBreakdown(best.validation, manifest)) <= 0) {
        best = { cand: patched, validation: v, from: 'micro-repair' }
      }
    } catch { /* no parseable patch — the winning draft stands as-is */ }
  }

  // ── Critique + translation — PASS only ─────────────────────────────────────
  let critique = null
  let english = null
  if (best.validation.verdict === 'PASS') {
    if (critiqueEnabled) {
      try {
        const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
        critique = await call(writer, 'critique',
          judgePrompt({ candidate: best.cand, manifest, levelName: (cfg && cfg.levelName) || ('HSK ' + manifest.level) }),
          1200, parseJudgment, lim.parseRetries, calls, slp)
        if (critique) critique = { judgeVersion: JUDGE_VERSION, role: 'writer', ...critique }
      } catch { critique = null }
    }
    if (translateEnabled) {
      const lineCount = best.cand.content.split('\n').filter(l => l.trim()).length
      try {
        english = await call(patcher, 'translate', translatePrompt({ candidate: best.cand }),
          outputBudget(manifest, 'translate'), (t) => parseTranslation(t, lineCount), lim.parseRetries, calls, slp)
      } catch { english = null }
    }
  }

  const finalValidation = validate({ ...best.cand, englishContent: english })
  return finish({ manifest, stages, ranking, best: { ...best, validation: finalValidation }, calls, critique, english })
}

function finish({ manifest, stages, ranking, best, calls, critique, english }) {
  const base = {
    manifestId: manifest.id,
    stages,
    ranking,
    critique,
    attempts: stages.filter(s => s.stage.startsWith('draft-')).length,
    calls: calls.count,
    providerErrors: calls.errors.slice(0, 12),
    generatorVersion: SELECT_GENERATOR_VERSION,
    promptVersion: PROMPT_VERSION,
  }
  if (!best) {
    return {
      ...base,
      status: 'rejected',
      title: null, content: null, englishContent: null,
      validation: { verdict: 'FAIL', failures: [{ code: 'no_candidate', message: 'no draft slot produced a parseable story' }], warnings: [], metrics: {} },
    }
  }
  return {
    ...base,
    status: best.validation.verdict === 'PASS' ? 'accepted' : 'rejected',
    selectedFrom: best.from,
    title: best.cand.title,
    content: best.cand.content,
    englishContent: english,
    validation: best.validation,
  }
}

export function serializableSelectCandidate(result) {
  return { ...result, validation: serializableValidation(result.validation) }
}
