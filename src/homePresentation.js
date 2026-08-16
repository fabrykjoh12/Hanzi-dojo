export function homeQueueSummary(counts = {}) {
  const dueCount = counts.dueCount || 0
  const learnCount = counts.learnCount || 0
  const newCount = counts.newCount || 0
  const failed = Boolean(counts.failed)
  const reviewCount = dueCount + learnCount
  const totalReady = reviewCount + newCount
  return { totalReady, reviewCount, newCount, clear: !failed && totalReady === 0, failed }
}

export function homeProgressPct(learned, totalWords) {
  return totalWords > 0 ? (learned / totalWords) * 100 : 0
}

// Locked motion timings for Home and the dock (asserted by unit + e2e specs so
// they can't drift by a stray edit). `press` lives in CSS (.hd-press-deep,
// 160ms); `page` is the section settle (.hd-home-rise); `nav` is the dock's
// sliding indicator; `reduced` is the ceiling any reduced-motion state change
// may take.
export const HOME_MOTION = Object.freeze({
  press: 160,
  nav: 260,
  page: 460,
  reduced: 130,
})

export function homeDailyStage({ counts = {}, daily } = {}) {
  const queue = homeQueueSummary(counts)
  if (!queue.clear) return 'cards'
  if (daily === undefined) return 'story'
  if (daily === null) return 'caught-up'
  if (!daily.completedToday) return 'story'
  if ((counts.grammarDueCount || 0) > 0) return 'practice'
  return 'complete'
}

function localDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return date.getFullYear() + '-' + month + '-' + day
}

export function storyReadStateForDate(reads = [], dateStr) {
  const readTodayIds = new Set()
  const readBeforeTodayIds = new Set()
  for (const read of reads || []) {
    if (!read || !read.story_id) continue
    if (localDateKey(read.read_at) === dateStr) readTodayIds.add(read.story_id)
    else readBeforeTodayIds.add(read.story_id)
  }
  return { readTodayIds, readBeforeTodayIds }
}
