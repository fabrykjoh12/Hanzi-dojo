// Blind story-quality judge for the writer bakeoff (FAB-9, 2026-08-27).
//
// Deterministic checks answer "is it legal": the targets are there, the level
// holds, no line overloads. They cannot answer the question that decides
// whether a learner enjoys reading it — whether the Mandarin sounds like
// Mandarin or like English wearing Chinese characters.
//
// So a separate model reads the stories with the model names removed and the
// order shuffled, and scores them side by side. Side by side matters: absolute
// 1-10 scores drift between calls, and the only question here is which of these
// is better.
//
// The judge is never the writer of the story it is scoring. When the judge
// model also wrote one of the entries, that entry's score is marked and
// excluded rather than quietly used.
//
// Pure: prompt construction and parsing only.

export const JUDGE_VERSION = 'fab9-writer-judge@1'

export const STORY_JUDGE_DIMENSIONS = [
  'natural',        // reads as Mandarin, not as translated English
  'causality',      // each event follows from the last
  'motivation',     // the characters want something and act on it
  'dialogue',       // people speak the way people speak
  'concrete',       // things happen that a reader could picture
  'fresh',          // no padding, no repeated sentences to fill lines
  'level',          // right for a learner at this level, neither babyish nor hard
  'targets',        // the taught words feel needed, not inserted
]

function levelName(manifest) {
  return (manifest && manifest.system === 'hsk_3') ? ('HSK ' + manifest.level) : ('level ' + (manifest && manifest.level))
}

export function storyJudgePrompt({ manifest, stories = [] }) {
  const name = levelName(manifest)
  const targets = (manifest.targets || []).map(t => t.word).join('、')
  return 'You are judging short Chinese graded-reader stories written for a ' + name + ' learner.\n\n'
    + 'They were written from the SAME plan by different writers. Judge only what is on the page. '
    + 'You are not told who wrote which, and you must not guess.\n\n'
    + (targets ? 'The story is meant to teach these words: ' + targets + '\n\n' : '')
    + stories.map(s => '=== ' + s.label + ' ===\n' + (s.title ? s.title + '\n' : '') + s.content).join('\n\n') + '\n\n'
    + 'Score each story 1-10 on each dimension. Compare them against EACH OTHER — if one is clearly better on a '
    + 'dimension, its score must be higher there.\n\n'
    + '  natural    — does it read like Mandarin a person would write, or like English translated word by word?\n'
    + '  causality  — does each thing happen because of the thing before it?\n'
    + '  motivation — do the characters want something, and act on it?\n'
    + '  dialogue   — do people speak the way people actually speak?\n'
    + '  concrete   — do things happen that a reader could picture, or is it people discussing abstractions?\n'
    + '  fresh      — is anything padded, repeated, or written only to fill the line count?\n'
    + '  level      — is it right for this learner: not babyish, not beyond them?\n'
    + '  targets    — do the taught words feel genuinely needed, or dropped in?\n\n'
    + 'Output one line per story, nothing else:\n'
    + stories.map(s => s.label).join(' / ') + '\n'
    + '<label>: natural=<n> causality=<n> motivation=<n> dialogue=<n> concrete=<n> fresh=<n> level=<n> targets=<n> | <one sentence on the biggest difference>'
}

export function parseStoryJudgment(text, labels = []) {
  const wanted = new Set(labels)
  const out = []
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]{0,7})\s*[:：]\s*(.+)$/)
    if (!m) continue
    const label = m[1].trim()
    if (!wanted.has(label) || out.some(o => o.label === label)) continue
    const body = m[2]
    const row = { label }
    let found = 0
    for (const d of STORY_JUDGE_DIMENSIONS) {
      const dm = body.match(new RegExp(d + '\\s*=\\s*(\\d{1,2})'))
      if (dm) { row[d] = Math.max(1, Math.min(10, parseInt(dm[1], 10))); found += 1 } else row[d] = null
    }
    if (!found) continue
    const note = body.split('|')[1]
    row.note = note ? note.trim() : ''
    const scored = STORY_JUDGE_DIMENSIONS.map(d => row[d]).filter(n => Number.isFinite(n))
    row.overall = scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null
    out.push(row)
  }
  return out.length ? out : null
}

/** Mean per writer across plans, ignoring entries the judge itself wrote. */
export function aggregateJudgement(judgeLog = [], anonMapping = [], judgeSpec = null) {
  const byAnon = new Map(anonMapping.map(m => [m.key, m.anon]))
  const writerOf = new Map()
  for (const [key, a] of byAnon) {
    const [plan, spec] = key.split('|')
    writerOf.set(plan + '|' + a, spec)
  }
  const totals = new Map()
  for (const entry of judgeLog) {
    for (const s of (entry.scores || [])) {
      const spec = writerOf.get(entry.plan + '|' + s.label)
      if (!spec || (judgeSpec && spec === judgeSpec)) continue
      if (!totals.has(spec)) totals.set(spec, { n: 0, overall: 0, dims: {} })
      const t = totals.get(spec)
      t.n += 1
      t.overall += s.overall || 0
      for (const d of STORY_JUDGE_DIMENSIONS) {
        if (!Number.isFinite(s[d])) continue
        t.dims[d] = t.dims[d] || { n: 0, sum: 0 }
        t.dims[d].n += 1
        t.dims[d].sum += s[d]
      }
    }
  }
  return [...totals.entries()].map(([spec, t]) => ({
    writer: spec,
    stories: t.n,
    overall: t.n ? Math.round((t.overall / t.n) * 10) / 10 : null,
    dims: Object.fromEntries(Object.entries(t.dims).map(([d, v]) => [d, Math.round((v.sum / v.n) * 10) / 10])),
  })).sort((a, b) => (b.overall || 0) - (a.overall || 0))
}
