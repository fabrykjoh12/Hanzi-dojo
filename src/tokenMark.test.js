import { describe, it, expect } from 'vitest'
import { tokenMarkKind, isUnknownToken, unknownMarkStyle, UNKNOWN_MARK } from './tokenMark'

const vocabToken = { text: '天气', vocab: { id: 'v1', word: '天气' } }
const nameToken = { text: '小明', vocab: null, name: { word: '小明', reading: 'Xiǎo Míng' } }
const plainToken = { text: '太阳', vocab: null }

describe('tokenMarkKind — vocabulary', () => {
  it('marks a word the learner has not started as new', () => {
    expect(tokenMarkKind(vocabToken, { status: 'not_started' })).toBe('new')
  })
  it('marks a word in progress as learning', () => {
    expect(tokenMarkKind(vocabToken, { status: 'learning' })).toBe('learning')
  })
  it('leaves a learned word unmarked — the page reads like a book', () => {
    expect(tokenMarkKind(vocabToken, { status: 'review' })).toBe(null)
    expect(tokenMarkKind(vocabToken, { status: 'mastered' })).toBe(null)
  })
})

describe('tokenMarkKind — words outside the list', () => {
  it('marks a word-like token with no vocabulary row as unknown', () => {
    expect(tokenMarkKind(plainToken, { language: 'chinese' })).toBe('unknown')
  })
  it('does not mark a character name — a name is not a gap in the list', () => {
    expect(tokenMarkKind(nameToken, { language: 'chinese' })).toBe(null)
  })
  it('does not mark punctuation or spacing', () => {
    expect(tokenMarkKind({ text: '。', vocab: null }, { language: 'chinese' })).toBe(null)
    expect(tokenMarkKind({ text: '  ', vocab: null }, { language: 'chinese' })).toBe(null)
    expect(tokenMarkKind({ text: '！？', vocab: null }, { language: 'chinese' })).toBe(null)
  })
  it('does not mark grammar glue the glossary already explains', () => {
    expect(tokenMarkKind({ text: 'は', vocab: null }, { language: 'japanese' })).toBe(null)
    expect(tokenMarkKind({ text: 'です', vocab: null }, { language: 'japanese' })).toBe(null)
  })
  it('still marks a content word the glossary has nothing for', () => {
    expect(tokenMarkKind({ text: 'たべもの', vocab: null }, { language: 'japanese' })).toBe('unknown')
  })
  it('is null with no token rather than throwing', () => {
    expect(tokenMarkKind(null)).toBe(null)
    expect(tokenMarkKind(undefined, { language: 'chinese' })).toBe(null)
  })
})

describe('isUnknownToken', () => {
  it('is the plain-token branch’s question, answered once', () => {
    expect(isUnknownToken(plainToken, 'chinese')).toBe(true)
    expect(isUnknownToken(nameToken, 'chinese')).toBe(false)
    expect(isUnknownToken({ text: '，', vocab: null }, 'chinese')).toBe(false)
    expect(isUnknownToken(vocabToken, 'chinese')).toBe(false)
  })
})

describe('unknownMarkStyle', () => {
  it('gives the out-of-list mark to an out-of-list word and nothing to anything else', () => {
    expect(unknownMarkStyle(plainToken, 'chinese')).toBe(UNKNOWN_MARK)
    expect(unknownMarkStyle(nameToken, 'chinese')).toBe(null)
    expect(unknownMarkStyle({ text: '。', vocab: null }, 'chinese')).toBe(null)
  })
  it('is spreadable unconditionally — null means "add nothing"', () => {
    const base = { color: 'inherit' }
    expect({ ...base, ...unknownMarkStyle(nameToken, 'chinese') }).toEqual(base)
    expect({ ...base, ...unknownMarkStyle(plainToken, 'chinese') }).toEqual({ ...base, ...UNKNOWN_MARK })
  })
})

describe('the out-of-list mark itself', () => {
  it('is drawn from the text’s own ink, so it themes and never reads as the accent', () => {
    expect(UNKNOWN_MARK.background).toContain('currentColor')
    expect(UNKNOWN_MARK.borderBottom).toContain('currentColor')
    // color-mix into the ink, never a fixed hex or an alpha suffix that would
    // stay light on a dark page.
    expect(UNKNOWN_MARK.background).toContain('color-mix')
    expect(UNKNOWN_MARK.borderBottom).toContain('color-mix')
    expect(UNKNOWN_MARK.background).not.toContain('#')
    expect(UNKNOWN_MARK.borderBottom).not.toContain('#')
  })
  it('is dashed — the new-word mark is dotted or solid, so the two differ by shape too', () => {
    expect(UNKNOWN_MARK.borderBottom).toContain('dashed')
  })
})
