import { describe, it, expect } from 'vitest'
import {
  readTransition, readLocation, movedFrom, checkTransitions, adaptShape, adapterLostSomething,
  droppedTransitions, SAME_PLACE,
} from './storySemanticShape.mjs'
import { validateBlueprint } from './storyBlueprint.mjs'

const beat = (n, location, transition, extra = {}) => ({
  id: n, when: 'Morning', location, transition_from_previous: transition,
  what: 'something changes in beat ' + n, because: n === 1 ? 'the story opens' : 'because of beat ' + (n - 1),
  targets: [], lines: 5, ...extra,
})

describe('reading the contract fields', () => {
  it('accepts the field however the model cased it', () => {
    expect(readTransition({ transitionFromPrevious: 'they walk out' }).value).toBe('they walk out')
    expect(readTransition({ transition_from_previous: SAME_PLACE }).key).toBe('transition_from_previous')
  })

  it('refuses to read the old contract’s key', () => {
    // Honouring arrivedHow would hide whether the planner adopted the new
    // contract, which is the entire question the experiment asks.
    expect(readTransition({ arrivedHow: 'they walk downstairs' }).value).toBe('')
  })

  it('takes the location from either key', () => {
    expect(readLocation({ where: 'the kitchen' }).value).toBe('the kitchen')
    expect(readLocation({ location: 'the roof' }).key).toBe('location')
  })
})

describe('movedFrom — the validator’s own reading of a move', () => {
  it('is not a move when the place is described twice', () => {
    expect(movedFrom('Hallway outside the door', 'The hallway')).toBe(false)
  })

  it('is a move between real places', () => {
    expect(movedFrom('Living room', 'Courtyard')).toBe(true)
  })
})

describe('checkTransitions — the planner must decide', () => {
  it('accepts a plan that states every move', () => {
    const r = checkTransitions({ beats: [
      beat(1, 'Apartment', SAME_PLACE),
      beat(2, 'Apartment', SAME_PLACE),
      beat(3, 'Courtyard', 'Li Ming and Xiao Hong walk downstairs together'),
    ] })
    expect(r.ok).toBe(true)
    expect(r).toMatchObject({ stated: 1, required: 1 })
  })

  it('rejects a move with no transition', () => {
    const r = checkTransitions({ beats: [beat(1, 'Apartment', SAME_PLACE), beat(2, 'Courtyard', '')] })
    expect(r.violations).toEqual([{ beat: 2, code: 'transition_missing', message: expect.stringContaining('Courtyard') }])
  })

  it('rejects a move the plan calls same_place', () => {
    const r = checkTransitions({ beats: [beat(1, 'Apartment', SAME_PLACE), beat(2, 'Courtyard', SAME_PLACE)] })
    expect(r.violations[0].code).toBe('transition_says_same_place')
  })

  it('rejects standing still while describing a walk', () => {
    const r = checkTransitions({ beats: [beat(1, 'Apartment', SAME_PLACE), beat(2, 'Apartment', 'they walk to the park')] })
    expect(r.violations[0].code).toBe('transition_contradicts_location')
  })

  it('allows movement inside one place, differently worded', () => {
    const r = checkTransitions({ beats: [beat(1, 'The hallway', SAME_PLACE), beat(2, 'The hallway by the door', 'she steps over to the door')] })
    expect(r.ok).toBe(true)
    expect(r.warnings[0].code).toBe('transition_within_place')
  })
})

