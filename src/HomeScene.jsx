// The Home horizon band — the one piece of scenery in the app.
//
// A single scene language: three layered rounded hills and one disc (sun by
// day, moon by night), drawn in code so it weighs nothing, themes through the
// --scene-* tokens (index.css, keyed by [data-scene] and dark mode), and
// animates only a slow breath on the disc's halo. It lives behind the header
// and the hero's upper edge — the disc rises from behind the red panel, so the
// card itself becomes the horizon — and fades into the page ground well before
// the content panels begin. Purely decorative: aria-hidden, no pointer events,
// zIndex -1 so every in-flow surface and line of text paints above it.

const BAND_HEIGHT = 300

export default function HomeScene() {
  return (
    <div
      aria-hidden="true"
      data-home-scene=""
      style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: BAND_HEIGHT + 'px', zIndex: -1,
        pointerEvents: 'none', overflow: 'hidden',
        // Soft side fade: the band never meets the viewport (or, on desktop,
        // the page column) with a hard edge, so it needs no full-bleed hacks
        // and can never cause horizontal overflow.
        WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 7%, #000 93%, transparent 100%)',
        maskImage: 'linear-gradient(90deg, transparent 0%, #000 7%, #000 93%, transparent 100%)',
      }}
    >
      <svg
        viewBox="0 0 390 300"
        preserveAspectRatio="xMidYMin slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      >
        {/* Sky */}
        <rect x="0" y="0" width="390" height="300" fill="var(--scene-sky)" />
        {/* The disc, low over the hills on the right. The halo is the band's
            one motion — a slow breath, flattened by reduced motion. */}
        <circle className="hd-scene-halo" cx="296" cy="88" r="46" fill="var(--scene-disc)" opacity="0.26" />
        <circle cx="296" cy="88" r="26" fill="var(--scene-disc)" />
        {/* Three hills, far to near — layered crests cross the sky window
            between the header and the hero, then slip behind the red panel.
            Long shallow arcs, nothing detailed. */}
        <path d="M -20 96 Q 90 58 200 84 Q 300 106 410 78 L 410 300 L -20 300 Z" fill="var(--scene-hill-3)" />
        <path d="M -20 120 Q 70 82 175 102 Q 280 120 410 96 L 410 300 L -20 300 Z" fill="var(--scene-hill-2)" />
        <path d="M -20 146 Q 110 102 240 126 Q 330 142 410 120 L 410 300 L -20 300 Z" fill="var(--scene-hill-1)" />
      </svg>
      {/* The calm fade into the ordinary page ground. */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%',
        background: 'linear-gradient(180deg, transparent 0%, var(--bg) 82%)',
      }} />
    </div>
  )
}
