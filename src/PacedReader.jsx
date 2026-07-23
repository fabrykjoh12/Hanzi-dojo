import { useRef, useEffect, useCallback, useState } from 'react'
import { getLevelLabel } from './utils'
import { wordStatus } from './storyReading'
import { spotlightStyle } from './readAlong'
import { useStoryReaderCore } from './useStoryReaderCore'
import { TokenBody, ReadingSettings } from './ReadingScaffold'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'

function beatStyle(distance, reduceMotion) {
  if (distance === 0) return { opacity: 1, filter: 'none' }
  if (distance < 0) return { opacity: 0.26, filter: 'none' }
  const blur = reduceMotion ? 0 : (distance === 1 ? 0.5 : distance === 2 ? 1.6 : 2.6)
  const opacity = distance === 1 ? 0.5 : distance === 2 ? 0.22 : 0.08
  return { opacity, filter: blur ? `blur(${blur}px)` : 'none' }
}

export default function PacedReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const levelLabel = getLevelLabel(track.language, track.system, story.level)

  const stageRef = useRef(null)
  const trackRef = useRef(null)
  const beatEls = useRef([])
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Every beat reserves furigana space (not just the lit one), so advancing
  // never re-measures to a different height and the focus scroll stays smooth.
  const reserve = c.readingMode !== 'hidden'

  // The spotlight only engages while a line is actually sounding AND its
  // timeline resolved — otherwise every word stays at full opacity.
  const hasActive = c.playing && c.activeToken >= 0

  // Space/→ drive the reading; while the settings panel is open they belong to
  // the panel's own buttons, so hand the keys over for as long as it is up.
  const { setAdvanceBlocked } = c
  const onSettingsOpen = useCallback((open) => {
    setSettingsOpen(open)
    setAdvanceBlocked(open)
  }, [setAdvanceBlocked])

  const layout = useCallback(() => {
    const stage = stageRef.current, trk = trackRef.current, el = beatEls.current[c.cur]
    if (!stage || !trk || !el) return
    const y = stage.clientHeight * 0.42 - (el.offsetTop + el.offsetHeight / 2)
    trk.style.transform = `translateY(${y}px)`
  }, [c.cur])
  useEffect(() => { if (c.started) layout() }, [c.started, c.cur, c.readingMode, c.showEn, layout])
  useEffect(() => {
    const onResize = () => { if (c.started) layout() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [c.started, layout])

  if (!c.started) {
    return <ReaderLaunch story={story} isRead={isRead} levelLabel={levelLabel} accent={accent} theme={c.theme} readability={c.readability} onStart={c.start} onBack={onBack} />
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px' }}>
        <button onClick={c.backToStart} aria-label="Back to start" style={ghost}><ArrowLeft size={18} color="var(--text-muted)" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{c.cur + 1} / {c.total}</div>
        <div style={{ width: '34px' }} />
      </div>
      <div style={{ height: '4px', background: 'var(--border)', margin: '0 16px', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: accent, width: `${((c.cur + 1) / (c.total || 1)) * 100}%`, transition: c.reduceMotion ? 'none' : 'width .4s ease' }} />
      </div>

      <div ref={stageRef} onClick={() => { if (settingsOpen) return; c.stopPlay(); c.advance() }}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'pointer', WebkitMaskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)', maskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)' }}>
        <div ref={trackRef} style={{ position: 'absolute', left: 0, right: 0, padding: '0 28px', maxWidth: '680px', margin: '0 auto', transition: c.reduceMotion ? 'none' : 'transform .55s cubic-bezier(.33,1,.68,1)' }}>
          {c.beats.map((b, i) => {
            const st = beatStyle(i - c.cur, c.reduceMotion)
            return (
              <div key={i} ref={el => { beatEls.current[i] = el }} aria-hidden={i !== c.cur}
                style={{ padding: '26px 0', transition: c.reduceMotion ? 'none' : 'opacity .45s ease, filter .45s ease', ...st }}>
                {b.speaker && <div style={{ fontSize: '12.5px', fontWeight: 800, color: accent, marginBottom: '9px' }}>{b.speaker}</div>}
                <div style={{ fontFamily: c.theme.font, fontSize: '30px', lineHeight: reserve ? 2.05 : 1.62, fontWeight: 500 }}>
                  {b.tokens.map((t, k) => {
                    // Plain runs still route through TokenBody so they reserve the
                    // same annotation row and sit on the line's shared baseline.
                    if (!t.vocab) {
                      return (
                        <span key={k}
                          onClick={i === c.cur ? (e) => {
                            // A spotlit plain run (punctuation or an out-of-pool
                            // word) is part of the line being read, so a tap on
                            // it means the same thing as a tap on a word: seek
                            // there. It carries no vocab entry, so it never opens
                            // the lookup sheet — when the seek can't happen, let
                            // the click bubble so tap-to-advance still works.
                            if (c.playing && c.seekToToken(k)) e.stopPropagation()
                          } : undefined}
                          style={{ ...(i === c.cur ? spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion) : null) }}>
                          <TokenBody text={t.text} reading={null} mode={c.readingMode} status="not_started" language={track.language} reserve={reserve} />
                        </span>
                      )
                    }
                    const status = wordStatus(t.vocab.id, userCards)
                    const decorate = i === c.cur
                    return (
                      <span key={k}
                        onClick={i === c.cur ? (e) => {
                          e.stopPropagation()
                          // While the line is sounding, a tap means "read from
                          // here". seekToToken reports false when there is no
                          // timeline, and then a tap means what it always did.
                          if (c.playing && c.seekToToken(k)) return
                          c.selectWord(t.vocab, status)
                        } : undefined}
                        style={{
                          cursor: i === c.cur ? 'pointer' : 'inherit', borderRadius: '4px', padding: '0 1px',
                          background: decorate && status === 'not_started' ? accent + '1f' : (decorate && status === 'learning' ? '#CA8A0422' : 'transparent'),
                          boxShadow: decorate && status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none',
                          ...(i === c.cur ? spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion) : null),
                        }}>
                        <TokenBody text={t.text} reading={t.vocab.reading} mode={c.readingMode} status={status} language={track.language} reserve={reserve} />
                      </span>
                    )
                  })}
                </div>
                {c.showEn && i === c.cur && b.english && <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '12px' }}>{b.english}</div>}
              </div>
            )
          })}
        </div>
      </div>
      <div aria-live="polite" style={srOnly}>{c.beats[c.cur] ? c.beats[c.cur].text : ''}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <ReadingSettings
            mode={c.readingMode} setMode={c.setReadingMode}
            showEnglish={c.showEn} setShowEnglish={c.setShowEn}
            hasEnglish={Boolean(story.english_content)}
            language={track.language} accent={accent} onOpenChange={onSettingsOpen}
            rate={c.rate} setRate={c.setRate}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => { c.stopPlay(); c.go(c.cur - 1) }} disabled={c.cur === 0} aria-label="Previous line" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none', color: '#fff' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
          <button onClick={() => { c.stopPlay(); c.advance() }} aria-label="Next line" style={navBtn}><ChevronRight size={18} /></button>
        </div>
      </div>

      <WordLookupSheet selected={c.selected} theme={c.theme} accent={accent} userCards={userCards} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} core={c} onPractice={props.onPractice} />}
    </div>
  )
}

const ghost ={ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const navBtn = { width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
