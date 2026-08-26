// Target-placement viability (FAB-9, 2026-08-25).
//
// a3-final-11 lost a plan that passed every existing gate — structural,
// lexical feasibility, quality 9/10, targetFit 8/10 — on one placement:
//
//   男人 → beat 2, refers to Li Ming, intent "Description"
//
// in a beat whose only man is the viewpoint character. The one faithful
// sentence is "Li Ming is a man", which nobody would write, so the writer
// reached for a contrastive one and attached the label to the wrong person.
// Twice. The judge scored both attempts 1/10 and was right both times.
//
// The existing checks could not see it. `target_no_intent` asks whether an
// intent was WRITTEN, not whether it is a reason; targetFit is one aggregate
// number across all the targets, and eight good placements drown one that
// cannot be written at all.
//
// So each placement is judged on its own, and a single fatal one makes the
// plan ineligible however good the rest of it is. This is a gate, not a score:
// it never adds to or subtracts from quality, and quality never buys past it.
//
// Pure: prompt in, verdicts out. The provider is injected by the harness.

export const VIABILITY_VERSION = 'fab9-target-viability@1'

const text = (v) => String(v == null ? '' : v).trim()

// The criteria are about DISCOURSE, not about any particular word or story:
// what makes a sentence worth writing is that someone in it needs to say
// something, and a vocabulary requirement is not a someone.
export function targetViabilityPrompt({ manifest, blueprint, levelName, placements = null }) {
  const beats = (blueprint.beats || []).map(b => '  Beat ' + b.id + ' [' + text(b.where) + ']: ' + text(b.what)
    + (text(b.because) ? '  (because ' + text(b.because) + ')' : '')).join('\n')
  const rows = (placements || blueprint.targetPlan || []).map(t => '  ' + t.word + ' — beat ' + t.beat
    + ' — refers to: ' + (text(t.refersTo) || '(unstated)')
    + ' — speaker: ' + (text(t.speaker) || '(unstated)')
    + ' — stated intent: ' + (text(t.intent) || '(none)')).join('\n')

  return 'You are a demanding editor of ' + levelName + ' graded readers, checking whether each required word has a real reason to be said.\n\n'
    + 'THE STORY, beat by beat:\n' + beats + '\n\n'
    + 'THE PLACEMENTS to judge — one verdict each, independently:\n' + rows + '\n\n'
    + 'For each one, ask: could a competent native writer use THIS word naturally in THIS beat, leaving the beat\'s event exactly as it is?\n\n'
    + 'It FAILS when the only way to use the word is to:\n'
    + '- state a category of a person or thing that is already obvious to the reader\n'
    + '- define or label something purely so the word can appear\n'
    + '- write a sentence whose real purpose is to satisfy a vocabulary requirement\n'
    + '- add information that has nothing to do with what happens in the beat\n'
    + '- invent a contrast, an object, a person or an event so the word has somewhere to go\n'
    + '- write a line that would simply be cut if the word were not required\n'
    + 'A stated intent like "Description", "Identification" or "Scene detail", with no one who needs the information, is one of these.\n\n'
    + 'It PASSES when the word:\n'
    + '- identifies someone or something the reader does not already know\n'
    + '- tells apart two real possibilities\n'
    + '- expresses an action, state or property that matters to what happens\n'
    + '- carries something a character or the narrator genuinely needs to get across\n'
    + '- takes part in the beat\'s own causal action\n\n'
    + 'A word does NOT have to be important to the plot. It has to have a job beyond "this word must appear".\n'
    + 'Judge each placement alone. Do not let a good placement excuse a bad one, and do not soften a verdict because the story is otherwise fine.\n\n'
    + 'Output one line per placement, in this exact shape and nothing else:\n'
    + '<word>: <PASS or FAIL> | <the referent or action it attaches to> | <its job in the beat, a few words> | <one sentence saying why>'
}

