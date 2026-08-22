// Deterministic repair planner (FAB-9, 2026-08-22) — the planning half of
// story repair, moved out of the model entirely.
//
// Three bounded structural-patch experiments established the boundary. The
// patcher can WRITE a compliant Chinese line; what it cannot do is jointly
// plan deletion selection, target repair, vocabulary simplification and metric
// preservation. patch-test-2 satisfied every failure it was handed and still
// broke the story — it swapped unknown words for harder known ones and deleted
// below-average-difficulty lines, pushing out-of-level share past its ceiling.
// patch-test-3 declined outright with IMPOSSIBLE, on a candidate an offline
// probe then repaired in four of the six allowed operations.
//
// So the work splits:
//
//   planRepair()              deterministic — WHICH lines change, and why
//   executeRepairPlan()       the model, ONE line at a time, nothing to plan
//   validateReplacementLine() deterministic — per line, before it is applied
//   validateCandidate()       deterministic — whole story, final authority
//
// The model never sees the plan, never chooses an operation, and never gets
// more than one line of work. When the arithmetic does not fit the operation
// budget, planRepair returns impossible and NO call is made at all.
//
// Pure: no network, no fs, no clock. Every vocabulary judgement comes from the
// canonical engine via analyzeStory, so "a word" means exactly what the
// reader, the FAB-5 audit and the validator mean by it.

import { analyzeStory } from './storyCorpusCalibration.mjs'
import { splitSpeaker } from './src/storyReading.js'

export const REPAIR_PLANNER_VERSION = 'fab9-repair-plan@1'

// A replacement may not collapse or balloon its line: the out-of-level SHARE
// has the story's character count as its denominator, so a line that loses
// half its text quietly raises the difficulty of everything around it.
export const LENGTH_BOUNDS = { min: 0.6, max: 1.8 }

// Per-line facts the planner reasons over. Segmentation happens per line
// inside analyzeStory, so summing these reproduces the whole-story metrics.
export function lineFacts(content, { level, vocabMap }) {
  const lines = String(content || '').split('\n').map(l => l.trim()).filter(Boolean)
  return lines.map((text, i) => {
    const a = analyzeStory({ title: '', level, content: text }, vocabMap)
    const outChars = Math.round(a.outOfLevelCharShare * a.cjkChars)
    return {
      line: i + 1,
      text,
      speaker: splitSpeaker(text).speaker || null,
      cjkChars: a.cjkChars,
      outChars,
      density: a.cjkChars > 0 ? outChars / a.cjkChars : 0,
      unknownRuns: [...new Set(a.unknownRuns)],
      counts: a.counts,
    }
  })
}

const round3 = (x) => Math.round(x * 1000) / 1000

// The one place the hard out-of-level ceiling is derived: the review band's
// ceiling where a manifest carries one, the plain cap otherwise.
export function shareCeilingOf(manifest) {
  const d = manifest.difficulty
  return d.reviewMaxOutOfLevelCharShare != null
    ? Math.max(d.reviewMaxOutOfLevelCharShare, d.maxOutOfLevelCharShare)
    : d.maxOutOfLevelCharShare
}

