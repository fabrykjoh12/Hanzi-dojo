import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { placePopover, anchorInView } from './anchoredPopover'

// Measure-and-apply half of the anchored word lookup. All the geometry lives in
// anchoredPopover.js (pure, tested); this hook only reads the DOM, feeds it in,
// and keeps the answer fresh while the page moves under it.
//
//   anchor      the tapped element, or a viewport-relative rect, or null
//   onDismiss   called when the anchored word scrolls out of sight — a popover
//               pointing at nothing is worse than no popover
//
// Returns { ref, mode, place }:
//   ref     goes on the popover box — but ONLY while mode isn't 'sheet'. The
//           bottom sheet is a different shape entirely, and measuring it here
//           would let the two layouts argue with each other frame by frame.
//   mode    'sheet'     — no anchor, or nothing readable fits either side of the
//                         word: render the bottom sheet exactly as before
//           'measuring' — anchored, one hidden layout pass away from a position
//           'anchored'  — `place` is ready to apply
//   place   { placement, top, left, height, maxHeight, arrowLeft } | null
export function useAnchoredPopover(anchor, onDismiss) {
  const ref = useRef(null)
  // 'measuring' until the first layout pass; the box renders hidden until then,
  // so it is never painted in the wrong place.
  const [state, setState] = useState({ mode: 'measuring', place: null })
  // The dismiss callback is read through a ref so a caller passing a fresh arrow
  // function each render doesn't re-subscribe the scroll listener. Refreshed in
  // a layout effect declared before the measuring one, so the measure below
  // always calls the current render's callback.
  const dismissRef = useRef(onDismiss)
  useLayoutEffect(() => { dismissRef.current = onDismiss })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el || !anchor) return
    const rect = typeof anchor.getBoundingClientRect === 'function'
      ? anchor.getBoundingClientRect()
      : anchor
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    if (!anchorInView(rect, viewport)) {
      if (dismissRef.current) dismissRef.current()
      return
    }
    // The box's NATURAL height, not its clipped one: once a maxHeight has been
    // applied, offsetHeight is that cap while scrollHeight is the real content.
    // Taking the larger of the two stops re-measuring from ratcheting the
    // popover down toward nothing.
    const size = { width: el.offsetWidth, height: Math.max(el.offsetHeight, el.scrollHeight) }
    const next = placePopover(rect, size, viewport)
    setState(prev => (samePlacement(prev, next)
      ? prev
      : (next.fits ? { mode: 'anchored', place: next } : { mode: 'sheet', place: null })))
  }, [anchor])

  // A new word starts a fresh measurement rather than inheriting the last word's
  // placement (or its "didn't fit" verdict). Declared before the measuring pass
  // below so both settle in the same commit.
  useLayoutEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a new anchor is the point */
    setState({ mode: 'measuring', place: null })
  }, [anchor])

  // Every render, not only when the anchor changes: the sheet's body grows when
  // a dictionary lookup lands, and the box has to be re-placed around the taller
  // content or it drifts off its word.
  useLayoutEffect(() => {
    if (anchor) measure()
  })

  useEffect(() => {
    if (!anchor) return undefined
    const onScroll = () => measure()
    const onResize = () => {
      // A window that just got taller may have room where it had none, so a
      // fallback-to-sheet verdict is worth re-taking. Anything already anchored
      // is simply re-placed, with no hidden frame in between.
      setState(prev => (prev.mode === 'sheet' ? { mode: 'measuring', place: null } : prev))
      measure()
    }
    // Capture phase so a scroll inside any container — the classic reader's long
    // column, a paced beat's stage — is seen, not just the window's own.
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [anchor, measure])

  if (!anchor) return { ref, mode: 'sheet', place: null }
  return { ref, mode: state.mode, place: state.place }
}

function samePlacement(prev, next) {
  if (!next.fits) return prev.mode === 'sheet'
  const p = prev.place
  if (!p) return false
  return p.top === next.top && p.left === next.left && p.height === next.height
    && p.maxHeight === next.maxHeight && p.arrowLeft === next.arrowLeft
    && p.placement === next.placement
}
