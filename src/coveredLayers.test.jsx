/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useState, useEffect, useRef } from 'react'
import { render, act, cleanup, within } from '@testing-library/react'
import TabHost from './TabHost'
import { initialNavState, selectTab, push, present, makeEntry } from './navStack'
import { overlayScreen, tabRootMode } from './navShell'
import { resetCache } from './dataCache'

// A covered layer must be genuinely inactive, not merely out of sight.
//
// This matters more now that Stories, Series and Reader stack: the shelf is
// still in the document while a series page covers it, and the temptation in
// that situation is to reach for a screen-specific hack — a `pointer-events:
// none` here, an `aria-hidden` there. There is none of that in this codebase,
// and these specs are why: the shell's two primitives already guarantee every
// property, and each guarantee below is asserted against React's real output
// rather than against our belief about it.
//
//   a covered TAB ROOT     <Activity mode="hidden"> → `display: none`
//   a covered PUSHED screen  unmounted — only the topmost overlay is rendered
//
// `display: none` is the strong primitive. It is not opacity and not
// visibility: the subtree leaves layout, leaves hit-testing, leaves the
// accessibility tree, leaves the tab order, and its CSS animations stop. React
// tears the effects down on top of that, which is what stops timers and audio.

const state = { timers: 0, playing: false, mounts: 0 }

function LiveProbe({ tab }) {
  const [typed, setTyped] = useState('')
  const seen = useRef(false)
  useEffect(() => {
    if (!seen.current) { seen.current = true; state.mounts += 1 }
  })
  // A timer and a "playing" flag, torn down on hide. These stand in for the
  // real ones: useStudyAudio's playback teardown and every polling effect.
  useEffect(() => {
    state.timers += 1
    state.playing = true
    return () => { state.timers -= 1; state.playing = false }
  }, [])
  return (
    <div>
      <h1>{tab} screen</h1>
      <button>Shared label</button>
      <input aria-label={tab + ' field'} value={typed} onChange={(e) => setTyped(e.target.value)} />
      <a href="#x">a link</a>
    </div>
  )
}

function Overlay({ label }) {
  return (
    <div data-nav-layer="overlay">
      <h1>{label}</h1>
      <button>Shared label</button>
    </div>
  )
}

function Shell({ nav, mounted }) {
  const top = overlayScreen(nav)
  return (
    <>
      <TabHost
        nav={nav}
        mounted={mounted}
        render={(tab) => <LiveProbe tab={tab} />}
        scrollFor={() => 0}
        onScrollCapture={() => {}}
      />
      {/* Exactly what App does: ONE overlay screen, the top of the stack. */}
      {top && <Overlay label={top.view + ' screen'} />}
    </>
  )
}

const MOUNTED = new Set(['home', 'stories'])

function paneFor(view, tab) {
  return view.container.querySelector('[data-tab-root="' + tab + '"]')
}

// jsdom does not do layout, but it does implement `display: none` inheritance
// for the purposes of RTL's visibility checks — which is the property under
// test. Anything hidden this way is unreachable by every query below.
beforeEach(() => {
  state.timers = 0
  state.playing = false
  state.mounts = 0
  resetCache()
})

afterEach(cleanup)

