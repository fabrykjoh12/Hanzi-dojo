import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GROQ_API_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-story-translations.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const groq = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function buildPrompt(story) {
  return 'Translate this Japanese story to English for a language learner.\n\n' +
    'Rules:\n' +
    '- Translate line by line, keeping the EXACT same number of lines\n' +
    '- Keep the dialogue format: speaker：English text (same speaker names, full-width colon)\n' +
    '- Narration lines have no prefix\n' +
    '- Natural, readable English — not word-for-word literal\n' +
    '- Each translated line should be short and clear\n\n' +
    'Japanese story:\n' +
    story.content + '\n\n' +
    'Return ONLY valid JSON with no markdown:\n' +
    '{"english_content":"line1\\nline2\\n..."}\n\n' +
    'The english_content must have exactly the same number of lines as the Japanese.'
}

async function translateStory(story, attempt = 0) {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildPrompt(story) }],
    })
    const text = response.choices[0].message.content.trim()
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(json)
    return parsed.english_content
  } catch (err) {
    if (attempt < 3) {
      const wait = Math.min(15 * Math.pow(2, attempt), 60)
      process.stdout.write('(retry ' + wait + 's) ')
      await sleep(wait * 1000)
      return translateStory(story, attempt + 1)
    }
    throw err
  }
}

async function main() {
  const { data: stories, error } = await supabase
    .from('stories')
    .select('id, title, content, english_content')
    .is('english_content', null)
    .eq('is_published', true)
    .order('story_number', { ascending: true })

  if (error) { console.error('Fetch error:', error.message); process.exit(1) }
  console.log('Found ' + stories.length + ' stories without translations.')
  if (stories.length === 0) { console.log('All stories already translated.'); return }

  let success = 0
  let failed = 0

  for (const story of stories) {
    process.stdout.write('"' + story.title + '"... ')
    try {
      const englishContent = await translateStory(story)

      const jpLines = story.content.split('\n').filter(Boolean).length
      const enLines = englishContent.split('\n').filter(Boolean).length
      if (enLines !== jpLines) {
        process.stdout.write('(line mismatch ' + jpLines + ' jp vs ' + enLines + ' en — saving anyway) ')
      }

      const { error: updateError } = await supabase
        .from('stories')
        .update({ english_content: englishContent })
        .eq('id', story.id)

      if (updateError) throw new Error(updateError.message)
      console.log('done')
      success++
      await sleep(3000)
    } catch (err) {
      console.log('FAILED: ' + err.message)
      failed++
    }
  }

  console.log('\nDone. ' + success + ' translated, ' + failed + ' failed.')
}

main().catch(err => { console.error(err); process.exit(1) })
