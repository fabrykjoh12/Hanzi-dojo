import { useState } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel, getLevels } from './utils'
import { languageList, languageTheme } from './languageTheme'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.png'
import { BRAND_NAME, heroWordmarkStyle } from './brand'

export default function Onboarding({ session, onComplete }) {
  const [step, setStep] = useState(1)
  const [language, setLanguage] = useState(null)
  const [level, setLevel] = useState(null)
  const [goal, setGoal] = useState(10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Data-driven: the language cards + level grid come from the shared config, so
  // adding a language needs no changes here.
  const languages = languageList()
  const selectedTheme = language ? languageTheme(language) : null
  const accentHex = selectedTheme ? selectedTheme.accentHex : '#B83A24'
  const levels = selectedTheme ? getLevels(language, selectedTheme.system) : []

  const handleFinish = async () => {
    setSaving(true)
    setError('')

    try {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: session.user.id,
        active_language: language,
        daily_new_cards: goal,
      })
      if (profileError) throw profileError

      const system = languageTheme(language).system
      const { error: trackError } = await supabase.from('language_tracks').upsert({
        user_id: session.user.id,
        language,
        system,
        current_level: level,
        is_active: true,
      })
      if (trackError) throw trackError

      onComplete()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
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
        padding: '40px 40px 36px',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '32px' }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{
              width: step === n ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: step >= n ? accentHex : 'var(--border)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* STEP 1: Language */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '6px' }}>
              <img src={logo} alt={BRAND_NAME} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '4px' }} />
              <h1 style={{ ...heroWordmarkStyle('40px'), margin: 0 }}>
                {BRAND_NAME}
              </h1>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>Welcome</div>
            </div>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '28px', marginTop: '8px', fontSize: '14px' }}>
              Which language do you want to learn?
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              {languages.map(lang => {
                const selected = language === lang.key
                return (
                  <button
                    key={lang.key}
                    onClick={() => { setLanguage(lang.key); setLevel(null) }}
                    style={{
                      flex: 1,
                      padding: '24px 12px',
                      borderRadius: '14px',
                      border: selected ? ('2px solid ' + lang.accentHex) : '2px solid var(--border)',
                      background: selected ? (lang.accentHex + '0D') : 'var(--surface)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '34px', lineHeight: 1 }}>{lang.flag}</span>
                    <span style={{ fontSize: '26px', fontWeight: 700, color: lang.accentHex, fontFamily: lang.font + ', sans-serif', lineHeight: 1 }}>{lang.nativeName}</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>{lang.languageName}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!language}
              style={{
                width: '100%',
                marginTop: '28px',
                padding: '13px',
                borderRadius: '12px',
                border: 'none',
                background: language ? accentHex : 'var(--border)',
                color: language ? 'var(--surface)' : 'var(--text-muted)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: language ? 'pointer' : 'not-allowed',
                fontFamily: 'Inter, sans-serif',
                transition: 'all 0.2s',
              }}
            >
              Continue
            </button>
          </div>
        )}

        {/* STEP 2: Level */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, textAlign: 'center', color: 'var(--text)', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
              What's your level?
            </h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '28px', fontSize: '14px' }}>
              Pick your {getSystemLabel(selectedTheme.system)} level. Starting higher assumes you know all earlier vocabulary.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              {levels.map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setLevel(lvl)}
                  style={{
                    padding: '18px 8px',
                    borderRadius: '12px',
                    border: level === lvl ? ('2px solid ' + accentHex) : '2px solid var(--border)',
                    background: level === lvl ? (accentHex + '0D') : 'var(--surface)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: level === lvl ? accentHex : 'var(--text)',
                    transition: 'all 0.2s',
                    fontFamily: 'Inter, sans-serif',
                    lineHeight: 1.3,
                  }}
                >
                  {getLevelLabel(language, selectedTheme.system, lvl)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setStep(1)} style={backBtn}>Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!level}
                style={{
                  flex: 2,
                  padding: '13px',
                  borderRadius: '12px',
                  border: 'none',
                  background: level ? accentHex : 'var(--border)',
                  color: level ? 'var(--surface)' : 'var(--text-muted)',
                  cursor: level ? 'pointer' : 'not-allowed',
                  fontSize: '15px',
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  transition: 'all 0.2s',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Daily goal */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, textAlign: 'center', color: 'var(--text)', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
              Set your daily goal
            </h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '28px', fontSize: '14px' }}>
              How many new words do you want to learn each day?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { val: 5, label: 'Casual', cards: '5 cards / day', desc: 'A little each day' },
                { val: 10, label: 'Regular', cards: '10 cards / day', desc: 'Steady progress' },
                { val: 15, label: 'Intensive', cards: '15 cards / day', desc: 'Fast track' },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setGoal(opt.val)}
                  style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: goal === opt.val ? ('2px solid ' + accentHex) : '2px solid var(--border)',
                    background: goal === opt.val ? (accentHex + '0D') : 'var(--surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: goal === opt.val ? accentHex : 'var(--text)', fontFamily: 'Inter, sans-serif' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.desc}</div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: goal === opt.val ? accentHex : 'var(--text-muted)' }}>
                    {opt.cards}
                  </div>
                </button>
              ))}
            </div>
            {error && <p style={{ color: '#DC2626', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setStep(2)} style={backBtn}>Back</button>
              <button
                onClick={handleFinish}
                disabled={saving}
                style={{
                  flex: 2,
                  padding: '13px',
                  borderRadius: '12px',
                  border: 'none',
                  background: accentHex,
                  color: '#fff',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  opacity: saving ? 0.7 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {saving ? 'Setting up...' : 'Start Learning'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const backBtn = {
  flex: 1,
  padding: '13px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
  fontSize: '15px',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  color: 'var(--text)',
}
