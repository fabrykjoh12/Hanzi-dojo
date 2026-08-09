import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  authRedirectTo, isAuthCallbackUrl, isPasswordResetUrl, isAuthDeepLink,
  signInWithProvider, completeNativeAuth, authNoticeFor, authNoticeFromSearch,
  signInWithAppleNative, randomNonce, NATIVE_AUTH_REDIRECT, NATIVE_RESET_REDIRECT,
  APP_BUNDLE_ID,
} from './nativeAuth'

afterEach(() => {
  delete globalThis.window
})

describe('authRedirectTo', () => {
  it('sends the app back through its own scheme', () => {
    expect(authRedirectTo({ native: true })).toBe(NATIVE_AUTH_REDIRECT)
    expect(NATIVE_AUTH_REDIRECT).toBe('com.hanzidojo.app://auth-callback')
  })

  it('sends the web back to its own origin', () => {
    expect(authRedirectTo({ native: false, origin: 'https://hanzi-dojo.com/' }))
      .toBe('https://hanzi-dojo.com/')
  })

  // The bug this whole path exists to prevent: a password-reset email sent
  // from the app used window.location.origin, which inside the WebView is
  // `capacitor://localhost`. Supabase rejects a redirect it has never been
  // told about, burns the one-time token, and drops the learner on the public
  // website with no session and no way to set a password.
  it('never sends an emailed app link to a capacitor:// origin', () => {
    const reset = authRedirectTo({ native: true, kind: 'recovery' })
    expect(reset).toBe(NATIVE_RESET_REDIRECT)
    expect(reset).toBe('com.hanzidojo.app://password-reset')
    expect(reset).not.toContain('localhost')
  })

  it('keeps recovery on its own path, so the app can tell it from a sign-in', () => {
    expect(authRedirectTo({ native: true, kind: 'recovery' }))
      .not.toBe(authRedirectTo({ native: true, kind: 'oauth' }))
  })

  it('leaves the web unchanged for recovery — the SPA reads the tokens itself', () => {
    expect(authRedirectTo({ native: false, origin: 'https://hanzi-dojo.com/', kind: 'recovery' }))
      .toBe('https://hanzi-dojo.com/')
  })
})

describe('isPasswordResetUrl', () => {
  it('recognises the recovery email returning to the app', () => {
    expect(isPasswordResetUrl('com.hanzidojo.app://password-reset?code=abc')).toBe(true)
  })

  it('is not confused by the ordinary sign-in callback', () => {
    expect(isPasswordResetUrl('com.hanzidojo.app://auth-callback?code=abc')).toBe(false)
    expect(isAuthCallbackUrl('com.hanzidojo.app://password-reset?code=abc')).toBe(false)
  })

  it('isAuthDeepLink covers both, and nothing else', () => {
    expect(isAuthDeepLink('com.hanzidojo.app://password-reset?code=a')).toBe(true)
    expect(isAuthDeepLink('com.hanzidojo.app://auth-callback?code=a')).toBe(true)
    expect(isAuthDeepLink('com.hanzidojo.app://read/abc')).toBe(false)
  })
})

describe('authNoticeFor', () => {
  it('explains a reset link that cannot complete, and says what to do', () => {
    const notice = authNoticeFor('reset-failed')
    expect(notice).toMatch(/device you requested them from/i)
    expect(notice).toMatch(/request a new one/i)
  })

  it('has nothing to say about a normal load', () => {
    expect(authNoticeFor('')).toBe(null)
    expect(authNoticeFor(undefined)).toBe(null)
    expect(authNoticeFor('something-else')).toBe(null)
  })

  it('reads the reason out of the query string', () => {
    expect(authNoticeFromSearch('?auth=reset-failed')).toMatch(/reset link/i)
    expect(authNoticeFromSearch('?foo=1&auth=failed')).toMatch(/sign-in link/i)
    expect(authNoticeFromSearch('?foo=1')).toBe(null)
    expect(authNoticeFromSearch('')).toBe(null)
  })
})

