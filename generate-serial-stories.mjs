import { createClient } from '@supabase/supabase-js'
import { premiumLlm } from './llm.mjs'

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
//   5. CRITIQUE  a rubric-scored quality pass; below 7/10 → one quality
//                revision (then re-validate, since revision can break coverage)
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

// ── Character bibles ─────────────────────────────────────────────────────────
// Recurring characters with actual personalities and speech habits — the thing
// the old generator never had. Chinese names must stay within the reader's
// CHARACTER_READINGS map (src/characterNames.js) so name-taps keep working.

const BIBLE_CHINESE = {
  speakers: ['李明', '小红', '小明', '妈妈'],
  text:
    '- 李明 (Lǐ Míng): a curious, slightly impulsive 12-year-old boy. Always hungry. Speaks in short, eager sentences and asks a lot of questions.\n' +
    '- 小红 (Xiǎo Hóng): his classmate. Sharp-eyed and quick — she notices what others miss, and teases 李明, but is kind underneath.\n' +
    '- 小明 (Xiǎo Míng): 李明\'s best friend. Easygoing, a little lazy, loyal.\n' +
    '- 妈妈: 李明\'s mother. Patient, practical, gently firm.\n' +
    '- 大毛 (Dà Máo): a white neighborhood cat. Does not talk, but keeps appearing where things happen.',
}

const BIBLE_JAPANESE = {
  speakers: ['たかし', 'はな', 'おかあさん', 'おじいさん'],
  text:
    '- たかし (Takashi): a shy, careful boy who loves trains and notices small details. Speaks briefly and politely.\n' +
    '- はな (Hana): his classmate. Energetic, always hungry, speaks fast and decides fast.\n' +
    '- おかあさん (Mother): kind but busy; keeps everyone on schedule.\n' +
    '- おじいさん (an elderly neighbor): grows vegetables, walks slowly, knows everything about the town.',
}

const BIBLE_RUSSIAN = {
  speakers: ['Иван', 'Аня', 'мама', 'бабушка'],
  text:
    '- Иван (Ivan): a friendly student who loves sport and is always a little late.\n' +
    '- Аня (Anya): his friend. Loves music, very organized, mildly exasperated by Иван.\n' +
    '- мама: Ivan\'s mother. Warm and practical.\n' +
    '- бабушка: the grandmother. Bakes constantly, speaks in short warm sentences, always right.',
}

// Per-tier premise seeds so re-runs and tiers don't converge on the same plot.
const SEASON_SEEDS = [
  'a small neighborhood mystery (something goes missing or keeps happening) that resolves warmly',
  'preparing for something over several days (a trip, a festival, a small competition) with setbacks',
  'a bigger outing or adventure away from home with a genuine surprise in the middle',
]

// ── Per-target config ─────────────────────────────────────────────────────────
// Tier caps mirror the old generator so tier gating (tier_min_words) and level
// pools stay consistent. maxLineChars is a SOFT target now — the reader wraps
// text fine and choppy 15-char baby prose was a big part of why stories read
// badly. Only egregiously long lines (2x) get flagged for revision.
//
// Per-tier knobs for "longer + richer" (user request):
//   lines      target line count — bumped ~50% so chapters read like real scenes
//   minCov     min in-pool vocabulary coverage. GRADUATED: rank beginners
//              (tier 1) need near-full comprehension; by tier 3 the reader can
//              handle a few reach words, which surface as tappable "new words".
//   maxMisses  cap on DISTINCT out-of-pool words — lets a chapter reach for a
//              handful of vivid words without turning into a word salad.

