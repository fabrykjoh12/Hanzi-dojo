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

  // Host CANDIDATES, not a host. Choosing which line should carry a missing
  // target is a semantic question — repair-1 put 结束 on a line about a secret
  // photo because that line happened to hold the most above-level characters,
  // and the critique caught it. So the planner's job stops at "these lines are
  // mechanically able to host this word"; the ranking among them is asked of a
  // model (executeRepairPlan), which may only choose from this set.
  //
  // Mechanically able means: it survives the deletions, it is not the opening
  // or closing line, it does not already carry the word (rewriting that line
  // risks losing the occurrence it already has), and taking it stays inside
  // the operation budget. Lines already being rewritten for an unknown run
  // come first — they cost no extra operation — and the rest are ordered by
  // above-level characters, which is the deterministic fallback order if the
  // ranking call fails.
  const hostCandidatesFor = (word, taken, maxCandidates = 5) => {
    const free = [...replaceTasks.values()]
      .filter(t => !taken.has(t.line) && !(facts[t.line - 1].counts.get(word) > 0))
      .map(t => ({ ...facts[t.line - 1], free: true }))
    const fresh = facts.filter(f =>
      !deleted.has(f.line) && !replaceTasks.has(f.line) && !taken.has(f.line)
      && f.line !== 1 && f.line !== facts.length && !(f.counts.get(word) > 0))
    const ordered = [
      ...free.sort((a, b) => a.line - b.line),
      ...fresh.sort((a, b) => (b.outChars - a.outChars) || (a.line - b.line)),
    ]
    return ordered.slice(0, maxCandidates).map(f => ({
      line: f.line,
      text: f.text,
      speaker: f.speaker,
      cjkChars: f.cjkChars,
      outChars: f.outChars,
      free: Boolean(f.free),
    }))
  }

  const unplaced = []
  const targetHosts = []
  const taken = new Set()
  let extraOps = 0
  for (const m of missingTargets) {
    for (let i = 0; i < m.need; i += 1) {
      const eligible = hostCandidatesFor(m.word, taken)
      const candidates = eligible.filter(c => c.free || (deletes.length + replaceTasks.size + extraOps + 1) <= budget)
      if (!candidates.length) {
        unplaced.push(m.word + (eligible.length ? ' (a host line exists but does not fit the budget of ' + budget + ')' : ' (no mechanically valid host line)'))
        continue
      }
      targetHosts.push({ word: m.word, meaning: null, candidates, deterministicPick: candidates[0].line })
      // Reserve the whole candidate set from the next target's choices only by
      // its eventual pick; but budget must assume the worst case (a fresh line).
      taken.add(candidates[0].line)
      if (!candidates[0].free) extraOps += 1
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
  // Worst case: every target lands on a line that is not already being
  // rewritten. The budget is checked against that, never against the hope
  // that the semantic ranker picks a free line.
  const ops = deletes.length + replaces.length + extraOps

  const projected = {
    ops: deletes.length + replaceTasks.size + extraOps,
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
    targetHosts,
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

// ── Semantic quality thresholds (pilot values, 2026-08-22) ──────────────────
// A line that passes the mechanical gate can still be bad Chinese: repair-1
// adopted 突然发生的事是大白猫跳上桌子压住我的钱包 — legal by every
// deterministic measure, strained as a sentence, and scored 2/10 by the judge
// that later looked at it. So a judge scores the survivors in context, and a
// line that clears no threshold is not adopted at all.
//
// MECHANICAL is scored, not a veto. repair-2 had the judge answer
// mechanical=true for all six candidates it scored, including one it called
// "solid and natural" at overall 8 / grammar 9 / continuity 9 / voice 8: a
// judge told which word is required will nearly always say the sentence was
// built around it, so the boolean is saturated and cannot carry a rejection.
// It costs a point of the effective overall instead — enough to lose a close
// contest, not enough to reject a good line.
export const LINE_QUALITY = {
  overall: 6,               // 1-10, after the mechanical penalty
  grammar: 6,
  mechanicalPenalty: 1,
}

// Deterministic anonymisation: candidates are relabelled A, B, C… in an order
// derived from their own text, so the judge cannot infer which model wrote
// which line, and the same inputs always produce the same labelling.
function hash(text) {
  let h = 5381
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h
}
export function anonymise(candidates) {
  const ordered = candidates.slice().sort((a, b) => hash(a.text) - hash(b.text) || (a.text < b.text ? -1 : 1))
  return ordered.map((c, i) => ({ ...c, label: String.fromCharCode(65 + i) }))
}

// The overall score a candidate is actually judged on: what the judge said,
// less the mechanical penalty when it flagged the sentence as built around
// the required word.
export function effectiveOverall(score, thresholds = LINE_QUALITY) {
  if (!score) return 0
  const penalty = score.mechanical === true ? (thresholds.mechanicalPenalty || 0) : 0
  return (score.overall || 0) - penalty
}

export function acceptableLine(score, thresholds = LINE_QUALITY) {
  if (!score) return false
  return effectiveOverall(score, thresholds) >= thresholds.overall
    && (score.grammar || 0) >= thresholds.grammar
}

// ── Execution ────────────────────────────────────────────────────────────────
// Deletions are the planner's. For every line the planner wants rewritten:
// generate several independent candidates across every generator, discard the
// ones the deterministic gate rejects, then rank the survivors in their own
// context with a semantic judge and adopt the best — but only if it clears the
// quality threshold. The judge only ever chooses among survivors; it can never
// rescue a deterministic rejection.
//
// Host selection for a missing target is a CLOSED question over the planner's
// mechanically-eligible set, and the ranking is an ordered FALLBACK list, not
// a single answer: if the best host cannot produce an acceptable line, the
// next-best host is tried, up to maxHostsPerTarget. A failed host attempt
// changes nothing — only an accepted replacement consumes an operation.
export async function executeRepairPlan({
  plan,
  manifest,
  vocabMap,
  meanings = {},
  generators = [],
  buildPrompt,
  parseLine,
  hostRanker = null,           // { name, send } — ranks candidate host lines
  buildHostPrompt = null,
  parseHostRanking = null,
  judge = null,                // { name, send } — scores line candidates in context
  buildJudgePrompt = null,
  parseLineJudgment = null,
  thresholds = LINE_QUALITY,
  candidatesPerGenerator = 2,
  attemptsPerGenerator = 2,    // used only when there is no judge (legacy path)
  maxHostsPerTarget = 3,
  maxTokens = 900,
  contextFor = null,           // (line) => { before: [], after: [] }
} = {}) {
  const ops = plan.deletes.map(d => ({ op: 'delete', line: d.line }))
  const attempts = []
  const unresolved = []
  const hostSelections = []
  const judgments = []
  const compliance = new Map(generators.map(g => [g.name, { attempts: 0, passed: 0, adopted: 0 }]))
  const ctx = contextFor || (() => ({ before: [], after: [] }))

  const adopted = new Set()                         // lines already repaired
  // Lines the planner requires rewritten for their own sake (an unknown run,
  // an over-used target). A target host may coincide with one — then a single
  // operation does both jobs — and until that happens the requirement stays
  // pending and keeps its share of the budget reserved.
  const pending = new Map(plan.replaces.map(t => [t.line, {
    ...t,
    addTargets: [...t.addTargets], removeTargets: [...t.removeTargets],
    removeRuns: [...t.removeRuns], reasons: [...t.reasons],
  }]))
  const committedOps = () => plan.deletes.length + adopted.size
  const pendingOps = () => [...pending.keys()].filter(line => !adopted.has(line)).length

  // One line, start to finish: generate → deterministic gate → semantic judge.
  // Returns the winning candidate or null; the story is never touched here.
  const attemptLine = async (task, label) => {
    const passing = []
    const shots = judge ? candidatesPerGenerator : attemptsPerGenerator
    for (let gi = 0; gi < generators.length; gi += 1) {
      const g = generators[gi]
      let feedback = null
      for (let a = 1; a <= shots; a += 1) {
        const prompt = buildPrompt({ manifest, task, meanings, context: ctx(task.line), feedback })
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
        attempts.push({ line: task.line, for: label, generator: g.name, attempt: a, output: parsed, ok: gate.ok, failures: gate.failures, metrics: gate.metrics })
        if (gate.ok && !passing.some(p => p.text === parsed)) passing.push({ generator: g.name, gi, text: parsed, metrics: gate.metrics })
        if (gate.ok && !judge) break
        if (!gate.ok) feedback = gate.failures.map(f => f.message)
      }
    }
    if (!passing.length) return { winner: null, why: 'no candidate passed the deterministic gate' }

    if (!(judge && buildJudgePrompt && parseLineJudgment)) {
      const sorted = passing.slice().sort((a, b) =>
        (a.metrics.outChars - b.metrics.outChars)
        || (Math.abs(a.metrics.lengthRatio - 1) - Math.abs(b.metrics.lengthRatio - 1))
        || (a.gi - b.gi))
      return { winner: sorted[0], why: null }
    }

    const labelled = anonymise(passing)
    let scores = null
    try {
      const text = await judge.send({
        kind: 'line-judge',
        prompt: buildJudgePrompt({
          manifest,
          original: task.text,
          targets: task.addTargets,
          context: ctx(task.line),
          candidates: labelled.map(c => ({ label: c.label, text: c.text })),
        }),
        maxTokens,
      })
      scores = parseLineJudgment(text, labelled.map(c => c.label))
    } catch { scores = null }
    const scored = labelled.map(c => ({ ...c, score: (scores || []).find(s => s.label === c.label) || null }))
    judgments.push({
      line: task.line,
      for: label,
      judge: judge.name,
      candidates: scored.map(c => ({
        label: c.label,
        generator: c.generator,
        text: c.text,
        score: c.score,
        effectiveOverall: c.score ? effectiveOverall(c.score, thresholds) : null,
        accepted: acceptableLine(c.score, thresholds),
      })),
    })
    const acceptable = scored.filter(c => acceptableLine(c.score, thresholds))
    acceptable.sort((a, b) => (effectiveOverall(b.score, thresholds) - effectiveOverall(a.score, thresholds))
      || (b.score.grammar - a.score.grammar)
      || (a.metrics.outChars - b.metrics.outChars)
      || (a.label < b.label ? -1 : 1))
    if (acceptable[0]) return { winner: acceptable[0], why: null }
    return {
      winner: null,
      why: scores
        ? 'no candidate met the naturalness threshold (overall ≥ ' + thresholds.overall + ' after the mechanical penalty, grammar ≥ ' + thresholds.grammar + ')'
        : 'the semantic judge returned nothing usable',
    }
  }

  const adopt = (task, winner) => {
    ops.push({ op: 'replace', line: task.line, text: winner.text })
    adopted.add(task.line)
    compliance.get(winner.generator).adopted += 1
    pending.delete(task.line)
  }

  // ── Missing targets: ranked hosts, tried in order ─────────────────────────
  for (const host of (plan.targetHosts || [])) {
    const eligible = host.candidates.filter(c => !adopted.has(c.line))
    let ranking = null
    let source = 'deterministic (no ranker)'
    if (hostRanker && buildHostPrompt && parseHostRanking && eligible.length > 1) {
      try {
        const text = await hostRanker.send({
          kind: 'host-rank',
          prompt: buildHostPrompt({ manifest, target: host.word, meaning: meanings[host.word] || null, candidates: eligible.map(c => ({ ...c, ...ctx(c.line) })) }),
          maxTokens,
        })
        ranking = parseHostRanking(text, eligible.map(c => c.line))
        source = ranking && ranking.length ? 'semantic ranking by ' + hostRanker.name : 'deterministic (ranking unusable)'
      } catch (err) {
        source = 'deterministic (ranker failed: ' + String((err && err.message) || err).slice(0, 80) + ')'
      }
    }
    const order = (ranking && ranking.length ? ranking.map(r => r.line) : eligible.map(c => c.line))
      .filter(line => eligible.some(c => c.line === line))

    const tried = []
    let chosen = null
    for (const line of order) {
      if (tried.length >= maxHostsPerTarget || chosen != null) break
      if (adopted.has(line)) continue                                   // never conflict with an adopted repair
      const free = pending.has(line)
      if (!free && committedOps() + pendingOps() + 1 > plan.budget) continue   // the budget is not negotiable
      const f = host.candidates.find(c => c.line === line)
      const req = pending.get(line)
      const task = {
        line,
        text: f.text,
        speaker: f.speaker,
        cjkChars: f.cjkChars,
        addTargets: [host.word],
        removeTargets: req ? [...req.removeTargets] : [],
        removeRuns: req ? [...req.removeRuns] : [],
        reasons: [...(req ? req.reasons : []), 'add target ' + host.word],
      }
      const { winner, why } = await attemptLine(task, host.word + ' → line ' + line)
      tried.push({
        line,
        rank: tried.length + 1,
        reason: (ranking && (ranking.find(r => r.line === line) || {}).reason) || null,
        free,
        accepted: Boolean(winner),
        text: winner ? winner.text : null,
        why: winner ? null : why,
      })
      if (winner) { adopt(task, winner); chosen = line }
    }
    hostSelections.push({ target: host.word, candidates: host.candidates, ranking, order, tried, chosen, source })
    if (chosen == null) {
      unresolved.push({
        target: host.word,
        code: 'LINE_REPAIR_FAILED',
        detail: tried.length
          ? 'all ' + tried.length + ' host line(s) tried (' + tried.map(t => t.line).join(', ') + ') failed: ' + tried.map(t => t.line + ' — ' + t.why).join('; ')
          : 'no host line available inside the operation budget',
      })
    }
  }

  // ── Lines the planner requires rewritten for their own sake ───────────────
  for (const task of [...pending.values()].sort((a, b) => a.line - b.line)) {
    if (adopted.has(task.line)) continue
    const { winner, why } = await attemptLine(task, task.reasons.join('; '))
    if (winner) adopt(task, winner)
    else unresolved.push({ line: task.line, reasons: task.reasons, code: 'LINE_REPAIR_FAILED', detail: why })
  }

  return {
    ops: ops.sort((a, b) => a.line - b.line),
    attempts,
    hostSelections,
    judgments,
    unresolved,
    compliance: Object.fromEntries(compliance),
  }
}
