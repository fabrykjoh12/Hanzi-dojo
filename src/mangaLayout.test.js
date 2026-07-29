import { describe, it, expect } from 'vitest'
import {
  buildEpisode, normalizeRatio, panelArtSrc, visibleBubbles, isGate, revealLimit,
  panelBeats, readBeats, episodeProgress, isEpisodeComplete, bubbleLayout,
  panelAtReadingLine, estimateBubbleHeight, DEFAULT_RATIO, READING_LINE,
} from './mangaLayout'

// A three-panel episode with a choice in the middle, which is the shape every
// interesting case here comes from.
const EPISODE = {
  meta: { series: 'S', episode_label: '第一话', episode_title: '我是新学生', art_base: '/art/ep01/', hook: 'next time' },
  cast: { '小雨': { display: '小雨' } },
  panels: [
    { id: 'p1', art: 'a.webp', ratio: '16/9', alt: 'alt one', bubbles: [{ beat: 0, kind: 'speech', side: 'right', top: 10, width: 70 }] },
    {
      id: 'p2',
      choice: { prompt: '选择回答', options: [{ beat: 1 }, { beat: 2 }] },
    },
    {
      id: 'p3', art: 'c.webp', ratio: '3/4',
      bubbles: [
        { beat: 3, when: { choice: 'p2', option: 1 } },
        { beat: 4 },
      ],
    },
  ],
}

describe('normalizeRatio', () => {
  it('parses "w/h" strings', () => {
    expect(normalizeRatio('16/9')).toBeCloseTo(16 / 9)
    expect(normalizeRatio('4/5')).toBeCloseTo(0.8)
  })
  it('accepts a bare number', () => {
    expect(normalizeRatio(1.5)).toBe(1.5)
  })
  it('falls back for anything unusable', () => {
    for (const bad of [null, undefined, '', 'wide', '4', '4/0', '0/4', 'a/b', {}]) {
      expect(normalizeRatio(bad)).toBe(DEFAULT_RATIO)
    }
  })
  it('clamps a shape that would be undrawable', () => {
    // A typo like "40/1" must not produce a panel forty screens wide.
    expect(normalizeRatio('40/1')).toBeLessThanOrEqual(2.6)
    expect(normalizeRatio('1/40')).toBeGreaterThanOrEqual(0.55)
  })
})

describe('buildEpisode', () => {
  it('reads the meta the header prints', () => {
    const { meta } = buildEpisode(EPISODE, 5)
    expect(meta.label).toBe('第一话')
    expect(meta.title).toBe('我是新学生')
    expect(meta.artBase).toBe('/art/ep01/')
    expect(meta.hook).toBe('next time')
  })

  it('gives every panel an id and a drawable ratio', () => {
    const { panels } = buildEpisode({ panels: [{}, { id: 'x' }] }, 1)
    expect(panels[0].id).toBe('p1')
    expect(panels[1].id).toBe('x')
    expect(panels[0].ratio).toBe(DEFAULT_RATIO)
  })

  it('drops a bubble pointing at a beat that does not exist', () => {
    const { panels } = buildEpisode({
      panels: [{ id: 'p1', bubbles: [{ beat: 0 }, { beat: 99 }, { beat: -1 }, { beat: 'two' }, null] }],
    }, 3)
    expect(panels[0].bubbles.map(b => b.beat)).toEqual([0])
  })

  it('drops a choice that is not a choice', () => {
    const one = buildEpisode({ panels: [{ id: 'p1', choice: { options: [{ beat: 0 }] } }] }, 3)
    expect(one.panels[0].choice).toBeNull()
    const none = buildEpisode({ panels: [{ id: 'p1', choice: { options: [] } }] }, 3)
    expect(none.panels[0].choice).toBeNull()
    const bad = buildEpisode({ panels: [{ id: 'p1', choice: { options: [{ beat: 0 }, { beat: 42 }] } }] }, 3)
    expect(bad.panels[0].choice).toBeNull()
  })

  it('defaults a speech tail toward the speaker and gives narration none', () => {
    const { panels } = buildEpisode({
      panels: [{
        id: 'p1',
        bubbles: [
          { beat: 0, kind: 'speech', side: 'right' },
          { beat: 1, kind: 'speech', side: 'left' },
          { beat: 2, kind: 'narration' },
        ],
      }],
    }, 3)
    expect(panels[0].bubbles[0].tail).toBe('bottom-left')
    expect(panels[0].bubbles[1].tail).toBe('bottom-right')
    expect(panels[0].bubbles[2].tail).toBeNull()
  })

  it('falls back to one panel per beat when a manga row has no layout yet', () => {
    const { panels, total } = buildEpisode(null, 4)
    expect(total).toBe(4)
    expect(panels.map(p => p.bubbles[0].beat)).toEqual([0, 1, 2, 3])
    expect(panels.every(p => p.art === null)).toBe(true)
  })

  it('survives junk in place of a panel', () => {
    const { panels } = buildEpisode({ panels: ['nonsense', 7, null, { id: 'ok' }] }, 2)
    expect(panels).toHaveLength(4)
    expect(panels[3].id).toBe('ok')
  })
})

