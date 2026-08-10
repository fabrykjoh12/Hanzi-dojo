/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useState, useEffect, useRef } from 'react'
import { render, act, cleanup } from '@testing-library/react'
import TabHost from './TabHost'
import { initialNavState, selectTab } from './navStack'
import { resetCache, setCacheScope, query, invalidate, readCache } from './dataCache'
import { publish, HOME_IDENTITY, HOME_COUNTS, HOME_HANDOFF } from './cacheEvents'

// Home's data lifecycle, asserted against the real shell.
//
// The screen lifecycle and the DATA lifecycle are separate now, and these specs
// are what says so: the Home root stays mounted, its effects reconnect on every
// show exactly as <Activity> intends, and the cache is what makes reconnecting
// free. Nothing here works around Activity — that was the failure mode to avoid.

const fetches = { handoff: 0, counts: 0, identity: 0 }
let mounts = 0
let resolvers = []

// A fetcher that can be settled by hand, so a response landing after an
// invalidation is a thing the test can arrange rather than a thing it hopes for.
function deferred(kind) {
  return () => {
    fetches[kind] += 1
    return new Promise((resolve) => { resolvers.push({ kind, resolve }) })
  }
}

function settleLast(value) {
  const r = resolvers.pop()
  if (r) r.resolve(value)
}
function settleAll(value) {
  const all = resolvers
  resolvers = []
  all.forEach((r) => r.resolve(value))
}

// The shape of Home's own effect: query on every show, paint what is cached,
// adopt what comes back. Deliberately a copy of Home.jsx's structure rather
// than an import of it — Home needs a profile, a track and a dozen props, and
// what is under test is the lifecycle, not the layout.
function HomeProbe() {
  const [handoff, setHandoff] = useState(null)
  const first = useRef(false)
  useEffect(() => {
    if (first.current) return
    first.current = true
    mounts += 1
  })
  /* eslint-disable react-hooks/set-state-in-effect */
  // No dependency array on purpose: this must run on every show, which is the
  // behaviour under test. The cache is what makes that free.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true
    const res = query(HOME_HANDOFF, deferred('handoff'))
    if (res.value) setHandoff(res.value)
    if (res.promise) {
      res.promise.then((settled) => {
        if (alive && settled && settled.ok) setHandoff(settled.value)
      })
    }
    return () => { alive = false }
  })
  /* eslint-enable react-hooks/set-state-in-effect */
  return <span data-testid="handoff">{handoff ? handoff.label : 'none'}</span>
}

function host(nav, mounted) {
  return (
    <TabHost
      nav={nav}
      mounted={mounted}
      render={(tab) => (tab === 'home' ? <HomeProbe /> : <span>{tab}</span>)}
      scrollFor={() => 0}
      onScrollCapture={() => {}}
    />
  )
}

const MOUNTED = new Set(['home', 'stories', 'study'])

function goTo(view, nav, tab) {
  const next = selectTab(nav, tab)
  act(() => { view.rerender(host(next, MOUNTED)) })
  return next
}

beforeEach(() => {
  fetches.handoff = 0
  fetches.counts = 0
  fetches.identity = 0
  mounts = 0
  resolvers = []
  resetCache()
  setCacheScope({ userId: 'user-a', language: 'chinese' })
})

afterEach(cleanup)

describe('a normal revisit', () => {
  it('costs no requests at all, and does not remount Home', async () => {
    let nav = initialNavState()
    const view = render(host(nav, MOUNTED))
    expect(fetches.handoff).toBe(1)
    await act(async () => { settleAll({ label: 'chapter 4' }) })
    expect(view.getByTestId('handoff').textContent).toBe('chapter 4')

    nav = goTo(view, nav, 'stories')
    nav = goTo(view, nav, 'home')
    nav = goTo(view, nav, 'stories')
    goTo(view, nav, 'home')

    // The target: an unchanged Home revisit performs zero Home data requests.
    expect(fetches.handoff).toBe(1)
    expect(mounts).toBe(1)
    // And the screen still has its data — no blank, no skeleton.
    expect(view.getByTestId('handoff').textContent).toBe('chapter 4')
  })
})

