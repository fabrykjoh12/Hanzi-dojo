import { defineConfig } from 'vitest/config'

// Unit tests target the pure logic modules (scheduling, scoring, progression),
// which need no DOM — so the lightweight node environment is enough.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // Scheduling is day-based and local: `endOfLocalDay` in srs.js reads the
    // machine's timezone, so any spec that asserts on a due date is really
    // asserting "in whatever zone this happens to run". Pinning it makes CI,
    // a laptop in Oslo and a laptop in Auckland agree, and removes the one
    // genuinely ambiguous case — a DST fall-back day is 25 hours long, so
    // "exactly 24h from now" and "end of today" can swap order.
    env: { TZ: 'UTC' },
  },
})
