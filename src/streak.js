import { supabase } from './supabase'

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00')
  const d2 = new Date(dateStr2 + 'T00:00:00')
  return Math.round((d2 - d1) / 86400000)
}

// The streak the user should SEE right now, computed from how long ago they last
// studied — because the stored `profile.streak` only changes when they study, so
// a broken streak would otherwise keep showing the old number. A freeze covers
// one missed day; if more days were missed than freezes available, it's broken.
export function liveStreak(profile) {
  if (!profile || !profile.streak || !profile.last_studied_on) return 0
  const gap = daysBetween(profile.last_studied_on, todayStr())
  if (gap <= 1) return profile.streak            // studied today or yesterday
  const missed = gap - 1
  return missed <= (profile.streak_freezes || 0) ? profile.streak : 0
}

// A plain-language status for the current streak, so the freeze mechanic is
// visible instead of silently "never losing". Returns one of:
//   'none'      – no active streak
//   'safe'      – already studied today
//   'due_today' – studied yesterday; study today to extend it (or it breaks tomorrow)
//   'frozen'    – a missed day is being covered by a streak freeze right now
//   'broken'    – too many days missed; the streak is gone
export function streakStatus(profile) {
  if (!profile || !profile.streak || !profile.last_studied_on) return 'none'
  const gap = daysBetween(profile.last_studied_on, todayStr())
  if (gap <= 0) return 'safe'
  if (gap === 1) return 'due_today'
  const missed = gap - 1
  return missed <= (profile.streak_freezes || 0) ? 'frozen' : 'broken'
}

export async function updateStreak(profile) {
  const today = todayStr()

  if (profile.last_studied_on === today) {
    return { streak: profile.streak, streak_freezes: profile.streak_freezes, last_studied_on: today }
  }

  let streak = profile.streak || 0
  let freezes = profile.streak_freezes || 0

  if (!profile.last_studied_on) {
    streak = 1
  } else {
    const gap = daysBetween(profile.last_studied_on, today)
    if (gap === 1) {
      streak += 1
    } else {
      // gap > 1 → one or more missed days. A freeze covers each missed day; if
      // there aren't enough freezes the streak breaks and restarts at today.
      const missed = gap - 1
      if (freezes >= missed) {
        freezes -= missed
        streak += 1
      } else {
        streak = 1
      }
    }
  }

  const updates = { streak, streak_freezes: freezes, last_studied_on: today }
  await supabase.from('profiles').update(updates).eq('id', profile.id)
  return updates
}