import { useId } from 'react'

// The Misty Atmosphere artwork — layered mist, simplified Chinese mountain
// silhouettes, a small muted-cinnabar moon. Drawn as inline SVG so the art is
// a real production asset: no baked-in text, no raster export, no runtime
// dependency, and it scales to any card without shipping bytes.
//
// It is pure background — always aria-hidden, always behind the card's UI
// layer. The palette is the artwork's own (Deep Ink blue-grays with one warm
// accent), fixed across themes exactly like story cover art; the UI text that
// sits ON it is fixed light for the same reason. Cards keep their borders and
// shadows in semantic tokens.
//
// Two moods: 'focus' is the lighter, mist-forward scene behind the current
// session card; 'reward' is the deeper night version the Story Reward card
// falls back to when a story has no cover art.

const SCENES = {
  focus: {
    sky: ['#9AA3B2', '#6E7887', '#3F4756'],
    far: '#5A6375',
    mid: '#414A5A',
    near: '#2B323F',
    scrim: 'rgba(21, 25, 33, 0.62)',
  },
  reward: {
    sky: ['#4E5668', '#353D4D', '#232936'],
    far: '#3E4656',
    mid: '#2F3745',
    near: '#1E242F',
    scrim: 'rgba(14, 17, 23, 0.66)',
  },
}

const MOON = '#A34832'

export default function MistyArt({ variant = 'focus' }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const scene = SCENES[variant] || SCENES.focus
  const skyId = 'misty-sky-' + uid
  const mistId = 'misty-mist-' + uid
  const scrimId = 'misty-scrim-' + uid
  const moonId = 'misty-moon-' + uid

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 280"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={scene.sky[0]} />
          <stop offset="52%" stopColor={scene.sky[1]} />
          <stop offset="100%" stopColor={scene.sky[2]} />
        </linearGradient>
        <linearGradient id={mistId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E9ECF1" stopOpacity="0" />
          <stop offset="55%" stopColor="#E9ECF1" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#E9ECF1" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={scrimId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={scene.scrim} stopOpacity="0" />
          <stop offset="100%" stopColor={scene.scrim} />
        </linearGradient>
        {/* The crescent is a hole, not an overlay: an offset black disc in the
            mask, so the sky shows through whatever the gradient is doing. */}
        <mask id={moonId} maskUnits="userSpaceOnUse" x="270" y="30" width="50" height="50">
          <circle cx="294" cy="54" r="15" fill="#FFFFFF" />
          <circle cx="286" cy="47" r="14" fill="#000000" />
        </mask>
      </defs>

      <rect width="400" height="280" fill={'url(#' + skyId + ')'} />

      {/* The moon — kept inside x≈300 so the 'slice' crop on a tall card
          never pushes it off the edge. */}
      <circle cx="294" cy="54" r="15" fill={MOON} opacity="0.9" mask={'url(#' + moonId + ')'} />

      {/* Three ridges, far to near, with mist pooling between them. */}
      <path
        d="M0 158 Q 50 100 105 132 Q 150 156 200 122 Q 250 90 300 128 Q 350 158 400 118 L 400 280 L 0 280 Z"
        fill={scene.far} opacity="0.9"
      />
      <rect x="0" y="118" width="400" height="70" fill={'url(#' + mistId + ')'} />
      <path
        d="M0 208 Q 70 150 140 186 Q 200 214 262 172 Q 322 138 400 192 L 400 280 L 0 280 Z"
        fill={scene.mid} opacity="0.96"
      />
      <rect x="0" y="168" width="400" height="72" fill={'url(#' + mistId + ')'} opacity="0.85" />
      <path
        d="M0 252 Q 90 204 170 236 Q 250 264 330 226 Q 368 210 400 228 L 400 280 L 0 280 Z"
        fill={scene.near}
      />

      {/* Footer scrim so metadata and actions stay legible over the art. */}
      <rect x="0" y="150" width="400" height="130" fill={'url(#' + scrimId + ')'} />
    </svg>
  )
}
