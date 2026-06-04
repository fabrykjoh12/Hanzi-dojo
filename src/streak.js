import { supabase } from './supabase'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00')
  const d2 = new Date(dateStr2 + 'T00:00:00')
  return Math.round((d2 - d1) / 86400000)
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
    } else if (gap > 1) {
      if (freezes > 0) {
        freezes -= 1
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