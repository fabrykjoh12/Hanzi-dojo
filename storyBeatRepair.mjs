// Constrained repair for a rejected beat (FAB-9 A3, 2026-08-25).
//
// a3-final-7 cleared the lexical scaffold and lost beat 1 twice:
//
//   a1  …小红擦了擦额头上的汗。          unknown_words: 额头、汗 (2, max 1)
//   a2  …他走过去问：小红，你需要帮忙吗？  unknown_speaker: "他走过去问"
//
// Neither attempt was a bad story. The first decorated the scene with a detail
// the plan never asked for and paid two unknown words for it; the second was
// clean prose in the wrong dialogue FORM. And the retry, told only that a
// check had failed, wrote a fresh beat instead of mending the one it had.
//
// Same principle as the target-sketch repair: the second attempt gets its own
// beat back, the exact failures, the story facts it may not touch, and an
// explicit statement of what it is allowed to delete. What the plan froze —
// the event, its cause, the place, the transition, the target words — is
// preserved; what only the writer invented is expendable.
//
// Pure: no network, no fs, no clock, no model.

import { analyzeStory } from './storyCorpusCalibration.mjs'
import { splitSpeaker } from './src/storyReading.js'
import { stem } from './storyLexicalRetrieval.mjs'
import { GRAMMAR } from './storySketchRepair.mjs'

export const BEAT_REPAIR_VERSION = 'fab9-beat-repair@1'

const text = (v) => String(v == null ? '' : v).trim()

// Glosses that name a human being — the same category test the sketch cast
// gate uses, applied to a whole beat.
const PERSON_GLOSS = /\b(person|people|man|men|woman|women|boy|girl|child|children|kid|baby|father|dad|mother|mom|parent|brother|sister|son|daughter|grandfather|grandmother|uncle|aunt|cousin|husband|wife|friend|neighbour|neighbor|teacher|student|classmate|doctor|nurse|driver|worker|boss|colleague|guest|customer|waiter|shopkeeper|stranger|owner|manager)\b/i

function words(line, level, vocabMap) {
  const a = analyzeStory({ title: '', level, content: text(line) }, vocabMap)
  return { all: [...a.counts.keys()], unknown: a.unknownRuns, analysis: a }
}

// What the plan froze, and what only the writer added. A rejected word is
// DECORATIVE when nothing upstream asked for it: not a target, not in the
// approved anchors, not in an approved usage sketch. Those may simply go —
// hunting for a synonym of a detail the beat never needed is how a retry ends
// up rewriting the whole scene.
export function classifyBeat(lines, { beat, blueprint = null, manifest, vocabMap, sketches = [], failures = [] } = {}) {
  const level = manifest.level
  const clean = (lines || []).map(text).filter(Boolean)
  const anchors = (beat && beat.chineseLexicalAnchors) || []
  const required = new Set([
    ...((beat && beat.targets) || []),
    ...anchors,
    ...sketches.flatMap(s => [s.word, ...(s.usageSketch ? words(s.usageSketch, level, vocabMap).all : [])]),
  ])
  const targets = new Set((manifest.targets || []).map(t => t.word))

  const perLine = clean.map((line, i) => {
    const w = words(line, level, vocabMap)
    const above = w.all.filter(x => !targets.has(x) && vocabMap[x] && vocabMap[x].level > level)
    const { speaker } = splitSpeaker(line)
    return { index: i + 1, line, unknown: w.unknown, above, speaker: speaker || null }
  })

  // Invalid material is both kinds: a word the dictionary does not have, and
  // one the reader does not have yet. Counting only the first left 擦 (HSK 5)
  // unremovable — not bad enough to delete, not fine enough to keep.
  const badTokens = [...new Set([...perLine.flatMap(l => l.unknown), ...perLine.flatMap(l => l.above)])]
  const decorative = badTokens.filter(t => !required.has(t))
  return {
    lines: clean,
    frozen: {
      what: (beat && beat.what) || '',
      because: (beat && beat.because) || '',
      where: (beat && beat.where) || '',
      arrivedHow: (beat && beat.arrivedHow) || '',
      targets: (beat && beat.targets) || [],
      cast: (blueprint && blueprint.cast) || [],
    },
    anchors,
    sketches: sketches.map(s => ({ word: s.word, usageSketch: s.usageSketch || null })),
    perLine,
    badTokens,
    decorative,
    keepLines: perLine.filter(l => !l.unknown.length && !l.above.length).map(l => l.line),
    failures,
  }
}

