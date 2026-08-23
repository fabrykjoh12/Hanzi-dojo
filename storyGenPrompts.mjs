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

// ── One line, nothing to plan (fab9-repair-plan@1) ──────────────────────────
// The tiny task the deterministic planner hands out. Everything the earlier
// whole-story patcher had to work out for itself — which line, why, what the
// budget is, what it must not disturb — is already decided; what is left is
// writing one Chinese sentence to an explicit contract. The per-line gate
// (storyRepairPlanner.validateReplacementLine) checks the result before it can
// touch the story, and its failures come back as `feedback` on a retry.
export function lineRewritePrompt({ manifest, task, meanings = {}, context = {}, feedback = null }) {
  const name = levelName(manifest)
  const lines = []
  lines.push('Rewrite LINE ' + task.line + ' of a ' + name + ' Chinese graded-reader story. Return exactly ONE line.')
  lines.push('')
  if (context.before && context.before.length) {
    lines.push('The lines before it (context — do NOT rewrite these):')
    lines.push(context.before.join('\n'))
    lines.push('')
  }
  lines.push('LINE ' + task.line + ' as it stands — this is the only line you rewrite:')
  lines.push(task.text)
  lines.push('')
  if (context.after && context.after.length) {
    lines.push('The lines after it (context — do NOT rewrite these):')
    lines.push(context.after.join('\n'))
    lines.push('')
  }
  if (feedback && feedback.length) {
    lines.push('YOUR PREVIOUS LINE WAS REJECTED:')
    lines.push(feedback.map(f => '- ' + f).join('\n'))
    lines.push('')
  }
  lines.push('Requirements:')
  lines.push('- Keep this line\'s job in the scene: same meaning, same moment, same information.')
  lines.push(task.speaker
    ? '- It is dialogue spoken by ' + task.speaker + '. Write it exactly as "' + task.speaker + '：<text>".'
    : '- It is narration. No speaker label, no colon-prefixed name.')
  for (const word of (task.addTargets || [])) {
    lines.push('- The line MUST contain ' + word + (meanings[word] ? ' (' + meanings[word] + ')' : '') + ', used naturally — not bolted on.')
  }
  for (const word of (task.removeTargets || [])) {
    lines.push('- Use ' + word + ' LESS often than the current line does — say it another way.')
  }
  for (const run of (task.removeRuns || [])) {
    lines.push('- The word ' + run + ' must NOT appear. Say the same thing with plainer, more common words.')
  }
  lines.push('- Use ONLY vocabulary at or below ' + name + '. Do not reach for a rarer or more literary word'
    + ((task.addTargets || []).length ? ' — the only exception is the required word above.' : '.'))
  lines.push('- Do NOT introduce a new character, place or plot event. Do not explain, foreshadow or summarize.')
  lines.push('- Keep it about ' + task.cjkChars + ' Chinese characters, like the original.')
  lines.push('')
  lines.push('Output: exactly ONE line of Chinese, nothing else — no numbering, no quotes, no English, no explanation.')
  return lines.join('\n')
}