// ── The plan ─────────────────────────────────────────────────────────────────
// Deletions are chosen first and projected exactly (deleting text is fully
// deterministic); replacements are then assigned to the lines that still carry
// an unknown run or must host a missing target. Nothing is asked of a model
// until the whole plan fits the operation budget.
export function planRepair({ candidate, validation, manifest, vocabMap, budget = 6 } = {}) {
  const level = manifest.level
  const facts = lineFacts(candidate.content, { level, vocabMap })
  const totalCjk = facts.reduce((n, f) => n + f.cjkChars, 0)
  const totalOut = facts.reduce((n, f) => n + f.outChars, 0)
  const share = totalCjk > 0 ? totalOut / totalCjk : 0
  const ceiling = shareCeilingOf(manifest)

  const counts = (validation && validation.metrics && validation.metrics.targetCounts) || {}
  const lineReduction = Math.max(0, facts.length - manifest.length.maxLines)
  const missingTargets = manifest.targets
    .filter(t => (counts[t.word] || 0) < t.min)
    .map(t => ({ word: t.word, have: counts[t.word] || 0, need: t.min - (counts[t.word] || 0), min: t.min, max: t.max }))
  const excessTargets = manifest.targets
    .filter(t => (counts[t.word] || 0) > t.max)
    .map(t => ({ word: t.word, have: counts[t.word] || 0, max: t.max }))

  const runLines = new Map()                       // unknown run -> [line numbers]
  for (const f of facts) {
    for (const run of f.unknownRuns) {
      if (!runLines.has(run)) runLines.set(run, [])
      runLines.get(run).push(f.line)
    }
  }
  const unknownCap = manifest.difficulty.maxUnknownDistinct
  const required = {
    lineReduction,
    missingTargets,
    excessTargets,
    unknownDistinct: runLines.size,
    unknownCap,
    unknownExcess: Math.max(0, runLines.size - unknownCap),
    unknownRuns: Object.fromEntries([...runLines].map(([run, at]) => [run, at])),
  }

  // Structural protections: the opening and closing lines carry the story's
  // shape, a speaker with two or more lines may not vanish (the same rule
  // validateEdit enforces), and no deletion may drop a target below its
  // minimum — repairing one gate by breaking another is not a repair.
  const speakerLines = new Map()
  for (const f of facts) if (f.speaker) speakerLines.set(f.speaker, (speakerLines.get(f.speaker) || 0) + 1)
  const liveCounts = { ...counts }
  const liveSpeakers = new Map(speakerLines)
  const minOf = Object.fromEntries(manifest.targets.map(t => [t.word, t.min]))

  const deletable = (f) => {
    if (f.line === 1 || f.line === facts.length) return 'opening/closing line'
    if (f.speaker && speakerLines.get(f.speaker) >= 2 && liveSpeakers.get(f.speaker) <= 1) return 'last remaining line of ' + f.speaker
    for (const [word, min] of Object.entries(minOf)) {
      const n = f.counts.get(word) || 0
      if (n > 0 && (liveCounts[word] || 0) - n < min) return 'carries required occurrence of ' + word
    }
    return null
  }

  // ── Deletions ──────────────────────────────────────────────────────────────
  const deleted = new Set()
  const deletes = []
  const runsLeft = new Map([...runLines].map(([run, at]) => [run, at.slice()]))
  const killsRuns = (f) => f.unknownRuns.filter(run => (runsLeft.get(run) || []).length === 1)
  let projCjk = totalCjk
  let projOut = totalOut

  const needMoreDeletes = () => deletes.length < lineReduction
  while (needMoreDeletes()) {
    const pool = facts
      .filter(f => !deleted.has(f.line) && !deletable(f))
      .map(f => ({ f, kills: killsRuns(f) }))
    if (pool.length === 0) break
    const score = (x) => [
      -(x.kills.length),                                   // kill an unknown run outright
      -(x.f.density >= share ? 1 : 0),                     // never dilute: at or above average difficulty
      -x.f.outChars,                                       // then the heaviest line
      x.f.line,                                            // deterministic tiebreak
    ]
    const better = (a, b) => { const sa = score(a), sb = score(b); for (let i = 0; i < sa.length; i += 1) if (sa[i] !== sb[i]) return sa[i] - sb[i]; return 0 }
    // Only deletions that keep the projected share inside the ceiling are
    // eligible; deleting easy text is how patch-test-2 crossed it.
    const safe = pool.filter(x => (projCjk - x.f.cjkChars) > 0 && (projOut - x.f.outChars) / (projCjk - x.f.cjkChars) <= ceiling)
    const from = safe.length ? safe : pool
    const pick = from.slice().sort(better)[0]
    const f = pick.f
    deleted.add(f.line)
    projCjk -= f.cjkChars
    projOut -= f.outChars
    for (const [word, n] of f.counts) if (liveCounts[word] != null) liveCounts[word] -= n
    if (f.speaker) liveSpeakers.set(f.speaker, (liveSpeakers.get(f.speaker) || 0) - 1)
    for (const run of f.unknownRuns) {
      const at = (runsLeft.get(run) || []).filter(l => l !== f.line)
      if (at.length) runsLeft.set(run, at); else runsLeft.delete(run)
    }
    deletes.push({
      line: f.line,
      text: f.text,
      cjkChars: f.cjkChars,
      outChars: f.outChars,
      density: round3(f.density),
      removesRuns: pick.kills,
      safeForShare: safe.length > 0,
      reason: [
        'line count ' + (deletes.length + 1) + '/' + lineReduction,
        pick.kills.length ? 'removes unknown ' + pick.kills.join('、') : null,
        f.density >= share
          ? 'density ' + round3(f.density) + ' ≥ story average ' + round3(share)
          : 'density ' + round3(f.density) + ' below average ' + round3(share)
            + (pick.kills.length ? ' — taken for the unknown vocabulary it removes' : ' — no denser candidate was available'),
      ].filter(Boolean).join('; '),
    })
  }

  // ── Replacements ───────────────────────────────────────────────────────────
  // Whatever the deletions could not fix: unknown runs still over the cap, and
  // targets still short. A line that does both costs one operation, not two.
  const replaceTasks = new Map()                   // line -> task
  const taskFor = (f, why) => {
    if (!replaceTasks.has(f.line)) {
      replaceTasks.set(f.line, { line: f.line, text: f.text, speaker: f.speaker, cjkChars: f.cjkChars, addTargets: [], removeTargets: [], removeRuns: [], reasons: [] })
    }
    const t = replaceTasks.get(f.line)
    if (why) t.reasons.push(why)
    return t
  }

  const overCap = runsLeft.size - unknownCap
  if (overCap > 0) {
    const cheapest = [...runsLeft].sort((a, b) => a[1].length - b[1].length || (a[0] < b[0] ? -1 : 1)).slice(0, overCap)
    for (const [run, at] of cheapest) {
      for (const line of at) {
        const f = facts[line - 1]
        const t = taskFor(f, 'remove unknown word ' + run)
        if (!t.removeRuns.includes(run)) t.removeRuns.push(run)
      }
    }
  }

  const hostFor = (word) => {
    // Free first: a line already being rewritten. Otherwise the surviving line
    // with the most above-level characters — the line we would most like
    // simplified anyway — never the opening or closing line, and never one
    // that already carries the word (rewriting that risks losing it).
    const free = [...replaceTasks.values()]
      .filter(t => t.addTargets.length === 0 && !(facts[t.line - 1].counts.get(word) > 0))
      .sort((a, b) => a.line - b.line)[0]
    if (free) return facts[free.line - 1]
    return facts
      .filter(f => !deleted.has(f.line) && !replaceTasks.has(f.line) && f.line !== 1 && f.line !== facts.length && !(f.counts.get(word) > 0))
      .sort((a, b) => (b.outChars - a.outChars) || (a.line - b.line))[0] || null
  }

  const unplaced = []
  for (const m of missingTargets) {
    for (let i = 0; i < m.need; i += 1) {
      const host = hostFor(m.word)
      if (!host) { unplaced.push(m.word); continue }
      taskFor(host, 'add target ' + m.word).addTargets.push(m.word)
    }
  }
  for (const e of excessTargets) {
    const host = facts
      .filter(f => !deleted.has(f.line) && (f.counts.get(e.word) || 0) > 0)
      .sort((a, b) => (b.counts.get(e.word) || 0) - (a.counts.get(e.word) || 0) || a.line - b.line)[0]
    if (host) taskFor(host, 'thin out over-used ' + e.word).removeTargets.push(e.word)
    else unplaced.push(e.word)
  }

  const replaces = [...replaceTasks.values()].sort((a, b) => a.line - b.line)
  const ops = deletes.length + replaces.length

  const projected = {
    ops,
    lines: facts.length - deletes.length,
    cjkChars: projCjk,
    outChars: projOut,
    share: projCjk > 0 ? round3(projOut / projCjk) : 0,
    shareDelta: round3((projCjk > 0 ? projOut / projCjk : 0) - share),
    unknownRunsRemaining: [...runsLeft.keys()],
    unknownAfterReplacements: Math.max(0, runsLeft.size - replaces.reduce((n, t) => n + t.removeRuns.length, 0)),
    note: 'deterministic deletions only — replacement text is generated later and re-measured',
  }

  const problems = []
  if (ops > budget) problems.push(ops + ' operations needed, budget is ' + budget)
  if (deletes.length < lineReduction) problems.push('cannot delete ' + lineReduction + ' line(s) without breaking structure or a target minimum')
  if (unplaced.length) problems.push('no host line available for: ' + unplaced.join('、'))
  if (projected.share > ceiling) problems.push('deletions alone leave out-of-level share at ' + (projected.share * 100).toFixed(1) + '% > ' + (ceiling * 100).toFixed(1) + '%')

  return {
    plannerVersion: REPAIR_PLANNER_VERSION,
    budget,
    feasible: problems.length === 0,
    impossible: problems.length ? problems.join('; ') : null,
    metrics: {
      lines: facts.length,
      maxLines: manifest.length.maxLines,
      cjkChars: totalCjk,
      outChars: totalOut,
      share: round3(share),
      ceiling,
      averageDensity: round3(share),
    },
    required,
    deletes,
    replaces,
    projected,
    facts: facts.map(f => ({ line: f.line, speaker: f.speaker, cjkChars: f.cjkChars, outChars: f.outChars, density: round3(f.density), unknownRuns: f.unknownRuns })),
  }
}

