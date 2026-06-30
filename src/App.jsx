import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Auth from './Auth'
import Onboarding from './Onboarding'
import Study from './Study'
import Writing from './Writing'
import Test from './Test'
import Stories from './Stories'
import Listen from './Listen'
import Tones from './Tones'
import Kana from './Kana'
import { getHomeCounts } from './homeCounts'
import Profile from './Profile'
import YouTube from './YouTube'
import LanguageSwitcher from './LanguageSwitcher'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import { useIsMobile } from './useIsMobile'
import { ThemeContext } from './ThemeContext'
import Background from './Background'
import Home from './Home'
import Settings from './Settings'

// Initial theme before a profile loads: follow the OS preference.
function osTheme() {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch (e) { /* noop */ }
  return 'light'
}

// ── Main app ──────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [track, setTrack] = useState(null)
  const [counts, setCounts] = useState({ newCount: 0, learnCount: 0, dueCount: 0, easyCount: 0, totalWords: 0, learnedCount: 0, masteredCount: 0, masteredPct: 0 })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('home')
  const [theme, setThemeState] = useState(osTheme)
  const isMobile = useIsMobile()

  // Apply the theme to the document so the CSS variables (index.css) switch.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = (next) => {
    setThemeState(next)
    if (session) {
      // Best-effort persistence; harmless if the `theme` column doesn't exist yet.
      supabase.from('profiles').update({ theme: next }).eq('id', session.user.id).then(() => {})
    }
  }
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  const loadProfile = async (userId) => {
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!prof) { setLoading(false); return }

    // Apply the user's saved theme preference, if any.
    if (prof.theme === 'dark' || prof.theme === 'light') setThemeState(prof.theme)

    const { data: tr } = await supabase
      .from('language_tracks')
      .select('*')
      .eq('user_id', userId)
      .eq('language', prof.active_language)
      .eq('is_active', true)
      .single()

    const finalProf = prof
    const finalTrack = tr

    if (finalTrack) {
      const c = await getHomeCounts(userId, finalTrack, finalProf.daily_new_cards)
      setCounts(c)
    }

    setProfile(finalProf)
    setTrack(finalTrack)
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
      else { setProfile(null); setTrack(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Navigate between views; refresh counts so the dashboard stays current.
  const navigate = (key) => {
    setView(key)
    if (session) loadProfile(session.user.id)
  }

  const handleLogout = () => supabase.auth.signOut()

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ fontSize: '32px', color: 'var(--chinese-accent)', fontFamily: "'Noto Sans SC'" }}>学</div>
      </div>
    )
  }

  if (!session) {
    return (
      <>
        <Background language="chinese" />
        <Auth />
      </>
    )
  }

  if (!profile || !track) {
    return (
      <>
        <Background language="chinese" />
        <Onboarding session={session} onComplete={() => loadProfile(session.user.id)} />
      </>
    )
  }

  // ── Content for the selected view ─────────────────────────────────────────
  let content
  if (view === 'study') {
    content = (
      <Study
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onStreakUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else if (view === 'weak') {
    content = (
      <Study
        session={session}
        profile={profile}
        track={track}
        mode="weak"
        onBack={() => navigate('home')}
        onStreakUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else if (view === 'test') {
    content = (
      <Test
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'writing') {
    content = (
      <Writing
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'listen') {
    content = (
      <Listen
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else if (view === 'kana') {
    content = (
      <Kana
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else if (view === 'tones') {
    content = (
      <Tones
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else if (view === 'stories') {
    content = (
      <Stories
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'profile') {
    content = (
      <Profile
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else if (view === 'languages') {
    content = (
      <LanguageSwitcher
        session={session}
        profile={profile}
        onSwitch={() => navigate('home')}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'youtube') {
    content = (
      <YouTube
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'settings') {
    content = (
      <Settings
        session={session}
        profile={profile}
        onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else {
    content = (
      <Home
        profile={profile}
        track={track}
        counts={counts}
        onNavigate={navigate}
      />
    )
  }

  // ── App shell: persistent sidebar + content area ──────────────────────────
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      <div style={{
        display: 'flex', minHeight: '100vh', alignItems: 'stretch',
        position: 'relative',
        background: 'var(--bg)',
      }}>
        <Background language={profile.active_language} />
        {!isMobile && (
          <div style={{ position: 'relative', zIndex: 10 }}>
            <Sidebar view={view} onNavigate={navigate} onLogout={handleLogout} />
          </div>
        )}
        <div style={{
          flex: 1, minWidth: 0, position: 'relative', zIndex: 1,
          // Leave room for the fixed bottom bar so content isn't hidden behind it.
          paddingBottom: isMobile ? 'calc(62px + env(safe-area-inset-bottom))' : 0,
        }}>
          {content}
        </div>
        {isMobile && <MobileNav view={view} onNavigate={navigate} onLogout={handleLogout} />}
      </div>
    </ThemeContext.Provider>
  )
}
