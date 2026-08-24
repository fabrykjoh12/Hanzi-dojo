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
import { BIBLE_CHINESE } from './storyLevels.mjs'

// The shape is English, so its people are "Li Ming" and "Xiao Hong". Without
// these the preflight read "Li" as a missing word — matched against 着凉, to
// catch a cold — and that phantom drove almost every beat's classification.
const ROMANIZED = (() => {
  const out = []
  for (const line of String((BIBLE_CHINESE && BIBLE_CHINESE.text) || '').split('\n')) {
    const m = line.match(/\(([^)]+)\)/)
    if (m) out.push(m[1])
  }
  return out
})()

export const RISK_VERSION = 'fab9-risk@2'

export const RISK = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' }

// English function words that are not lexical concepts in any language's
// vocabulary list: you say them with grammar, not with a word to look up.
// a32-fresh-1 rejected a good shape partly on "cannot", "someone" and
// "alone" — 能/可以/会 and 有人 are exactly how those are said.
const FUNCTIONAL = new Set([
  'cannot', 'someone', 'somebody', 'something', 'anyone', 'anything', 'everyone',
  'everything', 'nobody', 'nothing', 'alone', 'able', 'unable', 'each', 'other',
  'another', 'both', 'either', 'neither', 'himself', 'herself', 'themselves',
  'itself', 'myself', 'yourself', 'much', 'many', 'few', 'little', 'own',
])

// The risk module normalizes English harder than retrieval does — retrieval's
// scoring is deliberately untouched. "living" must reach 住 (to live) and
// "happily" must reach 高兴 (happy); a stem that stops at "liv" and "happili"
// invents gaps that are not there.
function riskStem(word) {
  let w = String(word || '').toLowerCase()
  if (w.length > 4 && w.endsWith('ily')) return w.slice(0, -3) + 'y'
  if (w.length > 3 && w.endsWith('ly')) w = w.slice(0, -2)
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) { w = w.slice(0, -suffix.length); break }
  }
  return w
}

// Every form worth trying against the gloss index: the word, the shared stem,
// the harder stem, and the harder stem plus a dropped 'e' (liv → live).
function forms(word) {
  const w = String(word || '').toLowerCase()
  const r = riskStem(w)
  return [...new Set([w, stem(w), r, r + 'e'])].filter(Boolean)
}

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
  const nameTokens = new Set([...names, ...ROMANIZED].flatMap(n => tokenize(
    String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, ''))))
  const clean = (text) => tokenize(text).filter(t =>
    !nameTokens.has(t) && !FUNCTIONAL.has(t)
    && !LIGHT.has(t) && !LIGHT.has(stem(t)) && !LIGHT.has(riskStem(t)))
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
      for (const key of [t, stem(t), riskStem(t)]) {
        if (!index.has(key)) index.set(key, [])
        if (index.get(key).length < 6 && !index.get(key).includes(word)) index.get(key).push(word)
      }
    }
  }
  return index
}

// The vocabulary dataset is a LEARNER LIST, not a dictionary of the language:
// chain, wheel, thud and struggling appear in it at no level at all. Treating
// "absent everywhere" as "not a lexical concept" therefore threw away exactly
// the concrete nouns that make a beat untellable — the preflight rated the
// bicycle-chain beat HIGH only because it had mistaken the name "Li" for a
// missing word. Absent is a gap; the STOP and LIGHT lists are what keep
// function words out, and they are about English parsing, not Chinese.
export function buildFullGlossIndex(vocabMap) {
  return buildGlossIndex(vocabMap, Number.MAX_SAFE_INTEGER)
}

