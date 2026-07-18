// Pure logic for the public "How much can you read?" assessment. No React, no
// network — so the correctness-critical math (banding, scoring, the reading-%
// estimate) is unit-tested in the node environment. The page (HowMuchCanYouRead)
// is a thin shell over these functions.

import { calculateStoryReadability } from './storyReading'
import { buildMcqQuestions } from './mcq'

// Bands with fewer than this can't form a 4-option MCQ, so they merge into a
// neighbor.
const MIN_BAND = 4

function mergeSmallBands(bands) {
  if (bands.length <= 1) return bands
  const out = []
  for (const b of bands) {
    if (b.vocab.length < MIN_BAND && out.length) {
      const prev = out[out.length - 1]
      out[out.length - 1] = { ...prev, vocab: [...prev.vocab, ...b.vocab] }
    } else {
      out.push({ ...b })
    }
  }
  // A too-small FIRST band can't merge backwards; fold it into the next one.
  if (out.length > 1 && out[0].vocab.length < MIN_BAND) {
    out[1] = { ...out[1], vocab: [...out[0].vocab, ...out[1].vocab] }
    out.shift()
  }
  return out
}

// Partition active vocab into difficulty bands, easy→hard. Each level splits into
// two frequency tiers (by sort_order median). Derived from the data, so more
// levels/languages extend the bands automatically. Each band: { key, level, tier, vocab }.
export function buildBands(vocab) {
  const usable = (vocab || []).filter(v => v.word && v.meaning)
  const byLevel = new Map()
  for (const v of usable) {
    if (!byLevel.has(v.level)) byLevel.set(v.level, [])
    byLevel.get(v.level).push(v)
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b)
  const bands = []
  for (const level of levels) {
    const rows = byLevel.get(level).slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const mid = Math.ceil(rows.length / 2)
    const frequent = rows.slice(0, mid)
    const rest = rows.slice(mid)
    bands.push({ key: `L${level}-frequent`, level, tier: 'frequent', vocab: frequent })
    if (rest.length) bands.push({ key: `L${level}-rest`, level, tier: 'rest', vocab: rest })
  }
  return mergeSmallBands(bands)
}

// Build ~perBand MCQs per band (each tagged with its bandKey), reusing the shared
// MCQ builder so difficulty is controlled purely by which vocab each band holds.
export function pickAssessmentQuestions(vocab, { perBand = 3, language = 'chinese' } = {}) {
  const bands = buildBands(vocab)
  const questions = []
  for (const band of bands) {
    const qs = buildMcqQuestions(band.vocab, language, perBand)
    for (const q of qs) questions.push({ ...q, bandKey: band.key })
  }
  return questions
}

// Walk bands low→high; advance the "known frontier" while a band is answered
// reliably (accuracy ≥ threshold), and STOP at the first band below it — a lucky
// guess in a higher band never resurrects the frontier. Returns the frontier
// index and the union of vocab ids at/below it (the estimated known deck).
export function estimateKnownFrontier(answers, bands, threshold = 0.67) {
  const perBand = new Map()
  for (const a of (answers || [])) {
    const s = perBand.get(a.bandKey) || { correct: 0, asked: 0 }
    s.asked += 1
    if (a.correct) s.correct += 1
    perBand.set(a.bandKey, s)
  }
  let frontierIndex = -1
  for (let i = 0; i < bands.length; i += 1) {
    const s = perBand.get(bands[i].key)
    const acc = s && s.asked ? s.correct / s.asked : 0
    if (acc >= threshold) frontierIndex = i
    else break
  }
  const knownVocabIds = new Set()
  for (let i = 0; i <= frontierIndex; i += 1) {
    for (const v of bands[i].vocab) knownVocabIds.add(v.id)
  }
  return { frontierIndex, knownVocabIds }
}

// Turn the estimated known deck into a reading percentage over a fixed reference
// corpus, using the app's canonical readability engine so the number means the
// same thing as the in-app "% known".
export function estimateReadingPercent(knownVocabIds, vocab, corpusSentences, language = 'chinese') {
  const vocabMap = {}
  for (const v of (vocab || [])) vocabMap[v.word] = v
  const cards = {}
  ;(knownVocabIds instanceof Set ? [...knownVocabIds] : (knownVocabIds || []))
    .forEach(id => { cards[id] = { state: 'review' } })
  const content = (corpusSentences || []).join('\n')
  const { knownPct } = calculateStoryReadability({ content, vocabMap, cards, language })
  return knownPct
}

// Human-facing level label from the frontier band.
export function levelLabelForFrontier(frontierIndex, bands) {
  if (frontierIndex < 0 || !bands.length) return 'Just starting'
  const band = bands[Math.min(frontierIndex, bands.length - 1)]
  return `around HSK ${band.level}`
}

// The level to pre-select at signup, from the frontier band.
export function startingLevelForFrontier(frontierIndex, bands) {
  if (frontierIndex < 0 || !bands.length) return 1
  return bands[Math.min(frontierIndex, bands.length - 1)].level
}
