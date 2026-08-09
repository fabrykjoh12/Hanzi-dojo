import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Unit tests target the pure logic modules (scheduling, scoring, progression),
// which need no DOM — so the lightweight node environment is the DEFAULT.
//
// A handful of specs genuinely need a renderer: the persistent-tab lifecycle
// (does hiding a tab keep its state? does it stop its audio?) is a claim about
// React's behaviour, and asserting it any other way would be asserting our
// belief about React rather than React. Those live in `*.test.jsx` and opt into
// jsdom with a `@vitest-environment jsdom` docblock, so the 155 node-environment
// files are untouched and stay fast.
export default defineConfig({
  // Only the .jsx specs need this; it is a no-op for everything else.
  plugins: [react()],
  test: {
    environment: 'node',
    // `src/**` is the app. The root `*.test.mjs` specs cover the pure parts of
    // the content-generation scripts (`*.mjs` at the repo root), which are never
    // bundled but are exactly as easy to break.
    include: ['src/**/*.test.js', 'src/**/*.test.jsx', '*.test.mjs'],
    // Scheduling is day-based and local: `endOfLocalDay` in srs.js reads the
    // machine's timezone, so any spec that asserts on a due date is really
    // asserting "in whatever zone this happens to run". Pinning it makes CI,
    // a laptop in Oslo and a laptop in Auckland agree, and removes the one
    // genuinely ambiguous case — a DST fall-back day is 25 hours long, so
    // "exactly 24h from now" and "end of today" can swap order.
    env: { TZ: 'UTC' },
  },
})
