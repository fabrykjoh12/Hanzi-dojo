#!/usr/bin/env node
//
// Sync stories into per-line utterance rows.
//
// This is the bridge between the story content that already exists
// (`stories.content`, newline separated) and line-by-line narration. It writes
// no audio and spends nothing - generation is a separate, confirmed step:
//
//   node --env-file=.env.script story-utterances.mjs --language chinese          # preview
//   node --env-file=.env.script story-utterances.mjs --language chinese --apply
//   node --env-file=.env.script story-utterances.mjs --story-id <uuid> --apply
//   npm run tts:generate -- --story-id <uuid> --confirm
//
// Re-running is safe: rows are keyed on (story_id, utterance_index), so an
// edited story updates its lines in place and every generated clip stays
// attached to its line. An edited line changes its content hash, which the
// generator then sees as stale.

import { createClient } from '@supabase/supabase-js'
import { validateTtsEnv } from './src/tts/config.js'
import { parseStoryUtterances, castOf } from './src/tts/utterances.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. Run with: node --env-file=.env.script story-utterances.mjs')
  process.exit(1)
}

const argv = process.argv.slice(2)
const flag = (name) => argv.indexOf('--' + name) !== -1
const opt = (name, fallback = null) => {
  const i = argv.indexOf('--' + name)
  return i !== -1 && argv[i + 1] && argv[i + 1].indexOf('--') !== 0 ? argv[i + 1] : fallback
}

const apply = flag('apply')
const storyId = opt('story-id')
const language = opt('language', 'chinese')
const system = opt('system')
const level = opt('level') == null ? null : Number(opt('level'))
const limit = Number(opt('limit', '50'))

// No credentials needed: this only reads and writes our own tables.
const config = validateTtsEnv(process.env, { requireCredentials: false })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  let query = supabase
    .from('stories')
    .select('id, title, language, system, level, content, english_content, presentation')
    .eq('is_published', true)
    .order('level', { ascending: true })
    .order('story_number', { ascending: true })
    .limit(limit)
  if (storyId) query = query.eq('id', storyId)
  else {
    query = query.eq('language', language)
    if (system) query = query.eq('system', system)
    if (level != null) query = query.eq('level', level)
  }

  const { data: stories, error } = await query
  if (error) { console.error('Could not load stories: ' + error.message); process.exit(1) }
  if (!stories || stories.length === 0) { console.log('No matching published stories.'); return }

  console.log('Syncing utterances for ' + stories.length + ' stories')
  console.log('  narrator voice: ' + config.voices.story)
  console.log('  character voice: ' + config.voices.male)
  console.log('  mode: ' + (apply ? 'APPLY' : 'DRY RUN'))

  let totalLines = 0
  let written = 0

  for (const story of stories) {
    const rows = parseStoryUtterances(story, { voices: config.voices })
    totalLines += rows.length
    const cast = castOf(rows)
    console.log('\n"' + story.title + '" - ' + rows.length + ' lines, '
      + cast.length + ' voice' + (cast.length === 1 ? '' : 's'))
    for (const part of cast) {
      console.log('   ' + part.speaker_id + ' x' + part.lines + ' -> ' + part.voice)
    }
    if (rows.length === 0) continue

    if (!apply) continue
    const { error: upsertError } = await supabase
      .from('story_utterances')
      .upsert(rows, { onConflict: 'story_id,utterance_index' })
    if (upsertError) {
      console.error('   x could not write utterances: ' + upsertError.message)
      continue
    }
    written += rows.length
    console.log('   written')
  }

  if (!apply) {
    console.log('\nDRY RUN - nothing was written. ' + totalLines + ' utterances would be created or updated.')
    console.log('Re-run with --apply, then generate narration with:')
    console.log('  npm run tts:generate -- --stories --limit 20 --confirm')
    return
  }
  console.log('\nWrote ' + written + ' utterances. No audio was generated - do that with:')
  console.log('  npm run tts:generate -- --stories --limit 20 --confirm')
}

main().catch(err => { console.error(err.message); process.exit(1) })
