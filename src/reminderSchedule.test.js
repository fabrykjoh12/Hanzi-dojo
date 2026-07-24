import { describe, it, expect } from 'vitest'
import { localParts, shouldNotifyAt, intendedLocalHour } from './reminderSchedule'

// Every instant is explicit — no Date.now(), so these read the same in any CI
// timezone and on any day.
const at = (iso) => new Date(iso)

describe('localParts', () => {
  it('reads the wall clock in a positive-offset zone', () => {
    // 2026-01-15T23:30Z is already the next day in Tokyo (UTC+9).
    expect(localParts(at('2026-01-15T23:30:00Z'), 'Asia/Tokyo')).toEqual({ day: '2026-01-16', hour: 8 })
  })

  it('reads the wall clock in a negative-offset zone', () => {
    expect(localParts(at('2026-01-15T02:30:00Z'), 'America/New_York')).toEqual({ day: '2026-01-14', hour: 21 })
  })

  it('renders local midnight as hour 0, not 24', () => {
    expect(localParts(at('2026-01-15T15:00:00Z'), 'Asia/Tokyo').hour).toBe(0)
  })

  it('falls back to UTC when the zone is missing or unknown', () => {
    const utc = { day: '2026-01-15', hour: 7 }
    expect(localParts(at('2026-01-15T07:00:00Z'), null)).toEqual(utc)
    expect(localParts(at('2026-01-15T07:00:00Z'), 'Not/AZone')).toEqual(utc)
  })

  it('returns null for an unusable instant', () => {
    expect(localParts('not a date', 'Asia/Tokyo')).toBe(null)
  })
})

describe('shouldNotifyAt', () => {
  it('notifies at the target hour in a positive-offset zone', () => {
    // 09:00 in Berlin (UTC+1 in January) is 08:00 UTC.
    expect(shouldNotifyAt(at('2026-01-15T08:00:00Z'), 'Europe/Berlin', 9, null)).toBe(true)
    expect(shouldNotifyAt(at('2026-01-15T09:00:00Z'), 'Europe/Berlin', 9, null)).toBe(false)
  })

  it('notifies at the target hour in a negative-offset zone', () => {
    // 09:00 in New York (UTC-5 in January) is 14:00 UTC.
    expect(shouldNotifyAt(at('2026-01-15T14:20:00Z'), 'America/New_York', 9, null)).toBe(true)
    expect(shouldNotifyAt(at('2026-01-15T08:00:00Z'), 'America/New_York', 9, null)).toBe(false)
  })

  it('holds the same local hour across a DST change (no ±1h drift)', () => {
    // July: Berlin is UTC+2, so 09:00 local is 07:00 UTC — a different UTC
    // hour than in January, but the same hour on the learner's clock.
    expect(shouldNotifyAt(at('2026-07-15T07:00:00Z'), 'Europe/Berlin', 9, null)).toBe(true)
    expect(shouldNotifyAt(at('2026-07-15T08:00:00Z'), 'Europe/Berlin', 9, null)).toBe(false)
  })

  it('falls back to the plain UTC hour when the profile has no timezone', () => {
    expect(shouldNotifyAt(at('2026-01-15T09:00:00Z'), null, 9, null)).toBe(true)
    expect(shouldNotifyAt(at('2026-01-15T08:00:00Z'), null, 9, null)).toBe(false)
    expect(shouldNotifyAt(at('2026-01-15T09:00:00Z'), '', 9, null)).toBe(true)
  })

  it('does not send twice in the same local hour', () => {
    const sent = at('2026-01-15T08:05:00Z')
    expect(shouldNotifyAt(at('2026-01-15T08:45:00Z'), 'Europe/Berlin', 9, sent)).toBe(false)
    // Same clock hour a day later is a fresh reminder.
    expect(shouldNotifyAt(at('2026-01-16T08:05:00Z'), 'Europe/Berlin', 9, sent)).toBe(true)
  })

  it('accepts a lastSentAt read back as an ISO string', () => {
    expect(shouldNotifyAt(at('2026-01-15T08:45:00Z'), 'Europe/Berlin', 9, '2026-01-15T08:05:00.000Z')).toBe(false)
  })

  it('does not double-send during the repeated hour of a fall-back day', () => {
    // 2026-11-01 in New York: 01:00 local happens twice, at 05:00Z (EDT) and
    // 06:00Z (EST). The first run sends; the second must not.
    const first = at('2026-11-01T05:00:00Z')
    const second = at('2026-11-01T06:00:00Z')
    expect(localParts(first, 'America/New_York').hour).toBe(1)
    expect(localParts(second, 'America/New_York').hour).toBe(1)
    expect(shouldNotifyAt(first, 'America/New_York', 1, null)).toBe(true)
    expect(shouldNotifyAt(second, 'America/New_York', 1, first)).toBe(false)
  })

  it('rejects an unusable target hour or instant', () => {
    expect(shouldNotifyAt(at('2026-01-15T08:00:00Z'), 'Europe/Berlin', null, null)).toBe(false)
    expect(shouldNotifyAt(at('2026-01-15T08:00:00Z'), 'Europe/Berlin', 24, null)).toBe(false)
    expect(shouldNotifyAt('nonsense', 'Europe/Berlin', 9, null)).toBe(false)
  })
})

describe('intendedLocalHour', () => {
  it('reads a stored UTC hour as the local hour in a zone without DST', () => {
    // Shanghai is UTC+8 year-round: 01:00 UTC is the 09:00 the user picked.
    expect(intendedLocalHour(1, 'Asia/Shanghai', at('2026-07-01T00:00:00Z'))).toBe(9)
  })

  it('anchors a northern DST zone to standard time', () => {
    // 08:00 UTC is 09:00 in Berlin in winter (CET) and 10:00 in summer (CEST).
    expect(intendedLocalHour(8, 'Europe/Berlin', at('2026-01-01T00:00:00Z'))).toBe(9)
    expect(intendedLocalHour(8, 'Europe/Berlin', at('2026-07-01T00:00:00Z'))).toBe(9)
  })

  it('anchors a southern DST zone to standard time too', () => {
    // Sydney is UTC+10 standard / UTC+11 in (January) daylight time.
    expect(intendedLocalHour(23, 'Australia/Sydney', at('2026-01-01T00:00:00Z'))).toBe(9)
  })

  it('passes the hour through unchanged when no zone is stored', () => {
    expect(intendedLocalHour(9, null, at('2026-01-01T00:00:00Z'))).toBe(9)
  })

  it('returns null for a missing or out-of-range stored hour', () => {
    expect(intendedLocalHour(null, 'Europe/Berlin', at('2026-01-01T00:00:00Z'))).toBe(null)
    expect(intendedLocalHour(24, 'Europe/Berlin', at('2026-01-01T00:00:00Z'))).toBe(null)
  })
})
