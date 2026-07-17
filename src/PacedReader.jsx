import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { languageTheme } from './languageTheme'
import { getLevelLabel } from './utils'
import {
  calculateStoryReadability, buildVocabMatcher, segmentLine,
  namesFor, particlesFor, splitSpeaker,
} from './storyReading'
import { ArrowLeft, Play, ChevronLeft, ChevronRight } from 'lucide-react'

const SAGE = '#6E8466'
// eslint-disable-next-line no-unused-vars -- used by the hover state added in Task 8's polish.
const SAGE_DARK = '#5C7155'

// Distance-based emphasis for the focus flow: the active beat is lit; read
// beats recede (dim, crisp); unread beats fade + blur by distance.
function beatStyle(distance, reduceMotion) {
  if (distance === 0) return { opacity: 1, filter: 'none' }
  if (distance < 0) return { opacity: 0.26, filter: 'none' }
  const blur = reduceMotion ? 0 : (distance === 1 ? 0.5 : distance === 2 ? 1.6 : 2.6)
  const opacity = distance === 1 ? 0.5 : distance === 2 ? 0.22 : 0.08
  return { opacity, filter: blur ? `blur(${blur}px)` : 'none' }
}

export default function PacedReader({ story, vocabMap, userCards, track, isRead, onBack }) {
  const theme = languageTheme(track.language)
  const accent = theme.accentHex
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [started, setStarted] = useState(false)
  const [cur, setCur] = useState(0)
  const [showPy, setShowPy] = useState(true)
  const [showEn, setShowEn] = useState(false)

  const stageRef = useRef(null)
  const trackRef = useRef(null)
  const beatEls = useRef([])

  // Parse the story into beats once. Each beat = one line: { speaker, tokens }.
  const matcher = useMemo(() => buildVocabMatcher(vocabMap, track.language), [vocabMap, track.language])
  const names = useMemo(() => namesFor(track.language), [track.language])
  const particles = useMemo(() => particlesFor(track.language), [track.language])
  const beats = useMemo(() => (story.content || '').split('\n').filter(Boolean).map(line => {
    const { speaker, text } = splitSpeaker(line)
    return { speaker, text, tokens: segmentLine(text, matcher, names, particles) }
  }), [story.content, matcher, names, particles])

  const readability = useMemo(
    () => calculateStoryReadability({ content: story.content, vocabMap, cards: userCards, language: track.language }),
    [story.content, vocabMap, userCards, track.language])

  const levelLabel = getLevelLabel(track.language, track.system, story.level)
  const total = beats.length

  // Ease the active beat to ~42% of the stage height (teleprompter feel).
  const layout = useCallback(() => {
    const stage = stageRef.current, trk = trackRef.current, el = beatEls.current[cur]
    if (!stage || !trk || !el) return
    const y = stage.clientHeight * 0.42 - (el.offsetTop + el.offsetHeight / 2)
    trk.style.transform = `translateY(${y}px)`
  }, [cur])

  useEffect(() => { if (started) layout() }, [started, cur, showPy, showEn, layout])
  useEffect(() => {
    const onResize = () => { if (started) layout() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [started, layout])

  const go = useCallback((i) => setCur(c => Math.max(0, Math.min(total - 1, i ?? c))), [total])

  useEffect(() => {
    if (!started) return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(cur + 1) }
      if (e.key === 'ArrowLeft') go(cur - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, cur, go])

  const pageShell = { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }

  // ── Launch screen ──
  if (!started) {
    const { knownPct, knownCount, learningCount, newCount } = readability
    return (
      <div style={pageShell}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px' }}>
          <button onClick={onBack} aria-label="Back to library" style={ghost}><ArrowLeft size={18} color="var(--text-muted)" /></button>
        </div>
        <div style={{ flex: 1, maxWidth: '640px', width: '100%', margin: '0 auto', padding: '8px 24px 40px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, marginBottom: '8px' }}>{levelLabel}</div>
          <h1 style={{ fontFamily: theme.font, fontSize: '34px', fontWeight: 800, lineHeight: 1.15, textWrap: 'balance', marginBottom: '18px' }}>{story.title}</h1>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '9px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>{knownPct}% known{isRead ? ' · Finished' : ''}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{knownCount} known · {learningCount} learning · {newCount} new</span>
          </div>
          <div style={{ display: 'flex', height: '5px', borderRadius: '999px', overflow: 'hidden', background: 'var(--border)', marginBottom: 'auto' }}>
            <div style={{ width: pct(knownCount, readability.totalUnique), background: '#2F9E6D' }} />
            <div style={{ width: pct(learningCount, readability.totalUnique), background: '#CA8A04' }} />
            <div style={{ width: pct(newCount, readability.totalUnique), background: accent + '55' }} />
          </div>
          <button onClick={() => { setCur(0); setStarted(true) }} style={startBtn}>
            <Play size={18} color="#fff" /> Start reading
          </button>
          <button onClick={onBack} style={classicLink}>Prefer the whole page? <u>Read as classic scroll</u></button>
        </div>
      </div>
    )
  }

  // ── Reading stage ──
  return (
    <div style={pageShell}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 8px' }}>
        <button onClick={() => setStarted(false)} aria-label="Back to start" style={ghost}><ArrowLeft size={18} color="var(--text-muted)" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{cur + 1} / {total}</div>
        <div style={{ width: '34px' }} />
      </div>
      <div style={{ height: '4px', background: 'var(--border)', margin: '0 16px', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: accent, width: `${((cur + 1) / total) * 100}%`, transition: reduceMotion ? 'none' : 'width .4s ease' }} />
      </div>

      <div
        ref={stageRef}
        onClick={() => go(cur + 1)}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden', cursor: 'pointer',
          WebkitMaskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)',
          maskImage: 'linear-gradient(180deg,transparent,#000 16%,#000 82%,transparent)',
        }}
      >
        <div ref={trackRef} style={{ position: 'absolute', left: 0, right: 0, padding: '0 28px', maxWidth: '680px', margin: '0 auto', transition: reduceMotion ? 'none' : 'transform .55s cubic-bezier(.33,1,.68,1)' }}>
          {beats.map((b, i) => {
            const st = beatStyle(i - cur, reduceMotion)
            return (
              <div key={i} ref={el => { beatEls.current[i] = el }}
                aria-hidden={i !== cur}
                style={{ padding: '26px 0', transition: reduceMotion ? 'none' : 'opacity .45s ease, filter .45s ease', ...st }}>
                {b.speaker && <div style={{ fontSize: '12.5px', fontWeight: 800, color: accent, marginBottom: '9px' }}>{b.speaker}</div>}
                {showPy && i === cur && <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>{pinyinLine(b.tokens)}</div>}
                <div aria-live={i === cur ? 'polite' : undefined} style={{ fontFamily: theme.font, fontSize: '30px', lineHeight: 1.62, fontWeight: 500 }}>
                  {b.tokens.map((t, k) => t.vocab
                    ? <span key={k} style={{ borderRadius: '4px', padding: '0 1px', background: i === cur ? accent + '14' : 'transparent' }}>{t.text}</span>
                    : <span key={k}>{t.text}</span>)}
                </div>
                {showEn && i === cur && story.english_content && <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '12px' }}>{story.english_content}</div>}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <Chip on={showPy} onClick={() => setShowPy(v => !v)} label={track.language === 'chinese' ? 'Pinyin' : 'Reading'} accent={accent} />
          <Chip on={showEn} onClick={() => setShowEn(v => !v)} label="English" accent={accent} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="Previous line" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={() => go(cur + 1)} aria-label="Next line" style={{ ...navBtn, width: '52px', height: '52px', background: accent, border: 'none', color: '#fff' }}><ChevronRight size={20} color="#fff" /></button>
          <div style={{ width: '44px' }} />
        </div>
      </div>
    </div>
  )
}

function pct(n, total) { return total ? Math.round((n / total) * 100) + '%' : '0%' }
function pinyinLine(tokens) { return tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ') }

function Chip({ on, onClick, label, accent }) {
  return (
    <button onClick={onClick} style={{
      fontSize: '12px', fontWeight: 700, padding: '7px 13px', borderRadius: '999px', cursor: 'pointer',
      fontFamily: 'Inter, sans-serif',
      border: '1px solid ' + (on ? accent + '73' : 'var(--border)'),
      background: on ? accent + '14' : 'var(--surface)', color: on ? accent : 'var(--text-muted)',
    }}>{label}</button>
  )
}

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const navBtn = { width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const startBtn = { marginTop: '24px', width: '100%', border: 'none', borderRadius: '16px', background: SAGE, color: '#fff', fontSize: '15.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px' }
const classicLink = { marginTop: '14px', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', width: '100%' }
