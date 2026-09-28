// Account-scoped legacy outbox for story and analytics writes. Review grading
// now uses reviewJournal.js. Old grades are retained because they lack the
// original snapshot and reset generation needed for safe recovery.
import { outboxAdd, outboxAll, outboxDelete, outboxCount } from './offline'

// ── Enqueue (called from the offline branch of Study / Stories) ─────────────
export function enqueueGrade(op) {
  // Stamp a stable id so a replayed grade can be recognised server-side.
  // Assigned after the spread so an explicit `opId: undefined` can't erase it.
  return outboxAdd({ kind: 'grade', ...op, opId: (op && op.opId) || newOpId() })
}

// A client-generated uuid identifying one grade, so the same grade written
// twice (a retried flush, two tabs racing) is applied once. Falls back to a
// random v4-shaped string where crypto.randomUUID is missing — the column only
// needs to be unique, not cryptographically strong.
export function newOpId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* fall through to the manual builder */ }
  const hex = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-'
    else if (i === 14) out += '4'
    else if (i === 19) out += hex[8 + Math.floor(Math.random() * 4)]
    else out += hex[Math.floor(Math.random() * 16)]
  }
  return out
}

export function enqueueStoryRead(op) {
  return outboxAdd({ kind: 'storyRead', ...op })
}

// A session's story-chapter reward claimed while offline. Replaying calls the
// claim_story_reward RPC, whose daily claim row makes any repeat a no-op — so
// a claim queued on one device and also made online on another still unlocks
// exactly one chapter.
export function enqueueStoryClaim(op) {
  return outboxAdd({ kind: 'storyClaim', ...op })
}

// Analytics events queued while offline. Reuses this outbox (no second queue);
// on flush they're best-effort inserted and ALWAYS dropped — analytics is lossy
// by design and must never wedge the critical grade writes.
export function enqueueAnalytics(event) {
  return outboxAdd({ kind: 'analytics', event })
}

