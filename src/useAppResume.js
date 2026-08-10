import { useEffect, useRef } from 'react'
import { isNativeApp } from './nativeShell'
import { invalidate } from './dataCache'
import { resumeInvalidations } from './appResume'

// The effectful half of appResume.js: notice the app going away and coming
// back, ask what that made wrong, and mark exactly that.
//
// ONE source of truth per platform, on purpose. An iOS WKWebView fires
// `visibilitychange` as well as Capacitor's `appStateChange`, so listening to
// both would run every resume twice — two invalidations, and two refreshes
// behind them. `isNativeApp()` picks the one that is authoritative on the
// platform actually running (CLAUDE.md §1: the two surfaces diverge only
// through that call), and the web path stands alone with no Capacitor import
// on it at all.
export function useAppResume(onResume) {
  // The callback changes identity on every render of the shell; holding it in a
  // ref is what lets the listeners register exactly once for the app's life.
  const callbackRef = useRef(onResume)
  useEffect(() => { callbackRef.current = onResume }, [onResume])

  useEffect(() => {
    let disposed = false
    let handle = null
    // Deliberately a closure, not state: recording a hide must never render.
    let backgroundedAt = null

    const hide = (at) => { backgroundedAt = at }

    const show = (at) => {
      const { keys } = resumeInvalidations({ backgroundedAt, resumedAt: at })
      backgroundedAt = null
      keys.forEach((key) => invalidate(key))
      // The callback runs on EVERY resume, not only when something was
      // invalidated: it reads the cache and does nothing when the cache is
      // clean, so this stays free and there is one less rule to get wrong.
      if (callbackRef.current) callbackRef.current({ keys })
    }

    if (isNativeApp()) {
      import('@capacitor/app')
        .then(({ App }) => {
          if (disposed) return
          App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) show(Date.now())
            else hide(Date.now())
          }).then((h) => {
            // Registration is async, so the effect can be torn down while the
            // listener is still being attached. Removing it on arrival is the
            // only way that race ends without a leak.
            if (disposed) h.remove()
            else handle = h
          })
        })
        .catch(() => { /* no plugin — the app simply never learns about resume */ })
      return () => {
        disposed = true
        if (handle) handle.remove()
      }
    }

    if (typeof document === 'undefined') return undefined
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hide(Date.now())
      else show(Date.now())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}

export default useAppResume
