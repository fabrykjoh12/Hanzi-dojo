import { useState } from 'react'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { supabase } from './supabase'
import { normalizeEmail } from './utils'
import { track, EVENTS } from './analytics'
import { emailProblem, passwordProblem, passwordWhitespaceNote, mapAuthError, MIN_PASSWORD } from './authValidation'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import { legalLinkProps } from './externalLink'
import { signInWithProvider, signInWithAppleNative } from './nativeAuth'
import { isNativeApp } from './nativeShell'
import { FLAGS } from './flags'
import { useIsMobile } from './useIsMobile'

export default function Auth({ intro = null, onBack = null }) {
  const isMobile = useIsMobile()
  // Arriving from the pre-login wizard (language + reason chosen) means the user
  // is here to create an account, so default to the Sign-up tab in that case.
  const [isSignup, setIsSignup] = useState(Boolean(intro))
  const [resetMode, setResetMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState('error')   // 'error' | 'success'

  // Return to wherever the app is actually running — the GitHub Pages URL in
  // production, localhost in dev — instead of Supabase's default Site URL.
  // BASE_URL is '/Hanzi-dojo/' in the prod build and '/' during dev.
  const redirectTo = window.location.origin + import.meta.env.BASE_URL

  const handleAuth = async (e) => {
    e.preventDefault()

    // Client-side pre-checks: catch the obvious problems with specific copy
    // before a server round-trip. The server still validates everything.
    const problem = emailProblem(email) || passwordProblem(password, { signup: isSignup })
    if (problem) {
      setMessageKind('error')
      setMessage(problem)
      return
    }

    setLoading(true)
    setMessage('')

    // Normalize so " Me@Example.com " and "me@example.com" are one account —
    // otherwise a mobile auto-capital creates a second, unreachable user.
    const cleanEmail = normalizeEmail(email)

    try {
      if (isSignup) {
        track(EVENTS.SIGNUP_STARTED)
        // emailRedirectTo pins the confirmation link back to the origin the user
        // signed up from. Without it, Supabase falls back to the project's Site
        // URL — which is why confirmation emails were sending people to the raw
        // GitHub Pages host instead of the domain they signed up on.
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: redirectTo },
        })
        if (error) throw error
        track(EVENTS.SIGNUP_COMPLETED)
        setMessageKind('success')
        setMessage('Check your email to confirm your account!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        if (error) throw error
      }
    } catch (error) {
      setMessageKind('error')
      setMessage(mapAuthError(error.message))
    }
    setLoading(false)
  }

  const handleReset = async (e) => {
    e.preventDefault()
    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail) {
      setMessageKind('error')
      setMessage('Enter your email first.')
      return
    }
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })
    if (error) {
      setMessageKind('error')
      setMessage(error.message)
    } else {
      setMessageKind('success')
      setMessage('Check your email for a password reset link.')
    }
    setLoading(false)
  }

  // Enter mirrors the submit button, including its disabled-while-loading state
  // (otherwise held Enter fires duplicate auth/reset requests mid-flight).
  const submit = (e) => {
    if (loading) { e.preventDefault(); return }
    return (resetMode ? handleReset : handleAuth)(e)
  }
  const onEnter = (e) => { if (e.key === 'Enter') submit(e) }

  // Both providers go through the same helper: on the web it is the ordinary
  // redirect, and in the store apps the provider opens in the system browser
  // and returns via the app's deep link (see nativeAuth.js).
  const handleProvider = async (provider) => {
    setMessage('')
    const { error } = await signInWithProvider(provider)
    if (error) { setMessageKind('error'); setMessage(mapAuthError(error.message)) }
  }

  // Apple goes through Apple's own native sheet, never the web OAuth flow —
  // that route would need a client secret Apple expires every six months
  // (nativeAuth.js). The button therefore only exists inside the app.
  const handleApple = async () => {
    setMessage('')
    const { error } = await signInWithAppleNative()
    if (error) { setMessageKind('error'); setMessage(mapAuthError(error.message)) }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      padding: 'calc(12px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))',
      background: 'var(--bg)',
    }}>
      {/* In flow, never floating: a fixed chip sat on top of the card and
          covered the logo. This row occupies its own height above the card,
          so overlap is impossible. */}
      {onBack && (
        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '460px', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '12px', border: 'none', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '-8px',
            }}
          >
            <ArrowLeft size={22} strokeWidth={2} color="var(--text-muted)" />
          </button>
        </div>
      )}
      {/* Background texture — web only. Inside the app the ground stays flat,
          matching the welcome screen it was opened from. */}
      {!isNativeApp() && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          backgroundImage: 'url(' + bgLogin + ')',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.35,
          pointerEvents: 'none',
        }} />
      )}

      {/* Card */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: '460px',
        background: 'var(--surface)',
        borderRadius: '20px',
        boxShadow: '0 4px 40px rgba(0,0,0,0.10)',
        // 40px of side padding leaves ~232px of content on a 360px phone; the
        // mobile branch gives the inputs and buttons room to breathe.
        padding: isMobile ? '28px 20px 24px' : '40px 40px 32px',
      }}>
        {/* Logo + wordmark. The wordmark IS the page heading — a real h1
            (margins reset so the wordmark styling renders identically), so
            heading navigation finds the screen. The logo alt is empty: the
            name follows immediately. No tagline: the person is here to type
            an email, and the tabs already say which door this is. The wizard's
            personalized line (intro) is the one sentence worth keeping. */}
        <div style={{ textAlign: 'center', marginBottom: intro ? '6px' : '22px' }}>
          <img src={logo} alt="" style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '2px' }} />
          <h1 style={{ ...heroWordmarkStyle('30px'), margin: 0 }}>
            {BRAND_NAME}
          </h1>
        </div>
        {intro && (
          <p style={{ textAlign: 'center', fontSize: '13.5px', color: 'var(--text)', margin: '0 0 20px', lineHeight: 1.5 }}>
            {intro}
          </p>
        )}

        {/* Tab toggle */}
        <div style={{ display: 'flex', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => { setIsSignup(false); setResetMode(false); setMessage('') }}
            aria-pressed={!isSignup}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'none',
              border: 'none',
              borderBottom: !isSignup ? '2px solid #B83A24' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: isSignup ? 400 : 600,
              color: !isSignup ? 'var(--text)' : 'var(--text-muted)',
              fontFamily: 'Inter, sans-serif',
              transition: 'all 0.2s',
              marginBottom: '-1px',
            }}
          >
            Log in
          </button>
          <button
            onClick={() => { setIsSignup(true); setResetMode(false); setMessage('') }}
            aria-pressed={isSignup}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'none',
              border: 'none',
              borderBottom: isSignup ? '2px solid #B83A24' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: isSignup ? 600 : 400,
              color: isSignup ? 'var(--text)' : 'var(--text-muted)',
              fontFamily: 'Inter, sans-serif',
              transition: 'all 0.2s',
              marginBottom: '-1px',
            }}
          >
            Sign up
          </button>
        </div>

        {/* Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          <input
            type="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onEnter}
            required
            style={inputStyle}
          />
          {!resetMode && (
            <div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  aria-label="Password"
                  aria-describedby={isSignup ? 'password-requirements' : (message && messageKind === 'error' ? 'auth-message' : undefined)}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onEnter}
                  required
                  minLength={MIN_PASSWORD}
                  style={{ ...inputStyle, paddingRight: '46px' }}
                />
                <button
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  style={{
                    position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
                    width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', cursor: 'pointer', borderRadius: '10px',
                  }}
                >
                  {showPassword
                    ? <EyeOff size={17} strokeWidth={1.9} color="var(--text-muted)" />
                    : <Eye size={17} strokeWidth={1.9} color="var(--text-muted)" />}
                </button>
              </div>
              {/* Visible requirement, live: gray until met, calm green once met.
                  Signup only — an existing password answers to no rule here. */}
              {isSignup && (
                <p id="password-requirements" style={{
                  fontSize: '12px', margin: '6px 2px 0', lineHeight: 1.5,
                  color: password.length >= MIN_PASSWORD ? '#3E7A4E' : 'var(--text-muted)',
                }}>
                  {password.length >= MIN_PASSWORD ? '✓ ' : ''}At least {MIN_PASSWORD} characters
                  {passwordWhitespaceNote(password) ? ' · ' + passwordWhitespaceNote(password) : ''}
                </p>
              )}
            </div>
          )}
        </div>

        {resetMode && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
            Enter your email and we’ll send you a link to set a new password.
          </p>
        )}

        {/* Submit */}
        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: '12px',
            border: 'none',
            background: '#B83A24',
            color: '#fff',
            fontSize: '15px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, sans-serif',
            opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {loading ? 'Please wait...' : resetMode ? 'Send reset link' : isSignup ? 'Create account' : 'Log in'}
        </button>

        {/* Legal acknowledgment — presented where the account is created. */}
        {isSignup && !resetMode && (
          <p style={{
            fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6,
            textAlign: 'center', margin: '10px 0 0', fontFamily: 'Inter, sans-serif',
          }}>
            {/* Opened outside the signup screen on purpose: reading the terms
                must never throw away a half-filled form. On the web that is a
                new tab; in the native shell target="_blank" does nothing, so
                the hosted copy opens in the system browser instead. */}
            By creating an account you agree to the{' '}
            <a {...legalLinkProps('/terms')} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Terms of Use</a>
            {' '}and{' '}
            <a {...legalLinkProps('/privacy')} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Privacy Policy</a>.
          </p>
        )}

        {/* Forgot password / back link */}
        {!isSignup && (
          <button
            onClick={() => { setResetMode(prev => !prev); setMessage('') }}
            style={{
              width: '100%', marginTop: '12px', background: 'none', border: 'none',
              color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            }}
          >
            {resetMode ? '← Back to log in' : 'Forgot password?'}
          </button>
        )}

        {/* OR divider */}
        {!resetMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>or continue with</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>
        )}

        {/* Sign in with Apple — required in the iOS app because we offer
            Google (App Store guideline 4.8). Shown ONLY inside the app: it
            uses Apple's native sheet, which needs no client secret and so
            never expires, unlike the web OAuth route (see nativeAuth.js).
            The web keeps Google and email, which Apple does not object to.
            Apple's mark is drawn inline: their branding requirements are
            specific, and lucide's "apple" is a piece of fruit. */}
        {!resetMode && FLAGS.APPLE_SIGN_IN && isNativeApp() && (
        <button onClick={handleApple} style={{
          width: '100%',
          padding: '12px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: '15px',
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          fontFamily: 'Inter, sans-serif',
          marginBottom: '10px',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.86-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.5zM14.9 5.9c.6-.74 1.01-1.75.9-2.77-.87.04-1.93.58-2.56 1.31-.56.65-1.06 1.69-.93 2.68.97.08 1.97-.49 2.59-1.22z"/>
          </svg>
          Continue with Apple
        </button>
        )}

        {/* Google */}
        {!resetMode && (
        <button onClick={() => handleProvider('google')} style={{
          width: '100%',
          padding: '12px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: '15px',
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          fontFamily: 'Inter, sans-serif',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
        )}

        {/* Message — a live region so screen readers hear the outcome, with an
            id the inputs reference via aria-describedby when it's an error. */}
        {message && (
          <p id="auth-message" role={messageKind === 'error' ? 'alert' : 'status'} style={{
            textAlign: 'center', fontSize: '13px', marginTop: '16px',
            color: messageKind === 'success' ? 'var(--success)' : '#DC2626',
          }}>
            {message}
          </p>
        )}
      </div>

    </div>
  )
}

const inputStyle = {
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  // 16px, never less: an iOS WKWebView zooms the whole page in when a focused
  // input's text is smaller, and the layout stays shifted afterwards.
  fontSize: '16px',
  fontFamily: 'Inter, sans-serif',
  color: 'var(--text)',
  background: 'var(--bg)',
  width: '100%',
  boxSizing: 'border-box',
}
