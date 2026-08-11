import { useState, useEffect } from 'react'

// How wide the visible viewport is, right now.
//
// The sibling of `useViewportHeight`, and it exists for the same reason: a
// component whose layout has to change below a width needs to know the width,
// and `useIsMobile` cannot answer it — that flag is about which SHELL to render
// (bottom bar vs sidebar) and is forced true on every native tablet, so a
// 1024px-wide iPad reads as "mobile" there.
//
// Rotating the device and a collapsing address bar both change this mid-session,
// so both events are listened for.
export function useViewportWidth() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 390
  )
  useEffect(() => {
    function onResize() { setWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  return width
}
