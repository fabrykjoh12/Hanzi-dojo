// The generation pipeline for one manifest (FAB-9):
//
//   manifest → draft → deterministic validation → targeted repair (bounded)
//            → optional LLM critique + quality revision (never overrules the
//              deterministic gate — a revision that breaks validation is
//              discarded) → line-aligned translation → candidate record
//
// The provider is INJECTED: an async ({ kind, prompt, maxTokens }) => string.
// Production wires llm.mjs's premium client behind that signature
// (generate-targeted-stories.mjs); tests and dry runs wire scripted fakes.
// This module therefore holds no vendor, no network, no Supabase, no fs —
// the whole loop runs and is tested offline.
//
// The deterministic validator (storyCandidateValidation.mjs) is the only
// authority on PASS/FAIL. The critique stage exists for what the validator
// cannot see — naturalness, coherence, whether it reads like a story — and
// can only *improve* candidates, never admit one the validator rejected.

import { validateCandidate, serializableValidation } from './storyCandidateValidation.mjs'
import { validateManifest } from './storyManifestPlanner.mjs'
import {
  PROMPT_VERSION,
  draftPrompt,
  repairPrompt,
  critiquePrompt,
  qualityRevisePrompt,
  translatePrompt,
  parseChapter,
  parseCritique,
  parseTranslation,
} from './storyGenPrompts.mjs'

export const GENERATOR_VERSION = 'fab9-pipeline@1'

export const DEFAULT_LIMITS = {
  attempts: 2,        // from-scratch drafts per manifest
  repairRounds: 2,    // targeted validation repairs per attempt
  qualityRounds: 1,   // critique-driven revisions per attempt
  parseRetries: 2,    // re-asks when a response is unparseable
}

// A critique below TARGET_SCORE gets a quality revision; the publish floor is
// the staging tool's concern, recorded on the candidate for the human review.
export const TARGET_SCORE = 8

// Rank attempts: deterministic validity dominates everything, then critique
// score, then fewer failures, then coverage-ish tiebreak on target hits.
export function rankAttempt(a) {
  const valid = a.validation.verdict === 'PASS' ? 1 : 0
  const score = (a.critique && a.critique.score) || 0
  const failures = a.validation.failures.length
  return valid * 10000 + score * 100 - failures
}

// One logical provider call: up to parseRetries+1 attempts covering BOTH an
// unparseable response and a thrown provider error (rate limit, network) —
// pilot-1 showed a 429 escaping this loop instantly while a garbled response
// got retries, which is backwards. Thrown errors also back off (injectable
// `sleep`, stubbed in tests), like the serial pipeline's callText. The per-call
// cap is unchanged: at most parseRetries+1 provider requests either way.
async function call(provider, kind, prompt, maxTokens, parse, parseRetries, calls, sleep) {
  let lastErr = null
  for (let i = 0; i <= parseRetries; i += 1) {
    let text
    try {
      calls.count += 1
      text = await provider({ kind, prompt, maxTokens })
    } catch (err) {
      lastErr = err
      if (i < parseRetries) await sleep(Math.min(8000 * Math.pow(2, i), 30000))
      continue
    }
    const parsed = parse(text)
    if (parsed != null) return parsed
    lastErr = new Error(kind + ' response was unparseable')
  }
  throw lastErr
}

