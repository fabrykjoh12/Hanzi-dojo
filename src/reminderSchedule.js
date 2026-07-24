// Timezone-correct daily review reminders.
//
// `send-review-reminders.mjs` runs hourly and used to compare the current UTC
// hour against `profiles.reminder_hour_utc`, so a learner outside UTC was
// reminded at an arbitrary local time and everyone in a DST zone drifted by an
// hour twice a year. With `profiles.timezone` recorded by the client, the
// decision becomes "is it the target hour on this user's own wall clock?".
//
// Pure and side-effect-free (every instant is passed in) so the sender's one
// interesting decision is unit-testable without a clock, a network, or a DB.
// All conversion goes through `Intl.DateTimeFormat` with a `timeZone` — no
// hand-rolled offset arithmetic, no date library.

function utcParts(date) {
  const day = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  return { day, hour: date.getUTCHours() }
}

// Local wall-clock `{ day: 'YYYY-MM-DD', hour: 0-23 }` for an instant in a
// timezone. A missing or unrecognized timezone falls back to UTC — the old
// behavior — so a profile with no stored zone keeps working rather than being
// dropped. Returns null only when the instant itself is unusable.
export function localParts(instant, timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (!date || Number.isNaN(date.getTime())) return null
  if (!timeZone) return utcParts(date)
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    }).formatToParts(date)
  } catch {
    // An unknown IANA zone (stale/garbled value) must never wedge the sender.
    return utcParts(date)
  }
  const found = {}
  for (const p of parts) found[p.type] = p.value
  const hour = Number(found.hour)
  if (!found.year || !found.month || !found.day || !Number.isFinite(hour)) return utcParts(date)
  return { day: `${found.year}-${found.month}-${found.day}`, hour: hour % 24 }
}

// Should this user be reminded on this run?
//
//   nowUtc          instant of the run
//   timezone        IANA zone from profiles.timezone (null → UTC fallback)
//   targetLocalHour the hour, on their clock, they asked to be reminded at
//   lastSentAt      when we last reminded them (null if never)
//
// Idempotent by construction: a second run inside the same local hour of the
// same local day is a no-op, which also covers the repeated 01:00 of a
// fall-back DST day (two distinct UTC instants, one local hour).
export function shouldNotifyAt(nowUtc, timezone, targetLocalHour, lastSentAt = null) {
  if (!Number.isInteger(targetLocalHour) || targetLocalHour < 0 || targetLocalHour > 23) return false
  const now = localParts(nowUtc, timezone)
  if (!now) return false
  if (now.hour !== targetLocalHour) return false
  if (!lastSentAt) return true
  const last = localParts(lastSentAt, timezone)
  if (!last) return true
  return !(last.day === now.day && last.hour === now.hour)
}

// `reminder_hour_utc` stores a UTC hour that Settings derived from the local
// hour the user picked, using whatever offset happened to be in effect that
// day — so the local hour it maps to slides by one across every DST change.
// Recover a stable intended local hour by reading the stored UTC hour through
// the zone's *standard-time* offset: DST is always the hour(s)-ahead reading,
// so of the two candidate anchors (mid-winter / mid-summer, which covers both
// hemispheres) the standard one is the one the other sits ahead of.
//
// Exact for a preference saved during standard time, an hour off for one saved
// during DST — but never drifting afterwards. With no stored zone the value is
// returned unchanged, which `shouldNotifyAt`'s UTC fallback then compares
// against the UTC hour exactly like before.
export function intendedLocalHour(reminderHourUtc, timeZone, referenceUtc = new Date()) {
  if (!Number.isInteger(reminderHourUtc) || reminderHourUtc < 0 || reminderHourUtc > 23) return null
  if (!timeZone) return reminderHourUtc
  const ref = referenceUtc instanceof Date ? referenceUtc : new Date(referenceUtc)
  const year = Number.isNaN(ref.getTime()) ? new Date().getUTCFullYear() : ref.getUTCFullYear()
  const winter = localParts(Date.UTC(year, 0, 15, reminderHourUtc), timeZone)
  const summer = localParts(Date.UTC(year, 6, 15, reminderHourUtc), timeZone)
  if (!winter || !summer) return reminderHourUtc
  if (winter.hour === summer.hour) return winter.hour
  const winterAhead = (winter.hour - summer.hour + 24) % 24
  const summerAhead = (summer.hour - winter.hour + 24) % 24
  return winterAhead > summerAhead ? winter.hour : summer.hour
}
