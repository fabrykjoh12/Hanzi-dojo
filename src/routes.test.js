import { describe, it, expect } from 'vitest'
import { pathToView, viewToPath, isKnownView, KNOWN_VIEWS, readStoryId } from './routes'

describe('pathToView', () => {
  it('maps root and empty to home', () => {
    expect(pathToView('/')).toBe('home')
    expect(pathToView('')).toBe('home')
    expect(pathToView(undefined)).toBe('home')
  })

  it('takes the first path segment', () => {
    expect(pathToView('/study')).toBe('study')
    expect(pathToView('/stories/47')).toBe('stories')
    expect(pathToView('/settings')).toBe('settings')
  })
})

describe('viewToPath', () => {
  it('round-trips with pathToView for every known view', () => {
    for (const view of KNOWN_VIEWS) {
      expect(pathToView(viewToPath(view))).toBe(view)
    }
  })

  it('renders home as the root path', () => {
    expect(viewToPath('home')).toBe('/')
  })
})

describe('isKnownView', () => {
  it('accepts real views', () => {
    expect(isKnownView('home')).toBe(true)
    expect(isKnownView('study')).toBe(true)
    expect(isKnownView('stories')).toBe(true)
  })

  it('accepts the admin dashboard view', () => {
    expect(isKnownView('dashboard')).toBe(true)
  })

  it('rejects unknown / typo routes so they hit NotFound', () => {
    expect(isKnownView('storeis')).toBe(false)
    expect(isKnownView('random-page')).toBe(false)
    expect(isKnownView('')).toBe(false)
  })
})

describe('readStoryId', () => {
  it('extracts the id from a /read/<id> path', () => {
    expect(readStoryId('/read/abc-123')).toBe('abc-123')
  })
  it('ignores trailing segments', () => {
    expect(readStoryId('/read/abc-123/extra')).toBe('abc-123')
  })
  it('returns null for /read with no id', () => {
    expect(readStoryId('/read')).toBe(null)
    expect(readStoryId('/read/')).toBe(null)
  })
  it('returns null for unrelated paths', () => {
    expect(readStoryId('/stories')).toBe(null)
    expect(readStoryId('/')).toBe(null)
  })
})
