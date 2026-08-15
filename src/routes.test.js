import { describe, it, expect } from 'vitest'
import {
  pathToView, viewToPath, isKnownView, KNOWN_VIEWS, readStoryId, isAssessmentPath,
  trustPageKey, TRUST_PAGES, storyRoute, storyPath, seriesPath, legacyRedirectPath,
} from './routes'

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

describe('legacy mobile destinations', () => {
  it('keeps old Cards links valid by replacing them with Study', () => {
    expect(legacyRedirectPath('/cards')).toBe('/study')
    expect(legacyRedirectPath('/cards/')).toBe('/study')
  })

  it('renders legacy mobile destinations immediately through their canonical views', () => {
    expect(pathToView('/cards')).toBe('study')
    expect(pathToView('/more')).toBe('profile')
  })

  it('keeps old More links valid through the Profile hierarchy', () => {
    expect(legacyRedirectPath('/more')).toBe('/profile')
    expect(legacyRedirectPath('/more/')).toBe('/profile')
  })

  it('does not rewrite canonical or unknown paths', () => {
    expect(legacyRedirectPath('/study')).toBe(null)
    expect(legacyRedirectPath('/stories/abc')).toBe(null)
    expect(legacyRedirectPath('/storeis')).toBe(null)
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

  it('knows the prior-knowledge screen', () => {
    expect(isKnownView('known')).toBe(true)
    expect(viewToPath('known')).toBe('/known')
    expect(pathToView('/known')).toBe('known')
  })

  it('accepts the shared Dojo HQ view', () => {
    expect(isKnownView('hq')).toBe(true)
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

describe('signed-in story routes', () => {
  it('recognizes browse, story and series states', () => {
    expect(storyRoute('/stories')).toEqual({ kind: 'browse' })
    expect(storyRoute('/stories/abc-123')).toEqual({ kind: 'story', id: 'abc-123' })
    expect(storyRoute('/stories/series/Ink%20and%20Rain')).toEqual({ kind: 'series', key: 'Ink and Rain' })
    expect(storyRoute('/study')).toBeNull()
  })

  it('builds encoded shareable paths', () => {
    expect(storyPath('abc 123')).toBe('/stories/abc%20123')
    expect(seriesPath('Ink & Rain')).toBe('/stories/series/Ink%20%26%20Rain')
  })
})

describe('trustPageKey', () => {
  it('recognizes every trust page (with or without trailing slash)', () => {
    for (const page of TRUST_PAGES) {
      expect(trustPageKey('/' + page)).toBe(page)
      expect(trustPageKey('/' + page + '/')).toBe(page)
    }
  })
  it('rejects other paths', () => {
    expect(trustPageKey('/')).toBe(null)
    expect(trustPageKey('/stories')).toBe(null)
    expect(trustPageKey('/privacy-policy')).toBe(null)
    expect(trustPageKey('/terms/extra')).toBe(null)
  })
  it('is not a known in-app view (renders its own shell)', () => {
    for (const page of TRUST_PAGES) {
      expect(isKnownView(page)).toBe(false)
    }
  })
})

describe('isAssessmentPath', () => {
  it('recognizes the assessment route (with or without trailing slash)', () => {
    expect(isAssessmentPath('/how-much-can-you-read')).toBe(true)
    expect(isAssessmentPath('/how-much-can-you-read/')).toBe(true)
  })
  it('rejects other paths', () => {
    expect(isAssessmentPath('/read/abc')).toBe(false)
    expect(isAssessmentPath('/')).toBe(false)
    expect(isAssessmentPath('/stories')).toBe(false)
  })
})
