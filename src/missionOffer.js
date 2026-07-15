import { pickMission } from './chatMissions'
import { normalizeVocabForm } from './storyReading'

// Snapshot the session's touched words into a chat-mission offer, moved verbatim
// out of Study.jsx (was the `buildMissionOffer` closure that read component
// refs). Now pure: Study passes in the ref values, so the bucketing is testable.
//
// Inputs:
//   sessionVocab — [{ word, weak, review }] (one entry per grade this session)
//   vocab        — the level's vocab list (word + reading), used for tap lookups
//                  AND to alias kanji↔kana: mission text is kana while stored
//                  vocab is kanji (学校 vs がっこう), so every word set here is
//                  expanded with its reading or nothing ever matches.
//   knownWords   — words the learner has a card for (any state). A mission is
//                  only offered when EVERY target word is known or was met
//                  today — the chat must never teach through unknown words.
//   language, level — the active track, used to pick a matching mission
//
// Returns { mission, dayBuckets: { learned, weak, review }, vocab } when an
// all-known mission exists, or null (the offer simply hides).
export function buildMissionOffer({ sessionVocab = [], vocab = [], knownWords = [], language, level }) {
  const seen = new Map()
  sessionVocab.forEach(e => {
    const p = seen.get(e.word) || { weak: false, review: false }
    seen.set(e.word, { weak: p.weak || e.weak, review: p.review || e.review })
  })
  if (seen.size === 0) return null

  // word → [word, reading] alias expansion, so kana mission words match the
  // kanji vocabulary they came from.
  const aliases = new Map()
  ;(vocab || []).forEach(v => {
    const w = normalizeVocabForm(v.word)
    const r = normalizeVocabForm(v.reading || '')
    const list = [w]
    if (r && r !== w) list.push(r)
    aliases.set(w, list)
  })
  const expand = (words) => {
    const out = new Set()
    words.forEach(w => {
      const n = normalizeVocabForm(w)
      ;(aliases.get(n) || [n]).forEach(a => out.add(a))
    })
    return out
  }

  const dayBuckets = { learned: [], weak: [], review: [] }
  seen.forEach((val, w) => {
    const key = val.weak ? 'weak' : (val.review ? 'review' : 'learned')
    // Buckets carry both spellings so the chat UI's kana text highlights.
    expand([w]).forEach(a => dayBuckets[key].push(a))
  })

  const dayWords = expand([...seen.keys()])
  const known = expand(knownWords)
  dayWords.forEach(w => known.add(w))

  const picked = pickMission({ language, level, dayWords: [...dayWords], knownWords: known, seed: seen.size })
  return picked ? { mission: picked, dayBuckets, vocab } : null
}
