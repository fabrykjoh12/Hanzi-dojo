/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState, useEffect, useRef } from 'react'
import { render, act, screen, fireEvent, cleanup } from '@testing-library/react'
import TabHost from './TabHost'
import { initialNavState, selectTab, makeEntry, push } from './navStack'
import { applyNavigate } from './navShell'
import { readCache, writeCache, invalidate, resetCache } from './dataCache'

// These specs are the proof that the persistent shell does what NAV-MODEL says
// — asserted against React, not against our belief about React.

const mounts = { home: 0, study: 0, stories: 0, practice: 0 }

function Probe({ tab }) {
  const [typed, setTyped] = useState('')
  // Counting MOUNTS, not shows. A bare effect cannot tell them apart —
  // <Activity> re-runs effects every time a tab becomes visible, which is the
  // very thing under test. A ref survives hide/show and dies with the
  // component, so "have I run before?" is exactly the mount question.
  const seen = useRef(false)
  useEffect(() => {
    if (seen.current) return
    seen.current = true
    mounts[tab] += 1
  })
  return (
    <div>
      <span data-testid={tab + '-label'}>{tab}</span>
      <input data-testid={tab + '-input'} value={typed} onChange={(e) => setTyped(e.target.value)} />
    </div>
  )
}

function host(nav, mounted, scrollRef) {
  return (
    <TabHost
      nav={nav}
      mounted={mounted}
      render={(tab) => <Probe tab={tab} />}
      scrollFor={(tab) => (scrollRef ? scrollRef.current[tab] || 0 : 0)}
      onScrollCapture={(tab, top) => { if (scrollRef) scrollRef.current[tab] = top }}
    />
  )
}

afterEach(cleanup)

beforeEach(() => {
  Object.keys(mounts).forEach((k) => { mounts[k] = 0 })
  resetCache()
})

describe('lazy first mount', () => {
  it('mounts a tab the first time it is visited, and not before', () => {
    const nav = initialNavState()
    const view = render(host(nav, new Set(['home'])))
    expect(mounts.home).toBe(1)
    expect(mounts.stories).toBe(0)

    const next = selectTab(nav, 'stories')
    act(() => { view.rerender(host(next, new Set(['home', 'stories']))) })
    expect(mounts.stories).toBe(1)
    // A tab never opened is never built.
    expect(mounts.practice).toBe(0)
  })
})

describe('persistence', () => {
  it('does not unmount a tab when switching away from it', () => {
    const mounted = new Set(['home', 'stories'])
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(host(nav, mounted))
    expect(mounts.stories).toBe(1)

    nav = selectTab(nav, 'home')
    act(() => { view.rerender(host(nav, mounted)) })
    nav = selectTab(nav, 'stories')
    act(() => { view.rerender(host(nav, mounted)) })

    // The old shell's `key={view}` made this 2. It is the whole bug.
    expect(mounts.stories).toBe(1)
  })

  it('preserves local React state across a tab round-trip', () => {
    const mounted = new Set(['home', 'stories'])
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(host(nav, mounted))

    fireEvent.change(screen.getByTestId('stories-input'), { target: { value: 'half-typed' } })
    expect(screen.getByTestId('stories-input').value).toBe('half-typed')

    nav = selectTab(nav, 'home')
    act(() => { view.rerender(host(nav, mounted)) })
    nav = selectTab(nav, 'stories')
    act(() => { view.rerender(host(nav, mounted)) })

    expect(screen.getByTestId('stories-input').value).toBe('half-typed')
    expect(mounts.stories).toBe(1)
  })

  it('preserves scroll position across a tab round-trip', () => {
    const mounted = new Set(['home', 'stories'])
    const scrollRef = { current: {} }
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(host(nav, mounted, scrollRef))

    // jsdom has no layout, so scrollTop is permanently 0 unless it is given a
    // real property to hold. The capture/restore logic is what is under test,
    // not the browser's scrolling.
    const pane = view.container.querySelector('[data-tab-root="stories"]')
    Object.defineProperty(pane, 'scrollTop', { value: 480, writable: true, configurable: true })

    nav = selectTab(nav, 'home')
    act(() => { view.rerender(host(nav, mounted, scrollRef)) })
    // Captured on the way out, because `display: none` resets it.
    expect(scrollRef.current.stories).toBe(480)

    pane.scrollTop = 0            // what the browser does to a hidden pane
    nav = selectTab(nav, 'stories')
    act(() => { view.rerender(host(nav, mounted, scrollRef)) })

    expect(view.container.querySelector('[data-tab-root="stories"]').scrollTop).toBe(480)
  })

  it('hides the root a pushed screen covers, but keeps it mounted', () => {
    const mounted = new Set(['home', 'practice'])
    let nav = applyNavigate(initialNavState(), 'practice')
    const view = render(host(nav, mounted))
    expect(mounts.practice).toBe(1)

    nav = applyNavigate(nav, 'words')
    act(() => { view.rerender(host(nav, mounted)) })
    expect(mounts.practice).toBe(1)
  })
})

