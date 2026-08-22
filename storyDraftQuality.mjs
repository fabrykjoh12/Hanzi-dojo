// Pre-repair draft quality gate (FAB-9, 2026-08-22).
//
// repair-3 proved the repair subsystem works: a deterministically failing
// draft came out REVIEW_REQUIRED with four surgical operations, every gate
// clean. The full-story critique of that result was 3/10 — and every word of
// its criticism was about lines repair never touched. We had spent sixteen
// generation calls, two host-ranking calls and four judging calls making a
// story compliant that was not worth keeping.
//
// So the question this module answers is asked BEFORE any repair:
//
//   "Is the underlying story good enough that fixing its mechanical problems
//    is worth doing?"   and   "Are those problems actually small?"
//
// Two rules it never breaks:
//   1. It cannot override deterministic validation. A story it likes is not
//      thereby valid; a story it dislikes is not thereby invalid. It only
//      decides whether repair is ATTEMPTED.
//   2. It runs on the untouched writer draft, so the scores describe what the
//      writer produced — not what repair made of it.
//
// Pure: no network, no fs, no clock.

// Pilot thresholds. Deliberately conservative and deliberately simple: they
// exist to stop repair being spent on drafts like repair-3's (overall 3,
// natural 3, coherence 3, integration 2) and should be recalibrated from
// accepted/rejected samples once there are some.
export const DRAFT_QUALITY = {
  overall: 6,
  natural: 5,
  coherence: 5,
  integration: 5,
  human: 5,
}

// How much mechanical damage is still worth repairing. Beyond these the story
// does not need surgery, it needs to be written again.
export const REPAIRABLE_LIMITS = {
  lineExcess: 4,               // lines over the ceiling
  missingOccurrences: 3,       // total target occurrences to add
  excessOccurrences: 3,        // total target occurrences to remove
  unknownExcess: 4,            // distinct unknown runs over the cap
  longLines: 2,                // isolated malformed lines
  unknownSpeakers: 2,
}

// Failure classes a bounded line repair can address at all. Everything else —
// a story too short, an invalid title, a corpus duplicate, repetition running
// through the whole text, an out-of-level share past its ceiling — is a
// rewrite, not a repair.
const REPAIRABLE_CODES = new Set([
  'too_long', 'line_too_long', 'unknown_speaker',
  'missing_target', 'target_below_min', 'target_above_max',
  'unknown_words', 'unknown_share', 'repeated_line',
])

const BROAD_REASON = {
  too_short: 'the story is under length — that is writing, not repair',
  invalid_title: 'malformed title',
  invalid_content: 'no usable content',
  invalid_manifest: 'the manifest itself is invalid',
  duplicate_of_existing: 'it duplicates a published story',
  series_inconsistent: 'series metadata is inconsistent',
  english_misaligned: 'the translation does not line up',
  forbidden_word: 'it uses forbidden vocabulary',
  repetition_excess: 'repeated phrasing runs through the whole story',
  out_of_level_share: 'wholesale difficulty mismatch — too much of the text is above level',
}

// The semantic half. `critique` is whatever the existing full-story judge
// returned (storyJudge.parseJudgment) for the UNTOUCHED draft.
export function evaluateDraftQuality(critique, { thresholds = DRAFT_QUALITY } = {}) {
  if (!critique || critique.overall == null) {
    return {
      ok: false,
      code: 'DRAFT_QUALITY_UNKNOWN',
      reasons: ['the semantic critique returned nothing usable — refusing to repair a draft nobody has read'],
      scores: {},
      overall: null,
      mechanical: null,
      contradiction: null,
    }
  }
  const scores = critique.scores || {}
  const reasons = []
  if (critique.overall < thresholds.overall) {
    reasons.push('overall ' + critique.overall + ' < ' + thresholds.overall)
  }
  for (const key of ['natural', 'coherence', 'integration', 'human']) {
    const min = thresholds[key]
    if (min == null) continue
    const got = scores[key]
    if (got == null) reasons.push(key + ' was not scored')
    else if (got < min) reasons.push(key + ' ' + got + ' < ' + min)
  }
  // A story can average acceptably and still be broken in one decisive way:
  // a plot that contradicts itself is not repairable by rewriting two lines,
  // whatever the other numbers say.
  if (critique.contradiction === true) {
    reasons.push('the judge reported a serious contradiction or nonsensical plot'
      + (critique.contradictionDetail ? ': ' + critique.contradictionDetail : ''))
  }
  return {
    ok: reasons.length === 0,
    code: reasons.length ? 'DRAFT_QUALITY_FAILED' : null,
    reasons,
    scores,
    overall: critique.overall,
    mechanical: critique.mechanical,
    contradiction: critique.contradiction === true,
    contradictionDetail: critique.contradictionDetail || null,
    thresholds,
  }
}

