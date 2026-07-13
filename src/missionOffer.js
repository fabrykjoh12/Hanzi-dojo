import { pickMission } from './chatMissions'

// Snapshot the session's touched words into a chat-mission offer, moved verbatim
// out of Study.jsx (was the `buildMissionOffer` closure that read component
// refs). Now pure: Study passes in the ref values, so the bucketing is testable.
//
// Inputs:
//   sessionVocab — [{ word, weak, review }] (one entry per grade this session)
//   vocab        — the level's vocab list, passed through for the mission's
//                  in-chat tap lookups
//   language, level — the active track, used to pick a matching mission
//
// Returns { mission, dayBuckets: { learned, weak, review }, vocab } when a
// mission matches today's words, or null when there were no words / no mission.
export function buildMissionOffer({ sessionVocab = [], vocab = [], language, level }) {
  const seen = new Map()
  sessionVocab.forEach(e => {
    const p = seen.get(e.word) || { weak: false, review: false }
    seen.set(e.word, { weak: p.weak || e.weak, review: p.review || e.review })
  })
  if (seen.size === 0) return null
  const dayBuckets = { learned: [], weak: [], review: [] }
  seen.forEach((val, w) => {
    if (val.weak) dayBuckets.weak.push(w)
    else if (val.review) dayBuckets.review.push(w)
    else dayBuckets.learned.push(w)
  })
  const picked = pickMission({ language, level, dayWords: [...seen.keys()], seed: seen.size })
  return picked ? { mission: picked, dayBuckets, vocab } : null
}
