// Story corpus calibration — measures what the EXISTING published corpus
// actually looks like through the canonical matcher, so the targeted-generation
// manifests (FAB-9) get defaults grounded in real, working stories instead of
// guessed numbers. FAB-5 showed HSK 1 is the healthiest slice of the corpus;
// its distributions are the best available picture of "a story that works".
//
// Per story, per level, this measures:
//   - length (lines, CJK characters)
//   - distinct canonical vocabulary and total occurrences
//   - same-level vocabulary ("teaching payload"): distinct words at exactly the
//     story's level, and how often each occurs — the number a manifest's
//     targets-per-story and occurrence bounds must be compatible with
//   - out-of-level vocabulary: distinct words above the story's level, and
//     their share of CJK characters
//   - unknown CJK: text the canonical engine matches to nothing (not vocab,
//     not a name) — distinct runs and character share
//   - repetition concentration: top-word occurrence share, repeated lines,
//     repeated character-trigram share
// plus, across the corpus, the pairwise content-similarity distribution that
// the near-duplicate thresholds (FAB-10) are calibrated against.
//
// Everything is computed with src/storyReading.js — calculateStoryReadability
// for vocabulary counts and segmentLine for unknown runs — never a second
// tokenizer, so these numbers agree with the reader, the FAB-5 audit and the
// FAB-10 validator by construction.
//
// Pure: no Supabase, no network, no clock. calibrate-story-defaults.mjs is the
// fetch-and-print wrapper.

import {
  calculateStoryReadability,
  segmentLine,
  splitSpeaker,
  storyNamesFor,
  buildVocabMatcher,
  particlesFor,
  segmenterFor,
  isWordlikeToken,
} from './src/storyReading.js'

export function isCjkChar(ch) {
  const c = ch.codePointAt(0)
  return c >= 0x3400 && c <= 0x9FFF
}

