import { useState, useRef, useEffect } from 'react'
import { supabase } from './supabase'
import { getAudioUrl, playAudioEl } from './utils'
import { ensureAudio } from './audioCache'

// Audio for the study session, lifted out of Study.jsx verbatim so that file
// stays focused on the card/grading loop. Behavior is unchanged: same speed
// preference, same iOS-safe playback + fallback, same autoplay-on-flip, same
// current+next prefetch. Study still owns `queue`/`flipped` and passes them in.
//
// Returns { audioSpeed, audioBroken, playAudio, cycleSpeed, resetAudioBroken }.
// `resetAudioBroken` clears the broken flag when the card changes (Study calls
// it in the same spot it used to call setAudioBroken(false) — on grade + undo).

const SPEEDS = [1, 0.75, 0.5]

export function useStudyAudio({ queue, flipped, profile, session, onProfileUpdate }) {
  const audioRef = useRef(null)
  // TTS playback rate (1× / 0.75× / 0.5×), seeded from the saved preference.
  const [audioSpeed, setAudioSpeed] = useState(
    profile.audio_speed === 0.75 || profile.audio_speed === 0.5 ? profile.audio_speed : 1
  )
  const [audioBroken, setAudioBroken] = useState(false)   // current card's audio failed to load

  function playAudio() {
    const card = queue[0]
    if (!card?.vocab?.audio_path) return
    const url = getAudioUrl(card.vocab.audio_path)
    if (!url) return
    // ONE element, reused for every play — iOS caches a fallback-fetched clip
    // on the element so Replay works even when the direct load fails (see
    // playAudioEl). A fresh element per tap threw that away, which is why the
    // Replay button did nothing on iPhones.
    if (!audioRef.current) audioRef.current = new Audio()
    const el = audioRef.current
    el.pause()
    // Both: playbackRate for the already-loaded clip, defaultPlaybackRate so a
    // fresh load doesn't reset the speed back to 1x.
    el.playbackRate = audioSpeed
    el.defaultPlaybackRate = audioSpeed
    // Surface a broken/missing file instead of failing silently — "the sound
    // doesn't work" with no signal is undebuggable for the user. playAudioEl
    // already retries once via a blob fetch (works around iOS WebKit Range
    // quirks against the storage CDN) before giving up.
    playAudioEl(el, url, () => setAudioBroken(true))
  }

  function cycleSpeed() {
    setAudioSpeed(prev => {
      const next = SPEEDS[(SPEEDS.indexOf(prev) + 1) % SPEEDS.length]
      // Persist as a preference (best-effort) and patch the in-memory profile
      // so the choice survives reloads instead of resetting to 1×.
      supabase.from('profiles').update({ audio_speed: next }).eq('id', session.user.id).then(() => {})
      if (onProfileUpdate) onProfileUpdate({ audio_speed: next })
      return next
    })
  }

  useEffect(() => {
    if (flipped && queue.length > 0 && profile.audio_autoplay !== false) {
      playAudio()
    }
  }, [flipped])

  // Warm the current + next card's audio into an in-memory object URL so tap
  // playback works offline — on iOS especially, where a ranged network request
  // bypasses the SW cache and can't be awaited inside the play() gesture.
  useEffect(() => {
    [queue[0], queue[1]].forEach(c => {
      if (c && c.vocab && c.vocab.audio_path) ensureAudio(getAudioUrl(c.vocab.audio_path))
    })
  }, [queue])

  return {
    audioSpeed,
    audioBroken,
    playAudio,
    cycleSpeed,
    resetAudioBroken: () => setAudioBroken(false),
  }
}
