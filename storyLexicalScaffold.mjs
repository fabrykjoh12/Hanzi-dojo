// Lexical scaffold generation (FAB-9 A3, 2026-08-23).
//
// blueprint-resume-1 is the reason this stage exists. Given a structurally
// perfect plan and four named lexical violations, the planner reproduced the
// story exactly — problem, cast, six beats, chronology, causal chain, target
// placement, all preserved — and then wrote 重 (HSK 4) into the title and into
// a fresh sketch, and kept 深. Both words had just been named to it. One call
// cannot hold a story and a vocabulary at the same time.
//
// So the shape is finished and LOCKED before any Chinese exists, and the
// Chinese is asked for in the smallest pieces the pipeline can use:
//
//   title              → validate → one retry
//   per beat:
//     each target      → one sentence each → validate → one retry
//     the beat's words → validate → one retry
//
// Nothing is generated for beat N+1 until beat N's scaffold is valid, and no
// failure is ever repaired by relaxing a rule: a target that cannot be written
// twice is TARGET_SCAFFOLD_FAILED, a beat whose words cannot be written twice
// is BEAT_LEXICAL_SCAFFOLD_FAILED, and the story stops.
//
// The lexical stage may not touch the story. It writes exactly three kinds of
// thing — the Chinese title, each beat's anchors, each target's usage sketch —
// and applyScaffold rebuilds the plan from the ORIGINAL shape, so a lexical
// call that tries to move a beat or rename a character simply has no way to.
//
// Pure: providers injected, no network/fs/clock.

import { checkAnchor, checkUsageSketch, hasLatin } from './storyBlueprint.mjs'
import { analyzeStory } from './storyCorpusCalibration.mjs'

export const SCAFFOLD_VERSION = 'fab9-scaffold@1'

export const TITLE_BOUNDS = { min: 2, max: 12 }

// The title is Chinese the reader has to read, so it obeys the story's own
// vocabulary rules — the same check validateBlueprint applies to a finished
// plan, available on its own so the title can be fixed before anything else
// is generated.
export function checkTitle(title, { manifest, vocabMap }) {
  const t = String(title == null ? '' : title).trim()
  const problems = []
  if (!t) return { ok: false, problems: ['no title'] }
  if (hasLatin(t)) problems.push('contains Latin text')
  const a = analyzeStory({ title: '', level: manifest.level, content: t }, vocabMap)
  const targets = new Set(manifest.targets.map(x => x.word))
  const above = [...a.counts.keys()].filter(w => !targets.has(w) && vocabMap[w] && vocabMap[w].level > manifest.level)
  if (a.cjkChars < TITLE_BOUNDS.min || a.cjkChars > TITLE_BOUNDS.max) problems.push(a.cjkChars + ' characters (need ' + TITLE_BOUNDS.min + '-' + TITLE_BOUNDS.max + ')')
  if (a.unknownRuns.length) problems.push('non-vocabulary text: ' + a.unknownRuns.join('、'))
  if (above.length) problems.push('above-level vocabulary: ' + above.map(w => w + ' (HSK ' + vocabMap[w].level + ')').join('、'))
  return { ok: problems.length === 0, problems }
}

// Rebuild the plan from the ORIGINAL shape plus the three lexical fields.
// Anything else a lexical call returned is discarded by construction.
export function applyScaffold(blueprint, scaffold) {
  const anchorsByBeat = new Map((scaffold.beats || []).map(b => [b.beat, b.anchors]))
  const sketchByWord = new Map()
  for (const b of (scaffold.beats || [])) for (const s of (b.sketches || [])) sketchByWord.set(s.word, s.usageSketch)
  return {
    ...blueprint,
    chineseTitle: scaffold.title,
    beats: blueprint.beats.map(b => ({ ...b, chineseLexicalAnchors: anchorsByBeat.get(b.id) || [] })),
    targetPlan: (blueprint.targetPlan || []).map(t => ({ ...t, usageSketch: sketchByWord.get(t.word) || '' })),
  }
}

// The shape is locked once structural validation passes. This is the proof,
// not a promise: every field the lexical stage is forbidden to touch is
// compared before and after.
const SHAPE_FIELDS = ['problem', 'incitingEvent', 'resolution', 'setting']
export function shapeChanges(before, after) {
  const changed = []
  for (const f of SHAPE_FIELDS) {
    if (String(before[f] || '') !== String(after[f] || '')) changed.push(f)
  }
  if (JSON.stringify(before.cast || []) !== JSON.stringify(after.cast || [])) changed.push('cast')
  if ((before.beats || []).length !== (after.beats || []).length) changed.push('beat count')
  // Leading semicolon: without it this line parses as a call on the result of
  // the push above, and every per-beat change goes unreported.
  ;(before.beats || []).forEach((b, i) => {
    const a = (after.beats || [])[i] || {}
    for (const f of ['id', 'when', 'where', 'what', 'because', 'arrivedHow']) {
      if (String(b[f] || '') !== String(a[f] || '')) changed.push('beat ' + b.id + '.' + f)
    }
    if (JSON.stringify(b.targets || []) !== JSON.stringify(a.targets || [])) changed.push('beat ' + b.id + '.targets')
  })
  const key = (p) => (p || []).map(t => t.word + '→' + t.beat).sort().join(',')
  if (key(before.targetPlan) !== key(after.targetPlan)) changed.push('target → beat assignment')
  return changed
}

