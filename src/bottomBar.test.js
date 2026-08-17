import { describe, expect, it } from 'vitest'
import {
  CONTENT_GAP, DOCK_HEIGHT, DOCK_INSET, FLOAT_GAP,
  contentBottomInset, dockBottom, floatingBottom, navVisibleFor,
} from './bottomBar'

describe('dockBottom', () => {
  it('floors the safe-area inset so the dock always clears the edge', () => {
    expect(dockBottom()).toBe('max(env(safe-area-inset-bottom), 12px)')
  })
})

describe('contentBottomInset', () => {
  it('reserves the dock plus a content gap while the dock is shown', () => {
    expect(contentBottomInset(true))
      .toBe('calc(82px + max(env(safe-area-inset-bottom), 12px))')
  })

  it('gives fully-scrolled content at least 24px of air above the dock', () => {
    expect(CONTENT_GAP).toBeGreaterThanOrEqual(24)
  })

  it('drops to the focused value when the dock is hidden', () => {
    expect(contentBottomInset(false)).toBe('calc(16px + env(safe-area-inset-bottom))')
  })
})

describe('floatingBottom', () => {
  it('parks a floating control above the dock, never on it', () => {
    expect(floatingBottom(true))
      .toBe('calc(70px + max(env(safe-area-inset-bottom), 12px))')
  })

  it('follows the dock away in focused screens', () => {
    expect(floatingBottom(false)).toBe('calc(16px + env(safe-area-inset-bottom))')
  })

  // The regression this module exists for: the feedback button used to sit at a
  // hand-tuned 72px while the dock occupied 70px + safe area — i.e. ON it.
  it('always clears the dock’s own footprint', () => {
    expect(DOCK_HEIGHT + FLOAT_GAP).toBeGreaterThanOrEqual(DOCK_HEIGHT + DOCK_INSET - DOCK_INSET)
    expect(FLOAT_GAP).toBeGreaterThan(0)
    expect(CONTENT_GAP).toBeGreaterThanOrEqual(FLOAT_GAP)
  })
})

describe('navVisibleFor', () => {
  it('hides the dock in a flashcard session', () => {
    expect(navVisibleFor('study')).toBe(false)
    expect(navVisibleFor('weak')).toBe(false)
  })

  it('shows it on the three roots and ordinary screens', () => {
    expect(navVisibleFor('home')).toBe(true)
    expect(navVisibleFor('stories')).toBe(true)
    expect(navVisibleFor('practice')).toBe(true)
    expect(navVisibleFor('profile')).toBe(true)
  })

  it('hides it whenever a screen declares itself focused (the reader)', () => {
    expect(navVisibleFor('stories', { focused: true })).toBe(false)
    expect(navVisibleFor('home', { focused: true })).toBe(false)
  })
})
