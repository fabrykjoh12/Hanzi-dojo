// Read-only corpus dump for the targeted story pipeline (FAB-9/FAB-10).
//
// The generator needs three things from production — the published stories, the
// active vocabulary, and nothing else — and it must not be able to touch them.
// Separating the fetch from the generation is what makes that enforceable: this
// script is the ONLY part of the pipeline that opens a Supabase client, it only
// ever calls .select(), and generate-targeted-stories.mjs takes a file.
//
// The story-pilot and llm-bench workflows already run it exactly this way:
//
//   node dump-story-corpus.mjs --out reports/story-corpus-dump.json
//
// The dump is not committed (reports/ is gitignored) — it is a snapshot of live
// data, and a stale copy in git would quietly retarget a future batch.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] ? args[i + 1] : def }

const out = arg('out', 'reports/story-corpus-dump.json')
const language = arg('language', 'chinese')
const system = arg('system', 'hsk_3')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required (use --env-file=.env.script).')
  process.exit(2)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

async function fetchAll(table, select, apply) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) { console.error(table + ': ' + error.message); process.exit(2) }
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

const vocab = await fetchAll('vocabulary', 'id, word, reading, meaning, level, sort_order',
  q => q.eq('language', language).eq('system', system).eq('is_active', true).order('sort_order', { ascending: true }))

// Published only, and content-bearing. Held rows are not corpus: a learner has
// never seen them, so they neither reinforce vocabulary nor risk duplication.
const stories = await fetchAll('stories', 'id, title, level, tier, story_number, content, language, is_published',
  q => q.eq('language', language).eq('is_published', true))

const dump = {
  schema: 'story-corpus-dump@1',
  generatedAt: new Date().toISOString(),
  language,
  system,
  counts: { vocabulary: vocab.length, publishedStories: stories.length },
  vocabulary: vocab,
  stories,
}

mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(dump, null, 1) + '\n')
console.log('wrote ' + out + ' — ' + vocab.length + ' vocabulary rows, ' + stories.length + ' published stories')
