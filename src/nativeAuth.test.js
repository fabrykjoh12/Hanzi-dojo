import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  authRedirectTo, isAuthCallbackUrl, signInWithProvider, completeNativeAuth,
  NATIVE_AUTH_REDIRECT,
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

  it('reports a failed exchange instead of throwing into the shell', async () => {
    const { error, handled } = await completeNativeAuth('com.hanzidojo.app://auth-callback?code=bad', {
      supabase: { auth: { exchangeCodeForSession: () => Promise.reject(new Error('expired')) } },
    })
    expect(handled).toBe(true)
    expect(error).toBeTruthy()
  })
})
