import { useRef, useState } from 'react'
import { Check, Volume2 } from 'lucide-react'
import { BRAND_INK } from './brand'
import { ink } from './languageTheme'
import { STORY, isRightReply, replyNote } from './firstEncounter'
import { ttsUrl } from './ttsAudio'
import { getAudioUrl, playAudioEl } from './utils'
import { FLASHCARD } from './firstEncounter'
import { speak } from './starterAudio'
import { tapFeedback, successFeedback } from './haptics'

// The tea-shop micro-story: the flashcard's word, met in the wild and then
// used. Three beats that ACCUMULATE down the screen the way the manhua
// readers flow, so the scene reads as a story unfolding rather than slides
// replacing each other — the conventions (caption plates for narration,
// tailed balloons for speech) are the manhua reader's, drawn small. No
// artwork: a caption plate and a real balloon carry a three-line scene
// honestly, where placeholder art would cheapen it.
//
// A wrong reply is answered with what the word DOES mean, and the choice
// stays open. The visitor leaves this screen knowing up to three words, and
// the one they used is the one the app just taught them.

function Caption({ children }) {
  return (
    <p style={{
      margin: 0, alignSelf: 'stretch',
      padding: '12px 16px', borderRadius: '4px',
      background: 'var(--surface-2)', borderLeft: '3px solid var(--border)',
      fontFamily: 'Inter, sans-serif', fontSize: '14px', fontStyle: 'italic',
      color: 'var(--text-muted)', lineHeight: 1.55, textAlign: 'left',
    }}>
      {children}
    </p>
  )
}

