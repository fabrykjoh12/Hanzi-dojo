// Route ⇄ view mapping, extracted from App.jsx so the mapping (and the
// known-view guard behind the NotFound screen) can be unit-tested without
// rendering the whole app.

// Every view key App.jsx renders an explicit screen for. A path that maps to a
// view NOT in this set is a genuine 404 (NotFound), rather than silently
// falling through to Home — which used to hide typos and dead links.
export const KNOWN_VIEWS = [
  'home',
  'study', 'weak', 'test', 'writing', 'listen', 'kana', 'cyrillic',
  'practice', 'words', 'known', 'dictionary', 'grammar', 'grammarpractice', 'strokes', 'builder', 'fillblank', 'speak',
  'tones', 'stories', 'analyzer', 'profile', 'languages', 'youtube', 'settings',
  'hq',
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

function decodeSegment(value) {
  try { return decodeURIComponent(value) } catch { return value }
}

// Signed-in story library routes. These make reader and series state shareable
// and let browser Back return to the exact shelf state that opened them.
export function storyRoute(pathname) {
  let p = pathname || '/stories'
  if (p.startsWith('/')) p = p.slice(1)
  const segs = p.replace(/\/$/, '').split('/')
  if (segs[0] !== 'stories') return null
  if (segs[1] === 'series' && segs[2]) return { kind: 'series', key: decodeSegment(segs[2]) }
  if (segs[1]) return { kind: 'story', id: decodeSegment(segs[1]) }
  return { kind: 'browse' }
}

export function storyPath(storyId) {
  return '/stories/' + encodeURIComponent(storyId || '')
}

export function seriesPath(seriesKey) {
  return '/stories/series/' + encodeURIComponent(seriesKey || '')
}

// Recognize the public reading-assessment route (/how-much-can-you-read), which
// works signed-out. Kept here (not in App) so the same route-mapping tests cover
// it. Tolerates a trailing slash.
export function isAssessmentPath(pathname) {
  let p = pathname || '/'
  if (p.startsWith('/')) p = p.slice(1)
  return p.replace(/\/$/, '') === 'how-much-can-you-read'
}

// The public trust pages (/privacy, /terms, /support, /methodology), which work
// signed-out AND signed-in — a visitor must be able to read them before
// registering. Returns the page key, or null for any other path.
export const TRUST_PAGES = ['privacy', 'terms', 'support', 'methodology']

// Case-insensitive on purpose. These four URLs are the ones typed by hand
// rather than clicked: into the Apple and Google console forms, into emails,
// onto paper. Apple and Google both fetch the privacy URL and reject a
// listing when it does not load, so "/Privacy" quietly 404ing because someone
// capitalised it is a genuinely expensive way to be strict. The app's own
// links all use the canonical lowercase form.
export function trustPageKey(pathname) {
  let p = pathname || '/'
  if (p.startsWith('/')) p = p.slice(1)
  const seg = p.replace(/\/$/, '').toLowerCase()
  return TRUST_PAGES.indexOf(seg) !== -1 ? seg : null
}
