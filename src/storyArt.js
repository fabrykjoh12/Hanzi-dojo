// The illustration system's pure half: which world a story belongs to, the
// world's tint, and which fallback tile a coverless story wears.
//
// World tints are a small curated set — never a computed hue — so every tile
// and every tinted mark on Home is a colour someone chose. Known story worlds
// get their own; everything else lands deterministically on one of the four
// generics, keyed by the story's id, so a given story always looks the same
// without any new data. The tint SUPPORTS the dawn→dusk system, it never
// replaces it: consumers mix it into a mood/surface colour at a low
// percentage, they never paint with it directly.

// Curated tints for the worlds the app's own serials live in.
export const WORLD_TINTS = {
  inkbound: '#3B4368',   // ink-indigo — the dojo at night
  noodleshop: '#C98A3B', // broth amber — the rainy-day stall
  train: '#3E6E68',      // carriage teal
  upstairs: '#6E5A8C',   // lamplight violet
}

// The designed wheel for everything without a named world.
export const GENERIC_TINTS = ['#3E5C50', '#8C5A2B', '#4A5B85', '#8C4A56']

function hashString(value) {
  let hash = 0
  const s = String(value || '')
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// A story's world tint. Known world slugs are read from the story id (the
// serials' ids carry them: 'st-noodleshop-hsk1-ep01'); anything else draws
// deterministically from the generic wheel.
export function worldTint(story) {
  if (!story) return GENERIC_TINTS[0]
  const id = String(story.id || '')
  for (const world of Object.keys(WORLD_TINTS)) {
    if (id.includes(world)) return WORLD_TINTS[world]
  }
  return GENERIC_TINTS[hashString(id || story.title) % GENERIC_TINTS.length]
}

// Which member of the fallback family a coverless story wears. Deterministic
// per story — the same story always shows the same object — and spread by id
// so neighbouring stories rarely repeat.
export const TILE_VARIANTS = ['book', 'cards', 'teacup', 'paper']

export function tileVariant(story) {
  if (!story) return TILE_VARIANTS[0]
  return TILE_VARIANTS[hashString(String(story.id || story.title)) % TILE_VARIANTS.length]
}
