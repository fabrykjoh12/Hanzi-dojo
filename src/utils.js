export function getLevelLabel(language, system, level) {
  if (language === 'japanese' || system === 'jlpt') {
    const map = {
      1: 'N5 · Part 1',
      2: 'N5 · Part 2',
      3: 'N4',
      4: 'N3',
      5: 'N2',
      6: 'N1',
    }
    return map[level] || 'N' + level
  }
  // Russian uses CEFR-style bands (levels 1–6 → A1…C2). See CLAUDE.md §6.
  if (language === 'russian' || system === 'russian') {
    const map = {
      1: 'A1',
      2: 'A2',
      3: 'B1',
      4: 'B2',
      5: 'C1',
      6: 'C2',
    }
    return map[level] || 'Level ' + level
  }
  return 'HSK ' + level
}

export function getSystemLabel(system) {
  if (system === 'jlpt') return 'JLPT'
  if (system === 'hsk_3') return 'HSK 3.0'
  if (system === 'russian') return 'CEFR'
  return system
}

export function getLevelRange(language, system) {
  if (language === 'japanese' || system === 'jlpt') {
    return { min: 1, max: 6 }
  }
  if (language === 'russian' || system === 'russian') {
    return { min: 1, max: 6 }
  }
  return { min: 1, max: 9 }
}

// The list of level numbers for a language/system (for level pickers).
export function getLevels(language, system) {
  const { min, max } = getLevelRange(language, system)
  const out = []
  for (let l = min; l <= max; l += 1) out.push(l)
  return out
}

export function getNextLevel(language, system, level) {
  const { max } = getLevelRange(language, system)
  return level < max ? level + 1 : level
}

// Fisher–Yates shuffle (returns a new array). Replaces the copy in every drill
// file and the biased `sort(() => Math.random() - 0.5)` idiom in Test.jsx.
export function shuffle(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

// Public URL for a TTS file in the Supabase audio bucket.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export function getAudioUrl(audioPath) {
  if (!audioPath) return null
  return SUPABASE_URL + '/storage/v1/object/public/audio/' + audioPath
}

export function normalizeRecallInput(value) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/[。、，,.!?！？\s]/g, '')
}

export function isRecallMatch(input, expected) {
  return normalizeRecallInput(input) === normalizeRecallInput(expected)
}
