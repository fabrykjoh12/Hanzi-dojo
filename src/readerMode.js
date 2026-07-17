// Which presentation renders a story. Stories declare a `presentation`
// (default 'paced' for the whole existing library); the user can opt a paced
// story back to the classic continuous scroll. Authored formats (chat, scene)
// are fixed by the story and ignore the preference.
const KNOWN = new Set(['paced', 'chat', 'scene'])

export function resolvePresentation(story, modePref) {
  const raw = story && story.presentation
  const mode = KNOWN.has(raw) ? raw : (raw == null ? 'paced' : 'classic')
  if (mode === 'paced' && modePref === 'classic') return 'classic'
  return mode
}
