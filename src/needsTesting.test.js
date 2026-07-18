import { describe, it, expect } from 'vitest'
import { parseTestingItems } from '../scripts/needs-testing-discord.mjs'

const md = `# Needs testing

## 🧪 Now
- [ ] \`speaking\` **Speaking drill** — read a word aloud on Android; scores ✓?
- [x] \`chinese-tts\` **Chinese TTS** — 长/行/银行 sound right after a refresh
- [ ] \`plain\` a bare item with no bold title
not a checklist line
- [ ] \`nobody\` **Title only**
`

describe('parseTestingItems', () => {
  it('parses id, checked state, title, and body', () => {
    const items = parseTestingItems(md)
    expect(items.length).toBe(4)

    expect(items[0]).toEqual({ id: 'speaking', checked: false, title: 'Speaking drill', body: 'read a word aloud on Android; scores ✓?' })
    expect(items[1].id).toBe('chinese-tts')
    expect(items[1].checked).toBe(true)
    expect(items[1].title).toBe('Chinese TTS')
  })

  it('handles a bare item (no bold title)', () => {
    const items = parseTestingItems(md)
    const plain = items.find(i => i.id === 'plain')
    expect(plain.title).toBe('a bare item with no bold title')
    expect(plain.body).toBe('')
  })

  it('handles a title with no body', () => {
    const items = parseTestingItems(md)
    const t = items.find(i => i.id === 'nobody')
    expect(t.title).toBe('Title only')
    expect(t.body).toBe('')
  })

  it('ignores non-checklist lines', () => {
    expect(parseTestingItems('just prose\n# heading').length).toBe(0)
  })
})
