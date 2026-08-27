import { describe, it, expect } from 'vitest'
import {
  CARD_COLUMNS, REVIEW_LOG_COLUMNS, CLASSIFIER_REQUIRED_LOG_FIELDS,
  assertLogColumnsSatisfyClassifier, assertCardColumnsSatisfyClassifier,
  columnList, loadWorld,
} from './reviewLogContract'
import { CLASS, classifyCard, buildMigrationPlan } from './legacyClaimMigration'

// The loader → classifier SEAM.
//
// Gate 3 Prepare run 33014914945 classified 982 cards as reviewed seeds across
// 30 accounts; the truth was 207 across 2. Applying it would have replayed ~775
// genuine cards belonging to uninvolved learners.
//
// One missing column caused it. The loader asked for
// `id, card_id, grade, reviewed_at` while the provenance rule reads
// `previous_state`. PostgREST returns exactly what you select, so the field was
// `undefined` everywhere, `hasNewTransition` was false for every card, and the
// rule silently collapsed.
//
// Every classifier unit test passed throughout, because fixtures supply
// `previous_state` directly. Nothing ever exercised the query and the
// classifier together — so these tests do exactly that, through a fake that
// PROJECTS COLUMNS the way PostgREST does. A fake that returns whole rows
// regardless of the select would reproduce the blind spot instead of catching
// it, which is the entire point.

// A PostgREST-shaped fake: it returns ONLY the columns it was asked for.
function fakeTable(rows) {
  return (columnsCsv) => {
    const wanted = columnsCsv.split(',').map(c => c.trim()).filter(Boolean)
    return rows.map(row => {
      const projected = {}
      for (const c of wanted) projected[c] = row[c]
      return projected
    })
  }
}

function makeFetchTable({ cards, logs }) {
  const cardReader = fakeTable(cards)
  const logReader = fakeTable(logs)
  return async (table, columnsCsv) => {
    if (table === 'cards') return cardReader(columnsCsv)
    if (table === 'review_logs') return logReader(columnsCsv)
    throw new Error('unexpected table ' + table)
  }
}

// ── A temporally coherent fixture world ─────────────────────────────────────
//
// The logging epoch is the timestamp of the OLDEST review_log in the database,
// and the classifier only trusts provenance for cards born after it. That means
// the epoch has to be established by a card that genuinely predates the card
// under test — not by back-dating the card under test's own history, which
// would describe a review that happened before its card existed. Every card
// here is created before its first review, and every history runs forwards.

// An older, ordinary card. It exists only to put the epoch where production
// has it, the same way production's oldest surviving log does.
const EPOCH_CARD = {
  id: 'epoch-1', user_id: 'u0', vocab_id: 'v0',
  created_at: '2026-07-01T18:41:02.117Z',
  state: 'review', reps: 2, lapses: 0, stability: 61.4, difficulty: 4.8,
  learned: true, is_easy: false, elapsed_days: 21, scheduled_days: 60,
  interval_days: 60, learning_step: 0, last_review: '2026-07-30T11:04:00.000Z',
  due_at: '2026-09-28T11:04:00.000Z',
  prior_known_at: null, prior_source: null, verified_at: null,
}

const EPOCH_LOG_AT = '2026-07-02T10:59:25.501Z'

const EPOCH_LOGS = [
  { id: 'e0', card_id: 'epoch-1', grade: 2, reviewed_at: EPOCH_LOG_AT, previous_state: 'new' },
  { id: 'e1', card_id: 'epoch-1', grade: 3, reviewed_at: '2026-07-30T11:04:00.000Z', previous_state: 'review' },
]

// The GENUINE card under test: created a month after the epoch, first reviewed
// fifteen minutes after it was created, reviewed again three weeks later. Under
// the real column list it must classify as GENUINE. Under the broken one it
// becomes REVIEWED_SEED — the production bug.
const GENUINE_CARD = {
  id: 'genuine-1', user_id: 'u1', vocab_id: 'v1',
  created_at: '2026-08-01T09:00:00.000Z',
  state: 'review', reps: 2, lapses: 0, stability: 44.2, difficulty: 5.1,
  learned: true, is_easy: false, elapsed_days: 30, scheduled_days: 30,
  interval_days: 30, learning_step: 0, last_review: '2026-08-20T09:00:00.000Z',
  due_at: '2026-09-20T09:00:00.000Z',
  prior_known_at: null, prior_source: null, verified_at: null,
}

