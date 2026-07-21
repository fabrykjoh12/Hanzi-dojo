import { useRef, useState } from 'react'
import { playStarterWord } from './starterAudio'
import { splitHanziWithTones, TONE_CLASS } from './toneColor'

// A frictionless taste of the flashcard feel: for each featured word, show the
// hanzi, tap Show to reveal pinyin + gloss + audio, then Got it to advance. No
// grading, no FSRS — just momentum. onDone fires after the last card.
export default function CharacterTaste({ words, sentenceId, accentHex, onDone }) {
  const [idx, setIdx] = useState(0)
  const [shown, setShown] = useState(false)
  const audioRef = useRef(null)
  const w = words[idx]
  const chars = splitHanziWithTones(w.hanzi, w.pinyin)

  const show = () => {
    setShown(true)
    // wordIndex null → whole-sentence clip; charsToLearn doesn't carry the per-word
    // index, so once clips exist this plays the sentence. Fine today (no clips yet →
    // speak() fallback speaks the single character). Carry the index if per-word audio ships.
    playStarterWord(audioRef.current, sentenceId, null, w.hanzi)
  }
  const next = () => {
    if (idx + 1 >= words.length) { onDone(); return }
    setIdx(idx + 1); setShown(false)
  }

  return (
    <div style={{ width: '100%', maxWidth: '360px', textAlign: 'center' }}>
      <audio ref={audioRef} preload="none" style={{ display: 'none' }} />

      {/* progress dots */}
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '22px' }}>
        {words.map((_, i) => (
          <div key={i} style={{ width: '8px', height: '8px', borderRadius: '999px', background: i <= idx ? accentHex : 'var(--border)' }} />
        ))}
      </div>

      <div style={{
        padding: '32px 20px', borderRadius: '18px', border: '2px solid var(--border)',
        background: 'var(--surface)', marginBottom: '20px',
      }}>
        <div style={{ fontSize: '64px', fontWeight: 750, fontFamily: "'Noto Sans SC', sans-serif", lineHeight: 1.1 }}>
          {shown ? chars.map((c, j) => <span key={j} className={TONE_CLASS[c.tone]}>{c.char}</span>) : w.hanzi}
        </div>
        {shown && <div style={{ fontSize: '16px', color: 'var(--text-muted)', marginTop: '10px' }}>{w.pinyin}</div>}
        {shown && <div style={{ fontSize: '17px', color: 'var(--text)', fontWeight: 650, marginTop: '4px' }}>{w.gloss}</div>}
      </div>

      {shown ? (
        <button onClick={next} style={btn(accentHex)}>{idx + 1 >= words.length ? 'Done →' : 'Got it →'}</button>
      ) : (
        <button onClick={show} style={{ ...btn(accentHex), background: 'transparent', color: accentHex, border: '2px solid ' + accentHex }}>Show</button>
      )}
    </div>
  )
}

function btn(accentHex) {
  return {
    width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
    background: accentHex, color: '#fff', fontSize: '15px', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  }
}
