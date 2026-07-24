import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readingToPhonemes, chinesePhonemeSsml, fixDeParticlePinyin } from './pinyin.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('readingToPhonemes', () => {
  it('converts single-syllable toned readings', () => {
    expect(readingToPhonemes('wǒ')).toBe('wo3')
    expect(readingToPhonemes('nǐ')).toBe('ni3')
    expect(readingToPhonemes('tā')).toBe('ta1')
    expect(readingToPhonemes('shì')).toBe('shi4')
    expect(readingToPhonemes('bù')).toBe('bu4')
  })

  it('segments and tones multi-syllable readings', () => {
    expect(readingToPhonemes('wǒmen')).toBe('wo3 men5')
    expect(readingToPhonemes('àihào')).toBe('ai4 hao4')
    expect(readingToPhonemes('yínháng')).toBe('yin2 hang2')
    expect(readingToPhonemes('bàngmáng')).toBe('bang4 mang2')
    expect(readingToPhonemes('zhōngguó')).toBe('zhong1 guo2')
  })

  it('marks toneless (neutral) syllables as 5', () => {
    expect(readingToPhonemes('de')).toBe('de5')
    expect(readingToPhonemes('běnzi')).toBe('ben3 zi5')
    expect(readingToPhonemes('a')).toBe('a5')
  })

  it('handles the ü vowel via the "u:" spelling Google expects', () => {
    expect(readingToPhonemes('lǜ')).toBe('lu:4')
    expect(readingToPhonemes('nǚ')).toBe('nu:3')
  })

  it('greedily matches the longest valid syllable (shang, not sha)', () => {
    expect(readingToPhonemes('shàng')).toBe('shang4')
    expect(readingToPhonemes('xiǎng')).toBe('xiang3')
  })

  it('returns null for unparseable input so callers can fall back', () => {
    expect(readingToPhonemes('')).toBeNull()
    expect(readingToPhonemes(null)).toBeNull()
    expect(readingToPhonemes('hello world')).toBeNull() // space
    expect(readingToPhonemes('xī’ān')).toBeNull() // apostrophe
    expect(readingToPhonemes('123')).toBeNull()
  })
})

describe('chinesePhonemeSsml', () => {
  it('wraps the hanzi in a pinyin phoneme tag', () => {
    expect(chinesePhonemeSsml('我们', 'wǒmen')).toBe(
      '<speak><phoneme alphabet="pinyin" ph="wo3 men5">我们</phoneme></speak>'
    )
  })

  it('falls back to plain hanzi when the reading is unusable', () => {
    expect(chinesePhonemeSsml('我们', '')).toBe('<speak>我们</speak>')
  })

  it('escapes XML metacharacters in the word', () => {
    // Defensive: real vocab has no angle brackets, but the SSML must stay valid.
    expect(chinesePhonemeSsml('a<b&c', '')).toBe('<speak>a&lt;b&amp;c</speak>')
  })
})

// Coverage guard: every real Chinese reading we ship must convert cleanly, so a
// regeneration run never silently falls back to an unpinned (guessable) reading.
describe('real HSK level-1 coverage', () => {
  // HSK 3.0 system, level 1 — a 10-row sample, not the full 300-word level.
  const csv = readFileSync(join(__dirname, '../data/hsk3_0-level1-sample.csv'), 'utf8')
  const rows = csv.trim().split('\n').slice(1) // drop header
  const readings = rows.map(line => {
    // reading is column index 8 (0-based) in the CSV header order.
    const cols = parseCsvRow(line)
    return { word: cols[7], reading: cols[8] }
  }).filter(r => r.reading)

  it('parses every level-1 reading with no fallbacks', () => {
    const failed = readings.filter(r => readingToPhonemes(r.reading) === null)
    expect(failed.map(f => `${f.word} (${f.reading})`)).toEqual([])
  })
})

