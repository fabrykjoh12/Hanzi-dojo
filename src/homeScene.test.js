import { describe, expect, it } from 'vitest'
import { SCENE_MOODS, sceneMood } from './homeScene'

describe('sceneMood', () => {
  it('maps the day into four calm bands', () => {
    expect(sceneMood(5)).toBe('morning')
    expect(sceneMood(9)).toBe('morning')
    expect(sceneMood(10)).toBe('morning')
    expect(sceneMood(11)).toBe('day')
    expect(sceneMood(16)).toBe('day')
    expect(sceneMood(17)).toBe('evening')
    expect(sceneMood(21)).toBe('evening')
    expect(sceneMood(22)).toBe('night')
    expect(sceneMood(23)).toBe('night')
    expect(sceneMood(0)).toBe('night')
    expect(sceneMood(4)).toBe('night')
  })

  it('always lands on a mood the stylesheet defines', () => {
    for (let h = 0; h < 24; h += 1) {
      expect(SCENE_MOODS).toContain(sceneMood(h))
    }
  })

  it('survives odd inputs without leaving the mood set', () => {
    expect(sceneMood(24)).toBe('night')
    expect(sceneMood(-1)).toBe('night')
    expect(sceneMood(9.7)).toBe('morning')
  })
})
