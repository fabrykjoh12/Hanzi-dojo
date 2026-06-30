import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// Generate end-of-story comprehension questions and insert them into
// story_questions. Three English multiple-choice questions per story (4 options,
// one correct) so beginners are tested on understanding, not on decoding the
// question. Uses the story's content + english_content for grounding.
//
// Run with:
//   node --env-file=.env.script generate-comprehension.mjs                  # fill stories with no questions
//   node --env-file=.env.script generate-comprehension.mjs --japanese       # Japanese only
//   node --env-file=.env.script generate-comprehension.mjs --replace        # delete + regenerate all
//   node --env-file=.env.script generate-comprehension.mjs --dry-run        # preview, write nothing

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GROQ_API_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-comprehension.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const groq = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })

const args = process.argv.slice(2)
const onlyChinese = args.includes('--chinese')
const onlyJapanese = args.includes('--japanese')
const doReplace = args.includes('--replace')
const dryRun = args.includes('--dry-run')

const MODEL = 'llama-3.3-70b-versatile'
const PER_STORY = 3

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function buildPrompt(story) {
  return `You are writing reading-comprehension questions for a beginner language story.

Story title: ${story.title}
Story (target language):
${story.content}

English translation (for your reference):
${story.english_content || '(none provided)'}

Write exactly ${PER_STORY} multiple-choice comprehension questions IN ENGLISH that check whether the reader understood what happened in the story.

Rules:
- Questions and all answer options are in ENGLISH.
- Each question has exactly 4 options; exactly ONE is correct.
- Answers must be decidable from the story alone. No trick questions.
- Keep questions simple and concrete (who/what/where/why), suitable for a beginner.
- Vary the position of the correct option.
- Return ONLY a JSON array, no markdown, no commentary.

Return a JSON array with exactly ${PER_STORY} objects:
[{"question":"...","options":["...","...","...","..."],"correct_index":0}, ...]`
}

function validate(items) {
  if (!Array.isArray(items) || items.length === 0) return null
  const out = []
  for (const it of items.slice(0, PER_STORY)) {
    if (!it || typeof it.question !== 'string') return null
    if (!Array.isArray(it.options) || it.options.length !== 4) return null
    const ci = Number(it.correct_index)
    if (!Number.isInteger(ci) || ci < 0 || ci > 3) return null
    out.push({ question: it.question.trim(), options: it.options.map(o => String(o).trim()), correct_index: ci })
  }
  return out.length ? out : null
}

async function generateFor(story, attempt = 0) {
  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildPrompt(story) }],
    })
    const text = response.choices[0].message.content.trim()
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    return validate(JSON.parse(json))
  } catch (err) {
    const waitSec = Math.min(15 * Math.pow(2, attempt), 120)
    if (attempt < 3) {
      process.stdout.write(`(waiting ${waitSec}s) `)
      await sleep(waitSec * 1000)
      return generateFor(story, attempt + 1)
    }
    throw err
  }
}

async function processLanguage(language, system) {
  console.log(`\n=== ${language.toUpperCase()} (${system})${dryRun ? ' — DRY RUN' : ''} ===`)

  const { data: stories, error } = await supabase
    .from('stories')
    .select('id, title, content, english_content, story_number, level')
    .eq('language', language)
    .eq('system', system)
    .eq('is_published', true)
    .order('level', { ascending: true })
    .order('story_number', { ascending: true })

  if (error) { console.error('Fetch error:', error.message); return }
  if (!stories || stories.length === 0) { console.log('No published stories.'); return }

  // Which stories already have questions?
  const { data: existing } = await supabase.from('story_questions').select('story_id')
  const haveQuestions = new Set((existing || []).map(r => r.story_id))

  let done = 0, skipped = 0, failed = 0

  for (const story of stories) {
    if (haveQuestions.has(story.id) && !doReplace) { skipped += 1; continue }
    process.stdout.write(`"${story.title}"... `)

    try {
      const questions = await generateFor(story)
      if (!questions) { failed += 1; console.log('✗ invalid output'); continue }

      if (dryRun) {
        console.log('(preview)')
        questions.forEach((q, i) => console.log(`   Q${i + 1}: ${q.question}  [${q.options[q.correct_index]}]`))
      } else {
        if (doReplace) await supabase.from('story_questions').delete().eq('story_id', story.id)
        const rows = questions.map((q, i) => ({
          story_id: story.id, question_number: i + 1,
          question: q.question, options: q.options, correct_index: q.correct_index,
        }))
        const { error: insErr } = await supabase.from('story_questions').insert(rows)
        if (insErr) throw new Error(insErr.message)
        console.log('✓')
      }
      done += 1
      await sleep(4000)
    } catch (err) {
      failed += 1
      console.log(`✗ ${err.message}`)
      if (String(err.message).toLowerCase().includes('tokens per day')) {
        console.log('Daily token limit hit — stopping. Safe to re-run later; it resumes where it left off.')
        break
      }
    }
  }

  console.log(`\n${language}: ${dryRun ? 'previewed' : '✓'} ${done}, skipped ${skipped} (already had questions), ✗ ${failed} failed`)
}

async function main() {
  if (!onlyJapanese) await processLanguage('chinese', 'hsk_3')
  if (!onlyChinese) await processLanguage('japanese', 'jlpt')
  console.log(`\nAll done.${dryRun ? ' (dry run — nothing written)' : ''}`)
}

main().catch(err => { console.error(err); process.exit(1) })