describe('isAuthCallbackUrl', () => {
  it('recognises the provider returning from sign-in', () => {
    expect(isAuthCallbackUrl('com.hanzidojo.app://auth-callback?code=abc')).toBe(true)
  })

  it('does not mistake an ordinary deep link for a sign-in', () => {
    expect(isAuthCallbackUrl('com.hanzidojo.app://read/abc')).toBe(false)
    expect(isAuthCallbackUrl('https://hanzi-dojo.com/auth-callback')).toBe(false)
    expect(isAuthCallbackUrl('')).toBe(false)
    expect(isAuthCallbackUrl(undefined)).toBe(false)
  })
})

function fakeClient(result) {
  return { auth: { signInWithOAuth: vi.fn(() => Promise.resolve(result)) } }
}

describe('signInWithProvider', () => {
  it('on the web, lets supabase do its ordinary redirect', async () => {
    const client = fakeClient({ data: {}, error: null })
    const openExternal = vi.fn()
    await signInWithProvider('apple', { supabase: client, native: false, redirectTo: 'https://x/', openExternal })

    const opts = client.auth.signInWithOAuth.mock.calls[0][0]
    expect(opts.provider).toBe('apple')
    expect(opts.options.skipBrowserRedirect).toBeUndefined()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('in the app, opens the provider in the SYSTEM browser — a webview is refused by Google', async () => {
    const client = fakeClient({ data: { url: 'https://accounts.google.com/o/oauth2/auth?x=1' }, error: null })
    const openExternal = vi.fn(() => Promise.resolve(true))
    const { error } = await signInWithProvider('google', { supabase: client, native: true, openExternal })

    const opts = client.auth.signInWithOAuth.mock.calls[0][0]
    expect(opts.options.skipBrowserRedirect).toBe(true)
    expect(opts.options.redirectTo).toBe(NATIVE_AUTH_REDIRECT)
    expect(openExternal).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?x=1')
    expect(error).toBe(null)
  })

  it('surfaces a provider error instead of opening a browser', async () => {
    const client = fakeClient({ data: null, error: new Error('provider down') })
    const openExternal = vi.fn()
    const { error } = await signInWithProvider('apple', { supabase: client, native: true, openExternal })
    expect(error).toBeTruthy()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('fails loudly if supabase returns no URL, rather than opening nothing', async () => {
    const client = fakeClient({ data: {}, error: null })
    const openExternal = vi.fn()
    const { error } = await signInWithProvider('apple', { supabase: client, native: true, openExternal })
    expect(error).toBeTruthy()
    expect(openExternal).not.toHaveBeenCalled()
  })
})

describe('completeNativeAuth', () => {
  it('exchanges the one-time code for a session', async () => {
    const exchangeCodeForSession = vi.fn(() => Promise.resolve({ error: null }))
    const { error, handled } = await completeNativeAuth(
      'com.hanzidojo.app://auth-callback?code=abc',
      { supabase: { auth: { exchangeCodeForSession } } }
    )
    expect(exchangeCodeForSession).toHaveBeenCalledWith('com.hanzidojo.app://auth-callback?code=abc')
    expect(handled).toBe(true)
    expect(error).toBe(null)
  })

  it('ignores a deep link that is not a sign-in', async () => {
    const exchangeCodeForSession = vi.fn()
    const { handled } = await completeNativeAuth('com.hanzidojo.app://read/abc', {
      supabase: { auth: { exchangeCodeForSession } },
    })
    expect(handled).toBe(false)
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('flags a recovery link, so the caller lands on the password screen', async () => {
    const exchangeCodeForSession = vi.fn(() => Promise.resolve({ error: null }))
    const { handled, recovery, error } = await completeNativeAuth(
      'com.hanzidojo.app://password-reset?code=abc',
      { supabase: { auth: { exchangeCodeForSession } } }
    )
    expect(handled).toBe(true)
    expect(recovery).toBe(true)
    expect(error).toBe(null)
  })

  it('still reports recovery when the exchange fails, so the message fits', async () => {
    const { recovery, error } = await completeNativeAuth('com.hanzidojo.app://password-reset?code=bad', {
      supabase: { auth: { exchangeCodeForSession: () => Promise.reject(new Error('expired')) } },
    })
    expect(recovery).toBe(true)
    expect(error).toBeTruthy()
  })

  it('an ordinary sign-in is not a recovery', async () => {
    const { recovery } = await completeNativeAuth('com.hanzidojo.app://auth-callback?code=abc', {
      supabase: { auth: { exchangeCodeForSession: () => Promise.resolve({ error: null }) } },
    })
    expect(recovery).toBe(false)
  })

  it('reports a failed exchange instead of throwing into the shell', async () => {
    const { error, handled } = await completeNativeAuth('com.hanzidojo.app://auth-callback?code=bad', {
      supabase: { auth: { exchangeCodeForSession: () => Promise.reject(new Error('expired')) } },
    })
    expect(handled).toBe(true)
    expect(error).toBeTruthy()
  })
})

describe('signInWithAppleNative', () => {
  it('sends Apple the HASHED nonce and Supabase the RAW one', async () => {
    // Getting this backwards is the classic Sign-in-with-Apple bug: Apple
    // embeds the hash in the token, and Supabase re-hashes what we give it
    // to compare. Swap them and every sign-in fails verification.
    const authorize = vi.fn(() => Promise.resolve({ response: { identityToken: 'id-token' } }))
    const signInWithIdToken = vi.fn(() => Promise.resolve({ error: null }))
    const raw = 'abc123'
    // sha256("abc123")
    const expectedHash = '6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090'

    const { error } = await signInWithAppleNative({
      authorize,
      rawNonce: raw,
      supabase: { auth: { signInWithIdToken } },
      subtle: globalThis.crypto.subtle,
    })

    expect(error).toBe(null)
    expect(authorize.mock.calls[0][0].nonce).toBe(expectedHash)
    expect(signInWithIdToken.mock.calls[0][0]).toEqual({
      provider: 'apple', token: 'id-token', nonce: raw,
    })
  })

  it('asks Apple for the app itself, since a native token is minted for the bundle ID', async () => {
    const authorize = vi.fn(() => Promise.resolve({ response: { identityToken: 't' } }))
    await signInWithAppleNative({
      authorize,
      rawNonce: 'n',
      supabase: { auth: { signInWithIdToken: () => Promise.resolve({ error: null }) } },
      subtle: globalThis.crypto.subtle,
    })
    expect(authorize.mock.calls[0][0].clientId).toBe(APP_BUNDLE_ID)
  })

  it('treats a cancelled sheet as a non-event, not an error to shout about', async () => {
    const { error, cancelled } = await signInWithAppleNative({
      authorize: () => Promise.reject(new Error('The operation was cancelled')),
      rawNonce: 'n',
      supabase: { auth: {} },
      subtle: globalThis.crypto.subtle,
    })
    expect(error).toBe(null)
    expect(cancelled).toBe(true)
  })

  it('reports a missing identity token rather than calling Supabase with nothing', async () => {
    const signInWithIdToken = vi.fn()
    const { error } = await signInWithAppleNative({
      authorize: () => Promise.resolve({ response: {} }),
      rawNonce: 'n',
      supabase: { auth: { signInWithIdToken } },
      subtle: globalThis.crypto.subtle,
    })
    expect(error).toBeTruthy()
    expect(signInWithIdToken).not.toHaveBeenCalled()
  })
})

describe('randomNonce', () => {
  it('is hex and long enough to be unguessable', () => {
    const n = randomNonce()
    expect(n).toMatch(/^[0-9a-f]{64}$/)
    expect(randomNonce()).not.toBe(n)
  })
})
