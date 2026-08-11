import { describe, it, expect } from 'vitest'
import { waitingCount, navBadge, navItemLabel } from './navBadges'

// The desktop rail has shown this number for a long time; the mobile bar has
// never shown it. The bug this file exists to prevent is not "the badge is
// wrong" — it is "the badge is wrong in ONE of the two places", which is what
// happens the moment the sum lives in two files.

const loaded = (over) => ({ loaded: true, failed: false, newCount: 0, learnCount: 0, dueCount: 0, ...over })

describe('how many cards are waiting', () => {
  it('is new + learning + due', () => {
    expect(waitingCount(loaded({ newCount: 10, learnCount: 6, dueCount: 8 }))).toBe(24)
  })

  it('ignores every other count on the object', () => {
    // easyCount, learnedCount, weakCount, dueTomorrow… none of them are waiting
    // for you right now, and one of them creeping in is how the bar and the
    // hero start disagreeing.
    const c = loaded({
      newCount: 3, learnCount: 0, dueCount: 4,
      easyCount: 99, learnedCount: 120, masteredCount: 40, weakCount: 7,
      dueTomorrow: 31, totalWords: 300, cardCount: 500, grammarDueCount: 2,
    })
    expect(waitingCount(c)).toBe(7)
  })

  it('survives a partial object without inventing NaN', () => {
    expect(waitingCount({ loaded: true, dueCount: 5 })).toBe(5)
    expect(waitingCount(loaded({ newCount: undefined, learnCount: null, dueCount: 2 }))).toBe(2)
  })
})

describe('when there is deliberately no number', () => {
  it('says nothing at zero rather than "0"', () => {
    // A cleared queue should look cleared. Streaks and XP were removed for
    // this exact reason — a zero on a tab is the same pressure in miniature.
    expect(waitingCount(loaded())).toBe(null)
  })

  it('says nothing before the counts have arrived', () => {
    // App.jsx seeds `counts` with placeholder zeros and loaded:false. A badge
    // must not flicker in a beat after the bar.
    expect(waitingCount({ loaded: false, newCount: 0, learnCount: 0, dueCount: 0 })).toBe(null)
    expect(waitingCount({ loaded: false, newCount: 9, learnCount: 9, dueCount: 9 })).toBe(null)
  })

  it('says nothing when the fetch failed', () => {
    // homeCounts keeps the shape on failure but the numbers are meaningless.
    // Home says so in words; the bar must not quietly claim an empty queue —
    // nor print a number it cannot stand behind.
    expect(waitingCount(loaded({ failed: true, newCount: 4, dueCount: 4 }))).toBe(null)
  })

  it('says nothing when there are no counts at all', () => {
    for (const junk of [undefined, null, {}, 0, '']) {
      expect(waitingCount(junk)).toBe(null)
    }
  })
})

describe('which nav entry carries it', () => {
  const busy = loaded({ newCount: 10, learnCount: 4, dueCount: 10 })

  it('is Cards, and only Cards', () => {
    expect(navBadge('study', busy)).toBe(24)
    for (const key of ['home', 'stories', 'practice', 'test', 'profile', 'settings', 'logout']) {
      expect(navBadge(key, busy), key).toBe(null)
    }
  })

  it('gives Stories nothing, on purpose', () => {
    // The unlocked chapter is already announced twice — by the session recap
    // and by Home's reward panel. A bottom bar that becomes a row of counters
    // has stopped being navigation.
    expect(navBadge('stories', busy)).toBe(null)
  })

  it('hands both chromes the same value for the same counts', () => {
    // The whole point of the module: the rail and the bar ask one function.
    for (const c of [busy, loaded(), loaded({ failed: true, dueCount: 3 }), { loaded: false }]) {
      expect(navBadge('study', c)).toBe(waitingCount(c))
    }
  })
})

describe('what a screen reader hears', () => {
  it('carries the number when there is one', () => {
    expect(navItemLabel('Cards', 24)).toBe('Cards, 24 waiting')
    expect(navItemLabel('Flashcards', 1)).toBe('Flashcards, 1 waiting')
  })

  it('is just the label otherwise — never "0 waiting"', () => {
    expect(navItemLabel('Cards', null)).toBe('Cards')
    expect(navItemLabel('Cards', 0)).toBe('Cards')
    expect(navItemLabel('Cards', undefined)).toBe('Cards')
  })

  it('reads the badge the sighted user sees, for the same counts', () => {
    const c = loaded({ newCount: 2, learnCount: 3, dueCount: 4 })
    expect(navItemLabel('Cards', navBadge('study', c))).toBe('Cards, 9 waiting')
  })
})
