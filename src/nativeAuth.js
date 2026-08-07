// OAuth that works in the store apps as well as the browser.
//
// Two things break a plain `signInWithOAuth` inside a Capacitor WebView:
//
//  1. Google refuses to serve its consent screen to an embedded webview
//     (policy, not a bug), so an in-app OAuth attempt dead-ends on a
//     "disallowed_useragent" page. The provider must be opened in the SYSTEM
//     browser instead.
//  2. Nothing would bring the learner back afterwards. The app registers the
//     `com.hanzidojo.app` scheme, so the provider redirects there and
//     NativeShellBridge hands the callback URL to `completeNativeAuth` below.
//
// The session is then established from the callback. On native the client runs
// the PKCE flow (see supabase.js), so the URL carries a short-lived `code`
// rather than the tokens themselves — worth the extra exchange, because any
// app on the device can claim a custom scheme, and a token in that URL would
// be handed straight to it.

import { supabase } from './supabase'
import { isNativeApp, APP_URL_SCHEME } from './nativeShell'
import { openExternal } from './externalLink'

export const AUTH_CALLBACK_PATH = 'auth-callback'
export const NATIVE_AUTH_REDIRECT = APP_URL_SCHEME + '://' + AUTH_CALLBACK_PATH

// Where the provider should send the learner back to.
export function authRedirectTo({ native, origin } = {}) {
  const isNative = native === undefined ? isNativeApp() : native
  if (isNative) return NATIVE_AUTH_REDIRECT
  const base = origin !== undefined
    ? origin
    : (typeof window !== 'undefined' ? window.location.origin + import.meta.env.BASE_URL : '/')
  return base
}

// Is this deep link the provider returning from a sign-in?
export function isAuthCallbackUrl(url) {
  if (typeof url !== 'string') return false
  return url.indexOf(APP_URL_SCHEME + '://' + AUTH_CALLBACK_PATH) === 0
}

// Start a provider sign-in. On the web this is the ordinary redirect; in the
// app the provider opens in the system browser and returns via the deep link.
// Resolves { error } so callers can surface it the same way in both worlds.
export async function signInWithProvider(provider, deps = {}) {
  const client = deps.supabase || supabase
  const isNative = deps.native === undefined ? isNativeApp() : deps.native
  const redirectTo = deps.redirectTo || authRedirectTo({ native: isNative })

  if (!isNative) {
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } })
    return { error }
  }

  // skipBrowserRedirect: we want the URL, not a navigation of the app itself —
  // navigating the webview to the provider is exactly what Google rejects.
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error) return { error }
  if (!data || !data.url) return { error: new Error('Could not start sign-in. Please try again.') }

  const open = deps.openExternal || openExternal
  await open(data.url)
  return { error: null }
}

// Finish a sign-in from the deep link the provider sent us back on.
export async function completeNativeAuth(url, deps = {}) {
  const client = deps.supabase || supabase
  if (!isAuthCallbackUrl(url)) return { error: null, handled: false }
  try {
    const { error } = await client.auth.exchangeCodeForSession(url)
    return { error: error || null, handled: true }
  } catch (err) {
    return { error: err, handled: true }
  }
}
