import { useRef, useState, useEffect } from 'react'
import { Volume2, VolumeX, Loader2, Rabbit, Turtle } from 'lucide-react'
import { playAudioEl } from './utils'
import { ensureAudio } from './audioCache'
import { claimPlayback, releasePlayback } from './audioPlayback'

// One accessible control for playing a stored clip.
//
// Behaviour that matters and is easy to get wrong:
//  - starting a clip STOPS whatever else was speaking (claimPlayback), because
//    two overlapping Chinese sentences are unintelligible;
//  - the element is created once and reused, which is what makes replay work on
//    iOS (see playAudioEl - a fresh element per tap throws away the fallback);
//  - a missing clip renders a quiet, labelled "no audio" state rather than a
//    button that does nothing;
//  - it is a real <button>, so it is keyboard- and screen-reader-operable for
//    free, and playback state is announced through aria-live.

const ICONS = { play: Volume2, slow: Turtle, fast: Rabbit }

const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

export default function AudioButton({
  url,
  label,                      // accessible name, e.g. "Play word"
  text,                       // optional visible text
  icon = 'play',
  accentHex = '#B83A24',
  tone = 'solid',             // 'solid' = accent tinted, 'quiet' = neutral chrome
  size = 'md',
  preload = false,
  onPlay = null,
}) {
  const elRef = useRef(null)
  const [state, setState] = useState('idle')   // idle | loading | playing | error
  const [shownUrl, setShownUrl] = useState(url)

  // A new clip means a fresh state - a previous "error" must not stick to the
  // next card's button. Adjusted during render rather than in an effect (the
  // pattern this repo lints for), so the button never paints a stale state.
  if (url !== shownUrl) {
    setShownUrl(url)
    setState('idle')
  }

  // Warm the clip into an object URL so the tap itself never waits on the
  // network - iOS blocks a play() that is not synchronous with the gesture.
  useEffect(() => {
    if (preload && url) ensureAudio(url)
  }, [preload, url])

  useEffect(() => () => {
    if (elRef.current) releasePlayback(elRef.current)
  }, [])

  function handlePlay(e) {
    e.stopPropagation()
    if (!url) return
    if (!elRef.current) elRef.current = new Audio()
    const el = elRef.current

    // Tapping a playing clip stops it - the expected "pause" affordance without
    // a second control competing for space on a flashcard.
    if (state === 'playing') {
      el.pause()
      setState('idle')
      return
    }

    claimPlayback(el)
    setState('loading')
    el.onplaying = () => setState('playing')
    el.onended = () => setState('idle')
    el.onpause = () => setState(s => (s === 'playing' ? 'idle' : s))
    playAudioEl(el, url, () => setState('error'))
    if (onPlay) onPlay()
  }

  const height = size === 'sm' ? 34 : 40
  const unavailable = !url
  const Icon = state === 'loading' ? Loader2 : (unavailable || state === 'error') ? VolumeX : ICONS[icon] || Volume2
  const iconSize = size === 'sm' ? 15 : 18

  const baseStyle = {
    position: 'relative',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
    height: height + 'px', padding: text ? '0 14px' : '0', width: text ? 'auto' : height + 'px',
    borderRadius: '13px', fontFamily: 'Inter, sans-serif',
    fontSize: size === 'sm' ? '12px' : '13px', fontWeight: 750,
  }

  if (unavailable || state === 'error') {
    return (
      <span
        style={{
          ...baseStyle,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text-faint)', fontWeight: 650,
        }}
        title={state === 'error' ? "This clip couldn't be played" : 'No audio for this yet'}
      >
        <Icon size={iconSize} strokeWidth={2} aria-hidden="true" />
        {text ? (state === 'error' ? 'No audio' : text) : null}
        <span style={SR_ONLY}>
          {state === 'error' ? label + ' - this clip could not be played' : label + ' - not available yet'}
        </span>
      </span>
    )
  }

  const solid = tone === 'solid'
  return (
    <button
      type="button"
      onClick={handlePlay}
      aria-label={label}
      title={label}
      style={{
        ...baseStyle,
        cursor: 'pointer',
        background: solid ? accentHex + '10' : 'var(--surface)',
        border: '1px solid ' + (solid ? accentHex + '2A' : 'var(--border)'),
        color: solid ? accentHex : 'var(--text-muted)',
        boxShadow: '0 10px 24px rgba(24,24,27,0.07)',
      }}
    >
      <Icon
        size={iconSize}
        strokeWidth={2}
        aria-hidden="true"
        style={state === 'loading' ? { animation: 'hd-spin 900ms linear infinite' } : undefined}
      />
      {text}
      {/* Announced, not shown: a purely visual state change is invisible to a
          screen reader, and "is it playing?" is exactly what a learner needs. */}
      <span aria-live="polite" style={SR_ONLY}>
        {state === 'playing' ? 'Playing' : ''}
      </span>
    </button>
  )
}
