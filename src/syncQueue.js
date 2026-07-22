// Offline write queue — durable outbox of writes made while offline, replayed
// in order when the network returns — plus the single grade-write helper both
// the online screen and the replay path go through (`gradeCardWrite`).
//
// Design goals:
//  - The ONLINE path only touches `gradeCardWrite`. Study/Stories still enqueue
//    exclusively when `navigator.onLine` is false, so normal use is unaffected.
//  - One grade = one transaction. `gradeCardWrite` calls the `grade_card` RPC,
//    which writes the card row, the review log and the day's activity together.
//  - Replay is idempotent: every queued grade carries a stable `opId`, and the
//    RPC turns a repeat into a no-op. Where the RPC is unavailable the older
//    de-dupe rules still apply (card de-duped by (user_id, vocab_id)).
//  - supabase is passed in (not imported) so the pure helpers below stay
//    unit-testable without the client or its env.

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

// Analytics events queued while offline. Reuses this outbox (no second queue);
// on flush they're best-effort inserted and ALWAYS dropped — analytics is lossy
// by design and must never wedge the critical grade writes.
export function enqueueAnalytics(event) {
  return outboxAdd({ kind: 'analytics', event })
}

export function pendingWrites() {
  return outboxCount()
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
// to an unknown function with PGRST202 / a 404. That is the expected state until
// the owner applies the migration, so it must fall back, not surface an error.
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
// Fallback (migration not applied yet): exactly the writes the screen used to
// make — the card write is awaited and fatal, the log and the activity upsert
// stay best-effort and never block the grade. `pendingLogId` resolves with the
// log's id when that non-blocking insert lands, so undo can still remove it.
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
    // function — or a backend answering the call without doing anything, which
    // is indistinguishable from absent — drops to the legacy path.
    if (error && !isMissingRpc(error)) {
      return { ok: false, cardId: null, logId: null, viaRpc: true, activityWritten: false, pendingLogId: null, error }
    }
    rpcUnavailable = true
  }
  return legacyGradeWrite(supabase, p)
}

// The pre-RPC write path, kept verbatim in behavior so an unapplied migration
// changes nothing the learner can see.
async function legacyGradeWrite(supabase, p) {
  let cardId = p.cardId
  let inserted = false
  if (cardId) {
    const { error } = await supabase.from('cards').update(p.updates).eq('id', cardId)
    if (error) return { ok: false, cardId: null, logId: null, viaRpc: false, activityWritten: false, pendingLogId: null, error }
  } else {
    // A card met for the first time. It may already exist (studied online
    // meanwhile, or a prior partial flush inserted it), so de-dupe on
    // (user_id, vocab_id) before inserting.
    const { data: existing } = await supabase
      .from('cards').select('id')
      .eq('user_id', p.userId).eq('vocab_id', p.vocabId).maybeSingle()
    if (existing && existing.id) {
      cardId = existing.id
      const { error } = await supabase.from('cards').update(p.updates).eq('id', cardId)
      if (error) return { ok: false, cardId: null, logId: null, viaRpc: false, activityWritten: false, pendingLogId: null, error }
    } else {
      const { data, error } = await supabase
        .from('cards')
        .insert({ user_id: p.userId, vocab_id: p.vocabId, ...p.updates })
        .select('id').single()
      if (error) return { ok: false, cardId: null, logId: null, viaRpc: false, activityWritten: false, pendingLogId: null, error }
      cardId = data && data.id
      inserted = true
    }
  }

  // review_logs is history for FSRS tuning — best-effort, never blocks a grade.
  let pendingLogId = null
  if (p.log && cardId) {
    pendingLogId = Promise.resolve(
      supabase.from('review_logs').insert({
        user_id: p.userId, card_id: cardId, vocab_id: p.vocabId, ...p.log,
      }).select('id').single()
    ).then(({ data }) => (data && data.id) || null).catch(() => null)
  }

  // Only absolute ('set') counts can be replayed safely without a transaction.
  // Increment mode (offline replay) is reported unwritten so `flushOutbox`
  // folds those days in one reconcile pass, exactly as it did before.
  let activityWritten = false
  if (p.activity && (p.activity.mode || 'set') === 'set') {
    activityWritten = true
    supabase.from('daily_activity').upsert({
      user_id: p.userId,
      activity_date: p.activity.date,
      studied_cards: p.activity.studied,
      new_cards: p.activity.new,
      learning_cards: p.activity.learning,
      review_cards: p.activity.review,
    }, { onConflict: 'user_id,activity_date' }).then(() => {})
  }

  return { ok: true, cardId, logId: null, alreadyApplied: false, inserted, viaRpc: false, activityWritten, pendingLogId, error: null }
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
  if (op.kind === 'grade') {
    // Same transaction the online screen uses. `opId` makes a repeat a no-op,
    // so a flush interrupted after the write cannot double-count on retry.
    const counts = op.day ? dayCountsOf([op])[op.day] : null
    const res = await gradeCardWrite(supabase, {
      userId: op.userId,
      cardId: op.cardId || null,
      vocabId: op.vocabId,
      updates: op.updates,
      log: op.log || null,
      activity: counts
        ? { mode: 'increment', date: op.day, studied: counts.studied, new: counts.new, learning: counts.learning, review: counts.review }
        : null,
      opId: op.opId || null,
    })
    // Without the RPC the day counts were not written — flush reconciles them.
    return { ok: res.ok, reconcile: res.ok && !res.activityWritten }
  }
  return { ok: true, reconcile: false }
}

let flushing = false

// Replay the whole outbox against Supabase. Ops that fail are left in place for
// the next attempt. daily_activity is reconciled once at the end over exactly
// the ops that flushed this pass.
export async function flushOutbox(supabase) {
  if (flushing || !supabase) return { flushed: 0 }
  flushing = true
  try {
    const rows = (await outboxAll()) || []
    if (rows.length === 0) return { flushed: 0 }
    rows.sort((a, b) => a.id - b.id)

    let flushed = 0
    // Only ops whose day counts the RPC did NOT write (the legacy fallback
    // path) are folded in below — replaying through the RPC already did it.
    const unreconciled = []
    let userId = null
    for (const row of rows) {
      const op = row.op
      const res = await replayOp(supabase, op)
      if (!res.ok) continue
      await outboxDelete(row.id)
      flushed += 1
      if (res.reconcile) unreconciled.push(op)
      if (op && op.userId) userId = op.userId
    }

    if (unreconciled.length > 0 && userId) {
      await reconcile(supabase, userId, unreconciled)
    }
    return { flushed }
  } catch {
    return { flushed: 0 }
  } finally {
    flushing = false
  }
}

// Fold the flushed ops' day counts into the live server rows. Best-effort: a
// failure here loses a little calendar count, never data.
async function reconcile(supabase, userId, ops) {
  const days = dayCountsOf(ops)
  for (const day of Object.keys(days)) {
    const inc = days[day]
    try {
      const { data } = await supabase
        .from('daily_activity').select('studied_cards, new_cards, learning_cards, review_cards')
        .eq('user_id', userId).eq('activity_date', day).maybeSingle()
      const cur = data || {}
      await supabase.from('daily_activity').upsert({
        user_id: userId,
        activity_date: day,
        studied_cards: (cur.studied_cards || 0) + inc.studied,
        new_cards: (cur.new_cards || 0) + inc.new,
        learning_cards: (cur.learning_cards || 0) + inc.learning,
        review_cards: (cur.review_cards || 0) + inc.review,
      }, { onConflict: 'user_id,activity_date' })
    } catch { /* calendar counts are cosmetic */ }
  }
}