describe('a tab root covered by a pushed screen', () => {
  it('is display:none — out of layout, hit-testing, focus order and the a11y tree', () => {
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(<Shell nav={nav} mounted={MOUNTED} />)
    expect(paneFor(view, 'stories').querySelector('h1').textContent).toBe('stories screen')

    nav = push(nav, makeEntry('series', { key: 'k' }))
    act(() => { view.rerender(<Shell nav={nav} mounted={MOUNTED} />) })

    const pane = paneFor(view, 'stories')
    // Still in the document — that is the whole point of a persistent root…
    expect(pane).not.toBe(null)
    expect(within(pane).queryByRole('heading', { hidden: true, name: 'stories screen' })).not.toBe(null)
    // …and completely inert. `hidden: false` is the accessibility tree, and
    // getByRole's default. Nothing inside a covered root answers to it.
    expect(view.queryByRole('button', { name: 'Shared label', hidden: false })).not.toBe(null)
    expect(within(pane).queryByRole('button', { name: 'Shared label' })).toBe(null)
    expect(within(pane).queryByRole('link')).toBe(null)
    expect(within(pane).queryByRole('textbox')).toBe(null)
  })

  it('leaves exactly one control answering to a label the covered screen also uses', () => {
    // Two screens can legitimately share a label ("Back", "Play", "Continue").
    // If a covered screen kept answering, every such query would be ambiguous
    // — for a screen reader as much as for a test.
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(<Shell nav={nav} mounted={MOUNTED} />)
    nav = push(nav, makeEntry('series', { key: 'k' }))
    act(() => { view.rerender(<Shell nav={nav} mounted={MOUNTED} />) })

    // Not "the first one wins" — there IS only one.
    expect(view.getAllByRole('button', { name: 'Shared label' }).length).toBe(1)
    expect(view.getAllByRole('heading').length).toBe(1)
    expect(view.getByRole('heading').textContent).toBe('series screen')
  })

  it('stops its timers and its playback, without unmounting', () => {
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(<Shell nav={nav} mounted={MOUNTED} />)
    // Only the VISIBLE root is doing work: home is mounted but hidden, so its
    // effects are already torn down.
    expect(state.timers).toBe(1)
    expect(state.playing).toBe(true)
    const mountsBefore = state.mounts

    nav = push(nav, makeEntry('series', { key: 'k' }))
    act(() => { view.rerender(<Shell nav={nav} mounted={MOUNTED} />) })

    // The covered root's effect cleanup ran…
    expect(state.timers).toBe(0)
    // …and it is still the same component instance. Nothing remounted.
    expect(state.mounts).toBe(mountsBefore)
  })

  it('comes back with its state, and starts its work again', () => {
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(<Shell nav={nav} mounted={MOUNTED} />)
    const field = within(paneFor(view, 'stories')).getByRole('textbox')
    act(() => { field.focus() })
    const typed = paneFor(view, 'stories').querySelector('input')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(typed, 'half a search')
      typed.dispatchEvent(new Event('input', { bubbles: true }))
    })

    nav = push(nav, makeEntry('series', { key: 'k' }))
    act(() => { view.rerender(<Shell nav={nav} mounted={MOUNTED} />) })
    nav = { ...nav, stacks: { ...nav.stacks, stories: [nav.stacks.stories[0]] } }
    act(() => { view.rerender(<Shell nav={nav} mounted={MOUNTED} />) })

    expect(paneFor(view, 'stories').querySelector('input').value).toBe('half a search')
    expect(state.timers).toBe(1)
    expect(state.playing).toBe(true)
  })
})

describe('a tab root covered by a fullscreen flow', () => {
  it('is hidden by the same primitive — a flow is not a special case', () => {
    let nav = selectTab(initialNavState(), 'stories')
    const view = render(<Shell nav={nav} mounted={MOUNTED} />)
    nav = present(nav, makeEntry('reader', { id: 's1' }), 'fullscreen')
    act(() => { view.rerender(<Shell nav={nav} mounted={MOUNTED} />) })

    expect(tabRootMode(nav, 'stories')).toBe('hidden')
    expect(within(paneFor(view, 'stories')).queryByRole('button', { name: 'Shared label' })).toBe(null)
    expect(state.timers).toBe(0) // home was already quiet; stories just joined it
    expect(state.playing).toBe(false)
  })

  it('renders only the top of the stack, so a covered PUSHED screen is not there at all', () => {
    // Series under Reader is the strongest case: it is not hidden, it is
    // unmounted. There is no second overlay to be reachable, focusable or
    // audible, and nothing to keep in sync.
    let nav = selectTab(initialNavState(), 'stories')
    nav = push(nav, makeEntry('series', { key: 'k' }))
    const view = render(<Shell nav={nav} mounted={MOUNTED} />)
    expect(view.getByRole('heading').textContent).toBe('series screen')

    nav = present(nav, makeEntry('reader', { id: 's1' }), 'fullscreen')
    act(() => { view.rerender(<Shell nav={nav} mounted={MOUNTED} />) })

    expect(view.container.querySelectorAll('[data-nav-layer="overlay"]').length).toBe(1)
    expect(view.getByRole('heading').textContent).toBe('reader screen')
    expect(view.getAllByRole('button', { name: 'Shared label' }).length).toBe(1)
  })
})
