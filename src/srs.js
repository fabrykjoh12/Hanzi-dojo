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

// ── The local day grid ──────────────────────────────────────────────────────
// FSRS scores a review by how many CALENDAR days have passed since the last
// one, and ts-fsrs counts those days on the UTC calendar: `dateDiffInDays`
// builds `Date.UTC(getUTCFullYear(), getUTCMonth(), getUTCDate())` for each
// timestamp and subtracts. Its day boundary is UTC midnight.
//
// This app serves reviews on the LOCAL day boundary — see `endOfLocalDay`
// above, where a card scheduled for today becomes available at local midnight,
// deliberately, so reviews arrive with the daily new-card allotment.
//
// Two different day grids, and the gap is not cosmetic. Measured against
// ts-fsrs 5.4.1, a review card at stability 1.0 / difficulty 5, graded Good:
//
//   TZ=America/Los_Angeles, last review Mon 20:00 local
//     graded Tue 09:00 local — 13h later, the morning the app offers it:
//       elapsed_days 0  ->  stability 1.051, next interval 2d
//     graded Tue 20:00 local — a real 24h:
//       elapsed_days 1  ->  stability 4.233, next interval 4d
//
//   TZ=Pacific/Auckland, last review Mon 09:00 local
//     graded Mon 14:00 local — 5h later, the SAME local day:
//       elapsed_days 1  ->  stability 4.233
//
// So west of UTC an overnight review — the ordinary morning session — is scored
// as no elapsed time at all and stability growth is suppressed roughly
// fourfold; east of UTC a few hours on one local day are credited as a whole
// day and it is inflated. `isMastered` is `stability >= 21` days, so both land
// straight on the level-test gate and the mastery display, and both compound.
//
// The fix hands FSRS timestamps whose UTC calendar date IS the local calendar
// date, then converts its answer back.
//
// WHAT THIS CANNOT DISTURB, and why it is safe to do at this seam: the only
// date ts-fsrs reads to decide the next state is `last_review` (via
// `dateDiffInDays`); `card.due` is never consulted — every branch computes the
// next due as `date_scheduler(review_time, interval)`, which is exact
// millisecond addition with no truncation. So shifting `now` and shifting the
// result back by the same amount leaves every interval bit-identical. Only
// which calendar day an instant falls on changes, which is the entire point.
//
// Each timestamp is shifted by ITS OWN offset rather than one offset for both.
// That is what keeps the day count right across a DST boundary, where
// `last_review` and `now` genuinely sit at different offsets.
//
// Where the offset is zero — UTC, and Europe/London in winter — every shift is
// zero and behaviour is byte-identical to before this change.

/** Milliseconds to add to a Date so that UTC calendar arithmetic reads it as local. */
export function localGridShiftMs(date) {
  return -date.getTimezoneOffset() * 60000
}

/** Move an instant onto the local day grid: its UTC date becomes its local date. */
export function toLocalGrid(date) {
  return new Date(date.getTime() + localGridShiftMs(date))
}

/** Move an instant back off the grid, undoing the shift that put it there. */
export function fromLocalGrid(date, shiftMs) {
  return new Date(date.getTime() - shiftMs)
}

// Build an FSRS card object from a DB card row.
// New cards (id=null or state='new') start as empty cards.
// The existing `learning_step` column is repurposed to store FSRS's `learning_steps`
// (index within the learning-step sequence), since they represent the same concept.
//
// `gridNow` is `now` already moved onto the local day grid. `last_review` is put
// on the grid too, by its own offset — those two are what FSRS subtracts.
function buildFsrsCard(card, gridNow) {
  if (!card.id || card.state === 'new') {
    return createEmptyCard(gridNow)
  }
  return {
    due: new Date(card.due_at || gridNow),
    stability: card.stability || 0,
    difficulty: card.difficulty || 0,
    elapsed_days: card.elapsed_days || 0,
    scheduled_days: card.scheduled_days || 0,
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    learning_steps: card.learning_step || 0,
    state: TEXT_TO_STATE[card.state] ?? State.New,
    last_review: card.last_review ? toLocalGrid(new Date(card.last_review)) : null,
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
// options: { targetRetention, now } — optional. Omitting targetRetention (the
//          offline replay path in syncQueue.js, and any other caller without
//          the profile at hand) means "use this device's preference", which
//          defaults to today's behavior.
//
//          `now` is a TEST SEAM and nothing else: no production caller passes
//          it. It exists because the local-day-grid behaviour below cannot be
//          asserted otherwise — the defect it fixes is entirely about which
//          wall-clock instants a review falls between, and a test that cannot
//          choose those instants cannot see it. Kept as an option rather than a
//          module-level clock so it cannot leak between tests.
export function schedule(card, grade, options) {
  const rating = GRADE_TO_RATING[grade]
  const now = options && options.now ? new Date(options.now) : new Date()

  // Score the review on the LOCAL day grid, then bring the answer back to real
  // time. See the block above buildFsrsCard for what this fixes and why it
  // cannot change any interval.
  const shiftMs = localGridShiftMs(now)
  const gridNow = toLocalGrid(now)
  const fsrsCard = buildFsrsCard(card, gridNow)
  const scheduling = schedulerFor(resolveRetention(options)).repeat(fsrsCard, gridNow)
  const graded = scheduling[rating].card

  // Every Date FSRS hands back was computed from gridNow, so it comes off the
  // grid by the same shift. Undone here, once, rather than at each use below —
  // a caller must never see a grid timestamp.
  const nextCard = {
    ...graded,
    due: fromLocalGrid(new Date(graded.due), shiftMs),
    last_review: graded.last_review ? fromLocalGrid(new Date(graded.last_review), shiftMs) : null,
  }

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
  const now = options && options.now ? new Date(options.now) : new Date()

  // The SAME local day grid schedule() uses. This is not tidiness: the buttons
  // must not promise an interval the scheduler will not honour, and scoring the
  // preview on the UTC grid while grading on the local one is exactly how they
  // would diverge — by a whole elapsed day, on every overnight review.
  const shiftMs = localGridShiftMs(now)
  const gridNow = toLocalGrid(now)
  const fsrsCard = buildFsrsCard(card, gridNow)
  const scheduling = schedulerFor(resolveRetention(options)).repeat(fsrsCard, gridNow)
  const label = (rating) => formatLabel(
    { ...scheduling[rating].card, due: fromLocalGrid(new Date(scheduling[rating].card.due), shiftMs) },
    now,
  )
  return {
    0: label(Rating.Again),
    1: label(Rating.Hard),
    2: label(Rating.Good),
    3: label(Rating.Easy),
  }
}
