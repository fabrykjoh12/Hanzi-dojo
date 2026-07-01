import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// Generate level-matched immersion stories via Groq and insert them into the
// stories table. Config-driven per language/system/level so it works for both
// Japanese JLPT and Chinese HSK. Each tier draws from a vocab pool (prerequisite
// level + the current level up to a sort_order cap) so the language stays inside
// what the learner knows.
//
// Run with:
//   node --env-file=.env.script generate-stories.mjs --language chinese --system hsk_3 --level 2
//   node --env-file=.env.script generate-stories.mjs --language japanese --system jlpt --level 1
//   ... add --replace to delete that level's existing stories first.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GROQ_API_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script generate-stories.mjs --language <l> --system <s> --level <n>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const groq = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] ? args[i + 1] : def }
const doReplace = args.includes('--replace')
const language = arg('language', 'japanese')
const system = arg('system', 'jlpt')
const level = parseInt(arg('level', '1'), 10)

const JAPANESE_SCENES = [
  { title: 'こうえん', en: 'at a park on a sunny afternoon' },
  { title: 'いえのあさ', en: 'at home during the morning routine before school' },
  { title: 'スーパー', en: 'shopping at a supermarket' },
  { title: 'えき', en: 'at the train station waiting for a train' },
  { title: 'おみせ', en: 'inside a small neighbourhood convenience store' },
  { title: 'レストラン', en: 'in a restaurant ordering and eating food' },
  { title: 'としょかん', en: 'in the library reading and studying quietly' },
  { title: 'まち', en: 'walking through town on a weekend afternoon' },
  { title: 'いえのよる', en: 'at home in the evening, relaxing after dinner' },
  { title: 'バス', en: 'on a bus ride across town' },
  { title: 'うみ', en: 'at the beach on a summer day' },
  { title: 'びょういん', en: 'at the doctors clinic feeling unwell' },
  { title: 'まつり', en: 'at a local summer festival with food stalls' },
  { title: 'やま', en: 'on a hiking trail in the mountains' },
  { title: 'でんしゃ', en: 'on a train journey looking out the window' },
]

const CHINESE_SCENES = [
  { title: '公园', en: 'at a park on a sunny afternoon' },
  { title: '早上', en: 'at home during the morning routine before school' },
  { title: '超市', en: 'shopping at a supermarket' },
  { title: '车站', en: 'at the train station waiting for a train' },
  { title: '饭馆', en: 'in a small restaurant ordering and eating food' },
  { title: '图书馆', en: 'in the library reading and studying quietly' },
  { title: '商场', en: 'walking through a shopping mall on the weekend' },
  { title: '公交车', en: 'on a bus ride across town' },
  { title: '医院', en: 'at the clinic feeling a little unwell' },
  { title: '生日', en: 'at a small birthday gathering at home' },
  { title: '学校', en: 'at school between classes' },
  { title: '房间', en: 'tidying up a bedroom at home' },
  { title: '打电话', en: 'during a short phone call between friends' },
  { title: '晚上', en: 'at home in the evening after dinner' },
  { title: '旅游', en: 'on a short weekend trip in another city' },
]

// Per-target config. prereq pulls basic words from an earlier level into the pool.
const CONFIGS = {
  'japanese|jlpt|1': {
    scenes: JAPANESE_SCENES,
    promptLang: 'Japanese', level: 'JLPT N5',
    names: '- たかし (Takashi)\n- はな (Hana)\n- おかあさん (Mother)\n- みせのひと (Shop or station worker)',
    nameNote: 'write in hiragana, not kanji',
    maxLineChars: 20,
    prereqLevel: null, prereqMax: 0,
    tiers: [
      { tier: 1, label: 'First Steps', maxSortOrder: 100, minWords: 30, stories: 5 },
      { tier: 2, label: 'Growing', maxSortOrder: 200, minWords: 100, stories: 5 },
      { tier: 3, label: 'Fluent', maxSortOrder: 400, minWords: 200, stories: 5 },
    ],
  },
  'japanese|jlpt|3': {
    scenes: JAPANESE_SCENES,
    promptLang: 'Japanese', level: 'JLPT N4',
    names: '- たかし (Takashi)\n- はな (Hana)\n- おかあさん (Mother)\n- せんせい (Teacher)',
    nameNote: 'write in hiragana, not kanji',
    maxLineChars: 22,
    prereqLevel: 1, prereqMax: 150,   // include the 150 most basic N5 Part 1 words
    tiers: [
      { tier: 1, label: 'First Steps', maxSortOrder: 200, minWords: 30, stories: 5 },
      { tier: 2, label: 'Growing', maxSortOrder: 400, minWords: 150, stories: 5 },
      { tier: 3, label: 'Fluent', maxSortOrder: 636, minWords: 300, stories: 5 },
    ],
  },
  'chinese|hsk_3|2': {
    scenes: CHINESE_SCENES,
    promptLang: 'Chinese', level: 'HSK 2',
    names: '- 李明 (Lǐ Míng, a boy)\n- 小红 (Xiǎo Hóng, a girl)\n- 小明 (Xiǎo Míng, a boy)\n- 妈妈 (Mother)',
    nameNote: 'Chinese personal names in characters',
    maxLineChars: 15,
    prereqLevel: 1, prereqMax: 150,   // include the 150 most frequent HSK 1 words
    tiers: [
      { tier: 1, label: 'First Steps', maxSortOrder: 66, minWords: 30, stories: 5 },
      { tier: 2, label: 'Growing', maxSortOrder: 132, minWords: 80, stories: 5 },
      { tier: 3, label: 'Fluent', maxSortOrder: 198, minWords: 130, stories: 5 },
    ],
  },
}

