import { describe, it, expect } from 'vitest'
import { filterStories } from './storyList'

const stories = [
  { id: 'a', presentation: 'paced' },
  { id: 'b', presentation: 'chat' },
  { id: 'c', presentation: 'scene' },
  { id: 'd', presentation: 'paced' },
]
const readIds = new Set(['a', 'b'])

const ids = arr => arr.map(s => s.id)

describe('filterStories', () => {
  it('returns everything with the default filters', () => {
    expect(ids(filterStories(stories, {}, readIds))).toEqual(['a', 'b', 'c', 'd'])
  })
  it('filters by read status', () => {
    expect(ids(filterStories(stories, { status: 'read' }, readIds))).toEqual(['a', 'b'])
    expect(ids(filterStories(stories, { status: 'unread' }, readIds))).toEqual(['c', 'd'])
  })
  it('filters by format (stories vs practice)', () => {
    expect(ids(filterStories(stories, { format: 'stories' }, readIds))).toEqual(['a', 'd'])
    expect(ids(filterStories(stories, { format: 'practice' }, readIds))).toEqual(['b', 'c'])
  })
  it('combines both filters', () => {
    // practice + unread → scene c (chat b is read)
    expect(ids(filterStories(stories, { status: 'unread', format: 'practice' }, readIds))).toEqual(['c'])
  })
  it('accepts a plain map for readIds and is safe on empty input', () => {
    expect(ids(filterStories(stories, { status: 'read' }, { a: true }))).toEqual(['a'])
    expect(filterStories([], {}, readIds)).toEqual([])
    expect(filterStories(null, {}, readIds)).toEqual([])
  })
})
