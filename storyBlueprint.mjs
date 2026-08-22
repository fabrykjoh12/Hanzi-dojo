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

import { analyzeStory } from './storyCorpusCalibration.mjs'
import { splitSpeaker } from './src/storyReading.js'

export const BLUEPRINT_VERSION = 'fab9-blueprint@1'

// A Chinese graded reader contains no Latin text. blueprint-2 shipped
// 李明不想和 reckless 的人打球 — an English word the writer took straight from
// an English plan. Nothing in this pipeline has a legitimate reason to emit
// Latin letters in a story line, so the whitelist is empty by design.
export function hasLatin(v) {
  return /[A-Za-z]/.test(String(v == null ? '' : v))
}

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

// Two beats are in the same place when their descriptions share a real word.
// blueprint-1 rejected plan after plan for "teleporting" between
// "Hallway outside Apartment 201" and "Same hallway, by the leaking pipe" —
// the same corridor, described twice. Comparing the strings exactly made a
// re-wording look like a move, so the check compares CONTENT WORDS instead
// and only calls it a move when the two places have nothing in common. The
// trade is deliberate: the deterministic rule now catches only unmistakable
// jumps, and the semantic judge scores chronology on top of it.
const PLACE_NOISE = new Set([
  'the', 'a', 'an', 'at', 'in', 'on', 'by', 'of', 'to', 'near', 'outside', 'inside',
  'same', 'back', 'front', 'again', 'still', 'just', 'and', 'with', 'where', 'they',
  'her', 'his', 'their', 'it', 'is', 'are', 'stands', 'standing', 'stand', 'sits', 'sitting',
])
function placeTokens(v) {
  return new Set(text(v).toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter(w => w && w.length > 1 && !PLACE_NOISE.has(w)))
}
export function samePlace(a, b) {
  const A = placeTokens(a)
  const B = placeTokens(b)
  if (!A.size || !B.size) return true            // nothing to compare — not a move
  for (const w of A) if (B.has(w)) return true
  // CJK place names are not word-segmented here, so 李明家 and 李明家的门口 are
  // two different tokens; one containing the other is the same place.
  const flat = (v) => text(v).toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '')
  const fa = flat(a)
  const fb = flat(b)
  return Boolean(fa && fb && (fa.includes(fb) || fb.includes(fa)))
}

// ── Deterministic structure check ───────────────────────────────────────────
// Everything here is a fact about the plan, not an opinion about it.
// ── Lexical feasibility ─────────────────────────────────────────────────────
// A plan can be perfectly coherent in English and impossible in HSK 3 Chinese.
// blueprint-2's winning plans implied 扳手 (wrench), 冰淇淋 (ice cream) and a
// basketball vocabulary none of which a level-3 learner has, and the writer
// dutifully used them: out-of-level 12.1% and 16.8%, 6-8 unknown runs. So each
// beat now carries the small Chinese toolkit it expects to be written with,
// and every word in it is checked against the canonical vocabulary BEFORE any
// prose is written. An anchor that is above level, unknown or Latin is a
// rejection, never something to quietly drop.
export function checkAnchor(anchor, { manifest, vocabMap, cast = [] }) {
  const word = text(anchor)
  if (!word) return { ok: false, reason: 'empty' }
  if (hasLatin(word)) return { ok: false, reason: 'Latin text' }
  if (manifest.targets.some(t => t.word === word)) return { ok: true, why: 'target word' }
  if (cast.includes(word) || (manifest.speakers || []).includes(word)) return { ok: true, why: 'character name' }
  const v = vocabMap && vocabMap[word]
  if (!v) return { ok: false, reason: 'not standard vocabulary' }
  if (Number.isFinite(v.level) && v.level > manifest.level) return { ok: false, reason: 'HSK ' + v.level + ', above the story level' }
  return { ok: true, why: 'HSK ' + v.level }
}

