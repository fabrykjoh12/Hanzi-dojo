import { describe, it, expect } from 'vitest'
import {
  OPEN_MS, REDUCED_MS, OPEN_PHASES, easeOut, phaseProgress, packetFrame, storyboardFrames,
} from './redPacketOpen'

describe('the gesture is quick, and it overlaps', () => {
  it('lands inside the 500-800ms the brief allows', () => {
    expect(OPEN_MS).toBeGreaterThanOrEqual(500)
    expect(OPEN_MS).toBeLessThanOrEqual(800)
  })

  it('never leaves a gap where nothing is moving', () => {
    // Four beats played strictly in sequence is what makes a 640ms animation
    // feel like two seconds. Every phase starts before the one before it ends.
    for (let i = 1; i < OPEN_PHASES.length; i += 1) {
      expect(OPEN_PHASES[i].start).toBeLessThan(OPEN_PHASES[i - 1].end)
    }
    expect(OPEN_PHASES[0].start).toBe(0)
    expect(OPEN_PHASES[OPEN_PHASES.length - 1].end).toBe(OPEN_MS)
  })

  it('eases out, and only out', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    // No overshoot anywhere — an eased value above 1 is a bounce.
    for (let t = 0; t <= 1.0001; t += 0.05) expect(easeOut(t)).toBeLessThanOrEqual(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
  })

  it('clamps a phase outside its own window', () => {
    expect(phaseProgress('flap', 0)).toBe(0)
    expect(phaseProgress('flap', 10_000)).toBe(1)
    expect(phaseProgress('nope', 200)).toBe(0)
  })
})

describe('the frame', () => {
  it('starts closed and flat', () => {
    const f = packetFrame(0)
    expect(f.lift).toBe(0)
    expect(f.flapAngle).toBe(0)
    expect(f.cards.every(c => c.rise === 0 && c.opacity === 0)).toBe(true)
    expect(f.done).toBe(false)
  })

  it('ends open, with the cards out and the session taking over', () => {
    const f = packetFrame(OPEN_MS)
    expect(f.flapAngle).toBeLessThan(-60)
    expect(f.cards.every(c => c.rise < 0 && c.opacity === 1)).toBe(true)
    expect(f.handoff).toBe(1)
    expect(f.done).toBe(true)
  })

  it('lifts a little, not a lot', () => {
    // "The packet is on a page, not thrown in the air."
    const rises = [0, 90, 180, 320, 640].map(ms => packetFrame(ms).lift)
    expect(Math.min(...rises)).toBeGreaterThan(-10)
  })

  it('fans rather than slides: the middle card leads and the outer two lean apart', () => {
    const f = packetFrame(OPEN_MS)
    const [left, middle, right] = f.cards
    expect(middle.rise).toBeLessThan(left.rise)
    expect(middle.rise).toBeLessThan(right.rise)
    expect(middle.tilt).toBe(0)
    expect(left.tilt).toBeLessThan(0)
    expect(right.tilt).toBeGreaterThan(0)
  })

  it('moves monotonically — nothing goes back on itself mid-gesture', () => {
    let lift = 1
    let angle = 1
    let rise = 1
    for (let ms = 0; ms <= OPEN_MS; ms += 20) {
      const f = packetFrame(ms)
      expect(f.lift).toBeLessThanOrEqual(lift + 1e-9)
      expect(f.flapAngle).toBeLessThanOrEqual(angle + 1e-9)
      expect(f.cards[1].rise).toBeLessThanOrEqual(rise + 1e-9)
      lift = f.lift; angle = f.flapAngle; rise = f.cards[1].rise
    }
  })
})

describe('reduced motion is a different thing, not a fast version', () => {
  it('does not rotate, travel or lift at any point', () => {
    for (let ms = 0; ms <= REDUCED_MS; ms += 10) {
      const f = packetFrame(ms, { reduced: true })
      expect(f.flapAngle).toBe(0)
      expect(f.lift).toBe(0)
      expect(f.cards.every(c => c.rise === 0 && c.tilt === 0)).toBe(true)
    }
  })

  it('is a short cross-fade, and it finishes', () => {
    expect(REDUCED_MS).toBeLessThanOrEqual(150)
    const end = packetFrame(REDUCED_MS, { reduced: true })
    expect(end.packetFade).toBe(0)
    expect(end.handoff).toBe(1)
    expect(end.done).toBe(true)
  })
})

describe('the storyboard', () => {
  it('is every phase boundary, in order, once', () => {
    const frames = storyboardFrames()
    expect(frames[0]).toBe(0)
    expect(frames[frames.length - 1]).toBe(OPEN_MS)
    expect(new Set(frames).size).toBe(frames.length)
    expect([...frames].sort((a, b) => a - b)).toEqual(frames)
  })
})
