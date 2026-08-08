import { useEffect, useState } from 'react'
import logo from './assets/Hanzi-logo.png'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import {
  SPLASH_BG, splashPlan, splashFadeAtMs, splashDoneAtMs, prefersReducedMotion,
} from './splashIntro'
import { isNativeApp } from './nativeShell'

// The launch animation: the real logo — the brush-textured ensō PNG — is
// revealed along its own circle, as if the stroke were being drawn. Timing and
// the decision to play live in splashIntro.js.
//
// How: the PNG sits inside an SVG under a mask. The mask is a white arc that
// follows the ring's centreline (measured off the image: centre 64.5,61,
// radius ~31 in its 128px frame) with a stroke wide enough to cover the brush
// texture and splatter. Animating that arc's dashoffset sweeps the reveal
// around the circle — so what appears is the genuine ink texture, not a
// clean vector imitation of it. The sweep starts at the top and runs
// clockwise, finishing at the ensō's opening, the way the stroke would have
// been made.
//
// It renders over the platform launch image in the same colour, which is why
// it reads as one continuous animation rather than a splash followed by an
// app that draws a circle.

// Full circle from the top (≈100°), clockwise, as two half-arcs — a single
// SVG arc command cannot span 360°.
const REVEAL_ARC = 'M 58.95 29.49 A 32 32 0 0 1 70.05 92.51 A 32 32 0 0 1 58.95 29.49'

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
        alignItems: 'center', justifyContent: 'center', gap: '18px',
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
        @keyframes hd-splash-settle {
          from { transform: scale(0.96); }
          to   { transform: scale(1); }
        }
        @keyframes hd-splash-rise {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <svg
        viewBox="0 0 128 128"
        style={{
          width: '128px', height: '128px', overflow: 'visible',
          ...(drawing ? {
            animation: 'hd-splash-settle ' + plan.drawMs + 'ms cubic-bezier(.32,.72,.24,1) forwards',
          } : {}),
        }}
      >
        <defs>
          <mask id="hd-splash-reveal">
            {drawing ? (
              <path
                d={REVEAL_ARC}
                pathLength="1"
                fill="none"
                stroke="#fff"
                // Wide enough to cover the ring plus its splatter; the mask
                // is invisible, only the texture it uncovers shows.
                strokeWidth="34"
                strokeLinecap="round"
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: 1,
                  // Starts fast and settles, the way a brush stroke does — a
                  // linear sweep reads as a progress bar bent into a circle.
                  animation: 'hd-splash-draw ' + plan.drawMs + 'ms cubic-bezier(.32,.72,.24,1) forwards',
                }}
              />
            ) : (
              <rect x="0" y="0" width="128" height="128" fill="#fff" />
            )}
          </mask>
        </defs>
        <image
          href={logo}
          x="0" y="0" width="128" height="128"
          mask="url(#hd-splash-reveal)"
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
