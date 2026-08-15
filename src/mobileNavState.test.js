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

  it('does not pretend profile or cards are tabs', () => {
    expect(mobileNavRoot('profile')).toBeNull()
    expect(mobileNavRoot('study')).toBeNull()
  })
})
