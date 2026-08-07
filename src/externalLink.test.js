import { describe, it, expect, afterEach, vi } from 'vitest'
import { isExternalUrl, publicPageUrl, externalLinkProps, legalLinkProps } from './externalLink'

afterEach(() => {
  delete globalThis.window
})

describe('isExternalUrl', () => {
  it('accepts absolute http(s) URLs', () => {
    expect(isExternalUrl('https://discord.gg/abc')).toBe(true)
    expect(isExternalUrl('http://example.com')).toBe(true)
    expect(isExternalUrl('  https://tatoeba.org/  ')).toBe(true)
  })

  it('rejects in-app routes and other schemes', () => {
    expect(isExternalUrl('/privacy')).toBe(false)
    expect(isExternalUrl('mailto:hi@hanzi-dojo.com')).toBe(false)
    expect(isExternalUrl('#top')).toBe(false)
    expect(isExternalUrl('')).toBe(false)
    expect(isExternalUrl(undefined)).toBe(false)
    expect(isExternalUrl(42)).toBe(false)
  })
})

describe('publicPageUrl', () => {
  it('builds the hosted address of one of our own pages', () => {
    expect(publicPageUrl('/terms')).toBe('https://hanzi-dojo.com/terms')
    expect(publicPageUrl('privacy')).toBe('https://hanzi-dojo.com/privacy')
  })
  it('falls back to the site root for junk', () => {
    expect(publicPageUrl('')).toBe('https://hanzi-dojo.com')
    expect(publicPageUrl(undefined)).toBe('https://hanzi-dojo.com')
  })
})

describe('externalLinkProps', () => {
  it('keeps a real href and safe rel, so web behaviour is unchanged', () => {
    const props = externalLinkProps('https://discord.gg/abc')
    expect(props.href).toBe('https://discord.gg/abc')
    expect(props.target).toBe('_blank')
    expect(props.rel).toBe('noopener noreferrer')
  })

  it('does NOT intercept the click on the web — the browser handles it', () => {
    globalThis.window = {}
    const event = { preventDefault: vi.fn() }
    externalLinkProps('https://discord.gg/abc').onClick(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('intercepts inside the native shell, where target=_blank misbehaves', () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => true } }
    const event = { preventDefault: vi.fn() }
    externalLinkProps('https://discord.gg/abc').onClick(event)
    expect(event.preventDefault).toHaveBeenCalled()
  })
})

describe('legalLinkProps', () => {
  it('keeps the in-app route as the href, so the web opens it in a tab', () => {
    const props = legalLinkProps('/terms')
    expect(props.href).toBe('/terms')
    expect(props.target).toBe('_blank')
  })

  it('leaves the web alone', () => {
    globalThis.window = {}
    const event = { preventDefault: vi.fn() }
    legalLinkProps('/terms').onClick(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('takes over in the native shell (the hosted copy opens outside the app)', () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => true } }
    const event = { preventDefault: vi.fn() }
    legalLinkProps('/terms').onClick(event)
    expect(event.preventDefault).toHaveBeenCalled()
  })
})
