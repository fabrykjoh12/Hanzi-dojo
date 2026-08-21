// Two-model generation for one manifest (FAB-9 duo flow, v3):
//
//   WRITER natural draft (aimed at draftLines, mid-range) → validation
//     → (condensable broad FAIL) WRITER SELF-CONDENSE — the writer shortens
//         and format-fixes its own story (the cross-model editor rewrote in
//         every observed case; the author is the only model that can hold the
//         voice) → deterministic PRESERVATION gate (validateEdit: title,
//         speakers, contentSimilarity — a failed condense NEVER replaces the
//         draft) → validation
//     → (narrow FAIL) PATCH-BASED micro repair: only the changed lines come
//         back, applied deterministically, rest byte-for-byte untouched
//     → still broadly failing → reject (the editor-simplify path stays
//         available behind broadStage: 'editor' but is not the default)
//     → (on PASS) WRITER semantic critique → line-aligned translation
//
// The division of labour the benchmarks measured: the writer (Qwen) owns the
// story idea, narrative voice and natural Chinese; the editor (gpt-oss) owns
// compliance — it never regenerates from scratch, it edits the writer's story
// toward the deterministic constraints it is handed. The deterministic
// validator runs after EVERY edit and remains the only authority on PASS/FAIL;
// no model output can override a failure, and the critique runs only after a
// PASS.
//
// Every stage is kept — the evolution (draft → failures → edit → revalidation
// → repair → final) is the pilot's actual deliverable, so a human can see
// whether simplification destroys the writing.
//
// Pure: providers injected, no network/fs/Supabase here.

import { validateCandidate, validateEdit, serializableValidation } from './storyCandidateValidation.mjs'
import { validateManifest } from './storyManifestPlanner.mjs'
import {
  PROMPT_VERSION,
  draftPrompt,
  simplifyPrompt,
  selfCondensePrompt,
  microRepairPrompt,
  parseLinePatch,
  translatePrompt,
  parseChapter,
  parseTranslation,
} from './storyGenPrompts.mjs'
import { judgePrompt, parseJudgment, JUDGE_VERSION } from './storyJudge.mjs'
import { outputBudget } from './storyGenPipeline.mjs'
import { levelConfig } from './storyLevels.mjs'

export const DUO_GENERATOR_VERSION = 'fab9-duo@3'

export const DUO_LIMITS = {
  parseRetries: 2,     // per logical call, same cap as the single-model pipeline
}

// Same bounded logical-call shape as storyGenPipeline.call, kept local so the
// two pipelines stay independently readable. Transient errors retry inside
// the budget; rate-limit waiting happens INSIDE the provider (llmDirect) and
// never consumes one of these attempts.
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

const stageRank = (v) => (v.verdict === 'PASS' ? 10000 : 0) - v.failures.length

// Narrow-failure test for patch-based micro repair: at most two targets short
// of minimum (missing counts as below-minimum), at most one spammed target,
// at most one overlong line — and nothing else wrong.
export function microRepairable(failures) {
  let belowMin = 0, aboveMax = 0, longLine = 0
  for (const f of failures || []) {
    if (f.code === 'target_below_min' || f.code === 'missing_target') belowMin += 1
    else if (f.code === 'target_above_max') aboveMax += 1
    else if (f.code === 'line_too_long') longLine += 1
    else return false
  }
  const total = belowMin + aboveMax + longLine
  return total > 0 && belowMin <= 2 && aboveMax <= 1 && longLine <= 1
}

// Which broad failures can self-condensing plausibly fix: too long, bad
// speaker labels, and difficulty that shrinks when text is cut and
// simplified. NOT: a story that is too short (condensing it is absurd), has
// no usable title/content, or duplicates the corpus — those need a fresh
// draft, not an edit.
const CONDENSE_FIXABLE = new Set([
  'too_long', 'unknown_speaker', 'line_too_long',
  'out_of_level_share', 'unknown_words', 'unknown_share',
  'target_below_min', 'target_above_max', 'missing_target',
  'repeated_line', 'repetition_excess',
])
export function selfCondensable(failures) {
  if (!failures || !failures.length) return false
  if (!failures.every(f => CONDENSE_FIXABLE.has(f.code))) return false
  return failures.some(f => f.code === 'too_long' || f.code === 'unknown_speaker'
    || f.code === 'out_of_level_share' || f.code === 'unknown_words' || f.code === 'unknown_share')
}

// Apply a parsed line patch: replace exactly the given 1-based lines; every
// other line stays byte-for-byte identical.
export function applyLinePatch(content, patch) {
  const lines = String(content || '').split('\n').map(l => l.trim()).filter(Boolean)
  for (const { line, text } of patch) lines[line - 1] = text
  return lines.join('\n')
}