const cfg = CONFIGS[language + '|' + system + '|' + level]
if (!cfg) {
  console.error('No story config for ' + language + '/' + system + '/level ' + level + '. Add one to CONFIGS.')
  process.exit(1)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchVocab(maxSortOrder) {
  const rows = []
  if (cfg.prereqLevel) {
    const { data, error } = await supabase
      .from('vocabulary').select('word, reading, meaning, sort_order')
      .eq('language', language).eq('system', system).eq('level', cfg.prereqLevel)
      .eq('is_active', true).lte('sort_order', cfg.prereqMax)
    if (error) throw new Error('Prereq vocab error: ' + error.message)
    rows.push(...(data || []))
  }
  const { data, error } = await supabase
    .from('vocabulary').select('word, reading, meaning, sort_order')
    .eq('language', language).eq('system', system).eq('level', level)
    .eq('is_active', true).lte('sort_order', maxSortOrder)
    .order('sort_order', { ascending: true })
  if (error) throw new Error('Vocab fetch error: ' + error.message)
  rows.push(...(data || []))
  return rows
}

function buildPrompt(vocab, tierLabel, sceneIndex) {
  const scene = cfg.scenes[sceneIndex % cfg.scenes.length]
  const wordList = vocab.map(v => v.word + ' (' + v.reading + ' = ' + v.meaning + ')').join(', ')
  return 'You are writing a short ' + cfg.promptLang + ' story for ' + cfg.level + ' beginners.\n\n' +
    'Tier: ' + tierLabel + '\n' +
    'Scene: ' + scene.en + ' -- the ENTIRE story MUST be set here.\n' +
    'Available vocabulary (use ONLY these words for ' + cfg.promptLang + ' content): ' + wordList + '\n\n' +
    'Allowed character names (' + cfg.nameNote + '):\n' + cfg.names + '\n\n' +
    'Rules:\n' +
    '- 8-14 lines total\n' +
    '- Use ONLY words from the vocabulary list above, plus basic particles and grammar\n' +
    '- Mix dialogue and narration. Dialogue format: NAME：text (full-width colon, no space before text)\n' +
    '- Narration lines have no speaker prefix\n' +
    '- Each line must be under ' + cfg.maxLineChars + ' characters\n' +
    '- Title: use "' + scene.title + '" or another 2-6 character word that reflects the scene\n' +
    '- english_summary: 1-2 sentences describing what happens\n\n' +
    'Return ONLY valid JSON with no markdown fences:\n' +
    '{"title":"...","english_summary":"...","content":"line1\\nline2\\n...","english_content":"English line1\\nEnglish line2\\n..."}\n\n' +
    'english_content must have the SAME number of lines as content, in the same order. Keep dialogue format: speaker：English text'
}

async function generateStory(vocab, tierLabel, sceneIndex, attempt = 0) {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', max_tokens: 1024,
      messages: [{ role: 'user', content: buildPrompt(vocab, tierLabel, sceneIndex) }],
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
  console.log('=== Stories: ' + language + '/' + system + '/level ' + level + ' ===')
  if (doReplace) {
    const { error } = await supabase.from('stories').delete()
      .eq('language', language).eq('system', system).eq('level', level)
    if (error) throw new Error('Delete error: ' + error.message)
    console.log('Deleted existing stories for this level.')
  }

  const { data: existing } = await supabase.from('stories').select('story_number')
    .eq('language', language).eq('system', system).eq('level', level)
    .order('story_number', { ascending: false }).limit(1)
  let nextNum = existing && existing.length > 0 ? existing[0].story_number + 1 : 1
  console.log('Starting at story_number ' + nextNum)

  let sceneIndex = 0
  for (const tier of cfg.tiers) {
    console.log('\n=== Tier ' + tier.tier + ': ' + tier.label + ' ===')
    const vocab = await fetchVocab(tier.maxSortOrder)
    console.log('Vocab pool: ' + vocab.length + ' words')
    for (let i = 0; i < tier.stories; i++) {
      const scene = cfg.scenes[sceneIndex % cfg.scenes.length]
      process.stdout.write('Story ' + (i + 1) + '/' + tier.stories + ' [' + scene.title + ']... ')
      try {
        const story = await generateStory(vocab, tier.label, sceneIndex)
        const { error } = await supabase.from('stories').insert({
          language, system, level,
          tier: tier.tier, tier_min_words: tier.minWords, story_number: nextNum,
          title: story.title, english_summary: story.english_summary,
          content: story.content, english_content: story.english_content || null,
          is_published: true,
        })
        if (error) throw new Error(error.message)
        console.log('done "' + story.title + '" (#' + nextNum + ')')
        nextNum++; sceneIndex++
        await sleep(4000)
      } catch (err) {
        console.log('FAILED: ' + err.message)
        sceneIndex++
      }
    }
  }
  console.log('\nAll done.')
}

main().catch(err => { console.error(err); process.exit(1) })
