import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  renderCondensed,
  truncateForDiscord,
  DISCORD_DESCRIPTION_LIMIT,
  SHIPPED_ITEM_CAP,
  MORE_LINE,
} from './.github/scripts/roadmap-render.mjs'

// The renderer that produces the pinned #roadmap and #backlog messages.
//
// It was an inline awk program inside roadmap-live-sync.yml until this change,
// which meant the only way to test the one thing the community actually reads
// was to push a commit and look at Discord. These specs are the reason it moved.
//
// The port is deliberately faithful: with truncation disabled it produces
// byte-for-byte what the awk produced on both real documents. Where behaviour
// changed on purpose — the truncation unit — there is a spec saying so.

const ROADMAP = readFileSync('ROADMAP.md', 'utf8')
const BACKLOG = readFileSync('docs/BACKLOG.md', 'utf8')

describe('headings', () => {
  it('turns a "## " heading into a bold line, preceded by a blank one', () => {
    expect(renderCondensed('## 🚧 Now\n')).toBe('\n**🚧 Now**')
  })

  it('drops everything before the first heading', () => {
    const md = [
      '# 🗺️ Hanzi Dojo Roadmap',
      '',
      'The living plan for what is next.',
      '',
      '> A pull quote nobody needs in Discord.',
      '',
      '## 🚧 Now',
      '- [ ] **A thing.**',
    ].join('\n')
    expect(renderCondensed(md)).toBe('\n**🚧 Now**\n• **A thing.**')
  })

  it('keeps a bold sub-heading, underlined and preceded by a blank line', () => {
    const md = '## 🚧 Now\n**Just shipped**\n- [x] **Done.**'
    expect(renderCondensed(md)).toBe('\n**🚧 Now**\n\n__**Just shipped**__\n✅ **Done.**')
  })

  it('stops rendering at a horizontal rule', () => {
    const md = '## 🚧 Now\n- [ ] **Visible.**\n---\n## 🔜 Next\n- [ ] **Hidden.**'
    const out = renderCondensed(md)
    expect(out).toContain('Visible.')
    expect(out).not.toContain('Hidden.')
    expect(out).not.toContain('🔜 Next')
  })
})

describe('items', () => {
  it('renders open items with a bullet and completed ones with a check', () => {
    const md = '## 🚧 Now\n- [ ] **Open.**\n- [x] **Closed.**\n- [X] **Also closed.**'
    expect(renderCondensed(md)).toBe(
      '\n**🚧 Now**\n• **Open.**\n✅ **Closed.**\n✅ **Also closed.**',
    )
  })

  it('keeps the title and drops the em-dash description', () => {
    const md = '## 🚧 Now\n- [ ] **A title.** — a long explanation nobody reads in Discord.'
    expect(renderCondensed(md)).toBe('\n**🚧 Now**\n• **A title.**')
  })

  it('drops the "*(new)*" marker', () => {
    const md = '## 🚧 Now\n- [ ] **A title.** *(new)*'
    expect(renderCondensed(md)).toBe('\n**🚧 Now**\n• **A title.**')
  })

  it('ignores prose, blank lines, quotes and non-checkbox bullets', () => {
    const md = '## 🚧 Now\nSome prose.\n\n> A quote.\n- A plain bullet.\n- [ ] **Kept.**'
    expect(renderCondensed(md)).toBe('\n**🚧 Now**\n• **Kept.**')
  })
})

