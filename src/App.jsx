import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Auth from './Auth'
import Onboarding from './Onboarding'
import Study from './Study'
import Test from './Test'
import { getTestStatus } from './testLogic'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [track, setTrack] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('home')

  const loadProfile = async (userId) => {
    // Fetch profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!prof) { setLoading(false); return }

    // Fetch active language track
    const { data: tr } = await supabase
      .from('language_tracks')
      .select('*')
      .eq('user_id', userId)
      .eq('language', prof.active_language)
      .eq('is_active', true)
      .single()

    // Check if user should advance to next level
    const { prof: finalProf, track: finalTrack } = await checkAndAdvance(prof, tr)

    setProfile(finalProf)
    setTrack(finalTrack)
    setLoading(false)
  }

  // Advance to next level if test passed AND all cards are Easy
  const checkAndAdvance = async (prof, tr) => {
    if (!tr) return { prof, track: tr }

    // Has the test been passed for this level?
    const { data: unlock } = await supabase
      .from('level_unlocks')
      .select('*')
      .eq('user_id', prof.id)
      .eq('language', tr.language)
      .eq('system', tr.system)
      .eq('level', tr.current_level)
      .maybeSingle()

    if (!unlock) return { prof, track: tr }

    // Are all vocab in this level marked Easy?
    const status = await getTestStatus(prof.id, tr)
    if (!status.allEasy) return { prof, track: tr }

    // Advance level
    let nextLevel = tr.current_level
    if (tr.language === 'chinese' && tr.current_level < 9) nextLevel = tr.current_level + 1
    if (tr.language === 'japanese' && tr.current_level > 1) nextLevel = tr.current_level - 1
    if (nextLevel === tr.current_level) return { prof, track: tr } // already at max

    const { data: newTrack } = await supabase
      .from('language_tracks')
      .update({ current_level: nextLevel })
      .eq('id', tr.id)
      .select()
      .single()

    return { prof, track: newTrack || { ...tr, current_level: nextLevel } }
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
      else { setProfile(null); setTrack(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={center}>
        <div style={{ fontSize: '32px', color: 'var(--chinese-accent)' }}>学</div>
      </div>
    )
  }

  if (!session) return <Auth />

  if (!profile || !track) {
    return (
      <Onboarding
        session={session}
        onComplete={() => loadProfile(session.user.id)}
      />
    )
  }

  const accent = profile.active_language === 'japanese' ? 'var(--japanese-accent)' : 'var(--chinese-accent)'
  const langChars = profile.active_language === 'japanese' ? '日本語' : '中文'
  const levelLabel = profile.active_language === 'chinese'
    ? `HSK ${track.current_level}`
    : `N${track.current_level}`

  // STUDY VIEW
  if (view === 'study') {
    return (
      <Study
        session={session}
        profile={profile}
        track={track}
        onBack={() => { setView('home'); loadProfile(session.user.id) }}
        onStreakUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  }

  // TEST VIEW
  if (view === 'test') {
    return (
      <Test
        session={session}
        profile={profile}
        track={track}
        onBack={() => { setView('home'); loadProfile(session.user.id) }}
      />
    )
  }

  // HOME VIEW
  return (
    <div style={{ minHeight: '100vh', maxWidth: '600px', margin: '0 auto', padding: '40px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <div style={{
            fontSize: '40px', color: accent, fontWeight: 500, lineHeight: 1,
            fontFamily: profile.active_language === 'japanese' ? "'Noto Sans JP'" : "'Noto Sans SC'",
          }}>
            {langChars}
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, marginTop: '8px' }}>{levelLabel}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '8px 14px', borderRadius: '20px',
            background: '#FFF4E5', border: '1px solid #FFE0B2',
          }}>
            <span style={{ fontSize: '18px' }}>🔥</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#E08C00' }}>{profile.streak || 0}</span>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', fontSize: '13px', color: '#888' }}
          >
            Log out
          </button>
        </div>
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

        <button onClick={() => setView('test')} style={sectionCard(accent)}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>✍️ Test</div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>Prove your level to advance</div>
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
            <div style={{ fontSize: '18px', fontWeight: 600 }}>▶️ YouTube</div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>Coming soon</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }

const sectionCard = (accent) => ({
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '20px 24px', borderRadius: '14px', border: '1px solid #eee',
  background: '#fff', cursor: 'pointer', textAlign: 'left', width: '100%',
  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
})