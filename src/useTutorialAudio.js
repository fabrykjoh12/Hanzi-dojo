import { useState, useRef, useEffect, useCallback } from 'react'
import { getAudioUrl, playAudioEl } from './utils'
import { claimPlayback, releasePlayback } from './audioPlayback'
import { nextSpeed } from './audioSpeed'

// Audio for the onboarding tutorial.
//
// Deliberately NOT useStudyAudio. That hook is right for a session — it writes
// the speed back to the learner's profile, prefetches the next card in the
// queue, and prefers the generated clip via a lookup — and every one of those
// is something the tutorial must not do: it runs before an account exists, so
// there is no profile to write and no session to read.
//
// So this is the small version. One element, the public bucket clip named by
// the fixture, a speed that lives for the length of the tutorial and is then
// forgotten, and nothing else. No Supabase, no queue, no persistence.
//
// Three rules the tutorial's audio has to keep, all of them about not leaving
// sound behind a screen the learner has left:
//
//   1. Nothing plays unless the learner asked for it. There is no autoplay on
//      reveal — the whole point of the pronunciation lesson is that the sound
//      arrives because a control was pressed.
//   2. Moving to another state stops whatever is playing. `stop()` is called on
//      every state change, not just when leaving a card.
//   3. A missing or broken clip is a visible state, never a blocked tutorial.
export function useTutorialAudio(audioPath) {
  const elRef = useRef(null)
  const [speed, setSpeed] = useState(1)
  // WHICH clip failed, not whether one did. Storing the url means a new card
  // is innocent by construction rather than by an effect that resets a flag —
  // and the reset can never land a render late.
  const [brokenUrl, setBrokenUrl] = useState(null)

  const url = audioPath ? getAudioUrl(audioPath) : null
  const broken = Boolean(url) && brokenUrl === url

  const stop = useCallback(() => {
    const el = elRef.current
    if (!el) return
    // Invalidate any fallback fetch still in the air, or it comes back and
    // plays into a screen nobody is looking at (see playAudioEl).
    el.__hdAttempt = -1
    try { el.pause() } catch { /* already detached */ }
    releasePlayback(el)
  }, [])

  const play = useCallback(() => {
    if (!url) return
    if (!elRef.current) elRef.current = new Audio()
    const el = elRef.current
    claimPlayback(el)
    el.pause()
    el.playbackRate = speed
    el.defaultPlaybackRate = speed
    playAudioEl(el, url, () => setBrokenUrl(url))
  }, [url, speed])

  const cycleSpeed = useCallback(() => setSpeed(prev => nextSpeed(prev)), [])

  // Give the element back when the tutorial goes away — same four steps as the
  // study hook, for the same reason: a word must not go on speaking from a
  // screen the learner has left.
  useEffect(() => {
    return () => {
      const el = elRef.current
      if (!el) return
      elRef.current = null
      el.__hdAttempt = -1
      try { el.pause() } catch { /* already detached */ }
      releasePlayback(el)
      el.onerror = null
      if (el.__hdBlobUrl) {
        try { URL.revokeObjectURL(el.__hdBlobUrl) } catch { /* already revoked */ }
        el.__hdBlobUrl = null
        el.__hdBlobFor = null
      }
    }
  }, [])

  return { url, speed, broken, play, cycleSpeed, stop }
}
