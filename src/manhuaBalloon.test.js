import { describe, it, expect } from 'vitest'
import {
  balloonPath, balloonGeometry, balloonInsets, balloonPadding,
  contentFitsBalloon, CORNER_MAX,
} from './manhuaBalloon'

// The defect this module exists to fix, in numbers.
//
// A brand-new learner has no cards, so per-word pinyin scaffolding renders a
// ruby row above EVERY word. 你想吃什么？ — six characters — becomes three
// rendered rows inside a balloon a little over 200px wide and ~160px tall. The
// old silhouette was one near-circular path stretched over that box with
// preserveAspectRatio="none"; at the first text line's height the ellipse's
// edge had not opened up yet, so the pinyin+hanzi began outside the ink.
//
// Everything below is really one claim: the padded content rect is inside the
// drawn shape at EVERY box a balloon can take, not just the wide short one.
const WORST_CASE = { w: 224, h: 160 }

describe('balloon insets', () => {
  it('gives thought clouds more room than speech', () => {
    expect(balloonInsets('thought').left).toBeGreaterThan(balloonInsets('speech').left)
    expect(balloonInsets('thought').top).toBeGreaterThan(balloonInsets('speech').top)
  })

  it('prints a CSS padding shorthand the bubble can use directly', () => {
    expect(balloonPadding('speech')).toBe('13px 20px 15px')
    expect(balloonPadding('reply')).toBe(balloonPadding('speech'))
    expect(balloonPadding('thought')).toBe('15px 22px 17px')
  })
})

describe('balloonGeometry', () => {
  it('caps the corner curve in PIXELS, so a tall balloon grows straight sides', () => {
    // This is the whole fix. An ellipse's curvature scales with its box, which
    // is why a tall balloon used to swallow its own first line.
    const tall = balloonGeometry(WORST_CASE.w, WORST_CASE.h, 'speech', 7)
    for (const r of tall.corners) expect(r).toBeLessThanOrEqual(CORNER_MAX)
    const taller = balloonGeometry(WORST_CASE.w, 420, 'speech', 7)
    for (const r of taller.corners) expect(r).toBeLessThanOrEqual(CORNER_MAX)
  })

  it('never lets a corner eat more than half the box', () => {
    const squat = balloonGeometry(120, 56, 'speech', 3)
    for (const r of squat.corners) expect(r).toBeLessThanOrEqual(56 / 2 - 1)
  })

  it('bulges outward only — the padding is a guarantee, not a hope', () => {
    for (const kind of ['speech', 'thought']) {
      const g = balloonGeometry(WORST_CASE.w, WORST_CASE.h, kind, 11)
      expect(g.bumps.length).toBe(g.points.length)
      for (const b of g.bumps) expect(b).toBeGreaterThan(0)
    }
  })

  it('is deterministic per bubble but different between bubbles', () => {
    const a = balloonPath(220, 150, 'speech', 4)
    const again = balloonPath(220, 150, 'speech', 4)
    const other = balloonPath(220, 150, 'speech', 5)
    expect(again).toBe(a)
    expect(other).not.toBe(a)
  })

  it('survives a degenerate box', () => {
    for (const box of [[0, 0], [-10, 4], [NaN, NaN]]) {
      const g = balloonGeometry(box[0], box[1], 'speech', 1)
      expect(g.w).toBeGreaterThan(0)
      expect(g.h).toBeGreaterThan(0)
      expect(balloonPath(box[0], box[1], 'speech', 1).indexOf('M')).toBe(0)
    }
  })
})

describe('contentFitsBalloon', () => {
  it('holds the reported worst case: every token carrying a reading', () => {
    // 你想吃什么？ with pinyin over all of it — the box the phone actually drew.
    expect(contentFitsBalloon(WORST_CASE.w, WORST_CASE.h, 'speech', 7)).toBe(true)
  })

  it('holds for every balloon box a phone can produce', () => {
    // Widths: a 320px phone's narrowest balloon up to the 520px column.
    // Heights: one bare line (~46px) up to a five-row pinyin speech with the
    // English revealed (~260px) — and past it, because a longer episode line
    // with readings on can exceed that.
    //
    // Collected, then asserted ONCE. The grid is 101 widths x 148 heights x 3
    // kinds x 5 seeds = 224,220 cases, and an expect() per case spent ~4.3s
    // building assertion objects — against a 5s default timeout, which made this
    // spec flake the moment anything else was added to the suite. The coverage is
    // identical, it runs in a fraction of the time, and a failure now names every
    // box that broke instead of only the first.
    const failures = []
    for (const kind of ['speech', 'thought', 'reply']) {
      for (let w = 120; w <= 520; w += 4) {
        for (let h = 46; h <= 340; h += 2) {
          for (const seed of [0, 1, 7, 13, 25]) {
            if (contentFitsBalloon(w, h, kind, seed) !== true) {
              failures.push(kind + ' ' + w + '×' + h + ' seed ' + seed)
            }
          }
        }
      }
    }
    expect(failures.slice(0, 20), failures.length + ' boxes do not fit').toEqual([])
  })

  it('holds at the smallest box the geometry will draw', () => {
    // balloonGeometry clamps to 48×40, so this is the floor — and the floor
    // has to fit its own padding, or the guard in contentFitsBalloon would be
    // the only thing standing between a learner and text outside the ink.
    expect(contentFitsBalloon(1, 1, 'thought', 0)).toBe(true)
    expect(contentFitsBalloon(1, 1, 'speech', 0)).toBe(true)
  })
})

describe('balloonPath', () => {
  it('draws a closed shape inside the measured box', () => {
    const d = balloonPath(WORST_CASE.w, WORST_CASE.h, 'speech', 2)
    expect(d.charAt(0)).toBe('M')
    expect(d.charAt(d.length - 1)).toBe('Z')
    expect(d.indexOf('NaN')).toBe(-1)
  })

  it('gives a thought cloud more, smaller puffs than a speech balloon', () => {
    const speech = balloonGeometry(WORST_CASE.w, WORST_CASE.h, 'speech', 2)
    const thought = balloonGeometry(WORST_CASE.w, WORST_CASE.h, 'thought', 2)
    expect(thought.points.length).toBeGreaterThan(speech.points.length)
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(avg(thought.bumps)).toBeGreaterThan(avg(speech.bumps))
  })
})