// The response is one line. Tolerate a model that numbers it, quotes it, or
// says something first; refuse anything with no Chinese in it.
export function parseSingleLine(text) {
  for (const raw of String(text || '').split('\n')) {
    let t = raw.trim()
    if (!t) continue
    t = t.replace(/^(?:LINE\s*)?\d+\s*[:：.、]\s*/i, '').trim()
    t = t.replace(/^["'“”「『]+/, '').replace(/["'“”」』]+$/, '').trim()
    if (!/[一-鿿]/.test(t)) continue
    return t
  }
  return null
}

// ── Closed semantic questions (fab9-repair-plan@2) ──────────────────────────
// Two narrow places where the deterministic planner needs a judgement it
// cannot compute, and in both the model may only choose among options it is
// handed. It cannot propose a line, an operation, or a plot.

// 1. WHICH line should carry a missing target. repair-1 put 结束 ("to end")
// on a line about a secret photograph because that line held the most
// above-level characters; the critique called the result mechanical, and it
// was right. The planner still decides which lines are mechanically eligible.
export function hostRankPrompt({ manifest, target, meaning, candidates }) {
  const name = levelName(manifest)
  const blocks = candidates.map(c => [
    'LINE ' + c.line + (c.speaker ? ' (' + c.speaker + ' speaking)' : ' (narration)') + ':',
    ...(c.before || []).map(l => '  … ' + l),
    '  → ' + c.text,
    ...(c.after || []).map(l => '  … ' + l),
  ].join('\n')).join('\n\n')
  return 'A ' + name + ' Chinese graded-reader story must use the word ' + target
    + (meaning ? ' (' + meaning + ')' : '') + ' one more time.\n\n'
    + 'Exactly one of the lines below will be rewritten to include it. The rewrite must keep that line\'s meaning and its place in the story — the events of the story do not change.\n\n'
    + 'Which of these lines can most naturally be rewritten to include ' + target + '?\n\n'
    + blocks + '\n\n'
    + 'Rank ALL of the line numbers above, best first. Judge only how naturally ' + target
    + ' could belong in that line\'s own sentence and moment — not how good the line is.\n\n'
    + 'Output format — one per line, nothing else:\n'
    + 'LINE <number> — <short reason>\n'
    + 'Do not propose a new line, a new sentence, or any change to the story.'
}

// Ranked line numbers, restricted to the numbers actually offered — a model
// that invents a line number simply has that entry dropped.
export function parseHostRanking(text, allowed) {
  const allow = new Set(allowed)
  const seen = new Set()
  const out = []
  for (const raw of String(text || '').split('\n')) {
    const m = raw.trim().match(/^(?:\d+\s*[.)]\s*)?LINE\s+(\d+)\s*(?:[—–\-:：]\s*(.*))?$/i)
    if (!m) continue
    const line = parseInt(m[1], 10)
    if (!allow.has(line) || seen.has(line)) continue
    seen.add(line)
    out.push({ line, reason: (m[2] || '').trim() })
  }
  return out.length ? out : null
}

// 2. WHICH of several mechanically valid replacement lines is actually good
// Chinese. Judged inside its own context — the neighbouring lines are what
// make a sentence continuous or jarring — and with the sources anonymised, so
// the ranking cannot be a preference for one model's style.
export function lineJudgePrompt({ manifest, original, targets = [], context = {}, candidates }) {
  const name = levelName(manifest)
  const window = [
    ...(context.before || []).map(l => '  ' + l),
    '  >>> THE LINE BEING REPLACED: ' + original,
    ...(context.after || []).map(l => '  ' + l),
  ].join('\n')
  return 'Judge replacement lines for one line of a ' + name + ' Chinese graded-reader story.\n\n'
    + 'The passage as it stands:\n' + window + '\n\n'
    + (targets.length ? 'Each replacement had to include the word ' + targets.join('、') + '.\n\n' : '')
    + 'Candidate replacements:\n'
    + candidates.map(c => c.label + ': ' + c.text).join('\n') + '\n\n'
    + 'Score EVERY candidate as it would read in that passage, 1-10 on each:\n'
    + '- GRAMMAR: is it natural, correct, idiomatic Chinese?\n'
    + '- CONTINUITY: does it follow the line before and lead into the line after?\n'
    + '- ROLE: does it still do the original line\'s job in the scene?\n'
    + '- INTEGRATION: does the required word belong there, or is it wedged in?\n'
    + '- VOICE: does it sound like the same character or narrator?\n'
    + 'and answer MECHANICAL yes/no: does the sentence read as if it were built around the required word?\n'
    + 'Then OVERALL 1-10. Be strict: 8+ means a native writer would have written it, 5 means passable but flat, below 5 means clumsy or wrong.\n\n'
    + 'Output format — one line per candidate, nothing else:\n'
    + '<LABEL>: GRAMMAR <n> CONTINUITY <n> ROLE <n> INTEGRATION <n> VOICE <n> MECHANICAL <yes|no> OVERALL <n> — <short reason>'
}

export function parseLineJudgment(text, labels) {
  const want = new Set(labels)
  const out = []
  const num = (body, key) => {
    const m = body.match(new RegExp(key + '\\s*[:：]?\\s*(\\d{1,2})', 'i'))
    return m ? Math.min(10, parseInt(m[1], 10)) : null
  }
  for (const raw of String(text || '').split('\n')) {
    const t = raw.trim()
    const m = t.match(/^\**([A-H])\**\s*[:：.)]\s*(.+)$/)
    if (!m || !want.has(m[1])) continue
    const label = m[1]
    const body = m[2]
    if (out.some(x => x.label === label)) continue
    const mech = body.match(/MECHANICAL\s*[:：]?\s*(yes|no|true|false)/i)
    out.push({
      label,
      grammar: num(body, 'GRAMMAR'),
      continuity: num(body, 'CONTINUITY'),
      role: num(body, 'ROLE'),
      integration: num(body, 'INTEGRATION'),
      voice: num(body, 'VOICE'),
      mechanical: mech ? /^(yes|true)$/i.test(mech[1]) : null,
      overall: num(body, 'OVERALL'),
      reason: (body.split(/[—–]/)[1] || '').trim(),
    })
  }
  return out.length ? out : null
}

