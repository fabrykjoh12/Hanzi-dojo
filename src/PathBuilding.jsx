import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { BRAND_INK } from './brand'
import { ink } from './languageTheme'
import { buildPath } from './onboardingPath'
import { prefersReducedMotion } from './splashIntro'

// Screen: "Preparing your training path…" — the choices just made, assembled
// into a visible plan, one row at a time. The pause is the point: it gives the
// personalization a moment to feel real instead of the app skipping past its
// own conclusion. It is also honest — every row comes from buildPath, which
// only states things the app will actually do.
//
// Reduced motion collapses the theatre: all rows at once, button immediately.

const ROW_STAGGER_MS = 420
const ROW_ANIM_MS = 380

export default function PathBuilding({ choices, onContinue }) {
  const [rows] = useState(() => buildPath(choices))
  const [reduced] = useState(() => prefersReducedMotion())
  const [ready, setReady] = useState(reduced)

  const totalMs = rows.length * ROW_STAGGER_MS + ROW_ANIM_MS

  useEffect(() => {
    if (reduced) return undefined
    const t = setTimeout(() => setReady(true), totalMs)
    return () => clearTimeout(t)
  }, [reduced, totalMs])

  return (
    <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <style>{`
        @keyframes hd-path-row {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map((row, i) => (
          <div
            key={row.title}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              padding: '14px 16px', borderRadius: '16px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              textAlign: 'left',
              ...(reduced ? {} : {
                opacity: 0,
                animation: 'hd-path-row ' + ROW_ANIM_MS + 'ms ease forwards',
                animationDelay: (i * ROW_STAGGER_MS) + 'ms',
              }),
            }}
          >
            <span style={{
              width: '26px', height: '26px', borderRadius: '999px', flexShrink: 0, marginTop: '1px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, ' + BRAND_INK + ' 10%, var(--surface))',
            }}>
              <Check size={14} strokeWidth={2.6} color={ink(BRAND_INK)} />
            </span>
            <span style={{ fontFamily: 'Inter, sans-serif' }}>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {row.title}
              </span>
              <span style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.45, marginTop: '2px' }}>
                {row.value}
              </span>
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onContinue}
        disabled={!ready}
        style={{
          width: '100%', minHeight: '54px', borderRadius: '999px', border: 'none',
          background: 'var(--text)', color: 'var(--bg)',
          fontSize: '16.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
          cursor: ready ? 'pointer' : 'default',
          opacity: ready ? 1 : 0,
          transition: 'opacity 300ms ease',
        }}
      >
        Begin first lesson
      </button>
    </div>
  )
}
