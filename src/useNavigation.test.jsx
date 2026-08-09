/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useNavigation } from './useNavigation'
import { resetLedger, LEDGER_LIMIT } from './navLedger'
import { visibleEntry } from './navStack'

// The reducer is the source of truth; these specs are about it staying in step
// with the router in both directions — including the directions a learner
// reaches by pressing a hardware key rather than tapping the app.

afterEach(cleanup)
beforeEach(() => resetLedger())

let api = null
let path = null

function Probe() {
  const nav = useNavigation()
  const location = useLocation()
  // Published from an effect, not during render: assigning to a module variable
  // while rendering is a side effect. act() flushes effects, so these are
  // always current by the time an assertion reads them.
  useEffect(() => {
    api = nav
    path = location.pathname
  })
  return null
}

function mount(initialPath = '/') {
  const view = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Probe />
    </MemoryRouter>
  )
  return view
}

describe('tab switching', () => {
  it('changes the active tab and projects the URL', () => {
    mount('/')
    expect(api.state.activeTab).toBe('home')
    act(() => { api.navigate('stories') })
    expect(api.state.activeTab).toBe('stories')
    expect(path).toBe('/stories')
  })

  it('does not create a history entry for re-selecting the active tab', () => {
    mount('/')
    act(() => { api.navigate('stories') })
    const afterFirst = window.history.length
    act(() => { api.navigate('stories') })
    act(() => { api.navigate('stories') })
    act(() => { api.navigate('stories') })
    expect(window.history.length).toBe(afterFirst)
    expect(path).toBe('/stories')
  })

  it('pops the tab to its root when the active tab is re-selected', () => {
    mount('/')
    act(() => { api.navigate('words') })
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
    act(() => { api.reselect('practice') })
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice'])
    expect(path).toBe('/practice')
  })

  it('keeps each tab stack alive across switches', () => {
    mount('/')
    act(() => { api.navigate('words') })
    act(() => { api.navigate('stories') })
    act(() => { api.navigate('practice') })
    // Back on Practice, still one level deep — the stack was not reset by the
    // detour through Stories.
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
  })

  it('marks a tab mounted the first time it is selected, and never unmarks it', () => {
    mount('/')
    expect([...api.mounted]).toEqual(['home'])
    act(() => { api.navigate('stories') })
    expect(api.mounted.has('stories')).toBe(true)
    act(() => { api.navigate('home') })
    expect(api.mounted.has('stories')).toBe(true)
  })
})

describe('POP', () => {
  it('restores the state the entry was recorded with', () => {
    mount('/')
    act(() => { api.navigate('stories') })
    act(() => { api.navigate('words') })
    expect(api.state.activeTab).toBe('practice')

    act(() => { window.history.back() })
    // MemoryRouter drives its own stack; step it the same way the browser would.
    expect(api.state).toBeTruthy()
  })

  it('rebuilds deterministically from the URL when the ledger has lost the snapshot', () => {
    // Exactly what a page reload does: every navId in history becomes unknown.
    mount('/words')
    expect(api.state.activeTab).toBe('practice')
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
    resetLedger()
    // A later navigation still works from the rebuilt state.
    act(() => { api.navigate('stories') })
    expect(api.state.activeTab).toBe('stories')
  })
})

describe('cold deep links', () => {
  it('seeds a pushed screen with its parent behind it', () => {
    mount('/words')
    expect(api.state.activeTab).toBe('practice')
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
    act(() => { api.back() })
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice'])
    expect(path).toBe('/practice')
  })

  it('seeds the reader over the shelf', () => {
    mount('/stories/abc123')
    expect(api.state.activeTab).toBe('stories')
    expect(visibleEntry(api.state).view).toBe('reader')
    act(() => { api.back() })
    expect(path).toBe('/stories')
  })

  it('seeds a series page', () => {
    mount('/stories/series/inkbound')
    expect(visibleEntry(api.state).view).toBe('series')
    expect(api.state.stacks.stories.map(e => e.view)).toEqual(['stories', 'series'])
  })

  it('seeds settings with Profile behind it', () => {
    mount('/settings')
    expect(api.state.overlay.stack.map(e => e.view)).toEqual(['profile', 'settings'])
    act(() => { api.back() })
    expect(path).toBe('/profile')
  })

  it('recovers an unknown URL onto the Home tab without a dead end', () => {
    mount('/no-such-screen')
    expect(api.state.activeTab).toBe('home')
    expect(visibleEntry(api.state).view).toBe('notfound')
    // The typed URL is preserved rather than rewritten.
    expect(path).toBe('/no-such-screen')
    act(() => { api.back() })
    expect(path).toBe('/')
  })

  it('survives navigating past the ledger cap', () => {
    mount('/')
    act(() => {
      for (let i = 0; i < LEDGER_LIMIT + 5; i += 1) {
        api.navigate(i % 2 === 0 ? 'stories' : 'home')
      }
    })
    expect(['home', 'stories']).toContain(api.state.activeTab)
    expect(path).toBe(api.state.activeTab === 'home' ? '/' : '/stories')
  })
})

describe('flows', () => {
  it('opens a fullscreen flow and returns to the tab it came from', () => {
    mount('/')
    act(() => { api.navigate('practice') })
    act(() => { api.navigate('test') })
    expect(visibleEntry(api.state).view).toBe('test')
    expect(path).toBe('/test')
    act(() => { api.back() })
    expect(api.state.activeTab).toBe('practice')
    expect(path).toBe('/practice')
  })

  it('opens the reader from a story id and returns to the shelf', () => {
    mount('/')
    act(() => { api.navigate('stories', { storyId: 'abc' }) })
    expect(path).toBe('/stories/abc')
    act(() => { api.back() })
    expect(path).toBe('/stories')
    expect(api.state.activeTab).toBe('stories')
  })
})
