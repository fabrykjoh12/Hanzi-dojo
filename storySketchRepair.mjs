// Constrained lexical repair for target sketches (FAB-9 A3.1, 2026-08-25).
//
// a3-final-3 died on beat 1 of a frozen, eligible plan:
//
//   a1  这个女人很累，她拿着一个大绿箱子。   non-vocabulary text: 绿
//   a2  这个女人提着大盒子，很累。          非-vocabulary: 提 · above level: 盒子
//
// Everything that sentence needed was in level — 绿色 is HSK 2, 箱子 HSK 3,
// 拿 HSK 2, 大 HSK 1 — and 拿着一个大箱子 was already written. Two things went
// wrong, and neither is the writer being stupid:
//
//   1. It wrote 绿 where the vocabulary entry is 绿色. A learner list contains
//      words, not characters, and a character taken out of one is not a word.
//   2. Told which single token was bad, it threw the sentence away and wrote a
//      new one — losing the words that were fine and importing two new
//      violations.
//
// So the retry stops being a rewrite. This module classifies what the first
// attempt got right, names exactly what was wrong, offers the canonical
// in-level words the invalid token is a piece of, and then checks the second
// attempt against the first: a repair may drop an incidental detail or swap an
// invalid expression for an approved one, and may not quietly become a
// different sentence.
//
// Code never writes the repaired sentence. It says what is wrong, what is
// available, and what a repair may not do.
//
// Pure: no network, no fs, no clock, no model.

import { analyzeStory } from './storyCorpusCalibration.mjs'

export const SKETCH_REPAIR_VERSION = 'fab9-sketch-repair@1'

const text = (v) => String(v == null ? '' : v).trim()

// Particles, pronouns, measure words and the other grammar a repair is allowed
// to adjust while replacing a word. These carry no story content: adding 的 to
// attach an adjective is not a new idea.
export const GRAMMAR = new Set([
  '的', '了', '着', '过', '是', '在', '有', '不', '没', '很', '也', '都', '就', '还', '和', '与',
  '把', '被', '给', '对', '从', '到', '个', '一个', '这', '那', '这个', '那个', '一', '两',
  '吗', '呢', '吧', '啊', '我', '你', '您', '他', '她', '它', '我们', '你们', '他们', '她们',
  '会', '能', '可以', '要', '想', '说', '来', '去', '上', '下', '里', '中', '们',
])

// Every in-level entry that this token is a strict piece of. The learner list
// is the only source: 绿 is not a word, 绿色 is, and the way to know that is
// that one contains the other and only one of them is an entry.
export function componentCandidates(token, vocabMap, level) {
  const t = text(token)
  if (!t) return []
  const out = []
  for (const word of Object.keys(vocabMap || {})) {
    const v = vocabMap[word]
    if (!v || !Number.isFinite(v.level) || v.level > level) continue
    if (word === t || !word.includes(t)) continue
    out.push({ word, level: v.level, meaning: v.meaning || null })
  }
  // Shortest and simplest first: the smallest complete word that contains the
  // piece is the one the writer most likely meant.
  return out.sort((a, b) => (a.word.length - b.word.length) || (a.level - b.level) || (a.word < b.word ? -1 : 1)).slice(0, 4)
}

// Content words, as the canonical engine segments them.
function contentWords(sketch, level, vocabMap) {
  const a = analyzeStory({ title: '', level, content: text(sketch) }, vocabMap)
  return [...a.counts.keys()].filter(w => !GRAMMAR.has(w))
}

