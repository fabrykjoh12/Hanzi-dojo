// The explicit-transition planning contract (FAB-9, 2026-08-24).
//
// The planner bakeoff lost all six gpt-oss plans to `unexplained_move`, and
// storyPlanCompiler.mjs proved that recovering the movement from the prose
// afterwards does not work: it rescued one plan of six and fabricated two
// journeys on the way. The lesson was not "try harder at parsing". It was
// that a transition between two beats is STORY CONTENT — who moves and how —
// and content is the planner's job.
//
// So the plan now carries it as a field the planner must actually decide:
//
//   location                    where this beat happens
//   transition_from_previous    "same_place", or the movement the planner
//                               intends, in its own words
//
// and this module does the only thing code is allowed to do with it: copy it
// into the strict blueprint schema. No parsing of prose, no guessing, no
// lexicon of movement verbs. If the planner did not decide, nothing here
// decides for it — the plan fails the contract and says which beat broke it.
//
// Pure: no network, no fs, no clock, no model.

import { samePlace } from './storyBlueprint.mjs'

export const SHAPE_CONTRACT_VERSION = 'fab9-transition@1'
export const SAME_PLACE = 'same_place'

const text = (v) => String(v == null ? '' : v).trim()
const norm = (v) => text(v).toLowerCase().replace(/\s+/g, ' ')
const isSamePlaceToken = (v) => /^same[\s_-]?place$/i.test(text(v))

// Both spellings of the field, because a model drifts on casing, not because
// the meaning is negotiable. `arrivedHow` is deliberately NOT accepted: it is
// the old contract's key, and silently honouring it would hide whether the
// planner adopted the new one.
export function readTransition(beat) {
  const b = beat && typeof beat === 'object' ? beat : {}
  for (const key of ['transition_from_previous', 'transitionFromPrevious', 'transition']) {
    if (text(b[key])) return { value: text(b[key]), key }
  }
  return { value: '', key: null }
}

export function readLocation(beat) {
  const b = beat && typeof beat === 'object' ? beat : {}
  for (const key of ['location', 'where']) {
    if (text(b[key])) return { value: text(b[key]), key }
  }
  return { value: '', key: null }
}

// Did the story move? Judged with the SAME comparison the validator uses, so
// the contract and the check can never disagree about what a move is.
export function movedFrom(prevLocation, location) {
  if (!text(prevLocation) || !text(location)) return false
  return !samePlace(prevLocation, location)
}

// The contract check. A violation is a planning failure — the planner moved
// people without deciding how — never something to repair downstream.
export function checkTransitions(shape) {
  const beats = Array.isArray(shape && shape.beats) ? shape.beats : []
  const violations = []
  const warnings = []
  let stated = 0
  let required = 0
  beats.forEach((b, i) => {
    const n = i + 1
    const { value: location } = readLocation(b)
    const { value: transition, key } = readTransition(b)
    if (!location) violations.push({ beat: n, code: 'location_missing', message: 'beat ' + n + ' has no location' })
    if (i === 0) return
    const prev = readLocation(beats[i - 1]).value
    const moved = movedFrom(prev, location)
    const exactSame = norm(prev) === norm(location)
    if (moved) {
      required += 1
      if (!transition) {
        violations.push({ beat: n, code: 'transition_missing', message: 'beat ' + n + ' moves to "' + location + '" and the plan does not say how' })
      } else if (isSamePlaceToken(transition)) {
        violations.push({ beat: n, code: 'transition_says_same_place', message: 'beat ' + n + ' moves to "' + location + '" but calls it ' + SAME_PLACE })
      } else stated += 1
    } else if (exactSame && transition && !isSamePlaceToken(transition)) {
      // The location is word-for-word the previous one, so a movement here is
      // a contradiction, not a nuance.
      violations.push({ beat: n, code: 'transition_contradicts_location', message: 'beat ' + n + ' stays in "' + location + '" but describes a move: "' + transition + '"' })
    } else if (!exactSame && transition && !isSamePlaceToken(transition)) {
      // Same place by the validator's loose reading, differently worded, with
      // movement described — "the hallway" to "the hallway by the door". Real
      // stories do this, and it is not a contract breach.
      warnings.push({ beat: n, code: 'transition_within_place', message: 'beat ' + n + ' describes a move inside "' + location + '"' })
    } else if (!transition) {
      violations.push({ beat: n, code: 'transition_missing', message: 'beat ' + n + ' does not say whether the story stayed put' })
    }
    if (key && key !== 'transition_from_previous') {
      warnings.push({ beat: n, code: 'transition_key_drift', message: 'beat ' + n + ' used "' + key + '"' })
    }
  })
  return { ok: violations.length === 0, violations, warnings, stated, required }
}

// Map the semantic plan onto the strict blueprint schema. This is a rename and
// nothing else: `location` becomes `where`, an intended movement becomes
// `arrivedHow`, and `same_place` becomes the empty string the validator reads
// as "did not move". Every beat records what it mapped, so the mapping can be
// audited rather than trusted.
export function adaptShape(shape) {
  if (!shape || typeof shape !== 'object') return { blueprint: null, mapped: [], contract: checkTransitions(shape) }
  const contract = checkTransitions(shape)
  const beats = Array.isArray(shape.beats) ? shape.beats : []
  const mapped = []
  const out = beats.map((b, i) => {
    const { value: location } = readLocation(b)
    const { value: transition } = readTransition(b)
    const moved = i > 0 && movedFrom(readLocation(beats[i - 1]).value, location)
    const beat = { ...b }
    delete beat.location
    delete beat.transition_from_previous
    delete beat.transitionFromPrevious
    delete beat.transition
    beat.where = location
    beat.arrivedHow = moved && !isSamePlaceToken(transition) ? transition : ''
    if (beat.arrivedHow) mapped.push({ beat: i + 1, from: 'transition_from_previous', to: 'arrivedHow' })
    return beat
  })
  return { blueprint: { ...shape, beats: out }, mapped, contract }
}

// Losslessness, stated as a testable claim rather than a hope: a plan that
// keeps the contract must never fail the validator for unexplained movement.
// If it ever does, the adapter dropped something, and the harness says so
// instead of reporting the failure as the planner's.
export function adapterLostSomething(contract, failures) {
  if (!contract.ok) return null
  const move = (failures || []).find(f => f.code === 'unexplained_move')
  return move ? move.message : null
}
