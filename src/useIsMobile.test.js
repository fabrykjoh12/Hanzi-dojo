import { describe, it, expect } from 'vitest'
import { shellIsMobile, MOBILE_BREAKPOINT } from './useIsMobile'

describe('shellIsMobile', () => {
  it('uses the app shell below the breakpoint on the web', () => {
    expect(shellIsMobile({ width: 390, native: false })).toBe(true)
    expect(shellIsMobile({ width: MOBILE_BREAKPOINT - 1, native: false })).toBe(true)
  })

  it('uses the website shell at and above the breakpoint on the web', () => {
    expect(shellIsMobile({ width: MOBILE_BREAKPOINT, native: false })).toBe(false)
    expect(shellIsMobile({ width: 1440, native: false })).toBe(false)
  })

  it('always uses the app shell inside the native shell, whatever the viewport', () => {
    // An iPad is 768pt across, which is exactly the width that used to hand the
    // store app the desktop sidebar.
    expect(shellIsMobile({ width: 768, native: true })).toBe(true)
    expect(shellIsMobile({ width: 1024, native: true })).toBe(true)
    expect(shellIsMobile({ width: 1366, native: true })).toBe(true)
  })

  it('keeps the app shell through a landscape rotation in the app', () => {
    // 844x390: an iPhone 14 on its side. On the web this is a laptop-shaped
    // viewport and the sidebar is right; in the app it is still a phone.
    expect(shellIsMobile({ width: 844, native: true })).toBe(true)
    expect(shellIsMobile({ width: 844, native: false })).toBe(false)
  })

  it('does not change the web breakpoint', () => {
    expect(MOBILE_BREAKPOINT).toBe(768)
  })

  it('treats missing input as the website shell rather than throwing', () => {
    expect(shellIsMobile()).toBe(false)
    expect(shellIsMobile({})).toBe(false)
  })
})
