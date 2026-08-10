import { useState, useEffect } from 'react'

// How tall the visible viewport is, right now.
//
// The card views are height-locked to the screen (studyLayout.js), so they have
// to know what that screen currently measures — rotating the device and the
// address bar collapsing both change it, and both are ordinary things a learner
// does mid-session.
//
// Study.jsx has carried its own copy of this since before there was anywhere
// else that needed it; the tutorial needs the same fact, so it lives here now.
// Study can adopt it whenever it is next touched — this is deliberately not
// that change.
export function useViewportHeight() {
  const [height, setHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800
  )
  useEffect(() => {
    function onResize() { setHeight(window.innerHeight) }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  return height
}
