// The one definition of the number the navigation shows.
//
// It existed in one place and was derived inline there: the desktop rail
// (Sidebar.jsx) summed the three queue counts itself. A number shown in more
// than one chrome and derived in more than one chrome is a number that
// eventually disagrees with itself — and this one also has to agree with the
// Home hero, which is the same three counts again (docs/METRICS.md: one
// definition per displayed number).
//
// The mobile bottom bar carried it for one build and no longer does: on a real
// phone it made the bar read as a dashboard rather than a set of destinations.
// The rule below is unchanged and is still what the rail and Home go by; only
// one caller went away.
//
// Pure: no React, no Supabase, no colours. The chromes decide what a badge
// looks like; this decides whether there is one and what it says.

// How many cards are waiting right now — new + learning + due, exactly the
// total the Home hero prints.
//
// Returns null rather than 0, deliberately, in three cases:
//
//   · nothing is waiting — a cleared queue should look cleared, not scored.
//     The product removed streaks and XP for this reason; a "0" badge is the
//     same nag wearing a different hat.
//   · the counts have not arrived yet — every field is a placeholder zero at
//     that point, and a badge that appears a beat after the bar does is worse
//     than one that appears once.
//   · the fetch failed — `homeCounts` keeps the shape but the numbers are
//     meaningless, and Home already says so in words. The bar must not quietly
//     claim the queue is empty.
export function waitingCount(counts) {
  if (!counts || counts.failed || !counts.loaded) return null
  const n = (counts.newCount || 0) + (counts.learnCount || 0) + (counts.dueCount || 0)
  return n > 0 ? n : null
}

// Which nav entry carries a badge. One key — Flashcards — and the map is here
// rather than inside the rail so that stays a decision with a home.
//
// Stories deliberately has none: the unlocked chapter is already announced by
// the session recap and by Home's reward panel, and navigation that turns into
// a row of counters stops being navigation.
export function navBadge(key, counts) {
  return key === 'study' ? waitingCount(counts) : null
}

// What a screen reader says. "Cards" on its own when nothing is waiting — never
// "Cards, 0 waiting", which is the audible version of the badge we don't draw.
export function navItemLabel(label, badge) {
  return badge ? label + ', ' + badge + ' waiting' : label
}
