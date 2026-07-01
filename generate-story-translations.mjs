import { createClient } from '@supabase/supabase-js'
import { llm, LLM_MODEL } from './llm.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-story-translations.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const groq = llm

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function buildPrompt(story) {
  const lines = story.content.split('\n').filter(Boolean)
  const numbered = lines.map((l, i) => (i + 1) + ': ' + l).join('\n')
  return 'Translate the following ' + lines.length + '-line story to English for a language learner.\n\n' +
    'CRITICAL: english_content must have EXACTLY ' + lines.length + ' lines — one English line per numbered ' +
    'line below, in the same order. Do not merge, split, summarize, or drop any line.\n\n' +
    'Rules:\n' +
    '- Keep the dialogue format: speaker：English text (same speaker name, full-width colon)\n' +
    '- Narration lines have no prefix\n' +
    '- Natural, readable English — not word-for-word literal\n' +
    '- Each translated line should be short and clear\n\n' +
    'Numbered story lines:\n' +
    numbered + '\n\n' +
    'Return ONLY valid JSON with no markdown, with exactly ' + lines.length + ' lines in english_content:\n' +
    '{"english_content":"line1\\nline2\\n..."}'
}

function parseDailyLimitWait(err) {
  const msg = (err.message || '') + (err.error ? JSON.stringify(err.error) : '')
  if (!msg.includes('tokens per day') && !msg.includes('TPD')) return null
  // "Please try again in 18m9.5s"
  const mMatch = msg.match(/try again in (\d+)m([\d.]+)s/)
  if (mMatch) return (parseInt(mMatch[1]) * 60 + parseFloat(mMatch[2])) * 1000
  const sMatch = msg.match(/try again in ([\d.]+)s/)
  if (sMatch) return parseFloat(sMatch[1]) * 1000
  return 60 * 60 * 1000 // default: 1 hour
}

async function translateStory(story, attempt = 0) {
  try {
    const response = await groq.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildPrompt(story) }],
    })
    const text = response.choices[0].message.content.trim()
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(json)

    const jpLines = story.content.split('\n').filter(Boolean).length
    const enLines = (parsed.english_content || '').split('\n').filter(Boolean).length
    if (enLines !== jpLines && attempt < 2) {
      process.stdout.write('(line mismatch, retry) ')
      return translateStory(story, attempt + 1)
    }
    return parsed.english_content
  } catch (err) {
    const dailyWaitMs = parseDailyLimitWait(err)
    if (dailyWaitMs !== null) {
      const mins = Math.ceil(dailyWaitMs / 60000)
      throw Object.assign(new Error('Daily token limit reached. Run again in ~' + mins + ' minutes.'), { isDailyLimit: true })
    }
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
      if (err.isDailyLimit) {
        console.log('STOPPED: ' + err.message)
        console.log('\n' + success + ' translated so far, ' + (stories.length - success) + ' remaining.')
        console.log('Re-run the same command later to continue where it left off.')
        return
      }
      console.log('FAILED: ' + err.message)
      failed++
    }
  }

  console.log('\nDone. ' + success + ' translated, ' + failed + ' failed.')
}

main().catch(err => { console.error(err); process.exit(1) })
