// The one place the offline vocabulary cache key is built.
//
// It existed twice, and the two copies never agreed:
//
//   Study.jsx    'vocab:' + language + ':' + system + ':' + floor + '-' + current
//   prefetch.js  'vocab:' + language + ':' + system + ':' + level
//
// So "Save this level for offline" wrote a snapshot under `vocab:chinese:hsk:2`
// and the study queue looked for `vocab:chinese:hsk:1-2`. The write was real,
// the read was real, and they had never once met — the advertised offline
// review queue could not have worked, while the audio half of the same button
// did. Found by tracing the feature rather than by any test, because two string
// literals in two files have nothing to disagree with.
//
// The RANGE is the intended granularity, and it comes from the reader: the
// study queue is the cumulative deck [floor..current] (levelScope.js), so a
// snapshot of one level could never answer it. A caller that genuinely means
// one level passes the same number twice.

export function vocabCacheKey({ language, system, floorLevel, currentLevel }) {
  const from = Number(floorLevel)
  const to = Number(currentLevel)
  // Guard the degenerate call rather than minting `vocab:x:y:NaN-NaN`, which
  // would be a key that never collides with anything and never hits.
  const lo = Number.isFinite(from) ? from : to
  const hi = Number.isFinite(to) ? to : from
  return 'vocab:' + language + ':' + system + ':' + lo + '-' + hi
}