export function beatRepairBrief(classified) {
  return {
    original: classified.lines,
    failures: classified.failures,
    frozen: classified.frozen,
    anchors: classified.anchors,
    sketches: classified.sketches,
    keep: classified.keepLines,
    remove: classified.decorative,
    fix: classified.badTokens.filter(t => !classified.decorative.includes(t)),
  }
}

// Attempt 2 against attempt 1. A repair deletes decoration, swaps invalid
// wording for approved wording, fixes dialogue form, and adjusts the grammar
// those need. It does not become a different scene.
//
// What is checked here is what CAN be checked: people, lost material and
// unapproved additions. The frozen event, its cause, the place and the
// transition are carried in the brief and judged by the existing semantic
// gate — this function does not pretend to measure them.
export function checkBeatDrift(before, after, { manifest, vocabMap, brief } = {}) {
  const level = manifest.level
  const problems = []
  const content = (ls) => {
    const joined = (ls || []).map(text).join('\n')
    return words(joined, level, vocabMap).all.filter(w => !GRAMMAR.has(w))
  }
  const beforeWords = content(before)
  const afterWords = content(after)
  const bad = new Set([...(brief.remove || []), ...(brief.fix || [])])
  const approved = new Set([
    ...(brief.anchors || []),
    ...(brief.frozen.targets || []),
    ...(brief.sketches || []).flatMap(s => (s.usageSketch ? words(s.usageSketch, level, vocabMap).all : [])),
  ])

  const lost = beforeWords.filter(w => !bad.has(w) && !afterWords.includes(w))
  const added = afterWords.filter(w => !beforeWords.includes(w))
  // Deleting decoration leaves a hole the writer still has to fill, so a
  // repair may add words — but only ones the story already has: approved
  // scaffold material, or something the FROZEN beat itself describes. 站 is
  // fair game in a beat whose text says "stands"; a dog that runs off is a new
  // event, and no budget makes it a repair.
  const beatWords = new Set((String(brief.frozen.what || '') + ' ' + String(brief.frozen.because || ''))
    .toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem))
  const describedByBeat = (w) => String((vocabMap[w] && vocabMap[w].meaning) || '').toLowerCase()
    .split(/[^a-z]+/).filter(t => t.length > 2).some(t => beatWords.has(stem(t)))
  // A substitution needs somewhere to land, so when there IS invalid material
  // that the story genuinely needs said another way, a couple of in-level
  // words are allowed at that site.
  const inLevel = (w) => Boolean(vocabMap[w]) && Number.isFinite(vocabMap[w].level) && vocabMap[w].level <= level
  // Two kinds of rejection need two kinds of latitude. A LEXICAL problem means
  // specific words were wrong, so the repair stays grounded in what the story
  // already has. A STRUCTURAL one — a missing target, the wrong line count,
  // narration in the speaker slot — leaves nothing to delete and still
  // requires those lines to be said again, so ordinary in-level words are
  // allowed there. Either way nothing correct may be lost, and neither buys a
  // new person.
  const structural = bad.size === 0
  const room = structural ? Math.max(3, (brief.original || []).length) : (brief.fix || []).length + 1
  const mayAdd = (structural || (brief.fix || []).length > 0) && !lost.length && added.length <= room
  const unapproved = added.filter(w => !approved.has(w) && !describedByBeat(w) && !(mayAdd && inLevel(w)))

  // A new person is never a repair.
  const castNames = new Set(brief.frozen.cast || [])
  const newPeople = added.filter(w => !castNames.has(w)
    && vocabMap[w] && PERSON_GLOSS.test(String(vocabMap[w].meaning || '')))

  if (lost.length) problems.push('dropped material that was already fine: ' + lost.join('、'))
  if (newPeople.length) problems.push('brought in ' + newPeople.join('、') + ', who is not in this beat')
  if (unapproved.length) problems.push('added ' + unapproved.join('、') + ', which is not part of the repair')
  return { ok: problems.length === 0, problems, lost, added }
}
