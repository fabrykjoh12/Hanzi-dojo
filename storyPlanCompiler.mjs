// Semantic plan → deterministic schema compiler (FAB-9, 2026-08-24).
//
// The planner bakeoff measured 0/6 joint pass for both planners, and the two
// models failed on opposite sides: Qwen satisfied the schema and planned
// incoherently, gpt-oss planned well and lost every single plan to one field.
// All six gpt-oss plans failed `unexplained_move`, and in every case the plan
// SAID how the cast moved — "they carry it down the stairs", "then she walks
// to 李明's apartment", "(he steps out to think)" — it just said it in `what`
// or inside `where` instead of in `arrivedHow`.
//
// That is a serialization failure, not a planning failure, and asking a model
// to be more careful with a JSON field is exactly the prompt-tuning this
// project keeps refusing to do. So the schema stops being the model's job:
// the model supplies MEANING, and this module compiles that meaning into the
// structure the validator checks.
//
// The one rule that makes this safe: THE COMPILER NEVER INVENTS SEMANTICS.
// It may only move, split and quote text the plan already contains, and it
// records where every derived value came from. A field it cannot source from
// the plan's own words is a MISS — reported, never filled. A missing
// `arrivedHow` that nothing in the plan explains is a real planning gap and
// must still fail; a missing `arrivedHow` next to "carry it down the stairs"
// was never a gap at all.
//
// Pure: no network, no fs, no clock, no model.

import { samePlace } from './storyBlueprint.mjs'

export const COMPILER_VERSION = 'fab9-compile@1'

const text = (v) => String(v == null ? '' : v).trim()

// Verbs that describe a person travelling. Deliberately narrow: this list
// decides whether a clause is allowed to become `arrivedHow`, and a false
// positive would fabricate an explanation the plan never gave.
const MOVEMENT = /\b(come|comes|came|coming|go|goes|went|going|walk|walks|walked|walking|run|runs|ran|running|carry|carries|carried|carrying|climb|climbs|climbed|drive|drives|drove|ride|rides|rode|enter|enters|entered|arrive|arrives|arrived|leave|leaves|left|step|steps|stepped|head|heads|headed|follow|follows|followed|bring|brings|brought|return|returns|returned|push|pushes|pushed|pull|pulls|pulled|cross|crosses|crossed|rush|rushes|rushed|hurry|hurries|hurried|reach|reaches|reached|take|takes|took|board|boards|exit|exits|move|moves|moved|moving)\b/i

// A movement verb alone is not travel: "小红 needs to move a heavy table"
// moves an object, not a person. A clause only counts when it also says which
// way — a bare direction, or a destination that is really a place.
const DIRECTION = /\b(out|outside|down|downstairs|up|upstairs|back|toward|towards|through|across|over|along|off|home|away|inside|in)\b/i

// "to" is the infinitive marker far more often than it is a direction, so a
// destination that starts with a verb is not a destination at all: "needs to
// move a heavy table" and "steps out to think" go nowhere.
const VERB_START = /^(?:help|think|ask|see|get|do|make|take|find|buy|talk|speak|work|play|eat|drink|rest|wait|look|call|use|put|lift|move|open|close|start|finish|try|carry|walk|run|go|come|leave|return|bring|push|pull|check|say|tell|show|give|meet|stay|sit|stand|sleep|read|write|study|clean|cook|fix|catch|hold|keep|let|watch|listen|hear|feel|know|want|need|be|have)\b/i

// Nouns that make a phrase a place. Used to reject "steps out to think" as a
// destination while accepting "walks to 李明's apartment".
const PLACE_NOUN = /\b(room|rooms|hallway|hall|corridor|kitchen|stairs|stair|stairwell|staircase|lobby|entrance|gate|door|doorway|apartment|flat|house|home|building|floor|balcony|yard|courtyard|garden|park|street|road|shop|store|market|school|classroom|office|station|stop|restaurant|cafe|café|library|hospital|bank|bus|train|car|taxi|elevator|lift|bathroom|bedroom|living|dining|roof|rooftop|field|playground|counter|table|desk|window|park|bridge|river|square|hotel|airport|platform)\b/i

