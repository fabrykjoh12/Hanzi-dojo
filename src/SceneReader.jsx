import { getLevelLabel } from './utils'
import { wordStatus } from './storyReading'
import { useStoryReaderCore } from './useStoryReaderCore'
import ReaderLaunch from './ReaderLaunch'
import WordLookupSheet from './WordLookupSheet'
import FinishOverlay from './FinishOverlay'
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'

function pinyinLine(tokens) { return tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ') }
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

      <div onClick={() => { c.stopPlay(); c.advance() }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer', padding: '24px 28px' }}>
        <div style={{ maxWidth: '620px', width: '100%' }}>
          {beat && beat.emoji && (
            <div aria-hidden="true" style={{ fontSize: '72px', lineHeight: 1, marginBottom: '26px' }}>{beat.emoji}</div>
          )}
          {beat && beat.speaker && <div style={{ fontSize: '12.5px', fontWeight: 800, color: accent, marginBottom: '10px' }}>{beat.speaker}</div>}
          {c.showPy && beat && <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>{pinyinLine(beat.tokens)}</div>}
          <div style={{ fontFamily: c.theme.font, fontSize: '30px', lineHeight: 1.6, fontWeight: 500 }}>
            {beat && beat.tokens.map((t, k) => {
              if (!t.vocab) return <span key={k}>{t.text}</span>
              const status = wordStatus(t.vocab.id, userCards)
              return (
                <span key={k} onClick={(e) => { e.stopPropagation(); c.selectWord(t.vocab, status) }}
                  style={{ cursor: 'pointer', borderRadius: '4px', padding: '0 1px',
                    background: status === 'not_started' ? accent + '1f' : (status === 'learning' ? '#CA8A0422' : 'transparent'),
                    boxShadow: status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none' }}>{t.text}</span>
              )
            })}
          </div>
          {c.showEn && beat && story.english_content && <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '16px' }}>{englishLineFor(story, c.cur)}</div>}
        </div>
      </div>
      <div aria-live="polite" style={srOnly}>{beat ? beat.text : ''}</div>

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <Chip on={c.showPy} onClick={() => c.setShowPy(v => !v)} label={track.language === 'chinese' ? 'Pinyin' : 'Reading'} accent={accent} />
          <Chip on={c.showEn} onClick={() => c.setShowEn(v => !v)} label="English" accent={accent} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => { c.stopPlay(); c.go(c.cur - 1) }} disabled={c.cur === 0} aria-label="Previous scene" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={c.togglePlay} aria-label={c.playing ? 'Pause' : 'Play'} style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none' }}>{c.playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}</button>
          <button onClick={() => { c.stopPlay(); c.advance() }} aria-label="Next scene" style={navBtn}><ChevronRight size={18} /></button>
        </div>
      </div>

      <WordLookupSheet selected={c.selected} theme={c.theme} accent={accent} userCards={userCards} onAddToDeck={c.addToDeck} onSpeak={c.speakWord} onClose={() => c.setSelected(null)} />
      {c.done && <FinishOverlay story={story} accent={accent} onBack={onBack} />}
    </div>
  )
}

function Chip({ on, onClick, label, accent }) {
  return (
    <button onClick={onClick} style={{ fontSize: '12px', fontWeight: 700, padding: '7px 13px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid ' + (on ? accent + '73' : 'var(--border)'), background: on ? accent + '14' : 'var(--surface)', color: on ? accent : 'var(--text-muted)' }}>{label}</button>
  )
}
const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const navBtn = { width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
