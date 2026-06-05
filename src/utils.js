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
  return 'HSK ' + level
}

export function getSystemLabel(system) {
  if (system === 'jlpt') return 'JLPT'
  if (system === 'hsk_3') return 'HSK 3.0'
  return system
}

export function getLevelRange(language, system) {
  if (language === 'japanese' || system === 'jlpt') {
    return { min: 1, max: 6 }
  }
  return { min: 1, max: 9 }
}

export function getNextLevel(language, system, level) {
  const { max } = getLevelRange(language, system)
  return level < max ? level + 1 : level
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