function Balloon({ speaker, mei, onPlay, children }) {
  return (
    <div style={{ alignSelf: mei ? 'flex-end' : 'flex-start', maxWidth: '85%', textAlign: mei ? 'right' : 'left' }}>
      <span style={{
        display: 'block', margin: '0 4px 3px',
        fontFamily: 'Inter, sans-serif', fontSize: '11.5px', fontWeight: 700,
        color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {speaker}
      </span>
      <button
        onClick={onPlay}
        aria-label={'Hear the line'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '10px',
          padding: '12px 18px', minHeight: '48px',
          borderRadius: mei ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          border: '1px solid var(--border)', background: 'var(--surface)',
          boxShadow: '0 4px 14px rgba(24,24,27,0.06)',
          cursor: 'pointer', textAlign: 'inherit',
        }}
      >
        {children}
        <Volume2 size={15} strokeWidth={2} color="var(--text-faint)" aria-hidden="true" />
      </button>
    </div>
  )
}

export default function MicroStory({ onComplete }) {
  const [beat, setBeat] = useState(0)          // how many panels are on screen
  const [tried, setTried] = useState([])       // indexes of wrong replies tapped
  const [note, setNote] = useState(null)       // the gentle explanation
  const [solved, setSolved] = useState(false)
  const audioRef = useRef(null)

  const playVocab = (vocabId, hanzi) => {
    const url = ttsUrl('vocabulary', vocabId, 'word')
      || (vocabId === FLASHCARD.vocabId ? getAudioUrl(FLASHCARD.audioPath) : null)
    playAudioEl(audioRef.current, url, () => speak(hanzi))
  }

  const choose = (reply, i) => {
    if (solved) return
    if (isRightReply(reply)) {
      successFeedback()
      playVocab(reply.vocabId, reply.hanzi)
      setNote(null)
      setSolved(true)
    } else {
      tapFeedback()
      setNote(replyNote(reply))
      setTried(prev => prev.includes(i) ? prev : [...prev, i])
    }
  }

  const greet = STORY.panels[1]

  // The taught word, set in ink — connected to the flashcard by colour, not
  // by glow.
  const redWord = (line) => {
    const at = line.indexOf(FLASHCARD.hanzi)
    if (at === -1) return line
    return (
      <>
        {line.slice(0, at)}
        <span style={{ color: ink(BRAND_INK) }}>{FLASHCARD.hanzi}</span>
        {line.slice(at + FLASHCARD.hanzi.length)}
      </>
    )
  }

  const continueBtn = (label, onClick) => (
    <button
      onClick={onClick}
      style={{
        width: '100%', minHeight: '54px', borderRadius: '999px', border: 'none',
        background: 'var(--text)', color: 'var(--bg)',
        fontSize: '16.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
      <audio ref={audioRef} preload="none" style={{ display: 'none' }} />
      <style>{`
        @keyframes hd-beat-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hd-beat { animation: none !important; }
        }
      `}</style>

      {/* Beat 1 — Mei arrives. */}
      <div className="hd-beat" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: '14px', animation: 'hd-beat-in 320ms ease' }}>
        <Caption>{STORY.panels[0].narration}</Caption>
      </div>
      {beat === 0 && continueBtn('Continue', () => setBeat(1))}

      {/* Beat 2 — the greeting. */}
      {beat >= 1 && (
        <div className="hd-beat" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: '14px', animation: 'hd-beat-in 320ms ease' }}>
          <Balloon speaker={greet.speaker} onPlay={() => playVocab(greet.vocabId, FLASHCARD.hanzi)}>
            <span lang="zh-Hans" style={{ fontFamily: "'Noto Sans SC', sans-serif", fontSize: '24px', color: 'var(--text)' }}>
              {redWord(greet.line)}
            </span>
          </Balloon>
        </div>
      )}
      {beat === 1 && continueBtn('Continue', () => setBeat(2))}

      {/* Beat 3 — the choice. */}
      {beat >= 2 && !solved && (
        <div className="hd-beat" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: '10px', animation: 'hd-beat-in 320ms ease' }}>
          <p style={{ margin: '4px 0 0', fontFamily: 'Inter, sans-serif', fontSize: '15.5px', fontWeight: 650, color: 'var(--text)', textAlign: 'center' }}>
            {STORY.panels[2].prompt}
          </p>
          {STORY.replies.map((r, i) => (
            <div
              key={r.hanzi}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                borderRadius: '16px', border: '1px solid var(--border)',
                background: 'var(--surface)', padding: '6px 6px 6px 16px',
                opacity: tried.includes(i) ? 0.5 : 1,
                transition: 'opacity 160ms ease',
              }}
            >
              <button
                onClick={() => choose(r, i)}
                style={{
                  flex: 1, minHeight: '48px', border: 'none', background: 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: "'Noto Sans SC', sans-serif", fontSize: '22px', color: 'var(--text)',
                }}
                lang="zh-Hans"
              >
                {r.hanzi}
              </button>
              {/* Listen without answering — deciding by ear is legitimate. */}
              <button
                onClick={() => playVocab(r.vocabId, r.hanzi)}
                aria-label={'Hear ' + r.hanzi}
                style={{
                  width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                  border: 'none', background: 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
              >
                <Volume2 size={17} strokeWidth={2} color="var(--text-muted)" />
              </button>
            </div>
          ))}
          {note && (
            <p role="status" style={{
              margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '13.5px',
              color: 'var(--text-muted)', lineHeight: 1.55, textAlign: 'center',
            }}>
              {note}
            </p>
          )}
        </div>
      )}

      {/* The resolution — Mei answers, the scene closes. */}
      {solved && (
        <div className="hd-beat" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: '14px', animation: 'hd-beat-in 320ms ease' }}>
          <Balloon speaker={STORY.resolution.speaker} mei onPlay={() => playVocab(FLASHCARD.vocabId, FLASHCARD.hanzi)}>
            <span lang="zh-Hans" style={{ fontFamily: "'Noto Sans SC', sans-serif", fontSize: '24px', color: 'var(--text)' }}>
              {redWord(STORY.resolution.line)}
            </span>
          </Balloon>
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            <span style={{
              width: '26px', height: '26px', borderRadius: '999px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, ' + BRAND_INK + ' 11%, var(--surface))',
            }} aria-hidden="true">
              <Check size={14} strokeWidth={2.6} color={ink(BRAND_INK)} />
            </span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 650, color: 'var(--text)' }}>
              She said it — and it worked.
            </span>
          </div>
          <Caption>{STORY.resolution.narration}</Caption>
          {continueBtn('Continue', onComplete)}
        </div>
      )}
    </div>
  )
}
