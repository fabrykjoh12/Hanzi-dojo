// The navigation model: persistent tabs, one independent stack each, and
// fullscreen flows above them. Pure — no React, no router, no side effects.
//
// This is the "one authoritative runtime navigation model" from
// docs/NAV-MODEL.md §1. The URL is a PROJECTION of this state (urlForState),
// never a competing copy of it, and the only place history is allowed to
// inform state is a POP (see navLedger.js).
//
// Nothing imports this yet. It ships ahead of the shell rewrite so the rules
// can be reviewed and tested on their own — the repo's standing habit
// (CLAUDE.md §3): behaviour belongs in a tested .js module, not in a branch
// inside a 700-line component.

import { viewToPath, storyPath, seriesPath, storyRoute, pathToView } from './routes'

export const TABS = ['home', 'study', 'stories', 'practice']

// Every screen the shell can show, and how it is presented. Five classes, from
// NAV-MODEL §8; the class fixes tab-bar visibility, back affordance,
// transition, Android Back and swipe-back eligibility, so this table only has
// to say which class and which tab owns it.
//
//   root    — a tab root; the tab bar's four destinations
//   push    — pushed onto a tab's stack; back chevron, swipe-back
//   full    — fullscreen flow above the shell; tab bar hidden, X to close
//   account — the avatar stack (profile → settings/languages)
//   admin   — internal tooling, presented fullscreen, gated in App.jsx
//
// `series`, `reader` and `notfound` are pseudo-views: real screens with no
// entry in routes.js KNOWN_VIEWS, because their URLs carry a parameter.
export const VIEW_CLASS = {
  home: { cls: 'root', tab: 'home' },
  study: { cls: 'root', tab: 'study' },
  stories: { cls: 'root', tab: 'stories' },
  practice: { cls: 'root', tab: 'practice' },

  words: { cls: 'push', tab: 'practice' },
  known: { cls: 'push', tab: 'practice' },
  dictionary: { cls: 'push', tab: 'practice' },
  analyzer: { cls: 'push', tab: 'practice' },
  grammar: { cls: 'push', tab: 'practice' },
  youtube: { cls: 'push', tab: 'practice' },
  listen: { cls: 'push', tab: 'practice' },
  series: { cls: 'push', tab: 'stories' },
  notfound: { cls: 'push', tab: 'home' },

  weak: { cls: 'full', tab: 'study' },
  test: { cls: 'full', tab: 'practice' },
  writing: { cls: 'full', tab: 'practice' },
  speak: { cls: 'full', tab: 'practice' },
  fillblank: { cls: 'full', tab: 'practice' },
  builder: { cls: 'full', tab: 'practice' },
  tones: { cls: 'full', tab: 'practice' },
  strokes: { cls: 'full', tab: 'practice' },
  grammarpractice: { cls: 'full', tab: 'practice' },
  kana: { cls: 'full', tab: 'practice' },
  cyrillic: { cls: 'full', tab: 'practice' },
  reader: { cls: 'full', tab: 'stories' },

  profile: { cls: 'account', tab: null },
  settings: { cls: 'account', tab: null },
  languages: { cls: 'account', tab: null },

  hq: { cls: 'admin', tab: null },
  dashboard: { cls: 'admin', tab: null },
  dev: { cls: 'admin', tab: null },
}

// Within-stack parents. This map IS the migration path for the 26 hardcoded
// `onBack={() => navigate('practice')}` closures in App.jsx: screens will call
// a plain pop(), and this only supplies the fallback when a deep link left the
// stack one deep. One tested table instead of twenty-six literals.
export const PARENT = {
  words: 'practice',
  known: 'practice',
  dictionary: 'practice',
  analyzer: 'practice',
  grammar: 'practice',
  youtube: 'practice',
  listen: 'practice',
  series: 'stories',
  notfound: 'home',
  settings: 'profile',
  languages: 'profile',
}

export function classOf(view) {
  const spec = VIEW_CLASS[view]
  return spec ? spec.cls : null
}

export function tabOf(view) {
  const spec = VIEW_CLASS[view]
  return spec ? spec.tab : null
}

// ── Entries ───────────────────────────────────────────────────────────────

export function makeEntry(view, params) {
  return { view, params: params || null, scrollTop: 0 }
}

function rootEntry(tab) {
  return makeEntry(tab)
}

export function initialNavState() {
  return {
    activeTab: 'home',
    stacks: {
      home: [rootEntry('home')],
      study: [rootEntry('study')],
      stories: [rootEntry('stories')],
      practice: [rootEntry('practice')],
    },
    overlay: null,
  }
}

