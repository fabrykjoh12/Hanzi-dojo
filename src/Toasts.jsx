import { useState, useEffect } from 'react'
import { Award, Info, TriangleAlert } from 'lucide-react'
import { registerToastListener } from './toast'

// Calm, self-dismissing notification stack (top-right). Listens for the
// 'hd-toast' CustomEvent fired by src/toast.js — no context or prop drilling,
// so any module can raise a moment (achievement seals).
// A toast's icon comes from its `kind`, and Award is still the default because
// the first toast in the app was an achievement seal. That default is why every
// untagged toast — a refusal included — arrived wearing a medal, which §1's
// calm, observational rule rules out for bad news.
//
// What this change does NOT do, so the comment does not claim it: retag every
// caller. The success toasts still pass no kind and still render the medal,
// which is at least the right shape for them. The ones that were wrong are the
// ones now tagged — a limit is 'info', a failure is 'warn'.
//
// A SIDE EFFECT worth writing down rather than leaving to be noticed: six
// callers already passed kind: 'info' (Dev.jsx x5, CreativeMode.jsx) and were
// rendering the medal because nothing mapped it. They now render Info. That is
// the intended icon for them — but one of those six tags a genuine FAILURE as
// 'info' (Dev.jsx's "Failed" toast), which by the rule above should be 'warn'.
// Left alone deliberately: it is an admin-only surface and not this task's.
const ICONS = { seal: Award, info: Info, warn: TriangleAlert }
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
    // Registered in the same effect as the window listener, and released in the
    // same cleanup, so toastsAreListening() cannot claim a stack that is not
    // there. A caller that would otherwise dispatch into nothing asks it first
    // — see src/toast.js.
    const release = registerToastListener()
    return () => {
      window.removeEventListener('hd-toast', onToast)
      release()
      timers.forEach(clearTimeout)
    }
  }, [])

  // The live region is ALWAYS in the DOM, empty or not. A `role="status"`
  // container created in the same tick as its first child is usually missed
  // entirely by VoiceOver — the announcement only lands when the region already
  // existed and its contents then changed. So only the toasts are conditional.
  //
  // It is NAMED because it is not the only role="status" on screen — Home's
  // gentle-return banner is another — and a test (or a screen reader user)
  // needs to be able to say which region it means.
  return (
    <div role="status" aria-live="polite" aria-label="Notifications" style={{
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
