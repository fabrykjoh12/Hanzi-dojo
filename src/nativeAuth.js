// Pure parsing for the native OAuth return trip. No React, no Capacitor, no
// Supabase import — see CLAUDE.md §3 on where behaviour belongs.
//
// Under Capacitor, Auth.jsx sends the user to the system browser for Google/
// Apple sign-in with redirectTo set to a custom scheme (hanzidojo://auth/
// callback). Supabase's default flowType is 'implicit' (unset in
// src/supabase.js), so the browser redirects back with the session in the URL
// FRAGMENT, not the query string: hanzidojo://auth/callback#access_token=…
// &refresh_token=…&expires_in=…&token_type=bearer. useNativeAuthDeepLink.js
// hands that raw URL string to parseAuthCallbackUrl() and calls
// supabase.auth.setSession() with the result.
export const AUTH_CALLBACK_SCHEME = 'hanzidojo'
export const AUTH_CALLBACK_URL = 'hanzidojo://auth/callback'

// True for any URL under our custom scheme — used to filter appUrlOpen events
// that aren't the auth callback (Capacitor delivers every opened URL, not
// just ours).
export function isAuthCallbackUrl(urlString) {
  if (typeof urlString !== 'string') return false
  return urlString.indexOf(AUTH_CALLBACK_SCHEME + '://') === 0
}

// Returns { accessToken, refreshToken } on a successful implicit-flow
// callback, { error, errorDescription } when the provider or Supabase sent
// one back (user cancelled, misconfigured provider, etc.), or null when the
// URL has neither — nothing for the caller to do.
export function parseAuthCallbackUrl(urlString) {
  if (!isAuthCallbackUrl(urlString)) return null

  let url
  try {
    url = new URL(urlString)
  } catch {
    return null
  }

  // Custom-scheme URLs still expose .hash / .search per the WHATWG URL spec
  // even though the scheme is non-special. Errors can arrive in either part
  // depending on the provider, so both are checked, hash taking priority.
  const hashParams = new URLSearchParams(url.hash.indexOf('#') === 0 ? url.hash.slice(1) : url.hash)
  const queryParams = url.searchParams

  const get = (key) => hashParams.get(key) || queryParams.get(key)

  const error = get('error')
  if (error) {
    return { error, errorDescription: get('error_description') || '' }
  }

  const accessToken = get('access_token')
  const refreshToken = get('refresh_token')
  if (accessToken && refreshToken) {
    return { accessToken, refreshToken }
  }

  return null
}