// The screen actually on top: the overlay's top entry if one is open,
// otherwise the top of the active tab's stack.
export function visibleEntry(state) {
  if (!state) return null
  if (state.overlay && state.overlay.stack.length > 0) {
    return state.overlay.stack[state.overlay.stack.length - 1]
  }
  const stack = state.stacks[state.activeTab]
  return stack && stack.length > 0 ? stack[stack.length - 1] : null
}

export function canPop(state) {
  if (!state) return false
  if (state.overlay) return true
  const stack = state.stacks[state.activeTab]
  return Boolean(stack && stack.length > 1)
}

// ── Actions (pure; every one returns a new state or the same one) ─────────

export function selectTab(state, tab) {
  if (!TABS.includes(tab)) return state
  // Re-selecting the active tab is NOT a navigation — it is handled by
  // tabReselect() so it never pushes a spurious history entry.
  if (!state.overlay && state.activeTab === tab) return state
  return { ...state, activeTab: tab, overlay: null }
}

export function push(state, entry) {
  if (!entry || !entry.view) return state
  if (state.overlay) {
    return { ...state, overlay: { ...state.overlay, stack: [...state.overlay.stack, entry] } }
  }
  const tab = state.activeTab
  return { ...state, stacks: { ...state.stacks, [tab]: [...state.stacks[tab], entry] } }
}

export function pop(state) {
  if (state.overlay) {
    if (state.overlay.stack.length > 1) {
      return { ...state, overlay: { ...state.overlay, stack: state.overlay.stack.slice(0, -1) } }
    }
    return dismiss(state)
  }
  const tab = state.activeTab
  const stack = state.stacks[tab]
  if (!stack || stack.length <= 1) return state
  return { ...state, stacks: { ...state.stacks, [tab]: stack.slice(0, -1) } }
}

// Open a flow above the shell. `originTab` is remembered so dismissing returns
// where the learner actually came from, rather than a hardcoded destination —
// which is how fillblank can be reached from both the Practice hub and a story
// reward and go back to the right one.
export function present(state, entry, kind) {
  if (!entry || !entry.view) return state
  return {
    ...state,
    overlay: {
      kind: kind || 'fullscreen',
      originTab: state.activeTab,
      stack: [entry],
    },
  }
}

export function dismiss(state) {
  if (!state.overlay) return state
  const back = state.overlay.originTab
  return {
    ...state,
    activeTab: TABS.includes(back) ? back : state.activeTab,
    overlay: null,
  }
}

export function resetTab(state, tab) {
  const target = TABS.includes(tab) ? tab : state.activeTab
  const stack = state.stacks[target]
  if (!stack || stack.length <= 1) return state
  return { ...state, stacks: { ...state.stacks, [target]: [stack[0]] } }
}

// Remember where a screen was scrolled to, so popping back to it lands where
// the learner left it rather than at the top.
export function setScroll(state, scrollTop) {
  const entry = visibleEntry(state)
  if (!entry) return state
  const next = { ...entry, scrollTop: Number(scrollTop) || 0 }
  if (state.overlay) {
    const stack = state.overlay.stack.slice()
    stack[stack.length - 1] = next
    return { ...state, overlay: { ...state.overlay, stack } }
  }
  const tab = state.activeTab
  const stack = state.stacks[tab].slice()
  stack[stack.length - 1] = next
  return { ...state, stacks: { ...state.stacks, [tab]: stack } }
}

// ── Behaviour rules (pure decisions; the shell performs them) ─────────────

// Tapping the tab you are already on. NAV-MODEL §5.1.
export function tabReselect(state, { sessionInProgress } = {}) {
  if (state.overlay) return 'dismiss'
  // Re-tapping Cards mid-session must not throw the session away. Losing a
  // half-finished session to a mis-tap on the bar is the worst outcome
  // available here, so it is the one explicit exception.
  if (state.activeTab === 'study' && sessionInProgress) return 'none'
  if (state.stacks[state.activeTab].length > 1) return 'reset'
  return 'scroll-top'
}

