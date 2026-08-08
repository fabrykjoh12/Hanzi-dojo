import { useEffect, useState } from 'react'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import {
  SPLASH_BG, splashPlan, splashFadeAtMs, splashDoneAtMs, prefersReducedMotion,
} from './splashIntro'
import { isNativeApp } from './nativeShell'

// The launch animation: the ensō draws itself, the wordmark arrives, the whole
// thing gets out of the way. Timing and the decision to play live in
// splashIntro.js.
//
// The ensō is one SVG arc — the same path as the app icon — so "animate the
// logo" is literally drawing that stroke: stroke-dasharray hides the line,
// stroke-dashoffset walks it back in. `pathLength="1"` re-expresses the path in
// 0..1 units, so the numbers here stay right no matter what the arc's real
// length is.
//
// It renders over the platform launch image in the same colour, which is why
// it reads as one continuous animation rather than a splash followed by an
// app that draws a circle.

const MARK_PATH = 'M 305 88 A 176 176 0 1 1 207 88'
const INK = '#C43A22'

export default function SplashIntro() {
  const [plan] = useState(() => splashPlan({
    native: isNativeApp(),
    reducedMotion: prefersReducedMotion(),
  }))
  const [phase, setPhase] = useState('in')   // 'in' | 'out' | 'gone'

  useEffect(() => {
    // No timers when it isn't playing; the render below already bails out.
    if (!plan.show) return undefined
    const toFade = setTimeout(() => setPhase('out'), splashFadeAtMs(plan))
    const toGone = setTimeout(() => setPhase('gone'), splashDoneAtMs(plan))
    return () => { clearTimeout(toFade); clearTimeout(toGone) }
  }, [plan])

  if (!plan.show || phase === 'gone') return null

  const drawing = plan.drawMs > 0

  return (
    <div
      // Decorative and transient: a screen reader should be reading the app
      // underneath, not announcing a logo that is already leaving.
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '20px',
        background: 'var(--splash-bg)',
        opacity: phase === 'out' ? 0 : 1,
        transition: 'opacity ' + plan.fadeMs + 'ms ease',
        pointerEvents: phase === 'out' ? 'none' : 'auto',
      }}
    >
      <style>{`
        :root { --splash-bg: ${SPLASH_BG.light}; }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) { --splash-bg: ${SPLASH_BG.dark}; }
        }
        :root[data-theme="dark"] { --splash-bg: ${SPLASH_BG.dark}; }

        @keyframes hd-splash-draw {
          from { stroke-dashoffset: 1; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes hd-splash-rise {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <svg
        viewBox="0 0 512 512"
        style={{ width: '116px', height: '116px', overflow: 'visible' }}
      >
        <path
          d={MARK_PATH}
          pathLength="1"
          fill="none"
          stroke={INK}
          strokeWidth="62"
          strokeLinecap="round"
          style={drawing ? {
            strokeDasharray: 1,
            strokeDashoffset: 1,
            // Starts fast and settles, the way a brush stroke does — a linear
            // sweep reads as a progress bar bent into a circle.
            animation: 'hd-splash-draw ' + plan.drawMs + 'ms cubic-bezier(.32,.72,.24,1) forwards',
          } : undefined}
        />
      </svg>

      <div style={{
        ...heroWordmarkStyle('26px'),
        ...(drawing ? {
          opacity: 0,
          // Arrives as the circle closes, not after it — two beats in a
          // sub-second launch is one too many.
          animation: 'hd-splash-rise 320ms ease forwards',
          animationDelay: Math.round(plan.drawMs * 0.55) + 'ms',
        } : {}),
      }}>
        {BRAND_NAME}
      </div>
    </div>
  )
}