// ── Per-line gate ────────────────────────────────────────────────────────────
// Everything a generated line must satisfy BEFORE it may touch the story. The
// whole-story validator still runs afterwards; this exists so a bad line is
// never applied in the first place.
export function validateReplacementLine({ original, replacement, task, manifest, vocabMap }) {
  const failures = []
  const fail = (code, message) => failures.push({ code, message })
  const text = String(replacement || '').trim()
  const level = manifest.level

  if (!text) fail('empty', 'no line returned')
  if (text.includes('\n')) fail('multiline', 'more than one line returned')
  if (failures.length) return { ok: false, failures, metrics: {} }

  const before = analyzeStory({ title: '', level, content: original }, vocabMap)
  const after = analyzeStory({ title: '', level, content: text }, vocabMap)
  const beforeSpeaker = splitSpeaker(original).speaker || null
  const afterSpeaker = splitSpeaker(text).speaker || null

  // Speaker syntax: a narration line stays narration, a dialogue line keeps
  // its speaker, and no line invents a cast member.
  const allowed = new Set([...(manifest.speakers || []), ...(manifest.extraNames || [])])
  if (afterSpeaker && !allowed.has(afterSpeaker)) fail('unknown_speaker', 'speaker "' + afterSpeaker + '" is not in the cast')
  if (beforeSpeaker && afterSpeaker !== beforeSpeaker) fail('speaker_changed', 'line belongs to ' + beforeSpeaker + ', got ' + (afterSpeaker || 'narration'))
  if (!beforeSpeaker && afterSpeaker) fail('speaker_added', 'narration line came back as dialogue by ' + afterSpeaker)

  for (const word of (task.addTargets || [])) {
    if ((after.counts.get(word) || 0) < 1) fail('target_missing', 'required target ' + word + ' is not in the line')
  }
  for (const word of (task.removeTargets || [])) {
    if ((after.counts.get(word) || 0) >= (before.counts.get(word) || 0)) fail('target_not_reduced', word + ' was not thinned out')
  }
  for (const run of (task.removeRuns || [])) {
    if (after.unknownRuns.includes(run)) fail('unknown_run_kept', 'unknown word ' + run + ' is still there')
  }

  const newRuns = after.unknownRuns.filter(r => !before.unknownRuns.includes(r))
  if (newRuns.length) fail('unknown_run_added', 'new non-vocabulary text: ' + newRuns.join('、'))

  const allowAbove = new Set([...(task.addTargets || []), ...manifest.targets.map(t => t.word)])
  const introduced = []
  for (const [word, n] of after.counts) {
    if (allowAbove.has(word)) continue
    const v = vocabMap && vocabMap[word]
    if (!v || !(v.level > level)) continue
    if (n - (before.counts.get(word) || 0) > 0) introduced.push(word + ' (HSK ' + v.level + ')')
  }
  if (introduced.length) fail('above_level_added', 'introduces vocabulary above the story level: ' + introduced.join('、'))

  const ratio = before.cjkChars > 0 ? after.cjkChars / before.cjkChars : 1
  if (ratio < LENGTH_BOUNDS.min || ratio > LENGTH_BOUNDS.max) {
    fail('length_out_of_range', after.cjkChars + ' characters against the original ' + before.cjkChars + ' — keep the line about the same size')
  }

  return {
    ok: failures.length === 0,
    failures,
    metrics: {
      cjkChars: after.cjkChars,
      outChars: Math.round(after.outOfLevelCharShare * after.cjkChars),
      outCharsBefore: Math.round(before.outOfLevelCharShare * before.cjkChars),
      unknownRuns: after.unknownRuns,
      speaker: afterSpeaker,
      lengthRatio: round3(ratio),
    },
  }
}

