import { readFileSync } from 'node:fs'
import { validateStory } from './storyValidation.mjs'
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

let pass = 0, fail = 0, skipped = 0
const seenTitles = new Set()
const duplicates = []

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
  const NARRATION_TAIL = ['说', '写', '着', '问', '道', '喊', '答', '是', '的']
  const storySpeakers = []
  const narrationColons = []
  for (const line of (s.content || '').split('\n')) {
    const idx = line.indexOf(cfg.colon || '：')
    if (idx > 0 && idx <= 8) {
      const name = line.slice(0, idx).trim()
      if (!name) continue
      const looksLikeNarration = NARRATION_TAIL.indexOf(name[name.length - 1]) !== -1
      if (looksLikeNarration) {
        if (narrationColons.indexOf(name) === -1) narrationColons.push(name)
      } else if (storySpeakers.indexOf(name) === -1) {
        storySpeakers.push(name)
      }
    }
  }

  const r = validateStory(s.content, {
    pool,
    tier: { ...tier, lines: [0, Number.MAX_SAFE_INTEGER] },
    language: s.language,
    speakers: storySpeakers,
    extraNames: (s.language === 'chinese' ? ['大毛'] : []).concat(cfg.bible.speakers),
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
