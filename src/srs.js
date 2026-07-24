import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs'

// ── Target retention (the "retention dial") ─────────────────────────────────
// FSRS schedules a card so that, when it comes due, you have roughly this
// probability of recalling it. Higher = shorter intervals, more reviews, less
// forgetting. Lower = longer intervals, fewer reviews, a little more forgetting.
// 0.9 is the ts-fsrs library default and what this app always used, so it stays
// the default here: a learner who never touches the dial sees identical intervals.
export const DEFAULT_TARGET_RETENTION = 0.9
export const MIN_TARGET_RETENTION = 0.8
export const MAX_TARGET_RETENTION = 0.95

// The three named presets the Settings dial offers. Plain language, no score to
// max out — just the trade-off, stated honestly.
export const RETENTION_PRESETS = [
  {
    key: 'relaxed',
    value: 0.85,
    label: 'Relaxed',
    blurb: 'Fewer reviews. You will forget a little more, and that is fine.',
  },
  {
    key: 'balanced',
    value: DEFAULT_TARGET_RETENTION,
    label: 'Balanced',
    blurb: 'The default. A steady amount of review for steady remembering.',
  },
  {
    key: 'thorough',
    value: 0.95,
    label: 'Thorough',
    blurb: 'More reviews, more often. You will forget less, but there is more to do.',
  },
]

// Snap any stored number onto the nearest preset, so the dial always shows a
// named choice even if the column holds a hand-edited value.
export function presetForRetention(value) {
  const r = normalizeTargetRetention(value)
  let best = RETENTION_PRESETS[0]
  for (const p of RETENTION_PRESETS) {
    if (Math.abs(p.value - r) < Math.abs(best.value - r)) best = p
  }
  return best
}

// Anything that isn't a real number inside the sane band falls back to the
// default. We deliberately do NOT clamp: a null/undefined/NaN/garbage value
// means "no preference expressed", and a wild value means something upstream is
// wrong — in both cases today's proven scheduling is the safest answer.
export function normalizeTargetRetention(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TARGET_RETENTION
  if (value < MIN_TARGET_RETENTION || value > MAX_TARGET_RETENTION) return DEFAULT_TARGET_RETENTION
  return value
}

// One FSRS instance per retention value. Building the parameters is cheap but
// not free, and grading happens on every card.
const schedulers = new Map()
function schedulerFor(retention) {
  const r = normalizeTargetRetention(retention)
  let inst = schedulers.get(r)
  if (!inst) {
    inst = fsrs(generatorParameters({ request_retention: r, enable_fuzz: true }))
    schedulers.set(r, inst)
  }
  return inst
}

// Device-local mirror of profiles.target_retention.
//
// The scheduler is a pure module with no Supabase access, and the live grading
// call site (Study.jsx) is out of scope for this change, so the chosen value is
// mirrored here when the learner picks it in Settings. Callers that DO have the
// profile in hand can always pass `{ targetRetention }` explicitly, which wins.
// The database column remains the source of truth; this is only a cache.
const RETENTION_STORAGE_KEY = 'srs:target-retention'
let preferred = null
let hydrated = false

function hydratePreferred() {
  hydrated = true
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(RETENTION_STORAGE_KEY)
    if (raw == null) return
    const parsed = Number(raw)
    preferred = Number.isFinite(parsed) ? normalizeTargetRetention(parsed) : null
  } catch {
    preferred = null
  }
}

// The retention this device schedules with when no explicit value is passed.
export function getTargetRetention() {
  if (!hydrated) hydratePreferred()
  return normalizeTargetRetention(preferred)
}

// Remember the learner's pick for subsequent scheduling on this device.
export function setTargetRetention(value) {
  const r = normalizeTargetRetention(value)
  preferred = r
  hydrated = true
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RETENTION_STORAGE_KEY, String(r))
  } catch {
    // A blocked/full localStorage must never break grading — the in-memory
    // value still applies for this session.
  }
  return r
}

// Test seam: forget the hydrated preference.
export function resetTargetRetention() {
  preferred = null
  hydrated = false
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(RETENTION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

// Resolve the retention for one scheduling call: an explicit option wins over
// the device preference, which falls back to the default.
function resolveRetention(options) {
  if (options && options.targetRetention != null) return normalizeTargetRetention(options.targetRetention)
  return getTargetRetention()
}

// App grade (0-3) → FSRS Rating enum
const GRADE_TO_RATING = {
  0: Rating.Again,
  1: Rating.Hard,
  2: Rating.Good,
  3: Rating.Easy,
}

// FSRS numeric state → text stored in DB
const STATE_TO_TEXT = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
}

// Text state from DB → FSRS numeric state
const TEXT_TO_STATE = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
}

