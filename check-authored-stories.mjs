import { readFileSync } from 'node:fs'
import { validateStory, splitSpeaker } from './storyValidation.mjs'
import { levelConfig } from './storyLevels.mjs'

// Offline checker for hand-authored stories.
//
// authored-stories.mjs inserts a manifest into the database. Nothing checked
// that what it inserted was actually readable at its level — the LLM pipeline's
// coverage gate lived inside the generator, so an authored chapter could ship
// with words the learner has never met and nobody would know until a reader
// tapped dead text.
//
// This runs the SAME validator the generator uses, against the vocabulary lists
// already committed in data/, so it needs no Supabase connection, no API key and
// no network. That matters: it means a story can be written and verified in a
// session that has neither.
//
//   node check-authored-stories.mjs                     # data/authored-stories.json
//   node check-authored-stories.mjs --file my.json      # a specific manifest
//   node check-authored-stories.mjs --language chinese  # only these stories
//
// Exits non-zero if any story fails, so it can gate CI or a commit.

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] ? args[i + 1] : def }
const file = arg('file', 'data/authored-stories.json')
const onlyLanguage = arg('language', null)
const verbose = args.includes('--verbose')

// Two shapes live in data/: the per-level word lists seed-vocab.mjs loads
// ([{word, reading, meaning}], sort_order = file order) and the cumulative
// snapshots ([[word, pinyin]] covering every level up to and including their
// own). Both are read here, because between them they cover the whole ladder —
// data/hsk1.json and data/hsk2.json are empty files, and the HSK 1-2 words only
// exist in the snapshots.
const OWN_LEVEL_FILES = {
  // HSK 1 has no word list of its own either (data/hsk1.json is an empty file),
  // so every HSK 1 story was silently "skipped — no vocabulary list available".
  // The level with the tightest pool in the app — 300 words, no 可是, no 因为,
  // barely a conjunction — was the one level nothing was checking.
  'chinese|hsk_3|1': 'data/hsk1-vocab-snapshot.json',
  'chinese|hsk_3|3': 'data/hsk3.json',
  'chinese|hsk_3|4': 'data/hsk4.json',
  'chinese|hsk_3|5': 'data/hsk5.json',
  'chinese|hsk_3|6': 'data/hsk6.json',
  'japanese|jlpt|3': 'data/n4.json',
  'russian|russian|1': 'data/russian-a1.json',
}

// HSK 1 and 2 have no word list of their own in data/ (hsk1.json and hsk2.json
// are empty files), so their vocabulary comes from this cumulative snapshot —
// 497 words, exactly the database's 300 + 197.
//
// Note it is HSK 1+2 only. data/hsk3-vocab-snapshot.json looks like the next
// rung of the same ladder and is NOT: it is this file plus 457 words from an
// older HSK 3 draft, of which only 50 survive in the current level 3. Using it
// would both admit words the learner has never seen and, worse, exclude most of
// the real HSK 3 list (发现, 地方, 照片, 声音 …). The current list is
// data/hsk3.json, which matches the database exactly.
const HSK_1_2 = 'data/hsk2-vocab-snapshot.json'

const fileCache = {}
function loadFile(path) {
  if (fileCache[path] !== undefined) return fileCache[path]
  let raw
  try { raw = JSON.parse(readFileSync(path, 'utf8')) }
  catch { fileCache[path] = null; return null }
  const rows = Array.isArray(raw) ? raw : (raw.words || [])
  // A snapshot row is ["我","wǒ"]; a word-list row is {word, reading, meaning}.
  fileCache[path] = rows.map((v, i) => (
    Array.isArray(v)
      ? { word: v[0], reading: v[1], sort_order: i + 1 }
      : { ...v, sort_order: v.sort_order != null ? v.sort_order : i + 1 }
  ))
  return fileCache[path]
}

// Mirrors the generator's pool: every lower level in full, plus this level up
// to the last tier's cap. The tier a story is FILED under is what gates who
// sees it; the pool is about what the reader can already understand.
// Every level below, in full, plus this level in full.
//
// The own-level cap the generator applies (`tiers[last].cap`) is a pacing knob
// for a machine writing a season per tier — it is not a statement about what an
// HSK 4 reader can read. Half of HSK 4's own 929 words sit above that cap, and
// an authored HSK 4 story has no reason to avoid them. What gates who SEES a
// story is the tier it is filed under (tier_min_words), not which words it may
// contain.
function poolFor(language, system, level, cfg) {
  const rows = []
  if (level >= 2) {
    const base = loadFile(HSK_1_2)
    if (!base) return null
    rows.push(...base)
  }
  for (let l = 3; l < level; l += 1) {
    const mid = OWN_LEVEL_FILES[language + '|' + system + '|' + l]
    if (mid) { const r = loadFile(mid); if (r) rows.push(...r) }
  }
  const ownPath = OWN_LEVEL_FILES[language + '|' + system + '|' + level]
  const own = ownPath && loadFile(ownPath)
  if (own) rows.push(...own)
  return rows.length > 0 ? rows : null
}

