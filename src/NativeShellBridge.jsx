import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isNativeApp, routeFromDeepLink, backAction, consumeLaunchUrl } from './nativeShell'
import { runBackHandler } from './backHandler'
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
  // react-router hands back a NEW `navigate` on every navigation (its callback
  // closes over the current pathname). Depending on it would re-run the effect
  // below on every screen change — re-registering listeners, and re-reading the
  // launch URL. Held in a ref instead, so the listeners are registered exactly
  // once and always call the current one.
  const navigateRef = useRef(navigate)

  useEffect(() => {
    pathRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    if (!isNativeApp()) return undefined
    let disposed = false
    const handles = []
    // The same arrival can reach us twice (a launch URL is also delivered as an
    // appUrlOpen on some platforms), and a one-time auth code survives exactly
    // one exchange.
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
          navigateRef.current(authLandingPath(result), { replace: true })
        })
        return
      }
      const route = routeFromDeepLink(url)
      if (route) navigateRef.current(route)
    }

    import('@capacitor/app')
      .then(({ App }) => {
        if (disposed) return
        // COLD START. Tapping a link while the app is closed launches it, and
        // that `appUrlOpen` fires long before this listener exists — the WebView
        // has to boot, React has to mount, and this plugin import is dynamic.
        // Without asking for the launch URL the app simply opened on the login
        // screen and the reset link appeared to do nothing.
        //
        // consumeLaunchUrl() makes it a one-shot for the whole app run: the
        // plugin keeps returning that URL forever, and re-handling it re-spends
        // an auth code that is already gone. Warm opens come through the
        // listener below instead.
        App.getLaunchUrl()
          .then((launch) => {
            if (disposed) return
            handleUrl(consumeLaunchUrl(launch && launch.url))
          })
          .catch(() => { /* nothing was launched with — ordinary open */ })

        App.addListener('appUrlOpen', (event) => handleUrl(event && event.url))
          .then((handle) => handles.push(handle))
        App.addListener('backButton', (event) => {
          // Ask the shell first. When the authenticated app is mounted, the
          // navigation model is the only thing that knows what Back means —
          // close a sheet, pop a screen, dismiss a flow, step to the Home tab,
          // or leave. See useAndroidBack.js.
          const handled = runBackHandler()
          if (handled === 'handled') return
          if (handled === 'exit') { App.exitApp(); return }

          // No shell: the sign-in screen, onboarding, the password-reset
          // screen. These live outside the tab shell entirely, so the original
          // path-based behaviour is still the right answer for them — and it
          // is the reason this listener cannot simply move inside the shell,
          // which does not exist yet when an emailed auth link arrives.
          const action = backAction(pathRef.current, Boolean(event && event.canGoBack))
          if (action === 'back') navigateRef.current(-1)
          else if (action === 'home') navigateRef.current('/', { replace: true })
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
    // Mount only — and the linter agrees, because everything time-varying
    // (navigate, the current path) is read through a ref rather than closed
    // over. That is the point: this effect must never re-run.
  }, [])

  return null
}