describe('panelArtSrc', () => {
  const meta = { artBase: '/art/ep01/' }
  it('joins the base and the file', () => {
    expect(panelArtSrc(meta, { art: 'p1.webp' })).toBe('/art/ep01/p1.webp')
  })
  it('adds the missing separator', () => {
    expect(panelArtSrc({ artBase: '/art/ep01' }, { art: 'p1.webp' })).toBe('/art/ep01/p1.webp')
  })
  it('leaves an absolute path or URL alone', () => {
    expect(panelArtSrc(meta, { art: '/other/x.webp' })).toBe('/other/x.webp')
    expect(panelArtSrc(meta, { art: 'https://cdn/x.webp' })).toBe('https://cdn/x.webp')
  })
  it('is null for a panel with no art', () => {
    expect(panelArtSrc(meta, { art: null })).toBeNull()
    expect(panelArtSrc(meta, null)).toBeNull()
  })
})

describe('branching', () => {
  const { panels } = buildEpisode(EPISODE, 5)

  it('hides a branch-only bubble until its branch is taken', () => {
    expect(visibleBubbles(panels[2], {}).map(b => b.beat)).toEqual([4])
    expect(visibleBubbles(panels[2], { p2: 1 }).map(b => b.beat)).toEqual([3, 4])
    expect(visibleBubbles(panels[2], { p2: 0 }).map(b => b.beat)).toEqual([4])
  })

  it('gates everything after an unanswered choice', () => {
    expect(isGate(panels[1], {})).toBe(true)
    expect(revealLimit(panels, {})).toBe(1)
    expect(isGate(panels[1], { p2: 0 })).toBe(false)
    expect(revealLimit(panels, { p2: 0 })).toBe(2)
  })

  it('counts the chosen reply as a beat of the story', () => {
    expect(panelBeats(panels[1], {})).toEqual([])
    expect(panelBeats(panels[1], { p2: 1 })).toEqual([2])
  })

  it('reads only the branch that was taken', () => {
    expect(readBeats(panels, { p2: 0 }, 2)).toEqual([0, 1, 4])
    expect(readBeats(panels, { p2: 1 }, 2)).toEqual([0, 2, 3, 4])
  })
})

describe('panelAtReadingLine', () => {
  const H = 800
  // 336 at this height — quoted in the assertions below.

  it('picks the last panel whose top has passed the line', () => {
    const rects = [{ top: -400 }, { top: 100 }, { top: 600 }]
    expect(panelAtReadingLine(rects, H)).toBe(1)
  })

  it('picks the first panel the moment an episode opens', () => {
    // The 4:3 opening panel sits under the header and ENDS above the line;
    // "the panel the line is inside" would credit the tall panel below it
    // before the reader has reached it.
    // Real numbers from a 390×844 phone: a 4:3 panel under a 76px header.
    const phone = 844
    const rects = [{ top: 76, bottom: 350 }, { top: 364, bottom: 851 }]
    expect(phone * READING_LINE).toBeGreaterThan(350)
    expect(panelAtReadingLine(rects, phone)).toBe(0)
  })

  it('does not let a letterbox panel at the edge steal the count', () => {
    // A 21:9 panel fully visible at the bottom scores intersectionRatio 1.0
    // while the panel being read scores less. The reading line is not fooled.
    const rects = [{ top: 0 }, { top: 700 }]
    expect(panelAtReadingLine(rects, H)).toBe(0)
  })

  it('moves on as soon as the next panel crosses the line', () => {
    expect(panelAtReadingLine([{ top: -200 }, { top: 340 }], H)).toBe(0)
    expect(panelAtReadingLine([{ top: -210 }, { top: 330 }], H)).toBe(1)
  })

  it('is monotone: scrolling down never walks the count backwards', () => {
    const heights = [300, 500, 200, 640]
    let previous = 0
    for (let scroll = 0; scroll < 1600; scroll += 20) {
      let top = 76 - scroll
      const rects = heights.map((h) => { const r = { top }; top += h + 14; return r })
      const at = panelAtReadingLine(rects, H)
      expect(at, 'went backwards at scroll ' + scroll).toBeGreaterThanOrEqual(previous)
      previous = at
    }
  })

  it('skips panels that are not mounted', () => {
    expect(panelAtReadingLine([null, { top: 100 }, null], H)).toBe(1)
  })

  it('is -1 when there is nothing to measure', () => {
    expect(panelAtReadingLine([], H)).toBe(-1)
    expect(panelAtReadingLine(null, H)).toBe(-1)
  })
})

