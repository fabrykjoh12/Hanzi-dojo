// Blueprint-first story planning (FAB-9, 2026-08-22).
//
// The 0/4 quality-gate pilot located the bottleneck in the writer, not in
// anything downstream: three of four drafts broke on plot logic or timeline
// (a cat carrying a stranger's wallet out of a bush; a competition happening
// before the string that makes it possible is bought; 关于 and 了解 pasted into
// a closing scene that needed neither), and two ran 30% past the line ceiling
// while being told the ceiling in three separate sentences.
//
// Those are planning failures, and a longer prose prompt does not fix
// planning. So planning is separated from Chinese realization:
//
//   manifest → BLUEPRINTS (structure only, no Chinese prose)
//            → deterministic blueprint validation
//            → anonymised semantic ranking + selection
//            → deterministic line allocation
//            → Qwen realizes the approved blueprint at an exact line count
//
// A blueprint is a plan, not a story. It carries one central problem, a small
// cast, five or six causally linked beats — each saying what changes, why it
// follows from the previous beat, when and where it happens — a resolution,
// and an explicit home for every target word with a reason it belongs there.
//
// What this module can check by itself it checks deterministically (structure,
// cast, chronology fields, unexplained location jumps, target placement); what
// needs judgement (is the causality real, is the ending about the original
// problem) goes to the existing semantic judge, which may only rank plans it
// is given and can never write one.
//
// Pure: no network, no fs, no clock.

export const BLUEPRINT_VERSION = 'fab9-blueprint@1'

export const BEAT_BOUNDS = { min: 5, max: 6 }
export const CAST_BOUNDS = { min: 2, max: 3 }
export const BEAT_LINE_BOUNDS = { min: 2, max: 8 }
export const MAX_TARGETS_PER_BEAT = 4

// Pilot thresholds for a plan, on the judge's 1-10 scales. A blueprint is
// cheap to reject and expensive to realize badly, so the bar sits at the
// point where the plan is at least sound, not merely present.
export const BLUEPRINT_QUALITY = {
  overall: 6,
  causal: 6,          // does each beat follow from the last
  chronology: 6,      // does the timeline hold
  targetFit: 5,       // do the target words belong where they were put
}

const text = (v) => String(v == null ? '' : v).trim()
const has = (v, min = 1) => text(v).length >= min

// ── Deterministic structure check ───────────────────────────────────────────
// Everything here is a fact about the plan, not an opinion about it.
export function validateBlueprint(bp, { manifest, requiredTargets = null } = {}) {
  const failures = []
  const fail = (code, message) => failures.push({ code, message })
  if (!bp || typeof bp !== 'object') {
    return { ok: false, failures: [{ code: 'unparseable', message: 'no blueprint object' }] }
  }

  for (const [field, label] of [['title', 'title concept'], ['setting', 'setting'], ['problem', 'central problem'], ['incitingEvent', 'inciting event'], ['resolution', 'resolution']]) {
    if (!has(bp[field], 3)) fail('missing_' + field, label + ' is missing')
  }

  const allowed = new Set([...(manifest.speakers || []), ...(manifest.extraNames || [])])
  const cast = Array.isArray(bp.cast) ? bp.cast.map(text).filter(Boolean) : []
  if (cast.length < CAST_BOUNDS.min || cast.length > CAST_BOUNDS.max) {
    fail('cast_size', cast.length + ' characters (need ' + CAST_BOUNDS.min + '-' + CAST_BOUNDS.max + ')')
  }
  const strangers = cast.filter(c => !allowed.has(c))
  if (strangers.length) fail('cast_unknown', 'characters outside the cast: ' + strangers.join('、'))

  const beats = Array.isArray(bp.beats) ? bp.beats : []
  if (beats.length < BEAT_BOUNDS.min || beats.length > BEAT_BOUNDS.max) {
    fail('beat_count', beats.length + ' beats (need ' + BEAT_BOUNDS.min + '-' + BEAT_BOUNDS.max + ')')
  }
  beats.forEach((b, i) => {
    const n = i + 1
    if (!has(b && b.what, 5)) fail('beat_empty', 'beat ' + n + ' does not say what changes')
    if (!has(b && b.when, 2)) fail('beat_when', 'beat ' + n + ' has no point in time')
    if (!has(b && b.where, 2)) fail('beat_where', 'beat ' + n + ' has no place')
    // because → therefore, not and then: every beat but the first must say
    // why it follows from the one before it.
    if (i > 0 && !has(b && b.because, 5)) fail('beat_uncaused', 'beat ' + n + ' does not follow from beat ' + i)
    // A cast cannot teleport: a change of place has to be accounted for.
    if (i > 0 && text(b && b.where) !== text(beats[i - 1] && beats[i - 1].where) && !has(b && b.arrivedHow, 4)) {
      fail('unexplained_move', 'beat ' + n + ' moves to "' + text(b && b.where) + '" without saying how')
    }
    const lines = Number(b && b.lines)
    if (!Number.isFinite(lines) || lines < BEAT_LINE_BOUNDS.min || lines > BEAT_LINE_BOUNDS.max) {
      fail('beat_lines', 'beat ' + n + ' asks for ' + (b && b.lines) + ' lines (need ' + BEAT_LINE_BOUNDS.min + '-' + BEAT_LINE_BOUNDS.max + ')')
    }
    const t = Array.isArray(b && b.targets) ? b.targets : []
    if (t.length > MAX_TARGETS_PER_BEAT) fail('beat_target_dump', 'beat ' + n + ' carries ' + t.length + ' target words')
  })

  // Every target that MUST appear needs a home and a reason for being there.
  const plan = Array.isArray(bp.targetPlan) ? bp.targetPlan : []
  const words = new Set(manifest.targets.map(t => t.word))
  const need = requiredTargets || manifest.targets.filter(t => t.min >= 2).map(t => t.word)
  const placed = new Map()
  for (const entry of plan) {
    const word = text(entry && entry.word)
    if (!words.has(word)) { fail('target_unknown', '"' + word + '" is not one of this story\'s target words'); continue }
    const beat = Number(entry && entry.beat)
    if (!Number.isFinite(beat) || beat < 1 || beat > beats.length) {
      fail('target_beat', word + ' is assigned to beat ' + entry.beat + ', which does not exist')
      continue
    }
    if (!has(entry && entry.why, 15)) {
      fail('target_unjustified', word + ' has no reason for belonging in beat ' + beat)
      continue
    }
    placed.set(word, beat)
  }
  for (const word of need) {
    if (!placed.has(word)) fail('target_unplaced', word + ' has no beat where it naturally belongs')
  }

  return { ok: failures.length === 0, failures, cast, beats: beats.length, placed: Object.fromEntries(placed) }
}

