import { useRef, useEffect } from 'react'
import { wordStatus, isPlaceWord } from './storyReading'
import { TokenBody, RevealEnglishButton } from './ReadingScaffold'
import { spotlightStyle } from './readAlong'
import { Check } from 'lucide-react'

// The exact word just tapped — same amber the classic reader uses for its own
// selection highlight, so a tap is unmistakably "this one", not just "a lookup
// sheet opened somewhere".
const TAP_HILITE = 'rgba(217, 164, 62, 0.32)'
// Proper nouns (character names + curated place names) get this same green
// text color everywhere, so they read as "a name", not vocabulary to learn.
const PROPER_NOUN_COLOR = '#2F9E6D'
// A message the learner has confirmed "got it" on turns this same green.
const DONE_GREEN = '#2F9E6D'

// Shared bubble-thread for the chat readers (observer + interactive). The caller
// decides which beats are revealed, each speaker's side/color, the active
// (outlined) index, and whether a "typing…" bubble trails the thread — so the two
// readers render an identical thread without duplicating it. `onMarkDone`, when
// given, is the ONLY way the thread advances now — passing it (or not) is how a
// caller opens/closes the confirm-and-advance action (e.g. hidden during a
// reply gate, where picking the correct option is what advances instead).
export default function ChatThread({ revealed, sides, skin, theme, accent, userCards, readingMode, language, activeIndex, typingBeat, reduceMotion, onSelectWord, activeToken = -1, onSeekToken, playing = false, selected = null, revealedEnglish = null, onToggleEnglish, completedBeats = null, onMarkDone }) {
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
    // Same reason the proper-noun green is skipped there: "my bubble" is
    // already a bright green fill (skin.myBubble) on most themes, so painting
    // the word green too would wash it out instead of setting it apart.
    const properNounColor = meta.side === 'right' ? undefined : PROPER_NOUN_COLOR
    // Only the bubble now sounding takes the spotlight; earlier bubbles stay
    // fully legible so re-reading the conversation is never dimmed.
    const isCurrentBubble = playing && !muted && key === activeIndex
    const isSounding = isCurrentBubble && activeToken >= 0
    const isDone = Boolean(completedBeats && completedBeats.has(key))
    // Skip the green text tint on "my bubble" too — same legibility reason as
    // properNounColor; the checkmark itself still confirms/advances there.
    const doneColor = meta.side === 'right' ? undefined : DONE_GREEN
    return (
      <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: meta.side === 'right' ? 'flex-end' : 'flex-start' }}>
        <div style={{ fontSize: '11.5px', fontWeight: 700, color: meta.color, margin: '0 8px 3px', fontFamily: theme.font }}>{b.speaker}</div>
        <div style={{ maxWidth: '82%', background: meta.side === 'right' ? skin.myBubble : skin.theirBubble, color: meta.side === 'right' ? skin.myText : (muted ? '#888' : '#111'), border: meta.side === 'right' ? 'none' : '1px solid rgba(0,0,0,0.06)', borderRadius: '16px', padding: '9px 13px', boxShadow: '0 1px 2px rgba(0,0,0,0.07)', outline: (!muted && key === activeIndex) ? '2px solid ' + meta.color + '44' : 'none' }}>
          {muted ? <div style={{ fontSize: '14px' }}>typing…</div> : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <div style={{ flex: 1, fontSize: '19px', lineHeight: reserve ? 2 : 1.55, fontFamily: theme.font, color: isDone ? doneColor : undefined }}>
                  {b.tokens.map((t, k) => {
                    // Plain runs reserve the same annotation row, so a bubble's
                    // baseline is identical whether or not its words are scaffolded.
                    if (!t.vocab) {
                      return (
                        <span key={k}
                          onClick={(e) => {
                            // A spotlit plain run is part of the bubble being read,
                            // so a tap on it means "read from here". No vocab
                            // entry here, so it never opens the lookup sheet.
                            if (isCurrentBubble && onSeekToken && onSeekToken(k)) e.stopPropagation()
                          }}
                          style={{ color: (t.name && properNounColor) || 'inherit', ...spotlightStyle(k === activeToken, isSounding, reduceMotion) }}>
                          <TokenBody text={t.text} reading={null} mode={readingMode} status="not_started" language={language} reserve={reserve} rtColor={rtColor} />
                        </span>
                      )
                    }
                    const status = wordStatus(t.vocab.id, userCards)
                    const tokenId = key + ':' + k
                    const isSelected = selected && selected.tokenId === tokenId
                    const isPlace = isPlaceWord(t.vocab.word, language)
                    return (
                      <span key={k} onClick={(e) => {
                        e.stopPropagation()
                        // Seek only inside the bubble being read; a tap on an
                        // earlier bubble is a lookup, never a rewind. Gated on
                        // isCurrentBubble (not isSounding) so a tap during the
                        // lead-in silence still tries to seek, matching the paced
                        // reader — seekToToken's own boolean decides success.
                        if (isCurrentBubble && onSeekToken && onSeekToken(k)) return
                        onSelectWord(t.vocab, status, tokenId)
                      }}
                        style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px',
                          color: (isPlace && properNounColor) || 'inherit',
                          background: isSelected ? TAP_HILITE : (status === 'not_started' ? accent + '22' : (status === 'learning' ? '#CA8A0426' : 'transparent')),
                          boxShadow: isSelected ? '0 0 0 1px rgba(202,138,4,0.5)' : 'none',
                          ...spotlightStyle(k === activeToken, isSounding, reduceMotion) }}>
                        <TokenBody text={t.text} reading={t.vocab.reading} mode={readingMode} status={status} language={language} reserve={reserve} rtColor={rtColor} />
                      </span>
                    )
                  })}
                </div>
                {b.english && onToggleEnglish && (
                  <RevealEnglishButton
                    revealed={Boolean(revealedEnglish && revealedEnglish.has(key))}
                    onToggle={() => onToggleEnglish(key)}
                    color={meta.side === 'right' ? skin.myText : 'inherit'}
                    activeColor={meta.side === 'right' ? skin.myText : accent}
                    style={{ opacity: meta.side === 'right' ? 0.75 : 1 }}
                  />
                )}
                {key === activeIndex && onMarkDone && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMarkDone() }}
                    aria-label="Got it — next message"
                    title="Got it — next"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      opacity: meta.side === 'right' ? 0.75 : 1,
                    }}
                  >
                    <Check size={16} strokeWidth={2.6} color={isDone ? doneColor || skin.myText : (meta.side === 'right' ? skin.myText : '#888')} />
                  </button>
                )}
              </div>
              {b.english && revealedEnglish && revealedEnglish.has(key) && (
                <div style={{ fontSize: '13px', fontStyle: 'italic', opacity: 0.72, marginTop: '5px' }}>{b.english}</div>
              )}
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
