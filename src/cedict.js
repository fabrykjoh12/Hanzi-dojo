// Pure CC-CEDICT parsing. CC-CEDICT lines look like:
//   傳統 传统 [chuan2 tong3] /tradition/traditional/
// Comments start with '#'. Pinyin is space-separated syllables with a trailing
// tone digit 1-5 (5 = neutral). We convert to tone marks for display and derive
// a toneless form for search (via the shared searchFold).
import { foldForSearch } from './searchFold.js'

const VOWELS = 'aeiouü'
// Tone marks indexed [tone-1] per vowel.
const MARKS = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

// Which vowel in a syllable carries the mark:
//   - 'a' or 'e' if present; else 'ou' → 'o'; else the LAST vowel.
function markTarget(letters) {
  const lower = letters.toLowerCase()
  if (lower.includes('a')) return lower.indexOf('a')
  if (lower.includes('e')) return lower.indexOf('e')
  if (lower.includes('ou')) return lower.indexOf('o')
  for (let i = lower.length - 1; i >= 0; i--) {
    if (VOWELS.includes(lower[i])) return i
  }
  return -1
}

function syllableToMarks(syl) {
  // Normalise u: / v → ü first.
  let s = syl.replace(/u:/g, 'ü').replace(/v/g, 'ü')
  const m = s.match(/^([a-zü]+)([1-5])$/i)
  if (!m) return s // r5 erhua or punctuation — leave as-is
  const [, letters, toneStr] = m
  const tone = Number(toneStr)
  if (tone === 5) return letters // neutral tone, no mark
  const idx = markTarget(letters)
  if (idx < 0) return letters
  const v = letters[idx].toLowerCase()
  const marked = (MARKS[v] || [])[tone - 1]
  if (!marked) return letters
  return letters.slice(0, idx) + marked + letters.slice(idx + 1)
}

export function numberedPinyinToMarks(numbered) {
  return (numbered || '')
    .trim()
    .split(/\s+/)
    .map(syllableToMarks)
    .join(' ')
    .trim()
}

const LINE_RE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/

export function parseCedictLine(line) {
  const raw = (line || '').trim()
  if (!raw || raw.startsWith('#')) return null
  const m = raw.match(LINE_RE)
  if (!m) return null
  const [, traditional, simplified, pinyinRaw, defsRaw] = m
  const pinyin = numberedPinyinToMarks(pinyinRaw)
  const definitions = defsRaw.split('/').map(d => d.trim()).filter(Boolean)
  return {
    traditional,
    simplified,
    pinyin,
    pinyinPlain: foldForSearch(pinyin),
    definitions,
  }
}
