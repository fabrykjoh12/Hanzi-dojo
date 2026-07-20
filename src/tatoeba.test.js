import { describe, it, expect } from 'vitest'
import { parseTatoebaPairLine } from './tatoeba'

describe('parseTatoebaPairLine', () => {
  it('pulls the Chinese and English text from a 4-column pair line', () => {
    expect(parseTatoebaPairLine('123\t我在学中文。\t456\tI am learning Chinese.')).toEqual({
      hanzi: '我在学中文。',
      english: 'I am learning Chinese.',
    })
  })
  it('trims a trailing carriage return (Windows line endings)', () => {
    expect(parseTatoebaPairLine('1\t你好。\t2\tHello.\r')).toEqual({ hanzi: '你好。', english: 'Hello.' })
  })
  it('returns null for blank lines and rows with too few columns', () => {
    expect(parseTatoebaPairLine('')).toBeNull()
    expect(parseTatoebaPairLine('   ')).toBeNull()
    expect(parseTatoebaPairLine('1\t你好。\t2')).toBeNull()
  })
  it('returns null when the Chinese column has no Han character', () => {
    expect(parseTatoebaPairLine('1\t???\t2\tHello.')).toBeNull()
    expect(parseTatoebaPairLine('1\t\t2\tHello.')).toBeNull()
  })
})
