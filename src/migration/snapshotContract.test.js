import { describe, it, expect } from 'vitest'
import {
  SNAPSHOT_IDENTITY_FIELDS, SNAPSHOT_VERSION, SNAPSHOT_NOTE,
  gate3MutableFields, snapshotRestoreFields, snapshotFieldContract,
  assertSnapshotCoversMutations, buildSnapshot,
} from './snapshotContract'
import { conversionPatch } from './legacyClaimMigration'
import { replayCard } from './legacyClaimReplay'
import { CARD_COLUMNS, loadWorld } from './reviewLogContract'

// The SNAPSHOT/RESTORE contract.
//
// The pre-apply snapshot is the entire rollback guarantee, and it was
// incomplete: `CARD_COLUMNS` was written for the classifier, the snapshot was
// built from whatever rows that list loaded, and `learning_step` — written by
// BOTH mutators, read by neither classifier nor manifest — was not in it. A
// card part-way through the FSRS learning steps would have been reset by Apply
// with no record of where it had been, in a file that called itself "complete
// original card rows".
//
// These tests derive the required set from the mutators themselves, so the
// contract cannot be satisfied by transcribing a list and letting it rot.

// A PostgREST-shaped fake: returns ONLY the columns it was asked for. Same
// shape as reviewLogContract.test.js's, and for the same reason — a fake that
// ignores the select would reproduce the blind spot rather than catch it.
function makeFetchTable({ cards, logs }) {
  const project = (rows) => (columnsCsv) => {
    const wanted = columnsCsv.split(',').map(c => c.trim()).filter(Boolean)
    return rows.map(row => {
      const projected = {}
      for (const c of wanted) projected[c] = row[c]
      return projected
    })
  }
  const cardReader = project(cards)
  const logReader = project(logs)
  return async (table, columnsCsv) => {
    if (table === 'cards') return cardReader(columnsCsv)
    if (table === 'review_logs') return logReader(columnsCsv)
    throw new Error('unexpected table ' + table)
  }
}

describe('the mutable set is derived from the mutators, not transcribed', () => {
  it('contains every key conversionPatch actually produces', () => {
    const produced = Object.keys(conversionPatch({ id: 'c', user_id: 'u', created_at: 'x' }))
    for (const field of produced) expect(gate3MutableFields()).toContain(field)
  })

  it('contains every key replayCard actually writes back', () => {
    const produced = Object.keys(replayCard([
      { grade: 2, reviewed_at: '2026-08-01T00:00:00.000Z', previous_state: 'new' },
    ]).updates)
    for (const field of produced) expect(gate3MutableFields()).toContain(field)
  })

  // The proof that it is a derivation and not a stored list: hand it a mutator
  // that writes a field nobody has thought of, and the contract must notice.
  it('picks up a field a mutator starts writing, with nobody updating a list', () => {
    const fields = gate3MutableFields({
      conversion: (card) => ({ ...conversionPatch(card), fsrs_params_id: null }),
    })
    expect(fields).toContain('fsrs_params_id')
    expect(snapshotFieldContract(CARD_COLUMNS, {
      conversion: (card) => ({ ...conversionPatch(card), fsrs_params_id: null }),
    }).missing).toEqual(['fsrs_params_id'])
  })

  it('includes the identity needed to put a row back', () => {
    for (const field of SNAPSHOT_IDENTITY_FIELDS) {
      expect(snapshotRestoreFields()).toContain(field)
    }
  })
})

