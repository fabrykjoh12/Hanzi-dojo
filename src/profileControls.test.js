import { describe, it, expect } from 'vitest'
import { controlGroups, resetRow, cardsPerDay, CONTROL_ROW_MIN_HEIGHT } from './profileControls'

const flat = (groups) => groups.flatMap(g => g.rows)
const keys = (groups) => flat(groups).map(r => r.key)

describe('cardsPerDay', () => {
  it('stays short enough to share a 320px row with its label', () => {
    expect(cardsPerDay(10)).toBe('10 a day')
    expect(cardsPerDay(10).length).toBeLessThanOrEqual(10)
  })

  it('copes with a missing or junk value instead of printing NaN', () => {
    for (const bad of [null, undefined, '', 'nope', -4]) {
      expect(cardsPerDay(bad)).toBe('0 a day')
    }
    expect(cardsPerDay('15')).toBe('15 a day')
  })
})

describe('controlGroups', () => {
  const groups = controlGroups({ dailyNewCards: 10, resetLanguageName: 'Chinese' })

  it('keeps every control the four old panels had', () => {
    // Nothing was dropped in the collapse — this is the whole point.
    expect(keys(groups)).toEqual(['goal', 'signout', 'reset', 'delete'])
  })

  it('puts the erasing ones together, in their own group', () => {
    const danger = groups.find(g => g.tone === 'danger')
    expect(danger.rows.map(r => r.key)).toEqual(['reset', 'delete'])
    expect(groups.filter(g => g.tone === 'danger')).toHaveLength(1)
  })

  it('names what the reset actually clears, in the label', () => {
    // "Reset a language" is the wording of a product that offers several. This
    // one publicly offers Chinese, and the label has to describe the real
    // consequence — so it names it, and the value beside it stops repeating it.
    const reset = flat(groups).find(r => r.key === 'reset')
    expect(reset.label).toBe('Reset Chinese progress')
    expect(reset.value).toBe('')
    expect(reset.label).not.toMatch(/a language/i)
  })

  it('shows the goal without opening anything', () => {
    expect(flat(groups).find(r => r.key === 'goal').value).toBe('10 a day')
  })

  it('goes generic only for an account with more than one track', () => {
    // Staff accounts hold a paused track or two; there the row cannot name one
    // language, so it names none and the value says which is selected.
    const many = resetRow({ resetLanguageName: 'Chinese', trackCount: 2 })
    expect(many.label).toBe('Reset progress')
    expect(many.value).toBe('Chinese')
  })

  it('never prints "undefined progress" when the language is unknown', () => {
    expect(resetRow().label).toBe('Reset progress')
    expect(resetRow({ trackCount: 1 }).label).toBe('Reset progress')
    expect(resetRow({ resetLanguageName: '', trackCount: 1 }).value).toBe('')
  })

  it('marks Sign out as the one row that acts rather than expands', () => {
    const rows = flat(groups)
    expect(rows.find(r => r.key === 'signout').expands).toBe(false)
    expect(rows.filter(r => r.expands !== false).map(r => r.key))
      .toEqual(['goal', 'reset', 'delete'])
  })

  it('gives every group a heading, so each can be an h2', () => {
    for (const g of groups) expect(g.heading).toBeTruthy()
  })

  it('gives every row a distinct key and a label', () => {
    const rows = flat(groups)
    expect(new Set(rows.map(r => r.key)).size).toBe(rows.length)
    for (const r of rows) expect(r.label).toBeTruthy()
  })
})

describe('controlGroups — removing a paused language', () => {
  it('offers no Remove row when there is nothing to remove', () => {
    expect(keys(controlGroups({ removableCount: 0 }))).not.toContain('remove')
  })

  it('offers it, counted, once a droppable track exists', () => {
    const one = flat(controlGroups({ removableCount: 1 })).find(r => r.key === 'remove')
    expect(one.value).toBe('1 track')
    const two = flat(controlGroups({ removableCount: 2 })).find(r => r.key === 'remove')
    expect(two.value).toBe('2 tracks')
  })

  it('keeps Delete account last, below Remove', () => {
    const danger = controlGroups({ removableCount: 1 }).find(g => g.tone === 'danger')
    expect(danger.rows.map(r => r.key)).toEqual(['reset', 'remove', 'delete'])
  })
})

describe('controlGroups — called with nothing', () => {
  it('still returns a usable screen', () => {
    const groups = controlGroups()
    expect(keys(groups)).toEqual(['goal', 'signout', 'reset', 'delete'])
    expect(flat(groups).find(r => r.key === 'reset').label).toBe('Reset progress')
  })
})

describe('the row height', () => {
  it('clears the 44px tap-target floor on its own', () => {
    expect(CONTROL_ROW_MIN_HEIGHT).toBeGreaterThanOrEqual(44)
  })
})
