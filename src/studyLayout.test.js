import { describe, it, expect } from 'vitest'
import {
  studyLayout, studyDensity, availableHeight,
  MIN_TAP_TARGET, DESKTOP_CARD_MIN_HEIGHT,
  MOBILE_SHELL_HEIGHT, DENSITIES,
} from './studyLayout'
// The bar's height belongs to the bar, not to the flashcard's geometry — the
// study screen is one of its consumers, which is the whole point of the module.
import { MOBILE_NAV_HEIGHT } from './navMetrics'

const PHONES = [
  { name: 'iPhone 14', height: 844, density: 'roomy' },
  { name: 'iPhone SE 3', height: 667, density: 'compact' },
  { name: 'short Android', height: 640, density: 'tight' },
  { name: 'landscape phone', height: 390, density: 'tight' },
]

describe('availableHeight', () => {
  it('subtracts the fixed bottom nav', () => {
    expect(availableHeight(844)).toBe(844 - MOBILE_NAV_HEIGHT)
  })

  it('never goes negative', () => {
    expect(availableHeight(10)).toBe(0)
    expect(availableHeight(undefined)).toBe(0)
  })
})

describe('studyDensity', () => {
  it('is always desktop when not mobile, whatever the height', () => {
    expect(studyDensity(false, 844)).toBe('desktop')
    expect(studyDensity(false, 500)).toBe('desktop')
  })

  PHONES.forEach(p => {
    it('classifies ' + p.name + ' as ' + p.density, () => {
      expect(studyDensity(true, p.height)).toBe(p.density)
    })
  })

  it('gets denser as the viewport shrinks, never the other way', () => {
    let last = 0
    for (let h = 1200; h >= 300; h -= 10) {
      const idx = DENSITIES.indexOf(studyDensity(true, h))
      expect(idx).toBeGreaterThanOrEqual(last)
      last = idx
    }
  })
})

describe('studyLayout — desktop is untouched', () => {
  const d = studyLayout({ isMobile: false, viewportHeight: 900 })

  it('keeps the original page shell, card height and grade band', () => {
    expect(d.fixed).toBe(false)
    expect(d.shellHeight).toBe(null)
    expect(d.cardFlex).toBe(null)
    expect(d.shellPadding).toBe('20px 32px 36px')
    expect(d.cardMinHeight).toBe(DESKTOP_CARD_MIN_HEIGHT)
    expect(d.cardPadding).toBe(24)
    expect(d.contentPadding).toBe('34px 24px')
    expect(d.wordSize).toBe(90)
    expect(d.footerMinHeight).toBe(42)
    expect(d.footerPadTop).toBe(18)
    expect(d.showFooterHint).toBe(true)
    expect(d.gradeTopGap).toBe(14)
    expect(d.gradeGap).toBe(10)
    expect(d.gradeMinHeight).toBe(76)
    expect(d.titleSize).toBe(28)
    expect(d.showSubtitle).toBe(true)
  })

  it('ignores banners on desktop — there is room for them', () => {
    const withBanners = studyLayout({ isMobile: false, viewportHeight: 900, banners: 2 })
    expect(withBanners.showSubtitle).toBe(true)
    expect(withBanners.cardMinHeight).toBe(DESKTOP_CARD_MIN_HEIGHT)
  })
})

describe('studyLayout — mobile locks the screen to one viewport', () => {
  PHONES.forEach(p => {
    const l = studyLayout({ isMobile: true, viewportHeight: p.height })

    it(p.name + ': the shell is height-locked to the dynamic viewport', () => {
      expect(l.fixed).toBe(true)
      expect(l.shellHeight).toBe(MOBILE_SHELL_HEIGHT)
      expect(l.available).toBe(p.height - MOBILE_NAV_HEIGHT)
    })

    it(p.name + ': the card is the only element that gives up space', () => {
      expect(l.cardFlex).toBe(1)
      expect(l.cardMinHeight).toBe(0)
    })

    it(p.name + ': grade buttons stay a comfortable tap target', () => {
      expect(l.gradeMinHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET)
    })
  })

  it('uses dvh, not vh, so browser chrome cannot overshoot the viewport', () => {
    expect(MOBILE_SHELL_HEIGHT.indexOf('100dvh')).toBeGreaterThan(-1)
    expect(MOBILE_SHELL_HEIGHT.indexOf('100vh')).toBe(-1)
  })

  it('subtracts exactly the nav height App.jsx reserves', () => {
    expect(MOBILE_SHELL_HEIGHT.indexOf(MOBILE_NAV_HEIGHT + 'px')).toBeGreaterThan(-1)
    expect(MOBILE_SHELL_HEIGHT.indexOf('env(safe-area-inset-bottom)')).toBeGreaterThan(-1)
    // The top inset too: App.jsx pads main with env(safe-area-inset-top) on
    // mobile, so a shell that ignores it overflows by the notch on a real
    // phone — while every zero-inset CI environment stays green.
    expect(MOBILE_SHELL_HEIGHT.indexOf('env(safe-area-inset-top)')).toBeGreaterThan(-1)
  })
})

describe('studyLayout — everything shrinks monotonically', () => {
  const shrinking = ['wordSize', 'meaningSize', 'cardPadding', 'gradeMinHeight',
    'gradeGap', 'gradeTopGap', 'headerGap', 'titleSize', 'gradeLabelSize',
    'gradeIntervalSize', 'footerPadTop']

  const layouts = [
    studyLayout({ isMobile: false, viewportHeight: 1000 }),
    studyLayout({ isMobile: true, viewportHeight: 844 }),
    studyLayout({ isMobile: true, viewportHeight: 667 }),
    studyLayout({ isMobile: true, viewportHeight: 600 }),
  ]

  shrinking.forEach(key => {
    it(key + ' never grows as the viewport gets shorter', () => {
      for (let i = 1; i < layouts.length; i += 1) {
        expect(layouts[i][key]).toBeLessThanOrEqual(layouts[i - 1][key])
      }
    })
  })

  it('but grade buttons never drop below the minimum tap target', () => {
    layouts.forEach(l => expect(l.gradeMinHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET))
  })
})

describe('studyLayout — banners buy space from the header, not the card', () => {
  it('drops the subtitle on a short screen showing a banner', () => {
    expect(studyLayout({ isMobile: true, viewportHeight: 667 }).showSubtitle).toBe(true)
    expect(studyLayout({ isMobile: true, viewportHeight: 667, banners: 1 }).showSubtitle).toBe(false)
  })

  it('keeps the subtitle on a roomy phone even with a banner', () => {
    expect(studyLayout({ isMobile: true, viewportHeight: 844, banners: 1 }).showSubtitle).toBe(true)
  })

  it('never shows a subtitle on the tightest screens', () => {
    expect(studyLayout({ isMobile: true, viewportHeight: 560 }).showSubtitle).toBe(false)
  })

  it('reports the banner count back for callers that need it', () => {
    expect(studyLayout({ isMobile: true, viewportHeight: 844, banners: 2 }).banners).toBe(2)
    expect(studyLayout({ isMobile: true, viewportHeight: 844 }).banners).toBe(0)
  })
})

describe('studyLayout — defaults', () => {
  it('survives being called with nothing', () => {
    const l = studyLayout()
    expect(l.density).toBe('desktop')
    expect(l.fixed).toBe(false)
  })
})
