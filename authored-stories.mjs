import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Human/Claude-authored stories pipeline. Instead of the automated LLM
// generator, the story text is written by hand (higher quality, no per-story
// API spend) and this script does the two things a chat window can't:
//
//   --list-vocab --language <l> --system <s> --level <n>
//       Dump the level's active vocabulary as JSON so stories can be written
//       with real coverage in mind. Prints between markers for easy CI-log lift.
//
//   --insert <manifest.json>
//       Insert authored stories. Each entry:
//         { language, system, level, tier, tier_min_words, title,
//           english_summary, content, english_content, is_published }
//       content        target-language text, one sentence/dialogue turn per line
//                      (dialogue: "NAME：text" with a fullwidth colon for CJK)
//       english_content line-by-line English, same number of lines as content
//       story_number is assigned automatically as (current max for that
//       language/system/level) + 1, incrementing across the batch, so authored
//       stories append after whatever already exists without collisions.
//
// Run with:
//   node --env-file=.env.script authored-stories.mjs --list-vocab --language chinese --system hsk_3 --level 1
//   node --env-file=.env.script authored-stories.mjs --insert data/authored-stories.json

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] ? args[i + 1] : def }
const hasFlag = (name) => args.indexOf('--' + name) !== -1

async function listVocab() {
  const language = arg('language', null)
  const system = arg('system', null)
  const level = arg('level', null)
  if (!language || !system || level == null) {
    console.error('Required: --language --system --level')
    process.exit(1)
  }
  const { data, error } = await supabase
    .from('vocabulary').select('word, reading, meaning, sort_order')
    .eq('language', language).eq('system', system).eq('level', parseInt(level, 10))
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) { console.error('Vocab error:', error.message); process.exit(1) }
  console.log('---VOCAB-JSON-START---')
  console.log(JSON.stringify(data || []))
  console.log('---VOCAB-JSON-END---')
  console.log(`\n${(data || []).length} active words for ${language}/${system}/level ${level}.`)
}

async function insertStories(file) {
  let manifest
  try { manifest = JSON.parse(readFileSync(file, 'utf8')) }
  catch (err) { console.error('Cannot read ' + file + ': ' + err.message); process.exit(1) }
  if (!Array.isArray(manifest) || manifest.length === 0) {
    console.error('Manifest must be a non-empty JSON array.'); process.exit(1)
  }

  // Track the next story_number per language/system/level, seeded from the DB.
  const nextNumCache = {}
  async function nextStoryNumber(language, system, level) {
    const key = `${language}|${system}|${level}`
    if (nextNumCache[key] == null) {
      const { data, error } = await supabase.from('stories').select('story_number')
        .eq('language', language).eq('system', system).eq('level', level)
        .order('story_number', { ascending: false }).limit(1)
      if (error) throw new Error(error.message)
      nextNumCache[key] = (data && data.length > 0 ? data[0].story_number : 0) + 1
    }
    const n = nextNumCache[key]
    nextNumCache[key] += 1
    return n
  }

  console.log(`Inserting ${manifest.length} authored story(ies)...\n`)
  let ok = 0, failed = 0
  for (const s of manifest) {
    const label = `${s.language}/${s.system}/${s.level} "${s.title}"`
    try {
      for (const f of ['language', 'system', 'level', 'title', 'content']) {
        if (s[f] == null || s[f] === '') throw new Error('missing field: ' + f)
      }
      const contentLines = s.content.split('\n').filter(l => l.trim())
      const englishLines = (s.english_content || '').split('\n').filter(l => l.trim())
      if (s.english_content && englishLines.length !== contentLines.length) {
        throw new Error(`english_content has ${englishLines.length} lines but content has ${contentLines.length}`)
      }
      const story_number = await nextStoryNumber(s.language, s.system, s.level)
      const { error } = await supabase.from('stories').insert({
        language: s.language, system: s.system, level: s.level,
        tier: s.tier ?? 1, tier_min_words: s.tier_min_words ?? 0,
        presentation: s.presentation || 'paced',
        interactions: s.interactions || null,
        story_number,
        title: s.title,
        english_summary: s.english_summary ?? null,
        content: contentLines.join('\n'),
        english_content: s.english_content ? englishLines.join('\n') : null,
        is_published: s.is_published !== false,
      })
      if (error) throw new Error(error.message)
      console.log(`✓ ${label} → #${story_number} (${contentLines.length} lines, ${s.is_published !== false ? 'published' : 'held'})`)
      ok += 1
    } catch (err) {
      console.log(`✗ ${label}: ${err.message}`)
      failed += 1
    }
  }
  console.log(`\n--- Done --- ✓ ${ok}  ✗ ${failed}`)
}

async function main() {
  if (hasFlag('list-vocab')) return listVocab()
  const insertFile = arg('insert', null)
  if (insertFile) return insertStories(insertFile)
  console.error('Specify a mode: --list-vocab --language --system --level  OR  --insert <manifest.json>')
  process.exit(1)
}
main().catch(err => { console.error(err); process.exit(1) })