let manifest
try { manifest = JSON.parse(readFileSync(file, 'utf8')) }
catch (err) { console.error('Cannot read ' + file + ': ' + err.message); process.exit(1) }
if (!Array.isArray(manifest)) { console.error('Manifest must be a JSON array.'); process.exit(1) }

// The canon file is the universe's memory: every established character, so a
// canon name (周淑兰) never counts as an out-of-pool miss at any level, and a
// speaker who is NOT yet in canon gets surfaced — a cast that grows silently
// is how seasons drift apart. Optional by design: a manifest for a fresh
// universe should still validate without one.
const CANON_FILES = { chinese: 'data/story-canon.chinese.json' }
const canonCache = {}
function canonFor(language) {
  if (canonCache[language] !== undefined) return canonCache[language]
  const path = CANON_FILES[language]
  let canon = null
  if (path) {
    try { canon = JSON.parse(readFileSync(path, 'utf8')) } catch { canon = null }
  }
  canonCache[language] = canon
  return canon
}
function canonNames(language) {
  const canon = canonFor(language)
  return canon && Array.isArray(canon.characters) ? canon.characters.map(c => c.name).filter(Boolean) : []
}

let pass = 0, fail = 0, skipped = 0
const seenTitles = new Set()
const duplicates = []

// A season's cast belongs to the whole season, not to one chapter. 云彩 speaks
// in chapters 3 and 4 and is merely mentioned in chapter 2 — read alone, that
// chapter looked like it used an out-of-pool word, when the reader knows
// perfectly well who 云彩 is by then. Collect every speaker at each level first.
const castByLevel = {}
for (const s of manifest) {
  const key = s.language + '|' + s.system + '|' + s.level
  const colon = (levelConfig(s.language, s.system, s.level) || {}).colon || '：'
  for (const line of (s.content || '').split('\n')) {
    const { speaker } = splitSpeaker(line, colon)
    if (!speaker) continue
    if (!castByLevel[key]) castByLevel[key] = new Set()
    castByLevel[key].add(speaker)
  }
}

