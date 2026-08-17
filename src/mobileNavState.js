const PRACTICE_VIEWS = new Set([
  'practice', 'words', 'known', 'dictionary', 'grammar', 'grammarpractice',
  'strokes', 'builder', 'fillblank', 'speak', 'tones', 'analyzer', 'listen',
  'writing', 'kana', 'cyrillic', 'youtube',
])

// A flashcard session in any form belongs to the Cards tab. The dock is hidden
// while one runs (bottomBar.js NAV_FREE_VIEWS), but the mapping still matters:
// it marks the tab during the hide/show transitions, and it is what makes
// tapping Cards a no-op-safe "you are here".
const CARDS_VIEWS = new Set(['study', 'weak'])

// Account destinations reached through Profile keep the Profile tab lit, so
// stepping into Settings doesn't strand the learner with no position at all.
const PROFILE_VIEWS = new Set(['profile', 'settings', 'languages'])

export function mobileNavRoot(view) {
  if (view === 'home') return 'home'
  if (view === 'stories') return 'stories'
  if (CARDS_VIEWS.has(view)) return 'study'
  if (PRACTICE_VIEWS.has(view)) return 'practice'
  if (PROFILE_VIEWS.has(view)) return 'profile'
  return null
}