// ── The sequential build ────────────────────────────────────────────────────
export async function buildLexicalScaffold({
  blueprint,
  manifest,
  vocabMap,
  meanings = {},
  pool = null,
  writer,
  buildTitlePrompt,
  parseTitle,
  buildSketchPrompt,
  parseSketch,
  buildAnchorsPrompt,
  parseAnchors,
  attempts = 2,               // one try plus one bounded retry, per piece
  maxTokens = 400,
} = {}) {
  const log = []
  const record = (entry) => { log.push(entry); return entry }

  // ── Title ────────────────────────────────────────────────────────────────
  let title = null
  let feedback = null
  for (let a = 1; a <= attempts && !title; a += 1) {
    let out = null
    let error = null
    try {
      out = parseTitle(await writer.send({ kind: 'title', prompt: buildTitlePrompt({ manifest, blueprint, pool, feedback }), maxTokens }))
    } catch (err) { error = String((err && err.message) || err).slice(0, 160) }
    const check = out ? checkTitle(out, { manifest, vocabMap }) : { ok: false, problems: [error || 'no usable title in the response'] }
    record({ piece: 'title', attempt: a, output: out, ok: check.ok, problems: check.problems })
    if (check.ok) title = out
    else feedback = check.problems
  }
  if (!title) return { ok: false, code: 'TITLE_SCAFFOLD_FAILED', detail: 'no valid Chinese title in ' + attempts + ' attempts', log }

  // ── Beat by beat: targets first, then the beat's own words ───────────────
  const beats = []
  for (const beat of blueprint.beats) {
    const entries = (blueprint.targetPlan || []).filter(t => Number(t.beat) === beat.id)
    const sketches = []
    for (const entry of entries) {
      let sketch = null
      let fb = null
      for (let a = 1; a <= attempts && !sketch; a += 1) {
        let out = null
        let error = null
        try {
          out = parseSketch(await writer.send({
            kind: 'sketch',
            prompt: buildSketchPrompt({ manifest, word: entry.word, meaning: meanings[entry.word] || null, beat, entry, pool, feedback: fb }),
            maxTokens,
          }))
        } catch (err) { error = String((err && err.message) || err).slice(0, 160) }
        const check = out
          ? checkUsageSketch(out, { word: entry.word, manifest, vocabMap })
          : { ok: false, problems: [error || 'no usable sentence in the response'] }
        record({ piece: 'sketch', beat: beat.id, word: entry.word, attempt: a, output: out, ok: check.ok, problems: check.problems })
        if (check.ok) sketch = out
        else fb = check.problems
      }
      if (!sketch) {
        return {
          ok: false,
          code: 'TARGET_SCAFFOLD_FAILED',
          detail: entry.word + ' (beat ' + beat.id + ') could not be written in ' + attempts + ' attempts',
          failedAt: { beat: beat.id, word: entry.word },
          log,
        }
      }
      sketches.push({ word: entry.word, usageSketch: sketch })
    }

    let anchors = null
    let fb = null
    for (let a = 1; a <= attempts && !anchors; a += 1) {
      let out = null
      let error = null
      try {
        out = parseAnchors(await writer.send({
          kind: 'anchors',
          prompt: buildAnchorsPrompt({ manifest, beat, sketches, pool, feedback: fb }),
          maxTokens,
        }))
      } catch (err) { error = String((err && err.message) || err).slice(0, 160) }
      const problems = []
      if (!out) problems.push(error || 'no usable word list in the response')
      else {
        if (out.length < 3) problems.push('only ' + out.length + ' words')
        for (const w of out) {
          const c = checkAnchor(w, { manifest, vocabMap, cast: blueprint.cast || [] })
          if (!c.ok) problems.push('"' + w + '": ' + c.reason)
        }
      }
      record({ piece: 'anchors', beat: beat.id, attempt: a, output: out, ok: problems.length === 0, problems })
      if (!problems.length) anchors = out
      else fb = problems
    }
    if (!anchors) {
      return {
        ok: false,
        code: 'BEAT_LEXICAL_SCAFFOLD_FAILED',
        detail: 'beat ' + beat.id + ' has no writable vocabulary after ' + attempts + ' attempts',
        failedAt: { beat: beat.id },
        log,
      }
    }
    beats.push({ beat: beat.id, anchors, sketches })
  }

  return { ok: true, code: null, title, beats, log }
}
