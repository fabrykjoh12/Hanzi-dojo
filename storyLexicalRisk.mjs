// Pre-scaffold lexical risk preflight (FAB-9 A3.2, 2026-08-23).
//
// The shape planner keeps producing structurally sound stories whose central
// action cannot be said at HSK 3: a heavy box to lift, a ladder, a kite, a
// bicycle chain, a wheel, metal links. a3-fresh-2 got four beats into
// scaffolding before beat 5 — "hold the wheel while he puts the chain back on"
// — ran out of words. That is a shape problem, and it is cheaper to catch
// before any Chinese is written.
//
// The naive version of this check would be "every concept must have an
// in-level gloss", and beat 4 of that same story proves it wrong: "he needs
// help because it is getting dark" has no in-level way to say dark, and the
// beat realized perfectly once the writer dropped the clause. Nothing was
// lost, because the darkness was incidental — the beat is about asking for
// help.
//
// So the preflight separates what a beat IS from what it MENTIONS:
//
//   core        the main clause of the beat's first sentence — what happens
//   supporting  the main clauses of its later sentences
//   incidental  subordinate clauses (because/while/when/…), anywhere
//
// and weighs missing vocabulary accordingly. A beat may lose an incidental
// detail and still be the same beat; it cannot lose its own subject and verb.
//
// Deterministic: an index over the glosses already in the vocabulary dataset.
// No LLM call, no network, no curated list of forbidden scenes.

import { tokenize, stem } from './storyLexicalRetrieval.mjs'

export const RISK_VERSION = 'fab9-risk@1'

export const RISK = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' }

// Clause markers that introduce detail rather than the event itself.
const SUBORDINATORS = /\b(because|while|since|as|when|although|though|if|after|before|so that|which|who|that)\b/i

// Very common verbs of saying/doing carry no lexical risk of their own: every
// language has them, and they are always in level. Treating them as concepts
// would drown the signal.
const LIGHT = new Set([
  'says', 'said', 'tells', 'told', 'asks', 'asked', 'answers', 'replies', 'explains',
  'wants', 'needs', 'tries', 'starts', 'begins', 'stops', 'comes', 'goes', 'walks',
  'sees', 'looks', 'gives', 'puts', 'feels', 'thinks', 'knows', 'realizes', 'decides',
  'together', 'again', 'better', 'good', 'bad', 'happy', 'sad', 'new', 'old', 'first',
  'day', 'time', 'home', 'house', 'room', 'street', 'friend', 'people', 'person',
])

function sentences(text) {
  return String(text || '').split(/[.!?;]+/).map(s => s.trim()).filter(Boolean)
}

function splitClause(sentence) {
  const m = sentence.match(SUBORDINATORS)
  if (!m || m.index === 0) return { main: sentence, sub: '' }
  return { main: sentence.slice(0, m.index).trim(), sub: sentence.slice(m.index).trim() }
}

// The concepts a beat depends on, sorted by how central they are.
export function conceptsFromBeat(beat, entries = [], { names = [] } = {}) {
  const nameTokens = new Set(names.flatMap(n => tokenize(n)))
  const clean = (text) => tokenize(text).filter(t => !nameTokens.has(t) && !LIGHT.has(t) && !LIGHT.has(stem(t)))
  const parts = sentences(beat && beat.what)
  const core = []
  const supporting = []
  const incidental = []
  parts.forEach((s, i) => {
    const { main, sub } = splitClause(s)
    ;(i === 0 ? core : supporting).push(...clean(main))
    incidental.push(...clean(sub))
  })
  // The causal link and the target intents are context, never the event.
  incidental.push(...clean(beat && beat.because))
  for (const e of entries) incidental.push(...clean(e && e.intent))
  const seen = new Set()
  const dedupe = (list) => list.filter(t => (seen.has(t) ? false : (seen.add(t), true)))
  return { core: dedupe(core), supporting: dedupe(supporting), incidental: dedupe(incidental) }
}

// token → the words whose gloss uses it. Two indexes get built: one over the
// vocabulary the reader HAS, and one over the whole dictionary. The pair is
// what separates a real lexical gap from noise:
//
//   in level            → supported
//   only above level    → a genuine gap: the language has the word, the
//                         reader does not (chain, wheel, ladder, dark)
//   nowhere at all      → not a lexical item in this dictionary's terms
//                         ("really", "about", "patiently") — ignored, because
//                         counting it would make every beat look impossible
export function buildGlossIndex(vocabMap, level) {
  const index = new Map()
  for (const word of Object.keys(vocabMap)) {
    const v = vocabMap[word]
    if (!v || !Number.isFinite(v.level) || v.level > level || !v.meaning) continue
    for (const t of tokenize(v.meaning)) {
      for (const key of [t, stem(t)]) {
        if (!index.has(key)) index.set(key, [])
        if (index.get(key).length < 6 && !index.get(key).includes(word)) index.get(key).push(word)
      }
    }
  }
  return index
}

