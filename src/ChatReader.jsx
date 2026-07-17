import { useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react'
import { getLevelLabel } from './utils'
import { wordStatus } from './storyReading'
import { chatStyleFor } from './chatMissions'
import { useStoryReaderCore } from './useStoryReaderCore'
import { assignSpeakerSides } from './chatReading'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }

// Chat-format reader: reads a conversation as tap-to-reveal bubbles. Observer
// only (no "you" bubbles). Shares all behavior with the paced reader via
// useStoryReaderCore; only the presentation (bubble thread) is bespoke.
export default function ChatReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const skin = chatStyleFor(track.language)
  const sides = useMemo(() => assignSpeakerSides(c.beats), [c.beats])
  const levelLabel = getLevelLabel(track.language, track.system, story.level)

  const endRef = useRef(null)
  const [typing, setTyping] = useState(false)

  // Auto-scroll to the newest revealed bubble.
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: c.reduceMotion ? 'auto' : 'smooth', block: 'end' }) }, [c.cur, typing, c.reduceMotion])

  // Hold a *character* bubble back behind a brief "typing…" shimmer (~500ms) so
  // it reveals *after* the indicator, not below an already-shown bubble. Skipped
  // for the very first beat, narration lines, during Play, and under
  // reduced-motion, where the bubble reveals immediately. useLayoutEffect (not
  // useEffect) so the withheld bubble never flashes visible for a frame before
  // the shimmer hides it; the reset keeps a fast tap-through from stranding the
  // indicator on a beat that shouldn't type.
  useLayoutEffect(() => {
    const b = c.beats[c.cur]
    const shouldType = c.started && !c.playing && !c.reduceMotion && !!b && !!b.speaker && c.cur > 0
    if (!shouldType) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTyping(false)
      return undefined
    }
    setTyping(true)
    const t = setTimeout(() => setTyping(false), 500)
    return () => clearTimeout(t)
  }, [c.cur, c.started, c.playing, c.reduceMotion, c.beats])

  if (!c.started) {
    return <ReaderLaunch story={story} isRead={isRead} levelLabel={levelLabel} accent={accent} theme={c.theme} readability={c.readability} onStart={c.start} onBack={onBack} />
  }

  // While the shimmer is up, the pending character bubble stays withheld.
  const pending = c.beats[c.cur]
  const revealed = c.beats.slice(0, typing ? c.cur : c.cur + 1)

  return (
    <div style={{ minHeight: '100vh', background: skin.bg, color: '#111', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px', background: skin.bg }}>
        <button onClick={c.backToStart} aria-label="Back to start" style={ghost}><ArrowLeft size={18} color="#4a4a4a" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#333', fontFamily: c.theme.font }}>{story.title}</div>
        <div style={{ fontSize: '12px', color: '#666', minWidth: '34px', textAlign: 'right' }}>{c.cur + 1}/{c.total}</div>
      </div>

      <div onClick={() => { c.stopPlay(); c.advance() }} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ maxWidth: '620px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {revealed.map((b, i) => {
            if (!b.speaker) {
              return <div key={i} style={{ textAlign: 'center', fontSize: '12.5px', color: '#5a5a5a', fontStyle: 'italic', margin: '6px 0', fontFamily: c.theme.font }}>{b.text}</div>
            }
            const meta = sides[b.speaker] || { side: 'left', color: accent }
            const isLast = i === c.cur
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: meta.side === 'right' ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: meta.color, margin: '0 8px 3px', fontFamily: c.theme.font }}>{b.speaker}</div>
                <div style={{ maxWidth: '82%', background: meta.side === 'right' ? skin.myBubble : skin.theirBubble, color: meta.side === 'right' ? skin.myText : '#111', border: meta.side === 'right' ? 'none' : '1px solid rgba(0,0,0,0.06)', borderRadius: '16px', padding: '9px 13px', boxShadow: '0 1px 2px rgba(0,0,0,0.07)', outline: isLast ? '2px solid ' + meta.color + '44' : 'none' }}>
                  {c.showPy && <div style={{ fontSize: '11.5px', opacity: 0.6, marginBottom: '3px', lineHeight: 1.4 }}>{b.tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ')}</div>}
                  <div style={{ fontSize: '19px', lineHeight: 1.55, fontFamily: c.theme.font }}>
                    {b.tokens.map((t, k) => {
                      if (!t.vocab) return <span key={k}>{t.text}</span>
                      const status = wordStatus(t.vocab.id, userCards)
                      return (
                        <span key={k} onClick={(e) => { e.stopPropagation(); c.selectWord(t.vocab, status) }}
                          style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px', background: status === 'not_started' ? accent + '22' : (status === 'learning' ? '#CA8A0426' : 'transparent') }}>{t.text}</span>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
          {typing && pending && (() => {
            const meta = sides[pending.speaker] || { side: 'left', color: accent }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: meta.side === 'right' ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: meta.color, margin: '0 8px 3px', fontFamily: c.theme.font }}>{pending.speaker}</div>
                <div style={{ background: meta.side === 'right' ? skin.myBubble : skin.theirBubble, color: meta.side === 'right' ? skin.myText : '#888', borderRadius: '16px', padding: '10px 14px', fontSize: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.07)' }}>typing…</div>
              </div>
            )
          })()}
          <div ref={endRef} />
        </div>
      </div>
      <div aria-live="polite" style={srOnly}>{revealed.length ? revealed[revealed.length - 1].text : ''}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(0,0,0,0.08)', background: skin.bg, padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ width: '48px', height: '48px', borderRadius: '50%', border: 'none', background: accent, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
        <span style={{ fontSize: '12.5px', color: '#555' }}>{c.cur >= c.total - 1 ? 'Tap to finish' : 'Tap anywhere to continue'}</span>
      </div>

      <WordLookupSheet selected={c.selected} theme={c.theme} accent={accent} userCards={userCards} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} />}
    </div>
  )
}

const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
