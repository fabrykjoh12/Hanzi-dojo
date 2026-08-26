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

export const RISK_VERSION = 'fab9-risk@4'

export const RISK = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' }

// English function words that are not lexical concepts in any language's
// vocabulary list: you say them with grammar, not with a word to look up.
// a32-fresh-1 rejected a good shape partly on "cannot", "someone" and
// "alone" — 能/可以/会 and 有人 are exactly how those are said.
const FUNCTIONAL = new Set([
  'cannot', 'someone', 'somebody', 'something', 'anyone', 'anything', 'everyone',
  'everything', 'nobody', 'nothing', 'alone', 'able', 'unable', 'each', 'other',
  'another', 'both', 'either', 'neither', 'himself', 'herself', 'themselves',
  // Fragments left by contractions: "isn't" tokenizes to "isn".
  'isn', 'doesn', 'didn', 'wasn', 'aren', 'won', 'don', 'can', 'couldn', 'wouldn', 'shouldn',
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
  // The plan's own scaffolding, not the story's content: every beat 1 says
  // "the story opens", and once incidental material is charged that boilerplate
  // would put a phantom word on every plan's budget.
  'story', 'opens', 'opening', 'follows', 'following', 'beat', 'scene', 'plot',
  'previous', 'happens', 'happening', 'continues', 'begins', 'ends', 'ending',
])

function sentences(text) {
  return String(text || '').split(/[.!?;]+/).map(s => s.trim()).filter(Boolean)
}

function splitClause(sentence) {
  const m = sentence.match(SUBORDINATORS)
  if (!m || m.index === 0) return { main: sentence, sub: '' }
  return { main: sentence.slice(0, m.index).trim(), sub: sentence.slice(m.index).trim() }
}

// The only part-of-speech signal on the ENGLISH side is the shape of the
// sentence the concept came from. A determiner in front of a word makes it a
// noun ("the flat TIRE"); an inflected verb with no determiner makes it a verb
// ("Xiao Hong STANDS"). Everything else stays unknown, and unknown never
// blocks a match — "he needs help" must keep reaching 帮助.
const DETERMINERS = new Set([
  'the', 'a', 'an', 'his', 'her', 'their', 'its', 'my', 'your', 'our',
  'this', 'that', 'these', 'those', 'one', 'two', 'three', 'some', 'any',
  'every', 'another', 'each', 'both',
])

