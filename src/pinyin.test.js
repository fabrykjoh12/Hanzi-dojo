import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readingToPhonemes, chinesePhonemeSsml } from './pinyin.js'

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
  const csv = readFileSync(join(__dirname, '../data/hsk3_level1.csv'), 'utf8')
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
