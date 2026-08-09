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
import { RESET_PASSWORD_PATH } from './routes'

// The app's own bundle ID. Apple issues a native identity token whose audience
// is the bundle ID, so this is what Supabase must list under Client IDs.
export const APP_BUNDLE_ID = 'com.hanzidojo.app'

export const AUTH_CALLBACK_PATH = 'auth-callback'
// Password recovery comes back on its own path, so the app can tell "you are
// signed in" from "you are signed in ONLY to choose a new password". The code
// exchange is identical; what differs is where the learner must land, and
// GoTrue gives us no reliable `type=recovery` marker on the PKCE redirect —
// the path is the one thing we control end to end.
export const PASSWORD_RESET_PATH = 'password-reset'
export const NATIVE_AUTH_REDIRECT = APP_URL_SCHEME + '://' + AUTH_CALLBACK_PATH
export const NATIVE_RESET_REDIRECT = APP_URL_SCHEME + '://' + PASSWORD_RESET_PATH

// Where a provider — or an emailed link — should send the learner back to.
//
// `kind` is 'oauth' (the default) or 'recovery'. On the web both are the plain
// origin: the SPA reads Supabase's tokens out of the URL on load and the
// recovery event puts it into reset mode.
//
// In the store apps this MUST be the app's own registered scheme. The old code
// used `window.location.origin`, which inside the Capacitor WebView is
// `capacitor://localhost` (iOS) / `https://localhost` (Android) — not a URL
// Supabase will ever accept. GoTrue rejects a redirect that is not on the
// project's allow-list, consumes the one-time token anyway, and bounces to the
// project's Site URL with an error and NO tokens: the learner lands on the
// public website's welcome screen with no way to set a password. That was the
// whole bug (reported 2026-08-09).
export function authRedirectTo({ native, origin, kind = 'oauth' } = {}) {
  const isNative = native === undefined ? isNativeApp() : native
  if (isNative) return kind === 'recovery' ? NATIVE_RESET_REDIRECT : NATIVE_AUTH_REDIRECT
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

// Is this deep link a password-recovery email coming back into the app?
export function isPasswordResetUrl(url) {
  if (typeof url !== 'string') return false
  return url.indexOf(APP_URL_SCHEME + '://' + PASSWORD_RESET_PATH) === 0
}

// Any deep link that carries a one-time auth code to exchange.
export function isAuthDeepLink(url) {
  return isAuthCallbackUrl(url) || isPasswordResetUrl(url)
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

// The parameters a returning auth link carries. GoTrue puts them in the query
// for PKCE (`?code=…`) and in the fragment for an error, so both are read.
// Hand-parsed rather than via `new URL`: the scheme here is a custom one
// (`com.hanzidojo.app://`), and this has to behave identically in the WebView,
// in Node under vitest, and for a half-formed URL the OS hands us.
export function authParamsFromUrl(url) {
  const s = typeof url === 'string' ? url : ''
  const cut = s.search(/[?#]/)
  if (cut === -1) return {}
  const out = {}
  for (const part of s.slice(cut + 1).split(/[&#?]/)) {
    if (!part) continue
    const eq = part.indexOf('=')
    const key = eq === -1 ? part : part.slice(0, eq)
    if (!key || out[key] !== undefined) continue
    const raw = eq === -1 ? '' : part.slice(eq + 1)
    try { out[key] = decodeURIComponent(raw.replace(/\+/g, ' ')) } catch { out[key] = raw }
  }
  return out
}

// The one-time code to exchange. NOT the URL: `exchangeCodeForSession` posts
// whatever it is given as `auth_code`, so handing it the whole deep link makes
// every exchange fail server-side — which is precisely how the reset screen
// came back as the login screen (2026-08-09).
export function authCodeFromUrl(url) {
  return authParamsFromUrl(url).code || null
}

// GoTrue can also come back having refused the link outright — an expired or
// already-used token arrives as `?error=access_denied&error_code=otp_expired`.
// Reading it means saying what happened instead of attempting an exchange that
// was never going to work.
export function authLinkError(url) {
  const p = authParamsFromUrl(url)
  const message = p.error_description || p.error_code || p.error
  return message || null
}

// Finish a sign-in — or a password recovery — from the deep link we were sent
// back on. `recovery` tells the caller the learner arrived to CHOOSE a new
// password, so it can land them on the reset screen instead of Home.
//
// On success supabase-js fires PASSWORD_RECOVERY on its own (it remembers that
// the verifier was minted for a recovery), so App's auth listener puts the app
// into reset mode without being told twice.
export async function completeNativeAuth(url, deps = {}) {
  const client = deps.supabase || supabase
  if (!isAuthDeepLink(url)) return { error: null, handled: false, recovery: false }
  const recovery = isPasswordResetUrl(url)

  const refused = authLinkError(url)
  if (refused) return { error: new Error(refused), handled: true, recovery }

  const code = authCodeFromUrl(url)
  if (!code) return { error: new Error('That link carried no sign-in code.'), handled: true, recovery }

  try {
    const { error } = await client.auth.exchangeCodeForSession(code)
    return { error: error || null, handled: true, recovery }
  } catch (err) {
    return { error: err, handled: true, recovery }
  }
}

// Where the app should land after handling a returning auth link. Pure, so the
// four outcomes (sign-in or recovery, worked or didn't) are pinned by tests
// rather than living as branches inside the native bridge.
export function authLandingPath({ error, recovery } = {}) {
  if (error) return '/?auth=' + (recovery ? 'reset-failed' : 'failed')
  return recovery ? RESET_PASSWORD_PATH : '/'
}

// Why a returning auth link did not work, in words a learner can act on.
//
// The PKCE verifier lives in the storage of the app that STARTED the flow, so
// a link opened on another device cannot complete — and an emailed link is
// exactly the thing people open on another device. Saying so beats a silent
// bounce to the welcome screen, which is indistinguishable from "the app is
// broken". `value` is the `auth` query parameter set by NativeShellBridge.
export function authNoticeFor(value) {
  if (value === 'reset-failed') {
    return 'That password reset link could not be opened. Reset links only work '
      + 'on the device you requested them from, and expire after an hour — '
      + 'request a new one below.'
  }
  if (value === 'failed') {
    return 'That sign-in link could not be completed. Please try signing in again.'
  }
  return null
}

// Read the notice out of a location search string ('?auth=reset-failed').
export function authNoticeFromSearch(search) {
  if (typeof search !== 'string' || !search) return null
  const query = search.charAt(0) === '?' ? search.slice(1) : search
  for (const part of query.split('&')) {
    const [key, raw] = part.split('=')
    if (key === 'auth') return authNoticeFor(decodeURIComponent(raw || ''))
  }
  return null
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