// ── Why exact gloss-token overlap is not evidence of impossibility ──────────
// a3-final-1 rejected a plan for "large" while 大 (HSK 1) is glossed "big",
// and for "carry"/"lift" while 搬 (HSK 3) is "to move (sth relatively heavy
// or bulky)". The concepts were expressible; only the English wording
// differed. Two bridges fix that class, and both are built from the canonical
// dataset itself — no curated synonym table, no per-word fix.
//
// 1. SENSE SYNONYMS. A gloss lists alternative translations of ONE word, so
//    its single-word senses are synonyms of each other: 抱 "to hold; to carry
//    (in one's arms)" says hold ≈ carry, 抬 "to lift; to raise" says lift ≈
//    raise. If a synonym of the concept is in level, the concept is sayable.
//    Senses are linked only when they agree in part of speech, which the
//    glosses mark themselves with a leading "to": 花 "flower; to spend" must
//    never make "spend" sayable because "flower" is.
//
// 2. COMPONENT HEAD. When the language expresses a concept with an
//    above-level compound whose HEAD is an in-level word, the learner has the
//    simpler word: 大型/大量/大巴 are all above level and all begin with 大.
//    The head must itself be an in-level entry, which is what keeps 轮子
//    (wheel, HSK 6) a real gap — 轮 is not a word the reader has.
const SENSE_STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'sth', 'sb', 'etc', 'coll', 'used', 'not'])

