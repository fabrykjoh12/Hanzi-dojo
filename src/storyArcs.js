// Grouping a tier's stories into narrative arcs ("seasons").
//
// The generator writes each tier as one continuing storyline, but the DB stores
// no arc/season field — only `story_number` (continuous within a level) and a
// `title` that, for authored/serial stories, carries a leading chapter number
// ("1. 三日 あとです"). So arcs are DERIVED: a new arc begins wherever that
// chapter number resets to 1 (or moves backwards). Stories whose titles carry no
// number fall into a single group — the honest floor when the shape can't be
// derived, chosen over a migration.
//
// Regex-free (the OXC parser this repo builds with is strict): numbers are read
// with code-point maths.

// Separators that can follow a leading chapter number. A digit run only counts
// as a chapter number when the very next character is one of these (or the end),
// so a title like "2024年" or "3つの願い" is NOT mistaken for chapter 2024 / 3.
const NUM_SEPARATORS = '.．。、,，:：)）]】-–— \t　'

// The leading chapter number of a title, or null. Handles ASCII and fullwidth
// digits.
export function leadingChapterNumber(title) {
  const t = String(title || '').trim()
  let i = 0
  let digits = ''
  while (i < t.length) {
    const c = t.charCodeAt(i)
    if (c >= 0x30 && c <= 0x39) { digits += String.fromCharCode(c); i += 1; continue }
    if (c >= 0xff10 && c <= 0xff19) { digits += String.fromCharCode(c - 0xff10 + 0x30); i += 1; continue }
    break
  }
  if (!digits || i === 0) return null
  const next = t[i]
  if (next !== undefined && NUM_SEPARATORS.indexOf(next) === -1) return null
  return parseInt(digits, 10)
}

// A title with its leading "N<sep>" chapter marker removed, trimmed. Used to name
// an arc from its first chapter's title (the closest thing to a season name the
// data holds).
export function stripLeadingNumber(title) {
  const t = String(title || '').trim()
  const num = leadingChapterNumber(t)
  if (num == null) return t
  let i = 0
  while (i < t.length) {
    const c = t.charCodeAt(i)
    if ((c >= 0x30 && c <= 0x39) || (c >= 0xff10 && c <= 0xff19)) { i += 1; continue }
    break
  }
  // Skip the separator run that follows the digits.
  while (i < t.length && NUM_SEPARATORS.indexOf(t[i]) !== -1) i += 1
  return t.slice(i).trim()
}

function arcTitleFor(parts) {
  if (!parts.length) return 'Stories'
  const first = parts[0]
  const stripped = stripLeadingNumber(first && first.title)
  return stripped || (first && first.title) || 'Stories'
}

// groupIntoArcs(orderedStories) → [{ key, title, parts, numbered }].
//
// `orderedStories` must already be in reading order (story_number ascending),
// and should be the NARRATIVE stories only (practice formats are pulled out
// upstream — see isPracticeFormat). `numbered` is true when the arc's parts
// carried chapter numbers, so the caller can decide whether an arc header adds
// information or is just noise over a single unnumbered pile.
export function groupIntoArcs(orderedStories) {
  const list = Array.isArray(orderedStories) ? orderedStories : []
  const arcs = []
  let cur = null
  let prevNum = null
  for (const s of list) {
    const num = leadingChapterNumber(s && s.title)
    const reset = num === 1 || (num != null && prevNum != null && num <= prevNum)
    if (cur === null || reset) {
      cur = { key: (s && s.id) || 'arc-' + arcs.length, parts: [], numbered: false }
      arcs.push(cur)
    }
    cur.parts.push(s)
    if (num != null) cur.numbered = true
    prevNum = num
  }
  return arcs.map(a => ({ key: a.key, title: arcTitleFor(a.parts), parts: a.parts, numbered: a.numbered }))
}
