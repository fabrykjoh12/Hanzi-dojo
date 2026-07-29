import { createClient } from '@supabase/supabase-js'
import { premiumLlm } from './llm.mjs'
import { validateStory as validate } from './storyValidation.mjs'
import { CONFIGS, SEASON_SEEDS } from './storyLevels.mjs'

// Serial graded-reader generator — the replacement for generate-stories.mjs's
// one-shot vignettes. Each tier becomes one continuing storyline ("season") of
// 5-6 chapters with recurring characters, written by a multi-pass pipeline:
//
//   1. PLAN      one call, in English: a season premise + per-chapter outlines
//                with hooks, woven around code-assigned focus words
//   2. DRAFT     per chapter, in the target language, from the outline
//   3. VALIDATE  in code, not vibes: real vocabulary coverage (greedy
//                longest-match segmentation against the allowed pool),
//                dialogue-speaker whitelist, line counts
//   4. REVISE    targeted — the model is told exactly which words to replace,
//                not asked to regenerate blind (max 3 rounds)
//   5. CRITIQUE  a calibrated rubric pass that reads the chapter in the
//                season's context; below TARGET_SCORE it is revised (up to
//                twice, and only while the score moves), then re-validated,
//                since a rewrite can break coverage. The whole chapter is
//                re-attempted from scratch until it hits TARGET or runs out
//                of attempts, and the best attempt wins.
//   6. TRANSLATE separate line-aligned pass, count-checked in code
//
// Chapters that pass every gate are inserted is_published=true; anything that
// doesn't lands is_published=false for manual review instead of shipping.
// Uses the premium LLM tier (Anthropic when ANTHROPIC_API_KEY is set — the
// whole level is ~100 calls, costing a dollar or two even on a top model).
//
// Run with:
//   node --env-file=.env.script generate-serial-stories.mjs --language chinese --system hsk_3 --level 1 --replace
//   node --env-file=.env.script generate-serial-stories.mjs --language japanese --system jlpt --level 1 --replace

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-serial-stories.mjs --language <l> --system <s> --level <n>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const { client: llm, model: MODEL, provider: PROVIDER } = premiumLlm()
console.log(`[serial-stories] provider=${PROVIDER} model=${MODEL}`)

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] ? args[i + 1] : def }
const doReplace = args.includes('--replace')
const language = arg('language', 'chinese')
const system = arg('system', 'hsk_3')
const level = parseInt(arg('level', '1'), 10)
// Optional taste-test: generate ONLY this tier's season (1/2/3). With --replace
// it deletes just that tier's stories, leaving the others intact — so you can
// sample one season cheaply before committing to the whole level.
const onlyTier = arg('tier', null) ? parseInt(arg('tier', null), 10) : null
const seasonOffset = arg('season-offset', null) ? parseInt(arg('season-offset', null), 10) : 0

// Character bibles and per-level tier targets live in storyLevels.mjs, shared
// with the offline authored-story checker.


const cfg = CONFIGS[language + '|' + system + '|' + level]
if (!cfg) {
  console.error('No serial-story config for ' + language + '/' + system + '/level ' + level + '. Add one to CONFIGS.')
  process.exit(1)
}
const COLON = cfg.colon || '：'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── LLM plumbing ─────────────────────────────────────────────────────────────

// Reasoning models (gemini-2.5-pro/flash) spend hidden "thinking" tokens out
// of max_tokens; if the budget is tight the response comes back with EMPTY
// content (finish_reason=length/MAX_TOKENS) — which used to crash on .trim().
// Extract content defensively, treat empty/malformed as a retryable error
// (surfacing finish_reason so the logs explain why), and on the last attempt
// retry once more with a doubled budget to give thinking room to finish.
function extractText(response) {
  const choice = response && response.choices && response.choices[0]
  let text = choice && choice.message && choice.message.content
  if (Array.isArray(text)) text = text.map(p => (typeof p === 'string' ? p : (p && p.text) || '')).join('')
  return { text: typeof text === 'string' ? text : '', finish: choice && choice.finish_reason }
}

