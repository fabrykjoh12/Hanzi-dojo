import { useState } from 'react'

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