const GENUINE_LOGS = [
  { id: 'l0', card_id: 'genuine-1', grade: 2, reviewed_at: '2026-08-01T09:15:00.000Z', previous_state: 'new' },
  { id: 'l1', card_id: 'genuine-1', grade: 2, reviewed_at: '2026-08-20T09:00:00.000Z', previous_state: 'review' },
]

// The world the loader sees: both cards, all four logs.
const WORLD_CARDS = [EPOCH_CARD, GENUINE_CARD]
const WORLD_LOGS = [...EPOCH_LOGS, ...GENUINE_LOGS]

// Sanity: the fixture is not quietly describing an impossible history.
describe('the fixture world is temporally coherent', () => {
  it('every card is created before its first review, and histories run forwards', () => {
    for (const card of WORLD_CARDS) {
      const mine = WORLD_LOGS.filter(l => l.card_id === card.id)
      expect(mine.length).toBeGreaterThan(0)
      const times = mine.map(l => new Date(l.reviewed_at).getTime())
      expect(Math.min(...times)).toBeGreaterThan(new Date(card.created_at).getTime())
      expect([...times].sort((a, b) => a - b)).toEqual(times)
    }
  })

  it('the epoch predates the card under test, and belongs to the older card', () => {
    expect(new Date(EPOCH_LOG_AT).getTime())
      .toBeLessThan(new Date(GENUINE_CARD.created_at).getTime())
    expect(EPOCH_LOGS[0].card_id).toBe(EPOCH_CARD.id)
  })
})

describe('the column contract is declared, not implied', () => {
  it('the review-log column list includes every field the classifier reads', () => {
    for (const field of CLASSIFIER_REQUIRED_LOG_FIELDS) {
      expect(REVIEW_LOG_COLUMNS).toContain(field)
    }
    // The specific field whose absence caused the incident.
    expect(REVIEW_LOG_COLUMNS).toContain('previous_state')
  })

  it('the assertion rejects a list missing previous_state', () => {
    expect(() => assertLogColumnsSatisfyClassifier(
      ['id', 'card_id', 'grade', 'reviewed_at'],
    )).toThrow(/previous_state/)
  })

  it('names every missing field, not just the first', () => {
    expect(() => assertLogColumnsSatisfyClassifier(['id']))
      .toThrow(/card_id.*grade.*reviewed_at.*previous_state/s)
  })

  it('accepts the real list, and the card list too', () => {
    expect(assertLogColumnsSatisfyClassifier()).toBe(true)
    expect(assertCardColumnsSatisfyClassifier()).toBe(true)
  })

  it('refuses to load at all when the contract is violated — before any query', () => {
    let queried = false
    const spy = async () => { queried = true; return [] }
    return expect(loadWorld({
      fetchTable: spy,
      logColumns: ['id', 'card_id', 'grade', 'reviewed_at'],
    })).rejects.toThrow(/previous_state/).then(() => {
      // The point of asserting first: a bad contract must not reach production.
      expect(queried).toBe(false)
    })
  })
})

