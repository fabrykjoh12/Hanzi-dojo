import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import ErrorBoundary from './ErrorBoundary'
import { getHomeCounts } from './homeCounts'
import {
  pathToView, viewToPath, isKnownView, readStoryId, isAssessmentPath, trustPageKey,
  storyRoute, storyPath, seriesPath, legacyRedirectPath, isResetPasswordPath,
} from './routes'
import { authNoticeFromSearch } from './nativeAuth'
import { startSession, endSession, setAnalyticsContext, trackOnce, EVENTS } from './analytics'
import { isBootstrapFailure } from './supabaseErrors'
import { ensureLanguageFont } from './fontLoader'
import { shouldRefreshHome } from './homeRefresh'
import { useIsMobile } from './useIsMobile'
import { ThemeContext } from './ThemeContext'
// Eager: the app shell + first-paint screens.
import Landing from './Landing'
import PasswordReset from './PasswordReset'
import Toasts from './Toasts'
import OfflineBar from './OfflineBar'
import Feedback from './Feedback'
import Onboarding from './Onboarding'
import FirstMissionWelcome from './FirstMissionWelcome'
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
// .jsx explicitly: fillBlank.js sits beside FillBlank.jsx, and on a
// case-insensitive filesystem './FillBlank' resolves to the logic module,
// which has no default export. A dynamic import is not checked at build
// time, so that failed only at runtime, only in the iOS/macOS build.
const FillBlank = lazy(() => import('./FillBlank.jsx'))
const Speaking = lazy(() => import('./Speaking'))
const SentenceBuilder = lazy(() => import('./SentenceBuilder'))
const Writer = lazy(() => import('./Writer'))
const Practice = lazy(() => import('./Practice'))
const Words = lazy(() => import('./Words'))
const KnownWords = lazy(() => import('./KnownWords'))
const Analyzer = lazy(() => import('./Analyzer'))
const Dictionary = lazy(() => import('./Dictionary'))
const Grammar = lazy(() => import('./Grammar'))
const GrammarPractice = lazy(() => import('./GrammarPractice'))
const Profile = lazy(() => import('./Profile'))
const YouTube = lazy(() => import('./YouTube'))
const LanguageSwitcher = lazy(() => import('./LanguageSwitcher'))
const Settings = lazy(() => import('./Settings'))
const DojoHQ = lazy(() => import('./DojoHQ'))
// Public story page: only reached via a shared /read/:id link, so code-split it
// out of the first-paint bundle (it pulls in storyReading.js).
const PublicStory = lazy(() => import('./PublicStory'))
const HowMuchCanYouRead = lazy(() => import('./HowMuchCanYouRead'))
const TrustPages = lazy(() => import('./TrustPages'))
const Dev = lazy(() => import('./Dev'))
const NotFound = lazy(() => import('./NotFound'))
const Dashboard = lazy(() => import('./Dashboard'))

// Visually hidden, but read. Inline (the project styles inline), so a screen
// reader gets a word where the glyph below is only a mood.
const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: 0,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

// Calm centered fallback while a lazy screen loads. The 学 is decoration — a
// screen reader announcing a lone Chinese character on every route change is
// noise, so it is hidden and the status line says what is actually happening.
function ViewFallback() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span role="status" style={SR_ONLY}>Loading…</span>
      <div aria-hidden="true" lang="zh-Hans" style={{ fontSize: '30px', color: 'var(--text-faint)', fontFamily: "'Noto Sans SC'" }}>学</div>
    </div>
  )
}

// Route ⇄ view mapping lives in ./routes (testable, and shared with the
// unknown-route guard below).

// The daily review reminder is sent by an hourly server-side job, which needs
// to know what hour it is where the learner actually is — the browser is the
// only thing that knows. Best-effort in every direction: skipped when the
// zone is unavailable or unchanged (so this is never a write on every load),
// and a failed write is swallowed, because a reminder preference must never
// break app startup.
function recordTimezone(userId, storedTimezone) {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz || tz === storedTimezone) return
    supabase.from('profiles').update({ timezone: tz }).eq('id', userId).then(() => {}, () => {})
  } catch {
    // No Intl zone available (or the write threw synchronously) — the sender
    // falls back to the old UTC-hour behavior for a profile with no zone.
  }
}