// ── Deterministic line allocation ───────────────────────────────────────────
// The plan asks for a shape; this turns it into an exact contract. The writer
// is never told a range again: it is told line 1 to line N and which beat owns
// each one. Largest-remainder apportionment, so the total is exactly `total`
// and every beat keeps at least its floor.
export function allocateLines(beats, total, { min = BEAT_LINE_BOUNDS.min } = {}) {
  const asked = beats.map(b => Math.max(min, Number((b && b.lines) || min)))
  const sum = asked.reduce((a, b) => a + b, 0)
  if (beats.length * min > total) return null
  const exact = asked.map(n => (n * total) / sum)
  const floors = exact.map(x => Math.max(min, Math.floor(x)))
  let left = total - floors.reduce((a, b) => a + b, 0)
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  const out = floors.slice()
  for (let k = 0; left > 0; k += 1, left -= 1) out[order[k % order.length].i] += 1
  while (left < 0) {                                  // trim from the biggest, never below min
    const biggest = out.map((n, i) => ({ n, i })).filter(x => x.n > min).sort((a, b) => b.n - a.n || a.i - b.i)[0]
    if (!biggest) return null
    out[biggest.i] -= 1
    left += 1
  }
  let cursor = 1
  return out.map((n, i) => {
    const from = cursor
    cursor += n
    return { beat: i + 1, lines: n, from, to: cursor - 1 }
  })
}

// ── Semantic ranking of plans ───────────────────────────────────────────────
export const BLUEPRINT_DIMENSIONS = [
  ['causal', 'Each beat happens BECAUSE of the previous one — not "and then"'],
  ['chronology', 'The timeline holds: nothing happens before what it depends on, nobody teleports'],
  ['plausibility', 'The events could actually happen as described, with these characters'],
  ['simplicity', 'ONE central problem, no side quests, nothing a learner has to untangle'],
  ['targetFit', 'Each required word sits where someone would naturally need that word'],
  ['suitability', 'Fits a short HSK 3 graded reader: concrete, everyday, tellable in a few lines per beat'],
]

export function acceptableBlueprint(score, thresholds = BLUEPRINT_QUALITY) {
  if (!score) return false
  if (score.contradiction === true) return false
  return (score.overall || 0) >= thresholds.overall
    && (score.causal || 0) >= thresholds.causal
    && (score.chronology || 0) >= thresholds.chronology
    && (score.targetFit || 0) >= thresholds.targetFit
}

// Deterministic anonymisation, by a hash of the plan's own text — the judge
// cannot tell which model planned which, and the labelling is reproducible.
function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h
}
export function anonymiseBlueprints(items) {
  const key = (x) => hash(JSON.stringify(x.blueprint || x))
  return items.slice().sort((a, b) => key(a) - key(b)).map((x, i) => ({ ...x, label: String.fromCharCode(65 + i) }))
}

// A one-page rendering of a plan for the judge and the writer. Deterministic,
// so the same plan always reads the same way.
export function renderBlueprint(bp, allocation = null) {
  const lines = []
  lines.push('TITLE CONCEPT: ' + text(bp.title))
  lines.push('SETTING: ' + text(bp.setting))
  lines.push('CAST: ' + (bp.cast || []).join('、'))
  lines.push('CENTRAL PROBLEM: ' + text(bp.problem))
  lines.push('INCITING EVENT: ' + text(bp.incitingEvent))
  lines.push('BEATS:')
  ;(bp.beats || []).forEach((b, i) => {
    const alloc = allocation && allocation[i]
    lines.push('  ' + (i + 1) + '. [' + text(b.when) + ' · ' + text(b.where) + ']'
      + (alloc ? ' lines ' + alloc.from + '-' + alloc.to : '')
      + (b.targets && b.targets.length ? ' · uses ' + b.targets.join('、') : ''))
    lines.push('     WHAT CHANGES: ' + text(b.what))
    if (i > 0) lines.push('     BECAUSE: ' + text(b.because))
    if (has(b.arrivedHow)) lines.push('     GOT THERE BY: ' + text(b.arrivedHow))
  })
  lines.push('RESOLUTION: ' + text(bp.resolution))
  if (Array.isArray(bp.targetPlan) && bp.targetPlan.length) {
    lines.push('TARGET WORDS:')
    for (const t of bp.targetPlan) lines.push('  ' + text(t.word) + ' → beat ' + t.beat + ': ' + text(t.why))
  }
  return lines.join('\n')
}
