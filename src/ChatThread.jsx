import { useRef, useEffect } from 'react'
import { wordStatus } from './storyReading'
import { TokenBody } from './ReadingScaffold'
import { spotlightStyle } from './readAlong'

// Shared bubble-thread for the chat readers (observer + interactive). The caller
// decides which beats are revealed, each speaker's side/color, the active
// (outlined) index, and whether a "typing…" bubble trails the thread — so the two
// readers render an identical thread without duplicating it.
export default function ChatThread({ revealed, sides, skin, theme, accent, userCards, readingMode, language, activeIndex, typingBeat, reduceMotion, onSelectWord, activeToken = -1, onSeekToken, playing = false }) {
  const endRef = useRef(null)
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' })
  }, [revealed.length, typingBeat, reduceMotion])

  const reserve = readingMode !== 'hidden'

  const bubble = (b, key, muted) => {
    const meta = sides[b.speaker] || { side: 'left', color: accent }
    // The learner's own (right-hand) bubbles are accent-filled with light text,
    // where the default amber annotation would disappear — tint the reading to
    // that bubble's text color instead so it stays legible on both sides.
    const rtColor = meta.side === 'right' ? skin.myText : undefined
    // Only the bubble now sounding takes the spotlight; earlier bubbles stay
    // fully legible so re-reading the conversation is never dimmed.
    const isCurrentBubble = playing && !muted && key === activeIndex
    const isSounding = isCurrentBubble && activeToken >= 0
    return (
      <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: meta.side === 'right' ? 'flex-end' : 'flex-start' }}>
        <div style={{ fontSize: '11.5px', fontWeight: 700, color: meta.color, margin: '0 8px 3px', fontFamily: theme.font }}>{b.speaker}</div>
        <div style={{ maxWidth: '82%', background: meta.side === 'right' ? skin.myBubble : skin.theirBubble, color: meta.side === 'right' ? skin.myText : (muted ? '#888' : '#111'), border: meta.side === 'right' ? 'none' : '1px solid rgba(0,0,0,0.06)', borderRadius: '16px', padding: '9px 13px', boxShadow: '0 1px 2px rgba(0,0,0,0.07)', outline: (!muted && key === activeIndex) ? '2px solid ' + meta.color + '44' : 'none' }}>
          {muted ? <div style={{ fontSize: '14px' }}>typing…</div> : (
            <>
              <div style={{ fontSize: '19px', lineHeight: reserve ? 2 : 1.55, fontFamily: theme.font }}>
                {b.tokens.map((t, k) => {
                  // Plain runs reserve the same annotation row, so a bubble's
                  // baseline is identical whether or not its words are scaffolded.
                  if (!t.vocab) {
                    return (
                      <span key={k}
                        onClick={(e) => {
                          // A spotlit plain run is part of the bubble being read,
                          // so a tap on it means "read from here". No vocab
                          // entry here, so it never opens the lookup sheet; when
                          // the seek can't happen, let the click bubble so
                          // tap-to-reveal still works.
                          if (isCurrentBubble && onSeekToken && onSeekToken(k)) e.stopPropagation()
                        }}
                        style={spotlightStyle(k === activeToken, isSounding, reduceMotion)}>
                        <TokenBody text={t.text} reading={null} mode={readingMode} status="not_started" language={language} reserve={reserve} rtColor={rtColor} />
                      </span>
                    )
                  }
                  const status = wordStatus(t.vocab.id, userCards)
                  return (
                    <span key={k} onClick={(e) => {
                      e.stopPropagation()
                      // Seek only inside the bubble being read; a tap on an
                      // earlier bubble is a lookup, never a rewind. Gated on
                      // isCurrentBubble (not isSounding) so a tap during the
                      // lead-in silence still tries to seek, matching the paced
                      // reader — seekToToken's own boolean decides success.
                      if (isCurrentBubble && onSeekToken && onSeekToken(k)) return
                      onSelectWord(t.vocab, status)
                    }}
                      style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px',
                        background: status === 'not_started' ? accent + '22' : (status === 'learning' ? '#CA8A0426' : 'transparent'),
                        ...spotlightStyle(k === activeToken, isSounding, reduceMotion) }}>
                      <TokenBody text={t.text} reading={t.vocab.reading} mode={readingMode} status={status} language={language} reserve={reserve} rtColor={rtColor} />
                    </span>
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
