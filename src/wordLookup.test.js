import { describe, it, expect } from 'vitest'
import { lookupKind, dictWordFor, lookupReading, lookupChip, lookupBody, splitAround, dictSaveAction, PLAIN_FALLBACK, STATUS_COLOR, STATUS_LABEL } from './wordLookup'

const vocab = { id: 'v1', word: '天气', reading: 'tiānqì', meaning: 'weather', language: 'chinese' }
const place = { id: 'v2', word: '北京', reading: 'Běijīng', meaning: 'Beijing', language: 'chinese' }

describe('lookupKind', () => {
  it('is vocab for a word in the level’s list', () => {
    expect(lookupKind({ word: '天气', vocab }, 'chinese')).toBe('vocab')
  })
  it('is place for curated place vocabulary', () => {
    expect(lookupKind({ word: '北京', vocab: place }, 'chinese')).toBe('place')
  })
  it('is name for a character name', () => {
    expect(lookupKind({ word: '小云', vocab: null, name: { word: '小云', reading: null } }, 'chinese')).toBe('name')
  })
  it('is plain for anything else — the words that used to be untappable', () => {
    expect(lookupKind({ word: '太阳', vocab: null }, 'chinese')).toBe('plain')
  })
  it('is null with nothing selected', () => {
    expect(lookupKind(null, 'chinese')).toBe(null)
  })
})

describe('dictWordFor', () => {
  it('asks the dictionary about a plain Chinese word', () => {
    expect(dictWordFor({ word: '太阳', vocab: null }, 'chinese', null)).toBe('太阳')
  })
  it('does not ask when something else already explains the token', () => {
    expect(dictWordFor({ word: '天气', vocab }, 'chinese', null)).toBe(null)
    expect(dictWordFor({ word: '小云', vocab: null, name: {} }, 'chinese', null)).toBe(null)
    expect(dictWordFor({ word: '了', vocab: null }, 'chinese', { gloss: 'aspect marker' })).toBe(null)
  })
  it('is Chinese-only — CC-CEDICT has nothing for the other tracks', () => {
    expect(dictWordFor({ word: 'книгу', vocab: null }, 'russian', null)).toBe(null)
    expect(dictWordFor({ word: 'たべる', vocab: null }, 'japanese', null)).toBe(null)
  })
})

describe('lookupReading', () => {
  it('prefers the vocabulary reading, then the name, then grammar, then the dictionary', () => {
    expect(lookupReading({ word: '天气', vocab })).toBe('tiānqì')
    expect(lookupReading({ word: '小云', name: { word: '小云', reading: 'Xiǎo Yún' } })).toBe('Xiǎo Yún')
    expect(lookupReading({ word: 'は' }, { grammar: { reading: 'wa' } })).toBe('wa')
    expect(lookupReading({ word: '太阳' }, { dictEntry: { pinyin: 'tài yáng' } })).toBe('tài yáng')
  })
  it('drops a reading identical to the word — that adds nothing', () => {
    expect(lookupReading({ word: 'ともだち', vocab: { word: 'ともだち', reading: 'ともだち' } })).toBe(null)
  })
  it('is null for a derived name, which carries no reading', () => {
    expect(lookupReading({ word: '小云', name: { word: '小云', reading: null } })).toBe(null)
  })
})

describe('lookupChip', () => {
  it('names the kind of word', () => {
    expect(lookupChip('name')).toBe('Name')
    expect(lookupChip('place')).toBe('Place')
    expect(lookupChip('plain', { grammar: { gloss: 'x' } })).toBe('Grammar')
    expect(lookupChip('plain', { dictEntry: { pinyin: 'x' } })).toBe('Dictionary')
    expect(lookupChip('plain')).toBe('Word')
    expect(lookupChip('vocab')).toBe(null)
  })
})

