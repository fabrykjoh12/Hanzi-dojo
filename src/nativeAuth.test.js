import { describe, it, expect } from 'vitest'
import { isAuthCallbackUrl, parseAuthCallbackUrl, AUTH_CALLBACK_URL } from './nativeAuth'

describe('isAuthCallbackUrl', () => {
  it('accepts our custom scheme', () => {
    expect(isAuthCallbackUrl('hanzidojo://auth/callback#access_token=x')).toBe(true)
  })

  it('rejects http(s) and other schemes', () => {
    expect(isAuthCallbackUrl('https://hanzi-dojo.com/')).toBe(false)
    expect(isAuthCallbackUrl('otherapp://callback')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isAuthCallbackUrl(null)).toBe(false)
    expect(isAuthCallbackUrl(undefined)).toBe(false)
  })
})

describe('parseAuthCallbackUrl', () => {
  it('extracts tokens from the URL fragment (implicit flow)', () => {
    const url = AUTH_CALLBACK_URL + '#access_token=abc123&refresh_token=def456&expires_in=3600&token_type=bearer'
    expect(parseAuthCallbackUrl(url)).toEqual({ accessToken: 'abc123', refreshToken: 'def456' })
  })

  it('extracts an error from the fragment', () => {
    const url = AUTH_CALLBACK_URL + '#error=access_denied&error_description=User+cancelled'
    expect(parseAuthCallbackUrl(url)).toEqual({ error: 'access_denied', errorDescription: 'User cancelled' })
  })

  it('extracts an error from the query string', () => {
    const url = AUTH_CALLBACK_URL + '?error=server_error&error_description=Something+broke'
    expect(parseAuthCallbackUrl(url)).toEqual({ error: 'server_error', errorDescription: 'Something broke' })
  })

  it('returns null for a callback URL with neither tokens nor an error', () => {
    expect(parseAuthCallbackUrl(AUTH_CALLBACK_URL)).toBe(null)
  })

  it('returns null for URLs outside our scheme', () => {
    expect(parseAuthCallbackUrl('https://hanzi-dojo.com/#access_token=abc&refresh_token=def')).toBe(null)
  })

  it('returns null for non-string/unrelated input', () => {
    expect(parseAuthCallbackUrl('not a url at all')).toBe(null)
    expect(parseAuthCallbackUrl(null)).toBe(null)
  })
})
