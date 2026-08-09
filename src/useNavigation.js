import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { stackForPath, urlForState, visibleEntry, resetTab, TABS } from './navStack'
import { recordNavState, restoreForPop } from './navLedger'
import { applyNavigate, applyBack } from './navShell'
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
  // change constantly and must never mint a history entry. Per-stack-entry
  // offsets (for pushed screens) follow in commit 3; this covers the four roots.
  const scrollByTab = useRef({})
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
    stateRef.current = next
    setState(next)
    rememberMounted(next.activeTab)
    const url = urlForState(next)
    const navId = recordNavState(next)
    routerNavigate(url, { replace, state: { navId } })
  }, [routerNavigate, rememberMounted])

  // The signature every existing screen already calls.
  const navigate = useCallback((key, opts) => {
    commit((prev) => applyNavigate(prev, key, opts))
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
