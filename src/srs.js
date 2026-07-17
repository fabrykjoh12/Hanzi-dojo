import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs'

const params = generatorParameters({ request_retention: 0.9, enable_fuzz: true })
const f = fsrs(params)

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

// schedule(card, grade) → { updates, stay, gap }
//
// updates: object to spread into the Supabase cards update/insert
// stay:    true if the card should re-enter the session queue (learning/relearning)
// gap:     position in queue at which to reinsert (if stay=true)
export function schedule(card, grade) {
  const rating = GRADE_TO_RATING[grade]
  const now = new Date()
  const fsrsCard = buildFsrsCard(card)
  const scheduling = f.repeat(fsrsCard, now)
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

// previewLabels(card) → { 0: string, 1: string, 2: string, 3: string }
// Returns human-readable interval labels for each of the four grade buttons.
export function previewLabels(card) {
  const now = new Date()
  const fsrsCard = buildFsrsCard(card)
  const scheduling = f.repeat(fsrsCard, now)
  return {
    0: formatLabel(scheduling[Rating.Again].card, now),
    1: formatLabel(scheduling[Rating.Hard].card, now),
    2: formatLabel(scheduling[Rating.Good].card, now),
    3: formatLabel(scheduling[Rating.Easy].card, now),
  }
}