// Generate one candidate for one manifest. Returns a candidate record —
// including FAILED ones (status 'rejected'), because rejected attempts are
// batch artifacts, not silent losses.
export async function generateCandidate({
  manifest,
  pool,                // [{ word, level, meaning? }] — prompt vocabulary (frequency-ordered)
  vocabMap,            // full word → { word, level } map for the validator
  corpus = [],         // existing stories + already-accepted batch candidates, for dedup
  meanings = {},       // word → meaning for target lists in prompts
  provider,
  limits = {},
  critique: critiqueEnabled = true,
  translate: translateEnabled = true,
  sleep = null,                          // injectable backoff (tests stub it); default: real timer
} = {}) {
  const slp = sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)))
  const lim = { ...DEFAULT_LIMITS, ...limits }
  const mCheck = validateManifest(manifest)
  if (!mCheck.ok) throw new Error('refusing to generate from an invalid manifest (' + (manifest && manifest.id) + '): ' + mCheck.problems.join('; '))

  const calls = { count: 0 }
  const validate = (candidate) => validateCandidate(candidate, { manifest, vocabMap, corpus })

  let best = null
  for (let attempt = 1; attempt <= lim.attempts; attempt += 1) {
    let cand
    try {
      cand = await call(provider, 'draft', draftPrompt({ manifest, pool, meanings }), 6000, parseChapter, lim.parseRetries, calls, slp)
    } catch {
      continue                                   // a dead draft costs the attempt, not the manifest
    }
    let validation = validate(cand)

    // Targeted repair: the validator's machine-readable failures go straight
    // back to the model. A repair that makes things worse is discarded.
    for (let round = 0; round < lim.repairRounds && validation.verdict === 'FAIL'; round += 1) {
      let fixed
      try {
        fixed = await call(provider, 'repair',
          repairPrompt({ manifest, candidate: cand, failures: validation.failures, pool, meanings }),
          6000, parseChapter, lim.parseRetries, calls, slp)
      } catch {
        break
      }
      const fixedValidation = validate(fixed)
      if (fixedValidation.failures.length <= validation.failures.length) {
        cand = fixed
        validation = fixedValidation
      }
    }

    let crit = null
    if (critiqueEnabled && validation.verdict === 'PASS') {
      try {
        crit = await call(provider, 'critique', critiquePrompt({ manifest, candidate: cand }), 2000, parseCritique, lim.parseRetries, calls, slp)
        for (let round = 0; round < lim.qualityRounds && crit && crit.score < TARGET_SCORE; round += 1) {
          const revised = await call(provider, 'revise',
            qualityRevisePrompt({ manifest, candidate: cand, feedback: crit.feedback || '', pool, meanings }),
            6000, parseChapter, lim.parseRetries, calls, slp)
          const revisedValidation = validate(revised)
          if (revisedValidation.verdict !== 'PASS') break     // quality never overrules the gate
          const revisedCrit = await call(provider, 'critique', critiquePrompt({ manifest, candidate: revised }), 2000, parseCritique, lim.parseRetries, calls, slp)
          if ((revisedCrit.score || 0) <= crit.score) break   // didn't help — keep the original
          cand = revised
          validation = revisedValidation
          crit = revisedCrit
        }
      } catch {
        crit = null                              // critique is optional; its failure never sinks a valid candidate
      }
    }

    const record = { candidate: cand, validation, critique: crit, attempt }
    if (!best || rankAttempt(record) > rankAttempt(best)) best = record
    if (validation.verdict === 'PASS' && (!critiqueEnabled || (crit && crit.score >= TARGET_SCORE))) break
  }

  if (!best) {
    return {
      manifestId: manifest.id,
      status: 'rejected',
      title: null,
      content: null,
      englishContent: null,
      validation: { verdict: 'FAIL', failures: [{ code: 'no_candidate', message: 'every draft attempt failed (provider error or unparseable response)' }], warnings: [], metrics: {} },
      critique: null,
      attempts: lim.attempts,
      calls: calls.count,
      generatorVersion: GENERATOR_VERSION,
      promptVersion: PROMPT_VERSION,
    }
  }

  // Translation happens once, for the winning attempt. A failed translation
  // never sinks the candidate — english_content is nullable in the schema and
  // required only at publication, not at staging.
  let english = null
  if (translateEnabled && best.validation.verdict === 'PASS') {
    const lineCount = best.candidate.content.split('\n').filter(l => l.trim()).length
    try {
      english = await call(provider, 'translate', translatePrompt({ candidate: best.candidate }), 6000,
        (t) => parseTranslation(t, lineCount), lim.parseRetries, calls, slp)
    } catch {
      english = null
    }
  }

  // Final validation of exactly what would be staged (content + translation).
  const finalValidation = validate({ ...best.candidate, englishContent: english })

  return {
    manifestId: manifest.id,
    status: finalValidation.verdict === 'PASS' ? 'accepted' : 'rejected',
    title: best.candidate.title,
    content: best.candidate.content,
    englishContent: english,
    validation: finalValidation,
    critique: best.critique,
    attempts: best.attempt,
    calls: calls.count,
    generatorVersion: GENERATOR_VERSION,
    promptVersion: PROMPT_VERSION,
  }
}

// The JSON-safe candidate-file shape (drops the in-process counts Map).
export function serializableCandidate(result) {
  return { ...result, validation: serializableValidation(result.validation) }
}
