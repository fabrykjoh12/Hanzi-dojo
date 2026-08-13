import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import ErrorBoundary from './ErrorBoundary'
import { getHomeCounts } from './homeCounts'
import { isReturningFromBreak } from './gentleReturn'
import {
  viewToPath, isKnownView, readStoryId, isAssessmentPath, trustPageKey,
  storyPath, isResetPasswordPath, isTutorialPath,
} from './routes'
import { authNoticeFromSearch } from './nativeAuth'
import { markTutorialDone } from './prelogin'
import { startSession, endSession, setAnalyticsContext } from './analytics'
import { isBootstrapFailure } from './supabaseErrors'
import { ensureLanguageFont } from './fontLoader'
import { useIsMobile } from './useIsMobile'
import { ThemeContext } from './ThemeContext'
import { useNavigation } from './useNavigation'
import { useAndroidBack } from './useAndroidBack'
import { useNavMotion } from './useNavMotion'
import { useAppResume } from './useAppResume'
import { setCacheScope, readCache, writeCache } from './dataCache'
import { HOME_IDENTITY, HOME_COUNTS } from './cacheEvents'
import { countsExpired } from './homeData'
import { overlayScreen, tabBarVisible } from './navShell'
import { MOBILE_NAV_SPACE } from './navMetrics'
import TabHost from './TabHost'
import { StoriesDataProvider } from './StoriesDataProvider'
import SeriesScreen from './SeriesScreen'
import ReaderScreen from './ReaderScreen'
import { initialTheme, rememberTheme } from './themeBoot'
import { syncStatusBar } from './statusBar'
import { markAppReady } from './appReady'
import { isNativeApp } from './nativeShell'
// Eager: the app shell + first-paint screens.
import Landing from './Landing'
import PasswordReset from './PasswordReset'
import Toasts from './Toasts'
import OfflineBar from './OfflineBar'
import Feedback from './Feedback'
import Onboarding from './Onboarding'
import Tutorial from './Tutorial'
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
  // `loaded` is the shell's flag, not homeCounts': it separates "every count is
  // zero because nothing has been fetched" from "every count is zero because
  // the learner is done". Home waits for it before choosing a daily story,
  // which would otherwise be picked for someone who knows no words.
  const [counts, setCounts] = useState({ newCount: 0, learnCount: 0, dueCount: 0, easyCount: 0, totalWords: 0, learnedCount: 0, masteredCount: 0, masteredPct: 0, loaded: false })
  const [loading, setLoading] = useState(true)
  // True when the profile/track bootstrap FAILED (network/server), as opposed
  // to legitimately finding nothing — the two must render differently.
  const [bootstrapError, setBootstrapError] = useState(false)
  // A story to open directly when navigating to Stories (set by the post-study
  // recap's "Read unlocked story" CTA). Consumed and cleared by Stories on load.

  // Today's studied words to highlight in the reader (set alongside a deep-link
  // from the post-study recap; consumed by Stories with the story id).
  const [pendingStoryWords, setPendingStoryWords] = useState(null)
  const [pendingPracticeWords, setPendingPracticeWords] = useState(null)
  const [pendingStoryFirstMission, setPendingStoryFirstMission] = useState(false)
  // True while the user arrived via a password-recovery email link and hasn't
  // set a new password yet (Supabase signs them in and fires PASSWORD_RECOVERY).
  const [recovery, setRecovery] = useState(false)
  // The theme is already correct before this component mounts — index.html's
  // inline script sets `data-theme` from the same rules (themeBoot.js) before
  // the stylesheet paints. Seeding state from those rules rather than from a
  // hardcoded 'light' is what keeps React's first render agreeing with the
  // document it is rendering into: starting light and correcting later was a
  // full-screen white flash on every dark-mode cold start.
  //
  // The server profile still wins the moment it lands — this is the device
  // cache, not the record.
  const [theme, setThemeState] = useState(initialTheme)
  const isMobile = useIsMobile()
  const routerNavigate = useNavigate()
  const location = useLocation()
  // The navigation model is the runtime source of truth now; the pathname is
  // its projection. `view` is what is VISIBLE, which for a flow above the tabs
  // is the flow, not the tab underneath it.
  const nav = useNavigation()
  const view = nav.view
  // True while an actual flashcard is on screen — the one state that hides the
  // bottom bar from inside a tab root (NAV-MODEL §8.2). Study reports it; the
  // shell does not try to infer it.
  const [studySession, setStudySession] = useState({ immersive: false, inProgress: false })
  // Android's hardware back key now resolves from the model above, not from
  // the URL. Registered here and only here — the bridge holds the listener and
  // asks this shell for the answer (backHandler.js).
  useAndroidBack(nav, { immersiveFlow: studySession.immersive, onExitFlow: studySession.exit })
  // Transitions come from the same model. The shell animates the layer that
  // just became visible, in the direction the reducer says the hierarchy moved
  // — no screen decides how it arrives (navMotion.js).
  useNavMotion(nav.state)
  const publicStoryId = readStoryId(location.pathname)
  const assessment = isAssessmentPath(location.pathname)
  const tutorial = isTutorialPath(location.pathname)
  const trustPage = trustPageKey(location.pathname)

  // Apply the theme to the document so the CSS variables (index.css) switch,
  // remember it on the device so the NEXT launch is right before first paint,
  // and repaint the native status bar to match — otherwise the clock and
  // battery stay in the old theme's colours over the new background, which on
  // dark meant dark icons on a near-black bar.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    rememberTheme(theme)
    syncStatusBar(theme, { native: isNativeApp() })
  }, [theme])

  // Scope every cached query to who is signed in and what they are learning.
  //
  // The cache outlives components by design, so without this a shelf loaded for
  // one account could be read by the next one to sign in on the same device.
  // Namespacing makes that impossible by construction; the clear that comes
  // with a user change is what stops a signed-out learner's progress sitting in
  // memory. Runs before anything queries, and on every boundary — login,
  // logout, account change, language change.
  // A safety net for the paths loadProfile does not cover — a sign-out, or an
  // in-memory profile patch that changes the language. Returns 'unchanged' and
  // does nothing on an ordinary render.
  const activeLanguage = profile ? profile.active_language : null
  const currentUserId = session ? session.user.id : null
  useEffect(() => {
    setCacheScope({ userId: currentUserId, language: activeLanguage })
  }, [currentUserId, activeLanguage])

  // Tell the launch overlay it can leave (appReady.js → SplashIntro.jsx).
  //
  // `loading` false is the honest signal: it means the session/profile
  // bootstrap has SETTLED, and every way it can settle — a signed-in learner,
  // a blank account heading for onboarding, a network failure heading for the
  // retry card — is a screen worth revealing. Waiting for success instead
  // would hold the logo over the very failure it needs to show.
  useEffect(() => {
    if (!loading) markAppReady()
  }, [loading])

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

    // Scope the cache HERE, not in an effect. Effects run child-first, so an
    // effect in App fires AFTER the tab roots' own effects — which meant
    // Stories wrote its shelf under the anonymous scope and App then changed
    // the scope and cleared it, one load later. Setting it inline, before any
    // screen can mount, is the only ordering that holds.
    setCacheScope({ userId, language: finalProf.active_language })

    if (finalTrack) {
      const c = await getHomeCounts(userId, finalTrack, finalProf.daily_new_cards, { returning: isReturningFromBreak(finalProf) })
      setCounts({ ...c, loaded: true })
      writeCache(HOME_COUNTS, c)
    }

    // Both Home keys are now valid. `home:identity` holds the pair rather than
    // a flag so that switching language and back finds the previous track
    // already there — the namespace keeps them apart (dataCache.js).
    writeCache(HOME_IDENTITY, { profile: finalProf, track: finalTrack })
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
      // The URL is the hand-off now: /stories/<id> seeds [Stories → Reader]
      // through stackForPath, so there is nothing to remember on the side.
      routerNavigate(storyPath(publicStoryId), { replace: true })
    }
  }, [loading, session, publicStoryId, routerNavigate])

  // Navigate between views (updates the URL). Profile/track/counts reload only
  // when landing on Home — the dashboard is the one view that renders them, and
  // study/practice screens patch the in-memory profile live via their
  // onUpdate/onStreakUpdate callbacks. (Previously every view switch refired
  // ~5 queries, so opening Settings cost a full dashboard reload.)
  const navigate = (key, opts) => {
    if (opts && opts.todayWords) setPendingStoryWords(opts.todayWords)
    if (opts && opts.firstMission) setPendingStoryFirstMission(true)
    if (opts && opts.practiceWords) setPendingPracticeWords(opts.practiceWords)
    else if (key === 'fillblank') setPendingPracticeWords(null) // normal hub open — no stale story pool
    // Through the reducer, not around it. It decides whether this is a tab
    // selection, a push, or a flow — and whether it is a navigation at all.
    nav.navigate(key, opts)
    if (key === 'home') refreshHomeIfNeeded()
  }

  // Landing on Home. This used to be `shouldRefreshHome(view, …)` — refetch
  // unless the learner came from one of six named read-only screens — which
  // decided a DATA question by looking at a ROUTE, and so paid the full
  // seven-request profile + track + counts reload every time anyone arrived
  // from Stories, changed or not.
  //
  // Now the cache answers it, and each key answers for itself: nothing
  // invalidated means nothing is fetched, and a graded card costs exactly the
  // counts, not the profile as well.
  const refreshHomeIfNeeded = () => {
    if (!session) return
    const identity = readCache(HOME_IDENTITY)
    // No identity, or something moved the level underneath us: loadProfile is
    // the whole bootstrap and refreshes the counts on its way through.
    if (!identity || identity.invalidated) { loadProfile(session.user.id); return }
    const cached = readCache(HOME_COUNTS)
    if (!cached || cached.invalidated || countsExpired(cached.fetchedAt)) refreshCounts()
  }

  // Counts alone. Cards fall due while the app sits open and no event fires
  // when they do, so this is the one Home key with a clock on it
  // (HOME_COUNTS_STALE_MS + the local-midnight rollover, in homeData.js).
  const refreshCounts = async () => {
    if (!session || !profile || !track) return
    try {
      const c = await getHomeCounts(session.user.id, track, profile.daily_new_cards, { returning: isReturningFromBreak(profile) })
      setCounts({ ...c, loaded: true })
      writeCache(HOME_COUNTS, c)
    } catch {
      // A failed refresh leaves the last good counts on screen, still marked
      // invalid, so the next arrival tries again. Never a blank dashboard.
    }
  }

  // The bottom bar's own taps: re-tapping the active tab must dismiss, pop to
  // root or scroll — never mint a history entry (NAV-MODEL §5.1).
  const onTabSelect = (key) => {
    if (key === nav.state.activeTab && !nav.state.overlay) {
      nav.reselect(key, { sessionInProgress: studySession.inProgress })
      return
    }
    navigate(key)
  }

  const handleLogout = () => supabase.auth.signOut()

  // Coming back from the background. The only thing in the app that goes wrong
  // with nobody to publish an event about it is TIME: cards fall due in a
  // pocket, and at local midnight the day's reviews and today's reward claim
  // roll over. appResume.js decides whether either happened; this just does the
  // refresh behind it, and does nothing at all when the cache is clean.
  useAppResume(refreshHomeIfNeeded)

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

  // The onboarding tutorial, by URL. Sandboxed either way — fixture words, no
  // queue, no writes of any kind — but it means two different things:
  //
  //   signed out  the real first run. It remembers its position, reports the
  //               funnel, and hands over to the account when it finishes.
  //   signed in   a replay, exactly as Settings offers. It remembers nothing,
  //               reports nothing, cannot touch this learner's onboarding
  //               state or progress, and simply returns them to the app.
  //
  // The route stays because the e2e suite drives the tutorial through it, and
  // because a link to it is the honest way to send someone to the intro. It is
  // NOT a second onboarding system: same component, same script, one flag.
  if (tutorial) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <Tutorial
          resumable={!session}
          finishLabel={session ? 'Done' : null}
          onComplete={() => routerNavigate('/', { replace: true })}
          // Skipping signed out is the same decision it is on the landing
          // flow: the teaching is handled, and `/` then resolves to the
          // signup form (landingEntry + authEntryTab), never back to the
          // marketing page. A signed-in replay just returns to the app.
          onSkip={() => {
            if (!session) markTutorialDone()
            routerNavigate('/', { replace: true })
          }}
        />
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
              fontSize: '13.5px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
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
        <Onboarding session={session} onComplete={() => { loadProfile(session.user.id); navigate('study') }} />
      </>
    )
  }

  // No welcome screen between setup and the first session any more. Setup ends
  // by navigating straight to Cards, where Study caps the first run at five new
  // cards on its own (firstRun.js) — a screen whose only content was a promise
  // about what the next screen would do had no business existing.

  // ── The four persistent tab roots ─────────────────────────────────────────
  // Built the first time their tab is selected, then kept for the app run.
  // Their own error boundary lives here rather than around the whole shell.
  function renderTabRoot(tab) {
    let root = null
    if (tab === 'home') {
      root = (
        <Home
          profile={profile}
          track={track}
          counts={counts}
          session={session}
          onNavigate={navigate}
        />
      )
    } else if (tab === 'study') {
      root = (
        <Study
          session={session}
          profile={profile}
          track={track}
          onNavigate={navigate}
          onProfileUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
          onSessionStateChange={setStudySession}
        />
      )
    } else if (tab === 'stories') {
      root = (
        <Stories
          onNavigate={navigate}
          onOpenStory={(id) => navigate('stories', { storyId: id })}
          onOpenSeries={(key) => nav.navigate('series', { params: { key } })}
        />
      )
    } else if (tab === 'practice') {
      root = (
        <Practice
          profile={profile}
          track={track}
          counts={counts}
          onNavigate={navigate}
        />
      )
    }
    return (
      <Suspense fallback={<ViewFallback />}>
        <ErrorBoundary>{root}</ErrorBoundary>
      </Suspense>
    )
  }

  // What sits above them, if anything, and whether the bar is on screen.
  const topScreen = overlayScreen(nav.state)
  const showTabBar = tabBarVisible(nav.state, { studyImmersive: studySession.immersive })

  // ── Content for the screen above the tabs ─────────────────────────────────
  let content
  if (view === 'series') {
    // A real pushed destination on the Stories stack now, not a branch inside
    // Stories.jsx. Back is the reducer's pop, so it lands on the shelf the
    // learner left — still mounted, still scrolled where it was.
    content = (
      <SeriesScreen
        seriesKey={(topScreen && topScreen.params && topScreen.params.key) || null}
        onBack={nav.back}
        onNavigate={navigate}
        onOpenChapter={(story) => navigate('stories', { storyId: story.id })}
      />
    )
  } else if (view === 'reader') {
    // Presented above the Stories tab (VIEW_CLASS: `full`), so the tab bar
    // hides and dismissing returns to whatever is underneath — the series page
    // when it was pushed, the shelf when it was not.
    content = (
      <ReaderScreen
        storyId={(topScreen && topScreen.params && topScreen.params.id) || null}
        onBack={nav.back}
        onNavigate={navigate}
        todayWords={pendingStoryWords}
        firstMission={pendingStoryFirstMission}
        onConsumed={() => { setPendingStoryWords(null); setPendingStoryFirstMission(false) }}
        onOpenStory={(id, opts) => navigate('stories', { storyId: id, replace: opts && opts.replace })}
        onMissingStory={nav.back}
      />
    )
  } else if (view === 'weak') {
    content = (
      <Study
        session={session}
        profile={profile}
        track={track}
        mode="weak"
        onBack={nav.back}
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
        onBack={nav.back}
      />
    )
  } else if (view === 'writing') {
    content = (
      <Writing
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'listen') {
    content = (
      <Listen
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'kana') {
    content = (
      <Kana
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'cyrillic') {
    content = (
      <Cyrillic
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'words') {
    content = (
      <Words
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'analyzer') {
    content = (
      <Analyzer
        session={session}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'known') {
    content = (
      <KnownWords
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'dictionary') {
    content = (
      <Dictionary
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'grammar') {
    content = (
      <Grammar
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'grammarpractice') {
    content = (
      <GrammarPractice
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'strokes') {
    content = (
      <Writer
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'builder') {
    content = (
      <SentenceBuilder
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'fillblank') {
    content = (
      <FillBlank
        session={session}
        profile={profile}
        track={track}
        pool={pendingPracticeWords}
        onBack={() => { setPendingPracticeWords(null); nav.back() }}
      />
    )
  } else if (view === 'speak') {
    content = (
      <Speaking
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'tones') {
    content = (
      <Tones
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'profile') {
    content = (
      <Profile
        session={session}
        profile={profile}
        track={track}
        onBack={nav.back}
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
        onBack={nav.back}
      />
    )
  } else if (view === 'youtube') {
    content = (
      <YouTube
        profile={profile}
        track={track}
        onBack={nav.back}
      />
    )
  } else if (view === 'settings') {
    content = (
      <Settings
        session={session}
        profile={profile}
        onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
        onBack={nav.back}
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
        onBack={nav.back}
        onNavigate={navigate}
      />
    )
  } else if (view === 'dashboard') {
    content = profile.is_admin
      ? <Dashboard onBack={nav.back} session={session} profile={profile} track={track} />
      : <NotFound onHome={() => navigate('home')} />
  } else if (isKnownView(view)) {
    // Every root is rendered persistently by TabHost below, so reaching here
    // for one would mean the classification and the shell disagree.
    content = null
  } else {
    // A genuinely unknown path — show an explicit 404 instead of silently
    // falling through to Home, which used to hide typos and dead links.
    content = <NotFound onHome={() => navigate('home')} />
  }

  // ── App shell: persistent sidebar + content area ──────────────────────────
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {/* The Stories tab's data, owned above its three destinations. The shelf,
          the series page and the reader are separate screens in the model but
          one body of data; this is what stops each of them refetching it. */}
      <StoriesDataProvider session={session} profile={profile} track={track}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div style={{
        display: 'flex', minHeight: '100vh', alignItems: 'stretch',
        position: 'relative',
        background: 'var(--bg)',
      }}>
        {/* `bottomSupport` paints the page ground in the strip below the floating
            tray, so content scrolling past the fold never shows underneath it.
            Same condition as the tray itself. */}
        <Background language={profile.active_language} bottomSupport={isMobile && showTabBar} />
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
          // Leave room for the fixed bottom bar so content isn't hidden behind
          // it — the bar's own height, not a number that looks like it.
          paddingBottom: isMobile && showTabBar ? MOBILE_NAV_SPACE : 0,
        }}>
          {/* The four tab roots, mounted once and kept. Each keeps its own
              error boundary so a screen that throws degrades without taking the
              shell down — the property the old `key={view}` was protecting,
              now without the remount that came with it. */}
          <TabHost
            nav={nav.state}
            mounted={nav.mounted}
            render={renderTabRoot}
            scrollFor={nav.scrollFor}
            onScrollCapture={nav.captureScroll}
          />
          {/* Whatever is on top of them: a pushed detail screen, or a
              fullscreen flow. Mounted on demand and torn down on the way out,
              which is what a pushed screen should do. */}
          {topScreen && (
            // One wrapper, so a push/present has a single element to animate
            // and the screen inside never has to know it is being animated.
            <div data-nav-layer="overlay">
              <Suspense fallback={<ViewFallback />}>
                <ErrorBoundary key={topScreen.view}>
                  {content}
                </ErrorBoundary>
              </Suspense>
            </div>
          )}
        </main>
        {isMobile && showTabBar && <MobileNav view={nav.state.activeTab} onNavigate={onTabSelect} onLogout={handleLogout} isAdmin={!!profile.is_admin} language={profile.active_language} />}
        {/* Calm screens only — floating over Study it covered the Easy grade
            button, and the story reader has its own bottom audio bar. */}
        {showTabBar && ['home', 'practice', 'profile', 'settings', 'words', 'grammar', 'languages'].indexOf(view) !== -1 && (
          <Feedback session={session} profile={profile} view={view} />
        )}
        <Toasts />
        <OfflineBar session={session} />
      </div>
      </StoriesDataProvider>
    </ThemeContext.Provider>
  )
}
