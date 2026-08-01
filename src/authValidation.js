// Sign-up / log-in form validation and error copy. Pure module — no React, no
// Supabase — so the rules the Auth screen enforces are unit-tested.

// Supabase's default minimum. If the project setting is ever raised, raise this
// with it so the client hint matches what the server will actually accept.
export const MIN_PASSWORD = 6

// A deliberately light email shape check (no regex — OXC rules, and real email
// validation is the server's job): something@something.tld with no spaces.
export function emailProblem(email) {
  const s = String(email || '').trim()
  if (!s) return 'Enter your email.'
  const at = s.indexOf('@')
  if (at <= 0 || at !== s.lastIndexOf('@')) return 'That doesn’t look like an email address.'
  const domain = s.slice(at + 1)
  if (!domain || domain.indexOf('.') <= 0 || s.indexOf(' ') !== -1) {
    return 'That doesn’t look like an email address.'
  }
  return null
}

// Sign-up password rule. Log-in deliberately checks only non-emptiness — an
// existing account's password is whatever it is.
export function passwordProblem(password, { signup = false } = {}) {
  const s = String(password || '')
  if (!s) return 'Enter a password.'
  if (signup && s.length < MIN_PASSWORD) {
    return 'Password needs at least ' + MIN_PASSWORD + ' characters.'
  }
  return null
}

// Passwords are never trimmed (a space can be a legitimate character), but an
// accidental leading/trailing space — a classic mobile-keyboard artifact — is
// worth a visible note before it becomes an un-diagnosable login failure.
export function passwordWhitespaceNote(password) {
  const s = String(password || '')
  if (!s) return null
  if (s !== s.trim()) return 'Heads up: your password starts or ends with a space.'
  return null
}

// Actionable copy for the Supabase auth errors users actually hit. Everything
// unrecognized passes through unchanged (never hide a real message), and none
// of the rewrites leak whether an email exists beyond what the server already
// discloses.
export function mapAuthError(message) {
  const m = String(message || '')
  const l = m.toLowerCase()
  if (l.indexOf('invalid login credentials') !== -1) {
    return 'Email or password is incorrect. Check both, or use “Forgot password?” below.'
  }
  if (l.indexOf('already registered') !== -1 || l.indexOf('already been registered') !== -1) {
    return 'That email already has an account — switch to Log in.'
  }
  if (l.indexOf('email not confirmed') !== -1) {
    return 'This account’s email isn’t confirmed yet — check your inbox for the confirmation link.'
  }
  if (l.indexOf('rate limit') !== -1 || l.indexOf('too many requests') !== -1) {
    return 'Too many attempts — wait a minute, then try again.'
  }
  if (l.indexOf('network') !== -1 || l.indexOf('fetch') !== -1) {
    return 'Couldn’t reach the server. Check your connection and try again.'
  }
  return m
}
