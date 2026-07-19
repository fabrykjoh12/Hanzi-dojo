// Tone → color, applied with restraint (see the "Refined" design direction):
// only the headword characters and the character-breakdown cards get colored.
// Pure and unit-tested. The class names map to CSS defined once in the entry
// view; the palette lives there so light/dark are handled by CSS variables.

// Combining tone marks (NFD) → tone number.
const MARK_TONE = {
  '̄': 1, // macron  ̄
  '́': 2, // acute   ́
  '̌': 3, // caron   ̌
  '̀': 4, // grave   ̀
}

export function toneOf(syllable) {
  const decomposed = (syllable || '').normalize('NFD')
  for (const ch of decomposed) {
    if (MARK_TONE[ch]) return MARK_TONE[ch]
  }
  return 5
}

// Pair each hanzi character with the tone of the aligned pinyin syllable. When
// the syllable count doesn't match the character count (rare: erhua, proper
// nouns), extra characters fall back to neutral rather than misaligning.
export function splitHanziWithTones(hanzi, pinyin) {
  const chars = [...(hanzi || '')]
  const sylls = (pinyin || '').trim().split(/\s+/).filter(Boolean)
  return chars.map((char, i) => ({
    char,
    tone: i < sylls.length ? toneOf(sylls[i]) : 5,
  }))
}

export const TONE_CLASS = { 1: 'tone-1', 2: 'tone-2', 3: 'tone-3', 4: 'tone-4', 5: 'tone-5' }
