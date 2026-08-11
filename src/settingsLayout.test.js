import { describe, it, expect } from 'vitest'
import {
  CARD_STACK_MAX_WIDTH,
  settingsCardStacks, settingsCardLayout, controlWidthAt, segmentedLayout,
} from './settingsLayout'

// The regression is specific and measurable: at 320px the card's content column
// ran to x=375 and every row's text was cut mid-word. These assert the rule that
// makes that impossible, at the three widths the device matrix uses.

const PHONES = [320, 390, 430]

describe('a Settings card stacks on a phone and stays a row on a desktop', () => {
  it('stacks at every phone width in the device matrix', () => {
    for (const w of PHONES) {
      expect(settingsCardStacks(w), String(w)).toBe(true)
      expect(settingsCardLayout(w).stacked, String(w)).toBe(true)
    }
  })

  it('keeps the icon-left row on a tablet or desktop', () => {
    for (const w of [480, 600, 768, 1024, 1280]) {
      expect(settingsCardStacks(w), String(w)).toBe(false)
    }
  })

  it('is a width question, not the shell question', () => {
    // useIsMobile is forced true in the native shell, including on a 1024px
    // iPad where the row fits perfectly well. This rule must not follow it.
    expect(CARD_STACK_MAX_WIDTH).toBeLessThan(768)
  })
})

describe('the control has the room the old layout claimed it had', () => {
  it('gives a stacked card its full inner width', () => {
    // 320 − 32 gutters − 36 card padding = 252, against the 180 the row layout
    // left and the ~274 the segmented control demanded.
    expect(controlWidthAt(320)).toBe(252)
    expect(controlWidthAt(390)).toBe(322)
    expect(controlWidthAt(430)).toBe(362)
  })

  it('still subtracts the icon column when the card is a row', () => {
    expect(controlWidthAt(600)).toBe(600 - 32 - 48 - 60)
  })

  it('never returns a negative width, however absurd the viewport', () => {
    expect(controlWidthAt(80)).toBeGreaterThanOrEqual(0)
    expect(controlWidthAt(0)).toBe(0)
    expect(controlWidthAt(-100)).toBe(0)
    expect(controlWidthAt(undefined)).toBe(0)
  })
})

describe('a segmented control divides the space it has', () => {
  it('goes full width, as equal columns, on every phone', () => {
    for (const w of PHONES) {
      const s = segmentedLayout({ width: w, count: 2 })
      expect(s.fullWidth, String(w)).toBe(true)
      expect(s.columns).toBe(2)
    }
  })

  it('keeps a 44px minimum target in both layouts', () => {
    expect(segmentedLayout({ width: 320, count: 3 }).minHeight).toBe(44)
    expect(segmentedLayout({ width: 1024, count: 3 }).minHeight).toBe(44)
  })

  it('fits two choices comfortably at 320 — the two-column case', () => {
    // 'Light' / 'Dark', 'Flip' / 'Typed'
    const s = segmentedLayout({ width: 320, count: 2, longestLabel: 5 })
    expect(s.fits).toBe(true)
    expect(s.showIcons).toBe(true)
    expect(s.perColumn).toBeGreaterThan(110)
  })

  it('fits three choices at 320, and drops the icons before it squeezes a label', () => {
    // The audio-speed row: '1×', '0.75×', '0.5×'. Its three icons were three
    // copies of the same glyph and carried no information anyway.
    const s = segmentedLayout({ width: 320, count: 3, longestLabel: 5 })
    expect(s.fits).toBe(true)
    expect(s.showIcons).toBe(false)
    expect(s.perColumn).toBeGreaterThan(40 + 20)
  })

  it('keeps the icons on the wider phones', () => {
    expect(segmentedLayout({ width: 390, count: 3, longestLabel: 5 }).showIcons).toBe(true)
    expect(segmentedLayout({ width: 430, count: 3, longestLabel: 5 }).showIcons).toBe(true)
  })

  it('reports a label that would not fit rather than shrinking it', () => {
    // Nothing in Settings is this long today; the flag exists so that adding a
    // fourth option or a longer label fails a test instead of clipping a row.
    const s = segmentedLayout({ width: 320, count: 4, longestLabel: 12 })
    expect(s.fits).toBe(false)
  })
})
