import { describe, it, expect } from 'vitest'
import { groupIntoArcs, leadingChapterNumber, stripLeadingNumber } from './storyArcs'

const s = (id, title) => ({ id, title })

describe('leadingChapterNumber', () => {
  it('reads an ASCII leading number followed by a separator', () => {
    expect(leadingChapterNumber('1. The Cat')).toBe(1)
    expect(leadingChapterNumber('12、xxx')).toBe(12)
    expect(leadingChapterNumber('3：始まり')).toBe(3)
  })
  it('reads a fullwidth leading number', () => {
    expect(leadingChapterNumber('２．つづき')).toBe(2)
  })
  it('does not mistake content digits for a chapter number', () => {
    expect(leadingChapterNumber('2024年の冬')).toBe(null) // digit run not followed by a separator
    expect(leadingChapterNumber('3つの願い')).toBe(null)
    expect(leadingChapterNumber('三日 あとです')).toBe(null) // no leading ASCII/fullwidth digit
    expect(leadingChapterNumber('')).toBe(null)
  })
})

describe('stripLeadingNumber', () => {
  it('removes the chapter marker and trims', () => {
    expect(stripLeadingNumber('1. The Cat')).toBe('The Cat')
    expect(stripLeadingNumber('2、三日 あとです')).toBe('三日 あとです')
  })
  it('leaves an unnumbered title untouched', () => {
    expect(stripLeadingNumber('三日 あとです')).toBe('三日 あとです')
  })
})

describe('groupIntoArcs', () => {
  it('keeps a single ascending run as one arc', () => {
    const arcs = groupIntoArcs([s('a', '1. Cat'), s('b', '2. Cat'), s('c', '3. Cat')])
    expect(arcs).toHaveLength(1)
    expect(arcs[0].parts.map(p => p.id)).toEqual(['a', 'b', 'c'])
    expect(arcs[0].title).toBe('Cat')
    expect(arcs[0].numbered).toBe(true)
  })
  it('splits into a new arc when the chapter number resets to 1', () => {
    const arcs = groupIntoArcs([
      s('a', '1. Missing Cat'), s('b', '2. Missing Cat'),
      s('c', '1. Snow Day'), s('d', '2. Snow Day'), s('e', '3. Snow Day'),
    ])
    expect(arcs).toHaveLength(2)
    expect(arcs[0].title).toBe('Missing Cat')
    expect(arcs[0].parts).toHaveLength(2)
    expect(arcs[1].title).toBe('Snow Day')
    expect(arcs[1].parts).toHaveLength(3)
  })
  it('splits when numbering moves backwards even if not to 1', () => {
    const arcs = groupIntoArcs([s('a', '2. A'), s('b', '3. A'), s('c', '2. B')])
    expect(arcs).toHaveLength(2)
    expect(arcs[1].parts.map(p => p.id)).toEqual(['c'])
  })
  it('groups unnumbered stories into a single arc marked not-numbered', () => {
    const arcs = groupIntoArcs([s('a', '公园里的下午'), s('b', '下雨天'), s('c', '老朋友')])
    expect(arcs).toHaveLength(1)
    expect(arcs[0].numbered).toBe(false)
    expect(arcs[0].parts).toHaveLength(3)
  })
  it('is safe on empty/garbage input', () => {
    expect(groupIntoArcs([])).toEqual([])
    expect(groupIntoArcs(null)).toEqual([])
  })
})
