// Premise feasibility — the lexical gate, moved upstream of planning (2026-08-27).
//
// The six frozen plans A–F were all job-offer deliberations, and all six were
// lexically infeasible. The audit found why, and it was not the vocabulary:
// the targets 如果 / 需要 / 认为 contributed ZERO cost. What cost 62 points
// across the six plans came from four English words, and those four words were
// in the manifest before a planner ever saw it:
//
//   theme: "A friend asking for advice on a conditional life choice,
//           such as whether to accept a new job."
//
// The bundle judge is asked for "the one everyday situation they share, in a
// few words". Nothing asked whether that situation could be SAID at the level.
// It read three abstract glosses — if / need / think — and wrote an abstract
// English premise, which `planner-bakeoff` copies verbatim into `manifest.theme`
// and the shape prompt prints as "Theme:". Every candidate then paid for it,
// and added three times as much again elaborating the same frame.
//
// So a premise is scored the same way a beat is, with the same corrected
// matcher and the same cost model — no second heuristic, no keyword list of
// forbidden topics. A situation is a sentence of English; the gate already
// knows what a sentence of English costs.
//
//   "A friend asking for advice on a conditional life choice…"   cost 21, 4 off-list
//   "It is raining and one of them needs an umbrella to go home"  cost 0
//   "A bicycle is broken and they think about how to get to school" cost 0
//   "Someone lost a key and they need to find it"                 cost 1
//
// The same three target words, in a concrete situation, cost nothing. That is
// the whole finding, and it is why this runs before the planner rather than
// after it.
//
// Pure: no network, no fs, no clock.

import {
  conceptsFromBeat, conceptSupport, classifyConcept, buildLexicalIndexes,
  ASSIST, ASSISTED_POLICY, withPolicy,
} from './storyLexicalRisk.mjs'

export const PREMISE_VERSION = 'fab9-premise@1'

export const PREMISE = { OK: 'OK', COSTLY: 'COSTLY', UNSAYABLE: 'UNSAYABLE' }

// A premise is a sentence, not a story: it may afford one word the reader taps,
// and no more. These are deliberately far tighter than the story budget —
// whatever the premise costs, every beat elaborating it costs again.
export const PREMISE_POLICY = {
  version: 'fab9-premise-policy@1',
  costMax: 4,
  offListMax: 1,
}

/**
 * Score an English premise with the story gate's own matcher and cost model.
 * `indexes` may be prebuilt (buildLexicalIndexes) — a bundle run scores several
 * candidate situations against one vocabulary.
 */
export function assessPremise(text, { vocabMap, level, indexes = null, policy = PREMISE_POLICY, costPolicy = ASSISTED_POLICY } = {}) {
  const ix = indexes || buildLexicalIndexes(vocabMap, level)
  const concepts = conceptsFromBeat({ what: String(text || ''), because: '' })
  const seen = new Set()
  const assisted = []
  for (const c of [...concepts.core, ...concepts.supporting, ...concepts.incidental]) {
    if (seen.has(c)) continue
    seen.add(c)
    const support = conceptSupport(c, ix.index, ix.fullIndex, {
      synonyms: ix.synonyms, inLevelWords: ix.inLevelWords, pos: concepts.pos.get(c) || null,
    })
    const entry = classifyConcept(support, { vocabMap, level, policy: withPolicy(costPolicy) })
    if (entry.kind !== ASSIST.ASSISTED) continue
    assisted.push({ concept: c, word: entry.word || null, offList: Boolean(entry.offList), cost: entry.cost, route: entry.route || null })
  }
  const cost = assisted.reduce((a, b) => a + b.cost, 0)
  const offList = assisted.filter(a => a.offList)
  const p = policy || PREMISE_POLICY
  // UNSAYABLE is reserved for a premise whose own words the language does not
  // have. COSTLY is a premise that can be said, but only by spending the
  // budget the STORY needs — every beat will elaborate this sentence.
  const verdict = offList.length > p.offListMax ? PREMISE.UNSAYABLE
    : (cost > p.costMax ? PREMISE.COSTLY : PREMISE.OK)
  return {
    version: PREMISE_VERSION,
    text: String(text || ''),
    verdict,
    cost,
    offListWords: offList.length,
    assisted,
    // The words to name back to whoever wrote the premise. Nothing is
    // blacklisted: this is what THIS sentence cost, not a topic ban.
    unsayable: offList.map(a => a.concept),
    policy: p,
  }
}

/** The first premise that clears the gate, with every verdict kept for the artifact. */
export function choosePremise(candidates, opts = {}) {
  const scored = (candidates || []).filter(Boolean).map(text => assessPremise(text, opts))
  const ok = scored.find(s => s.verdict === PREMISE.OK)
    || scored.slice().sort((a, b) => a.cost - b.cost || a.offListWords - b.offListWords)[0] || null
  return { chosen: ok && ok.verdict === PREMISE.OK ? ok : null, cheapest: ok, scored }
}