// ── Due-window helpers ──────────────────────────────────────────────────────
// Anki-style day-based availability. A review card comes due on a whole DAY, so
// every review scheduled for today should be available from the local midnight
// rollover — the same moment the daily new-card allotment refreshes. Previously
// reviews used an exact `due_at <= now` comparison, so they trickled in through
// the day at whatever clock time they were last reviewed and none "arrived" at
// 00:00 like new cards did. Learning/relearning steps are intraday (minutes /
// hours, and are stored with due_at = now) so they keep the exact comparison.
export function endOfLocalDay(now = new Date()) {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d
}

// Is this card due to study right now?
//   review              → due at any point today (due_at <= end of local day)
//   learning/relearning → due_at <= now (intraday step)
export function isCardDue(card, now = new Date()) {
  const due = new Date(card.due_at)
  if (card.state === 'review') return due <= endOfLocalDay(now)
  if (card.state === 'learning' || card.state === 'relearning') return due <= now
  return false
}

// Build an FSRS card object from a DB card row.
// New cards (id=null or state='new') start as empty cards.
// The existing `learning_step` column is repurposed to store FSRS's `learning_steps`
// (index within the learning-step sequence), since they represent the same concept.
function buildFsrsCard(card) {
  const now = new Date()
  if (!card.id || card.state === 'new') {
    return createEmptyCard(now)
  }
  return {
    due: new Date(card.due_at || now),
    stability: card.stability || 0,
    difficulty: card.difficulty || 0,
    elapsed_days: card.elapsed_days || 0,
    scheduled_days: card.scheduled_days || 0,
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    learning_steps: card.learning_step || 0,
    state: TEXT_TO_STATE[card.state] ?? State.New,
    last_review: card.last_review ? new Date(card.last_review) : null,
  }
}

// Format a scheduled result card as a human-readable interval label.
function formatLabel(resultCard, now) {
  const due = new Date(resultCard.due)
  const diffMin = Math.round((due - now) / 60000)
  if (diffMin < 1440) {
    return Math.max(1, diffMin) + ' min'
  }
  const days = resultCard.scheduled_days
  return days === 1 ? '1 day' : days + ' days'
}

// schedule(card, grade, options?) → { updates, stay, gap }
//
// updates: object to spread into the Supabase cards update/insert
// stay:    true if the card should re-enter the session queue (learning/relearning)
// gap:     position in queue at which to reinsert (if stay=true)
// options: { targetRetention } — optional. Omitted (the offline replay path in
//          syncQueue.js, and any other caller without the profile at hand) means
//          "use this device's preference", which defaults to today's behavior.
export function schedule(card, grade, options) {
  const rating = GRADE_TO_RATING[grade]
  const now = new Date()
  const fsrsCard = buildFsrsCard(card)
  const scheduling = schedulerFor(resolveRetention(options)).repeat(fsrsCard, now)
  const nextCard = scheduling[rating].card

  const state = STATE_TO_TEXT[nextCard.state] ?? 'learning'
  const isLearning = nextCard.state === State.Learning || nextCard.state === State.Relearning
  const isReviewOrRelearning = nextCard.state === State.Review || nextCard.state === State.Relearning

  // Learning/relearning cards are saved with due_at=now so they always appear
  // immediately when the study screen reloads. Queue positioning within the session
  // is controlled by the gap value, not by due_at.
  // Review cards use the real FSRS-computed due date (days away).
  const due_at = isLearning ? now.toISOString() : new Date(nextCard.due).toISOString()

  const updates = {
    state,
    interval_days: nextCard.scheduled_days,
    due_at,
    is_easy: grade === 3,
    learned: isReviewOrRelearning,
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    last_review: nextCard.last_review ? new Date(nextCard.last_review).toISOString() : now.toISOString(),
    scheduled_days: nextCard.scheduled_days,
    elapsed_days: nextCard.elapsed_days,
    learning_step: nextCard.learning_steps,
  }

  const stay = nextCard.state === State.Learning || nextCard.state === State.Relearning
  let gap = 2
  if (stay) {
    const diffMin = Math.round((new Date(nextCard.due) - now) / 60000)
    gap = Math.max(2, Math.min(diffMin, 20))
  }

  return { updates, stay, gap }
}

// previewLabels(card, options?) → { 0: string, 1: string, 2: string, 3: string }
// Returns human-readable interval labels for each of the four grade buttons.
// Uses the same retention as schedule(), so the buttons never promise an
// interval the scheduler won't honour.
export function previewLabels(card, options) {
  const now = new Date()
  const fsrsCard = buildFsrsCard(card)
  const scheduling = schedulerFor(resolveRetention(options)).repeat(fsrsCard, now)
  return {
    0: formatLabel(scheduling[Rating.Again].card, now),
    1: formatLabel(scheduling[Rating.Hard].card, now),
    2: formatLabel(scheduling[Rating.Good].card, now),
    3: formatLabel(scheduling[Rating.Easy].card, now),
  }
}
