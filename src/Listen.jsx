import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { awardXp } from './xpService'
import { getLevelLabel, getSystemLabel, shuffle, getAudioUrl, playAudioEl } from './utils'
import { PrimaryButton, SecondaryButton } from './ui'
import { languageTheme } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { cleanMeaning } from './cleanMeaning'
import { markWordDue } from './practiceSignal'
import {
  ArrowLeft, Volume2, Headphones, Check, X, RotateCcw, CheckCircle2, Sparkles,
} from 'lucide-react'

const QUESTION_COUNT = 12
const XP_PER_CORRECT = 4

// Build a quiz: each question is one word (with audio) plus 3 distractors drawn
// from the same level's vocabulary.
function buildQuestions(pool) {
  const withAudio = pool.filter(v => v.audio_path)
  if (withAudio.length < 4) return []
  const picks = shuffle(withAudio).slice(0, Math.min(QUESTION_COUNT, withAudio.length))
  return picks.map(correct => {
    const distractors = shuffle(pool.filter(v => v.id !== correct.id)).slice(0, 3)
    return { correct, options: shuffle([correct, ...distractors]) }
  })
}

export default function Listen({ session, profile, track, onBack, onUpdate }) {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)   // vocab id of the chosen option
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)
  const audioRef = useRef(null)
  const xpAwardedRef = useRef(false)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const isJapanese = profile.active_language === 'japanese'
  const langFont = theme.font
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  async function load() {
    setLoading(true)
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('id, word, reading, meaning, audio_path')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)
    setQuestions(buildQuestions(vocab || []))
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [])

  function playAudio(path) {
    const url = getAudioUrl(path)
    if (!url) return
    // One reused element (required by playAudioEl's iOS replay caching).
    if (!audioRef.current) audioRef.current = new Audio()
    audioRef.current.pause()
    playAudioEl(audioRef.current, url, () => {})
  }

  const q = questions[idx]

  // Autoplay the prompt audio when a new question appears.
  useEffect(() => {
    if (!loading && q && picked === null) playAudio(q.correct.audio_path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, loading])

  function choose(option) {
    if (picked !== null) return
    setPicked(option.id)
    if (option.id === q.correct.id) setCorrectCount(c => c + 1)
    else markWordDue(session, q.correct.id)
  }

  function next() {
    if (idx + 1 >= questions.length) {
      finish()
    } else {
      setPicked(null)
      setIdx(i => i + 1)
    }
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
    xpAwardedRef.current = false
    setIdx(0); setPicked(null); setCorrectCount(0); setDone(false)
    load()
  }

  const pageShell = {
    minHeight: '100vh', position: 'relative', overflow: 'hidden',
    padding: isMobile ? '16px 14px 28px' : '20px 32px 36px',
  }

  if (loading) {
    return (
      <div style={pageShell}>
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '26px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
          }}>
            <Headphones size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </div>
    )
  }

  // Not enough audio-backed words to build a quiz.
  if (questions.length === 0) {
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '520px', margin: '0 auto', minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '100%', textAlign: 'center', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: '24px', padding: '44px 36px',
            boxShadow: '0 22px 60px rgba(24,24,27,0.07)',
          }}>
            <Headphones size={30} strokeWidth={1.8} color={accentHex} style={{ marginBottom: '14px' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>No listening words yet</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
              This level needs at least a few words with audio before a listening quiz can run.
            </p>
            <PrimaryButton onClick={onBack} icon={ArrowLeft}>Back home</PrimaryButton>
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100)
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '760px', margin: '0 auto', minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '100%', maxWidth: '520px', textAlign: 'center',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '24px', padding: '42px 36px', boxShadow: '0 22px 60px rgba(24,24,27,0.07)',
          }}>
            <div style={{
              width: '58px', height: '58px', borderRadius: '18px', margin: '0 auto 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: accentHex + '10', border: '1px solid ' + accentHex + '18',
            }}>
              <CheckCircle2 size={28} strokeWidth={1.9} color={accentHex} />
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>Listening complete</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '22px', fontSize: '15px' }}>
              You matched <strong style={{ color: 'var(--text)' }}>{correctCount}</strong> of {questions.length} by ear.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '22px' }}>
              <div style={{ padding: '16px 10px', borderRadius: '14px', background: accentHex + '0D', border: '1px solid ' + accentHex + '22' }}>
                <div style={{ fontSize: '26px', fontWeight: 760, color: accentHex, lineHeight: 1 }}>{pct}%</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>Accuracy</div>
              </div>
              <div style={{ padding: '16px 10px', borderRadius: '14px', background: '#6E84660D', border: '1px solid #6E846622' }}>
                <div style={{ fontSize: '26px', fontWeight: 760, color: '#5C7155', lineHeight: 1 }}>+{correctCount * XP_PER_CORRECT}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>XP earned</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <SecondaryButton onClick={onBack} icon={ArrowLeft}>Home</SecondaryButton>
              <PrimaryButton onClick={restart} icon={RotateCcw}>Again</PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const answered = picked !== null

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '620px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>
            {idx + 1} / {questions.length}
          </span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 750 }}>
            <Headphones size={17} strokeWidth={1.8} color={accentHex} />
            Listening
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>{systemLabel} · {levelLabel}</div>
        </div>

        {/* Progress bar */}
        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', margin: '14px 0 22px' }}>
          <div style={{
            height: '100%', borderRadius: '999px', background: accentHex,
            width: Math.round((idx / questions.length) * 100) + '%', transition: 'width .4s ease',
          }} />
        </div>

        {/* Big play button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '26px' }}>
          <button
            onClick={() => playAudio(q.correct.audio_path)}
            aria-label="Play audio"
            style={{
              width: '108px', height: '108px', borderRadius: '34px', cursor: 'pointer',
              border: '1px solid ' + accentHex + '26', background: accentHex + '10',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 16px 40px ' + accentHex + '1A',
            }}
          >
            <Volume2 size={44} strokeWidth={1.7} color={accentHex} />
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-faint)', fontWeight: 600, marginTop: '12px' }}>
            Tap to replay · choose what you heard
          </span>
        </div>

        {/* Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {q.options.map(opt => {
            const isCorrect = opt.id === q.correct.id
            const isPicked = opt.id === picked
            let borderColor = 'var(--border)'
            let bg = 'var(--surface)'
            if (answered && isCorrect) { borderColor = '#2F9E6D'; bg = 'var(--success-bg)' }
            else if (answered && isPicked && !isCorrect) { borderColor = '#DC2626'; bg = 'var(--danger-bg)' }
            return (
              <button
                key={opt.id}
                onClick={() => choose(opt)}
                disabled={answered}
                style={{
                  position: 'relative', minHeight: '76px', padding: '14px 16px',
                  borderRadius: '16px', border: '1.5px solid ' + borderColor, background: bg,
                  cursor: answered ? 'default' : 'pointer', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  transition: 'border-color 140ms ease, background 140ms ease',
                }}
              >
                <span style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text)', fontFamily: langFont, lineHeight: 1.2 }}>
                  {opt.word}
                </span>
                {answered && (isCorrect || isPicked) && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{opt.reading}</span>
                )}
                {answered && isCorrect && (
                  <Check size={18} strokeWidth={2.4} color="#2F9E6D" style={{ position: 'absolute', top: '10px', right: '10px' }} />
                )}
                {answered && isPicked && !isCorrect && (
                  <X size={18} strokeWidth={2.4} color="#DC2626" style={{ position: 'absolute', top: '10px', right: '10px' }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Feedback + next */}
        {answered && (
          <div style={{ marginTop: '20px' }}>
            <div style={{
              padding: '14px 18px', borderRadius: '14px', textAlign: 'center', marginBottom: '14px',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '20px', fontFamily: langFont, color: 'var(--text)', fontWeight: 500 }}>{q.correct.word}</span>
              <span style={{ fontSize: '14px', color: accentHex, marginLeft: '10px', fontWeight: 600 }}>{q.correct.reading}</span>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>{cleanMeaning(q.correct.meaning)}</div>
            </div>
            <PrimaryButton onClick={next} icon={Sparkles}>
              {idx + 1 >= questions.length ? 'See results' : 'Next'}
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}
