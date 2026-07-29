import { describe, it, expect } from 'vitest'
import { CONFIGS, SEASON_SEEDS, levelConfig, BIBLE_CHINESE } from './storyLevels.mjs'

// This module is imported by a script whose failures are silent by design
// (the generator wraps season planning in try/catch and "skips" the tier), so
// a missing export here doesn't crash a run — it quietly produces nothing.
// That happened: SEASON_SEEDS moved into this file without an export and an
// entire batch run finished green-looking with zero stories. These specs make
// the module's contract explicit.

describe('storyLevels exports', () => {
  it('exposes the season seeds the generator rotates through', () => {
    expect(Array.isArray(SEASON_SEEDS)).toBe(true)
    // Three tiers draw one seed each per round; 18 keeps six rounds distinct.
    expect(SEASON_SEEDS.length).toBeGreaterThanOrEqual(18)
    for (const seed of SEASON_SEEDS) expect(typeof seed).toBe('string')
  })

  it('has a config for every Chinese HSK level 1-6', () => {
    for (let level = 1; level <= 6; level += 1) {
      const cfg = levelConfig('chinese', 'hsk_3', level)
      expect(cfg, 'chinese|hsk_3|' + level).toBeTruthy()
      expect(cfg.tiers.length).toBe(3)
      for (const t of cfg.tiers) {
        expect(t.lines.length).toBe(2)
        expect(t.minCov).toBeGreaterThan(0.5)
        expect(t.maxMisses).toBeGreaterThan(0)
      }
    }
  })

  it('returns null rather than throwing for an unknown level', () => {
    expect(levelConfig('chinese', 'hsk_3', 9)).toBe(null)
  })

  it('keeps the Chinese cast pinned to tappable names', () => {
    // These must stay within src/characterNames.js's CHARACTER_READINGS or
    // name-taps break in the reader.
    expect(BIBLE_CHINESE.speakers).toEqual(['李明', '小红', '小明', '妈妈'])
    expect(CONFIGS['chinese|hsk_3|1'].bible).toBe(BIBLE_CHINESE)
  })
})