describe('adaptShape — a rename, not a decision', () => {
  const shape = { beats: [
    beat(1, 'Apartment', SAME_PLACE),
    beat(2, 'Apartment', SAME_PLACE),
    beat(3, 'Courtyard', 'Li Ming and Xiao Hong walk downstairs together'),
  ] }

  it('copies the planner’s own words into arrivedHow', () => {
    const r = adaptShape(shape)
    expect(r.blueprint.beats[2].arrivedHow).toBe('Li Ming and Xiao Hong walk downstairs together')
    expect(r.blueprint.beats[2].where).toBe('Courtyard')
    expect(r.mapped).toEqual([{ beat: 3, from: 'transition_from_previous', to: 'arrivedHow' }])
  })

  it('turns same_place into no movement at all', () => {
    expect(adaptShape(shape).blueprint.beats[1].arrivedHow).toBe('')
  })

  it('leaves the contract fields behind', () => {
    const b = adaptShape(shape).blueprint.beats[2]
    expect(b.location).toBeUndefined()
    expect(b.transition_from_previous).toBeUndefined()
  })

  it('keeps a stated movement that samePlace would call one place', () => {
    // Verbatim from plan D: samePlace reads these two as the same place
    // because both contain "apartment", and the planner's own movement was
    // being thrown away because of it.
    const near = { beats: [
      beat(1, 'Apartment Building Hallway', SAME_PLACE),
      beat(2, '李明 Apartment', '李明 and 小红 walk together up the stairs to 李明 door'),
    ] }
    const r = adaptShape(near)
    expect(r.blueprint.beats[1].arrivedHow).toBe('李明 and 小红 walk together up the stairs to 李明 door')
    expect(droppedTransitions(near, r.blueprint)).toEqual([])
  })

  it('never writes an arrival the planner did not', () => {
    const r = adaptShape({ beats: [beat(1, 'Apartment', SAME_PLACE), beat(2, 'Courtyard', '')] })
    expect(r.blueprint.beats[1].arrivedHow).toBe('')
    expect(r.contract.ok).toBe(false)
  })
})

describe('losslessness — a contract-keeping plan cannot fail for movement', () => {
  const manifest = { id: 'x', level: 3, languageCode: 'zh', speakers: ['李明', '小红'], targets: [{ word: '帮助', min: 2 }] }
  const plan = {
    title: 'A heavy box', setting: 'An apartment building', cast: ['李明', '小红'],
    problem: 'the box is too heavy for one person', incitingEvent: '李明 finds the box',
    beats: [
      beat(1, 'Apartment', SAME_PLACE, { targets: ['帮助'] }),
      beat(2, 'Courtyard', '李明 and 小红 carry the box downstairs'),
      beat(3, 'The street', 'they walk out through the gate'),
      beat(4, 'The street', SAME_PLACE),
      beat(5, 'Apartment', 'they walk back upstairs together'),
    ],
    resolution: 'the box is moved and they are closer',
    targetPlan: [{ word: '帮助', beat: 1, why: '李明 asks for help with the box', speaker: '李明', refersTo: 'moving the box', intent: 'ask for help' }],
  }

  it('passes the movement check with nothing derived', () => {
    const { blueprint, contract } = adaptShape(plan)
    expect(contract.ok).toBe(true)
    const check = validateBlueprint(blueprint, { manifest, requiredTargets: ['帮助'] })
    expect(check.failures.map(f => f.code)).not.toContain('unexplained_move')
    expect(adapterLostSomething(contract, check.failures)).toBeNull()
  })

  it('catches a stated movement that never reached the blueprint', () => {
    const shape = { beats: [beat(1, 'Kitchen', SAME_PLACE), beat(2, 'Roof', 'they climb the stairs to the roof')] }
    const stripped = { beats: [{ where: 'Kitchen', arrivedHow: '' }, { where: 'Roof', arrivedHow: '' }] }
    expect(droppedTransitions(shape, stripped)).toEqual([{ beat: 2, transition: 'they climb the stairs to the roof' }])
  })

  it('reports adapter loss rather than blaming the planner', () => {
    expect(adapterLostSomething({ ok: true }, [{ code: 'unexplained_move', message: 'beat 3 moves' }])).toBe('beat 3 moves')
    expect(adapterLostSomething({ ok: false }, [{ code: 'unexplained_move', message: 'beat 3 moves' }])).toBeNull()
  })
})
