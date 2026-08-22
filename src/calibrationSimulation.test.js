import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'node:fs'
import { pickCalibrationChecks, CALIBRATION_SESSION_CAP } from './calibration'
import { priorKnownCardRow, isPriorKnown } from './knowledgeState'
import { spreadDueDates } from './priorKnowledge'
import { schedule, isCardDue } from './srs'

// Deterministic 30-day simulations of a FRESH higher-level account, run through
// the REAL modules — spreadDueDates for the claim, pickCalibrationChecks for the
// queue, srs.schedule for every grade. Nothing here models the app; it drives it.
//
// The clock is advanced day by day with fake timers, because srs.schedule()
// grades against `new Date()`. Without that every card comes back due the next
// day (its due date lands relative to the real today, not the simulated one) and
// the simulation reports a flood that the app would never produce.
//
// The question these answer: does a large claim arrive as a gradual trickle, or
// as a hidden backlog that floods the session later?

const HSK = { 1: 300, 2: 197, 3: 453, 4: 929, 5: 1495, 6: 1621 }
const DAY = 86400000
const START = Date.UTC(2026, 8, 1, 9, 0, 0)

function priorWordCount(startLevel) {
  let n = 0
  for (let l = 1; l < startLevel; l += 1) n += HSK[l]
  return n
}

// One learner-day. Returns the day's row plus the mutated state.
function simulate({ startLevel, perDay, dailyNewCards, days = 30, cap = CALIBRATION_SESSION_CAP, knewRate = 1 }) {
  vi.useFakeTimers()
  const priorCount = priorWordCount(startLevel)
  const levelCount = HSK[startLevel]

  // The claim, spread exactly as onboarding writes it.
  const ids = Array.from({ length: priorCount }, (_, i) => 'p' + String(i).padStart(5, '0'))
  const spread = spreadDueDates(ids, perDay, START)
  let claims = spread.map((entry, i) => ({
    ...priorKnownCardRow('u1', entry.vocabId, 'placement', START, entry.dueAt),
    // Frequency order: the claim list is already level-then-sort_order.
    vocab: { id: entry.vocabId, level: 1 + Math.floor(i / 400), sort_order: i },
  }))

  // Genuine cards the learner builds at their own level, keyed by due date.
  let genuine = []
  let unstartedLevelWords = levelCount
  const rows = []

  for (let d = 0; d < days; d += 1) {
    const now = new Date(START + d * DAY)
    vi.setSystemTime(now)

    // 1) Genuine reviews due today always come first — they are the backbone.
    //    Uses the REAL due predicate: day-based for review cards, exact for
    //    learning steps (which the session resolves in-session, below).
    const dueToday = genuine.filter(c => isCardDue(c, now))

    // 2) Calibration checks, from the real picker.
    const checks = pickCalibrationChecks(claims, { now, cap })

    // 3) New words at the current level, capped by the daily allowance.
    //    Calibration does NOT consume this budget: checks are not new cards.
    const newToday = Math.min(dailyNewCards, unstartedLevelWords)

    rows.push({
      day: d + 1,
      dueReviews: dueToday.length,
      newWords: newToday,
      checks: checks.length,
      totalCards: dueToday.length + newToday + checks.length,
      unverifiedLeft: claims.filter(isPriorKnown).length - checks.length,
    })

    // ── apply the day ──
    // Grade the due reviews (Good). A learning card re-enters the SAME session
    // (srs.schedule's `stay`), so it is resolved here rather than counted again
    // tomorrow — which is what the study screen actually does with `gap`.
    for (const c of dueToday) {
      let res = schedule({ ...c, id: 'g' }, 2)
      let guard = 0
      while (res.stay && guard < 6) {
        res = schedule({ ...c, ...res.updates, id: 'g' }, 2)
        guard += 1
      }
      Object.assign(c, res.updates)
    }
    // Answer the checks: knewRate decides Easy vs Again.
    const checkedIds = new Set(checks.map(c => c.vocab_id))
    for (let i = 0; i < checks.length; i += 1) {
      const knew = (i / Math.max(1, checks.length)) < knewRate
      let res = schedule(checks[i], knew ? 3 : 0)
      let guard = 0
      while (res.stay && guard < 6) {
        res = schedule({ ...checks[i], ...res.updates, id: 'v' }, 2)
        guard += 1
      }
      genuine.push({ ...checks[i], ...res.updates, id: 'v' + checks[i].vocab_id })
    }
    claims = claims.filter(c => !checkedIds.has(c.vocab_id))
    // Introduce the day's new words as learning cards graded Good.
    for (let i = 0; i < newToday; i += 1) {
      let res = schedule({ id: null, state: 'new' }, 2)
      let guard = 0
      while (res.stay && guard < 6) {
        res = schedule({ state: res.updates.state, ...res.updates, id: 'n' }, 2)
        guard += 1
      }
      genuine.push({ vocab_id: 'n' + d + '_' + i, ...res.updates, id: 'n' + d + '_' + i })
    }
    unstartedLevelWords -= newToday
  }

  vi.useRealTimers()
  return { rows, priorCount, levelCount, remaining: claims.filter(isPriorKnown).length }
}