// ── Main app ──────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [track, setTrack] = useState(null)
  const [counts, setCounts] = useState({ newCount: 0, learnCount: 0, dueCount: 0, easyCount: 0, totalWords: 0, learnedCount: 0, masteredCount: 0, masteredPct: 0 })
  const [loading, setLoading] = useState(true)
  // True when the profile/track bootstrap FAILED (network/server), as opposed
  // to legitimately finding nothing — the two must render differently.
  const [bootstrapError, setBootstrapError] = useState(false)
  // A story to open directly when navigating to Stories (set by the post-study
  // recap's "Read unlocked story" CTA). Consumed and cleared by Stories on load.
  const [pendingStoryId, setPendingStoryId] = useState(null)
  // Today's studied words to highlight in the reader (set alongside a deep-link
  // from the post-study recap; consumed by Stories with the story id).
  const [pendingStoryWords, setPendingStoryWords] = useState(null)
  const [pendingPracticeWords, setPendingPracticeWords] = useState(null)
  // First mission: true from onboarding completion until the welcome hands off
  // to the guided first session; and carried into the reader (via the deep-link)
  // for the "first story" reading hint + completion line.
  const [justOnboarded, setJustOnboarded] = useState(false)
  // Words the user tasted during onboarding's pre-login taste flow (if any),
  // captured on completion so the first-session welcome can reference them —
  // Onboarding clears the pre-login prefs itself on mount, so it can't be read
  // back out of storage afterward.
  const [justTastedWords, setJustTastedWords] = useState([])
  const [pendingStoryFirstMission, setPendingStoryFirstMission] = useState(false)
  // True while the user arrived via a password-recovery email link and hasn't
  // set a new password yet (Supabase signs them in and fires PASSWORD_RECOVERY).
  const [recovery, setRecovery] = useState(false)
  // Start light before a profile loads; a signed-in user's saved preference
  // takes over once their profile arrives, so a deliberate dark choice is kept.
  const [theme, setThemeState] = useState('light')
  const isMobile = useIsMobile()
  const routerNavigate = useNavigate()
  const location = useLocation()
  const view = pathToView(location.pathname)
  const publicStoryId = readStoryId(location.pathname)
  const assessment = isAssessmentPath(location.pathname)
  const trustPage = trustPageKey(location.pathname)
  const storyRouteState = storyRoute(location.pathname)

  useEffect(() => {
    const canonical = legacyRedirectPath(location.pathname)
    if (canonical) routerNavigate(canonical, { replace: true })
  }, [location.pathname, routerNavigate])

  // Apply the theme to the document so the CSS variables (index.css) switch.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Fetch the active language's web font if the base stylesheet doesn't
  // already carry it. Only the paused tracks need this, so for the Chinese
  // product it is a no-op — which is the point: nobody downloads a CJK family
  // for a language they never open (see fontLoader.js).
  useEffect(() => {
    if (profile && profile.active_language) ensureLanguageFont(profile.active_language)
  }, [profile])

  // Move focus to the main content region when the view changes, so keyboard
  // and screen-reader users land on the new screen instead of being stranded on
  // the nav item they clicked. No-op on views without the shell (e.g. Landing).
  const mainRef = useRef(null)
  // When the dashboard data was last loaded, so returning to Home can skip a
  // refetch it doesn't need (homeRefresh.js). A ref, not state: reading it
  // must never itself trigger a render.
  const homeLoadedAt = useRef(null)
  useEffect(() => {
    if (mainRef.current) mainRef.current.focus({ preventScroll: true })
  }, [view])
  // …and show a ring when it lands, or the skip link is a jump with no visible
  // confirmation. Only when the focus is keyboard-driven: `:focus-visible`
  // stays false for the same focus() call made after a mouse click on a nav
  // item, so pointer users never see the outline. Inline styles can't carry a
  // pseudo-class, hence the explicit check.
  const [mainFocusRing, setMainFocusRing] = useState(false)
  const onMainFocus = (e) => {
    if (e.target !== e.currentTarget) return
    let visible = true
    try { visible = e.currentTarget.matches(':focus-visible') } catch { /* no :focus-visible — show it */ }
    setMainFocusRing(visible)
  }
  const onMainBlur = (e) => {
    if (e.target === e.currentTarget) setMainFocusRing(false)
  }

  const setTheme = (next) => {
    setThemeState(next)
    if (session) {
      // Best-effort persistence; harmless if the `theme` column doesn't exist yet.
      supabase.from('profiles').update({ theme: next }).eq('id', session.user.id).then(() => {})
    }
  }
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  // The whole bootstrap runs inside try/catch/finally so a throw anywhere
  // (e.g. getHomeCounts) can never strand the app on the 学 splash with
  // loading stuck true — the one state with no way out. A throw is a
  // bootstrap failure like any other. (Kept as ONE function on purpose:
  // splitting the body into a helper makes the hooks linter stop seeing
  // loadProfile as stable and warn on every effect that calls it.)
  const loadProfile = async (userId) => {
    try {
    // Both queries key on the user id alone, so they go out together rather
    // than tracks waiting on profile — the active track is picked from the
    // result below. One less round trip before anything can render.
    const [{ data: prof, error: profError }, { data: allTracks, error: trackError }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('language_tracks').select('*').eq('user_id', userId).eq('is_active', true),
    ])

    // "The query failed" and "there is no profile row" are different worlds:
    // the second means onboarding, the first means we don't KNOW — treating a
    // flaky network as a blank account would drop an existing learner into
    // onboarding. Show the retry screen instead (see the render gate below).
    if (isBootstrapFailure(profError)) {
      setBootstrapError(true)
      setLoading(false)
      return
    }
    setBootstrapError(false)

    if (!prof) { setLoading(false); return }

    // Apply the user's saved theme preference, if any.
    if (prof.theme === 'dark' || prof.theme === 'light') setThemeState(prof.theme)

    // Keep the profile's timezone current so the hourly reminder sender can
    // fire at the right hour on *this* user's clock (see
    // src/reminderSchedule.js). Written only when missing or changed, so a
    // normal app load stays read-only, and best-effort in every direction —
    // a reminder preference must never break startup.
    recordTimezone(userId, prof.timezone)

    // Same distinction as the profile above: a missing track means onboarding,
    // a failed query means retry. (The old per-language `.single()` treated
    // "no track for this language" as PGRST116, which isBootstrapFailure
    // already excluded; selecting the list instead makes that explicit — an
    // account with no track for its active language simply finds none.)
    if (isBootstrapFailure(trackError)) {
      setBootstrapError(true)
      setLoading(false)
      return
    }

    const finalProf = prof
    const finalTrack = (allTracks || []).find(t => t.language === prof.active_language) || null

    if (finalTrack) {
      const c = await getHomeCounts(userId, finalTrack, finalProf.daily_new_cards)
      setCounts(c)
    }

    homeLoadedAt.current = Date.now()
    setProfile(finalProf)
    setTrack(finalTrack)
    // Analytics context — so every subsequent event carries who / language / level.
    setAnalyticsContext({
      userId,
      language: finalProf.active_language,
      level: finalTrack ? finalTrack.current_level : null,
    })
    } catch {
      setBootstrapError(true)
    } finally {
      setLoading(false)
    }
  }

  // Analytics session envelope: one "session started" per app-load, and a
  // "session ended" (with duration) when the tab is hidden/closed. Best-effort.
  useEffect(() => {
    startSession()
    const end = () => endSession()
    window.addEventListener('pagehide', end)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') end() })
    return () => window.removeEventListener('pagehide', end)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) { setAnalyticsContext({ userId: session.user.id }); loadProfile(session.user.id) }
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

  // A signed-in user who opens a public /read/:id link goes to the in-app
  // reader for that story (the loading gate below guarantees session is known,
  // so this never flashes for a genuine anonymous visitor).
  useEffect(() => {
    if (!loading && session && publicStoryId) {
      // Intentional: hand the story id to the deep-link machinery, then redirect
      // into the reader. Same sanctioned pattern as Background/StoryReader.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingStoryId(publicStoryId)
      routerNavigate(storyPath(publicStoryId), { replace: true })
    }
  }, [loading, session, publicStoryId, routerNavigate])

  // Navigate between views (updates the URL). Profile/track/counts reload only
  // when landing on Home — the dashboard is the one view that renders them, and
  // study/practice screens patch the in-memory profile live via their
  // onUpdate/onStreakUpdate callbacks. (Previously every view switch refired
  // ~5 queries, so opening Settings cost a full dashboard reload.)
  const navigate = (key, opts) => {
    if (opts && opts.storyId) setPendingStoryId(opts.storyId)
    if (opts && opts.todayWords) setPendingStoryWords(opts.todayWords)
    if (opts && opts.firstMission) setPendingStoryFirstMission(true)
    if (opts && opts.practiceWords) setPendingPracticeWords(opts.practiceWords)
    else if (key === 'fillblank') setPendingPracticeWords(null) // normal hub open — no stale story pool
    routerNavigate(key === 'stories' && opts?.storyId ? storyPath(opts.storyId) : viewToPath(key))
    // Refetch the dashboard when landing on Home — but not after a detour
    // through a screen that provably changed nothing (see homeRefresh.js).
    if (session && key === 'home' && shouldRefreshHome(view, homeLoadedAt.current)) {
      loadProfile(session.user.id)
    }
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

  // Public story link — works signed-out. (Signed-in visitors are redirected
  // into the reader by the effect above.)
  if (publicStoryId && !session) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <PublicStory storyId={publicStoryId} />
      </Suspense>
    )
  }

  // Public reading assessment — works for everyone (signed-in visitors get a
  // "Back to app" CTA instead of the signup gate), so it's checked before the
  // Landing gate.
  if (assessment) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <HowMuchCanYouRead />
      </Suspense>
    )
  }

  // Public trust pages (/privacy, /terms, /support, /methodology) — must be
  // readable before registration, and stay reachable signed-in.
  if (trustPage) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <TrustPages page={trustPage} onBack={() => routerNavigate('/')} />
      </Suspense>
    )
  }

  if (!session) {
    // A returning auth link that could not be completed (expired, or opened on
    // a device that never held the PKCE verifier) explains itself on the
    // sign-in screen rather than looking like a broken app.
    return <Landing authNotice={authNoticeFromSearch(location.search)} />
  }

  // A signed-in visitor on /read/:id is being redirected into the reader by the
  // effect above; render the loading fallback (not the view switch) so the
  // NotFound branch never flashes before the redirect commits.
  if (publicStoryId) {
    return <ViewFallback />
  }

  // Two ways in, one screen: the web link fires PASSWORD_RECOVERY (Supabase
  // reads its own tokens out of the URL), while the app arrives on the
  // recovery route after NativeShellBridge exchanges the deep link's code.
  if (recovery || isResetPasswordPath(location.pathname)) {
    return (
      <>
        <Background language="chinese" />
        <PasswordReset onDone={() => { setRecovery(false); routerNavigate(viewToPath('home'), { replace: true }) }} />
      </>
    )
  }

  // The bootstrap FAILED (network/server) — we don't know whether this account
  // has a profile, so neither Onboarding nor the app would be honest. A calm
  // retry beats dropping an existing learner into a signup flow.
  if (bootstrapError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
        <div style={{ maxWidth: '340px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', color: 'var(--chinese-accent)', fontFamily: "'Noto Sans SC'", marginBottom: '14px' }}>学</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px', fontFamily: 'Inter, sans-serif' }}>
            Couldn’t load your account
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '18px', fontFamily: 'Inter, sans-serif' }}>
            The connection dropped while loading your profile. Your progress is safe — try again.
          </div>
          <button
            onClick={() => { setBootstrapError(false); setLoading(true); loadProfile(session.user.id) }}
            style={{
              padding: '11px 22px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: 'var(--chinese-accent)', color: '#fff',
              fontSize: '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!profile || !track) {
    return (
      <>
        <Background language="chinese" />
        <Onboarding session={session} onComplete={(tastedWords) => { loadProfile(session.user.id); setJustOnboarded(true); setJustTastedWords(tastedWords || []) }} />
      </>
    )
  }

  // First Mission — a clean welcome, then straight into the guided first session
  // (Study self-detects first-run and caps it to 5 words).
  if (justOnboarded) {
    return (
      <>
        <Background language={profile.active_language} />
        <FirstMissionWelcome tastedWords={justTastedWords} onStart={() => { trackOnce(EVENTS.FIRST_MISSION_STARTED); setJustOnboarded(false); navigate('study') }} />
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
        onProfileUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
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
        onProfileUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
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
      />
    )
  } else if (view === 'kana') {
    content = (
      <Kana
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'cyrillic') {
    content = (
      <Cyrillic
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
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
  } else if (view === 'analyzer') {
    content = (
      <Analyzer
        session={session}
        track={track}
        onBack={() => navigate('practice')}
      />
    )
  } else if (view === 'known') {
    content = (
      <KnownWords
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'dictionary') {
    content = (
      <Dictionary
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
      />
    )
  } else if (view === 'grammarpractice') {
    content = (
      <GrammarPractice
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('practice')}
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
      />
    )
  } else if (view === 'fillblank') {
    content = (
      <FillBlank
        session={session}
        profile={profile}
        track={track}
        pool={pendingPracticeWords}
        onBack={() => { setPendingPracticeWords(null); navigate(pendingPracticeWords ? 'stories' : 'home') }}
      />
    )
  } else if (view === 'speak') {
    content = (
      <Speaking
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('practice')}
      />
    )
  } else if (view === 'tones') {
    content = (
      <Tones
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
      />
    )
  } else if (view === 'stories') {
    content = (
      <Stories
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onNavigate={navigate}
        initialStoryId={pendingStoryId || (storyRouteState?.kind === 'story' ? storyRouteState.id : null)}
        initialStoryWords={pendingStoryWords}
        initialStoryFirstMission={pendingStoryFirstMission}
        routeKind={storyRouteState?.kind || 'browse'}
        routeStoryId={storyRouteState?.kind === 'story' ? storyRouteState.id : null}
        routeSeriesKey={storyRouteState?.kind === 'series' ? storyRouteState.key : null}
        onStoryRoute={(id) => routerNavigate(storyPath(id))}
        onSeriesRoute={(key) => routerNavigate(seriesPath(key))}
        onBrowseRoute={() => routerNavigate(viewToPath('stories'))}
        onInitialStoryConsumed={() => { setPendingStoryId(null); setPendingStoryWords(null); setPendingStoryFirstMission(false) }}
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
        onBack={() => navigate('profile')}
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
        onBack={() => navigate('profile')}
      />
    )
  } else if (view === 'hq') {
    // Dojo HQ is internal tooling, not a learner surface. Gated the same way
    // as the admin dashboard: a non-admin who types /hq gets a 404, because
    // hiding a menu entry is not access control.
    content = profile.is_admin
      ? <DojoHQ session={session} profile={profile} />
      : <NotFound onHome={() => navigate('home')} />
  } else if (view === 'dev') {
    // Developer tools — email-gated inside the component; every action is
    // RLS-scoped to the signed-in account. Not linked from the main nav.
    content = (
      <Dev
        session={session}
        profile={profile}
        track={track}
        onBack={() => navigate('home')}
        onNavigate={navigate}
      />
    )
  } else if (view === 'dashboard') {
    content = profile.is_admin
      ? <Dashboard onBack={() => navigate('home')} session={session} profile={profile} track={track} />
      : <NotFound onHome={() => navigate('home')} />
  } else if (isKnownView(view)) {
    // Only 'home' reaches here (every other known view has a branch above).
    content = (
      <Home
        profile={profile}
        track={track}
        counts={counts}
        session={session}
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
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div style={{
        display: 'flex', minHeight: '100vh', alignItems: 'stretch',
        position: 'relative',
        background: 'var(--bg)',
      }}>
        <Background language={profile.active_language} />
        {!isMobile && (
          <div style={{ position: 'relative', zIndex: 10 }}>
            <Sidebar
              view={view} onNavigate={navigate} onLogout={handleLogout}
              isAdmin={!!profile.is_admin} language={profile.active_language}
              profile={profile} track={track} email={session.user.email} counts={counts}
            />
          </div>
        )}
        <main id="main-content" tabIndex={-1} ref={mainRef} onFocus={onMainFocus} onBlur={onMainBlur} style={{
          flex: 1, minWidth: 0, position: 'relative', zIndex: 1,
          // Drawn inside the box: an outer ring on a full-height pane that
          // touches the viewport edges would be cropped away.
          outline: mainFocusRing ? '2px solid var(--text-muted)' : 'none',
          outlineOffset: mainFocusRing ? '-3px' : 0,
          // The native shell draws under the status bar / notch (viewport-fit=cover
          // + iOS contentInset "never"), so the shell owns the top inset once, here,
          // for every in-flow screen. Fixed overlays (Toasts, ChatMission, the
          // reader's own bars) are positioned against the viewport, not this box,
          // so they still carry their own inset.
          paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
          // Leave room for the fixed bottom bar so content isn't hidden behind it.
          paddingBottom: isMobile
            ? 'calc(' + (view === 'study' || view === 'weak' ? 62 : 94) + 'px + env(safe-area-inset-bottom))'
            : 0,
        }}>
          {/* Per-view boundary keyed on `view`: a screen that throws (or a stale
              lazy chunk after a deploy) degrades to the recovery UI without
              taking down the shell, and recovers on the next navigation. */}
          <Suspense fallback={<ViewFallback />}>
            <ErrorBoundary key={view}>
              {content}
            </ErrorBoundary>
          </Suspense>
        </main>
        {isMobile && <MobileNav view={view} onNavigate={navigate} onLogout={handleLogout} isAdmin={!!profile.is_admin} language={profile.active_language} />}
        {/* Calm screens only — floating over Study it covered the Easy grade
            button, and the story reader has its own bottom audio bar. */}
        {['practice', 'profile', 'settings', 'words', 'grammar', 'languages'].indexOf(view) !== -1 && (
          <Feedback session={session} profile={profile} view={view} />
        )}
        <Toasts />
        <OfflineBar session={session} />
      </div>
    </ThemeContext.Provider>
  )
}
