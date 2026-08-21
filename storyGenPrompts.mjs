// Prompt builders and response parsers for targeted story generation (FAB-9).
//
// Pure string work: given a manifest and a vocabulary pool, produce the
// prompts the pipeline sends and parse the plain text that comes back. No
// provider, no network — llm plumbing lives in storyGenPipeline.mjs, so these
// are unit-testable and the whole pipeline runs on scripted fake responses.
//
// The plain-text protocol (TITLE: line + one story line per line, never JSON)
// is inherited from generate-serial-stories.mjs, where JSON kept breaking on
// multi-line CJK prose. The critique rubric and its calibrated scale are
// inherited from the same pipeline — a model scoring its own output drifts
// generous unless the scale is anchored.

import { BIBLE_CHINESE, levelConfig } from './storyLevels.mjs'

export const PROMPT_VERSION = 'fab9-prompts@1'

const CHAPTER_FORMAT =
  'Output format — plain text, NOT JSON, no markdown, no quotes around lines:\n' +
  'First line exactly: TITLE: <short story title in Chinese, no numbering>\n' +
  'Then each story line on its OWN line — nothing else (no numbering, no blank lines).'

function levelName(manifest) {
  const cfg = levelConfig(manifest.language, manifest.system, manifest.level)
  return (cfg && cfg.levelName) || ('HSK ' + manifest.level)
}

// The allowed pool listed in the prompt. Big pools would drown the prompt, so
// only a slice is listed — the manifest's targets travel separately in every
// prompt, and the validator polices against the FULL pool, so being stricter
// in the prompt than in validation is safe.
//
// The slice must be STRATIFIED BY LEVEL. The pool arrives level-ordered, so a
// plain `slice(0, cap)` handed an HSK 3 job a list of 280 HSK 1 words and
// ZERO words from HSK 2 or HSK 3 (measured on the real pool: 300/197/453
// words per level). The model was being shown beginner vocabulary and asked
// to write at level — which is exactly what bench-1's rejected candidates
// looked like: fluent Chinese reaching far above the level because the level's
// own words were never on the page.
//
// Allocation is proportional to each level's share of the pool, with any
// remainder going to the HIGHEST levels first: the level being taught is the
// one whose vocabulary the writer most needs to see.
export function poolForPrompt(pool, cap = 280) {
  const format = (items) => items.map(v => v.word + (v.meaning ? ' (' + v.meaning + ')' : '')).join(', ')
  if (pool.length <= cap) return format(pool)

  const byLevel = new Map()
  for (const v of pool) {
    const key = Number.isFinite(v.level) ? v.level : 0
    if (!byLevel.has(key)) byLevel.set(key, [])
    byLevel.get(key).push(v)
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b)

  const quota = new Map()
  let assigned = 0
  for (const l of levels) {
    const q = Math.max(1, Math.floor((cap * byLevel.get(l).length) / pool.length))
    quota.set(l, q)
    assigned += q
  }
  let left = cap - assigned
  for (let i = levels.length - 1; left > 0 && i >= 0; i -= 1) {
    const l = levels[i]
    const add = Math.min(byLevel.get(l).length - quota.get(l), left)
    if (add > 0) { quota.set(l, quota.get(l) + add); left -= add }
  }

  const out = []
  for (const l of levels) out.push(...byLevel.get(l).slice(0, quota.get(l)))
  return format(out)
}

function targetList(manifest, meanings = {}) {
  return manifest.targets
    .map(t => t.word + (meanings[t.word] ? ' (' + meanings[t.word] + ')' : '') + ' — use ' + t.min + '-' + t.max + ' times')
    .join('\n')
}