// Plain-text call for ALL passes (story content, plan, critique, translation). JSON is the wrong container
// for multi-line CJK prose — the model kept breaking it with raw newlines and
// unescaped quotes, causing endless retries and multi-hour runs. Plain text
// with a leading marker line can't have that failure mode. `check` validates
// the parsed result; a falsy return retries (empty/garbled response).
async function callText(prompt, maxTokens, check, attempt = 0) {
  const budget = attempt >= 3 ? maxTokens * 2 : maxTokens
  try {
    const response = await llm.chat.completions.create({
      model: MODEL, max_tokens: budget,
      messages: [{ role: 'user', content: prompt }],
    })
    const { text, finish } = extractText(response)
    if (!text.trim()) throw new Error('empty response (finish_reason=' + finish + ', budget=' + budget + ')')
    const parsed = check(text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, ''))
    if (!parsed) throw new Error('unparseable text response')
    return parsed
  } catch (err) {
    if (attempt < 4) {
      const wait = Math.min(8 * Math.pow(2, attempt), 45)
      process.stdout.write('(retry ' + wait + 's: ' + (err.message || err).slice(0, 60) + ') ')
      await sleep(wait * 1000)
      return callText(prompt, maxTokens, check, attempt + 1)
    }
    throw err
  }
}

// Parse a chapter returned as: "TITLE: xxx" then one story line per line.
function parseChapter(text) {
  const raw = text.split('\n').map(l => l.trim()).filter(Boolean)
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
  if (lines.length < 3) return null
  return { title: title || null, content: lines.join('\n') }
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

// The allowed pool is EVERY level below this one, in full, plus this level up
// to the tier cap.
//
// It used to be a slice of the single preceding level (`prereqLevel` /
// `prereqMax`), which quietly made the higher levels impossible to write for.
// HSK 4's config names level 3 as its prerequisite, so the pool contained no
// HSK 1 vocabulary at all — no 的, no 我, no 是, no 很, no 了. Those words are
// unavoidable in any real Chinese sentence, so every draft came back tens of
// points under the coverage bar no matter how carefully it was written, and no
// amount of revision could fix it. That is also the honest model of the
// learner: someone reading at HSK 4 has met HSK 1-3, not a 300-word window of
// HSK 3.
//
// The pool only ever grows as a result, so nothing that passed before can fail
// now. prereqLevel/prereqMax stay in the configs as documentation of the
// intended step-up; they no longer restrict what may appear.
async function fetchVocab(maxSortOrder) {
  const rows = []
  if (level > 1) {
    const { data, error } = await supabase
      .from('vocabulary').select('word, reading, meaning, sort_order')
      .eq('language', language).eq('system', system)
      .lt('level', level).eq('is_active', true)
    if (error) throw new Error('Lower-level vocab error: ' + error.message)
    rows.push(...(data || []))
  }
  const { data, error } = await supabase
    .from('vocabulary').select('word, reading, meaning, sort_order')
    .eq('language', language).eq('system', system).eq('level', level)
    .eq('is_active', true).lte('sort_order', maxSortOrder)
    .order('sort_order', { ascending: true })
  if (error) throw new Error('Vocab fetch error: ' + error.message)
  rows.push(...(data || []))
  return rows
}

// ── Validators (code, not vibes) ─────────────────────────────────────────────
// The matcher itself lives in storyValidation.mjs so hand-authored stories are
// held to exactly the same bar as generated ones — and so "passes validation"
// keeps meaning "every word is tappable in the reader" for both.

function validateStory(content, pool, tier) {
  return validate(content, {
    pool,
    tier,
    language,
    speakers: cfg.bible.speakers,
    extraNames: language === 'chinese' ? ['大毛'] : [],
    maxLineChars: cfg.maxLineChars,
    colon: COLON,
  })
}


// ── Pipeline passes ──────────────────────────────────────────────────────────

// Every chapter pass emits plain text in this shape (never JSON — see callText).
const CHAPTER_FORMAT =
  'Output format — plain text, NOT JSON, no markdown, no quotes around lines:\n' +
  'First line exactly: TITLE: <short chapter title, no chapter number>\n' +
  'Then each story line on its OWN line — nothing else (no numbering, no blank lines).'

function poolForPrompt(pool) {
  // Small pools go in whole. Big ones would drown the prompt, so only the most
  // common slice is listed — the chapter's focus words travel separately in
  // every prompt, and the validator polices against the FULL pool, so being
  // stricter in the prompt than in validation is safe.
  const listed = pool.length <= 280 ? pool : pool.slice(0, 280)
  return listed.map(v => v.word + ' (' + v.meaning + ')').join(', ')
}

async function planSeason(tier, focusChunks) {
  const seed = SEASON_SEEDS[(tier.tier - 1 + seasonOffset) % SEASON_SEEDS.length]
  const prompt =
    'You are planning a serialized graded-reader story ("season") for ' + cfg.levelName + ' ' + cfg.promptLang + ' learners.\n\n' +
    'Recurring characters (use these, keep their personalities consistent):\n' + cfg.bible.text + '\n\n' +
    'Season shape: ' + seed + '.\n' +
    'Chapters: exactly ' + tier.chapters + '. Everyday settings only (home, school, shops, park, transport, food).\n' +
    'Each chapter must weave in its assigned focus words naturally (they are the learner\'s newest vocabulary):\n' +
    focusChunks.map((c, i) => 'Chapter ' + (i + 1) + ' focus words: ' + c.map(v => v.word + ' (' + v.meaning + ')').join(', ')).join('\n') + '\n\n' +
    'Requirements:\n' +
    '- A real through-line: something the characters want or wonder about from chapter 1, developing each chapter, resolved in the last.\n' +
    '- Every chapter ends on a small hook (a question, a discovery, a decision) except the last, which resolves warmly.\n' +
    '- Characters act like THEMSELVES (use the personality notes).\n' +
    '- Keep plots concrete and physical — things characters can see, do, eat, find. No abstractions.\n\n' +
    'Output format — plain text, NOT JSON. Keep every field on ONE line:\n' +
    'SEASON: <english season title>\n' +
    'PREMISE: <2-3 sentences>\n' +
    'then for EACH of the ' + tier.chapters + ' chapters, three lines:\n' +
    'CHAPTER: <english chapter title>\n' +
    'SUMMARY: <3-5 sentences of concrete beats, all on one line>\n' +
    'HOOK: <the chapter-ending hook, or "none" for the last chapter>'
  return callText(prompt, 4000, (text) => parsePlan(text, tier.chapters))
}

function parsePlan(text, expectedChapters) {
  const out = { season_title_en: '', premise_en: '', chapters: [] }
  let cur = null
  const valOf = (t) => { const ci = t.indexOf(':') >= 0 ? t.indexOf(':') : t.indexOf('：'); return ci >= 0 ? t.slice(ci + 1).trim() : '' }
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const up = t.toUpperCase()
    if (up.startsWith('SEASON')) out.season_title_en = valOf(t)
    else if (up.startsWith('PREMISE')) out.premise_en = valOf(t)
    else if (up.startsWith('CHAPTER')) { cur = { title_en: valOf(t), summary_en: '', hook_en: '' }; out.chapters.push(cur) }
    else if (up.startsWith('SUMMARY') && cur) cur.summary_en = valOf(t)
    else if (up.startsWith('HOOK') && cur) { const h = valOf(t); cur.hook_en = (h.toLowerCase() === 'none' || h === '-') ? '' : h }
  }
  return out.chapters.length >= expectedChapters ? out : null
}