describe('Shipped/Done truncation', () => {
  const section = (heading, count) =>
    '## ' + heading + '\n' +
    Array.from({ length: count }, (_, i) => '- [x] **Item ' + (i + 1) + '.**').join('\n')

  it('lists the first ten items of a Shipped section', () => {
    const out = renderCondensed(section('✅ Shipped', SHIPPED_ITEM_CAP))
    expect(out).toContain('Item ' + SHIPPED_ITEM_CAP + '.')
    expect(out).not.toContain(MORE_LINE)
  })

  it('replaces the eleventh and everything after with one "and more" line', () => {
    const out = renderCondensed(section('✅ Shipped', 25))
    expect(out).toContain('Item 10.')
    expect(out).not.toContain('Item 11.')
    expect(out).not.toContain('Item 25.')
    expect(out.split('\n').filter(l => l === MORE_LINE)).toHaveLength(1)
  })

  it('caps a "Done" section the same way', () => {
    const out = renderCondensed(section('Done', 12))
    expect(out).toContain(MORE_LINE)
  })

  it('does not cap a section that is neither Shipped nor Done', () => {
    const out = renderCondensed(section('🚧 Now', 25))
    expect(out).toContain('Item 25.')
    expect(out).not.toContain(MORE_LINE)
  })

  it('resets the count at each heading', () => {
    const md = section('✅ Shipped', 12) + '\n' + section('Done', 3)
    const out = renderCondensed(md)
    expect(out.split('\n').filter(l => l === MORE_LINE)).toHaveLength(1)
  })

  it('does not cap items under a "**Just shipped**" sub-heading', () => {
    // A quirk of the original, kept on purpose: the sub-heading inside "Now"
    // does not open a capped section, and those are the items the channel is
    // most for. A cap here would hide the newest work.
    const md = '## 🚧 Now\n**Just shipped**\n' +
      Array.from({ length: 14 }, (_, i) => '- [x] **Fresh ' + (i + 1) + '.**').join('\n')
    const out = renderCondensed(md)
    expect(out).toContain('Fresh 14.')
    expect(out).not.toContain(MORE_LINE)
  })
})

describe('the Discord 4096-character limit', () => {
  it('never returns more than the limit', () => {
    const md = '## 🚧 Now\n' +
      Array.from({ length: 400 }, (_, i) => '- [ ] **Item ' + i + ' with a reasonably long title.**').join('\n')
    expect(renderCondensed(md).length).toBe(DISCORD_DESCRIPTION_LIMIT)
  })

  it('holds for both real documents, which are several times over it', () => {
    // If these ever fit, the cut below stopped being load-bearing and the
    // "…and more" line is doing the work instead. Both are far over today.
    expect(renderCondensed(ROADMAP).length).toBeLessThanOrEqual(DISCORD_DESCRIPTION_LIMIT)
    expect(renderCondensed(BACKLOG).length).toBeLessThanOrEqual(DISCORD_DESCRIPTION_LIMIT)
    expect(renderCondensed(ROADMAP, Infinity).length).toBeGreaterThan(DISCORD_DESCRIPTION_LIMIT)
    expect(renderCondensed(BACKLOG, Infinity).length).toBeGreaterThan(DISCORD_DESCRIPTION_LIMIT)
  })

  it('leaves a short document untouched', () => {
    expect(truncateForDiscord('short', DISCORD_DESCRIPTION_LIMIT)).toBe('short')
  })

  it('never cuts an emoji in half', () => {
    // The shell original used bash substring expansion, whose unit is the
    // runner's locale — characters or bytes depending on LANG. A cut that lands
    // inside a surrogate pair produces a lone surrogate, which Discord rejects.
    const text = 'a'.repeat(9) + '🥋'
    const cut = truncateForDiscord(text, 10)
    expect(cut).toBe('a'.repeat(9))
    expect(cut).not.toMatch(/[\uD800-\uDBFF]$/)
  })

  it('keeps a whole emoji that fits exactly', () => {
    expect(truncateForDiscord('a'.repeat(8) + '🥋', 10)).toBe('a'.repeat(8) + '🥋')
  })
})

describe('determinism and shape failures', () => {
  it('renders the same text twice — no clock, no randomness', () => {
    expect(renderCondensed(ROADMAP)).toBe(renderCondensed(ROADMAP))
    expect(renderCondensed(BACKLOG)).toBe(renderCondensed(BACKLOG))
  })

  it('returns empty for a document with no headings, so the caller can fail loudly', () => {
    expect(renderCondensed('')).toBe('')
    expect(renderCondensed('# Title\n\nJust prose, no sections.')).toBe('')
    expect(renderCondensed('---\n## 🚧 Now\n- [ ] **Unreachable.**')).toBe('')
  })

  it('produces something real for both live documents', () => {
    for (const doc of [renderCondensed(ROADMAP), renderCondensed(BACKLOG)]) {
      expect(doc.length).toBeGreaterThan(200)
      expect(doc).toMatch(/\*\*/)
    }
  })
})
