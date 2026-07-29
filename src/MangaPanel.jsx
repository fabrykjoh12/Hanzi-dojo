import { useState } from 'react'
import { PAPER, PANEL_RADIUS } from './mangaTokens'

// One cinematic panel: the art, with the dialogue drawn on top of it by the
// caller.
//
// Two children slots, because a bubble is not always on the picture. `children`
// is overlaid inside the art box (absolutely positioned, clipped to the panel's
// rounded corners); `below` is drawn in the gutter under it, which is where
// mangaLayout.bubbleLayout sends a bubble whose text would otherwise cover the
// whole drawing. The panel owns the frame either way, so a bubble never floats
// loose between two panels.
//
// The art box holds its aspect ratio from the FIRST paint, before the image has
// loaded — an episode is a column of large images, and without a reserved box
// every one of them would shove the page down as it arrives. That is also why
// `ratio` is required rather than inferred from the file.

// A missing panel image must never be the browser's broken-image glyph. This is
// the same principle as StoryCover's fallback: an absent asset should look like
// a quiet unprinted plate, not like a bug.
function emptyPlate(accentHex) {
  return 'radial-gradient(120% 90% at 50% 15%, '
    + 'color-mix(in srgb, ' + accentHex + ' 6%, ' + PAPER.panel + ') 0%, '
    + PAPER.panel + ' 60%, '
    + 'color-mix(in srgb, ' + PAPER.ink + ' 6%, ' + PAPER.panel + ') 100%)'
}

export default function MangaPanel({
  src, alt = '', ratio, accent = false, accentHex,
  priority = false, inView = true, reduceMotion = false,
  panelRef, panelIndex, children, below, style = {},
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  // A new episode swapped into the same slot must get a fresh chance to load.
  // Adjusted during render — React's own pattern for "state derived from props"
  // — rather than in an effect, so the panel never paints one frame showing the
  // previous episode's load/error state.
  const [prevSrc, setPrevSrc] = useState(src)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setFailed(false)
    setLoaded(false)
  }
  const showImg = Boolean(src) && !failed

  return (
    <figure
      ref={panelRef}
      // Read back by the reader's single IntersectionObserver to decide which
      // panel the header is counting — an attribute rather than a closure so one
      // observer can serve every panel.
      data-panel-index={panelIndex}
      className={'hd-manga-panel' + (inView || reduceMotion ? ' is-in' : '')}
      style={{ margin: 0, ...style }}
    >
      <div style={{
        position: 'relative',
        aspectRatio: String(ratio),
        width: '100%',
        borderRadius: PANEL_RADIUS + 'px',
        overflow: 'hidden',
        background: emptyPlate(accentHex),
        // 1px hairline normally; the accent treatment is a slightly heavier
        // cinnabar edge, reserved for a panel the episode wants to land on.
        border: accent
          ? '1.5px solid color-mix(in srgb, ' + accentHex + ' 55%, ' + PAPER.hairline + ')'
          : '1px solid ' + PAPER.hairline,
        boxShadow: PAPER.shadow,
      }}>
        {showImg && (
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
              // The art fades up over the reserved plate rather than snapping
              // in. Reduced motion gets it instantly.
              opacity: loaded || reduceMotion ? 1 : 0,
              transition: reduceMotion ? 'none' : 'opacity 420ms ease',
            }}
          />
        )}
        {children}
      </div>
      {below}
    </figure>
  )
}
