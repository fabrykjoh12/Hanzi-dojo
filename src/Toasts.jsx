import { useState, useEffect } from 'react'
import { Award } from 'lucide-react'

// Calm, self-dismissing notification stack (top-right). Listens for the
// 'hd-toast' CustomEvent fired by src/toast.js — no context or prop drilling,
// so any module can raise a moment (achievement seals).
const ICONS = { seal: Award }
const DISMISS_MS = 4600

let nextId = 1

export default function Toasts() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const timers = []
    const onToast = (e) => {
      const t = { id: nextId, ...(e.detail || {}) }
      nextId += 1
      setToasts(prev => [...prev, t])
      timers.push(setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id))
      }, DISMISS_MS))
    }
    window.addEventListener('hd-toast', onToast)
    return () => {
      window.removeEventListener('hd-toast', onToast)
      timers.forEach(clearTimeout)
    }
  }, [])

  // The live region is ALWAYS in the DOM, empty or not. A `role="status"`
  // container created in the same tick as its first child is usually missed
  // entirely by VoiceOver — the announcement only lands when the region already
  // existed and its contents then changed. So only the toasts are conditional.
  return (
    <div role="status" aria-live="polite" style={{
      // Fixed to the viewport, so the app shell's top inset doesn't reach it —
      // clear the status bar / notch here or the first toast lands inside it.
      position: 'fixed', top: 'calc(18px + env(safe-area-inset-top, 0px))', right: '18px', zIndex: 60,
      display: 'flex', flexDirection: 'column', gap: '10px',
      maxWidth: 'min(340px, calc(100vw - 36px))', pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const Icon = ICONS[t.kind] || Award
        const accent = t.accent || '#B45309'
        return (
          <div
            key={t.id}
            style={{
              display: 'flex', gap: '12px', alignItems: 'flex-start',
              background: 'var(--surface)', border: '1px solid ' + accent + '44',
              borderRadius: '18px', padding: '13px 16px',
              boxShadow: 'var(--shadow-2)',
              animation: 'hd-toast-in 240ms ease',
              pointerEvents: 'auto',
            }}
          >
            <span style={{
              width: '34px', height: '34px', borderRadius: '12px', flexShrink: 0,
              background: accent + '14', border: '1px solid ' + accent + '26',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={17} strokeWidth={1.9} color={accent} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: 'var(--text)' }}>
                {t.title}
              </span>
              {t.body && (
                <span style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>
                  {t.body}
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
