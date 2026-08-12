import { useEffect, useState } from 'react'
import bgChinese from './assets/bg-chinese.webp'
import bgJapanese from './assets/bg-japanese.webp'
import bgRussian from './assets/bg-russian.webp'
import { languageTheme } from './languageTheme'
import { NAV_TRAY_BOTTOM } from './navMetrics'

// object-fit / object-position live in index.css (.hd-bg) rather than here,
// because the framing has to change with viewport width and a media query does
// that without a resize listener re-rendering a full-screen image.
const baseStyle = {
  position: 'fixed', top: 0, left: 0,
  width: '100vw', height: '100vh',
  zIndex: 0,
  pointerEvents: 'none',
  transition: 'opacity 500ms ease',
}

// Background image per language, keyed by the theme's backgroundKey so adding a
// language is just a new asset + config entry.
const BACKGROUNDS = {
  chinese: bgChinese,
  japanese: bgJapanese,
  russian: bgRussian,
}

// The strip of page ground between the floating navigation tray and the bottom
// edge of the screen — P14-4's "bottom support region".
//
// It has to exist, and it has to be the PAGE. The tray floats now, so a screen
// that scrolls sends its content through the strip below it: measured on Practice
// at 430x932, a row of links showed under the tray as a 7px sliver of moving text,
// which is exactly the "clipped background / forgotten navbar" the brief rules out.
// The reservation on `main` stops content RESTING there; nothing stops it passing
// through mid-scroll.
//
// So the strip is drawn above the content and painted with the page's own ground —
// and that means the background IMAGE too, not just `--bg`. A plain `--bg` fill
// would cut the image off with a static seam at a fixed height: in light mode the
// wash is at 0.4 opacity, which is well past the point where a hard edge in it
// reads as a rendering fault. (In dark it is 0.06 and nobody would ever see it,
// which is precisely the sort of thing that ships broken.)
//
// The trick is that the copy is anchored to the container's BOTTOM at a full
// viewport height, so it lands on exactly the same pixels as the fixed copy behind
// the page — and `overflow: hidden` on the container crops it to the strip. Same
// image element, same class, same object-fit; no clip-path, no
// background-attachment, nothing a 2019 WebView has to be clever about.
function BottomSupport({ src, opacity }) {
  return (
    <div
      aria-hidden="true"
      data-nav-support=""
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        height: NAV_TRAY_BOTTOM,
        // Under the tray (30), over every screen (1).
        zIndex: 29,
        overflow: 'hidden',
        background: 'var(--bg)',
        pointerEvents: 'none',
      }}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="hd-bg"
        style={{
          position: 'absolute', left: 0, bottom: 0,
          width: '100vw', height: '100vh',
          opacity,
          transition: 'opacity 500ms ease',
        }}
      />
    </div>
  )
}

// Fixed full-page background image, faint and behind everything (z-index 0).
// Crossfades between language themes when `language` changes.
//
// `bottomSupport` is on whenever the floating tray is (App.jsx knows; this does
// not). Off for every fullscreen flow, so a flashcard or the immersive reader is
// never covered by a strip reserving a tray that is not there.
export default function Background({ language, bottomSupport }) {
  const key = languageTheme(language).backgroundKey
  const src = BACKGROUNDS[key] || bgChinese
  const [current, setCurrent] = useState(src)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (src === current) return
    // Intentional: this drives a timed crossfade. When the language background
    // changes, we fade the current image OUT now, then swap + fade the new one
    // IN after 500ms. The fade-out must be triggered here, on the prop change —
    // it's animation state, not derivable during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(false)
    const timer = setTimeout(() => {
      setCurrent(src)
      setVisible(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [src, current])

  const opacity = visible ? 'var(--bg-image-opacity)' : 0
  return (
    <>
      <img
        src={current}
        alt=""
        aria-hidden="true"
        className="hd-bg"
        style={{ ...baseStyle, opacity }}
      />
      {bottomSupport && <BottomSupport src={current} opacity={opacity} />}
    </>
  )
}
