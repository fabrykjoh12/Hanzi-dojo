import { describe, it, expect } from 'vitest'
import {
  MAX_COUNT, PRESET_COUNTS, CONFIRM_THRESHOLD, CARD_SPECS,
  parseCount, levelOptions, isValidLevel, missingUnlockLevels, unlockRows,
  orderVocab, pickUnstartedVocabIds, cardSpec, reviewDayOffset,
  creativeCardRow, creativeCardRows, pickCardsToForceDue, forceDueUpdate,
  needsConfirm, armConfirm, describeApplied,
} from './creativeMode'
import { isLearned, isMastered, MASTERY_STABILITY_DAYS } from './mastery'
import { isCardDue } from './srs'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-07-27T12:00:00.000Z')

describe('parseCount', () => {
  it('accepts positive integers and floors decimals', () => {
    expect(parseCount(300)).toBe(300)
    expect(parseCount('42')).toBe(42)
    expect(parseCount(7.9)).toBe(7)
  })
  it('treats anything unusable as nothing to do', () => {
    expect(parseCount('')).toBe(0)
    expect(parseCount('abc')).toBe(0)
    expect(parseCount(0)).toBe(0)
    expect(parseCount(-5)).toBe(0)
    expect(parseCount(null)).toBe(0)
    expect(parseCount(undefined)).toBe(0)
    expect(parseCount(Infinity)).toBe(0)
  })
  it('clamps to the guard rail so a stray zero cannot rewrite everything', () => {
    expect(parseCount(999999)).toBe(MAX_COUNT)
    expect(parseCount(50, 20)).toBe(20)
  })
  it('offers presets that are all usable', () => {
    for (const p of PRESET_COUNTS) expect(parseCount(p)).toBe(p)
  })
})

