import { supabase } from './supabase'
import { levelInfo } from './xp'
import { toast } from './toast'

// One rulebook for account XP awards, used by Study AND every practice drill.
// Before this existed, the persist-XP block was copy-pasted across five drills
// and only Study granted the level-up streak-freeze reward — leveling up
// through Listening paid nothing.

// Level-ups award a streak freeze, capped so they can't be hoarded.
export const MAX_FREEZES = 5

// Pure: the result of adding `gain` XP at `prevXp` with `prevFreezes` banked.
// Returns { newXp, newLevel, leveled, freezes, freezesEarned }.
export function computeAward(prevXp, gain, prevFreezes) {
  const base = Math.max(0, Math.floor(prevXp || 0))
  const newXp = base + Math.max(0, Math.floor(gain || 0))
  const prevLevel = levelInfo(base).level
  const newLevel = levelInfo(newXp).level
  let freezes = prevFreezes || 0
  let freezesEarned = 0
  if (newLevel > prevLevel) {
    const before = freezes
    freezes = Math.min(MAX_FREEZES, before + (newLevel - prevLevel))
    freezesEarned = freezes - before
  }
  return { newXp, newLevel, leveled: newLevel > prevLevel, freezes, freezesEarned }
}

// Persist an award and patch the in-memory profile. Fire-and-forget on the
// network (XP must never block the UI); returns the computed result so callers
// can show "+N XP" / "Level up!" in their recap.
export function awardXp(session, profile, gain, onUpdate) {
  const res = computeAward(profile.total_xp, gain, profile.streak_freezes)
  const updates = { total_xp: res.newXp }
  if (res.freezesEarned > 0) updates.streak_freezes = res.freezes
  supabase.from('profiles').update(updates).eq('id', session.user.id).then(() => {})
  if (onUpdate) onUpdate(updates)
  // Celebrate the level-up in the moment (drills have no recap card for it).
  // Study grades through computeAward directly and shows its own recap instead.
  if (res.leveled) {
    toast({
      kind: 'level',
      accent: '#6E8466',
      title: 'Level ' + res.newLevel + ' reached',
      body: res.freezesEarned > 0
        ? '+' + res.freezesEarned + ' streak freeze' + (res.freezesEarned === 1 ? '' : 's') + ' earned'
        : 'Earned through real answers — nice work.',
    })
  }
  return res
}
