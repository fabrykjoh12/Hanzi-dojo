import { describe, it, expect } from 'vitest'
import {
  IDLE, SEARCHING, READY, FAILED,
  initialDictSearch, dictSearchReducer, dictSearchView,
} from './dictSearchState'

const request = (state, term) => dictSearchReducer(state, { type: 'request', term })
const resolve = (state, term, rows) => dictSearchReducer(state, { type: 'resolve', term, rows })
const reject = (state, term, error) => dictSearchReducer(state, { type: 'reject', term, error })

describe('dictSearchReducer', () => {
  it('starts idle and empty', () => {
    expect(initialDictSearch.status).toBe(IDLE)
    expect(initialDictSearch.rows).toEqual([])
  })

  it('a request marks the term pending without discarding the previous answer', () => {
    const ready = resolve(request(initialDictSearch, 'zhong'), 'zhong', [{ id: 'd1' }])
    const next = request(ready, 'zhongwen')
    expect(next.status).toBe(SEARCHING)
    expect(next.pendingTerm).toBe('zhongwen')
    // The rows for the OLD term stay so the list doesn't blank on every keystroke.
    expect(next.rows).toEqual([{ id: 'd1' }])
    expect(next.term).toBe('zhong')
  })

  it('trims the requested term and ignores a repeat of the pending one', () => {
    const a = request(initialDictSearch, '  zhong ')
    expect(a.pendingTerm).toBe('zhong')
    expect(request(a, 'zhong')).toBe(a)
  })

  it('clearing the box resets everything, including a failure', () => {
    const failed = reject(request(initialDictSearch, 'zhong'), 'zhong', 'boom')
    expect(failed.status).toBe(FAILED)
    expect(request(failed, '   ')).toEqual(initialDictSearch)
  })

  // The headline bug: an in-flight query resolving after a newer one used to
  // overwrite the fresher results.
  it('drops a response that answers a term we have already typed past', () => {
    let s = request(initialDictSearch, 'zhong')
    s = request(s, 'zhongwen')                       // learner keeps typing
    s = resolve(s, 'zhong', [{ id: 'stale' }])       // the OLD request lands late
    expect(s.rows).not.toEqual([{ id: 'stale' }])
    expect(s.pendingTerm).toBe('zhongwen')
    expect(s.status).toBe(SEARCHING)

    s = resolve(s, 'zhongwen', [{ id: 'fresh' }])
    expect(s.rows).toEqual([{ id: 'fresh' }])
    expect(s.term).toBe('zhongwen')
    expect(s.status).toBe(READY)
  })

  it('drops a late failure from a superseded term', () => {
    let s = request(initialDictSearch, 'zhong')
    s = resolve(s, 'zhong', [{ id: 'd1' }])
    s = request(s, 'zhongwen')
    s = reject(s, 'zhong', 'boom')                   // old request fails late
    expect(s.status).toBe(SEARCHING)
    expect(s.error).toBe(null)
  })

  it('a failure for the live term clears the previous results instead of leaving them', () => {
    let s = resolve(request(initialDictSearch, 'zhong'), 'zhong', [{ id: 'd1' }])
    s = request(s, 'mao')
    s = reject(s, 'mao', 'network down')
    expect(s.status).toBe(FAILED)
    expect(s.rows).toEqual([])          // never show 'zhong' results under 'mao'
    expect(s.error).toBe('network down')
    expect(s.term).toBe('mao')
  })

  it('tolerates junk actions and missing state', () => {
    expect(dictSearchReducer(undefined, { type: 'nope' })).toBe(initialDictSearch)
    expect(dictSearchReducer(initialDictSearch, null)).toBe(initialDictSearch)
    expect(dictSearchReducer(initialDictSearch, { type: 'reset' })).toBe(initialDictSearch)
    expect(resolve(initialDictSearch, '', [{ id: 'x' }])).toBe(initialDictSearch)
  })

  it('a non-array payload never becomes the row list', () => {
    const s = resolve(request(initialDictSearch, 'zhong'), 'zhong', null)
    expect(s.rows).toEqual([])
    expect(s.status).toBe(READY)
  })
})

describe('dictSearchView', () => {
  it('an empty box is idle', () => {
    expect(dictSearchView(initialDictSearch, '   ').mode).toBe('idle')
  })

  it('the first search shows a spinner; later searches keep the old rows', () => {
    const first = request(initialDictSearch, 'zhong')
    expect(dictSearchView(first, 'zhong').mode).toBe('loading')

    const ready = resolve(first, 'zhong', [{ id: 'd1' }])
    const second = request(ready, 'zhongwen')
    const view = dictSearchView(second, 'zhongwen')
    expect(view.mode).toBe('refreshing')
    expect(view.rows).toEqual([{ id: 'd1' }])   // no blank flash between queries
  })

  // The one-frame flash: the input already says 'zhongwen' but the effect that
  // dispatches the request has not run yet. That must never render as "no
  // results" — the old code did exactly that.
  it('never reports "no matches" for a query the state has not answered yet', () => {
    const answered = resolve(request(initialDictSearch, 'zhong'), 'zhong', [])
    expect(dictSearchView(answered, 'zhong').mode).toBe('empty')
    // Input moved on, no dispatch yet — still not "empty".
    expect(dictSearchView(answered, 'zhongwen').mode).toBe('loading')
  })

  it('reports results only when they answer the live query', () => {
    const ready = resolve(request(initialDictSearch, 'zhong'), 'zhong', [{ id: 'd1' }])
    expect(dictSearchView(ready, 'zhong').mode).toBe('results')
    expect(dictSearchView(ready, 'zhon').mode).toBe('refreshing')
  })

  it('surfaces a failure for the live query, and only that query', () => {
    const failed = reject(request(initialDictSearch, 'zhong'), 'zhong', 'boom')
    const view = dictSearchView(failed, 'zhong')
    expect(view.mode).toBe('error')
    expect(view.error).toBe('boom')
    // Typing again leaves the error behind.
    expect(dictSearchView(failed, 'zhongwen').mode).toBe('loading')
  })

  it('a retry of the same term reads as loading, not as "no matches"', () => {
    const failed = reject(request(initialDictSearch, 'zhong'), 'zhong', 'boom')
    const retrying = request(failed, 'zhong')
    expect(dictSearchView(retrying, 'zhong').mode).toBe('loading')
  })

  it('says offline instead of spinning forever when there is no connection', () => {
    expect(dictSearchView(initialDictSearch, 'zhong', false).mode).toBe('offline')
    // Results already fetched for this exact query stay readable offline.
    const ready = resolve(request(initialDictSearch, 'zhong'), 'zhong', [{ id: 'd1' }])
    expect(dictSearchView(ready, 'zhong', false).mode).toBe('results')
  })
})
