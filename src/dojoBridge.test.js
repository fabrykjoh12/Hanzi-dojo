import { describe, expect, it } from 'vitest'
import { buildClaudePrompt, parseManagedState, renderManagedSection, replaceManagedSection } from '../tools/dojo-bridge.mjs'

const items = [
  {
    id: 'task-1',
    title: 'Bygg roadmap-bro',
    description: 'Koble HQ til Markdown.',
    item_type: 'implement',
    status: 'progress',
    priority: 'high',
    assigned_to: 'local-user',
    due_date: '2026-07-25',
    tags: ['hq', 'claude'],
  },
  {
    id: 'task-2',
    title: 'Test flyten',
    item_type: 'test',
    status: 'done',
    priority: 'medium',
    tags: [],
  },
]

describe('Dojo roadmap bridge', () => {
  it('renders stable item ids and readable metadata', () => {
    const section = renderManagedSection(items, [{ user_id: 'local-user', display_name: 'Fabian' }])
    expect(section).toContain('**Bygg roadmap-bro** · Implementer · Høy · @Fabian')
    expect(section).toContain('<!-- dojo:task-1 -->')
    expect(section).toContain('- [x] **Test flyten**')
  })

  it('replaces only the managed roadmap block', () => {
    const original = '# Roadmap\n\nKeep this introduction.\n'
    const first = replaceManagedSection(original, renderManagedSection(items))
    const second = replaceManagedSection(first, renderManagedSection(items.slice(0, 1)))
    expect(second).toContain('Keep this introduction.')
    expect(second.match(/DOJO-HQ:START/g)).toHaveLength(1)
    expect(second).not.toContain('task-2')
  })

  it('reads completed checkboxes back into HQ ids', () => {
    const markdown = replaceManagedSection('# Roadmap', renderManagedSection(items))
    expect(parseManagedState(markdown)).toEqual({
      found: true,
      completedIds: ['task-2'],
      openIds: ['task-1'],
    })
  })

  it('embeds README.md as required Claude context', () => {
    const prompt = buildClaudePrompt(items[0], 'ROADMAP.md', {
      found: true,
      content: '# Hanzi Dojo\n\nAlways run the focused tests.',
      truncated: false,
    })
    expect(prompt).toContain('## README.md project context')
    expect(prompt).toContain('# Hanzi Dojo')
    expect(prompt).toContain('Always run the focused tests.')
    expect(prompt).toContain('Use the embedded README.md context')
  })
})
