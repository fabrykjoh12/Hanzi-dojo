import { describe, it, expect } from 'vitest'
import { isIsoDate, missingProvenance, hasProvenance, auditManifest, formatAudit } from './artProvenance.mjs'

const PROMPT = 'A rain-soaked noodle stall at night, warm colour, no resemblance to any existing franchise or artist.'

describe('isIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(isIsoDate('2026-08-15')).toBe(true)
    expect(isIsoDate('2024-02-29')).toBe(true)
  })
  it('rejects a day that does not exist', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
  })
  it('rejects anything that is not a bare YYYY-MM-DD string', () => {
    expect(isIsoDate('2026-8-15')).toBe(false)
    expect(isIsoDate('2026-08-15T10:00:00Z')).toBe(false)
    expect(isIsoDate(20260815)).toBe(false)
    expect(isIsoDate(null)).toBe(false)
    expect(isIsoDate(undefined)).toBe(false)
  })
})

describe('missingProvenance', () => {
  it('is satisfied by a substantive prompt and a valid date', () => {
    expect(missingProvenance({ prompt: PROMPT, generated: '2026-08-15' })).toEqual([])
    expect(hasProvenance({ prompt: PROMPT, generated: '2026-08-15' })).toBe(true)
  })
  it('names each missing key', () => {
    expect(missingProvenance({ generated: '2026-08-15' })).toEqual(['prompt'])
    expect(missingProvenance({ prompt: PROMPT })).toEqual(['generated'])
    expect(missingProvenance({})).toEqual(['prompt', 'generated'])
    expect(missingProvenance(null)).toEqual(['prompt', 'generated'])
  })
  // A placeholder prompt is worse than an absent one: it looks like evidence.
  it('rejects a placeholder prompt', () => {
    expect(missingProvenance({ prompt: '', generated: '2026-08-15' })).toEqual(['prompt'])
    expect(missingProvenance({ prompt: 'n/a', generated: '2026-08-15' })).toEqual(['prompt'])
    expect(missingProvenance({ prompt: '   ', generated: '2026-08-15' })).toEqual(['prompt'])
  })
})

describe('auditManifest', () => {
  const manifest = {
    assets: [
      { file: 'new-good.webp', url: 'u', prompt: PROMPT, generated: '2026-08-15' },
      { file: 'new-bare.webp', url: 'u' },
      { file: 'old-bare.webp', url: 'u' },
    ],
  }
  const isPresent = (f) => f === 'old-bare.webp'

  it('separates complete, legacy and blocking entries', () => {
    const a = auditManifest(manifest, isPresent)
    expect(a.total).toBe(3)
    expect(a.complete).toEqual(['new-good.webp'])
    expect(a.legacy).toEqual([{ file: 'old-bare.webp', missing: ['prompt', 'generated'] }])
    expect(a.blocking).toEqual([{ file: 'new-bare.webp', missing: ['prompt', 'generated'] }])
  })

  // The whole point: existing artwork is never made to justify itself
  // retroactively, so a manifest of only committed panels blocks nothing.
  it('never blocks on artwork that is already committed', () => {
    const a = auditManifest(manifest, () => true)
    expect(a.blocking).toEqual([])
    expect(a.legacy.length).toBe(2)
  })

  it('treats everything as new when nothing is on disk', () => {
    const a = auditManifest(manifest, () => false)
    expect(a.blocking.map(e => e.file)).toEqual(['new-bare.webp', 'old-bare.webp'])
    expect(a.legacy).toEqual([])
  })

  it('handles a manifest with no assets', () => {
    expect(auditManifest({}, isPresent)).toMatchObject({ total: 0, complete: [], legacy: [], blocking: [] })
    expect(auditManifest(null, isPresent).total).toBe(0)
  })
})

describe('formatAudit', () => {
  it('reports the count and says legacy entries were not backfilled', () => {
    const a = auditManifest({
      assets: [
        { file: 'a.webp', prompt: PROMPT, generated: '2026-08-15' },
        { file: 'b.webp' },
      ],
    }, (f) => f === 'b.webp')
    const out = formatAudit(a, 'ep01')
    expect(out).toContain('ep01: 1/2 entries carry prompt + generated')
    expect(out).toContain('not backfilled')
    expect(out).not.toContain('✗')
  })
})
