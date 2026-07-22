#!/usr/bin/env node
//
// Load pronunciation overrides into tts_pronunciation_overrides.
//
// Dry run by default, like every other seeding script here. `--apply` writes.
//
// Changing a pronunciation does NOT delete or re-record anything: it marks the
// affected clips stale, so they keep playing until the next generation run
// replaces them. That is the difference between "the audio is wrong for an hour"
// and "the audio is missing for an hour".
//
//   node --env-file=.env.script tts-overrides.mjs                 # preview
//   node --env-file=.env.script tts-overrides.mjs --apply         # write
//   node --env-file=.env.script tts-overrides.mjs --apply --mark-stale
//
// Verification: entries land as whatever the file says, defaulting to
// `unreviewed`. This script will NOT write `verified` or `rejected` - those are
// human judgements and must be made through a review action, not a bulk load.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { normalizeOverride, overrideKey } from './src/tts/overrides.js'
import { OVERRIDE_VERIFICATION, HUMAN_ONLY_VERIFICATIONS } from './src/tts/constants.js'
import { readingToPhonemes } from './src/pinyin.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. Run with: node --env-file=.env.script tts-overrides.mjs')
  process.exit(1)
}

const argv = process.argv.slice(2)
const flag = (name) => argv.indexOf('--' + name) !== -1
const opt = (name, fallback) => {
  const i = argv.indexOf('--' + name)
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback
}

const apply = flag('apply')
const markStale = flag('mark-stale')
const locale = opt('locale', 'zh-CN')
const file = opt('file', 'data/tts-pronunciation-overrides.json')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const rows = []
  const rejected = []

  for (const entry of raw) {
    const o = normalizeOverride({ ...entry, locale: entry.locale || locale })
    if (!o.matched_text || !o.pinyin) {
      rejected.push({ entry, why: 'needs both matched_text and pinyin' })
      continue
    }
    if (HUMAN_ONLY_VERIFICATIONS.indexOf(o.verification) !== -1) {
      rejected.push({ entry, why: 'a bulk load may not set "' + o.verification + '"' })
      continue
    }
    // Convert now so a typo is caught here rather than at synthesis time. A
    // reading we cannot parse is still stored (the word is spoken plainly), but
    // it is called out so someone can fix it.
    const phones = readingToPhonemes(o.pinyin)
    if (!phones) rejected.push({ entry, why: 'pinyin could not be parsed - will be spoken without pinning', soft: true })

    rows.push({
      source_text: o.source_text || o.matched_text,
      matched_text: o.matched_text,
      pinyin: o.pinyin,
      context: o.context,
      provider_representation: o.provider_representation,
      locale: o.locale,
      verification: o.verification || OVERRIDE_VERIFICATION.UNREVIEWED,
      reviewer_note: o.reviewer_note,
    })
  }

  console.log('Pronunciation overrides from ' + file)
  console.log('  locale:   ' + locale)
  console.log('  valid:    ' + rows.length)
  console.log('  rejected: ' + rejected.filter(r => !r.soft).length)
  for (const r of rejected) {
    console.log('  ' + (r.soft ? '!' : 'x') + ' ' + (r.entry.matched_text || '?') + ' - ' + r.why)
  }

  if (!apply) {
    console.log('\nDRY RUN - nothing was written. Re-run with --apply.')
    for (const row of rows.slice(0, 10)) {
      console.log('  would upsert: ' + row.matched_text + ' -> ' + row.pinyin + ' [' + row.verification + ']')
    }
    if (rows.length > 10) console.log('  ... and ' + (rows.length - 10) + ' more')
    return
  }

  // Deliberately not an upsert. The table's uniqueness guard is an expression
  // index (coalesce(context,'')) so that a null context still dedupes, and
  // Postgres will not accept an expression index as an ON CONFLICT arbiter.
  // Reading first and then choosing update-or-insert is also version-agnostic,
  // which matters for a script an operator runs against whatever Postgres their
  // project happens to be on.
  const { data: existing, error: loadError } = await supabase
    .from('tts_pronunciation_overrides')
    .select('id, matched_text, context, locale')
    .eq('locale', locale)
  if (loadError) {
    console.error('Could not read existing overrides: ' + loadError.message)
    process.exit(1)
  }

  const idByKey = new Map()
  for (const row of existing || []) idByKey.set(overrideKey(row), row.id)

  const toInsert = []
  const toUpdate = []
  for (const row of rows) {
    const id = idByKey.get(overrideKey(row))
    if (id) toUpdate.push({ id, row })
    else toInsert.push(row)
  }

  if (toInsert.length) {
    const { error } = await supabase.from('tts_pronunciation_overrides').insert(toInsert)
    if (error) {
      console.error('Insert failed: ' + error.message)
      process.exit(1)
    }
  }
  for (const { id, row } of toUpdate) {
    const { error } = await supabase.from('tts_pronunciation_overrides').update(row).eq('id', id)
    if (error) {
      console.error('Update failed for ' + row.matched_text + ': ' + error.message)
      process.exit(1)
    }
  }

  console.log('\nWrote ' + rows.length + ' overrides (' + toInsert.length + ' new, ' + toUpdate.length + ' updated).')

  if (markStale) {
    // Any clip whose text contains an overridden span may now sound different.
    // Marking it stale queues it for regeneration without touching the file
    // that is currently serving learners.
    let stale = 0
    for (const row of rows) {
      const { data, error: selError } = await supabase
        .from('tts_audio')
        .select('id')
        .eq('locale', row.locale)
        .eq('status', 'ready')
        .like('normalized_text', '%' + row.matched_text + '%')
      if (selError) { console.error('  ! could not scan for ' + row.matched_text + ': ' + selError.message); continue }
      const ids = (data || []).map(r => r.id)
      if (!ids.length) continue
      const { error: updError } = await supabase.from('tts_audio').update({ status: 'stale' }).in('id', ids)
      if (updError) { console.error('  ! could not mark stale for ' + row.matched_text + ': ' + updError.message); continue }
      stale += ids.length
    }
    console.log('Marked ' + stale + ' clips stale. They keep playing until regenerated:')
    console.log('  npm run tts:generate -- --stale-only --limit 20 --confirm')
  } else {
    console.log('Existing audio was NOT marked stale. Add --mark-stale to queue affected clips for regeneration.')
  }
}

main().catch(err => { console.error(err.message); process.exit(1) })
