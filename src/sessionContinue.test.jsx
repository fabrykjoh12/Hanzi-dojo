/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useState, useEffect, useRef } from 'react'
import { render, act, cleanup, within, fireEvent } from '@testing-library/react'
import TabHost from './TabHost'
import { initialNavState, selectTab } from './navStack'
import SessionPaused from './SessionPaused'

// The Cards tab must not greet you with a screen you did not ask for.
//
// Found on a device: pressing X once parked the session, and because the Cards
// root is PERSISTENT (<Activity> keeps its state), `paused` outlived the visit.
// Every later tap on Cards — in an app run where no card had been opened —
// landed on the paused takeover. The web never showed it, because you rarely
// come back to a tab hours later in a browser.
//
// The rule these specs hold: leaving the tab converts "paused" into an OFFER,
// and the offer is never entered on the learner's behalf.

// A stand-in for Study's session lifecycle: the exact state machine, without
// the 1,500 lines of flashcard around it. What is under test is the lifecycle,
// which is where the bug was — not the card rendering.
function SessionProbe({ queue, graded }) {
  const [paused, setPaused] = useState(false)
  const [awaitingContinue, setAwaitingContinue] = useState(false)
  const [done, setDone] = useState(false)

  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => () => {
    if (pausedRef.current) { setPaused(false); setAwaitingContinue(true) }
  }, [])

  if ((paused || awaitingContinue) && !done && queue > 0) {
    const resume = () => { setPaused(false); setAwaitingContinue(false) }
    return (
      <SessionPaused
        variant={paused ? 'paused' : 'continue'}
        studied={graded}
        remaining={queue}
        accentHex="#B83A24"
        onResume={resume}
        onFinish={() => { resume(); setDone(true) }}
      />
    )
  }
  if (done) return <div>Session complete</div>
  return (
    <div>
      <h1>Flashcard</h1>
      <button onClick={() => setPaused(true)} aria-label="Close study session">X</button>
    </div>
  )
}

function Shell({ nav, queue = 5, graded = 2 }) {
  return (
    <TabHost
      nav={nav}
      mounted={new Set(['home', 'study'])}
      render={(tab) => (tab === 'study' ? <SessionProbe queue={queue} graded={graded} /> : <span>{tab}</span>)}
      scrollFor={() => 0}
      onScrollCapture={() => {}}
    />
  )
}

const cardsPane = (view) => view.container.querySelector('[data-tab-root="study"]')

let nav
beforeEach(() => { nav = selectTab(initialNavState(), 'study') })
afterEach(cleanup)

function leaveAndReturn(view, queue = 5) {
  act(() => { view.rerender(<Shell nav={selectTab(nav, 'home')} queue={queue} />) })
  act(() => { view.rerender(<Shell nav={nav} queue={queue} />) })
}

describe('opening the Cards tab', () => {
  it('with no session in progress, opens the flashcard root', () => {
    const view = render(<Shell nav={nav} graded={0} />)
    expect(within(cardsPane(view)).getByRole('heading').textContent).toBe('Flashcard')
    expect(within(cardsPane(view)).queryByText(/Unfinished session|Session paused/)).toBe(null)
  })

  it('never enters the paused presentation just because the tab became visible', () => {
    const view = render(<Shell nav={nav} />)
    // Leave and come back several times WITHOUT ever pressing X.
    leaveAndReturn(view)
    leaveAndReturn(view)
    expect(within(cardsPane(view)).getByRole('heading').textContent).toBe('Flashcard')
  })

  it('with an unfinished session, offers to continue rather than imposing a pause', () => {
    const view = render(<Shell nav={nav} />)
    // Press X: this visit's deliberate outcome.
    fireEvent.click(within(cardsPane(view)).getByRole('button', { name: 'Close study session' }))
    expect(within(cardsPane(view)).getByText('Session paused')).toBeTruthy()

    // Leave, come back later. Same session, offered — not the same screen
    // reporting something that did not just happen.
    leaveAndReturn(view)
    const pane = cardsPane(view)
    expect(within(pane).queryByText('Session paused')).toBe(null)
    expect(within(pane).getByText('Unfinished session')).toBeTruthy()
    expect(within(pane).getByText(/cards remaining/)).toBeTruthy()
    expect(within(pane).getByRole('button', { name: /Continue session/ })).toBeTruthy()
  })

  it('resumes the same queue when Continue is chosen — and only then', () => {
    const view = render(<Shell nav={nav} />)
    fireEvent.click(within(cardsPane(view)).getByRole('button', { name: 'Close study session' }))
    leaveAndReturn(view)

    // The learner chooses. Nothing chose for them.
    fireEvent.click(within(cardsPane(view)).getByRole('button', { name: /Continue session/ }))
    expect(within(cardsPane(view)).getByRole('heading').textContent).toBe('Flashcard')
  })

  it('keeps the unfinished session across repeated leaves and returns', () => {
    const view = render(<Shell nav={nav} />)
    fireEvent.click(within(cardsPane(view)).getByRole('button', { name: 'Close study session' }))
    leaveAndReturn(view)
    leaveAndReturn(view)
    leaveAndReturn(view)
    const pane = cardsPane(view)
    // Still offered, still the same count — not lost, and not re-imposed as a
    // pause the learner never pressed.
    expect(within(pane).getByText('Unfinished session')).toBeTruthy()
    expect(within(pane).getByText(/5/)).toBeTruthy()
    expect(within(pane).queryByText('Session paused')).toBe(null)
  })

  it('lets the learner finish it instead, and does not offer again', () => {
    const view = render(<Shell nav={nav} />)
    fireEvent.click(within(cardsPane(view)).getByRole('button', { name: 'Close study session' }))
    leaveAndReturn(view)
    fireEvent.click(within(cardsPane(view)).getByRole('button', { name: /Finish for now/ }))
    expect(within(cardsPane(view)).getByText('Session complete')).toBeTruthy()
    leaveAndReturn(view)
    expect(within(cardsPane(view)).queryByText(/Unfinished session/)).toBe(null)
  })
})
