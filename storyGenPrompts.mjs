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

export const PROMPT_VERSION = 'fab9-prompts@2'

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
    // The writer aims for the MIDDLE of the allowed range, not the ceiling:
    // duo-1's 49-line drafts against a 38 ceiling forced the editor into
    // rewrites. draftLines is the creative target; maxLines stays the law.
    '- Write ' + (manifest.length.draftLines ? manifest.length.draftLines[0] + '-' + manifest.length.draftLines[1] : manifest.length.minLines + '-' + manifest.length.maxLines) + ' lines, one complete story unit (one sentence or one dialogue turn) per physical line. '
      + (manifest.length.draftLines ? 'DO NOT exceed ' + manifest.length.draftLines[1] + ' lines; ' + manifest.length.maxLines + ' is a validator ceiling, not a writing target. ' : '')
      + 'Anything longer than ' + manifest.length.maxLines + ' lines is rejected outright\n' +
    '- Natural sentences around ' + manifest.length.maxLineChars + ' characters per line — vary the rhythm, avoid choppy three-word lines\n' +
    '- Mix narration and dialogue. A dialogue label is ONLY a bare allowed speaker name followed by ：. Write "李明：我饿了。" — NEVER "李明惊讶地问：…", NEVER "小红说：…", NEVER "那位女人：…", NEVER "她指着角落：…". Any description goes on its own narration line. Speakers ONLY from: ' + manifest.speakers.join(', ') + '\n' +
    '- Narration lines have no speaker prefix\n' +
    // The single hardest constraint to convey, and the one bench-3 showed being
    // ignored wholesale: qwen wrote 56-73 distinct words above the level
    // against a cap of 3. A soft "stay almost entirely inside the list" does
    // not survive contact with a model that writes well — the rule has to be
    // stated as a rejection condition, with the numbers, and has to say what
    // "outside" means when the printed list is necessarily a sample.
    '- HARD VOCABULARY LIMIT — this is what gets stories rejected. Write using ONLY words a ' + name + ' learner knows: the list above, simpler words below that level, and the character names. ' +
    'At most ' + manifest.difficulty.maxOutOfLevelDistinct + ' distinct words from ABOVE ' + name + ', and at most ' +
    manifest.difficulty.maxUnknownDistinct + ' distinct words that are not standard vocabulary at all. ' +
    'The printed list is a sample of what is allowed, not the whole of it — but if you are unsure whether a word is too advanced, do not use it. ' +
    'Vivid literary vocabulary (懒洋洋, 灌木, 明媚, 身影 and the like) is exactly what fails this check.\n' +
    (manifest.forbidden && manifest.forbidden.words.length ? '- NEVER use these words: ' + manifest.forbidden.words.join('、') + '\n' : '') +
    (manifest.forbidden && manifest.forbidden.topics && manifest.forbidden.topics.length ? '- Avoid these topics entirely: ' + manifest.forbidden.topics.join('; ') + '\n' : '') +
    '- Write something a reader would actually enjoy: a real narrative arc, concrete sensory detail, a little humor, genuine character voice\n\n' +
    CHAPTER_FORMAT
}

// Writer self-condense — the WRITER shortens and format-fixes ITS OWN story
// (fab9-duo@3). The controlled tests proved the cross-model editor rewrites
// rather than edits (duo-1/duo-2: containment 2-8%), and that Qwen with
// reasoning enabled produces no output at all on this tier — so the one model
// that can hold this story's voice is the one that wrote it. The prompt frames
// the task as unambiguous self-editing; the deterministic preservation gate
// (validateEdit) still runs on the result, because framing is not enforcement.
export function selfCondensePrompt({ manifest, candidate, failures, meanings = {} }) {
  const name = levelName(manifest)
  const lo = manifest.length.draftLines ? manifest.length.draftLines[0] : manifest.length.minLines
  const hi = manifest.length.draftLines ? manifest.length.draftLines[1] : manifest.length.maxLines
  return 'This is an EDIT of your existing story, not a new story generation task.\n\n' +
    'You wrote the ' + name + ' graded-reader story below. It is a good story that failed mechanical validation. ' +
    'Produce a shorter, compliant version of THE SAME STORY.\n\n' +
    'Validation failures to fix:\n' + failures.map(f => '- ' + f.message).join('\n') + '\n\n' +
    'Non-negotiable rules:\n' +
    '1. Same plot, same events, same characters, same ending. Introduce NO new characters, locations or plot events.\n' +
    '2. Keep the title EXACTLY: ' + candidate.title + '\n' +
    '3. Reduce to ' + lo + '-' + hi + ' lines by CUTTING redundant dialogue and side details — never by inventing replacement scenes.\n' +
    '4. Dialogue labels are ONLY a bare allowed speaker name plus ：, e.g. "小红：…". Never "小红说：…" or any描述 before the colon; turn other people\'s lines into narration. Allowed speakers: ' + manifest.speakers.join(', ') + '\n' +
    '5. Keep every TARGET WORD within its range (weave in an extra natural use if one is under):\n' + targetList(manifest, meanings) + '\n' +
    '6. Replace unnecessarily difficult vocabulary with plain ' + name + '-or-below words while you cut.\n' +
    '7. Keep the sentences that carry the story\'s voice — cut quantity, not character.\n\n' +
    CHAPTER_FORMAT
}

