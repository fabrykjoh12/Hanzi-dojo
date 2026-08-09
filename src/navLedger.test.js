import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordNavState, readNavState, restoreForPop, resetLedger, ledgerSize, LEDGER_LIMIT,
} from './navLedger'
import {
  initialNavState, selectTab, push, makeEntry, urlForState, stackForPath, present,
} from './navStack'

beforeEach(() => resetLedger())

describe('recording and reading', () => {
  it('hands back a distinct id per snapshot', () => {
    const a = recordNavState(initialNavState())
    const b = recordNavState(selectTab(initialNavState(), 'stories'))
    expect(a).not.toBe(b)
    expect(readNavState(a).activeTab).toBe('home')
    expect(readNavState(b).activeTab).toBe('stories')
  })

  it('reads null for an id it never issued', () => {
    expect(readNavState(9999)).toBe(null)
    expect(readNavState(undefined)).toBe(null)
    expect(readNavState(null)).toBe(null)
    expect(readNavState('3')).toBe(null)
  })
})

describe('restoreForPop — the snapshot must agree with the URL', () => {
  it('restores a snapshot whose destination matches the pathname', () => {
    const state = push(selectTab(initialNavState(), 'practice'), makeEntry('words'))
    const navId = recordNavState(state)
    const out = restoreForPop({ navId, pathname: '/words' })
    expect(out.source).toBe('ledger')
    expect(out.state).toEqual(state)
  })

  it('rebuilds instead of trusting a snapshot that disagrees with the pathname', () => {
    // History state is writable by anything on the page, survives a deploy that
    // changed the state shape, and can simply be wrong. Restoring it blindly
    // would render one screen while the address bar claimed another.
    const state = push(selectTab(initialNavState(), 'practice'), makeEntry('words'))
    const navId = recordNavState(state)
    const out = restoreForPop({ navId, pathname: '/stories' })
    expect(out.source).toBe('rebuilt')
    expect(out.state).toEqual(stackForPath('/stories'))
    expect(urlForState(out.state)).toBe('/stories')
  })

  it('rebuilds for an id that was never issued', () => {
    const out = restoreForPop({ navId: 4242, pathname: '/stories/series/inkbound' })
    expect(out.source).toBe('rebuilt')
    expect(out.state).toEqual(stackForPath('/stories/series/inkbound'))
  })

  it('rebuilds when history carries no id at all — a cold deep link', () => {
    const out = restoreForPop({ navId: undefined, pathname: '/words' })
    expect(out.source).toBe('rebuilt')
    expect(out.state.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
  })

  it('rebuilds after a reload, when every id in history has become unknown', () => {
    const navId = recordNavState(selectTab(initialNavState(), 'stories'))
    resetLedger()             // what a page reload does to the ledger
    const out = restoreForPop({ navId, pathname: '/stories' })
    expect(out.source).toBe('rebuilt')
    expect(out.state.activeTab).toBe('stories')
  })

  it('always returns a usable state, whatever it is handed', () => {
    expect(restoreForPop({ navId: null, pathname: '/utter-nonsense' }).state.activeTab).toBe('home')
    expect(restoreForPop({}).state).toEqual(stackForPath('/'))
  })

  it('tolerates a trailing slash when comparing', () => {
    const state = selectTab(initialNavState(), 'stories')
    const navId = recordNavState(state)
    expect(restoreForPop({ navId, pathname: '/stories/' }).source).toBe('ledger')
  })

  it('does not confuse an overlay with the tab behind it', () => {
    const reader = present(selectTab(initialNavState(), 'stories'), makeEntry('reader', { id: 'abc' }), 'fullscreen')
    const navId = recordNavState(reader)
    expect(restoreForPop({ navId, pathname: '/stories/abc' }).source).toBe('ledger')
    // Same snapshot, wrong URL: the shelf, not the reader.
    expect(restoreForPop({ navId, pathname: '/stories' }).source).toBe('rebuilt')
  })
})

describe('bounded eviction', () => {
  it('keeps at most LEDGER_LIMIT snapshots', () => {
    for (let i = 0; i < LEDGER_LIMIT + 25; i += 1) recordNavState(initialNavState())
    expect(ledgerSize()).toBe(LEDGER_LIMIT)
  })

  it('evicts oldest first', () => {
    const first = recordNavState(initialNavState())
    for (let i = 0; i < LEDGER_LIMIT; i += 1) recordNavState(initialNavState())
    expect(readNavState(first)).toBe(null)
  })

  it('recovers deterministically when Back reaches an evicted entry', () => {
    // Navigate well past capacity, remembering the id of an early entry, then
    // POP to it the way a long session's Back button eventually would.
    const early = push(selectTab(initialNavState(), 'practice'), makeEntry('words'))
    const earlyId = recordNavState(early)
    for (let i = 0; i < LEDGER_LIMIT + 10; i += 1) {
      recordNavState(selectTab(initialNavState(), 'stories'))
    }
    expect(readNavState(earlyId)).toBe(null)

    const out = restoreForPop({ navId: earlyId, pathname: '/words' })

    // No error, and the visible destination is exactly right.
    expect(out.source).toBe('rebuilt')
    expect(out.state.activeTab).toBe('practice')
    expect(out.state.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
    expect(urlForState(out.state)).toBe('/words')
  })

  it('returns the other tabs to their roots after an evicted restore, as documented', () => {
    // NAV-MODEL §1.5: the URL expresses only the visible branch, so the
    // invisible tabs cannot be recovered. This is the accepted cost of keeping
    // one integer in history instead of the whole state.
    let rich = push(selectTab(initialNavState(), 'practice'), makeEntry('words'))
    rich = push(selectTab(rich, 'stories'), makeEntry('series', { key: 'inkbound' }))
    rich = selectTab(rich, 'practice')
    const richId = recordNavState(rich)
    for (let i = 0; i < LEDGER_LIMIT + 5; i += 1) recordNavState(initialNavState())

    const out = restoreForPop({ navId: richId, pathname: '/words' })
    expect(out.state.stacks.practice.map(e => e.view)).toEqual(['practice', 'words'])
    expect(out.state.stacks.stories.map(e => e.view)).toEqual(['stories'])
  })

  it('still serves a recent entry after heavy navigation', () => {
    for (let i = 0; i < LEDGER_LIMIT * 2; i += 1) recordNavState(initialNavState())
    const recent = recordNavState(selectTab(initialNavState(), 'stories'))
    expect(restoreForPop({ navId: recent, pathname: '/stories' }).source).toBe('ledger')
  })
})
