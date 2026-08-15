const PRACTICE_VIEWS = new Set([
  'practice', 'words', 'known', 'dictionary', 'grammar', 'grammarpractice',
  'strokes', 'builder', 'fillblank', 'speak', 'tones', 'analyzer', 'listen',
  'writing', 'kana', 'cyrillic', 'youtube',
])

export function mobileNavRoot(view) {
  if (view === 'home') return 'home'
  if (view === 'stories') return 'stories'
  if (PRACTICE_VIEWS.has(view)) return 'practice'
  return null
}
