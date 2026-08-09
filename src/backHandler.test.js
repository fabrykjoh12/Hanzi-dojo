import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setBackHandler, runBackHandler, hasBackHandler, resetBackHandler } from './backHandler'

beforeEach(() => resetBackHandler())

describe('backHandler', () => {
  it('reports null with nothing registered, so the bridge uses its fallback', () => {
    expect(hasBackHandler()).toBe(false)
    expect(runBackHandler()).toBe(null)
  })

  it('runs the registered handler and normalises its answer', () => {
    setBackHandler(() => 'handled')
    expect(runBackHandler()).toBe('handled')
    setBackHandler(() => 'exit')
    expect(runBackHandler()).toBe('exit')
  })

  it('treats anything that is not "exit" as handled', () => {
    setBackHandler(() => undefined)
    expect(runBackHandler()).toBe('handled')
    setBackHandler(() => true)
    expect(runBackHandler()).toBe('handled')
  })

  it('unregisters, so a shell that unmounts leaves no stale closure', () => {
    const off = setBackHandler(() => 'handled')
    off()
    expect(hasBackHandler()).toBe(false)
    expect(runBackHandler()).toBe(null)
  })

  it('does not let a stale unregister remove a newer handler', () => {
    const offFirst = setBackHandler(() => 'first')
    setBackHandler(() => 'exit')
    offFirst()
    expect(hasBackHandler()).toBe(true)
    expect(runBackHandler()).toBe('exit')
  })

  it('falls through to the fallback rather than wedging the button when a handler throws', () => {
    setBackHandler(() => { throw new Error('boom') })
    expect(runBackHandler()).toBe(null)
  })

  it('ignores a registration that is not a function', () => {
    expect(setBackHandler(null)).toBeTypeOf('function')
    expect(hasBackHandler()).toBe(false)
  })

  it('holds one handler at a time — the newest shell wins', () => {
    const first = vi.fn(() => 'handled')
    const second = vi.fn(() => 'handled')
    setBackHandler(first)
    setBackHandler(second)
    runBackHandler()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
