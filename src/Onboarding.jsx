import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel, getLevels } from './utils'
import { track, EVENTS } from './analytics'
import { languageList, languageTheme } from './languageTheme'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import { ArrowRight, BookOpen, Layers, PenLine, Play } from 'lucide-react'

export default function Onboarding({ session, onComplete }) {
  const [step, setStep] = useState(1)
  const [language, setLanguage] = useState(null)
  const [level, setLevel] = useState(null)
  const [goal, setGoal] = useState(10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { track(EVENTS.ONBOARDING_STARTED) }, [])

  // Data-driven: the language cards + level grid come from the shared config, so
  // adding a language needs no changes here.
  const languages = languageList()
  const selectedTheme = language ? languageTheme(language) : null
  const accentHex = selectedTheme ? selectedTheme.accentHex : '#B83A24'
  const levels = selectedTheme ? getLevels(language, selectedTheme.system) : []

  // Which levels actually have vocabulary seeded. Levels without content are
  // shown as "Coming soon" instead of dropping a new user into an empty queue.
  // Keyed by language so a stale result never gates the wrong language; while
  // loading (or on fetch failure) everything stays selectable (fail open).
  const [seededData, setSeededData] = useState(null)   // { lang, levels: Set }
  useEffect(() => {
    if (!language) return
    let cancelled = false
    supabase
      .from('vocabulary')
      .select('level')
      .eq('language', language)
      .eq('system', languageTheme(language).system)
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled || !data) return
        setSeededData({ lang: language, levels: new Set(data.map(r => r.level)) })
      })
    return () => { cancelled = true }
  }, [language])
  const seededLevels = seededData && seededData.lang === language ? seededData.levels : null

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

      track(EVENTS.ONBOARDING_COMPLETED, { language, level, goal })
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
          {[1, 2, 3, 4].map(n => (
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
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '10px', fontSize: '14px' }}>
              Pick your {getSystemLabel(selectedTheme.system)} level. Starting higher assumes you know all earlier vocabulary.
            </p>
            <p style={{ textAlign: 'center', color: accentHex, marginBottom: '22px', fontSize: '13px', fontWeight: 600 }}>
              New to {selectedTheme.languageName}? Start with {getLevelLabel(language, selectedTheme.system, levels[0])}.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              {levels.map(lvl => {
                const seeded = !seededLevels || seededLevels.has(lvl)
                return (
                  <button
                    key={lvl}
                    onClick={() => seeded && setLevel(lvl)}
                    disabled={!seeded}
                    style={{
                      padding: '18px 8px',
                      borderRadius: '12px',
                      border: level === lvl ? ('2px solid ' + accentHex) : '2px solid var(--border)',
                      background: level === lvl ? (accentHex + '0D') : 'var(--surface)',
                      cursor: seeded ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: level === lvl ? accentHex : (seeded ? 'var(--text)' : 'var(--text-faint)'),
                      opacity: seeded ? 1 : 0.6,
                      transition: 'all 0.2s',
                      fontFamily: 'Inter, sans-serif',
                      lineHeight: 1.3,
                    }}
                  >
                    {getLevelLabel(language, selectedTheme.system, lvl)}
                    {!seeded && (
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-faint)', marginTop: '3px' }}>
                        Coming soon
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setStep(1)} style={backBtn}>Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!level || (seededLevels && !seededLevels.has(level))}
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
            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setStep(2)} style={backBtn}>Back</button>
              <button
                onClick={() => setStep(4)}
                style={{
                  flex: 2,
                  padding: '13px',
                  borderRadius: '12px',
                  border: 'none',
                  background: accentHex,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  transition: 'opacity 0.2s',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: What happens next */}
        {step === 4 && (
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, textAlign: 'center', color: 'var(--text)', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
              Here's your daily loop
            </h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '26px', fontSize: '14px', lineHeight: 1.6 }}>
              Review your flashcards, then read a story with the words you just
              practiced. About 15 focused minutes a day.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap', marginBottom: '26px' }}>
              {[
                { icon: Layers, label: 'Flashcards' },
                { icon: BookOpen, label: 'Stories' },
                { icon: Play, label: 'Videos' },
                { icon: PenLine, label: 'Writing' },
              ].map((s, i, arr) => (
                <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '7px', minWidth: '66px' }}>
                    <span style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: accentHex + '10', border: '1px solid ' + accentHex + '22',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <s.icon size={19} strokeWidth={1.8} color={accentHex} />
                    </span>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)' }}>{s.label}</span>
                  </span>
                  {i < arr.length - 1 && <ArrowRight size={14} strokeWidth={2} color="var(--text-faint)" />}
                </span>
              ))}
            </div>

            <div style={{
              padding: '14px 16px', borderRadius: '12px', marginBottom: '4px',
              background: accentHex + '0A', border: '1px solid ' + accentHex + '20',
              fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center',
            }}>
              Your first session starts with 5 words — just enough to unlock your
              first story. After that you'll learn {goal} new words a day, and each
              word comes back for review right before you'd forget it.
            </div>

            {error && <p style={{ color: '#DC2626', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setStep(3)} style={backBtn}>Back</button>
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
                {saving ? 'Setting up...' : 'Start your first session'}
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
