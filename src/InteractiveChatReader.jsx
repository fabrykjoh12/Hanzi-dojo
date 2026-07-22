import { useMemo, useState, useEffect, useCallback } from 'react'
import { getLevelLabel } from './utils'
import { chatStyleFor } from './chatMissions'
import { useStoryReaderCore } from './useStoryReaderCore'
import { buildReplyOptions } from './interactiveChat'
import { ReadingSettings } from './ReadingScaffold'
import ChatThread from './ChatThread'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const PALETTE = ['#2E6FB8', '#2F9E6D', '#C2680E', '#7C5CD0', '#B83A7A']
// The chat readers paint their own light "messaging app" chrome rather than the
// app's theme surfaces, so the header control borrows those tones.
const CHAT_TINT = { bg: 'rgba(255,255,255,0.7)', border: 'rgba(0,0,0,0.12)', text: '#555' }
function pinyinOf(beat) { return beat.tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ') }

// Interactive chat reader: the learner replies at their own turns by picking the
// correct response (retry-until-right); a correct pick becomes their bubble and
// the chat continues. Shares the thread (ChatThread) + engine (useStoryReaderCore)
// with the observer reader; only the reply panel is bespoke.
export default function InteractiveChatReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const skin = chatStyleFor(track.language)
  const levelLabel = getLevelLabel(track.language, track.system, story.level)
  const interactions = story.interactions || {}
  const youSpeaker = interactions.you
  const distractors = useMemo(() => (story.interactions && story.interactions.distractors) || {}, [story.interactions])

  // Fixed sides: the learner ("you") is on the right; everyone else on the left,
  // each other speaker keeping a stable color.
  const sides = useMemo(() => {
    const map = {}
    let n = 0
    for (const b of c.beats) {
      if (!b.speaker || map[b.speaker]) continue
      map[b.speaker] = b.speaker === youSpeaker
        ? { side: 'right', color: accent }
        : { side: 'left', color: PALETTE[n++ % PALETTE.length] }
    }
    return map
  }, [c.beats, youSpeaker, accent])

  const [answered, setAnswered] = useState({})   // beatIndex -> true once solved
  const [missed, setMissed] = useState({})       // beatIndex -> true if ever wrong
  const [wrongPick, setWrongPick] = useState(null)

  // Is the NEXT beat a reply gate (a "you" beat with distractors, not yet solved)?
  const gateIndex = c.cur + 1
  const gateBeat = c.beats[gateIndex]
  const isGate = !!gateBeat && gateBeat.speaker === youSpeaker && !!distractors[gateIndex] && !answered[gateIndex]

  const [settingsOpen, setSettingsOpen] = useState(false)
  const onSettingsOpen = useCallback((open) => setSettingsOpen(open), [])

  // Keyboard advance is suspended both at a reply gate and while the settings
  // panel is open — in each case the keys belong to the on-screen buttons.
  const { setAdvanceBlocked } = c
  useEffect(() => {
    setAdvanceBlocked(isGate || settingsOpen)
    return () => setAdvanceBlocked(false)
  }, [isGate, settingsOpen, setAdvanceBlocked])

  const options = useMemo(() => (
    isGate ? buildReplyOptions(gateBeat.text, pinyinOf(gateBeat), distractors[gateIndex], gateIndex).options : []
  ), [isGate, gateBeat, distractors, gateIndex])

  const advance = () => { if (!isGate && !settingsOpen) { c.stopPlay(); c.advance() } }
  const pick = (opt) => {
    if (opt.correct) {
      setAnswered(a => ({ ...a, [gateIndex]: true }))
      setWrongPick(null)
      c.advance()   // reveal the "you" bubble (or finish if it was the last beat)
    } else {
      setWrongPick(opt.text)
      setMissed(m => ({ ...m, [gateIndex]: true }))
    }
  }

  if (!c.started) {
    return <ReaderLaunch story={story} isRead={isRead} levelLabel={levelLabel} accent={accent} theme={c.theme} readability={c.readability} onStart={c.start} onBack={onBack} />
  }

  const revealed = c.beats.slice(0, c.cur + 1)
  const gateCount = Object.keys(distractors).length
  const firstTry = Object.keys(answered).filter(i => !missed[i]).length

  return (
    <div style={{ minHeight: '100vh', background: skin.bg, color: '#111', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px', background: skin.bg }}>
        <button onClick={c.backToStart} aria-label="Back to start" style={ghost}><ArrowLeft size={18} color="#4a4a4a" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#333', fontFamily: c.theme.font }}>{story.title}</div>
        <ReadingSettings
          mode={c.readingMode} setMode={c.setReadingMode}
          showEnglish={false} setShowEnglish={null} hasEnglish={false}
          language={track.language} accent={accent} onOpenChange={onSettingsOpen}
          compact placement="bottom" tint={CHAT_TINT}
        />
        <div style={{ fontSize: '12px', color: '#666', minWidth: '34px', textAlign: 'right' }}>{c.cur + 1}/{c.total}</div>
      </div>

      <div onClick={advance} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px', cursor: isGate ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <ChatThread revealed={revealed} sides={sides} skin={skin} theme={c.theme} accent={accent} userCards={userCards} readingMode={c.readingMode} language={track.language} activeIndex={c.cur} typingBeat={null} reduceMotion={c.reduceMotion} onSelectWord={c.selectWord} />
      </div>
      <div aria-live="polite" style={srOnly}>{isGate ? (wrongPick ? 'Not quite — try another reply' : 'Your turn to reply') : (revealed.length ? revealed[revealed.length - 1].text : '')}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(0,0,0,0.08)', background: skin.bg, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))' }}>
        {isGate ? (
          <div role="group" aria-label="Choose your reply">
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#555', marginBottom: '8px', textAlign: 'center' }}>Your reply — tap the right one</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '620px', margin: '0 auto' }}>
              {options.map((opt, oi) => {
                const isWrong = wrongPick === opt.text
                return (
                  <button key={oi} onClick={() => pick(opt)}
                    style={{ textAlign: 'left', border: '1px solid ' + (isWrong ? '#DC2626' : 'rgba(0,0,0,0.12)'), background: isWrong ? '#FEECEC' : '#fff', opacity: isWrong ? 0.6 : 1, borderRadius: '14px', padding: '10px 14px', cursor: 'pointer', fontFamily: c.theme.font, animation: (isWrong && !c.reduceMotion) ? 'hdShake 0.3s' : 'none' }}>
                    <div style={{ fontSize: '17px', color: '#111' }}>{opt.text}</div>
                    {/* A candidate reply has no per-word learning status yet, so
                        it keeps a whole-line reading — hidden only when the
                        learner has turned readings off entirely. */}
                    {c.readingMode !== 'hidden' && opt.pinyin && <div style={{ fontSize: '11.5px', color: '#888', marginTop: '2px' }}>{opt.pinyin}</div>}
                  </button>
                )
              })}
            </div>
            {wrongPick && <div style={{ fontSize: '12.5px', color: '#DC2626', textAlign: 'center', marginTop: '8px' }}>Not quite — try another reply.</div>}
          </div>
        ) : (
          <div style={{ textAlign: 'center', fontSize: '12.5px', color: '#555' }}>{c.cur >= c.total - 1 ? 'Tap to finish' : 'Tap anywhere to continue'}</div>
        )}
      </div>

      <WordLookupSheet selected={c.selected} theme={c.theme} accent={accent} userCards={userCards} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} note={gateCount ? `You replied ${firstTry}/${gateCount} on the first try` : null} core={c} onPractice={props.onPractice} />}
    </div>
  )
}

const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