export async function pendingWrites(ownerId) {
  if (!ownerId) return outboxCount()
  return (await outboxAll()).filter(row => {
    const owners = [row.op?.userId, row.op?.event?.user_id].filter(Boolean)
    return owners.length && owners.every(owner => owner === ownerId)
  }).length
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────
// Per-day study counts contributed by grade ops, for daily_activity increments.
export function dayCountsOf(ops) {
  const days = {}
  ops.forEach((op) => {
    if (!op || op.kind !== 'grade' || !op.day) return
    const d = days[op.day] || (days[op.day] = { studied: 0, new: 0, learning: 0, review: 0 })
    d.studied += 1
    if (op.state === 'new') d.new += 1
    else if (op.state === 'review') d.review += 1
    else d.learning += 1
  })
  return days
}

// The session's running study tally after grading a card in `cardState`.
// Pure — the caller commits the result only once the write succeeds, so a
// failed grade never inflates the day's counts.
export function nextActivityCounts(cur, cardState) {
  const c = cur || {}
  return {
    studied: (c.studied || 0) + 1,
    newC: (c.newC || 0) + (cardState === 'new' ? 1 : 0),
    review: (c.review || 0) + (cardState === 'review' ? 1 : 0),
    learn: (c.learn || 0) + (cardState === 'new' || cardState === 'review' ? 0 : 1),
  }
}

// ── The one grade write ─────────────────────────────────────────────────────
// Is this error "the grade_card function isn't there"? PostgREST answers a call
// to an unknown function with PGRST202 / a 404. Review writes fail closed;
// story-reward compatibility still uses this classifier.
export function isMissingRpc(error) {
  if (!error) return false
  if (error.code === 'PGRST202' || error.code === '404') return true
  const msg = String(error.message || '') + ' ' + String(error.details || '') + ' ' + String(error.hint || '')
  const m = msg.toLowerCase()
  return m.indexOf('could not find the function') !== -1 ||
         m.indexOf('does not exist') !== -1 ||
         m.indexOf('schema cache') !== -1 ||
         m.indexOf('not found') !== -1
}

// Once the RPC is known to be absent, stop probing for it every single grade.
// Reset per page load (a deploy/migration lands on the next load anyway).
let rpcUnavailable = false

export function resetGradeRpcProbe() {
  rpcUnavailable = false
}

// Write one graded card. Returns:
//   { ok, cardId, logId, alreadyApplied, viaRpc, activityWritten, pendingLogId, error }
//
// Preferred path: the `grade_card` RPC — card row + review log + daily activity
// in a single transaction, de-duped on `opId`.
// Compatibility for existing callers only; Study uses reviewJournal v2.
// Missing RPCs never fall back to separate card/log/activity writes.
export async function gradeCardWrite(supabase, payload) {
  const p = payload || {}
  if (!rpcUnavailable) {
    const { data, error } = await supabase.rpc('grade_card', {
      p_vocab_id: p.vocabId || null,
      p_updates: p.updates || {},
      p_card_id: p.cardId || null,
      p_log: p.log || null,
      p_activity: p.activity || null,
      p_op_id: p.opId || null,
    })
    const row = Array.isArray(data) ? data[0] : data
    if (!error && row && row.card_id) {
      return {
        ok: true,
        cardId: row.card_id,
        logId: row.log_id || null,
        alreadyApplied: !!row.already_applied,
        // Whether THIS call created the card row (false when another device had
        // already made it) — undo only removes a row its own grade created.
        inserted: !!row.inserted,
        viaRpc: true,
        activityWritten: !!p.activity,
        pendingLogId: null,
        error: null,
      }
    }
    // A real failure (RLS, constraint, network) must surface. Only an absent
    // function — or a backend answering without doing anything — is unavailable.
    if (error && !isMissingRpc(error)) {
      return { ok: false, cardId: null, logId: null, viaRpc: true, activityWritten: false, pendingLogId: null, error }
    }
    rpcUnavailable = true
  }
  return { ok: false, cardId: null, logId: null, viaRpc: true, activityWritten: false,
    pendingLogId: null, error: { message: 'The review service is unavailable. Please try again later.' } }
}

// ── Replay one op. `ok` = it may leave the outbox; `reconcile` = its day counts
// still need folding into daily_activity by the caller. ──────────────────────
async function replayOp(supabase, op) {
  if (!op) return { ok: true, reconcile: false } // unknown/empty — drop it, don't wedge the queue
  if (op.kind === 'analytics') {
    // Best-effort, and ALWAYS drop — never retry/block on analytics.
    try {
      const p = supabase.from('analytics_events').insert(op.event)
      if (p && typeof p.then === 'function') await p
    } catch { /* lossy by design */ }
    return { ok: true, reconcile: false }
  }
  if (op.kind === 'storyRead') {
    const { error } = await supabase
      .from('story_reads')
      .upsert({ user_id: op.userId, story_id: op.storyId }, { onConflict: 'user_id,story_id' })
    return { ok: !error, reconcile: false }
  }
  if (op.kind === 'storyClaim') {
    // The RPC is idempotent per (track, claim_date). A claim whose day has a
    // redeemed row already just reports that state — never a second unlock.
    // Owner identity is checked at execution time, including if authentication
    // changes while the request is in flight. An absent RPC retains the claim.
    const { error } = await supabase.rpc('claim_story_reward_v2', {
      p_user_id: op.userId,
      p_language: op.language,
      p_system: op.system,
      p_claim_date: op.claimDate,
      p_story_id: op.storyId || null,
    })
    return { ok: !error, reconcile: false }
  }
  // Legacy intents lack a server snapshot and generation. They cannot be
  // safely replayed after reset or another device's review; retain for recovery.
  if (op.kind === 'grade') return { ok: false, reconcile: false }
  return { ok: true, reconcile: false }
}

let flushing = false

// Replay the whole outbox against Supabase. Ops that fail are left in place for
// the next attempt. daily_activity is reconciled once at the end over exactly
// the ops that flushed this pass.
export async function flushOutbox(supabase, ownerId) {
  if (flushing || !supabase || !ownerId) return { flushed: 0 }
  flushing = true
  try {
    const rows = (await outboxAll()) || []
    if (rows.length === 0) return { flushed: 0 }
    rows.sort((a, b) => a.id - b.id)

    let flushed = 0
    for (const row of rows) {
      const op = row.op
      const owners = [op?.userId, op?.event?.user_id].filter(Boolean)
      if (!owners.length || owners.some(owner => owner !== ownerId)) continue
      const res = await replayOp(supabase, op)
      if (!res.ok) continue
      await outboxDelete(row.id)
      flushed += 1
    }
    return { flushed }
  } catch {
    return { flushed: 0 }
  } finally {
    flushing = false
  }
}
