import { describe, it, expect } from 'vitest'
import {
  dictAddToast, isDictAddLimit,
  DICT_ADD_LIMIT_CODE, DICT_ADD_BUSY_CODE, DICT_ADD_RETRY_CODE,
} from './dictAddFeedback'

describe('dictAddToast', () => {
  it('tells the shared brake apart from the learner\'s own limit', () => {
    // The one that was wrong. Both raises used to carry PT429, so a learner
    // refused by the GLOBAL brake — who had added nothing at all that day —
    // was told "that's enough new words for today": a false statement about
    // their own behaviour, on a product whose copy is observational.
    const mine = dictAddToast({ code: DICT_ADD_LIMIT_CODE })
    const shared = dictAddToast({ code: DICT_ADD_BUSY_CODE })

    expect(mine.title).toBe('That’s enough new words for today')
    expect(shared.title).not.toBe(mine.title)
    expect(shared.body).toContain('isn’t about your words')
  })

  it('says a lost race is worth retrying now, not tomorrow', () => {
    // PT409 is raised when a concurrent insert of the same brand-new word wins
    // and this transaction cannot see it. Retrying works immediately — telling
    // the learner to come back tomorrow would be wrong in the other direction.
    const retry = dictAddToast({ code: DICT_ADD_RETRY_CODE })
    expect(retry.body).toMatch(/again/i)
    expect(retry.body).not.toMatch(/tomorrow/i)
  })

  it('still says something for a failure it does not recognise', () => {
    // A caller in a catch has something to report; silence was the old
    // behaviour on the Dictionary screen and it read as a dead button.
    for (const e of [null, undefined, new Error('network'), { code: 'PGRST202' }]) {
      expect(dictAddToast(e).title).toBe('Couldn’t save that word')
    }
  })

  it('marks a refusal as information and a failure as a warning', () => {
    // Toasts falls back to the achievement medal for an unknown kind, so an
    // untagged refusal arrives looking like a prize (CLAUDE.md §1).
    for (const code of [DICT_ADD_LIMIT_CODE, DICT_ADD_BUSY_CODE, DICT_ADD_RETRY_CODE]) {
      expect(dictAddToast({ code }).kind).toBe('info')
    }
    expect(dictAddToast(new Error('boom')).kind).toBe('warn')
  })

  it('carries the accent through, and defaults to none rather than a wrong one', () => {
    expect(dictAddToast({ code: DICT_ADD_LIMIT_CODE }, '#B83A24').accent).toBe('#B83A24')
    expect(dictAddToast(new Error('x')).accent).toBeNull()
  })

  it('uses the PT class, so PostgREST answers with the status and not a 500', () => {
    // Pins the declaration; this spec cannot observe an HTTP status.
    for (const code of [DICT_ADD_LIMIT_CODE, DICT_ADD_BUSY_CODE, DICT_ADD_RETRY_CODE]) {
      expect(code).toMatch(/^PT\d{3}$/)
    }
    expect(DICT_ADD_LIMIT_CODE).toBe('PT429')
    expect(DICT_ADD_BUSY_CODE).toBe('PT503')
    expect(DICT_ADD_RETRY_CODE).toBe('PT409')
  })
})

describe('isDictAddLimit', () => {
  it('matches the SQLSTATE, not the message', () => {
    expect(isDictAddLimit({ code: DICT_ADD_LIMIT_CODE, message: 'anything' })).toBe(true)
    expect(isDictAddLimit({ message: 'Dictionary add limit reached' })).toBe(false)
    expect(isDictAddLimit({ code: DICT_ADD_BUSY_CODE })).toBe(false)
    expect(isDictAddLimit(null)).toBe(false)
  })
})
