import { describe, it, expect } from 'vitest'
import {
  OPEN_MS, REDUCED_MS, OPEN_PHASES, easeOut, phaseLinear, phaseProgress, packetFrame, storyboardFrames,
} from './redPacketOpen'

describe('the gesture is quick, and it never stalls', () => {
  it('lands inside the 500-800ms the brief allows', () => {
    expect(OPEN_MS).toBeGreaterThanOrEqual(500)
    expect(OPEN_MS).toBeLessThanOrEqual(800)
  })

  it('leaves no gap where nothing is moving', () => {
    // Five beats played with dead air between them is what makes a 650ms
    // animation feel like two seconds. Each starts at or before the previous end.
    for (let i = 1; i < OPEN_PHASES.length; i += 1) {
      expect(OPEN_PHASES[i].start).toBeLessThanOrEqual(OPEN_PHASES[i - 1].end)
    }
    expect(OPEN_PHASES[0].start).toBe(0)
    expect(OPEN_PHASES[OPEN_PHASES.length - 1].end).toBe(OPEN_MS)
  })

  it('eases out, and only out', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    for (let t = 0; t <= 1.0001; t += 0.05) expect(easeOut(t)).toBeLessThanOrEqual(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
  })

  it('reads a phase linearly as well as eased, and clamps outside it', () => {
    expect(phaseLinear('open', 200)).toBeCloseTo(0.5, 5)
    expect(phaseProgress('open', 200)).toBeGreaterThan(0.5)
    expect(phaseLinear('open', 0)).toBe(0)
    expect(phaseLinear('open', 10_000)).toBe(1)
    expect(phaseLinear('nope', 200)).toBe(0)
  })
})

describe('the frame', () => {
  it('starts closed, flat and uncompressed', () => {
    const f = packetFrame(0)
    expect(f.lift).toBe(0)
    expect(f.compress).toBe(0)
    expect(f.open).toBe(0)
    expect(f.cards.every(c => c.rise === 0 && c.tilt === 0)).toBe(true)
    expect(f.done).toBe(false)
  })

  it('ends open, with both cards out and the session taking over', () => {
    const f = packetFrame(OPEN_MS)
    expect(f.open).toBe(1)
    expect(f.cards.every(c => c.rise < -15)).toBe(true)
    expect(f.handoff).toBe(1)
    expect(f.done).toBe(true)
  })

  it('presses: the compression goes out and comes back inside its own phase', () => {
    // A squash that is still there when the cards come out is not a press, it is
    // a deformed object.
    expect(packetFrame(60).compress).toBeGreaterThan(0.9)
    expect(packetFrame(120).compress).toBeCloseTo(0, 5)
    expect(packetFrame(300).compress).toBeCloseTo(0, 5)
  })

  it('lifts a little, not a lot', () => {
    const rises = [0, 60, 120, 300, 650].map(ms => packetFrame(ms).lift)
    expect(Math.min(...rises)).toBeGreaterThan(-10)
  })

  it('staggers: the second card leaves later and travels further', () => {
    // Two cards doing the same thing at the same time is one card drawn twice.
    const mid = packetFrame(300)
    expect(mid.cards[0].rise).toBeLessThan(mid.cards[1].rise)
    const end = packetFrame(OPEN_MS)
    expect(end.cards[1].rise).toBeLessThan(end.cards[0].rise)
    expect(end.cards[0].tilt).toBeLessThan(0)
    expect(end.cards[1].tilt).toBeGreaterThan(0)
    expect(Math.abs(end.cards[0].tilt)).not.toBe(Math.abs(end.cards[1].tilt))
  })

  it('opens the cavity before the cards leave it', () => {
    // The cards must not appear to pass through a closed packet.
    const atRiseStart = packetFrame(230)
    expect(atRiseStart.open).toBeGreaterThan(0.6)
    expect(atRiseStart.cards[0].rise).toBe(0)
  })

  it('moves monotonically — nothing goes back on itself except the press', () => {
    let lift = 1
    let open = -1
    let rise = 1
    for (let ms = 0; ms <= OPEN_MS; ms += 10) {
      const f = packetFrame(ms)
      expect(f.lift).toBeLessThanOrEqual(lift + 1e-9)
      expect(f.open).toBeGreaterThanOrEqual(open - 1e-9)
      expect(f.cards[0].rise).toBeLessThanOrEqual(rise + 1e-9)
      lift = f.lift; open = f.open; rise = f.cards[0].rise
    }
  })
})

describe('reduced motion is a different thing, not a fast version', () => {
  it('does not rotate, travel, lift, compress or open at any point', () => {
    for (let ms = 0; ms <= REDUCED_MS; ms += 10) {
      const f = packetFrame(ms, { reduced: true })
      expect(f.lift).toBe(0)
      expect(f.compress).toBe(0)
      expect(f.open).toBe(0)
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

  it('contains the three keyframes a review asks for: closed, half, open', () => {
    const frames = storyboardFrames()
    expect(frames).toContain(0)
    expect(frames).toContain(280)
    expect(frames).toContain(OPEN_MS)
  })

  it('includes the peak of the press, which is not on any boundary', () => {
    const frames = storyboardFrames()
    const peak = frames.find(ms => packetFrame(ms).compress > 0.9)
    expect(peak, 'no storyboard frame shows the object compressed').toBeDefined()
  })
})