describe('the loaded columns cover every field Gate 3 can mutate', () => {
  it('nothing the migration writes is missing from the snapshot', () => {
    expect(snapshotFieldContract(CARD_COLUMNS).missing).toEqual([])
    expect(assertSnapshotCoversMutations()).toBe(true)
  })

  // THE DEFECT, stated directly.
  it('learning_step is mutable, and is captured', () => {
    expect(conversionPatch({ id: 'c', created_at: 'x' })).toHaveProperty('learning_step')
    expect(replayCard([{ grade: 2, reviewed_at: '2026-08-01T00:00:00.000Z' }]).updates)
      .toHaveProperty('learning_step')
    expect(gate3MutableFields()).toContain('learning_step')
    expect(CARD_COLUMNS).toContain('learning_step')
  })

  it('the pre-fix column list is REJECTED, naming the field it would lose', () => {
    const shipped = CARD_COLUMNS.filter(c => c !== 'learning_step')
    expect(snapshotFieldContract(shipped).missing).toEqual(['learning_step'])
    expect(() => assertSnapshotCoversMutations(shipped)).toThrow(/learning_step/)
    expect(() => assertSnapshotCoversMutations(shipped)).toThrow(/only sanctioned restore source/)
  })

  // Minimality, the other direction: the snapshot is a file full of user data,
  // so a column with no restorative purpose has to justify itself.
  it('captures nothing beyond what a rollback needs', () => {
    expect(snapshotFieldContract(CARD_COLUMNS).extra).toEqual([])
  })
})

// ── The rollback regression ─────────────────────────────────────────────────
//
// A seeded card that was graded Again and is sitting mid-way through the
// relearning steps: learning_step 2, which is neither zero nor the default.
// Apply would rewrite it to 1. The snapshot has to hold the 2.
const EPOCH_AT = '2026-07-02T10:59:25.501Z'

const EPOCH_CARD = {
  id: 'epoch-1', user_id: 'u0', vocab_id: 'v0',
  created_at: '2026-07-01T18:41:02.117Z',
  state: 'review', reps: 1, lapses: 0, stability: 61.4, difficulty: 4.8,
  learned: true, is_easy: false, elapsed_days: 21, scheduled_days: 60,
  interval_days: 60, learning_step: 0, last_review: EPOCH_AT,
  due_at: '2026-08-31T10:59:25.501Z',
  prior_known_at: null, prior_source: null, verified_at: null,
}
const EPOCH_LOGS = [
  { id: 'e0', card_id: 'epoch-1', grade: 2, reviewed_at: EPOCH_AT, previous_state: 'new' },
]

// Seeded (no `new ->` transition anywhere), then genuinely reviewed twice.
const MID_STEP_SEED = {
  id: 'seed-relearning', user_id: 'u1', vocab_id: 'v1',
  created_at: '2026-08-04T12:00:00.000Z',
  state: 'relearning', reps: 2, lapses: 1, stability: 21, difficulty: 5.7,
  learned: true, is_easy: false, elapsed_days: 0, scheduled_days: 0,
  interval_days: 0, learning_step: 2, last_review: '2026-08-05T09:20:00.000Z',
  due_at: '2026-08-05T09:30:00.000Z',
  prior_known_at: null, prior_source: null, verified_at: null,
}
const MID_STEP_LOGS = [
  { id: 's0', card_id: 'seed-relearning', grade: 0, reviewed_at: '2026-08-05T09:00:00.000Z', previous_state: 'review' },
  { id: 's1', card_id: 'seed-relearning', grade: 2, reviewed_at: '2026-08-05T09:20:00.000Z', previous_state: 'relearning' },
]

// An untouched seed carrying a non-default learning_step too: conversion
// resets it to 0, so it has the same exposure by a different route.
const UNTOUCHED_SEED = {
  id: 'seed-untouched', user_id: 'u1', vocab_id: 'v2',
  created_at: '2026-08-04T12:00:00.000Z',
  state: 'review', reps: 0, lapses: 0, stability: 21, difficulty: 5,
  learned: true, is_easy: false, elapsed_days: 0, scheduled_days: 21,
  interval_days: 21, learning_step: 3, last_review: null,
  due_at: '2026-08-25T12:00:00.000Z',
  prior_known_at: null, prior_source: null, verified_at: null,
}

const WORLD = {
  cards: [EPOCH_CARD, MID_STEP_SEED, UNTOUCHED_SEED],
  logs: [...EPOCH_LOGS, ...MID_STEP_LOGS],
}