const STATE_CLAUSE = /\b(is|are|was|were|has|have|had|now|already|still|feeling|holding|waiting|sitting|standing)\b/i

function clauses(v) {
  return text(v)
    .split(/[,;()]|\bthen\b|\band then\b|\bso that\b|\bwhere\b/i)
    .map(c => c.trim().replace(/^[-–—\s]+|[-–—\s]+$/g, ''))
    .filter(Boolean)
}

// Does this clause describe someone travelling — and, if a destination is
// given, travelling somewhere consistent with it?
export function isTravel(clause, destination = null) {
  const c = text(clause)
  if (!c || !MOVEMENT.test(c)) return false
  if (DIRECTION.test(c) || destinationOf(c)) return true
  return Boolean(destination && placeMatch(c, destination))
}

// samePlace, plus a stem: a plan that says "carry it down the stairs" and
// sets the next beat in the "Stairwell" is naming one place twice, and the
// whole point of the compiler is to stop losing plans to notation.
export function placeMatch(a, b) {
  if (samePlace(a, b)) return true
  const stems = (v) => new Set(text(v).toLowerCase().split(/[^\p{Letter}\p{Number}]+/u).filter(w => w.length > 3).map(w => w.slice(0, 5)))
  const A = stems(a)
  for (const w of stems(b)) if (A.has(w)) return true
  return false
}

// The phrase after "to"/"into"/"toward" is a destination only when it reads
// like a place. "walks to 李明's apartment" yes; "steps out to think" no.
export function destinationOf(clause) {
  const c = text(clause)
  const m = c.match(/\b(?:in ?to|on ?to|to|toward|towards)\s+(.+)$/i)
  if (!m) return null
  const tail = m[1].trim().replace(/[.。!?]+$/, '')
  if (!tail || VERB_START.test(tail)) return null
  const looksLikePlace = PLACE_NOUN.test(tail)
    || /(?:^|\s)(?:the|a|an|his|her|their|my|your|its)\s+\S+/i.test(tail)
    || /\S+['’]s\s+\S+/.test(tail)
    || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}]/u.test(tail)
  return looksLikePlace ? tail : null
}

// `where` in a real plan is not always a place: it is a place plus how they
// got there ("小红's kitchen, then she walks to 李明's apartment"), a place
// plus a state ("Living room, now the table is in place"), or a place with a
// parenthetical move ("Li Ming's balcony (he steps out to think)"). Splitting
// it recovers a clean place AND, for free, the arrival the plan already gave.
export function splitWhere(where) {
  const parts = clauses(where)
  if (parts.length <= 1) return { place: text(where), transition: null }
  const travel = parts.filter(p => isTravel(p))
  const places = parts.filter(p => !isTravel(p))
  const transition = travel.length ? travel[travel.length - 1] : null
  const destination = transition ? destinationOf(transition) : null
  if (destination) return { place: destination, transition }
  // No usable destination: keep the first segment that is a place rather than
  // a description of the situation in it.
  const solid = places.find(p => !STATE_CLAUSE.test(p)) || places[0] || text(where)
  return { place: solid, transition }
}

// Find the clause in a piece of the plan that explains arriving at `place`.
export function travelClause(source, place) {
  for (const c of clauses(source)) if (isTravel(c, place)) return c
  return null
}

// A journey narrated in an EARLIER beat only explains this arrival when it
// points here. "They carry it down the stairs" says how the cast reached the
// stairwell; it says nothing about how they later reached the lobby, and
// filling that in would be the compiler inventing the story.
export function arrivalClause(source, place) {
  for (const c of clauses(source)) {
    if (!isTravel(c, place)) continue
    const dest = destinationOf(c)
    if (placeMatch(c, place) || (dest && placeMatch(dest, place))) return c
  }
  return null
}

const WHEN = /\b(morning|afternoon|evening|night|midday|noon|dawn|dusk|later|next day|the next morning|that day|that evening|after school|after work|at once|immediately|moments later|minutes later|soon after|the following day|weekend|saturday|sunday|monday|tuesday|wednesday|thursday|friday)\b/i
const BECAUSE = /\b(because|since|after|when|as soon as|now that)\b\s+(.+)$/i