// The data half of the same design: because effects re-run on show, the guard
// has to live in the cache. This mirrors the exact shape Stories.jsx now uses.
function CachedLoader({ tab, load }) {
  useEffect(() => {
    const cached = readCache('stories:shelf')
    if (cached && !cached.invalidated) return
    load()
    writeCache('stories:shelf', true)
  })
  return <span data-testid={tab + '-label'}>{tab}</span>
}

describe('tab switching does not cause network work', () => {
  function cachedHost(nav, mounted, load) {
    return (
      <TabHost
        nav={nav}
        mounted={mounted}
        render={(tab) => (tab === 'stories' ? <CachedLoader tab={tab} load={load} /> : <Probe tab={tab} />)}
        scrollFor={() => 0}
        onScrollCapture={() => {}}
      />
    )
  }

  it('loads the shelf once and never again for a mere tab change', () => {
    const load = vi.fn()
    const mounted = new Set(['home', 'stories'])
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(cachedHost(nav, mounted, load))
    expect(load).toHaveBeenCalledTimes(1)

    // Stories → Cards → Stories, three times over.
    for (let i = 0; i < 3; i += 1) {
      nav = selectTab(nav, 'home')
      act(() => { view.rerender(cachedHost(nav, mounted, load)) })
      nav = selectTab(nav, 'stories')
      act(() => { view.rerender(cachedHost(nav, mounted, load)) })
    }

    // Before this commit that was four loads of ~9 queries each. Now one.
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reloads exactly once when a session invalidates the shelf', () => {
    const load = vi.fn()
    const mounted = new Set(['home', 'stories'])
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(cachedHost(nav, mounted, load))
    expect(load).toHaveBeenCalledTimes(1)

    nav = selectTab(nav, 'home')
    act(() => { view.rerender(cachedHost(nav, mounted, load)) })

    // A flashcard session finishes and unlocks a chapter.
    act(() => { invalidate('stories:') })

    nav = selectTab(nav, 'stories')
    act(() => { view.rerender(cachedHost(nav, mounted, load)) })
    expect(load).toHaveBeenCalledTimes(2)

    // …and then settles again.
    nav = selectTab(nav, 'home')
    act(() => { view.rerender(cachedHost(nav, mounted, load)) })
    nav = selectTab(nav, 'stories')
    act(() => { view.rerender(cachedHost(nav, mounted, load)) })
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('leaving a session reveals the Cards tab as it was', () => {
  it('keeps the Cards root mounted underneath a flow and after it closes', () => {
    const mounted = new Set(['home', 'study'])
    let nav = selectTab(initialNavState(), 'study')
    const view = render(host(nav, mounted))
    expect(mounts.study).toBe(1)

    // Open a flow above it, then close it.
    nav = push(nav, makeEntry('weak'))
    act(() => { view.rerender(host(nav, mounted)) })
    nav = selectTab(nav, 'study')
    act(() => { view.rerender(host(nav, mounted)) })

    expect(mounts.study).toBe(1)
    expect(screen.getByTestId('study-label')).toBeTruthy()
  })
})
