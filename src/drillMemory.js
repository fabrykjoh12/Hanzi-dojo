// Session-scoped miss memory for the alphabet drills (Kana / Cyrillic / Tones).
//
// These drills have no per-item DB rows (the kana tables and the Cyrillic
// alphabet are embedded, not vocabulary), and localStorage is unavailable in
// this environment — so misses live in module state: they persist across
// rounds and screens within one app session, and reset on reload. That's the
// right weight for a low-stakes recognition drill: today's slips get extra
// practice today.

const misses = {}

export function recordMiss(drill, key) {
  const k = drill + ':' + key
  misses[k] = (misses[k] || 0) + 1
}

export function missCount(drill, key) {
  return misses[drill + ':' + key] || 0
}

// Sample `count` distinct items from `pool`, biased toward items missed this
// session: an item with N recorded misses enters the draw with 1 + 2×min(N,3)
// tickets, so trouble items reappear far more often without ever crowding the
// round entirely (results stay distinct by key).
export function weightedSample(pool, keyOf, drill, count, shuffleFn) {
  const bag = []
  for (const item of pool) {
    const boost = Math.min(3, missCount(drill, keyOf(item)))
    for (let i = 0; i < 1 + boost * 2; i += 1) bag.push(item)
  }
  const seen = new Set()
  const out = []
  for (const item of shuffleFn(bag)) {
    const k = keyOf(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
    if (out.length >= count) break
  }
  return out
}
