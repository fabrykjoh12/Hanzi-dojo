import { describe, it, expect } from 'vitest'
import {
  TABS, VIEW_CLASS, PARENT, classOf, tabOf,
  initialNavState, makeEntry, visibleEntry, canPop,
  selectTab, push, pop, present, dismiss, resetTab, setScroll,
  tabReselect, androidBack, swipeBackEligible,
  urlForEntry, urlForState, stackForPath, normalizePath,
} from './navStack'
import { KNOWN_VIEWS } from './routes'

const S = () => initialNavState()

describe('the shape of the model', () => {
  it('has exactly the four tabs the bar shows', () => {
    expect(TABS).toEqual(['home', 'study', 'stories', 'practice'])
  })

  it('starts on Home with every tab at its root and no overlay', () => {
    const s = S()
    expect(s.activeTab).toBe('home')
    TABS.forEach(t => expect(s.stacks[t]).toHaveLength(1))
    expect(s.overlay).toBe(null)
  })

  it('classifies every view routes.js knows about', () => {
    // The guard against a view being added to routes.js and silently having no
    // presentation — it would render, but with no rule for the tab bar, back,
    // or Android Back.
    const missing = KNOWN_VIEWS.filter(v => !VIEW_CLASS[v])
    expect(missing).toEqual([])
  })

  it('gives every classified view a real class', () => {
    Object.keys(VIEW_CLASS).forEach(view => {
      expect(['root', 'push', 'full', 'account', 'admin']).toContain(classOf(view))
    })
  })

  it('gives every tab-owned view one of the four tabs', () => {
    Object.keys(VIEW_CLASS).forEach(view => {
      const tab = tabOf(view)
      if (tab !== null) expect(TABS).toContain(tab)
    })
  })

  it('has exactly one root per tab', () => {
    const roots = Object.keys(VIEW_CLASS).filter(v => classOf(v) === 'root')
    expect(roots.sort()).toEqual([...TABS].sort())
  })

  it('never leaves a PARENT chain dangling', () => {
    Object.keys(PARENT).forEach(child => {
      expect(VIEW_CLASS[PARENT[child]]).toBeTruthy()
    })
  })
})

describe('selectTab', () => {
  it('switches tab', () => {
    expect(selectTab(S(), 'stories').activeTab).toBe('stories')
  })

  it('is a no-op for the tab already active, so it cannot push history', () => {
    const s = S()
    expect(selectTab(s, 'home')).toBe(s)
  })

  it('closes an overlay when switching', () => {
    const s = present(S(), makeEntry('test'), 'fullscreen')
    expect(selectTab(s, 'stories').overlay).toBe(null)
  })

  it('ignores a tab that does not exist', () => {
    const s = S()
    expect(selectTab(s, 'nope')).toBe(s)
  })
})

