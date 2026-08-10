/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useState, useEffect } from 'react'
import { render, act, cleanup } from '@testing-library/react'
import { useNavMotion } from './useNavMotion'
import { initialNavState, selectTab, push, present, makeEntry } from './navStack'
import { overlayScreen } from './navShell'

// The shell half of the motion model: does the animation land on the element
// that actually became visible, and does it stay off when it should.
//
// jsdom has no Web Animations API, so Element.animate is stubbed. That is the
// point of the stub rather than a limitation of it — what is under test is
// which element is animated with which keyframes, not the browser's ability to
// interpolate them.

const calls = []
let cancelled = 0

function Harness({ state }) {
  useNavMotion(state)
  const overlay = overlayScreen(state)
  return (
    <div>
      <div data-tab-root="home" />
      <div data-tab-root="stories" />
      <div data-tab-root="practice" />
      {overlay && <div data-nav-layer="overlay" />}
    </div>
  )
}

// Drives the hook the way the shell does: one state object at a time.
const control = {}

function Driver({ initial }) {
  const [state, setState] = useState(initial)
  useEffect(() => { control.set = setState }, [])
  return <Harness state={state} />
}

function navigateTo(next) {
  act(() => { control.set(next) })
}

beforeEach(() => {
  calls.length = 0
  cancelled = 0
  Element.prototype.animate = function animate(keyframes, options) {
    calls.push({ el: this, keyframes, options })
    return { cancel: () => { cancelled += 1 } }
  }
})

afterEach(() => {
  cleanup()
  delete Element.prototype.animate
  delete window.matchMedia
})

describe('useNavMotion', () => {
  it('does not animate the first commit — that is the app appearing', () => {
    render(<Driver initial={initialNavState()} />)
    expect(calls.length).toBe(0)
  })

  it('animates the tab root that became visible on a tab change', () => {
    render(<Driver initial={initialNavState()} />)
    navigateTo(selectTab(initialNavState(), 'stories'))
    expect(calls.length).toBe(1)
    expect(calls[0].el.getAttribute('data-tab-root')).toBe('stories')
    // Peers, not stack pages: opacity only.
    expect(calls[0].keyframes[0].transform).toBeUndefined()
  })

  it('animates the overlay layer when a flow is presented', () => {
    render(<Driver initial={initialNavState()} />)
    navigateTo(present(initialNavState(), makeEntry('test'), 'fullscreen'))
    expect(calls.length).toBe(1)
    expect(calls[0].el.getAttribute('data-nav-layer')).toBe('overlay')
    expect(calls[0].keyframes[0].transform).toBeTruthy()
  })

  it('cancels an animation still running when the next navigation starts', () => {
    render(<Driver initial={initialNavState()} />)
    navigateTo(selectTab(initialNavState(), 'stories'))
    navigateTo(selectTab(initialNavState(), 'practice'))
    expect(calls.length).toBe(2)
    expect(cancelled).toBe(1)
  })

  it('stays still for a learner who asked for reduced motion', () => {
    window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} })
    render(<Driver initial={initialNavState()} />)
    navigateTo(selectTab(initialNavState(), 'stories'))
    expect(calls.length).toBe(0)
  })

  it('survives a browser with no Web Animations API', () => {
    delete Element.prototype.animate
    render(<Driver initial={initialNavState()} />)
    expect(() => navigateTo(selectTab(initialNavState(), 'stories'))).not.toThrow()
  })

  it('does nothing when the navigation did not change the hierarchy', () => {
    const state = initialNavState()
    render(<Driver initial={state} />)
    navigateTo({ ...state })
    expect(calls.length).toBe(0)
  })

  it('gives the series page a real push, on the overlay layer', () => {
    const stories = selectTab(initialNavState(), 'stories')
    render(<Driver initial={stories} />)
    navigateTo(push(stories, makeEntry('series', { key: 'k' })))
    expect(calls.length).toBe(1)
    expect(calls[0].el.getAttribute('data-nav-layer')).toBe('overlay')
    // A push travels. The pane fade it used to get did not.
    expect(calls[0].keyframes[0].transform).toBeTruthy()
  })
})