// Per-language script rule injected into every writing/revision pass. Japanese
// must mirror the pool's exact written forms: the reader matches story words
// against the stored vocabulary, so a kana-listed word written in kanji (or
// vice versa) becomes untappable. kanaOnly is the legacy all-kana switch.
function scriptNote() {
  if (cfg.kanaOnly) return '- Write ONLY in hiragana and katakana (no kanji at all)\n'
  if (language === 'japanese') {
    return '- Script: write every allowed-vocabulary word EXACTLY as listed — kanji words in kanji (学校, 食べます), kana-listed words in kana (こうえん, としょかん — do NOT convert them to kanji). Verbs listed in ます-form may be conjugated naturally (食べます → 食べました, 食べて). Words outside the list: prefer hiragana.\n'
  }
  return ''
}

async function draftChapter(tier, plan, chapterIdx, focusWords, pool, prevRecap) {
  const ch = plan.chapters[chapterIdx]
  const [minL, maxL] = tier.lines
  const kanaNote = scriptNote()
  const prompt =
    'Write chapter ' + (chapterIdx + 1) + ' of a serialized ' + cfg.promptLang + ' graded reader for ' + cfg.levelName + ' learners.\n\n' +
    'Season premise: ' + plan.premise_en + '\n' +
    (prevRecap ? 'Previously: ' + prevRecap + '\n' : '') +
    'This chapter (follow these beats): ' + ch.summary_en + '\n' +
    (ch.hook_en ? 'End the chapter on this hook: ' + ch.hook_en + '\n' : 'This is the final chapter — resolve the season warmly.\n') + '\n' +
    'Characters (voices must match):\n' + cfg.bible.text + '\n\n' +
    'FOCUS WORDS — every one of these must appear naturally, most of them more than once:\n' +
    focusWords.map(v => v.word + ' (' + v.reading + ' = ' + v.meaning + ')').join(', ') + '\n\n' +
    'ALLOWED VOCABULARY — build the text mainly from these words plus names, particles and basic grammar:\n' +
    poolForPrompt(pool) + '\n\n' +
    'Rules:\n' +
    kanaNote +
    '- ' + minL + '-' + maxL + ' lines, one sentence or dialogue turn per line — a full scene, not a sketch\n' +
    '- Natural sentences around ' + cfg.maxLineChars + ' characters per line — vary the rhythm, avoid choppy three-word lines\n' +
    '- Mix narration and dialogue. Dialogue format: NAME' + COLON + 'text — speakers ONLY from: ' + cfg.bible.speakers.join(', ') + '\n' +
    '- Narration lines have no speaker prefix\n' +
    '- Use a WIDE VARIETY of the allowed vocabulary — draw on the whole list, not the same handful of words. Reuse the focus words especially, in different sentence patterns.\n' +
    '- You MAY reach for up to ' + (tier.maxMisses != null ? Math.max(3, Math.floor(tier.maxMisses / 2)) : 4) + ' vivid words outside the list where the story genuinely needs them (a sound, a feeling, a specific object) — the reader can tap any word for its meaning. Keep at least ' + Math.round((tier.minCov != null ? tier.minCov : 0.9) * 100) + '% of the words from the allowed list.\n' +
    '- Write something a reader would actually enjoy: a real narrative arc, concrete sensory detail, a little humor, genuine character voice and feelings\n\n' +
    CHAPTER_FORMAT
  return callText(prompt, 6000, parseChapter)
}

