import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-examples.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

// Language arg: --chinese or --japanese (default: both)
const args = process.argv.slice(2)
const onlyChinese = args.includes('--chinese')
const onlyJapanese = args.includes('--japanese')

const BATCH_SIZE = 20

function buildPrompt(words, language) {
  const isChinese = language === 'chinese'

  const wordList = words.map((w, i) =>
    `${i + 1}. word="${w.word}" reading="${w.reading}" meaning="${w.meaning}"`
  ).join('\n')

  const sentenceNote = isChinese
    ? 'Use very short HSK 1–2 level sentences (under 10 characters). Use proper pinyin with tone marks for example_reading.'
    : 'Use simple JLPT N5–N4 level sentences (under 15 characters). Use hiragana/katakana reading for example_reading (no kanji in the reading line).'

  return `You are generating example sentences for a language learning flashcard app.

Language: ${language}
${sentenceNote}

Rules:
- The target word MUST appear in example_sentence.
- Keep sentences natural and simple — a beginner should understand most of it.
- example_reading is the full sentence in reading/phonetic form (pinyin with tones for Chinese, hiragana for Japanese).
- example_translation is a natural English translation.
- Return ONLY a JSON array, no markdown, no explanation.

Words:
${wordList}

Return a JSON array with exactly ${words.length} objects in the same order:
[{"example_sentence":"...","example_reading":"...","example_translation":"..."},...]`
}

async function generateBatch(words, language) {
  const prompt = buildPrompt(words, language)

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].text.trim()
  // Strip markdown code fences if present
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(json)
}

async function processLanguage(language, system) {
  console.log(`\n=== ${language.toUpperCase()} (${system}) ===`)

  const { data: vocab, error } = await supabase
    .from('vocabulary')
    .select('id, word, reading, meaning, sort_order')
    .eq('language', language)
    .eq('system', system)
    .eq('is_active', true)
    .is('example_sentence', null)
    .order('sort_order', { ascending: true })

  if (error) { console.error('Fetch error:', error.message); return }
  console.log(`Found ${vocab.length} words without examples.`)
  if (vocab.length === 0) return

  let success = 0
  let failed = 0

  for (let i = 0; i < vocab.length; i += BATCH_SIZE) {
    const batch = vocab.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(vocab.length / BATCH_SIZE)
    process.stdout.write(`Batch ${batchNum}/${totalBatches} (words ${i + 1}–${Math.min(i + BATCH_SIZE, vocab.length)})... `)

    try {
      const examples = await generateBatch(batch, language)

      if (examples.length !== batch.length) {
        throw new Error(`Expected ${batch.length} results, got ${examples.length}`)
      }

      const updates = batch.map((w, idx) => ({
        id: w.id,
        example_sentence: examples[idx].example_sentence,
        example_reading: examples[idx].example_reading,
        example_translation: examples[idx].example_translation,
      }))

      for (const update of updates) {
        const { error: upsertError } = await supabase
          .from('vocabulary')
          .update({
            example_sentence: update.example_sentence,
            example_reading: update.example_reading,
            example_translation: update.example_translation,
          })
          .eq('id', update.id)

        if (upsertError) throw new Error(upsertError.message)
      }

      success += batch.length
      console.log(`✓ (${success}/${vocab.length} done)`)

      // Polite delay between batches
      if (i + BATCH_SIZE < vocab.length) {
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (err) {
      failed += batch.length
      console.log(`✗ ${err.message}`)
    }
  }

  console.log(`\n${language}: ✓ ${success} updated, ✗ ${failed} failed`)
}

async function main() {
  if (!onlyJapanese) await processLanguage('chinese', 'hsk_3')
  if (!onlyChinese) await processLanguage('japanese', 'jlpt')
  console.log('\nAll done.')
}

main().catch(err => { console.error(err); process.exit(1) })
