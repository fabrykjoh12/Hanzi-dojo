import { describe, it, expect } from 'vitest'
import { mergePrefs } from './offline'

describe('mergePrefs', () => {
  it('keeps every field it was not asked to change', () => {
    const saved = { furiganaMode: 'always', lens: true, serif: true, showEnglish: true, seenFocusHint: true }
    expect(mergePrefs(saved, { playbackRate: 0.8 })).toEqual({
      furiganaMode: 'always', lens: true, serif: true, showEnglish: true, seenFocusHint: true,
      playbackRate: 0.8,
    })
  })
  it('overwrites only the patched fields', () => {
    expect(mergePrefs({ furiganaMode: 'always', lens: true }, { furiganaMode: 'hidden' }))
      .toEqual({ furiganaMode: 'hidden', lens: true })
  })
  it('treats a missing or non-object saved value as empty', () => {
    expect(mergePrefs(null, { playbackRate: 1 })).toEqual({ playbackRate: 1 })
    expect(mergePrefs(undefined, { playbackRate: 1 })).toEqual({ playbackRate: 1 })
    expect(mergePrefs('nonsense', { playbackRate: 1 })).toEqual({ playbackRate: 1 })
  })
  it('does not mutate the saved object', () => {
    const saved = { lens: true }
    mergePrefs(saved, { playbackRate: 0.6 })
    expect(saved).toEqual({ lens: true })
  })
})