describe('after a session', () => {
  it('revalidates the hand-off and the counts, and leaves the profile alone', async () => {
    let nav = initialNavState()
    const view = render(host(nav, MOUNTED))
    await act(async () => { settleAll({ label: 'chapter 4' }) })
    // Seed the two keys App owns, the way loadProfile does.
    act(() => {
      query(HOME_IDENTITY, deferred('identity'))
      query(HOME_COUNTS, deferred('counts'))
    })
    await act(async () => { settleAll({ ok: true }) })
    expect(fetches.identity).toBe(1)
    expect(fetches.counts).toBe(1)

    nav = goTo(view, nav, 'study')
    act(() => { publish('session:completed') })
    goTo(view, nav, 'home')

    // The hand-off refetches because a session can unlock a chapter…
    expect(fetches.handoff).toBe(2)
    // …and the old value is still on screen while it does. No skeleton flash.
    expect(view.getByTestId('handoff').textContent).toBe('chapter 4')
    await act(async () => { settleAll({ label: 'chapter 5' }) })
    expect(view.getByTestId('handoff').textContent).toBe('chapter 5')

    // Counts are marked behind; identity is not touched by studying.
    expect(readCache(HOME_COUNTS).invalidated).toBe(true)
    expect(readCache(HOME_IDENTITY).invalidated).toBe(false)
  })

  it('a single graded card marks the counts and nothing else', async () => {
    const view = render(host(initialNavState(), MOUNTED))
    await act(async () => { settleAll({ label: 'chapter 4' }) })
    act(() => {
      query(HOME_COUNTS, deferred('counts'))
      query(HOME_IDENTITY, deferred('identity'))
    })
    await act(async () => { settleAll({ ok: true }) })

    act(() => { publish('card:graded') })
    expect(readCache(HOME_COUNTS).invalidated).toBe(true)
    expect(readCache(HOME_IDENTITY).invalidated).toBe(false)
    expect(readCache(HOME_HANDOFF).invalidated).toBe(false)

    // Returning to Home does not refetch the hand-off for a graded card.
    let nav = goTo(view, initialNavState(), 'stories')
    goTo(view, nav, 'home')
    expect(fetches.handoff).toBe(1)
  })
})

describe('a chapter unlock', () => {
  it('refreshes the hand-off and leaves the rest cached', async () => {
    let nav = initialNavState()
    const view = render(host(nav, MOUNTED))
    await act(async () => { settleAll({ label: 'chapter 4' }) })
    act(() => { query(HOME_COUNTS, deferred('counts')) })
    await act(async () => { settleAll({ dueCount: 3 }) })

    nav = goTo(view, nav, 'stories')
    act(() => { publish('chapter:unlocked') })
    goTo(view, nav, 'home')

    expect(fetches.handoff).toBe(2)
    expect(readCache(HOME_COUNTS).invalidated).toBe(false)
    expect(fetches.counts).toBe(1)
  })
})

describe('a story read', () => {
  it('updates what to read next without touching the card queue', async () => {
    let nav = initialNavState()
    const view = render(host(nav, MOUNTED))
    await act(async () => { settleAll({ label: 'chapter 4' }) })
    act(() => { query(HOME_COUNTS, deferred('counts')) })
    await act(async () => { settleAll({ dueCount: 3 }) })

    nav = goTo(view, nav, 'stories')
    act(() => { publish('story:read') })
    goTo(view, nav, 'home')

    expect(fetches.handoff).toBe(2)
    // Reading is not reviewing: the queue was not refetched.
    expect(fetches.counts).toBe(1)
    expect(readCache(HOME_COUNTS).invalidated).toBe(false)
  })
})

describe('identity isolation', () => {
  it("can never render account A's Home for account B", async () => {
    const view = render(host(initialNavState(), MOUNTED))
    await act(async () => { settleAll({ label: "A's chapter" }) })
    expect(readCache(HOME_HANDOFF).value.label).toBe("A's chapter")

    // Sign out, then in as someone else.
    act(() => { setCacheScope({ userId: null, language: null }) })
    act(() => { setCacheScope({ userId: 'user-b', language: 'chinese' }) })

    expect(readCache(HOME_HANDOFF)).toBe(null)
    act(() => { view.rerender(host(initialNavState(), MOUNTED)) })
    expect(fetches.handoff).toBe(2)
    await act(async () => { settleAll({ label: "B's chapter" }) })
    expect(readCache(HOME_HANDOFF).value.label).toBe("B's chapter")
  })

  it('keeps each language in its own namespace, and does not throw the other away', async () => {
    render(host(initialNavState(), MOUNTED))
    await act(async () => { settleAll({ label: 'chinese chapter' }) })

    act(() => { setCacheScope({ userId: 'user-a', language: 'japanese' }) })
    // A different namespace: empty, so no cross-language content can show.
    expect(readCache(HOME_HANDOFF)).toBe(null)

    act(() => { setCacheScope({ userId: 'user-a', language: 'chinese' }) })
    // …and switching back finds the first language still valid.
    expect(readCache(HOME_HANDOFF).value.label).toBe('chinese chapter')
  })
})

describe('a race', () => {
  it('cannot let a response that predates an invalidation overwrite newer data', async () => {
    render(host(initialNavState(), MOUNTED))
    expect(fetches.handoff).toBe(1)

    // Something changes while the first request is still in the air.
    act(() => { invalidate(HOME_HANDOFF) })
    await act(async () => { settleLast({ label: 'stale answer' }) })

    // The in-flight answer predates the change, so it is discarded, not stored.
    expect(readCache(HOME_HANDOFF)).toBe(null)
  })

  it('does not join a request that was started before the invalidation', async () => {
    render(host(initialNavState(), MOUNTED))
    act(() => { invalidate(HOME_HANDOFF) })
    // A fresh query must start its OWN request rather than adopting the answer
    // to a question that is already known to be out of date.
    act(() => { query(HOME_HANDOFF, deferred('handoff')) })
    expect(fetches.handoff).toBe(2)
  })
})