describe('push and pop', () => {
  it('pushes onto the active tab only', () => {
    const s = push(selectTab(S(), 'practice'), makeEntry('words'))
    expect(s.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
    expect(s.stacks.stories).toHaveLength(1)
    expect(s.stacks.home).toHaveLength(1)
  })

  it('pops back off', () => {
    const s = push(selectTab(S(), 'practice'), makeEntry('words'))
    expect(pop(s).stacks.practice.map(e => e.view)).toEqual(['practice'])
  })

  it('round-trips: pop(push(s, e)) === s', () => {
    const base = selectTab(S(), 'practice')
    expect(pop(push(base, makeEntry('words')))).toEqual(base)
  })

  it('never pops a root away', () => {
    const s = S()
    expect(pop(s)).toBe(s)
    expect(pop(s).stacks.home).toHaveLength(1)
  })

  it('keeps each tab stack independent', () => {
    let s = push(selectTab(S(), 'practice'), makeEntry('words'))
    s = push(selectTab(s, 'stories'), makeEntry('series', { key: 'inkbound' }))
    expect(s.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
    expect(s.stacks.stories.map(e => e.view)).toEqual(['stories', 'series'])
    // …and returning to a tab finds it exactly as it was left.
    expect(selectTab(s, 'practice').stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
  })

  it('pushes onto the overlay while one is open', () => {
    const s = push(present(S(), makeEntry('profile'), 'account'), makeEntry('settings'))
    expect(s.overlay.stack.map(e => e.view)).toEqual(['profile', 'settings'])
    expect(s.stacks.home).toHaveLength(1)
  })

  it('ignores a push with no view', () => {
    const s = S()
    expect(push(s, null)).toBe(s)
    expect(push(s, {})).toBe(s)
  })
})

describe('present and dismiss', () => {
  it('remembers the tab it was opened from and returns there', () => {
    const from = selectTab(S(), 'stories')
    const s = present(from, makeEntry('fillblank'), 'fullscreen')
    expect(s.overlay.originTab).toBe('stories')
    expect(dismiss(s).activeTab).toBe('stories')
    expect(dismiss(s).overlay).toBe(null)
  })

  it('sends the same screen back to a different tab depending on where it came from', () => {
    // fillblank is reachable from the Practice hub AND from a story reward.
    const fromPractice = present(selectTab(S(), 'practice'), makeEntry('fillblank'), 'fullscreen')
    const fromStories = present(selectTab(S(), 'stories'), makeEntry('fillblank'), 'fullscreen')
    expect(dismiss(fromPractice).activeTab).toBe('practice')
    expect(dismiss(fromStories).activeTab).toBe('stories')
  })

  it('pops within the overlay before dismissing it', () => {
    const s = push(present(S(), makeEntry('profile'), 'account'), makeEntry('settings'))
    const back = pop(s)
    expect(back.overlay.stack.map(e => e.view)).toEqual(['profile'])
    expect(pop(back).overlay).toBe(null)
  })

  it('dismiss is a no-op with nothing open', () => {
    const s = S()
    expect(dismiss(s)).toBe(s)
  })
})

describe('resetTab and scroll', () => {
  it('pops a tab back to its root', () => {
    let s = push(selectTab(S(), 'practice'), makeEntry('words'))
    s = push(s, makeEntry('dictionary'))
    expect(resetTab(s, 'practice').stacks.practice.map(e => e.view)).toEqual(['practice'])
  })

  it('is a no-op on a tab already at its root', () => {
    const s = S()
    expect(resetTab(s, 'home')).toBe(s)
  })

  it('records the scroll offset on the visible entry only', () => {
    const s = setScroll(selectTab(S(), 'stories'), 480)
    expect(s.stacks.stories[0].scrollTop).toBe(480)
    expect(s.stacks.home[0].scrollTop).toBe(0)
  })

  it('records scroll on the overlay top when one is open', () => {
    const s = setScroll(present(S(), makeEntry('test'), 'fullscreen'), 120)
    expect(s.overlay.stack[0].scrollTop).toBe(120)
  })
})

describe('tab re-selection', () => {
  it('dismisses an overlay first', () => {
    expect(tabReselect(present(S(), makeEntry('test'), 'fullscreen'))).toBe('dismiss')
  })

  it('pops to the root when the stack is deep', () => {
    const s = push(selectTab(S(), 'practice'), makeEntry('words'))
    expect(tabReselect(s)).toBe('reset')
  })

  it('scrolls to the top when already at the root', () => {
    expect(tabReselect(S())).toBe('scroll-top')
  })

  it('does nothing at all on Cards mid-session', () => {
    // Throwing away a half-finished session because of a mis-tap on the bar is
    // the worst outcome available here.
    const s = selectTab(S(), 'study')
    expect(tabReselect(s, { sessionInProgress: true })).toBe('none')
    expect(tabReselect(s, { sessionInProgress: false })).toBe('scroll-top')
  })
})

describe('Android back', () => {
  it('closes a sheet before anything else', () => {
    const s = push(selectTab(S(), 'practice'), makeEntry('words'))
    expect(androidBack(s, { sheetOpen: true })).toBe('close-sheet')
  })

  it('dismisses an open flow', () => {
    expect(androidBack(present(S(), makeEntry('test'), 'fullscreen'))).toBe('dismiss')
  })

  it('pops a deep stack', () => {
    expect(androidBack(push(selectTab(S(), 'practice'), makeEntry('words')))).toBe('pop')
  })

  it('steps to the Home tab from another tab root', () => {
    expect(androidBack(selectTab(S(), 'stories'))).toBe('home-tab')
  })

  it('exits only from the Home root', () => {
    expect(androidBack(S())).toBe('exit')
  })

  it('walks the whole ladder without ever skipping a rung', () => {
    let s = push(selectTab(S(), 'practice'), makeEntry('words'))
    expect(androidBack(s)).toBe('pop')
    s = pop(s)
    expect(androidBack(s)).toBe('home-tab')
    s = selectTab(s, 'home')
    expect(androidBack(s)).toBe('exit')
  })
})

describe('swipe-back eligibility', () => {
  it('is off at a tab root', () => {
    expect(swipeBackEligible(S())).toBe(false)
  })

  it('is on for a pushed detail screen', () => {
    expect(swipeBackEligible(push(selectTab(S(), 'practice'), makeEntry('words')))).toBe(true)
  })

  it('is off inside the reader — an accidental edge swipe mid-chapter is worse than no gesture', () => {
    expect(swipeBackEligible(present(S(), makeEntry('reader', { id: 'x' }), 'fullscreen'))).toBe(false)
  })

  it('is off inside a session', () => {
    expect(swipeBackEligible(present(S(), makeEntry('weak'), 'fullscreen'))).toBe(false)
  })

  it('is on only for a pushed screen inside the account stack', () => {
    const profile = present(S(), makeEntry('profile'), 'account')
    expect(swipeBackEligible(profile)).toBe(false)
    expect(swipeBackEligible(push(profile, makeEntry('settings')))).toBe(true)
  })
})

describe('URL projection', () => {
  it('maps the roots', () => {
    expect(urlForState(S())).toBe('/')
    expect(urlForState(selectTab(S(), 'stories'))).toBe('/stories')
    expect(urlForState(selectTab(S(), 'study'))).toBe('/study')
    expect(urlForState(selectTab(S(), 'practice'))).toBe('/practice')
  })

  it('maps a pushed screen to its own path', () => {
    expect(urlForState(push(selectTab(S(), 'practice'), makeEntry('words')))).toBe('/words')
  })

  it('maps the parameterised screens', () => {
    expect(urlForEntry(makeEntry('series', { key: 'inkbound' }))).toBe('/stories/series/inkbound')
    expect(urlForEntry(makeEntry('reader', { id: 'abc' }))).toBe('/stories/abc')
  })

  it('keeps the URL a learner actually typed for an unknown path', () => {
    // Rewriting it to /notfound would destroy the one piece of information
    // needed to spot the typo.
    expect(urlForEntry(makeEntry('notfound', { path: '/wat' }))).toBe('/wat')
  })

  it('shows the overlay, not the tab behind it', () => {
    const s = present(selectTab(S(), 'stories'), makeEntry('reader', { id: 'abc' }), 'fullscreen')
    expect(urlForState(s)).toBe('/stories/abc')
  })
})

describe('normalizePath', () => {
  it('tolerates a trailing slash', () => {
    expect(normalizePath('/stories/')).toBe('/stories')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
    expect(normalizePath(undefined)).toBe('/')
  })
})

describe('stackForPath — deep-link seeding', () => {
  it('seeds a tab root', () => {
    const s = stackForPath('/stories')
    expect(s.activeTab).toBe('stories')
    expect(s.stacks.stories.map(e => e.view)).toEqual(['stories'])
    expect(s.overlay).toBe(null)
  })

  it('seeds a pushed screen with its parent behind it', () => {
    const s = stackForPath('/words')
    expect(s.activeTab).toBe('practice')
    expect(s.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
    // …so Back reaches the hub instead of dropping out of the app.
    expect(androidBack(s)).toBe('pop')
  })

  it('seeds a series with the shelf behind it', () => {
    const s = stackForPath('/stories/series/inkbound')
    expect(s.activeTab).toBe('stories')
    expect(s.stacks.stories.map(e => e.view)).toEqual(['stories', 'series'])
    expect(s.stacks.stories[1].params).toEqual({ key: 'inkbound' })
  })

  it('seeds the reader as a flow over the shelf', () => {
    const s = stackForPath('/stories/abc123')
    expect(s.activeTab).toBe('stories')
    expect(s.overlay.kind).toBe('fullscreen')
    expect(s.overlay.originTab).toBe('stories')
    expect(s.overlay.stack.map(e => e.view)).toEqual(['reader'])
    expect(s.overlay.stack[0].params).toEqual({ id: 'abc123' })
  })

  it('seeds a settings deep link with Profile behind it', () => {
    const s = stackForPath('/settings')
    expect(s.overlay.kind).toBe('account')
    expect(s.overlay.stack.map(e => e.view)).toEqual(['profile', 'settings'])
    expect(pop(s).overlay.stack.map(e => e.view)).toEqual(['profile'])
  })

  it('seeds a flow over its owning tab, so dismissing lands somewhere coherent', () => {
    const s = stackForPath('/test')
    expect(s.activeTab).toBe('practice')
    expect(dismiss(s).activeTab).toBe('practice')
  })

  it('puts an unknown path on the Home tab as NotFound rather than a dead end', () => {
    const s = stackForPath('/nonsense')
    expect(s.activeTab).toBe('home')
    expect(s.stacks.home.map(e => e.view)).toEqual(['home', 'notfound'])
    expect(androidBack(s)).toBe('pop')
    expect(urlForState(s)).toBe('/nonsense')
  })

  it('tolerates a trailing slash on a deep link', () => {
    expect(stackForPath('/words/')).toEqual(stackForPath('/words'))
  })

  it('is deterministic — the same path always rebuilds the same state', () => {
    expect(stackForPath('/stories/series/x')).toEqual(stackForPath('/stories/series/x'))
  })
})

describe('the round-trip invariant', () => {
  // The property that stops the three representations (state, URL, history)
  // drifting apart: rebuilding from a state's own URL must reproduce that
  // state's visible branch. It is what makes rebuilding a safe recovery for a
  // missing or corrupted ledger entry.
  const paths = [
    '/', '/study', '/stories', '/practice',
    '/words', '/known', '/dictionary', '/analyzer', '/grammar', '/youtube', '/listen',
    '/weak', '/test', '/writing', '/speak', '/fillblank', '/builder', '/tones',
    '/strokes', '/grammarpractice', '/kana', '/cyrillic',
    '/profile', '/settings', '/languages',
    '/hq', '/dashboard', '/dev',
    '/stories/series/inkbound', '/stories/abc123',
    '/definitely-not-a-route',
  ]

  it('projects every seeded state back to the path it came from', () => {
    paths.forEach(path => {
      expect(urlForState(stackForPath(path))).toBe(normalizePath(path))
    })
  })

  it('rebuilds an identical state from its own projection', () => {
    paths.forEach(path => {
      const seeded = stackForPath(path)
      expect(stackForPath(urlForState(seeded))).toEqual(seeded)
    })
  })

  it('covers every known view with a reachable path', () => {
    const covered = new Set(paths.map(p => visibleEntry(stackForPath(p)).view))
    KNOWN_VIEWS.forEach(view => expect(covered.has(view)).toBe(true))
  })
})

describe('canPop', () => {
  it('is false at a bare root and true anywhere deeper', () => {
    expect(canPop(S())).toBe(false)
    expect(canPop(push(selectTab(S(), 'practice'), makeEntry('words')))).toBe(true)
    expect(canPop(present(S(), makeEntry('test'), 'fullscreen'))).toBe(true)
  })
})