// ── Blueprint-first generation (fab9-blueprint@1) ───────────────────────────
// Planning is asked for as data, in English, with no Chinese prose in it. A
// planner that writes the story has not planned it, and a plan written in the
// story's own language invites the model to start drafting.

export function blueprintPrompt({ manifest, meanings = {}, totalLines, targets = null, pool = null, feedback = null }) {
  const name = levelName(manifest)
  const need = targets || manifest.targets.map(t => t.word)
  const list = manifest.targets
    .map(t => t.word + (meanings[t.word] ? ' (' + meanings[t.word] + ')' : '') + (need.includes(t.word) ? ' — REQUIRED' : ' — optional'))
    .join('\n')
  return 'Plan a short ' + name + ' Chinese graded-reader story. Do NOT write the story. Return a PLAN, in English, as JSON.\n\n'
    + (feedback ? 'YOUR PREVIOUS PLAN WAS REJECTED:\n' + feedback.map(f => '- ' + f).join('\n') + '\nFix exactly these problems.\n\n' : '')
    + 'Characters available (use 2-3 of them, no one else). Write their names in CHINESE exactly as shown, everywhere in the plan — in "cast", in every "speaker", anywhere you refer to them:\n'
    + manifest.speakers.join('、') + '\n\n'
    + 'Words the finished story must teach. Each REQUIRED word needs a beat where a person would genuinely need that word:\n' + list + '\n\n'
    + (manifest.theme ? 'Theme: ' + manifest.theme + '\n\n' : '')
    + (pool ? 'Words the reader already knows — the anchors must come from words like these (this is a sample, not the whole list):\n' + poolForPrompt(pool, 160) + '\n\n' : '')
    + 'Rules for the plan:\n'
    + '- ONE central problem. No subplots, no side quests, nothing invented just to fit a word in.\n'
    + '- 5 or 6 beats. Every beat after the first must happen BECAUSE of the beat before it — "because → therefore", never "and then".\n'
    + '- Every beat states when it happens and where. If a beat is somewhere new, say how they got there.\n'
    + '- Nothing may happen before the thing it depends on. Nobody appears where they could not be.\n'
    + '- The ending must resolve the problem the story started with.\n'
    + '- Keep it ordinary and concrete — a story a ' + name + ' learner can follow: everyday places, small stakes, real motives.\n'
    + '- The whole story is exactly ' + totalLines + ' lines of Chinese. Give each beat a share of that (2-8 lines each), adding up to about ' + totalLines + '.\n'
    + '- If a REQUIRED word has no place where it would naturally be needed, say so in "impossibleTargets" instead of forcing it.\n'
    // Lexical feasibility: a plan that is coherent in English but needs 扳手 or
    // 冰淇淋 to tell is not a level-3 plan. The toolkit is checked word by word
    // against the real vocabulary before any prose is written.
    + '- Every beat lists "chineseLexicalAnchors": 4-8 Chinese WORDS (not sentences) the beat can be written with. Every one must be a word a ' + name + ' learner already knows, or one of the target words. If a beat needs a word outside that — a tool, a dish, a piece of equipment — change the beat until it does not.\n'
    + '- For each target word, do not just say where it goes: say who says it, what it refers to, what they are trying to communicate, and give a short Chinese sentence showing it — the sketch must itself use only ' + name + ' words plus the targets.\n\n'
    + 'Output JSON only, no commentary, exactly this shape:\n'
    + '{\n'
    + '  "title": "<what the story is about, in English>",\n'
    + '  "chineseTitle": "<the story title in Chinese, 2-8 characters, only words the reader knows>",\n'
    + '  "setting": "<where and when, one line>",\n'
    + '  "cast": ["<2-3 names from the list above>"],\n'
    + '  "problem": "<the ONE thing the story is about>",\n'
    + '  "incitingEvent": "<what starts it>",\n'
    + '  "beats": [\n'
    + '    { "id": 1, "when": "<time>", "where": "<place>", "what": "<what changes here>", "because": "<why this follows — beat 1: \\"the story opens\\">", "arrivedHow": "<only if the place changed>", "targets": ["<target words used here>"], "chineseLexicalAnchors": ["<4-8 simple Chinese words this beat is written with>"], "lines": <2-8> }\n'
    + '  ],\n'
    + '  "resolution": "<how the central problem ends>",\n'
    + '  "targetPlan": [ { "word": "<target>", "beat": <n>, "why": "<why a person would need this word right here — at least a sentence>", "speaker": "<which character says it, or narrator>", "refersTo": "<the thing in the story it is about>", "intent": "<what they are trying to communicate>", "usageSketch": "<a short Chinese sentence using it, e.g. 比赛快结束了>" } ],\n'
    + '  "impossibleTargets": ["<any required word with no natural home>"]\n'
    + '}'
}

