// The curriculum authority, loaded fail-closed (FAB-9, 2026-08-30).
//
// data/hsk-curriculum-bands.json answers the one question the generated
// data/hsk<N>.json artifacts cannot: which words the course LISTS, as opposed
// to which words the build happened to emit. Every CURRICULUM_ROW_MISSING
// verdict rests on it.
//
// It was being read as `JSON.parse(...).bands || {}`, which fails OPEN: a
// truncated, renamed or hand-edited file degrades to an empty curriculum, and
// an empty curriculum silently reclassifies every lost row as ordinary
// story-content debt. The comparison then goes green while saying the opposite
// of the truth. So the authority is validated before it is trusted, and a file
// that cannot be trusted stops the run.
//
// The validator checks SHAPE and INTERNAL CONSISTENCY, never a specific corpus
// size. Hardcoding today's 5,181 would mean a deliberate curriculum revision
// could not be reviewed without editing the validator, which is the opposite of
// what a reviewable authority is for.
//
// Pure: no fs, no network, no clock. The caller reads the file.

export const AUTHORITY_SCHEMA = 'hsk-curriculum-bands@1'

// HSK 3.0 has nine bands. The file may legitimately carry all of them; the
// caller narrows to the bands the app teaches.
export const MIN_BAND = 1
export const MAX_BAND = 9

export class CurriculumAuthorityError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CurriculumAuthorityError'
  }
}

/**
 * Validate a parsed authority document and return it, or throw.
 * `source` is only used to make the error message actionable.
 */
export function validateAuthority(doc, { source = 'the curriculum authority' } = {}) {
  const fail = (why) => { throw new CurriculumAuthorityError(source + ': ' + why) }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('root is not an object')
  if (doc.schema !== AUTHORITY_SCHEMA) {
    fail('schema is ' + JSON.stringify(doc.schema) + ', expected ' + JSON.stringify(AUTHORITY_SCHEMA))
  }
  const bands = doc.bands
  if (!bands || typeof bands !== 'object' || Array.isArray(bands)) fail('"bands" is not an object')

  const entries = Object.entries(bands)
  if (entries.length === 0) fail('"bands" is empty — an empty curriculum silently reclassifies every missing row')

  for (const [word, band] of entries) {
    if (typeof word !== 'string' || word.length === 0) fail('an empty word key')
    if (!Number.isInteger(band)) {
      fail('band for ' + JSON.stringify(word) + ' is ' + JSON.stringify(band) + ', expected an integer')
    }
    if (band < MIN_BAND || band > MAX_BAND) {
      fail('band for ' + JSON.stringify(word) + ' is ' + band + ', outside HSK ' + MIN_BAND + '-' + MAX_BAND)
    }
  }

  // The declared count is the file's own checksum on itself: a truncated write
  // or a bad hand-edit shows up here rather than as a quietly smaller course.
  if (!Number.isInteger(doc.words)) {
    fail('"words" is ' + JSON.stringify(doc.words) + ', expected an integer')
  }
  if (doc.words !== entries.length) {
    fail('declares ' + doc.words + ' words but "bands" holds ' + entries.length)
  }
  return doc
}

/**
 * The set of words the course teaches at or below `maxLevel`.
 * Throws unless the authority is valid — there is no degraded mode.
 */
export function curriculumWords(doc, { maxLevel, source } = {}) {
  validateAuthority(doc, { source })
  if (!Number.isInteger(maxLevel) || maxLevel < MIN_BAND || maxLevel > MAX_BAND) {
    throw new CurriculumAuthorityError('maxLevel must be an integer in ' + MIN_BAND + '-' + MAX_BAND)
  }
  const out = new Set()
  for (const [word, band] of Object.entries(doc.bands)) if (band <= maxLevel) out.add(word)
  if (out.size === 0) {
    throw new CurriculumAuthorityError((source || 'the curriculum authority')
      + ': no words at or below band ' + maxLevel)
  }
  return out
}
