import { useRef, useState } from 'react'
import { understandPct } from './starterSentences'
import { playStarterWord } from './starterAudio'
import { splitHanziWithTones, TONE_CLASS } from './toneColor'

// The pre-signup wow moment: tap each word to reveal pinyin + gloss + audio and
// watch a calm "you understand X%" meter fill to 100. Presentational — the parent
// owns navigation via onComplete / onSkip.
export default function SentenceTaste({ sentence, accentHex, onComplete, onSkip, onWordReveal }) {
  const [revealed, setRevealed] = useState(() => new Set())
  const audioRef = useRef(null)

  const pct = understandPct(sentence, revealed)
  const done = pct === 100

  const reveal = (i) => {
    const w = sentence.words[i]
    if (w.punct || revealed.has(i)) return
    playStarterWord(audioRef.current, sentence.id, i, w.hanzi)
    if (onWordReveal) onWordReveal(i)
    setRevealed(prev => {
      const next = new Set(prev)
      next.add(i)
      return next
    })
  }

  const revealAll = () => {
    sentence.words.forEach((w, i) => { if (!w.punct && !revealed.has(i) && onWordReveal) onWordReveal(i) })
    setRevealed(new Set(sentence.words.map((w, i) => (w.punct ? -1 : i)).filter(i => i >= 0)))
  }

  return (
    <div style={{ width: '100%', maxWidth: '440px' }}>
      {/* Reused audio element (see playAudioEl contract) */}
      <audio ref={audioRef} preload="none" style={{ display: 'none' }} />

      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', marginBottom: '18px' }}>
        Tap each word to hear it and see what it means.
      </p>

      {/* Word chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>
        {sentence.words.map((w, i) => {
          if (w.punct) return <span key={i} style={{ fontSize: '30px', color: 'var(--text)', alignSelf: 'center' }}>{w.hanzi}</span>
          const isOpen = revealed.has(i)
          const chars = splitHanziWithTones(w.hanzi, w.pinyin)
          return (
            <button
              key={i}
              onClick={() => reveal(i)}
              aria-label={w.hanzi}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                padding: '10px 12px', borderRadius: '12px', cursor: 'pointer',
                border: isOpen ? ('2px solid ' + accentHex) : '2px solid var(--border)',
                background: isOpen ? (accentHex + '0D') : 'var(--surface)', transition: 'all 0.15s',
                fontFamily: 'Inter, sans-serif', minWidth: '48px',
              }}
            >
              <span style={{ fontSize: '28px', fontWeight: 700, fontFamily: "'Noto Sans SC', sans-serif", lineHeight: 1.1 }}>
                {isOpen ? chars.map((c, j) => <span key={j} className={TONE_CLASS[c.tone]}>{c.char}</span>) : w.hanzi}
              </span>
              {isOpen && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{w.pinyin}</span>}
              {isOpen && <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>{w.gloss}</span>}
            </button>
          )
        })}
      </div>

      {/* Understand meter */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>
          <span>You understand</span><span>{pct}%</span>
        </div>
        <div style={{ height: '8px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: pct + '%', height: '100%', background: accentHex, transition: 'width 0.3s' }} />
        </div>
      </div>

      {done ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '15px', fontWeight: 750, color: accentHex, margin: '0 0 6px' }}>
            🎉 You just read your first Chinese sentence.
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 20px' }}>{sentence.translation}</p>
          <button onClick={onComplete} style={primaryBtn(accentHex)}>Save these words →</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <button onClick={revealAll} style={{ ...primaryBtn(accentHex), background: 'transparent', color: accentHex, border: '2px solid ' + accentHex }}>
            Reveal all
          </button>
          <button onClick={onSkip} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Skip
          </button>
        </div>
      )}
    </div>
  )
}

function primaryBtn(accentHex) {
  return {
    width: '100%', maxWidth: '320px', padding: '13px', borderRadius: '12px', border: 'none',
    background: accentHex, color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  }
}