describe('episodeProgress', () => {
  it('is one-based for humans', () => {
    expect(episodeProgress(0, 8)).toEqual({ current: 1, total: 8, pct: 12.5 })
    expect(episodeProgress(2, 8).current).toBe(3)
  })
  it('never prints an impossible count', () => {
    expect(episodeProgress(99, 8).current).toBe(8)
    expect(episodeProgress(-4, 8).current).toBe(1)
    expect(episodeProgress(0, 0).total).toBe(1)
  })
})

describe('isEpisodeComplete', () => {
  const { panels } = buildEpisode(EPISODE, 5)

  it('is false while a choice is unanswered, however far you scrolled', () => {
    expect(isEpisodeComplete(panels, {}, 2)).toBe(false)
  })
  it('is false before the last panel', () => {
    expect(isEpisodeComplete(panels, { p2: 0 }, 1)).toBe(false)
  })
  it('is true once every gate is answered and the end is reached', () => {
    expect(isEpisodeComplete(panels, { p2: 0 }, 2)).toBe(true)
  })
  it('is false for an empty episode', () => {
    expect(isEpisodeComplete([], {}, 0)).toBe(false)
  })
})

describe('bubbleLayout', () => {
  const bubble = { side: 'right', top: 10, width: 70 }

  it('overlays a short line on a roomy panel', () => {
    const out = bubbleLayout(bubble, { columnWidth: 390, ratio: 4 / 3, textLength: 10 })
    expect(out.mode).toBe('overlay')
    expect(out.top).toBe(10)
    expect(out.width).toBe(70)
  })

  it('pins each side against its own edge and centres the centre', () => {
    const right = bubbleLayout({ side: 'right', top: 0, width: 70 }, { columnWidth: 390, ratio: 1, textLength: 4 })
    const left = bubbleLayout({ side: 'left', top: 0, width: 70 }, { columnWidth: 390, ratio: 1, textLength: 4 })
    const mid = bubbleLayout({ side: 'center', top: 0, width: 70 }, { columnWidth: 390, ratio: 1, textLength: 4 })
    expect(right.left).toBe(26)
    expect(left.left).toBe(4)
    expect(mid.left).toBe(15)
    // Whatever the side, the box stays inside the panel.
    for (const out of [right, left, mid]) {
      expect(out.left).toBeGreaterThanOrEqual(0)
      expect(out.left + out.width).toBeLessThanOrEqual(100)
    }
  })

  it('drops a long line out of the art rather than covering the drawing', () => {
    const out = bubbleLayout(bubble, { columnWidth: 390, ratio: 21 / 9, textLength: 120 })
    expect(out.mode).toBe('below')
  })

  it('re-decides as the screen narrows', () => {
    const wide = bubbleLayout(bubble, { columnWidth: 520, ratio: 16 / 9, textLength: 26 })
    const narrow = bubbleLayout(bubble, { columnWidth: 320, ratio: 16 / 9, textLength: 26 })
    expect(wide.mode).toBe('overlay')
    expect(narrow.mode).toBe('below')
  })

  it('makes room for the pinyin and the revealed translation', () => {
    const base = { columnWidth: 390, ratio: 16 / 9, textLength: 12 }
    const bare = bubbleLayout({ ...bubble, top: 30 }, { ...base, withReadings: false })
    const full = bubbleLayout({ ...bubble, top: 30 }, { ...base, withReadings: true, withEnglish: true, withSpeaker: true })
    expect(bare.mode).toBe('overlay')
    expect(full.mode).toBe('below')
  })

  it('costs the floated controls width on the first line only', () => {
    const opts = { columnWidth: 390, ratio: 16 / 9, textLength: 6, top: 30 }
    // Six characters fit on one line once the controls are paid for…
    expect(bubbleLayout({ ...bubble, width: 70 }, opts).mode).toBe('overlay')
    // …and a bubble too narrow to seat them plus the text wraps, which is what
    // pushes a tall-enough result out of a short panel.
    const narrow = estimateBubbleHeight(6, 390 * 0.44)
    const wide = estimateBubbleHeight(6, 390 * 0.70)
    expect(narrow).toBeGreaterThan(wide)
  })

  it('survives being asked with nothing', () => {
    const out = bubbleLayout(null, {})
    expect(out.mode).toBe('overlay')
    expect(out.width).toBe(72)
  })
})

describe('estimateBubbleHeight', () => {
  it('grows with the line', () => {
    const one = estimateBubbleHeight(6, 260)
    const many = estimateBubbleHeight(60, 260)
    expect(many).toBeGreaterThan(one)
  })
  it('grows as the box narrows', () => {
    expect(estimateBubbleHeight(24, 120)).toBeGreaterThan(estimateBubbleHeight(24, 320))
  })
  it('never returns zero for an empty line', () => {
    expect(estimateBubbleHeight(0, 260)).toBeGreaterThan(0)
  })
})