// Tolerant, keyed by the word: models drift on spacing, bullets and casing,
// and a verdict lost to notation is a plan rejected for nothing.
export function parseTargetViability(out, words = []) {
  const wanted = new Set(words)
  const found = []
  for (const raw of String(out || '').split('\n')) {
    const line = raw.trim().replace(/^[-*•\d.\s]+/, '')
    if (!line) continue
    const ci = line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('：')
    if (ci <= 0) continue
    const word = line.slice(0, ci).replace(/[*_`\s]/g, '').trim()
    if (wanted.size && !wanted.has(word)) continue
    if (found.some(f => f.word === word)) continue
    const parts = line.slice(ci + 1).split('|').map(p => p.trim())
    const verdictText = parts[0] || ''
    if (!/\b(pass|fail)\b/i.test(verdictText)) continue
    found.push({
      word,
      verdict: /\bfail\b/i.test(verdictText) ? 'FAIL' : 'PASS',
      referent: parts[1] || '',
      function: parts[2] || '',
      reason: parts.slice(3).join(' | ') || '',
    })
  }
  return found.length ? found : null
}

// The gate. Every REQUIRED placement must be viable; one fatal placement makes
// the plan ineligible, whatever the other verdicts and whatever the quality
// score. A placement the judge did not return is not a pass — an unanswered
// question is not evidence.
export function assessTargetPlacements(verdicts, { blueprint, required = null } = {}) {
  const plan = (blueprint && blueprint.targetPlan) || []
  const need = required || plan.map(t => t.word)
  const byWord = new Map((verdicts || []).map(v => [v.word, v]))
  const rows = plan.map(t => {
    const v = byWord.get(t.word)
    return {
      word: t.word,
      beat: Number(t.beat),
      referent: (v && v.referent) || text(t.refersTo),
      function: (v && v.function) || '',
      verdict: v ? v.verdict : 'UNJUDGED',
      reason: v ? v.reason : 'no verdict was returned for this placement',
      requiredHere: need.includes(t.word),
    }
  })
  const failures = rows.filter(r => r.requiredHere && r.verdict !== 'PASS')
  return { version: VIABILITY_VERSION, ok: failures.length === 0, rows, failures }
}

// ── The effective target map ────────────────────────────────────────────────
// A verdict that is only recorded changes nothing: the writer is still told to
// use the word. So viability produces a DERIVED plan, and everything
// downstream reads that — scaffold, sketches, anchors, beat realization, the
// retry briefs and target-presence validation alike.
//
// The frozen plan itself is never modified. It stays exactly as the planner
// wrote it, so the artifact can still explain why 必须 was in H at all and
// why it never reached the writer.
//
// A failed optional is DROPPED, never moved. Reassigning it to another beat
// would be a new planning decision, made by the wrong component, after plan
// validation had already run.
export const DISPOSITION = {
  requiredKept: 'retained_required',
  optionalKept: 'retained_optional',
  optionalDropped: 'dropped_optional',
}

export function effectiveTargets(blueprint, assessment, { manifest = null, required = null } = {}) {
  const plan = (blueprint && blueprint.targetPlan) || []
  const need = new Set(required || plan.map(t => t.word))
  const byWord = new Map((assessment && assessment.rows ? assessment.rows : []).map(r => [r.word, r]))

  const dispositions = plan.map(t => {
    const verdict = byWord.has(t.word) ? byWord.get(t.word).verdict : 'UNJUDGED'
    const isRequired = need.has(t.word)
    const disposition = isRequired
      ? DISPOSITION.requiredKept
      : (verdict === 'PASS' ? DISPOSITION.optionalKept : DISPOSITION.optionalDropped)
    return {
      word: t.word,
      beat: Number(t.beat),
      required: isRequired,
      verdict,
      reason: byWord.has(t.word) ? byWord.get(t.word).reason : '',
      disposition,
    }
  })

  const dropped = new Set(dispositions.filter(d => d.disposition === DISPOSITION.optionalDropped).map(d => d.word))
  const derived = {
    ...blueprint,
    targetPlan: plan.filter(t => !dropped.has(t.word)),
    beats: ((blueprint && blueprint.beats) || []).map(b => ({
      ...b,
      targets: ((b && b.targets) || []).filter(w => !dropped.has(w)),
    })),
  }

  // The deterministic validator counts every manifest target against its
  // minimum, so a dropped word has to stop being a target of this story — or
  // the finished draft fails for a word the gate deliberately removed. It is
  // removed rather than zeroed: a manifest target with min 0 is not a valid
  // manifest, and "not a target here" is what actually happened.
  const effectiveManifest = manifest
    ? { ...manifest, targets: (manifest.targets || []).filter(t => !dropped.has(t.word)) }
    : null

  return { blueprint: derived, manifest: effectiveManifest, dispositions, dropped: [...dropped] }
}