describe('loading and classifying together (the seam that failed)', () => {
  it('loads previous_state and classifies a genuine card as GENUINE', async () => {
    const world = await loadWorld({
      fetchTable: makeFetchTable({ cards: WORLD_CARDS, logs: WORLD_LOGS }),
    })

    // The field actually arrived.
    expect(world.logsByCardId['genuine-1'][0]).toHaveProperty('previous_state', 'new')
    expect(world.loggingEpoch).toBe(EPOCH_LOG_AT)

    const klass = classifyCard(GENUINE_CARD, world.logsByCardId['genuine-1'], {
      loggingEpoch: world.loggingEpoch,
    })
    expect(klass).toBe(CLASS.GENUINE)
  })

  it('and the whole plan leaves it untouched', async () => {
    const world = await loadWorld({
      fetchTable: makeFetchTable({ cards: WORLD_CARDS, logs: WORLD_LOGS }),
    })
    const plan = buildMigrationPlan({
      cards: world.cards, logsByCardId: world.logsByCardId, loggingEpoch: world.loggingEpoch,
    })
    expect(plan.counts.genuine).toBe(2)
    expect(plan.counts.replays).toBe(0)
    expect(plan.counts.conversions).toBe(0)
  })

  // THE REGRESSION THAT WOULD HAVE CAUGHT THE INCIDENT.
  //
  // Drive the same code with the broken column list, bypassing the assertion,
  // and show the exact misclassification production produced. If someone ever
  // narrows the loader again, the assertion above fires first — and if they
  // also delete the assertion, this test documents precisely what goes wrong.
  it('DEMONSTRATES the incident: without previous_state the genuine card becomes REVIEWED_SEED', async () => {
    const brokenColumns = ['id', 'card_id', 'grade', 'reviewed_at'] // the shipped bug
    const fetchTable = makeFetchTable({ cards: WORLD_CARDS, logs: GENUINE_LOGS })

    // Reproduce the old loader by hand: the assertion would refuse this.
    const logs = await fetchTable('review_logs', columnList(brokenColumns))
    expect(logs[0].previous_state).toBeUndefined()

    const klass = classifyCard(GENUINE_CARD, logs, { loggingEpoch: EPOCH_LOG_AT })
    expect(klass).toBe(CLASS.REVIEWED_SEED)   // ← 982 rows across 30 accounts

    // And with the correct list, the same card and the same code are right.
    const goodLogs = await fetchTable('review_logs', columnList(REVIEW_LOG_COLUMNS))
    expect(classifyCard(GENUINE_CARD, goodLogs, { loggingEpoch: EPOCH_LOG_AT })).toBe(CLASS.GENUINE)
  })

  it('a real legacy seed still classifies correctly through the loader', async () => {
    const seed = {
      ...GENUINE_CARD, id: 'seed-1', vocab_id: 'v2',
      created_at: '2026-08-19T10:22:10.003Z',
      state: 'review', reps: 0, stability: 21, difficulty: 5,
      elapsed_days: 0, learned: true, is_easy: false,
    }
    const world = await loadWorld({
      fetchTable: makeFetchTable({
        cards: [...WORLD_CARDS, seed],
        // The epoch comes from the older card's history, exactly as production's
        // oldest surviving log does.
        logs: WORLD_LOGS,
      }),
    })
    const plan = buildMigrationPlan({
      cards: world.cards, logsByCardId: world.logsByCardId, loggingEpoch: world.loggingEpoch,
    })
    expect(plan.counts.conversions).toBe(1)
    expect(plan.counts.genuine).toBe(2)
  })
})

describe('the loader asks for exactly what it declares', () => {
  it('passes the declared column lists through to the query', async () => {
    const seen = []
    await loadWorld({
      fetchTable: async (table, columnsCsv) => { seen.push([table, columnsCsv]); return [] },
    })
    expect(seen).toEqual([
      ['cards', columnList(CARD_COLUMNS)],
      ['review_logs', columnList(REVIEW_LOG_COLUMNS)],
    ])
    expect(seen[1][1]).toContain('previous_state')
  })

  it('derives the logging epoch from the oldest log, not the newest', async () => {
    const logs = [
      { id: 'b', card_id: 'c', grade: 2, reviewed_at: '2026-09-01T00:00:00.000Z', previous_state: 'review' },
      { id: 'a', card_id: 'c', grade: 2, reviewed_at: '2026-07-02T00:00:00.000Z', previous_state: 'new' },
      { id: 'c', card_id: 'c', grade: 2, reviewed_at: '2026-08-01T00:00:00.000Z', previous_state: 'review' },
    ]
    const world = await loadWorld({ fetchTable: makeFetchTable({ cards: [], logs }) })
    expect(world.loggingEpoch).toBe('2026-07-02T00:00:00.000Z')
  })

  it('ignores logs with no card_id rather than crashing', async () => {
    const logs = [{ id: 'x', card_id: null, grade: 2, reviewed_at: EPOCH_LOG_AT, previous_state: 'new' }]
    const world = await loadWorld({ fetchTable: makeFetchTable({ cards: [], logs }) })
    expect(Object.keys(world.logsByCardId)).toHaveLength(0)
    expect(world.loggingEpoch).toBe(EPOCH_LOG_AT)
  })
})
