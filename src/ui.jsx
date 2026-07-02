import { useState, useEffect } from 'react'

// Shared UI primitives for the practice drills (and anything else that fits).
// These were copy-pasted per file (Kana/Cyrillic/Listen/FillBlank/Tones/
// SentenceBuilder each carried identical Centered/PrimaryButton/
// SecondaryButton definitions), so a polish fix cost six edits and the
// variants had already started to drift. One definition, one place to fix.

const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'
const SAGE_DISABLED = '#A8B5A1'

// Centered card panel for empty states and recaps.
export function Centered({ children, wide }) {
  return (
    <div style={{ maxWidth: wide ? '760px' : '520px', margin: '0 auto', minHeight: '74vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '520px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '42px 36px', boxShadow: '0 22px 60px rgba(24,24,27,0.07)' }}>
        {children}
      </div>
    </div>
  )
}

// Full-width sage call-to-action.
export function PrimaryButton({ onClick, children, icon: Icon, disabled }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        width: '100%', minHeight: '52px', borderRadius: '16px', border: 'none',
        background: disabled ? SAGE_DISABLED : (hovered ? SAGE_DARK : SAGE), color: '#fff',
        fontSize: '15px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered && !disabled ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {Icon && <Icon size={18} strokeWidth={2.1} color="#fff" />}
      {children}
    </button>
  )
}

// Animated number: counts up from 0 to `value` on mount with an ease-out, so
// recap stats land with a little weight. Renders the final value immediately
// for reduced-motion users and non-finite values.
export function CountUp({ value, duration = 650, suffix = '' }) {
  const reduced = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const skip = reduced || !Number.isFinite(value)
  // Skip path renders the final value from the start (initial state) — no
  // effect write needed, and reduced-motion users see no animation at all.
  const [display, setDisplay] = useState(skip ? value : 0)
  useEffect(() => {
    if (skip) return undefined
    let raf
    const start = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(value * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <>{display}{suffix}</>
}

// Quiet bordered button (Exit / Home / secondary actions). Grid rows stretch
// it to match a sibling PrimaryButton's height.
export function SecondaryButton({ onClick, children, icon: Icon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        minHeight: '44px', padding: '0 16px', borderRadius: '12px',
        border: '1px solid var(--border)', background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', transition: 'background 160ms ease',
      }}
    >
      {Icon && <Icon size={17} strokeWidth={1.85} color="var(--text-muted)" />}
      {children}
    </button>
  )
}
