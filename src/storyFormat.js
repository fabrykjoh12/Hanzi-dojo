// Pure helpers describing a story's presentation format, shared by the cover
// art, the card metadata row, and the Stories vs Practice-Scenarios split.
//
// A "practice format" is a non-narrative, interactive drill (chat, scene, or a
// reply-along). These read as broken story cards when mixed into a story arc, so
// the Stories screen pulls them into their own "Practice Scenarios" section.
//
// Every comparison here reads `presentationOf(story)` rather than
// `story.presentation`, so a row still carrying a legacy format tag is labelled
// and sorted as the format it actually is.
import { presentationOf } from './readerMode'

// Manhua is deliberately NOT a practice format: it is the most narrative thing
// the library has. Its story choice is characterisation, not a drill with a
// right answer, so it belongs on the story shelf beside the prose chapters.
export function isPracticeFormat(story) {
  if (!story) return false
  const p = presentationOf(story)
  if (p === 'manhua') return false
  return Boolean(story.interactions) || p === 'chat' || p === 'scene'
}

// One glyph for the format — the cover fallback and (compactly) the meta row.
// Reply-along wins over plain chat since it is the more specific format.
export function formatEmoji(story) {
  if (!story) return '📖'
  const p = presentationOf(story)
  if (p === 'manhua') return '🖌️'
  if (story.interactions) return '🗨️'
  if (p === 'chat') return '💬'
  if (p === 'scene') return '🎬'
  return '📖'
}

// A short human label for the format tag in the card meta row.
export function formatLabel(story) {
  if (!story) return 'Story'
  const p = presentationOf(story)
  if (p === 'manhua') return 'Manhua'
  if (story.interactions) return 'Reply'
  if (p === 'chat') return 'Chat'
  if (p === 'scene') return 'Scene'
  return 'Story'
}

// The default format, said out loud, is noise.
//
// Every prose card was carrying a "Story" tag in its meta row and, if it was a
// manhua or a practice scenario, a capsule over the artwork saying so as well —
// the format was announced twice on the cards where it differs and once on the
// cards where it does not (P10-C1). Format metadata is worth showing exactly
// when it tells the reader this item is not the usual thing.
export const DEFAULT_FORMAT_LABEL = 'Story'

export function distinctiveFormatLabel(story) {
  const label = formatLabel(story)
  return label === DEFAULT_FORMAT_LABEL ? '' : label
}