// The pinyin strings below are pinyin-pro's real output for each sentence
// (one space-separated syllable per character), captured verbatim.
describe('fixDeParticlePinyin', () => {
  it('neutralises 得 before a degree adverb', () => {
    expect(fixDeParticlePinyin('他跑得很快。', 'tā pǎo dé hěn kuài 。'))
      .toBe('tā pǎo de hěn kuài 。')
    expect(fixDeParticlePinyin('妈妈做得非常好吃', 'mā ma zuò dé fēi cháng hǎo chī'))
      .toBe('mā ma zuò de fēi cháng hǎo chī')
    expect(fixDeParticlePinyin('他睡得很晚', 'tā shuì dé hěn wǎn'))
      .toBe('tā shuì de hěn wǎn')
  })

  it('neutralises 得 before a clause-final adjective complement', () => {
    expect(fixDeParticlePinyin('他跑得快', 'tā pǎo dé kuài')).toBe('tā pǎo de kuài')
    expect(fixDeParticlePinyin('他学得不错', 'tā xué dé bú cuò')).toBe('tā xué de bú cuò')
    expect(fixDeParticlePinyin('这个孩子长得高', 'zhè ge hái zi cháng dé gāo'))
      .toBe('zhè ge hái zi cháng de gāo')
    expect(fixDeParticlePinyin('他汉语说得流利', 'tā hàn yǔ shuō dé liú lì'))
      .toBe('tā hàn yǔ shuō de liú lì')
  })

  // The three-way ambiguity of 得 is the whole risk here: these must NOT change.
  it('leaves 得 alone where it is dé (to obtain) or děi (must)', () => {
    // dé — 得 heads/ends a lexical word
    expect(fixDeParticlePinyin('我得到了一本书', 'wǒ dé dào le yì běn shū'))
      .toBe('wǒ dé dào le yì běn shū')
    expect(fixDeParticlePinyin('这值得很多钱', 'zhè zhí dé hěn duō qián'))
      .toBe('zhè zhí dé hěn duō qián')   // 值得 + 很多, not V+得+很
    expect(fixDeParticlePinyin('他得不到答案', 'tā dé bú dào dá àn'))
      .toBe('tā dé bú dào dá àn')
    // děi — modal, after a subject or a time word
    expect(fixDeParticlePinyin('你得走了', 'nǐ dé zǒu le')).toBe('nǐ dé zǒu le')
    expect(fixDeParticlePinyin('我们得走了', 'wǒ men dé zǒu le')).toBe('wǒ men dé zǒu le')
    expect(fixDeParticlePinyin('他得很小心', 'tā dé hěn xiǎo xīn')).toBe('tā dé hěn xiǎo xīn')
    expect(fixDeParticlePinyin('今天得很努力', 'jīn tiān dé hěn nǔ lì'))
      .toBe('jīn tiān dé hěn nǔ lì')
    expect(fixDeParticlePinyin('我今天得早点睡', 'wǒ jīn tiān dé zǎo diǎn shuì'))
      .toBe('wǒ jīn tiān dé zǎo diǎn shuì')   // 早 is adverbial, not clause-final
  })

  it('trusts a reading pinyin-pro already resolved to de / děi', () => {
    expect(fixDeParticlePinyin('我觉得很好', 'wǒ jué de hěn hǎo')).toBe('wǒ jué de hěn hǎo')
    expect(fixDeParticlePinyin('天气变得很冷', 'tiān qì biàn de hěn lěng'))
      .toBe('tiān qì biàn de hěn lěng')
    expect(fixDeParticlePinyin('你得走了', 'nǐ děi zǒu le')).toBe('nǐ děi zǒu le')
  })

  it('returns the input untouched when it cannot align or has no 得', () => {
    expect(fixDeParticlePinyin('他跑得很快', 'tā pǎo dé hěn')).toBe('tā pǎo dé hěn')
    expect(fixDeParticlePinyin('你好', 'nǐ hǎo')).toBe('nǐ hǎo')
    expect(fixDeParticlePinyin(null, 'tā pǎo dé kuài')).toBe('tā pǎo dé kuài')
    expect(fixDeParticlePinyin('他跑得快', null)).toBeNull()
  })
})

// Minimal CSV row parser handling the quoted "I, me" meaning field.
function parseCsvRow(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}
