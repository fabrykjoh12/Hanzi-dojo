import { useCallback } from 'react'
import { getLevelLabel } from './utils'
import { wordStatus, isPlaceWord, isWordlikeToken } from './storyReading'
import { unknownMarkStyle } from './tokenMark'
import { spotlightStyle } from './readAlong'
import { useStoryReaderCore } from './useStoryReaderCore'
import { useIsMobile } from './useIsMobile'
import { MOBILE_SHELL_HEIGHT } from './studyLayout'
import { TokenBody, ReadingSettings, RevealEnglishButton, IconButton } from './ReadingScaffold'
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

function englishLineFor(story, i) { return (story.english_content || '').split('\n').filter(Boolean)[i] || '' }

// Scene-format reader: a picture-book. Each beat is a big centered emoji
// "illustration" above one short line, revealed a tap at a time. Narrative
// (not dialogue); theme-aware. Shares all behavior with the paced/chat readers
// via useStoryReaderCore — only the single-scene stage is bespoke.
export default function SceneReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, isRead, onBack, userCards } = props
  const accent = c.theme.accentHex
  const levelLabel = getLevelLabel(track.language, track.system, story.level)
  const isMobile = useIsMobile()
  const beat = c.beats[c.cur]
  const isDone = c.completedBeats.has(c.cur)
  const reserve = c.readingMode !== 'hidden'
  const hasActive = c.playing && c.activeToken >= 0
  // Revealing the English also pins the reading to "always" for this scene, so
  // the whole line's pronunciation is visible right alongside its translation.
  const beatMode = c.revealedEnglish.has(c.cur) ? 'always' : c.readingMode

  // While the settings panel is open its buttons own Space/→, not the scene.
  const { setAdvanceBlocked } = c
  const onSettingsOpen = useCallback((open) => {
    setAdvanceBlocked(open)
  }, [setAdvanceBlocked])

  if (!c.started) {
    return <ReaderLaunch story={story} isRead={isRead} levelLabel={levelLabel} accent={accent} theme={c.theme} readability={c.readability} onStart={c.start} onBack={onBack} />
  }

  return (
    <div style={{ ...readerShell(isMobile), background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px' }}>
        <IconButton onClick={c.backToStart} label="Back to start"><ArrowLeft size={18} color="var(--text-muted)" /></IconButton>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{c.cur + 1} / {c.total}</div>
        <div style={{ width: '44px' }} />
      </div>
      <div style={{ height: '4px', background: 'var(--border)', margin: '0 16px', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: accent, width: `${((c.cur + 1) / (c.total || 1)) * 100}%`, transition: c.reduceMotion ? 'none' : 'width .4s ease' }} />
      </div>

      {/* `minHeight: 0` + its own scroll: once the shell is height-locked on a
          phone (readerShell), a tall scene — big emoji plus a long line with
          furigana — has to scroll inside the stage rather than push the
          controls out of the shell. */}
      <div
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px 28px' }}>
        <div style={{ maxWidth: '620px', width: '100%' }}>
          {beat && beat.emoji && (
            <div aria-hidden="true" style={{ fontSize: '72px', lineHeight: 1, marginBottom: '26px' }}>{beat.emoji}</div>
          )}
          {beat && beat.speaker && <div style={{ fontSize: '13px', fontWeight: 800, color: accent, marginBottom: '10px' }}>{beat.speaker}</div>}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '8px' }}>
            <div style={{ fontFamily: c.readingFontFamily, fontSize: '30px', lineHeight: reserve ? 2.05 : 1.6, fontWeight: 500, color: isDone ? DONE_GREEN : undefined }}>
              {beat && beat.tokens.map((t, k) => {
                // Plain runs reserve the same annotation row as scaffolded words,
                // so the scene's single line never shifts as modes change.
                if (!t.vocab) {
                  // A name or a word beyond this level's list. It opens the same
                  // lookup sheet a vocabulary word does — every word in the story
                  // can be asked about. Punctuation stays inert.
                  const tappable = Boolean(t.name) || isWordlikeToken(t.text)
                  const plainId = c.cur + ':' + k
                  const plainSelected = tappable && c.selected && c.selected.tokenId === plainId
                  // Outside the level's list entirely — marked so the learner
                  // can see which words aren't on their syllabus. tokenMark.js
                  // owns the decision, shared by all four readers.
                  const unknown = unknownMarkStyle(t, track.language)
                  return (
                    <span key={k}
                      onClick={(e) => {
                        // While the line is sounding, a tap means "read from
                        // here", same as on a vocab word; otherwise it's a lookup.
                        if (c.playing && c.seekToToken(k)) { e.stopPropagation(); return }
                        if (!tappable) return
                        e.stopPropagation()
                        c.selectToken(t, 'not_started', plainId, c.cur, e.currentTarget)
                      }}
                      style={{
                        cursor: tappable ? 'pointer' : 'inherit', borderRadius: '4px',
                        color: t.name ? PROPER_NOUN_COLOR : 'inherit',
                        ...unknown,
                        ...(plainSelected ? { background: TAP_HILITE } : null),
                        boxShadow: plainSelected ? '0 0 0 1px rgba(202,138,4,0.5)' : 'none',
                        ...spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion),
                      }}>
                      <TokenBody text={t.text} reading={t.name ? t.name.reading : null} mode={beatMode} status="not_started" language={track.language} reserve={reserve} />
                    </span>
                  )
                }
                const status = wordStatus(t.vocab.id, userCards)
                const tokenId = c.cur + ':' + k
                const isSelected = c.selected && c.selected.tokenId === tokenId
                const isPlace = isPlaceWord(t.vocab.word, track.language)
                return (
                  <span key={k} onClick={(e) => {
                    e.stopPropagation()
                    if (c.playing && c.seekToToken(k)) return
                    c.selectToken(t, status, tokenId, c.cur, e.currentTarget)
                  }}
                    style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px',
                      color: isPlace ? PROPER_NOUN_COLOR : 'inherit',
                      background: isSelected ? TAP_HILITE : (status === 'not_started' ? accent + '1f' : (status === 'learning' ? '#CA8A0422' : 'transparent')),
                      boxShadow: isSelected ? '0 0 0 1px rgba(202,138,4,0.5)' : (status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none'),
                      ...spotlightStyle(k === c.activeToken, hasActive, c.reduceMotion) }}>
                    <TokenBody text={t.text} reading={t.vocab.reading} mode={beatMode} status={status} language={track.language} reserve={reserve} />
                  </span>
                )
              })}
            </div>
            {beat && story.english_content && (
              <RevealEnglishButton
                revealed={c.revealedEnglish.has(c.cur)} onToggle={() => c.toggleEnglish(c.cur)}
                color="var(--text-faint)" activeColor={accent} style={{ marginTop: '4px' }}
              />
            )}
            {beat && (
              <button
                onClick={(e) => { e.stopPropagation(); c.markBeatDone(c.cur) }}
                aria-label="Got it — next line"
                title="Got it — next"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  width: '44px', height: '44px', borderRadius: '999px', cursor: 'pointer', marginTop: '2px',
                  border: '1.5px solid ' + (isDone ? DONE_GREEN : 'var(--border)'),
                  background: isDone ? DONE_GREEN + '1f' : 'var(--surface)',
                }}
              >
                <Check size={18} strokeWidth={2.6} color={isDone ? DONE_GREEN : 'var(--text-muted)'} />
              </button>
            )}
          </div>
          {beat && story.english_content && c.revealedEnglish.has(c.cur) && (
            <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '16px' }}>{englishLineFor(story, c.cur)}</div>
          )}
        </div>
      </div>
      <div aria-live="polite" style={srOnly}>{beat ? beat.text : ''}</div>

      {/* No safe-area inset here: on a phone the shell height already subtracts
          it (readerShell), and on desktop it is always zero. Adding it a second
          time is what pushed this bar off the bottom of the screen. */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <ReadingSettings
            mode={c.readingMode} setMode={c.setReadingMode}
            language={track.language} accent={accent} onOpenChange={onSettingsOpen}
            font={c.readingFont} setFont={c.setReadingFont}
            rate={c.rate} setRate={c.setRate}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => { c.stopPlay(); c.go(c.cur - 1) }} disabled={c.cur === 0} aria-label="Previous scene" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
          <button onClick={() => { c.stopPlay(); c.advance() }} aria-label="Next scene" style={navBtn}><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* anchor: the tapped word itself, so the answer appears over it. */}
      <WordLookupSheet selected={c.selected} anchor={c.selected ? c.selected.anchorEl : null} theme={c.theme} accent={accent} userCards={userCards} language={track.language} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} onAddDictToDeck={c.addDictToDeck} dictSaved={c.dictSaved} dictSaving={c.dictSaving} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} core={c} onPractice={props.onPractice} nextChapter={props.nextChapter} onNextChapter={props.onNextStory} onStudy={props.onStudy} />}
    </div>
  )
}

// Phone layout is the primary form factor now (the app ships wrapped in
// Capacitor). `minHeight: 100vh` overshot the visible viewport twice over: `vh`
// ignores a WebView's collapsing chrome, and App.jsx's <main> ALREADY reserves
// `62px + env(safe-area-inset-bottom)` for MobileNav — so the reader ended up a
// whole nav bar taller than the screen and the play/next controls sat below the
// fold. Lock it to the same shell height Study uses (studyLayout.js) instead.
// Desktop is untouched: it keeps the growing `100vh` page.
function readerShell(isMobile) {
  return isMobile
    ? { height: MOBILE_SHELL_HEIGHT, maxHeight: MOBILE_SHELL_HEIGHT, overflow: 'hidden' }
    : { minHeight: '100vh' }
}

const navBtn = { width: '44px', height: '44px', borderRadius: '999px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
