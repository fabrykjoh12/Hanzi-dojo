// Durable, account-scoped review intents. The server owns scheduler truth;
// this journal makes retries survive interrupted requests and application reloads.
// Every mutation commits to IndexedDB BEFORE a request or visible advancement.
import { hasGenuineObservation } from './knowledgeState'
import { reviewCreate, reviewRecords, reviewUpdate, reviewDeleteMany, reviewRetiredIds, outboxAll } from './offline'

const listeners = new Set()
let channel
function notify(userId, broadcast = true) {
  for (const listener of listeners) { try { listener(userId) } catch { /* observers cannot veto durable writes */ } }
  if (broadcast) { try { channel?.postMessage({ userId }) } catch { /* optional cross-tab notification */ } }
}
export function subscribeReviewChanges(listener) {
  listeners.add(listener)
  if (!channel && typeof window !== 'undefined') {
    try {
      channel = new BroadcastChannel('hanzi-review-journal')
      channel.onmessage = event => notify(event.data?.userId, false)
    } catch { /* private webviews may disable BroadcastChannel */ }
  }
  return () => listeners.delete(listener)
}
const pending = row => row.status === 'pending' || row.status === 'undo_pending'
const conflict = error => error?.code === '40001' || String(error?.message || '').includes('REVIEW_CONFLICT')
const retiredPatch = (row, id) => ({ retiredCardId: id || row.retiredCardId || null, retiredCardIds: [...new Set([...reviewRetiredIds(row), id].filter(Boolean))] })
const errorText = error => String(error?.message || 'Review could not be confirmed. Try again when connected.')
function result(row, { offline = false, error = null } = {}) {
  const status = ['retired', 'resolved'].includes(row?.status) ? 'conflict' : row?.status || 'failed'
  return {
    ok: status === 'applied' && !!row.card || status === 'undone' && !!row.card || offline && status === 'pending',
    status, pending: !!row && pending(row), durable: !!row, opId: row?.opId,
    card: row?.card || null, cardId: row?.card?.id || row?.intent.cardId || null,
    logId: row?.logId || null, alreadyApplied: !!row?.alreadyApplied,
    error: error || row?.error || null,
  }
}
async function update(row, patch) {
  const next = await reviewUpdate(row.opId, row.userId, patch, row)
  notify(row.userId)
  return next
}

async function send(client, row) {
  const undo = row.status === 'undo_pending'
  if (!pending(row)) return result(row)
  const intent = row.intent
  let response
  try {
    response = await client.rpc(undo ? 'undo_grade_v2' : 'grade_card_v2', undo
      ? { p_op_id: row.opId, p_user_id: row.userId }
      : {
        p_vocab_id: intent.vocabId, p_card_id: intent.cardId || null,
        p_updates: intent.updates, p_log: intent.log, p_day: intent.day,
        p_op_id: row.opId, p_expected: intent.expected || null,
        p_user_id: row.userId, p_generation: intent.generation,
      })
  } catch (error) { response = { error } }
  if (response.error) {
    if (conflict(response.error)) return result(await update(row, { status: 'conflict', error: errorText(response.error) }))
    // Keep exact intent pending even for an unknown RPC. No weaker fallback.
    return result(row, { error: errorText(response.error) })
  }
  const data = Array.isArray(response.data) ? response.data[0] : response.data
  if (!data || !['applied', 'undone'].includes(data.status)) return result(row, { error: 'The server did not confirm this review. Please retry.' })
  const next = await update(row, {
    status: data.card ? data.status : 'retired',
    ...retiredPatch(row, data.card ? null : (data.card_id || row.card?.id || intent.cardId)),
    card: data.card || null, logId: data.log_id || null,
    alreadyApplied: !!data.already_applied, error: data.card ? null : 'This card changed after the review. Return Home to refresh.',
  })
  // Compact only same-identity settled receipts. Tombstones and distinct card
  // identities must survive repeated reset → restudy → reset sequences.
  if (next?.card && !pending(next)) {
    const rows = await reviewRecords(row.userId)
    const obsolete = rows.filter(old => old.opId !== next.opId && old.card?.id === next.card.id &&
      old.ordinal < next.ordinal && Number(old.card.revision) <= Number(next.card.revision) && !pending(old) && old.status !== 'retired' && reviewRetiredIds(old).length === 0)
    if (obsolete.length) await reviewDeleteMany(obsolete, row.userId)
  }
  return result(next)
}

export async function submitReview(client, intent, { online = true } = {}) {
  let row
  try {
    if (!intent?.userId || !intent?.opId || !intent?.vocabId) throw new Error('Review identity is missing. Return Home and try again.')
    row = await reviewCreate(intent)
    notify(intent.userId)
    if (!online) return result(row, { offline: true })
    const saved = await send(client, row)
    return { ...saved, ok: saved.ok && saved.status === 'applied' }
  } catch (error) { return { ...result(row), ok: false, error: errorText(error), status: conflict(error) ? 'conflict' : row?.status || 'failed' } }
}

