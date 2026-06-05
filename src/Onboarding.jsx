import { useState } from 'react'
import { supabase } from './supabase'
import { getLevelLabel } from './utils'

export default function Onboarding({ session, onComplete }) {
  const [step, setStep] = useState(1)
  const [language, setLanguage] = useState(null)
  const [level, setLevel] = useState(null)
  const [goal, setGoal] = useState(10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const accent = language === 'japanese' ? 'var(--japanese-accent)' : 'var(--chinese-accent)'
  const chineseLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const japaneseLevels = [1, 2, 3, 4, 5, 6]

  const handleFinish = async () => {
    setSaving(true)
    setError('')

    try {
      // 1. Create profile
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: session.user.id,
        active_language: language,
        daily_new_cards: goal,
      })
      if (profileError) throw profileError

      // 2. Create language track
      const system = language === 'chinese' ? 'hsk_3' : 'jlpt'
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '40px' }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{
              width: step === n ? '24px' : '8px', height: '8px', borderRadius: '4px',
              background: step >= n ? accent : '#e5e5e5', transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* STEP 1: Language */}
        {step === 1 && (
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 600, textAlign: 'center', marginBottom: '8px' }}>
              Choose your language
            </h1>
            <p style={{ textAlign: 'center', color: '#888', marginBottom: '32px', fontSize: '15px' }}>
              Which language do you want to learn?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <button onClick={() => { setLanguage('chinese'); setLevel(null); setStep(2) }} style={langCard()}>
                <span style={{ fontSize: '40px', color: 'var(--chinese-accent)', fontFamily: "'Noto Sans SC'" }}>中文</span>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 600 }}>Chinese</div>
                  <div style={{ fontSize: '13px', color: '#888' }}>Mandarin · HSK 3.0 levels 1–9</div>
                </div>
              </button>
              <button onClick={() => { setLanguage('japanese'); setLevel(null); setStep(2) }} style={langCard()}>
                <span style={{ fontSize: '40px', color: 'var(--japanese-accent)', fontFamily: "'Noto Sans JP'" }}>日本語</span>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 600 }}>Japanese</div>
                  <div style={{ fontSize: '13px', color: '#888' }}>JLPT N5–N1</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Level */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 600, textAlign: 'center', marginBottom: '8px' }}>
              Where do you start?
            </h1>
            <p style={{ textAlign: 'center', color: '#888', marginBottom: '32px', fontSize: '15px' }}>
              Pick your level. Starting higher assumes you know all earlier vocabulary.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {(language === 'chinese' ? chineseLevels : japaneseLevels).map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setLevel(lvl)}
                  style={{
                    padding: '20px', borderRadius: '12px',
                    border: `2px solid ${level === lvl ? accent : '#e5e5e5'}`,
                    background: level === lvl ? `${accent}0D` : '#fff',
                    cursor: 'pointer', fontSize: '15px', fontWeight: 600,
                    color: level === lvl ? accent : '#1a1a1a', transition: 'all 0.2s',
                  }}
                >
                  {language === 'chinese' ? 'HSK ' + lvl : getLevelLabel('japanese', 'jlpt', lvl)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
              <button onClick={() => setStep(1)} style={backBtn}>Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!level}
                style={{ ...nextBtn(accent), opacity: level ? 1 : 0.4 }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Daily goal */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 600, textAlign: 'center', marginBottom: '8px' }}>
              Daily goal
            </h1>
            <p style={{ textAlign: 'center', color: '#888', marginBottom: '32px', fontSize: '15px' }}>
              How many new cards do you want to learn each day?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { val: 5, label: 'Casual', desc: '5 new cards / day' },
                { val: 10, label: 'Regular', desc: '10 new cards / day' },
                { val: 15, label: 'Intensive', desc: '15 new cards / day' },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setGoal(opt.val)}
                  style={{
                    padding: '16px 20px', borderRadius: '12px',
                    border: `2px solid ${goal === opt.val ? accent : '#e5e5e5'}`,
                    background: goal === opt.val ? `${accent}0D` : '#fff',
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: goal === opt.val ? accent : '#1a1a1a' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: '13px', color: '#888' }}>{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            {error && <p style={{ color: '#E5484D', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
              <button onClick={() => setStep(2)} style={backBtn}>Back</button>
              <button onClick={handleFinish} disabled={saving} style={nextBtn(accent)}>
                {saving ? 'Setting up...' : 'Start learning'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const langCard = () => ({
  display: 'flex', alignItems: 'center', gap: '20px',
  padding: '20px 24px', borderRadius: '14px',
  border: '1px solid #e5e5e5', background: '#fff',
  cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
  width: '100%',
})

const backBtn = {
  flex: 1, padding: '12px', borderRadius: '10px',
  border: '1px solid #e5e5e5', background: '#fff',
  cursor: 'pointer', fontSize: '15px', fontWeight: 500,
}

const nextBtn = (accent) => ({
  flex: 2, padding: '12px', borderRadius: '10px',
  border: 'none', background: accent, color: '#fff',
  cursor: 'pointer', fontSize: '15px', fontWeight: 500,
})