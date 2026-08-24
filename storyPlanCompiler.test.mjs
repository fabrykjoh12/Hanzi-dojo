import { describe, it, expect } from 'vitest'
import {
  isTravel, destinationOf, splitWhere, travelClause,
  compileBeat, compilePlan, compileChanges,
} from './storyPlanCompiler.mjs'

describe('isTravel — a movement verb is not enough', () => {
  it('accepts travel with a direction', () => {
    expect(isTravel('they carry it down the stairs')).toBe(true)
    expect(isTravel('李明 walks from his apartment down the hallway')).toBe(true)
  })

  it('rejects moving an object in place', () => {
    expect(isTravel('小红 needs to move a heavy table')).toBe(false)
    expect(isTravel('they lift the table together')).toBe(false)
  })

  it('accepts a clause naming the destination even without a direction word', () => {
    expect(isTravel('小红 reaches the lobby', 'Lobby')).toBe(true)
  })
})

describe('destinationOf — only a place counts', () => {
  it('reads a real destination', () => {
    expect(destinationOf('then she walks to 李明的 apartment')).toBe('李明的 apartment')
    expect(destinationOf('they go into the kitchen')).toBe('the kitchen')
  })

  it('refuses a purpose clause', () => {
    expect(destinationOf('he steps out to think')).toBeNull()
    expect(destinationOf('she comes to help')).toBeNull()
  })
})

describe('splitWhere — a place, and how they got there', () => {
  // All three verbatim from planner-bakeoff-1t's gpt-oss plans.
  it('splits a place that carries the journey with it', () => {
    const r = splitWhere('小红 kitchen, then she walks to 李明 apartment')
    expect(r.place).toBe('李明 apartment')
    expect(r.transition).toMatch(/walks to/)
  })

  it('drops a state clause and keeps the place', () => {
    expect(splitWhere('Living room, now the table is in place').place).toBe('Living room')
  })

  it('keeps the place when the parenthetical is a purpose, not a destination', () => {
    const r = splitWhere('Li Ming balcony (he steps out to think)')
    expect(r.place).toBe('Li Ming balcony')
    expect(r.transition).toMatch(/steps out/)
  })

  it('leaves a plain place alone', () => {
    expect(splitWhere('Stairwell')).toEqual({ place: 'Stairwell', transition: null })
  })
})

describe('compileBeat — arrivals the plan already explained', () => {
  const prev = { where: 'Living room', what: 'They lift the table together and carry it down the stairs' }

  it('takes the arrival from the previous beat that narrated the journey', () => {
    const r = compileBeat({ where: 'Stairwell', what: 'They rest halfway', when: 'Morning', because: 'because the table is heavy' }, prev, 1)
    expect(r.beat.arrivedHow).toMatch(/carry it down the stairs/)
    expect(r.derived.find(d => d.field === 'arrivedHow').from).toBe('previous beat')
    expect(r.misses).toHaveLength(0)
  })

  it('prefers the beat’s own words over the previous beat’s', () => {
    const r = compileBeat({ where: 'Lobby', what: 'They walk into the lobby and set it down', when: 'Morning', because: 'because they reached the bottom' }, prev, 1)
    expect(r.beat.arrivedHow).toMatch(/walk into the lobby/)
    expect(r.derived.find(d => d.field === 'arrivedHow').from).toBe('what')
  })

  it('reports a miss instead of inventing an arrival', () => {
    const r = compileBeat({ where: 'The park', what: 'They eat lunch', when: 'Noon', because: 'because they are hungry' }, prev, 1)
    expect(r.beat.arrivedHow).toBeUndefined()
    expect(r.misses).toEqual([{ beat: 2, field: 'arrivedHow', reason: expect.stringContaining('The park') }])
  })

  it('never overwrites an arrival the plan supplied', () => {
    const r = compileBeat({ where: 'Stairwell', arrivedHow: 'they take the stairs down', what: 'x', when: 'Morning', because: 'because y' }, prev, 1)
    expect(r.beat.arrivedHow).toBe('they take the stairs down')
    expect(r.derived.filter(d => d.field === 'arrivedHow')).toHaveLength(0)
  })

  it('asks nothing of the first beat', () => {
    const r = compileBeat({ where: 'Living room', what: 'x', when: 'Morning' }, null, 0)
    expect(r.misses).toHaveLength(0)
  })
})

describe('compilePlan — the compiler cannot rewrite the story', () => {
  const plan = {
    title: 'Helping a Neighbor Move a Table',
    setting: 'An apartment building',
    cast: ['李明', '小红'],
    problem: 'the table is too heavy for one person',
    incitingEvent: 'she cannot lift it',
    resolution: 'they move it together',
    beats: [
      { id: 1, when: 'Morning', where: 'Living room', what: 'She looks at the table', because: 'the story opens', arrivedHow: '', targets: ['需要'], lines: 6 },
      { id: 2, when: 'Morning', where: 'Stairwell', what: 'They lift the table and carry it down the stairs', because: 'because he agreed to help', arrivedHow: '', targets: [], lines: 6 },
    ],
    targetPlan: [{ word: '需要', beat: 1, why: 'she says she needs help', speaker: '小红', refersTo: 'help', intent: 'state her need' }],
  }

  it('fills the arrival and changes nothing semantic', () => {
    const r = compilePlan(plan)
    expect(r.blueprint.beats[1].arrivedHow).toMatch(/carry it down the stairs/)
    expect(r.misses).toHaveLength(0)
    expect(compileChanges(plan, r.blueprint)).toEqual([])
  })

  it('is a no-op on a plan that already fills the schema', () => {
    const complete = { ...plan, beats: plan.beats.map((b, i) => ({ ...b, arrivedHow: i ? 'they walk down' : '' })) }
    const r = compilePlan(complete)
    expect(r.derived).toHaveLength(0)
    expect(r.blueprint).toEqual(complete)
  })

  it('refuses a plan that is not an object', () => {
    expect(compilePlan(null).blueprint).toBeNull()
  })
})

describe('compileChanges — the guard that keeps the compiler honest', () => {
  it('catches a rewritten beat', () => {
    const a = { beats: [{ what: 'she looks at the table' }] }
    const b = { beats: [{ what: 'she stares at the enormous table' }] }
    expect(compileChanges(a, b)).toContain('beats[1].what')
  })

  it('catches a rewritten resolution', () => {
    expect(compileChanges({ resolution: 'a' }, { resolution: 'b' })).toContain('resolution')
  })
})