async function reviseForCoverage(tier, draft, validation, focusWords, pool) {
  const [minL, maxL] = tier.lines
  const prompt =
    'This ' + cfg.levelName + ' ' + cfg.promptLang + ' graded-reader chapter breaks its vocabulary constraints. Fix ONLY the problems listed; keep the plot, characters, and everything already compliant unchanged. Preserve the natural, story-like flow — do not make it stiff.\n\n' +
    'Problems:\n- ' + validation.problems.join('\n- ') + '\n\n' +
    'Chapter:\n' + draft.content + '\n\n' +
    'ALLOWED VOCABULARY (replace out-of-pool words using ONLY these plus names, particles and basic grammar):\n' +
    poolForPrompt(pool) + '\n\n' +
    'Focus words that must stay present: ' + focusWords.map(v => v.word).join(', ') + '\n' +
    scriptNote() +
    'Keep ' + minL + '-' + maxL + ' lines, dialogue format NAME' + COLON + 'text, speakers only from: ' + cfg.bible.speakers.join(', ') + '\n\n' +
    CHAPTER_FORMAT
  return callText(prompt, 6000, parseChapter)
}

// The critique is the only quality gate, and a model scoring its own output
// drifts generous — an unanchored 1-10 clusters at 7-8 no matter what it read.
// So the scale is calibrated explicitly, and the chapter is judged IN CONTEXT
// (premise, its role in the season, what happened last chapter) because the
// serial failures that matter — a chapter that doesn't follow from the one
// before, a hook that never lands — are invisible when it is read alone.
async function critiqueStory(draft, plan, chapterIdx, prevRecap) {
  const ch = plan && plan.chapters[chapterIdx]
  const isLast = plan && chapterIdx === plan.chapters.length - 1
  const context = plan
    ? 'Season premise: ' + plan.premise_en + '\n' +
      'This is chapter ' + (chapterIdx + 1) + ' of ' + plan.chapters.length + '.\n' +
      (prevRecap ? 'Previous chapter: ' + prevRecap + '\n' : '') +
      'It is meant to cover: ' + (ch ? ch.summary_en : '') + '\n' +
      (isLast ? 'It must resolve the season warmly.\n' : (ch && ch.hook_en ? 'It must end on this hook: ' + ch.hook_en + '\n' : '')) +
      '\n'
    : ''
  const prompt =
    'You are a demanding editor of graded readers for ' + cfg.levelName + ' ' + cfg.promptLang + ' learners. Score this chapter.\n\n' +
    context +
    'Chapter:\n' + draft.content + '\n\n' +
    'Judge it on:\n' +
    '- Natural, idiomatic ' + cfg.promptLang + ' (not translated-sounding, not choppy baby prose, no repeated sentence shapes)\n' +
    '- An actual story: concrete events, cause and effect, a reason to keep reading\n' +
    '- Distinct character voices — could you tell who is speaking with the names removed?\n' +
    '- It does the job the outline gives it, follows on from the previous chapter, and lands its ending\n' +
    '- Appropriate for the level (simple grammar, but never insulting or babyish)\n\n' +
    'Calibration — use the WHOLE scale, and be hard to please:\n' +
    '- 9-10: publishable as-is in a good graded reader. Rare.\n' +
    '- 7-8: solid. Real story, natural language, minor blemishes only.\n' +
    '- 5-6: readable but flat — thin plot, interchangeable voices, or stiff prose.\n' +
    '- 1-4: broken, incoherent, or barely a story.\n' +
    'Most drafts are a 5 or 6. Do not award 7+ out of politeness; a chapter where\n' +
    'nothing much happens, or where every character sounds the same, is a 6 at best.\n\n' +
    'Output format — plain text, NOT JSON. Exactly two lines:\n' +
    'SCORE: <a single number 1-10>\n' +
    'FEEDBACK: <2-4 specific, actionable problems (or what works, if 9+)>'
  return callText(prompt, 3000, (text) => {
    let score = null, feedback = ''
    for (const line of text.split('\n')) {
      const t = line.trim()
      const up = t.toUpperCase()
      if (up.startsWith('SCORE')) {
        const digits = t.replace(/[^0-9]/g, '')
        if (digits) score = Math.min(10, parseInt(digits.slice(0, 2), 10))
      } else if (up.startsWith('FEEDBACK')) {
        const ci = t.indexOf(':') >= 0 ? t.indexOf(':') : t.indexOf('：')
        feedback = ci >= 0 ? t.slice(ci + 1).trim() : ''
      } else if (feedback) { feedback += ' ' + t }
    }
    return score != null ? { score, feedback } : null
  })
}

