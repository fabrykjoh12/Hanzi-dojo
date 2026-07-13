import { describe, it, expect } from 'vitest'
import { isEditableTarget, isActivatableTarget } from './useStudyKeyboardShortcuts'

describe('isEditableTarget', () => {
  it('is true for form fields that own the keyboard', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true)
  })
  it('is true for contentEditable elements', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
  it('is false for non-editable elements and nullish targets', () => {
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false)
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget(undefined)).toBe(false)
  })
})

describe('isActivatableTarget', () => {
  it('is true for buttons and links (native Space/Enter activation)', () => {
    expect(isActivatableTarget({ tagName: 'BUTTON' })).toBe(true)
    expect(isActivatableTarget({ tagName: 'A' })).toBe(true)
  })
  it('is false for everything else and nullish targets', () => {
    expect(isActivatableTarget({ tagName: 'DIV' })).toBe(false)
    expect(isActivatableTarget({ tagName: 'INPUT' })).toBe(false)
    expect(isActivatableTarget(null)).toBe(false)
  })
})
