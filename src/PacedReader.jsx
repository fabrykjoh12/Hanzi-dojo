import { useRef, useEffect, useCallback } from 'react'
import { getLevelLabel } from './utils'
import { wordStatus, isPlaceWord, isWordlikeToken } from './storyReading'
import { unknownMarkStyle } from './tokenMark'
import { spotlightStyle } from './readAlong'
import { useStoryReaderCore } from './useStoryReaderCore'
import { TokenBody, ReadingSettings, RevealEnglishButton } from './ReadingScaffold'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight, Check } from 'lucide-react'

// The exact word just tapped — same amber the classic reader uses for its own
// selection highlight, so a tap is unmistakably "this one", not just "a lookup
// sheet opened somewhere".
const TAP_HILITE = 'rgba(217, 164, 62, 0.32)'
// Proper nouns (character names + curated place names) get this same green
// text color everywhere, so they read as "a name", not vocabulary to learn.
const PROPER_NOUN_COLOR = '#2F9E6D'
// A sentence the learner has confirmed "got it" on turns this same green —
// one color for "this is understood/known", whether that's a word or a line.
const DONE_GREEN = '#2F9E6D'

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
    setAdvanceBlocked(open)
  }, [setAdvanceBlocked])

  const layout = useCallback(() => {
    const stage = stageRef.current, trk = trackRef.current, el = beatEls.current[c.cur]
    if (!stage || !trk || !el) return
    const y = stage.clientHeight * 0.42 - (el.offsetTop + el.offsetHeight / 2)
    trk.style.transform = `translateY(${y}px)`
  }, [c.cur])
  useEffect(() => { if (c.started) layout() }, [c.started, c.cur, c.readingMode, c.revealedEnglish, layout])
  useEffect(() => {
    const onResize = () => { if (c.started) layout() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [c.started, layout])

  if (!c.started) {
    return <ReaderLaunch story={story} isRead={isRead} levelLabel={levelLabel} accent={accent} theme={c.theme} readability={c.readability} onStart={c.start} onBack={onBack} readerMode={props.readerMode} onPickReaderMode={props.onPickReaderMode} />
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

      <div ref={stageRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)', maskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)' }}>
        <div ref={trackRef} style={{ position: 'absolute', left: 0, right: 0, padding: '0 28px', maxWidth: '680px', margin: '0 auto', transition: c.reduceMotion ? 'none' : 'transform .55s cubic-bezier(.33,1,.68,1)' }}>
          {c.beats.map((b, i) => {
            const st = beatStyle(i - c.cur, c.reduceMotion)
            const isDone = c.completedBeats.has(i)
            // Revealing the English also pins the reading to "always" for this
            // one beat, so the whole line's pronunciation is visible right
            // alongside its translation — not just whichever words the global
            // reading-mode setting happens to scaffold.
            const beatMode = c.revealedEnglish.has(i) ? 'always' : c.readingMode
            return (
              <div key={i} ref={el => { beatEls.current[i] = el }} aria-hidden={i !== c.cur}
                style={{ padding: '26px 0', transition: c.reduceMotion ? 'none' : 'opacity .45s ease, filter .45s ease', ...st }}>
                {b.speaker && <div style={{ fontSize: '12.5px', fontWeight: 800, color: accent, marginBottom: '9px' }}>{b.speaker}</div>}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, fontFamily: c.readingFontFamily, fontSize: '30px', lineHeight: reserve ? 2.05 : 1.62, fontWeight: 500, color: isDone ? DONE_GREEN : undefined }}>
                    {b.tokens.map((t, k) => {
                      // Plain runs still route through TokenBody so they reserve the
                      // same annotation row and sit on the line's shared baseline.
                      if (!t.vocab) {
                        // A name, or a word beyond this level's list. It opens the
                        // same lookup sheet a vocabulary word does — every word in
                        // the story can be asked about. Punctuation stays inert.
                        const tappable = Boolean(t.name) || isWordlikeToken(t.text)
                        const plainId = i + ':' + k
                        const plainSelected = tappable && c.selected && c.selected.tokenId === plainId
                        // Outside the level's list entirely — marked so the
                        // learner can see at a glance which words aren't on
                        // their syllabus. tokenMark.js owns the decision.
                        const unknown = unknownMarkStyle(t, track.language)
                        // Keyboard parity for the reader's core interaction:
                        // tokens on the CURRENT beat are real buttons (Enter/
                        // Space looks the word up), matching ManhuaBubble.
                        // Other beats stay inert so they don't flood tab order.
                        const plainActivate = i === c.cur && tappable ? (e) => {
                          if (c.playing && c.seekToToken(k)) { e.stopPropagation(); return }
                          e.stopPropagation()
                          c.selectToken(t, 'not_started', plainId, i, e.currentTarget)
                        } : undefined
                        return (
                          <span key={k}
                            onClick={i === c.cur ? (e) => {
                              // While the line is sounding, a tap means "read from
                              // here", same as on a vocab word; otherwise it's a
                              // lookup.
                              if (c.playing && c.seekToToken(k)) { e.stopPropagation(); return }
                              if (!tappable) return
                              e.stopPropagation()
                              c.selectToken(t, 'not_started', plainId, i, e.currentTarget)
                            } : undefined}
                            role={plainActivate ? 'button' : undefined}
                            tabIndex={plainActivate ? 0 : undefined}
                            aria-label={plainActivate ? t.text : undefined}
                            onKeyDown={plainActivate ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); plainActivate(e) }
                            } : undefined}
                            style={{
                              cursor: i === c.cur && tappable ? 'pointer' : 'inherit', borderRadius: '4px',
                              color: t.name ? PROPER_NOUN_COLOR : 'inherit',
                              ...unknown,
                              ...(plainSelected ? { background: TAP_HILITE } : null),
                              boxShadow: plainSelected ? '0 0 0 1px rgba(202,138,4,0.5)' : 'none',
                              ...(i === c.cur ? spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion) : null),
                            }}>
                            <TokenBody text={t.text} reading={t.name ? t.name.reading : null} mode={beatMode} status="not_started" language={track.language} reserve={reserve} />
                          </span>
                        )
                      }
                      const status = wordStatus(t.vocab.id, userCards)
                      const decorate = i === c.cur
                      const tokenId = i + ':' + k
                      const isSelected = c.selected && c.selected.tokenId === tokenId
                      const isPlace = isPlaceWord(t.vocab.word, track.language)
                      const vocabActivate = i === c.cur ? (e) => {
                        e.stopPropagation()
                        if (c.playing && c.seekToToken(k)) return
                        c.selectToken(t, status, tokenId, i, e.currentTarget)
                      } : undefined
                      return (
                        <span key={k}
                          onClick={vocabActivate}
                          role={vocabActivate ? 'button' : undefined}
                          tabIndex={vocabActivate ? 0 : undefined}
                          aria-label={vocabActivate ? t.text : undefined}
                          onKeyDown={vocabActivate ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vocabActivate(e) }
                          } : undefined}
                          style={{
                            cursor: i === c.cur ? 'pointer' : 'inherit', borderRadius: '4px', padding: '0 1px',
                            color: isPlace ? PROPER_NOUN_COLOR : 'inherit',
                            background: isSelected ? TAP_HILITE : (decorate && status === 'not_started' ? accent + '1f' : (decorate && status === 'learning' ? '#CA8A0422' : 'transparent')),
                            boxShadow: isSelected ? '0 0 0 1px rgba(202,138,4,0.5)' : (decorate && status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none'),
                            ...(i === c.cur ? spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion) : null),
                          }}>
                          <TokenBody text={t.text} reading={t.vocab.reading} mode={beatMode} status={status} language={track.language} reserve={reserve} />
                        </span>
                      )
                    })}
                  </div>
                  {i === c.cur && b.english && (
                    <RevealEnglishButton
                      revealed={c.revealedEnglish.has(i)} onToggle={() => c.toggleEnglish(i)}
                      color="var(--text-faint)" activeColor={accent} style={{ marginTop: '4px' }}
                    />
                  )}
                  {i === c.cur && (
                    <button
                      onClick={(e) => { e.stopPropagation(); c.markBeatDone(i) }}
                      aria-label="Got it — next sentence"
                      title="Got it — next"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        width: '34px', height: '34px', borderRadius: '999px', cursor: 'pointer', marginTop: '2px',
                        border: '1.5px solid ' + (isDone ? DONE_GREEN : 'var(--border)'),
                        background: isDone ? DONE_GREEN + '1f' : 'var(--surface)',
                      }}
                    >
                      <Check size={18} strokeWidth={2.6} color={isDone ? DONE_GREEN : 'var(--text-muted)'} />
                    </button>
                  )}
                </div>
                {i === c.cur && b.english && c.revealedEnglish.has(i) && (
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '12px' }}>{b.english}</div>
                )}
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
            language={track.language} accent={accent} onOpenChange={onSettingsOpen}
            font={c.readingFont} setFont={c.setReadingFont}
            rate={c.rate} setRate={c.setRate}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => { c.stopPlay(); c.go(c.cur - 1) }} disabled={c.cur === 0} aria-label="Previous line" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none', color: '#fff' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
          <button onClick={() => { c.stopPlay(); c.advance() }} aria-label="Next line" style={navBtn}><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* anchor: the tapped word itself, so the answer appears over it. */}
      <WordLookupSheet selected={c.selected} anchor={c.selected ? c.selected.anchorEl : null} theme={c.theme} accent={accent} userCards={userCards} language={track.language} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} onAddDictToDeck={c.addDictToDeck} dictSaved={c.dictSaved} dictSaving={c.dictSaving} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} core={c} onPractice={props.onPractice} />}
    </div>
  )
}

const ghost ={ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const navBtn = { width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
