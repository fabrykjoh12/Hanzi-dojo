// Which presentation renders a story. Stories declare a `presentation`
// (default 'paced' for the whole existing library); the user can opt a paced
// story back to the classic continuous scroll. Authored formats (chat, scene,
// manhua) are fixed by the story and ignore the preference — a manhua episode is
// laid out panel by panel, and there is no continuous-scroll reading of it that
// isn't just the script with the pictures thrown away.
const KNOWN = new Set(['paced', 'chat', 'scene', 'manhua'])

// The manhua format shipped tagged 'manga' and was renamed a day later (manhua
// is the Chinese word for the form; the product is Chinese-only). Rows still
// carrying the old tag read as manhua, which is what makes the app deploy and
// the DB migration independent of each other — either can land first without the
// live episode falling back to a plain paced story in between. Safe to drop once
// 20260730090000_manhua_presentation_rename.sql is applied everywhere.
const ALIASES = { manga: 'manhua' }

// The presentation tag a story should be treated as having. Every comparison
// against a format name goes through this, never `story.presentation` raw.
export function presentationOf(story) {
  const raw = story && story.presentation
  if (typeof raw !== 'string') return raw
  return ALIASES[raw] || raw
}

export function resolvePresentation(story, modePref) {
  const raw = presentationOf(story)
  const mode = KNOWN.has(raw) ? raw : (raw == null ? 'paced' : 'classic')
  if (mode === 'paced' && modePref === 'classic') return 'classic'
  return mode
}