const CONFIGS = {
  'chinese|hsk_3|1': {
    bible: BIBLE_CHINESE, promptLang: 'Chinese', levelName: 'HSK 1',
    maxLineChars: 30, prereqLevel: null, prereqMax: 0,
    tiers: [
      { tier: 1, minWords: 0, prevCap: 0, cap: 100, chapters: 6, lines: [18, 26], minCov: 0.85, maxMisses: 10 },
      { tier: 2, minWords: 100, prevCap: 100, cap: 200, chapters: 6, lines: [24, 34], minCov: 0.85, maxMisses: 12 },
      { tier: 3, minWords: 200, prevCap: 200, cap: 300, chapters: 6, lines: [30, 42], minCov: 0.83, maxMisses: 14 },
    ],
  },
  'chinese|hsk_3|2': {
    bible: BIBLE_CHINESE, promptLang: 'Chinese', levelName: 'HSK 2',
    maxLineChars: 32, prereqLevel: 1, prereqMax: 150,
    tiers: [
      { tier: 1, minWords: 30, prevCap: 0, cap: 66, chapters: 5, lines: [18, 26], minCov: 0.90, maxMisses: 6 },
      { tier: 2, minWords: 80, prevCap: 66, cap: 132, chapters: 5, lines: [24, 34], minCov: 0.88, maxMisses: 9 },
      { tier: 3, minWords: 130, prevCap: 132, cap: 198, chapters: 5, lines: [30, 42], minCov: 0.85, maxMisses: 12 },
    ],
  },
  'japanese|jlpt|1': {
    bible: BIBLE_JAPANESE, promptLang: 'Japanese', levelName: 'JLPT N5',
    kanaOnly: true, maxLineChars: 36, prereqLevel: null, prereqMax: 0,
    tiers: [
      { tier: 1, minWords: 30, prevCap: 0, cap: 100, chapters: 5, lines: [18, 26], minCov: 0.90, maxMisses: 6 },
      { tier: 2, minWords: 100, prevCap: 100, cap: 200, chapters: 5, lines: [24, 34], minCov: 0.88, maxMisses: 9 },
      { tier: 3, minWords: 200, prevCap: 200, cap: 400, chapters: 5, lines: [30, 42], minCov: 0.85, maxMisses: 12 },
    ],
  },
  'japanese|jlpt|3': {
    bible: BIBLE_JAPANESE, promptLang: 'Japanese', levelName: 'JLPT N4',
    maxLineChars: 40, prereqLevel: 1, prereqMax: 150,
    tiers: [
      { tier: 1, minWords: 30, prevCap: 0, cap: 200, chapters: 5, lines: [18, 26], minCov: 0.90, maxMisses: 7 },
      { tier: 2, minWords: 150, prevCap: 200, cap: 400, chapters: 5, lines: [24, 34], minCov: 0.87, maxMisses: 10 },
      { tier: 3, minWords: 300, prevCap: 400, cap: 636, chapters: 5, lines: [30, 42], minCov: 0.84, maxMisses: 14 },
    ],
  },
  'russian|russian|1': {
    bible: BIBLE_RUSSIAN, promptLang: 'Russian', levelName: 'CEFR A1',
    colon: ':', maxLineChars: 70, prereqLevel: null, prereqMax: 0,
    tiers: [
      { tier: 1, minWords: 15, prevCap: 0, cap: 50, chapters: 4, lines: [16, 24], minCov: 0.88, maxMisses: 8 },
      { tier: 2, minWords: 40, prevCap: 50, cap: 100, chapters: 4, lines: [20, 30], minCov: 0.86, maxMisses: 11 },
      { tier: 3, minWords: 80, prevCap: 100, cap: 147, chapters: 4, lines: [26, 38], minCov: 0.83, maxMisses: 14 },
    ],
  },
}

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