export function draftPrompt({ manifest, pool, meanings = {} }) {
  const name = levelName(manifest)
  return 'Write a standalone ' + name + ' Chinese graded-reader story.\n\n' +
    'Recurring characters (use some of these, keep their personalities consistent):\n' + BIBLE_CHINESE.text + '\n\n' +
    (manifest.theme ? 'Theme: ' + manifest.theme + '\n' : '') +
    (manifest.seasonSeed ? 'Story shape: ' + manifest.seasonSeed + '.\n' : '') +
    (manifest.series && manifest.series.prevRecap ? 'Previously: ' + manifest.series.prevRecap + '\n' : '') +
    '\nTARGET WORDS — this story exists to teach these. Every one MUST appear, woven in naturally (different sentence patterns, never listed or forced), within its occurrence range:\n' +
    targetList(manifest, meanings) + '\n\n' +
    'ALLOWED VOCABULARY — build the rest of the text mainly from these words plus names, particles and basic grammar:\n' +
    poolForPrompt(pool) + '\n\n' +
    'Rules:\n' +
    '- ' + manifest.length.minLines + '-' + manifest.length.maxLines + ' lines, one sentence or dialogue turn per line — a full scene, not a sketch\n' +
    '- Natural sentences around ' + manifest.length.maxLineChars + ' characters per line — vary the rhythm, avoid choppy three-word lines\n' +
    '- Mix narration and dialogue. Dialogue format: NAME：text — speakers ONLY from: ' + manifest.speakers.join(', ') + '\n' +
    '- Narration lines have no speaker prefix\n' +
    '- Stay almost entirely inside the allowed vocabulary. At most ' + manifest.difficulty.maxUnknownDistinct + ' words outside it, only where the story genuinely needs them\n' +
    (manifest.forbidden && manifest.forbidden.words.length ? '- NEVER use these words: ' + manifest.forbidden.words.join('、') + '\n' : '') +
    (manifest.forbidden && manifest.forbidden.topics && manifest.forbidden.topics.length ? '- Avoid these topics entirely: ' + manifest.forbidden.topics.join('; ') + '\n' : '') +
    '- Write something a reader would actually enjoy: a real narrative arc, concrete sensory detail, a little humor, genuine character voice\n\n' +
    CHAPTER_FORMAT
}

// Targeted repair: the model is told exactly what the deterministic validator
// rejected, not asked to regenerate blind.
export function repairPrompt({ manifest, candidate, failures, pool, meanings = {} }) {
  const name = levelName(manifest)
  return 'This ' + name + ' Chinese graded-reader story failed automatic validation. Fix ONLY the problems listed; keep the plot, characters and everything already compliant unchanged. Preserve the natural, story-like flow — do not make it stiff.\n\n' +
    'Problems:\n' + failures.map(f => '- ' + f.message).join('\n') + '\n\n' +
    'Story:\nTITLE: ' + candidate.title + '\n' + candidate.content + '\n\n' +
    'TARGET WORDS (must stay within their ranges):\n' + targetList(manifest, meanings) + '\n\n' +
    'ALLOWED VOCABULARY (replace out-of-pool words using ONLY these plus names, particles and basic grammar):\n' +
    poolForPrompt(pool) + '\n\n' +
    'Keep ' + manifest.length.minLines + '-' + manifest.length.maxLines + ' lines, dialogue format NAME：text, speakers only from: ' + manifest.speakers.join(', ') + '\n\n' +
    CHAPTER_FORMAT
}

export function critiquePrompt({ manifest, candidate }) {
  const name = levelName(manifest)
  return 'You are a demanding editor of graded readers for ' + name + ' Chinese learners. Score this story.\n\n' +
    'Story:\n' + candidate.content + '\n\n' +
    'Judge it on:\n' +
    '- Natural, idiomatic Chinese (not translated-sounding, not choppy baby prose, no repeated sentence shapes)\n' +
    '- An actual story: concrete events, cause and effect, a reason to keep reading\n' +
    '- Distinct character voices — could you tell who is speaking with the names removed?\n' +
    '- The vocabulary it must teach is woven in invisibly — nothing reads like a word list\n' +
    '- Appropriate for the level (simple grammar, but never insulting or babyish)\n\n' +
    'Calibration — use the WHOLE scale, and be hard to please:\n' +
    '- 9-10: publishable as-is in a good graded reader. Rare.\n' +
    '- 7-8: solid. Real story, natural language, minor blemishes only.\n' +
    '- 5-6: readable but flat — thin plot, interchangeable voices, or stiff prose.\n' +
    '- 1-4: broken, incoherent, or barely a story.\n' +
    'Most drafts are a 5 or 6. Do not award 7+ out of politeness.\n\n' +
    'Output format — plain text, NOT JSON. Exactly two lines:\n' +
    'SCORE: <a single number 1-10>\n' +
    'FEEDBACK: <2-4 specific, actionable problems (or what works, if 9+)>'
}

