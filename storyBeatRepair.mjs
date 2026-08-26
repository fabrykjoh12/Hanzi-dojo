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

// Whatever else a repair may adjust, it may not put a new living thing in the
// scene. People and animals are the ones that read as a different story rather
// than a different sentence, and they are the ones a line-level judge is least
// likely to catch.
const ANIMAL_GLOSS = /\b(dog|cat|bird|fish|horse|pig|chicken|duck|rabbit|mouse|rat|cow|sheep|goat|monkey|tiger|snake|insect|bee|puppy|kitten)\b/i

// Same exemption as the sketch cast gate: an indefinite reference names nobody.
const INDEFINITE_GLOSS = /\b(other people|others|other person|someone|somebody|anyone|anybody|everyone|everybody|no one|nobody|people in general|else)\b/i

function words(line, level, vocabMap) {
  const a = analyzeStory({ title: '', level, content: text(line) }, vocabMap)
  return { all: [...a.counts.keys()], unknown: a.unknownRuns, analysis: a }
}

// What the plan froze, and what only the writer added. A rejected word is
// DECORATIVE when nothing upstream asked for it: not a target, not in the
// approved anchors, not in an approved usage sketch. Those may simply go —
// hunting for a synonym of a detail the beat never needed is how a retry ends
// up rewriting the whole scene.
export function classifyBeat(lines, { beat, blueprint = null, manifest, vocabMap, sketches = [], failures = [], semanticOnly = false } = {}) {
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
  // Latin is invalid material too and the engine does not segment it, so
  // without this a beat rejected for 她站在那里， looking around。 had nothing
  // recorded as broken and no room to repair it.
  const latin = clean.flatMap(l => l.match(/[A-Za-z]+/g) || [])
  const badTokens = [...new Set([...perLine.flatMap(l => l.unknown), ...perLine.flatMap(l => l.above), ...latin])]
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
    // When the JUDGE is what rejected the beat, its words were all legal and
    // some of them were the problem — 那个男人觉得很难 is in-level nonsense. There
    // is nothing to "keep" in that case, and insisting on it would forbid the
    // only repair available.
    keepLines: semanticOnly ? [] : perLine.filter(l => !l.unknown.length && !l.above.length).map(l => l.line),
    semanticOnly,
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
    semanticOnly: Boolean(classified.semanticOnly),
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

  // A semantic rejection means the prose itself was wrong, so preserving it is
  // not a virtue: a4-final-10's retry fixed 那个男人觉得很难 and was refused for
  // dropping 觉得 and 难. What still holds either way is below — no living
  // thing that was not there, and the beat gate's own rules.
  const lost = brief.semanticOnly ? [] : beforeWords.filter(w => !bad.has(w) && !afterWords.includes(w))
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
  // How much may be added: roughly one word per piece of broken material, plus
  // one, and never while something correct was lost.
  const room = brief.semanticOnly ? Number.MAX_SAFE_INTEGER : Math.max(3, bad.size + 1)
  const mayAdd = !lost.length && added.length <= room
  // And WHAT may be added. Deleting a broken phrase leaves a hole the writer
  // still has to fill, and it will need ordinary words to fill it — 着急 for a
  // scrapped English clause, 站 for a beat whose text says "stands". Those are
  // allowed, in level and within the room above. A LIVING thing is not: a dog
  // that runs off is a different story, not a different sentence.
  //
  // Be honest about the limit here: a brand-new inanimate object inside the
  // room is bounded but not provably excluded by this function — the frozen
  // brief and the existing per-beat semantic judge carry that, and this code
  // does not claim otherwise.
  const animate = (w) => {
    const meaning = String((vocabMap[w] && vocabMap[w].meaning) || '')
    if (INDEFINITE_GLOSS.test(meaning)) return false
    return PERSON_GLOSS.test(meaning) || ANIMAL_GLOSS.test(meaning)
  }
  const unapproved = added.filter(w => !approved.has(w) && !describedByBeat(w)
    && !(mayAdd && inLevel(w) && !animate(w)))

  // A new person is never a repair.
  const castNames = new Set(brief.frozen.cast || [])
  const newPeople = added.filter(w => !castNames.has(w) && !describedByBeat(w) && animate(w))

  if (lost.length) problems.push('dropped material that was already fine: ' + lost.join('、'))
  if (newPeople.length) problems.push('brought in ' + newPeople.join('、') + ', who is not in this beat')
  if (unapproved.length) problems.push('added ' + unapproved.join('、') + ', which is not part of the repair')
  return { ok: problems.length === 0, problems, lost, added }
}
