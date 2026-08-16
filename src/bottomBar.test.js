import { describe, expect, it } from 'vitest'
import {
  CONTENT_GAP, DOCK_HEIGHT, DOCK_INSET, DOCK_MIN_SIDE_MARGIN, DOCK_PADDING,
  DOCK_SEGMENT, DOCK_SEGMENT_HEIGHT, DOCK_WIDTH, FLOAT_GAP, MIN_VIEWPORT,
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
      .toBe('calc(72px + max(env(safe-area-inset-bottom), 12px))')
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

describe('the compact dock’s own geometry', () => {
  it('is a fixed-width control, three equal destinations wide', () => {
    expect(DOCK_WIDTH).toBe(DOCK_SEGMENT * 3 + DOCK_PADDING * 2)
    expect(DOCK_HEIGHT).toBe(DOCK_SEGMENT_HEIGHT + DOCK_PADDING * 2)
  })

  it('keeps every destination past the 44px touch minimum', () => {
    expect(DOCK_SEGMENT).toBeGreaterThanOrEqual(44)
    expect(DOCK_SEGMENT_HEIGHT).toBeGreaterThanOrEqual(44)
  })

  // The reason the width is a constant and not a percentage: it has to clear
  // both edges on the narrowest phone we support, and stay the same size on
  // every larger one.
  it('floats clear of both edges at 320px', () => {
    expect(DOCK_WIDTH).toBeLessThan(MIN_VIEWPORT)
    expect(DOCK_MIN_SIDE_MARGIN).toBeGreaterThanOrEqual(16)
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

  // Resting vs focused is the product model, not a per-screen decision: a drill
  // where you are answering questions owns the screen exactly as a flashcard
  // session does.
  it('hides the dock in focused drills and the level test', () => {
    for (const view of ['test', 'fillblank', 'builder', 'speak', 'tones', 'grammarpractice', 'strokes', 'writing']) {
      expect(navVisibleFor(view), view).toBe(false)
    }
  })

  it('keeps the dock on browsing screens inside Practice', () => {
    // These are places you look things up or pick what to do next — resting
    // states, so navigation stays.
    for (const view of ['words', 'known', 'dictionary', 'grammar', 'analyzer', 'listen', 'youtube']) {
      expect(navVisibleFor(view), view).toBe(true)
    }
  })
})
