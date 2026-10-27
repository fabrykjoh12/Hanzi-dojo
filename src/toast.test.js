import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { toast, registerToastListener, toastsAreListening } from './toast'

// The suite runs in the node environment (vitest.config.js) because almost
// nothing here needs a DOM. toast() needs exactly one thing from one — an event
// target — so it gets one rather than the whole of jsdom.
const realWindow = globalThis.window

// toast() has no queue: an event dispatched with no <Toasts /> mounted is lost
// with no error anywhere. That is the defect this registry exists to let a
// caller avoid, so what matters is that toastsAreListening() tracks reality.

beforeEach(() => {
  // Drain any registration a previous test left behind.
  while (toastsAreListening()) registerToastListener()()
})

describe('toastsAreListening', () => {
  it('is false before any stack mounts', () => {
    expect(toastsAreListening()).toBe(false)
  })

  it('is true while a stack is registered, and false again after it releases', () => {
    const release = registerToastListener()
    expect(toastsAreListening()).toBe(true)
    release()
    expect(toastsAreListening()).toBe(false)
  })

  it('needs every stack to release before it goes quiet', () => {
    // Two mounted at once happens during a route transition, when React has
    // the outgoing tree and the incoming one alive in the same commit.
    const a = registerToastListener()
    const b = registerToastListener()
    a()
    expect(toastsAreListening()).toBe(true)
    b()
    expect(toastsAreListening()).toBe(false)
  })

  it('does not go negative when a release runs twice', () => {
    // React can invoke a cleanup more than once across a strict-mode double
    // render; a count that went negative would then report "not listening"
    // while a stack was still mounted, and swallow a real notice.
    const release = registerToastListener()
    release(); release(); release()
    expect(toastsAreListening()).toBe(false)
    const other = registerToastListener()
    expect(toastsAreListening()).toBe(true)
    other()
  })
})

describe('toast', () => {
  afterEach(() => { globalThis.window = realWindow })

  it('dispatches its argument verbatim', () => {
    globalThis.window = new EventTarget()
    // The round-1 defect in one line: whatever is handed in is what <Toasts />
    // spreads, so a string arrives as {0:'A',1:'d',…} with no title.
    const seen = []
    const on = (e) => seen.push(e.detail)
    window.addEventListener('hd-toast', on)
    const payload = { kind: 'warn', title: 'x' }
    toast(payload)
    window.removeEventListener('hd-toast', on)
    expect(seen).toEqual([payload])
  })
})
