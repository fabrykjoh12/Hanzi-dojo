import { describe, it, expect } from 'vitest'
import { addRecent, RECENT_CAP } from './recentLookups'

const w = (id, extra = {}) => ({ id, word: 'w' + id, reading: 'r' + id, meaning: 'm' + id, level: 1, ...extra })

describe('addRecent', () => {
  it('prepends a new entry to the front', () => {
    const out = addRecent([w(1), w(2)], w(3))
    expect(out.map(e => e.id)).toEqual([3, 1, 2])
  })

  it('de-duplicates by id, moving a re-lookup to the front', () => {
    const out = addRecent([w(1), w(2), w(3)], w(3))
    expect(out.map(e => e.id)).toEqual([3, 1, 2])
    expect(out.filter(e => e.id === 3)).toHaveLength(1)
  })

  it('caps the list length (default RECENT_CAP)', () => {
    let list = []
    for (let i = 0; i < RECENT_CAP + 5; i += 1) list = addRecent(list, w(i))
    expect(list).toHaveLength(RECENT_CAP)
    // The most recent id is at the front; the oldest have fallen off.
    expect(list[0].id).toBe(RECENT_CAP + 4)
  })

  it('honours a custom cap', () => {
    const out = addRecent([w(1), w(2), w(3)], w(4), 2)
    expect(out.map(e => e.id)).toEqual([4, 1])
  })

  it('keeps only the display fields', () => {
    const out = addRecent([], w(7, { secret: 'nope', stability: 99 }))
    expect(out[0]).toEqual({ id: 7, word: 'w7', reading: 'r7', meaning: 'm7', level: 1 })
    expect(out[0]).not.toHaveProperty('secret')
    expect(out[0]).not.toHaveProperty('stability')
  })

  it('ignores an entry with no id, returning the (capped) existing list', () => {
    expect(addRecent([w(1), w(2)], null).map(e => e.id)).toEqual([1, 2])
    expect(addRecent([w(1), w(2)], { word: 'x' }).map(e => e.id)).toEqual([1, 2])
  })

  it('tolerates a non-array list', () => {
    expect(addRecent(undefined, w(1)).map(e => e.id)).toEqual([1])
    expect(addRecent(null, w(1)).map(e => e.id)).toEqual([1])
  })

  it('defaults missing display fields to empty strings', () => {
    const out = addRecent([], { id: 5 })
    expect(out[0]).toEqual({ id: 5, word: '', reading: '', meaning: '', level: undefined })
  })
})
