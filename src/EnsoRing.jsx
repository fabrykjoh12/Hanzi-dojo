import { useId } from 'react'
import { brushRingPath, clamp01 } from './enso'

// A real ensō is painted in one breath and left open. The stroke starts just
// past 12 o'clock and stops just short of it, so the gap lands at the top —
// where the brush lifted.
const START_DEG = 26
const SWEEP_DEG = 328

// The ensō progress ring. Draws the brand's brush circle twice: once as a faint
// "unpainted" track, once in full ink, with the inked copy revealed up to
// `pct` by a masked arc that sweeps in on mount.
//
// The reveal rides a CSS keyframe (not React state) so the reduced-motion
// catch-all in index.css collapses it to the final frame for free.
export default function EnsoRing({ size = 148, pct = 0, color = '#B83A24', children, thickness = 12 }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const maskId = `enso-mask-${uid}`
  const fraction = clamp01(pct)

  // Mask radius sits at the middle of the band; its stroke is wide enough to
  // cover the tapered edges either side.
  const R = 38
  const CIRCUMFERENCE = 2 * Math.PI * R
  const drawn = CIRCUMFERENCE * (SWEEP_DEG / 360) * fraction
  const d = brushRingPath({ r: R, width: thickness, startDeg: START_DEG, sweepDeg: SWEEP_DEG })

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect x="-10" y="-10" width="120" height="120" fill="#000" />
            <circle
              // Re-keying on the target replays the draw when the count moves,
              // so the ring visibly closes as the queue clears.
              key={Math.round(fraction * 1000)}
              cx="50" cy="50" r={R}
              fill="none" stroke="#fff" strokeWidth={thickness * 2.6} strokeLinecap="butt"
              transform={`rotate(${START_DEG - 90} 50 50)`}
              className="hd-enso-draw"
              style={{
                '--hd-dash-from': `${CIRCUMFERENCE}px`,
                '--hd-dash-to': `${CIRCUMFERENCE - drawn}px`,
                strokeDasharray: CIRCUMFERENCE,
              }}
            />
          </mask>
        </defs>

        {/* Unpainted track — the stroke the learner hasn't laid down yet. */}
        <path d={d} fill={color} opacity="0.17" />
        {/* Inked stroke, revealed to `pct`. */}
        <path d={d} fill={color} mask={`url(#${maskId})`} />
      </svg>

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '2px',
        textAlign: 'center', pointerEvents: 'none',
      }}>
        {children}
      </div>
    </div>
  )
}