describe('levelOptions', () => {
  it('reads the level list from the language system, not a hardcoded range', () => {
    const chinese = levelOptions('chinese', 'hsk_3', 3)
    expect(chinese).toHaveLength(9)
    expect(chinese[2]).toEqual({ level: 3, label: 'HSK 3', isCurrent: true })
    expect(chinese[0].isCurrent).toBe(false)
  })
  it('labels Japanese and Russian through getLevelLabel', () => {
    const jp = levelOptions('japanese', 'jlpt', 1)
    expect(jp).toHaveLength(6)
    expect(jp.map(o => o.label)).toEqual(['N5 · Part 1', 'N5 · Part 2', 'N4', 'N3', 'N2', 'N1'])
    const ru = levelOptions('russian', 'russian', 2)
    expect(ru.map(o => o.label)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
    expect(ru[1].isCurrent).toBe(true)
  })
})

describe('isValidLevel', () => {
  it('rejects levels the language does not have', () => {
    expect(isValidLevel('chinese', 'hsk_3', 9)).toBe(true)
    expect(isValidLevel('japanese', 'jlpt', 9)).toBe(false)
    expect(isValidLevel('russian', 'russian', 0)).toBe(false)
  })
})

describe('missingUnlockLevels', () => {
  it('appends every level below the target that is not already unlocked', () => {
    expect(missingUnlockLevels('chinese', 'hsk_3', 4, [])).toEqual([1, 2, 3])
    expect(missingUnlockLevels('chinese', 'hsk_3', 4, [1, 3])).toEqual([2])
  })
  it('never proposes the target level itself (you have not passed it yet)', () => {
    expect(missingUnlockLevels('chinese', 'hsk_3', 4, []).indexOf(4)).toBe(-1)
  })
  it('is empty at level 1 and when nothing is missing', () => {
    expect(missingUnlockLevels('chinese', 'hsk_3', 1, [])).toEqual([])
    expect(missingUnlockLevels('japanese', 'jlpt', 3, [1, 2])).toEqual([])
  })
  it('rewrites no history when jumping DOWN — append-only stays append-only', () => {
    // Already unlocked 1-5, now jumping back to level 2: nothing to add,
    // and crucially nothing to remove.
    expect(missingUnlockLevels('chinese', 'hsk_3', 2, [1, 2, 3, 4, 5])).toEqual([])
  })
})

describe('unlockRows', () => {
  it('scopes every row to the one user', () => {
    const rows = unlockRows('u1', 'chinese', 'hsk_3', [1, 2])
    expect(rows).toEqual([
      { user_id: 'u1', language: 'chinese', system: 'hsk_3', level: 1 },
      { user_id: 'u1', language: 'chinese', system: 'hsk_3', level: 2 },
    ])
    expect(unlockRows('u1', 'chinese', 'hsk_3', [])).toEqual([])
  })
})

describe('orderVocab / pickUnstartedVocabIds', () => {
  const vocab = [
    { id: 'b', level: 1, sort_order: 2 },
    { id: 'd', level: 2, sort_order: 1 },
    { id: 'a', level: 1, sort_order: 1 },
    { id: 'c', level: 1, sort_order: 3 },
  ]

  it('orders by level then frequency rank, the way the deck introduces words', () => {
    expect(orderVocab(vocab).map(v => v.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('does not mutate its input', () => {
    const copy = [...vocab]
    orderVocab(vocab)
    expect(vocab).toEqual(copy)
  })
  it('breaks ties on id so repeated runs pick the same words', () => {
    const tied = [{ id: 'z', level: 1, sort_order: 1 }, { id: 'y', level: 1, sort_order: 1 }]
    expect(orderVocab(tied).map(v => v.id)).toEqual(['y', 'z'])
  })
  it('sorts words with no level last rather than first', () => {
    const mixed = [{ id: 'n', level: null, sort_order: 1 }, { id: 'a', level: 9, sort_order: 1 }]
    expect(orderVocab(mixed).map(v => v.id)).toEqual(['a', 'n'])
  })

  it('skips words that already have a card', () => {
    expect(pickUnstartedVocabIds(vocab, ['a', 'c'], 10)).toEqual(['b', 'd'])
  })
  it('takes only as many as asked for', () => {
    expect(pickUnstartedVocabIds(vocab, [], 2)).toEqual(['a', 'b'])
  })
  it('returns what is left when the ask exceeds the scope', () => {
    expect(pickUnstartedVocabIds(vocab, [], 300)).toHaveLength(4)
  })
  it('returns nothing for a nonsense count', () => {
    expect(pickUnstartedVocabIds(vocab, [], 0)).toEqual([])
    expect(pickUnstartedVocabIds(vocab, [], 'x')).toEqual([])
  })
  it('survives empty and malformed input', () => {
    expect(pickUnstartedVocabIds(null, null, 5)).toEqual([])
    expect(pickUnstartedVocabIds([{ level: 1 }], [], 5)).toEqual([])
  })
})

describe('cardSpec', () => {
  it('only knows the two seeded states', () => {
    expect(cardSpec('learned')).toBe(CARD_SPECS.learned)
    expect(cardSpec('mastered')).toBe(CARD_SPECS.mastered)
    expect(cardSpec('easy')).toBeNull()
    expect(cardSpec(undefined)).toBeNull()
  })
})

describe('reviewDayOffset', () => {
  it('round-robins across the interval so due dates spread out', () => {
    expect(reviewDayOffset(0, 6)).toBe(0)
    expect(reviewDayOffset(5, 6)).toBe(5)
    expect(reviewDayOffset(6, 6)).toBe(0)
    expect(reviewDayOffset(13, 6)).toBe(1)
  })
  it('degrades to 0 for a nonsense interval', () => {
    expect(reviewDayOffset(3, 0)).toBe(0)
    expect(reviewDayOffset(3, undefined)).toBe(0)
    expect(reviewDayOffset(-2, 6)).toBe(0)
  })
})

describe('creativeCardRow', () => {
  it('never writes the dead ease_factor column', () => {
    const row = creativeCardRow('u1', 'v1', { mode: 'learned', index: 0, now: NOW })
    expect('ease_factor' in row).toBe(false)
  })

  it('never sets is_easy true — that flag belongs to the grading flow', () => {
    for (const mode of ['learned', 'mastered']) {
      for (let i = 0; i < 40; i += 1) {
        const row = creativeCardRow('u1', 'v' + i, { mode, index: i, now: NOW })
        expect(row.is_easy).toBe(false)
      }
    }
  })

  it('scopes the row to the given user and word', () => {
    const row = creativeCardRow('u1', 'v9', { mode: 'learned', index: 0, now: NOW })
    expect(row.user_id).toBe('u1')
    expect(row.vocab_id).toBe('v9')
  })

  it('produces a card that counts as learned but NOT mastered', () => {
    const row = creativeCardRow('u1', 'v1', { mode: 'learned', index: 0, now: NOW })
    expect(isLearned(row)).toBe(true)
    expect(isMastered(row)).toBe(false)
    expect(row.stability).toBeLessThan(MASTERY_STABILITY_DAYS)
    expect(row.state).toBe('review')
    expect(row.learned).toBe(true)
  })

  it('produces a card that counts as mastered, past the gate with margin', () => {
    const row = creativeCardRow('u1', 'v1', { mode: 'mastered', index: 0, now: NOW })
    expect(isLearned(row)).toBe(true)
    expect(isMastered(row)).toBe(true)
    expect(row.stability).toBeGreaterThan(MASTERY_STABILITY_DAYS)
  })

  it('sets a plausible past review and a future due date', () => {
    const row = creativeCardRow('u1', 'v1', { mode: 'learned', index: 2, now: NOW })
    const last = new Date(row.last_review)
    const due = new Date(row.due_at)
    expect(last.getTime()).toBe(NOW.getTime() - 2 * DAY_MS)
    expect(due.getTime()).toBe(last.getTime() + CARD_SPECS.learned.intervalDays * DAY_MS)
    expect(due.getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('carries FSRS history rather than a bare flag', () => {
    const row = creativeCardRow('u1', 'v1', { mode: 'mastered', index: 0, now: NOW })
    expect(row.reps).toBeGreaterThan(0)
    expect(row.lapses).toBe(0)
    expect(row.difficulty).toBeGreaterThan(0)
    expect(row.learning_step).toBe(0)
    expect(row.scheduled_days).toBe(CARD_SPECS.mastered.intervalDays)
    expect(row.elapsed_days).toBe(CARD_SPECS.mastered.intervalDays)
  })

  it('returns null for an unknown mode instead of guessing', () => {
    expect(creativeCardRow('u1', 'v1', { mode: 'nope', now: NOW })).toBeNull()
    expect(creativeCardRow('u1', 'v1')).toBeNull()
  })
})

describe('creativeCardRows', () => {
  it('spreads 300 seeded cards over the interval instead of one due wall', () => {
    const ids = []
    for (let i = 0; i < 300; i += 1) ids.push('v' + i)
    const rows = creativeCardRows('u1', ids, 'learned', NOW)
    expect(rows).toHaveLength(300)

    const days = new Set(rows.map(r => r.due_at.slice(0, 10)))
    expect(days.size).toBe(CARD_SPECS.learned.intervalDays)

    // Evenly, not lumpily: 300 across 6 days is 50 a day.
    const perDay = {}
    for (const r of rows) {
      const d = r.due_at.slice(0, 10)
      perDay[d] = (perDay[d] || 0) + 1
    }
    for (const d of Object.keys(perDay)) expect(perDay[d]).toBe(50)
  })

  it('leaves none of the seeded cards due today — they are history, not homework', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for (const rows of [creativeCardRows('u1', ids, 'learned', NOW), creativeCardRows('u1', ids, 'mastered', NOW)]) {
      for (const r of rows) expect(isCardDue(r, NOW)).toBe(false)
    }
  })

  it('returns nothing for an unknown mode or an empty pick', () => {
    expect(creativeCardRows('u1', ['a'], 'nope', NOW)).toEqual([])
    expect(creativeCardRows('u1', [], 'learned', NOW)).toEqual([])
    expect(creativeCardRows('u1', null, 'learned', NOW)).toEqual([])
  })
})

describe('pickCardsToForceDue', () => {
  const future = (days) => new Date(NOW.getTime() + days * DAY_MS).toISOString()
  const cards = [
    { id: 'c1', state: 'review', due_at: future(10) },
    { id: 'c2', state: 'review', due_at: future(2) },
    { id: 'c3', state: 'review', due_at: future(5) },
    { id: 'c4', state: 'review', due_at: future(-1) }, // already due
    { id: 'c5', state: 'new', due_at: future(3) },     // never started
  ]

  it('takes the soonest-due cards that are not already available', () => {
    expect(pickCardsToForceDue(cards, 2, NOW)).toEqual(['c2', 'c3'])
  })
  it('ignores cards that are already due and cards never started', () => {
    expect(pickCardsToForceDue(cards, 10, NOW)).toEqual(['c2', 'c3', 'c1'])
  })
  it('treats "later today" as already due (day-based availability)', () => {
    const laterToday = [{ id: 'x', state: 'review', due_at: new Date(NOW.getTime() + 6 * 60 * 60 * 1000).toISOString() }]
    expect(pickCardsToForceDue(laterToday, 5, NOW)).toEqual([])
  })
  it('returns nothing rather than reshuffling when everything is already due', () => {
    expect(pickCardsToForceDue([cards[3]], 5, NOW)).toEqual([])
    expect(pickCardsToForceDue([], 5, NOW)).toEqual([])
    expect(pickCardsToForceDue(null, 5, NOW)).toEqual([])
  })
  it('respects a nonsense count', () => {
    expect(pickCardsToForceDue(cards, 0, NOW)).toEqual([])
  })
})

describe('forceDueUpdate', () => {
  it('moves only the due date — never the earned FSRS history', () => {
    const update = forceDueUpdate(NOW)
    expect(update).toEqual({ due_at: NOW.toISOString() })
    expect(isCardDue({ state: 'review', ...update }, NOW)).toBe(true)
  })
})

describe('needsConfirm / armConfirm', () => {
  it('always confirms the reset and forcing reviews due', () => {
    expect(needsConfirm('reset', 0)).toBe(true)
    expect(needsConfirm('due', 1)).toBe(true)
  })
  it('confirms bulk writes at the threshold', () => {
    expect(needsConfirm('learn', CONFIRM_THRESHOLD - 1)).toBe(false)
    expect(needsConfirm('learn', CONFIRM_THRESHOLD)).toBe(true)
    expect(needsConfirm('master', 300)).toBe(true)
  })
  it('does not confirm small, easily-undone actions', () => {
    expect(needsConfirm('learn', 10)).toBe(false)
    expect(needsConfirm('jump', 0)).toBe(false)
  })

  it('runs a safe action immediately', () => {
    expect(armConfirm('learn', 10, null)).toEqual({ run: true, armedKey: null })
  })
  it('arms a destructive action on the first tap and runs it on the second', () => {
    const first = armConfirm('reset', 0, null)
    expect(first).toEqual({ run: false, armedKey: 'reset' })
    expect(armConfirm('reset', 0, first.armedKey)).toEqual({ run: true, armedKey: null })
  })
  it('arming a different action disarms the previous one', () => {
    expect(armConfirm('due', 5, 'reset')).toEqual({ run: false, armedKey: 'due' })
  })
  it('a bulk action armed at 300 still needs its own second tap', () => {
    expect(armConfirm('learn', 300, null)).toEqual({ run: false, armedKey: 'learn' })
    expect(armConfirm('learn', 300, 'learn')).toEqual({ run: true, armedKey: null })
  })
})

describe('describeApplied', () => {
  it('says plainly when there was nothing to do', () => {
    expect(describeApplied(0, 300, 'words')).toBe('Nothing to do — no words left in scope')
  })
  it('flags a shortfall so it does not read as a bug', () => {
    expect(describeApplied(40, 300, 'words')).toBe('40 words (only that many were in scope)')
  })
  it('is quiet when the full ask was met', () => {
    expect(describeApplied(300, 300, 'words')).toBe('300 words')
  })
})
