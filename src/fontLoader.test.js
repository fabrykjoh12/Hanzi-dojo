import { describe, it, expect } from 'vitest'
import { fontHrefFor, fontAlreadyLoaded, ensureLanguageFont } from './fontLoader'

// A minimal stand-in for the bits of `document` the loader touches, so the
// suite keeps running in the node environment.
function fakeDoc() {
  const links = []
  return {
    links,
    createElement: () => ({ setAttribute(k, v) { this[k === 'data-hd-font' ? 'tag' : k] = v } }),
    querySelector: (sel) => links.find(l => sel.includes(l.tag)) || null,
    head: { appendChild: (el) => links.push(el) },
  }
}

describe('fontHrefFor', () => {
  it('is null for languages whose faces ship in the base stylesheet', () => {
    expect(fontHrefFor('chinese')).toBe(null)
    expect(fontHrefFor('russian')).toBe(null)
  })

  it('builds a swap-display Google Fonts URL for a language that needs one', () => {
    const href = fontHrefFor('japanese')
    expect(href).toContain('Noto+Sans+JP')
    expect(href).toContain('display=swap')
    expect(href.startsWith('https://fonts.googleapis.com/css2?family=')).toBe(true)
  })

  it('falls back with the rest of the theme for an unknown language', () => {
    expect(fontHrefFor('klingon')).toBe(fontHrefFor('chinese'))
  })
})

describe('ensureLanguageFont', () => {
  it('does nothing for a language already covered by the base stylesheet', () => {
    const doc = fakeDoc()
    expect(ensureLanguageFont('chinese', doc)).toBe(false)
    expect(doc.links).toHaveLength(0)
  })

  it('injects the stylesheet once for a language that needs it', () => {
    const doc = fakeDoc()
    expect(ensureLanguageFont('japanese', doc)).toBe(true)
    expect(doc.links).toHaveLength(1)
    expect(doc.links[0].rel).toBe('stylesheet')
    expect(doc.links[0].href).toContain('Noto+Sans+JP')
  })

  it('is idempotent — switching tracks back and forth adds no second link', () => {
    const doc = fakeDoc()
    ensureLanguageFont('japanese', doc)
    expect(ensureLanguageFont('japanese', doc)).toBe(false)
    expect(doc.links).toHaveLength(1)
  })

  it('never throws when the DOM is unavailable or hostile', () => {
    expect(ensureLanguageFont('japanese', null)).toBe(false)
    const broken = { createElement: () => { throw new Error('nope') }, querySelector: () => null, head: {} }
    expect(ensureLanguageFont('japanese', broken)).toBe(false)
  })
})

describe('fontAlreadyLoaded', () => {
  it('treats an unusable document as "already loaded" so callers no-op', () => {
    expect(fontAlreadyLoaded(null, 'x')).toBe(true)
    expect(fontAlreadyLoaded({}, 'x')).toBe(true)
  })
})
