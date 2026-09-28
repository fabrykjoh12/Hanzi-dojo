// The URL owns the rendered reading destination. Never synchronize a second
// "view" state in an effect: it exposes the shelf between navigation commits.
export function storyRouteView({ kind, storyId, seriesKey, readerSeriesKey, stories, sections }) {
  const units = sections.flatMap(section => section.units)
  if (kind === 'story') {
    const story = stories.find(item => item.id === storyId) || null
    const series = units.find(unit => unit.kind === 'series' && unit.key === readerSeriesKey
      && unit.parts.some(part => part.id === storyId)) || null
    return { view: story ? 'reader' : 'missing', story, series }
  }
  if (kind === 'series') {
    const series = units.find(unit => unit.kind === 'series' && unit.key === seriesKey) || null
    return { view: series ? 'series' : 'missing', story: null, series }
  }
  return { view: 'browse', story: null, series: null }
}
