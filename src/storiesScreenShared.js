// The few helpers the three Stories destinations share.
//
// They were module-level functions inside Stories.jsx while Stories.jsx WAS all
// three screens. Now that the shelf, the series page and the reader are
// separate destinations owned by the navigation model, the helpers have to live
// somewhere all three can see — and the choice is a plain module, not a fourth
// prop threaded through the shell (CLAUDE.md §3).

import { tiersFor } from './storyTiers'
import { languageTheme } from './languageTheme'

export function getLanguageDetails(profile, track) {
  const language = track.language || profile.active_language
  const t = languageTheme(language)
  return { accentHex: t.accentHex, languageName: t.languageName, fontFamily: t.font }
}

export function pageShell() {
  return { minHeight: '100vh', position: 'relative', overflow: 'hidden' }
}

// The shelf category a story belongs to — its tier at its own level. Only ever
// enriches the reader's "next" logic, so a story whose tier is not in the tier
// table (bad data) still reads instead of bouncing back to the shelf.
export function categoryForStory(story, track) {
  if (!story) return null
  const level = story.level == null ? track.current_level : story.level
  const tier = tiersFor(track.language, level).find(c => c.tier === story.tier)
  return tier ? { ...tier, level } : null
}

export function levelOf(lvl, track) {
  return lvl == null ? track.current_level : lvl
}

// Every story on one shelf category, in shelf order.
export function storiesIn(stories, cat, track) {
  if (!cat) return []
  return stories.filter(s => s.tier === cat.tier && levelOf(s.level, track) === cat.level)
}
