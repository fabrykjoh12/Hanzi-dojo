import { useState } from 'react'
import { BRAND_INK } from './brand'
import { ink } from './languageTheme'
import { FLASHCARD, ENCOUNTER_DONE } from './firstEncounter'
import { prefersReducedMotion } from './splashIntro'

// The loop, closed: the card the visitor just used slides into a small stack —
// their collection, one card deep — and the copy says exactly what happened
// and no more. "Discovered", never "mastered": the SRS decides what learned
// means, later, and the first minute must not write cheques the second day
// bounces.

export default function EncounterComplete({ onContinue }) {
  const [reduced] = useState(() => prefersReducedMotion())

  return (
    <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '22px', alignItems: 'center' }}>
      <style>{`
        @keyframes hd-card-collect {
          0%   { opacity: 0; transform: translateY(-26px) scale(1.06) rotate(0deg); }
          60%  { opacity: 1; transform: translateY(2px) scale(1) rotate(-2deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(-2deg); }
        }
      `}</style>

      {/* The collection: two quiet ghosts and the card that just earned its
          place, arriving on top. */}
      <div style={{ position: 'relative', width: '120px', height: '150px' }} aria-hidden="true">
        {[8, 4].map((offset, i) => (
          <span key={i} style={{
            position: 'absolute', inset: 0,
            transform: 'translateY(' + offset + 'px) rotate(' + (i === 0 ? 3 : -1) + 'deg)',
            borderRadius: '16px', background: 'var(--surface-2)', border: '1px solid var(--border)',
          }} />
        ))}
        <span style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--border)',
          boxShadow: '0 10px 26px rgba(24,24,27,0.12)',
          transform: 'rotate(-2deg)',
          ...(reduced ? {} : { animation: 'hd-card-collect 640ms cubic-bezier(.32,.72,.24,1) both' }),
        }}>
          <span lang="zh-Hans" style={{ fontFamily: "'Noto Sans SC', sans-serif", fontSize: '34px', color: ink(BRAND_INK) }}>
            {FLASHCARD.hanzi}
          </span>
        </span>
      </div>

      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <h2 style={{ margin: 0, fontSize: '21px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
          {ENCOUNTER_DONE.title}
        </h2>
        <p style={{ margin: '8px 0 0', fontSize: '14.5px', fontWeight: 650, color: ink(BRAND_INK) }}>
          {ENCOUNTER_DONE.discovered}
        </p>
        <p style={{ margin: '10px 0 0', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '320px' }}>
          {ENCOUNTER_DONE.line}
        </p>
      </div>

      <button
        onClick={onContinue}
        style={{
          width: '100%', minHeight: '54px', borderRadius: '999px', border: 'none',
          background: 'var(--text)', color: 'var(--bg)',
          fontSize: '16.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
        }}
      >
        {ENCOUNTER_DONE.cta}
      </button>
    </div>
  )
}
