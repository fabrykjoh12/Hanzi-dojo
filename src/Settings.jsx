import { useState } from 'react'
import { supabase } from './supabase'
import {
  Bell, Palette, ShieldCheck, SlidersHorizontal,
  Lock, Mail, Save, Check, LogOut,
} from 'lucide-react'
import { getFuriganaDefault, setFuriganaDefault } from './prefs'

function getLanguageDetails(profile) {
  const isJapanese = profile.active_language === 'japanese'
  return {
    accentHex: isJapanese ? '#2E3A6E' : '#B83A24',
    fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
    isJapanese,
  }
}

export default function Settings({ session, profile, onUpdate }) {
  const { accentHex, isJapanese } = getLanguageDetails(profile)

  // ── Appearance: furigana default (device-local) ───────────────────────────
  const [furigana, setFurigana] = useState(() => getFuriganaDefault())
  const toggleFurigana = () => {
    const next = !furigana
    setFurigana(next)
    setFuriganaDefault(next)
  }

  // ── Account: display name ─────────────────────────────────────────────────
  const [name, setName] = useState(profile.display_name || '')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const nameDirty = name.trim() !== (profile.display_name || '')

  const saveName = async () => {
    if (!nameDirty) return
    setSavingName(true)
    setNameSaved(false)
    const trimmed = name.trim()
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed || null })
      .eq('id', session.user.id)
    setSavingName(false)
    if (!error) {
      if (onUpdate) onUpdate({ display_name: trimmed || null })
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2200)
    }
  }

  // ── Account: change password ──────────────────────────────────────────────
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState(null) // { type: 'ok' | 'err', text }

  const savePassword = async () => {
    setPwMsg(null)
    if (pw.length < 6) {
      setPwMsg({ type: 'err', text: 'Password must be at least 6 characters.' })
      return
    }
    if (pw !== pw2) {
      setPwMsg({ type: 'err', text: 'The two passwords do not match.' })
      return
    }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setSavingPw(false)
    if (error) {
      setPwMsg({ type: 'err', text: error.message })
    } else {
      setPw('')
      setPw2('')
      setPwMsg({ type: 'ok', text: 'Password updated.' })
    }
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '52px 32px 72px', position: 'relative', zIndex: 1 }}>
        <div style={{
          width: '68px', height: '68px', borderRadius: '22px',
          background: accentHex + '10',
          border: '1px solid ' + accentHex + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '20px',
        }}>
          <SlidersHorizontal size={32} strokeWidth={1.75} color={accentHex} />
        </div>

        <div style={{ color: accentHex, fontSize: '13px', fontWeight: 850, marginBottom: '10px' }}>
          Preferences
        </div>
        <h1 style={{ margin: 0, fontSize: '38px', lineHeight: 1.1, fontWeight: 850, color: '#18181B' }}>
          Settings
        </h1>
        <p style={{ fontSize: '15px', color: '#71717A', lineHeight: 1.65, margin: '12px 0 30px', maxWidth: '560px' }}>
          Manage how the app looks and your account. Daily goal and reset controls live in Profile.
        </p>

        {/* Appearance */}
        <Section icon={Palette} title="Appearance" accentHex={accentHex}>
          <Row
            title="Furigana on Japanese cards"
            desc={isJapanese
              ? 'Show readings above kanji by default during flashcards. You can still toggle it per session.'
              : 'Show readings above kanji by default in Japanese flashcards. Applies when studying Japanese.'}
          >
            <Toggle on={furigana} onClick={toggleFurigana} accentHex={accentHex} label="Furigana default" />
          </Row>
        </Section>

        {/* Account */}
        <Section icon={ShieldCheck} title="Account" accentHex={accentHex}>
          <Row title="Display name" desc="Shown on your profile. Leave blank to use your email.">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <Input value={name} onChange={setName} placeholder="Your name" accentHex={accentHex} />
              <Button onClick={saveName} accentHex={accentHex} filled disabled={!nameDirty || savingName} icon={nameSaved ? Check : Save}>
                {savingName ? 'Saving' : nameSaved ? 'Saved' : 'Save'}
              </Button>
            </div>
          </Row>

          <Divider />

          <Row title="Email" desc="Used to sign in. Contact support to change it.">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#52525B', fontSize: '14px', fontWeight: 600 }}>
              <Mail size={16} strokeWidth={1.85} color="#A1A1AA" />
              {session.user.email}
            </div>
          </Row>

          <Divider />

          <Row title="Change password" desc="At least 6 characters. You stay signed in after changing it.">
            <div style={{ display: 'grid', gap: '8px', maxWidth: '320px' }}>
              <Input value={pw} onChange={setPw} placeholder="New password" type="password" accentHex={accentHex} icon={Lock} />
              <Input value={pw2} onChange={setPw2} placeholder="Confirm new password" type="password" accentHex={accentHex} icon={Lock} />
              <div>
                <Button onClick={savePassword} accentHex={accentHex} filled disabled={savingPw || !pw || !pw2} icon={Save}>
                  {savingPw ? 'Updating' : 'Update password'}
                </Button>
              </div>
              {pwMsg && (
                <div style={{
                  fontSize: '12.5px', lineHeight: 1.45,
                  color: pwMsg.type === 'ok' ? '#15803D' : '#DC2626',
                }}>
                  {pwMsg.text}
                </div>
              )}
            </div>
          </Row>
        </Section>

        {/* Reminders — honest placeholder, no fake controls */}
        <Section icon={Bell} title="Reminders" accentHex={accentHex}>
          <div style={{ fontSize: '13.5px', color: '#71717A', lineHeight: 1.6 }}>
            Daily study reminders aren&rsquo;t available yet. Your streak on the Home screen is the gentle nudge for now.
          </div>
        </Section>

        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            width: '100%', minHeight: '52px', borderRadius: '16px',
            border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626',
            cursor: 'pointer', fontSize: '14px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
            marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <LogOut size={18} strokeWidth={1.9} color="#DC2626" />
          Sign out
        </button>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, accentHex, children }) {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E7E5E4',
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)', padding: '22px 24px', marginBottom: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '13px',
          background: accentHex + '10', border: '1px solid ' + accentHex + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={20} strokeWidth={1.85} color={accentHex} />
        </div>
        <div style={{ fontSize: '16px', fontWeight: 850, color: '#18181B' }}>{title}</div>
      </div>
      {children}
    </div>
  )
}

