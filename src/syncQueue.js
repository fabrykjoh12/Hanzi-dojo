// Offline write queue — durable outbox of writes made while offline, replayed
// in order when the network returns.
//
// Design goals:
//  - The ONLINE path never touches this file. Study/Stories only enqueue when
//    `navigator.onLine` is false, so normal use is unaffected.
//  - Replay is idempotent where it matters: card writes are upserts to a known
//    next-state; new cards are de-duped by (user_id, vocab_id) before insert;
//    XP is reconciled as a delta against the live server total. Worst case on a
//    mid-flush crash is a little LOST XP (an op left in the outbox retries),
//    never inflated progress.
//  - supabase is passed in (not imported) so the pure helpers below stay
//    unit-testable without the client or its env.

import { outboxAdd, outboxAll, outboxDelete, outboxCount } from './offline'
import { levelInfo } from './xp'

const MAX_FREEZES = 5

// ── Enqueue (called from the offline branch of Study / Stories) ─────────────
export function enqueueGrade(op) {
  return outboxAdd({ kind: 'grade', ...op })
}

export function enqueueStoryRead(op) {
  return outboxAdd({ kind: 'storyRead', ...op })
}

// Analytics events queued while offline. Reuses this outbox (no second queue);
// on flush they're best-effort inserted and ALWAYS dropped — analytics is lossy
// by design and must never wedge the critical grade/XP writes.
export function enqueueAnalytics(event) {
  return outboxAdd({ kind: 'analytics', event })
}

export function pendingWrites() {
  return outboxCount()
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────
// Sum of XP deltas across a set of outbox ops.
export function xpTotalOf(ops) {
  return ops.reduce((n, op) => n + (op && op.xpDelta ? op.xpDelta : 0), 0)
}

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

// New level + freeze award for adding `delta` XP on top of `prevXp` — mirrors
// xpService.computeAward but without pulling in supabase/toast.
export function reconcileAward(prevXp, delta, prevFreezes) {
  const base = Math.max(0, Math.floor(prevXp || 0))
  const newXp = base + Math.max(0, Math.floor(delta || 0))
  const prevLevel = levelInfo(base).level
  const newLevel = levelInfo(newXp).level
  const updates = { total_xp: newXp }
  if (newLevel > prevLevel) {
    updates.streak_freezes = Math.min(MAX_FREEZES, (prevFreezes || 0) + (newLevel - prevLevel))
  }
  return updates
}

// ── Replay one op. Returns true if it may be removed from the outbox. ────────
async function replayOp(supabase, op) {
  if (!op) return true // unknown/empty — drop it, don't wedge the queue
  if (op.kind === 'analytics') {
    // Best-effort, and ALWAYS drop (return true) — never retry/block on analytics.
    try {
      const p = supabase.from('analytics_events').insert(op.event)
      if (p && typeof p.then === 'function') await p
    } catch { /* lossy by design */ }
    return true
  }
  if (op.kind === 'storyRead') {
    const { error } = await supabase
      .from('story_reads')
      .upsert({ user_id: op.userId, story_id: op.storyId }, { onConflict: 'user_id,story_id' })
    return !error
  }
  if (op.kind === 'grade') {
    let cardId = op.cardId
    if (cardId) {
      const { error } = await supabase.from('cards').update(op.updates).eq('id', cardId)
      if (error) return false
    } else {
      // A card the user met for the first time offline. It may already exist
      // (studied online meanwhile, or a prior partial flush inserted it), so
      // de-dupe on (user_id, vocab_id) before inserting.
      const { data: existing } = await supabase
        .from('cards').select('id')
        .eq('user_id', op.userId).eq('vocab_id', op.vocabId).maybeSingle()
      if (existing && existing.id) {
        cardId = existing.id
        const { error } = await supabase.from('cards').update(op.updates).eq('id', cardId)
        if (error) return false
      } else {
        const { data, error } = await supabase
          .from('cards')
          .insert({ user_id: op.userId, vocab_id: op.vocabId, ...op.updates })
          .select('id').single()
        if (error) return false
        cardId = data && data.id
      }
    }
    // review_logs is analytics (retention tuning) — best-effort, never blocks.
    if (op.log && cardId) {
      await supabase.from('review_logs').insert({
        user_id: op.userId, card_id: cardId, vocab_id: op.vocabId, ...op.log,
      })
    }
    return true
  }
  return true
}

let flushing = false

// Replay the whole outbox against Supabase. Ops that fail are left in place for
// the next attempt. XP and daily_activity are reconciled once at the end over
// exactly the ops that flushed this pass.
export async function flushOutbox(supabase) {
  if (flushing || !supabase) return { flushed: 0 }
  flushing = true
  try {
    const rows = (await outboxAll()) || []
    if (rows.length === 0) return { flushed: 0 }
    rows.sort((a, b) => a.id - b.id)

    const flushedOps = []
    let userId = null
    for (const row of rows) {
      const op = row.op
      const ok = await replayOp(supabase, op)
      if (!ok) continue
      await outboxDelete(row.id)
      flushedOps.push(op)
      if (op && op.userId) userId = op.userId
    }

    if (flushedOps.length > 0 && userId) {
      await reconcile(supabase, userId, flushedOps)
    }
    return { flushed: flushedOps.length }
  } catch {
    return { flushed: 0 }
  } finally {
    flushing = false
  }
}

// Fold the flushed ops' XP + day counts into the live server rows. All
// best-effort: a failure here loses a little XP/calendar count, never data.
async function reconcile(supabase, userId, ops) {
  const xp = xpTotalOf(ops)
  if (xp > 0) {
    try {
      const { data } = await supabase
        .from('profiles').select('total_xp, streak_freezes').eq('id', userId).single()
      const updates = reconcileAward(data ? data.total_xp : 0, xp, data ? data.streak_freezes : 0)
      await supabase.from('profiles').update(updates).eq('id', userId)
    } catch { /* XP is best-effort even online */ }
  }

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
