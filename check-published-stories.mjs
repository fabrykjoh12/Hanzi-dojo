// Structural validator for the LIVE published stories (Chinese). Read-only.
//
// check-authored-stories.mjs validates the authored manifests in data/ before
// they are inserted; nothing validated what is actually PUBLISHED in the
// database — where drift really bites (a preview edited by hand, a chapter
// unpublished out of a season, translations misaligned by one line). This
// script pulls every published Chinese story and checks the invariants the
// readers and the shelf depend on. It needs the service key, so it runs
// locally via .env.script or in the content-utils Action (task
// `check-published`), never in plain CI.
//
//   node --env-file=.env.script check-published-stories.mjs            # report
//   node --env-file=.env.script check-published-stories.mjs --strict   # warnings also fail
//
// ERRORS (exit 1 — a learner-visible break):
//   - empty content, or missing title
//   - null tier / story_number
//   - duplicate (level, story_number) among published rows
//   - english_content present but its non-empty line count differs from the
//     Chinese content's (per-line reveal shows the WRONG translation)
//   - missing / blank english_summary (the shelf preview)
//   - missing cover art or a three-question ending check
// WARNINGS (exit 0 unless --strict — real, but may be deliberate):
//   - chapter-number gaps among the published chapters of a series, but ONLY
//     when the missing chapter actually exists UNPUBLISHED at the same level
//     (a genuinely held chapter — decide, don't just renumber; see
//     docs/PM-BOARD.md HD-P4). Gaps with no matching held row are the
//     multi-level serials, whose chapters deliberately continue numbering
//     across levels (1–6 at HSK 1, 7–12 at HSK 2, 13–18 at HSK 3) — those are
//     not flagged.
//   - no playable legacy audio and no complete generated utterance set

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script check-published-stories.mjs [--strict]')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const strict = process.argv.includes('--strict')

const lines = (s) => String(s || '').split('\n').filter(l => l.trim() !== '')

async function fetchAllPages(build, label) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) {
      console.error(label + ' query failed:', error.message)
      process.exit(1)
    }
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

// Leading chapter number of a title ("3. 商店寻宝记" → 3), mirroring the ASCII
// half of src/storyArcs.js (the DB titles for serials all use "N. " form).
function chapterNumber(title) {
  const t = String(title || '').trim()
  let i = 0
  let digits = ''
  while (i < t.length && t.charCodeAt(i) >= 0x30 && t.charCodeAt(i) <= 0x39) {
    digits += t[i]
    i += 1
  }
  if (!digits || i >= t.length) return null
  if ('.．。、,，:：)）]】-–—·・ \t　'.indexOf(t[i]) === -1) return null
  return parseInt(digits, 10)
}

const { data: stories, error } = await supabase
  .from('stories')
  .select('id, title, level, tier, story_number, presentation, content, english_content, english_summary, image_path, has_audio')
  .eq('language', 'chinese')
  .eq('is_published', true)
  .order('level')
  .order('story_number')

if (error) {
  console.error('Query failed:', error.message)
  process.exit(1)
}

// Held (unpublished) rows, used to tell a real held-chapter gap from a
// cross-level serial continuation.
const { data: heldRows, error: heldError } = await supabase
  .from('stories')
  .select('title, level')
  .eq('language', 'chinese')
  .eq('is_published', false)

if (heldError) {
  console.error('Held-rows query failed:', heldError.message)
  process.exit(1)
}

const heldChapters = new Set(
  (heldRows || [])
    .map(r => ({ n: chapterNumber(r.title), level: r.level }))
    .filter(r => r.n != null)
    .map(r => r.level + '#' + r.n)
)

