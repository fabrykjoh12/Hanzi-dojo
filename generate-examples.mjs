import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GROQ_API_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-examples.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const groq = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })

// Language arg: --chinese, --japanese, or --russian (default: all)
// --regen regenerates ALL active words (not just ones missing an example), so
//         existing low-quality sentences get replaced. Without it, only words
//         with a NULL example_sentence are filled.
const args = process.argv.slice(2)
const onlyChinese = args.includes('--chinese')
const onlyJapanese = args.includes('--japanese')
const onlyRussian = args.includes('--russian')
const regen = args.includes('--regen')
// When any single language flag is passed, only that language runs.
const anyLangFlag = onlyChinese || onlyJapanese || onlyRussian

// Smaller batches + the 70B model give noticeably more sensible sentences.
const BATCH_SIZE = 10
const MODEL = 'llama-3.3-70b-versatile'

function buildPrompt(words, language) {
  const isChinese = language === 'chinese'
  const isRussian = language === 'russian'

  // Strip the leading ～ that marks counters/suffixes so the model knows the bare form.
  const wordList = words.map((w, i) =>
    `${i + 1}. word="${w.word.replace(/^～/, '')}" reading="${w.reading}" meaning="${w.meaning}"`
  ).join('\n')

  // Russian: short A1–A2 sentences in Cyrillic; example_reading = Latin
  // transliteration of the whole sentence (matches how `reading` is stored).
  if (isRussian) {
    return `You write example sentences for a beginner Russian flashcard app. Quality matters more than anything: every sentence must be MEANINGFUL and make real-world sense, not just grammatically contain the word.

Write simple A1–A2 Russian sentences (≤8 words), written in Cyrillic. example_reading = the full sentence transliterated into Latin letters.

Rules:
- The target word MUST appear in example_sentence, used with its correct meaning.
- The sentence must be logically sensible. Pick a realistic subject: for ages, jobs, feelings, etc. use a PERSON (I / you / a name), never an inanimate subject.
- NO tautologies or definition-sentences whose only point is to restate the word. Show the word in a normal everyday situation.
- Keep it natural, simple, and beginner-friendly.
- example_reading = the full sentence transliterated into Latin letters (approximate romanization).
- example_translation = a natural English translation.
- Return ONLY a JSON array, no markdown, no commentary.

Good examples:
- word привет → {"example_sentence":"Привет, как дела?","example_reading":"Privet, kak dela?","example_translation":"Hi, how are you?"}
- word кошка → {"example_sentence":"У меня есть кошка.","example_reading":"U menya yest koshka.","example_translation":"I have a cat."}
Bad example (DO NOT do this): "Кошка это кошка." ("A cat is a cat.") — a circular restatement. Use an everyday situation instead.

Words:
${wordList}

Return a JSON array with exactly ${words.length} objects, same order:
[{"example_sentence":"...","example_reading":"...","example_translation":"..."},...]`
  }

  const sentenceNote = isChinese
    ? 'Write very short HSK 1–2 sentences (≤10 characters). example_reading = pinyin WITH tone marks.'
    : 'Write simple JLPT N5–N4 sentences (≤15 characters). example_reading = the full sentence in hiragana/katakana only (NO kanji).'

  const examples = isChinese
    ? `Good examples:
- word 天气 → {"example_sentence":"今天天气很好。","example_reading":"jīn tiān tiān qì hěn hǎo.","example_translation":"The weather is nice today."}
- word 岁 (age counter) → {"example_sentence":"我今年十岁。","example_reading":"wǒ jīn nián shí suì.","example_translation":"I am ten years old this year."}
- word 半 (half) → {"example_sentence":"现在八点半。","example_reading":"xiàn zài bā diǎn bàn.","example_translation":"It's half past eight now."}
Bad example (DO NOT do this): "一块钱是半块钱的两倍。" ("One yuan is twice half a yuan.") — a circular math identity that only restates the word's meaning. Use an everyday situation (time, food, shopping, family) instead.`
    : `Good examples:
- word 学校 → {"example_sentence":"がっこうに行きます。","example_reading":"がっこうにいきます。","example_translation":"I go to school."}
- word さい (age counter) → {"example_sentence":"わたしは12さいです。","example_reading":"わたしは じゅうにさい です。","example_translation":"I am 12 years old."}
Bad example (DO NOT do this): "今日は12さいです" ("Today is 12 years old") — 今日 (today) cannot have an age. Use a PERSON as the subject.`

  return `You write example sentences for a beginner ${language} flashcard app. Quality matters more than anything: every sentence must be MEANINGFUL and make real-world sense, not just grammatically contain the word.

${sentenceNote}

Rules:
- The target word MUST appear in example_sentence, used with its correct meaning.
- The sentence must be logically sensible. Pick a realistic subject: for ages, sizes, jobs, feelings, etc. use a PERSON (I / you / a name), never an inanimate subject like "today" or "this".
- NO tautologies, math identities, or definition-sentences whose only point is to restate the word (e.g. "one is twice half of one"). Show the word in a normal everyday situation.
- For counter words / suffixes (age, money, people, counters), attach a number and a fitting noun naturally.
- Keep it natural, simple, and beginner-friendly.
- example_reading = the full sentence's reading (${isChinese ? 'pinyin with tones' : 'hiragana/katakana, no kanji'}).
- example_translation = a natural English translation.
- Return ONLY a JSON array, no markdown, no commentary.

${examples}

Words:
${wordList}

Return a JSON array with exactly ${words.length} objects, same order:
[{"example_sentence":"...","example_reading":"...","example_translation":"..."},...]`
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function generateBatch(words, language, attempt = 0) {
  const prompt = buildPrompt(words, language)

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
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
  console.log(`\n=== ${language.toUpperCase()} (${system}) ===`)

  let query = supabase
    .from('vocabulary')
    .select('id, word, reading, meaning, sort_order')
    .eq('language', language)
    .eq('system', system)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  // Without --regen, only fill words that have no example yet.
  if (!regen) query = query.is('example_sentence', null)
  const { data: vocab, error } = await query

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

      if (examples.length === 0) {
        throw new Error(`Got 0 results`)
      }
      const aligned = examples.slice(0, batch.length)

      const updates = batch.slice(0, aligned.length).map((w, idx) => ({
        id: w.id,
        example_sentence: aligned[idx].example_sentence,
        example_reading: aligned[idx].example_reading,
        example_translation: aligned[idx].example_translation,
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

      // Stay under free-tier rate limit (15 RPM)
      if (i + BATCH_SIZE < vocab.length) {
        await sleep(5000)
      }
    } catch (err) {
      failed += batch.length
      console.log(`✗ ${err.message}`)
    }
  }

  console.log(`\n${language}: ✓ ${success} updated, ✗ ${failed} failed`)
}

async function main() {
  // With no language flag, run all languages; with a flag, run only that one.
  if (onlyChinese || !anyLangFlag) await processLanguage('chinese', 'hsk_3')
  if (onlyJapanese || !anyLangFlag) await processLanguage('japanese', 'jlpt')
  if (onlyRussian || !anyLangFlag) await processLanguage('russian', 'russian')
  console.log('\nAll done.')
}

main().catch(err => { console.error(err); process.exit(1) })
