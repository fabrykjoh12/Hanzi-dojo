import { groupIntoArcs, leadingChapterNumber } from './storyArcs'

function panelMeta(story) {
  const panels = story && story.panels
  if (!panels || typeof panels !== 'object') return {}
  const meta = panels.meta
  return meta && typeof meta === 'object' ? meta : {}
}

export function isStandaloneStory(story) {
  return panelMeta(story).story_kind === 'standalone'
}

export function standaloneStoryDetails(story) {
  if (!isStandaloneStory(story)) return null
  const meta = panelMeta(story)
  const chapters = Array.isArray(meta.chapters) && meta.chapters.length > 0
    ? meta.chapters.length
    : null
  const minutes = Number.isInteger(meta.estimated_minutes) && meta.estimated_minutes > 0
    ? meta.estimated_minutes
    : null
  return { chapters, minutes }
}

function seriesName(story) {
  const value = panelMeta(story).series
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function explicitSeries(stories) {
  const groups = []
  const byName = new Map()
  for (const story of stories) {
    const name = seriesName(story)
    if (!name) continue
    let group = byName.get(name)
    if (!group) {
      group = {
        key: 'series:' + name,
        title: name,
        parts: [],
        numbered: true,
        explicit: true,
      }
      groups.push(group)
      byName.set(name, group)
    }
    group.parts.push(story)
  }
  return groups
}

// Explicit metadata wins over title-number heuristics. This keeps unrelated
// manhua series apart even when their chapter numbers happen to be adjacent.
export function organizeNarrativeStories(stories) {
  const list = Array.isArray(stories) ? stories : []
  const standaloneStories = list.filter(isStandaloneStory)
  const serialStories = list.filter(story => !isStandaloneStory(story) && seriesName(story))
  const unclassified = list.filter(story => !isStandaloneStory(story) && !seriesName(story))
  const numberedStories = unclassified.filter(story => leadingChapterNumber(story && story.title) != null)
  const derivedArcs = groupIntoArcs(numberedStories)
  const derivedSeries = derivedArcs.filter(arc => arc.numbered && arc.parts.length > 1)
  const storiesInDerivedSeries = new Set(derivedSeries.flatMap(arc => arc.parts))
  const looseStories = unclassified.filter(story => !storiesInDerivedSeries.has(story))

  return {
    standaloneStories,
    seriesArcs: explicitSeries(serialStories).concat(derivedSeries),
    looseStories,
  }
}

export function seriesHasMore(arc) {
  const parts = arc && Array.isArray(arc.parts) ? arc.parts : []
  return parts.some(story => {
    const continues = panelMeta(story).continues
    return continues && typeof continues === 'object'
  })
}