// The mechanical half: are the deterministic failures small enough to be worth
// surgery? Magnitudes come from the validator's own metrics, never from a
// second reading of the text.
export function assessRepairability({ validation, manifest, limits = REPAIRABLE_LIMITS } = {}) {
  const failures = (validation && validation.failures) || []
  const metrics = (validation && validation.metrics) || {}
  const reasons = []

  if (!failures.length) {
    return { repairable: true, reasons: [], magnitudes: {}, trivial: true }
  }

  for (const f of failures) {
    if (REPAIRABLE_CODES.has(f.code)) continue
    reasons.push(BROAD_REASON[f.code] || ('unrepairable failure: ' + f.code))
  }

  const lineExcess = Math.max(0, (metrics.lines || 0) - manifest.length.maxLines)
  let missing = 0
  let excess = 0
  for (const t of manifest.targets) {
    const n = (metrics.targetCounts || {})[t.word] || 0
    if (n < t.min) missing += t.min - n
    if (n > t.max) excess += n - t.max
  }
  const unknownExcess = Math.max(0, (metrics.unknownDistinct || 0) - manifest.difficulty.maxUnknownDistinct)
  const longLines = failures.filter(f => f.code === 'line_too_long').length
  const badSpeakers = failures.filter(f => f.code === 'unknown_speaker').length

  if (lineExcess > limits.lineExcess) reasons.push(lineExcess + ' lines over the ceiling (max ' + limits.lineExcess + ') — large format failure')
  if (missing > limits.missingOccurrences) reasons.push(missing + ' target occurrences missing (max ' + limits.missingOccurrences + ')')
  if (excess > limits.excessOccurrences) reasons.push(excess + ' target occurrences to remove (max ' + limits.excessOccurrences + ')')
  if (unknownExcess > limits.unknownExcess) reasons.push(unknownExcess + ' unknown words over the cap (max ' + limits.unknownExcess + ')')
  if (longLines > limits.longLines) reasons.push(longLines + ' malformed lines (max ' + limits.longLines + ')')
  if (badSpeakers > limits.unknownSpeakers) reasons.push(badSpeakers + ' unknown-speaker failures (max ' + limits.unknownSpeakers + ')')

  return {
    repairable: reasons.length === 0,
    reasons,
    magnitudes: { lineExcess, missingOccurrences: missing, excessOccurrences: excess, unknownExcess, longLines, badSpeakers },
    trivial: false,
  }
}

// The whole pre-repair decision, in one call: quality first (it is the point
// of the gate), then repairability. Returns the reason repair was skipped, or
// ok:true meaning "repair is worth attempting" — never "this story is valid".
export function preRepairDecision({ critique, validation, manifest, thresholds, limits } = {}) {
  const quality = evaluateDraftQuality(critique, { thresholds })
  if (!quality.ok) {
    return { ok: false, code: quality.code, quality, repairability: null, reason: quality.reasons.join('; ') }
  }
  const repairability = assessRepairability({ validation, manifest, limits })
  if (!repairability.repairable) {
    return { ok: false, code: 'NOT_REPAIRABLE', quality, repairability, reason: repairability.reasons.join('; ') }
  }
  return { ok: true, code: null, quality, repairability, reason: null }
}
