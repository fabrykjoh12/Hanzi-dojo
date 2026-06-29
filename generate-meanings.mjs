import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// Regenerate the `meaning` column for vocabulary with concise, ACCURATE English
// glosses. The original AI meanings are messy/sometimes wrong (e.g. こんにちは
// listed as "Good morning., Good afternoon., Hello.").
//
// Run with:
//   node --env-file=.env.script generate-meanings.mjs --japanese --dry-run   # preview only
//   node --env-file=.env.script generate-meanings.mjs --japanese             # write
//   node --env-file=.env.script generate-meanings.mjs --chinese
//   node --env-file=.env.script generate-meanings.mjs                        # both
//
// By default it rewrites ALL active words. --dry-run prints before→after and
// writes nothing, so you can review before committing to the change.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GROQ_API_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-meanings.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const groq = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })

const args = process.argv.slice(2)
const onlyChinese = args.includes('--chinese')
const onlyJapanese = args.includes('--japanese')
const dryRun = args.includes('--dry-run')

const BATCH_SIZE = 15
const MODEL = 'llama-3.3-70b-versatile'

function buildPrompt(words, language) {
  const wordList = words.map((w, i) =>
    `${i + 1}. word="${w.word}" reading="${w.reading}"`
  ).join('\n')

  return `You are a ${language}→English dictionary for a beginner learning app.
For each word, give a SHORT, ACCURATE English meaning.

Rules:
- 1 to 3 of the most common senses, separated by commas (e.g. "hello, good afternoon").
- Most accurate / most common sense FIRST.
- Lower case (unless a proper noun). NO trailing periods. No duplicate senses. No notes or parts of speech.
- Be correct: e.g. こんにちは = "hello, good afternoon" (NOT "good morning"); 歯 = "tooth, teeth".
- For counters/suffixes, describe the function briefly (e.g. ～さい = "... years old (age counter)").
- Return ONLY a JSON array, no markdown, no commentary.

Words:
${wordList}

Return a JSON array with exactly ${words.length} objects, same order:
[{"meaning":"..."},...]`
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function generateBatch(words, language, attempt = 0) {
  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 2048,
      messages: [{ role: 'user', content: buildPrompt(words, language) }],
    })
    const text = response.choices[0].message.content.trim()
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    return JSON.parse(json)
  } catch (err) {
    const waitSec = Math.min(15 * Math.pow(2, attempt), 120)
    if (attempt < 3) {
      process.stdout.write(`(waiting ${waitSec}s) `)
      await sleep(waitSec * 1000)
      return generateBatch(words, language, attempt + 1)
    }
    throw err
  }
}

async function processLanguage(language, system) {
  console.log(`\n=== ${language.toUpperCase()} (${system})${dryRun ? ' — DRY RUN' : ''} ===`)

  const { data: vocab, error } = await supabase
    .from('vocabulary')
    .select('id, word, reading, meaning, sort_order')
    .eq('language', language)
    .eq('system', system)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) { console.error('Fetch error:', error.message); return }
  console.log(`Found ${vocab.length} active words.`)
  if (vocab.length === 0) return

  let success = 0
  let failed = 0

  for (let i = 0; i < vocab.length; i += BATCH_SIZE) {
    const batch = vocab.slice(i, i + BATCH_SIZE)
    const totalBatches = Math.ceil(vocab.length / BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    process.stdout.write(`Batch ${batchNum}/${totalBatches}... `)

    try {
      const results = (await generateBatch(batch, language)).slice(0, batch.length)

      for (let idx = 0; idx < results.length; idx += 1) {
        const w = batch[idx]
        const newMeaning = (results[idx].meaning || '').trim()
        if (!newMeaning) continue
        if (dryRun) {
          console.log(`\n  ${w.word}: "${w.meaning}" → "${newMeaning}"`)
        } else {
          const { error: upErr } = await supabase
            .from('vocabulary')
            .update({ meaning: newMeaning })
            .eq('id', w.id)
          if (upErr) throw new Error(upErr.message)
        }
      }

      success += batch.length
      console.log(dryRun ? '(preview)' : `✓ (${success}/${vocab.length})`)
      if (i + BATCH_SIZE < vocab.length) await sleep(5000)
    } catch (err) {
      failed += batch.length
      console.log(`✗ ${err.message}`)
    }
  }

  console.log(`\n${language}: ${dryRun ? 'previewed' : '✓ updated'} ${success}, ✗ ${failed} failed`)
}

async function main() {
  if (!onlyJapanese) await processLanguage('chinese', 'hsk_3')
  if (!onlyChinese) await processLanguage('japanese', 'jlpt')
  console.log(`\nAll done.${dryRun ? ' (dry run — nothing written)' : ''}`)
}

main().catch(err => { console.error(err); process.exit(1) })
