// Fetch a fresh corpus dump — the { stories, vocab } input file that
// audit-story-coverage.mjs, calibrate-story-defaults.mjs and
// generate-targeted-stories.mjs all share. Read-only; writes one local file.
//
// Vocabulary includes `meaning` on purpose: the generation prompts gloss the
// target words with it, and carrying it in the dump keeps the whole targeted
// pipeline runnable from this one file.
//
//   node --env-file=.env.script dump-story-corpus.mjs [--out reports/story-corpus-dump.json]

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script dump-story-corpus.mjs')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const i = process.argv.indexOf('--out')
const outPath = i >= 0 ? process.argv[i + 1] : 'reports/story-corpus-dump.json'

const pages = async (build, label) => {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) { console.error(label + ' query failed:', error.message); process.exit(1) }
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

const stories = await pages(() => supabase
  .from('stories')
  .select('id, title, level, language, is_published, presentation, content')
  .eq('language', 'chinese').eq('is_published', true)
  .order('level').order('story_number'), 'Stories')
const vocab = await pages(() => supabase
  .from('vocabulary')
  .select('word, level, sort_order, meaning')
  .eq('language', 'chinese').eq('system', 'hsk_3').eq('is_active', true)
  .order('level').order('sort_order'), 'Vocabulary')

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), stories, vocab }))
console.log('wrote ' + outPath + ' — ' + stories.length + ' published stories, ' + vocab.length + ' vocabulary items')
