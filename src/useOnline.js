import { useEffect, useState } from 'react'

// `navigator.onLine` is a best-effort signal (it means "has a network
// interface", not "the internet actually works"), but it's the right cheap
// gate for choosing the offline code path. Treated as online when unknown.
export function isOnline() {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true
  return navigator.onLine
}

// Subscribe a component to online/offline transitions.
export function useOnline() {
  const [online, setOnline] = useState(isOnline())
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
