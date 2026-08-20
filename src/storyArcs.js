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
const NUM_SEPARATORS = '.．。、,，:：)）]】-–—·・ \t　'

// The OTHER way a chapter announces itself: 第一话 / 第二章 / 第10回. A manhua
// episode is titled that way rather than "1. …", and without this the number is
// invisible — the episode joins whatever season precedes it in story_number
// order instead of starting its own. (That is exactly what happened to
// 第一话 · 我是新学生: it was swallowed as chapter 6 of 下雪了.)
const CHAPTER_OPEN = '第'
const CHAPTER_UNITS = '话話章回集'
const CN_DIGITS = '〇一二三四五六七八九'
const CN_TEN = '十'

// A Chinese numeral 1–99 in the ordinary composition (十二 = 12, 二十 = 20,
// 二十一 = 21), or null. Deliberately capped: chapter numbers past 99 do not
// happen, and the longer forms bring 百/千 and their own edge cases.
function parseChineseNumber(s) {
  if (!s) return null
  let total = 0
  let unit = 0
  let seen = false
  for (const ch of s) {
    const d = CN_DIGITS.indexOf(ch)
    if (d !== -1) { unit = d; seen = true; continue }
    if (ch === CN_TEN) { total += (unit || 1) * 10; unit = 0; seen = true; continue }
    return null
  }
  if (!seen) return null
  return total + unit
}

// How many characters of `t` the leading chapter marker occupies, and what
// number it names. { length, value } or null. Both leadingChapterNumber and
// stripLeadingNumber read this, so they can never disagree about where the
// marker ends.
function chapterMarker(t) {
  // Form 1 — "12. " / "３：" : a digit run followed by a separator or the end.
  let i = 0
  let digits = ''
  while (i < t.length) {
    const c = t.charCodeAt(i)
    if (c >= 0x30 && c <= 0x39) { digits += String.fromCharCode(c); i += 1; continue }
    if (c >= 0xff10 && c <= 0xff19) { digits += String.fromCharCode(c - 0xff10 + 0x30); i += 1; continue }
    break
  }
  if (digits) {
    const next = t[i]
    if (next !== undefined && NUM_SEPARATORS.indexOf(next) === -1) return null
    while (i < t.length && NUM_SEPARATORS.indexOf(t[i]) !== -1) i += 1
    return { length: i, value: parseInt(digits, 10) }
  }

  // Form 2 — "第一话" / "第10章": 第, a number in either script, then a unit.
  if (t[0] !== CHAPTER_OPEN) return null
  let j = 1
  let body = ''
  while (j < t.length) {
    const c = t.charCodeAt(j)
    if (c >= 0x30 && c <= 0x39) { body += String.fromCharCode(c); j += 1; continue }
    if (c >= 0xff10 && c <= 0xff19) { body += String.fromCharCode(c - 0xff10 + 0x30); j += 1; continue }
    if (CN_DIGITS.indexOf(t[j]) !== -1 || t[j] === CN_TEN) { body += t[j]; j += 1; continue }
    break
  }
  if (!body || j >= t.length || CHAPTER_UNITS.indexOf(t[j]) === -1) return null
  j += 1
  // Same rule as form 1: a marker has to END, or the "第一话" was just the
  // opening of an ordinary sentence.
  const after = t[j]
  if (after !== undefined && NUM_SEPARATORS.indexOf(after) === -1) return null
  while (j < t.length && NUM_SEPARATORS.indexOf(t[j]) !== -1) j += 1

  const ascii = body.charCodeAt(0) >= 0x30 && body.charCodeAt(0) <= 0x39
  const value = ascii ? parseInt(body, 10) : parseChineseNumber(body)
  if (value == null || Number.isNaN(value)) return null
  return { length: j, value }
}

// The leading chapter number of a title, or null. Handles ASCII and fullwidth
// digits, and the 第N话 / 第N章 form.
export function leadingChapterNumber(title) {
  const marker = chapterMarker(String(title || '').trim())
  return marker ? marker.value : null
}

// A title with its leading "N<sep>" chapter marker removed, trimmed. Used to name
// an arc from its first chapter's title (the closest thing to a season name the
// data holds).
export function stripLeadingNumber(title) {
  const t = String(title || '').trim()
  const marker = chapterMarker(t)
  if (!marker) return t
  return t.slice(marker.length).trim()
}

// ── Cross-level sagas ────────────────────────────────────────────────────────
// Two authored sagas number their chapters CONTINUOUSLY across HSK levels:
// chapters 1–6 at HSK 1, 7–12 at HSK 2, 13–18 at HSK 3. Because arcs are
// derived per level, a run starting at 7 (or 13) has no "1" to reset on, so it
// used to be swallowed by whatever unrelated arc preceded it in story_number
// order (守株待兔's five chapters grew the sea saga's 7–12, and so on).
//
// Chapter numbers ALONE cannot decide this: 没有人的地方 is a legitimate
// single-level 1–12 series, numerically identical to an innocent 1–6 arc
// followed by a saga's 7–12. Identity has to come from data — explicit
// panels.meta.series where it exists (the manhua do this), and this registry
// for the two prose sagas that predate it: the stripped title of each
// continuation run's FIRST chapter, mapped to the saga it continues. A story
// matching an entry (with a leading chapter number above 1) always starts a
// new arc, and the arc is titled by its saga. New cross-level sagas should
// ship with panels.meta.series from the generator instead of growing this map.
export const SAGA_CONTINUATIONS = {
  // The sea/island saga — 第七个人 (HSK 1, ch 1–6):
  '我跟着他': '第七个人',            // HSK 2, ch 7–12
  '上岛': '第七个人',                // HSK 3, ch 13–18
  // The school saga — 八个人，我第八 (HSK 1, ch 1–6):
  '十九和十八': '八个人，我第八',    // HSK 2, ch 7–12
  '一个学校两个人': '八个人，我第八', // HSK 3, ch 13–18
}

function sagaContinuationOf(title, num) {
  if (num == null || num <= 1) return null
  return SAGA_CONTINUATIONS[stripLeadingNumber(title)] || null
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
    const saga = sagaContinuationOf(s && s.title, num)
    const reset = num === 1 || (num != null && prevNum != null && num <= prevNum) || saga != null
    if (cur === null || reset) {
      cur = { key: (s && s.id) || 'arc-' + arcs.length, parts: [], numbered: false, sagaTitle: saga }
      arcs.push(cur)
    }
    cur.parts.push(s)
    if (num != null) cur.numbered = true
    prevNum = num
  }
  return arcs.map(a => ({ key: a.key, title: a.sagaTitle || arcTitleFor(a.parts), parts: a.parts, numbered: a.numbered }))
}
