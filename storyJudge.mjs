// Semantic quality judging for story candidates (FAB-9/FAB-10).
//
// The deterministic validator (storyCandidateValidation.mjs) owns every
// factual constraint and is the ONLY authority on PASS/FAIL. This module
// covers what code cannot see — whether the Chinese reads naturally, whether
// the story coheres, whether the target words feel woven in or bolted on,
// whether it sounds machine-written, whether anyone would want to read it.
//
// Two hard rules, both enforced in code below and covered by specs:
//   1. Only a candidate the deterministic gate already PASSED may be judged.
//   2. A judgment is additive metadata. applyJudgment never touches
//      `status`, never touches `validation` — an LLM cannot promote a FAIL,
//      and cannot demote a PASS either (a low score is advice for the human
//      reviewer, not a veto).
//
// Cross-judging: when two models generate, each judges the OTHER's stories,
// so no model grades its own homework.
//
// Pure: no network, no fs. judge-story-candidates.mjs supplies the provider.

export const JUDGE_VERSION = 'fab9-judge@1'

export const JUDGE_DIMENSIONS = [
  ['natural', 'Natural, idiomatic Chinese — not translationese, not choppy baby prose'],
  ['coherence', 'Coherent story: events connect, cause and effect, a real beginning and end'],
  ['integration', 'The required vocabulary is woven in invisibly — nothing reads like a word list'],
  ['level', 'Complexity fits the level: simple grammar, but never insulting or babyish'],
  ['human', 'Reads as written by a person, not generated (no formulaic rhythm, no filler)'],
  ['interest', 'Actually interesting to read — a reason to reach the last line'],
]

// `preRepair` judges an UNTOUCHED writer draft that has not passed the
// mechanical checks yet (the pre-repair quality gate, storyDraftQuality.mjs).
// The framing has to change — telling the model the story already passed
// would be a lie it can see through — but the job does not: writing quality
// only, mechanical problems ignored entirely.
export function judgePrompt({ candidate, manifest, levelName, preRepair = false }) {
  const targets = manifest.targets.map(t => t.word).join('、')
  return 'You are a demanding editor of Chinese graded readers, judging a story written for ' + levelName + ' learners.\n\n' +
    (preRepair
      ? 'This is an unedited first draft. It may still break mechanical rules — wrong word counts, too many lines, vocabulary above the level. IGNORE all of that completely: those are fixed mechanically afterwards. '
        + 'Judge ONLY whether the story underneath is worth keeping.\n\n'
      : 'This story has ALREADY passed every mechanical check (required vocabulary present in the right amounts, level-appropriate word list, structure, no duplication). '
        + 'Do NOT re-check vocabulary counts, difficulty or formatting, and do not comment on them. '
        + 'Judge ONLY the writing quality a human editor would care about.\n\n') +
    'The story was required to teach these words naturally: ' + targets + '\n\n' +
    'Story:\n' + candidate.content + '\n\n' +
    'Score each dimension 1-10:\n' +
    JUDGE_DIMENSIONS.map(([key, desc]) => '- ' + key.toUpperCase() + ': ' + desc).join('\n') + '\n\n' +
    'Calibration — be hard to please and use the whole scale:\n' +
    '- 9-10: publishable as-is in a good graded reader. Rare.\n' +
    '- 7-8: solid. Real story, natural language, minor blemishes only.\n' +
    '- 5-6: readable but flat — thin plot, interchangeable voices, or stiff prose.\n' +
    '- 1-4: broken, incoherent, or barely a story.\n' +
    'Most machine-written graded readers are a 5 or 6. Do not award 7+ out of politeness.\n\n' +
    'Output format — plain text, NOT JSON, one field per line, exactly these lines:\n' +
    JUDGE_DIMENSIONS.map(([key]) => key.toUpperCase() + ': <1-10>').join('\n') + '\n' +
    'OVERALL: <1-10>\n' +
    'STRENGTHS: <one line — what genuinely works>\n' +
    'WEAKNESSES: <one line — the most important problems>\n' +
    'MECHANICAL: <yes or no — does it read as machine-generated?>\n' +
    'CONTRADICTION: <no, or yes followed by the contradiction — a plot that contradicts itself, an event that makes no sense where it is, a character doing something impossible in the scene>'
}

// Tolerant line parser: models drift on casing, punctuation and stray prose,
// so anything shaped like "KEY: value" is picked up and everything else is
// ignored. Returns null when not even OVERALL could be read — the caller
// treats that as a failed judgment, never as a score of zero.
// "8", "8/10", "8 out of 10", "8.5" → 8. Concatenating every digit in the
// line (the serial pipeline's old trick) turns "8/10" into 81, which then
// clamps to a perfect 10 — a silent quality-inflation bug.
function firstScore(value) {
  const m = String(value).match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Math.round(parseFloat(m[0]))
  return Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : null
}

export function parseJudgment(text) {
  const out = { scores: {}, strengths: '', weaknesses: '', mechanical: null, contradiction: null, contradictionDetail: '', overall: null }
  const keys = new Set(JUDGE_DIMENSIONS.map(([k]) => k))
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim().replace(/^[-*•\s]+/, '')
    const ci = line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('：')
    if (ci <= 0) continue
    const key = line.slice(0, ci).trim().toLowerCase().replace(/[^a-z]/g, '')
    const value = line.slice(ci + 1).trim()
    if (keys.has(key)) {
      const n = firstScore(value)
      if (n != null) out.scores[key] = n
    } else if (key === 'overall') {
      const n = firstScore(value)
      if (n != null) out.overall = n
    } else if (key === 'strengths') out.strengths = value
    else if (key === 'weaknesses') out.weaknesses = value
    else if (key === 'mechanical') out.mechanical = /^y/i.test(value)
    else if (key === 'contradiction') {
      out.contradiction = /^y/i.test(value)
      out.contradictionDetail = out.contradiction ? value.replace(/^yes[\s,:；;—–-]*/i, '').trim() : ''
    }
  }
  if (out.overall == null) {
    const vals = Object.values(out.scores)
    if (!vals.length) return null
    out.overall = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  }
  return out
}

// Attach a judgment to a candidate file WITHOUT touching the deterministic
// result. Returns a new object; the input is never mutated.
export function applyJudgment(file, judgment) {
  const judgments = Array.isArray(file.judgments) ? file.judgments.slice() : []
  judgments.push(judgment)
  return { ...file, judgments }
}

// Is this candidate eligible for judging? A deterministic PASS, or a
// REVIEW_REQUIRED from validator@3's experimental band (which explicitly
// continues through critique on its way to mandatory human review). A FAIL is
// not a matter of opinion, and spending judge calls on one invites exactly
// the "the LLM says it's fine" override this architecture forbids.
export function judgeable(file) {
  const c = file && file.candidate
  if (!c) return { ok: false, reason: 'no candidate record' }
  if (c.status !== 'accepted' && c.status !== 'review_required') return { ok: false, reason: 'status is "' + c.status + '"' }
  if (!c.validation || (c.validation.verdict !== 'PASS' && c.validation.verdict !== 'REVIEW_REQUIRED')) {
    return { ok: false, reason: 'deterministic verdict is ' + (c.validation ? c.validation.verdict : 'missing') }
  }
  if (!String(c.content || '').trim()) return { ok: false, reason: 'empty content' }
  return { ok: true }
}
