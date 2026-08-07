import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isNativeApp, routeFromDeepLink, backAction } from './nativeShell'

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
    import('@capacitor/app')
      .then(({ App }) => {
        if (disposed) return
        App.addListener('appUrlOpen', (event) => {
          const route = routeFromDeepLink(event && event.url)
          if (route) navigate(route)
        }).then((handle) => handles.push(handle))
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