// What the first attempt got right, what it got wrong, and what the language
// offers instead. `problems` are the deterministic checker's own words.
export function classifySketch(sketch, { word, blueprint = null, manifest, vocabMap, problems = [], candidates = [], intruders = [] } = {}) {
  const level = manifest.level
  const a = analyzeStory({ title: '', level, content: text(sketch) }, vocabMap)
  const cast = new Set((blueprint && blueprint.cast) || [])
  const targets = new Set((manifest.targets || []).map(t => t.word))

  // The tokens the checker actually refused: an unknown run, or an entry above
  // the level. Read off the same analysis the checker used, never re-judged.
  const above = [...a.counts.keys()].filter(w => !targets.has(w) && vocabMap[w] && vocabMap[w].level > level)
  const invalidTokens = [...new Set([...a.unknownRuns, ...above])]

  // A3.2 established that a beat may lose an incidental detail and still be
  // the same beat. The mechanical test of "incidental" here is whether the
  // sentence survives the deletion: if taking the token out leaves a sentence
  // that still teaches the target and still uses nothing else the reader
  // lacks, the detail was decoration. 绿 in "a large green box" goes; a verb
  // the sentence is built on does not, because removing it strands the rest.
  const omittable = (token) => {
    const without = text(sketch).split(token).join('')
    const b = analyzeStory({ title: '', level, content: without }, vocabMap)
    if ((b.counts.get(word) || 0) < 1) return false
    if (b.unknownRuns.length) return false
    return ![...b.counts.keys()].some(w => !targets.has(w) && vocabMap[w] && vocabMap[w].level > level)
  }

  // A person the plan does not have is invalid material too: the retry has to
  // be told to take them out, or it has nothing to repair.
  const castProblems = intruders.map(token => ({
    token,
    reason: 'this person is not in the story',
    candidates: [],
    omittable: omittable(token),
  }))

  const invalid = invalidTokens.map(token => ({
    token,
    reason: (problems.find(p => String(p).includes(token)) || (vocabMap[token] ? 'above the story level' : 'not a word in the vocabulary')),
    candidates: componentCandidates(token, vocabMap, level),
    omittable: omittable(token),
  }))

  const allInvalid = [...invalid, ...castProblems]
  const blocked = new Set(allInvalid.map(i => i.token))
  const valid = [...a.counts.keys()].filter(w => !blocked.has(w) && !GRAMMAR.has(w))
  return {
    sketch: text(sketch),
    target: word,
    hasTarget: (a.counts.get(word) || 0) > 0,
    castRefs: [...a.counts.keys()].filter(w => cast.has(w)),
    valid,
    invalid: allInvalid,
    retrieval: candidates,
  }
}

// The brief the single retry gets. Rendered by the prompt builder; assembled
// here so it can be tested without a model.
export function repairBrief(classified) {
  return {
    original: classified.sketch,
    keep: classified.valid,
    cast: classified.castRefs,
    target: classified.target,
    fix: classified.invalid.map(i => ({
      token: i.token,
      why: i.reason,
      use: i.candidates.map(c => c.word),
      mayOmit: i.omittable,
    })),
    alsoAvailable: (classified.retrieval || []).map(c => (typeof c === 'string' ? c : c.word)).filter(Boolean).slice(0, 12),
  }
}

// Attempt 2 against attempt 1. A repair removes invalid material, or swaps it
// for something approved, and adjusts the grammar that swap needs. Anything
// else — a new person, a new object, a new event, or discarding words that
// were already fine — is a rewrite, and a rewrite is what this exists to stop.
export function checkRepairDrift(before, after, { word, manifest, vocabMap, brief } = {}) {
  const level = manifest.level
  const problems = []
  const beforeWords = contentWords(before, level, vocabMap)
  const afterWords = contentWords(after, level, vocabMap)
  const invalidTokens = new Set((brief.fix || []).map(f => f.token))
  const approved = new Set([
    ...(brief.fix || []).flatMap(f => f.use || []),
    ...(brief.alsoAvailable || []),
  ])

  const lost = beforeWords.filter(w => !invalidTokens.has(w) && !afterWords.includes(w)
    && ![...invalidTokens].some(t => w.includes(t)))
  if (lost.length) problems.push('dropped words that were already fine: ' + lost.join('、'))

  const added = afterWords.filter(w => !beforeWords.includes(w) && w !== word)
  const unapproved = added.filter(w => !approved.has(w))
  if (unapproved.length) problems.push('introduced ' + unapproved.join('、') + ', which the repair did not offer')

  if (!String(after).includes(word)) problems.push('the sentence no longer uses ' + word)
  return { ok: problems.length === 0, problems, lost, added }
}
