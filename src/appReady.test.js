import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isAppReady, markAppReady, onAppReady, resetAppReady } from './appReady'

describe('appReady', () => {
  beforeEach(() => resetAppReady())

  it('starts not ready', () => {
    expect(isAppReady()).toBe(false)
  })

  it('notifies subscribers when the app becomes ready', () => {
    const seen = vi.fn()
    onAppReady(seen)
    expect(seen).not.toHaveBeenCalled()
    markAppReady()
    expect(seen).toHaveBeenCalledTimes(1)
    expect(isAppReady()).toBe(true)
  })

  it('fires only once however many times it is marked', () => {
    const seen = vi.fn()
    onAppReady(seen)
    markAppReady()
    markAppReady()
    markAppReady()
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('fires immediately for a subscriber that arrives late', () => {
    markAppReady()
    const seen = vi.fn()
    onAppReady(seen)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const seen = vi.fn()
    const off = onAppReady(seen)
    off()
    markAppReady()
    expect(seen).not.toHaveBeenCalled()
  })

  it('lets a throwing listener not block the others', () => {
    const good = vi.fn()
    onAppReady(() => { throw new Error('bad listener') })
    onAppReady(good)
    expect(() => markAppReady()).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('ignores a non-function subscriber', () => {
    expect(() => onAppReady(null)).not.toThrow()
    expect(() => markAppReady()).not.toThrow()
  })
})
