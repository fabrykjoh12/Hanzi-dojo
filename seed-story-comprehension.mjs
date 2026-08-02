import { createClient } from '@supabase/supabase-js'

// Deterministic fallback for published stories that have no authored quiz.
// It asks the learner to recognize three true event statements, with plausible
// same-level statements from other stories as distractors. Existing authored
// questions are never replaced. Dry-run by default.

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY')
const args = process.argv.slice(2)
const flag = name => args.includes('--' + name)
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback
}
const apply = flag('apply')
const limit = Math.max(1, opt('limit', Number.MAX_SAFE_INTEGER))
const offset = Math.max(0, opt('offset', 0))
const db = createClient(url, key)

const clean = value => String(value || '')
  .replace(/^\s*[^:]{1,24}:\s*/, '')
  .replace(/^\s*[“”"']|[“”"']\s*$/g, '')
  .trim()

function hash(value) {
  let out = 2166136261
  for (const ch of String(value)) out = Math.imul(out ^ ch.charCodeAt(0), 16777619)
  return out >>> 0
}

function statements(story) {
  const lines = String(story.english_content || '').split('\n').map(clean).filter(line => line.length >= 5)
  if (lines.length < 3) return []
  const picks = [Math.min(1, lines.length - 1), Math.floor(lines.length / 2), Math.max(0, lines.length - 2)]
  const unique = []
  for (const at of picks) if (!unique.includes(lines[at])) unique.push(lines[at])
  for (const line of lines) {
    if (unique.length >= 3) break
    if (!unique.includes(line)) unique.push(line)
  }
  return unique.slice(0, 3)
}

const { data: stories, error: storyError } = await db
  .from('stories')
  .select('id, title, level, story_number, english_content')
  .eq('language', 'chinese')
  .eq('is_published', true)
  .order('level')
  .order('story_number')
if (storyError) throw new Error(storyError.message)

const { data: existing, error: questionError } = await db.from('story_questions').select('story_id')
if (questionError) throw new Error(questionError.message)
const covered = new Set((existing || []).map(row => row.story_id))
const eligible = stories.filter(story => !covered.has(story.id) && statements(story).length === 3)
const selected = eligible.slice(offset, offset + limit)
let written = 0
let failed = 0

for (const story of selected) {
  const truths = statements(story)
  const peers = stories
    .filter(peer => peer.id !== story.id && peer.level === story.level)
    .flatMap(statements)
    .filter(statement => !truths.includes(statement))
  const questions = truths.map((truth, q) => {
    const start = hash(story.id + ':' + q) % Math.max(1, peers.length)
    const distractors = []
    for (let i = 0; i < peers.length && distractors.length < 3; i += 1) {
      const candidate = peers[(start + i) % peers.length]
      if (candidate !== truth && !distractors.includes(candidate)) distractors.push(candidate)
    }
    const correctIndex = (hash(story.id) + q) % 4
    const options = distractors.slice(0, 3)
    options.splice(correctIndex, 0, truth)
    return {
      question: ['Which statement matches the beginning of the story?', 'Which statement matches what happens in the story?', 'Which statement matches the ending of the story?'][q],
      options,
      correct_index: correctIndex,
    }
  })
  if (questions.some(q => q.options.length !== 4)) { failed += 1; continue }
  console.log((apply ? 'Adding' : 'Would add') + ' 3 questions: ' + story.title)
  if (!apply) continue
  const { error } = await db.rpc('replace_story_questions', { p_story_id: story.id, p_questions: questions })
  if (error) { failed += 1; console.error('  failed: ' + error.message) } else written += 1
}

console.log(`\n${apply ? 'Wrote' : 'Found'} ${apply ? written : selected.length} story quiz set(s); ${eligible.length - selected.length} remain outside this slice; ${failed} failed.`)
if (!apply) console.log('Dry run - pass --apply to write.')
if (failed) process.exit(1)
