// Which presentation renders a story. Stories declare a `presentation`
// (default 'paced' for the whole existing library); the user can opt a paced
// story back to the classic continuous scroll. Authored formats (chat, scene,
// manga) are fixed by the story and ignore the preference — a manga episode is
// laid out panel by panel, and there is no continuous-scroll reading of it that
// isn't just the script with the pictures thrown away.
const KNOWN = new Set(['paced', 'chat', 'scene', 'manga'])

export function resolvePresentation(story, modePref) {
  const raw = story && story.presentation
  const mode = KNOWN.has(raw) ? raw : (raw == null ? 'paced' : 'classic')
  if (mode === 'paced' && modePref === 'classic') return 'classic'
  return mode
}
