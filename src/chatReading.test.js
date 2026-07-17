import { describe, it, expect } from 'vitest'
import { assignSpeakerSides } from './chatReading'

const beats = [
  { speaker: null, text: '旁白' },
  { speaker: '小明', text: '你好' },
  { speaker: '朋友', text: '嗨' },
  { speaker: '小明', text: '再见' },
]

describe('assignSpeakerSides', () => {
  it('assigns first speaker left, second right, stable per speaker', () => {
    const m = assignSpeakerSides(beats)
    expect(m['小明'].side).toBe('left')
    expect(m['朋友'].side).toBe('right')
    expect(Object.keys(m).sort()).toEqual(['小明', '朋友'].sort())
  })
  it('gives each speaker a distinct color', () => {
    const m = assignSpeakerSides(beats)
    expect(m['小明'].color).not.toBe(m['朋友'].color)
    expect(typeof m['小明'].color).toBe('string')
  })
  it('ignores narration lines', () => {
    expect(assignSpeakerSides([{ speaker: null, text: 'x' }])).toEqual({})
  })
})