export function buildFullGlossIndex(vocabMap) {
  return buildGlossIndex(vocabMap, Number.MAX_SAFE_INTEGER)
}

export function conceptSupport(concept, index, fullIndex = null) {
  const exact = index.get(concept)
  if (exact && exact.length) return { support: 'supported', words: exact.slice(0, 4) }
  const stemmed = index.get(stem(concept))
  if (stemmed && stemmed.length) return { support: 'supported', words: stemmed.slice(0, 4) }
  // A longer concept that is a piece of some gloss token, or vice versa.
  for (const [key, words] of index) {
    if (concept.length >= 5 && (key.includes(concept) || concept.includes(key)) && key.length >= 4) {
      return { support: 'weak', words: words.slice(0, 3) }
    }
  }
  if (fullIndex) {
    const above = fullIndex.get(concept) || fullIndex.get(stem(concept))
    // The dictionary has no word for it at any level, so this is not a
    // vocabulary gap — it is an English word that is not a lexical concept
    // here. It cannot make a beat impossible.
    if (!above || !above.length) return { support: 'notLexical', words: [] }
    return { support: 'none', words: above.slice(0, 3) }
  }
  return { support: 'none', words: [] }
}

// HIGH means the beat cannot be told at this level: its own subject matter is
// missing, not a detail of it.
export function assessBeatRisk({ beat, entries = [], manifest, vocabMap, index = null, fullIndex = null, names = [] } = {}) {
  const idx = index || buildGlossIndex(vocabMap, manifest.level)
  const full = fullIndex || buildFullGlossIndex(vocabMap)
  const concepts = conceptsFromBeat(beat, entries, { names })
  const rate = (list) => list.map(c => ({ concept: c, ...conceptSupport(c, idx, full) }))
  const core = rate(concepts.core)
  const supporting = rate(concepts.supporting)
  const incidental = rate(concepts.incidental)
  const missing = (list) => list.filter(c => c.support === 'none').map(c => c.concept)
  const coreMissing = missing(core)
  const supportingMissing = missing(supporting)
  const incidentalMissing = missing(incidental)

  let risk = RISK.LOW
  let reason = 'every central concept has in-level vocabulary'
  if (coreMissing.length >= 2) {
    risk = RISK.HIGH
    reason = 'the beat\'s own event needs ' + coreMissing.length + ' words the reader does not have: ' + coreMissing.join(', ')
  } else if (coreMissing.length === 1 && supportingMissing.length >= 2) {
    risk = RISK.HIGH
    reason = 'the central action (' + coreMissing[0] + ') and ' + supportingMissing.length
      + ' more of what happens here (' + supportingMissing.join(', ') + ') have no in-level vocabulary'
  } else if (coreMissing.length === 1) {
    risk = RISK.MEDIUM
    reason = 'the central concept "' + coreMissing[0] + '" has no in-level vocabulary, but the rest of the beat does'
  } else if (supportingMissing.length || incidentalMissing.length) {
    risk = RISK.MEDIUM
    reason = 'detail without in-level vocabulary (' + [...supportingMissing, ...incidentalMissing].join(', ')
      + '), but the beat\'s own event can be told'
  }
  return { beat: beat.id, risk, reason, core, supporting, incidental, coreMissing, supportingMissing, incidentalMissing }
}

export function assessShapeRisk({ blueprint, manifest, vocabMap } = {}) {
  const index = buildGlossIndex(vocabMap, manifest.level)
  const fullIndex = buildFullGlossIndex(vocabMap)
  const names = [...(blueprint.cast || []), ...(manifest.speakers || [])]
  const beats = (blueprint.beats || []).map(beat => assessBeatRisk({
    beat,
    entries: (blueprint.targetPlan || []).filter(t => Number(t.beat) === beat.id),
    manifest, vocabMap, index, fullIndex, names,
  }))
  const high = beats.filter(b => b.risk === RISK.HIGH)
  const risk = high.length ? RISK.HIGH : (beats.some(b => b.risk === RISK.MEDIUM) ? RISK.MEDIUM : RISK.LOW)
  // What the planner has to avoid next time, in its own English.
  const blocking = [...new Set(high.flatMap(b => [...b.coreMissing, ...b.supportingMissing]))]
  return { version: RISK_VERSION, risk, beats, highBeats: high.map(b => b.beat), blocking }
}