// The usage sketch is what turns "结束 — Li Ming comments that the day has
// ended" (which became 这是今天忙碌生活的结束) into a concrete sentence a person
// would say. It is an anchor, not the final line, but it must itself be
// realizable: the target present, nothing unknown, nothing above level.
export function checkUsageSketch(sketch, { word, manifest, vocabMap }) {
  const t = text(sketch)
  const problems = []
  if (!t) return { ok: false, problems: ['no usage sketch'] }
  if (hasLatin(t)) problems.push('contains Latin text')
  const a = analyzeStory({ title: '', level: manifest.level, content: t }, vocabMap)
  if ((a.counts.get(word) || 0) < 1) problems.push('does not actually use ' + word)
  if (a.unknownRuns.length) problems.push('non-vocabulary text: ' + a.unknownRuns.join('、'))
  const targets = new Set(manifest.targets.map(x => x.word))
  const above = [...a.counts.keys()].filter(w => !targets.has(w) && vocabMap[w] && vocabMap[w].level > manifest.level)
  if (above.length) problems.push('above-level vocabulary: ' + above.join('、'))
  if (a.cjkChars < 3) problems.push('too short to be a real utterance')
  if (a.cjkChars > 24) problems.push('too long for an anchor')
  return { ok: problems.length === 0, problems }
}

export function validateBlueprint(bp, { manifest, vocabMap = null, requiredTargets = null } = {}) {
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

  // The story needs a Chinese title, and it is subject to the same vocabulary
  // rules as the story: blueprint-2's titles came from the English plan.
  if (vocabMap) {
    const zh = text(bp.chineseTitle)
    if (!zh) fail('missing_chineseTitle', 'no Chinese title')
    else if (hasLatin(zh)) fail('chinese_title_latin', 'the Chinese title contains Latin text: ' + zh)
    else {
      const a = analyzeStory({ title: '', level: manifest.level, content: zh }, vocabMap)
      const targets = new Set(manifest.targets.map(t => t.word))
      const above = [...a.counts.keys()].filter(w => !targets.has(w) && vocabMap[w] && vocabMap[w].level > manifest.level)
      if (a.cjkChars < 2 || a.cjkChars > 12) fail('chinese_title_length', 'the Chinese title is ' + a.cjkChars + ' characters')
      if (a.unknownRuns.length) fail('chinese_title_lexis', 'title uses non-vocabulary text: ' + a.unknownRuns.join('、'))
      if (above.length) fail('chinese_title_lexis', 'title uses above-level vocabulary: ' + above.join('、'))
    }
  }
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
    if (i > 0 && !samePlace(b && b.where, beats[i - 1] && beats[i - 1].where) && !has(b && b.arrivedHow, 4)) {
      fail('unexplained_move', 'beat ' + n + ' moves to "' + text(b && b.where) + '" without saying how')
    }
    // The plan's line shares are a proposal, not the contract: allocateLines
    // normalises them to the exact total and enforces the real floor. Only a
    // missing or absurd number is a structural failure — blueprint-1 threw
    // away otherwise sound plans over a closing beat that asked for one line.
    const lines = Number(b && b.lines)
    if (!Number.isFinite(lines) || lines < 1 || lines > BEAT_LINE_BOUNDS.max * 2) {
      fail('beat_lines', 'beat ' + n + ' asks for ' + (b && b.lines) + ' lines')
    }
    const t = Array.isArray(b && b.targets) ? b.targets : []
    if (t.length > MAX_TARGETS_PER_BEAT) fail('beat_target_dump', 'beat ' + n + ' carries ' + t.length + ' target words')
    if (vocabMap) {
      const anchors = Array.isArray(b && b.chineseLexicalAnchors) ? b.chineseLexicalAnchors : []
      if (anchors.length < 3) fail('beat_anchors_missing', 'beat ' + n + ' has no Chinese toolkit to be written with')
      for (const anchor of anchors) {
        const c = checkAnchor(anchor, { manifest, vocabMap, cast })
        if (!c.ok) fail('anchor_unusable', 'beat ' + n + ' anchor "' + text(anchor) + '": ' + c.reason)
      }
    }
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
    if (vocabMap) {
      // Who says it, about what, to what end, and how it actually sounds.
      if (!has(entry && entry.speaker, 1)) fail('target_no_speaker', word + ' has nobody to say it')
      else if (!allowed.has(text(entry.speaker)) && text(entry.speaker).toLowerCase() !== 'narrator') {
        fail('target_no_speaker', word + ' is given to "' + text(entry.speaker) + '", who is not in the cast')
      }
      if (!has(entry && entry.refersTo, 1)) fail('target_no_referent', word + ' does not say what it refers to')
      if (!has(entry && entry.intent, 8)) fail('target_no_intent', word + ' has no communicative purpose')
      const sketch = checkUsageSketch(entry && entry.usageSketch, { word, manifest, vocabMap })
      if (!sketch.ok) fail('target_sketch_unusable', word + ' usage sketch "' + text(entry && entry.usageSketch) + '": ' + sketch.problems.join('; '))
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
