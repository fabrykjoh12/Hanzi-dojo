import { describe, it, expect } from 'vitest'
import { LEGAL_LINKS, legalLinkPaths } from './legalLinks'
import { trustPageKey } from './routes'

describe('in-app legal links', () => {
  it('offers privacy, terms and support', () => {
    expect(legalLinkPaths()).toEqual(['/privacy', '/terms', '/support'])
  })

  // The regression guard this module exists for: a link that no longer resolves
  // to a trust page renders a dead row, and a dead /privacy link inside the app
  // is an App Store 5.1.1(i) rejection. Fail here instead of in review.
  it('every path resolves to a real trust page', () => {
    for (const path of legalLinkPaths()) {
      expect(trustPageKey(path)).not.toBeNull()
    }
  })

  it('links to the privacy policy specifically — the one Apple requires', () => {
    expect(trustPageKey('/privacy')).toBe('privacy')
    expect(legalLinkPaths()).toContain('/privacy')
  })

  it('gives every link a non-empty label', () => {
    for (const link of LEGAL_LINKS) {
      expect(typeof link.label).toBe('string')
      expect(link.label.length).toBeGreaterThan(0)
    }
  })

  it('uses canonical lowercase paths, so the trust-page match is not relying on the case-insensitive fallback', () => {
    for (const path of legalLinkPaths()) {
      expect(path).toBe(path.toLowerCase())
    }
  })
})