// Android hardware back. NAV-MODEL §5.2 — a strict ladder, returned as a
// decision so the effectful half stays in the bridge.
export function androidBack(state, { sheetOpen, immersiveFlow } = {}) {
  if (sheetOpen) return 'close-sheet'
  if (state.overlay) return 'dismiss'
  // A tab ROOT can be presenting a flow of its own — the flashcard session owns
  // the whole screen from inside the Cards tab. It has to consume Back before
  // the tab is allowed to move, or the first press on the most focused screen
  // in the app jumps to Home, which is not "leaving the session", it is leaving
  // Cards. Only the screen itself knows it is in that state, so it reports it.
  if (immersiveFlow) return 'exit-flow'
  if (state.stacks[state.activeTab].length > 1) return 'pop'
  if (state.activeTab !== 'home') return 'home-tab'
  return 'exit'
}

// iOS edge swipe. Eligible only where a pop is meaningful, and never inside a
// session or the reader: an accidental edge swipe mid-card or mid-chapter is
// worse than having no gesture at all.
export function swipeBackEligible(state) {
  if (!state) return false
  if (state.overlay) {
    const top = visibleEntry(state)
    const cls = classOf(top && top.view)
    if (cls === 'account') return state.overlay.stack.length > 1
    return false
  }
  return state.stacks[state.activeTab].length > 1
}

// ── URL projection ───────────────────────────────────────────────────────

export function normalizePath(pathname) {
  const p = pathname || '/'
  if (p === '/') return '/'
  return p.replace(/\/+$/, '') || '/'
}

export function urlForEntry(entry) {
  if (!entry) return viewToPath('home')
  if (entry.view === 'series') return seriesPath(entry.params && entry.params.key)
  if (entry.view === 'reader') return storyPath(entry.params && entry.params.id)
  // An unknown path keeps the URL the learner actually typed — rewriting it to
  // /notfound would lose the very thing they need to see to fix a typo.
  if (entry.view === 'notfound') return normalizePath(entry.params && entry.params.path)
  return viewToPath(entry.view)
}

export function urlForState(state) {
  return urlForEntry(visibleEntry(state))
}

// ── Deep-link seeding ────────────────────────────────────────────────────

// Walk PARENT up to a tab root, so Back from a deep link always reaches
// something real instead of dropping out of the app.
function ancestryOf(view) {
  const chain = [view]
  let cursor = view
  while (PARENT[cursor]) {
    cursor = PARENT[cursor]
    chain.unshift(cursor)
  }
  return chain
}

function stacksWithBranch(tab, views, paramsByView) {
  const base = initialNavState().stacks
  if (!tab) return base
  const entries = views.map((v) => makeEntry(v, paramsByView ? paramsByView[v] : null))
  return { ...base, [tab]: entries }
}

// Rebuild a complete NavState from nothing but a pathname. Deterministic by
// construction — which is what makes it a safe recovery for a missing, stale or
// corrupted ledger entry (NAV-MODEL §1.5), not just the cold-launch path.
//
// Always returns a valid state. An unrecognised path yields NotFound pushed
// onto Home, so the tab bar stays and Back reaches Home instead of a dead end.
export function stackForPath(pathname) {
  const path = normalizePath(pathname)

  const story = storyRoute(path)
  if (story) {
    if (story.kind === 'series') return seedFor('series', { series: { key: story.key } })
    if (story.kind === 'story') return seedFor('reader', { reader: { id: story.id } })
    return seedFor('stories')
  }

  const view = pathToView(path)
  if (!VIEW_CLASS[view] || view === 'series' || view === 'reader' || view === 'notfound') {
    return seedFor('notfound', { notfound: { path } })
  }
  return seedFor(view)
}

function seedFor(view, paramsByView) {
  const spec = VIEW_CLASS[view]
  const base = initialNavState()

  if (spec.cls === 'root') {
    return { ...base, activeTab: spec.tab }
  }

  if (spec.cls === 'push') {
    return {
      ...base,
      activeTab: spec.tab,
      stacks: stacksWithBranch(spec.tab, ancestryOf(view), paramsByView),
    }
  }

  if (spec.cls === 'account') {
    return {
      ...base,
      activeTab: 'home',
      overlay: {
        kind: 'account',
        originTab: 'home',
        stack: ancestryOf(view).map((v) => makeEntry(v, paramsByView ? paramsByView[v] : null)),
      },
    }
  }

  // 'full' and 'admin': the owning tab sits behind the flow, so dismissing
  // lands somewhere coherent rather than on Home by default.
  const originTab = spec.tab || 'home'
  return {
    ...base,
    activeTab: originTab,
    overlay: {
      kind: 'fullscreen',
      originTab,
      stack: [makeEntry(view, paramsByView ? paramsByView[view] : null)],
    },
  }
}
