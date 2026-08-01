import { describe, it, expect } from 'vitest'
import { isExplicitEntry, splitExplicit, hiddenLabel } from './dictExplicit'

const entry = (defs) => ({ id: 'x', definitions: defs })

describe('isExplicitEntry', () => {
  it('flags entries whose definitions carry CC-CEDICT explicit markers', () => {
    expect(isExplicitEntry(entry(['(vulgar) penis']))).toBe(true)
    expect(isExplicitEntry(entry(['ordinary sense', 'to scold (coarse)']))).toBe(true)
    expect(isExplicitEntry(entry(['(offensive) slur']))).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isExplicitEntry(entry(['(Vulgar) something']))).toBe(true)
  })

  it('leaves ordinary entries alone', () => {
    expect(isExplicitEntry(entry(['friend', 'CL:個|个[ge4],位[wei4]']))).toBe(false)
    expect(isExplicitEntry(entry(['(slang) cool']))).toBe(false) // slang alone is not explicit
    expect(isExplicitEntry(entry(['vulgarity (as an abstract noun in a definition)']))).toBe(false)
  })

  it('tolerates malformed rows', () => {
    expect(isExplicitEntry(null)).toBe(false)
    expect(isExplicitEntry({})).toBe(false)
    expect(isExplicitEntry({ definitions: 'not-an-array' })).toBe(false)
  })
})

describe('splitExplicit', () => {
  it('partitions preserving order', () => {
    const a = entry(['friend'])
    const b = entry(['(vulgar) x'])
    const c = entry(['cold'])
    const { shown, hidden } = splitExplicit([a, b, c])
    expect(shown).toEqual([a, c])
    expect(hidden).toEqual([b])
  })
  it('handles empty and missing input', () => {
    expect(splitExplicit([])).toEqual({ shown: [], hidden: [] })
    expect(splitExplicit(null)).toEqual({ shown: [], hidden: [] })
  })
})

describe('hiddenLabel', () => {
  it('pluralizes correctly', () => {
    expect(hiddenLabel(1)).toBe('1 explicit result hidden')
    expect(hiddenLabel(3)).toBe('3 explicit results hidden')
  })
  it('is empty for zero or invalid counts', () => {
    expect(hiddenLabel(0)).toBe('')
    expect(hiddenLabel(-2)).toBe('')
    expect(hiddenLabel(undefined)).toBe('')
  })
})
