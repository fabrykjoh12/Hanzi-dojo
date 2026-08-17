import { describe, expect, it } from 'vitest'
import { mobileNavRoot } from './mobileNavState'

describe('mobile navigation state', () => {
  it('keeps practice tools under Practice', () => {
    expect(mobileNavRoot('grammar')).toBe('practice')
    expect(mobileNavRoot('strokes')).toBe('practice')
  })

  it('keeps story reading under Stories', () => {
    expect(mobileNavRoot('stories')).toBe('stories')
  })

  it('maps every session form to the Cards tab', () => {
    expect(mobileNavRoot('study')).toBe('study')
    expect(mobileNavRoot('weak')).toBe('study')
  })

  it('keeps account destinations under Profile', () => {
    expect(mobileNavRoot('profile')).toBe('profile')
    expect(mobileNavRoot('settings')).toBe('profile')
    expect(mobileNavRoot('languages')).toBe('profile')
  })

  it('leaves flows with no tab of their own unmarked', () => {
    expect(mobileNavRoot('test')).toBeNull()
    expect(mobileNavRoot('hq')).toBeNull()
  })
})
