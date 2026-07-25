// Geometry for the contained ink-wash backdrop used by the story-first Home.
//
// Drawn rather than photographed, for the reason the design brief gives: a
// photo has its own colours and will fight the palette no matter how far you
// fade it. Ridgelines built from the accent itself cannot clash, cost no
// bytes, and stay crisp at any size.
//
// Deterministic from a seed string, so a language always gets the same
// skyline — the screen shouldn't reshuffle on every render.

// mulberry32 — small, fast, and (unlike Math.random) seedable, which is what
// makes the output stable across renders and testable.
export function seededRandom(seed) {
  let h = 1779033703 ^ String(seed).length
  for (let i = 0; i < String(seed).length; i += 1) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One ridge: a filled band whose top edge rolls across the viewBox in smooth
// quadratic arcs. `baseY` is where the ridge sits (0 = top, 100 = bottom),
// `amp` how tall its peaks are, `peaks` how many.
export function ridgePath({ seed = 'a', baseY = 60, amp = 18, peaks = 4, width = 100, height = 100 } = {}) {
  const rand = seededRandom(seed)
  const step = width / peaks
  const parts = [`M 0 ${baseY.toFixed(2)}`]

  for (let i = 0; i < peaks; i += 1) {
    const x0 = i * step
    const cx = x0 + step / 2
    // Each peak varies, but never so much that the ridge stops reading as one
    // range — 0.45..1 of the amplitude.
    const peakY = baseY - amp * (0.45 + rand() * 0.55)
    const endY = baseY - amp * (rand() * 0.22)
    parts.push(`Q ${cx.toFixed(2)} ${peakY.toFixed(2)} ${(x0 + step).toFixed(2)} ${endY.toFixed(2)}`)
  }

  parts.push(`L ${width} ${height}`, `L 0 ${height}`, 'Z')
  return parts.join(' ')
}

// A stack of ridges, far to near. Farther ridges sit higher, are flatter, and
// are fainter — the whole depth cue of an ink-wash landscape in three numbers.
export function ridgeLayers(seed = 'a', count = 3) {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1)
    return {
      d: ridgePath({
        seed: `${seed}-${i}`,
        baseY: 52 + t * 30,
        amp: 20 - t * 9,
        peaks: 3 + i,
      }),
      // Nearer ridges read stronger; the falloff is what creates the recession.
      opacity: 0.35 + t * 0.65,
    }
  })
}
