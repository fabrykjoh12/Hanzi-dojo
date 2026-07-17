import { useRef, useEffect } from 'react'
import { wordStatus } from './storyReading'

// Shared bubble-thread for the chat readers (observer + interactive). The caller
// decides which beats are revealed, each speaker's side/color, the active
// (outlined) index, and whether a "typing…" bubble trails the thread — so the two
// readers render an identical thread without duplicating it.
export default function ChatThread({ revealed, sides, skin, theme, accent, userCards, showPy, activeIndex, typingBeat, reduceMotion, onSelectWord }) {
  const endRef = useRef(null)
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' })
  }, [revealed.length, typingBeat, reduceMotion])

  const bubble = (b, key, muted) => {
    const meta = sides[b.speaker] || { side: 'left', color: accent }
    return (
      <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: meta.side === 'right' ? 'flex-end' : 'flex-start' }}>
        <div style={{ fontSize: '11.5px', fontWeight: 700, color: meta.color, margin: '0 8px 3px', fontFamily: theme.font }}>{b.speaker}</div>
        <div style={{ maxWidth: '82%', background: meta.side === 'right' ? skin.myBubble : skin.theirBubble, color: meta.side === 'right' ? skin.myText : (muted ? '#888' : '#111'), border: meta.side === 'right' ? 'none' : '1px solid rgba(0,0,0,0.06)', borderRadius: '16px', padding: '9px 13px', boxShadow: '0 1px 2px rgba(0,0,0,0.07)', outline: (!muted && key === activeIndex) ? '2px solid ' + meta.color + '44' : 'none' }}>
          {muted ? <div style={{ fontSize: '14px' }}>typing…</div> : (
            <>
              {showPy && <div style={{ fontSize: '11.5px', opacity: 0.6, marginBottom: '3px', lineHeight: 1.4 }}>{b.tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ')}</div>}
              <div style={{ fontSize: '19px', lineHeight: 1.55, fontFamily: theme.font }}>
                {b.tokens.map((t, k) => {
                  if (!t.vocab) return <span key={k}>{t.text}</span>
                  const status = wordStatus(t.vocab.id, userCards)
                  return (
                    <span key={k} onClick={(e) => { e.stopPropagation(); onSelectWord(t.vocab, status) }}
                      style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px', background: status === 'not_started' ? accent + '22' : (status === 'learning' ? '#CA8A0426' : 'transparent') }}>{t.text}</span>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '620px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {revealed.map((b, i) => (
        b.speaker
          ? bubble(b, i, false)
          : <div key={i} style={{ textAlign: 'center', fontSize: '12.5px', color: '#5a5a5a', fontStyle: 'italic', margin: '6px 0', fontFamily: theme.font }}>{b.text}</div>
      ))}
      {typingBeat && bubble(typingBeat, 'typing', true)}
      <div ref={endRef} />
    </div>
  )
}
