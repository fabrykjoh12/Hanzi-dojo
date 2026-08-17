import { useState, useEffect } from 'react'

// Live viewport width, for layout decisions that need the number rather than
// the boolean breakpoint (useIsMobile). Same guarded pattern: SSR-safe
// default, one resize listener, cleaned up on unmount.
export function useViewportWidth() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0
  )

  useEffect(() => {
    function onResize() { setWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}