function Row({ title, desc, children }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      gap: '18px', flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <div style={{ fontSize: '14px', fontWeight: 750, color: '#18181B' }}>{title}</div>
        {desc && <div style={{ fontSize: '12.5px', color: '#71717A', marginTop: '4px', lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: '1px', background: '#F1F1EF', margin: '16px 0' }} />
}

function Toggle({ on, onClick, accentHex, label }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      style={{
        width: '46px', height: '28px', borderRadius: '999px', border: 'none',
        background: on ? accentHex : '#D4D4D8', cursor: 'pointer', padding: 0,
        position: 'relative', transition: 'background 160ms ease', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: '3px', left: on ? '21px' : '3px',
        width: '22px', height: '22px', borderRadius: '999px', background: '#FFFFFF',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 160ms ease',
      }} />
    </button>
  )
}

function Input({ value, onChange, placeholder, type, accentHex, icon: Icon }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      minHeight: '40px', padding: '0 12px', borderRadius: '11px',
      border: '1.5px solid ' + (focused ? accentHex : '#E7E5E4'),
      background: '#FFFFFF', transition: 'border-color 160ms ease',
      minWidth: '200px',
    }}>
      {Icon && <Icon size={16} strokeWidth={1.85} color="#A1A1AA" style={{ flexShrink: 0 }} />}
      <input
        value={value}
        type={type || 'text'}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontSize: '14px', color: '#18181B', fontFamily: 'Inter, sans-serif',
        }}
      />
    </div>
  )
}

function Button({ children, onClick, accentHex, filled, disabled, icon: Icon }) {
  const color = accentHex || '#71717A'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: '40px', padding: '0 16px', borderRadius: '11px',
        border: '1px solid ' + (filled ? color : '#E7E5E4'),
        background: filled ? color : '#FFFFFF',
        color: filled ? '#FFFFFF' : color,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '13px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
        whiteSpace: 'nowrap', opacity: disabled ? 0.55 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
      }}
    >
      {Icon && <Icon size={15} strokeWidth={2} color={filled ? '#FFFFFF' : color} />}
      {children}
    </button>
  )
}