// JSON out of a model that may fence it, prefix it, or explain it first.
export function parseJsonObject(text) {
  const raw = String(text || '')
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try { return JSON.parse(body.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

export const parseBlueprint = parseJsonObject

// Ranking plans, anonymised, on the axes a plan can actually be judged on.
export function blueprintJudgePrompt({ manifest, levelName: level, candidates, dimensions }) {
  return 'You are choosing between story PLANS for a ' + level + ' Chinese graded reader. These are plans, not stories — judge the plotting, not the wording.\n\n'
    + candidates.map(c => 'PLAN ' + c.label + ':\n' + c.rendered).join('\n\n---\n\n') + '\n\n'
    + 'Score EVERY plan 1-10 on each:\n'
    + dimensions.map(([key, desc]) => '- ' + key.toUpperCase() + ': ' + desc).join('\n') + '\n'
    + 'and answer CONTRADICTION yes/no: does the plan contradict itself anywhere — a timeline that cannot happen, someone in two places, an object that moves without explanation, an ending about a different problem than the one it started with?\n'
    + 'Then OVERALL 1-10. Be strict: 8+ means you would hand this plan to a writer as-is, 5 means workable but thin, below 5 means the plot does not hold.\n\n'
    + 'Output — one line per plan, nothing else:\n'
    + '<LABEL>: ' + dimensions.map(([k]) => k.toUpperCase() + ' <n>').join(' ') + ' CONTRADICTION <yes|no> OVERALL <n> — <short reason>'
}

export function parseBlueprintJudgment(text, labels, dimensions) {
  const want = new Set(labels)
  const out = []
  const num = (body, key) => {
    const m = body.match(new RegExp(key + '\\s*[:：]?\\s*(\\d{1,2})', 'i'))
    return m ? Math.min(10, parseInt(m[1], 10)) : null
  }
  for (const raw of String(text || '').split('\n')) {
    const t = raw.trim()
    // The plans are shown to the judge as "PLAN A:", so it answers "PLAN A:".
    // blueprint-1 lost two whole manifests to a parser that only accepted a
    // bare label — the judge had scored them, and nothing could read it.
    const m = t.match(/^[-*•\s]*\**(?:PLAN|CANDIDATE|OPTION|STORY)?\s*([A-H])\**\s*[:：.)]\s*(.+)$/i)
    if (!m || !want.has(m[1].toUpperCase()) || out.some(x => x.label === m[1].toUpperCase())) continue
    const body = m[2]
    const mech = body.match(/CONTRADICTION\s*[:：]?\s*(yes|no|true|false)/i)
    const entry = { label: m[1].toUpperCase(), contradiction: mech ? /^(yes|true)$/i.test(mech[1]) : null, overall: num(body, 'OVERALL'), reason: (body.split(/[—–]/)[1] || '').trim() }
    for (const [key] of dimensions) entry[key] = num(body, key.toUpperCase())
    out.push(entry)
  }
  return out.length ? out : null
}

// ── A3: story shape and lexical scaffold are different jobs ────────────────
// blueprint-resume-1 settled it. Handed a structurally perfect plan and four
// named lexical violations, the planner reproduced the story exactly — same
// problem, cast, beats, chronology, causal chain, target placement — and then
// put 重 (HSK 4) into the title and a new sketch, and kept 深, both words it
// had just been told about. It can plan, and it can write Chinese, but not in
// the same breath. So the shape planner never writes Chinese at all, and every
// piece of Chinese is asked for on its own, against the vocabulary, and
// checked before the next piece is requested.

export function storyShapePrompt({ manifest, meanings = {}, totalLines, targets = null, feedback = null }) {
  const name = levelName(manifest)
  const need = targets || manifest.targets.map(t => t.word)
  const list = manifest.targets
    .map(t => t.word + (meanings[t.word] ? ' (' + meanings[t.word] + ')' : '') + (need.includes(t.word) ? ' — REQUIRED' : ' — optional'))
    .join('\n')
  return 'Plan the SHAPE of a short ' + name + ' Chinese graded-reader story. Write NO Chinese sentences: this is a plan, in English, and someone else writes the story from it.\n\n'
    + (feedback ? 'YOUR PREVIOUS PLAN WAS REJECTED:\n' + feedback.map(f => '- ' + f).join('\n') + '\nFix exactly these problems.\n\n' : '')
    // A32-fresh-1 and -2 lost three of four shapes to invented people —
    // "Husband", "The Neighbor (Woman)", "Li Ming (internal thought)". The
    // cast was in the preamble; it needed to be in the contract.
    + 'CAST IS CLOSED. These are the only people who exist in this story:\n'
    + manifest.speakers.map(sp => '  ' + sp).join('\n') + '\n\n'
    + 'Use 2-3 of them and nobody else. Every person who acts, speaks, thinks, helps, is helped, or is involved in any beat MUST be one of those names, written in CHINESE exactly as shown, everywhere in the plan — in "cast", in every "speaker", and in the beat text.\n'
    + 'Do NOT write Husband, Wife, Mother, Father, Neighbor, Shopkeeper, Courier, Teacher, Friend, The Man, The Woman, any other role label, any translated name, or any description of a person, unless that exact string is itself one of the names above.\n'
    + 'Do NOT create an unnamed or implied person — someone who phones, knocks, delivers, waits outside or is mentioned as needing something is a person, and must be one of the names above.\n'
    + 'Internal thought does not make a new speaker: if ' + manifest.speakers[0] + ' thinks something, the speaker is "' + manifest.speakers[0] + '" — never "' + manifest.speakers[0] + ' (internal thought)".\n'
    + 'If a story idea needs another person, choose a different story idea.\n\n'
    + 'Words the finished story must teach. Each REQUIRED word needs a beat where a person would genuinely need it:\n' + list + '\n\n'
    + (manifest.theme ? 'Theme: ' + manifest.theme + '\n\n' : '')
    + 'Rules:\n'
    + '- ONE central problem. No subplots, no side quests, nothing invented just to fit a word in.\n'
    + '- 5 or 6 beats. Every beat after the first happens BECAUSE of the beat before it — "because → therefore", never "and then".\n'
    + '- Every beat states when and where it happens. If a beat is somewhere new, say how they got there.\n'
    + '- Nothing happens before the thing it depends on. Nobody appears where they could not be.\n'
    + '- The ending resolves the problem the story started with.\n'
    + '- Keep it ordinary and concrete, and keep it SAYABLE by a beginner: everyday places, small stakes, ordinary objects. A scene needing specialist words (tools, equipment, machinery, food names) cannot be written at this level — plan a different scene.\n'
    + '- The whole story is exactly ' + totalLines + ' lines. Give each beat a share (2-8 lines) adding up to about ' + totalLines + '.\n'
    + '- If a REQUIRED word has no place where it would naturally be needed, list it in "impossibleTargets" instead of forcing it.\n\n'
    + 'Output JSON only, no commentary, exactly this shape:\n'
    + '{\n'
    + '  "title": "<what the story is about, in English>",\n'
    + '  "setting": "<where and when, one line>",\n'
    + '  "cast": ["<2-3 names from the list above>"],\n'
    + '  "problem": "<the ONE thing the story is about>",\n'
    + '  "incitingEvent": "<what starts it>",\n'
    + '  "beats": [\n'
    + '    { "id": 1, "when": "<time>", "where": "<place>", "what": "<what changes here>", "because": "<why this follows — beat 1: \\"the story opens\\">", "arrivedHow": "<only if the place changed>", "targets": ["<target words used here>"], "lines": <2-8> }\n'
    + '  ],\n'
    + '  "resolution": "<how the central problem ends>",\n'
    + '  "targetPlan": [ { "word": "<target>", "beat": <n>, "why": "<why a person would need this word right here>", "speaker": "<which character says it, or narrator>", "refersTo": "<the thing in the story it is about>", "intent": "<what they are trying to communicate>" } ],\n'
    + '  "impossibleTargets": ["<any required word with no natural home>"]\n'
    + '}'
}

// One title. Nothing else in the call.
export function titlePrompt({ manifest, blueprint, pool = null, feedback = null }) {
  const name = levelName(manifest)
  return 'Give a Chinese title for a ' + name + ' graded-reader story.\n\n'
    + (feedback ? 'YOUR PREVIOUS TITLE WAS REJECTED:\n' + feedback.map(f => '- ' + f).join('\n') + '\n\n' : '')
    + 'The story: ' + blueprint.problem + ' It ends: ' + blueprint.resolution + '\n\n'
    + 'Rules:\n'
    + '- 2 to 8 Chinese characters.\n'
    + '- ONLY words a ' + name + ' learner knows. If you are unsure a word is simple enough, do not use it.\n'
    + '- No Latin letters, no punctuation, no quotation marks.\n'
    + (pool ? '- Words the reader knows (a sample):\n  ' + poolForPrompt(pool, 120) + '\n' : '')
    + '\nOutput JSON only: {"title": "<the title>"}'
}

// One target, one sentence. The single most constrained call in the pipeline:
// blueprint-resume-1 drifted above level while writing five sketches and a
// title in one response, so nothing here writes more than one utterance.
export function targetSketchPrompt({ manifest, word, meaning, beat, entry, pool = null, feedback = null }) {
  const name = levelName(manifest)
  return 'Write ONE short Chinese sentence for a ' + name + ' graded reader.\n\n'
    + (feedback ? 'YOUR PREVIOUS SENTENCE WAS REJECTED:\n' + feedback.map(f => '- ' + f).join('\n') + '\n\n' : '')
    + 'It must use the word ' + word + (meaning ? ' (' + meaning + ')' : '') + '.\n\n'
    + 'The moment: ' + beat.what + '\n'
    + 'Who is speaking: ' + (entry.speaker || 'the narrator') + '\n'
    + 'What the word is about here: ' + (entry.refersTo || 'this moment') + '\n'
    + 'What they are trying to say: ' + (entry.intent || 'communicate something') + '\n\n'
    + 'Rules:\n'
    + '- The sentence must contain ' + word + ' exactly as written.\n'
    + '- Every OTHER word must be one a ' + name + ' learner already knows. This is what gets sentences rejected — if you are unsure, use a simpler word.\n'
    + '- 4 to 20 Chinese characters. No Latin letters. No speaker label, just the sentence.\n'
    + '- It should sound like something a person would actually say in that moment.\n'
    + (pool ? '- Words the reader knows (a sample):\n  ' + poolForPrompt(pool, 140) + '\n' : '')
    + '\nOutput JSON only: {"sentence": "<the sentence>"}'
}

// One beat's toolkit. Words, not sentences.
export function beatAnchorsPrompt({ manifest, beat, sketches = [], pool = null, candidates = null, feedback = null }) {
  const name = levelName(manifest)
  return 'List the Chinese words needed to write ONE short passage of a ' + name + ' graded reader.\n\n'
    + (feedback ? 'YOUR PREVIOUS LIST WAS REJECTED:\n' + feedback.map(f => '- ' + f).join('\n') + '\n\n' : '')
    + 'The passage: ' + beat.what + '\n'
    + 'Where and when: ' + beat.where + ', ' + beat.when + '\n'
    + (sketches.length ? 'It already has these sentences in it:\n' + sketches.map(s => '  ' + s.usageSketch).join('\n') + '\n' : '')
    + '\nRules:\n'
    + '- 3 to 6 words or short phrases. WORDS, not sentences.\n'
    + '- Every one must be a word a ' + name + ' learner already knows. A word the reader does not know cannot be in the list, however much the scene seems to need it — pick a simpler way to say it.\n'
    + '- No Latin letters. No names.\n'
    // A3.1: the words the reader has that actually fit THIS beat, found in the
    // vocabulary by code. a3-fresh-2 offered 黑 and then 亮 while 晚上, 晚, 天
    // and 时间 sat unused — the model can obey a vocabulary, it just cannot
    // search one. Suggestions only: everything is still validated.
    + (candidates && candidates.length
      ? '\nALLOWED RELEVANT VOCABULARY — words the reader knows that suit this passage. Prefer these where they say what the passage needs. They are suggestions, not a closed list: any other word is fine if it is also one a ' + name + ' learner knows.\n'
        + candidates.map(c => '  ' + c.word + ' — ' + c.meaning).join('\n') + '\n'
      : '')
    + (pool ? '- Words the reader knows (a wider sample):\n  ' + poolForPrompt(pool, 140) + '\n' : '')
    + '\nOutput JSON only: {"anchors": ["<word>", "<word>", …]}'
}

export function parseTitle(text) {
  const obj = parseJsonObject(text)
  const t = obj && typeof obj.title === 'string' ? obj.title.trim() : ''
  return t && !t.includes('\n') ? t : null
}

export function parseSketch(text) {
  const obj = parseJsonObject(text)
  const t = obj && typeof obj.sentence === 'string' ? obj.sentence.trim() : ''
  return t && !t.includes('\n') && /[一-鿿]/.test(t) ? t : null
}

export function parseAnchors(text) {
  const obj = parseJsonObject(text)
  const arr = obj && Array.isArray(obj.anchors) ? obj.anchors : null
  if (!arr) return null
  const out = arr.map(a => String(a == null ? '' : a).trim()).filter(Boolean)
  return out.length ? out : null
}

// ── One beat at a time ──────────────────────────────────────────────────────
// The whole-story call produced integration 2/10 three times out of three: a
// writer holding 28 lines states the plan instead of performing it. A beat is
// a closed task — this place, these people, this event, exactly these lines —
// small enough that the model has nothing to do but write good sentences.
export function beatPrompt({ manifest, blueprint, beat, alloc, meanings = {}, cast = [], sketches = [], tail = [], next = null, feedback = null }) {
  const name = levelName(manifest)
  const lines = []
  lines.push('Write beat ' + beat.id + ' of a ' + name + ' Chinese graded-reader story: EXACTLY ' + alloc.lines + ' lines, and nothing beyond this beat.')
  lines.push('')
  if (feedback && feedback.length) {
    lines.push('YOUR PREVIOUS ATTEMPT AT THIS BEAT WAS REJECTED:')
    lines.push(feedback.map(f => '- ' + f).join('\n'))
    lines.push('')
  }
  lines.push('The story so far — this is already written, do not repeat or rewrite it:')
  lines.push(tail.length ? tail.map(l => '  ' + l).join('\n') : '  (this is the opening beat)')
  lines.push('')
  lines.push('THIS BEAT:')
  lines.push('  Where: ' + beat.where + '   When: ' + beat.when)
  lines.push('  Who is here: ' + (cast.join('、') || manifest.speakers.join('、')))
  lines.push('  What happens: ' + beat.what)
  if (beat.because) lines.push('  Why it follows: ' + beat.because)
  if (next) lines.push('  What comes after (do NOT write it — just leave the story able to continue there): ' + next.what)
  lines.push('')
  if (Array.isArray(beat.chineseLexicalAnchors) && beat.chineseLexicalAnchors.length) {
    lines.push('Write it with words like these — they are all words the reader knows:')
    lines.push('  ' + beat.chineseLexicalAnchors.join('、'))
    lines.push('')
  }
  if (sketches.length) {
    lines.push('This beat must use:')
    for (const s of sketches) {
      lines.push('  ' + s.word + (meanings[s.word] ? ' (' + meanings[s.word] + ')' : '')
        + ' — ' + (s.speaker || 'someone') + ' says it about ' + (s.refersTo || 'this moment') + ', to ' + (s.intent || 'communicate something')
        + (s.usageSketch ? '. Something like: ' + s.usageSketch : ''))
    }
    lines.push('  Use it because the person genuinely means it here. Do NOT bend a sentence around the word.')
    lines.push('')
  }
  lines.push('Rules:')
  lines.push('- EXACTLY ' + alloc.lines + ' lines. Not ' + (alloc.lines - 1) + ', not ' + (alloc.lines + 1) + '.')
  lines.push('- This beat only. Do not start the next one, do not summarise, do not end the story.')
  lines.push('- No new characters, no new places, no objects that need a word the reader would not know.')
  lines.push('- Only ' + name + '-or-below vocabulary, plus the words named above. No Latin letters anywhere.')
  lines.push('- Dialogue is a bare name from ' + (cast.join('、') || manifest.speakers.join('、')) + ' then ：then what they say. Never 小明说：… — the name alone.')
  lines.push('- Make the dialogue sound like a person talking, not like a textbook example.')
  lines.push('')
  lines.push('Output JSON only: {"lines": [' + Array.from({ length: Math.min(alloc.lines, 3) }, () => '"<line>"').join(', ') + (alloc.lines > 3 ? ', … exactly ' + alloc.lines + ' strings' : '') + ']}')
  return lines.join('\n')
}

export function parseBeat(text, expectedLines) {
  const obj = parseJsonObject(text)
  const arr = obj && Array.isArray(obj.lines) ? obj.lines : null
  if (!arr) return null
  const lines = arr.map(l => String(l == null ? '' : l).trim()).filter(Boolean)
  if (lines.length !== expectedLines) return null
  if (lines.some(l => !/[一-鿿]/.test(l))) return null
  return lines
}

// The local judge sees only what it needs: where the story was, what this
// beat had to do, and the lines that came back.
export function beatJudgePrompt({ manifest, beat, lines, tail = [], sketches = [], dimensions }) {
  const name = levelName(manifest)
  return 'Judge a few lines of a ' + name + ' Chinese graded reader.\n\n'
    + 'The lines just before these (already accepted):\n' + (tail.length ? tail.map(l => '  ' + l).join('\n') : '  (this is the opening)') + '\n\n'
    + 'What this passage was supposed to do: ' + beat.what + '\n'
    + (sketches.length ? 'It had to use: ' + sketches.map(s => s.word + ' (' + (s.intent || 'to communicate something') + ')').join('; ') + '\n' : '')
    + '\nThe passage:\n' + lines.map(l => '  ' + l).join('\n') + '\n\n'
    + 'Score 1-10 on each:\n'
    + dimensions.map(([key, desc]) => '- ' + key.toUpperCase() + ': ' + desc).join('\n') + '\n'
    + 'and answer STUFFED yes/no: was any required word wedged into a sentence built around it, rather than used because the speaker meant it?\n'
    + 'Then OVERALL 1-10. Be strict: 8+ means a good graded reader would print this as it stands, 5 means understandable but flat, below 5 means clumsy, unnatural or off-task.\n\n'
    + 'Output one line, nothing else:\n'
    + dimensions.map(([k]) => k.toUpperCase() + ' <n>').join(' ') + ' STUFFED <yes|no> OVERALL <n> — <short reason>'
}

export function parseBeatJudgment(text, dimensions) {
  const body = String(text || '').replace(/\n/g, ' ')
  const num = (key) => {
    const m = body.match(new RegExp(key + '\\s*[:：]?\\s*(\\d{1,2})', 'i'))
    return m ? Math.min(10, parseInt(m[1], 10)) : null
  }
  const overall = num('OVERALL')
  if (overall == null) return null
  const stuffed = body.match(/STUFFED\s*[:：]?\s*(yes|no|true|false)/i)
  const out = { overall, stuffed: stuffed ? /^(yes|true)$/i.test(stuffed[1]) : null, reason: (body.split(/[—–]/)[1] || '').trim() }
  for (const [key] of dimensions) out[key] = num(key.toUpperCase())
  return out
}

// ── Realization: the writer stops inventing ─────────────────────────────────
// The plan is settled, the line count is a contract, and the only freedom left
// is the Chinese itself. Structured output because prose instructions have not
// once held the length: nine drafts asked for 22-30 lines came back 39-53.
export function realizePrompt({ manifest, blueprint, rendered, allocation, meanings = {}, totalLines, pool = null, feedback = null }) {
  const name = levelName(manifest)
  const beats = allocation.map(a => '  lines ' + a.from + '-' + a.to + ' → beat ' + a.beat).join('\n')
  return 'Write the Chinese for a ' + name + ' graded-reader story that has ALREADY been planned. Follow the plan exactly.\n\n'
    + (feedback ? 'YOUR PREVIOUS ATTEMPT WAS REJECTED:\n' + feedback.map(f => '- ' + f).join('\n') + '\n\n' : '')
    + 'THE PLAN:\n' + rendered + '\n\n'
    + 'LINE BUDGET — exactly ' + totalLines + ' lines of Chinese:\n' + beats + '\n\n'
    + 'You are the writer, not the author: the story is decided.\n'
    + '- Tell exactly the events in the plan, in that order. Do NOT add characters, places, scenes, subplots or a different ending.\n'
    + '- Do NOT change the chronology or invent an explanation the plan does not have.\n'
    + '- Your freedom is the wording: natural sentences, real dialogue, character voice.\n\n'
    + 'The Chinese:\n'
    + '- Use ONLY vocabulary a ' + name + ' learner knows. At most ' + manifest.difficulty.maxOutOfLevelDistinct + ' distinct words above ' + name + ', and at most ' + manifest.difficulty.maxUnknownDistinct + ' that are not standard vocabulary at all. If you are unsure a word is simple enough, do not use it.\n'
    + '- Target words, used the number of times shown:\n' + targetList(manifest, meanings) + '\n'
    + '- A dialogue line is a bare name from ' + manifest.speakers.join('、') + ' then ：then the speech. Never "李明说：", never a described speaker.\n'
    + '- Narration lines have no name prefix. Around ' + manifest.length.maxLineChars + ' characters per line.\n'
    + (pool ? '- Build the rest mainly from these words:\n' + poolForPrompt(pool, 200) + '\n' : '')
    + '\nOutput JSON only, nothing else:\n'
    + '{"title": "<Chinese title>", "lines": ["<line 1>", "<line 2>", … exactly ' + totalLines + ' strings]}'
}

// Exactly N lines or nothing. The caller retries once; it never accepts 27 or
// 31 and never asks an editor to trim the difference afterwards.
export function parseStructuredStory(text, expectedLines) {
  const obj = parseJsonObject(text)
  if (!obj || !Array.isArray(obj.lines)) return null
  const title = String(obj.title || '').trim()
  const lines = obj.lines.map(l => String(l == null ? '' : l).trim()).filter(Boolean)
  if (!title || title.includes('\n')) return null
  if (lines.length !== expectedLines) return null
  if (lines.some(l => !/[一-鿿]/.test(l))) return null
  return { title, content: lines.join('\n') }
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
