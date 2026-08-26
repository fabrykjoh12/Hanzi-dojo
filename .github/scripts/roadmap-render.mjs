// The Discord renderer for ROADMAP.md and docs/BACKLOG.md.
//
// This used to be an inline `awk` program inside roadmap-live-sync.yml, which
// meant the one piece of logic the community actually sees could only be tested
// by pushing a commit and looking at Discord. It is a pure function of the
// markdown text, so it belongs in a module with specs beside it.
//
// The output is a CONDENSED view, not the whole file: a Discord embed
// description caps at 4096 characters and both documents are far longer than
// that. So: section headings and item titles only, item descriptions dropped,
// and the long Shipped/Done lists capped. The full detail always lives in the
// repo files, which is what the "…and more" line points at.
//
// This is a deliberately faithful port — the rendering it produces is
// byte-for-byte what the awk produced, including the leading blank line and the
// quirk that a `**Just shipped**` sub-heading does NOT start a capped section.
// Changing what Discord shows is a separate decision from moving the code.

/** Discord's hard cap on an embed description. */
export const DISCORD_DESCRIPTION_LIMIT = 4096

/** How many items of a Shipped/Done section are listed before the "…and more" line. */
export const SHIPPED_ITEM_CAP = 10

/** The line that stands in for the rest of a capped Shipped/Done section. */
export const MORE_LINE = '• …and more — see the repo'

// A heading names a "finished work" section, whose items get capped.
const FINISHED_SECTION = /Shipped|Done/

// `- [ ] `, `- [x] ` or `- [X] ` at the start of a line.
const CHECKBOX = /^- \[[xX ]\] /
const UNCHECKED = /^- \[ \] /

/**
 * Cut `text` down to something Discord will certainly accept.
 *
 * The shell original used bash's `${var:0:4096}`, whose unit depends on the
 * runner's locale — characters under `C.UTF-8`, bytes under plain `C`. That is
 * not a rule anyone can reason about, and it is why this is now explicit.
 *
 * The cap is applied in UTF-16 code units (`.length`), which is the
 * conservative reading: an emoji costs 2 there and 1 as a code point, so a
 * string that fits this limit fits Discord's under either interpretation of
 * "4096 characters". A trailing lone high surrogate — half of an emoji the cut
 * landed inside — is dropped rather than sent, because Discord rejects it.
 *
 * Both documents are several times over the limit today, so this cut is load-
 * bearing, not theoretical.
 */
export function truncateForDiscord(text, limit = DISCORD_DESCRIPTION_LIMIT) {
  if (!Number.isFinite(limit) || text.length <= limit) return text
  const cut = text.slice(0, limit)
  const last = cut.charCodeAt(cut.length - 1)
  // 0xD800–0xDBFF is a high surrogate; if it is the final unit its pair was cut.
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

/**
 * Render one document to a Discord embed description.
 *
 * Returns '' when the document produces nothing renderable — a shape change
 * (no `## ` headings, or a leading `---`) rather than a document that is
 * genuinely empty. The caller treats that as an error, not as a no-op.
 */
export function renderCondensed(markdown, limit = DISCORD_DESCRIPTION_LIMIT) {
  const out = []
  let started = false
  let inFinishedSection = false
  let shippedCount = 0

  for (const line of String(markdown).split('\n')) {
    // A horizontal rule ends the document as far as Discord is concerned —
    // everything below it is the footer/appendix of both files.
    if (line.startsWith('---')) break

    if (line.startsWith('## ')) {
      const heading = line.slice(3)
      started = true
      inFinishedSection = FINISHED_SECTION.test(heading)
      shippedCount = 0
      out.push('\n**' + heading + '**')
      continue
    }

    // Everything before the first `## ` — the H1, the intro, the pull quote —
    // is chrome that the channel already provides.
    if (!started) continue

    // A bold sub-heading ("**Just shipped**") is kept, underlined. Note it does
    // NOT open a capped section: items under it are the most recent work and
    // are the point of the channel.
    if (line.startsWith('**')) {
      out.push('\n__' + line + '__')
      continue
    }

    if (CHECKBOX.test(line)) {
      let item = UNCHECKED.test(line)
        ? line.replace(UNCHECKED, '• ')
        : line.replace(CHECKBOX, '✅ ')
      // Drop the explanation, keep the title. This is why ROADMAP.md items are
      // written "**Title.** — description": the em-dash is the cut point.
      item = item.replace(/ — [\s\S]*$/, '')
      item = item.replace(/ \*\(new\)\*/, '')

      if (inFinishedSection) {
        shippedCount += 1
        if (shippedCount <= SHIPPED_ITEM_CAP) out.push(item)
        else if (shippedCount === SHIPPED_ITEM_CAP + 1) out.push(MORE_LINE)
        continue
      }
      out.push(item)
      continue
    }

    // Prose, blank lines, block quotes, non-checkbox bullets: dropped.
  }

  // Each `print` in the original emitted a trailing newline, and command
  // substitution then stripped the trailing ones. Reproduce both.
  const text = out.map(l => l + '\n').join('').replace(/\n+$/, '')
  return truncateForDiscord(text, limit)
}
