// Route ⇄ view mapping, extracted from App.jsx so the mapping (and the
// known-view guard behind the NotFound screen) can be unit-tested without
// rendering the whole app.

// Every view key App.jsx renders an explicit screen for. A path that maps to a
// view NOT in this set is a genuine 404 (NotFound), rather than silently
// falling through to Home — which used to hide typos and dead links.
export const KNOWN_VIEWS = [
  'home',
  'study', 'weak', 'test', 'writing', 'listen', 'kana', 'cyrillic',
  'practice', 'words', 'grammar', 'strokes', 'builder', 'fillblank', 'speak',
  'tones', 'stories', 'analyzer', 'profile', 'languages', 'youtube', 'settings',
  'dev',
  'dashboard',
]

// Map the internal view key to a URL path. Home is '/', every other view is
// '/<key>' (e.g. 'study' → '/study').
export function viewToPath(key) {
  return key === 'home' ? '/' : '/' + key
}

// Map a URL pathname to the internal view key (first path segment; '' → home).
export function pathToView(pathname) {
  let p = pathname || '/'
  if (p.startsWith('/')) p = p.slice(1)
  const seg = p.split('/')[0]
  return seg || 'home'
}

export function isKnownView(view) {
  return KNOWN_VIEWS.indexOf(view) !== -1
}

// Recognize the public story route (/read/<id>), which works signed-out.
// Returns the story id, or null for any other path. Kept here (not in App)
// so it's covered by the same route-mapping tests.
export function readStoryId(pathname) {
  let p = pathname || '/'
  if (p.startsWith('/')) p = p.slice(1)
  const segs = p.split('/')
  if (segs[0] === 'read' && segs[1]) return segs[1]
  return null
}

// Recognize the public reading-assessment route (/how-much-can-you-read), which
// works signed-out. Kept here (not in App) so the same route-mapping tests cover
// it. Tolerates a trailing slash.
export function isAssessmentPath(pathname) {
  let p = pathname || '/'
  if (p.startsWith('/')) p = p.slice(1)
  return p.replace(/\/$/, '') === 'how-much-can-you-read'
}
