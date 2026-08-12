import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { trapDialogFocus } from './dialogFocus'
import { ink } from './languageTheme'
import { visibleSteps, nextStepIndex, cardPlacement } from './tour'

// ── TourOverlay ──────────────────────────────────────────────────────────────
// The presentation half of the first-run tour (all behaviour is in tour.js):
// dims the screen, cuts a soft rounded spotlight around the current step's
// anchored element, and floats a small card with the step's copy, step dots,
// Next / Done and an always-visible "Skip tour".
//
// The parent decides WHETHER a tour runs (maybeStartTour) and persists the
// outcome; this component only reports how it ended via onClose(outcome):
//   'completed' — walked to the end        → mark seen
//   'skipped'   — Skip button or Escape    → mark seen
//   null        — nothing could be shown   → leave seen-state alone, so a
//                 transiently broken screen doesn't eat the tour forever.
//
// Accessibility: role="dialog" + aria-modal, focus moved into the card and
// trapped there (dialogFocus.js), Escape skips, and the step copy is what the
// dialog is labelled/described by. Reduced motion drops every transition.

const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: 0,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

const SPOT_PAD = 6

function anchorEl(step) {
  try { return document.querySelector('[data-tour="' + step.anchor + '"]') } catch { return null }
}

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export default function TourOverlay({ steps, accentHex, onClose }) {
  // The steps whose anchors exist right now. Fixed at mount so the dots don't
  // jump around; anchors that unmount mid-tour are skipped at advance time.
  const [available] = useState(() => visibleSteps(steps, s => Boolean(anchorEl(s))))
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const cardRef = useRef(null)
  const closedRef = useRef(false)
  // Whether at least one step was actually shown — decides between 'completed'
  // (something was taught) and null (nothing rendered; don't mark seen) when
  // the remaining anchors disappear mid-tour.
  const shownRef = useRef(false)
  const reduced = prefersReducedMotion()

  // onClose may be an inline closure on the parent — keep the latest in a ref
  // so `close` stays stable and effects can list it without re-running.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const close = useCallback((outcome) => {
    if (closedRef.current) return
    closedRef.current = true
    if (onCloseRef.current) onCloseRef.current(outcome)
  }, [])

  const step = available[index] || null

  // Measure the anchor and keep the spotlight glued to it through scroll and
  // resize. If the anchor vanished, move on silently — never a broken spotlight.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const current = available[index]
    if (!current) { close(null); return undefined }
    const el = anchorEl(current)
    if (!el) {
      const next = nextStepIndex(available, index + 1, s => Boolean(anchorEl(s)))
      if (next === -1) close(shownRef.current ? 'completed' : null)
      else setIndex(next)
      return undefined
    }
    // Bring an off-screen anchor into view before pointing at it.
    const r0 = el.getBoundingClientRect()
    if (r0.top < 0 || r0.bottom > window.innerHeight) {
      try { el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }) } catch { /* older engines */ }
    }
    const measure = () => {
      const r = el.getBoundingClientRect()
      shownRef.current = true
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    window.addEventListener('resize', measure)
    // Capture-phase so scrolls inside nested rails re-position the spotlight too.
    document.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      document.removeEventListener('scroll', measure, true)
    }
  }, [available, index, close, reduced])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Escape skips, from anywhere — the tour must never hold the screen hostage.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close('skipped') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Move focus into the card on each step (aria-modal hides the page behind).
  const ready = Boolean(step && rect)
  useEffect(() => {
    if (ready && cardRef.current) cardRef.current.focus({ preventScroll: true })
  }, [index, ready])

  if (!ready) return null

  const advance = () => {
    const next = nextStepIndex(available, index + 1, s => Boolean(anchorEl(s)))
    if (next === -1) close('completed')
    else { setRect(null); setIndex(next) }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const isLast = nextStepIndex(available, index + 1, s => Boolean(anchorEl(s))) === -1
  const pos = cardPlacement({ rect, viewport: { width: vw, height: vh }, preferred: step.placement })
  const accentInk = ink(accentHex)
  const titleId = 'tour-step-title'
  const bodyId = 'tour-step-body'
  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 80,
        animation: reduced ? 'none' : 'hd-fade-in 220ms ease both',
      }}
    >
      {/* The spotlight: one rounded cutout, dimming everything else via its
          oversized shadow. Decorative — the dialog below carries the meaning. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: (rect.top - SPOT_PAD) + 'px',
          left: (rect.left - SPOT_PAD) + 'px',
          width: (rect.width + SPOT_PAD * 2) + 'px',
          height: (rect.height + SPOT_PAD * 2) + 'px',
          borderRadius: '18px',
          boxShadow: '0 0 0 200vmax rgba(9, 9, 11, 0.52)',
          transition: reduced ? 'none' : 'top 260ms ' + ease + ', left 260ms ' + ease + ', width 260ms ' + ease + ', height 260ms ' + ease,
          pointerEvents: 'none',
        }}
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={(e) => trapDialogFocus(e, cardRef.current)}
        style={{
          position: 'fixed', zIndex: 81, outline: 'none',
          width: pos.width + 'px',
          left: pos.left + 'px',
          top: pos.top != null ? pos.top + 'px' : 'auto',
          bottom: pos.bottom != null ? pos.bottom + 'px' : 'auto',
          maxHeight: pos.maxHeight + 'px', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '18px', boxShadow: 'var(--shadow-2)',
          padding: '16px 18px 10px', fontFamily: 'Inter, sans-serif',
          animation: reduced ? 'none' : 'hd-fade-in 200ms ease both',
        }}
      >
        <span style={SR_ONLY}>Step {index + 1} of {available.length}</span>

        <div id={titleId} style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
          {step.title}
        </div>
        <div id={bodyId} style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55, marginTop: '6px' }}>
          {step.body}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
          {/* Step dots — decorative; the SR text above says the same thing. */}
          <span aria-hidden="true" style={{ display: 'inline-flex', gap: '5px', flexShrink: 0 }}>
            {available.map((s, i) => (
              <span
                key={s.id}
                style={{
                  width: '6px', height: '6px', borderRadius: '999px',
                  background: i === index ? accentInk : 'var(--border)',
                }}
              />
            ))}
          </span>

          <button
            onClick={() => close('skipped')}
            className="hd-press"
            style={{
              marginLeft: 'auto', minHeight: '44px', padding: '0 10px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Skip tour
          </button>
          <button
            onClick={advance}
            className="hd-press"
            style={{
              minHeight: '44px', padding: '0 20px', borderRadius: '12px',
              border: 'none', cursor: 'pointer',
              background: accentHex, color: '#fff',
              fontSize: '13.5px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
            }}
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
