import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GOOGLE_TTS_KEY) {
  console.error('Missing environment variables. Run with: node --env-file=.env.script generate-audio.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Call Google Cloud Text-to-Speech API
async function synthesize(text) {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${GOOGLE_TTS_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'cmn-CN',
          name: 'cmn-CN-Chirp3-HD-Achird',
        },
        audioConfig: {
          audioEncoding: 'MP3',
        },
      }),
    }
  )

  const data = await response.json()

  if (data.error) throw new Error(`TTS error for "${text}": ${data.error.message}`)
  if (!data.audioContent) throw new Error(`No audio returned for "${text}"`)

  return Buffer.from(data.audioContent, 'base64')
}

async function main() {
  console.log('Fetching vocabulary from Supabase...')

  const { data: vocab, error } = await supabase
    .from('vocabulary')
    .select('id, word, reading, audio_path')
    .eq('language', 'chinese')
    .eq('system', 'hsk_3')
    .eq('level', 1)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Failed to fetch vocabulary:', error.message)
    process.exit(1)
  }

  console.log(`Found ${vocab.length} words. Starting audio generation...\n`)

  let success = 0
  let failed = 0
  const failedWords = []

  for (const v of vocab) {
    try {
      process.stdout.write(`[${success + failed + 1}/${vocab.length}] ${v.word} (${v.reading})... `)

      // Generate audio
      const audioBuffer = await synthesize(v.word)

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(v.audio_path, audioBuffer, {
          contentType: 'audio/mpeg',
          upsert: true,
        })

      if (uploadError) throw new Error(uploadError.message)

      success++
      console.log('✓')

      // Small delay to be polite to the API
      await new Promise(r => setTimeout(r, 250))

    } catch (err) {
      failed++
      failedWords.push({ word: v.word, error: err.message })
      console.log(`✗ ${err.message}`)
    }
  }

  console.log(`\n--- Done ---`)
  console.log(`✓ Success: ${success}`)
  console.log(`✗ Failed:  ${failed}`)

  if (failedWords.length > 0) {
    console.log('\nFailed words:')
    failedWords.forEach(f => console.log(`  ${f.word}: ${f.error}`))
  }
}

main().catch(console.error)