import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { stackForPath, urlForState, visibleEntry, resetTab, TABS } from './navStack'
import { recordNavState, restoreForPop } from './navLedger'
import { applyNavigate, applyBack } from './navShell'
import { transitionFor } from './navMotion'
import { tabReselect } from './navStack'

// The runtime source of truth, wired to the router.
//
// The reducer state is authoritative. The URL is its projection, and
// history.state carries one integer keying navLedger's snapshots. The ONLY
// direction that ever runs backwards is a POP — browser Back, Android Back —
// and even then the snapshot has to agree with the pathname before it is
// trusted (navLedger.restoreForPop).
//
// What this replaces: `const view = pathToView(location.pathname)` plus a
// `navigate()` that pushed a history entry for every tab tap, so Android Back
// walked a learner's entire browsing history instead of popping.

export function useNavigation() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const navigationType = useNavigationType()

  const [state, setState] = useState(() => stackForPath(location.pathname))
  // Read inside callbacks so they never close over a stale state — the
  // navigate() identity has to stay stable, because it is passed to every
  // screen and a new one on every navigation would re-render all of them.
  const stateRef = useRef(state)

  // A tab root is built the first time its tab is selected, and never torn
  // down afterwards. Only ever grows.
  const [mounted, setMounted] = useState(() => new Set([state.activeTab]))
  const rememberMounted = useCallback((tab) => {
    setMounted((prev) => (prev.has(tab) ? prev : new Set([...prev, tab])))
  }, [])

  // Scroll offsets live outside the history-committed state on purpose: they
  // change constantly and must never mint a history entry.
  //
  // The DOCUMENT is the scroller — the shell has never moved scrolling into a
  // pane, and `<Activity>` swaps panes in and out of `display: none`, so the
  // browser has nothing to restore by itself. Without this, pushing a screen
  // landed at whatever offset the previous one was scrolled to, and popping
  // back landed at whatever offset the pushed screen left behind.
  //
  // Keyed by URL because that is exactly one key per stack entry, already
  // computed, and already unique.
  const scrollByTab = useRef({})
  const scrollByEntry = useRef({})

  const rememberScroll = (state) => {
    if (typeof window === 'undefined') return
    scrollByEntry.current[urlForState(state)] = window.scrollY || 0
  }
  const restoreScroll = (state, { top = false } = {}) => {
    if (typeof window === 'undefined') return
    const target = top ? 0 : (scrollByEntry.current[urlForState(state)] || 0)
    // After paint, or the browser clamps to the OLD document height — the new
    // screen has not been laid out yet at the moment the state changes.
    requestAnimationFrame(() => { window.scrollTo(0, target) })
  }
  const captureScroll = useCallback((tab, top) => {
    scrollByTab.current[tab] = top
  }, [])
  const scrollFor = useCallback((tab) => scrollByTab.current[tab] || 0, [])

  // Stamp the entry the app opened on, so the first Back has a predecessor to
  // find rather than falling straight through to a rebuild.
  const stamped = useRef(false)
  useEffect(() => {
    if (stamped.current) return
    stamped.current = true
    const navId = recordNavState(stateRef.current)
    routerNavigate(urlForState(stateRef.current), { replace: true, state: { navId } })
  }, [routerNavigate])

  // Someone pressed Back (or Forward). This is the one path where history
  // informs state.
  const lastKey = useRef(location.key)
  useEffect(() => {
    if (location.key === lastKey.current) return
    lastKey.current = location.key
    if (navigationType !== 'POP') return
    const navId = location.state && typeof location.state.navId === 'number'
      ? location.state.navId
      : undefined
    const { state: restored } = restoreForPop({ navId, pathname: location.pathname })
    stateRef.current = restored
    restoreScroll(restored)
    // Sanctioned: a POP is an external event (the browser's back button, the
    // Android hardware key) and adopting the state it lands on is exactly the
    // synchronisation an effect is for. Same pattern, and same disable, as the
    // deep-link handoff in App.jsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(restored)
    rememberMounted(restored.activeTab)
  }, [location.key, location.state, location.pathname, navigationType, rememberMounted])

  // Every forward navigation goes through here: reduce, record, project.
  const commit = useCallback((produce, { replace = false } = {}) => {
    const prev = stateRef.current
    const next = produce(prev)
    // The reducer returning the same state means nothing happened — most often
    // a tap on the tab you are already on. Pushing a history entry for that is
    // exactly how Back came to walk a browsing history.
    if (next === prev) return
    // Where the learner was on the screen they are leaving, so going back to it
    // lands there. Whether the arriving screen starts at its top depends on the
    // DIRECTION, and the motion model already names that: a push or a
    // presentation is a new screen and starts at the top; a pop, a dismissal or
    // a tab change is a return, and returns land where you left.
    //
    // This is not only the browser-Back path: the in-app back control commits
    // forward through the reducer (it never calls history.back), so without
    // asking the direction here, every Back would have landed at the top.
    rememberScroll(prev)
    const direction = transitionFor(prev, next)
    restoreScroll(next, { top: direction === 'push' || direction === 'present' })
    stateRef.current = next
    setState(next)
    rememberMounted(next.activeTab)
    const url = urlForState(next)
    const navId = recordNavState(next)
    routerNavigate(url, { replace, state: { navId } })
  }, [routerNavigate, rememberMounted])

  // The signature every existing screen already calls.
  const navigate = useCallback((key, opts) => {
    // `replace` is how moving to the NEXT chapter works: it swaps the reader
    // for the next one instead of stacking a second reader, so three chapters
    // in a row are still one Back to get out.
    commit((prev) => applyNavigate(prev, key, opts), { replace: Boolean(opts && opts.replace) })
  }, [commit])

  const back = useCallback(() => {
    commit((prev) => applyBack(prev))
  }, [commit])

  // Tapping the tab you are already on. Never a history entry: it either
  // dismisses, pops to the root, or scrolls — see NAV-MODEL §5.1.
  const reselect = useCallback((tab, { sessionInProgress } = {}) => {
    const prev = stateRef.current
    const action = tabReselect(prev, { sessionInProgress })
    if (action === 'reset') {
      commit((s) => resetTab(s, tab))
      return 'reset'
    }
    if (action === 'dismiss') {
      commit((s) => applyBack(s))
      return 'dismiss'
    }
    if (action === 'scroll-top') {
      const el = document.querySelector('[data-tab-root="' + tab + '"]')
      if (el) {
        scrollByTab.current[tab] = 0
        try { el.scrollTo({ top: 0, behavior: 'smooth' }) } catch { el.scrollTop = 0 }
      }
    }
    return action
  }, [commit])

  const selectOrReselect = useCallback((key, opts) => {
    const prev = stateRef.current
    if (TABS.indexOf(key) !== -1 && prev.activeTab === key && !prev.overlay) {
      return reselect(key, opts)
    }
    navigate(key, opts)
    return 'navigate'
  }, [navigate, reselect])

  return {
    state,
    view: (visibleEntry(state) || {}).view || 'home',
    mounted,
    navigate,
    back,
    reselect,
    selectOrReselect,
    scrollFor,
    captureScroll,
  }
}