// Constrained simplification — the EDITOR's prompt in the two-model flow
// (write → simplify). The writer model produces the story; this hands it to a
// more obedient model whose only job is to bring it inside the deterministic
// constraints WITHOUT re-imagining it. Explicitly not a rewrite: plot, cast,
// scene order and the target vocabulary stay; advanced words get replaced
// with in-level equivalents, long stretches get cut, sentences get simpler.
export function simplifyPrompt({ manifest, candidate, failures, pool, meanings = {} }) {
  const name = levelName(manifest)
  return 'You are the EDITOR of a ' + name + ' Chinese graded reader. Another writer produced the story below. ' +
    'It is a good story that fails mechanical validation. Your job is to EDIT it into compliance — you are not the author.\n\n' +
    'DO NOT invent a new story, change the plot, add scenes, or alter what happens. Preserve the events, the cast, the tone and the story\'s voice as far as the constraints allow.\n\n' +
    'Validation failures to fix (fix ONLY these):\n' + failures.map(f => '- ' + f.message).join('\n') + '\n\n' +
    'How to edit:\n' +
    '- Replace every word above ' + name + ' with a simpler in-level equivalent, or rephrase the sentence so it is not needed. Plainer and passing beats vivid and rejected.\n' +
    '- If the story is too long, CUT — merge thin lines, drop asides — do not compress by writing denser sentences. Target ' + manifest.length.minLines + '-' + manifest.length.maxLines + ' lines.\n' +
    '- Keep every TARGET WORD, within its range (add an occurrence naturally if one is below range):\n' + targetList(manifest, meanings) + '\n' +
    '- Dialogue lines are exactly NAME：text with NOTHING after the name (write "李明：…", never "李明惊讶地问：…"). Speakers only from: ' + manifest.speakers.join(', ') + '. Turn any other speaker\'s line into narration.\n' +
    '- Keep sentences short and structures simple — ' + name + ' grammar only.\n\n' +
    'ALLOWED VOCABULARY (a sample of what the learner knows — replacements must come from words at this level or below):\n' +
    poolForPrompt(pool) + '\n\n' +
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
    'Every replacement must be a word a ' + name + ' learner knows. Simplify rather than substitute another advanced word — ' +
    'a plainer sentence that passes is worth more than a vivid one that is rejected.\n' +
    'Keep ' + manifest.length.minLines + '-' + manifest.length.maxLines + ' lines (this is a hard limit), dialogue format NAME：text with NOTHING after the name — ' +
    'write "李明：…", never "李明惊讶地问：…" — speakers only from: ' + manifest.speakers.join(', ') + '\n\n' +
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

// Patch-based micro repair — for NARROW failures only (a target one
// occurrence short, one spammed target, one overlong line). Rewriting a whole
// story to add one word invites quality drift; instead the model sees the
// numbered lines and must return ONLY the lines it changes. The patch is
// applied deterministically (storyDuoPipeline.applyLinePatch), so every other
// line stays byte-for-byte identical, then the FULL validator re-runs.
export function microRepairPrompt({ manifest, candidate, failures, meanings = {}, maxChanged = 3 }) {
  const name = levelName(manifest)
  const lines = candidate.content.split('\n').map(l => l.trim()).filter(Boolean)
  return 'Minimal surgical edit to a ' + name + ' Chinese graded-reader story. The story is good; it fails validation on the small points below. Fix them by changing AS FEW LINES AS POSSIBLE — at most ' + maxChanged + '.\n\n' +
    'Problems:\n' + failures.map(f => '- ' + f.message).join('\n') + '\n\n' +
    'Guidance:\n' +
    '- To raise a word\'s count: rework an existing line so the word fits naturally (do not bolt it on).\n' +
    '- To lower a word\'s count: rephrase one line that uses it, keeping the meaning.\n' +
    '- To shorten an overlong line: split or trim THAT line only.\n' +
    '- Replacement lines use only ' + name + '-or-below vocabulary, and dialogue stays NAME：text with speakers from: ' + manifest.speakers.join(', ') + '\n\n' +
    'Story (numbered):\n' +
    lines.map((l, i) => (i + 1) + ': ' + l).join('\n') + '\n\n' +
    'Output format — ONLY the changed lines, nothing else, one per line:\n' +
    'LINE <number>: <full new text of that line>\n' +
    'Do not repeat unchanged lines. Do not add or remove lines. No commentary.'
}

// Bounded structural patch — the widened micro-repair (still patch-based,
// still structurally incapable of a rewrite). Three operations against
// numbered lines, hard-capped at `maxTouched` total:
//   REPLACE LINE n: <new text>     DELETE LINE n     INSERT AFTER n: <text>
// Replacement is preferred over insertion; insertion exists only for a
// missing target that no existing line can naturally carry. The patcher's
// only job is the listed deterministic failures — it is told, verbatim, not
// to make the story better.
//
// Two hard constraints beyond the budget, both added after the patch-test-2
// run (2026-08-21) fixed every listed failure yet still failed the story:
//
//   1. NO NEW ABOVE-LEVEL VOCABULARY. That run "fixed" two unknown words by
//      swapping in harder known ones (一张 → 一幅, 幅 is HSK 4; 留在 → 留下,
//      HSK 4) — satisfying the unknown-word gate by feeding the out-of-level
//      one. Only manifest targets may sit above the story's level.
//   2. NO METRIC REGRESSION ACROSS A BOUNDARY. Deleting text shrinks the
//      denominator of the out-of-level share, so deleting EASY lines raises
//      it: that run's two deletions removed 35 characters carrying only 3
//      above-level ones and pushed 10.4% → 10.9%, past the 10.5% ceiling.
//      `shareLimit` states the current value and the ceiling explicitly, and
//      `lineOutCounts` gives the per-line above-level character counts so the
//      choice of which line to delete is informed rather than blind.
//
// The prompt asking is not the enforcement — storySelectPipeline's
// newAboveLevelWords/patchRegressions reject a violating patch deterministically.
export function structuralPatchPrompt({ manifest, candidate, failures, meanings = {}, lineHints = [], maxTouched = 6, lineOutCounts = null, shareLimit = null, rejected = null }) {
  const name = levelName(manifest)
  const lines = candidate.content.split('\n').map(l => l.trim()).filter(Boolean)
  const pct = (x) => (x * 100).toFixed(1) + '%'
  const numbered = lines.map((l, i) => {
    const n = lineOutCounts && lineOutCounts[i] ? lineOutCounts[i] : 0
    return (i + 1) + (lineOutCounts ? ' [' + n + '↑]' : '') + ': ' + l
  }).join('\n')
  return 'Minimal structural patch for a ' + name + ' Chinese graded-reader story. ' +
    'The story failed validation on EXACTLY the points below. Your ONLY job is to satisfy them with the fewest possible local changes while preserving the meaning of every touched line.\n\n' +
    'Do NOT make the story better. Do NOT rewrite or simplify it generally. Do NOT touch the title. Do NOT add characters, speakers, scenes or events. Any line you do not name stays exactly as it is.\n\n' +
    (rejected ? 'YOUR PREVIOUS PATCH WAS REJECTED:\n' + rejected.map(r => '- ' + r).join('\n') + '\nProduce a new complete patch that avoids this.\n\n' : '') +
    'Problems to solve (all of them, nothing else):\n' + failures.map(f => '- ' + f.message).join('\n') + '\n\n' +
    (lineHints.length ? 'Deterministic hints (derived from the failures):\n' + lineHints.map(h => '- ' + h).join('\n') + '\n\n' : '') +
    'HARD CONSTRAINT 1 — no new above-level words. Every line you write (REPLACE or INSERT) must use ONLY ' + name + '-or-below vocabulary. ' +
    'The one exception is the target words listed below, which are allowed wherever they belong.\n' +
    'Never trade an unknown word for a HARDER known one — that fails a different gate. Two swaps rejected in an earlier run of this exact task: 一张 → 一幅 (幅 is above ' + name + ') and 留在 → 留下 (留下 is above ' + name + '). ' +
    'Reach for the plainest, most common wording you know instead.\n\n' +
    (shareLimit ? 'HARD CONSTRAINT 2 — do not make the story harder. ' + pct(shareLimit.current) + ' of this story\'s characters are already above ' + name + '; the ceiling is ' + pct(shareLimit.ceiling) + '. ' +
      'Your patch must leave it at or below ' + pct(shareLimit.ceiling) + ', and ideally below ' + pct(shareLimit.current) + '.\n' +
      'This percentage is above-level characters ÷ total characters, so it rises BOTH when you add a hard word AND when you delete an easy line. ' +
      'Each numbered line below is marked [N↑] with how many above-level characters it carries: to lose lines, delete ones with a HIGH [N↑] — deleting a [0↑] or [1↑] line pushes the percentage up.\n\n' : '') +
    'How to fix:\n' +
    '- Too many lines → DELETE the least essential line(s), preferring high [N↑] lines, or merge two by replacing one and deleting the other.\n' +
    '- A target word below its minimum → REPLACE an existing line so the word fits naturally. Use INSERT AFTER only if no replacement can carry it. Targets and ranges:\n' + targetList(manifest, meanings) + '\n' +
    '- A difficult or unknown word → REPLACE its line, swapping that word for a plain ' + name + '-or-below equivalent, keeping the line\'s meaning.\n' +
    '- Dialogue stays NAME：text with speakers only from: ' + manifest.speakers.join(', ') + '\n\n' +
    'HARD BUDGET: at most ' + maxTouched + ' operations total (each REPLACE, DELETE or INSERT counts as one). If it cannot be done within ' + maxTouched + ', output the single line: IMPOSSIBLE\n\n' +
    'Story (numbered' + (lineOutCounts ? '; [N↑] = above-level characters on that line' : '') + '):\n' +
    numbered + '\n\n' +
    'Output — ONLY operations, one per line, nothing else:\n' +
    'REPLACE LINE <n>: <full new text of that line>\n' +
    'DELETE LINE <n>\n' +
    'INSERT AFTER <n>: <full new line>'
}

// IMPOSSIBLE is a VALID terminal patcher answer — the prompt offers it as the
// alternative to exceeding the budget. Callers must check this BEFORE
// parseStructuralPatch and treat a hit as final: no retry, no reprompt (the
// patch-test-1 run burned two redundant requests re-asking). Only a line that
// is exactly IMPOSSIBLE counts; prose that merely contains the word does not.
export function isImpossiblePatch(text) {
  return String(text || '').split('\n').some(l => /^impossible[.。!！]?$/i.test(l.trim()))
}

// Parse structural patch operations → [{op, line, text?}] or null (bad
// syntax, out of range, duplicate ops on one line, or over budget). An
// IMPOSSIBLE declaration also returns null — but callers distinguish it via
// isImpossiblePatch above, so it is never mistaken for a parse failure.
export function parseStructuralPatch(text, lineCount, maxTouched = 6) {
  const raw = String(text || '')
  if (isImpossiblePatch(raw)) return null
  const ops = []
  const touched = new Set()
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let m
    if ((m = t.match(/^REPLACE\s+LINE\s+(\d+)\s*[:：]\s*(.+)$/i))) {
      const n = parseInt(m[1], 10)
      if (n < 1 || n > lineCount || touched.has('l' + n) || !m[2].trim()) return null
      touched.add('l' + n)
      ops.push({ op: 'replace', line: n, text: m[2].trim() })
    } else if ((m = t.match(/^DELETE\s+LINE\s+(\d+)\s*$/i))) {
      const n = parseInt(m[1], 10)
      if (n < 1 || n > lineCount || touched.has('l' + n)) return null
      touched.add('l' + n)
      ops.push({ op: 'delete', line: n })
    } else if ((m = t.match(/^INSERT\s+AFTER\s+(\d+)\s*[:：]\s*(.+)$/i))) {
      const n = parseInt(m[1], 10)
      if (n < 0 || n > lineCount || !m[2].trim()) return null
      ops.push({ op: 'insert', line: n, text: m[2].trim() })
    }
    // anything else is prose noise — ignored, the ops lines are the protocol
  }
  if (ops.length === 0 || ops.length > maxTouched) return null
  return ops
}

// Parse "LINE 7: …" entries → [{ line, text }] (1-based), or null when
// nothing parseable / out of range / too many changes / duplicates.
export function parseLinePatch(text, lineCount, maxChanged = 3) {
  const out = []
  const seen = new Set()
  for (const raw of String(text || '').split('\n')) {
    const m = raw.trim().match(/^LINE\s+(\d+)\s*[:：]\s*(.+)$/i)
    if (!m) continue
    const line = parseInt(m[1], 10)
    const body = m[2].trim()
    if (!body || line < 1 || line > lineCount || seen.has(line)) return null
    seen.add(line)
    out.push({ line, text: body })
  }
  if (out.length === 0 || out.length > maxChanged) return null
  return out
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
