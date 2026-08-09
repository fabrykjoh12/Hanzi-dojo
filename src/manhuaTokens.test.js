import { describe, it, expect } from 'vitest'
import { stickyPaperBar, manhuaFontStack, manhuaAccent, accentTint, PAPER } from './manhuaTokens'

describe('stickyPaperBar', () => {
  // Reported from a real iPhone: the panel artwork was readable through the
  // reader's title, and kept scrolling visibly behind the status-bar clock.
  it('is opaque — no transparency, no backdrop-filter to depend on', () => {
    const bar = stickyPaperBar()
    expect(bar.background).toBe(PAPER.page)
    expect(String(bar.background).indexOf('transparent')).toBe(-1)
    expect(String(bar.background).indexOf('color-mix')).toBe(-1)
    // backdrop-filter does not reliably composite inside an iOS WKWebView, so
    // legibility must never rest on it.
    expect(bar.backdropFilter).toBeUndefined()
    expect(bar.WebkitBackdropFilter).toBeUndefined()
  })

  it('pins at the very top and paints the safe-area inset itself', () => {
    const bar = stickyPaperBar()
    expect(bar.position).toBe('sticky')
    // Not `top: env(safe-area-inset-top)` — that pins the bar BELOW the notch
    // and leaves the strip above it showing whatever is scrolling past.
    expect(bar.top).toBe(0)
    expect(bar.paddingTop).toBe('env(safe-area-inset-top, 0px)')
  })

  it('cancels the inset the app shell already pads, so nothing shifts down', () => {
    // App.jsx pads env(safe-area-inset-top) once on <main>. Padding the bar
    // again without this would drop it ~47px on a notched phone.
    expect(stickyPaperBar().marginTop).toBe('calc(-1 * env(safe-area-inset-top, 0px))')
  })

  it('takes a stacking order, defaulting above the panels', () => {
    expect(stickyPaperBar().zIndex).toBe(5)
    expect(stickyPaperBar(9).zIndex).toBe(9)
  })
})

describe('manhua palette helpers', () => {
  it('puts the language theme font first and keeps CJK fallbacks', () => {
    const stack = manhuaFontStack('Noto Sans SC')
    expect(stack.indexOf('Noto Sans SC')).toBe(0)
    expect(stack.indexOf('PingFang SC')).toBeGreaterThan(0)
    expect(manhuaFontStack(null).indexOf('Noto Sans SC')).toBe(1)
  })

  it('takes the accent from the language theme, never a hardcoded ternary', () => {
    expect(manhuaAccent({ accentHex: '#2563C9' })).toBe('#2563C9')
    expect(manhuaAccent(null)).toBe('#B83A24')
  })

  it('mixes a tint INTO the paper rather than using an alpha hex', () => {
    const tint = accentTint('#B83A24', 11)
    expect(tint.indexOf('color-mix(in srgb')).toBe(0)
    expect(tint.indexOf(PAPER.panel)).toBeGreaterThan(0)
  })
})
