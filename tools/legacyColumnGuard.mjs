// The one place that decides whether a piece of source WRITES `ease_factor`.
//
// CLAUDE.md §10: it is a dead SM-2 column, kept in the database and never
// written. FSRS replaced it with `stability` and `difficulty` in
// 20260606120000, which says so in its own header.
//
// This lives in a module rather than inside the spec because the spec needs to
// prove the predicate can still SEE an assignment, and a scan that matches
// nothing passes forever. An earlier version of that proof re-declared the
// predicate locally, so the two were copy-paste twins: weakening the real one
// to /\bzzz\s*:/ left the whole suite green. One definition, imported by both,
// is the only arrangement where the liveness test binds the thing it names.

// Comments discuss this column deliberately — creativeMode.js, knowledgeState.js,
// devTools.js and CreativeMode.jsx all explain why they do NOT write it, and
// those explanations are worth keeping. So the scan looks for an assignment in
// code, not a mention in prose.
//
// A LEXER APPROXIMATION, and it says so rather than pretending: it tracks
// strings and template literals so a `//` inside one is not read as a comment,
// but it does not parse. A regex literal containing `//` would confuse it. The
// earlier version was worse in a way that mattered — it dropped only lines
// whose trimmed START was a comment, so `state: 'new', // was ease_factor: 2.5`
// and a JSX `{/* ease_factor: 2.5 */}` both failed the guard, which is exactly
// the pressure that makes somebody delete an explanatory comment to get green.
export function stripComments(src) {
  let out = ''
  let i = 0
  let quote = null
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (quote) {
      if (c === '\\') { out += c + (next || ''); i += 2; continue }
      if (c === quote) quote = null
      out += c; i += 1; continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += c; i += 1
  }
  return out
}

// Every spelling of "assign to ease_factor" that could plausibly be written by
// somebody who did not know the rule. Not every spelling that EXISTS — see the
// boundary note below.
const WRITES = [
  /\bease_factor\s*:/,                    // { ease_factor: 2.5 }
  /['"]ease_factor['"]\s*:/,              // { 'ease_factor': 2.5 }
  /\.ease_factor\s*=[^=]/,                // row.ease_factor = 2.5
  /\[\s*['"]ease_factor['"]\s*\]\s*=/,    // row['ease_factor'] = 2.5
  /\[\s*['"]ease_factor['"]\s*\]\s*:/,    // { ['ease_factor']: 2.5 }
  /\{\s*ease_factor\s*[,}]/,              // { ease_factor } shorthand
]

// WHAT THIS CANNOT SEE, stated so nobody mistakes a green run for a proof:
//   * a computed key assembled at runtime — { ['ease' + '_factor']: 2.5 }
//   * a spread of an object built somewhere else — { ...legacyCardDefaults }
//   * SQL. It scans src/ only, and a SECURITY DEFINER function in a migration
//     can write the column from the server side; docs/BACKLOG.md records the
//     one that does and which migration removes it.
// It catches the shapes a person actually types. Closing the rest means a
// parser, and a parser is not worth it for a column nothing reads.
export function writesLegacyColumn(source) {
  const code = stripComments(source)
  return WRITES.some(re => re.test(code))
}
