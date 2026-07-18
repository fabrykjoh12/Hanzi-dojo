import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { awardXp } from './xpService'
import { getLevelLabel, getSystemLabel, shuffle, getAudioUrl, playAudioEl } from './utils'
import { PrimaryButton, SecondaryButton } from './ui'
import { languageTheme } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { cleanMeaning } from './cleanMeaning'
import { markWordDue } from './practiceSignal'
import { speechMatches } from './speechScore'
import { ArrowLeft, Mic, Volume2, Check, X, RotateCcw, CheckCircle2, Sparkles, MicOff } from 'lucide-react'

const QUESTION_COUNT = 10
const XP_PER_CORRECT = 4

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const LANG_CODE = { chinese: 'zh-CN', japanese: 'ja-JP', russian: 'ru-RU' }

// Speaking drill: read the word aloud, get a ✓ via the browser's built-in speech
// recognition (zero marginal cost). Accepts the word (and, for Japanese, its
// reading). Not supported on iOS/Safari — shows a graceful fallback there.
export default function Speaking({ session, profile, track, onBack, onUpdate }) {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(Boolean(SR))
  const [items, setItems] = useState([])
  const [idx, setIdx] = useState(0)
  const [result, setResult] = useState(null)     // null | 'correct' | 'incorrect'
  const [heard, setHeard] = useState('')          // what the recognizer thought it heard
  const [listening, setListening] = useState(false)
  const [denied, setDenied] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)
  const recRef = useRef(null)
  const audioRef = useRef(null)
  const scoredRef = useRef(false)                 // one score per item
  const xpAwardedRef = useRef(false)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langFont = theme.font
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const langCode = LANG_CODE[track.language] || 'en-US'

  useEffect(() => {
    if (!SR) return undefined
    let alive = true
    ;(async () => {
      const { data: vocab } = await supabase
        .from('vocabulary')
        .select('id, word, reading, meaning, audio_path')
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('level', track.current_level)
        .eq('is_active', true)
      if (!alive) return
      const usable = (vocab || []).filter(v => v.word)
      setItems(shuffle(usable).slice(0, Math.min(QUESTION_COUNT, usable.length)))
      setLoading(false)
    })()
    return () => { alive = false; stopListening() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = items[idx]

  function stopListening() {
    try { if (recRef.current) { recRef.current.onresult = null; recRef.current.onerror = null; recRef.current.onend = null; recRef.current.abort() } } catch { /* noop */ }
    recRef.current = null
  }

  function playTarget() {
    if (!item) return
    if (item.audio_path) {
      if (!audioRef.current) audioRef.current = new Audio()
      playAudioEl(audioRef.current, getAudioUrl(item.audio_path), speakViaSynth)
    } else speakViaSynth()
  }
  function speakViaSynth() {
    try {
      const u = new SpeechSynthesisUtterance(track.language === 'japanese' ? (item.reading || item.word) : item.word)
      u.lang = langCode; u.rate = 0.85
      window.speechSynthesis.speak(u)
    } catch { /* noop */ }
  }

  function listen() {
    if (!SR || listening || !item) return
    stopListening()
    scoredRef.current = false
    setResult(null); setHeard('')
    const rec = new SR()
    rec.lang = langCode
    rec.interimResults = false
    rec.maxAlternatives = 3
    rec.onresult = (e) => {
      const r = e.results[0]
      const alts = []
      for (let i = 0; i < r.length; i += 1) alts.push(r[i].transcript)
      const targets = [item.word]
      if (track.language === 'japanese' && item.reading) targets.push(item.reading)
      const ok = alts.some(a => speechMatches(a, targets))
      setHeard(alts[0] || '')
      score(ok)
    }
    rec.onerror = (e) => {
      setListening(false)
      if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) setDenied(true)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { setListening(false) }
  }

  function score(ok) {
    if (scoredRef.current) return
    scoredRef.current = true
    setResult(ok ? 'correct' : 'incorrect')
    if (ok) setCorrectCount(c => c + 1)
    else if (item) markWordDue(session, item.id)
  }

  function next() {
    stopListening()
    if (idx + 1 >= items.length) finish()
    else { setIdx(i => i + 1); setResult(null); setHeard(''); scoredRef.current = false }
  }

  function finish() {
    setDone(true)
    if (!xpAwardedRef.current) {
      xpAwardedRef.current = true
      const gain = correctCount * XP_PER_CORRECT
      if (gain > 0) awardXp(session, profile, gain, onUpdate)
    }
  }

  function restart() {
    stopListening()
    setIdx(0); setResult(null); setHeard(''); setCorrectCount(0); setDone(false)
    scoredRef.current = false; xpAwardedRef.current = false
  }

  const pageShell = { minHeight: '100vh', position: 'relative', overflow: 'hidden', padding: isMobile ? '16px 14px 28px' : '20px 32px 36px' }
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
      <button onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex' }}><ArrowLeft size={22} color="var(--text-muted)" /></button>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>Speaking</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{systemLabel} · {levelLabel}</div>
      </div>
    </div>
  )

  // Unsupported browser (iOS Safari and friends).
  if (!SR) {
    return (
      <div style={pageShell}>
        {header}
        <Centered>
          <MicOff size={30} strokeWidth={1.8} color={accentHex} style={{ marginBottom: '14px' }} />
          <div style={{ fontSize: '17px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>Speaking isn't supported here yet</div>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '340px', lineHeight: 1.6, marginBottom: '20px' }}>
            Your browser doesn't offer speech recognition. Try Chrome on Android or a desktop to practice saying words aloud.
          </div>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Back to practice</SecondaryButton>
        </Centered>
      </div>
    )
  }

  if (loading) {
    return <div style={pageShell}>{header}<Centered><Mic size={30} strokeWidth={1.8} color={accentHex} /></Centered></div>
  }

  if (items.length === 0) {
    return (
      <div style={pageShell}>
        {header}
        <Centered>
          <Mic size={30} strokeWidth={1.8} color={accentHex} style={{ marginBottom: '14px' }} />
          <div style={{ fontSize: '15px', color: 'var(--text-muted)' }}>No words to practice at this level yet.</div>
        </Centered>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((correctCount / items.length) * 100)
    return (
      <div style={pageShell}>
        {header}
        <Centered>
          <CheckCircle2 size={40} color={accentHex} style={{ marginBottom: '14px' }} />
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Nice speaking!</div>
          <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            You said <strong style={{ color: 'var(--text)' }}>{correctCount}</strong> of {items.length} clearly ({pct}%).
          </div>
          {correctCount > 0 && <div style={{ fontSize: '13px', color: accentHex, fontWeight: 700, marginBottom: '22px', display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}><Sparkles size={14} /> +{correctCount * XP_PER_CORRECT} XP</div>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <PrimaryButton onClick={restart} icon={RotateCcw}>Again</PrimaryButton>
            <SecondaryButton onClick={onBack} icon={ArrowLeft}>Done</SecondaryButton>
          </div>
        </Centered>
      </div>
    )
  }

  const showReading = item.reading && track.language !== 'russian'

  return (
    <div style={pageShell}>
      {header}
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', marginBottom: '26px' }}>
          <div style={{ height: '100%', width: `${(idx / items.length) * 100}%`, background: accentHex, transition: 'width .25s' }} />
        </div>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>Say this aloud — {idx + 1} of {items.length}</div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '30px 20px', textAlign: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '44px', fontWeight: 800, color: 'var(--text)', fontFamily: langFont, lineHeight: 1.2 }}>{item.word}</div>
          {showReading && <div style={{ fontSize: '16px', color: accentHex, fontWeight: 600, marginTop: '8px' }}>{item.reading}</div>}
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '6px' }}>{cleanMeaning(item.meaning)}</div>
          <button onClick={playTarget} aria-label="Hear it" style={{ marginTop: '16px', background: 'none', border: '1px solid var(--border)', borderRadius: '999px', padding: '8px 16px', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 600 }}>
            <Volume2 size={16} /> Hear it
          </button>
        </div>

        {/* Feedback */}
        {result === 'correct' && (
          <div style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 750, marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
            <Check size={20} strokeWidth={2.6} /> Nailed it{heard ? ` — heard "${heard}"` : ''}
          </div>
        )}
        {result === 'incorrect' && (
          <div style={{ textAlign: 'center', color: '#DC2626', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
            <X size={20} strokeWidth={2.4} /> {heard ? `Heard "${heard}" — try again` : 'Didn’t catch that — try again'}
          </div>
        )}
        {denied && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px', lineHeight: 1.5 }}>
            Microphone access is blocked. Allow the mic in your browser settings to practice speaking.
          </div>
        )}

        {/* Mic / actions */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={listen}
            disabled={listening || denied}
            aria-label={listening ? 'Listening' : 'Tap and speak'}
            style={{
              width: '84px', height: '84px', borderRadius: '50%', cursor: listening || denied ? 'default' : 'pointer',
              border: 'none', background: listening ? '#DC2626' : accentHex, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: listening ? '0 0 0 8px ' + accentHex + '22' : '0 8px 24px ' + accentHex + '44',
              transition: 'box-shadow .2s',
            }}
          >
            <Mic size={34} />
          </button>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', minHeight: '18px' }}>
            {listening ? 'Listening — say the word' : 'Tap the mic and say it'}
          </div>
          {result && (
            <PrimaryButton onClick={next}>{idx + 1 >= items.length ? 'Finish' : 'Next'}</PrimaryButton>
          )}
          {!result && (
            <button onClick={next} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>Skip</button>
          )}
        </div>
      </div>
    </div>
  )
}

// Small local layout helper (kept here to avoid touching shared ui.jsx).
function Centered({ children }) {
  return <div style={{ minHeight: '62vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>{children}</div>
}
