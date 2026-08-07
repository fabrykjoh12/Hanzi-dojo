import { describe, it, expect } from 'vitest'
import { DELETE_CONFIRM_WORD, confirmWordOk, canConfirmDeletion } from './accountDeletion'

describe('confirmWordOk', () => {
  it('accepts the exact word', () => {
    expect(confirmWordOk(DELETE_CONFIRM_WORD)).toBe(true)
  })

  it('is forgiving about case and whitespace — the intent is what matters', () => {
    expect(confirmWordOk('DELETE')).toBe(true)
    expect(confirmWordOk('  Delete ')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(confirmWordOk('')).toBe(false)
    expect(confirmWordOk('del')).toBe(false)
    expect(confirmWordOk('delete my account')).toBe(false)
    expect(confirmWordOk(undefined)).toBe(false)
    expect(confirmWordOk(null)).toBe(false)
    expect(confirmWordOk(42)).toBe(false)
  })
})

describe('canConfirmDeletion', () => {
  it('needs both the armed step and the typed word', () => {
    expect(canConfirmDeletion(true, 'delete')).toBe(true)
    expect(canConfirmDeletion(false, 'delete')).toBe(false)
    expect(canConfirmDeletion(true, 'nope')).toBe(false)
    expect(canConfirmDeletion(false, '')).toBe(false)
  })
})