export async function undoReview(client, userId, opId, { online = true } = {}) {
  let row
  try {
    row = (await reviewRecords(userId)).find(item => item.opId === opId)
    if (row?.status === 'undone') return result(row)
    if (!row || !['applied', 'undo_pending'].includes(row.status)) return { ...result(row), ok: false, error: 'This review can no longer be undone. Return Home to refresh.' }
    if (row.status === 'applied') row = await update(row, { status: 'undo_pending' })
    if (!online) return { ...result(row), ok: false, error: 'Undo is saved on this device. Reconnect to confirm it.' }
    return await send(client, row)
  } catch (error) { return { ...result(row), ok: false, error: errorText(error) } }
}

const recoveries = new Map()
export function recoverReviews(client, userId) {
  if (!userId) return Promise.resolve([])
  if (recoveries.has(userId)) return recoveries.get(userId)
  const recovery = (async () => {
    const outcomes = []
    for (const row of (await reviewRecords(userId)).filter(pending).sort((a, b) => a.ordinal - b.ordinal)) {
      try { outcomes.push(await send(client, row)) } catch (error) { outcomes.push({ ok: false, error: errorText(error) }) }
    }
    return outcomes
  })().finally(() => recoveries.delete(userId))
  recoveries.set(userId, recovery)
  return recovery
}
export async function pendingReviewVocabIds(userId) {
  const ids = new Set((await reviewRecords(userId)).filter(row => pending(row) || row.status === 'conflict').map(row => row.intent.vocabId))
  for (const row of await outboxAll()) if (row.op?.kind === 'grade' && row.op.userId === userId) ids.add(row.op.vocabId)
  return ids
}
export async function pendingIntroductionCount(userId, day, track, observedCards = []) {
  const rows = await reviewRecords(userId)
  const observed = new Set(observedCards.filter(hasGenuineObservation).map(card => card.vocab_id))
  return rows.filter(row => row.status === 'pending' && row.intent.day === day && row.intent.state === 'new' && !row.intent.priorKnown &&
    (!track || row.intent.language === track.language && row.intent.system === track.system) && !observed.has(row.intent.vocabId)).length
}
export async function pendingReviewCount(userId) {
  return (await reviewRecords(userId)).filter(row => pending(row) || row.status === 'conflict').length
}
export async function reviewBaseline(userId) {
  return (await reviewRecords(userId)).filter(row => !pending(row))
}
function inScope(row, track, options) {
  const intent = row.intent
  if (intent.language !== track.language || intent.system !== track.system) return false
  if (options.level != null) return intent.level === options.level
  if (options.maxLevel != null) return intent.level == null ? !!options.includeUnleveled : intent.level <= options.maxLevel
  return true
}

export async function reconcileReviewCards(userId, cards, track, options = {}, { fresh = false, baseline = [], complete = false } = {}) {
  const byId = new Map((cards || []).map(card => [card.vocab_id, { ...card }]))
  let rows = (await reviewRecords(userId)).filter(row => inScope(row, track, options))
  if (fresh) {
    const oldByOp = new Map(baseline.map(row => [row.opId, row]))
    for (const row of rows) {
      const before = oldByOp.get(row.opId)
      const current = byId.get(row.intent.vocabId)
      if (before && row.status === 'conflict' && complete) {
        await update(before, { status: current ? 'resolved' : 'retired',
          ...retiredPatch(row, current?.id === row.intent.cardId ? null : row.intent.cardId),
          card: current || null })
      } else if (before && row.status !== 'conflict' && row.card && (!current || current.id !== row.card.id)) {
        await update(before, { status: 'retired', ...retiredPatch(row, row.card.id), card: null })
      }
    }
    rows = (await reviewRecords(userId)).filter(row => inScope(row, track, options))
  }
  for (const row of rows.sort((a, b) => a.ordinal - b.ordinal)) {
    let existing = byId.get(row.intent.vocabId)
    if (existing && reviewRetiredIds(row).includes(existing.id) && row.card?.id !== existing.id) {
      byId.delete(row.intent.vocabId)
      existing = undefined
    }
    if (row.status === 'retired') {
      if (existing?.id === row.retiredCardId) byId.delete(row.intent.vocabId)
    } else if (row.card && ['applied', 'undone', 'resolved'].includes(row.status)) {
      if (!existing || existing.id === row.card.id && Number(existing.revision || 0) < Number(row.card.revision || 0)) {
        byId.set(row.intent.vocabId, { ...existing, ...row.card, vocabulary: existing?.vocabulary || { id: row.intent.vocabId, level: row.intent.level } })
      }
    }
    if (pending(row)) {
      const card = byId.get(row.intent.vocabId)
      if (card) byId.set(row.intent.vocabId, { ...card, review_pending: true })
    }
  }
  const blocked = await pendingReviewVocabIds(userId)
  return [...byId.values()].map(card => blocked.has(card.vocab_id) ? { ...card, review_pending: true } : card)
}
