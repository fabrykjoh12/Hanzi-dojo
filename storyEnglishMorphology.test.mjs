import { describe, it, expect } from 'vitest'
import { lemma, derivations, IRREGULAR, MORPH_VERSION } from './storyEnglishMorphology.mjs'

describe('lemma — irregular families, not one reproduced case', () => {
  it('handles ablaut verbs', () => {
    for (const [form, want] of [['gave', 'give'], ['took', 'take'], ['ate', 'eat'], ['drank', 'drink'],
      ['rose', 'rise'], ['spoke', 'speak'], ['wrote', 'write'], ['began', 'begin'], ['sang', 'sing']]) {
      expect(lemma(form), form).toBe(want)
    }
  })

  it('handles the -ought / -aught family', () => {
    for (const [form, want] of [['bought', 'buy'], ['brought', 'bring'], ['thought', 'think'],
      ['taught', 'teach'], ['caught', 'catch'], ['sought', 'seek'], ['fought', 'fight']]) {
      expect(lemma(form), form).toBe(want)
    }
  })

  it('handles -t / -d suppletion and no-change verbs', () => {
    for (const [form, want] of [['heard', 'hear'], ['left', 'leave'], ['felt', 'feel'], ['kept', 'keep'],
      ['told', 'tell'], ['sold', 'sell'], ['paid', 'pay'], ['put', 'put'], ['cost', 'cost'], ['hit', 'hit']]) {
      expect(lemma(form), form).toBe(want)
    }
  })

  it('handles irregular plurals', () => {
    for (const [form, want] of [['children', 'child'], ['men', 'man'], ['women', 'woman'],
      ['people', 'person'], ['feet', 'foot'], ['teeth', 'tooth'], ['lives', 'life'], ['knives', 'knife']]) {
      expect(lemma(form), form).toBe(want)
    }
  })

  it('still handles ordinary inflection', () => {
    for (const [form, want] of [['tries', 'try'], ['carried', 'carry'], ['running', 'run'],
      ['walked', 'walk'], ['boxes', 'box'], ['wishes', 'wish'], ['helps', 'help'], ['stopped', 'stop']]) {
      expect(lemma(form), form).toBe(want)
    }
  })

  it('leaves a base form and a real -ss word alone', () => {
    for (const w of ['give', 'child', 'glass', 'class', 'help']) expect(lemma(w)).toBe(w)
    expect(IRREGULAR.get('went')).toBe('go')
    expect(MORPH_VERSION).toBe('fab9-morph@1')
  })
})

describe('derivations — a suffix rule states what its base must be', () => {
  it('proposes the right base for real derivations', () => {
    expect(derivations('helpful').map(d => d.base)).toContain('help')
    expect(derivations('movement').map(d => d.base)).toContain('move')
    expect(derivations('teacher').map(d => d.base)).toContain('teach')
    expect(derivations('suggestion').map(d => d.base)).toContain('suggest')
    expect(derivations('happiness').map(d => d.base)).toContain('happy')
  })

  it('says which derivations need a VERB base — the guard against coincidence', () => {
    // corner would derive from corn only if corn were a verb; it is a noun,
    // so the caller rejects it.
    expect(derivations('corner').find(d => d.base === 'corn').expects).toBe('verb')
    expect(derivations('teacher').find(d => d.base === 'teach').expects).toBe('verb')
    expect(derivations('helpful').find(d => d.base === 'help').expects).toBe('any')
  })

  it('refuses a base too short to be one', () => {
    expect(derivations('very').map(d => d.base)).not.toContain('ver')
    // A candidate that is not a word is harmless — nothing to match — but the
    // real base must never be proposed from a stem this short.
    expect(derivations('only').map(d => d.base)).not.toContain('onl')
  })
})