export async function generateDuoCandidate({
  manifest,
  pool,
  vocabMap,
  corpus = [],
  meanings = {},
  writer,              // async ({kind, prompt, maxTokens}) => text — the storyteller
  editor,              // async ({kind, prompt, maxTokens}) => text — the constraint editor
  limits = {},
  translate: translateEnabled = true,
  critique: critiqueEnabled = true,
  broadStage = 'self-condense',   // 'self-condense' (writer edits itself) | 'editor' (gpt-oss simplify)
  sleep = null,
} = {}) {
  const slp = sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)))
  const lim = { ...DUO_LIMITS, ...limits }
  const mCheck = validateManifest(manifest)
  if (!mCheck.ok) throw new Error('refusing to generate from an invalid manifest (' + (manifest && manifest.id) + '): ' + mCheck.problems.join('; '))

  const calls = { count: 0, errors: [] }
  const validate = (candidate) => validateCandidate(candidate, { manifest, vocabMap, corpus })
  const stages = []
  const record = (stage, role, cand, validation) => {
    stages.push({
      stage, role,
      title: cand.title, content: cand.content,
      validation: serializableValidation(validation),
    })
  }

  // ── 1. Writer draft ─────────────────────────────────────────────────────────
  let draft
  try {
    draft = await call(writer, 'draft', draftPrompt({ manifest, pool, meanings }),
      outputBudget(manifest, 'draft'), parseChapter, lim.parseRetries, calls, slp)
  } catch {
    return finish({ manifest, stages, best: null, calls, critique: null, english: null })
  }
  let best = { cand: draft, validation: validate(draft) }
  record('draft', 'writer', draft, best.validation)

  // ── 2. Broad-failure stage, gated by the deterministic preservation check:
  // a rewrite (changed title, invented speakers, low content similarity) is
  // recorded in the evolution but NEVER replaces the draft.
  //
  // Default is WRITER SELF-CONDENSE: the author shortens its own story. The
  // cross-model editor path remains selectable (broadStage: 'editor') but
  // rewrote the story in every observed run.
  if (best.validation.verdict === 'FAIL' && !microRepairable(best.validation.failures)) {
    const useCondense = broadStage === 'self-condense' && selfCondensable(best.validation.failures)
    const useEditor = broadStage === 'editor'
    if (useCondense || useEditor) {
      try {
        const input = best.cand
        const stageName = useCondense ? 'self-condense' : 'simplify'
        const role = useCondense ? 'writer' : 'editor'
        const provider = useCondense ? writer : editor
        const prompt = useCondense
          ? selfCondensePrompt({ manifest, candidate: input, failures: best.validation.failures, meanings })
          : simplifyPrompt({ manifest, candidate: input, failures: best.validation.failures, pool, meanings })
        const edited = await call(provider, stageName, prompt,
          outputBudget(manifest, 'repair'), parseChapter, lim.parseRetries, calls, slp)
        const edit = validateEdit(input, edited)
        const v = validate(edited)
        const merged = {
          ...v,
          verdict: (v.verdict === 'PASS' && edit.ok) ? 'PASS' : 'FAIL',
          failures: [...v.failures, ...edit.failures],
          warnings: [...v.warnings, ...edit.warnings],
          metrics: { ...v.metrics, edit: edit.metrics },
        }
        record(stageName, role, edited, merged)
        if (edit.ok && stageRank(merged) >= stageRank(best.validation)) best = { cand: edited, validation: merged }
      } catch { /* stage failed to produce text — the draft stays the best we have */ }
    }
  }

  // ── 3. Patch-based micro repair — narrow failures only. The editor returns
  // just the changed lines; the patch applies deterministically, so the rest
  // of the story cannot drift.
  if (best.validation.verdict === 'FAIL' && microRepairable(best.validation.failures)) {
    try {
      const input = best.cand
      const lineCount = input.content.split('\n').filter(l => l.trim()).length
      const patch = await call(editor, 'micro-repair',
        microRepairPrompt({ manifest, candidate: input, failures: best.validation.failures, meanings }),
        800, (t) => parseLinePatch(t, lineCount), lim.parseRetries, calls, slp)
      const patched = { title: input.title, content: applyLinePatch(input.content, patch) }
      const v = validate(patched)
      record('micro-repair', 'editor', patched, v)
      stages[stages.length - 1].patch = patch
      if (stageRank(v) >= stageRank(best.validation)) best = { cand: patched, validation: v }
    } catch { /* no parseable patch — keep the best stage we have */ }
  }

  // ── 4. Writer critique + translation — PASS only ────────────────────────────
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
        english = await call(editor, 'translate', translatePrompt({ candidate: best.cand }),
          outputBudget(manifest, 'translate'), (t) => parseTranslation(t, lineCount), lim.parseRetries, calls, slp)
      } catch { english = null }
    }
  }

  // Final validation of exactly what would be staged (content + translation).
  const finalValidation = validate({ ...best.cand, englishContent: english })
  return finish({ manifest, stages, best: { ...best, validation: finalValidation }, calls, critique, english })
}

function finish({ manifest, stages, best, calls, critique, english }) {
  if (!best) {
    return {
      manifestId: manifest.id,
      status: 'rejected',
      title: null, content: null, englishContent: null,
      stages,
      validation: { verdict: 'FAIL', failures: [{ code: 'no_candidate', message: 'the writer produced no parseable draft' }], warnings: [], metrics: {} },
      critique: null,
      attempts: 1,
      calls: calls.count,
      providerErrors: calls.errors.slice(0, 12),
      generatorVersion: DUO_GENERATOR_VERSION,
      promptVersion: PROMPT_VERSION,
    }
  }
  return {
    manifestId: manifest.id,
    status: best.validation.verdict === 'PASS' ? 'accepted' : best.validation.verdict === 'REVIEW_REQUIRED' ? 'review_required' : 'rejected',
    title: best.cand.title,
    content: best.cand.content,
    englishContent: english,
    stages,
    validation: best.validation,
    critique,
    attempts: 1,
    calls: calls.count,
    providerErrors: calls.errors.slice(0, 12),
    generatorVersion: DUO_GENERATOR_VERSION,
    promptVersion: PROMPT_VERSION,
  }
}

// JSON-safe candidate-file shape (mirrors storyGenPipeline.serializableCandidate).
export function serializableDuoCandidate(result) {
  return { ...result, validation: serializableValidation(result.validation) }
}
