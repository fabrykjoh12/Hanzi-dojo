// Pure helpers describing a story's presentation format, shared by the cover
// art, the card metadata row, and the Stories vs Practice-Scenarios split.
//
// A "practice format" is a non-narrative, interactive drill (chat, scene, or a
// reply-along). These read as broken story cards when mixed into a story arc, so
// the Stories screen pulls them into their own "Practice Scenarios" section.

// Manga is deliberately NOT a practice format: it is the most narrative thing
// the library has. Its story choice is characterisation, not a drill with a
// right answer, so it belongs on the story shelf beside the prose chapters.
export function isPracticeFormat(story) {
  if (!story) return false
  if (story.presentation === 'manga') return false
  return Boolean(story.interactions)
    || story.presentation === 'chat'
    || story.presentation === 'scene'
}

// One glyph for the format — the cover fallback and (compactly) the meta row.
// Reply-along wins over plain chat since it is the more specific format.
export function formatEmoji(story) {
  if (!story) return '📖'
  if (story.presentation === 'manga') return '🖌️'
  if (story.interactions) return '🗨️'
  if (story.presentation === 'chat') return '💬'
  if (story.presentation === 'scene') return '🎬'
  return '📖'
}

// A short human label for the format tag in the card meta row.
export function formatLabel(story) {
  if (!story) return 'Story'
  if (story.presentation === 'manga') return 'Manga'
  if (story.interactions) return 'Reply'
  if (story.presentation === 'chat') return 'Chat'
  if (story.presentation === 'scene') return 'Scene'
  return 'Story'
}
