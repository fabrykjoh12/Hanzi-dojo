import { useMemo, useLayoutEffect, useState, useCallback } from 'react'
import { getLevelLabel } from './utils'
import { chatStyleFor } from './chatMissions'
import { useStoryReaderCore } from './useStoryReaderCore'
import { assignSpeakerSides } from './chatReading'
import { useIsMobile } from './useIsMobile'
import { MOBILE_SHELL_HEIGHT } from './studyLayout'
import { ReadingSettings, IconButton } from './ReadingScaffold'
import ChatThread from './ChatThread'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause } from 'lucide-react'

// Phone layout is the primary form factor now (the app ships wrapped in
// Capacitor). `minHeight: 100vh` overshot the visible viewport twice over: `vh`
// ignores a WebView's collapsing chrome, and App.jsx's <main> ALREADY reserves
// `62px + env(safe-area-inset-bottom)` for MobileNav — so the reader ended up a
// whole nav bar taller than the screen and the play control sat below the fold.
// Lock it to the same shell height Study uses (studyLayout.js) instead.
// Desktop is untouched: it keeps the growing `100vh` page.
function readerShell(isMobile) {
  return isMobile
    ? { height: MOBILE_SHELL_HEIGHT, maxHeight: MOBILE_SHELL_HEIGHT, overflow: 'hidden' }
    : { minHeight: '100vh' }
}

// The chat readers paint their own light "messaging app" chrome rather than the
// app's theme surfaces, so the header control borrows those tones.
const CHAT_TINT = { bg: 'rgba(255,255,255,0.7)', border: 'rgba(0,0,0,0.12)', text: '#555' }

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
  const isMobile = useIsMobile()

  const [typing, setTyping] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // While the settings panel is open its buttons own Space/→, not the thread.
  const { setAdvanceBlocked } = c
  const onSettingsOpen = useCallback((open) => {
    setSettingsOpen(open)
    setAdvanceBlocked(open)
  }, [setAdvanceBlocked])

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
    <div style={{ ...readerShell(isMobile), background: skin.bg, color: '#111', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px', background: skin.bg }}>
        <IconButton onClick={c.backToStart} label="Back to start"><ArrowLeft size={18} color="#4a4a4a" /></IconButton>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#333', fontFamily: c.theme.font }}>{story.title}</div>
        <ReadingSettings
          mode={c.readingMode} setMode={c.setReadingMode}
          language={track.language} accent={accent} onOpenChange={onSettingsOpen}
          compact placement="bottom" tint={CHAT_TINT}
          font={c.readingFont} setFont={c.setReadingFont}
          rate={c.rate} setRate={c.setRate}
        />
        <div style={{ fontSize: '12px', color: '#666', minWidth: '34px', textAlign: 'right' }}>{c.cur + 1}/{c.total}</div>
      </div>

      {/* `minHeight: 0` is mandatory (CLAUDE.md §5): without it this flex child
          grows to fit the whole thread inside a fixed-height column and the
          overflow is clipped instead of scrolled. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 14px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <ChatThread revealed={revealed} sides={sides} skin={skin} theme={c.theme} accent={accent} userCards={userCards} readingMode={c.readingMode} language={track.language} activeIndex={c.cur} typingBeat={typing ? pending : null} reduceMotion={c.reduceMotion} onSelectWord={c.selectWord} onSelectToken={c.selectToken} activeToken={c.activeToken} onSeekToken={c.seekToToken} playing={c.playing} selected={c.selected} revealedEnglish={c.revealedEnglish} onToggleEnglish={c.toggleEnglish} completedBeats={c.completedBeats} readingFontFamily={c.readingFontFamily} onMarkDone={settingsOpen ? undefined : () => c.markBeatDone(c.cur)} />
      </div>
      <div aria-live="polite" style={srOnly}>{revealed.length ? revealed[revealed.length - 1].text : ''}</div>

      {/* No safe-area inset here: on a phone the shell height already subtracts
          it (readerShell), and on desktop it is always zero. Adding it a second
          time is what pushed this bar off the bottom of the screen. */}
      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(0,0,0,0.08)', background: skin.bg, padding: '12px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ width: '48px', height: '48px', borderRadius: '50%', border: 'none', background: accent, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
        <span style={{ fontSize: '12.5px', color: '#555' }}>{c.cur >= c.total - 1 ? 'Tap ✓ to finish' : 'Tap ✓ to continue'}</span>
      </div>

      <WordLookupSheet selected={c.selected} anchor={c.selected ? c.selected.anchorEl : null} theme={c.theme} accent={accent} userCards={userCards} language={track.language} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} onAddDictToDeck={c.addDictToDeck} dictSaved={c.dictSaved} dictSaving={c.dictSaving} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} core={c} onPractice={props.onPractice} nextChapter={props.nextChapter} onNextChapter={props.onNextStory} onStudy={props.onStudy} />}
    </div>
  )
}

const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
