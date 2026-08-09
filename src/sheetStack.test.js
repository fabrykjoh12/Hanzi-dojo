import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pushSheet, anySheetOpen, closeTopSheet, resetSheets } from './sheetStack'

beforeEach(() => resetSheets())

describe('sheetStack', () => {
  it('knows when nothing is open', () => {
    expect(anySheetOpen()).toBe(false)
    expect(closeTopSheet()).toBe(false)
  })

  it('closes the open sheet', () => {
    const close = vi.fn()
    pushSheet(close)
    expect(anySheetOpen()).toBe(true)
    expect(closeTopSheet()).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    expect(anySheetOpen()).toBe(false)
  })

  it('closes the innermost first when sheets overlap', () => {
    const order = []
    pushSheet(() => order.push('outer'))
    pushSheet(() => order.push('inner'))
    closeTopSheet()
    closeTopSheet()
    expect(order).toEqual(['inner', 'outer'])
  })

  it('forgets a sheet dismissed some other way', () => {
    // The backdrop tap, the X, or a navigation — the sheet is gone and Back
    // must not think there is still one to close.
    const close = vi.fn()
    const off = pushSheet(close)
    off()
    expect(anySheetOpen()).toBe(false)
    expect(closeTopSheet()).toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  it('removes the right one when an inner sheet is dismissed independently', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    pushSheet(outer)
    const offInner = pushSheet(inner)
    offInner()
    closeTopSheet()
    expect(outer).toHaveBeenCalledTimes(1)
    expect(inner).not.toHaveBeenCalled()
  })

  it('survives a close that throws rather than wedging Back', () => {
    pushSheet(() => { throw new Error('nope') })
    expect(() => closeTopSheet()).not.toThrow()
    expect(anySheetOpen()).toBe(false)
  })

  it('ignores a registration with no close function', () => {
    pushSheet(null)
    expect(anySheetOpen()).toBe(false)
  })
})
