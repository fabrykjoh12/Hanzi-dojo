import { createClient } from '@supabase/supabase-js'

// Generate per-line narration audio for published stories (product review
// item #12: real story audio via the same Google TTS pipeline already used
// for vocabulary, replacing the browser's inconsistent speechSynthesis).
// Uploads each line's MP3 to stories/{story_id}/{line_index}.mp3 in the
// public `audio` bucket, then marks stories.has_audio = true — but only once
// EVERY line for that story succeeded, so the reader can trust the flag and
// go straight to bucket audio without probing per line.
//
// Run with:
//   node --env-file=.env.script generate-story-audio.mjs --language chinese --system hsk_3 --level 1
//   node --env-file=.env.script generate-story-audio.mjs --language japanese --system jlpt --level 1 --story-id <uuid>

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GOOGLE_TTS_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-story-audio.mjs --language <l> --system <s> --level <n>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] ? args[i + 1] : def }
const language = arg('language', null)
const system = arg('system', null)
const levelArg = arg('level', null)
const level = levelArg == null ? null : parseInt(levelArg, 10)
const storyId = arg('story-id', null)

if (!language || !system) {
  console.error('Required: --language <chinese|japanese|russian> --system <hsk_3|jlpt|russian> [--level <n>] [--story-id <uuid>]')
  process.exit(1)
}

// Per-language voice, matching generate-audio.mjs. Story narration speaks the
// line as written (unlike single vocabulary words, Google's sentence-level
// voices handle kanji-in-context fine, so Japanese doesn't need a hiragana
// reading here).
const VOICES = {
  chinese: { languageCode: 'cmn-CN', name: 'cmn-CN-Chirp3-HD-Aoede' },
  japanese: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B' },
  russian: { languageCode: 'ru-RU', name: 'ru-RU-Wavenet-C' },
}
const voice = VOICES[language]
if (!voice) { console.error('Unsupported language:', language); process.exit(1) }

// Mirrors src/StoryReaderImmersive.jsx's splitSpeaker: strips a leading
// "Speaker：" / "Speaker:" label (within the first 6 chars) so narration
// speaks only the line's actual dialogue, matching what the reader
// highlights and what the on-screen speaker-color UI treats as spoken text.
function splitSpeaker(line) {
  const full = line.indexOf('：')
  const ascii = line.indexOf(':')
  let idx = -1
  if (full > 0) idx = full
  if (idx < 0 && ascii > 0) idx = ascii
  if (idx > 0 && idx <= 6) return line.slice(idx + 1).trim()
  return line
}

async function synthesize(text) {
  const response = await fetch(
    'https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=' + GOOGLE_TTS_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: voice.languageCode, name: voice.name },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    }
  )
  const data = await response.json()
  if (data.error) throw new Error(`TTS error: ${data.error.message}`)
  if (!data.audioContent) throw new Error('No audio returned')
  return Buffer.from(data.audioContent, 'base64')
}

async function main() {
  let query = supabase
    .from('stories')
    .select('id, title, content, has_audio')
    .eq('language', language)
    .eq('system', system)
    .eq('is_published', true)
    .order('tier', { ascending: true })
    .order('story_number', { ascending: true })
  if (level != null) query = query.eq('level', level)
  if (storyId) query = query.eq('id', storyId)

  const { data: stories, error } = await query
  if (error) { console.error('Fetch error:', error.message); process.exit(1) }

  console.log(`Generating narration for ${(stories || []).length} ${language}/${system}${level != null ? '/level ' + level : ''} stories (voice ${voice.name})...\n`)

  let storiesOk = 0, storiesFailed = 0
  for (const story of stories || []) {
    const lines = (story.content || '').split('\n').filter(Boolean)
    console.log(`"${story.title}" — ${lines.length} lines`)
    let failed = 0
    for (let i = 0; i < lines.length; i += 1) {
      const text = splitSpeaker(lines[i])
      const path = `stories/${story.id}/${i}.mp3`
      try {
        process.stdout.write(`  [${i + 1}/${lines.length}]... `)
        if (!text) throw new Error('empty line')
        const audioBuffer = await synthesize(text)
        const { error: uploadError } = await supabase.storage
          .from('audio')
          .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
        if (uploadError) throw new Error(uploadError.message)
        console.log('✓')
        await new Promise(r => setTimeout(r, 250))
      } catch (err) {
        failed += 1
        console.log(`✗ ${err.message}`)
      }
    }
    if (failed === 0) {
      const { error: updateError } = await supabase.from('stories').update({ has_audio: true }).eq('id', story.id)
      if (updateError) console.log(`  ✗ could not mark has_audio: ${updateError.message}`)
      else { console.log('  ✓ marked has_audio = true'); storiesOk += 1 }
    } else {
      console.log(`  ✗ ${failed} line(s) failed — leaving has_audio = false`)
      storiesFailed += 1
    }
  }

  console.log(`\n--- Done --- ✓ ${storiesOk} stories  ✗ ${storiesFailed} stories`)
}

main().catch(err => { console.error(err); process.exit(1) })