async function callJson(prompt, maxTokens, attempt = 0) {
  const budget = attempt >= 3 ? maxTokens * 2 : maxTokens
  try {
    const response = await llm.chat.completions.create({
      model: MODEL, max_tokens: budget,
      messages: [{ role: 'user', content: prompt }],
    })
    const { text, finish } = extractText(response)
    if (!text.trim()) throw new Error('empty response (finish_reason=' + finish + ', budget=' + budget + ')')
    const json = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    return JSON.parse(json)
  } catch (err) {
    if (attempt < 4) {
      const wait = Math.min(8 * Math.pow(2, attempt), 45)
      process.stdout.write('(retry ' + wait + 's: ' + (err.message || err).slice(0, 60) + ') ')
      await sleep(wait * 1000)
      return callJson(prompt, maxTokens, attempt + 1)
    }
    throw err
  }
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

async function fetchVocab(maxSortOrder) {
  const rows = []
  if (cfg.prereqLevel) {
    const { data, error } = await supabase
      .from('vocabulary').select('word, reading, meaning, sort_order')
      .eq('language', language).eq('system', system).eq('level', cfg.prereqLevel)
      .eq('is_active', true).lte('sort_order', cfg.prereqMax)
    if (error) throw new Error('Prereq vocab error: ' + error.message)
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

const PUNCT = new Set('，。！？：；、“”‘’…—·《》〈〉（）「」『』・,.!?:;"\'()[]{}<>~～-–—%＄$&*/\\ \t\r　0123456789０１２３４５６７８９'.split(''))
function isPunct(ch) { return PUNCT.has(ch) || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') }
function isHiragana(ch) { const c = ch.charCodeAt(0); return c >= 0x3040 && c <= 0x309F }

function splitSpeaker(line) {
  const idx = line.indexOf(COLON)
  if (idx > 0 && idx <= 8) return { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() }
  return { speaker: null, text: line }
}

// CJK coverage: greedy longest-match against the allowed dictionary. Unmatched
// hiragana is allowed for Japanese (particles + conjugation ARE the grammar the
// prompt permits); everything else unmatched counts against coverage.
function cjkCoverage(lines, dict, maxWordLen, allowHiragana) {
  let matched = 0, unmatched = 0
  const misses = new Map()
  for (const raw of lines) {
    const text = splitSpeaker(raw).text
    let i = 0
    while (i < text.length) {
      const ch = text[i]
      if (isPunct(ch)) { i += 1; continue }
      let hit = 0
      for (let len = Math.min(maxWordLen, text.length - i); len >= 1; len -= 1) {
        if (dict.has(text.slice(i, i + len))) { hit = len; break }
      }
      if (hit > 0) { matched += hit; i += hit; continue }
      if (allowHiragana && isHiragana(ch)) { matched += 1; i += 1; continue }
      // Collect the whole unmatched run so revision prompts show words, not chars.
      let j = i
      while (j < text.length && !isPunct(text[j]) && !(allowHiragana && isHiragana(text[j]))) {
        let anyHit = false
        for (let len = Math.min(maxWordLen, text.length - j); len >= 1; len -= 1) {
          if (dict.has(text.slice(j, j + len))) { anyHit = true; break }
        }
        if (anyHit) break
        j += 1
      }
      const run = text.slice(i, j)
      misses.set(run, (misses.get(run) || 0) + 1)
      unmatched += run.length
      i = j
    }
  }
  const total = matched + unmatched
  return { coverage: total === 0 ? 1 : matched / total, misses: [...misses.keys()] }
}

// Russian: token-level, with a prefix allowance for inflection (an A1 validator
// doesn't need a morphological analyzer — sharing the first 4+ letters with a
// pool word is close enough to catch real out-of-pool vocabulary).
const RU_FUNCTION = new Set(['и', 'а', 'но', 'в', 'во', 'не', 'на', 'у', 'с', 'со', 'к', 'ко', 'по', 'за', 'из', 'о', 'об', 'от', 'до', 'же', 'бы', 'ли', 'да', 'нет', 'то', 'же', 'уже', 'ещё', 'еще', 'вот', 'как', 'что', 'кто', 'это', 'этот', 'эта', 'эти', 'тот', 'та', 'те', 'мой', 'моя', 'мои', 'твой', 'наш', 'ваш', 'его', 'её', 'ее', 'их', 'я', 'ты', 'он', 'она', 'оно', 'мы', 'вы', 'они', 'меня', 'тебя', 'него', 'нее', 'неё', 'нас', 'вас', 'них', 'мне', 'тебе', 'ему', 'ей', 'нам', 'вам', 'им', 'есть', 'был', 'была', 'было', 'были', 'будет', 'будут', 'очень', 'там', 'тут', 'здесь', 'потом', 'тоже'])
function russianCoverage(lines, poolWords, names) {
  const pool = poolWords.map(w => w.toLowerCase())
  const nameSet = new Set(names.map(n => n.toLowerCase()))
  let matched = 0, unmatched = 0
  const misses = new Set()
  for (const raw of lines) {
    const text = splitSpeaker(raw).text.toLowerCase()
    const tokens = text.split(/[^а-яё]+/).filter(Boolean)
    for (const t of tokens) {
      const ok = RU_FUNCTION.has(t) || nameSet.has(t)
        || pool.some(w => w === t || (t.length >= 4 && w.length >= 4 && w.slice(0, 4) === t.slice(0, 4)))
      if (ok) matched += 1
      else { unmatched += 1; misses.add(t) }
    }
  }
  const total = matched + unmatched
  return { coverage: total === 0 ? 1 : matched / total, misses: [...misses] }
}

function validateStory(content, pool, tier) {
  const problems = []
  const lines = (content || '').split('\n').map(l => l.trim()).filter(Boolean)

  const [minL, maxL] = tier.lines
  if (lines.length < minL - 2) problems.push('Too short: ' + lines.length + ' lines (need at least ' + minL + ').')
  if (lines.length > maxL + 8) problems.push('Too long: ' + lines.length + ' lines (target at most ' + maxL + ').')

  const badSpeakers = new Set()
  for (const line of lines) {
    const { speaker } = splitSpeaker(line)
    if (speaker && cfg.bible.speakers.indexOf(speaker) === -1) badSpeakers.add(speaker)
  }
  if (badSpeakers.size > 0) problems.push('Unknown dialogue speakers: ' + [...badSpeakers].join(', ') + '. Allowed: ' + cfg.bible.speakers.join(', '))

  const longLines = lines.filter(l => splitSpeaker(l).text.length > cfg.maxLineChars * 2)
  if (longLines.length > 0) problems.push(longLines.length + ' line(s) are far too long — split them into shorter sentences.')

  let cov
  if (language === 'russian') {
    cov = russianCoverage(lines, pool.map(v => v.word), cfg.bible.speakers)
  } else {
    const dict = new Set(pool.map(v => v.word))
    // Japanese vocab is often listed in kana while stories may echo the reading;
    // index readings too so those count as in-pool rather than as misses.
    if (language === 'japanese') pool.forEach(v => { if (v.reading) dict.add(v.reading) })
    cfg.bible.speakers.forEach(n => dict.add(n))
    if (language === 'chinese') dict.add('大毛')
    cov = cjkCoverage(lines, dict, 8, language === 'japanese')
  }
  const minCov = tier.minCov != null ? tier.minCov : 0.9
  const maxMisses = tier.maxMisses != null ? tier.maxMisses : 8
  if (cov.coverage < minCov) {
    problems.push('Vocabulary coverage ' + Math.round(cov.coverage * 100) + '% (need ' + Math.round(minCov * 100) + '%). Out-of-pool: ' + cov.misses.slice(0, 25).join('、'))
  } else if (cov.misses.length > maxMisses) {
    // Coverage is fine by ratio, but too many DISTINCT reach words — trim the
    // least essential ones so a chapter teaches a few new words, not dozens.
    problems.push(cov.misses.length + ' distinct out-of-pool words (max ' + maxMisses + '). Replace the less important ones: ' + cov.misses.slice(0, 25).join('、'))
  }
  return { ok: problems.length === 0, problems, coverage: cov.coverage, misses: cov.misses, lineCount: lines.length }
}

// ── Pipeline passes ──────────────────────────────────────────────────────────

// Chapters come back as a `lines` ARRAY, not a single newline-embedded string:
// gemini often emits raw newlines inside a JSON string value, which breaks
// JSON.parse ("Unterminated string") and triggered dozens of slow retries.
// An array of per-line strings sidesteps that entirely (the translate pass,
// which always used this shape, never had the problem).
function toContent(res) {
  if (res && Array.isArray(res.lines)) return res.lines.map(l => String(l).trim()).filter(Boolean).join('\n')
  return (res && res.content) || ''
}

function poolForPrompt(pool) {
  // Small pools go in whole. Big ones would drown the prompt, so only the most
  // common slice is listed — the chapter's focus words travel separately in
  // every prompt, and the validator polices against the FULL pool, so being
  // stricter in the prompt than in validation is safe.
  const listed = pool.length <= 280 ? pool : pool.slice(0, 280)
  return listed.map(v => v.word + ' (' + v.meaning + ')').join(', ')
}

async function planSeason(tier, focusChunks) {
  const seed = SEASON_SEEDS[(tier.tier - 1) % SEASON_SEEDS.length]
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
    'Return ONLY valid JSON, no markdown fences:\n' +
    '{"season_title_en":"...","premise_en":"2-3 sentences","chapters":[{"title_en":"...","summary_en":"3-5 sentences of concrete beats","hook_en":"the chapter-ending hook (empty string for the last chapter)"}]}'
  return callJson(prompt, 4000)
}

async function draftChapter(tier, plan, chapterIdx, focusWords, pool, prevRecap) {
  const ch = plan.chapters[chapterIdx]
  const [minL, maxL] = tier.lines
  const kanaNote = cfg.kanaOnly ? '- Write ONLY in hiragana and katakana (no kanji at all)\n' : ''
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
    'Return ONLY valid JSON, no markdown fences — content is an ARRAY of line strings:\n' +
    '{"title":"short ' + cfg.promptLang + ' chapter title, no chapter number","lines":["line1","line2","..."]}'
  const res = await callJson(prompt, 6000)
  return { title: res.title, content: toContent(res) }
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
    (cfg.kanaOnly ? 'Write ONLY in hiragana and katakana (no kanji).\n' : '') +
    'Keep ' + minL + '-' + maxL + ' lines, dialogue format NAME' + COLON + 'text, speakers only from: ' + cfg.bible.speakers.join(', ') + '\n\n' +
    'Return ONLY valid JSON, no markdown fences — lines is an ARRAY: {"title":"...","lines":["line1","line2","..."]}'
  const res = await callJson(prompt, 6000)
  return { title: res.title, content: toContent(res) }
}

async function critiqueStory(draft) {
  const prompt =
    'You are a strict editor of graded readers for ' + cfg.levelName + ' ' + cfg.promptLang + ' learners. Score this chapter.\n\n' +
    draft.content + '\n\n' +
    'Rubric (score 1-10 overall):\n' +
    '- Natural, idiomatic ' + cfg.promptLang + ' (not translated-sounding, not choppy baby prose)\n' +
    '- An actual story: concrete events, cause and effect, a reason to keep reading\n' +
    '- Distinct character voices in dialogue\n' +
    '- Appropriate for the level (simple grammar, but not insulting)\n\n' +
    'Return ONLY valid JSON, no markdown fences: {"score": <1-10>, "feedback": "2-4 specific, actionable problems (or what works, if 8+)"}'
  // Small OUTPUT, but a reasoning model needs headroom for thinking or it
  // returns empty content — this was the main cause of the first run failing.
  return callJson(prompt, 3000)
}

async function reviseForQuality(tier, draft, feedback, focusWords, pool) {
  const [minL, maxL] = tier.lines
  const prompt =
    'Revise this ' + cfg.levelName + ' ' + cfg.promptLang + ' graded-reader chapter based on the editor\'s feedback. Keep the same plot beats and chapter role.\n\n' +
    'Editor feedback:\n' + feedback + '\n\n' +
    'Chapter:\n' + draft.content + '\n\n' +
    'Constraints (unchanged):\n' +
    (cfg.kanaOnly ? '- ONLY hiragana and katakana (no kanji)\n' : '') +
    '- ' + minL + '-' + maxL + ' lines; dialogue format NAME' + COLON + 'text; speakers only from: ' + cfg.bible.speakers.join(', ') + '\n' +
    '- Focus words that must stay present: ' + focusWords.map(v => v.word).join(', ') + '\n' +
    '- ALLOWED VOCABULARY (plus names, particles, basic grammar):\n' + poolForPrompt(pool) + '\n\n' +
    'Return ONLY valid JSON, no markdown fences — lines is an ARRAY: {"title":"...","lines":["line1","line2","..."]}'
  const res = await callJson(prompt, 6000)
  return { title: res.title, content: toContent(res) }
}

async function translateStory(draft, attempt = 0) {
  const lines = draft.content.split('\n').map(l => l.trim()).filter(Boolean)
  const prompt =
    'Translate this ' + cfg.promptLang + ' graded-reader chapter to natural English, line by line.\n\n' +
    lines.map((l, i) => (i + 1) + '. ' + l).join('\n') + '\n\n' +
    'Rules:\n' +
    '- EXACTLY ' + lines.length + ' lines, same order, one translation per line\n' +
    '- Keep dialogue format: Speaker' + COLON + 'English text (translate the speaker name to romanized form, e.g. 李明 → Li Ming)\n' +
    '- Natural English, not word-by-word\n\n' +
    'Return ONLY valid JSON, no markdown fences: {"lines": ["...", "..."]}'
  const res = await callJson(prompt, 6000)
  const out = (res.lines || []).map(l => String(l).trim()).filter(Boolean)
  if (out.length !== lines.length && attempt < 1) return translateStory(draft, attempt + 1)
  return { ok: out.length === lines.length, english: out.join('\n') }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const tiersToRun = onlyTier ? cfg.tiers.filter(t => t.tier === onlyTier) : cfg.tiers
  if (tiersToRun.length === 0) { console.error('No tier ' + onlyTier + ' in this config.'); process.exit(1) }
  console.log('=== Serial stories: ' + language + '/' + system + '/level ' + level + (onlyTier ? ' — TIER ' + onlyTier + ' only' : '') + ' ===')

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

  // Allowed vocabulary = the WHOLE level, for every tier. Capping the pool at
  // the tier boundary (first 100 words for tier 1) starved the writer — drafts
  // came in at 60-64% in-pool, and forcing them up to 95% flattened the prose
  // into stiff, low-scoring text. It's all the same level and every word is
  // tappable, so a generous pool lets the model write naturally and hit
  // coverage without mangling. Focus words stay the tier's own slice.
  const fullCap = cfg.tiers[cfg.tiers.length - 1].cap
  const fullPool = await fetchVocab(fullCap)

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

    process.stdout.write('Planning season... ')
    const plan = await planSeason(tier, focusChunks)
    console.log('"' + plan.season_title_en + '"')

    let prevRecap = ''
    for (let i = 0; i < tier.chapters; i += 1) {
      const focus = focusChunks[i]
      process.stdout.write('Ch ' + (i + 1) + '/' + tier.chapters + ': draft... ')
      try {
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

        // Quality gate: a solid graded reader scores ~6+. Below that → one
        // quality revision, re-checked (and re-covered if the rewrite drifts).
        const PUBLISH_SCORE = 6
        process.stdout.write('critique... ')
        let crit = await critiqueStory(draft)
        if ((crit.score || 0) < PUBLISH_SCORE) {
          process.stdout.write('revise(' + crit.score + ')... ')
          draft = await reviseForQuality(tier, draft, crit.feedback || '', focus, pool)
          v = validateStory(draft.content, pool, tier)
          if (!v.ok) { draft = await reviseForCoverage(tier, draft, v, focus, pool); v = validateStory(draft.content, pool, tier) }
          crit = await critiqueStory(draft)
        }

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
        nextNum += 1
        prevRecap = plan.chapters[i].summary_en
        await sleep(1500)
      } catch (err) {
        console.log('FAILED: ' + err.message)
      }
    }
  }

  console.log('\nAll done. Published ' + published + ', held for review ' + held + '.')
  if (held > 0) console.log('Held chapters: stories rows with is_published=false — review in the dashboard, fix or regenerate, then flip is_published.')
}

main().catch(err => { console.error(err); process.exit(1) })
