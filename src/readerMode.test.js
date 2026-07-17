import { describe, it, expect } from 'vitest'
import { resolvePresentation } from './readerMode'

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
  it('falls back to classic for an unknown mode', () => {
    expect(resolvePresentation({ presentation: 'wizard' }, 'paced')).toBe('classic')
  })
})
