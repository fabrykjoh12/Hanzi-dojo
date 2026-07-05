import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { supabase } from './supabase'
import { flushOutbox, pendingWrites } from './syncQueue'
import { useOnline } from './useOnline'

// A calm status pill that appears only when it has something to say:
//  - offline  → reassure that progress is saved locally and will sync,
//  - online with queued writes → flush the outbox and show a brief "syncing".
// It also drives the flush: on mount and every time the connection returns, any
// grades made offline are replayed to Supabase. Sits above the mobile nav.
export default function OfflineBar({ session }) {
  const online = useOnline()
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const n = await pendingWrites()
      if (!cancelled) setPending(n)
    }
    async function run() {
      if (!session) { setPending(0); return }
      await refresh()
      if (!online) return
      const count = await pendingWrites()
      if (count > 0) {
        if (!cancelled) setSyncing(true)
        await flushOutbox(supabase)
        if (!cancelled) setSyncing(false)
        await refresh()
      }
    }
    run()
    return () => { cancelled = true }
  }, [online, session])

  if (online && pending === 0) return null

  const bar = {
    position: 'fixed', left: '50%', transform: 'translateX(-50%)',
    bottom: 'calc(80px + env(safe-area-inset-bottom))', zIndex: 55,
    display: 'flex', alignItems: 'center', gap: '9px',
    maxWidth: 'calc(100vw - 32px)',
    padding: '10px 16px', borderRadius: '999px',
    background: online ? 'var(--surface)' : '#3A3733',
    color: online ? 'var(--text)' : '#F5F1EA',
    border: '1px solid ' + (online ? 'var(--border)' : 'rgba(0,0,0,0.2)'),
    boxShadow: '0 10px 30px rgba(24,24,27,0.18)',
    font: '600 12.5px Inter, sans-serif', lineHeight: 1.35, textAlign: 'left',
  }

  return (
    <div style={bar} role="status" aria-live="polite">
      {!online ? (
        <>
          <WifiOff size={15} strokeWidth={2.2} />
          <span>Offline — your reviews are saved on this device and sync when you reconnect.</span>
        </>
      ) : (
        <>
          <RefreshCw size={15} strokeWidth={2.2} style={syncing ? { animation: 'hd-spin 0.9s linear infinite' } : undefined} />
          <span>Syncing {pending} saved {pending === 1 ? 'review' : 'reviews'}…</span>
        </>
      )}
    </div>
  )
}
