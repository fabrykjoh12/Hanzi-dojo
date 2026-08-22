// Beat-by-beat realization (FAB-9, 2026-08-22).
//
// blueprint-2 asked Qwen for all 28 lines at once against an approved plan.
// The plots held (chronology 8-10, plausibility 7-9) and the prose did not:
// integration 2/10 in all three, because a writer holding a whole story in
// one call states the plan rather than performing it — 这是今天忙碌生活的结束
// is the plan's own words for 结束, turned into a sentence nobody says.
//
// So the story is written one beat at a time. Each beat is a small, closed
// task — this cast, this place, this event, these five lines, this word said
// by this person for this reason — and it must pass BOTH gates before the
// next beat is written:
//
//   deterministic: exact line count, no Latin, allowed speakers only, the
//                  assigned targets present, and LOCAL vocabulary limits
//                  stricter than the whole-story review band
//   semantic:      naturalness, dialogue, continuity from the accepted beat
//                  before it, whether the event actually happened, and
//                  whether the target was used or merely inserted
//
// A failed beat is retried once with its exact failures. A second failure
// ends the story: BEAT_REALIZATION_FAILED. Earlier accepted beats are never
// regenerated, and no editor is asked to fix anything afterwards.
//
// Pure: providers injected, no network/fs/clock here.

import { analyzeStory } from './storyCorpusCalibration.mjs'
import { splitSpeaker } from './src/storyReading.js'
import { hasLatin } from './storyBlueprint.mjs'

export const BEAT_VERSION = 'fab9-beats@1'

// Local limits, deliberately tighter than the whole-story gates: a beat is a
// handful of lines, so one unknown word there is already a higher density
// than the finished story is allowed. Assembling a beat we know is bad and
// hoping repair saves it is exactly the waste this pipeline keeps finding.
export const BEAT_LIMITS = {
  unknownDistinct: 1,
  outOfLevelCharShare: 0.08,
  maxTargetOccurrences: 3,       // per target, inside one beat
}

export const BEAT_QUALITY = {
  overall: 6,
  natural: 6,
  continuity: 5,
  integration: 5,
}

export const BEAT_DIMENSIONS = [
  ['natural', 'Natural, idiomatic Chinese — and dialogue that sounds like something a person would actually say'],
  ['continuity', 'Follows on from the previous lines without a jump, a repeat, or a contradiction'],
  ['event', 'The event this beat is supposed to deliver actually happens here'],
  ['integration', 'The required word is USED to communicate something, not inserted to be counted'],
]

export function acceptableBeat(score, thresholds = BEAT_QUALITY) {
  if (!score) return false
  if (score.stuffed === true) return false
  return (score.overall || 0) >= thresholds.overall
    && (score.natural || 0) >= thresholds.natural
    && (score.continuity || 0) >= thresholds.continuity
    && (score.integration || 0) >= thresholds.integration
}

// ── The deterministic half ──────────────────────────────────────────────────
export function validateBeat(lines, { beat, manifest, vocabMap, expectedLines, cast = [], limits = BEAT_LIMITS } = {}) {
  const failures = []
  const fail = (code, message) => failures.push({ code, message })
  const clean = (lines || []).map(l => String(l == null ? '' : l).trim()).filter(Boolean)

  if (clean.length !== expectedLines) {
    fail('line_count', clean.length + ' lines, this beat is exactly ' + expectedLines)
    return { ok: false, failures, metrics: {} }
  }
  for (const l of clean) if (hasLatin(l)) fail('latin_text', 'a story line contains Latin text: ' + l)

  const allowed = new Set(cast.length ? cast : [...(manifest.speakers || []), ...(manifest.extraNames || [])])
  for (const l of clean) {
    const { speaker } = splitSpeaker(l)
    if (!speaker) continue
    // 小明说：“…” is not the house dialogue format, and blueprint-2's writer
    // slipped into it the moment it was writing whole scenes. It parses as a
    // speaker called 小明说 — worth its own message, since the fix is to drop
    // one character rather than to change who is talking.
    const narrated = speaker.match(/^(.+?)(说|问|回答|喊|叫)$/)
    if (narrated && allowed.has(narrated[1])) {
      fail('narrated_speaker', 'dialogue is a bare name then ：— write "' + narrated[1] + '：", not "' + speaker + '："')
    } else if (!allowed.has(speaker)) {
      fail('unknown_speaker', 'speaker "' + speaker + '" is not in this beat\'s cast')
    }
  }

  const a = analyzeStory({ title: '', level: manifest.level, content: clean.join('\n') }, vocabMap)
  const targets = new Set(manifest.targets.map(t => t.word))
  for (const word of ((beat && beat.targets) || [])) {
    const n = a.counts.get(word) || 0
    if (n < 1) fail('target_missing', 'this beat has to use ' + word)
    else if (n > limits.maxTargetOccurrences) fail('target_stuffed', word + ' appears ' + n + '× in ' + expectedLines + ' lines')
  }
  if (a.unknownDistinct > limits.unknownDistinct) {
    fail('unknown_words', a.unknownDistinct + ' non-vocabulary words (max ' + limits.unknownDistinct + ' here): ' + a.unknownRuns.join('、'))
  }
  if (a.outOfLevelCharShare > limits.outOfLevelCharShare) {
    fail('out_of_level', (a.outOfLevelCharShare * 100).toFixed(1) + '% above level (max ' + (limits.outOfLevelCharShare * 100).toFixed(0) + '% in a single beat)')
  }

  const above = [...a.counts.keys()].filter(w => !targets.has(w) && vocabMap[w] && vocabMap[w].level > manifest.level)
  return {
    ok: failures.length === 0,
    failures,
    metrics: {
      lines: clean.length,
      cjkChars: a.cjkChars,
      outOfLevelCharShare: Math.round(a.outOfLevelCharShare * 1000) / 1000,
      outOfLevelWords: above,
      unknownDistinct: a.unknownDistinct,
      unknownRuns: a.unknownRuns,
      targetCounts: Object.fromEntries(((beat && beat.targets) || []).map(w => [w, a.counts.get(w) || 0])),
    },
  }
}

