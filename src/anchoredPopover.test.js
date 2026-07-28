import { describe, it, expect } from 'vitest'
import {
  placePopover, popoverSpace, anchorInView,
  POPOVER_GAP, POPOVER_MARGIN, ARROW_INSET, MIN_POPOVER_HEIGHT,
} from './anchoredPopover'

const PHONE = { width: 380, height: 780 }
const DESKTOP = { width: 1440, height: 900 }

// A word in the middle of a phone screen, roughly the size a 30px CJK token is.
const midWord = { top: 400, left: 170, width: 34, height: 34 }
const box = { width: 340, height: 220 }

function rectOf(place, size) {
  return { top: place.top, left: place.left, right: place.left + size.width, bottom: place.top + Math.min(size.height, place.maxHeight) }
}

describe('placePopover — the preferred side', () => {
  it('puts the box above the word when there is room', () => {
    const p = placePopover(midWord, box, PHONE)
    expect(p.fits).toBe(true)
    expect(p.placement).toBe('above')
    // Its bottom edge sits exactly one gap over the word.
    expect(p.top + box.height).toBe(midWord.top - POPOVER_GAP)
  })

  it('flips below when the word is near the top of the screen', () => {
    const topWord = { top: 24, left: 170, width: 34, height: 34 }
    const p = placePopover(topWord, box, PHONE)
    expect(p.fits).toBe(true)
    expect(p.placement).toBe('below')
    expect(p.top).toBe(topWord.top + topWord.height + POPOVER_GAP)
  })

  it('stays above for a word near the bottom, where below has no room', () => {
    const bottomWord = { top: 700, left: 170, width: 34, height: 34 }
    const p = placePopover(bottomWord, box, PHONE)
    expect(p.placement).toBe('above')
    expect(p.top).toBeGreaterThanOrEqual(POPOVER_MARGIN)
  })

  it('never covers the word it is anchored to — above', () => {
    const p = placePopover(midWord, box, PHONE)
    expect(rectOf(p, box).bottom).toBeLessThanOrEqual(midWord.top)
  })

  it('never covers the word it is anchored to — below', () => {
    const topWord = { top: 24, left: 170, width: 34, height: 34 }
    const p = placePopover(topWord, box, PHONE)
    expect(p.top).toBeGreaterThanOrEqual(topWord.top + topWord.height)
  })

  it('keeps the box inside the viewport vertically on both sides', () => {
    for (const y of [10, 60, 200, 400, 600, 740, 770]) {
      const p = placePopover({ top: y, left: 170, width: 34, height: 22 }, box, PHONE)
      expect(p.fits).toBe(true)
      const r = rectOf(p, box)
      expect(p.top).toBeGreaterThanOrEqual(POPOVER_MARGIN - 0.001)
      expect(r.bottom).toBeLessThanOrEqual(PHONE.height - POPOVER_MARGIN + 0.001)
    }
  })
})

describe('placePopover — horizontal clamping and the arrow', () => {
  it('centres the box on the word when there is room either side', () => {
    const p = placePopover({ top: 400, left: 700, width: 30, height: 30 }, box, DESKTOP)
    expect(p.left + box.width / 2).toBeCloseTo(715, 5)
    // Centred box → the arrow sits in the middle of it.
    expect(p.arrowLeft).toBeCloseTo(box.width / 2, 5)
  })

  it('clamps to the left edge for a word at the far left, arrow still on the word', () => {
    const leftWord = { top: 400, left: 4, width: 30, height: 30 }
    const p = placePopover(leftWord, box, PHONE)
    expect(p.left).toBe(POPOVER_MARGIN)
    // The arrow points at the word's centre, expressed inside the clamped box.
    expect(p.left + p.arrowLeft).toBeCloseTo(ARROW_INSET + POPOVER_MARGIN, 5)
    expect(p.arrowLeft).toBeGreaterThanOrEqual(ARROW_INSET)
  })

  it('clamps to the right edge for a word at the far right, arrow still on the word', () => {
    const rightWord = { top: 400, left: 350, width: 28, height: 30 }
    const p = placePopover(rightWord, box, PHONE)
    expect(p.left + box.width).toBe(PHONE.width - POPOVER_MARGIN)
    expect(p.arrowLeft).toBeLessThanOrEqual(box.width - ARROW_INSET)
  })

  it('keeps the arrow within the box even for a word past the viewport edge', () => {
    for (const x of [-40, 0, 8, 190, 360, 420]) {
      const p = placePopover({ top: 400, left: x, width: 30, height: 30 }, box, PHONE)
      expect(p.arrowLeft).toBeGreaterThanOrEqual(ARROW_INSET)
      expect(p.arrowLeft).toBeLessThanOrEqual(box.width - ARROW_INSET)
    }
  })

  it('tracks the word exactly while the box is not clamped', () => {
    const word = { top: 400, left: 160, width: 40, height: 30 }
    const p = placePopover(word, box, PHONE)
    expect(p.left + p.arrowLeft).toBeCloseTo(word.left + word.width / 2, 5)
  })

  it('falls back to the left margin rather than negative when the box is wider than the viewport', () => {
    const p = placePopover(midWord, { width: 500, height: 200 }, PHONE)
    expect(p.left).toBe(POPOVER_MARGIN)
  })
})

