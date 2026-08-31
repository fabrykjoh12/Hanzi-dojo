// Batch state, resume, and the bounded repair loop — FAB-10 (2026-08-31).
//
// The pipeline has to survive being interrupted. A batch is a set of manifests,
// each generating one candidate; a run can die halfway through (quota, a
// cancelled Action, a timeout) and the next run must pick up where it stopped
// WITHOUT regenerating what already passed. Two rules make that safe:
//
//   1. A candidate's identity is its manifest id, not its position. The file it
//      writes is derived from that id, so the same manifest always lands in the
//      same place and a rerun overwrites rather than appends. Nothing is ever
//      written twice under two names.
//   2. An ACCEPTED candidate is never regenerated. It is loaded and used as
//      corpus for the duplicate check of everything after it, which is also
//      what stops a resumed batch from writing a near-copy of what it already
//      accepted.
//
// THE LOOP IS BOUNDED, AND KNOWS THE DIFFERENCE BETWEEN ITS TWO MOVES
//
// A repair asks the writer to change specific things in a text it keeps; a
// regeneration throws the draft away. Repairing is much cheaper and usually
// right, but some failures cannot be repaired at all — a duplicate edited into
// a slightly different duplicate is still one — and a repair that does not move
// the diagnostics will not move them on the next pass either. So:
//
//   - any non-repairable diagnostic          → REGENERATE
//   - the same diagnostics as last time      → REGENERATE (repair is stuck)
//   - otherwise                              → REPAIR
//   - out of attempts                        → GIVE_UP, and the candidate is
//                                              recorded as rejected with its
//                                              diagnostics. It is never quietly
//                                              accepted.
//
// Pure: no fs, no network, no clock, no LLM. The runner does the IO.

export const BATCH_VERSION = 'fab10-batch@1'

export const ACTION = {
  ACCEPT: 'ACCEPT',
  REPAIR: 'REPAIR',
  REGENERATE: 'REGENERATE',
  GIVE_UP: 'GIVE_UP',
}

// Three attempts, and a repair counts as one. Measured runs on the free tier
// spent 39-47 requests on a 4-story batch; an unbounded loop turns one awkward
// manifest into the whole quota.
export const DEFAULT_MAX_ATTEMPTS = 3

/** The file one manifest's candidate always lands in. */
export function candidateFile(manifestId) {
  return String(manifestId) + '.json'
}

/**
 * What a resumed run still has to do.
 *
 * `existing` maps manifest id → the record found on disk. Accepted records are
 * skipped and returned separately so the caller can feed them to the duplicate
 * check; unfinished ones keep their attempt count, so resuming cannot reset the
 * bound and loop forever.
 */
export function planBatch({ manifests = [], existing = {} } = {}) {
  const todo = []
  const done = []
  for (const m of manifests) {
    const prior = existing[m.id]
    if (prior && prior.accepted) { done.push(prior); continue }
    todo.push({
      manifest: m,
      attemptsUsed: (prior && Number.isInteger(prior.attempts)) ? prior.attempts : 0,
      priorDiagnostics: (prior && prior.diagnostics) || null,
    })
  }
  return { todo, done }
}

/**
 * A stable fingerprint of what is wrong, used to tell "the repair helped" from
 * "the repair changed nothing that matters".
 */
export function diagnosticSignature(validation) {
  const parts = ((validation && validation.diagnostics) || [])
    .map(d => d.code + (d.word ? ':' + d.word : '') + (d.line ? '@' + d.line : ''))
    .sort()
  return parts.join('|')
}

/**
 * The next move for one candidate.
 *
 * `history` is the signatures of the previous validations for this manifest,
 * oldest first.
 */
