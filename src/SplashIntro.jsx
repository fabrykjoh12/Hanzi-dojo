import { useEffect, useState } from 'react'
import logo from './assets/Hanzi-logo.png'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import {
  SPLASH_BG, splashPlan, splashFadeAtMs, prefersReducedMotion,
  splashShouldExit, SPLASH_MAX_WAIT_MS,
} from './splashIntro'
import { isNativeApp } from './nativeShell'
import { onAppReady } from './appReady'
import { hideNativeSplash } from './nativeSplash'

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

  // Hand the platform launch image over to this overlay. It is held open by
  // `launchAutoHide: false`, so it covers the WebView's boot — the white gap
  // that used to sit between the OS splash and React's first paint. Two frames
  // of headroom so this overlay is definitely on screen first: the two images
  // are identical, so the seam is invisible.
  useEffect(() => {
    if (!isNativeApp()) return undefined
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => { hideNativeSplash() })
    })
    // Belt and braces: if rAF never runs (a backgrounded launch throttles it),
    // a held splash would be a permanently black app.
    const fallback = setTimeout(() => { hideNativeSplash() }, 1200)
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
      clearTimeout(fallback)
    }
  }, [])

  // The exit. Not a stopwatch any more: the overlay leaves when the stroke has
  // finished AND the app has something to show, whichever is later — capped, so
  // a dead network cannot trap anyone here. See splashShouldExit.
  useEffect(() => {
    if (!plan.show) return undefined
    // Stamped here rather than during render: the clock is impure, and this
    // effect runs once (the plan is frozen by a useState initialiser), so
    // "when the effect ran" is both stable and the more accurate answer to
    // "when did the overlay actually appear".
    const startedAt = Date.now()
    const animationDoneMs = splashFadeAtMs(plan)
    let readyNow = false
    let timer = 0
    let leaving = false

    const leave = () => {
      if (leaving) return
      leaving = true
      setPhase('out')
      timer = setTimeout(() => setPhase('gone'), plan.fadeMs)
    }

    // Re-check on every event that can change the answer: the app reporting
    // ready, the animation finishing, and the give-up cap.
    const check = () => {
      if (leaving) return
      const elapsedMs = Date.now() - startedAt
      if (splashShouldExit({ elapsedMs, animationDoneMs, ready: readyNow })) leave()
    }

    const offReady = onAppReady(() => { readyNow = true; check() })
    const atAnimationEnd = setTimeout(check, animationDoneMs)
    const atCap = setTimeout(check, SPLASH_MAX_WAIT_MS)
    check()

    return () => {
      offReady()
      clearTimeout(atAnimationEnd)
      clearTimeout(atCap)
      clearTimeout(timer)
    }
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
          // Matched to the platform launch image, not a fixed pixel size. That
          // image is drawn scaleAspectFill, so its mark lands at 15% of the
          // screen HEIGHT; sizing this the same way means the logo does not
          // jump when the web overlay takes over. Clamped so it stays sane on
          // a tablet and on a very short screen.
          width: 'clamp(96px, 15vh, 180px)', height: 'clamp(96px, 15vh, 180px)',
          overflow: 'visible',
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
