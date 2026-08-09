// The decisions the app shell needs, kept out of the shell.
//
// navStack.js is the model; this is the thin layer that answers the questions
// App.jsx actually asks: which tab root should be alive, is the bottom bar
// visible right now, and what does the existing `navigate('words')` call at
// forty sites mean in terms of the new model.
//
// Pure, so all of it is tested in the fast node environment.

import {
  VIEW_CLASS, TABS, classOf, tabOf, PARENT,
  makeEntry, visibleEntry, selectTab, push, present, pop, dismiss,
} from './navStack'

// ── Transitional: overlays a tab root renders itself ─────────────────────
//
// The model says the reader is a fullscreen flow above Stories, and the series
// page is pushed onto it. Both are TRUE of the navigation — URL, back, tab-bar
// visibility and swipe-back eligibility all follow from it — but neither is a
// separate component yet: Stories.jsx has owned its own reader and series page
// since #207, driven by the route props App already passes it.
//
// Lifting them out is a component refactor with no navigational content, so it
// is commit 3's job. Until then the shell keeps the Stories root VISIBLE while
// one of these is on top, and hands it the route instead of rendering a
// sibling. The model is not bent to fit: only the rendering is.
export const INLINE_VIEWS = { stories: ['series', 'reader'] }

export function isInlineView(tab, view) {
  const inline = INLINE_VIEWS[tab]
  return Boolean(inline && inline.indexOf(view) !== -1)
}

// ── Which roots are alive ────────────────────────────────────────────────

// 'visible' | 'hidden' — fed straight to <Activity mode>. Hidden roots keep
// their state and their DOM but lose their effects, which is what stops a
// hidden tab timing, fetching or speaking.
export function tabRootMode(state, tab) {
  if (!state || state.activeTab !== tab) return 'hidden'
  const top = visibleEntry(state)
  if (!top) return 'hidden'
  if (top.view === tab) return 'visible'
  if (isInlineView(tab, top.view)) return 'visible'
  // Something is covering the root — a pushed screen, or a flow. The root
  // stays mounted; it just stops doing work.
  return 'hidden'
}

// The screen rendered ON TOP of the roots, if any. Null when the visible entry
// is a root, or one the root renders itself.
export function overlayScreen(state) {
  const top = visibleEntry(state)
  if (!top) return null
  if (classOf(top.view) === 'root') return null
  if (isInlineView(state.activeTab, top.view)) return null
  return top
}

// ── Chrome ───────────────────────────────────────────────────────────────

// The bottom bar. Hidden for any fullscreen flow, and — the exception in
// NAV-MODEL §8.2 — while a flashcard is actually on screen, which is a state
// only Study can report.
export function tabBarVisible(state, { studyImmersive } = {}) {
  if (!state) return true
  const top = visibleEntry(state)
  const cls = classOf(top && top.view)
  if (cls === 'full' || cls === 'admin' || cls === 'account') return false
  if (isInlineView(state.activeTab, top && top.view) && top.view === 'reader') return false
  if (state.activeTab === 'study' && top && top.view === 'study' && studyImmersive) return false
  return true
}

// ── The route Stories is driven by ───────────────────────────────────────

export function storiesRoute(state) {
  const top = visibleEntry(state)
  if (top && top.view === 'reader') {
    return { kind: 'story', storyId: (top.params && top.params.id) || null, seriesKey: null }
  }
  if (top && top.view === 'series') {
    return { kind: 'series', storyId: null, seriesKey: (top.params && top.params.key) || null }
  }
  return { kind: 'browse', storyId: null, seriesKey: null }
}

// ── The adapter for the existing navigate() call sites ───────────────────

// Forty-odd places already say `onNavigate('stories')` or
// `navigate('fillblank', { practiceWords })`. Rewriting them all is commit 3;
// what matters now is that every one of them goes THROUGH the reducer rather
// than around it. This maps a view key onto the action its class implies.
export function applyNavigate(state, key, opts) {
  const spec = VIEW_CLASS[key]
  if (!spec) return state

  // A story id turns "go to Stories" into "open this story", which is how the
  // recap's Read-now button and Home's reward hand-off already work.
  if (key === 'stories' && opts && opts.storyId) {
    return present(selectTab(state, 'stories'), makeEntry('reader', { id: opts.storyId }), 'fullscreen')
  }

  if (spec.cls === 'root') {
    // Selecting the tab you are on is not a navigation — reselect() handles it,
    // and returning the same state is what stops a history entry being pushed.
    if (state.activeTab === key && !state.overlay) return state
    return selectTab(state, key)
  }

  if (spec.cls === 'push') {
    const tab = tabOf(key)
    let next = state.overlay ? dismiss(state) : state
    next = selectTab(next, tab)
    const stack = next.stacks[tab]
    // Re-navigating to the screen already on top is a no-op, not a second copy.
    if (stack[stack.length - 1].view === key) return next
    return push(next, makeEntry(key, opts && opts.params))
  }

  if (spec.cls === 'account') {
    // settings/languages open with Profile behind them, so back means back.
    const chain = []
    let cursor = key
    while (PARENT[cursor]) { cursor = PARENT[cursor]; chain.unshift(cursor) }
    let next = present(state, makeEntry(chain[0] || key), 'account')
    ;[...chain.slice(1), key].forEach((v) => { if (v !== (chain[0] || key)) next = push(next, makeEntry(v)) })
    return next
  }

  // 'full' and 'admin'
  return present(state, makeEntry(key, opts && opts.params), 'fullscreen')
}

// Where a screen's own onBack should go while the bespoke back buttons still
// exist. Popping is right whenever there is somewhere to pop to; otherwise fall
// back to the owning tab, which is what the hardcoded literals were doing by
// hand.
export function applyBack(state) {
  // pop(), not dismiss(): an overlay can be more than one screen deep —
  // Settings and Languages are pushed INSIDE the account stack, so back from
  // Settings means Profile, not "close the whole thing". pop() falls through to
  // dismiss once the overlay is down to its last entry.
  if (state.overlay) return pop(state)
  const stack = state.stacks[state.activeTab]
  if (stack && stack.length > 1) return pop(state)
  if (state.activeTab !== 'home') return selectTab(state, 'home')
  return state
}

export function tabsToRender(state, mounted) {
  return TABS.filter((tab) => mounted.has(tab) || state.activeTab === tab)
}
