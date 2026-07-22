import { useCallback, useState } from 'react'
import { getLevelLabel } from './utils'
import { wordStatus } from './storyReading'
import { useStoryReaderCore } from './useStoryReaderCore'
import { TokenBody, ReadingSettings } from './ReadingScaffold'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'

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
  const beat = c.beats[c.cur]
  const [settingsOpen, setSettingsOpen] = useState(false)
  const reserve = c.readingMode !== 'hidden'

  // While the settings panel is open its buttons own Space/→, not the scene.
  const { setAdvanceBlocked } = c
  const onSettingsOpen = useCallback((open) => {
    setSettingsOpen(open)
    setAdvanceBlocked(open)
  }, [setAdvanceBlocked])

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

      <div onClick={() => { if (settingsOpen) return; c.stopPlay(); c.advance() }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer', padding: '24px 28px' }}>
        <div style={{ maxWidth: '620px', width: '100%' }}>
          {beat && beat.emoji && (
            <div aria-hidden="true" style={{ fontSize: '72px', lineHeight: 1, marginBottom: '26px' }}>{beat.emoji}</div>
          )}
          {beat && beat.speaker && <div style={{ fontSize: '12.5px', fontWeight: 800, color: accent, marginBottom: '10px' }}>{beat.speaker}</div>}
          <div style={{ fontFamily: c.theme.font, fontSize: '30px', lineHeight: reserve ? 2.05 : 1.6, fontWeight: 500 }}>
            {beat && beat.tokens.map((t, k) => {
              // Plain runs reserve the same annotation row as scaffolded words,
              // so the scene's single line never shifts as modes change.
              if (!t.vocab) {
                return <span key={k}><TokenBody text={t.text} reading={null} mode={c.readingMode} status="not_started" language={track.language} reserve={reserve} /></span>
              }
              const status = wordStatus(t.vocab.id, userCards)
              return (
                <span key={k} onClick={(e) => { e.stopPropagation(); c.selectWord(t.vocab, status) }}
                  style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px',
                    background: status === 'not_started' ? accent + '1f' : (status === 'learning' ? '#CA8A0422' : 'transparent'),
                    boxShadow: status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none' }}>
                  <TokenBody text={t.text} reading={t.vocab.reading} mode={c.readingMode} status={status} language={track.language} reserve={reserve} />
                </span>
              )
            })}
          </div>
          {c.showEn && beat && story.english_content && <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '16px' }}>{englishLineFor(story, c.cur)}</div>}
        </div>
      </div>
      <div aria-live="polite" style={srOnly}>{beat ? beat.text : ''}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <ReadingSettings
            mode={c.readingMode} setMode={c.setReadingMode}
            showEnglish={c.showEn} setShowEnglish={c.setShowEn}
            hasEnglish={Boolean(story.english_content)}
            language={track.language} accent={accent} onOpenChange={onSettingsOpen}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => { c.stopPlay(); c.go(c.cur - 1) }} disabled={c.cur === 0} aria-label="Previous scene" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
          <button onClick={() => { c.stopPlay(); c.advance() }} aria-label="Next scene" style={navBtn}><ChevronRight size={18} /></button>
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
