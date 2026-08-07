// Should returning to Home refetch the dashboard?
//
// Home used to reload profile + track + every count on EVERY navigation back
// to it, so closing Settings cost a full dashboard load. But skipping the
// refetch wholesale is worse than the waterfall: a stale queue count after a
// study session is a correctness bug, not a slow screen.
//
// So the rule is inverted, and deliberately conservative: refetch unless we
// are coming back from a screen that provably cannot have changed anything.
// A screen missing from that list just means a needless refetch (today's
// behaviour) — never a stale number.

// Screens that only read. Everything else — studying, drilling, reading,
// resetting, adding a word from the dictionary — can move a count.
export const READ_ONLY_VIEWS = [
  'settings', 'grammar', 'youtube', 'dashboard', 'hq', 'dev',
]

// Even after a read-only detour, refetch if the data has just gone cold:
// cards fall due while the app sits open.
export const HOME_STALE_MS = 10 * 60 * 1000

function dayKey(ms) {
  const d = new Date(ms)
  return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()
}

// `now` defaults to the clock (house style — cf. isCardDue in srs.js), so
// callers in a component don't read Date.now() themselves; the specs pass it
// explicitly, which is what keeps this testable.
export function shouldRefreshHome(fromView, lastLoadedAt, now = Date.now()) {
  if (!lastLoadedAt) return true
  if (!READ_ONLY_VIEWS.includes(fromView)) return true
  // Local midnight is when new cards and the day's reviews roll over, so a
  // load from "yesterday" is stale however recent it looks.
  if (dayKey(now) !== dayKey(lastLoadedAt)) return true
  return now - lastLoadedAt >= HOME_STALE_MS
}
