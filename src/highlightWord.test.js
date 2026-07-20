import { describe, it, expect } from 'vitest'
import { splitOnWord } from './highlightWord'

describe('splitOnWord', () => {
  it('marks the word occurrence inside a sentence', () => {
    expect(splitOnWord('我在学中文。', '中文')).toEqual([
      { text: '我在学', hit: false },
      { text: '中文', hit: true },
      { text: '。', hit: false },
    ])
  })
  it('marks every occurrence', () => {
    expect(splitOnWord('中文和中文', '中文')).toEqual([
      { text: '中文', hit: true },
      { text: '和', hit: false },
      { text: '中文', hit: true },
    ])
  })
  it('handles the word at the start and end', () => {
    expect(splitOnWord('好好', '好')).toEqual([
      { text: '好', hit: true },
      { text: '好', hit: true },
    ])
  })
  it('returns the whole sentence unmarked when the word is absent or empty', () => {
    expect(splitOnWord('你好', '中文')).toEqual([{ text: '你好', hit: false }])
    expect(splitOnWord('你好', '')).toEqual([{ text: '你好', hit: false }])
  })
})
