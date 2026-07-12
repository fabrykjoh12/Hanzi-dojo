import { useState, useEffect, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { getHomeCounts } from './homeCounts'
import { pathToView, viewToPath, isKnownView } from './routes'
import { useIsMobile } from './useIsMobile'
import { ThemeContext } from './ThemeContext'
// Eager: the app shell + first-paint screens.
import Landing from './Landing'
import PasswordReset from './PasswordReset'
import Toasts from './Toasts'
import OfflineBar from './OfflineBar'
import Feedback from './Feedback'
import Onboarding from './Onboarding'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import Background from './Background'
import Home from './Home'
// Lazy: heavier/less-frequent screens are code-split so the initial load stays
// small (Home is what most sessions open to). react-router basename is unaffected.
const Study = lazy(() => import('./Study'))
const Writing = lazy(() => import('./Writing'))
const Test = lazy(() => import('./Test'))
const Stories = lazy(() => import('./Stories'))
const Listen = lazy(() => import('./Listen'))
const Tones = lazy(() => import('./Tones'))
const Kana = lazy(() => import('./Kana'))
const Cyrillic = lazy(() => import('./Cyrillic'))
const FillBlank = lazy(() => import('./FillBlank'))
const SentenceBuilder = lazy(() => import('./SentenceBuilder'))
const Writer = lazy(() => import('./Writer'))
const Practice = lazy(() => import('./Practice'))
const Words = lazy(() => import('./Words'))
const Grammar = lazy(() => import('./Grammar'))
const Profile = lazy(() => import('./Profile'))
const YouTube = lazy(() => import('./YouTube'))
const LanguageSwitcher = lazy(() => import('./LanguageSwitcher'))
const Settings = lazy(() => import('./Settings'))
const NotFound = lazy(() => import('./NotFound'))

// Calm centered fallback while a lazy screen loads.
function ViewFallback() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '30px', color: 'var(--text-faint)', fontFamily: "'Noto Sans SC'" }}>学</div>
    </div>
  )
}

// Route ⇄ view mapping lives in ./routes (testable, and shared with the
// unknown-route guard below).

// Initial theme before a profile loads: always start light. A signed-in user's
// saved preference (loaded from their profile) takes over once it arrives, so a
// deliberate dark-mode choice is still respected — only the very first paint and
// signed-out visitors default to light.
function initialTheme() {
  return 'light'
}

// ── Main app ──────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [track, setTrack] = useState(null)
  const [counts, setCounts] = useState({ newCount: 0, learnCount: 0, dueCount: 0, easyCount: 0, totalWords: 0, learnedCount: 0, masteredCount: 0, masteredPct: 0 })
  const [loading, setLoading] = useState(true)
  // A story to open directly when navigating to Stories (set by the post-study
  // recap's "Read unlocked story" CTA). Consumed and cleared by Stories on load.
  const [pendingStoryId, setPendingStoryId] = useState(null)
  // True while the user arrived via a password-recovery email link and hasn't
  // set a new password yet (Supabase signs them in and fires PASSWORD_RECOVERY).
  const [recovery, setRecovery] = useState(false)
  const [theme, setThemeState] = useState(initialTheme)
  const isMobile = useIsMobile()
  const routerNavigate = useNavigate()
  const location = useLocation()
  const view = pathToView(location.pathname)

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
      if (_event === 'PASSWORD_RECOVERY') setRecovery(true)
      // A stale recovery flag must not survive into the next normal login.
      if (_event === 'SIGNED_OUT') setRecovery(false)
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setTrack(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Navigate between views (updates the URL). Profile/track/counts reload only
  // when landing on Home — the dashboard is the one view that renders them, and
  // study/practice screens patch the in-memory profile live via their
  // onUpdate/onStreakUpdate callbacks. (Previously every view switch refired
  // ~5 queries, so opening Settings cost a full dashboard reload.)
  const navigate = (key, opts) => {
    if (opts && opts.storyId) setPendingStoryId(opts.storyId)
    routerNavigate(viewToPath(key))
    if (session && key === 'home') loadProfile(session.user.id)
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
    return <Landing />
  }

  if (recovery) {
    return (
      <>
        <Background language="chinese" />
        <PasswordReset onDone={() => setRecovery(false)} />
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
        onNavigate={navigate}
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
        onNavigate={navigate}
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
  } else if (view === 'cyrillic') {
    content = (
      <Cyrillic
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else if (view === 'practice') {
    content = (
      <Practice
        profile={profile}
        track={track}
        counts={counts}
        onNavigate={navigate}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'words') {
    content = (
      <Words
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('practice')}
      />
    )
  } else if (view === 'grammar') {
    content = (
      <Grammar
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else if (view === 'strokes') {
    content = (
      <Writer
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'builder') {
    content = (
      <SentenceBuilder
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  } else if (view === 'fillblank') {
    content = (
      <FillBlank
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
        initialStoryId={pendingStoryId}
        onInitialStoryConsumed={() => setPendingStoryId(null)}
      />
    )
  } else if (view === 'profile') {
    content = (
      <Profile
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onNavigate={navigate}
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
  } else if (isKnownView(view)) {
    // Only 'home' reaches here (every other known view has a branch above).
    content = (
      <Home
        profile={profile}
        track={track}
        counts={counts}
        onNavigate={navigate}
      />
    )
  } else {
    // A genuinely unknown path — show an explicit 404 instead of silently
    // falling through to Home, which used to hide typos and dead links.
    content = <NotFound onHome={() => navigate('home')} />
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
          <Suspense fallback={<ViewFallback />}>
            {content}
          </Suspense>
        </div>
        {isMobile && <MobileNav view={view} onNavigate={navigate} onLogout={handleLogout} />}
        {/* Calm screens only — floating over Study it covered the Easy grade
            button, and the story reader has its own bottom audio bar. */}
        {['home', 'practice', 'profile', 'settings', 'words', 'grammar', 'languages'].indexOf(view) !== -1 && (
          <Feedback session={session} profile={profile} view={view} />
        )}
        <Toasts />
        <OfflineBar session={session} />
      </div>
    </ThemeContext.Provider>
  )
}
