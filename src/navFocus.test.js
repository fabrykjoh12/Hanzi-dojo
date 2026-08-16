import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNavFocused, resetNavFocus, setNavFocused, subscribeNavFocus } from './navFocus'

afterEach(() => resetNavFocus())

describe('navFocus store', () => {
  it('starts unfocused so navigation is visible by default', () => {
    expect(isNavFocused()).toBe(false)
  })

  it('notifies subscribers on entering and leaving focus', () => {
    const seen = []
    subscribeNavFocus(v => seen.push(v))
    setNavFocused(true)
    setNavFocused(false)
    expect(seen).toEqual([true, false])
  })

  it('does not re-notify for an unchanged value', () => {
    const fn = vi.fn()
    subscribeNavFocus(fn)
    setNavFocused(true)
    setNavFocused(true)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes cleanly', () => {
    const fn = vi.fn()
    const off = subscribeNavFocus(fn)
    off()
    setNavFocused(true)
    expect(fn).not.toHaveBeenCalled()
  })

  it('a throwing listener cannot break navigation for the others', () => {
    const good = vi.fn()
    subscribeNavFocus(() => { throw new Error('bad listener') })
    subscribeNavFocus(good)
    setNavFocused(true)
    expect(good).toHaveBeenCalledWith(true)
    expect(isNavFocused()).toBe(true)
  })
})
