import { describe, expect, it, vi } from 'vitest'
import { trapDialogFocus } from './dialogFocus'

function tab(shiftKey = false) {
  return { key: 'Tab', shiftKey, preventDefault: vi.fn() }
}

describe('trapDialogFocus', () => {
  it('ignores keys other than Tab', () => {
    expect(trapDialogFocus({ key: 'Escape' }, null)).toBe(false)
  })

  it('wraps from the last control to the first', () => {
    const first = { hidden: false, getAttribute: () => null, focus: vi.fn() }
    const last = { hidden: false, getAttribute: () => null, focus: vi.fn() }
    const box = { querySelectorAll: () => [first, last], ownerDocument: { activeElement: last } }
    const event = tab()
    expect(trapDialogFocus(event, box)).toBe(true)
    expect(first.focus).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('wraps backwards from the first control to the last', () => {
    const first = { hidden: false, getAttribute: () => null, focus: vi.fn() }
    const last = { hidden: false, getAttribute: () => null, focus: vi.fn() }
    const box = { querySelectorAll: () => [first, last], ownerDocument: { activeElement: first } }
    expect(trapDialogFocus(tab(true), box)).toBe(true)
    expect(last.focus).toHaveBeenCalled()
  })
})
