import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from './supabase'
import { parseAuthCallbackUrl } from './nativeAuth'
import { reportClientError } from './errorMonitor'

// Registered once at the app root (App.jsx), not inside Auth.jsx — the OS can
// hand the app its hanzidojo://auth/callback URL after the user has already
// navigated away from the login screen (or on a cold start), so the listener
// has to live for the app's whole lifetime, not just while Auth is mounted.
//
// The actual sign-in happens here via supabase.auth.setSession(); App.jsx's
// existing supabase.auth.onAuthStateChange subscription picks that up the
// same way it already does for email/password and web OAuth.
export function useNativeAuthDeepLink() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined

    const listenerPromise = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const parsed = parseAuthCallbackUrl(url)
      if (!parsed) return

      Browser.close().catch(() => { /* already closed — fine */ })

      if (parsed.error) {
        reportClientError(new Error('native_oauth_callback: ' + parsed.error), 'useNativeAuthDeepLink')
        return
      }

      supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken })
        .then(({ error }) => {
          if (error) reportClientError(error, 'useNativeAuthDeepLink')
        })
    })

    return () => {
      listenerPromise.then((handle) => handle.remove())
    }
  }, [])
}