export function qualityRevisePrompt({ manifest, candidate, feedback, pool, meanings = {} }) {
  const name = levelName(manifest)
  return 'Revise this ' + name + ' Chinese graded-reader story based on the editor\'s feedback. Keep the same plot and cast.\n\n' +
    'Editor feedback:\n' + feedback + '\n\n' +
    'Story:\nTITLE: ' + candidate.title + '\n' + candidate.content + '\n\n' +
    'Constraints (unchanged):\n' +
    '- ' + manifest.length.minLines + '-' + manifest.length.maxLines + ' lines; dialogue format NAME：text; speakers only from: ' + manifest.speakers.join(', ') + '\n' +
    '- TARGET WORDS that must stay present, within their ranges:\n' + targetList(manifest, meanings) + '\n' +
    '- ALLOWED VOCABULARY (plus names, particles, basic grammar):\n' + poolForPrompt(pool) + '\n\n' +
    CHAPTER_FORMAT
}

export function translatePrompt({ candidate }) {
  const lines = candidate.content.split('\n').map(l => l.trim()).filter(Boolean)
  return 'Translate this Chinese graded-reader story to natural English, line by line.\n\n' +
    lines.map((l, i) => (i + 1) + '. ' + l).join('\n') + '\n\n' +
    'Rules:\n' +
    '- EXACTLY ' + lines.length + ' lines, same order, one translation per line\n' +
    '- Keep dialogue format: Speaker: English text (romanize the speaker name, e.g. 李明 → Li Ming)\n' +
    '- Natural English, not word-by-word\n\n' +
    'Output format — plain text, NOT JSON: exactly ' + lines.length + ' lines, one English translation per line, in order, nothing else (no numbering).'
}

// ── Parsers ──────────────────────────────────────────────────────────────────

// "TITLE: xxx" then one story line per line → { title, content } or null.
export function parseChapter(text) {
  const raw = String(text || '')
    .replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '')
    .split('\n').map(l => l.trim()).filter(Boolean)
  if (raw.length < 2) return null
  let title = ''
  const lines = []
  for (const line of raw) {
    const up = line.toUpperCase()
    if (!title && (up.startsWith('TITLE:') || up.startsWith('TITLE：'))) {
      const ci = line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('：')
      title = line.slice(ci + 1).trim()
      continue
    }
    lines.push(line)
  }
  if (!title || lines.length < 3) return null
  return { title, content: lines.join('\n') }
}

// "SCORE: n" / "FEEDBACK: ..." → { score, feedback } or null.
export function parseCritique(text) {
  let score = null
  let feedback = ''
  for (const line of String(text || '').split('\n')) {
    const t = line.trim()
    const up = t.toUpperCase()
    if (up.startsWith('SCORE')) {
      // First number only: "SCORE: 8/10" must read as 8. Concatenating the
      // line's digits (inherited from the serial generator) made that 81,
      // which clamped to a perfect 10 — silent quality inflation.
      const m = t.match(/\d+(?:\.\d+)?/)
      if (m) score = Math.max(1, Math.min(10, Math.round(parseFloat(m[0]))))
    } else if (up.startsWith('FEEDBACK')) {
      const ci = t.indexOf(':') >= 0 ? t.indexOf(':') : t.indexOf('：')
      feedback = ci >= 0 ? t.slice(ci + 1).trim() : ''
    } else if (feedback) {
      feedback += ' ' + t
    }
  }
  return score != null ? { score, feedback } : null
}

// Line-aligned translation. Tolerates ±2 lines (models occasionally merge or
// split one) by padding/trimming — the same tolerance the serial pipeline
// earned the hard way. Returns the aligned text or null.
export function parseTranslation(text, expectedLines) {
  const out = String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
  if (Math.abs(out.length - expectedLines) > 2) return null
  while (out.length < expectedLines) out.push('')
  return out.slice(0, expectedLines).join('\n')
}