export function beatConceptPos(text) {
  // A RAW split, not tokenize(): tokenize drops stopwords, and the stopwords
  // are exactly the determiners this reads.
  const tokens = String(text || '').toLowerCase().split(/[^a-z]+/).filter(Boolean)
  const pos = new Map()
  tokens.forEach((t, i) => {
    if (pos.has(t)) return
    const back = [tokens[i - 1], tokens[i - 2]].filter(Boolean)
    if (back.some(w => DETERMINERS.has(w))) { pos.set(t, 'noun'); return }
    // -ing and -ed are reliable verb marks. A trailing -s is NOT: in these
    // beats it is a plural noun far more often than a third-person verb, and
    // treating it as one forced 邻居 (HSK 3, "neighbor"), 谢谢 (HSK 1, "thank
    // you") and every other plural off the list and into the assisted budget.
    if (/(?:ing|ed)$/.test(t) && t.length > 4) pos.set(t, 'verb')
  })
  return pos
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
  // Which sentence each concept came from: the learner taps a word inside a
  // sentence, and three unknowns in one sentence is a different experience
  // from three spread over a beat.
  const sentenceOf = new Map()
  parts.forEach((s, i) => {
    const { main, sub } = splitClause(s)
    const mainTokens = clean(main)
    const subTokens = clean(sub)
    for (const t of [...mainTokens, ...subTokens]) if (!sentenceOf.has(t)) sentenceOf.set(t, i + 1)
    ;(i === 0 ? core : supporting).push(...mainTokens)
    incidental.push(...subTokens)
  })
  // The causal link is story content and appears in the prose, so it is
  // incidental (charged at half). A target's INTENT is not: "Description",
  // "Social bonding", "Gender comparison" are notes about the plan, and once
  // incidental material started being charged they were being billed as
  // vocabulary the story has to say.
  incidental.push(...clean(beat && beat.because))
  const meta = []
  for (const e of entries) meta.push(...clean(e && e.intent))
  const seen = new Set()
  const dedupe = (list) => list.filter(t => (seen.has(t) ? false : (seen.add(t), true)))
  const pos = beatConceptPos(String((beat && beat.what) || '') + ' ' + String((beat && beat.because) || ''))
  return { core: dedupe(core), supporting: dedupe(supporting), incidental: dedupe(incidental), meta: dedupe(meta), pos, sentenceOf }
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
    // Indexed sense by sense, so a token remembers whether the reading it came
    // from was verbal. Flattening the gloss first is what let "tire" (noun)
    // be answered by "to tire".
    for (const sense of glossSenses(v.meaning)) {
      for (const t of sense.tokens) {
        for (const key of [t, stem(t), riskStem(t)]) {
          if (!index.has(key)) index.set(key, [])
          const hits = index.get(key)
          if (hits.length < 12 && !hits.some(h => h.word === word && h.verb === sense.verb && h.token === t)) {
            hits.push({ word, verb: sense.verb, token: t })
          }
        }
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

// ONE reading of a gloss, shared by everything that needs to know what a sense
// means and what part of speech it is. The glosses mark verbs themselves with
// a leading "to", and that mark is the only part-of-speech signal in the
// dataset — so it is read once, here, rather than re-guessed per feature.
export function glossSenses(meaning) {
  const out = []
  for (const raw of String(meaning || '').split(/[;,]/)) {
    const sense = raw.replace(/\([^)]*\)/g, ' ').trim()
    if (!sense) continue
    const verb = /^to\s+/i.test(sense)
    const body = sense.replace(/^to\s+/i, '').replace(/^(?:a|an|the)\s+/i, '').trim().toLowerCase()
    if (!body) continue
    out.push({ text: body, verb, tokens: tokenize(body) })
  }
  return out
}

// Senses that are a single word are the ones that can stand as synonyms of
// each other. "large bus" is not a synonym of "coach", it is a phrase.
function senseHeads(meaning) {
  return glossSenses(meaning)
    .map(s => ({ head: s.text, verb: s.verb }))
    .filter(s => /^[a-z][a-z'-]*$/.test(s.head) && s.head.length >= 3 && !SENSE_STOP.has(s.head) && !/-/.test(s.head))
}

// Is a concept of this part of speech allowed to be answered by this sense?
// a3-H-2 rated a bicycle TIRE feasible because 累 is glossed "tired, to tire":
// the noun matched the verb "to tire", and a plan whose central object has no
// word at any level cleared the feasibility gate.
//
// The check is deliberately one-directional in strength: it only rules a hit
// out when the concept's part of speech is KNOWN — a noun with a determiner
// in front of it, a verb by its inflection — because "he needs help" and
// 帮助 "assistance; aid; to help" must keep matching, and there the concept's
// part of speech is not marked at all.
// "tired" and "tires" both stem to "tir", so the plural of the bicycle tire
// reached 累 through its ADJECTIVE sense even though the verb sense was
// correctly blocked — the POS fix held for the singular and leaked on the
// plural. A stem is only allowed to join two words when their inflections are
// compatible: base and -s are the same lemma, while -ed / -ing may only meet
// them through a sense the gloss marks as a verb.
export function suffixClass(word) {
  const w = String(word || '').toLowerCase()
  if (/ing$/.test(w) && w.length > 4) return 'ing'
  if (/ed$/.test(w) && w.length > 3) return 'ed'
  if (/s$/.test(w) && w.length > 3) return 's'
  return 'base'
}

export function inflectionCompatible(concept, token, sense) {
  const a = suffixClass(concept)
  const b = suffixClass(token)
  if (a === b) return true
  const nominalish = (x) => x === 'base' || x === 's'
  if (nominalish(a) && nominalish(b)) return true
  // One of them is a participle: only a verbal sense joins those.
  return Boolean(sense && sense.verb)
}

export function senseCompatible(pos, sense) {
  if (pos !== 'noun' && pos !== 'verb') return true
  return pos === 'verb' ? sense.verb : !sense.verb
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

export function conceptSupport(concept, index, fullIndex = null, { synonyms = null, inLevelWords = null, pos = null, targets = null } = {}) {
  const names = (hits) => [...new Set((hits || []).map(h => (h && h.word) || h))].slice(0, 4)
  // A word the story exists to TEACH is available to it whatever part of
  // speech the gloss happens to mark. 帮助 is glossed "assistance; aid; to
  // help; to assist", so "the help" matched only its verbal sense and the
  // check called the story's own target word missing. The tire keeps its
  // verdict: 累 is nobody's target.
  const ok = (h) => (senseCompatible(pos, h) && inflectionCompatible(concept, h.token || concept, h))
    || Boolean(targets && targets.has(h.word))
  for (const form of forms(concept)) {
    const hit = (index.get(form) || []).filter(ok)
    if (hit.length) return { support: 'supported', via: 'gloss', words: names(hit) }
  }

  // Bridge 1 — a synonym the dataset itself declares.
  if (synonyms) {
    for (const form of forms(concept)) {
      for (const synonym of (synonyms.get(form) || [])) {
        for (const sf of forms(synonym)) {
          const hit = (index.get(sf) || []).filter(ok)
          if (hit.length) return { support: 'supported', via: 'synonym', synonym, words: names(hit) }
        }
      }
    }
  }

  // Bridge 2 — the language says it with a compound built on a word the
  // reader already has.
  let above = null
  if (fullIndex) {
    for (const form of forms(concept)) {
      const hits = (fullIndex.get(form) || []).filter(ok)
      if (!above && hits.length) above = names(hits)
    }
  }
  if (inLevelWords && above) {
    for (const word of above) {
      const head = componentHead(word, inLevelWords)
      if (head) return { support: 'supported', via: 'component', compound: word, words: [head] }
    }
  }

  // A longer concept that is a piece of some gloss token, or vice versa.
  // English inflects at the END, so a legitimate variant the stemmer missed
  // shares the PREFIX: "heard"/"hear", "carried"/"carry". A compound that
  // merely ends with another word does not: "downstairs" is not "stair". The
  // first is support; the second was disguising an out-of-level concept.
  for (const [key, hits] of index) {
    if (key.length < 4 || concept.length < 5) continue
    const stemmed = riskStem(concept)
    const prefix = stemmed.startsWith(key) || key.startsWith(stemmed)
    const overlap = key.includes(stemmed) || stemmed.includes(key)
    if (!overlap) continue
    const usable = (hits || []).filter(ok)
    if (!usable.length) continue
    return prefix
      ? { support: 'supported', via: 'inflection', words: names(usable).slice(0, 3) }
      : { support: 'weak', via: 'substring', words: names(usable).slice(0, 3) }
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

// ── Assisted vocabulary (2026-08-26) ────────────────────────────────────────
// The goal changed: level-appropriate COMPREHENSIBILITY, not level purity. A
// learner can tap any word to see what it means, so a small amount of
// above-level vocabulary is not a defect — it is often the difference between
// natural Chinese and a paraphrase nobody would write. 轮胎 in a story about a
// bicycle is worth more than a vague sentence that avoids naming the tire.
//
// So a concept is classified, not merely accepted or rejected:
//
//   IN_LEVEL      the reader can already read it
//   ASSISTED_OOL  it needs a word above the level (or one the learner list does
//                 not carry at all), which the reader taps once
//
// and a PLAN is IN_LEVEL, ASSISTED_OOL, or LEXICALLY_UNSAFE — the last only
// when the assisted vocabulary is too much, too advanced, or too crowded for
// the story to still belong at its nominal level.
export const ASSIST = { IN_LEVEL: 'IN_LEVEL', ASSISTED: 'ASSISTED_OOL' }
export const FEASIBILITY = { IN_LEVEL: 'IN_LEVEL', ASSISTED: 'ASSISTED_OOL', UNSAFE: 'LEXICALLY_UNSAFE' }

// PROVISIONAL and configurable, not methodology carved into the code. Every
// number here is passed through, overridable per call, and reported in the
// artifact next to the verdict it produced.
export const ASSISTED_POLICY = {
  version: 'fab9-assist@1',
  // Measured on the FINISHED text by the deterministic validator, not here:
  // at plan time there is no Chinese to count. Carried so the artifact can
  // state the target the story is being held to.
  inLevelShareTarget: 0.90,
  inLevelSharePreferred: 0.95,
  // Unique assisted words across the whole story.
  assistedWordsPreferred: 4,
  assistedWordsMax: 8,
  // Crowding: one assisted word in a sentence is comfortable, two is the most
  // an otherwise easy sentence should carry.
  assistedPerBeatPreferred: 1,
  assistedPerBeatMax: 2,
  // Distance costs: HSK+1 is cheap, HSK+3 is not, and a word the learner list
  // does not contain at all is charged like the far end.
  distanceCost: { 1: 1, 2: 2, 3: 4 },
  farCost: 6,
  offListCost: 4,
  costBudget: 12,
  // A word the learner list does not carry reaches the deterministic validator
  // as an UNKNOWN word, not an above-level one, and that gate is strict. Plan
  // time may not promise more of them than validation will accept.
  offListMax: 2,
  // A word the story genuinely turns on is worth more than one it merely
  // decorates itself with. The plan's own structure says which is which, so
  // the writer cannot decide it retroactively.
  necessityWeight: { CENTRAL_NECESSARY: 0.75, NATURAL_SUPPORT: 1, OPTIONAL_COMPLEXITY: 1.5 },
  // The learner can tap a word; they should not have to tap half a sentence.
  assistedPerSentencePreferred: 1,
  assistedPerSentenceMax: 2,
}

export const NECESSITY = {
  central: 'CENTRAL_NECESSARY',
  support: 'NATURAL_SUPPORT',
  optional: 'OPTIONAL_COMPLEXITY',
}

// A caller may override one number without restating the rest.
export function withPolicy(policy) {
  return {
    ...ASSISTED_POLICY,
    ...(policy || {}),
    distanceCost: { ...ASSISTED_POLICY.distanceCost, ...((policy || {}).distanceCost || {}) },
    necessityWeight: { ...ASSISTED_POLICY.necessityWeight, ...((policy || {}).necessityWeight || {}) },
  }
}

// What the concept is DOING in the beat, read off the plan's own structure:
// the main clause of the first sentence is the event, later main clauses carry
// it, and a subordinate clause is decoration.
export function necessityOf(bucket) {
  if (bucket === 'core') return NECESSITY.central
  if (bucket === 'supporting') return NECESSITY.support
  return NECESSITY.optional
}

export function weightedCost(cost, necessity, policyIn = ASSISTED_POLICY) {
  const policy = withPolicy(policyIn)
  const w = policy.necessityWeight[necessity]
  return Math.max(1, Math.ceil((cost || 0) * (Number.isFinite(w) ? w : 1)))
}

export function assistCost(entry, policyIn = ASSISTED_POLICY) {
  const policy = withPolicy(policyIn)
  if (!entry || entry.kind === ASSIST.IN_LEVEL) return 0
  if (entry.offList) return policy.offListCost
  const d = Number(entry.distance)
  if (!Number.isFinite(d) || d < 1) return policy.offListCost
  return policy.distanceCost[d] != null ? policy.distanceCost[d] : policy.farCost
}

// One concept's lexical standing: in level, or assisted by a named word.
export function classifyConcept(support, { vocabMap = {}, level = 1, policy: policyIn = ASSISTED_POLICY } = {}) {
  const policy = withPolicy(policyIn)
  if (support && support.support === 'supported') {
    return { kind: ASSIST.IN_LEVEL, cost: 0 }
  }
  // A WEAK match is a substring coincidence, not evidence. "downstairs" was
  // being called in-level because 楼梯 is glossed "stair; staircase" and the
  // strings overlap — an out-of-level concept disguised as an in-level one,
  // which is the one thing this classification must never do. The near miss is
  // recorded for diagnosis and pays the full off-list price.
  if (support && support.support === 'weak') {
    const entry = {
      kind: ASSIST.ASSISTED,
      word: null,
      wordLevel: null,
      distance: null,
      offList: true,
      source: 'weak-match',
      nearest: (support.words || [])[0] || null,
    }
    return { ...entry, cost: assistCost(entry, policy) }
  }
  // The dictionary has a word for it, above the level: the reader taps it.
  const above = (support && support.words) || []
  // The cheapest way the language says it. Taking whichever entry the corpus
  // happened to list first made the same concept cost 1 or 6 depending on row
  // order — and named the wrong word in the artifact.
  const word = above
    .filter(w => vocabMap[w] && Number.isFinite(vocabMap[w].level))
    .sort((a, b) => vocabMap[a].level - vocabMap[b].level || (a < b ? -1 : 1))[0]
  if (word) {
    const wordLevel = vocabMap[word].level
    const distance = Math.max(1, wordLevel - level)
    const entry = { kind: ASSIST.ASSISTED, word, wordLevel, distance, offList: false, source: 'above-level' }
    return { ...entry, cost: assistCost(entry, policy) }
  }
  // Nothing in the learner list at all. The language still has a word for a
  // tire; this dataset is a course vocabulary, not a dictionary. It is
  // assisted, and charged like the far end because nothing here can vouch for
  // how ordinary it is.
  const entry = { kind: ASSIST.ASSISTED, word: null, wordLevel: null, distance: null, offList: true, source: 'off-list' }
  return { ...entry, cost: assistCost(entry, policy) }
}

// HIGH means the beat cannot be told at this level: its own subject matter is
// missing, not a detail of it.
// The budget is stated in WORDS THE READER TAPS, so identity is the Chinese
// word, not the English token that reached it: "wheel" and "wheels" are one
// tap of 轮子. Off-list concepts have no word to key on, so they fall back to
// the harder stem — which still joins tire/tires without collapsing every
// unrelated absent concept into one.
export function assistKey(entry, concept = null) {
  const c = riskStem((entry && entry.concept) || concept || '')
  return entry && entry.word ? 'w:' + entry.word : 'c:' + c
}

export function assessBeatRisk({ beat, entries = [], manifest, vocabMap, index = null, fullIndex = null, names = [], synonyms = null, inLevelWords = null, policy = ASSISTED_POLICY } = {}) {
  const idx = index || buildGlossIndex(vocabMap, manifest.level)
  const full = fullIndex || buildFullGlossIndex(vocabMap)
  const syn = synonyms || buildSenseSynonyms(vocabMap)
  const inLevel = inLevelWords || buildInLevelWords(vocabMap, manifest.level)
  const concepts = conceptsFromBeat(beat, entries, { names })
  const targetWords = new Set((manifest.targets || []).map(t => t.word))
  const rate = (list) => list.map(c => ({
    concept: c,
    pos: concepts.pos.get(c) || 'unknown',
    ...conceptSupport(c, idx, full, { synonyms: syn, inLevelWords: inLevel, pos: concepts.pos.get(c) || null, targets: targetWords }),
  }))
  const classify = (list, bucket) => list.map(c => {
    const assist = classifyConcept(c, { vocabMap, level: manifest.level, policy })
    const necessity = necessityOf(bucket)
    return {
      ...c,
      sentence: concepts.sentenceOf ? (concepts.sentenceOf.get(c.concept) || null) : null,
      assist: { ...assist, necessity, baseCost: assist.cost, cost: weightedCost(assist.cost, necessity, policy) },
    }
  })
  const core = classify(rate(concepts.core), 'core')
  const supporting = classify(rate(concepts.supporting), 'supporting')
  const incidental = classify(rate(concepts.incidental), 'incidental')
  // Reported so the artifact can show it, never charged: it is a note about
  // the plan, not a word the story has to say.
  const meta = classify(rate(concepts.meta || []))

  // Decoration is not free — that was a hole, one relative clause could carry a
  // whole story's advanced vocabulary — and it is not cheap either: an advanced
  // word the story does not need is exactly what should not be rewarded. The
  // necessity weight above prices it, so nothing is halved here.
  const assisted = [...core, ...supporting].filter(c => c.assist.kind === ASSIST.ASSISTED)
  const incidentalAssisted = incidental.filter(c => c.assist.kind === ASSIST.ASSISTED)
  const cost = [...assisted, ...incidentalAssisted].reduce((n, c) => n + c.assist.cost, 0)

  // A beat is only unsafe on its own account when it is CROWDED — the budget
  // for the story as a whole is settled by assessShapeRisk.
  const distinct = new Set(assisted.map(c => assistKey(c.assist, c.concept))).size
  // Per SENTENCE, not only per beat: comprehension should never depend on
  // several unknown words at once.
  const bySentence = new Map()
  for (const c of [...assisted, ...incidentalAssisted]) {
    const n = c.sentence || 0
    if (!bySentence.has(n)) bySentence.set(n, new Set())
    bySentence.get(n).add(assistKey(c.assist, c.concept))
  }
  const sentences = [...bySentence.entries()].map(([n, set]) => ({ sentence: n, assisted: set.size }))
  const clustered = sentences.filter(x => x.assisted > policy.assistedPerSentenceMax)
  const crowded = distinct > policy.assistedPerBeatMax || clustered.length > 0
  const risk = crowded
    ? RISK.HIGH
    : (assisted.length ? RISK.MEDIUM : (incidentalAssisted.length ? RISK.MEDIUM : RISK.LOW))
  const describe = (list) => list.map(c => c.concept + (c.assist.word ? ' (' + c.assist.word + ' HSK' + c.assist.wordLevel + ')' : ' (no word in the list)')).join(', ')
  let reason = 'every concept in this beat is in level'
  if (clustered.length) {
    reason = 'sentence ' + clustered.map(x => x.sentence).join(', ') + ' of this beat needs '
      + clustered.map(x => x.assisted).join('/') + ' words above the level at once (max ' + policy.assistedPerSentenceMax
      + ' in one sentence): ' + describe(assisted)
  } else if (crowded) {
    reason = 'this one beat needs ' + assisted.length + ' words above the level (max ' + policy.assistedPerBeatMax + '): ' + describe(assisted)
  } else if (assisted.length) {
    reason = assisted.length + ' assisted word(s) the reader taps: ' + describe(assisted)
  } else if (incidentalAssisted.length) {
    reason = 'only incidental detail is out of level (' + describe(incidentalAssisted) + '), and the beat does not need it'
  }

  return {
    beat: beat.id,
    risk,
    reason,
    core,
    supporting,
    incidental,
    assisted: assisted.map(c => ({ concept: c.concept, ...c.assist })),
    incidentalAssisted: incidentalAssisted.map(c => ({ concept: c.concept, ...c.assist })),
    metaAssisted: meta.filter(c => c.assist.kind === ASSIST.ASSISTED).map(c => ({ concept: c.concept, ...c.assist })),
    cost,
    crowded,
    sentences,
    clustered: clustered.map(x => x.sentence),
    // Kept for the reports and specs that read them: what is NOT in level.
    coreMissing: core.filter(c => c.assist.kind === ASSIST.ASSISTED).map(c => c.concept),
    supportingMissing: supporting.filter(c => c.assist.kind === ASSIST.ASSISTED).map(c => c.concept),
    incidentalMissing: incidentalAssisted.map(c => c.concept),
  }
}

export function assessShapeRisk({ blueprint, manifest, vocabMap, policy = ASSISTED_POLICY } = {}) {
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
    manifest, vocabMap, index, fullIndex, names, synonyms, inLevelWords, policy,
  }))
  // ── The assisted-vocabulary budget, over the whole story ──────────────────
  // Unique CONCEPTS, so a word the story leans on twice is paid for once —
  // the reader taps it once too.
  const byConcept = new Map()
  for (const b of beats) {
    for (const a of [...b.assisted, ...b.incidentalAssisted]) {
      const key = assistKey(a)
      if (!byConcept.has(key)) byConcept.set(key, { ...a, concepts: [], beats: [] })
      const row = byConcept.get(key)
      if (!row.concepts.includes(a.concept)) row.concepts.push(a.concept)
      if (!row.beats.includes(b.beat)) row.beats.push(b.beat)
      // One tap, charged at its cheapest reading.
      row.cost = Math.min(row.cost, a.cost)
    }
  }
  const assisted = [...byConcept.values()].sort((a, b) => (b.cost || 0) - (a.cost || 0))
  const cost = assisted.reduce((n, a) => n + (a.cost || 0), 0)
  const crowdedBeats = beats.filter(b => b.crowded).map(b => b.beat)
  const offList = assisted.filter(a => a.offList)

  const breaches = []
  if (assisted.length > policy.assistedWordsMax) {
    breaches.push(assisted.length + ' words above the level (max ' + policy.assistedWordsMax + ')')
  }
  if (cost > policy.costBudget) {
    breaches.push('an assisted-vocabulary cost of ' + cost + ' (budget ' + policy.costBudget
      + ') — distance above the level is charged, so a few far words cost more than several near ones')
  }
  if (crowdedBeats.length) {
    breaches.push('beat(s) ' + crowdedBeats.join(', ') + ' carry more than ' + policy.assistedPerBeatMax + ' assisted words')
  }
  if (offList.length > policy.offListMax) {
    breaches.push(offList.length + ' words the learner list does not carry at all (max ' + policy.offListMax
      + ') — those reach the deterministic validator as UNKNOWN words, and it is strict about them')
  }

  const classification = breaches.length
    ? FEASIBILITY.UNSAFE
    : (assisted.length ? FEASIBILITY.ASSISTED : FEASIBILITY.IN_LEVEL)
  // The existing three-state gate is kept so everything downstream still reads
  // one vocabulary: UNSAFE is what used to be HIGH and is the only verdict
  // that makes a plan ineligible.
  const risk = classification === FEASIBILITY.UNSAFE
    ? RISK.HIGH
    : (classification === FEASIBILITY.ASSISTED ? RISK.MEDIUM : RISK.LOW)

  const notes = []
  if (assisted.length > policy.assistedWordsPreferred && classification !== FEASIBILITY.UNSAFE) {
    notes.push('above the comfortable ' + policy.assistedWordsPreferred + ' assisted words, still inside the ' + policy.assistedWordsMax + ' allowed')
  }
  for (const b of beats) {
    if (!b.crowded && b.assisted.length > policy.assistedPerBeatPreferred) {
      notes.push('beat ' + b.beat + ' carries ' + b.assisted.length + ' assisted words; one per sentence reads more easily')
    }
  }

  const high = beats.filter(b => b.risk === RISK.HIGH)
  // What the planner has to avoid next time, in its own English — now only the
  // words that actually broke the budget, not every word above the level.
  // An UNSAFE verdict must always NAME words. A word-count or cost breach is
  // broken by no single beat and by no off-list word, so `blocking` came back
  // empty and the one permitted replan re-ran the planner on identical input.
  const blocking = []
  if (classification === FEASIBILITY.UNSAFE) {
    const seen = new Set()
    const add = (c) => { if (c && !seen.has(c)) { seen.add(c); blocking.push(c) } }
    for (const b of high) for (const a of b.assisted) add(a.concept)
    for (const a of offList) for (const c of a.concepts) add(c)
    // `assisted` is sorted dearest-first: name them until the rest would fit.
    let words = assisted.length
    let spend = cost
    for (const a of assisted) {
      if (words <= policy.assistedWordsMax && spend <= policy.costBudget) break
      for (const c of a.concepts) add(c)
      words -= 1
      spend -= (a.cost || 0)
    }
  }

  return {
    version: RISK_VERSION,
    risk,
    classification,
    beats,
    highBeats: high.map(b => b.beat),
    blocking,
    corpus,
    policy,
    // Everything the artifact, the UI and the analytics need to explain the
    // level of the finished story: what was assisted, where it came from, and
    // how far above the level it sits.
    assisted: assisted.map(a => ({
      concept: a.concept,
      concepts: a.concepts,
      word: a.word,
      hsk: a.wordLevel,
      distance: a.distance,
      source: a.source,
      necessity: a.necessity || null,
      baseCost: a.baseCost != null ? a.baseCost : a.cost,
      nearest: a.nearest || null,
      offList: a.offList,
      cost: a.cost,
      beats: a.beats,
    })),
    budget: {
      nominalLevel: manifest.level,
      assistedWords: assisted.length,
      cost,
      costBudget: policy.costBudget,
      crowdedBeats,
      clusteredSentences: beats.filter(b => (b.clustered || []).length).map(b => ({ beat: b.beat, sentences: b.clustered })),
      offListWords: offList.length,
      offListMax: policy.offListMax,
      inLevelShareTarget: policy.inLevelShareTarget,
      inLevelSharePreferred: policy.inLevelSharePreferred,
      // Stated, not measured here: there is no Chinese at plan time. The
      // deterministic validator counts it on the finished story.
      measuredOn: 'the finished draft, by the deterministic validator',
      breaches,
      notes,
    },
  }
}
