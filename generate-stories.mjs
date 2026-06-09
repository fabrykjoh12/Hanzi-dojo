import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GROQ_API_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-stories.mjs')
  process.exit(1)
}

const args = process.argv.slice(2)
const doReplace = args.includes('--replace')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const groq = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })

// Tier config for JLPT N5 level 1 (sort_order 1-400)
const TIERS = [
  { tier: 1, label: 'First Steps', maxSortOrder: 100, minWords: 30,  stories: 5 },
  { tier: 2, label: 'Growing',     maxSortOrder: 200, minWords: 100, stories: 5 },
  { tier: 3, label: 'Fluent',      maxSortOrder: 400, minWords: 200, stories: 5 },
]

// 15 distinct scenes, one per story (tier 1 x5, tier 2 x5, tier 3 x5)
const SCENES = [
  { title: 'こうえん',   en: 'at a park on a sunny afternoon' },
  { title: 'いえのあさ', en: 'at home during the morning routine before school' },
  { title: 'スーパー',   en: 'shopping at a supermarket' },
  { title: 'えき',       en: 'at the train station waiting for a train' },
  { title: 'おみせ',     en: 'inside a small neighbourhood convenience store' },
  { title: 'レストラン', en: 'in a restaurant ordering and eating food' },
  { title: 'としょかん', en: 'in the library reading and studying quietly' },
  { title: 'まち',       en: 'walking through town on a weekend afternoon' },
  { title: 'いえのよる', en: 'at home in the evening, relaxing after dinner' },
  { title: 'バス',       en: 'on a bus ride across town' },
  { title: 'うみ',       en: 'at the beach on a summer day' },
  { title: 'びょういん', en: 'at the doctors clinic feeling unwell' },
  { title: 'まつり',     en: 'at a local summer festival with food stalls' },
  { title: 'やま',       en: 'on a hiking trail in the mountains' },
  { title: 'でんしゃ',   en: 'on a train journey looking out the window' },
]

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchVocab(maxSortOrder) {
  const { data, error } = await supabase
    .from('vocabulary')
    .select('word, reading, meaning, sort_order')
    .eq('language', 'japanese')
    .eq('system', 'jlpt')
    .eq('level', 1)
    .eq('is_active', true)
    .lte('sort_order', maxSortOrder)
    .order('sort_order', { ascending: true })
  if (error) throw new Error('Vocab fetch error: ' + error.message)
  return data
}

function buildPrompt(vocab, tierLabel, sceneIndex) {
  const scene = SCENES[sceneIndex] || SCENES[0]
  const wordList = vocab.map(v => v.word + ' (' + v.reading + ' = ' + v.meaning + ')').join(', ')
  return 'You are writing a short Japanese story for JLPT N5 beginners.\n\n' +
    'Tier: ' + tierLabel + '\n' +
    'Scene: ' + scene.en + ' -- the ENTIRE story MUST be set here, not at school.\n' +
    'Available vocabulary (use ONLY these words for Japanese content): ' + wordList + '\n\n' +
    'Allowed character names (write in hiragana, not kanji):\n' +
    '- たかし (Takashi)\n' +
    '- はな (Hana)\n' +
    '- おかあさん (Mother)\n' +
    '- みせのひと (Shop or station worker)\n\n' +
    'Rules:\n' +
    '- 8-14 lines total\n' +
    '- Use ONLY words from the vocabulary list above, plus basic particles and grammar\n' +
    '- Mix dialogue and narration. Dialogue format: たかし：text (full-width colon, no space before text)\n' +
    '- Narration lines have no speaker prefix\n' +
    '- Each line must be under 20 characters\n' +
    '- Title: use "' + scene.title + '" or another 2-6 character word that reflects the scene\n' +
    '- english_summary: 1-2 sentences describing what happens\n\n' +
    'Return ONLY valid JSON with no markdown fences:\n' +
    '{"title":"...","english_summary":"...","content":"line1\\nline2\\n...","english_content":"English translation line1\\nline translation line2\\n..."}\n\n' +
    'english_content must have the SAME number of lines as content, in the same order. Keep dialogue format: speaker：English text'
}

async function generateStory(vocab, tierLabel, sceneIndex, attempt = 0) {
  const prompt = buildPrompt(vocab, tierLabel, sceneIndex)
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.choices[0].message.content.trim()
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    return JSON.parse(json)
  } catch (err) {
    if (attempt < 3) {
      const wait = Math.min(15 * Math.pow(2, attempt), 60)
      process.stdout.write('(retry ' + wait + 's) ')
      await sleep(wait * 1000)
      return generateStory(vocab, tierLabel, sceneIndex, attempt + 1)
    }
    throw err
  }
}

async function main() {
  if (doReplace) {
    console.log('Deleting existing Japanese JLPT level 1 stories...')
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('language', 'japanese')
      .eq('system', 'jlpt')
      .eq('level', 1)
    if (error) throw new Error('Delete error: ' + error.message)
    console.log('Deleted. Regenerating...')
  }

  const { data: existing } = await supabase
    .from('stories')
    .select('story_number')
    .eq('language', 'japanese')
    .eq('system', 'jlpt')
    .eq('level', 1)
    .order('story_number', { ascending: false })
    .limit(1)

  let nextNum = existing && existing.length > 0 ? existing[0].story_number + 1 : 1
  console.log('Starting at story_number ' + nextNum)

  let sceneIndex = 0
  for (const tier of TIERS) {
    console.log('\n=== Tier ' + tier.tier + ': ' + tier.label + ' ===')
    const vocab = await fetchVocab(tier.maxSortOrder)
    console.log('Vocab pool: ' + vocab.length + ' words')

    for (let i = 0; i < tier.stories; i++) {
      const scene = SCENES[sceneIndex] || SCENES[0]
      process.stdout.write('Story ' + (i + 1) + '/' + tier.stories + ' [' + scene.title + ']... ')
      try {
        const story = await generateStory(vocab, tier.label, sceneIndex)
        const { error } = await supabase.from('stories').insert({
          language: 'japanese',
          system: 'jlpt',
          level: 1,
          tier: tier.tier,
          tier_min_words: tier.minWords,
          story_number: nextNum,
          title: story.title,
          english_summary: story.english_summary,
          content: story.content,
          english_content: story.english_content || null,
          is_published: true,
        })
        if (error) throw new Error(error.message)
        console.log('done "' + story.title + '" (#' + nextNum + ')')
        nextNum++
        sceneIndex++
        await sleep(4000)
      } catch (err) {
        console.log('FAILED: ' + err.message)
        sceneIndex++
      }
    }
  }

  console.log('\nAll done. Run Stories -> Japanese in the app to review.')
}

main().catch(err => { console.error(err); process.exit(1) })
