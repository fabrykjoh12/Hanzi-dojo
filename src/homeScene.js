// The Home horizon's clock — which mood the scene band wears.
//
// One scene language (three layered hills and one disc), four moods that vary
// only its colours: the tokens live in index.css under [data-scene='…'], and
// dark theme always renders the night set regardless of the hour. This module
// is just the pure hour → mood mapping, injectable for tests.

export const SCENE_MOODS = ['morning', 'day', 'evening', 'night']

// Local-hour bands. Deliberately wide and unfussy — the mood is atmosphere,
// not a clock the learner is supposed to read.
export function sceneMood(hour) {
  const h = ((Math.trunc(hour) % 24) + 24) % 24
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 17) return 'day'
  if (h >= 17 && h < 22) return 'evening'
  return 'night'
}
