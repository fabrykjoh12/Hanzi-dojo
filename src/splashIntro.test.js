import { describe, it, expect } from 'vitest'
import {
  splashPlan, splashFadeAtMs, splashDoneAtMs, prefersReducedMotion, SPLASH_BG,
} from './splashIntro'

describe('splashPlan', () => {
  it('plays only in the app — the web already showed the browser its own loading', () => {
    expect(splashPlan({ native: false }).show).toBe(false)
    expect(splashPlan({ native: true }).show).toBe(true)
  })

  it('never outstays its welcome', () => {
    // A launch animation is latency the user did not ask for. If this ever
    // creeps past a second and a half, it has stopped being a flourish.
    expect(splashDoneAtMs(splashPlan({ native: true }))).toBeLessThanOrEqual(1500)
  })

  it('drops the drawing for anyone who asked their phone to reduce motion', () => {
    const plan = splashPlan({ native: true, reducedMotion: true })
    expect(plan.show).toBe(true)
    expect(plan.drawMs).toBe(0)
    // Still visible briefly, so the launch does not look broken next to what
    // everyone else sees — and still shorter than the animated one.
    expect(splashDoneAtMs(plan)).toBeGreaterThan(0)
    expect(splashDoneAtMs(plan)).toBeLessThan(splashDoneAtMs(splashPlan({ native: true })))
  })

  it('fades after the stroke finishes, not during it', () => {
    const plan = splashPlan({ native: true })
    expect(splashFadeAtMs(plan)).toBeGreaterThanOrEqual(plan.drawMs)
    expect(splashDoneAtMs(plan)).toBeGreaterThan(splashFadeAtMs(plan))
  })

  it('costs nothing when it is not shown', () => {
    const plan = splashPlan({ native: false })
    expect(splashFadeAtMs(plan)).toBe(0)
    expect(splashDoneAtMs(plan)).toBe(0)
  })
})

describe('SPLASH_BG', () => {
  it('matches the platform launch images, or the handoff flashes', () => {
    // Read off ios/App/App/Assets.xcassets/Splash.imageset — rgb(250,250,248)
    // and rgb(15,17,21). If those images are regenerated, these move with them.
    expect(SPLASH_BG.light.toUpperCase()).toBe('#FAFAF8')
    expect(SPLASH_BG.dark.toUpperCase()).toBe('#0F1115')
  })
})

describe('prefersReducedMotion', () => {
  it('reads the media query', () => {
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) })).toBe(true)
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) })).toBe(false)
  })

  it('assumes motion is fine when the browser cannot say', () => {
    expect(prefersReducedMotion({})).toBe(false)
    expect(prefersReducedMotion({ matchMedia: () => { throw new Error('nope') } })).toBe(false)
  })
})