export function cjkLength(text) {
  let n = 0
  for (const ch of text) if (isCjkChar(ch)) n += 1
  return n
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function stats(values) {
  const v = [...values].sort((a, b) => a - b)
  const r = (x) => Math.round(x * 100) / 100
  return {
    n: v.length,
    p25: r(percentile(v, 0.25)),
    median: r(percentile(v, 0.5)),
    p75: r(percentile(v, 0.75)),
    p90: r(percentile(v, 0.9)),
    max: v.length ? v[v.length - 1] : 0,
  }
}

// One story through the canonical engine. `vocabMap` is the FULL word-keyed
// pool (all levels), the same map the audit uses — out-of-level words must
// resolve to their real level, not fall through as "unknown".
export function analyzeStory(story, vocabMap) {
  const content = String(story.content || '')
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

  const { counts, storyWords } = calculateStoryReadability({
    content, vocabMap, cards: {}, language: 'chinese',
  })

  // Unknown runs come from the SAME pass the reader renders with: segmentLine
  // tokens that carry no vocab and no name payload and are CJK word-like.
  const names = storyNamesFor(content, vocabMap, 'chinese')
  const matcher = buildVocabMatcher(vocabMap, 'chinese')
  const particles = particlesFor('chinese')
  const segmenter = segmenterFor('chinese')
  const unknown = new Map()          // run -> occurrences
  let cjkChars = 0
  let unknownChars = 0
  let outChars = 0
  const level = story.level
  for (const raw of lines) {
    const { text } = splitSpeaker(raw)
    for (const tok of segmentLine(text, matcher, names, particles, segmenter)) {
      const cjk = cjkLength(tok.text)
      if (cjk === 0) continue
      if (tok.name) continue                       // proper names are not vocabulary
      cjkChars += cjk
      if (tok.vocab) {
        const wl = tok.vocab.level
        if (Number.isFinite(wl) && Number.isFinite(level) && wl > level) outChars += cjk
        continue
      }
      if (!isWordlikeToken(tok.text)) continue
      unknown.set(tok.text, (unknown.get(tok.text) || 0) + 1)
      unknownChars += cjk
    }
  }

  const sameLevelOcc = []            // occurrence count per distinct same-level word
  let outOfLevelDistinct = 0
  let occTotal = 0
  let topOcc = 0
  for (const word of storyWords) {
    const n = counts.get(word) || 0
    occTotal += n
    if (n > topOcc) topOcc = n
    const wl = vocabMap[word] && vocabMap[word].level
    if (wl === level) sameLevelOcc.push(n)
    else if (Number.isFinite(wl) && Number.isFinite(level) && wl > level) outOfLevelDistinct += 1
  }

  // Repeated non-trivial lines (identical after speaker strip) and repeated
  // character trigrams — the raw signals behind the repetition heuristics.
  const seenLines = new Map()
  let repeatedLines = 0
  for (const raw of lines) {
    const t = splitSpeaker(raw).text
    if (cjkLength(t) < 4) continue
    seenLines.set(t, (seenLines.get(t) || 0) + 1)
  }
  for (const n of seenLines.values()) if (n > 1) repeatedLines += n - 1

  const grams = trigramCounts(content)
  let gramTotal = 0
  let gramRepeated = 0
  for (const n of grams.values()) {
    gramTotal += n
    if (n > 1) gramRepeated += n - 1
  }

  return {
    title: story.title,
    level,
    presentation: story.presentation || 'paced',
    lines: lines.length,
    cjkChars,
    distinctVocab: storyWords.length,
    occurrencesTotal: occTotal,
    sameLevelDistinct: sameLevelOcc.length,
    sameLevelOccurrences: sameLevelOcc,
    outOfLevelDistinct,
    outOfLevelCharShare: cjkChars ? outChars / cjkChars : 0,
    unknownDistinct: unknown.size,
    unknownCharShare: cjkChars ? unknownChars / cjkChars : 0,
    unknownRuns: [...unknown.keys()],
    topWordShare: occTotal ? topOcc / occTotal : 0,
    repeatedLines,
    repeatedTrigramShare: gramTotal ? gramRepeated / gramTotal : 0,
  }
}

// Character trigrams over the story's CJK text (punctuation, speakers and
// whitespace stripped) — the unit both the repetition heuristic and the
// near-duplicate similarity are defined over.
export function trigramCounts(content) {
  const chars = []
  for (const raw of String(content || '').split('\n')) {
    const { text } = splitSpeaker(raw.trim())
    for (const ch of text) if (isCjkChar(ch)) chars.push(ch)
  }
  const grams = new Map()
  for (let i = 0; i + 3 <= chars.length; i += 1) {
    const g = chars[i] + chars[i + 1] + chars[i + 2]
    grams.set(g, (grams.get(g) || 0) + 1)
  }
  return grams
}

// Similarity between two stories' contents over character-trigram SETS:
// jaccard (symmetric) and containment (how much of the smaller story is inside
// the bigger one — the signal for "essentially a copy of a shorter story").
export function contentSimilarity(a, b) {
  const ga = new Set(trigramCounts(a).keys())
  const gb = new Set(trigramCounts(b).keys())
  if (ga.size === 0 || gb.size === 0) return { jaccard: 0, containment: 0 }
  let inter = 0
  const [small, big] = ga.size <= gb.size ? [ga, gb] : [gb, ga]
  for (const g of small) if (big.has(g)) inter += 1
  return {
    jaccard: inter / (ga.size + gb.size - inter),
    containment: inter / small.size,
  }
}

// Pairwise similarity distribution across a story list. O(n²) on trigram sets —
// fine at corpus scale (204 stories ≈ 20k pairs).
export function similarityDistribution(stories) {
  const sets = stories.map(s => new Set(trigramCounts(s.content).keys()))
  const jaccards = []
  const top = []
  for (let i = 0; i < stories.length; i += 1) {
    for (let j = i + 1; j < stories.length; j += 1) {
      const ga = sets[i], gb = sets[j]
      if (ga.size === 0 || gb.size === 0) continue
      let inter = 0
      const [small, big] = ga.size <= gb.size ? [ga, gb] : [gb, ga]
      for (const g of small) if (big.has(g)) inter += 1
      const jac = inter / (ga.size + gb.size - inter)
      const cont = inter / small.size
      jaccards.push(jac)
      top.push({
        a: 'L' + stories[i].level + ' ' + stories[i].title,
        b: 'L' + stories[j].level + ' ' + stories[j].title,
        jaccard: Math.round(jac * 1000) / 1000,
        containment: Math.round(cont * 1000) / 1000,
      })
    }
  }
  top.sort((x, y) => y.jaccard - x.jaccard)
  const sorted = [...jaccards].sort((a, b) => a - b)
  const r = (x) => Math.round(x * 1000) / 1000
  return {
    pairs: jaccards.length,
    p50: r(percentile(sorted, 0.5)),
    p90: r(percentile(sorted, 0.9)),
    p99: r(percentile(sorted, 0.99)),
    max: sorted.length ? r(sorted[sorted.length - 1]) : 0,
    topPairs: top.slice(0, 12),
  }
}

// The full calibration: per-level distributions over the paced/chat corpus
// (scene stories are six-line emoji vignettes and manhua stories are panel
// scripts — both real formats, but not the shape manifests will generate, so
// they are counted but excluded from the distributions the defaults come from).
export function calibrateCorpus({ stories, vocab }) {
  const vocabMap = {}
  for (const v of vocab || []) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v

  const analyzed = (stories || []).map(s => analyzeStory(s, vocabMap))
  const byLevel = []
  const levels = [...new Set(analyzed.map(a => a.level))].sort((a, b) => a - b)
  for (const level of levels) {
    const all = analyzed.filter(a => a.level === level)
    const group = all.filter(a => a.presentation === 'paced' || a.presentation === 'chat')
    const perWordOcc = group.flatMap(a => a.sameLevelOccurrences)
    byLevel.push({
      level,
      stories: all.length,
      calibratedOn: group.length,
      excluded: all.length - group.length,
      lines: stats(group.map(a => a.lines)),
      cjkChars: stats(group.map(a => a.cjkChars)),
      distinctVocab: stats(group.map(a => a.distinctVocab)),
      occurrencesTotal: stats(group.map(a => a.occurrencesTotal)),
      sameLevelDistinct: stats(group.map(a => a.sameLevelDistinct)),
      sameLevelWordOccurrences: stats(perWordOcc),
      outOfLevelDistinct: stats(group.map(a => a.outOfLevelDistinct)),
      outOfLevelCharShare: stats(group.map(a => a.outOfLevelCharShare)),
      unknownDistinct: stats(group.map(a => a.unknownDistinct)),
      unknownCharShare: stats(group.map(a => a.unknownCharShare)),
      topWordShare: stats(group.map(a => a.topWordShare)),
      repeatedLines: stats(group.map(a => a.repeatedLines)),
      repeatedTrigramShare: stats(group.map(a => a.repeatedTrigramShare)),
    })
  }
  return {
    byLevel,
    similarity: similarityDistribution((stories || []).filter(s => s.presentation !== 'manhua')),
    perStory: analyzed,
  }
}

// Provisional per-level manifest defaults, derived from the calibration.
//
// PROVISIONAL until the first real pilot (FAB-9): the formulas below turn the
// corpus's distributions into bounds, but the numbers have not yet been tested
// against real generated candidates. Revisit after the pilot.
//
// Reasoning per knob:
//   targetsPerStory   ~60% of the same-level payload a working story carries —
//                     targets are the subset the writer MUST include; the rest
//                     of the payload stays free for natural writing. The 2026-08
//                     calibration showed the corpus's HSK 3-6 stories carry
//                     almost NO same-level vocabulary (medians 5.5 / 2 / 1 / 0)
//                     — that is exactly the disease FAB-5 diagnosed, so those
//                     medians must not become the target. Levels whose measured
//                     payload is below REFERENCE_PAYLOAD use the reference
//                     instead: 14 is HSK 2's median (the healthiest level whose
//                     pool shape resembles 3-6), and the retired serial
//                     generator wove 10-22 focus words per chapter at these
//                     levels, so ~8 required targets is well inside proven
//                     range. Clamped to 4..12.
//   occurrence min 2  a target seen once is barely reinforced; every level's
//                     p75 per-word occurrence is >= 2.
//   occurrence max    p90 of observed per-word same-level occurrences,
//                     clamped to 4..8 — above what healthy stories do is spam.
//   maxOutOfLevel*    p75 of observed — generated stories should sit inside
//                     what the corpus already tolerates, not at its worst.
//   maxUnknown*       p75 of observed distinct unknown runs / char share.
//   lines             p25..p75 of the level's real stories, min-width 8.
//   nearDuplicate     thresholds sit against the measured pairwise similarity:
//                     the most similar legitimate pair in the corpus is 0.338
//                     jaccard / 0.649 containment (two same-format chat
//                     stories), p99 is ~0.04. WARN just below the legitimate
//                     maximum (surfacing look-alikes for review), FAIL well
//                     above anything legitimate (essentially copied content).
export const REFERENCE_PAYLOAD = 14

export function proposeDefaults(calibration) {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
  const out = {
    nearDuplicate: {
      provisional: true,
      warn: { jaccard: 0.3, containment: 0.6 },
      fail: { jaccard: 0.55, containment: 0.85 },
      evidence: {
        corpusP99: calibration.similarity.p99,
        corpusMax: calibration.similarity.max,
      },
    },
    byLevel: {},
  }
  for (const l of calibration.byLevel) {
    if (!l.calibratedOn) continue
    const minLines = Math.max(6, Math.round(l.lines.p25))
    const maxLines = Math.max(minLines + 8, Math.round(l.lines.p75))
    const payload = Math.max(l.sameLevelDistinct.median, REFERENCE_PAYLOAD)
    out.byLevel[l.level] = {
      provisional: true,
      targetsPerStory: clamp(Math.round(payload * 0.6), 4, 12),
      occurrences: {
        min: 2,
        max: clamp(Math.round(l.sameLevelWordOccurrences.p90), 4, 8),
      },
      maxOutOfLevelDistinct: Math.max(2, Math.round(l.outOfLevelDistinct.p75)),
      maxOutOfLevelCharShare: Math.max(0.02, Math.round(l.outOfLevelCharShare.p75 * 1000) / 1000),
      maxUnknownDistinct: Math.max(2, Math.round(l.unknownDistinct.p75)),
      maxUnknownCharShare: Math.max(0.02, Math.round(l.unknownCharShare.p75 * 1000) / 1000),
      lines: [minLines, maxLines],
      maxRepeatedTrigramShare: Math.max(0.05, Math.round((l.repeatedTrigramShare.p90 * 1.5) * 1000) / 1000),
    }
  }
  return out
}