// Compile one beat. `prev` is the already-compiled previous beat, because an
// arrival is often narrated in the beat that departs ("they carry it down the
// stairs" tells you how they reached the stairwell in the NEXT beat).
export function compileBeat(beat, prev, index) {
  const b = beat && typeof beat === 'object' ? beat : {}
  const n = index + 1
  const derived = []
  const misses = []
  const out = { ...b }

  const { place, transition } = splitWhere(b.where)
  if (place && place !== text(b.where)) {
    out.where = place
    derived.push({ beat: n, field: 'where', value: place, from: 'where', reason: 'place separated from the movement or state described with it' })
  }

  const moved = index > 0 && !samePlace(place, prev && prev.where)
  if (moved && text(b.arrivedHow).length < 4) {
    const sources = [
      [transition, 'where'],
      [travelClause(b.what, place), 'what'],
      [travelClause(b.because, place), 'because'],
      [arrivalClause(prev && prev.what, place), 'previous beat'],
      [arrivalClause(prev && prev.arrivedHow, place), 'previous beat'],
    ]
    const hit = sources.find(([c]) => Boolean(c))
    if (hit) {
      out.arrivedHow = hit[0]
      derived.push({ beat: n, field: 'arrivedHow', value: hit[0], from: hit[1], reason: 'the plan already said how they travelled' })
    } else {
      misses.push({ beat: n, field: 'arrivedHow', reason: 'nothing in the plan says how anyone reached "' + place + '"' })
    }
  }

  if (text(b.when).length < 2) {
    const m = (text(b.what) + ' ' + text(b.where)).match(WHEN)
    if (m) {
      out.when = m[1]
      derived.push({ beat: n, field: 'when', value: m[1], from: 'what', reason: 'the beat states its own time' })
    } else misses.push({ beat: n, field: 'when', reason: 'the plan gives this beat no point in time' })
  }

  if (index > 0 && text(b.because).length < 5) {
    const m = text(b.what).match(BECAUSE)
    if (m) {
      out.because = m[0]
      derived.push({ beat: n, field: 'because', value: m[0], from: 'what', reason: 'the beat states its own cause' })
    } else misses.push({ beat: n, field: 'because', reason: 'the plan does not say why this beat follows the one before it' })
  }

  return { beat: out, derived, misses }
}

// Fields whose content is MEANING. The compiler may read them; it may never
// write them, and the harness asserts that after every compile.
export const SEMANTIC_FIELDS = ['title', 'setting', 'problem', 'incitingEvent', 'resolution', 'cast', 'targetPlan']

export function compilePlan(shape) {
  if (!shape || typeof shape !== 'object') {
    return { blueprint: null, derived: [], misses: [{ beat: 0, field: 'blueprint', reason: 'no plan object' }] }
  }
  const beats = Array.isArray(shape.beats) ? shape.beats : []
  const out = []
  const derived = []
  const misses = []
  beats.forEach((b, i) => {
    const r = compileBeat(b, out[i - 1], i)
    out.push(r.beat)
    derived.push(...r.derived)
    misses.push(...r.misses)
  })
  return { blueprint: { ...shape, beats: out }, derived, misses }
}

// Proof that compilation only moved structure around. Returns every field
// whose value changed; the caller fails loudly if any of them is semantic.
export function compileChanges(before, after) {
  const changed = []
  for (const k of SEMANTIC_FIELDS) {
    if (JSON.stringify(before && before[k]) !== JSON.stringify(after && after[k])) changed.push(k)
  }
  const a = Array.isArray(before && before.beats) ? before.beats : []
  const b = Array.isArray(after && after.beats) ? after.beats : []
  if (a.length !== b.length) changed.push('beats.length')
  a.forEach((beat, i) => {
    for (const k of ['what', 'targets', 'lines', 'id']) {
      if (JSON.stringify(beat && beat[k]) !== JSON.stringify(b[i] && b[i][k])) changed.push('beats[' + (i + 1) + '].' + k)
    }
  })
  return changed
}
