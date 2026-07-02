import { useState } from 'react'
import { supabase } from './supabase'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'

export default function Auth() {
  const [isSignup, setIsSignup] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState('error')   // 'error' | 'success'

  // Return to wherever the app is actually running — the GitHub Pages URL in
  // production, localhost in dev — instead of Supabase's default Site URL.
  // BASE_URL is '/Hanzi-dojo/' in the prod build and '/' during dev.
  const redirectTo = window.location.origin + import.meta.env.BASE_URL

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessageKind('success')
        setMessage('Check your email to confirm your account!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (error) {
      setMessageKind('error')
      setMessage(error.message)
    }
    setLoading(false)
  }

  const handleReset = async (e) => {
    e.preventDefault()
    const normalizedEmail = email.trim()
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

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) { setMessageKind('error'); setMessage(error.message) }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      padding: '24px',
      background: 'var(--bg)',
    }}>
      {/* Background image */}
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

      {/* Card */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: '460px',
        background: 'var(--surface)',
        borderRadius: '20px',
        boxShadow: '0 4px 40px rgba(0,0,0,0.10)',
        padding: '40px 40px 32px',
      }}>
        {/* Logo + wordmark */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <img src={logo} alt={BRAND_NAME} style={{ width: '52px', height: '52px', objectFit: 'contain', marginBottom: '4px' }} />
          <div style={heroWordmarkStyle('42px')}>
            {BRAND_NAME}
          </div>
        </div>

        {/* Tagline */}
        <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '28px', marginTop: '4px' }}>
          Learn a language. Grow every day.
        </p>

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border)', marginBottom: '24px' }} />

        {/* Tab toggle */}
        <div style={{ display: 'flex', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => { setIsSignup(false); setResetMode(false); setMessage('') }}
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onEnter}
            required
            style={inputStyle}
          />
          {!resetMode && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onEnter}
              required
              minLength={6}
              style={inputStyle}
            />
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

        {/* Google */}
        {!resetMode && (
        <button onClick={handleGoogle} style={{
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

        {/* Message */}
        {message && (
          <p style={{
            textAlign: 'center', fontSize: '13px', marginTop: '16px',
            color: messageKind === 'success' ? 'var(--success)' : '#DC2626',
          }}>
            {message}
          </p>
        )}
      </div>

      {/* Below card */}
      <p style={{ position: 'relative', zIndex: 1, marginTop: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
        Free forever. No credit card.
      </p>
    </div>
  )
}

const inputStyle = {
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  fontSize: '15px',
  fontFamily: 'Inter, sans-serif',
  color: 'var(--text)',
  background: 'var(--bg)',
  width: '100%',
  boxSizing: 'border-box',
}