async function reviseForQuality(tier, draft, feedback, focusWords, pool) {
  const [minL, maxL] = tier.lines
  const prompt =
    'Revise this ' + cfg.levelName + ' ' + cfg.promptLang + ' graded-reader chapter based on the editor\'s feedback. Keep the same plot beats and chapter role.\n\n' +
    'Editor feedback:\n' + feedback + '\n\n' +
    'Chapter:\n' + draft.content + '\n\n' +
    'Constraints (unchanged):\n' +
    scriptNote() +
    '- ' + minL + '-' + maxL + ' lines; dialogue format NAME' + COLON + 'text; speakers only from: ' + cfg.bible.speakers.join(', ') + '\n' +
    '- Focus words that must stay present: ' + focusWords.map(v => v.word).join(', ') + '\n' +
    '- ALLOWED VOCABULARY (plus names, particles, basic grammar):\n' + poolForPrompt(pool) + '\n\n' +
    CHAPTER_FORMAT
  return callText(prompt, 6000, parseChapter)
}

async function translateStory(draft) {
  const lines = draft.content.split('\n').map(l => l.trim()).filter(Boolean)
  const prompt =
    'Translate this ' + cfg.promptLang + ' graded-reader chapter to natural English, line by line.\n\n' +
    lines.map((l, i) => (i + 1) + '. ' + l).join('\n') + '\n\n' +
    'Rules:\n' +
    '- EXACTLY ' + lines.length + ' lines, same order, one translation per line\n' +
    '- Keep dialogue format: Speaker' + COLON + 'English text (translate the speaker name to romanized form, e.g. 李明 → Li Ming)\n' +
    '- Natural English, not word-by-word\n\n' +
    'Output format — plain text, NOT JSON: exactly ' + lines.length + ' lines, one English translation per line, in order, nothing else (no numbering).'
  try {
    const english = await callText(prompt, 6000, (text) => {
      const out = text.split('\n').map(l => l.trim()).filter(Boolean)
      // Tolerate ±2 lines (the model occasionally merges/splits a line); pad or
      // trim to match so the reader's line-alignment holds.
      if (Math.abs(out.length - lines.length) > 2) return null
      while (out.length < lines.length) out.push('')
      return out.slice(0, lines.length).join('\n')
    })
    return { ok: true, english }
  } catch {
    return { ok: false, english: null }
  }
}

