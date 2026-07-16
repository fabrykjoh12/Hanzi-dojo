import { createClient } from '@supabase/supabase-js'
import { chinesePhonemeSsml } from './src/pinyin.js'

// Generate TTS audio for a vocabulary set and upload each MP3 to the path stored
// in vocabulary.audio_path. Configurable by language/system/level so it works
// for any level.
//
// Chinese: the hanzi is spoken but its pronunciation is PINNED to the word's
// pinyin via SSML <phoneme alphabet="pinyin">, so polyphonic characters
// (长 cháng/zhǎng, 行 xíng/háng, 觉 jué/jiào …) aren't mis-read when spoken in
// isolation. Japanese uses the hiragana reading + a Japanese voice (never the
// kanji). Russian speaks the Cyrillic word.
//
// Run with:
//   node --env-file=.env.script generate-audio.mjs --language chinese --system hsk_3 --level 2
//   node --env-file=.env.script generate-audio.mjs --language japanese --system jlpt --level 1
//
// Uploads with upsert; scope with --level so you don't re-synthesize a level
// that already has audio. Storage skips nothing — it overwrites the given paths.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GOOGLE_TTS_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-audio.mjs --language <l> --system <s> --level <n>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] ? args[i + 1] : def }
const language = arg('language', null)
const system = arg('system', null)
const levelArg = arg('level', null)
const level = levelArg == null ? null : parseInt(levelArg, 10)

if (!language || !system) {
  console.error('Required: --language <chinese|japanese|russian> --system <hsk_3|jlpt|russian> [--level <n>]')
  process.exit(1)
}

// Per-language voice + how to build the synthesis input from a vocab row.
// `input(v)` returns the Google TTS `input` object ({ text } or { ssml }).
const VOICES = {
  chinese: {
    languageCode: 'cmn-CN', name: 'cmn-CN-Chirp3-HD-Aoede',
    // Speak the hanzi, pronunciation pinned to the pinyin reading via SSML.
    input: v => ({ ssml: chinesePhonemeSsml(v.word, v.reading) }),
    describe: v => v.word,
  },
  japanese: {
    languageCode: 'ja-JP', name: 'ja-JP-Neural2-B',
    // The hiragana reading — never the kanji, which gets mispronounced.
    input: v => ({ text: v.reading }),
    describe: v => v.reading,
  },
  russian: {
    // Written in Cyrillic, so the word itself is spoken (not the Latin
    // transliteration in `reading`).
    languageCode: 'ru-RU', name: 'ru-RU-Wavenet-C',
    input: v => ({ text: v.word }),
    describe: v => v.word,
  },
}
const voice = VOICES[language]
if (!voice) { console.error('Unsupported language:', language); process.exit(1) }

async function synthesize(input, label) {
  const response = await fetch(
    'https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=' + GOOGLE_TTS_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input,
        voice: { languageCode: voice.languageCode, name: voice.name },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    }
  )
  const data = await response.json()
  if (data.error) throw new Error(`TTS error for "${label}": ${data.error.message}`)
  if (!data.audioContent) throw new Error(`No audio returned for "${label}"`)
  return Buffer.from(data.audioContent, 'base64')
}

async function main() {
  let query = supabase
    .from('vocabulary')
    .select('id, word, reading, audio_path')
    .eq('language', language)
    .eq('system', system)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (level != null) query = query.eq('level', level)

  const { data: vocab, error } = await query
  if (error) { console.error('Fetch error:', error.message); process.exit(1) }

  const todo = (vocab || []).filter(v => v.audio_path)
  console.log(`Generating audio for ${todo.length} ${language}/${system}${level != null ? '/level ' + level : ''} words (voice ${voice.name})...\n`)

  let success = 0, failed = 0
  const failedWords = []
  for (const v of todo) {
    try {
      process.stdout.write(`[${success + failed + 1}/${todo.length}] ${v.word} (${v.reading})... `)
      if (!voice.describe(v)) throw new Error('empty TTS text')
      const audioBuffer = await synthesize(voice.input(v), v.word)
      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(v.audio_path, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
      if (uploadError) throw new Error(uploadError.message)
      success += 1
      console.log('✓')
      await new Promise(r => setTimeout(r, 250))
    } catch (err) {
      failed += 1
      failedWords.push({ word: v.word, error: err.message })
      console.log(`✗ ${err.message}`)
    }
  }

  console.log(`\n--- Done --- ✓ ${success}  ✗ ${failed}`)
  if (failedWords.length > 0) failedWords.forEach(f => console.log(`  ${f.word}: ${f.error}`))
}

main().catch(err => { console.error(err); process.exit(1) })
