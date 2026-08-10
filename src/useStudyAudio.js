import { useState, useRef, useEffect } from 'react'
import { supabase } from './supabase'
import { playAudioEl } from './utils'
import { ensureAudio } from './audioCache'
import { nextSpeed, seedSpeed } from './audioSpeed'
import { autoplayDecision } from './studyAutoplay'
import { flashcardAudio } from './ttsAudio'
import { claimPlayback, releasePlayback } from './audioPlayback'

// Audio for the study session, lifted out of Study.jsx so that file stays
// focused on the card/grading loop: the speed preference, iOS-safe playback +
// fallback, card-entry autoplay, and the current+next prefetch. Study owns
// `queue`/`flipped` and whether the card view is being `presenting`-ed, and
// passes them in; the autoplay RULE is pure, in studyAutoplay.js.
//
// Returns { audioSpeed, audioBroken, playAudio, cycleSpeed, resetAudioBroken }.
// `resetAudioBroken` clears the broken flag when the card changes (Study calls
// it in the same spot it used to call setAudioBroken(false) — on grade + undo).



export function useStudyAudio({ queue, flipped, presenting, profile, session, onProfileUpdate }) {
  const audioRef = useRef(null)
  // TTS playback rate, seeded from the saved preference (audioSpeed.js).
  const [audioSpeed, setAudioSpeed] = useState(() => seedSpeed(profile.audio_speed))
  const [audioBroken, setAudioBroken] = useState(false)   // current card's audio failed to load

  function playAudio() {
    const card = queue[0]
    if (!card?.vocab) return
    // Prefer the generated clip for this word; fall back to the vocabulary
    // row's legacy audio_path when a level has not been regenerated yet, so
    // nothing goes silent between provider migrations.
    const url = flashcardAudio(card.vocab).word
    if (!url) return
    // ONE element, reused for every play — iOS caches a fallback-fetched clip
    // on the element so Replay works even when the direct load fails (see
    // playAudioEl). A fresh element per tap threw that away, which is why the
    // Replay button did nothing on iPhones.
    if (!audioRef.current) audioRef.current = new Audio()
    const el = audioRef.current
    // Silence anything else that is speaking (a slow clip, the example
    // sentence) before starting this one.
    claimPlayback(el)
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
      const next = nextSpeed(prev)
      // Persist as a preference (best-effort) and patch the in-memory profile
      // so the choice survives reloads instead of resetting to 1×.
      supabase.from('profiles').update({ audio_speed: next }).eq('id', session.user.id).then(() => {})
      if (onProfileUpdate) onProfileUpdate({ audio_speed: next })
      return next
    })
  }

  // Give the element back when this hook goes away.
  //
  // Until now there was no cleanup here at all: both effects returned nothing,
  // and the <audio> element lived in a ref that outlived them. That was
  // survivable while Study was unmounted on every navigation — the element went
  // with the component. It stops being survivable the moment the Cards tab
  // becomes a PERSISTENT root: hiding it (React's <Activity>) runs effect
  // cleanups, and with none to run a word would go on speaking from a tab the
  // learner had already left.
  //
  // Four things, in order, and all of them matter:
  //   1. pause, so the sound actually stops;
  //   2. releasePlayback, so the one-voice-at-a-time registry
  //      (audioPlayback.js) stops holding a reference to a dead element —
  //      without it, whatever plays next silences an element nobody can hear;
  //   3. invalidate the in-flight attempt. playAudioEl's fallback path fetches
  //      a blob and then plays it, guarded by `el.__hdAttempt`. A fetch still in
  //      the air when the tab hides would come back, see its attempt was still
  //      current, and start playing into the void. Setting the marker to -1
  //      makes every outstanding attempt read as stale;
  //   4. revoke the fallback blob URL, or each hide/show cycle leaks one.
  //
  // The ref is nulled so a re-show builds a fresh element rather than reviving
  // a torn-down one — one element per mount, so repeated cycles cannot
  // accumulate.
  useEffect(() => {
    return () => {
      const el = audioRef.current
      if (!el) return
      audioRef.current = null
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

  // Card-entry audio. The rule is in studyAutoplay.js; this is the plumbing.
  //
  // The ref holds the last reveal this hook actually handled, and it survives
  // the Cards tab being hidden (component state does; effects don't). That is
  // precisely what lets the re-run on return read as "the same reveal, already
  // dealt with" instead of a fresh one — which is how a word ended up speaking
  // from behind the Continue-session screen.
  const lastEntryRef = useRef(null)
  const card = queue[0]
  const cardId = card ? card.id : null
  useEffect(() => {
    const decision = autoplayDecision({
      presenting,
      enabled: profile.audio_autoplay !== false,
      card,
      flipped,
      lastToken: lastEntryRef.current,
    })
    lastEntryRef.current = decision.token
    if (decision.play) playAudio()
    // `card` itself is intentionally not a dependency — a new object for the
    // same card (a re-render of the queue) is not a new card entry. `cardId` is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, flipped, cardId, profile.audio_autoplay])

  // Warm the current + next card's audio into an in-memory object URL so tap
  // playback works offline — on iOS especially, where a ranged network request
  // bypasses the SW cache and can't be awaited inside the play() gesture.
  useEffect(() => {
    [queue[0], queue[1]].forEach(c => {
      if (!c || !c.vocab) return
      // Warm the word and its slow version; the sentence clips are only
      // reached deliberately, so they load on demand.
      const urls = flashcardAudio(c.vocab)
      if (urls.word) ensureAudio(urls.word)
      if (urls.word_slow) ensureAudio(urls.word_slow)
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
