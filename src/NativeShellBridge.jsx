import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isNativeApp, routeFromDeepLink, backAction } from './nativeShell'
import { isAuthDeepLink, completeNativeAuth, authLandingPath } from './nativeAuth'

// Wires the Capacitor native shell into the router: deep links (universal
// links, OAuth/magic-link callbacks) route into the SPA instead of opening a
// browser, and the Android hardware back button navigates instead of closing
// the app. Renders nothing. Mounted inside BrowserRouter (main.jsx); a plain
// web session bails out immediately, and the plugin import is dynamic so the
// web bundle carries no native-only code on its critical path.
export default function NativeShellBridge() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = useRef(location.pathname)

  useEffect(() => {
    pathRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!isNativeApp()) return undefined
    let disposed = false
    const handles = []
    // One URL is handled once. `getLaunchUrl` and `appUrlOpen` can describe the
    // same arrival, and a one-time auth code survives exactly one exchange.
    const seen = new Set()

    const handleUrl = (url) => {
      if (!url || seen.has(url)) return
      seen.add(url)
      // An emailed or provider link returning to us carries a one-time code,
      // not a route: exchange it for a session, then land where that link was
      // FOR — Home for a sign-in, the set-a-new-password screen for a
      // recovery. App.jsx's auth listener picks the session up.
      //
      // A failed exchange is not silent: the code expires after an hour, and
      // PKCE cannot complete on a device other than the one that asked for the
      // link — both are things a learner needs told, not a quiet bounce to the
      // welcome screen.
      if (isAuthDeepLink(url)) {
        completeNativeAuth(url).then((result) => {
          if (disposed) return
          navigate(authLandingPath(result), { replace: true })
        })
        return
      }
      const route = routeFromDeepLink(url)
      if (route) navigate(route)
    }

    import('@capacitor/app')
      .then(({ App }) => {
        if (disposed) return
        // COLD START. Tapping a link while the app is closed launches it, and
        // that `appUrlOpen` fires long before this listener exists — the WebView
        // has to boot, React has to mount, and this plugin import is dynamic.
        // Without asking for the launch URL the app simply opened on the login
        // screen and the reset link appeared to do nothing (reported
        // 2026-08-09). Warm opens still come through the listener below.
        App.getLaunchUrl()
          .then((launch) => { if (!disposed) handleUrl(launch && launch.url) })
          .catch(() => { /* nothing was launched with — ordinary open */ })

        App.addListener('appUrlOpen', (event) => handleUrl(event && event.url))
          .then((handle) => handles.push(handle))
        App.addListener('backButton', (event) => {
          const action = backAction(pathRef.current, Boolean(event && event.canGoBack))
          if (action === 'back') navigate(-1)
          else if (action === 'home') navigate('/', { replace: true })
          else App.exitApp()
        }).then((handle) => handles.push(handle))
      })
      .catch(() => {
        /* plugin unavailable — behave like the web build */
      })
    return () => {
      disposed = true
      handles.forEach((handle) => handle.remove())
    }
  }, [navigate])

  return null
}
