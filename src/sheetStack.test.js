import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pushSheet, anySheetOpen, closeTopSheet, resetSheets, subscribeSheets } from './sheetStack'

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

// ── P10-A2: anything that has to get out of a sheet's way ──────────────────
//
// The feedback button is fixed at z-index 45 and the More sheet renders at 41,
// so it floated on top of a modal dialog. It now subscribes here rather than
// keeping its own idea of whether a dialog is open — one registry, so a sheet
// cannot be open for Back and closed for the button.

describe('subscribeSheets', () => {
  it('reports true while a sheet is open and false when the last one closes', () => {
    const seen = []
    const off = subscribeSheets((v) => seen.push(v))
    const release = pushSheet(() => {})
    expect(seen).toEqual([true])
    release()
    expect(seen).toEqual([true, false])
    off()
  })

  it('stays true until the LAST of several sheets closes', () => {
    const seen = []
    subscribeSheets((v) => seen.push(v))
    const a = pushSheet(() => {})
    const b = pushSheet(() => {})
    expect(seen).toEqual([true, true])
    a()
    expect(seen[seen.length - 1]).toBe(true)
    b()
    expect(seen[seen.length - 1]).toBe(false)
  })

  it('fires when Back closes the top sheet', () => {
    const seen = []
    subscribeSheets((v) => seen.push(v))
    pushSheet(() => {})
    closeTopSheet()
    expect(seen[seen.length - 1]).toBe(false)
  })

  it('stops firing once unsubscribed', () => {
    let calls = 0
    const off = subscribeSheets(() => { calls += 1 })
    pushSheet(() => {})()
    const after = calls
    off()
    pushSheet(() => {})()
    expect(calls).toBe(after)
  })

  it('ignores a non-function subscriber, and one bad listener cannot wedge a sheet', () => {
    expect(subscribeSheets(null)).toBeInstanceOf(Function)
    const off = subscribeSheets(() => { throw new Error('nope') })
    let ok = false
    const off2 = subscribeSheets(() => { ok = true })
    expect(() => pushSheet(() => {})).not.toThrow()
    expect(ok).toBe(true)
    off(); off2()
  })
})