function senseHeads(meaning) {
  const out = []
  for (const raw of String(meaning || '').split(/[;,]/)) {
    const sense = raw.replace(/\([^)]*\)/g, ' ').trim()
    if (!sense) continue
    const verb = /^to\s+/i.test(sense)
    const head = sense.replace(/^to\s+/i, '').replace(/^(?:a|an|the)\s+/i, '').trim().toLowerCase()
    // One word only: "large bus" is not a synonym of "coach", it is a phrase.
    if (!/^[a-z][a-z'-]*$/.test(head) || head.length < 3 || SENSE_STOP.has(head)) continue
    if (/-/.test(head)) continue
    out.push({ head, verb })
  }
  return out
}

// token → tokens that some entry lists as an alternative translation of it.
export function buildSenseSynonyms(vocabMap) {
  const syn = new Map()
  const link = (a, b) => {
    for (const key of new Set([a, stem(a), riskStem(a)])) {
      if (!syn.has(key)) syn.set(key, new Set())
      syn.get(key).add(b)
    }
  }
  for (const word of Object.keys(vocabMap || {})) {
    const v = vocabMap[word]
    if (!v || !v.meaning) continue
    const heads = senseHeads(v.meaning)
    if (heads.length < 2) continue
    for (const a of heads) {
      for (const b of heads) {
        if (a.head === b.head || a.verb !== b.verb) continue
        link(a.head, b.head)
      }
    }
  }
  return syn
}

// The words the reader has, for testing whether an above-level compound is
// built on one of them.
export function buildInLevelWords(vocabMap, level) {
  const out = new Set()
  for (const word of Object.keys(vocabMap || {})) {
    const v = vocabMap[word]
    if (v && Number.isFinite(v.level) && v.level <= level) out.add(word)
  }
  return out
}

// Is `word` (above level) built on a word the reader already has?
export function componentHead(word, inLevelWords) {
  const w = String(word || '')
  for (let n = w.length - 1; n >= 1; n -= 1) {
    const head = w.slice(0, n)
    if (inLevelWords.has(head)) return head
  }
  return null
}

export function conceptSupport(concept, index, fullIndex = null, { synonyms = null, inLevelWords = null } = {}) {
  for (const form of forms(concept)) {
    const hit = index.get(form)
    if (hit && hit.length) return { support: 'supported', via: 'gloss', words: hit.slice(0, 4) }
  }

  // Bridge 1 — a synonym the dataset itself declares.
  if (synonyms) {
    for (const form of forms(concept)) {
      for (const synonym of (synonyms.get(form) || [])) {
        for (const sf of forms(synonym)) {
          const hit = index.get(sf)
          if (hit && hit.length) {
            return { support: 'supported', via: 'synonym', synonym, words: hit.slice(0, 4) }
          }
        }
      }
    }
  }

  // Bridge 2 — the language says it with a compound built on a word the
  // reader already has.
  let above = null
  if (fullIndex) for (const form of forms(concept)) { above = above || fullIndex.get(form) }
  if (inLevelWords && above) {
    for (const word of above) {
      const head = componentHead(word, inLevelWords)
      if (head) return { support: 'supported', via: 'component', compound: word, words: [head] }
    }
  }

  // A longer concept that is a piece of some gloss token, or vice versa.
  for (const [key, words] of index) {
    if (concept.length >= 5 && (key.includes(riskStem(concept)) || riskStem(concept).includes(key)) && key.length >= 4) {
      return { support: 'weak', via: 'substring', words: words.slice(0, 3) }
    }
  }
  // Only now is the concept unsupported, and the full index says which kind:
  // a word the language has and the reader does not, or nothing at all.
  return { support: 'none', via: above ? 'above-level' : 'absent', words: (above || []).slice(0, 3) }
}

// ── Corpus integrity ────────────────────────────────────────────────────────
// A stale local dump with `meaning: "undefined"` on every row made this gate
// rate five of six beats HIGH, for words the reader plainly has. A gate whose
// evidence is missing must refuse to answer, not answer wrongly: without
// glosses every concept looks unsupported, and that reads exactly like a
// story that cannot be told.
export const MIN_GLOSSED_SHARE = 0.5

export function validateGlossCorpus(vocabMap) {
  const words = Object.keys(vocabMap || {})
  const glossed = words.filter(w => {
    const m = vocabMap[w] && vocabMap[w].meaning
    return typeof m === 'string' && m.trim() && m.trim().toLowerCase() !== 'undefined' && m.trim().toLowerCase() !== 'null'
  })
  const share = words.length ? glossed.length / words.length : 0
  if (!words.length) return { ok: false, share: 0, glossed: 0, total: 0, reason: 'the vocabulary is empty' }
  if (share < MIN_GLOSSED_SHARE) {
    return {
      ok: false,
      share,
      glossed: glossed.length,
      total: words.length,
      reason: 'only ' + glossed.length + ' of ' + words.length + ' vocabulary rows carry a usable gloss ('
        + Math.round(share * 100) + '%). Lexical risk cannot be judged without glosses — regenerate the corpus dump.',
    }
  }
  return { ok: true, share, glossed: glossed.length, total: words.length }
}

export class GlossCorpusError extends Error {}

// HIGH means the beat cannot be told at this level: its own subject matter is
// missing, not a detail of it.
export function assessBeatRisk({ beat, entries = [], manifest, vocabMap, index = null, fullIndex = null, names = [], synonyms = null, inLevelWords = null } = {}) {
  const idx = index || buildGlossIndex(vocabMap, manifest.level)
  const full = fullIndex || buildFullGlossIndex(vocabMap)
  const syn = synonyms || buildSenseSynonyms(vocabMap)
  const inLevel = inLevelWords || buildInLevelWords(vocabMap, manifest.level)
  const concepts = conceptsFromBeat(beat, entries, { names })
  const rate = (list) => list.map(c => ({ concept: c, ...conceptSupport(c, idx, full, { synonyms: syn, inLevelWords: inLevel }) }))
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
  // Refuse rather than guess: a corpus without glosses makes every concept
  // look impossible, which is indistinguishable from a story that is.
  const corpus = validateGlossCorpus(vocabMap)
  if (!corpus.ok) throw new GlossCorpusError('lexical risk refused: ' + corpus.reason)
  const index = buildGlossIndex(vocabMap, manifest.level)
  const fullIndex = buildFullGlossIndex(vocabMap)
  const synonyms = buildSenseSynonyms(vocabMap)
  const inLevelWords = buildInLevelWords(vocabMap, manifest.level)
  const names = [...(blueprint.cast || []), ...(manifest.speakers || [])]
  const beats = (blueprint.beats || []).map(beat => assessBeatRisk({
    beat,
    entries: (blueprint.targetPlan || []).filter(t => Number(t.beat) === beat.id),
    manifest, vocabMap, index, fullIndex, names, synonyms, inLevelWords,
  }))
  const high = beats.filter(b => b.risk === RISK.HIGH)
  const risk = high.length ? RISK.HIGH : (beats.some(b => b.risk === RISK.MEDIUM) ? RISK.MEDIUM : RISK.LOW)
  // What the planner has to avoid next time, in its own English.
  const blocking = [...new Set(high.flatMap(b => [...b.coreMissing, ...b.supportingMissing]))]
  return { version: RISK_VERSION, risk, beats, highBeats: high.map(b => b.beat), blocking, corpus }
}
