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

// The app's own bundle ID. Apple issues a native identity token whose audience
// is the bundle ID, so this is what Supabase must list under Client IDs.
export const APP_BUNDLE_ID = 'com.hanzidojo.app'

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

// ── Sign in with Apple, natively ────────────────────────────────────────────
//
// Apple requires this in the iOS app because we offer Google (guideline 4.8).
// It is deliberately NOT wired to the web OAuth flow: that route needs a
// client secret which Apple forces you to regenerate every 6 months, and web
// sign-in dies silently when it lapses. The native sheet needs no secret at
// all — Apple hands back a signed identity token and Supabase verifies it
// against Apple's public keys.
//
// Nonce handling is the part that is easy to get wrong: Apple must receive
// the SHA-256 HASH of the nonce, while Supabase must receive the RAW one, so
// it can check that the token it was given was minted for this very request.

export function randomNonce(bytes) {
  const source = bytes || (typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(32))
    : null)
  if (!source) throw new Error('No secure random source')
  return Array.from(source).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(text, subtle) {
  const impl = subtle || (typeof crypto !== 'undefined' ? crypto.subtle : null)
  if (!impl) throw new Error('No WebCrypto available')
  const data = new TextEncoder().encode(text)
  const digest = await impl.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Runs Apple's own sheet and exchanges the resulting identity token for a
// Supabase session. Returns { error } like the other sign-in helpers.
export async function signInWithAppleNative(deps = {}) {
  const client = deps.supabase || supabase
  try {
    const authorize = deps.authorize || (await import('@capacitor-community/apple-sign-in'))
      .SignInWithApple.authorize
    const rawNonce = deps.rawNonce || randomNonce()
    const hashedNonce = await sha256Hex(rawNonce, deps.subtle)

    const result = await authorize({
      clientId: APP_BUNDLE_ID,
      // Unused natively — Apple only requires the field to be present.
      redirectURI: NATIVE_AUTH_REDIRECT,
      scopes: 'email name',
      nonce: hashedNonce,
    })

    const token = result && result.response && result.response.identityToken
    if (!token) return { error: new Error('Apple did not return an identity token.') }

    const { error } = await client.auth.signInWithIdToken({
      provider: 'apple',
      token,
      nonce: rawNonce,
    })
    return { error: error || null }
  } catch (err) {
    // The learner cancelling Apple's sheet is not an error worth shouting
    // about — it is them changing their mind.
    const message = String((err && err.message) || err)
    if (/cancel/i.test(message)) return { error: null, cancelled: true }
    return { error: err }
  }
}