// `has_audio` describes the older line-file convention. Generated narration
// is the current source of truth, so validate the actual ready assets as well.
const publishedIds = new Set((stories || []).map(story => story.id))
const utterances = (await fetchAllPages(
  () => supabase.from('story_utterances').select('id, story_id'),
  'Story utterances'
)).filter(row => publishedIds.has(row.story_id))
const readyAudio = await fetchAllPages(
  () => supabase
    .from('tts_audio')
    .select('source_id')
    .eq('source_type', 'story_utterance')
    .eq('variant', 'utterance')
    .eq('status', 'ready')
    .not('storage_path', 'is', null),
  'Ready story audio'
)
const readyIds = new Set(readyAudio.map(row => row.source_id))
const utterancesByStory = Map.groupBy(utterances, row => row.story_id)
const generatedNarration = new Set(
  Array.from(utterancesByStory.entries())
    .filter(([, rows]) => rows.length > 0 && rows.every(row => readyIds.has(row.id)))
    .map(([storyId]) => storyId)
)
const questions = await fetchAllPages(
  () => supabase.from('story_questions').select('story_id').in('story_id', Array.from(publishedIds)),
  'Story questions'
)
const questionsByStory = new Map()
for (const question of questions) {
  questionsByStory.set(question.story_id, (questionsByStory.get(question.story_id) || 0) + 1)
}

const errors = []
const warnings = []
const where = (s) => `[L${s.level} #${s.story_number}] ${s.title} (${s.id})`

for (const s of stories) {
  if (!String(s.title || '').trim()) errors.push(`${where(s)}: missing title`)
  if (lines(s.content).length === 0) errors.push(`${where(s)}: empty content`)
  if (s.tier == null) errors.push(`${where(s)}: null tier`)
  if (s.story_number == null) errors.push(`${where(s)}: null story_number`)
  if (!String(s.english_summary || '').trim()) errors.push(`${where(s)}: missing english_summary (shelf preview)`)
  if (!String(s.image_path || '').trim()) errors.push(`${where(s)}: missing cover art`)
  if (questionsByStory.get(s.id) !== 3) errors.push(`${where(s)}: expected exactly 3 ending questions`)

  const zh = lines(s.content).length
  const en = lines(s.english_content).length
  if (s.presentation !== 'manhua') {
    if (en === 0) errors.push(`${where(s)}: no english_content`)
    else if (en !== zh) errors.push(`${where(s)}: line mismatch — ${zh} Chinese vs ${en} English`)
  }
  if (!s.has_audio && !generatedNarration.has(s.id)) {
    warnings.push(`${where(s)}: no complete playable narration`)
  }
}

// Duplicate (level, story_number) among published rows.
const byNumber = new Map()
for (const s of stories) {
  const key = s.level + '#' + s.story_number
  if (byNumber.has(key)) errors.push(`${where(s)}: duplicate story_number with ${byNumber.get(key).title}`)
  else byNumber.set(key, s)
}

// Chapter gaps per series: group consecutive published rows the way the shelf
// does (a chapter number of 1 or a backwards move starts a new series), then
// look for holes in each series' published numbering.
for (const [level, group] of Map.groupBy(stories, (s) => s.level)) {
  let series = []
  let prev = null
  const flush = () => {
    const nums = series.map(s => chapterNumber(s.title)).filter(n => n != null)
    if (nums.length > 1) {
      const missing = []
      for (let n = nums[0]; n <= nums[nums.length - 1]; n += 1) {
        // Only a real gap when that chapter exists unpublished at this level —
        // otherwise it's a cross-level serial leg (numbering continues from a
        // lower level) and there is nothing to publish.
        if (!nums.includes(n) && heldChapters.has(level + '#' + n)) missing.push(n)
      }
      if (missing.length) {
        warnings.push(`L${level} series “${series[0].title}”: published chapters ${nums.join(',')} — chapters ${missing.join(',')} exist unpublished (held)`)
      }
    }
    series = []
  }
  for (const s of group) {
    const n = chapterNumber(s.title)
    if (series.length && (n === 1 || (n != null && prev != null && n <= prev))) flush()
    series.push(s)
    prev = n
  }
  flush()
}

console.log(`Checked ${stories.length} published Chinese stories.`)
for (const e of errors) console.log('ERROR   ' + e)
for (const w of warnings) console.log('warning ' + w)
console.log(`${errors.length} errors, ${warnings.length} warnings.`)

if (errors.length || (strict && warnings.length)) process.exit(1)