for (const s of manifest) {
  if (onlyLanguage && s.language !== onlyLanguage) continue
  const label = s.language + '/' + s.system + '/' + s.level + ' t' + (s.tier ?? 1) + ' "' + s.title + '"'

  // authored-stories.mjs dedupes on exactly this key, so a duplicate here is a
  // story that would be silently skipped at insert time.
  const dupKey = [s.language, s.system, s.level, s.title].join('|')
  if (seenTitles.has(dupKey)) duplicates.push(label)
  seenTitles.add(dupKey)

  const cfg = levelConfig(s.language, s.system, s.level)
  const pool = cfg && poolFor(s.language, s.system, s.level, cfg)
  if (!cfg || !pool) {
    console.log('· ' + label + ' — no vocabulary list available, skipped')
    skipped += 1
    continue
  }
  const tier = cfg.tiers.find(t => t.tier === (s.tier ?? 1)) || cfg.tiers[0]

  // An authored story is not held to the generator's house style, only to what
  // actually affects a reader:
  //
  // - Its cast is its own. The reader takes character names from the story
  //   itself, so a folk tale with a 农民 and a 姑娘 is correct, not broken —
  //   the generator's whitelist exists to keep ITS serial cast consistent.
  //   Names still go into the dictionary so they never count as out-of-pool.
  // - Its chapters are as long as they need to be. The tier line ranges are
  //   targets for generated chapters, not a definition of a valid story.
  //
  // What is NOT negotiable is vocabulary coverage: a word outside the pool is
  // a word the learner has never met and cannot tap.
  // A colon inside narration is read as a speaker tag by the reader AND by the
  // matcher, which silently hides the first few characters of the line from
  // coverage and shows them to the learner as a character name. It is the
  // easiest mistake to make when authoring ("上面写着：…", "他们说：…") and the
  // hardest to see, because the story still looks right in a text editor.
  //
  // Any label ending in a speech or writing verb is narration, not a name.
  // 是 and 的 catch the reported-speech shapes ("他写的是：…", "上面的字是：…")
  // that the verb endings miss. No character name ends in any of these.
  // 想 catches reported *thought* ("他想：…"), which is as common in a story as
  // reported speech and reads as a character named 他想.
  const NARRATION_TAIL = ['说', '写', '着', '问', '道', '喊', '答', '是', '的', '想']
  const storySpeakers = []
  const narrationColons = []
  for (const line of (s.content || '').split('\n')) {
    const { speaker } = splitSpeaker(line, cfg.colon || '：')
    if (!speaker) continue
    const looksLikeNarration = NARRATION_TAIL.indexOf(speaker[speaker.length - 1]) !== -1
    if (looksLikeNarration) {
      if (narrationColons.indexOf(speaker) === -1) narrationColons.push(speaker)
    } else if (storySpeakers.indexOf(speaker) === -1) {
      storySpeakers.push(speaker)
    }
  }

  // A story may lower its own bar, but only by saying so out loud in the data.
  // This exists for ONE case: a season whose subject genuinely needs a larger
  // fixed vocabulary than the tier assumes — a fantasy world has to be able to
  // say 城, 族, 墙, 火, 夜 or it cannot be told at all, and writing around them
  // produces worse Chinese than teaching them. The words are still declared,
  // still repeated, and still capped; what moves is the threshold, per story,
  // visibly, in `data/authored-stories.json`.
  //
  // It is deliberately NOT a way to let a sloppy story through: a story with a
  // sprawling one-off vocabulary looks exactly the same to this check as one
  // with a tight recurring set, so the number here is a promise the author is
  // making about the SHAPE of the reach set, not just its size. Keep using the
  // tier default unless the season's premise really cannot fit inside it.
  const bar = {
    ...tier,
    lines: [0, Number.MAX_SAFE_INTEGER],
    ...(typeof s.min_coverage === 'number' ? { minCov: s.min_coverage } : {}),
    ...(typeof s.max_reach === 'number' ? { maxMisses: s.max_reach } : {}),
  }
  const lowered = bar.minCov !== tier.minCov || bar.maxMisses !== tier.maxMisses

  const r = validateStory(s.content, {
    pool,
    tier: bar,
    language: s.language,
    speakers: storySpeakers,
    extraNames: (s.language === 'chinese' ? ['大毛'] : [])
      .concat(cfg.bible.speakers)
      .concat(canonNames(s.language))
      .concat([...(castByLevel[s.language + '|' + s.system + '|' + s.level] || [])]),
    maxLineChars: cfg.maxLineChars,
    colon: cfg.colon || '：',
  })

  if (narrationColons.length > 0) {
    r.problems.push('Narration read as a speaker tag: ' + narrationColons.join('、')
      + '. Use a comma — a colon here hides the start of the line and shows it as a character name.')
    r.ok = false
  }

  const [minLines] = tier.lines
  const advisories = []
  if (r.lineCount < minLines) {
    advisories.push('shorter than the tier target (' + r.lineCount + ' lines vs ' + minLines + ')')
  }
  // Always say when a story was judged against its own bar rather than the
  // tier's, so a lowered threshold can never pass quietly.
  if (lowered) {
    advisories.push('judged at a declared lower bar: ' + Math.round(bar.minCov * 100) + '% / '
      + bar.maxMisses + ' reach words (tier default is ' + Math.round(tier.minCov * 100) + '% / '
      + tier.maxMisses + ')')
  }
  // Advisory, not failure: new characters are allowed — but they must not stay
  // invisible, or the next season won't know they exist.
  if (canonFor(s.language)) {
    const canon = canonFor(s.language)
    const known = new Set(canonNames(s.language)
      .concat(cfg.bible.speakers)
      .concat(Array.isArray(canon.role_labels) ? canon.role_labels : []))
    const uncanonized = storySpeakers.filter(name => !known.has(name))
    if (uncanonized.length > 0) {
      advisories.push('speakers not in canon: ' + uncanonized.join('、') + ' — add them to ' + CANON_FILES[s.language])
    }
  }

  // A line-aligned translation is what the reader pairs with each line; a
  // mismatch silently shifts every English line against its original.
  const contentLines = (s.content || '').split('\n').filter(l => l.trim()).length
  const englishLines = (s.english_content || '').split('\n').filter(l => l.trim()).length
  const problems = r.problems.slice()
  if (s.english_content && englishLines !== contentLines) {
    problems.push('Translation is ' + englishLines + ' lines but the story is ' + contentLines + '.')
  }

  if (problems.length === 0) {
    pass += 1
    const reach = r.misses.length ? ', reach words: ' + r.misses.join('、') : ''
    const note = advisories.length ? '  (' + advisories.join('; ') + ')' : ''
    console.log('✓ ' + label + ' — ' + Math.round(r.coverage * 100) + '% in-pool, ' + r.lineCount + ' lines' + (verbose ? reach : '') + note)
  } else {
    fail += 1
    console.log('✗ ' + label)
    problems.forEach(p => console.log('    ' + p))
  }
}

if (duplicates.length > 0) {
  console.log('\nDuplicate titles (the insert would skip these):')
  duplicates.forEach(d => console.log('  ' + d))
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skipped ? ', ' + skipped + ' skipped' : '') + '.')
if (fail > 0 || duplicates.length > 0) process.exit(1)
