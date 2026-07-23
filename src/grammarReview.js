// Data layer for grammar spaced practice: enroll a topic, read the due queue,
// and grade a drill — all against the `grammar_reviews` table. FSRS scheduling
// is reused verbatim from srs.js; this module only maps between the table's rows
// and schedule()'s `updates` bag.

import { supabase } from './supabase'
import { schedule, isCardDue } from './srs'
import { gradeFor } from './grammarDrill'
import { track as trackEvent, EVENTS } from './analytics'

const TABLE = 'grammar_reviews'
const SELECT =
  'topic_id, state, due_at, stability, difficulty, reps, lapses, last_review, scheduled_days, elapsed_days, learning_step'

// The grammar_reviews columns that FSRS drives. schedule() returns extra keys
// (interval_days / is_easy / learned) that this table intentionally omits, so we
// copy only these across.
const FSRS_COLUMNS = [
  'state', 'due_at', 'stability', 'difficulty', 'reps', 'lapses',
  'last_review', 'scheduled_days', 'elapsed_days', 'learning_step',
]

function pickFsrsColumns(updates) {
  const out = {}
  for (const k of FSRS_COLUMNS) if (k in updates) out[k] = updates[k]
  return out
}

// A grammar row is due when it's freshly enrolled ('new', never practiced) or
// its FSRS due date has arrived. srs.isCardDue treats 'new' as not-due (right for
// vocab New cards drawn from a daily allotment), but a topic the learner
// explicitly opted into should be practiceable straight away.
export function isGrammarRowDue(row, now = new Date()) {
  if (!row) return false
  if (row.state === 'new') return true
  return isCardDue(row, now)
}

// Enroll a topic. Idempotent by construction: the PK is
// (user_id, language, system, topic_id) and we upsert with ignoreDuplicates, so a
// re-tap or a re-visit can never reset an in-progress row. Do not replace with a
// read-then-insert.
export async function enrollTopic({ userId, track, topicId, now = Date.now() }) {
  const row = {
    user_id: userId,
    language: track.language,
    system: track.system,
    topic_id: topicId,
    state: 'new',
    due_at: new Date(now).toISOString(),
    reps: 0,
    lapses: 0,
  }
  const { error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'user_id,language,system,topic_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  try { trackEvent(EVENTS.GRAMMAR_ENROLLED, { topic: topicId, language: track.language }) } catch { /* analytics never breaks the flow */ }
  return { topicId }
}

// All of the user's enrolled rows for the active track (used to show enrolled
// state in the guide and to build the due queue).
export async function getEnrolledRows({ userId, track }) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .eq('language', track.language)
    .eq('system', track.system)
  if (error) throw new Error(error.message)
  return data || []
}

export async function getDueGrammar({ userId, track, now = new Date() }) {
  const rows = await getEnrolledRows({ userId, track })
  return rows.filter(r => isGrammarRowDue(r, now))
}

// Count for the Practice badge / Home nudge. Defensive: any failure (offline, or
// the table not yet migrated) yields 0 rather than breaking the home load.
export async function countDueGrammar({ userId, track, now = new Date() }) {
  try {
    const due = await getDueGrammar({ userId, track, now })
    return due.length
  } catch { return 0 }
}

// Grade one drill outcome and advance the topic's FSRS state. `correct` is the
// binary result (fill-in-the-blank is self-grading → Good / Again).
export async function gradeGrammar({ userId, track, topicId, row, correct }) {
  // srs.buildFsrsCard treats a row with no truthy `id` as a brand-new empty
  // card; grammar rows have a composite PK and no `id`, so we lend it the
  // topic_id as an id for non-new rows to keep progression intact.
  const seed = { ...row, id: row.topic_id || topicId }
  const { updates } = schedule(seed, gradeFor(correct))
  const patch = pickFsrsColumns(updates)
  const { error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('user_id', userId)
    .eq('language', track.language)
    .eq('system', track.system)
    .eq('topic_id', topicId)
  if (error) throw new Error(error.message)
  try { trackEvent(EVENTS.GRAMMAR_REVIEWED, { topic: topicId, correct }) } catch { /* ignore */ }
  return patch
}
