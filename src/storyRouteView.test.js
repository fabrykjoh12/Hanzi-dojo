import { describe, it, expect } from 'vitest'
import { storyRouteView } from './storyRouteView'
const a = { id: 'a' }, b = { id: 'b' }, standalone = { id: 'single' }
const series = { key: 'season', kind: 'series', parts: [a, b] }
const base = { stories: [a, b, standalone], sections: [{ units: [series] }] }
const resolve = (args) => storyRouteView({ ...base, ...args })
describe('route-owned story destination', () => {
  it('opens each chapter immediately without a shelf transition', () => {
    for (const storyId of ['a', 'b', 'a']) {
      const result = resolve({ kind: 'story', storyId, readerSeriesKey: 'season' })
      expect(result.view).toBe('reader')
      expect(result.story.id).toBe(storyId)
      expect(result.series).toBe(series)
    }
  })
  it('restores series origin from history state after reload', () => {
    expect(resolve({ kind: 'story', storyId: 'b', readerSeriesKey: 'season' }).series).toBe(series)
    expect(resolve({ kind: 'series', seriesKey: 'season' }).view).toBe('series')
  })
  it('validates the claimed origin against chapter membership', () => {
    expect(resolve({ kind: 'story', storyId: 'single', readerSeriesKey: 'season' }).series).toBeNull()
    expect(resolve({ kind: 'story', storyId: 'a', readerSeriesKey: 'unknown' }).series).toBeNull()
  })
  it('keeps unavailable destinations out of the interactive shelf', () => {
    expect(resolve({ kind: 'story', storyId: 'missing' }).view).toBe('missing')
    expect(resolve({ kind: 'series', seriesKey: 'missing' }).view).toBe('missing')
    expect(storyRouteView({ ...base, stories: [], kind: 'story', storyId: 'a' }).view).toBe('missing')
  })
  it('only the browse route renders the shelf', () => {
    expect(resolve({ kind: 'browse' })).toEqual({ view: 'browse', story: null, series: null })
  })
})
