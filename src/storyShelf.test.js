import { describe, expect, it } from 'vitest'
import {
  isStandaloneStory, organizeNarrativeStories, seriesHasMore, standaloneStoryDetails,
} from './storyShelf'

function story(id, title, meta = null) {
  return { id, title, panels: meta ? { meta } : null }
}

describe('standalone story shelf metadata', () => {
  const standalone = story('one', '《一块钱》', {
    story_kind: 'standalone',
    chapters: [{ panel: 'p1' }, { panel: 'p7' }, { panel: 'p15' }],
    estimated_minutes: 8,
  })

  it('recognizes an explicitly complete story and exposes its shelf details', () => {
    expect(isStandaloneStory(standalone)).toBe(true)
    expect(standaloneStoryDetails(standalone)).toEqual({ chapters: 3, minutes: 8 })
  })

  it('does not infer standalone identity from an unnumbered title', () => {
    expect(isStandaloneStory(story('plain', '老朋友'))).toBe(false)
    expect(standaloneStoryDetails(story('plain', '老朋友'))).toBeNull()
  })
})

describe('organizeNarrativeStories', () => {
  it('keeps a standalone work outside every series', () => {
    const result = organizeNarrativeStories([
      story('ink', '第一话 · 我是新学生', { series: 'The Inkbound', continues: { label: '第二话' } }),
      story('one', '《一块钱》', { story_kind: 'standalone' }),
      story('noodles', '第二话 · 花花', { series: 'The Rainy-Day Noodle Shop' }),
    ])

    expect(result.standaloneStories.map(item => item.id)).toEqual(['one'])
    expect(result.seriesArcs.map(arc => arc.title)).toEqual(['The Inkbound', 'The Rainy-Day Noodle Shop'])
    expect(result.seriesArcs.map(arc => arc.parts.map(item => item.id))).toEqual([['ink'], ['noodles']])
    expect(result.looseStories).toEqual([])
  })

  it('keeps the legacy numbered-title fallback for prose series', () => {
    const result = organizeNarrativeStories([
      story('a', '1. Snow Day'), story('b', '2. Snow Day'), story('c', '老朋友'),
    ])
    expect(result.seriesArcs).toHaveLength(1)
    expect(result.seriesArcs[0].parts.map(item => item.id)).toEqual(['a', 'b'])
    expect(result.looseStories.map(item => item.id)).toEqual(['c'])
  })

  it('knows when a visible series promises another chapter', () => {
    const ongoing = organizeNarrativeStories([
      story('a', '第一话 · 开始', { series: 'Series A', continues: { label: '第二话' } }),
    ]).seriesArcs[0]
    expect(seriesHasMore(ongoing)).toBe(true)
    expect(seriesHasMore({ parts: [story('b', '完')] })).toBe(false)
  })
})