// ── Execution ────────────────────────────────────────────────────────────────
// One tiny task per replacement line, offered to every generator so compliance
// on this task is measured rather than assumed. A generated line is adopted
// only after the per-line gate passes; the choice between passing lines is
// deterministic (least added difficulty, then closest to the original length,
// then generator order). Providers are injected — no network in this module.
export async function executeRepairPlan({
  plan,
  manifest,
  vocabMap,
  meanings = {},
  context = {},
  generators = [],
  buildPrompt,
  parseLine,
  attemptsPerGenerator = 2,
  maxTokens = 900,
} = {}) {
  const ops = plan.deletes.map(d => ({ op: 'delete', line: d.line }))
  const attempts = []
  const unresolved = []
  const compliance = new Map(generators.map(g => [g.name, { attempts: 0, passed: 0, adopted: 0 }]))

  for (const task of plan.replaces) {
    const passing = []
    for (let gi = 0; gi < generators.length; gi += 1) {
      const g = generators[gi]
      let feedback = null
      for (let a = 1; a <= attemptsPerGenerator; a += 1) {
        const prompt = buildPrompt({ manifest, task, meanings, context, feedback })
        let raw = null
        let error = null
        try {
          raw = await g.send({ kind: 'line-rewrite', prompt, maxTokens })
        } catch (err) { error = String((err && err.message) || err).slice(0, 200) }
        const parsed = raw == null ? null : parseLine(raw)
        const gate = parsed
          ? validateReplacementLine({ original: task.text, replacement: parsed, task, manifest, vocabMap })
          : { ok: false, failures: [{ code: error ? 'provider_error' : 'unparseable', message: error || 'no usable line in the response' }], metrics: {} }
        const stat = compliance.get(g.name)
        stat.attempts += 1
        if (gate.ok) stat.passed += 1
        attempts.push({ line: task.line, generator: g.name, attempt: a, output: parsed, ok: gate.ok, failures: gate.failures, metrics: gate.metrics })
        if (gate.ok) { passing.push({ generator: g.name, gi, text: parsed, metrics: gate.metrics }); break }
        feedback = gate.failures.map(f => f.message)
      }
    }
    passing.sort((a, b) =>
      (a.metrics.outChars - b.metrics.outChars)
      || (Math.abs(a.metrics.lengthRatio - 1) - Math.abs(b.metrics.lengthRatio - 1))
      || (a.gi - b.gi))
    const winner = passing[0]
    if (winner) {
      ops.push({ op: 'replace', line: task.line, text: winner.text })
      compliance.get(winner.generator).adopted += 1
    } else {
      unresolved.push({ line: task.line, reasons: task.reasons })
    }
  }

  return {
    ops: ops.sort((a, b) => a.line - b.line),
    attempts,
    unresolved,
    compliance: Object.fromEntries(compliance),
  }
}