describe('lookupBody', () => {
  it('explains a vocabulary word from its meaning', () => {
    expect(lookupBody({ word: '天气', vocab }, 'vocab')).toBe('weather')
  })
  it('says plainly that a name is a name', () => {
    expect(lookupBody({ word: '小云', name: {} }, 'name')).toContain('name')
  })
  it('prefers the grammar glossary, then the dictionary, then the fallback', () => {
    expect(lookupBody({ word: 'は' }, 'plain', { grammar: { gloss: 'Topic marker.' } })).toBe('Topic marker.')
    expect(lookupBody({ word: '太阳' }, 'plain', { dictDefs: ['sun', 'sunshine'] })).toBe('sun; sunshine')
    expect(lookupBody({ word: '太阳' }, 'plain', { dictLoading: true })).toBe('Looking it up…')
    expect(lookupBody({ word: '太阳' }, 'plain')).toBe(PLAIN_FALLBACK)
  })
})

describe('dictSaveAction', () => {
  const entry = { id: 42, simplified: '太阳', pinyin: 'tài yáng' }
  const plain = { word: '太阳', vocab: null }
  const save = (over) => dictSaveAction(plain, 'plain', { dictEntry: entry, canSave: true, ...over })

  it('offers the bookmark for a dictionary-backed word beyond the level’s list', () => {
    expect(save()).toEqual({ entryId: 42, inDeck: false, busy: false, disabled: false, label: 'Add to deck' })
  })
  it('reads as saved once the word is in the deck, and stops firing', () => {
    const state = save({ savedIds: new Set([42]) })
    expect(state.inDeck).toBe(true)
    expect(state.disabled).toBe(true)
    expect(state.label).toBe('In your deck')
  })
  it('is disabled while a save is in flight, so a double tap can’t double-save', () => {
    const state = save({ saving: true })
    expect(state.busy).toBe(true)
    expect(state.disabled).toBe(true)
  })
  it('does not show a saved word as pending while another save runs', () => {
    const state = save({ saving: true, savedIds: new Set([42]) })
    expect(state.busy).toBe(false)
    expect(state.inDeck).toBe(true)
  })
  it('is absent for vocabulary — the sheet’s own add-to-deck covers that', () => {
    expect(dictSaveAction({ word: '天气', vocab }, 'vocab', { dictEntry: entry, canSave: true })).toBe(null)
    expect(dictSaveAction({ word: '北京', vocab: place }, 'place', { dictEntry: entry, canSave: true })).toBe(null)
  })
  it('is absent for a name — a character isn’t a word to study', () => {
    expect(dictSaveAction({ word: '小云', vocab: null, name: {} }, 'name', { dictEntry: entry, canSave: true })).toBe(null)
  })
  it('is absent when the grammar glossary answered instead of the dictionary', () => {
    expect(save({ grammar: { gloss: 'aspect marker' } })).toBe(null)
  })
  it('is absent while the word is unresolved — loading, offline, or a genuine miss', () => {
    expect(save({ dictEntry: null })).toBe(null)
    expect(save({ dictEntry: {} })).toBe(null)
  })
  it('is absent when the caller wired no save handler (the analyzer, the dictionary screen)', () => {
    expect(save({ canSave: false })).toBe(null)
    expect(dictSaveAction(plain, 'plain', { dictEntry: entry })).toBe(null)
  })
  it('is absent with nothing selected rather than throwing', () => {
    expect(dictSaveAction(null, 'plain', { dictEntry: entry, canSave: true })).toBe(null)
    expect(dictSaveAction(plain, null)).toBe(null)
  })
})

describe('splitAround', () => {
  it('finds the tapped word inside its line', () => {
    expect(splitAround('今天天气很好。', '天气')).toEqual({ before: '今天', match: '天气', after: '很好。' })
  })
  it('is null when the word is not in the line (an inflected form, say)', () => {
    expect(splitAround('Аня дала Ивану книгу.', 'книга')).toBe(null)
  })
  it('is null for missing input rather than throwing', () => {
    expect(splitAround(null, '天气')).toBe(null)
    expect(splitAround('今天天气很好。', '')).toBe(null)
  })
})

describe('status vocabulary', () => {
  it('labels and colors every status the readers can produce', () => {
    ;['not_started', 'learning', 'review', 'mastered'].forEach(s => {
      expect(STATUS_LABEL[s]).toBeTruthy()
      expect(STATUS_COLOR[s]).toBeTruthy()
    })
  })
})
