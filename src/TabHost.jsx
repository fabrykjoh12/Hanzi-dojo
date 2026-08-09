import { Activity, useRef, useEffect } from 'react'
import { TABS } from './navStack'
import { tabRootMode } from './navShell'

// The four tab roots, kept alive.
//
// This is the component that replaces `<ErrorBoundary key={view}>` — the line
// that used to unmount every screen on every navigation, so returning to
// Stories re-ran its mount effects (about nine Supabase queries) and threw away
// where the learner had scrolled to.
//
// A root mounts the first time its tab is selected and then never unmounts.
// While it is not the visible one, <Activity mode="hidden"> keeps its state and
// its DOM but tears its EFFECTS down — which is the whole reason to use it
// rather than a `display: none` wrapper. A hidden tab is not merely invisible:
// it has no timers, no listeners, no subscriptions and no audio, it is out of
// the accessibility tree and cannot be focused or tapped, and CSS animations
// inside it do not run. React does that; we would have had to remember it in
// every hook.
//
// The trade that comes with it: effects re-run on show, so a mount-effect fetch
// would fire on every return. That is why data belongs in dataCache.js, and why
// these two changes are one design rather than two.

// Scroll offsets belong to a stack entry, not to the DOM: React applies
// `display: none` to a hidden Activity, and that resets any scroller inside it.
// So the shell reads the offset out before a tab is hidden and puts it back
// after it is shown.
function TabPane({ tab, mode, scrollTop, onScrollCapture, children }) {
  const ref = useRef(null)
  const wasVisible = useRef(mode === 'visible')

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (mode === 'visible') {
      if (!wasVisible.current) el.scrollTop = scrollTop || 0
      wasVisible.current = true
      return undefined
    }
    if (wasVisible.current) {
      wasVisible.current = false
      if (onScrollCapture) onScrollCapture(tab, el.scrollTop)
    }
    return undefined
  }, [mode, tab, scrollTop, onScrollCapture])

  return (
    <div ref={ref} data-tab-root={tab} style={{ height: '100%' }}>
      <Activity mode={mode}>{children}</Activity>
    </div>
  )
}

export default function TabHost({ nav, mounted, render, scrollFor, onScrollCapture }) {
  return (
    <>
      {TABS.map((tab) => {
        // Lazy first mount: a learner who never opens Practice never pays for
        // it, and one who opens it once pays once.
        if (!mounted.has(tab)) return null
        return (
          <TabPane
            key={tab}
            tab={tab}
            mode={tabRootMode(nav, tab)}
            scrollTop={scrollFor ? scrollFor(tab) : 0}
            onScrollCapture={onScrollCapture}
          >
            {render(tab)}
          </TabPane>
        )
      })}
    </>
  )
}
