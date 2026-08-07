import { describe, it, expect } from 'vitest'
import { isRowMissing, isBootstrapFailure } from './supabaseErrors'

describe('isRowMissing', () => {
  it('recognises PGRST116 (zero rows from .single())', () => {
    expect(isRowMissing({ code: 'PGRST116', message: '0 rows' })).toBe(true)
  })
  it('rejects other errors and non-errors', () => {
    expect(isRowMissing({ code: '500', message: 'server error' })).toBe(false)
    expect(isRowMissing(null)).toBe(false)
    expect(isRowMissing(undefined)).toBe(false)
  })
})

describe('isBootstrapFailure', () => {
  it('a network/server failure is a failure', () => {
    expect(isBootstrapFailure({ message: 'TypeError: Failed to fetch' })).toBe(true)
    expect(isBootstrapFailure({ code: '500', message: 'boom' })).toBe(true)
  })
  it('a genuinely missing row is NOT a failure — it means onboarding', () => {
    expect(isBootstrapFailure({ code: 'PGRST116', message: '0 rows' })).toBe(false)
  })
  it('no error is no failure', () => {
    expect(isBootstrapFailure(null)).toBe(false)
    expect(isBootstrapFailure(undefined)).toBe(false)
  })
})
