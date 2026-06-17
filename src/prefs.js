// Local, device-level UI preferences backed by localStorage. These are not
// synced to Supabase — they are display defaults, safe to lose. Keep helpers
// tiny and defensive so a disabled/unavailable localStorage never breaks render.

const FURIGANA_KEY = 'hanzi-dojo:furigana-default'

function readBool(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === 'true'
  } catch {
    return fallback
  }
}

function writeBool(key, value) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    // Ignore — preference simply won't persist on this device.
  }
}

// Whether Japanese flashcards show furigana (reading above kanji) by default.
export function getFuriganaDefault() {
  return readBool(FURIGANA_KEY, true)
}

export function setFuriganaDefault(value) {
  writeBool(FURIGANA_KEY, value)
}
