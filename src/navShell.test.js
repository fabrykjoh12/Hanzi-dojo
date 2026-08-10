import { describe, it, expect } from 'vitest'
import {
  applyNavigate, applyBack, tabBarVisible, tabRootMode, overlayScreen,
} from './navShell'
import { initialNavState, makeEntry, selectTab, push, visibleEntry, urlForState } from './navStack'

const S = () => initialNavState()

describe('applyNavigate — the adapter for existing call sites', () => {
  it('treats a root key as a tab selection', () => {
    const s = applyNavigate(S(), 'stories')
    expect(s.activeTab).toBe('stories')
    expect(s.overlay).toBe(null)
  })

  it('returns the SAME state for the tab already active, so no history entry is minted', () => {
    const s = S()
    expect(applyNavigate(s, 'home')).toBe(s)
  })

  it('pushes a detail screen onto its owning tab, switching to it first', () => {
    const s = applyNavigate(S(), 'words')
    expect(s.activeTab).toBe('practice')
    expect(s.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
  })

  it('does not stack a second copy of the screen already on top', () => {
    const once = applyNavigate(S(), 'words')
    const twice = applyNavigate(once, 'words')
    expect(twice.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
  })

  it('presents a flow above the shell', () => {
    const s = applyNavigate(selectTab(S(), 'practice'), 'test')
    expect(s.overlay.kind).toBe('fullscreen')
    expect(s.overlay.originTab).toBe('practice')
    expect(visibleEntry(s).view).toBe('test')
  })

  it('opens the account stack with Profile behind Settings', () => {
    const s = applyNavigate(S(), 'settings')
    expect(s.overlay.kind).toBe('account')
    expect(s.overlay.stack.map(e => e.view)).toEqual(['profile', 'settings'])
  })

  it('turns navigate(stories, { storyId }) into the reader', () => {
    // How the recap's "Read now" and Home's reward hand-off already call it.
    const s = applyNavigate(S(), 'stories', { storyId: 'abc' })
    expect(s.activeTab).toBe('stories')
    expect(visibleEntry(s).view).toBe('reader')
    expect(urlForState(s)).toBe('/stories/abc')
  })

  it('ignores a key that is not a view', () => {
    const s = S()
    expect(applyNavigate(s, 'nope')).toBe(s)
  })
})

describe('applyBack', () => {
  it('dismisses a one-screen flow', () => {
    const s = applyNavigate(selectTab(S(), 'practice'), 'test')
    expect(applyBack(s).overlay).toBe(null)
    expect(applyBack(s).activeTab).toBe('practice')
  })

  it('pops WITHIN the account stack before closing it', () => {
    // Settings is pushed inside the account overlay, so its back goes to
    // Profile. Dismissing the whole stack would skip a screen the learner
    // deliberately came through.
    const settings = applyNavigate(S(), 'settings')
    const atProfile = applyBack(settings)
    expect(atProfile.overlay.stack.map(e => e.view)).toEqual(['profile'])
    expect(applyBack(atProfile).overlay).toBe(null)
  })

  it('pops a pushed screen', () => {
    const s = applyNavigate(S(), 'words')
    expect(applyBack(s).stacks.practice.map(e => e.view)).toEqual(['practice'])
  })

  it('falls back to Home from another tab root', () => {
    expect(applyBack(selectTab(S(), 'stories')).activeTab).toBe('home')
  })

  it('stops at the Home root', () => {
    const s = S()
    expect(applyBack(s)).toBe(s)
  })
})

describe('which tab root is alive', () => {
  it('shows only the active tab', () => {
    const s = selectTab(S(), 'stories')
    expect(tabRootMode(s, 'stories')).toBe('visible')
    expect(tabRootMode(s, 'home')).toBe('hidden')
    expect(tabRootMode(s, 'practice')).toBe('hidden')
  })

  it('hides the root a pushed screen is covering, without unmounting it', () => {
    const s = applyNavigate(S(), 'words')
    expect(tabRootMode(s, 'practice')).toBe('hidden')
    expect(overlayScreen(s).view).toBe('words')
  })

  it('covers the Stories root with the series page and the reader, like any other stack', () => {
    // Stories used to render these two itself (the old INLINE_VIEWS exception),
    // so the root stayed "visible" underneath its own pane swap. They are real
    // destinations now: the root goes quiet and the shell draws them on top.
    const series = push(selectTab(S(), 'stories'), makeEntry('series', { key: 'x' }))
    const reader = applyNavigate(S(), 'stories', { storyId: 'abc' })
    expect(tabRootMode(series, 'stories')).toBe('hidden')
    expect(tabRootMode(reader, 'stories')).toBe('hidden')
    expect(overlayScreen(series).view).toBe('series')
    expect(overlayScreen(reader).view).toBe('reader')
  })

  it('keeps the tab bar on the series page and hides it in the reader', () => {
    const series = push(selectTab(S(), 'stories'), makeEntry('series', { key: 'x' }))
    const reader = applyNavigate(S(), 'stories', { storyId: 'abc' })
    expect(tabBarVisible(series)).toBe(true)
    expect(tabBarVisible(reader)).toBe(false)
  })
})

describe('the bottom bar', () => {
  it('is there on a tab root', () => {
    expect(tabBarVisible(S())).toBe(true)
    expect(tabBarVisible(selectTab(S(), 'stories'))).toBe(true)
  })

  it('stays for a pushed detail screen', () => {
    expect(tabBarVisible(applyNavigate(S(), 'words'))).toBe(true)
  })

  it('goes away for a fullscreen flow', () => {
    expect(tabBarVisible(applyNavigate(S(), 'test'))).toBe(false)
    expect(tabBarVisible(applyNavigate(S(), 'writing'))).toBe(false)
  })

  it('goes away for the account stack', () => {
    expect(tabBarVisible(applyNavigate(S(), 'settings'))).toBe(false)
  })

  it('goes away in the reader', () => {
    expect(tabBarVisible(applyNavigate(S(), 'stories', { storyId: 'abc' }))).toBe(false)
  })

  it('goes away while a flashcard is on screen, and comes back on the recap', () => {
    const cards = selectTab(S(), 'study')
    expect(tabBarVisible(cards, { studyImmersive: true })).toBe(false)
    // Recap: Study reports immersive false, and the bar returns without any
    // navigation happening.
    expect(tabBarVisible(cards, { studyImmersive: false })).toBe(true)
  })

  it('is not hidden by a session on some OTHER tab', () => {
    expect(tabBarVisible(selectTab(S(), 'stories'), { studyImmersive: true })).toBe(true)
  })
})

describe('leaving a session', () => {
  it('reveals the Cards tab it was started from, with the bar back', () => {
    // A weak-words drill opened from Practice is a flow: dismissing it returns
    // to Practice, not to a hardcoded Home.
    const fromPractice = applyNavigate(selectTab(S(), 'practice'), 'weak')
    expect(tabBarVisible(fromPractice)).toBe(false)
    const back = applyBack(fromPractice)
    expect(back.activeTab).toBe('practice')
    expect(tabBarVisible(back)).toBe(true)
  })
})
