import { describe, it, expect } from 'vitest'
import { cardEntryToken, autoplayDecision } from './studyAutoplay'

// Reported from a device: leave an unfinished session, return to Cards, and the
// word from the card you had open spoke from behind the "Continue session"
// screen. The card was not on screen. These specs are the rule that stops it.

const CARD = { id: 'c1', vocab: { id: 'v1' } }
const OTHER = { id: 'c2', vocab: { id: 'v2' } }

describe('what counts as a card entry', () => {
  it('is the identity of the card that was revealed', () => {
    expect(cardEntryToken(CARD, true)).toBe('c1')
    expect(cardEntryToken(OTHER, true)).toBe('c2')
  })

  it('is nothing at all while the card is face down', () => {
    expect(cardEntryToken(CARD, false)).toBe(null)
  })

  it('falls back to the word when a card has no row of its own yet', () => {
    // A brand-new card is inserted on first grade, so it can reach the screen
    // without an id. It still has to be distinguishable from the next one.
    expect(cardEntryToken({ vocab: { id: 'v9' } }, true)).toBe('v9')
    expect(cardEntryToken({}, true)).toBe(null)
    expect(cardEntryToken(null, true)).toBe(null)
  })
})

describe('autoplay while the card is on screen', () => {
  const on = { presenting: true, enabled: true }

  it('speaks when a card is revealed', () => {
    expect(autoplayDecision({ ...on, card: CARD, flipped: true, lastToken: null }))
      .toEqual({ play: true, token: 'c1' })
  })

  it('says nothing for a card that is still face down', () => {
    expect(autoplayDecision({ ...on, card: CARD, flipped: false, lastToken: null }))
      .toEqual({ play: false, token: null })
  })

  it('does not repeat itself for the same reveal', () => {
    // This is the effect re-running — a re-render, a re-attachment — over a
    // reveal that already happened. Not a new card entry.
    expect(autoplayDecision({ ...on, card: CARD, flipped: true, lastToken: 'c1' }))
      .toEqual({ play: false, token: 'c1' })
  })

  it('speaks again for the next card', () => {
    expect(autoplayDecision({ ...on, card: OTHER, flipped: true, lastToken: 'c1' }))
      .toEqual({ play: true, token: 'c2' })
  })

  it('speaks for a card flipped back down and revealed again', () => {
    // An undo puts the previous card back, face down.
    const down = autoplayDecision({ ...on, card: CARD, flipped: false, lastToken: 'c1' })
    expect(down.token).toBe(null)
    expect(autoplayDecision({ ...on, card: CARD, flipped: true, lastToken: down.token }))
      .toEqual({ play: true, token: 'c1' })
  })

  it('respects the learner turning autoplay off', () => {
    const d = autoplayDecision({ presenting: true, enabled: false, card: CARD, flipped: true, lastToken: null })
    expect(d.play).toBe(false)
    // Recorded anyway: switching autoplay on shouldn't make a card already on
    // screen suddenly blurt.
    expect(d.token).toBe('c1')
  })
})

describe('autoplay while the card is NOT on screen', () => {
  it('never fires behind the Continue-session screen', () => {
    expect(autoplayDecision({ presenting: false, enabled: true, card: CARD, flipped: true, lastToken: null }))
      .toEqual({ play: false, token: null })
  })

  it('stays silent however many times the effect re-runs', () => {
    let token = null
    for (let i = 0; i < 6; i += 1) {
      const d = autoplayDecision({ presenting: false, enabled: true, card: CARD, flipped: true, lastToken: token })
      expect(d.play).toBe(false)
      token = d.token
    }
  })

  it('leaves the reveal unspent, so the card can speak when it is finally shown', () => {
    // Hidden: nothing fires and nothing is consumed…
    const hidden = autoplayDecision({ presenting: false, enabled: true, card: CARD, flipped: true, lastToken: null })
    expect(hidden.token).toBe(null)
    // …so Continue → the card appears → it announces itself once.
    expect(autoplayDecision({ presenting: true, enabled: true, card: CARD, flipped: true, lastToken: hidden.token }))
      .toEqual({ play: true, token: 'c1' })
  })

  it('does not re-announce a word the learner already heard', () => {
    // Revealed and played, then the tab was left and came back.
    const away = autoplayDecision({ presenting: false, enabled: true, card: CARD, flipped: true, lastToken: 'c1' })
    expect(away).toEqual({ play: false, token: 'c1' })
    expect(autoplayDecision({ presenting: true, enabled: true, card: CARD, flipped: true, lastToken: away.token }))
      .toEqual({ play: false, token: 'c1' })
  })
})
