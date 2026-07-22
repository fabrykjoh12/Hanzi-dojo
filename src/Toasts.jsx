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

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', top: '18px', right: '18px', zIndex: 60,
      display: 'flex', flexDirection: 'column', gap: '10px',
      maxWidth: 'min(340px, calc(100vw - 36px))', pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const Icon = ICONS[t.kind] || Award
        const accent = t.accent || '#B45309'
        return (
          <div
            key={t.id}
            role="status"
            style={{
              display: 'flex', gap: '12px', alignItems: 'flex-start',
              background: 'var(--surface)', border: '1px solid ' + accent + '44',
              borderRadius: '16px', padding: '13px 16px',
              boxShadow: '0 16px 40px rgba(24,24,27,0.16)',
              animation: 'hd-toast-in 240ms ease',
              pointerEvents: 'auto',
            }}
          >
            <span style={{
              width: '34px', height: '34px', borderRadius: '11px', flexShrink: 0,
              background: accent + '14', border: '1px solid ' + accent + '26',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={17} strokeWidth={1.9} color={accent} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, color: 'var(--text)' }}>
                {t.title}
              </span>
              {t.body && (
                <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>
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
