import { describe, it, expect } from 'vitest'
import {
  SHEET_MAX_WIDTH,
  sheetSafeBottom,
  sheetOverlayStyle,
  sheetShellStyle,
  sheetHeaderStyle,
  sheetHandleStyle,
  sheetBodyStyle,
} from './sheetLayout'

describe('sheetSafeBottom', () => {
  it('reserves the home-indicator inset on top of the base padding', () => {
    expect(sheetSafeBottom(26)).toBe('calc(26px + env(safe-area-inset-bottom))')
  })

  it('falls back to the default base when given nothing usable', () => {
    expect(sheetSafeBottom()).toBe('calc(26px + env(safe-area-inset-bottom))')
    expect(sheetSafeBottom(-4)).toBe('calc(26px + env(safe-area-inset-bottom))')
  })

  it('accepts a caller-chosen base', () => {
    expect(sheetSafeBottom(0)).toBe('calc(0px + env(safe-area-inset-bottom))')
  })
})

describe('sheetOverlayStyle', () => {
  it('pins to the top edge and lets the class own the height', () => {
    const s = sheetOverlayStyle()
    expect(s.position).toBe('fixed')
    // `bottom` is deliberately absent: `.app-overlay-viewport` sets 100dvh, and
    // top+bottom+height together is over-constrained.
    expect(s.bottom).toBeUndefined()
    expect(s.top).toBe(0)
    expect(s.alignItems).toBe('flex-end')
    expect(s.zIndex).toBe(200)
  })
})

describe('sheetShellStyle', () => {
  it('is a bounded flex column that does not scroll itself', () => {
    const s = sheetShellStyle()
    expect(s.display).toBe('flex')
    expect(s.flexDirection).toBe('column')
    expect(s.maxHeight).toBe('92%')
    expect(s.maxWidth).toBe(SHEET_MAX_WIDTH + 'px')
    // The shell clips; the body is what scrolls.
    expect(s.overflow).toBe('hidden')
    expect(s.overflowY).toBeUndefined()
  })
})

describe('sheetHeaderStyle / sheetHandleStyle', () => {
  it('never shrinks, so the close button stays visible while the body scrolls', () => {
    expect(sheetHeaderStyle().flexShrink).toBe(0)
    expect(sheetHandleStyle().flexShrink).toBe(0)
  })
})

describe('sheetBodyStyle', () => {
  it('scrolls, with min-height 0 so it does not grow to fit its content', () => {
    const s = sheetBodyStyle()
    expect(s.flex).toBe(1)
    // CLAUDE.md §5 flex scroll rule — without this the overflow is clipped.
    expect(s.minHeight).toBe(0)
    expect(s.overflowY).toBe('auto')
  })

  it('contains overscroll so a swipe past the end does not move the page', () => {
    expect(sheetBodyStyle().overscrollBehavior).toBe('contain')
  })

  it('keeps the last row clear of the home indicator', () => {
    expect(sheetBodyStyle(26).padding).toBe('0 18px calc(26px + env(safe-area-inset-bottom))')
  })
})