describe('placePopover — content taller than the space', () => {
  it('reports the room available so long content can scroll inside', () => {
    // 600px of definition against ~370px of room above the word.
    const p = placePopover(midWord, { width: 340, height: 600 }, PHONE)
    expect(p.fits).toBe(true)
    expect(p.placement).toBe('above')
    expect(p.maxHeight).toBe(midWord.top - POPOVER_MARGIN - POPOVER_GAP)
    // Still pinned to the word: the clamped box's bottom is one gap above it.
    expect(p.top + p.maxHeight).toBe(midWord.top - POPOVER_GAP)
  })

  it('reports the height the box will really occupy, for the arrow to sit on', () => {
    const short = placePopover(midWord, box, PHONE)
    expect(short.height).toBe(box.height)
    expect(short.top + short.height).toBe(midWord.top - POPOVER_GAP)

    const tall = placePopover(midWord, { width: 340, height: 600 }, PHONE)
    expect(tall.height).toBe(tall.maxHeight)
    expect(tall.top + tall.height).toBe(midWord.top - POPOVER_GAP)
  })

  it('picks the roomier side when neither side fits the whole box', () => {
    const word = { top: 300, left: 170, width: 34, height: 34 }
    const p = placePopover(word, { width: 340, height: 900 }, PHONE)
    // above = 300-24 = 276, below = 780-334-24 = 422 → below wins.
    expect(p.placement).toBe('below')
    expect(p.maxHeight).toBeGreaterThan(276)
  })

  it('reports fits:false when neither side can hold a readable box', () => {
    // A short viewport with the word right in the middle: both sides are thin.
    const squat = { width: 380, height: 240 }
    const word = { top: 110, left: 170, width: 30, height: 30 }
    const p = placePopover(word, box, squat)
    expect(p.fits).toBe(false)
    expect(p.top).toBeUndefined()
  })

  it('accepts a side exactly at the minimum readable height', () => {
    const need = MIN_POPOVER_HEIGHT + POPOVER_MARGIN + POPOVER_GAP
    const word = { top: need, left: 170, width: 30, height: 30 }
    const p = placePopover(word, { width: 340, height: 999 }, { width: 380, height: need + 30 })
    expect(p.fits).toBe(true)
    expect(p.placement).toBe('above')
    expect(p.maxHeight).toBe(MIN_POPOVER_HEIGHT)
  })

  it('honours an overridden minimum height', () => {
    const squat = { width: 380, height: 240 }
    const word = { top: 110, left: 170, width: 30, height: 30 }
    expect(placePopover(word, box, squat, { minHeight: 60 }).fits).toBe(true)
    expect(placePopover(word, box, squat, { minHeight: 400 }).fits).toBe(false)
  })
})

describe('placePopover — rect shapes and options', () => {
  it('accepts a DOMRect-shaped object with bottom/right instead of width/height', () => {
    const domish = { top: 400, left: 170, bottom: 434, right: 204 }
    const p = placePopover(domish, box, PHONE)
    const plain = placePopover(midWord, box, PHONE)
    expect(p.top).toBe(plain.top)
    expect(p.left).toBe(plain.left)
    expect(p.arrowLeft).toBe(plain.arrowLeft)
  })

  it('respects custom margin and gap', () => {
    const p = placePopover(midWord, box, PHONE, { margin: 40, gap: 4 })
    expect(p.top + box.height).toBe(midWord.top - 4)
    const far = placePopover({ top: 400, left: 2, width: 30, height: 30 }, box, PHONE, { margin: 40, gap: 4 })
    expect(far.left).toBe(40)
  })
})

describe('popoverSpace', () => {
  it('measures both sides net of the margin and the gap', () => {
    const s = popoverSpace(midWord, PHONE)
    expect(s.above).toBe(400 - POPOVER_MARGIN - POPOVER_GAP)
    expect(s.below).toBe(780 - 434 - POPOVER_MARGIN - POPOVER_GAP)
  })

  it('goes negative for a word already off the top of the screen', () => {
    expect(popoverSpace({ top: -50, left: 10, width: 30, height: 30 }, PHONE).above).toBeLessThan(0)
  })
})

describe('anchorInView', () => {
  it('is true for a word on screen', () => {
    expect(anchorInView(midWord, PHONE)).toBe(true)
  })

  it('is false once the word has scrolled off the top', () => {
    expect(anchorInView({ top: -60, left: 170, width: 34, height: 34 }, PHONE)).toBe(false)
  })

  it('is false once the word has scrolled off the bottom', () => {
    expect(anchorInView({ top: 790, left: 170, width: 34, height: 34 }, PHONE)).toBe(false)
  })

  it('is still true while the word is only partly visible', () => {
    expect(anchorInView({ top: -10, left: 170, width: 34, height: 34 }, PHONE)).toBe(true)
    expect(anchorInView({ top: 770, left: 170, width: 34, height: 34 }, PHONE)).toBe(true)
  })

  it('is false for a word scrolled out sideways', () => {
    expect(anchorInView({ top: 400, left: 400, width: 30, height: 30 }, PHONE)).toBe(false)
    expect(anchorInView({ top: 400, left: -40, width: 30, height: 30 }, PHONE)).toBe(false)
  })
})
