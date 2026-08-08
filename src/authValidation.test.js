import { describe, it, expect } from 'vitest'
import { emailProblem, passwordProblem, passwordWhitespaceNote, mapAuthError, MIN_PASSWORD } from './authValidation'

describe('emailProblem', () => {
  it('requires a value', () => {
    expect(emailProblem('')).toBe('Enter your email.')
    expect(emailProblem('   ')).toBe('Enter your email.')
    expect(emailProblem(null)).toBe('Enter your email.')
  })
  it('accepts ordinary addresses', () => {
    expect(emailProblem('me@example.com')).toBe(null)
    expect(emailProblem(' Me@Example.Co ')).toBe(null)  // trimmed before checking
    expect(emailProblem('first.last+tag@sub.domain.org')).toBe(null)
  })
  it('rejects shapes that cannot be an email', () => {
    expect(emailProblem('not-an-email')).not.toBe(null)
    expect(emailProblem('@example.com')).not.toBe(null)
    expect(emailProblem('me@')).not.toBe(null)
    expect(emailProblem('me@nodot')).not.toBe(null)
    expect(emailProblem('a@b@c.com')).not.toBe(null)
    expect(emailProblem('me @example.com')).not.toBe(null)
  })
})

describe('passwordProblem', () => {
  it('requires a value in both modes', () => {
    expect(passwordProblem('', { signup: true })).toBe('Enter a password.')
    expect(passwordProblem('', { signup: false })).toBe('Enter a password.')
  })
  it('enforces the minimum only at signup', () => {
    const short = 'a'.repeat(MIN_PASSWORD - 1)
    expect(passwordProblem(short, { signup: true })).toContain(String(MIN_PASSWORD))
    expect(passwordProblem(short, { signup: false })).toBe(null)
  })
  it('accepts a long-enough signup password', () => {
    expect(passwordProblem('a'.repeat(MIN_PASSWORD), { signup: true })).toBe(null)
  })
})

describe('passwordWhitespaceNote', () => {
  it('notes leading or trailing whitespace without blocking', () => {
    expect(passwordWhitespaceNote(' secret')).toContain('space')
    expect(passwordWhitespaceNote('secret ')).toContain('space')
  })
  it('stays quiet otherwise', () => {
    expect(passwordWhitespaceNote('sec ret')).toBe(null)  // interior space is fine
    expect(passwordWhitespaceNote('secret')).toBe(null)
    expect(passwordWhitespaceNote('')).toBe(null)
  })
})

describe('mapAuthError', () => {
  it('rewrites the common Supabase failures into actionable copy', () => {
    expect(mapAuthError('Invalid login credentials')).toContain('Forgot password')
    expect(mapAuthError('User already registered')).toContain('Log in')
    expect(mapAuthError('Email not confirmed')).toContain('confirmation link')
    expect(mapAuthError('Request rate limit reached')).toContain('wait')
    expect(mapAuthError('TypeError: Failed to fetch')).toContain('connection')
  })
  it('owns a mail-provider failure instead of blaming the person signing up', () => {
    // Real outage, 2026-08-08: the SMTP credential was rejected (535 5.7.8) and
    // every email signup 500'd for nine days. The raw message went straight to
    // the screen, so people retried something that could never work.
    for (const raw of [
      'Error sending confirmation email',
      'Error sending recovery email',
      'Error sending magic link email',
    ]) {
      const shown = mapAuthError(raw)
      expect(shown).toContain('our side')
      expect(shown).toContain('Google')
      expect(shown).not.toBe(raw)
    }
  })
  it('passes unknown messages through unchanged', () => {
    expect(mapAuthError('Something exotic happened')).toBe('Something exotic happened')
    expect(mapAuthError('')).toBe('')
  })
})
