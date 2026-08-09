/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useEffect } from 'react'
import { render, act, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useNavigation } from './useNavigation'
import { useAndroidBack } from './useAndroidBack'
import { runBackHandler, hasBackHandler, resetBackHandler } from './backHandler'
import { pushSheet, resetSheets, anySheetOpen } from './sheetStack'
import { resetLedger } from './navLedger'
import { visibleEntry } from './navStack'

// The real integration, not the pure ladder: a shell that registers a handler,
// the registry the native bridge actually calls, and the reducer underneath.
// `press()` is exactly what NativeShellBridge does when the hardware key fires.

afterEach(() => { cleanup(); resetBackHandler(); resetSheets() })
beforeEach(() => { resetLedger(); resetBackHandler(); resetSheets() })

let api = null
let path = null

function Shell({ flow }) {
  const nav = useNavigation()
  const location = useLocation()
  useAndroidBack(nav, flow || {})
  useEffect(() => { api = nav; path = location.pathname })
  return null
}

function mount(initialPath = '/', flow) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Shell flow={flow} />
    </MemoryRouter>
  )
}

// What the bridge's backButton listener does.
function press() {
  let result
  act(() => { result = runBackHandler() })
  return result
}

describe('the shell owns the answer', () => {
  it('registers a handler while it is mounted, and takes it away when it is not', () => {
    expect(hasBackHandler()).toBe(false)
    const view = mount('/')
    expect(hasBackHandler()).toBe(true)
    view.unmount()
    // Signed out: the bridge falls back to its own path-based behaviour rather
    // than calling into a shell that is gone.
    expect(hasBackHandler()).toBe(false)
  })

  it('reports null with no shell, so the bridge uses its fallback', () => {
    expect(runBackHandler()).toBe(null)
  })
})

describe('tab roots', () => {
  it('exits the app from the Home root, and only from there', () => {
    mount('/')
    expect(press()).toBe('exit')
    expect(path).toBe('/')
  })

  it('steps to the Home tab from another tab root instead of exiting', () => {
    mount('/')
    act(() => { api.navigate('stories') })
    expect(press()).toBe('handled')
    expect(api.state.activeTab).toBe('home')
    expect(path).toBe('/')
    // …and only then does it leave.
    expect(press()).toBe('exit')
  })

  it('does the same from Cards and Practice', () => {
    mount('/practice')
    expect(press()).toBe('handled')
    expect(api.state.activeTab).toBe('home')

    act(() => { api.navigate('study') })
    expect(press()).toBe('handled')
    expect(api.state.activeTab).toBe('home')
  })
})

describe('pushed detail', () => {
  it('pops the detail screen', () => {
    mount('/')
    act(() => { api.navigate('words') })
    expect(press()).toBe('handled')
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice'])
    expect(path).toBe('/practice')
  })

  it('pops one level at a time', () => {
    mount('/')
    act(() => { api.navigate('words') })
    act(() => { api.navigate('dictionary') })
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice', 'words', 'dictionary'])
    press()
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
    press()
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice'])
  })
})

describe('the account stack', () => {
  it('goes Settings → Profile, then dismisses', () => {
    mount('/')
    act(() => { api.navigate('settings') })
    expect(visibleEntry(api.state).view).toBe('settings')

    expect(press()).toBe('handled')
    expect(visibleEntry(api.state).view).toBe('profile')
    expect(path).toBe('/profile')

    expect(press()).toBe('handled')
    expect(api.state.overlay).toBe(null)
    expect(path).toBe('/')
  })

  it('dismisses straight out of the account root', () => {
    mount('/')
    act(() => { api.navigate('stories') })
    act(() => { api.navigate('profile') })
    expect(press()).toBe('handled')
    expect(api.state.overlay).toBe(null)
    // Back to the tab it was opened from, not a hardcoded Home.
    expect(api.state.activeTab).toBe('stories')
  })

  it('goes Languages → Profile too', () => {
    mount('/languages')
    expect(visibleEntry(api.state).view).toBe('languages')
    press()
    expect(visibleEntry(api.state).view).toBe('profile')
  })
})

describe('the flashcard session consumes Back before the tab does', () => {
  it('exits the session to Cards, and does NOT go to Home', () => {
    const exit = vi.fn()
    mount('/study', { immersiveFlow: true, onExitFlow: exit })
    expect(api.state.activeTab).toBe('study')

    expect(press()).toBe('handled')

    // The session's own exit ran…
    expect(exit).toHaveBeenCalledTimes(1)
    // …and nothing navigated. Home was never involved.
    expect(api.state.activeTab).toBe('study')
    expect(path).toBe('/study')
  })

  it('leaves the Cards stack valid', () => {
    mount('/study', { immersiveFlow: true, onExitFlow: () => {} })
    press()
    expect(api.state.stacks.study.map(e => e.view)).toEqual(['study'])
    expect(api.state.overlay).toBe(null)
  })

  it('follows the ordinary ladder on the SECOND press, once the session has stepped aside', () => {
    // The shell re-renders with immersiveFlow false after the session pauses,
    // which is what the real signal from Study does.
    const view = render(
      <MemoryRouter initialEntries={['/study']}>
        <Shell flow={{ immersiveFlow: true, onExitFlow: () => {} }} />
      </MemoryRouter>
    )
    expect(press()).toBe('handled')          // session steps aside
    act(() => {
      view.rerender(
        <MemoryRouter initialEntries={['/study']}>
          <Shell flow={{ immersiveFlow: false }} />
        </MemoryRouter>
      )
    })
    expect(press()).toBe('handled')          // Cards root → Home tab
    expect(api.state.activeTab).toBe('home')
    expect(press()).toBe('exit')
    view.unmount()
  })

  it('cannot leave an orphaned session however many times Back is pressed', () => {
    const exit = vi.fn()
    mount('/study', { immersiveFlow: true, onExitFlow: exit })
    for (let i = 0; i < 8; i += 1) press()
    // A flow that keeps reporting itself immersive keeps consuming Back — it
    // never falls through to move the tab out from under itself.
    expect(exit).toHaveBeenCalledTimes(8)
    expect(api.state.activeTab).toBe('study')
    expect(api.state.stacks.study).toHaveLength(1)
    expect(api.state.overlay).toBe(null)
  })

  it('does not trap the learner if a flow claims Back but offers no way out', () => {
    mount('/study', { immersiveFlow: true })
    expect(press()).toBe('handled')
    expect(api.state.activeTab).toBe('study')
  })
})

