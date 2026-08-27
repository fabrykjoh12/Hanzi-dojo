import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  mergeIdMaps,
  parseIdMap,
  isValidRecord,
  serializeIdMap,
} from './scripts/needs-testing-state.mjs'

// The id map is the only mutable state #needs-testing has, and losing an entry
// is not a recoverable error: the next run posts a fresh Discord thread for the
// same item, and whatever testers wrote in the original thread is orphaned.
// These specs cover the two ways that happens — a concurrent run overwriting
// the map, and a corrupted map parsing to "empty".

const SEED = JSON.parse(readFileSync('.github/needs-testing.ids.json', 'utf8'))
const rec = (n) => ({ messageId: String(n), threadId: String(n) })

describe('record validation', () => {
  it('accepts a well-formed record', () => {
    expect(isValidRecord({ messageId: '1528150914504982810', threadId: '1528150914504982810' })).toBe(true)
  })

  it('rejects anything that is not a snowflake pair', () => {
    expect(isValidRecord(null)).toBe(false)
    expect(isValidRecord({})).toBe(false)
    expect(isValidRecord({ messageId: '123' })).toBe(false)
    expect(isValidRecord({ messageId: '123', threadId: '456' })).toBe(false)
    expect(isValidRecord({ messageId: 'abc', threadId: '1528150914504982810' })).toBe(false)
    expect(isValidRecord(['1528150914504982810'])).toBe(false)
  })
})

describe('parsing', () => {
  it('reads the committed seed map', () => {
    const parsed = parseIdMap(readFileSync('.github/needs-testing.ids.json', 'utf8'))
    expect(Object.keys(parsed).length).toBe(Object.keys(SEED).length)
    expect(Object.keys(parsed).length).toBeGreaterThan(0)
  })

  it('treats an empty file as an empty map', () => {
    expect(parseIdMap('')).toEqual({})
    expect(parseIdMap('{}')).toEqual({})
  })

  it('throws on invalid JSON rather than silently returning empty', () => {
    // The failure this prevents: a truncated file parses to {}, and the next
    // run posts a duplicate thread for every single item.
    expect(() => parseIdMap('{"a":', 'state')).toThrow(/not valid JSON/)
  })

  it('throws on a non-object', () => {
    expect(() => parseIdMap('[]', 'state')).toThrow(/must be a JSON object/)
    expect(() => parseIdMap('"x"', 'state')).toThrow(/must be a JSON object/)
  })

  it('throws on malformed entries, naming them', () => {
    const text = JSON.stringify({ good: rec('1528150914504982810'), bad: { messageId: 'x' } })
    expect(() => parseIdMap(text, 'state')).toThrow(/malformed entries: bad/)
  })
})

describe('merging concurrent runs', () => {
  it('keeps the remote record when both sides know an id', () => {
    // Remote wins because a remote record means the thread already exists in
    // Discord; preferring the local one would abandon it.
    const remote = { a: rec('1528150914504982810') }
    const local = { a: rec('1999999999999999999') }
    expect(mergeIdMaps(remote, local).a.messageId).toBe('1528150914504982810')
  })

  it('contributes ids the remote has never seen', () => {
    const remote = { a: rec('1528150914504982810') }
    const local = { b: rec('1528150915251441726') }
    expect(Object.keys(mergeIdMaps(remote, local)).sort()).toEqual(['a', 'b'])
  })

  it('loses nothing from either side', () => {
    const remote = { a: rec('1111111111111111111'), b: rec('2222222222222222222') }
    const local = { b: rec('3333333333333333333'), c: rec('4444444444444444444') }
    const merged = mergeIdMaps(remote, local)
    expect(Object.keys(merged).sort()).toEqual(['a', 'b', 'c'])
    expect(merged.b.messageId).toBe('2222222222222222222')  // remote
    expect(merged.c.messageId).toBe('4444444444444444444')  // local
  })

  it('handles an absent remote — the bootstrap case', () => {
    expect(mergeIdMaps({}, SEED)).toEqual(mergeIdMaps(SEED, {}))
    expect(Object.keys(mergeIdMaps({}, SEED)).length).toBe(Object.keys(SEED).length)
  })

  it('is order-independent for disjoint inputs', () => {
    const x = { a: rec('1111111111111111111') }
    const y = { b: rec('2222222222222222222') }
    expect(mergeIdMaps(x, y)).toEqual(mergeIdMaps(y, x))
  })

  it('is idempotent', () => {
    const once = mergeIdMaps(SEED, {})
    expect(mergeIdMaps(once, once)).toEqual(once)
  })
})

describe('serialisation is a function of content alone', () => {
  it('sorts keys, so two runs reaching the same state produce the same blob', () => {
    const a = serializeIdMap(mergeIdMaps({ z: rec('1111111111111111111') }, { a: rec('2222222222222222222') }))
    const b = serializeIdMap(mergeIdMaps({ a: rec('2222222222222222222') }, { z: rec('1111111111111111111') }))
    expect(a).toBe(b)
    expect(a.indexOf('"a"')).toBeLessThan(a.indexOf('"z"'))
  })

  it('round-trips through the parser', () => {
    const merged = mergeIdMaps(SEED, {})
    expect(parseIdMap(serializeIdMap(merged))).toEqual(merged)
  })

  it('ends with a newline', () => {
    expect(serializeIdMap({})).toMatch(/\n$/)
  })
})
