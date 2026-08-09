import { describe, it, expect } from 'vitest'
import {
  initialNavState, selectTab, push, pop, present, dismiss, makeEntry,
} from './navStack'
import { transitionFor, motionPlan, layerFor, selectorFor, MOTION } from './navMotion'

const home = initialNavState()

function transformOf(plan) {
  return plan.keyframes[0].transform
}

describe('transitionFor', () => {
  it('says nothing happened when the state is unchanged', () => {
    expect(transitionFor(home, home)).toBe('none')
    expect(transitionFor(null, home)).toBe('none')
    expect(transitionFor(home, null)).toBe('none')
  })

  it('names a push when a tab stack grows', () => {
    const practice = selectTab(home, 'practice')
    expect(transitionFor(practice, push(practice, makeEntry('words')))).toBe('push')
  })

  it('names a pop when it shrinks again', () => {
    const deep = push(selectTab(home, 'practice'), makeEntry('words'))
    expect(transitionFor(deep, pop(deep))).toBe('pop')
  })

  it('names a tab change, not a push, when the learner changes tab', () => {
    expect(transitionFor(home, selectTab(home, 'stories'))).toBe('tab')
  })

  it('names present and dismiss for a flow above the shell', () => {
    const flow = present(home, makeEntry('test'), 'fullscreen')
    expect(transitionFor(home, flow)).toBe('present')
    expect(transitionFor(flow, dismiss(flow))).toBe('dismiss')
  })

  it('treats depth inside the account overlay as push and pop', () => {
    const profile = present(home, makeEntry('profile'), 'account')
    const settings = push(profile, makeEntry('settings'))
    expect(transitionFor(profile, settings)).toBe('push')
    expect(transitionFor(settings, pop(settings))).toBe('pop')
  })

  it('treats one flow replacing another as a fresh presentation', () => {
    const test = present(home, makeEntry('test'), 'fullscreen')
    const writing = present(test, makeEntry('writing'), 'fullscreen')
    expect(transitionFor(test, writing)).toBe('present')
  })

  it('does not animate a change that leaves the hierarchy where it was', () => {
    const flow = present(home, makeEntry('reader', { id: 'a' }), 'fullscreen')
    const same = present(flow, makeEntry('reader', { id: 'b' }), 'fullscreen')
    expect(transitionFor(flow, same)).toBe('none')
  })
})

describe('motionPlan', () => {
  it('gives a pushed screen a forward slide and its pop the reverse', () => {
    const practice = selectTab(home, 'practice')
    const deep = push(practice, makeEntry('words'))
    const forward = motionPlan(practice, deep)
    const back = motionPlan(deep, pop(deep))
    expect(forward.kind).toBe('push')
    expect(transformOf(forward)).toBe(MOTION.push.transform)
    expect(back.kind).toBe('pop')
    expect(transformOf(back)).toBe(MOTION.pop.transform)
    // The two directions are opposites, which is the whole point of the pair.
    expect(transformOf(forward).indexOf('-')).toBe(-1)
    expect(transformOf(back).indexOf('-')).not.toBe(-1)
  })

  it('never slides a tab change — tabs are peers, not stack pages', () => {
    const plan = motionPlan(home, selectTab(home, 'stories'))
    expect(plan.kind).toBe('tab')
    expect(plan.keyframes[0].transform).toBeUndefined()
    expect(plan.keyframes[1].transform).toBeUndefined()
    expect(plan.keyframes[0].opacity).toBeGreaterThan(0)
  })

  it('gives a fullscreen flow a rise, distinct from a push', () => {
    const plan = motionPlan(home, present(home, makeEntry('test'), 'fullscreen'))
    expect(plan.kind).toBe('present')
    expect(transformOf(plan)).toBe(MOTION.present.transform)
    expect(transformOf(plan)).not.toBe(MOTION.push.transform)
  })

  it('does not move anything when a flow is dismissed', () => {
    const flow = present(home, makeEntry('test'), 'fullscreen')
    const plan = motionPlan(flow, dismiss(flow))
    expect(plan.kind).toBe('dismiss')
    expect(plan.keyframes[0].transform).toBeUndefined()
  })

  it('respects reduced motion by not animating at all', () => {
    const practice = selectTab(home, 'practice')
    const deep = push(practice, makeEntry('words'))
    expect(motionPlan(practice, deep, { reducedMotion: true })).toBe(null)
    expect(motionPlan(home, selectTab(home, 'stories'), { reducedMotion: true })).toBe(null)
    expect(motionPlan(home, present(home, makeEntry('test')), { reducedMotion: true })).toBe(null)
  })

  it('returns nothing when nothing moved', () => {
    expect(motionPlan(home, home)).toBe(null)
  })

  it('never transforms the reader — a transform re-anchors its fixed bars', () => {
    const stories = selectTab(home, 'stories')
    const reading = present(stories, makeEntry('reader', { id: 'x' }), 'fullscreen')
    const plan = motionPlan(stories, reading)
    expect(plan.kind).toBe('present')
    expect(plan.keyframes[0].transform).toBeUndefined()
    // It still animates; it just does not move.
    expect(plan.keyframes[0].opacity).toBe(MOTION.present.opacity)
  })

  it('leaves the element with its own styles when it finishes', () => {
    const plan = motionPlan(home, selectTab(home, 'practice'))
    expect(plan.options.fill).toBe('none')
    expect(plan.options.duration).toBe(MOTION.tab.duration)
  })
})

describe('layerFor / selectorFor', () => {
  it('targets the tab root when a root is on top', () => {
    const stories = selectTab(home, 'stories')
    expect(layerFor(stories)).toBe('tab')
    expect(selectorFor(stories)).toBe('[data-tab-root="stories"]')
  })

  it('targets the overlay when a flow or a pushed screen is on top', () => {
    const flow = present(home, makeEntry('test'), 'fullscreen')
    expect(layerFor(flow)).toBe('overlay')
    expect(selectorFor(flow)).toBe('[data-nav-layer="overlay"]')
  })

  it('targets the tab root for a screen the root still renders itself', () => {
    // series and reader live inside Stories.jsx (navShell.INLINE_VIEWS), so the
    // layer that changes is the pane, not a sibling overlay.
    const stories = selectTab(home, 'stories')
    const series = push(stories, makeEntry('series', { key: 'k' }))
    expect(layerFor(series)).toBe('tab')
    expect(selectorFor(series)).toBe('[data-tab-root="stories"]')
  })
})