// ── Sequential realization ──────────────────────────────────────────────────
// One beat at a time, each gated before the next is written. Returns the
// assembled lines when every beat was accepted, or the failure that stopped
// it — never a partial story dressed up as a whole one.
export async function realizeByBeat({
  blueprint,
  allocation,
  manifest,
  vocabMap,
  meanings = {},
  writer,
  judge = null,
  buildBeatPrompt,
  parseBeat,
  buildBeatJudgePrompt,
  parseBeatJudgment,
  thresholds = BEAT_QUALITY,
  limits = BEAT_LIMITS,
  attemptsPerBeat = 2,
  maxTokens = 1500,
} = {}) {
  const accepted = []          // { beat, lines }
  const attempts = []
  const cast = blueprint.cast || []
  const targetPlan = blueprint.targetPlan || []

  for (let i = 0; i < blueprint.beats.length; i += 1) {
    const beat = blueprint.beats[i]
    const alloc = allocation[i]
    const previousLines = accepted.length ? accepted[accepted.length - 1].lines : []
    const tail = previousLines.slice(-2)
    const sketches = targetPlan.filter(t => Number(t.beat) === i + 1)
    let feedback = null
    let taken = null

    for (let a = 1; a <= attemptsPerBeat && !taken; a += 1) {
      let lines = null
      let error = null
      try {
        const textOut = await writer.send({
          kind: 'beat',
          prompt: buildBeatPrompt({
            manifest, blueprint, beat, alloc, meanings, cast, sketches, tail,
            next: blueprint.beats[i + 1] || null,
            feedback,
          }),
          maxTokens,
        })
        lines = parseBeat(textOut, alloc.lines)
      } catch (err) { error = String((err && err.message) || err).slice(0, 160) }

      const gate = lines
        ? validateBeat(lines, { beat, manifest, vocabMap, expectedLines: alloc.lines, cast, limits })
        : { ok: false, failures: [{ code: error ? 'provider_error' : 'unparseable', message: error || 'no usable ' + alloc.lines + '-line JSON' }], metrics: {} }

      let score = null
      if (gate.ok && judge && buildBeatJudgePrompt && parseBeatJudgment) {
        try {
          const judged = await judge.send({
            kind: 'beat-judge',
            prompt: buildBeatJudgePrompt({ manifest, beat, lines, tail, sketches, dimensions: BEAT_DIMENSIONS }),
            maxTokens: 900,
          })
          score = parseBeatJudgment(judged, BEAT_DIMENSIONS)
        } catch { score = null }
      }
      const semanticOk = !gate.ok ? false : (judge ? acceptableBeat(score, thresholds) : true)

      attempts.push({
        beat: i + 1,
        attempt: a,
        lines,
        requested: alloc.lines,
        deterministic: { ok: gate.ok, failures: gate.failures, metrics: gate.metrics },
        score,
        accepted: gate.ok && semanticOk,
      })

      if (gate.ok && semanticOk) { taken = lines; break }
      feedback = [
        ...gate.failures.map(f => f.message),
        ...(gate.ok && !semanticOk
          ? [score
            ? 'the writing was judged: ' + BEAT_DIMENSIONS.map(([k]) => k + ' ' + score[k]).join(', ') + ' (overall ' + score.overall + ')'
              + (score.reason ? ' — ' + score.reason : '')
            : 'the writing could not be judged']
          : []),
      ]
    }

    if (!taken) {
      return {
        ok: false,
        code: 'BEAT_REALIZATION_FAILED',
        failedBeat: i + 1,
        detail: 'beat ' + (i + 1) + ' could not be written acceptably in ' + attemptsPerBeat + ' attempts',
        accepted,
        attempts,
      }
    }
    accepted.push({ beat: i + 1, lines: taken })
  }

  const lines = accepted.flatMap(b => b.lines)
  return { ok: true, code: null, lines, accepted, attempts }
}
