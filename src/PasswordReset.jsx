import { useState } from 'react'
import { supabase } from './supabase'
import logo from './assets/Hanzi-logo.png'
import { BRAND_NAME, heroWordmarkStyle } from './brand'

// Shown after the user follows a password-recovery email link. Supabase signs
// them in with a temporary session and fires PASSWORD_RECOVERY (handled in
// App.jsx); this screen sets the new password and hands control back.
export default function PasswordReset({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    onDone()
  }

  const onEnter = (e) => { if (e.key === 'Enter') save() }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative', padding: '24px', background: 'var(--bg)',
    }}>
      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: '420px',
        background: 'var(--surface)', borderRadius: '20px',
        boxShadow: '0 4px 40px rgba(0,0,0,0.10)', padding: '36px 36px 30px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <img src={logo} alt={BRAND_NAME} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '4px' }} />
          <div style={heroWordmarkStyle('34px')}>{BRAND_NAME}</div>
        </div>

        <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', textAlign: 'center', marginBottom: '6px' }}>
          Set a new password
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '22px', lineHeight: 1.5 }}>
          Choose a new password for your account.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          <input
            type="password"
            aria-label="New password"
            autoComplete="new-password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onEnter}
            minLength={6}
            style={inputStyle}
          />
          <input
            type="password"
            aria-label="Confirm new password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={onEnter}
            minLength={6}
            style={inputStyle}
          />
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{
            width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
            background: '#B83A24', color: '#fff', fontSize: '15px', fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif',
            opacity: saving ? 0.7 : 1, transition: 'opacity 0.2s',
          }}
        >
          {saving ? 'Saving...' : 'Save new password'}
        </button>

        {error && (
          <p role="alert" style={{ textAlign: 'center', fontSize: '13px', color: '#DC2626', marginTop: '14px' }}>
            {error}
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
  fontSize: '15px',
  fontFamily: 'Inter, sans-serif',
  color: 'var(--text)',
  background: 'var(--bg)',
  width: '100%',
  boxSizing: 'border-box',
}