const loadFixture = (cardColumns) => loadWorld({
  fetchTable: makeFetchTable(WORLD),
  ...(cardColumns ? { cardColumns } : {}),
})

describe('a non-default learning_step survives in the snapshot', () => {
  it('Apply really would change it — otherwise this proves nothing', () => {
    expect(replayCard(MID_STEP_LOGS).updates.learning_step).toBe(1)
    expect(MID_STEP_SEED.learning_step).toBe(2)
    expect(conversionPatch(UNTOUCHED_SEED).learning_step).toBe(0)
    expect(UNTOUCHED_SEED.learning_step).toBe(3)
  })

  it('both rows are actionable, so both are inside the guarantee', async () => {
    const world = await loadFixture()
    const snap = buildSnapshot({ ...world, generatedAt: 'frozen' })
    expect(snap.row_count).toBe(2)
    expect(snap.replay_count).toBe(1)
    expect(snap.convert_count).toBe(1)
    // The untouched genuine card is not backed up, because it is never touched.
    expect(snap.rows.map(r => r.id)).not.toContain('epoch-1')
  })

  it('the snapshot preserves the pre-migration value of every mutable column', async () => {
    const world = await loadFixture()
    const snap = buildSnapshot({ ...world, generatedAt: 'frozen' })
    const byId = Object.fromEntries(snap.rows.map(r => [r.id, r]))

    expect(byId['seed-relearning'].learning_step).toBe(2)
    expect(byId['seed-untouched'].learning_step).toBe(3)

    // And not just that field: every restore field is present on every row,
    // holding exactly what production held.
    for (const original of [MID_STEP_SEED, UNTOUCHED_SEED]) {
      const saved = byId[original.id]
      for (const field of snap.restore_fields) {
        expect(saved).toHaveProperty(field)
        expect(saved[field]).toEqual(original[field])
      }
    }
  })

  it('the file enumerates what it claims to restore', async () => {
    const world = await loadFixture()
    const snap = buildSnapshot({ ...world, generatedAt: 'frozen' })
    expect(snap.restore_fields).toEqual(snapshotRestoreFields())
    expect(snap.version).toBe(SNAPSHOT_VERSION)
    expect(snap.note).toBe(SNAPSHOT_NOTE)
    // The claim is precise now: the old note said "Complete original card rows".
    expect(snap.note).not.toContain('Complete original card rows')
    expect(snap.note).toContain('restore_fields')
  })

  // The shipped bug, driven end to end: load exactly as the pre-fix code did
  // and the snapshot refuses to be written rather than silently omitting a
  // column it promised to preserve.
  it('REFUSES to write a snapshot built from the pre-fix column list', async () => {
    const shipped = CARD_COLUMNS.filter(c => c !== 'learning_step')
    const world = await loadFixture(shipped)
    // The rows really did arrive without it — this is the PostgREST behaviour
    // that caused the original incident, on a different column.
    expect(world.cards[1]).not.toHaveProperty('learning_step')
    expect(() => buildSnapshot({ ...world, generatedAt: 'frozen' }))
      .toThrow(/learning_step/)
    expect(() => buildSnapshot({ ...world, generatedAt: 'frozen' }))
      .toThrow(/could not roll back/)
  })
})

describe('the snapshot digest is canonical', () => {
  it('is stable across two builds of the same world', async () => {
    const a = buildSnapshot({ ...(await loadFixture()), generatedAt: 'one' })
    const b = buildSnapshot({ ...(await loadFixture()), generatedAt: 'two' })
    expect(a.sha256).toBe(b.sha256)
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when a captured value changes', async () => {
    const a = buildSnapshot({ ...(await loadFixture()), generatedAt: 'one' })
    const moved = {
      cards: WORLD.cards.map(c => (c.id === 'seed-relearning' ? { ...c, learning_step: 1 } : c)),
      logs: WORLD.logs,
    }
    const world = await loadWorld({ fetchTable: makeFetchTable(moved) })
    const b = buildSnapshot({ ...world, generatedAt: 'one' })
    expect(b.sha256).not.toBe(a.sha256)
  })
})
