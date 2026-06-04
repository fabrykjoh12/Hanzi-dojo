import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Auth from './Auth'
import Onboarding from './Onboarding'
import Study from './Study'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('home')

  const loadProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div style={center}><div style={{ fontSize: '32px', color: 'var(--chinese-accent)' }}>学</div></div>
  }

  if (!session) return <Auth />

  if (!profile) {
    return <Onboarding session={session} onComplete={() => loadProfile(session.user.id)} />
  }

  const accent = profile.active_language === 'japanese' ? 'var(--japanese-accent)' : 'var(--chinese-accent)'
  const levelLabel = profile.active_language === 'chinese' ? `HSK ${profile.chinese_level}` : `JLPT N${profile.japanese_level}`
  const langChars = profile.active_language === 'japanese' ? '日本語' : '中文'

  // STUDY VIEW
  if (view === 'study') {
    return <Study session={session} profile={profile} onBack={() => setView('home')} />
  }

  // HOME VIEW (temporary, will get fancier later)
  return (
    <div style={{ minHeight: '100vh', maxWidth: '600px', margin: '0 auto', padding: '40px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <div style={{ fontSize: '40px', color: accent, fontWeight: 500, lineHeight: 1 }}>{langChars}</div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, marginTop: '8px' }}>{levelLabel}</h1>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', fontSize: '13px', color: '#888' }}
        >
          Log out
        </button>
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button onClick={() => setView('study')} style={sectionCard(accent)}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>📚 Flashcards</div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>Review your daily cards</div>
          </div>
          <span style={{ color: accent, fontSize: '20px' }}>→</span>
        </button>

        <div style={{ ...sectionCard('#ccc'), cursor: 'default', opacity: 0.5 }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>📖 Stories</div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>Coming soon</div>
          </div>
        </div>

        <div style={{ ...sectionCard('#ccc'), cursor: 'default', opacity: 0.5 }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>✍️ Test</div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>Coming soon</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }

const sectionCard = (accent) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '20px 24px',
  borderRadius: '14px',
  border: '1px solid #eee',
  background: '#fff',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
})