// Two bars, deliberately different.
//
// TARGET is what the pipeline works toward: below it, a chapter gets a quality
// revision and the attempt loop keeps trying instead of settling. PUBLISH is
// the floor for shipping. Collapsing them into one number (it used to be a
// lone 6) meant the loop stopped the instant a draft cleared the floor, so the
// floor became the typical quality rather than the worst allowed.
const TARGET_SCORE = 8
// A solid graded reader scores 7+. Chapters below this are held unpublished.
const PUBLISH_SCORE = 7
// A serial can't have gaps — a held opener means readers start mid-story. So
// every chapter gets several from-scratch attempts (fresh drafts vary a lot;
// revising a weak draft often doesn't rescue it) and we keep the best one.
const MAX_CHAPTER_ATTEMPTS = 3

// One full attempt at a chapter: draft → coverage/format fixes → quality
// critique → up to two targeted quality revisions. Returns the draft plus its
// final validation and critique so the caller can compare attempts.
async function attemptChapter(tier, plan, i, focus, pool, prevRecap) {
  let draft = await draftChapter(tier, plan, i, focus, pool, prevRecap)

  // Coverage/format loop: targeted fixes, max 3 rounds.
  let v = validateStory(draft.content, pool, tier)
  let rounds = 0
  while (!v.ok && rounds < 3) {
    process.stdout.write('fix(' + Math.round(v.coverage * 100) + '%)... ')
    draft = await reviseForCoverage(tier, draft, v, focus, pool)
    v = validateStory(draft.content, pool, tier)
    rounds += 1
  }

  // Quality gate: below TARGET → a quality revision, re-checked (and re-covered
  // if the rewrite drifts out of the vocabulary pool). Up to two rounds, and
  // only while the score is actually moving — a revision that doesn't improve
  // the chapter won't improve it on a third pass either, and the attempt loop's
  // next from-scratch draft is the better use of the call. A revision that
  // makes things WORSE is discarded rather than kept.
  process.stdout.write('critique... ')
  let crit = await critiqueStory(draft, plan, i, prevRecap)
  for (let round = 0; round < 2 && (crit.score || 0) < TARGET_SCORE; round += 1) {
    process.stdout.write('revise(' + crit.score + ')... ')
    const revised = await reviseForQuality(tier, draft, crit.feedback || '', focus, pool)
    let rv = validateStory(revised.content, pool, tier)
    let fixed = revised
    if (!rv.ok) { fixed = await reviseForCoverage(tier, revised, rv, focus, pool); rv = validateStory(fixed.content, pool, tier) }
    const rcrit = await critiqueStory(fixed, plan, i, prevRecap)
    if (attemptRank({ v: rv, crit: rcrit }) <= attemptRank({ v, crit })) break
    draft = fixed; v = rv; crit = rcrit
  }
  return { draft, v, crit }
}

