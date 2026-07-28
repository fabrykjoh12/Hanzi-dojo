import { describe, it, expect } from 'vitest'
import { lookupKind, dictWordFor, lookupReading, lookupChip, lookupBody, splitAround, PLAIN_FALLBACK, STATUS_COLOR, STATUS_LABEL } from './wordLookup'

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
