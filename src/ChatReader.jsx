import { useMemo, useLayoutEffect, useState } from 'react'
import { getLevelLabel } from './utils'
import { chatStyleFor } from './chatMissions'
import { useStoryReaderCore } from './useStoryReaderCore'
import { assignSpeakerSides } from './chatReading'
import ChatThread from './ChatThread'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }

// Chat-format reader (observer): reads a conversation as tap-to-reveal bubbles,
// no "you" replies. Shares the bubble thread with InteractiveChatReader via
// ChatThread and all behavior via useStoryReaderCore.
export default function ChatReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const skin = chatStyleFor(track.language)
  const sides = useMemo(() => assignSpeakerSides(c.beats), [c.beats])
  const levelLabel = getLevelLabel(track.language, track.system, story.level)

  const [typing, setTyping] = useState(false)

  // Hold a character bubble behind a brief "typing…" shimmer (~500ms) so it
  // reveals after the indicator. Skipped for the first beat, narration, during
  // Play, and under reduced-motion. useLayoutEffect avoids a one-frame flash; the
  // reset stops a fast tap-through from stranding the indicator.
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
        <ChatThread revealed={revealed} sides={sides} skin={skin} theme={c.theme} accent={accent} userCards={userCards} showPy={c.showPy} activeIndex={c.cur} typingBeat={typing ? pending : null} reduceMotion={c.reduceMotion} onSelectWord={c.selectWord} />
      </div>
      <div aria-live="polite" style={srOnly}>{revealed.length ? revealed[revealed.length - 1].text : ''}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(0,0,0,0.08)', background: skin.bg, padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ width: '48px', height: '48px', borderRadius: '50%', border: 'none', background: accent, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
        <span style={{ fontSize: '12.5px', color: '#555' }}>{c.cur >= c.total - 1 ? 'Tap to finish' : 'Tap anywhere to continue'}</span>
      </div>

      <WordLookupSheet selected={c.selected} theme={c.theme} accent={accent} userCards={userCards} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} core={c} onPractice={props.onPractice} />}
    </div>
  )
}

const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
