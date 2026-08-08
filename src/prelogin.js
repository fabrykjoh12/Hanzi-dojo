// Pre-login onboarding choices (language + why-you're-learning), captured before
// signup and carried into the post-signup Onboarding via localStorage. The pure
// helpers are unit-tested; the storage helpers degrade quietly if unavailable.

// Which screen a signed-out visitor lands on.
//
// The web gets the marketing page: someone arriving at hanzi-dojo.com has not
// decided anything yet and needs to be told what this is. Someone who has
// already installed the app from a store has read that pitch — the store
// listing *is* the landing page — so repeating it wastes their first screen
// and makes the app feel like a bookmarked website. They get a proper app
// welcome instead, straight into the two things they might want: start, or
// sign in.
export function initialLandingMode(native) {
  return native ? 'welcome' : 'landing'
}

// Icons and tints live with the screens that render these (lucide components
// don't belong in a pure module); this list is the data only.
export const REASONS = [
  { key: 'travel', label: 'Travel' },
  { key: 'family', label: 'Family & heritage' },
  { key: 'work', label: 'Work or study' },
  { key: 'exam', label: 'Pass an exam' },
  { key: 'culture', label: 'Culture — film, music, anime' },
  { key: 'curious', label: 'Just curious' },
]

// The exam a reason='exam' learner is aiming at, per language (tailors copy).
export function examLabelFor(language) {
  if (language === 'chinese') return 'HSK'
  if (language === 'japanese') return 'JLPT'
  if (language === 'russian') return 'TORFL'
  return 'a proficiency exam'
}

export function reasonLabel(key) {
  const r = REASONS.find(x => x.key === key)
  return r ? r.label : null
}

// A short, encouraging line for the signup screen, given the choices.
export function encouragementFor(language, reason, languageName) {
  const lang = languageName || 'your language'
  const map = {
    travel: `Learning ${lang} for travel — let's get you reading signs and menus fast.`,
    family: `Reconnecting with ${lang} — a warm reason to keep going.`,
    work: `${lang} for work or study — we'll build a steady, real vocabulary.`,
    exam: `Aiming for ${examLabelFor(language)} — we'll match your level and grow it.`,
    culture: `${lang} for the culture — soon you'll follow it in the original.`,
    curious: `Curious about ${lang}? Perfect — your first words are moments away.`,
  }
  return map[reason] || `Great choice — your first ${lang} words are moments away.`
}

// A warm one-liner for the first-session welcome, naming up to two words the
// visitor already tasted pre-signup. Returns null when there's nothing to say.
export function tastedWordsLine(words) {
  const list = (words || []).filter(Boolean)
  if (list.length === 0) return null
  const named = list.slice(0, 2).join(' and ')
  return `You already met ${named} — nice start.`
}

const KEY = 'prelogin:prefs'

export function savePreloginPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}
export function readPreloginPrefs() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null } catch { return null }
}
export function clearPreloginPrefs() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
