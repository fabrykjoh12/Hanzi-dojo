import { describe, it, expect } from 'vitest'
import { resolvePresentation, presentationOf } from './readerMode'

describe('resolvePresentation', () => {
  it('defaults a story with no presentation to paced', () => {
    expect(resolvePresentation({}, 'paced')).toBe('paced')
    expect(resolvePresentation({ presentation: null }, 'paced')).toBe('paced')
  })
  it('honors a classic preference only for paced stories', () => {
    expect(resolvePresentation({ presentation: 'paced' }, 'classic')).toBe('classic')
    expect(resolvePresentation({ presentation: 'paced' }, 'paced')).toBe('paced')
  })
  it('ignores the preference for authored formats', () => {
    expect(resolvePresentation({ presentation: 'chat' }, 'classic')).toBe('chat')
    expect(resolvePresentation({ presentation: 'scene' }, 'classic')).toBe('scene')
  })
  it('renders the manhua reader for a manhua episode', () => {
    expect(resolvePresentation({ presentation: 'manhua' }, 'classic')).toBe('manhua')
  })
  it('falls back to classic for an unknown mode', () => {
    expect(resolvePresentation({ presentation: 'wizard' }, 'paced')).toBe('classic')
  })
})

// The format shipped tagged 'manga' and was renamed to 'manhua' a day later.
// Rows on either spelling must render the same reader, or the app deploy and the
// DB migration would have to land in the same instant — and whichever arrived
// first would drop the live episode to a plain paced story in between.
describe('the legacy manga tag', () => {
  it('resolves to the manhua reader', () => {
    expect(resolvePresentation({ presentation: 'manga' }, 'paced')).toBe('manhua')
    expect(resolvePresentation({ presentation: 'manga' }, 'classic')).toBe('manhua')
  })
  it('is normalised by presentationOf, which leaves every other tag alone', () => {
    expect(presentationOf({ presentation: 'manga' })).toBe('manhua')
    expect(presentationOf({ presentation: 'manhua' })).toBe('manhua')
    expect(presentationOf({ presentation: 'chat' })).toBe('chat')
    expect(presentationOf({ presentation: null })).toBe(null)
    expect(presentationOf({})).toBe(undefined)
    expect(presentationOf(null)).toBeFalsy()
  })
})