describe('other flows', () => {

  it('dismisses a weak-words drill back to where it was opened', () => {
    mount('/')
    act(() => { api.navigate('practice') })
    act(() => { api.navigate('weak') })
    expect(press()).toBe('handled')
    expect(api.state.activeTab).toBe('practice')
    expect(api.state.overlay).toBe(null)
  })

  it('returns fillblank to Practice when it was opened from Practice', () => {
    mount('/')
    act(() => { api.navigate('practice') })
    act(() => { api.navigate('fillblank') })
    press()
    expect(api.state.activeTab).toBe('practice')
    expect(path).toBe('/practice')
  })

  it('returns fillblank to Stories when it was opened from a story reward', () => {
    // The same screen, a different way in — and the reducer remembers which.
    mount('/')
    act(() => { api.navigate('stories') })
    act(() => { api.navigate('fillblank', { practiceWords: ['x'] }) })
    press()
    expect(api.state.activeTab).toBe('stories')
    expect(path).toBe('/stories')
  })
})

describe('the reader', () => {
  it('exits to the shelf', () => {
    mount('/')
    act(() => { api.navigate('stories', { storyId: 'abc' }) })
    expect(visibleEntry(api.state).view).toBe('reader')
    expect(press()).toBe('handled')
    expect(path).toBe('/stories')
    expect(api.state.activeTab).toBe('stories')
  })

  it('then behaves like any other tab root', () => {
    mount('/stories/abc')
    press()                       // reader → shelf
    expect(press()).toBe('handled')   // shelf → Home tab
    expect(api.state.activeTab).toBe('home')
    expect(press()).toBe('exit')
  })
})

describe('deep links', () => {
  it('reaches the seeded parent rather than dropping out of the app', () => {
    mount('/words')
    expect(press()).toBe('handled')
    expect(path).toBe('/practice')
  })

  it('walks a series deep link back to the shelf and on to Home', () => {
    mount('/stories/series/inkbound')
    press()
    expect(path).toBe('/stories')
    press()
    expect(api.state.activeTab).toBe('home')
  })

  it('takes NotFound back to Home', () => {
    mount('/nonsense')
    expect(visibleEntry(api.state).view).toBe('notfound')
    expect(press()).toBe('handled')
    expect(path).toBe('/')
    expect(api.state.activeTab).toBe('home')
  })
})

describe('sheets come first', () => {
  it('closes an open sheet before navigating anything', () => {
    mount('/')
    act(() => { api.navigate('stories') })
    let closed = false
    let release
    act(() => { release = pushSheet(() => { closed = true }) })
    expect(anySheetOpen()).toBe(true)

    expect(press()).toBe('handled')
    expect(closed).toBe(true)
    // The screen underneath did NOT move, which is the bug this fixes.
    expect(api.state.activeTab).toBe('stories')
    expect(anySheetOpen()).toBe(false)
    release()
  })
})

describe('repeated presses', () => {
  it('cannot corrupt the stack, however many times it is pressed', () => {
    mount('/')
    act(() => { api.navigate('words') })
    act(() => { api.navigate('stories') })

    const results = []
    for (let i = 0; i < 12; i += 1) results.push(press())

    // It settles on the Home root and stays there, reporting 'exit' from then
    // on rather than popping something that is not there.
    expect(api.state.activeTab).toBe('home')
    expect(api.state.stacks.home.map(e => e.view)).toEqual(['home'])
    expect(api.state.overlay).toBe(null)
    expect(results[results.length - 1]).toBe('exit')
    // Every stack is still a valid non-empty stack.
    Object.values(api.state.stacks).forEach((stack) => {
      expect(stack.length).toBeGreaterThan(0)
      expect(stack[0].view).toBeTruthy()
    })
  })

  it('never empties a tab stack by over-popping it', () => {
    mount('/words')
    for (let i = 0; i < 6; i += 1) press()
    expect(api.state.stacks.practice.map(e => e.view)).toEqual(['practice'])
    expect(api.state.stacks.home.map(e => e.view)).toEqual(['home'])
  })
})

describe('the web is untouched', () => {
  it('does not run the handler for ordinary browser navigation', () => {
    // Nothing outside the native bridge calls runBackHandler, so a browser
    // session reaches the reducer only through the router's own POP.
    mount('/')
    act(() => { api.navigate('stories') })
    expect(api.state.activeTab).toBe('stories')
    // The handler exists but was never invoked by any of the above.
    expect(hasBackHandler()).toBe(true)
    expect(path).toBe('/stories')
  })
})
