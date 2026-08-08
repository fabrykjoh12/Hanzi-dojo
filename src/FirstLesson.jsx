import { useRef, useState } from 'react'
import { Check, Volume2 } from 'lucide-react'
import { BRAND_INK } from './brand'
import { ink } from './languageTheme'
import { FIRST_LESSON } from './onboardingPath'
import { getAudioUrl, playAudioEl } from './utils'
import { speak } from './starterAudio'

// The first win: one real expression, learned before any account exists.
// Content in onboardingPath.js (FIRST_LESSON).
//
// Four beats — meet 你好, reveal what it is, use it once, be told plainly
// that the first training is complete. The audio is the studio-recorded
// flashcard clip, with speech synthesis only as a last-resort fallback; it
// plays on the reveal tap (a user gesture, so iOS allows it) and from a
// speaker button after that. Nothing waits on the audio: on a muted phone
// the lesson is exactly as complete.
//
// The success moment is calm on purpose — an ink check and a plain sentence,
// not confetti. The reward is being told the truth: you can greet anyone who
// speaks Chinese now.

export default function FirstLesson({ onComplete, onEvent }) {
  const [phase, setPhase] = useState('meet')   // 'meet' | 'revealed' | 'replied'
  const [replied, setReplied] = useState(null)
  const audioRef = useRef(null)

  const play = () => {
    playAudioEl(audioRef.current, getAudioUrl(FIRST_LESSON.audioPath), () => speak(FIRST_LESSON.hanzi))
  }

  const reveal = () => {
    play()
    if (onEvent) onEvent('revealed')
    setPhase('revealed')
  }

  const reply = (i) => {
    if (phase === 'replied') return
    setReplied(i)
    play()
    if (onEvent) onEvent('replied')
    setPhase('replied')
  }

  const chip = {
    display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
    padding: '12px 22px', borderRadius: '16px', cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--surface)',
    fontFamily: 'Inter, sans-serif',
  }

  return (
    <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <audio ref={audioRef} preload="none" style={{ display: 'none' }} />
      <style>{`
        @keyframes hd-lesson-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* The expression, always on screen — the lesson is about it. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <div lang="zh-Hans" style={{
          fontFamily: "'Noto Sans SC', sans-serif", fontSize: '76px', lineHeight: 1.2,
          color: ink(BRAND_INK),
        }}>
          {FIRST_LESSON.hanzi}
        </div>
        {phase !== 'meet' && (
          <div style={{ animation: 'hd-lesson-in 260ms ease', textAlign: 'center' }}>
            <div style={{ fontSize: '17px', fontWeight: 650, color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>
              {FIRST_LESSON.pinyin} · {FIRST_LESSON.meaning}
            </div>
            <button
              onClick={play}
              aria-label={'Play ' + FIRST_LESSON.hanzi}
              style={{
                marginTop: '8px', width: '40px', height: '40px', borderRadius: '999px',
                border: '1px solid var(--border)', background: 'var(--surface)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <Volume2 size={18} strokeWidth={2} color={ink(BRAND_INK)} />
            </button>
          </div>
        )}
      </div>

      {phase === 'meet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.55, fontFamily: 'Inter, sans-serif' }}>
            Your first expression. The one everything starts with.
          </p>
          <button
            onClick={reveal}
            style={{
              width: '100%', minHeight: '54px', borderRadius: '999px', border: 'none',
              background: 'var(--text)', color: 'var(--bg)',
              fontSize: '16.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            }}
          >
            Hear it and see what it means
          </button>
        </div>
      )}

      {phase === 'revealed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'hd-lesson-in 260ms ease' }}>
          <p style={{ margin: 0, fontSize: '14.5px', color: 'var(--text)', lineHeight: 1.6, fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
            {FIRST_LESSON.parts}
          </p>
          <div style={{
            padding: '16px', borderRadius: '16px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center',
          }}>
            <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
              {FIRST_LESSON.conversation.prompt}
            </p>
            <div lang="zh-Hans" style={{
              alignSelf: 'flex-start',
              padding: '10px 16px', borderRadius: '16px 16px 16px 4px',
              background: 'color-mix(in srgb, ' + BRAND_INK + ' 9%, var(--surface))',
              fontFamily: "'Noto Sans SC', sans-serif", fontSize: '20px', color: 'var(--text)',
            }}>
              {FIRST_LESSON.conversation.line}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {FIRST_LESSON.conversation.replies.map((r, i) => (
                <button key={i} onClick={() => reply(i)} style={chip}>
                  <span lang="zh-Hans" style={{ fontFamily: "'Noto Sans SC', sans-serif", fontSize: '19px', color: 'var(--text)' }}>{r.text}</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-faint)', fontWeight: 600 }}>{r.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'replied' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', animation: 'hd-lesson-in 300ms ease' }}>
          {/* The exchange, completed by them. */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div lang="zh-Hans" style={{
              alignSelf: 'flex-start',
              padding: '10px 16px', borderRadius: '16px 16px 16px 4px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              fontFamily: "'Noto Sans SC', sans-serif", fontSize: '20px', color: 'var(--text)',
            }}>
              {FIRST_LESSON.conversation.line}
            </div>
            <div lang="zh-Hans" style={{
              alignSelf: 'flex-end',
              padding: '10px 16px', borderRadius: '16px 16px 4px 16px',
              background: 'color-mix(in srgb, ' + BRAND_INK + ' 10%, var(--surface))',
              fontFamily: "'Noto Sans SC', sans-serif", fontSize: '20px', color: 'var(--text)',
            }}>
              {FIRST_LESSON.conversation.replies[replied]?.text || FIRST_LESSON.hanzi}
            </div>
          </div>

          <span style={{
            width: '44px', height: '44px', borderRadius: '999px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'color-mix(in srgb, ' + BRAND_INK + ' 11%, var(--surface))',
          }} aria-hidden="true">
            <Check size={22} strokeWidth={2.6} color={ink(BRAND_INK)} />
          </span>

          <div role="status" style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ fontSize: '18px', fontWeight: 750, color: 'var(--text)' }}>{FIRST_LESSON.done.title}</div>
            <p style={{ margin: '6px 0 0', fontSize: '14.5px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {FIRST_LESSON.done.line}
            </p>
          </div>

          <button
            onClick={onComplete}
            style={{
              width: '100%', minHeight: '54px', borderRadius: '999px', border: 'none',
              background: 'var(--text)', color: 'var(--bg)',
              fontSize: '16.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            }}
          >
            Save my progress
          </button>
        </div>
      )}
    </div>
  )
}
