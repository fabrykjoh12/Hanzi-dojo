import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The two native shells, held to one policy.
//
// TestFlight found a long grey bar riding the right edge of the screen on
// Practice, on Stories, on everything — in exactly the same place each time,
// because it belonged to none of them. The app shell scrolls the DOCUMENT
// (App.jsx's <main> has no scroller of its own), so the thing drawing it was
// the native web view's own scroll indicator: a UIScrollView indicator inside
// WKWebView on iOS, and the WebView's fading scrollbar on Android. No CSS could
// reach the first one, which is why the fix lives in the shells.
//
// These specs cannot run a phone. What they can do is stop the fix being
// deleted, and stop it growing into something that breaks scrolling — which is
// the realistic failure mode, since the next person to touch these files will
// not have the device in front of them. Physical-device verification is still
// required; docs/MOBILE-DEVICE-QA.md is where it is recorded.

const ios = readFileSync(new URL('./ios/App/App/SceneDelegate.swift', import.meta.url), 'utf8')
const android = readFileSync(
  new URL('./android/app/src/main/java/com/hanzidojo/app/MainActivity.java', import.meta.url), 'utf8'
)
const css = readFileSync(new URL('./src/index.css', import.meta.url), 'utf8')
const stories = readFileSync(new URL('./src/Stories.jsx', import.meta.url), 'utf8')

describe('the iOS shell', () => {
  it('hides the web view\'s own scroll indicators', () => {
    expect(ios).toContain('showsVerticalScrollIndicator = false')
    expect(ios).toContain('showsHorizontalScrollIndicator = false')
  })

  it('reaches them through the bridge controller rather than hunting the view tree', () => {
    expect(ios).toMatch(/webView\?\.scrollView/)
  })

  it('leaves scrolling itself completely alone', () => {
    // Hiding a hint is not the same as turning the feature off. Each of these
    // would change how the app actually scrolls, and none of them is wanted.
    for (const forbidden of ['isScrollEnabled = false', 'bounces = false', 'decelerationRate', 'isPagingEnabled']) {
      expect(ios).not.toContain(forbidden)
    }
  })
})

describe('the Android shell', () => {
  it('applies the same policy to the WebView', () => {
    expect(android).toContain('setVerticalScrollBarEnabled(false)')
    expect(android).toContain('setHorizontalScrollBarEnabled(false)')
  })

  it('still calls through to Capacitor first', () => {
    // Skipping super.onCreate() would leave the bridge unbuilt — no web view to
    // configure, and no app.
    expect(android.indexOf('super.onCreate')).toBeLessThan(android.indexOf('setVerticalScrollBarEnabled'))
  })

  it('leaves scrolling itself completely alone', () => {
    for (const forbidden of ['setOnTouchListener', 'setScrollContainer(false)', 'setOverScrollMode(2)']) {
      expect(android).not.toContain(forbidden)
    }
  })
})

describe('the web', () => {
  it('keeps its scrollbars — a browser is allowed to look like one', () => {
    // The fix is native-only on purpose. A `::-webkit-scrollbar` rule here would
    // hide the scrollbar for every visitor on the site, where it is correct
    // behaviour and the only indication of how long a page is.
    expect(css).not.toContain('::-webkit-scrollbar')
    expect(css).not.toMatch(/scrollbar-width\s*:\s*none/)
  })

  it('leaves the horizontal story rails as they were', () => {
    // The right-edge indicator was never the poster rails' doing — they scroll
    // sideways, and this bar is vertical and full-height. Their own thin
    // scrollbar is a separate question, still open.
    expect(stories).toContain("scrollbarWidth: 'thin'")
  })
})
