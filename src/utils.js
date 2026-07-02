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

// Play a URL on a given <audio> element, with a fallback for iOS WebKit
// (Safari, and Chrome-on-iOS — same underlying media engine) which can fail
// a direct progressive-load play() from some CDNs' Range-request handling
// even though the file itself is fine. If the direct URL errors, retry once
// by fetching the whole file as a blob, which sidesteps Range entirely.
// `onFail` is called only if both attempts fail.
export function playAudioEl(el, url, onFail) {
  function fallback() {
    fetch(url)
      .then(res => { if (!res.ok) throw new Error('fetch failed'); return res.blob() })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob)
        el.onerror = () => { if (onFail) onFail() }
        el.addEventListener('ended', () => URL.revokeObjectURL(blobUrl), { once: true })
        el.src = blobUrl
        return el.play()
      })
      .catch(() => { if (onFail) onFail() })
  }
  el.onerror = fallback
  el.src = url
  el.play().catch(e => {
    // Expected, not a real failure: autoplay blocked, or play() interrupted
    // by a pause()/src swap from a rapid second tap.
    if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return
    fallback()
  })
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
