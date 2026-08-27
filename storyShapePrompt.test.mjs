import { describe, it, expect } from 'vitest'
import { storyShapePrompt } from './storyGenPrompts.mjs'

// The planner bakeoff returned six candidates that were six paraphrases of one
// job-offer deliberation, and every one of them was lexically infeasible. The
// audit traced it to two things in this prompt, and neither was the vocabulary:
// the theme was printed as a bare requirement (with a worked example that acted
// as a template), and the concreteness rule named only specialist CONCRETE
// nouns — tools, machinery, food — while the words that actually broke the
// plans were abstractions: advice, choice, options, guidance, pros and cons.
const manifest = {
  language: 'chinese',
  system: 'hsk_3',
  level: 3,
  speakers: ['李明', '小红', '小明'],
  targets: [{ word: '如果' }, { word: '需要' }, { word: '认为' }],
  theme: 'A friend asking for advice on a conditional life choice, such as whether to accept a new job.',
}
const prompt = storyShapePrompt({ manifest, meanings: { 如果: 'if' }, totalLines: 26 })

describe('storyShapePrompt — the theme is a suggestion, not a template', () => {
  it('offers the theme as a starting point the planner may abandon', () => {
    expect(prompt).toMatch(/Starting point \(a suggestion, not a requirement\)/)
    expect(prompt).toContain(manifest.theme)
    expect(prompt).toMatch(/tell a DIFFERENT, simpler story with the same required words/)
    // The old wording. A bare "Theme:" line reads as a constraint, and six of
    // six candidates treated it as one.
    expect(prompt).not.toMatch(/\nTheme: /)
  })

  it('names abstract nouns as unsayable, not only specialist concrete ones', () => {
    for (const word of ['advice', 'a choice', 'options', 'guidance', 'pros and cons', 'an offer', 'details']) {
      expect(prompt, word).toContain(word)
    }
    expect(prompt).toMatch(/ABSTRACT NOUN cannot be said at this level/)
  })

  it('keeps grammar and thinking words legitimate inside a concrete scene', () => {
    // 如果 / 需要 / 认为 cost nothing. A rule that scared the planner off them
    // would break the targets it exists to teach.
    expect(prompt).toMatch(/NEED an umbrella/)
    expect(prompt).toMatch(/not a reason to make the scene itself abstract/)
  })

  it('requires every beat to contain something photographable', () => {
    expect(prompt).toMatch(/could photograph/)
    expect(prompt).toMatch(/only discuss, weigh, consider or decide/)
  })

  it('still keeps the closed cast and the transition contract', () => {
    expect(prompt).toMatch(/CAST IS CLOSED/)
    expect(prompt).toMatch(/transition_from_previous/)
    expect(prompt).toMatch(/same_place/)
  })

  it('says nothing about themes when the manifest has none', () => {
    const bare = storyShapePrompt({ manifest: { ...manifest, theme: null }, totalLines: 26 })
    expect(bare).not.toMatch(/Starting point/)
    expect(bare).toMatch(/ABSTRACT NOUN/)
  })
})

describe('storyShapePrompt — premise diversity is a prompt input, not luck', () => {
  it('carries a divergence constraint naming what is already used', () => {
    const p = storyShapePrompt({
      manifest, totalLines: 26,
      variation: 'Other planners have already used these situations: a job offer. Find a DIFFERENT everyday situation.',
    })
    expect(p).toMatch(/already used these situations/)
    expect(p).toMatch(/Find a DIFFERENT everyday situation/)
  })

  it('omits it entirely for the first attempt', () => {
    expect(storyShapePrompt({ manifest, totalLines: 26 })).not.toMatch(/already used/)
  })
})
