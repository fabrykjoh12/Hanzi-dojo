import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { BRAND_INK } from './brand'
import { ink } from './languageTheme'
import { FLASHCARD, encounterVocabIds } from './firstEncounter'
import { loadTtsAudio, ttsUrl } from './ttsAudio'
import { getAudioUrl, playAudioEl } from './utils'
import { speak } from './starterAudio'
import { prefersReducedMotion } from './splashIntro'
import { tapFeedback } from './haptics'

// The first flashcard, before any account. A real 3D flip — perspective on
// the frame, preserve-3d on the inner, backface-hidden faces — because the
// gesture IS the product's core interaction and it should feel physical from
// the first tap. Reduced motion swaps faces instantly instead of rotating.
//
// Audio is the Azure neural clip the real flashcards play (ttsAudio.js),
// warmed on mount for the whole encounter — this card AND the story's reply
// options — so nothing stutters later. Fallbacks: legacy bucket clip, then
// speech synthesis. The reveal tap is a user gesture, so iOS allows the
// audio it triggers.

const FLIP_MS = 520

export default function FlashcardIntro({ onSeeStory }) {
  const [flipped, setFlipped] = useState(false)
  const [reduced] = useState(() => prefersReducedMotion())
  const audioRef = useRef(null)

  useEffect(() => { loadTtsAudio('vocabulary', encounterVocabIds()) }, [])

  const play = () => {
    const url = ttsUrl('vocabulary', FLASHCARD.vocabId, 'word')
      || getAudioUrl(FLASHCARD.audioPath)
    playAudioEl(audioRef.current, url, () => speak(FLASHCARD.hanzi))
  }

  const flip = () => {
    tapFeedback()
    const next = !flipped
    setFlipped(next)
    if (next) play()
  }

  const face = {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '10px', padding: '24px',
    borderRadius: '22px',
    background: 'var(--surface)', border: '1px solid var(--border)',
    boxShadow: '0 18px 44px rgba(24,24,27,0.10)',
    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
  }

  return (
    <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '18px', alignItems: 'center' }}>
      <audio ref={audioRef} preload="none" style={{ display: 'none' }} />

      {/* The frame supplies perspective; the button is the card itself. */}
      <div style={{ width: '100%', perspective: '1200px' }}>
        <button
          onClick={flip}
          aria-pressed={flipped}
          aria-label={flipped ? FLASHCARD.hanzi + ', ' + FLASHCARD.pinyin + ', ' + FLASHCARD.meaning : 'Reveal the meaning of ' + FLASHCARD.hanzi}
          style={{
            position: 'relative', width: '100%',
            // Fixed height: the two faces are absolutely positioned, and a
            // card that changes size mid-flip reads as broken, not physical.
            height: 'clamp(300px, 42vh, 380px)',
            border: 'none', background: 'transparent', padding: 0,
            cursor: 'pointer', outlineOffset: '6px',
            transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: reduced ? 'none' : 'transform ' + FLIP_MS + 'ms cubic-bezier(.32,.72,.24,1)',
          }}
        >
          {/* Front: the word, alone. */}
          <span style={face} aria-hidden={flipped}>
            <span lang="zh-Hans" style={{
              fontFamily: "'Noto Sans SC', sans-serif", fontSize: '76px',
              lineHeight: 1.2, color: 'var(--text)',
            }}>
              {FLASHCARD.hanzi}
            </span>
          </span>

          {/* Back: the same word, understood. */}
          <span style={{ ...face, transform: 'rotateY(180deg)' }} aria-hidden={!flipped}>
            <span lang="zh-Hans" style={{
              fontFamily: "'Noto Sans SC', sans-serif", fontSize: '54px',
              lineHeight: 1.2, color: ink(BRAND_INK),
            }}>
              {FLASHCARD.hanzi}
            </span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '17px', fontWeight: 650, color: 'var(--text)' }}>
              {FLASHCARD.pinyin}
            </span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: 'var(--text-muted)' }}>
              {FLASHCARD.meaning}
            </span>

            {/* The two characters, glossed — the lego idea in one row. */}
            <span style={{ display: 'flex', gap: '18px', marginTop: '8px' }}>
              {FLASHCARD.breakdown.map(b => (
                <span key={b.hanzi} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <span lang="zh-Hans" style={{ fontFamily: "'Noto Sans SC', sans-serif", fontSize: '22px', color: 'var(--text)' }}>{b.hanzi}</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-faint)' }}>{b.gloss}</span>
                </span>
              ))}
            </span>
          </span>
        </button>
      </div>

      {!flipped && (
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
          Tap the card to reveal its meaning
        </p>
      )}

      {flipped && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={play}
            aria-label={'Play ' + FLASHCARD.hanzi}
            style={{
              width: '44px', height: '44px', borderRadius: '999px',
              border: '1px solid var(--border)', background: 'var(--surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <Volume2 size={19} strokeWidth={2} color={ink(BRAND_INK)} />
          </button>
          <button
            onClick={onSeeStory}
            style={{
              width: '100%', minHeight: '54px', borderRadius: '999px', border: 'none',
              background: 'var(--text)', color: 'var(--bg)',
              fontSize: '16.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            }}
          >
            See it in a story
          </button>
        </div>
      )}
    </div>
  )
}
