import { describe, it, expect } from 'vitest'
import { pathToView, viewToPath, isKnownView, KNOWN_VIEWS } from './routes'

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

  it('rejects unknown / typo routes so they hit NotFound', () => {
    expect(isKnownView('storeis')).toBe(false)
    expect(isKnownView('random-page')).toBe(false)
    expect(isKnownView('')).toBe(false)
  })
})