function table(label, sim) {
  const lines = ['', label, 'day | due | new | checks | total | unverified left', '----+-----+-----+--------+-------+----------------']
  for (const r of sim.rows) {
    lines.push(
      String(r.day).padStart(3) + ' | ' + String(r.dueReviews).padStart(3) + ' | ' +
      String(r.newWords).padStart(3) + ' | ' + String(r.checks).padStart(6) + ' | ' +
      String(r.totalCards).padStart(5) + ' | ' + String(r.unverifiedLeft).padStart(14))
  }
  return lines.join('\n')
}

afterAll(() => vi.useRealTimers())

describe('calibration pacing — fresh HSK 3 account (497 assumed words)', () => {
  const sim = simulate({ startLevel: 3, perDay: 15, dailyNewCards: 10 })

  it('prints the first 30 days', () => {
    fs.writeFileSync('/tmp/sim-hsk3.txt', table('HSK 3 · steady (15/day) · 10 new/day', sim))
    expect(sim.priorCount).toBe(497)
  })

  it('never floods: the daily check count stays at the chosen pace', () => {
    const maxChecks = Math.max(...sim.rows.map(r => r.checks))
    expect(maxChecks).toBeLessThanOrEqual(15)
  })

  // Measured peak over 30 days is 105 cards, on day 28. That peak is driven by
  // FSRS review CLUSTERING (same-day cohorts coming due together), not by
  // calibration: checks contribute a flat 15 every single day.
  it('stays within a workable session, and calibration is a FLAT contribution', () => {
    const maxTotal = Math.max(...sim.rows.map(r => r.totalCards))
    expect(maxTotal).toBeLessThanOrEqual(120)
    // The signature of "no hidden backlog": identical every day, never a spike.
    expect(new Set(sim.rows.map(r => r.checks))).toEqual(new Set([15]))
  })

  it('does not reduce the new-card allowance', () => {
    expect(sim.rows.every(r => r.newWords === 10)).toBe(true)
  })

  it('clears the backlog steadily rather than hoarding it', () => {
    expect(sim.rows[0].unverifiedLeft).toBeGreaterThan(sim.rows[29].unverifiedLeft)
    // 30 days at 15/day checks ~450 of 497.
    expect(sim.remaining).toBeLessThan(100)
  })
})

describe('calibration pacing — fresh HSK 6 account (3,374 assumed words)', () => {
  const sim = simulate({ startLevel: 6, perDay: 15, dailyNewCards: 10 })

  it('prints the first 30 days', () => {
    fs.writeFileSync('/tmp/sim-hsk6.txt', table('HSK 6 · steady (15/day) · 10 new/day', sim))
    expect(sim.priorCount).toBe(3374)
  })

  it('the per-day load is IDENTICAL to HSK 3 — only the tail is longer', () => {
    // 3,374 assumed words instead of 497 changes nothing about a given day:
    // same 15 checks, same peak. Only `unverified left` differs.
    const maxChecks = Math.max(...sim.rows.map(r => r.checks))
    expect(maxChecks).toBeLessThanOrEqual(15)
    const maxTotal = Math.max(...sim.rows.map(r => r.totalCards))
    expect(maxTotal).toBeLessThanOrEqual(120)
  })

  it('leaves a long but visible tail rather than a hidden backlog', () => {
    // 3,374 at 15/day is ~225 days. That is the honest consequence of claiming
    // five levels, and it is a trickle, not a flood.
    expect(sim.remaining).toBeGreaterThan(2900)
    expect(sim.rows.every(r => r.checks <= 15)).toBe(true)
  })
})

describe('a skipped week does not become a wall', () => {
  it('the session cap holds the backlog back', () => {
    // Simulate the learner returning on day 15 having done nothing: every claim
    // up to day 15 is ready at once.
    const ids = Array.from({ length: 497 }, (_, i) => 'p' + i)
    const spread = spreadDueDates(ids, 15, START)
    const claims = spread.map((entry, i) => ({
      ...priorKnownCardRow('u1', entry.vocabId, 'placement', START, entry.dueAt),
      vocab: { id: entry.vocabId, level: 1, sort_order: i },
    }))
    const day15 = new Date(START + 15 * DAY)
    const ready = claims.filter(c => new Date(c.due_at) <= day15).length
    const served = pickCalibrationChecks(claims, { now: day15 }).length

    expect(ready).toBeGreaterThan(200)             // a fortnight of claims is ready
    expect(served).toBe(CALIBRATION_SESSION_CAP)   // but only 20 are ever served
  })
})

describe('genuine reviews are never crowded out', () => {
  it('checks are capped while due reviews are not', () => {
    // The cap applies ONLY to calibration. However many real reviews are due,
    // they are all served; calibration adds at most CALIBRATION_SESSION_CAP.
    const sim = simulate({ startLevel: 3, perDay: 30, dailyNewCards: 15, days: 30 })
    for (const r of sim.rows) expect(r.checks).toBeLessThanOrEqual(CALIBRATION_SESSION_CAP)
    const lateDays = sim.rows.slice(20)
    expect(lateDays.some(r => r.dueReviews > 0)).toBe(true)
  })
})

describe('a refuted claim rejoins normal learning rather than vanishing', () => {
  it('grading Again turns the claim into an ordinary learning card', () => {
    const claim = {
      ...priorKnownCardRow('u1', 'v1', 'placement', START, new Date(START).toISOString()),
      vocab: { id: 'v1', level: 1, sort_order: 0 },
    }
    const res = schedule(claim, 0)
    const after = { ...claim, ...res.updates }
    expect(isPriorKnown(after)).toBe(false)
    expect(after.state).toBe('learning')
    expect(after.reps).toBe(1)
  })
})