export function nextAction({ validation, attemptsUsed = 0, history = [], maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  if (validation && validation.accepted) {
    return { action: ACTION.ACCEPT, reason: 'all checks passed' }
  }
  if (attemptsUsed >= maxAttempts) {
    return {
      action: ACTION.GIVE_UP,
      reason: 'attempt limit reached (' + maxAttempts + ') with ' +
        ((validation && validation.diagnostics) || []).length + ' unresolved diagnostic(s)',
    }
  }
  const diagnostics = (validation && validation.diagnostics) || []
  const blocking = diagnostics.filter(d => d.repairable === false)
  if (blocking.length) {
    return {
      action: ACTION.REGENERATE,
      reason: blocking.map(d => d.code).join(', ') + ' cannot be repaired in place',
    }
  }
  const sig = diagnosticSignature(validation)
  if (history.length && history[history.length - 1] === sig) {
    return { action: ACTION.REGENERATE, reason: 'the last repair changed nothing — same diagnostics' }
  }
  return { action: ACTION.REPAIR, reason: diagnostics.length + ' repairable diagnostic(s)' }
}

/**
 * The structured feedback a repair pass gets.
 *
 * Deliberately a list of concrete edits rather than the raw diagnostics: the
 * writer is being told what to change, and "TARGET_MISSING" is not an
 * instruction. Deterministic — the same validation always produces the same
 * brief, so a repair is reproducible.
 */
export function repairBrief(validation) {
  const out = []
  for (const d of ((validation && validation.diagnostics) || [])) {
    switch (d.code) {
      case 'TARGET_MISSING':
        out.push(d.insideOnly && d.insideOnly.length
          ? 'Use ' + d.word + ' as a word of its own. It currently appears only inside ' +
            d.insideOnly.join('、') + ', where the reader never meets it.'
          : 'Add ' + d.word + ' — it must appear at least ' + d.required + ' time(s), used naturally.')
        break
      case 'TARGET_UNDER_USED':
        out.push('Use ' + d.word + ' ' + d.required + ' times in different sentences (it appears ' + d.occurrences + ').')
        break
      case 'TARGET_STUFFED':
        out.push('Use ' + d.word + ' fewer times — ' + d.occurrences + ' is too many; ' + d.ceiling + ' is the ceiling.')
        break
      case 'TARGET_DENSITY':
        out.push('The required words dominate the text. Keep them, but write more around them.')
        break
      case 'UNTAPPABLE_TEXT':
        out.push('Replace ' + d.word + ' — the reader cannot resolve it, so it renders as dead text.')
        break
      case 'OUT_OF_BAND_VOCAB':
        out.push('Replace the above-band words with ones from the allowed list: ' +
          ((d.words || []).slice(0, 8).map(w => w.word).join('、')))
        break
      case 'UNKNOWN_SPEAKER':
        out.push('Line ' + d.line + ': "' + d.speaker + '" is not in the cast. Use a listed character or make it narration.')
        break
      case 'LINE_COUNT':
        out.push(d.lines < d.min
          ? 'The chapter is too short: ' + d.lines + ' lines, needs ' + d.min + '-' + d.max + '.'
          : 'The chapter is too long: ' + d.lines + ' lines, needs ' + d.min + '-' + d.max + '.')
        break
      case 'LINE_TOO_LONG':
        out.push('Split line ' + d.line + ' — ' + d.chars + ' characters is too long.')
        break
      case 'TITLE_INVALID':
        out.push('Give it a short title of the required length.')
        break
      default:
        out.push(d.detail)
    }
  }
  return out
}

/** One candidate's record, as it is written to disk. */
export function candidateRecord({ manifest, candidate, validation, attempts, history = [], outcome }) {
  return {
    version: BATCH_VERSION,
    manifest,
    candidate: candidate || null,
    accepted: Boolean(validation && validation.accepted),
    outcome,
    attempts,
    validation: validation || null,
    // Every signature this candidate produced, so a reader of the file can see
    // whether the repairs were converging or going in circles.
    history,
  }
}

/** The batch-level report the workflow prints and commits. */
export function summarizeBatch(records = []) {
  const accepted = records.filter(r => r.accepted)
  const rejected = records.filter(r => !r.accepted)
  const byCode = new Map()
  for (const r of rejected) {
    for (const d of ((r.validation && r.validation.diagnostics) || [])) {
      byCode.set(d.code, (byCode.get(d.code) || 0) + 1)
    }
  }
  return {
    version: BATCH_VERSION,
    total: records.length,
    accepted: accepted.length,
    rejected: rejected.length,
    attempts: records.reduce((n, r) => n + (r.attempts || 0), 0),
    acceptedIds: accepted.map(r => r.manifest && r.manifest.id).filter(Boolean).sort(),
    rejectedIds: rejected.map(r => r.manifest && r.manifest.id).filter(Boolean).sort(),
    failureCodes: [...byCode.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : 1)),
    // Says plainly that nothing here is published. The candidates are files.
    publication: 'none — candidates are files for review; staging is a separate, human-run step',
  }
}