// Rank an attempt so we can keep the strongest across retries: a
// coverage-valid chapter always beats an invalid one, then higher critique
// score, then higher coverage as the tie-breaker.
function attemptRank(a) {
  return (a.v.ok ? 1000 : 0) + (a.crit.score || 0) * 10 + Math.round(a.v.coverage * 100) / 100
}

async function main() {
  const tiersToRun = onlyTier ? cfg.tiers.filter(t => t.tier === onlyTier) : cfg.tiers
  if (tiersToRun.length === 0) { console.error('No tier ' + onlyTier + ' in this config.'); process.exit(1) }
  console.log('=== Serial stories: ' + language + '/' + system + '/level ' + level + (onlyTier ? ' — TIER ' + onlyTier + ' only' : '') + ' ===')

  // Allowed vocabulary = the WHOLE level, for every tier. Capping the pool at
  // the tier boundary (first 100 words for tier 1) starved the writer — drafts
  // came in at 60-64% in-pool, and forcing them up to 95% flattened the prose
  // into stiff, low-scoring text. It's all the same level and every word is
  // tappable, so a generous pool lets the model write naturally and hit
  // coverage without mangling. Focus words stay the tier's own slice.
  //
  // Fetched BEFORE the --replace delete on purpose: if the vocab query fails,
  // we abort without having deleted anything, so a transient error can't leave
  // the level empty.
  const fullCap = cfg.tiers[cfg.tiers.length - 1].cap
  const fullPool = await fetchVocab(fullCap)
  if (fullPool.length === 0) { console.error('No vocabulary found — refusing to delete/regenerate.'); process.exit(1) }

  if (doReplace) {
    let del = supabase.from('stories').delete()
      .eq('language', language).eq('system', system).eq('level', level)
    // Taste-test run: only wipe the tier we're regenerating, keep the rest.
    if (onlyTier) del = del.eq('tier', onlyTier)
    const { error } = await del
    if (error) throw new Error('Delete error: ' + error.message)
    console.log('Deleted existing stories for this ' + (onlyTier ? 'tier.' : 'level.'))
  }

  const { data: existing } = await supabase.from('stories').select('story_number')
    .eq('language', language).eq('system', system).eq('level', level)
    .order('story_number', { ascending: false }).limit(1)
  let nextNum = existing && existing.length > 0 ? existing[0].story_number + 1 : 1

  let published = 0, held = 0
  const scores = []

  for (const tier of tiersToRun) {
    console.log('\n=== Tier ' + tier.tier + ' — season of ' + tier.chapters + ' chapters ===')
    const pool = fullPool
    // Focus words: the tier's NEWEST vocabulary (between the previous tier's cap
    // and this one), chunked across chapters so each chapter teaches its slice.
    const newWords = pool.filter(v => v.sort_order > tier.prevCap && v.sort_order <= tier.cap)
    const chunkSize = Math.min(22, Math.max(10, Math.ceil(newWords.length / tier.chapters)))
    const focusChunks = []
    for (let i = 0; i < tier.chapters; i += 1) {
      const chunk = newWords.slice(i * chunkSize, (i + 1) * chunkSize)
      focusChunks.push(chunk.length > 0 ? chunk : newWords.slice(0, chunkSize))
    }
    console.log('Pool: ' + pool.length + ' words · new this tier: ' + newWords.length + ' · ~' + chunkSize + ' focus words/chapter')

    // Isolate the season plan: if it fails after its retries, skip this tier
    // rather than crashing the whole run (which, mid-level, would leave earlier
    // tiers' fresh stories intact but abandon the rest).
    let plan
    try {
      process.stdout.write('Planning season... ')
      plan = await planSeason(tier, focusChunks)
      console.log('"' + plan.season_title_en + '"')
    } catch (err) {
      console.log('Tier ' + tier.tier + ' planning FAILED, skipping: ' + (err.message || err))
      continue
    }

    let prevRecap = ''
    for (let i = 0; i < tier.chapters; i += 1) {
      const focus = focusChunks[i]
      process.stdout.write('Ch ' + (i + 1) + '/' + tier.chapters + ': ')
      try {
        // Retry the whole chapter from scratch until one clears the bar, then
        // keep the strongest attempt. Passing on the first try costs one draft;
        // only weak chapters (like a held opener) pay for extra tries.
        let best = null
        for (let attempt = 0; attempt < MAX_CHAPTER_ATTEMPTS; attempt += 1) {
          process.stdout.write(attempt === 0 ? 'draft... ' : 'retry ' + (attempt + 1) + '... ')
          const cand = await attemptChapter(tier, plan, i, focus, pool, prevRecap)
          if (!best || attemptRank(cand) > attemptRank(best)) best = cand
          // Stop at TARGET, not at the publish floor: settling for the first
          // barely-shippable draft is exactly how a level fills up with 6/10s.
          if (best.v.ok && (best.crit.score || 0) >= TARGET_SCORE) break
        }
        const { draft, v, crit } = best

        process.stdout.write('translate... ')
        const tr = await translateStory(draft)

        const pass = v.ok && (crit.score || 0) >= PUBLISH_SCORE && tr.ok
        const title = (i + 1) + '. ' + (draft.title || plan.chapters[i].title_en)
        const { error } = await supabase.from('stories').insert({
          language, system, level,
          tier: tier.tier, tier_min_words: tier.minWords, story_number: nextNum,
          title,
          english_summary: plan.chapters[i].summary_en,
          content: draft.content,
          english_content: tr.ok ? tr.english : null,
          is_published: pass,
        })
        if (error) throw new Error(error.message)
        console.log((pass ? 'PUBLISHED' : 'HELD (unpublished)') + ' — cov ' + Math.round(v.coverage * 100) + '%, score ' + crit.score + ', ' + v.lineCount + ' lines — "' + title + '"')
        if (pass) published += 1; else held += 1
        scores.push(crit.score || 0)
        nextNum += 1
        prevRecap = plan.chapters[i].summary_en
        await sleep(1500)
      } catch (err) {
        console.log('FAILED: ' + err.message)
      }
    }
  }

  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  console.log('\nAll done. Published ' + published + ', held for review ' + held +
    (scores.length ? ' — average quality score ' + avg.toFixed(1) + '/10' : '') + '.')
  if (held > 0) console.log('Held chapters: stories rows with is_published=false — review in the dashboard, fix or regenerate, then flip is_published.')
}

main().catch(err => { console.error(err); process.exit(1) })
