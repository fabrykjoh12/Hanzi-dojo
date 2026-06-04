import { supabase } from './supabase'

// Returns YYYY-MM-DD for the user's local date
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00')
  const d2 = new Date(dateStr2 + 'T00:00:00')
  return Math.round((d2 - d1) / 86400000)
}

// Call this when the user studies. Updates streak based on last_studied date.
// Returns the updated profile fields.
export async function updateStreak(profile) {
  const today = todayStr()

  // Already studied today — no change
  if (profile.last_studied === today) {
    return { streak: profile.streak, streak_freezes: profile.streak_freezes, last_studied: today }
  }

  let streak = profile.streak || 0
  let freezes = profile.streak_freezes || 0

  if (!profile.last_studied) {
    // First time ever studying
    streak = 1
  } else {
    const gap = daysBetween(profile.last_studied, today)
    if (gap === 1) {
      // Studied yesterday — continue streak
      streak += 1
    } else if (gap > 1) {
      // Missed day(s) — try to use a freeze
      if (freezes > 0) {
        freezes -= 1
        streak += 1 // freeze saves the streak
      } else {
        streak = 1 // streak broken, restart
      }
    }
  }

  const updates = { streak, streak_freezes: freezes, last_studied: today }
  await supabase.from('profiles').update(updates).eq('id', profile.id)
  return updates
}